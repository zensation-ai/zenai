/**
 * Proactive Intelligence API Routes (Phase 88)
 *
 * Interruptibility scoring, habit engine, and focus mode.
 */

import { Router } from 'express';
import { isValidContext } from '../utils/database-context';
import type { AIContext } from '../types';
import { apiKeyAuth, requireScope } from '../middleware/auth';
import { asyncHandler, ValidationError } from '../middleware/errorHandler';
import { getUserId } from '../utils/user-context';
import {
  calculateInterruptibility,
  type InterruptibilitySignals,
} from '../services/interruptibility';
import {
  recordActivity,
  detectPatterns,
  generateSuggestions,
  getHabitStats,
  getStoredPatterns,
} from '../services/habit-engine';
import {
  startFocusMode,
  endFocusMode,
  getFocusStatus,
  getFocusHistory,
} from '../services/focus-mode';

export const proactiveIntelligenceRouter = Router();

// ─── Interruptibility ─────────────────────────────────

proactiveIntelligenceRouter.get(
  '/:context/interruptibility',
  apiKeyAuth,
  requireScope('read'),
  asyncHandler(async (req, res) => {
    const context = req.params.context as AIContext;
    if (!isValidContext(context)) { throw new ValidationError('Invalid context'); }

    const signals: InterruptibilitySignals = {
      typingRate: Math.max(0, Number(req.query.typingRate) || 0),
      currentPage: String(req.query.currentPage ?? ''),
      timeOfDay: Number.isFinite(Number(req.query.timeOfDay))
        ? Number(req.query.timeOfDay)
        : new Date().getHours(),
      recentDismissals: Math.max(0, Number(req.query.recentDismissals) || 0),
      focusModeActive: req.query.focusModeActive === 'true',
      sessionDuration: Math.max(0, Number(req.query.sessionDuration) || 0),
    };

    const result = calculateInterruptibility(signals);
    res.json({ success: true, data: result });
  }),
);

// ─── Habits: Record activity ──────────────────────────

proactiveIntelligenceRouter.post(
  '/:context/habits/activity',
  apiKeyAuth,
  requireScope('write'),
  asyncHandler(async (req, res) => {
    const context = req.params.context as AIContext;
    if (!isValidContext(context)) { throw new ValidationError('Invalid context'); }

    const userId = getUserId(req);
    const { activityType, metadata } = req.body as {
      activityType?: string;
      metadata?: Record<string, unknown>;
    };

    if (!activityType || typeof activityType !== 'string') {
      throw new ValidationError('activityType is required');
    }

    const result = await recordActivity(context, userId, activityType, metadata ?? {});
    res.json({ success: true, data: result });
  }),
);

// ─── Habits: Detected patterns ────────────────────────

proactiveIntelligenceRouter.get(
  '/:context/habits/patterns',
  apiKeyAuth,
  requireScope('read'),
  asyncHandler(async (req, res) => {
    const context = req.params.context as AIContext;
    if (!isValidContext(context)) { throw new ValidationError('Invalid context'); }

    const userId = getUserId(req);
    const refresh = req.query.refresh === 'true';

    let patterns;
    if (refresh) {
      patterns = await detectPatterns(context, userId);
    } else {
      patterns = await getStoredPatterns(context, userId);
    }

    res.json({ success: true, data: patterns });
  }),
);

// ─── Habits: Suggestions ──────────────────────────────

proactiveIntelligenceRouter.get(
  '/:context/habits/suggestions',
  apiKeyAuth,
  requireScope('read'),
  asyncHandler(async (req, res) => {
    const context = req.params.context as AIContext;
    if (!isValidContext(context)) { throw new ValidationError('Invalid context'); }

    const userId = getUserId(req);
    const patterns = await getStoredPatterns(context, userId);
    const suggestions = generateSuggestions(context, userId, patterns);

    res.json({ success: true, data: suggestions });
  }),
);

// ─── Habits: Weekly stats ─────────────────────────────

proactiveIntelligenceRouter.get(
  '/:context/habits/stats',
  apiKeyAuth,
  requireScope('read'),
  asyncHandler(async (req, res) => {
    const context = req.params.context as AIContext;
    if (!isValidContext(context)) { throw new ValidationError('Invalid context'); }

    const userId = getUserId(req);
    const stats = await getHabitStats(context, userId);

    res.json({ success: true, data: stats });
  }),
);

// ─── Focus: Start ─────────────────────────────────────

proactiveIntelligenceRouter.post(
  '/:context/focus/start',
  apiKeyAuth,
  requireScope('write'),
  asyncHandler(async (req, res) => {
    const context = req.params.context as AIContext;
    if (!isValidContext(context)) { throw new ValidationError('Invalid context'); }

    const userId = getUserId(req);
    const { durationMinutes, taskId } = req.body as {
      durationMinutes?: number;
      taskId?: string;
    };

    if (!durationMinutes || typeof durationMinutes !== 'number' || durationMinutes < 1) {
      throw new ValidationError('durationMinutes must be a positive number');
    }

    if (durationMinutes > 480) {
      throw new ValidationError('durationMinutes cannot exceed 480 (8 hours)');
    }

    const session = await startFocusMode(context, userId, durationMinutes, taskId);
    res.json({ success: true, data: session });
  }),
);

// ─── Focus: End ───────────────────────────────────────

proactiveIntelligenceRouter.post(
  '/:context/focus/end',
  apiKeyAuth,
  requireScope('write'),
  asyncHandler(async (req, res) => {
    const context = req.params.context as AIContext;
    if (!isValidContext(context)) { throw new ValidationError('Invalid context'); }

    const userId = getUserId(req);
    const session = await endFocusMode(context, userId);

    if (!session) {
      res.json({ success: true, data: null, message: 'No active focus session' });
      return;
    }

    res.json({ success: true, data: session });
  }),
);

// ─── Focus: Status ────────────────────────────────────

proactiveIntelligenceRouter.get(
  '/:context/focus/status',
  apiKeyAuth,
  requireScope('read'),
  asyncHandler(async (req, res) => {
    const context = req.params.context as AIContext;
    if (!isValidContext(context)) { throw new ValidationError('Invalid context'); }

    const userId = getUserId(req);
    const status = await getFocusStatus(context, userId);

    res.json({ success: true, data: status });
  }),
);

// ─── Focus: History ───────────────────────────────────

proactiveIntelligenceRouter.get(
  '/:context/focus/history',
  apiKeyAuth,
  requireScope('read'),
  asyncHandler(async (req, res) => {
    const context = req.params.context as AIContext;
    if (!isValidContext(context)) { throw new ValidationError('Invalid context'); }

    const userId = getUserId(req);
    const days = Math.min(90, Math.max(1, Number(req.query.days) || 7));
    const sessions = await getFocusHistory(context, userId, days);

    res.json({ success: true, data: sessions });
  }),
);
