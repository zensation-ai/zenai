/**
 * Canvas Routes
 *
 * REST API for canvas document CRUD and version management.
 *
 * POST   /api/canvas                     - Create document
 * GET    /api/canvas?context=personal     - List documents
 * GET    /api/canvas/:id                  - Get document
 * PATCH  /api/canvas/:id                  - Update document
 * DELETE /api/canvas/:id                  - Delete document
 * POST   /api/canvas/:id/link-chat       - Link chat session
 * GET    /api/canvas/:id/versions        - Version history
 * POST   /api/canvas/:id/restore/:versionId - Restore version
 *
 * Phase 33 Sprint 4 - Feature 10
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { apiKeyAuth, requireScope } from '../middleware/auth';
import { asyncHandler, ValidationError, NotFoundError } from '../middleware/errorHandler';
import {
  createCanvasDocument,
  getCanvasDocument,
  listCanvasDocuments,
  updateCanvasDocument,
  deleteCanvasDocument,
  linkChatSession,
  getVersionHistory,
  restoreVersion,
} from '../services/canvas';
import { logger } from '../utils/logger';

export const canvasRouter = Router();

// ============================================================
// Validation Schemas
// ============================================================

const CreateCanvasSchema = z.object({
  context: z.enum(['personal', 'work', 'learning', 'creative']).default('personal'),
  title: z.string().min(1, 'Title is required').max(500).trim(),
  type: z.enum(['markdown', 'code', 'html']).default('markdown'),
  language: z.string().max(50).optional(),
  content: z.string().max(500000).default(''),
});

const UpdateCanvasSchema = z.object({
  title: z.string().min(1).max(500).trim().optional(),
  content: z.string().max(500000).optional(),
  type: z.enum(['markdown', 'code', 'html']).optional(),
  language: z.string().max(50).optional(),
});

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUUID(id: string): boolean {
  return UUID_REGEX.test(id);
}

// ============================================================
// Routes
// ============================================================

/**
 * POST /api/canvas
 * Create a new canvas document
 */
canvasRouter.post(
  '/',
  apiKeyAuth,
  requireScope('write'),
  asyncHandler(async (req: Request, res: Response) => {
    const parseResult = CreateCanvasSchema.safeParse(req.body);
    if (!parseResult.success) {
      const firstError = parseResult.error.issues[0];
      throw new ValidationError(firstError?.message || 'Invalid request body');
    }

    const { context, title, type, language, content } = parseResult.data;

    const document = await createCanvasDocument(context, title, type, language, content);

    res.status(201).json({
      success: true,
      data: document,
    });
  })
);

/**
 * GET /api/canvas
 * List canvas documents for a context
 */
canvasRouter.get(
  '/',
  apiKeyAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const context = (req.query.context as string) || 'personal';
    const limit = Math.min(parseInt(req.query.limit as string, 10) || 50, 100);
    const offset = parseInt(req.query.offset as string, 10) || 0;

    if (!['personal', 'work', 'learning', 'creative'].includes(context)) {
      throw new ValidationError('Context must be "personal", "work", "learning", or "creative"');
    }

    const result = await listCanvasDocuments(context, limit, offset);

    res.json({
      success: true,
      data: result,
    });
  })
);

/**
 * GET /api/canvas/:id
 * Get a canvas document by ID
 */
canvasRouter.get(
  '/:id',
  apiKeyAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    if (!isValidUUID(id)) {
      throw new ValidationError('Invalid document ID format');
    }

    const document = await getCanvasDocument(id);
    if (!document) {
      throw new NotFoundError('Canvas document');
    }

    res.json({
      success: true,
      data: document,
    });
  })
);

/**
 * PATCH /api/canvas/:id
 * Update a canvas document
 */
canvasRouter.patch(
  '/:id',
  apiKeyAuth,
  requireScope('write'),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    if (!isValidUUID(id)) {
      throw new ValidationError('Invalid document ID format');
    }

    const parseResult = UpdateCanvasSchema.safeParse(req.body);
    if (!parseResult.success) {
      const firstError = parseResult.error.issues[0];
      throw new ValidationError(firstError?.message || 'Invalid request body');
    }

    const updates = parseResult.data;

    if (Object.keys(updates).length === 0) {
      throw new ValidationError('At least one field must be provided for update');
    }

    const document = await updateCanvasDocument(id, updates);
    if (!document) {
      throw new NotFoundError('Canvas document');
    }

    res.json({
      success: true,
      data: document,
    });
  })
);

/**
 * DELETE /api/canvas/:id
 * Delete a canvas document
 */
canvasRouter.delete(
  '/:id',
  apiKeyAuth,
  requireScope('write'),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    if (!isValidUUID(id)) {
      throw new ValidationError('Invalid document ID format');
    }

    const deleted = await deleteCanvasDocument(id);
    if (!deleted) {
      throw new NotFoundError('Canvas document');
    }

    res.json({
      success: true,
      deleted: true,
    });
  })
);

/**
 * POST /api/canvas/:id/link-chat
 * Link a chat session to a canvas document
 */
canvasRouter.post(
  '/:id/link-chat',
  apiKeyAuth,
  requireScope('write'),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { chatSessionId } = req.body;

    if (!isValidUUID(id)) {
      throw new ValidationError('Invalid document ID format');
    }

    if (!chatSessionId || !isValidUUID(chatSessionId)) {
      throw new ValidationError('Valid chatSessionId is required');
    }

    const linked = await linkChatSession(id, chatSessionId);
    if (!linked) {
      throw new NotFoundError('Canvas document');
    }

    res.json({
      success: true,
      linked: true,
    });
  })
);

/**
 * GET /api/canvas/:id/versions
 * Get version history for a document
 */
canvasRouter.get(
  '/:id/versions',
  apiKeyAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const limit = Math.min(parseInt(req.query.limit as string, 10) || 20, 50);

    if (!isValidUUID(id)) {
      throw new ValidationError('Invalid document ID format');
    }

    // Verify document exists
    const document = await getCanvasDocument(id);
    if (!document) {
      throw new NotFoundError('Canvas document');
    }

    const versions = await getVersionHistory(id, limit);

    res.json({
      success: true,
      versions,
    });
  })
);

/**
 * POST /api/canvas/:id/restore/:versionId
 * Restore a specific version
 */
canvasRouter.post(
  '/:id/restore/:versionId',
  apiKeyAuth,
  requireScope('write'),
  asyncHandler(async (req: Request, res: Response) => {
    const { id, versionId } = req.params;

    if (!isValidUUID(id) || !isValidUUID(versionId)) {
      throw new ValidationError('Invalid ID format');
    }

    const document = await restoreVersion(id, versionId);
    if (!document) {
      throw new NotFoundError('Canvas document or version');
    }

    logger.info('Canvas version restored', {
      documentId: id,
      versionId,
      operation: 'canvas-restore',
    });

    res.json({
      success: true,
      data: document,
    });
  })
);
