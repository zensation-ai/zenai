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
import { logger } from '../utils/logger';
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

    try {
      const result = calculateInterruptibility(signals);
      res.json({ success: true, data: result });
    } catch (error) {
      logger.error('Proaktive Intelligenz: Unterbrechbarkeits-Berechnung fehlgeschlagen', error instanceof Error ? error : undefined, { context });
      res.status(500).json({ success: false, error: 'Unterbrechbarkeits-Score konnte nicht berechnet werden' });
    }
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

    try {
      const result = await recordActivity(context, userId, activityType, metadata ?? {});
      res.json({ success: true, data: result });
    } catch (error) {
      logger.error('Proaktive Intelligenz: Aktivitäts-Erfassung fehlgeschlagen', error instanceof Error ? error : undefined, { context, operation: activityType });
      res.status(500).json({ success: false, error: 'Aktivität konnte nicht erfasst werden' });
    }
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

    try {
      let patterns;
      if (refresh) {
        patterns = await detectPatterns(context, userId);
      } else {
        patterns = await getStoredPatterns(context, userId);
      }

      res.json({ success: true, data: patterns });
    } catch (error) {
      logger.error('Proaktive Intelligenz: Muster-Erkennung fehlgeschlagen', error instanceof Error ? error : undefined, { context });
      res.status(500).json({ success: false, error: 'Gewohnheitsmuster konnten nicht geladen werden' });
    }
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

    try {
      const patterns = await getStoredPatterns(context, userId);
      const suggestions = generateSuggestions(context, userId, patterns);

      res.json({ success: true, data: suggestions });
    } catch (error) {
      logger.error('Proaktive Intelligenz: Vorschläge fehlgeschlagen', error instanceof Error ? error : undefined, { context });
      res.status(500).json({ success: false, error: 'Gewohnheits-Vorschläge konnten nicht erstellt werden' });
    }
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

    try {
      const stats = await getHabitStats(context, userId);
      res.json({ success: true, data: stats });
    } catch (error) {
      logger.error('Proaktive Intelligenz: Statistiken fehlgeschlagen', error instanceof Error ? error : undefined, { context });
      res.status(500).json({ success: false, error: 'Gewohnheits-Statistiken konnten nicht geladen werden' });
    }
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

    try {
      const session = await startFocusMode(context, userId, durationMinutes, taskId);
      res.json({ success: true, data: session });
    } catch (error) {
      logger.error('Proaktive Intelligenz: Fokus-Modus Start fehlgeschlagen', error instanceof Error ? error : undefined, { context, operation: String(durationMinutes) });
      res.status(500).json({ success: false, error: 'Fokus-Modus konnte nicht gestartet werden' });
    }
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

    try {
      const session = await endFocusMode(context, userId);

      if (!session) {
        res.json({ success: true, data: null, message: 'No active focus session' });
        return;
      }

      res.json({ success: true, data: session });
    } catch (error) {
      logger.error('Proaktive Intelligenz: Fokus-Modus Ende fehlgeschlagen', error instanceof Error ? error : undefined, { context });
      res.status(500).json({ success: false, error: 'Fokus-Modus konnte nicht beendet werden' });
    }
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

    try {
      const status = await getFocusStatus(context, userId);
      res.json({ success: true, data: status });
    } catch (error) {
      logger.error('Proaktive Intelligenz: Fokus-Status fehlgeschlagen', error instanceof Error ? error : undefined, { context });
      res.status(500).json({ success: false, error: 'Fokus-Status konnte nicht abgerufen werden' });
    }
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

    try {
      const sessions = await getFocusHistory(context, userId, days);
      res.json({ success: true, data: sessions });
    } catch (error) {
      logger.error('Proaktive Intelligenz: Fokus-Verlauf fehlgeschlagen', error instanceof Error ? error : undefined, { context });
      res.status(500).json({ success: false, error: 'Fokus-Verlauf konnte nicht geladen werden' });
    }
  }),
);
