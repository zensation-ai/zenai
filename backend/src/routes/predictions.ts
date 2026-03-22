/**
 * Predictions API Routes (Phase 141)
 *
 * Endpoints for prediction history, activity patterns,
 * prediction accuracy, and next-intent prediction.
 *
 * @module routes/predictions
 */

import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { logger } from '../utils/logger';
import { queryContext } from '../utils/database-context';
import type { AIContext } from '../types/context';
import { extractTemporalPatterns, extractSequentialPatterns } from '../services/curiosity/pattern-tracker';
import type { ActivityRecord } from '../services/curiosity/pattern-tracker';
import { makePrediction } from '../services/curiosity/prediction-engine';

const router = Router();

// ─── Prediction History ──────────────────────────────────────────────────────

/** GET /api/:context/predictions/history — Recent prediction history */
router.get('/:context/predictions/history', asyncHandler(async (req, res) => {
  const { context } = req.params;
  try {
    const result = await queryContext(
      context as AIContext,
      `SELECT id, predicted_intent, predicted_domain, confidence, was_correct, actual_intent, actual_domain, error_magnitude, created_at
       FROM prediction_history
       ORDER BY created_at DESC LIMIT 50`,
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error('Failed to load prediction history', error instanceof Error ? error : new Error(String(error)));
    res.json({ success: false, error: 'Failed to load prediction history' });
  }
}));

// ─── Patterns ────────────────────────────────────────────────────────────────

/** GET /api/:context/predictions/patterns — Extract temporal and sequential patterns */
router.get('/:context/predictions/patterns', asyncHandler(async (req, res) => {
  const { context } = req.params;
  try {
    const result = await queryContext(
      context as AIContext,
      `SELECT timestamp, domain, intent, entities
       FROM activity_patterns
       ORDER BY timestamp DESC LIMIT 500`,
    );

    const activities: ActivityRecord[] = (result.rows ?? []).map((r: Record<string, unknown>) => ({
      timestamp: new Date(r.timestamp as string),
      domain: r.domain as string,
      intent: r.intent as string,
      entities: typeof r.entities === 'string' ? JSON.parse(r.entities) : ((r.entities as string[]) || []),
    }));

    const temporalPatterns = extractTemporalPatterns(activities);
    const sequentialPatterns = extractSequentialPatterns(activities);

    res.json({
      success: true,
      data: {
        temporal: temporalPatterns,
        sequential: sequentialPatterns,
        activityCount: activities.length,
      },
    });
  } catch (error) {
    logger.error('Failed to extract patterns', error instanceof Error ? error : new Error(String(error)));
    res.json({ success: false, error: 'Failed to extract patterns' });
  }
}));

// ─── Accuracy ────────────────────────────────────────────────────────────────

/** GET /api/:context/predictions/accuracy — Prediction accuracy stats */
router.get('/:context/predictions/accuracy', asyncHandler(async (req, res) => {
  const { context } = req.params;
  try {
    const [sevenDayRes, thirtyDayRes] = await Promise.allSettled([
      queryContext(
        context as AIContext,
        `SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE was_correct = true) as correct
         FROM prediction_history
         WHERE created_at > NOW() - INTERVAL '7 days'`,
      ),
      queryContext(
        context as AIContext,
        `SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE was_correct = true) as correct
         FROM prediction_history
         WHERE created_at > NOW() - INTERVAL '30 days'`,
      ),
    ]);

    const parse = (res: PromiseSettledResult<{ rows: Array<Record<string, unknown>> }>) => {
      if (res.status !== 'fulfilled') {return { total: 0, correct: 0, rate: 0 };}
      const total = parseInt((res.value.rows[0]?.total as string) ?? '0');
      const correct = parseInt((res.value.rows[0]?.correct as string) ?? '0');
      return { total, correct, rate: total > 0 ? Math.round((correct / total) * 100) / 100 : 0 };
    };

    const sevenDay = parse(sevenDayRes);
    const thirtyDay = parse(thirtyDayRes);

    res.json({
      success: true,
      data: {
        sevenDay,
        thirtyDay,
      },
    });
  } catch (error) {
    logger.error('Failed to compute prediction accuracy', error instanceof Error ? error : new Error(String(error)));
    res.json({ success: false, error: 'Failed to compute prediction accuracy' });
  }
}));

// ─── Next Prediction ─────────────────────────────────────────────────────────

/** GET /api/:context/predictions/next — Predict next user intent */
router.get('/:context/predictions/next', asyncHandler(async (req, res) => {
  const { context } = req.params;
  try {
    const prediction = await makePrediction(context, undefined, new Date());
    res.json({ success: true, data: prediction });
  } catch (error) {
    logger.error('Failed to make prediction', error instanceof Error ? error : new Error(String(error)));
    res.json({ success: false, error: 'Failed to make prediction' });
  }
}));

export default router;
