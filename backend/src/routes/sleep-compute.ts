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

// GET /api/:context/sleep-compute/discoveries - Get sleep cycle discoveries (last 7 cycles)
router.get('/:context/sleep-compute/discoveries', asyncHandler(async (req: Request, res: Response) => {
  const _userId = getUserId(req);
  const context = req.params.context as AIContext;
  if (!isValidContext(context)) {
    return res.status(400).json({ success: false, error: 'Invalid context' });
  }

  // Summary of last 7 cycles
  const summaryResult = await queryContext(context, `
    SELECT
      COUNT(*) as cycle_count,
      COALESCE(SUM(processed_items), 0) as total_consolidations,
      COALESCE(SUM(insights_generated), 0) as total_discoveries,
      COALESCE(SUM(memory_updates), 0) as total_optimizations,
      COALESCE(SUM(contradictions_resolved), 0) as total_contradictions,
      COALESCE(AVG(duration_ms)::integer, 0) as avg_duration_ms
    FROM (
      SELECT * FROM sleep_compute_logs
      ORDER BY created_at DESC
      LIMIT 7
    ) recent
  `, []);

  // Individual cycle items
  const cyclesResult = await queryContext(context, `
    SELECT id, cycle_type, processed_items, insights_generated,
           contradictions_resolved, memory_updates, duration_ms, created_at
    FROM sleep_compute_logs
    ORDER BY created_at DESC
    LIMIT 7
  `, []);

  // Recent learned facts from sleep compute (discoveries)
  const discoveriesResult = await queryContext(context, `
    SELECT id, fact_type as type, content as description, confidence, created_at
    FROM learned_facts
    WHERE source = 'sleep_compute'
    ORDER BY created_at DESC
    LIMIT 20
  `, []);

  // Recent contradictions (facts with fast_decay that were downgraded)
  const contradictionsResult = await queryContext(context, `
    SELECT id, content, confidence, decay_class, updated_at
    FROM learned_facts
    WHERE decay_class = 'fast_decay' AND confidence < 0.5
    ORDER BY updated_at DESC
    LIMIT 10
  `, []);

  res.json({
    success: true,
    data: {
      summary: summaryResult.rows[0] || {},
      cycles: cyclesResult.rows,
      discoveries: discoveriesResult.rows,
      contradictions: contradictionsResult.rows,
    },
  });
}));

// GET /api/:context/context-v2/active - Get current active context summary
router.get('/:context/context-v2/active', asyncHandler(async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const context = req.params.context as AIContext;
  if (!isValidContext(context)) {
    return res.status(400).json({ success: false, error: 'Invalid context' });
  }

  // Working memory item count
  let workingMemoryCount = 0;
  try {
    const wmResult = await queryContext(context, `
      SELECT COUNT(*) as cnt FROM working_memory
      WHERE user_id = $1
    `, [userId]);
    workingMemoryCount = parseInt(wmResult.rows[0]?.cnt || '0', 10);
  } catch {
    // Table may not exist
  }

  // Long-term facts count
  let factsCount = 0;
  try {
    const factsResult = await queryContext(context, `
      SELECT COUNT(*) as cnt FROM learned_facts
      WHERE confidence > 0.5
    `, []);
    factsCount = parseInt(factsResult.rows[0]?.cnt || '0', 10);
  } catch {
    // Table may not exist
  }

  // Relevant procedures count
  let proceduresCount = 0;
  try {
    const procResult = await queryContext(context, `
      SELECT COUNT(*) as cnt FROM procedural_memories
      WHERE success_rate > 0.5
    `, []);
    proceduresCount = parseInt(procResult.rows[0]?.cnt || '0', 10);
  } catch {
    // Table may not exist
  }

  // Upcoming events (next 2 hours)
  let upcomingEventsCount = 0;
  let upcomingEvents: Array<Record<string, unknown>> = [];
  try {
    const eventsResult = await queryContext(context, `
      SELECT id, title, start_time, end_time
      FROM calendar_events
      WHERE start_time BETWEEN NOW() AND NOW() + INTERVAL '2 hours'
        AND user_id = $1
      ORDER BY start_time ASC
      LIMIT 5
    `, [userId]);
    upcomingEventsCount = eventsResult.rows.length;
    upcomingEvents = eventsResult.rows;
  } catch {
    // Table may not exist
  }

  res.json({
    success: true,
    data: {
      context,
      workingMemoryCount,
      factsCount,
      proceduresCount,
      upcomingEventsCount,
      upcomingEvents,
    },
  });
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
