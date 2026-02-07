/**
 * Document Analysis Routes
 *
 * API endpoints for document upload and AI-powered analysis.
 * Supports PDF (native Claude), Excel (xlsx parsing), and CSV.
 *
 * Phase 2 endpoints:
 * - POST /api/documents/analyze              - Upload and analyze a document
 * - POST /api/documents/analyze/stream       - SSE streaming analysis
 * - POST /api/documents/compare              - Multi-document comparison (2-3 files)
 * - POST /api/documents/followup             - Follow-up question on cached document
 * - GET  /api/documents/history              - Analysis history
 * - GET  /api/documents/history/:id          - Single analysis from history
 * - DELETE /api/documents/history/:id        - Delete analysis from history
 * - GET  /api/documents/status               - Service availability
 * - GET  /api/documents/templates            - Available analysis templates
 * - GET  /api/documents/cache/status         - Prompt cache status
 *
 * @module routes/document-analysis
 */

import { Router, Request, Response } from 'express';
import multer from 'multer';
import { apiKeyAuth } from '../middleware/auth';
import { asyncHandler, ValidationError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';
import {
  documentAnalysis,
  isValidDocumentType,
  validateFileMagicNumber,
  getDocumentTypeLabel,
  type DocumentMediaType,
  type AnalysisTemplate,
} from '../services/document-analysis';

export const documentAnalysisRouter = Router();

// ===========================================
// Multer Configuration for Document Upload
// ===========================================

/**
 * File filter to validate document types
 */
const documentFilter = (
  _req: Request,
  file: Express.Multer.File,
  callback: multer.FileFilterCallback
) => {
  if (!isValidDocumentType(file.mimetype)) {
    callback(
      new Error(
        `Nicht unterstütztes Dateiformat: ${file.mimetype}. Unterstützt: PDF, Excel (XLSX/XLS), CSV`
      )
    );
    return;
  }
  callback(null, true);
};

/**
 * Multer upload configuration
 * - Memory storage for direct buffer access
 * - Max 32MB per file (PDF limit of Claude API)
 * - Single file per request
 */
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: documentFilter,
  limits: {
    fileSize: 32 * 1024 * 1024, // 32MB max (Claude PDF limit)
    files: 1,
  },
});

/**
 * Multer upload for multi-document comparison
 * - Up to 3 files
 */
const uploadMulti = multer({
  storage: multer.memoryStorage(),
  fileFilter: documentFilter,
  limits: {
    fileSize: 32 * 1024 * 1024,
    files: 3,
  },
});

// ===========================================
// Validation Helpers
// ===========================================

const VALID_TEMPLATES: AnalysisTemplate[] = ['general', 'financial', 'contract', 'data', 'summary'];

function validateTemplate(template: unknown): AnalysisTemplate {
  if (!template || typeof template !== 'string') return 'general';
  if (!VALID_TEMPLATES.includes(template as AnalysisTemplate)) {
    throw new ValidationError(
      `Ungültiges Template. Verfügbar: ${VALID_TEMPLATES.join(', ')}`
    );
  }
  return template as AnalysisTemplate;
}

function validateFile(file: Express.Multer.File): void {
  const mimeType = file.mimetype as DocumentMediaType;

  // Validate magic number for binary files
  if (mimeType !== 'text/csv') {
    if (!validateFileMagicNumber(file.buffer, mimeType)) {
      throw new ValidationError(
        'Die Datei scheint beschädigt zu sein oder das Format stimmt nicht mit der Dateiendung überein.'
      );
    }
  }
}

// ===========================================
// Routes
// ===========================================

/**
 * GET /api/documents/status
 * Check if document analysis service is available
 */
documentAnalysisRouter.get(
  '/status',
  apiKeyAuth,
  asyncHandler(async (_req: Request, res: Response) => {
    const available = documentAnalysis.isAvailable();

    res.json({
      success: true,
      data: {
        available,
        supportedFormats: [
          { mimeType: 'application/pdf', label: 'PDF', maxSize: '32MB', maxPages: 100 },
          {
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            label: 'Excel (XLSX)',
            maxSize: '32MB',
          },
          { mimeType: 'application/vnd.ms-excel', label: 'Excel (XLS)', maxSize: '32MB' },
          { mimeType: 'text/csv', label: 'CSV', maxSize: '32MB' },
        ],
        templates: VALID_TEMPLATES,
        features: {
          streaming: true,
          comparison: true,
          followUp: true,
          history: true,
        },
      },
    });
  })
);

/**
 * GET /api/documents/templates
 * Get available analysis templates with descriptions
 */
documentAnalysisRouter.get(
  '/templates',
  apiKeyAuth,
  asyncHandler(async (_req: Request, res: Response) => {
    res.json({
      success: true,
      data: {
        templates: [
          {
            id: 'general',
            name: 'Allgemeine Analyse',
            description: 'Umfassende Dokumentanalyse mit Zusammenfassung, Hauptinhalten und Auffälligkeiten',
            icon: 'search',
          },
          {
            id: 'financial',
            name: 'Finanzanalyse',
            description: 'KPIs, Trends, Periodenvergleiche und Handlungsempfehlungen',
            icon: 'trending-up',
          },
          {
            id: 'contract',
            name: 'Vertragsprüfung',
            description: 'Schlüsselklauseln, Fristen, Konditionen und Risikobewertung',
            icon: 'file-text',
          },
          {
            id: 'data',
            name: 'Datenauswertung',
            description: 'Statistische Kennzahlen, Muster, Ausreißer und Insights',
            icon: 'bar-chart',
          },
          {
            id: 'summary',
            name: 'Schnellzusammenfassung',
            description: 'Prägnante Zusammenfassung der Kernaussagen und Schlüsseldaten',
            icon: 'zap',
          },
        ],
      },
    });
  })
);

/**
 * POST /api/documents/analyze
 * Upload and analyze a document
 */
documentAnalysisRouter.post(
  '/analyze',
  apiKeyAuth,
  upload.single('document'),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) {
      throw new ValidationError('Dokument ist erforderlich. Unterstützte Formate: PDF, Excel, CSV');
    }

    validateFile(req.file);

    const mimeType = req.file.mimetype as DocumentMediaType;
    const template = validateTemplate(req.body.template);
    const language = req.body.language === 'en' ? 'en' : 'de';

    logger.info('Document analysis requested', {
      filename: req.file.originalname,
      mimeType,
      fileSize: req.file.size,
      template,
    });

    const result = await documentAnalysis.analyze(
      req.file.buffer,
      req.file.originalname,
      mimeType,
      {
        template,
        customPrompt: typeof req.body.customPrompt === 'string' ? req.body.customPrompt : undefined,
        language,
        context: typeof req.body.context === 'string' ? req.body.context : undefined,
      }
    );

    if (!result.success) {
      throw new Error('Dokumentanalyse fehlgeschlagen');
    }

    // Save to history (non-blocking)
    const aiContext = typeof req.body.aiContext === 'string' ? req.body.aiContext : 'work';
    const historyId = await documentAnalysis.saveToHistory(result, template, aiContext);

    // Return cache key for follow-up questions
    const cacheKey = documentAnalysis.computeCacheKey(req.file.buffer);

    res.json({
      success: true,
      data: {
        id: historyId,
        cacheKey,
        filename: result.filename,
        documentType: result.documentType,
        analysis: result.analysis,
        sections: result.sections,
        keyFindings: result.keyFindings,
        metadata: result.metadata,
      },
    });
  })
);

/**
 * POST /api/documents/analyze/stream
 * Upload and analyze a document with SSE streaming
 */
documentAnalysisRouter.post(
  '/analyze/stream',
  apiKeyAuth,
  upload.single('document'),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) {
      throw new ValidationError('Dokument ist erforderlich.');
    }

    validateFile(req.file);

    const mimeType = req.file.mimetype as DocumentMediaType;
    const template = validateTemplate(req.body.template);
    const language = req.body.language === 'en' ? 'en' : 'de';

    logger.info('Document streaming analysis requested', {
      filename: req.file.originalname,
      mimeType,
      fileSize: req.file.size,
      template,
    });

    await documentAnalysis.analyzeStream(
      res,
      req.file.buffer,
      req.file.originalname,
      mimeType,
      {
        template,
        customPrompt: typeof req.body.customPrompt === 'string' ? req.body.customPrompt : undefined,
        language,
        context: typeof req.body.context === 'string' ? req.body.context : undefined,
      }
    );
  })
);

/**
 * POST /api/documents/compare
 * Compare 2-3 documents simultaneously
 */
documentAnalysisRouter.post(
  '/compare',
  apiKeyAuth,
  uploadMulti.array('documents', 3),
  asyncHandler(async (req: Request, res: Response) => {
    const files = req.files as Express.Multer.File[] | undefined;

    if (!files || files.length < 2) {
      throw new ValidationError('Mindestens 2 Dokumente erforderlich für einen Vergleich (maximal 3).');
    }

    if (files.length > 3) {
      throw new ValidationError('Maximal 3 Dokumente für einen Vergleich.');
    }

    // Validate all files
    for (const file of files) {
      validateFile(file);
    }

    const language = req.body.language === 'en' ? 'en' : 'de';

    logger.info('Multi-document comparison requested', {
      documentCount: files.length,
      filenames: files.map((f) => f.originalname),
    });

    const documents = files.map((file) => ({
      buffer: file.buffer,
      filename: file.originalname,
      mimeType: file.mimetype as DocumentMediaType,
    }));

    const result = await documentAnalysis.compareDocuments(documents, {
      customPrompt: typeof req.body.customPrompt === 'string' ? req.body.customPrompt : undefined,
      language,
    });

    if (!result.success) {
      throw new Error('Dokumentvergleich fehlgeschlagen');
    }

    // Save comparison to history
    const aiContext = typeof req.body.aiContext === 'string' ? req.body.aiContext : 'work';
    const historyId = await documentAnalysis.saveToHistory(result, 'comparison', aiContext);

    res.json({
      success: true,
      data: {
        id: historyId,
        filename: result.filename,
        documentType: result.documentType,
        analysis: result.analysis,
        sections: result.sections,
        keyFindings: result.keyFindings,
        metadata: result.metadata,
      },
    });
  })
);

/**
 * POST /api/documents/followup
 * Ask a follow-up question about a previously analyzed document
 */
documentAnalysisRouter.post(
  '/followup',
  apiKeyAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { cacheKey, question, language } = req.body;

    if (!cacheKey || typeof cacheKey !== 'string') {
      throw new ValidationError('cacheKey ist erforderlich.');
    }

    if (!question || typeof question !== 'string' || question.trim().length === 0) {
      throw new ValidationError('Frage ist erforderlich.');
    }

    if (question.trim().length > 5000) {
      throw new ValidationError('Frage darf maximal 5000 Zeichen lang sein.');
    }

    logger.info('Follow-up question requested', {
      cacheKey,
      questionLength: question.trim().length,
    });

    const result = await documentAnalysis.followUp(cacheKey, question.trim(), {
      language: language === 'en' ? 'en' : 'de',
    });

    if (!result.success) {
      res.status(result.cached ? 400 : 410).json({
        success: false,
        error: {
          code: result.cached ? 'FOLLOWUP_FAILED' : 'CACHE_EXPIRED',
          message: result.answer,
        },
      });
      return;
    }

    res.json({
      success: true,
      data: {
        answer: result.answer,
        tokenUsage: result.tokenUsage,
        cached: result.cached,
      },
    });
  })
);

// ===========================================
// History Routes
// ===========================================

/**
 * GET /api/documents/history
 * Get analysis history
 */
documentAnalysisRouter.get(
  '/history',
  apiKeyAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const context = typeof req.query.context === 'string' ? req.query.context : 'work';
    const limit = Math.min(parseInt(String(req.query.limit || '20'), 10), 100);
    const offset = Math.max(parseInt(String(req.query.offset || '0'), 10), 0);

    const { entries, total } = await documentAnalysis.getHistory(context, limit, offset);

    res.json({
      success: true,
      data: {
        entries: entries.map((e) => ({
          id: e.id,
          filename: e.filename,
          fileType: getDocumentTypeLabel(e.file_type),
          fileSize: e.file_size,
          analysisType: e.analysis_type,
          tokenUsage: e.token_usage,
          context: e.context,
          createdAt: e.created_at,
        })),
        total,
        limit,
        offset,
      },
    });
  })
);

/**
 * GET /api/documents/history/:id
 * Get a single analysis from history
 */
documentAnalysisRouter.get(
  '/history/:id',
  apiKeyAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const entry = await documentAnalysis.getAnalysisById(req.params.id);

    if (!entry) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Analyse nicht gefunden.' },
      });
      return;
    }

    res.json({
      success: true,
      data: {
        id: entry.id,
        filename: entry.filename,
        fileType: getDocumentTypeLabel(entry.file_type),
        fileSize: entry.file_size,
        analysisType: entry.analysis_type,
        analysisResult: entry.analysis_result,
        tokenUsage: entry.token_usage,
        context: entry.context,
        createdAt: entry.created_at,
      },
    });
  })
);

/**
 * DELETE /api/documents/history/:id
 * Delete an analysis from history
 */
documentAnalysisRouter.delete(
  '/history/:id',
  apiKeyAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const deleted = await documentAnalysis.deleteFromHistory(req.params.id);

    if (!deleted) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Analyse nicht gefunden.' },
      });
      return;
    }

    res.json({ success: true, data: { deleted: true } });
  })
);

// ===========================================
// Cache Status Route
// ===========================================

/**
 * GET /api/documents/cache/status
 * Get prompt cache status
 */
documentAnalysisRouter.get(
  '/cache/status',
  apiKeyAuth,
  asyncHandler(async (_req: Request, res: Response) => {
    const cacheSize = documentAnalysis.getCacheSize();
    const cleaned = documentAnalysis.cleanCache();

    res.json({
      success: true,
      data: {
        cachedDocuments: cacheSize,
        cleanedExpired: cleaned,
        maxCacheSize: 20,
        ttlMinutes: 5,
      },
    });
  })
);

// ===========================================
// Error Handler for Multer Errors
// ===========================================

documentAnalysisRouter.use((err: Error, _req: Request, res: Response, next: Function) => {
  if (err instanceof multer.MulterError) {
    let message = 'Datei-Upload Fehler';
    const status = 400;

    switch (err.code) {
      case 'LIMIT_FILE_SIZE':
        message = 'Datei zu groß. Maximale Größe: 32MB';
        break;
      case 'LIMIT_FILE_COUNT':
        message = 'Zu viele Dateien. Maximum: 3 für Vergleich, 1 für Analyse';
        break;
      case 'LIMIT_UNEXPECTED_FILE':
        message = 'Unerwartetes Dateifeld. Verwende "document" oder "documents" als Feldname.';
        break;
      default:
        message = `Upload-Fehler: ${err.message}`;
    }

    res.status(status).json({
      success: false,
      error: { code: 'UPLOAD_ERROR', message },
    });
    return;
  }

  // Check for file filter errors
  if (err.message && err.message.includes('Nicht unterstütztes Dateiformat')) {
    res.status(400).json({
      success: false,
      error: { code: 'INVALID_FORMAT', message: err.message },
    });
    return;
  }

  next(err);
});
