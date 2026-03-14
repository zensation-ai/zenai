/**
 * Phase 20: Advanced Analytics Routes
 *
 * Provides comprehensive analytics and insights:
 * - Productivity trends
 * - Pattern analysis
 * - Goal tracking
 * - Historical comparisons
 */

import { Request, Response } from 'express';
import { queryContext, AIContext, isValidContext } from '../utils/database-context';
import { apiKeyAuth } from '../middleware/auth';
import { asyncHandler, ValidationError } from '../middleware/errorHandler';
import { analyticsRouter } from './analytics';
import { getUserId } from '../utils/user-context';

// ===========================================
// Productivity Dashboard
// ===========================================

/**
 * GET /api/:context/analytics/dashboard
 * Get comprehensive analytics dashboard data
 */
analyticsRouter.get('/:context/analytics/dashboard', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const { context } = req.params;
  const userId = getUserId(req);

  if (!isValidContext(context)) {
    throw new ValidationError('Invalid context. Use "personal", "work", "learning", or "creative".');
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
        WHERE is_archived = false AND user_id = $1
      `, [userId]),

      // Weekly trend (last 8 weeks)
      queryContext(ctx, `
        SELECT
          DATE_TRUNC('week', created_at) as week,
          COUNT(*) as count
        FROM ideas
        WHERE created_at > NOW() - INTERVAL '8 weeks' AND user_id = $1
        GROUP BY week
        ORDER BY week
      `, [userId]),

      // Monthly trend (last 6 months)
      queryContext(ctx, `
        SELECT
          DATE_TRUNC('month', created_at) as month,
          COUNT(*) as count
        FROM ideas
        WHERE created_at > NOW() - INTERVAL '6 months' AND user_id = $1
        GROUP BY month
        ORDER BY month
      `, [userId]),

      // Category trend over time
      queryContext(ctx, `
        SELECT
          DATE_TRUNC('week', created_at) as week,
          category,
          COUNT(*) as count
        FROM ideas
        WHERE created_at > NOW() - INTERVAL '4 weeks' AND user_id = $1
        GROUP BY week, category
        ORDER BY week, count DESC
      `, [userId]),

      // Goal progress
      queryContext(ctx, `
        WITH goals AS (
          SELECT daily_ideas_target, weekly_ideas_target
          FROM productivity_goals WHERE id = 1
        ),
        today_count AS (
          SELECT COUNT(*) as cnt FROM ideas
          WHERE DATE(created_at) = CURRENT_DATE AND is_archived = false AND user_id = $1
        ),
        week_count AS (
          SELECT COUNT(*) as cnt FROM ideas
          WHERE created_at > DATE_TRUNC('week', NOW()) AND is_archived = false AND user_id = $1
        )
        SELECT
          g.daily_ideas_target,
          g.weekly_ideas_target,
          COALESCE(t.cnt, 0) as today_count,
          COALESCE(w.cnt, 0) as week_count
        FROM goals g
        CROSS JOIN today_count t
        CROSS JOIN week_count w
      `, [userId]),

      // Streak calculation
      queryContext(ctx, `
        WITH daily AS (
          SELECT DISTINCT DATE(created_at) as date
          FROM ideas
          WHERE created_at > NOW() - INTERVAL '90 days' AND user_id = $1
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
      `, [userId]),

      // Hourly activity pattern
      queryContext(ctx, `
        SELECT
          EXTRACT(HOUR FROM created_at) as hour,
          COUNT(*) as count
        FROM ideas
        WHERE created_at > NOW() - INTERVAL '30 days' AND user_id = $1
        GROUP BY hour
        ORDER BY hour
      `, [userId]),

      // Recent highlights
      queryContext(ctx, `
        SELECT id, title, type, category, priority, created_at
        FROM ideas
        WHERE is_archived = false AND user_id = $1
          AND (priority = 'high' OR type = 'insight')
        ORDER BY created_at DESC
        LIMIT 5
      `, [userId])
    ]);

  const summaryRow = summary.rows[0];
  const goalRow = goalProgress.rows[0];
  const streakRow = streakInfo.rows[0] || { current_streak: 0, longest_streak: 0 };

  res.json({
    success: true,
    summary: {
      total: parseInt(summaryRow?.total || '0', 10),
      today: parseInt(summaryRow?.today || '0', 10),
      thisWeek: parseInt(summaryRow?.this_week || '0', 10),
      thisMonth: parseInt(summaryRow?.this_month || '0', 10),
      highPriority: parseInt(summaryRow?.high_priority || '0', 10)
    },
    goals: {
      daily: {
        target: parseInt(goalRow?.daily_ideas_target || '3', 10),
        current: parseInt(goalRow?.today_count || '0', 10),
        progress: Math.min(100, Math.round((parseInt(goalRow?.today_count || '0', 10) / parseInt(goalRow?.daily_ideas_target || '3', 10)) * 100))
      },
      weekly: {
        target: parseInt(goalRow?.weekly_ideas_target || '15', 10),
        current: parseInt(goalRow?.week_count || '0', 10),
        progress: Math.min(100, Math.round((parseInt(goalRow?.week_count || '0', 10) / parseInt(goalRow?.weekly_ideas_target || '15', 10)) * 100))
      }
    },
    streaks: {
      current: parseInt(streakRow.current_streak, 10),
      longest: parseInt(streakRow.longest_streak, 10)
    },
    trends: {
      weekly: weeklyTrend.rows.map(r => ({
        week: r.week,
        count: parseInt(r.count, 10)
      })),
      monthly: monthlyTrend.rows.map(r => ({
        month: r.month,
        count: parseInt(r.count, 10)
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
  });
}));

// ===========================================
// Productivity Score
// ===========================================

/**
 * GET /api/:context/analytics/productivity-score
 * Get current productivity score with breakdown
 */
analyticsRouter.get('/:context/analytics/productivity-score', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const { context } = req.params;
  const userId = getUserId(req);

  if (!isValidContext(context)) {
    throw new ValidationError('Invalid context. Use "personal", "work", "learning", or "creative".');
  }

  const ctx = context as AIContext;

    const [weeklyStats, consistency, variety, quality] = await Promise.all([
      // Weekly output
      queryContext(ctx, `
        SELECT COUNT(*) as count
        FROM ideas
        WHERE created_at > NOW() - INTERVAL '7 days'
          AND is_archived = false
          AND user_id = $1
      `, [userId]),

      // Consistency (days active this week)
      queryContext(ctx, `
        SELECT COUNT(DISTINCT DATE(created_at)) as active_days
        FROM ideas
        WHERE created_at > NOW() - INTERVAL '7 days'
          AND user_id = $1
      `, [userId]),

      // Variety (unique categories this week)
      queryContext(ctx, `
        SELECT COUNT(DISTINCT category) as categories
        FROM ideas
        WHERE created_at > NOW() - INTERVAL '7 days'
          AND user_id = $1
      `, [userId]),

      // Quality (high priority + insights ratio)
      queryContext(ctx, `
        SELECT
          COUNT(*) FILTER (WHERE priority = 'high' OR type = 'insight') as quality_count,
          COUNT(*) as total
        FROM ideas
        WHERE created_at > NOW() - INTERVAL '7 days'
          AND user_id = $1
      `, [userId])
    ]);

  const weeklyCount = parseInt(weeklyStats.rows[0]?.count || '0', 10);
  const activeDays = parseInt(consistency.rows[0]?.active_days || '0', 10);
  const categoryCount = parseInt(variety.rows[0]?.categories || '0', 10);
  const qualityCount = parseInt(quality.rows[0]?.quality_count || '0', 10);
  const totalCount = parseInt(quality.rows[0]?.total || '1', 10);

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
  });
}));

// ===========================================
// Pattern Analysis
// ===========================================

/**
 * GET /api/:context/analytics/patterns
 * Analyze patterns in idea creation
 */
analyticsRouter.get('/:context/analytics/patterns', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const { context } = req.params;
  const userId = getUserId(req);

  if (!isValidContext(context)) {
    throw new ValidationError('Invalid context. Use "personal", "work", "learning", or "creative".');
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
          AND user_id = $1
        GROUP BY hour
        ORDER BY count DESC
        LIMIT 3
      `, [userId]),

      // Peak days
      queryContext(ctx, `
        SELECT
          EXTRACT(DOW FROM created_at) as dow,
          COUNT(*) as count
        FROM ideas
        WHERE created_at > NOW() - INTERVAL '30 days'
          AND user_id = $1
        GROUP BY dow
        ORDER BY count DESC
        LIMIT 3
      `, [userId]),

      // Category preferences
      queryContext(ctx, `
        SELECT
          category,
          COUNT(*) as count,
          ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 1) as percentage
        FROM ideas
        WHERE created_at > NOW() - INTERVAL '30 days'
          AND user_id = $1
        GROUP BY category
        ORDER BY count DESC
      `, [userId]),

      // Type preferences
      queryContext(ctx, `
        SELECT
          type,
          COUNT(*) as count,
          ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 1) as percentage
        FROM ideas
        WHERE created_at > NOW() - INTERVAL '30 days'
          AND user_id = $1
        GROUP BY type
        ORDER BY count DESC
      `, [userId])
    ]);

  const dayNames = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

  res.json({
    success: true,
    peakTimes: {
      hours: peakHours.rows.map(r => ({
        hour: parseInt(r.hour, 10),
        label: `${r.hour}:00 - ${parseInt(r.hour, 10) + 1}:00`,
        count: parseInt(r.count, 10)
      })),
      days: peakDays.rows.map(r => ({
        day: parseInt(r.dow, 10),
        label: dayNames[parseInt(r.dow, 10)],
        count: parseInt(r.count, 10)
      }))
    },
    preferences: {
      categories: categoryPatterns.rows.map(r => ({
        name: r.category,
        count: parseInt(r.count, 10),
        percentage: parseFloat(r.percentage)
      })),
      types: typePatterns.rows.map(r => ({
        name: r.type,
        count: parseInt(r.count, 10),
        percentage: parseFloat(r.percentage)
      }))
    },
    insights: generatePatternInsights(peakHours.rows, peakDays.rows, categoryPatterns.rows, dayNames),
    period: 'last 30 days'
  });
}));

// ===========================================
// Comparison Analytics
// ===========================================

/**
 * GET /api/:context/analytics/comparison
 * Compare current period with previous period
 */
analyticsRouter.get('/:context/analytics/comparison', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const { context } = req.params;
  const { period = 'week' } = req.query;
  const userId = getUserId(req);

  if (!isValidContext(context)) {
    throw new ValidationError('Invalid context. Use "personal", "work", "learning", or "creative".');
  }

  const ctx = context as AIContext;

  // Validate period to prevent SQL injection - only allow known values
  const validPeriods: readonly string[] = ['week', 'month'];
  const safePeriod = validPeriods.includes(period as string) ? period : 'week';
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
          AND user_id = $2
      `, [intervalDays, userId]),
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
          AND user_id = $2
      `, [intervalDays, userId])
    ]);

  const defaultRow = { total: '0', high_priority: '0', tasks: '0', ideas: '0', active_days: '0' };
  const current = currentPeriod.rows[0] || defaultRow;
  const previous = previousPeriod.rows[0] || defaultRow;

  const calcChange = (curr: string, prev: string) => {
    const c = parseInt(curr || '0', 10);
    const p = parseInt(prev || '0', 10);
    if (p === 0) {return c > 0 ? 100 : 0;}
    return Math.round(((c - p) / p) * 100);
  };

  res.json({
    success: true,
    current: {
      total: parseInt(current.total, 10),
      highPriority: parseInt(current.high_priority, 10),
      tasks: parseInt(current.tasks, 10),
      ideas: parseInt(current.ideas, 10),
      activeDays: parseInt(current.active_days, 10)
    },
    previous: {
      total: parseInt(previous.total, 10),
      highPriority: parseInt(previous.high_priority, 10),
      tasks: parseInt(previous.tasks, 10),
      ideas: parseInt(previous.ideas, 10),
      activeDays: parseInt(previous.active_days, 10)
    },
    changes: {
      total: calcChange(current.total, previous.total),
      highPriority: calcChange(current.high_priority, previous.high_priority),
      tasks: calcChange(current.tasks, previous.tasks),
      ideas: calcChange(current.ideas, previous.ideas),
      activeDays: calcChange(current.active_days, previous.active_days)
    },
    period: safePeriod
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
      count: parseInt(row.count, 10)
    });
  });

  return result;
}

function fillHourlyGaps(rows: HourlyRow[]): { hour: number; count: number }[] {
  const hourMap = new Map<number, number>();
  rows.forEach(r => hourMap.set(parseInt(r.hour, 10), parseInt(r.count, 10)));

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
    const topHour = parseInt(peakHours[0].hour, 10);
    insights.push(`Deine produktivste Zeit ist zwischen ${topHour}:00 und ${topHour + 1}:00 Uhr`);
  }

  if (peakDays.length > 0) {
    const topDay = dayNames[parseInt(peakDays[0].dow, 10)];
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
