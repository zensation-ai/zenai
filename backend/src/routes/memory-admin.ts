/**
 * Memory Admin Routes
 *
 * Admin endpoints for managing the HiMeS Memory System:
 * - GET /api/memory/status - Get scheduler and memory stats
 * - POST /api/memory/consolidate - Manually trigger consolidation
 * - POST /api/memory/decay - Manually trigger decay
 * - GET /api/memory/stats/:context - Get detailed memory stats for a context
 */

import { Router, Request, Response } from 'express';
import { memoryScheduler, longTermMemory, episodicMemory } from '../services/memory';
import { isValidContext, AIContext } from '../utils/database-context';
import { logger } from '../utils/logger';

const router = Router();

/**
 * @swagger
 * /api/memory/status:
 *   get:
 *     summary: Get memory scheduler status
 *     tags: [Memory Admin]
 *     responses:
 *       200:
 *         description: Scheduler status
 */
router.get('/status', async (_req: Request, res: Response) => {
  try {
    const status = memoryScheduler.getStatus();
    const config = memoryScheduler.getConfig();

    res.json({
      success: true,
      data: {
        scheduler: status,
        config: {
          timezone: config.TIMEZONE,
          consolidationSchedule: config.CONSOLIDATION_SCHEDULE,
          decaySchedule: config.DECAY_SCHEDULE,
          statsSchedule: config.STATS_SCHEDULE,
          consolidationEnabled: config.ENABLE_CONSOLIDATION,
          decayEnabled: config.ENABLE_DECAY,
          statsEnabled: config.ENABLE_STATS_LOGGING,
        },
      },
    });
  } catch (error) {
    logger.error('Failed to get memory status', error instanceof Error ? error : undefined);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to get memory status' },
    });
  }
});

/**
 * @swagger
 * /api/memory/consolidate:
 *   post:
 *     summary: Manually trigger memory consolidation
 *     tags: [Memory Admin]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               context:
 *                 type: string
 *                 enum: [personal, work]
 *                 description: Optional context to consolidate (default: all)
 *     responses:
 *       200:
 *         description: Consolidation results
 */
router.post('/consolidate', async (req: Request, res: Response) => {
  try {
    const { context } = req.body;

    // Validate context if provided
    if (context && !isValidContext(context)) {
      return res.status(400).json({
        success: false,
        error: { message: 'Invalid context. Use "personal" or "work".' },
      });
    }

    logger.info('Manual consolidation triggered', {
      context: context || 'all',
      operation: 'manualConsolidation',
    });

    const results = await memoryScheduler.triggerConsolidation(context as AIContext | undefined);

    res.json({
      success: true,
      data: {
        message: 'Consolidation completed',
        results,
      },
    });
  } catch (error) {
    logger.error('Manual consolidation failed', error instanceof Error ? error : undefined);
    res.status(500).json({
      success: false,
      error: { message: 'Consolidation failed' },
    });
  }
});

/**
 * @swagger
 * /api/memory/decay:
 *   post:
 *     summary: Manually trigger episodic memory decay
 *     tags: [Memory Admin]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               context:
 *                 type: string
 *                 enum: [personal, work]
 *                 description: Optional context for decay (default: all)
 *     responses:
 *       200:
 *         description: Decay results
 */
router.post('/decay', async (req: Request, res: Response) => {
  try {
    const { context } = req.body;

    // Validate context if provided
    if (context && !isValidContext(context)) {
      return res.status(400).json({
        success: false,
        error: { message: 'Invalid context. Use "personal" or "work".' },
      });
    }

    logger.info('Manual decay triggered', {
      context: context || 'all',
      operation: 'manualDecay',
    });

    const results = await memoryScheduler.triggerDecay(context as AIContext | undefined);

    res.json({
      success: true,
      data: {
        message: 'Decay applied',
        results,
      },
    });
  } catch (error) {
    logger.error('Manual decay failed', error instanceof Error ? error : undefined);
    res.status(500).json({
      success: false,
      error: { message: 'Decay failed' },
    });
  }
});

/**
 * @swagger
 * /api/memory/stats/{context}:
 *   get:
 *     summary: Get detailed memory statistics for a context
 *     tags: [Memory Admin]
 *     parameters:
 *       - in: path
 *         name: context
 *         required: true
 *         schema:
 *           type: string
 *           enum: [personal, work]
 *     responses:
 *       200:
 *         description: Memory statistics
 */
router.get('/stats/:context', async (req: Request, res: Response) => {
  try {
    const { context } = req.params;

    if (!isValidContext(context)) {
      return res.status(400).json({
        success: false,
        error: { message: 'Invalid context. Use "personal" or "work".' },
      });
    }

    const [ltStats, epStats] = await Promise.all([
      longTermMemory.getStats(context as AIContext),
      episodicMemory.getStats(context as AIContext),
    ]);

    res.json({
      success: true,
      data: {
        context,
        longTermMemory: ltStats,
        episodicMemory: epStats,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error('Failed to get memory stats', error instanceof Error ? error : undefined);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to get memory stats' },
    });
  }
});

/**
 * @swagger
 * /api/memory/facts/{context}:
 *   get:
 *     summary: Get all stored facts for a context
 *     tags: [Memory Admin]
 *     parameters:
 *       - in: path
 *         name: context
 *         required: true
 *         schema:
 *           type: string
 *           enum: [personal, work]
 *     responses:
 *       200:
 *         description: Stored facts
 */
router.get('/facts/:context', async (req: Request, res: Response) => {
  try {
    const { context } = req.params;

    if (!isValidContext(context)) {
      return res.status(400).json({
        success: false,
        error: { message: 'Invalid context. Use "personal" or "work".' },
      });
    }

    const facts = await longTermMemory.getFacts(context as AIContext);

    res.json({
      success: true,
      data: {
        context,
        facts,
        count: facts.length,
      },
    });
  } catch (error) {
    logger.error('Failed to get facts', error instanceof Error ? error : undefined);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to get facts' },
    });
  }
});

/**
 * @swagger
 * /api/memory/patterns/{context}:
 *   get:
 *     summary: Get all stored patterns for a context
 *     tags: [Memory Admin]
 *     parameters:
 *       - in: path
 *         name: context
 *         required: true
 *         schema:
 *           type: string
 *           enum: [personal, work]
 *     responses:
 *       200:
 *         description: Stored patterns
 */
router.get('/patterns/:context', async (req: Request, res: Response) => {
  try {
    const { context } = req.params;

    if (!isValidContext(context)) {
      return res.status(400).json({
        success: false,
        error: { message: 'Invalid context. Use "personal" or "work".' },
      });
    }

    const patterns = await longTermMemory.getPatterns(context as AIContext);

    res.json({
      success: true,
      data: {
        context,
        patterns,
        count: patterns.length,
      },
    });
  } catch (error) {
    logger.error('Failed to get patterns', error instanceof Error ? error : undefined);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to get patterns' },
    });
  }
});

export const memoryAdminRouter = router;
