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
  type CustomAnalysisTemplate,
} from '../services/document-analysis';
import PDFDocument from 'pdfkit';

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
          customTemplates: true,
          pdfExport: true,
          mermaidVisualization: true,
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
// Phase 3: Custom Analysis Templates (CRUD)
// ===========================================

/**
 * GET /api/documents/templates/custom
 * Get all custom templates
 */
documentAnalysisRouter.get(
  '/templates/custom',
  apiKeyAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const context = typeof req.query.context === 'string' ? req.query.context : 'work';
    const templates = await documentAnalysis.getCustomTemplates(context);

    res.json({
      success: true,
      data: { templates },
    });
  })
);

/**
 * POST /api/documents/templates/custom
 * Create a new custom template
 */
documentAnalysisRouter.post(
  '/templates/custom',
  apiKeyAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { name, system_prompt, instruction, icon, context } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      throw new ValidationError('Name ist erforderlich.');
    }
    if (!system_prompt || typeof system_prompt !== 'string' || system_prompt.trim().length === 0) {
      throw new ValidationError('System-Prompt ist erforderlich.');
    }
    if (!instruction || typeof instruction !== 'string' || instruction.trim().length === 0) {
      throw new ValidationError('Anweisung ist erforderlich.');
    }
    if (name.length > 100) {
      throw new ValidationError('Name darf maximal 100 Zeichen lang sein.');
    }

    const template = await documentAnalysis.createCustomTemplate({
      name: name.trim(),
      system_prompt: system_prompt.trim(),
      instruction: instruction.trim(),
      icon: typeof icon === 'string' ? icon.trim() : undefined,
      context: typeof context === 'string' ? context : undefined,
    });

    if (!template) {
      throw new Error('Template konnte nicht erstellt werden.');
    }

    res.status(201).json({
      success: true,
      data: { template },
    });
  })
);

/**
 * PUT /api/documents/templates/custom/:id
 * Update a custom template
 */
documentAnalysisRouter.put(
  '/templates/custom/:id',
  apiKeyAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { name, system_prompt, instruction, icon } = req.body;

    const updates: Record<string, string> = {};
    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length === 0) {
        throw new ValidationError('Name darf nicht leer sein.');
      }
      if (name.length > 100) {
        throw new ValidationError('Name darf maximal 100 Zeichen lang sein.');
      }
      updates.name = name.trim();
    }
    if (system_prompt !== undefined) {
      if (typeof system_prompt !== 'string' || system_prompt.trim().length === 0) {
        throw new ValidationError('System-Prompt darf nicht leer sein.');
      }
      updates.system_prompt = system_prompt.trim();
    }
    if (instruction !== undefined) {
      if (typeof instruction !== 'string' || instruction.trim().length === 0) {
        throw new ValidationError('Anweisung darf nicht leer sein.');
      }
      updates.instruction = instruction.trim();
    }
    if (icon !== undefined && typeof icon === 'string') {
      updates.icon = icon.trim();
    }

    const template = await documentAnalysis.updateCustomTemplate(req.params.id, updates);

    if (!template) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Template nicht gefunden.' },
      });
      return;
    }

    res.json({
      success: true,
      data: { template },
    });
  })
);

/**
 * DELETE /api/documents/templates/custom/:id
 * Delete a custom template
 */
documentAnalysisRouter.delete(
  '/templates/custom/:id',
  apiKeyAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const deleted = await documentAnalysis.deleteCustomTemplate(req.params.id);

    if (!deleted) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Template nicht gefunden.' },
      });
      return;
    }

    res.json({ success: true, data: { deleted: true } });
  })
);

// ===========================================
// Phase 3: PDF Report Export
// ===========================================

/**
 * POST /api/documents/export/pdf
 * Export an analysis result as a professional PDF report
 */
documentAnalysisRouter.post(
  '/export/pdf',
  apiKeyAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { analysisId } = req.body;

    if (!analysisId || typeof analysisId !== 'string') {
      throw new ValidationError('analysisId ist erforderlich.');
    }

    // Load analysis from history
    const entry = await documentAnalysis.getAnalysisById(analysisId);
    if (!entry) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Analyse nicht gefunden.' },
      });
      return;
    }

    const analysisResult = entry.analysis_result;

    // Generate PDF
    const doc = new PDFDocument({
      margin: 50,
      size: 'A4',
      info: {
        Title: `Analyse: ${analysisResult.filename}`,
        Author: 'ZenSation AI - Dokument-Analyse',
        Subject: 'AI-gestützte Dokumentanalyse',
      },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => {
      const pdfBuffer = Buffer.concat(chunks);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="analyse-${analysisResult.filename.replace(/[^a-zA-Z0-9.-]/g, '_')}-${Date.now()}.pdf"`
      );
      res.send(pdfBuffer);
    });

    // --- Header with ZenSation Branding ---
    doc.fontSize(24).fillColor('#1a1a2e').text('ZenSation AI', { align: 'center' });
    doc.fontSize(10).fillColor('#666').text('Enterprise Document Analysis', { align: 'center' });
    doc.moveDown(0.5);

    // Divider line
    doc.strokeColor('#4a90d9').lineWidth(2)
      .moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(1);

    // --- Document Info ---
    doc.fontSize(18).fillColor('#1a1a2e').text(`Analyse: ${analysisResult.filename}`);
    doc.moveDown(0.5);

    const metaLines = [
      `Dokumenttyp: ${analysisResult.documentType}`,
      `Dateigröße: ${(analysisResult.metadata.fileSize / 1024).toFixed(0)} KB`,
      `Analysedauer: ${(analysisResult.metadata.processingTimeMs / 1000).toFixed(1)}s`,
      `Analyse-Typ: ${entry.analysis_type}`,
      `Erstellt: ${new Date(entry.created_at).toLocaleDateString('de-DE', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })}`,
    ];
    if (analysisResult.metadata.tokenUsage) {
      metaLines.push(
        `Tokens: ${analysisResult.metadata.tokenUsage.input + analysisResult.metadata.tokenUsage.output}`
      );
    }

    doc.fontSize(10).fillColor('#555');
    for (const line of metaLines) {
      doc.text(line);
    }
    doc.moveDown(1);

    // --- Key Findings Box ---
    if (analysisResult.keyFindings && analysisResult.keyFindings.length > 0) {
      // Box background
      const boxTop = doc.y;
      const boxHeight = 20 + analysisResult.keyFindings.length * 16;
      doc.rect(50, boxTop, 495, boxHeight).fill('#f0f7ff');

      doc.fontSize(12).fillColor('#1a1a2e')
        .text('Schlüssel-Erkenntnisse', 60, boxTop + 8);

      doc.fontSize(10).fillColor('#333');
      let findingY = boxTop + 24;
      for (const finding of analysisResult.keyFindings.slice(0, 8)) {
        doc.text(`• ${finding}`, 65, findingY, { width: 470 });
        findingY += 16;
      }

      doc.y = boxTop + boxHeight + 15;
      doc.moveDown(0.5);
    }

    // --- Table of Contents (sections) ---
    if (analysisResult.sections && analysisResult.sections.length > 0) {
      doc.fontSize(14).fillColor('#1a1a2e').text('Inhaltsverzeichnis');
      doc.moveDown(0.3);
      doc.fontSize(10).fillColor('#4a90d9');
      for (let i = 0; i < analysisResult.sections.length; i++) {
        doc.text(`${i + 1}. ${analysisResult.sections[i].title}`);
      }
      doc.moveDown(1);
    }

    // --- Main Analysis Sections ---
    doc.fontSize(14).fillColor('#1a1a2e').text('Analyse');
    doc.moveDown(0.5);

    // Simple Markdown-to-PDF rendering
    const analysisLines = analysisResult.analysis.split('\n');
    for (const line of analysisLines) {
      // Page break check
      if (doc.y > 720) {
        doc.addPage();
      }

      // Skip mermaid code blocks in PDF
      if (line.trim() === '```mermaid' || line.trim() === '```') {
        continue;
      }

      // Headers
      const h2Match = line.match(/^##\s+(.+)/);
      const h3Match = line.match(/^###\s+(.+)/);
      if (h2Match) {
        doc.moveDown(0.5);
        doc.fontSize(13).fillColor('#1a1a2e').text(h2Match[1].replace(/\*\*/g, ''));
        doc.moveDown(0.3);
        continue;
      }
      if (h3Match) {
        doc.moveDown(0.3);
        doc.fontSize(11).fillColor('#333').text(h3Match[1].replace(/\*\*/g, ''), { underline: true });
        doc.moveDown(0.2);
        continue;
      }

      // Bullet points
      if (line.match(/^\s*[-*]\s/)) {
        doc.fontSize(10).fillColor('#333').text(
          '  • ' + line.replace(/^\s*[-*]\s+/, '').replace(/\*\*/g, ''),
          { indent: 10 }
        );
        continue;
      }

      // Table rows (simplified - just text)
      if (line.includes('|') && !line.match(/^\|?\s*---/)) {
        const cells = line.split('|').filter(c => c.trim()).map(c => c.trim().replace(/\*\*/g, ''));
        if (cells.length > 0) {
          doc.fontSize(9).fillColor('#444').text(cells.join('  |  '), { indent: 5 });
        }
        continue;
      }

      // Table separator - skip
      if (line.match(/^\|?\s*---/)) continue;

      // Regular text
      if (line.trim()) {
        doc.fontSize(10).fillColor('#333').text(line.replace(/\*\*/g, '').replace(/\*/g, ''));
      } else {
        doc.moveDown(0.3);
      }
    }

    // --- Footer ---
    doc.moveDown(2);
    if (doc.y > 720) doc.addPage();
    doc.strokeColor('#ccc').lineWidth(0.5)
      .moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(0.5);
    doc.fontSize(8).fillColor('#999')
      .text(
        `Generiert von ZenSation AI | ${new Date().toLocaleDateString('de-DE')} | © ZenSation Enterprise Solutions`,
        { align: 'center' }
      );

    doc.end();
  })
);

// ===========================================
// Phase 3: Mermaid Diagram Extraction
// ===========================================

/**
 * POST /api/documents/extract-diagrams
 * Extract Mermaid diagrams from an analysis result
 */
documentAnalysisRouter.post(
  '/extract-diagrams',
  apiKeyAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { analysisId, analysisText } = req.body;

    let text: string;

    if (analysisId && typeof analysisId === 'string') {
      const entry = await documentAnalysis.getAnalysisById(analysisId);
      if (!entry) {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Analyse nicht gefunden.' },
        });
        return;
      }
      text = entry.analysis_result.analysis;
    } else if (analysisText && typeof analysisText === 'string') {
      text = analysisText;
    } else {
      throw new ValidationError('analysisId oder analysisText ist erforderlich.');
    }

    const diagrams = documentAnalysis.extractMermaidDiagrams(text);

    res.json({
      success: true,
      data: { diagrams, count: diagrams.length },
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
