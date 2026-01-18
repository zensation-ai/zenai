/**
 * Evolution Analytics API Routes
 * Phase 5: Evolution Dashboard & Mobile
 *
 * Provides endpoints for the Evolution Dashboard to visualize
 * how the AI learns and improves over time.
 */

import { Router, Request, Response } from 'express';
import { AIContext, isValidContext } from '../utils/database-context';
import { apiKeyAuth } from '../middleware/auth';
import { asyncHandler, ValidationError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';
import {
  getEvolutionDashboard,
  createDailySnapshot,
  getSnapshots,
  getLatestSnapshot,
  getLearningTimeline,
  getEventsByType,
  recordLearningEvent,
  getAccuracyTrends,
  getMilestones,
  updateMilestoneProgress,
  LearningEventType,
} from '../services/evolution-analytics';

export const evolutionRouter = Router();

// ===========================================
// Dashboard
// ===========================================

/**
 * GET /api/:context/evolution
 * Get the complete evolution dashboard data
 */
evolutionRouter.get(
  '/:context/evolution',
  apiKeyAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { context } = req.params;

    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use "personal" or "work".');
    }

    const dashboard = await getEvolutionDashboard(context as AIContext);

    res.json({
      success: true,
      dashboard,
    });
  })
);

/**
 * GET /api/:context/evolution/summary
 * Get a quick summary of evolution metrics
 */
evolutionRouter.get(
  '/:context/evolution/summary',
  apiKeyAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { context } = req.params;

    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use "personal" or "work".');
    }

    const snapshot = await getLatestSnapshot(context as AIContext);
    const milestones = await getMilestones(context as AIContext);

    res.json({
      success: true,
      summary: {
        context_depth_score: snapshot?.context_depth_score || 0,
        ai_accuracy_score: snapshot?.ai_accuracy_score || 50,
        active_days_streak: snapshot?.active_days_streak || 0,
        total_ideas: snapshot?.total_ideas || 0,
        milestones_achieved: milestones.achieved.length,
        next_milestone: milestones.upcoming[0] || null,
      },
    });
  })
);

// ===========================================
// Snapshots
// ===========================================

/**
 * GET /api/:context/evolution/snapshots
 * Get historical snapshots for trend analysis
 */
evolutionRouter.get(
  '/:context/evolution/snapshots',
  apiKeyAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { context } = req.params;
    const days = Math.min(parseInt(req.query.days as string) || 30, 365);

    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use "personal" or "work".');
    }

    const snapshots = await getSnapshots(context as AIContext, days);

    res.json({
      success: true,
      snapshots,
      count: snapshots.length,
      period_days: days,
    });
  })
);

/**
 * POST /api/:context/evolution/snapshots
 * Create today's snapshot (usually done automatically)
 */
evolutionRouter.post(
  '/:context/evolution/snapshots',
  apiKeyAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { context } = req.params;

    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use "personal" or "work".');
    }

    const snapshot = await createDailySnapshot(context as AIContext);

    res.json({
      success: true,
      snapshot,
    });
  })
);

// ===========================================
// Learning Timeline
// ===========================================

/**
 * GET /api/:context/evolution/timeline
 * Get the learning timeline (significant events)
 */
evolutionRouter.get(
  '/:context/evolution/timeline',
  apiKeyAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { context } = req.params;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const offset = parseInt(req.query.offset as string) || 0;
    const eventType = req.query.event_type as string | undefined;

    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use "personal" or "work".');
    }

    let events;
    if (eventType) {
      events = await getEventsByType(context as AIContext, eventType as LearningEventType, limit);
    } else {
      events = await getLearningTimeline(context as AIContext, limit, offset);
    }

    res.json({
      success: true,
      events,
      count: events.length,
      offset,
    });
  })
);

/**
 * POST /api/:context/evolution/events
 * Record a learning event (for internal use or testing)
 */
evolutionRouter.post(
  '/:context/evolution/events',
  apiKeyAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { context } = req.params;
    const { event_type, title, description, impact_score, metadata, icon, color } = req.body;

    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use "personal" or "work".');
    }

    if (!event_type || !title) {
      throw new ValidationError('event_type and title are required');
    }

    const validEventTypes: LearningEventType[] = [
      'pattern_learned', 'preference_updated', 'accuracy_improved',
      'milestone_reached', 'automation_created', 'automation_suggested',
      'cluster_discovered', 'topic_recognized', 'behavior_adapted',
      'profile_enriched', 'integration_connected', 'weekly_summary'
    ];

    if (!validEventTypes.includes(event_type)) {
      throw new ValidationError(`Invalid event_type. Use: ${validEventTypes.join(', ')}`);
    }

    const eventId = await recordLearningEvent(
      context as AIContext,
      event_type,
      title,
      { description, impact_score, metadata, icon, color }
    );

    res.status(201).json({
      success: true,
      event_id: eventId,
    });
  })
);

// ===========================================
// Accuracy Trends
// ===========================================

/**
 * GET /api/:context/evolution/accuracy
 * Get accuracy trends over time
 */
evolutionRouter.get(
  '/:context/evolution/accuracy',
  apiKeyAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { context } = req.params;
    const weeks = Math.min(parseInt(req.query.weeks as string) || 12, 52);

    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use "personal" or "work".');
    }

    const trends = await getAccuracyTrends(context as AIContext, weeks);

    // Group by field for easier charting
    const byField: Record<string, typeof trends> = {};
    trends.forEach(t => {
      if (!byField[t.field_name]) byField[t.field_name] = [];
      byField[t.field_name].push(t);
    });

    res.json({
      success: true,
      trends,
      by_field: byField,
      period_weeks: weeks,
    });
  })
);

// ===========================================
// Milestones
// ===========================================

/**
 * GET /api/:context/evolution/milestones
 * Get all milestones and progress
 */
evolutionRouter.get(
  '/:context/evolution/milestones',
  apiKeyAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { context } = req.params;

    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use "personal" or "work".');
    }

    const milestones = await getMilestones(context as AIContext);

    res.json({
      success: true,
      milestones,
      summary: {
        total: milestones.all.length,
        achieved: milestones.achieved.length,
        in_progress: milestones.upcoming.length,
      },
    });
  })
);

/**
 * POST /api/:context/evolution/milestones/:type/update
 * Update progress for a milestone type
 */
evolutionRouter.post(
  '/:context/evolution/milestones/:type/update',
  apiKeyAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { context, type } = req.params;
    const { current_value } = req.body;

    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use "personal" or "work".');
    }

    if (current_value === undefined || typeof current_value !== 'number') {
      throw new ValidationError('current_value (number) is required');
    }

    const validTypes = [
      'ideas_count', 'streak_days', 'accuracy_level', 'automations_count',
      'time_saved', 'patterns_learned', 'integrations_count', 'profile_complete'
    ];

    if (!validTypes.includes(type)) {
      throw new ValidationError(`Invalid milestone type. Use: ${validTypes.join(', ')}`);
    }

    const updated = await updateMilestoneProgress(
      context as AIContext,
      type,
      current_value
    );

    const newlyAchieved = updated.filter(m => m.achieved && m.achieved_at);

    res.json({
      success: true,
      milestones: updated,
      newly_achieved: newlyAchieved,
    });
  })
);

// ===========================================
// Context Depth
// ===========================================

/**
 * GET /api/:context/evolution/context-depth
 * Get detailed context depth breakdown
 */
evolutionRouter.get(
  '/:context/evolution/context-depth',
  apiKeyAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { context } = req.params;

    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use "personal" or "work".');
    }

    const snapshot = await getLatestSnapshot(context as AIContext);

    if (!snapshot) {
      // Create snapshot if none exists
      await createDailySnapshot(context as AIContext);
      const newSnapshot = await getLatestSnapshot(context as AIContext);

      if (!newSnapshot) {
        res.json({
          success: true,
          context_depth: {
            total_score: 0,
            profile_score: 0,
            patterns_score: 0,
            interactions_score: 0,
            automations_score: 0,
            breakdown: [],
          },
        });
        return;
      }
    }

    // Calculate breakdown
    const profileScore = Math.min(25, (snapshot?.profile_completeness || 0) / 4);
    const patternsScore = Math.min(25, (snapshot?.learned_patterns_count || 0) * 0.5);
    const interactionsScore = Math.min(25, (snapshot?.total_interactions || 0) * 0.025);
    const automationsScore = Math.min(25, (snapshot?.automations_active || 0) * 2.5);

    res.json({
      success: true,
      context_depth: {
        total_score: snapshot?.context_depth_score || 0,
        profile_score: Math.round(profileScore * 10) / 10,
        patterns_score: Math.round(patternsScore * 10) / 10,
        interactions_score: Math.round(interactionsScore * 10) / 10,
        automations_score: Math.round(automationsScore * 10) / 10,
        breakdown: [
          { name: 'Profil', score: profileScore, max: 25, description: 'Vollständigkeit des Business-Profils' },
          { name: 'Muster', score: patternsScore, max: 25, description: 'Gelernte Korrektur-Muster' },
          { name: 'Interaktionen', score: interactionsScore, max: 25, description: 'Anzahl der Interaktionen' },
          { name: 'Automationen', score: automationsScore, max: 25, description: 'Aktive Automationen' },
        ],
      },
    });
  })
);

// ===========================================
// Statistics
// ===========================================

/**
 * GET /api/:context/evolution/stats
 * Get comprehensive evolution statistics
 */
evolutionRouter.get(
  '/:context/evolution/stats',
  apiKeyAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { context } = req.params;

    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use "personal" or "work".');
    }

    const [dashboard, trends] = await Promise.all([
      getEvolutionDashboard(context as AIContext),
      getAccuracyTrends(context as AIContext, 4), // Last 4 weeks
    ]);

    // Calculate field-level accuracy summary (use most recent entry per field)
    const accuracyByField: Record<string, number> = {};
    const latestDateByField: Record<string, string> = {};
    trends.forEach(t => {
      if (!latestDateByField[t.field_name] || t.period_start > latestDateByField[t.field_name]) {
        latestDateByField[t.field_name] = t.period_start;
        accuracyByField[t.field_name] = t.accuracy_score;
      }
    });

    res.json({
      success: true,
      stats: {
        // Overview
        context_depth_score: dashboard.context_depth_score,
        ai_accuracy_score: dashboard.ai_accuracy_score,
        active_days_streak: dashboard.active_days_streak,
        total_days_active: dashboard.total_days_active,

        // Trends
        accuracy_change_7d: dashboard.accuracy_change_7d,
        accuracy_change_30d: dashboard.accuracy_change_30d,
        accuracy_by_field: accuracyByField,

        // Impact
        total_time_saved_minutes: dashboard.total_time_saved_minutes,
        total_automations_executed: dashboard.total_automations_executed,
        total_patterns_learned: dashboard.total_patterns_learned,

        // Engagement
        recent_events_count: dashboard.recent_events_count,
        milestones_achieved: dashboard.total_milestones_achieved,

        // Current snapshot summary
        snapshot: dashboard.current_snapshot ? {
          total_ideas: dashboard.current_snapshot.total_ideas,
          total_corrections: dashboard.current_snapshot.total_corrections,
          automations_active: dashboard.current_snapshot.automations_active,
          ideas_created_today: dashboard.current_snapshot.ideas_created_today,
        } : null,
      },
    });
  })
);

// ===========================================
// AI Evolution Analytics (Phase 28)
// ===========================================

import { aiEvolutionAnalytics } from '../services/ai-evolution-analytics';

/**
 * GET /api/:context/evolution/learning-curve
 * Get the AI learning curve over time
 */
evolutionRouter.get(
  '/:context/evolution/learning-curve',
  apiKeyAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { context } = req.params;
    const days = Math.min(parseInt(req.query.days as string) || 30, 365);

    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use "personal" or "work".');
    }

    const learningCurve = await aiEvolutionAnalytics.calculateLearningCurve(
      context as AIContext,
      days
    );

    res.json({
      success: true,
      learningCurve,
      period_days: days,
    });
  })
);

/**
 * GET /api/:context/evolution/domain-strengths
 * Get analysis of which domains the AI handles well
 */
evolutionRouter.get(
  '/:context/evolution/domain-strengths',
  apiKeyAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { context } = req.params;

    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use "personal" or "work".');
    }

    const domainStrengths = await aiEvolutionAnalytics.analyzeDomainStrengths(
      context as AIContext
    );

    res.json({
      success: true,
      domainStrengths,
      strongest: domainStrengths[0] || null,
      weakest: domainStrengths[domainStrengths.length - 1] || null,
    });
  })
);

/**
 * GET /api/:context/evolution/proactive-effectiveness
 * Get effectiveness metrics for proactive suggestions
 */
evolutionRouter.get(
  '/:context/evolution/proactive-effectiveness',
  apiKeyAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { context } = req.params;
    const days = Math.min(parseInt(req.query.days as string) || 30, 365);

    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use "personal" or "work".');
    }

    const effectiveness = await aiEvolutionAnalytics.analyzeProactiveEffectiveness(
      context as AIContext,
      days
    );

    res.json({
      success: true,
      effectiveness,
      period_days: days,
    });
  })
);

/**
 * GET /api/:context/evolution/insights
 * Get AI-generated insights and recommendations
 */
evolutionRouter.get(
  '/:context/evolution/insights',
  apiKeyAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { context } = req.params;

    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use "personal" or "work".');
    }

    const insights = await aiEvolutionAnalytics.getInsights(context as AIContext);

    res.json({
      success: true,
      insights,
      generatedAt: new Date().toISOString(),
    });
  })
);

/**
 * GET /api/:context/evolution/metrics
 * Get comprehensive evolution metrics
 */
evolutionRouter.get(
  '/:context/evolution/metrics',
  apiKeyAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { context } = req.params;
    const days = Math.min(parseInt(req.query.days as string) || 30, 365);

    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use "personal" or "work".');
    }

    const metrics = await aiEvolutionAnalytics.getEvolutionMetrics(
      context as AIContext,
      days
    );

    res.json({
      success: true,
      metrics,
      period_days: days,
    });
  })
);
