/**
 * Phase 20: Advanced Analytics Routes
 *
 * Provides comprehensive analytics and insights:
 * - Productivity trends
 * - Pattern analysis
 * - Goal tracking
 * - Historical comparisons
 */

import { Router, Request, Response } from 'express';
import { queryContext, AIContext, isValidContext } from '../utils/database-context';
import { logger } from '../utils/logger';
import { apiKeyAuth } from '../middleware/auth';
import { asyncHandler, ValidationError, NotFoundError, ConflictError } from '../middleware/errorHandler';

export const advancedAnalyticsRouter = Router();

// ===========================================
// Productivity Dashboard
// ===========================================

/**
 * GET /api/:context/analytics/dashboard
 * Get comprehensive analytics dashboard data
 */
advancedAnalyticsRouter.get('/:context/analytics/dashboard', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const { context } = req.params;

  if (!isValidContext(context)) {
    throw new ValidationError('Context must be "personal" or "work"');
  }

  const ctx = context as AIContext;

    const [
      summary,
      weeklyTrend,
      monthlyTrend,
      categoryTrend,
      goalProgress,
      streakInfo,
      hourlyActivity,
      recentHighlights
    ] = await Promise.all([
      // Summary stats
      queryContext(ctx, `
        SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 day') as today,
          COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') as this_week,
          COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days') as this_month,
          COUNT(*) FILTER (WHERE priority = 'high' AND is_archived = false) as high_priority
        FROM ideas
        WHERE is_archived = false
      `),

      // Weekly trend (last 8 weeks)
      queryContext(ctx, `
        SELECT
          DATE_TRUNC('week', created_at) as week,
          COUNT(*) as count
        FROM ideas
        WHERE created_at > NOW() - INTERVAL '8 weeks'
        GROUP BY week
        ORDER BY week
      `),

      // Monthly trend (last 6 months)
      queryContext(ctx, `
        SELECT
          DATE_TRUNC('month', created_at) as month,
          COUNT(*) as count
        FROM ideas
        WHERE created_at > NOW() - INTERVAL '6 months'
        GROUP BY month
        ORDER BY month
      `),

      // Category trend over time
      queryContext(ctx, `
        SELECT
          DATE_TRUNC('week', created_at) as week,
          category,
          COUNT(*) as count
        FROM ideas
        WHERE created_at > NOW() - INTERVAL '4 weeks'
        GROUP BY week, category
        ORDER BY week, count DESC
      `),

      // Goal progress
      queryContext(ctx, `
        WITH goals AS (
          SELECT daily_ideas_target, weekly_ideas_target
          FROM productivity_goals WHERE id = 1
        ),
        today_count AS (
          SELECT COUNT(*) as cnt FROM ideas
          WHERE DATE(created_at) = CURRENT_DATE AND is_archived = false
        ),
        week_count AS (
          SELECT COUNT(*) as cnt FROM ideas
          WHERE created_at > DATE_TRUNC('week', NOW()) AND is_archived = false
        )
        SELECT
          g.daily_ideas_target,
          g.weekly_ideas_target,
          COALESCE(t.cnt, 0) as today_count,
          COALESCE(w.cnt, 0) as week_count
        FROM goals g
        CROSS JOIN today_count t
        CROSS JOIN week_count w
      `),

      // Streak calculation
      queryContext(ctx, `
        WITH daily AS (
          SELECT DISTINCT DATE(created_at) as date
          FROM ideas
          WHERE created_at > NOW() - INTERVAL '90 days'
          ORDER BY date DESC
        ),
        numbered AS (
          SELECT date, ROW_NUMBER() OVER (ORDER BY date DESC) as rn
          FROM daily
        ),
        gaps AS (
          SELECT date, date - (rn || ' days')::INTERVAL as grp
          FROM numbered
        ),
        streaks AS (
          SELECT grp, COUNT(*) as streak_length, MAX(date) as end_date
          FROM gaps
          GROUP BY grp
        )
        SELECT
          COALESCE(streak_length, 0) as current_streak,
          COALESCE((SELECT MAX(streak_length) FROM streaks), 0) as longest_streak
        FROM streaks
        WHERE end_date = (SELECT MAX(date) FROM daily)
        LIMIT 1
      `),

      // Hourly activity pattern
      queryContext(ctx, `
        SELECT
          EXTRACT(HOUR FROM created_at) as hour,
          COUNT(*) as count
        FROM ideas
        WHERE created_at > NOW() - INTERVAL '30 days'
        GROUP BY hour
        ORDER BY hour
      `),

      // Recent highlights
      queryContext(ctx, `
        SELECT id, title, type, category, priority, created_at
        FROM ideas
        WHERE is_archived = false
          AND (priority = 'high' OR type = 'insight')
        ORDER BY created_at DESC
        LIMIT 5
      `)
    ]);

  const summaryRow = summary.rows[0];
  const goalRow = goalProgress.rows[0];
  const streakRow = streakInfo.rows[0] || { current_streak: 0, longest_streak: 0 };

  res.json({
    success: true,
    data: {
      summary: {
        total: parseInt(summaryRow?.total || '0'),
        today: parseInt(summaryRow?.today || '0'),
        thisWeek: parseInt(summaryRow?.this_week || '0'),
        thisMonth: parseInt(summaryRow?.this_month || '0'),
        highPriority: parseInt(summaryRow?.high_priority || '0')
      },
      goals: {
        daily: {
          target: parseInt(goalRow?.daily_ideas_target || '3'),
          current: parseInt(goalRow?.today_count || '0'),
          progress: Math.min(100, Math.round((parseInt(goalRow?.today_count || '0') / parseInt(goalRow?.daily_ideas_target || '3')) * 100))
        },
        weekly: {
          target: parseInt(goalRow?.weekly_ideas_target || '15'),
          current: parseInt(goalRow?.week_count || '0'),
          progress: Math.min(100, Math.round((parseInt(goalRow?.week_count || '0') / parseInt(goalRow?.weekly_ideas_target || '15')) * 100))
        }
      },
      streaks: {
        current: parseInt(streakRow.current_streak),
        longest: parseInt(streakRow.longest_streak)
      },
      trends: {
        weekly: weeklyTrend.rows.map(r => ({
          week: r.week,
          count: parseInt(r.count)
        })),
        monthly: monthlyTrend.rows.map(r => ({
          month: r.month,
          count: parseInt(r.count)
        })),
        byCategory: formatCategoryTrend(categoryTrend.rows)
      },
      activity: {
        byHour: fillHourlyGaps(hourlyActivity.rows)
      },
      highlights: recentHighlights.rows.map(r => ({
        id: r.id,
        title: r.title,
        type: r.type,
        category: r.category,
        priority: r.priority,
        createdAt: r.created_at
      })),
      generatedAt: new Date().toISOString()
    }
  });
}));

// ===========================================
// Productivity Score
// ===========================================

/**
 * GET /api/:context/analytics/productivity-score
 * Get current productivity score with breakdown
 */
advancedAnalyticsRouter.get('/:context/analytics/productivity-score', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const { context } = req.params;

  if (!isValidContext(context)) {
    throw new ValidationError('Context must be "personal" or "work"');
  }

  const ctx = context as AIContext;

    const [weeklyStats, consistency, variety, quality] = await Promise.all([
      // Weekly output
      queryContext(ctx, `
        SELECT COUNT(*) as count
        FROM ideas
        WHERE created_at > NOW() - INTERVAL '7 days'
          AND is_archived = false
      `),

      // Consistency (days active this week)
      queryContext(ctx, `
        SELECT COUNT(DISTINCT DATE(created_at)) as active_days
        FROM ideas
        WHERE created_at > NOW() - INTERVAL '7 days'
      `),

      // Variety (unique categories this week)
      queryContext(ctx, `
        SELECT COUNT(DISTINCT category) as categories
        FROM ideas
        WHERE created_at > NOW() - INTERVAL '7 days'
      `),

      // Quality (high priority + insights ratio)
      queryContext(ctx, `
        SELECT
          COUNT(*) FILTER (WHERE priority = 'high' OR type = 'insight') as quality_count,
          COUNT(*) as total
        FROM ideas
        WHERE created_at > NOW() - INTERVAL '7 days'
      `)
    ]);

  const weeklyCount = parseInt(weeklyStats.rows[0]?.count || '0');
  const activeDays = parseInt(consistency.rows[0]?.active_days || '0');
  const categoryCount = parseInt(variety.rows[0]?.categories || '0');
  const qualityCount = parseInt(quality.rows[0]?.quality_count || '0');
  const totalCount = parseInt(quality.rows[0]?.total || '1');

  // Calculate scores (0-100)
  const outputScore = Math.min(100, (weeklyCount / 15) * 100);
  const consistencyScore = Math.min(100, (activeDays / 7) * 100);
  const varietyScore = Math.min(100, (categoryCount / 4) * 100);
  const qualityScore = Math.min(100, (qualityCount / totalCount) * 100 * 2);

  const overallScore = Math.round(
    (outputScore * 0.4) +
    (consistencyScore * 0.3) +
    (varietyScore * 0.15) +
    (qualityScore * 0.15)
  );

  res.json({
    success: true,
    data: {
      overall: overallScore,
      breakdown: {
        output: {
          score: Math.round(outputScore),
          label: 'Produktivität',
          description: `${weeklyCount} Gedanken diese Woche`,
          weight: 40
        },
        consistency: {
          score: Math.round(consistencyScore),
          label: 'Konsistenz',
          description: `${activeDays} von 7 Tagen aktiv`,
          weight: 30
        },
        variety: {
          score: Math.round(varietyScore),
          label: 'Vielfalt',
          description: `${categoryCount} verschiedene Kategorien`,
          weight: 15
        },
        quality: {
          score: Math.round(qualityScore),
          label: 'Qualität',
          description: `${qualityCount} hochwertige Einträge`,
          weight: 15
        }
      },
      trend: overallScore >= 70 ? 'excellent' : overallScore >= 50 ? 'good' : overallScore >= 30 ? 'moderate' : 'needs_improvement',
      period: 'last 7 days'
    }
  });
}));

// ===========================================
// Pattern Analysis
// ===========================================

/**
 * GET /api/:context/analytics/patterns
 * Analyze patterns in idea creation
 */
advancedAnalyticsRouter.get('/:context/analytics/patterns', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const { context } = req.params;

  if (!isValidContext(context)) {
    throw new ValidationError('Context must be "personal" or "work"');
  }

  const ctx = context as AIContext;

    const [peakHours, peakDays, categoryPatterns, typePatterns] = await Promise.all([
      // Peak hours
      queryContext(ctx, `
        SELECT
          EXTRACT(HOUR FROM created_at) as hour,
          COUNT(*) as count
        FROM ideas
        WHERE created_at > NOW() - INTERVAL '30 days'
        GROUP BY hour
        ORDER BY count DESC
        LIMIT 3
      `),

      // Peak days
      queryContext(ctx, `
        SELECT
          EXTRACT(DOW FROM created_at) as dow,
          COUNT(*) as count
        FROM ideas
        WHERE created_at > NOW() - INTERVAL '30 days'
        GROUP BY dow
        ORDER BY count DESC
        LIMIT 3
      `),

      // Category preferences
      queryContext(ctx, `
        SELECT
          category,
          COUNT(*) as count,
          ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 1) as percentage
        FROM ideas
        WHERE created_at > NOW() - INTERVAL '30 days'
        GROUP BY category
        ORDER BY count DESC
      `),

      // Type preferences
      queryContext(ctx, `
        SELECT
          type,
          COUNT(*) as count,
          ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 1) as percentage
        FROM ideas
        WHERE created_at > NOW() - INTERVAL '30 days'
        GROUP BY type
        ORDER BY count DESC
      `)
    ]);

  const dayNames = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

  res.json({
    success: true,
    data: {
      peakTimes: {
        hours: peakHours.rows.map(r => ({
          hour: parseInt(r.hour),
          label: `${r.hour}:00 - ${parseInt(r.hour) + 1}:00`,
          count: parseInt(r.count)
        })),
        days: peakDays.rows.map(r => ({
          day: parseInt(r.dow),
          label: dayNames[parseInt(r.dow)],
          count: parseInt(r.count)
        }))
      },
      preferences: {
        categories: categoryPatterns.rows.map(r => ({
          name: r.category,
          count: parseInt(r.count),
          percentage: parseFloat(r.percentage)
        })),
        types: typePatterns.rows.map(r => ({
          name: r.type,
          count: parseInt(r.count),
          percentage: parseFloat(r.percentage)
        }))
      },
      insights: generatePatternInsights(peakHours.rows, peakDays.rows, categoryPatterns.rows, dayNames),
      period: 'last 30 days'
    }
  });
}));

// ===========================================
// Comparison Analytics
// ===========================================

/**
 * GET /api/:context/analytics/comparison
 * Compare current period with previous period
 */
advancedAnalyticsRouter.get('/:context/analytics/comparison', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const { context } = req.params;
  const { period = 'week' } = req.query;

  if (!isValidContext(context)) {
    throw new ValidationError('Context must be "personal" or "work"');
  }

  const ctx = context as AIContext;

  // Validate period to prevent SQL injection - only allow known values
  const validPeriods = ['week', 'month'] as const;
  const safePeriod = validPeriods.includes(period as any) ? period : 'week';
  const intervalDays = safePeriod === 'month' ? 30 : 7;

    const [currentPeriod, previousPeriod] = await Promise.all([
      queryContext(ctx, `
        SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE priority = 'high') as high_priority,
          COUNT(*) FILTER (WHERE type = 'task') as tasks,
          COUNT(*) FILTER (WHERE type = 'idea') as ideas,
          COUNT(DISTINCT DATE(created_at)) as active_days
        FROM ideas
        WHERE created_at > NOW() - INTERVAL '1 day' * $1
          AND is_archived = false
      `, [intervalDays]),
      queryContext(ctx, `
        SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE priority = 'high') as high_priority,
          COUNT(*) FILTER (WHERE type = 'task') as tasks,
          COUNT(*) FILTER (WHERE type = 'idea') as ideas,
          COUNT(DISTINCT DATE(created_at)) as active_days
        FROM ideas
        WHERE created_at > NOW() - INTERVAL '1 day' * $1 * 2
          AND created_at <= NOW() - INTERVAL '1 day' * $1
          AND is_archived = false
      `, [intervalDays])
    ]);

  const current = currentPeriod.rows[0];
  const previous = previousPeriod.rows[0];

  const calcChange = (curr: string, prev: string) => {
    const c = parseInt(curr || '0');
    const p = parseInt(prev || '0');
    if (p === 0) {return c > 0 ? 100 : 0;}
    return Math.round(((c - p) / p) * 100);
  };

  res.json({
    success: true,
    data: {
      current: {
        total: parseInt(current.total),
        highPriority: parseInt(current.high_priority),
        tasks: parseInt(current.tasks),
        ideas: parseInt(current.ideas),
        activeDays: parseInt(current.active_days)
      },
      previous: {
        total: parseInt(previous.total),
        highPriority: parseInt(previous.high_priority),
        tasks: parseInt(previous.tasks),
        ideas: parseInt(previous.ideas),
        activeDays: parseInt(previous.active_days)
      },
      changes: {
        total: calcChange(current.total, previous.total),
        highPriority: calcChange(current.high_priority, previous.high_priority),
        tasks: calcChange(current.tasks, previous.tasks),
        ideas: calcChange(current.ideas, previous.ideas),
        activeDays: calcChange(current.active_days, previous.active_days)
      },
      period: safePeriod
    }
  });
}));

// ===========================================
// Helper Functions
// ===========================================

// Type-safe row interfaces for analytics queries
interface CategoryTrendRow { category: string; week: string; count: string }
interface HourlyRow { hour: string; count: string }
interface WeekTrendItem { week: string; count: number }
interface PeakHourRow { hour: string; count: string }
interface PeakDayRow { dow: string; count: string }
interface CategoryRow { category: string; count: string; percentage: string }

function formatCategoryTrend(rows: CategoryTrendRow[]): Record<string, WeekTrendItem[]> {
  const result: Record<string, WeekTrendItem[]> = {};

  rows.forEach(row => {
    const category = row.category;
    if (!result[category]) {
      result[category] = [];
    }
    result[category].push({
      week: row.week,
      count: parseInt(row.count)
    });
  });

  return result;
}

function fillHourlyGaps(rows: HourlyRow[]): { hour: number; count: number }[] {
  const hourMap = new Map<number, number>();
  rows.forEach(r => hourMap.set(parseInt(r.hour), parseInt(r.count)));

  return Array.from({ length: 24 }, (_, hour) => ({
    hour,
    count: hourMap.get(hour) || 0
  }));
}

function generatePatternInsights(
  peakHours: PeakHourRow[],
  peakDays: PeakDayRow[],
  categories: CategoryRow[],
  dayNames: string[]
): string[] {
  const insights: string[] = [];

  if (peakHours.length > 0) {
    const topHour = parseInt(peakHours[0].hour);
    insights.push(`Deine produktivste Zeit ist zwischen ${topHour}:00 und ${topHour + 1}:00 Uhr`);
  }

  if (peakDays.length > 0) {
    const topDay = dayNames[parseInt(peakDays[0].dow)];
    insights.push(`${topDay} ist dein aktivster Tag`);
  }

  if (categories.length > 0) {
    const topCategory = categories[0].category;
    insights.push(`Dein Fokus liegt auf "${topCategory}" (${categories[0].percentage}% deiner Gedanken)`);
  }

  if (categories.length >= 3) {
    insights.push('Du hast eine gute Vielfalt an Kategorien');
  }

  return insights;
}
