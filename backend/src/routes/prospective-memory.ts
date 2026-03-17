/**
 * Phase 87: Prospective Memory + Metamemory Routes
 *
 * API endpoints for prospective memory CRUD and metamemory introspection.
 */

import { Router, Request, Response } from 'express';
import { apiKeyAuth, requireScope } from '../middleware/auth';
import { asyncHandler, ValidationError } from '../middleware/errorHandler';
import { isValidContext } from '../utils/database-context';
import { getUserId } from '../utils/user-context';
import { logger } from '../utils/logger';
import {
  createProspectiveMemory,
  listPending,
  fireMemory,
  dismissMemory,
} from '../services/memory/prospective-memory';
import {
  getMetamemoryStats,
  getKnowledgeGaps,
  findConflicts,
} from '../services/memory/metamemory';

const router = Router();

router.use(apiKeyAuth);

// ===========================================
// Prospective Memory Endpoints
// ===========================================

/**
 * GET /api/:context/memory/prospective
 * List all pending prospective memories for the current user
 */
router.get(
  '/:context/memory/prospective',
  requireScope('read'),
  asyncHandler(async (req: Request, res: Response) => {
    const userId = getUserId(req);
    const { context } = req.params;
    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use: personal, work, learning, or creative.');
    }

    try {
      const memories = await listPending(context, userId);
      return res.json({ success: true, data: memories });
    } catch (error) {
      logger.error('Prospektive Erinnerung: Auflisten fehlgeschlagen', error instanceof Error ? error : undefined, { context });
      return res.status(500).json({ success: false, error: 'Prospektive Erinnerungen konnten nicht geladen werden' });
    }
  })
);

/**
 * POST /api/:context/memory/prospective
 * Create a new prospective memory
 */
router.post(
  '/:context/memory/prospective',
  requireScope('write'),
  asyncHandler(async (req: Request, res: Response) => {
    const userId = getUserId(req);
    const { context } = req.params;
    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use: personal, work, learning, or creative.');
    }

    const { triggerType, triggerCondition, memoryContent, priority, expiresAt } = req.body;

    if (!triggerType || !['time', 'event', 'activity', 'context'].includes(triggerType)) {
      throw new ValidationError('triggerType is required and must be: time, event, activity, or context.');
    }
    if (!triggerCondition || typeof triggerCondition !== 'object') {
      throw new ValidationError('triggerCondition is required and must be an object.');
    }
    if (!memoryContent || typeof memoryContent !== 'string') {
      throw new ValidationError('memoryContent is required and must be a string.');
    }
    if (priority && !['low', 'medium', 'high'].includes(priority)) {
      throw new ValidationError('priority must be: low, medium, or high.');
    }

    try {
      const memory = await createProspectiveMemory(context, userId, {
        triggerType,
        triggerCondition,
        memoryContent,
        priority,
        expiresAt,
      });

      return res.status(201).json({ success: true, data: memory });
    } catch (error) {
      logger.error('Prospektive Erinnerung: Erstellung fehlgeschlagen', error instanceof Error ? error : undefined, { context, operation: triggerType });
      return res.status(500).json({ success: false, error: 'Prospektive Erinnerung konnte nicht erstellt werden' });
    }
  })
);

/**
 * POST /api/:context/memory/prospective/:id/fire
 * Fire a prospective memory (mark as triggered)
 */
router.post(
  '/:context/memory/prospective/:id/fire',
  requireScope('write'),
  asyncHandler(async (req: Request, res: Response) => {
    getUserId(req); // auth check
    const { context, id } = req.params;
    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use: personal, work, learning, or creative.');
    }

    try {
      const memory = await fireMemory(context, id);
      if (!memory) {
        return res.status(404).json({ success: false, error: 'Memory not found or not pending' });
      }

      return res.json({ success: true, data: memory });
    } catch (error) {
      logger.error('Prospektive Erinnerung: Auslösung fehlgeschlagen', error instanceof Error ? error : undefined, { context, operation: id });
      return res.status(500).json({ success: false, error: 'Erinnerung konnte nicht ausgelöst werden' });
    }
  })
);

/**
 * POST /api/:context/memory/prospective/:id/dismiss
 * Dismiss a prospective memory
 */
router.post(
  '/:context/memory/prospective/:id/dismiss',
  requireScope('write'),
  asyncHandler(async (req: Request, res: Response) => {
    getUserId(req); // auth check
    const { context, id } = req.params;
    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use: personal, work, learning, or creative.');
    }

    try {
      const memory = await dismissMemory(context, id);
      if (!memory) {
        return res.status(404).json({ success: false, error: 'Memory not found or not pending' });
      }

      return res.json({ success: true, data: memory });
    } catch (error) {
      logger.error('Prospektive Erinnerung: Verwerfen fehlgeschlagen', error instanceof Error ? error : undefined, { context, operation: id });
      return res.status(500).json({ success: false, error: 'Erinnerung konnte nicht verworfen werden' });
    }
  })
);

// ===========================================
// Metamemory Endpoints
// ===========================================

/**
 * GET /api/:context/memory/metamemory/stats
 * Get metamemory statistics (confidence distribution, categories, gaps)
 */
router.get(
  '/:context/memory/metamemory/stats',
  requireScope('read'),
  asyncHandler(async (req: Request, res: Response) => {
    const userId = getUserId(req);
    const { context } = req.params;
    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use: personal, work, learning, or creative.');
    }

    try {
      const stats = await getMetamemoryStats(context, userId);
      return res.json({ success: true, data: stats });
    } catch (error) {
      logger.error('Prospektive Erinnerung: Metamemory-Statistiken fehlgeschlagen', error instanceof Error ? error : undefined, { context });
      return res.status(500).json({ success: false, error: 'Metamemory-Statistiken konnten nicht geladen werden' });
    }
  })
);

/**
 * GET /api/:context/memory/metamemory/gaps
 * Get knowledge gap analysis
 */
router.get(
  '/:context/memory/metamemory/gaps',
  requireScope('read'),
  asyncHandler(async (req: Request, res: Response) => {
    const userId = getUserId(req);
    const { context } = req.params;
    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use: personal, work, learning, or creative.');
    }

    try {
      const gaps = await getKnowledgeGaps(context, userId);
      return res.json({ success: true, data: gaps });
    } catch (error) {
      logger.error('Prospektive Erinnerung: Wissenslücken-Analyse fehlgeschlagen', error instanceof Error ? error : undefined, { context });
      return res.status(500).json({ success: false, error: 'Wissenslücken konnten nicht analysiert werden' });
    }
  })
);

/**
 * GET /api/:context/memory/metamemory/conflicts
 * Find potentially conflicting facts using text similarity
 */
router.get(
  '/:context/memory/metamemory/conflicts',
  requireScope('read'),
  asyncHandler(async (req: Request, res: Response) => {
    const userId = getUserId(req);
    const { context } = req.params;
    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use: personal, work, learning, or creative.');
    }

    try {
      const threshold = parseFloat(req.query.threshold as string) || 0.4;
      const conflicts = await findConflicts(context, userId, threshold);
      return res.json({ success: true, data: conflicts });
    } catch (error) {
      logger.error('Prospektive Erinnerung: Konflikt-Erkennung fehlgeschlagen', error instanceof Error ? error : undefined, { context });
      return res.status(500).json({ success: false, error: 'Fakten-Konflikte konnten nicht erkannt werden' });
    }
  })
);

export { router as prospectiveMemoryRouter };
