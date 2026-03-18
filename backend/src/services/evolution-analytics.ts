/**
 * Evolution Analytics Service
 * Phase 5: Evolution Dashboard & Mobile
 *
 * Provides insights into how the AI learns and improves over time.
 * Powers the Evolution Dashboard with learning timeline, accuracy trends,
 * context depth scores, and milestone tracking.
 */

import { v4 as uuidv4 } from 'uuid';
import { queryContext, AIContext } from '../utils/database-context';
import { logger } from '../utils/logger';

// ===========================================
// Types
// ===========================================

export interface EvolutionSnapshot {
  id: string;
  context: AIContext;
  snapshot_date: string;
  total_ideas: number;
  total_corrections: number;
  total_interactions: number;
  total_automations: number;
  correction_rate: number;
  ai_accuracy_score: number;
  context_depth_score: number;
  profile_completeness: number;
  learned_patterns_count: number;
  learned_keywords_count: number;
  automations_active: number;
  automations_executed_today: number;
  automation_success_rate: number;
  estimated_time_saved_minutes: number;
  active_days_streak: number;
  ideas_created_today: number;
  feedback_given_today: number;
  created_at: string;
}

export interface LearningEvent {
  id: string;
  context: AIContext;
  event_type: LearningEventType;
  title: string;
  description?: string;
  impact_score: number;
  related_entity_type?: string;
  related_entity_id?: string;
  metadata: Record<string, unknown>;
  icon: string;
  color: string;
  created_at: string;
}

export type LearningEventType =
  | 'pattern_learned'
  | 'preference_updated'
  | 'accuracy_improved'
  | 'milestone_reached'
  | 'automation_created'
  | 'automation_suggested'
  | 'cluster_discovered'
  | 'topic_recognized'
  | 'behavior_adapted'
  | 'profile_enriched'
  | 'integration_connected'
  | 'weekly_summary';

export interface AccuracyTrend {
  field_name: string;
  period_start: string;
  accuracy_score: number;
  trend: 'improving' | 'stable' | 'declining';
  trend_delta: number;
}

export interface Milestone {
  id: string;
  context: AIContext;
  milestone_type: string;
  milestone_level: number;
  title: string;
  description?: string;
  icon: string;
  threshold_value: number;
  achieved: boolean;
  achieved_at?: string;
  current_value: number;
  progress_percent: number;
}

export interface EvolutionDashboard {
  // Current state
  current_snapshot: EvolutionSnapshot | null;
  context_depth_score: number;
  ai_accuracy_score: number;

  // Timeline
  learning_timeline: LearningEvent[];
  recent_events_count: number;

  // Trends
  accuracy_trend: AccuracyTrend[];
  accuracy_change_7d: number;
  accuracy_change_30d: number;

  // Snapshots for charts
  snapshots_30d: Array<{
    date: string;
    accuracy_score: number;
    context_depth: number;
    ideas_count: number;
  }>;

  // Milestones
  achieved_milestones: Milestone[];
  upcoming_milestones: Milestone[];
  total_milestones_achieved: number;

  // Impact metrics
  total_time_saved_minutes: number;
  total_automations_executed: number;
  total_patterns_learned: number;

  // Engagement
  active_days_streak: number;
  total_days_active: number;
}

// ===========================================
// Snapshot Management
// ===========================================

/**
 * Creates or updates today's evolution snapshot
 */
export async function createDailySnapshot(context: AIContext): Promise<EvolutionSnapshot | null> {
  try {
    const today = new Date().toISOString().split('T')[0];

    // Gather all metrics
    const [
      ideasResult,
      correctionsResult,
      interactionsResult,
      automationsResult,
      patternsResult,
      profileResult,
      todayIdeasResult,
      todayFeedbackResult,
      streakResult,
    ] = await Promise.all([
      // Total ideas
      queryContext(context, `SELECT COUNT(*) as count FROM ideas WHERE context = $1`, [context]),

      // Total corrections
      queryContext(context, `SELECT COUNT(*) as count FROM field_corrections WHERE context = $1`, [context]),

      // Total interactions
      queryContext(context, `SELECT COUNT(*) as count FROM interaction_events WHERE context = $1`, [context]),

      // Active automations
      queryContext(context, `SELECT COUNT(*) as count FROM automation_definitions WHERE context = $1 AND is_active = true`, [context]),

      // Learned patterns
      queryContext(context, `SELECT COUNT(*) as count FROM correction_patterns WHERE context = $1 AND is_active = true`, [context]),

      // Profile completeness
      queryContext(context, `
        SELECT
          COALESCE(
            (CASE WHEN company_name IS NOT NULL AND company_name != '' THEN 20 ELSE 0 END +
             CASE WHEN industry IS NOT NULL AND industry != '' THEN 20 ELSE 0 END +
             CASE WHEN role IS NOT NULL AND role != '' THEN 20 ELSE 0 END +
             CASE WHEN array_length(tech_stack, 1) > 0 THEN 20 ELSE 0 END +
             CASE WHEN array_length(goals, 1) > 0 THEN 20 ELSE 0 END), 0) as completeness
        FROM business_profile WHERE context = $1
      `, [context]),

      // Today's ideas
      queryContext(context, `
        SELECT COUNT(*) as count FROM ideas
        WHERE context = $1 AND DATE(created_at) = CURRENT_DATE
      `, [context]),

      // Today's feedback
      queryContext(context, `
        SELECT COUNT(*) as count FROM interaction_events
        WHERE context = $1 AND interaction_type LIKE 'feedback%' AND DATE(created_at) = CURRENT_DATE
      `, [context]),

      // Active days streak
      calculateStreak(context),
    ]);

    const totalIdeas = parseInt(ideasResult.rows[0]?.count || '0', 10);
    const totalCorrections = parseInt(correctionsResult.rows[0]?.count || '0', 10);
    const totalInteractions = parseInt(interactionsResult.rows[0]?.count || '0', 10);
    const automationsActive = parseInt(automationsResult.rows[0]?.count || '0', 10);
    const patternsCount = parseInt(patternsResult.rows[0]?.count || '0', 10);
    const profileCompleteness = parseInt(profileResult.rows[0]?.completeness || '0', 10);
    const ideasToday = parseInt(todayIdeasResult.rows[0]?.count || '0', 10);
    const feedbackToday = parseInt(todayFeedbackResult.rows[0]?.count || '0', 10);

    // Calculate derived metrics
    const correctionRate = totalIdeas > 0 ? totalCorrections / totalIdeas : 0;
    const aiAccuracyScore = Math.max(50, Math.min(100, 100 - (correctionRate * 100)));

    // Context depth score (0-100)
    const contextDepthScore = calculateContextDepthScore({
      profileCompleteness,
      patternsCount,
      totalInteractions,
      automationsActive,
    });

    // Insert or update snapshot
    const id = uuidv4();
    await queryContext(context, `
      INSERT INTO evolution_snapshots (
        id, context, snapshot_date, total_ideas, total_corrections,
        total_interactions, total_automations, correction_rate, ai_accuracy_score,
        context_depth_score, profile_completeness, learned_patterns_count,
        automations_active, active_days_streak, ideas_created_today, feedback_given_today
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      ON CONFLICT (context, snapshot_date) DO UPDATE SET
        total_ideas = EXCLUDED.total_ideas,
        total_corrections = EXCLUDED.total_corrections,
        total_interactions = EXCLUDED.total_interactions,
        total_automations = EXCLUDED.total_automations,
        correction_rate = EXCLUDED.correction_rate,
        ai_accuracy_score = EXCLUDED.ai_accuracy_score,
        context_depth_score = EXCLUDED.context_depth_score,
        profile_completeness = EXCLUDED.profile_completeness,
        learned_patterns_count = EXCLUDED.learned_patterns_count,
        automations_active = EXCLUDED.automations_active,
        active_days_streak = EXCLUDED.active_days_streak,
        ideas_created_today = EXCLUDED.ideas_created_today,
        feedback_given_today = EXCLUDED.feedback_given_today
    `, [
      id, context, today, totalIdeas, totalCorrections,
      totalInteractions, automationsActive, correctionRate, aiAccuracyScore,
      contextDepthScore, profileCompleteness, patternsCount,
      automationsActive, streakResult, ideasToday, feedbackToday
    ]);

    // Fetch the created/updated snapshot
    const result = await queryContext(context, `
      SELECT * FROM evolution_snapshots WHERE context = $1 AND snapshot_date = $2
    `, [context, today]);

    if (result.rows.length === 0) {return null;}

    return mapRowToSnapshot(result.rows[0]);
  } catch (error) {
    logger.error('Failed to create daily snapshot', error instanceof Error ? error : undefined, { context });
    return null;
  }
}

/**
 * Gets snapshots for a date range
 */
export async function getSnapshots(
  context: AIContext,
  days: number = 30
): Promise<EvolutionSnapshot[]> {
  try {
    const result = await queryContext(context, `
      SELECT * FROM evolution_snapshots
      WHERE context = $1 AND snapshot_date > CURRENT_DATE - $2::interval
      ORDER BY snapshot_date ASC
    `, [context, `${days} days`]);

    return result.rows.map(mapRowToSnapshot);
  } catch (error) {
    logger.error('Failed to get snapshots', error instanceof Error ? error : undefined);
    return [];
  }
}

/**
 * Gets the latest snapshot
 */
export async function getLatestSnapshot(context: AIContext): Promise<EvolutionSnapshot | null> {
  try {
    const result = await queryContext(context, `
      SELECT * FROM evolution_snapshots
      WHERE context = $1
      ORDER BY snapshot_date DESC
      LIMIT 1
    `, [context]);

    if (result.rows.length === 0) {return null;}
    return mapRowToSnapshot(result.rows[0]);
  } catch (e) {
    logger.warn('getLatestSnapshot failed', { error: e instanceof Error ? e.message : String(e) });
    return null;
  }
}

// ===========================================
// Learning Events
// ===========================================

/**
 * Records a learning event
 */
export async function recordLearningEvent(
  context: AIContext,
  eventType: LearningEventType,
  title: string,
  options: {
    description?: string;
    impact_score?: number;
    related_entity_type?: string;
    related_entity_id?: string;
    metadata?: Record<string, unknown>;
    icon?: string;
    color?: string;
  } = {}
): Promise<string> {
  try {
    const id = uuidv4();
    const {
      description,
      impact_score = 0.5,
      related_entity_type,
      related_entity_id,
      metadata = {},
      icon = getEventIcon(eventType),
      color = getEventColor(eventType),
    } = options;

    await queryContext(context, `
      INSERT INTO learning_events (
        id, context, event_type, title, description, impact_score,
        related_entity_type, related_entity_id, metadata, icon, color
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `, [
      id, context, eventType, title, description || null, impact_score,
      related_entity_type || null, related_entity_id || null,
      JSON.stringify(metadata), icon, color
    ]);

    logger.info('Learning event recorded', { context, eventType, title });
    return id;
  } catch (error) {
    logger.error('Failed to record learning event', error instanceof Error ? error : undefined);
    return '';
  }
}

/**
 * Gets learning timeline
 */
export async function getLearningTimeline(
  context: AIContext,
  limit: number = 50,
  offset: number = 0
): Promise<LearningEvent[]> {
  try {
    const result = await queryContext(context, `
      SELECT * FROM learning_events
      WHERE context = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `, [context, limit, offset]);

    return result.rows.map(mapRowToEvent);
  } catch (e) {
    logger.warn('getLearningTimeline failed', { error: e instanceof Error ? e.message : String(e) });
    return [];
  }
}

/**
 * Gets events by type
 */
export async function getEventsByType(
  context: AIContext,
  eventType: LearningEventType,
  limit: number = 20
): Promise<LearningEvent[]> {
  try {
    const result = await queryContext(context, `
      SELECT * FROM learning_events
      WHERE context = $1 AND event_type = $2
      ORDER BY created_at DESC
      LIMIT $3
    `, [context, eventType, limit]);

    return result.rows.map(mapRowToEvent);
  } catch (e) {
    logger.warn('getEventsByType failed', { error: e instanceof Error ? e.message : String(e) });
    return [];
  }
}

// ===========================================
// Accuracy Tracking
// ===========================================

/**
 * Records accuracy for a period
 */
export async function recordAccuracyPeriod(
  context: AIContext,
  fieldName: string,
  periodStart: Date,
  periodEnd: Date,
  totalPredictions: number,
  correctPredictions: number
): Promise<void> {
  try {
    const accuracyScore = totalPredictions > 0
      ? (correctPredictions / totalPredictions) * 100
      : 0;

    // Get previous period accuracy for trend calculation
    const previousResult = await queryContext(context, `
      SELECT accuracy_score FROM accuracy_history
      WHERE context = $1 AND field_name = $2 AND period_end < $3
      ORDER BY period_end DESC
      LIMIT 1
    `, [context, fieldName, periodStart.toISOString().split('T')[0]]);

    let trend: 'improving' | 'stable' | 'declining' = 'stable';
    let trendDelta = 0;

    if (previousResult.rows.length > 0) {
      const previousScore = parseFloat(previousResult.rows[0].accuracy_score);
      trendDelta = accuracyScore - previousScore;

      if (trendDelta > 2) {trend = 'improving';}
      else if (trendDelta < -2) {trend = 'declining';}
    }

    await queryContext(context, `
      INSERT INTO accuracy_history (
        id, context, period_start, period_end, field_name,
        total_predictions, correct_predictions, corrections_received,
        accuracy_score, trend, trend_delta
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (context, period_start, field_name) DO UPDATE SET
        total_predictions = EXCLUDED.total_predictions,
        correct_predictions = EXCLUDED.correct_predictions,
        accuracy_score = EXCLUDED.accuracy_score,
        trend = EXCLUDED.trend,
        trend_delta = EXCLUDED.trend_delta
    `, [
      uuidv4(), context,
      periodStart.toISOString().split('T')[0],
      periodEnd.toISOString().split('T')[0],
      fieldName, totalPredictions, correctPredictions,
      totalPredictions - correctPredictions,
      accuracyScore, trend, trendDelta
    ]);
  } catch (error) {
    logger.error('Failed to record accuracy period', error instanceof Error ? error : undefined);
  }
}

/**
 * Gets accuracy trends
 */
export async function getAccuracyTrends(
  context: AIContext,
  weeks: number = 12
): Promise<AccuracyTrend[]> {
  try {
    const result = await queryContext(context, `
      SELECT field_name, period_start, accuracy_score, trend, trend_delta
      FROM accuracy_history
      WHERE context = $1 AND period_start > CURRENT_DATE - $2::interval
      ORDER BY field_name, period_start DESC
    `, [context, `${weeks} weeks`]);

    return result.rows.map((row: Record<string, unknown>) => ({
      field_name: row.field_name as string,
      period_start: (row.period_start as Date).toISOString().split('T')[0],
      accuracy_score: parseFloat(row.accuracy_score as string) || 0,
      trend: row.trend as AccuracyTrend['trend'],
      trend_delta: parseFloat(row.trend_delta as string) || 0,
    }));
  } catch (e) {
    logger.warn('getAccuracyTrends failed', { error: e instanceof Error ? e.message : String(e) });
    return [];
  }
}

// ===========================================
// Milestones
// ===========================================

/**
 * Updates milestone progress
 */
export async function updateMilestoneProgress(
  context: AIContext,
  milestoneType: string,
  currentValue: number
): Promise<Milestone[]> {
  try {
    // Get all milestones of this type
    const result = await queryContext(context, `
      SELECT * FROM evolution_milestones
      WHERE context = $1 AND milestone_type = $2
      ORDER BY milestone_level ASC
    `, [context, milestoneType]);

    const updatedMilestones: Milestone[] = [];
    const newlyAchieved: Milestone[] = [];

    for (const row of result.rows) {
      const milestone = mapRowToMilestone(row);
      const threshold = milestone.threshold_value;
      const wasAchieved = milestone.achieved;
      const isNowAchieved = currentValue >= threshold;
      const progressPercent = Math.min(100, (currentValue / threshold) * 100);

      // Update milestone
      await queryContext(context, `
        UPDATE evolution_milestones
        SET current_value = $1, progress_percent = $2,
            achieved = $3, achieved_at = CASE WHEN $3 AND NOT achieved THEN NOW() ELSE achieved_at END
        WHERE id = $4
      `, [currentValue, progressPercent, isNowAchieved, milestone.id]);

      milestone.current_value = currentValue;
      milestone.progress_percent = progressPercent;
      milestone.achieved = isNowAchieved;

      if (isNowAchieved && !wasAchieved) {
        milestone.achieved_at = new Date().toISOString();
        newlyAchieved.push(milestone);
      }

      updatedMilestones.push(milestone);
    }

    // Record learning events for newly achieved milestones
    for (const milestone of newlyAchieved) {
      await recordLearningEvent(context, 'milestone_reached', `Meilenstein erreicht: ${milestone.title}`, {
        description: `Du hast den Meilenstein "${milestone.title}" erreicht!`,
        impact_score: 0.8,
        icon: milestone.icon,
        color: 'gold',
        metadata: { milestone_type: milestoneType, level: milestone.milestone_level },
      });
    }

    return updatedMilestones;
  } catch (error) {
    logger.error('Failed to update milestone progress', error instanceof Error ? error : undefined);
    return [];
  }
}

// Default milestones for auto-seeding
const DEFAULT_MILESTONES: { type: string; level: number; title: string; threshold: number; icon: string }[] = [
  { type: 'ideas_count', level: 1, title: 'Erster Gedanke', threshold: 1, icon: '💡' },
  { type: 'ideas_count', level: 2, title: '10 Gedanken', threshold: 10, icon: '🧠' },
  { type: 'ideas_count', level: 3, title: '50 Gedanken', threshold: 50, icon: '🌟' },
  { type: 'ideas_count', level: 4, title: '100 Gedanken', threshold: 100, icon: '🏆' },
  { type: 'streak_days', level: 1, title: '3-Tage-Serie', threshold: 3, icon: '🔥' },
  { type: 'streak_days', level: 2, title: '7-Tage-Serie', threshold: 7, icon: '⚡' },
  { type: 'streak_days', level: 3, title: '30-Tage-Serie', threshold: 30, icon: '🌈' },
  { type: 'automations_count', level: 1, title: 'Erste Automation', threshold: 1, icon: '⚙️' },
  { type: 'automations_count', level: 2, title: '5 Automationen', threshold: 5, icon: '🤖' },
  { type: 'patterns_learned', level: 1, title: 'Erstes Muster', threshold: 1, icon: '🔗' },
  { type: 'patterns_learned', level: 2, title: '10 Muster', threshold: 10, icon: '🧩' },
  { type: 'profile_complete', level: 1, title: 'Profil 50%', threshold: 50, icon: '👤' },
  { type: 'profile_complete', level: 2, title: 'Profil 100%', threshold: 100, icon: '🎯' },
];

async function seedDefaultMilestones(context: AIContext): Promise<void> {
  for (const m of DEFAULT_MILESTONES) {
    await queryContext(context, `
      INSERT INTO evolution_milestones (id, context, milestone_type, milestone_level, title, threshold_value, icon, current_value, progress_percent, achieved)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 0, 0, false)
      ON CONFLICT DO NOTHING
    `, [uuidv4(), context, m.type, m.level, m.title, m.threshold, m.icon]);
  }
}

/**
 * Gets all milestones
 */
export async function getMilestones(context: AIContext): Promise<{
  achieved: Milestone[];
  upcoming: Milestone[];
  all: Milestone[];
}> {
  try {
    let result = await queryContext(context, `
      SELECT * FROM evolution_milestones
      WHERE context = $1
      ORDER BY milestone_type, milestone_level
    `, [context]);

    // Auto-seed if no milestones exist
    if (result.rows.length === 0) {
      await seedDefaultMilestones(context);
      result = await queryContext(context, `
        SELECT * FROM evolution_milestones
        WHERE context = $1
        ORDER BY milestone_type, milestone_level
      `, [context]);
    }

    const all = result.rows.map(mapRowToMilestone);
    const achieved = all.filter(m => m.achieved);
    const upcoming = all.filter(m => !m.achieved && m.progress_percent >= 25)
      .sort((a, b) => b.progress_percent - a.progress_percent);

    return { achieved, upcoming, all };
  } catch (e) {
    logger.warn('getMilestones failed', { error: e instanceof Error ? e.message : String(e) });
    return { achieved: [], upcoming: [], all: [] };
  }
}

// ===========================================
// Full Dashboard
// ===========================================

/**
 * Gets the complete evolution dashboard data
 */
export async function getEvolutionDashboard(context: AIContext): Promise<EvolutionDashboard> {
  try {
    // Ensure we have today's snapshot
    await createDailySnapshot(context);

    // Gather all data in parallel
    const [
      snapshot,
      timeline,
      trends,
      milestones,
      snapshots30d,
      totalExecutions,
      totalPatterns,
    ] = await Promise.all([
      getLatestSnapshot(context),
      getLearningTimeline(context, 20),
      getAccuracyTrends(context, 12),
      getMilestones(context),
      getSnapshots(context, 30),
      getTotalAutomationExecutions(context),
      getTotalPatternsLearned(context),
    ]);

    // Auto-update milestone progress from snapshot data (non-blocking)
    if (snapshot) {
      Promise.allSettled([
        updateMilestoneProgress(context, 'ideas_count', snapshot.total_ideas || 0),
        updateMilestoneProgress(context, 'streak_days', snapshot.active_days_streak || 0),
        updateMilestoneProgress(context, 'automations_count', snapshot.automations_active || 0),
        updateMilestoneProgress(context, 'patterns_learned', totalPatterns),
        updateMilestoneProgress(context, 'profile_complete', snapshot.profile_completeness || 0),
      ]).catch((err) => { logger.debug('Milestone update failed (non-critical)', { error: err instanceof Error ? err.message : String(err) }); });
    }

    // Calculate accuracy changes
    const accuracyChange7d = calculateAccuracyChange(snapshots30d, 7);
    const accuracyChange30d = calculateAccuracyChange(snapshots30d, 30);

    // Calculate total time saved (estimate: 2 min per automation execution)
    const totalTimeSaved = totalExecutions * 2;

    // Get active days count
    const totalDaysActive = await getTotalActiveDays(context);

    return {
      current_snapshot: snapshot,
      context_depth_score: snapshot?.context_depth_score || 0,
      ai_accuracy_score: snapshot?.ai_accuracy_score || 50,

      learning_timeline: timeline,
      recent_events_count: timeline.length,

      accuracy_trend: trends,
      accuracy_change_7d: accuracyChange7d,
      accuracy_change_30d: accuracyChange30d,

      snapshots_30d: snapshots30d.map(s => ({
        date: s.snapshot_date,
        accuracy_score: s.ai_accuracy_score,
        context_depth: s.context_depth_score,
        ideas_count: s.total_ideas,
      })),

      achieved_milestones: milestones.achieved,
      upcoming_milestones: milestones.upcoming.slice(0, 5),
      total_milestones_achieved: milestones.achieved.length,

      total_time_saved_minutes: totalTimeSaved,
      total_automations_executed: totalExecutions,
      total_patterns_learned: totalPatterns,

      active_days_streak: snapshot?.active_days_streak || 0,
      total_days_active: totalDaysActive,
    };
  } catch (error) {
    logger.error('Failed to get evolution dashboard', error instanceof Error ? error : undefined);

    // Return empty dashboard
    return {
      current_snapshot: null,
      context_depth_score: 0,
      ai_accuracy_score: 50,
      learning_timeline: [],
      recent_events_count: 0,
      accuracy_trend: [],
      accuracy_change_7d: 0,
      accuracy_change_30d: 0,
      snapshots_30d: [],
      achieved_milestones: [],
      upcoming_milestones: [],
      total_milestones_achieved: 0,
      total_time_saved_minutes: 0,
      total_automations_executed: 0,
      total_patterns_learned: 0,
      active_days_streak: 0,
      total_days_active: 0,
    };
  }
}

// ===========================================
// Helper Functions
// ===========================================

function calculateContextDepthScore(metrics: {
  profileCompleteness: number;
  patternsCount: number;
  totalInteractions: number;
  automationsActive: number;
}): number {
  // Profile: 0-25 points
  const profileScore = (metrics.profileCompleteness / 100) * 25;

  // Patterns: 0-25 points (max at 50 patterns)
  const patternsScore = Math.min(25, metrics.patternsCount * 0.5);

  // Interactions: 0-25 points (max at 1000 interactions)
  const interactionsScore = Math.min(25, metrics.totalInteractions * 0.025);

  // Automations: 0-25 points (max at 10 automations)
  const automationsScore = Math.min(25, metrics.automationsActive * 2.5);

  return Math.round(profileScore + patternsScore + interactionsScore + automationsScore);
}

async function calculateStreak(context: AIContext): Promise<number> {
  try {
    const result = await queryContext(context, `
      WITH daily_activity AS (
        SELECT DISTINCT DATE(created_at) as activity_date
        FROM interaction_events
        WHERE context = $1
        UNION
        SELECT DISTINCT DATE(created_at) as activity_date
        FROM ideas
        WHERE context = $1
      ),
      numbered AS (
        SELECT activity_date,
               activity_date - (ROW_NUMBER() OVER (ORDER BY activity_date DESC))::int as grp
        FROM daily_activity
        WHERE activity_date <= CURRENT_DATE
      )
      SELECT COUNT(*) as streak
      FROM numbered
      WHERE grp = (SELECT grp FROM numbered WHERE activity_date = CURRENT_DATE LIMIT 1)
    `, [context]);

    return parseInt(result.rows[0]?.streak || '0', 10);
  } catch (e) {
    logger.warn('calculateStreak failed', { error: e instanceof Error ? e.message : String(e) });
    return 0;
  }
}

async function getTotalAutomationExecutions(context: AIContext): Promise<number> {
  try {
    const result = await queryContext(context, `
      SELECT COUNT(*) as count FROM automation_executions ae
      JOIN automation_definitions ad ON ae.automation_id = ad.id
      WHERE ad.context = $1
    `, [context]);
    return parseInt(result.rows[0]?.count || '0', 10);
  } catch (e) {
    logger.warn('getTotalAutomationExecutions failed', { error: e instanceof Error ? e.message : String(e) });
    return 0;
  }
}

async function getTotalPatternsLearned(context: AIContext): Promise<number> {
  try {
    const result = await queryContext(context, `
      SELECT COUNT(*) as count FROM correction_patterns
      WHERE context = $1 AND is_active = true
    `, [context]);
    return parseInt(result.rows[0]?.count || '0', 10);
  } catch (e) {
    logger.warn('getTotalPatternsLearned failed', { error: e instanceof Error ? e.message : String(e) });
    return 0;
  }
}

async function getTotalActiveDays(context: AIContext): Promise<number> {
  try {
    const result = await queryContext(context, `
      SELECT COUNT(DISTINCT DATE(created_at)) as count
      FROM interaction_events
      WHERE context = $1
    `, [context]);
    return parseInt(result.rows[0]?.count || '0', 10);
  } catch (e) {
    logger.warn('getTotalActiveDays failed', { error: e instanceof Error ? e.message : String(e) });
    return 0;
  }
}

function calculateAccuracyChange(snapshots: EvolutionSnapshot[], days: number): number {
  if (snapshots.length < 2) {return 0;}

  const recent = snapshots[snapshots.length - 1];
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  const older = snapshots.find(s => new Date(s.snapshot_date) <= cutoffDate);
  if (!older) {return 0;}

  return Math.round((recent.ai_accuracy_score - older.ai_accuracy_score) * 10) / 10;
}

function getEventIcon(eventType: LearningEventType): string {
  const icons: Record<LearningEventType, string> = {
    pattern_learned: '🧠',
    preference_updated: '⚙️',
    accuracy_improved: '📈',
    milestone_reached: '🏆',
    automation_created: '⚡',
    automation_suggested: '💡',
    cluster_discovered: '🔗',
    topic_recognized: '🏷️',
    behavior_adapted: '🔄',
    profile_enriched: '👤',
    integration_connected: '🔌',
    weekly_summary: '📊',
  };
  return icons[eventType] || '📌';
}

function getEventColor(eventType: LearningEventType): string {
  const colors: Record<LearningEventType, string> = {
    pattern_learned: 'purple',
    preference_updated: 'blue',
    accuracy_improved: 'green',
    milestone_reached: 'gold',
    automation_created: 'orange',
    automation_suggested: 'cyan',
    cluster_discovered: 'pink',
    topic_recognized: 'teal',
    behavior_adapted: 'indigo',
    profile_enriched: 'violet',
    integration_connected: 'lime',
    weekly_summary: 'gray',
  };
  return colors[eventType] || 'blue';
}

function mapRowToSnapshot(row: Record<string, unknown>): EvolutionSnapshot {
  return {
    id: row.id as string,
    context: row.context as AIContext,
    snapshot_date: (row.snapshot_date as Date).toISOString().split('T')[0],
    total_ideas: parseInt(row.total_ideas as string, 10) || 0,
    total_corrections: parseInt(row.total_corrections as string, 10) || 0,
    total_interactions: parseInt(row.total_interactions as string, 10) || 0,
    total_automations: parseInt(row.total_automations as string, 10) || 0,
    correction_rate: parseFloat(row.correction_rate as string) || 0,
    ai_accuracy_score: parseFloat(row.ai_accuracy_score as string) || 50,
    context_depth_score: parseFloat(row.context_depth_score as string) || 0,
    profile_completeness: parseFloat(row.profile_completeness as string) || 0,
    learned_patterns_count: parseInt(row.learned_patterns_count as string, 10) || 0,
    learned_keywords_count: parseInt(row.learned_keywords_count as string, 10) || 0,
    automations_active: parseInt(row.automations_active as string, 10) || 0,
    automations_executed_today: parseInt(row.automations_executed_today as string, 10) || 0,
    automation_success_rate: parseFloat(row.automation_success_rate as string) || 0,
    estimated_time_saved_minutes: parseInt(row.estimated_time_saved_minutes as string, 10) || 0,
    active_days_streak: parseInt(row.active_days_streak as string, 10) || 0,
    ideas_created_today: parseInt(row.ideas_created_today as string, 10) || 0,
    feedback_given_today: parseInt(row.feedback_given_today as string, 10) || 0,
    created_at: (row.created_at as Date).toISOString(),
  };
}

function mapRowToEvent(row: Record<string, unknown>): LearningEvent {
  return {
    id: row.id as string,
    context: row.context as AIContext,
    event_type: row.event_type as LearningEventType,
    title: row.title as string,
    description: row.description as string | undefined,
    impact_score: parseFloat(row.impact_score as string) || 0.5,
    related_entity_type: row.related_entity_type as string | undefined,
    related_entity_id: row.related_entity_id as string | undefined,
    metadata: row.metadata as Record<string, unknown> || {},
    icon: row.icon as string || '📌',
    color: row.color as string || 'blue',
    created_at: (row.created_at as Date).toISOString(),
  };
}

function mapRowToMilestone(row: Record<string, unknown>): Milestone {
  return {
    id: row.id as string,
    context: row.context as AIContext,
    milestone_type: row.milestone_type as string,
    milestone_level: parseInt(row.milestone_level as string, 10) || 1,
    title: row.title as string,
    description: row.description as string | undefined,
    icon: row.icon as string || '🏆',
    threshold_value: parseInt(row.threshold_value as string, 10) || 0,
    achieved: row.achieved as boolean,
    achieved_at: row.achieved_at ? (row.achieved_at as Date).toISOString() : undefined,
    current_value: parseInt(row.current_value as string, 10) || 0,
    progress_percent: parseFloat(row.progress_percent as string) || 0,
  };
}
