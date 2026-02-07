/**
 * Document Analysis Routes
 *
 * API endpoints for document upload and AI-powered analysis.
 * Supports PDF (native Claude), Excel (xlsx parsing), and CSV.
 *
 * Endpoints:
 * - POST /api/documents/analyze         - Upload and analyze a document
 * - POST /api/documents/analyze/stream  - SSE streaming analysis
 * - GET  /api/documents/status          - Service availability
 * - GET  /api/documents/templates       - Available analysis templates
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
 *
 * Body (multipart/form-data):
 * - document: File (required) - Document to analyze
 * - template?: string - Analysis template (default: 'general')
 * - customPrompt?: string - Custom analysis instructions
 * - language?: 'de' | 'en' - Response language (default: 'de')
 * - context?: string - Additional context about the document
 */
documentAnalysisRouter.post(
  '/analyze',
  apiKeyAuth,
  upload.single('document'),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) {
      throw new ValidationError('Dokument ist erforderlich. Unterstützte Formate: PDF, Excel, CSV');
    }

    const mimeType = req.file.mimetype as DocumentMediaType;

    // Validate magic number for binary files
    if (mimeType !== 'text/csv') {
      if (!validateFileMagicNumber(req.file.buffer, mimeType)) {
        throw new ValidationError(
          'Die Datei scheint beschädigt zu sein oder das Format stimmt nicht mit der Dateiendung überein.'
        );
      }
    }

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

    res.json({
      success: true,
      data: {
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
        message = 'Nur eine Datei pro Analyse erlaubt';
        break;
      case 'LIMIT_UNEXPECTED_FILE':
        message = 'Unerwartetes Dateifeld. Verwende "document" als Feldname.';
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
