/**
 * Phase 10: Analytics Routes
 *
 * Provides usage statistics and insights:
 * - Ideas per day/week/month
 * - Category distribution
 * - Voice memo processing stats
 * - User engagement metrics
 */

import { Router, Request, Response } from 'express';
import { QueryResult } from 'pg';
import { queryContext, AIContext, isValidContext } from '../utils/database-context';
import { apiKeyAuth } from '../middleware/auth';
import { asyncHandler, ValidationError } from '../middleware/errorHandler';
import { toInt } from '../utils/validation';
import { getRecentAIActivities, getUnreadActivityCount } from '../services/ai-activity-logger';
import { logger } from '../utils/logger';

export const analyticsRouter = Router();

// ===========================================
// Types
// ===========================================

interface _TimeRangeStats {
  period: string;
  count: number;
  categories: Record<string, number>;
  types: Record<string, number>;
  priorities: Record<string, number>;
}

interface _EngagementStats {
  avgIdeasPerDay: number;
  mostActiveHour: number;
  mostActiveDay: string;
  streakDays: number;
}

// ===========================================
// Overview Stats
// ===========================================

/**
 * GET /api/:context/analytics/overview
 * Get overall analytics overview
 */
analyticsRouter.get('/:context/analytics/overview', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const { context } = req.params;

  if (!isValidContext(context)) {
    throw new ValidationError('Invalid context. Use "personal", "work", "learning", or "creative".');
  }

  const ctx = context as AIContext;

  // Get all stats in parallel
  const [
    totalStats,
    recentStats,
    categoryStats,
    typeStats,
    priorityStats,
    dailyTrend,
  ] = await Promise.all([
    // Total counts
    queryContext(ctx, `
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE is_archived = false) as active,
        COUNT(*) FILTER (WHERE is_archived = true) as archived,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') as last_week,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days') as last_month
      FROM ideas
    `),

    // Recent activity (last 24h)
    queryContext(ctx, `
      SELECT
        COUNT(*) as created,
        COUNT(*) FILTER (WHERE updated_at != created_at) as updated
      FROM ideas
      WHERE created_at > NOW() - INTERVAL '24 hours'
         OR updated_at > NOW() - INTERVAL '24 hours'
    `),

    // Category distribution
    queryContext(ctx, `
      SELECT category, COUNT(*) as count
      FROM ideas
      WHERE is_archived = false
      GROUP BY category
      ORDER BY count DESC
    `),

    // Type distribution
    queryContext(ctx, `
      SELECT type, COUNT(*) as count
      FROM ideas
      WHERE is_archived = false
      GROUP BY type
      ORDER BY count DESC
    `),

    // Priority distribution
    queryContext(ctx, `
      SELECT priority, COUNT(*) as count
      FROM ideas
      WHERE is_archived = false
      GROUP BY priority
      ORDER BY count DESC
    `),

    // Daily trend (last 14 days)
    queryContext(ctx, `
      SELECT
        DATE(created_at) as date,
        COUNT(*) as count
      FROM ideas
      WHERE created_at > NOW() - INTERVAL '14 days'
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `),
  ]);

  const total = totalStats.rows[0];
  const recent = recentStats.rows[0];

  res.json({
    success: true,
    summary: {
      total: toInt(total.total),
      active: toInt(total.active),
      archived: toInt(total.archived),
      lastWeek: toInt(total.last_week),
      lastMonth: toInt(total.last_month),
    },
    recentActivity: {
      created: toInt(recent.created),
      updated: toInt(recent.updated),
      period: '24 hours',
    },
    distribution: {
      byCategory: categoryStats.rows.reduce((acc: Record<string, number>, r: { category: string; count: string }) => ({ ...acc, [r.category]: toInt(r.count) }), {}),
      byType: typeStats.rows.reduce((acc: Record<string, number>, r: { type: string; count: string }) => ({ ...acc, [r.type]: toInt(r.count) }), {}),
      byPriority: priorityStats.rows.reduce((acc: Record<string, number>, r: { priority: string; count: string }) => ({ ...acc, [r.priority]: toInt(r.count) }), {}),
    },
    dailyTrend: dailyTrend.rows.map((r: { date: string; count: string }) => ({
      date: r.date,
      count: toInt(r.count),
    })),
    generatedAt: new Date().toISOString(),
  });
}));

// ===========================================
// Time-based Analytics
// ===========================================

/**
 * GET /api/:context/analytics/timeline
 * Get timeline-based analytics
 */
analyticsRouter.get('/:context/analytics/timeline', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const { context } = req.params;
  const { period = 'week' } = req.query;

  if (!isValidContext(context)) {
    throw new ValidationError('Invalid context. Use "personal", "work", "learning", or "creative".');
  }

  // Whitelist-based interval mapping (prevents SQL injection)
  const intervalDaysMap: Record<string, number> = {
    day: 1,
    week: 7,
    month: 30,
    year: 365,
  };

  const intervalDays = intervalDaysMap[period as string] || 7;
  const intervalLabel = `${intervalDays} days`;

  const ctx = context as AIContext;

  // Hourly breakdown (parameterized query)
  const hourlyResult = await queryContext(ctx, `
    SELECT
      EXTRACT(HOUR FROM created_at) as hour,
      COUNT(*) as count
    FROM ideas
    WHERE created_at > NOW() - MAKE_INTERVAL(days => $1)
    GROUP BY hour
    ORDER BY hour
  `, [intervalDays]);

  // Day of week breakdown (parameterized query)
  const dowResult = await queryContext(ctx, `
    SELECT
      EXTRACT(DOW FROM created_at) as dow,
      COUNT(*) as count
    FROM ideas
    WHERE created_at > NOW() - MAKE_INTERVAL(days => $1)
    GROUP BY dow
    ORDER BY dow
  `, [intervalDays]);

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  res.json({
    success: true,
    period,
    interval: intervalLabel,
    byHour: hourlyResult.rows.map((r: { hour: string; count: string }) => ({
      hour: toInt(r.hour),
      count: toInt(r.count),
    })),
    byDayOfWeek: dowResult.rows.map((r: { dow: string; count: string }) => ({
      day: dayNames[toInt(r.dow)],
      dayIndex: toInt(r.dow),
      count: toInt(r.count),
    })),
    insights: generateInsights(hourlyResult.rows, dowResult.rows, dayNames),
  });
}));

// ===========================================
// Engagement Metrics
// ===========================================

/**
 * GET /api/:context/analytics/engagement
 * Get user engagement metrics
 */
analyticsRouter.get('/:context/analytics/engagement', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const { context } = req.params;

  if (!isValidContext(context)) {
    throw new ValidationError('Invalid context. Use "personal", "work", "learning", or "creative".');
  }

  const ctx = context as AIContext;

  const [avgDaily, streak, processing] = await Promise.all([
    // Average ideas per day (last 30 days)
    queryContext(ctx, `
      SELECT
        COUNT(*)::float / GREATEST(1, COUNT(DISTINCT DATE(created_at))) as avg_per_day
      FROM ideas
      WHERE created_at > NOW() - INTERVAL '30 days'
    `),

    // Current streak (consecutive days with at least 1 idea)
    queryContext(ctx, `
      WITH daily AS (
        SELECT DISTINCT DATE(created_at) as date
        FROM ideas
        WHERE created_at > NOW() - INTERVAL '90 days'
        ORDER BY date DESC
      ),
      streak AS (
        SELECT date,
               date - (ROW_NUMBER() OVER (ORDER BY date DESC))::int AS grp
        FROM daily
      )
      SELECT COUNT(*) as streak_days
      FROM streak
      WHERE grp = (SELECT grp FROM streak ORDER BY date DESC LIMIT 1)
    `),

    // Processing stats (voice memo -> structured idea)
    queryContext(ctx, `
      SELECT
        COUNT(*) as total_processed,
        AVG(EXTRACT(EPOCH FROM (updated_at - created_at))) as avg_processing_time_sec
      FROM ideas
      WHERE created_at > NOW() - INTERVAL '30 days'
        AND type != 'note'
    `),
  ]);

  res.json({
    success: true,
    avgIdeasPerDay: parseFloat(avgDaily.rows[0]?.avg_per_day || '0').toFixed(2),
    currentStreak: toInt(streak.rows[0]?.streak_days),
    processing: {
      totalProcessed: toInt(processing.rows[0]?.total_processed),
      avgProcessingTime: parseFloat(processing.rows[0]?.avg_processing_time_sec || '0').toFixed(2) + 's',
    },
    period: '30 days',
  });
}));

// ===========================================
// Helper Functions
// ===========================================

interface HourlyDataRow {
  hour: string;
  count: string;
}

interface DowDataRow {
  dow: string;
  count: string;
}

function generateInsights(
  hourlyData: HourlyDataRow[],
  dowData: DowDataRow[],
  dayNames: string[]
): string[] {
  const insights: string[] = [];

  // Find peak hour
  if (hourlyData.length > 0) {
    const peakHour = hourlyData.reduce((max, r) =>
      toInt(r.count) > toInt(max.count) ? r : max
    );
    insights.push(`Most active hour: ${peakHour.hour}:00 - ${toInt(peakHour.hour) + 1}:00`);
  }

  // Find peak day
  if (dowData.length > 0) {
    const peakDay = dowData.reduce((max, r) =>
      toInt(r.count) > toInt(max.count) ? r : max
    );
    insights.push(`Most active day: ${dayNames[toInt(peakDay.dow)]}`);
  }

  // Calculate weekend vs weekday ratio
  if (dowData.length > 0) {
    const weekendCount = dowData
      .filter(r => [0, 6].includes(toInt(r.dow)))
      .reduce((sum, r) => sum + toInt(r.count), 0);
    const weekdayCount = dowData
      .filter(r => ![0, 6].includes(toInt(r.dow)))
      .reduce((sum, r) => sum + toInt(r.count), 0);

    if (weekdayCount > 0) {
      const ratio = (weekendCount / weekdayCount * 100).toFixed(0);
      insights.push(`Weekend activity: ${ratio}% of weekday activity`);
    }
  }

  return insights;
}

// ===========================================
// Dashboard Summary (aggregated endpoint)
// ===========================================

/**
 * GET /api/:context/analytics/dashboard-summary
 * Aggregated data for the Dashboard page — single call instead of 3 parallel ones.
 * Returns: stats, streak, 7-day trend, recent ideas, AI activity
 */
analyticsRouter.get('/:context/analytics/dashboard-summary', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const { context } = req.params;

  if (!isValidContext(context)) {
    throw new ValidationError('Invalid context. Use "personal", "work", "learning", or "creative".');
  }

  const ctx = context as AIContext;

  // Wrap each query to be resilient - one failure shouldn't crash the whole dashboard
  const safeQuery = async (query: Promise<QueryResult>, fallback: QueryResult): Promise<QueryResult> => {
    try { return await query; } catch (err) {
      logger.warn('Dashboard summary query failed', { context: ctx, error: err instanceof Error ? err.message : String(err) });
      return fallback;
    }
  };

  const emptyResult: QueryResult = { rows: [], command: '', rowCount: 0, oid: 0, fields: [] };

  const [statsResult, streakResult, trendResult, recentIdeasResult, activities, unreadCount] = await Promise.all([
    // Stats: total, thisWeek, highPriority, todayCount
    safeQuery(queryContext(ctx, `
      SELECT
        COUNT(*) FILTER (WHERE is_archived = false) as total,
        COUNT(*) FILTER (WHERE is_archived = false AND created_at > NOW() - INTERVAL '7 days') as this_week,
        COUNT(*) FILTER (WHERE is_archived = false AND created_at > NOW() - INTERVAL '24 hours') as today,
        COUNT(*) FILTER (WHERE is_archived = false AND priority = 'high') as high_priority
      FROM ideas
    `), emptyResult),

    // Streak: consecutive days with at least 1 idea
    safeQuery(queryContext(ctx, `
      WITH daily AS (
        SELECT DISTINCT DATE(created_at) as date
        FROM ideas
        WHERE created_at > NOW() - INTERVAL '90 days'
        ORDER BY date DESC
      ),
      streak AS (
        SELECT date,
               date - (ROW_NUMBER() OVER (ORDER BY date DESC))::int AS grp
        FROM daily
      )
      SELECT COUNT(*) as streak_days
      FROM streak
      WHERE grp = (SELECT grp FROM streak ORDER BY date DESC LIMIT 1)
    `), emptyResult),

    // 7-day trend (count per day)
    safeQuery(queryContext(ctx, `
      SELECT
        DATE(created_at) as date,
        COUNT(*) as count
      FROM ideas
      WHERE created_at > NOW() - INTERVAL '7 days'
        AND is_archived = false
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `), emptyResult),

    // Recent 6 ideas
    safeQuery(queryContext(ctx, `
      SELECT id, title, type, priority, created_at
      FROM ideas
      WHERE is_archived = false
      ORDER BY created_at DESC
      LIMIT 6
    `), emptyResult),

    // Recent 5 AI activities
    getRecentAIActivities(ctx, 5),

    // Unread activity count (avoids separate /ai-activity request from frontend)
    getUnreadActivityCount(ctx),
  ]);

  const stats = statsResult.rows[0];

  res.json({
    success: true,
    stats: {
      total: toInt(stats?.total),
      thisWeek: toInt(stats?.this_week),
      todayCount: toInt(stats?.today),
      highPriority: toInt(stats?.high_priority),
    },
    streak: toInt(streakResult.rows[0]?.streak_days),
    trend: trendResult.rows.map((r: { date: string; count: string }) => ({
      date: r.date,
      count: toInt(r.count),
    })),
    recentIdeas: recentIdeasResult.rows,
    activities,
    unreadCount,
    context,
  });
}));
