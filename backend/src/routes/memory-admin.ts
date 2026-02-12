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
import { memoryScheduler, longTermMemory, episodicMemory, memoryGovernance } from '../services/memory';
import { isValidContext, AIContext } from '../utils/database-context';
import { logger } from '../utils/logger';
import { apiKeyAuth, requireScope } from '../middleware/auth';
import { asyncHandler, ValidationError } from '../middleware/errorHandler';

const router = Router();

/**
 * @swagger
 * /api/memory/status:
 *   get:
 *     summary: Get memory scheduler status
 *     tags: [Memory Admin]
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Scheduler status
 */
router.get('/status', apiKeyAuth, asyncHandler(async (_req: Request, res: Response) => {
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
}));

/**
 * @swagger
 * /api/memory/consolidate:
 *   post:
 *     summary: Manually trigger memory consolidation
 *     tags: [Memory Admin]
 *     security:
 *       - ApiKeyAuth: []
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
router.post('/consolidate', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const { context } = req.body;

  // Validate context if provided
  if (context && !isValidContext(context)) {
    throw new ValidationError('Invalid context. Use "personal", "work", "learning", or "creative".');
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
}));

/**
 * @swagger
 * /api/memory/decay:
 *   post:
 *     summary: Manually trigger episodic memory decay
 *     tags: [Memory Admin]
 *     security:
 *       - ApiKeyAuth: []
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
router.post('/decay', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const { context } = req.body;

  // Validate context if provided
  if (context && !isValidContext(context)) {
    throw new ValidationError('Invalid context. Use "personal", "work", "learning", or "creative".');
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
}));

/**
 * @swagger
 * /api/memory/stats/{context}:
 *   get:
 *     summary: Get detailed memory statistics for a context
 *     tags: [Memory Admin]
 *     security:
 *       - ApiKeyAuth: []
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
router.get('/stats/:context', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const { context } = req.params;

  if (!isValidContext(context)) {
    throw new ValidationError('Invalid context. Use "personal", "work", "learning", or "creative".');
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
}));

/**
 * @swagger
 * /api/memory/facts/{context}:
 *   get:
 *     summary: Get all stored facts for a context
 *     tags: [Memory Admin]
 *     security:
 *       - ApiKeyAuth: []
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
router.get('/facts/:context', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const { context } = req.params;

  if (!isValidContext(context)) {
    throw new ValidationError('Invalid context. Use "personal", "work", "learning", or "creative".');
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
}));

/**
 * @swagger
 * /api/memory/patterns/{context}:
 *   get:
 *     summary: Get all stored patterns for a context
 *     tags: [Memory Admin]
 *     security:
 *       - ApiKeyAuth: []
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
router.get('/patterns/:context', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const { context } = req.params;

  if (!isValidContext(context)) {
    throw new ValidationError('Invalid context. Use "personal", "work", "learning", or "creative".');
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
}));

/**
 * GET /api/memory/transparency/:context
 * Memory transparency: show what the AI has learned about the user
 */
router.get('/transparency/:context', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const { context } = req.params;

  if (!isValidContext(context)) {
    throw new ValidationError('Invalid context. Use "personal", "work", "learning", or "creative".');
  }

  const ctx = context as AIContext;

  // Gather data from all memory layers in parallel
  const [stats, facts, patterns, episodicStats] = await Promise.all([
    longTermMemory.getStats(ctx),
    longTermMemory.getFacts(ctx),
    longTermMemory.getPatterns(ctx),
    episodicMemory.getStats(ctx),
  ]);

  // Recent learnings: facts confirmed in last 7 days
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recentLearnings = facts
    .filter(f => f.lastConfirmed.getTime() > sevenDaysAgo)
    .sort((a, b) => b.lastConfirmed.getTime() - a.lastConfirmed.getTime())
    .slice(0, 10)
    .map(f => ({
      type: f.factType,
      content: f.content,
      confidence: f.confidence,
      source: f.source,
      learnedAt: f.firstSeen.toISOString(),
      lastConfirmed: f.lastConfirmed.toISOString(),
      occurrences: f.occurrences,
    }));

  // Average confidence
  const avgConfidence = facts.length > 0
    ? Math.round(facts.reduce((sum, f) => sum + f.confidence, 0) / facts.length * 100) / 100
    : 0;

  // High-confidence facts (>= 0.7)
  const highConfidenceFacts = facts.filter(f => f.confidence >= 0.7).length;

  res.json({
    success: true,
    data: {
      factsLearned: stats.factCount,
      patternsDetected: stats.patternCount,
      episodesStored: episodicStats.totalEpisodes,
      lastConsolidation: stats.lastConsolidation?.toISOString() || null,
      recentLearnings,
      memoryHealth: {
        avgConfidence,
        highConfidenceFacts,
        totalFacts: stats.factCount,
        totalPatterns: stats.patternCount,
        totalEpisodes: episodicStats.totalEpisodes,
        avgEpisodicStrength: episodicStats.avgRetrievalStrength,
        recentEpisodes: episodicStats.recentEpisodes,
        hasProfileEmbedding: stats.hasProfileEmbedding,
      },
      topPatterns: patterns.slice(0, 5).map(p => ({
        type: p.patternType,
        pattern: p.pattern,
        frequency: p.frequency,
        confidence: p.confidence,
      })),
    },
  });
}));

// ===========================================
// Memory Governance & GDPR Endpoints (Phase 37)
// ===========================================

/**
 * GET /api/memory/privacy/:context
 * Get memory privacy settings for a context
 */
router.get('/privacy/:context', apiKeyAuth, requireScope('read'), asyncHandler(async (req: Request, res: Response) => {
  const { context } = req.params;

  if (!isValidContext(context)) {
    throw new ValidationError('Invalid context. Use "personal", "work", "learning", or "creative".');
  }

  const settings = await memoryGovernance.getPrivacySettings(context as AIContext);

  res.json({
    success: true,
    data: settings,
  });
}));

/**
 * PUT /api/memory/privacy/:context
 * Update memory privacy settings
 */
router.put('/privacy/:context', apiKeyAuth, requireScope('write'), asyncHandler(async (req: Request, res: Response) => {
  const { context } = req.params;

  if (!isValidContext(context)) {
    throw new ValidationError('Invalid context. Use "personal", "work", "learning", or "creative".');
  }

  const settings = await memoryGovernance.updatePrivacySettings(context as AIContext, req.body);

  res.json({
    success: true,
    data: settings,
    message: 'Privacy settings updated',
  });
}));

/**
 * DELETE /api/memory/erase/:context
 * Right to Erasure (Art. 17 DSGVO): Delete all memory data for a context
 */
router.delete('/erase/:context', apiKeyAuth, requireScope('admin'), asyncHandler(async (req: Request, res: Response) => {
  const { context } = req.params;

  if (!isValidContext(context)) {
    throw new ValidationError('Invalid context. Use "personal", "work", "learning", or "creative".');
  }

  logger.info('Memory erasure requested', { context, operation: 'memoryErasure' });

  const result = await memoryGovernance.eraseAllMemory(context as AIContext);

  res.json({
    success: true,
    data: result,
    message: `All memory data for "${context}" has been permanently deleted.`,
  });
}));

/**
 * DELETE /api/memory/erase/:context/:layer
 * Delete all data from a specific memory layer
 */
router.delete('/erase/:context/:layer', apiKeyAuth, requireScope('admin'), asyncHandler(async (req: Request, res: Response) => {
  const { context, layer } = req.params;

  if (!isValidContext(context)) {
    throw new ValidationError('Invalid context. Use "personal", "work", "learning", or "creative".');
  }

  const validLayers = ['working', 'episodic', 'short_term', 'long_term', 'procedural', 'reflection'];
  if (!validLayers.includes(layer)) {
    throw new ValidationError(`Invalid layer. Use one of: ${validLayers.join(', ')}`);
  }

  const deleted = await memoryGovernance.eraseLayer(context as AIContext, layer as any);

  res.json({
    success: true,
    data: { layer, deleted },
    message: `Memory layer "${layer}" erased: ${deleted} items deleted.`,
  });
}));

/**
 * DELETE /api/memory/facts/:context/:factId
 * Delete a specific learned fact
 */
router.delete('/facts/:context/:factId', apiKeyAuth, requireScope('write'), asyncHandler(async (req: Request, res: Response) => {
  const { context, factId } = req.params;

  if (!isValidContext(context)) {
    throw new ValidationError('Invalid context. Use "personal", "work", "learning", or "creative".');
  }

  const deleted = await memoryGovernance.deleteFact(context as AIContext, factId);

  res.json({
    success: true,
    deleted,
    message: deleted ? 'Fact deleted' : 'Fact not found',
  });
}));

/**
 * GET /api/memory/export/:context
 * Data Portability (Art. 20 DSGVO): Export all memory data
 */
router.get('/export/:context', apiKeyAuth, requireScope('admin'), asyncHandler(async (req: Request, res: Response) => {
  const { context } = req.params;

  if (!isValidContext(context)) {
    throw new ValidationError('Invalid context. Use "personal", "work", "learning", or "creative".');
  }

  const memoryExport = await memoryGovernance.exportMemory(context as AIContext);

  res.json({
    success: true,
    data: memoryExport,
  });
}));

/**
 * GET /api/memory/audit/:context
 * Get memory audit trail
 */
router.get('/audit/:context', apiKeyAuth, requireScope('read'), asyncHandler(async (req: Request, res: Response) => {
  const { context } = req.params;

  if (!isValidContext(context)) {
    throw new ValidationError('Invalid context. Use "personal", "work", "learning", or "creative".');
  }

  const limit = parseInt(req.query.limit as string) || 50;
  const layer = req.query.layer as string | undefined;
  const action = req.query.action as string | undefined;

  const trail = await memoryGovernance.getAuditTrail(context as AIContext, {
    limit: Math.min(limit, 200),
    layer: layer as any,
    action,
  });

  res.json({
    success: true,
    data: trail,
    count: trail.length,
  });
}));

/**
 * GET /api/memory/overview/:context
 * Comprehensive memory overview for transparency
 */
router.get('/overview/:context', apiKeyAuth, requireScope('read'), asyncHandler(async (req: Request, res: Response) => {
  const { context } = req.params;

  if (!isValidContext(context)) {
    throw new ValidationError('Invalid context. Use "personal", "work", "learning", or "creative".');
  }

  const overview = await memoryGovernance.getMemoryOverview(context as AIContext);

  res.json({
    success: true,
    data: overview,
  });
}));

export const memoryAdminRouter = router;
