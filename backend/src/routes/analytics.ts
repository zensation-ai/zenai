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
import { queryContext, AIContext, isValidContext } from '../utils/database-context';
import { logger } from '../utils/logger';
import { apiKeyAuth } from '../middleware/auth';
import { asyncHandler, ValidationError, NotFoundError, ConflictError } from '../middleware/errorHandler';

export const analyticsRouter = Router();

// ===========================================
// Types
// ===========================================

interface TimeRangeStats {
  period: string;
  count: number;
  categories: Record<string, number>;
  types: Record<string, number>;
  priorities: Record<string, number>;
}

interface EngagementStats {
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
    throw new ValidationError('Context must be "personal" or "work"');
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
    data: {
      summary: {
        total: parseInt(total.total),
        active: parseInt(total.active),
        archived: parseInt(total.archived),
        lastWeek: parseInt(total.last_week),
        lastMonth: parseInt(total.last_month),
      },
      recentActivity: {
        created: parseInt(recent.created),
        updated: parseInt(recent.updated),
        period: '24 hours',
      },
      distribution: {
        byCategory: categoryStats.rows.reduce((acc, r) => ({ ...acc, [r.category]: parseInt(r.count) }), {}),
        byType: typeStats.rows.reduce((acc, r) => ({ ...acc, [r.type]: parseInt(r.count) }), {}),
        byPriority: priorityStats.rows.reduce((acc, r) => ({ ...acc, [r.priority]: parseInt(r.count) }), {}),
      },
      dailyTrend: dailyTrend.rows.map(r => ({
        date: r.date,
        count: parseInt(r.count),
      })),
      generatedAt: new Date().toISOString(),
    },
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
    throw new ValidationError('Context must be "personal" or "work"');
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
    data: {
      period,
      interval: intervalLabel,
      byHour: hourlyResult.rows.map(r => ({
        hour: parseInt(r.hour),
        count: parseInt(r.count),
      })),
      byDayOfWeek: dowResult.rows.map(r => ({
        day: dayNames[parseInt(r.dow)],
        dayIndex: parseInt(r.dow),
        count: parseInt(r.count),
      })),
      insights: generateInsights(hourlyResult.rows, dowResult.rows, dayNames),
    },
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
    throw new ValidationError('Context must be "personal" or "work"');
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
    data: {
      avgIdeasPerDay: parseFloat(avgDaily.rows[0]?.avg_per_day || '0').toFixed(2),
      currentStreak: parseInt(streak.rows[0]?.streak_days || '0'),
      processing: {
        totalProcessed: parseInt(processing.rows[0]?.total_processed || '0'),
        avgProcessingTime: parseFloat(processing.rows[0]?.avg_processing_time_sec || '0').toFixed(2) + 's',
      },
      period: '30 days',
    },
  });
}));

// ===========================================
// Helper Functions
// ===========================================

function generateInsights(
  hourlyData: any[],
  dowData: any[],
  dayNames: string[]
): string[] {
  const insights: string[] = [];

  // Find peak hour
  if (hourlyData.length > 0) {
    const peakHour = hourlyData.reduce((max, r) =>
      parseInt(r.count) > parseInt(max.count) ? r : max
    );
    insights.push(`Most active hour: ${peakHour.hour}:00 - ${parseInt(peakHour.hour) + 1}:00`);
  }

  // Find peak day
  if (dowData.length > 0) {
    const peakDay = dowData.reduce((max, r) =>
      parseInt(r.count) > parseInt(max.count) ? r : max
    );
    insights.push(`Most active day: ${dayNames[parseInt(peakDay.dow)]}`);
  }

  // Calculate weekend vs weekday ratio
  if (dowData.length > 0) {
    const weekendCount = dowData
      .filter(r => [0, 6].includes(parseInt(r.dow)))
      .reduce((sum, r) => sum + parseInt(r.count), 0);
    const weekdayCount = dowData
      .filter(r => ![0, 6].includes(parseInt(r.dow)))
      .reduce((sum, r) => sum + parseInt(r.count), 0);

    if (weekdayCount > 0) {
      const ratio = (weekendCount / weekdayCount * 100).toFixed(0);
      insights.push(`Weekend activity: ${ratio}% of weekday activity`);
    }
  }

  return insights;
}
