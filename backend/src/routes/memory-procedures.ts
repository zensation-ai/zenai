/**
 * Phase 59: Memory Procedures Routes
 *
 * API endpoints for procedural memory CRUD, BM25 search,
 * hybrid search, and entity-memory links.
 */

import { Router, Request, Response } from 'express';
import { apiKeyAuth, requireScope } from '../middleware/auth';
import { asyncHandler, ValidationError } from '../middleware/errorHandler';
import { isValidContext } from '../utils/database-context';
import { proceduralMemory } from '../services/memory/procedural-memory';
import { memoryBM25 } from '../services/memory/memory-bm25';
import { entityResolver } from '../services/memory/entity-resolver';
import { getUserId } from '../utils/user-context';

const router = Router();

router.use(apiKeyAuth);

// ===========================================
// Procedural Memory Endpoints
// ===========================================

/**
 * GET /api/:context/memory/procedures
 * List procedures with optional filters
 */
router.get(
  '/:context/memory/procedures',
  requireScope('read'),
  asyncHandler(async (req: Request, res: Response) => {
    getUserId(req); // auth check
    const { context } = req.params;
    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use: personal, work, learning, or creative.');
    }

    const limit = parseInt(req.query.limit as string, 10) || 20;
    const outcome = req.query.outcome as string | undefined;

    const procedures = await proceduralMemory.listProcedures(context, { limit, outcome });

    return res.json({ success: true, data: procedures });
  })
);

/**
 * GET /api/:context/memory/procedures/:id
 * Get a single procedure
 */
router.get(
  '/:context/memory/procedures/:id',
  requireScope('read'),
  asyncHandler(async (req: Request, res: Response) => {
    getUserId(req); // auth check
    const { context, id } = req.params;
    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use: personal, work, learning, or creative.');
    }

    const procedure = await proceduralMemory.getProcedure(id, context);
    if (!procedure) {
      return res.status(404).json({ success: false, error: 'Procedure not found' });
    }

    return res.json({ success: true, data: procedure });
  })
);

/**
 * POST /api/:context/memory/procedures
 * Record a new procedure
 */
router.post(
  '/:context/memory/procedures',
  requireScope('write'),
  asyncHandler(async (req: Request, res: Response) => {
    getUserId(req); // auth check
    const { context } = req.params;
    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use: personal, work, learning, or creative.');
    }

    const { triggerDescription, steps, toolsUsed, outcome, durationMs, metadata } = req.body;

    if (!triggerDescription || typeof triggerDescription !== 'string') {
      throw new ValidationError('triggerDescription is required and must be a string.');
    }
    if (!steps || !Array.isArray(steps) || steps.length === 0) {
      throw new ValidationError('steps is required and must be a non-empty array.');
    }
    if (!outcome || !['success', 'partial', 'failure'].includes(outcome)) {
      throw new ValidationError('outcome is required and must be: success, partial, or failure.');
    }

    const procedure = await proceduralMemory.recordProcedure(context, {
      triggerDescription,
      steps,
      toolsUsed: toolsUsed || [],
      outcome,
      durationMs,
      metadata,
    });

    return res.status(201).json({ success: true, data: procedure });
  })
);

/**
 * POST /api/:context/memory/procedures/recall
 * Recall similar procedures for a situation
 */
router.post(
  '/:context/memory/procedures/recall',
  requireScope('read'),
  asyncHandler(async (req: Request, res: Response) => {
    getUserId(req); // auth check
    const { context } = req.params;
    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use: personal, work, learning, or creative.');
    }

    const { situation } = req.body;
    if (!situation || typeof situation !== 'string') {
      throw new ValidationError('situation is required and must be a string.');
    }

    const limit = parseInt(req.query.limit as string, 10) || 5;
    const procedures = await proceduralMemory.recallProcedure(context, situation, limit);

    return res.json({ success: true, data: procedures });
  })
);

/**
 * PUT /api/:context/memory/procedures/:id/feedback
 * Submit feedback/optimization for a procedure
 */
router.put(
  '/:context/memory/procedures/:id/feedback',
  requireScope('write'),
  asyncHandler(async (req: Request, res: Response) => {
    getUserId(req); // auth check
    const { context, id } = req.params;
    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use: personal, work, learning, or creative.');
    }

    const { success, score } = req.body;
    if (typeof success !== 'boolean') {
      throw new ValidationError('success is required and must be a boolean.');
    }

    const procedure = await proceduralMemory.optimizeProcedure(id, context, {
      success,
      score: score !== undefined ? Number(score) : undefined,
    });

    if (!procedure) {
      return res.status(404).json({ success: false, error: 'Procedure not found' });
    }

    return res.json({ success: true, data: procedure });
  })
);

/**
 * DELETE /api/:context/memory/procedures/:id
 * Delete a procedure
 */
router.delete(
  '/:context/memory/procedures/:id',
  requireScope('write'),
  asyncHandler(async (req: Request, res: Response) => {
    getUserId(req); // auth check
    const { context, id } = req.params;
    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use: personal, work, learning, or creative.');
    }

    const deleted = await proceduralMemory.deleteProcedure(id, context);
    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Procedure not found' });
    }

    return res.json({ success: true, message: 'Procedure deleted' });
  })
);

// ===========================================
// BM25 & Hybrid Search Endpoints
// ===========================================

/**
 * GET /api/:context/memory/bm25
 * BM25 full-text search on learned_facts
 */
router.get(
  '/:context/memory/bm25',
  requireScope('read'),
  asyncHandler(async (req: Request, res: Response) => {
    getUserId(req); // auth check
    const { context } = req.params;
    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use: personal, work, learning, or creative.');
    }

    const q = req.query.q as string;
    if (!q || q.trim().length === 0) {
      throw new ValidationError('Query parameter "q" is required.');
    }

    const limit = parseInt(req.query.limit as string, 10) || 10;
    const results = await memoryBM25.search(q, context, limit);

    return res.json({ success: true, data: results });
  })
);

/**
 * GET /api/:context/memory/hybrid-search
 * Hybrid BM25 + semantic search with RRF
 */
router.get(
  '/:context/memory/hybrid-search',
  requireScope('read'),
  asyncHandler(async (req: Request, res: Response) => {
    getUserId(req); // auth check
    const { context } = req.params;
    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use: personal, work, learning, or creative.');
    }

    const q = req.query.q as string;
    if (!q || q.trim().length === 0) {
      throw new ValidationError('Query parameter "q" is required.');
    }

    const limit = parseInt(req.query.limit as string, 10) || 10;
    const results = await memoryBM25.hybridSearch(q, context, limit);

    return res.json({ success: true, data: results });
  })
);

// ===========================================
// Entity-Memory Link Endpoints
// ===========================================

/**
 * GET /api/:context/memory/entity-links/:factId
 * Get entity links for a fact
 */
router.get(
  '/:context/memory/entity-links/:factId',
  requireScope('read'),
  asyncHandler(async (req: Request, res: Response) => {
    getUserId(req); // auth check
    const { context, factId } = req.params;
    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use: personal, work, learning, or creative.');
    }

    const entities = await entityResolver.getFactEntities(context, factId);

    return res.json({ success: true, data: entities });
  })
);

export { router as memoryProceduresRouter };
