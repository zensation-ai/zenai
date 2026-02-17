/**
 * Document Vault API Routes
 *
 * Endpoints for document management, search, and organization.
 *
 * @module routes/documents
 */

import express, { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import _crypto from 'crypto';
import { apiKeyAuth, requireScope } from '../middleware/auth';
import { logger } from '../utils/logger';
import { asyncHandler, ValidationError, NotFoundError } from '../middleware/errorHandler';
import { documentService, Document, DocumentFilters } from '../services/document-service';
import { documentProcessingService } from '../services/document-processing';
import { documentRAGService } from '../services/document-rag';
import { AIContext, isValidUUID, isValidContext } from '../utils/database-context';

// ===========================================
// Validation Helpers
// ===========================================

function validateContext(context: string): asserts context is AIContext {
  if (!isValidContext(context)) {
    throw new ValidationError('Invalid context. Use "personal", "work", "learning", or "creative".');
  }
}

function validateDocumentId(id: string): void {
  if (!isValidUUID(id)) {
    throw new ValidationError('Invalid document ID format. Must be a valid UUID.');
  }
}

// ===========================================
// Multer Configuration
// ===========================================

const UPLOAD_DIR = path.join(__dirname, '../../uploads/documents');

// Ensure upload directory exists
fs.mkdir(UPLOAD_DIR, { recursive: true }).catch((err) => logger.debug('Failed to create upload directory', { error: err instanceof Error ? err.message : String(err) }));

const storage = multer.memoryStorage(); // Use memory storage for flexibility

// Allowed MIME types
const ALLOWED_MIMES = [
  // Documents
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.oasis.opendocument.text',
  // Spreadsheets
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  // Presentations
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  // Text
  'text/plain',
  'text/markdown',
  'text/rtf',
  // Code
  'text/javascript',
  'application/javascript',
  'text/typescript',
  'text/x-python',
  'text/html',
  'text/css',
  'application/json',
  'application/xml',
  'text/xml',
  'text/yaml',
  'application/x-yaml',
  // E-Books
  'application/epub+zip',
  // Images (for OCR)
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
] as const;

const upload = multer({
  storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100 MB
    files: 10, // Max 10 files per request
  },
  fileFilter: (req, file, cb) => {
    // Check MIME type
    const isAllowed = ALLOWED_MIMES.some(mime =>
      file.mimetype === mime || file.mimetype.startsWith('text/')
    );

    if (!isAllowed) {
      cb(new ValidationError(`File type not supported: ${file.mimetype}`));
      return;
    }

    cb(null, true);
  },
});

// ===========================================
// Router
// ===========================================

const router = express.Router();

// Apply authentication to all routes
router.use(apiKeyAuth);

// ===========================================
// Document CRUD
// ===========================================

/**
 * POST /:context/documents - Upload one or more documents
 */
router.post(
  '/:context/documents',
  requireScope('write'),
  upload.array('files', 10),
  asyncHandler(async (req: Request, res: Response) => {
    const { context } = req.params;
    validateContext(context);

    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      throw new ValidationError('No files uploaded');
    }

    const { folderPath, tags, processImmediately } = req.body;
    const parsedTags = tags ? JSON.parse(tags) : undefined;

    const documents: Document[] = [];
    const errors: Array<{ filename: string; error: string }> = [];

    for (const file of files) {
      try {
        const doc = await documentService.uploadDocument(file, context, {
          folderPath: folderPath || '/inbox',
          tags: parsedTags,
          processImmediately: processImmediately !== 'false',
        });
        documents.push(doc);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        errors.push({ filename: file.originalname, error: errorMessage });
        logger.error('Document upload failed', error instanceof Error ? error : undefined, { filename: file.originalname });
      }
    }

    res.status(201).json({
      success: true,
      data: {
        uploaded: documents,
        failed: errors,
        totalUploaded: documents.length,
        totalFailed: errors.length,
      },
    });
  })
);

/**
 * GET /:context/documents - List documents with filters
 */
router.get(
  '/:context/documents',
  requireScope('read'),
  asyncHandler(async (req: Request, res: Response) => {
    const { context } = req.params;
    validateContext(context);

    const filters: DocumentFilters = {
      search: req.query.search as string,
      folderPath: req.query.folderPath as string,
      mimeTypes: req.query.mimeTypes ? (req.query.mimeTypes as string).split(',') : undefined,
      tags: req.query.tags ? (req.query.tags as string).split(',') : undefined,
      topicId: req.query.topicId as string,
      processingStatus: req.query.status as string,
      isFavorite: req.query.favorites === 'true' ? true : undefined,
      isArchived: req.query.archived === 'true',
      limit: parseInt(req.query.limit as string, 10) || 50,
      offset: parseInt(req.query.offset as string, 10) || 0,
      sortBy: req.query.sortBy as DocumentFilters['sortBy'],
      sortOrder: req.query.sortOrder as DocumentFilters['sortOrder'],
    };

    const result = await documentService.listDocuments(context, filters);

    res.json({
      success: true,
      data: result.data,
      pagination: {
        total: result.total,
        limit: result.limit,
        offset: result.offset,
        hasMore: result.hasMore,
      },
    });
  })
);

// NOTE: GET/PUT/DELETE /:context/documents/:id routes are defined after all
// specific sub-path routes (stats, folders, search, etc.) to prevent Express
// from matching "stats" or "folders" as :id parameters.

// ===========================================
// Search & Discovery
// ===========================================

/**
 * POST /:context/documents/search - Semantic search
 */
router.post(
  '/:context/documents/search',
  requireScope('read'),
  asyncHandler(async (req: Request, res: Response) => {
    const { context } = req.params;
    validateContext(context);

    const { query, limit, includeChunks } = req.body;

    if (!query || query.trim().length === 0) {
      throw new ValidationError('Search query is required');
    }

    const results = await documentService.searchDocuments(query, context, {
      limit: limit || 20,
      includeChunks: includeChunks !== false,
    });

    res.json({
      success: true,
      data: results,
      query,
    });
  })
);

/**
 * GET /:context/documents/similar/:id - Find similar documents
 */
router.get(
  '/:context/documents/similar/:id',
  requireScope('read'),
  asyncHandler(async (req: Request, res: Response) => {
    const { context, id } = req.params;
    validateContext(context);
    validateDocumentId(id);

    const limit = parseInt(req.query.limit as string, 10) || 5;
    const results = await documentRAGService.findSimilarDocuments(id, context, limit);

    res.json({
      success: true,
      data: results,
    });
  })
);

/**
 * GET /:context/documents/orphans - Documents without topics
 */
router.get(
  '/:context/documents/orphans',
  requireScope('read'),
  asyncHandler(async (req: Request, res: Response) => {
    const { context } = req.params;
    validateContext(context);

    const result = await documentService.listDocuments(context, {
      topicId: undefined,
      processingStatus: 'completed',
      limit: 50,
    });

    // Filter to only those without topics
    const orphans = result.data.filter(doc => !doc.primaryTopicId);

    res.json({
      success: true,
      data: orphans,
      total: orphans.length,
    });
  })
);

// ===========================================
// Processing
// ===========================================

/**
 * POST /documents/:id/process - Trigger processing
 */
router.post(
  '/documents/:id/process',
  requireScope('write'),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    validateDocumentId(id);

    // Search all contexts
    let doc: Document | null = null;
    for (const ctx of ['personal', 'work', 'learning', 'creative'] as const) {
      doc = await documentService.getDocument(id, ctx);
      if (doc) {
        break;
      }
    }

    if (!doc) {
      throw new NotFoundError('Document not found');
    }

    const result = await documentProcessingService.processDocument(
      id,
      doc.filePath,
      doc.mimeType,
      doc.context
    );

    res.json({
      success: result.success,
      data: result,
    });
  })
);

/**
 * POST /documents/:id/reprocess - Force reprocessing
 */
router.post(
  '/documents/:id/reprocess',
  requireScope('write'),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    validateDocumentId(id);

    // Search all contexts
    let doc: Document | null = null;
    let context: AIContext = 'personal';
    for (const ctx of ['personal', 'work', 'learning', 'creative'] as const) {
      doc = await documentService.getDocument(id, ctx);
      if (doc) { context = ctx; break; }
    }

    if (!doc) {
      throw new NotFoundError('Document not found');
    }

    const result = await documentService.reprocessDocument(id, context);

    res.json({
      success: result?.success || false,
      data: result,
    });
  })
);

// ===========================================
// Organization
// ===========================================

/**
 * POST /documents/:id/move - Move to folder
 */
router.post(
  '/documents/:id/move',
  requireScope('write'),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { folderPath, context } = req.body;

    validateDocumentId(id);
    validateContext(context);

    if (!folderPath) {
      throw new ValidationError('folderPath is required');
    }

    const success = await documentService.moveToFolder(id, folderPath, context);
    if (!success) {
      throw new NotFoundError('Document not found');
    }

    res.json({
      success: true,
      message: `Document moved to ${folderPath}`,
    });
  })
);

/**
 * POST /documents/:id/tags - Add tags
 */
router.post(
  '/documents/:id/tags',
  requireScope('write'),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { tags, context } = req.body;

    validateDocumentId(id);
    validateContext(context);

    if (!tags || !Array.isArray(tags)) {
      throw new ValidationError('tags array is required');
    }

    const success = await documentService.addTags(id, tags, context);
    if (!success) {
      throw new NotFoundError('Document not found');
    }

    res.json({
      success: true,
      message: 'Tags added',
    });
  })
);

/**
 * POST /documents/:id/link-idea - Link to idea
 */
router.post(
  '/documents/:id/link-idea',
  requireScope('write'),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { ideaId, context } = req.body;

    validateDocumentId(id);
    validateContext(context);

    if (!ideaId || !isValidUUID(ideaId)) {
      throw new ValidationError('Valid ideaId is required');
    }

    const success = await documentService.linkToIdea(id, ideaId, context);
    if (!success) {
      throw new NotFoundError('Document not found');
    }

    res.json({
      success: true,
      message: 'Document linked to idea',
    });
  })
);

/**
 * POST /:context/documents/assign-topic - Auto-assign topics
 */
router.post(
  '/:context/documents/assign-topic',
  requireScope('write'),
  asyncHandler(async (req: Request, res: Response) => {
    const { context } = req.params;
    const { documentId } = req.body;

    validateContext(context);
    validateDocumentId(documentId);

    const topicId = await documentService.autoAssignTopic(documentId, context);

    res.json({
      success: true,
      data: {
        documentId,
        topicId,
        assigned: !!topicId,
      },
    });
  })
);

// ===========================================
// Folders
// ===========================================

/**
 * GET /:context/documents/folders - Get folder structure
 */
router.get(
  '/:context/documents/folders',
  requireScope('read'),
  asyncHandler(async (req: Request, res: Response) => {
    const { context } = req.params;
    validateContext(context);

    const folders = await documentService.getFolders(context);

    res.json({
      success: true,
      data: folders,
    });
  })
);

/**
 * POST /:context/documents/folders - Create folder
 */
router.post(
  '/:context/documents/folders',
  requireScope('write'),
  asyncHandler(async (req: Request, res: Response) => {
    const { context } = req.params;
    const { name, parentPath, color, icon } = req.body;

    validateContext(context);

    if (!name || name.trim().length === 0) {
      throw new ValidationError('Folder name is required');
    }

    const folder = await documentService.createFolder(context, name, parentPath || '/', {
      color,
      icon,
    });

    res.status(201).json({
      success: true,
      data: folder,
    });
  })
);

/**
 * DELETE /:context/documents/folders/:path - Delete folder
 */
router.delete(
  '/:context/documents/folders/*',
  requireScope('write'),
  asyncHandler(async (req: Request, res: Response) => {
    const { context } = req.params;
    const folderPath = '/' + req.params[0]; // Capture the wildcard path

    validateContext(context);

    const deleted = await documentService.deleteFolder(folderPath, context);
    if (!deleted) {
      throw new NotFoundError('Folder not found');
    }

    res.json({
      success: true,
      message: 'Folder deleted, documents moved to parent',
    });
  })
);

// ===========================================
// File Access
// ===========================================

/**
 * GET /documents/file/:id - Download original file
 */
router.get(
  '/documents/file/:id',
  requireScope('read'),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    validateDocumentId(id);

    // Search all contexts
    let doc: Document | null = null;
    for (const ctx of ['personal', 'work', 'learning', 'creative'] as const) {
      doc = await documentService.getDocument(id, ctx);
      if (doc) {
        break;
      }
    }

    if (!doc) {
      throw new NotFoundError('Document not found');
    }

    // Security: Validate file path to prevent path traversal attacks
    const uploadDir = path.join(__dirname, '../../uploads');
    const resolvedPath = path.resolve(doc.filePath);
    if (!resolvedPath.startsWith(path.resolve(uploadDir))) {
      logger.warn('Path traversal attempt detected', { filePath: doc.filePath });
      throw new ValidationError('Access denied');
    }

    // Check if file exists
    try {
      await fs.access(resolvedPath);
    } catch {
      throw new NotFoundError('File not found on disk');
    }

    res.setHeader('Content-Type', doc.mimeType);
    // Sanitize filename to prevent HTTP header injection (RFC 5987)
    const sanitizedFilename = (doc.originalFilename || 'download').replace(/[^a-zA-Z0-9._-]/g, '_');
    res.setHeader('Content-Disposition', `attachment; filename="${sanitizedFilename}"`);
    res.sendFile(resolvedPath);
  })
);

/**
 * GET /documents/preview/:id - Get preview/thumbnail
 */
router.get(
  '/documents/preview/:id',
  requireScope('read'),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    validateDocumentId(id);

    // Search all contexts
    let doc: Document | null = null;
    for (const ctx of ['personal', 'work', 'learning', 'creative'] as const) {
      doc = await documentService.getDocument(id, ctx);
      if (doc) {
        break;
      }
    }

    if (!doc) {
      throw new NotFoundError('Document not found');
    }

    // For images, return the image itself
    if (doc.mimeType.startsWith('image/')) {
      // Security: Validate file path to prevent path traversal attacks
      const uploadDir = path.join(__dirname, '../../uploads');
      const resolvedPath = path.resolve(doc.filePath);
      if (!resolvedPath.startsWith(path.resolve(uploadDir))) {
        logger.warn('Path traversal attempt detected', { filePath: doc.filePath });
        throw new ValidationError('Access denied');
      }

      res.setHeader('Content-Type', doc.mimeType);
      res.sendFile(resolvedPath);
      return;
    }

    // For other types, return a JSON preview
    res.json({
      success: true,
      data: {
        id: doc.id,
        title: doc.title,
        summary: doc.summary,
        mimeType: doc.mimeType,
        pageCount: doc.pageCount,
        keywords: doc.keywords,
      },
    });
  })
);

// ===========================================
// Batch Operations
// ===========================================

/**
 * POST /:context/documents/batch/process - Batch process
 */
router.post(
  '/:context/documents/batch/process',
  requireScope('write'),
  asyncHandler(async (req: Request, res: Response) => {
    const { context } = req.params;
    const { ids } = req.body;

    validateContext(context);

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      throw new ValidationError('Array of document IDs is required');
    }

    const results: Array<{ id: string; success: boolean; error?: string }> = [];

    for (const id of ids.slice(0, 20)) { // Limit to 20 per batch
      try {
        validateDocumentId(id);
        const doc = await documentService.getDocument(id, context);

        if (doc) {
          await documentProcessingService.processDocument(id, doc.filePath, doc.mimeType, context);
          results.push({ id, success: true });
        } else {
          results.push({ id, success: false, error: 'Not found' });
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        results.push({ id, success: false, error: errorMessage });
      }
    }

    res.json({
      success: true,
      data: results,
      summary: {
        total: ids.length,
        processed: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
      },
    });
  })
);

/**
 * POST /:context/documents/batch/move - Batch move
 */
router.post(
  '/:context/documents/batch/move',
  requireScope('write'),
  asyncHandler(async (req: Request, res: Response) => {
    const { context } = req.params;
    const { ids, folderPath } = req.body;

    validateContext(context);

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      throw new ValidationError('Array of document IDs is required');
    }

    if (!folderPath) {
      throw new ValidationError('folderPath is required');
    }

    let successCount = 0;
    for (const id of ids) {
      const success = await documentService.moveToFolder(id, folderPath, context);
      if (success) {successCount++;}
    }

    res.json({
      success: true,
      data: {
        moved: successCount,
        total: ids.length,
      },
    });
  })
);

/**
 * DELETE /:context/documents/batch - Batch delete
 */
router.delete(
  '/:context/documents/batch',
  requireScope('write'),
  asyncHandler(async (req: Request, res: Response) => {
    const { context } = req.params;
    const { ids } = req.body;

    validateContext(context);

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      throw new ValidationError('Array of document IDs is required');
    }

    let deletedCount = 0;
    for (const id of ids) {
      const deleted = await documentService.deleteDocument(id, context);
      if (deleted) {deletedCount++;}
    }

    res.json({
      success: true,
      data: {
        deleted: deletedCount,
        total: ids.length,
      },
    });
  })
);

// ===========================================
// Stats
// ===========================================

/**
 * GET /:context/documents/stats - Get statistics
 */
router.get(
  '/:context/documents/stats',
  requireScope('read'),
  asyncHandler(async (req: Request, res: Response) => {
    const { context } = req.params;
    validateContext(context);

    const stats = await documentService.getStats(context);

    res.json({
      success: true,
      data: stats,
    });
  })
);

// ===========================================
// Single Document CRUD (must be AFTER specific sub-path routes
// like /stats, /folders, /search to prevent :id from matching those)
// ===========================================

/**
 * GET /:context/documents/:id - Get single document
 */
router.get(
  '/:context/documents/:id',
  requireScope('read'),
  asyncHandler(async (req: Request, res: Response) => {
    const { context, id } = req.params;
    validateContext(context);
    validateDocumentId(id);

    const document = await documentService.getDocument(id, context);
    if (!document) {
      throw new NotFoundError('Document not found');
    }

    res.json({
      success: true,
      data: document,
    });
  })
);

/**
 * PUT /:context/documents/:id - Update document metadata
 */
router.put(
  '/:context/documents/:id',
  requireScope('write'),
  asyncHandler(async (req: Request, res: Response) => {
    const { context, id } = req.params;
    validateContext(context);
    validateDocumentId(id);

    const { title, tags, folderPath, isFavorite, isArchived } = req.body;

    const document = await documentService.updateDocument(id, context, {
      title,
      tags,
      folderPath,
      isFavorite,
      isArchived,
    });

    if (!document) {
      throw new NotFoundError('Document not found');
    }

    res.json({
      success: true,
      data: document,
    });
  })
);

/**
 * DELETE /:context/documents/:id - Delete document
 */
router.delete(
  '/:context/documents/:id',
  requireScope('write'),
  asyncHandler(async (req: Request, res: Response) => {
    const { context, id } = req.params;
    validateContext(context);
    validateDocumentId(id);

    const deleted = await documentService.deleteDocument(id, context);
    if (!deleted) {
      throw new NotFoundError('Document not found');
    }

    res.json({
      success: true,
      message: 'Document deleted',
    });
  })
);

// ===========================================
// Health Check
// ===========================================

/**
 * GET /documents/health - Service health check
 */
router.get(
  '/documents/health',
  asyncHandler(async (req: Request, res: Response) => {
    const supportedFormats = documentProcessingService.getSupportedExtensions();

    res.json({
      success: true,
      data: {
        status: 'healthy',
        supportedFormats,
        uploadDir: UPLOAD_DIR,
      },
    });
  })
);

export default router;
