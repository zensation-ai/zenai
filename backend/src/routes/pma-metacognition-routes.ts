/**
 * PMA Metacognition API Routes
 *
 * Endpoints for cognitive bias reports, efficiency metrics,
 * and novelty windows.
 *
 * @module routes/pma-metacognition-routes
 */

import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { apiKeyAuth } from '../middleware/auth';
import { logger } from '../utils/logger';
import { queryContext } from '../utils/database-context';
import type { AIContext } from '../types/context';

const router = Router();

// Sprint 1.5 Item 4 — blanket auth for all PMA metacognition routes.
router.use(apiKeyAuth);

// ─── Bias Report ────────────────────────────────────────────────────────────

/** GET /api/:context/metacognition/bias-report — Current bias metrics */
router.get('/:context/metacognition/bias-report', asyncHandler(async (req, res) => {
  const context = req.params.context as AIContext;
  try {
    const result = await queryContext(context,
      `SELECT * FROM cognitive_bias_metrics WHERE user_id = $1 AND context = $2
       ORDER BY computed_at DESC LIMIT 1`,
      [req.user?.id ?? 'anonymous', context]);
    res.json({ success: true, data: result.rows[0] ?? null });
  } catch (error) {
    logger.error('Failed to load bias report', error instanceof Error ? error : new Error(String(error)));
    res.json({ success: true, data: null });
  }
}));

// ─── Efficiency ─────────────────────────────────────────────────────────────

/** GET /api/:context/metacognition/efficiency — Efficiency trends */
router.get('/:context/metacognition/efficiency', asyncHandler(async (req, res) => {
  const context = req.params.context as AIContext;
  const days = Math.min(parseInt(req.query.days as string) || 7, 30);
  try {
    const result = await queryContext(context,
      `SELECT date, avg_context_tokens, retrieval_precision, prediction_accuracy, response_quality_avg
       FROM memory_efficiency_metrics WHERE user_id = $1 AND context = $2
       AND date > NOW() - make_interval(days => $3)
       ORDER BY date DESC`,
      [req.user?.id ?? 'anonymous', context, days]);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error('Failed to load efficiency metrics', error instanceof Error ? error : new Error(String(error)));
    res.json({ success: true, data: [] });
  }
}));

// ─── Novelty Windows ────────────────────────────────────────────────────────

/** GET /api/:context/metacognition/novelty-windows — Active novelty windows */
router.get('/:context/metacognition/novelty-windows', asyncHandler(async (_req, res) => {
  // Novelty windows are tracked in-memory by MetacognitiveMonitor.
  // Not yet persisted to database; return empty placeholder.
  res.json({ success: true, data: [] });
}));

export default router;
