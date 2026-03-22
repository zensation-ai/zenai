/**
 * Curiosity API Routes (Phase 141)
 *
 * Endpoints for knowledge gap detection, hypotheses management,
 * and information gain tracking.
 *
 * @module routes/curiosity
 */

import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { logger } from '../utils/logger';
import { queryContext } from '../utils/database-context';
import type { AIContext } from '../types/context';
import { detectGaps } from '../services/curiosity/gap-detector';

const router = Router();

// ─── Knowledge Gaps ──────────────────────────────────────────────────────────

/** GET /api/:context/curiosity/gaps — Detect current knowledge gaps */
router.get('/:context/curiosity/gaps', asyncHandler(async (req, res) => {
  const { context } = req.params;
  try {
    const gaps = await detectGaps(context as AIContext, 'system');
    res.json({ success: true, data: gaps });
  } catch (error) {
    logger.error('Failed to detect knowledge gaps', error instanceof Error ? error : new Error(String(error)));
    res.json({ success: false, error: 'Failed to detect knowledge gaps' });
  }
}));

// ─── Hypotheses ──────────────────────────────────────────────────────────────

/** GET /api/:context/curiosity/hypotheses — List hypotheses with optional status filter */
router.get('/:context/curiosity/hypotheses', asyncHandler(async (req, res) => {
  const { context } = req.params;
  const status = req.query.status as string | undefined;

  try {
    let sql = 'SELECT id, hypothesis, source_type, source_entities, confidence, status, created_at FROM hypotheses';
    const params: string[] = [];

    if (status) {
      sql += ' WHERE status = $1';
      params.push(status);
    }

    sql += ' ORDER BY created_at DESC LIMIT 50';

    const result = await queryContext(context as AIContext, sql, params);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error('Failed to load hypotheses', error instanceof Error ? error : new Error(String(error)));
    res.json({ success: false, error: 'Failed to load hypotheses' });
  }
}));

/** POST /api/:context/curiosity/hypotheses/:id/status — Update hypothesis status */
router.post('/:context/curiosity/hypotheses/:id/status', asyncHandler(async (req, res) => {
  const { context, id } = req.params;
  const { status } = req.body;

  if (!status || !['confirmed', 'refuted'].includes(status)) {
    res.status(400).json({ success: false, error: 'Status must be "confirmed" or "refuted"' });
    return;
  }

  try {
    const result = await queryContext(
      context as AIContext,
      'UPDATE hypotheses SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING id, status',
      [status, id],
    );

    if (!result.rows.length) {
      res.status(404).json({ success: false, error: 'Hypothesis not found' });
      return;
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Failed to update hypothesis status', error instanceof Error ? error : new Error(String(error)));
    res.json({ success: false, error: 'Failed to update hypothesis status' });
  }
}));

// ─── Information Gain ────────────────────────────────────────────────────────

/** GET /api/:context/curiosity/information-gain — Recent information gain events */
router.get('/:context/curiosity/information-gain', asyncHandler(async (req, res) => {
  const { context } = req.params;
  try {
    const result = await queryContext(
      context as AIContext,
      `SELECT id, query, surprise_score, novelty_score, domain, created_at
       FROM information_gain_events
       ORDER BY created_at DESC LIMIT 50`,
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error('Failed to load information gain events', error instanceof Error ? error : new Error(String(error)));
    res.json({ success: false, error: 'Failed to load information gain events' });
  }
}));

// ─── Summary ─────────────────────────────────────────────────────────────────

/** GET /api/:context/curiosity/summary — Curiosity system summary counts */
router.get('/:context/curiosity/summary', asyncHandler(async (req, res) => {
  const { context } = req.params;
  const ctx = context as AIContext;

  try {
    const [gapsRes, hypoRes, hypoStatusRes] = await Promise.allSettled([
      queryContext(ctx, "SELECT COUNT(*) as count FROM knowledge_gaps WHERE status = 'active'"),
      queryContext(ctx, 'SELECT COUNT(*) as count FROM hypotheses'),
      queryContext(ctx, `SELECT status, COUNT(*) as count FROM hypotheses GROUP BY status`),
    ]);

    const activeGaps = gapsRes.status === 'fulfilled' ? parseInt(gapsRes.value.rows[0]?.count ?? '0') : 0;
    const totalHypotheses = hypoRes.status === 'fulfilled' ? parseInt(hypoRes.value.rows[0]?.count ?? '0') : 0;

    const hypothesesByStatus: Record<string, number> = {};
    if (hypoStatusRes.status === 'fulfilled') {
      for (const row of hypoStatusRes.value.rows) {
        hypothesesByStatus[row.status] = parseInt(row.count);
      }
    }

    res.json({
      success: true,
      data: {
        activeGaps,
        totalHypotheses,
        hypothesesByStatus,
      },
    });
  } catch (error) {
    logger.error('Failed to load curiosity summary', error instanceof Error ? error : new Error(String(error)));
    res.json({ success: false, error: 'Failed to load curiosity summary' });
  }
}));

export default router;
