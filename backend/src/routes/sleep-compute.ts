/**
 * Phase 63: Sleep Compute API Routes
 */

import { Router, Request, Response } from 'express';
import { AIContext, isValidContext } from '../utils/database-context';
import { queryContext } from '../utils/database-context';
import { asyncHandler } from '../middleware/errorHandler';
import { getSleepComputeEngine } from '../services/memory/sleep-compute';
import { getContextEngineV2 } from '../services/context-engine-v2';
import { getUserId } from '../utils/user-context';

const router = Router();

// GET /api/:context/sleep-compute/logs - Get sleep compute logs
router.get('/:context/sleep-compute/logs', asyncHandler(async (req: Request, res: Response) => {
  const _userId = getUserId(req);
  const context = req.params.context as AIContext;
  if (!isValidContext(context)) {
    return res.status(400).json({ success: false, error: 'Invalid context' });
  }

  const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
  const result = await queryContext(context, `
    SELECT * FROM sleep_compute_logs
    ORDER BY created_at DESC
    LIMIT $1
  `, [limit]);

  res.json({ success: true, data: result.rows });
}));

// GET /api/:context/sleep-compute/stats - Get sleep compute statistics
router.get('/:context/sleep-compute/stats', asyncHandler(async (req: Request, res: Response) => {
  const _userId = getUserId(req);
  const context = req.params.context as AIContext;
  if (!isValidContext(context)) {
    return res.status(400).json({ success: false, error: 'Invalid context' });
  }

  const result = await queryContext(context, `
    SELECT
      COUNT(*) as total_cycles,
      SUM(processed_items) as total_processed,
      SUM(insights_generated) as total_insights,
      SUM(contradictions_resolved) as total_contradictions,
      SUM(memory_updates) as total_memory_updates,
      AVG(duration_ms)::integer as avg_duration_ms,
      MAX(created_at) as last_cycle
    FROM sleep_compute_logs
    WHERE created_at > NOW() - INTERVAL '7 days'
  `, []);

  res.json({ success: true, data: result.rows[0] || {} });
}));

// POST /api/:context/sleep-compute/trigger - Manually trigger sleep cycle
router.post('/:context/sleep-compute/trigger', asyncHandler(async (req: Request, res: Response) => {
  const _userId = getUserId(req);
  const context = req.params.context as AIContext;
  if (!isValidContext(context)) {
    return res.status(400).json({ success: false, error: 'Invalid context' });
  }

  const engine = getSleepComputeEngine();
  const result = await engine.runSleepCycle(context);

  res.json({ success: true, data: result });
}));

// GET /api/:context/sleep-compute/idle-status - Check system idle status
router.get('/:context/sleep-compute/idle-status', asyncHandler(async (req: Request, res: Response) => {
  const _userId = getUserId(req);
  const context = req.params.context as AIContext;
  if (!isValidContext(context)) {
    return res.status(400).json({ success: false, error: 'Invalid context' });
  }

  const engine = getSleepComputeEngine();
  const isIdle = await engine.isSystemIdle();

  res.json({ success: true, data: { idle: isIdle } });
}));

// POST /api/:context/context-v2/classify - Classify query domain
router.post('/:context/context-v2/classify', asyncHandler(async (req: Request, res: Response) => {
  const _userId = getUserId(req);
  const { query } = req.body;
  if (!query) {
    return res.status(400).json({ success: false, error: 'query is required' });
  }

  const engine = getContextEngineV2();
  const domain = engine.classifyDomain(query);
  const complexity = engine.estimateComplexity(query);
  const model = engine.selectModel(domain.domain, complexity.score);

  res.json({ success: true, data: { domain, complexity, model } });
}));

// POST /api/:context/context-v2/assemble - Assemble context for query
router.post('/:context/context-v2/assemble', asyncHandler(async (req: Request, res: Response) => {
  const _userId = getUserId(req);
  const context = req.params.context as AIContext;
  if (!isValidContext(context)) {
    return res.status(400).json({ success: false, error: 'Invalid context' });
  }

  const { query } = req.body;
  if (!query) {
    return res.status(400).json({ success: false, error: 'query is required' });
  }

  const engine = getContextEngineV2();
  const assembled = await engine.assembleContext(query, context);

  res.json({ success: true, data: assembled });
}));

// POST /api/:context/context-v2/cache/clean - Clean expired cache
router.post('/:context/context-v2/cache/clean', asyncHandler(async (req: Request, res: Response) => {
  const _userId = getUserId(req);
  const context = req.params.context as AIContext;
  if (!isValidContext(context)) {
    return res.status(400).json({ success: false, error: 'Invalid context' });
  }

  const engine = getContextEngineV2();
  const cleaned = await engine.cleanExpiredCache(context);

  res.json({ success: true, data: { cleaned } });
}));

export const sleepComputeRouter = router;
