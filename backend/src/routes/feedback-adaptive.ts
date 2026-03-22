/**
 * Feedback & Adaptive Behavior API Routes (Phase 141)
 *
 * Endpoints for feedback summaries, emitting feedback events,
 * adaptive behavior preferences, and style profiling.
 *
 * @module routes/feedback-adaptive
 */

import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { logger } from '../utils/logger';
import { queryContext } from '../utils/database-context';
import type { AIContext } from '../types/context';
import { loadFeedbackSummary } from '../services/feedback/feedback-aggregator';
import { createFeedbackEvent, recordFeedback } from '../services/feedback/feedback-bus';
import type { FeedbackType } from '../services/feedback/feedback-bus';
import { loadBehaviorPreferences, recordBehaviorSignal } from '../services/adaptive/behavior-engine';
import type { BehaviorSignal } from '../services/adaptive/behavior-engine';
import { buildStyleProfile } from '../services/adaptive/style-learner';

const router = Router();

// ─── Feedback ────────────────────────────────────────────────────────────────

/** GET /api/:context/feedback/summary — Aggregated feedback summary */
router.get('/:context/feedback/summary', asyncHandler(async (req, res) => {
  const { context } = req.params;
  try {
    const summary = await loadFeedbackSummary(context as AIContext);
    res.json({ success: true, data: summary });
  } catch (error) {
    logger.error('Failed to load feedback summary', error instanceof Error ? error : new Error(String(error)));
    res.json({ success: false, error: 'Failed to load feedback summary' });
  }
}));

/** POST /api/:context/feedback/emit — Emit a feedback event */
router.post('/:context/feedback/emit', asyncHandler(async (req, res) => {
  const { context } = req.params;
  const { type, source, target, value, details } = req.body;

  if (!type || !source) {
    res.status(400).json({ success: false, error: 'type and source are required' });
    return;
  }

  try {
    const event = createFeedbackEvent(
      type as FeedbackType,
      source,
      target || '',
      value ?? 0,
      details || {},
    );
    await recordFeedback(context as AIContext, event);
    res.json({ success: true, data: { id: event.id } });
  } catch (error) {
    logger.error('Failed to emit feedback event', error instanceof Error ? error : new Error(String(error)));
    res.json({ success: false, error: 'Failed to emit feedback event' });
  }
}));

// ─── Adaptive Behavior ──────────────────────────────────────────────────────

/** GET /api/:context/adaptive/preferences — Current behavior preferences */
router.get('/:context/adaptive/preferences', asyncHandler(async (req, res) => {
  const { context } = req.params;
  try {
    const preferences = await loadBehaviorPreferences(context as AIContext);
    res.json({ success: true, data: preferences });
  } catch (error) {
    logger.error('Failed to load behavior preferences', error instanceof Error ? error : new Error(String(error)));
    res.json({ success: false, error: 'Failed to load behavior preferences' });
  }
}));

/** PUT /api/:context/adaptive/preferences — Update behavior preferences via signals */
router.put('/:context/adaptive/preferences', asyncHandler(async (req, res) => {
  const { context } = req.params;
  const overrides = req.body;

  if (!overrides || typeof overrides !== 'object') {
    res.status(400).json({ success: false, error: 'Request body must be an object of preference overrides' });
    return;
  }

  try {
    // Map each override to a behavior signal
    const signalMap: Record<string, BehaviorSignal['type']> = {
      responseLength: 'length_feedback',
      detailLevel: 'detail_feedback',
      proactivityLevel: 'suggestion_action',
      preferredTools: 'tool_preference',
      languageStyle: 'style_feedback',
    };

    for (const [key, signalType] of Object.entries(signalMap)) {
      if (overrides[key] !== undefined) {
        const signal: BehaviorSignal = {
          type: signalType,
          value: typeof overrides[key] === 'number' ? overrides[key] : 0.5,
          details: { [key]: overrides[key] },
        };
        await recordBehaviorSignal(context as AIContext, signal);
      }
    }

    // Return updated preferences
    const preferences = await loadBehaviorPreferences(context as AIContext);
    res.json({ success: true, data: preferences });
  } catch (error) {
    logger.error('Failed to update behavior preferences', error instanceof Error ? error : new Error(String(error)));
    res.json({ success: false, error: 'Failed to update behavior preferences' });
  }
}));

/** GET /api/:context/adaptive/style — Build style profile from recent messages */
router.get('/:context/adaptive/style', asyncHandler(async (req, res) => {
  const { context } = req.params;
  try {
    const result = await queryContext(
      context as AIContext,
      `SELECT content as text FROM chat_messages
       WHERE role = 'user'
       ORDER BY created_at DESC LIMIT 50`,
    );

    const messages = (result.rows ?? []).map((r: any) => ({ text: r.text || '' }));

    if (messages.length === 0) {
      res.json({
        success: true,
        data: { formality: 0.5, technicality: 0.5, verbosity: 0.5, language: 'mixed' as const },
      });
      return;
    }

    const profile = buildStyleProfile(messages);
    res.json({ success: true, data: profile });
  } catch (error) {
    logger.error('Failed to build style profile', error instanceof Error ? error : new Error(String(error)));
    res.json({ success: false, error: 'Failed to build style profile' });
  }
}));

export default router;
