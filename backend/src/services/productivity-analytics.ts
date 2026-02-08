/**
 * Productivity Analytics Service
 *
 * Provides ROI-focused metrics that show concrete value:
 * - Time saved estimates based on AI-assisted actions
 * - Activity heatmap (weekday × hour)
 * - Knowledge growth tracking
 * - Streak tracking with detailed history
 * - Weekly report card generation
 *
 * Wharton 2025: 72% of leaders measure AI ROI formally but only 23%
 * can prove it with data. This service bridges that gap.
 *
 * @module services/productivity-analytics
 */

import { AIContext, queryContext } from '../utils/database-context';
import { logger } from '../utils/logger';

// ===========================================
// Types
// ===========================================

/**
 * Time saved estimation based on AI-assisted actions
 */
export interface TimeSavedMetrics {
  /** Total estimated hours saved this week */
  weeklyHoursSaved: number;
  /** Total estimated hours saved this month */
  monthlyHoursSaved: number;
  /** Breakdown by activity type */
  breakdown: {
    draftsAccepted: { count: number; hoursSaved: number };
    aiSearches: { count: number; hoursSaved: number };
    autoCategories: { count: number; hoursSaved: number };
    voiceMemos: { count: number; hoursSaved: number };
  };
}

/**
 * Activity heatmap data (7 days × 24 hours)
 */
export interface ActivityHeatmap {
  /** 7×24 grid: [dayOfWeek][hour] = count */
  grid: number[][];
  /** Peak activity slot */
  peak: { day: number; hour: number; count: number };
  /** Day labels (German) */
  dayLabels: string[];
  /** Total data points */
  totalDataPoints: number;
}

/**
 * Knowledge growth metrics
 */
export interface KnowledgeGrowth {
  totalIdeas: number;
  totalConnections: number;
  totalTopics: number;
  /** Growth over last 30 days */
  ideasLast30Days: number;
  connectionsLast30Days: number;
  /** Growth rate (ideas per week average) */
  weeklyGrowthRate: number;
}

/**
 * Streak information
 */
export interface StreakInfo {
  currentStreak: number;
  longestStreak: number;
  lastActiveDate: string | null;
  /** Is the user active today? */
  activeToday: boolean;
}

/**
 * Weekly report card
 */
export interface WeeklyReportCard {
  /** Period covered */
  period: { start: string; end: string };
  /** Key stats */
  ideasCreated: number;
  chatMessages: number;
  /** Top 3 topics of the week */
  topTopics: string[];
  /** Productivity trend vs last week */
  trend: 'improving' | 'stable' | 'declining';
  trendPercentage: number;
  /** AI insight/suggestion */
  insight: string;
}

/**
 * Complete productivity dashboard data
 */
export interface ProductivityDashboardData {
  timeSaved: TimeSavedMetrics;
  heatmap: ActivityHeatmap;
  knowledgeGrowth: KnowledgeGrowth;
  streak: StreakInfo;
  weeklyReport: WeeklyReportCard;
}

// ===========================================
// Constants
// ===========================================

/** Estimated minutes saved per activity type */
const TIME_ESTIMATES = {
  DRAFT_MINUTES: 15,        // Writing a draft from scratch vs AI-assisted
  SEARCH_MINUTES: 3,        // Manual search vs AI retrieval
  AUTO_CATEGORY_MINUTES: 2, // Manual categorization vs auto
  VOICE_MEMO_MINUTES: 5,    // Typing vs voice-to-text
};

const DAY_LABELS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

// ===========================================
// Service Functions
// ===========================================

/**
 * Get complete productivity dashboard data
 */
export async function getProductivityDashboard(
  context: AIContext
): Promise<ProductivityDashboardData> {
  const [timeSaved, heatmap, knowledgeGrowth, streak, weeklyReport] = await Promise.all([
    getTimeSavedMetrics(context),
    getActivityHeatmap(context),
    getKnowledgeGrowth(context),
    getStreakInfo(context),
    getWeeklyReport(context),
  ]);

  return { timeSaved, heatmap, knowledgeGrowth, streak, weeklyReport };
}

/**
 * Calculate time saved through AI assistance
 */
export async function getTimeSavedMetrics(context: AIContext): Promise<TimeSavedMetrics> {
  try {
    // Drafts accepted this week/month
    const draftsResult = await queryContext(context, `
      SELECT
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days') as weekly_drafts,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') as monthly_drafts
      FROM draft_suggestions
      WHERE context = $1 AND status = 'accepted'
    `, [context]);

    // AI-assisted searches (chat sessions with RAG)
    const searchesResult = await queryContext(context, `
      SELECT
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days') as weekly_searches,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') as monthly_searches
      FROM general_chat_messages
      WHERE session_id IN (
        SELECT id FROM general_chat_sessions WHERE context = $1
      )
      AND role = 'user'
    `, [context]);

    // Auto-categorized ideas
    const categoriesResult = await queryContext(context, `
      SELECT
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days') as weekly_auto,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') as monthly_auto
      FROM ideas
      WHERE context = $1 AND category IS NOT NULL
    `, [context]);

    // Voice memos processed
    const voiceResult = await queryContext(context, `
      SELECT
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days') as weekly_voice,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') as monthly_voice
      FROM ideas
      WHERE context = $1 AND source = 'voice'
    `, [context]);

    const weeklyDrafts = parseInt(draftsResult.rows[0]?.weekly_drafts || '0');
    const monthlyDrafts = parseInt(draftsResult.rows[0]?.monthly_drafts || '0');
    const weeklySearches = parseInt(searchesResult.rows[0]?.weekly_searches || '0');
    const monthlySearches = parseInt(searchesResult.rows[0]?.monthly_searches || '0');
    const weeklyAuto = parseInt(categoriesResult.rows[0]?.weekly_auto || '0');
    const monthlyAuto = parseInt(categoriesResult.rows[0]?.monthly_auto || '0');
    const weeklyVoice = parseInt(voiceResult.rows[0]?.weekly_voice || '0');
    const monthlyVoice = parseInt(voiceResult.rows[0]?.monthly_voice || '0');

    const weeklyHoursSaved = (
      weeklyDrafts * TIME_ESTIMATES.DRAFT_MINUTES +
      weeklySearches * TIME_ESTIMATES.SEARCH_MINUTES +
      weeklyAuto * TIME_ESTIMATES.AUTO_CATEGORY_MINUTES +
      weeklyVoice * TIME_ESTIMATES.VOICE_MEMO_MINUTES
    ) / 60;

    const monthlyHoursSaved = (
      monthlyDrafts * TIME_ESTIMATES.DRAFT_MINUTES +
      monthlySearches * TIME_ESTIMATES.SEARCH_MINUTES +
      monthlyAuto * TIME_ESTIMATES.AUTO_CATEGORY_MINUTES +
      monthlyVoice * TIME_ESTIMATES.VOICE_MEMO_MINUTES
    ) / 60;

    return {
      weeklyHoursSaved: Math.round(weeklyHoursSaved * 10) / 10,
      monthlyHoursSaved: Math.round(monthlyHoursSaved * 10) / 10,
      breakdown: {
        draftsAccepted: {
          count: weeklyDrafts,
          hoursSaved: Math.round(weeklyDrafts * TIME_ESTIMATES.DRAFT_MINUTES / 60 * 10) / 10,
        },
        aiSearches: {
          count: weeklySearches,
          hoursSaved: Math.round(weeklySearches * TIME_ESTIMATES.SEARCH_MINUTES / 60 * 10) / 10,
        },
        autoCategories: {
          count: weeklyAuto,
          hoursSaved: Math.round(weeklyAuto * TIME_ESTIMATES.AUTO_CATEGORY_MINUTES / 60 * 10) / 10,
        },
        voiceMemos: {
          count: weeklyVoice,
          hoursSaved: Math.round(weeklyVoice * TIME_ESTIMATES.VOICE_MEMO_MINUTES / 60 * 10) / 10,
        },
      },
    };
  } catch (error) {
    logger.warn('Failed to calculate time saved metrics', { error });
    return {
      weeklyHoursSaved: 0,
      monthlyHoursSaved: 0,
      breakdown: {
        draftsAccepted: { count: 0, hoursSaved: 0 },
        aiSearches: { count: 0, hoursSaved: 0 },
        autoCategories: { count: 0, hoursSaved: 0 },
        voiceMemos: { count: 0, hoursSaved: 0 },
      },
    };
  }
}

/**
 * Generate activity heatmap from idea creation timestamps
 */
export async function getActivityHeatmap(context: AIContext): Promise<ActivityHeatmap> {
  try {
    const result = await queryContext(context, `
      SELECT
        EXTRACT(DOW FROM created_at) as day_of_week,
        EXTRACT(HOUR FROM created_at) as hour_of_day,
        COUNT(*) as count
      FROM ideas
      WHERE context = $1
        AND created_at >= NOW() - INTERVAL '90 days'
      GROUP BY EXTRACT(DOW FROM created_at), EXTRACT(HOUR FROM created_at)
      ORDER BY day_of_week, hour_of_day
    `, [context]);

    // Initialize 7x24 grid with zeros
    const grid: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
    let peak = { day: 0, hour: 0, count: 0 };
    let totalDataPoints = 0;

    for (const row of result.rows) {
      const day = parseInt(row.day_of_week as string);
      const hour = parseInt(row.hour_of_day as string);
      const count = parseInt(row.count as string);
      grid[day][hour] = count;
      totalDataPoints += count;

      if (count > peak.count) {
        peak = { day, hour, count };
      }
    }

    return { grid, peak, dayLabels: DAY_LABELS, totalDataPoints };
  } catch (error) {
    logger.warn('Failed to generate activity heatmap', { error });
    return {
      grid: Array.from({ length: 7 }, () => Array(24).fill(0)),
      peak: { day: 0, hour: 0, count: 0 },
      dayLabels: DAY_LABELS,
      totalDataPoints: 0,
    };
  }
}

/**
 * Get knowledge growth metrics
 */
export async function getKnowledgeGrowth(context: AIContext): Promise<KnowledgeGrowth> {
  try {
    const [ideasResult, connectionsResult, topicsResult, recentResult] = await Promise.all([
      queryContext(context, `
        SELECT COUNT(*) as total FROM ideas WHERE context = $1 AND is_archived = false
      `, [context]),
      queryContext(context, `
        SELECT COUNT(*) as total FROM idea_relations WHERE context = $1
      `, [context]),
      queryContext(context, `
        SELECT COUNT(DISTINCT topic_id) as total FROM idea_topics
      `, []),
      queryContext(context, `
        SELECT
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') as ideas_30d,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days') as ideas_7d
        FROM ideas WHERE context = $1 AND is_archived = false
      `, [context]),
    ]);

    const totalIdeas = parseInt(ideasResult.rows[0]?.total || '0');
    const totalConnections = parseInt(connectionsResult.rows[0]?.total || '0');
    const totalTopics = parseInt(topicsResult.rows[0]?.total || '0');
    const ideasLast30Days = parseInt(recentResult.rows[0]?.ideas_30d || '0');
    const ideasLast7Days = parseInt(recentResult.rows[0]?.ideas_7d || '0');

    // Connections in last 30 days
    let connectionsLast30Days = 0;
    try {
      const recentConnections = await queryContext(context, `
        SELECT COUNT(*) as total FROM idea_relations
        WHERE context = $1 AND created_at >= NOW() - INTERVAL '30 days'
      `, [context]);
      connectionsLast30Days = parseInt(recentConnections.rows[0]?.total || '0');
    } catch {
      // idea_relations might not have created_at column
    }

    return {
      totalIdeas,
      totalConnections,
      totalTopics,
      ideasLast30Days,
      connectionsLast30Days,
      weeklyGrowthRate: Math.round(ideasLast7Days * 10) / 10,
    };
  } catch (error) {
    logger.warn('Failed to get knowledge growth metrics', { error });
    return {
      totalIdeas: 0, totalConnections: 0, totalTopics: 0,
      ideasLast30Days: 0, connectionsLast30Days: 0, weeklyGrowthRate: 0,
    };
  }
}

/**
 * Get streak information
 */
export async function getStreakInfo(context: AIContext): Promise<StreakInfo> {
  try {
    const result = await queryContext(context, `
      SELECT DISTINCT DATE(created_at) as active_date
      FROM ideas
      WHERE context = $1
      ORDER BY active_date DESC
      LIMIT 365
    `, [context]);

    if (result.rows.length === 0) {
      return { currentStreak: 0, longestStreak: 0, lastActiveDate: null, activeToday: false };
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const dates = result.rows.map((r: Record<string, unknown>) => {
      const d = new Date(r.active_date as string);
      d.setHours(0, 0, 0, 0);
      return d;
    });

    const activeToday = dates[0].getTime() === today.getTime();

    // Calculate current streak
    let currentStreak = 0;
    const checkDate = new Date(today);

    // If not active today, check if yesterday was active (streak still counts)
    if (!activeToday) {
      checkDate.setDate(checkDate.getDate() - 1);
    }

    for (const date of dates) {
      if (date.getTime() === checkDate.getTime()) {
        currentStreak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else if (date.getTime() < checkDate.getTime()) {
        break;
      }
    }

    // Calculate longest streak
    let longestStreak = 0;
    let tempStreak = 1;
    for (let i = 1; i < dates.length; i++) {
      const diff = (dates[i - 1].getTime() - dates[i].getTime()) / (1000 * 60 * 60 * 24);
      if (Math.round(diff) === 1) {
        tempStreak++;
      } else {
        longestStreak = Math.max(longestStreak, tempStreak);
        tempStreak = 1;
      }
    }
    longestStreak = Math.max(longestStreak, tempStreak);

    return {
      currentStreak,
      longestStreak,
      lastActiveDate: dates[0].toISOString().split('T')[0],
      activeToday,
    };
  } catch (error) {
    logger.warn('Failed to get streak info', { error });
    return { currentStreak: 0, longestStreak: 0, lastActiveDate: null, activeToday: false };
  }
}

/**
 * Generate weekly report card
 */
export async function getWeeklyReport(context: AIContext): Promise<WeeklyReportCard> {
  try {
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7)); // Monday
    weekStart.setHours(0, 0, 0, 0);

    const prevWeekStart = new Date(weekStart);
    prevWeekStart.setDate(prevWeekStart.getDate() - 7);

    // Ideas created this week vs last week
    const ideasResult = await queryContext(context, `
      SELECT
        COUNT(*) FILTER (WHERE created_at >= $2) as this_week,
        COUNT(*) FILTER (WHERE created_at >= $3 AND created_at < $2) as last_week
      FROM ideas
      WHERE context = $1
    `, [context, weekStart.toISOString(), prevWeekStart.toISOString()]);

    // Chat messages this week
    const chatResult = await queryContext(context, `
      SELECT COUNT(*) as count
      FROM general_chat_messages
      WHERE session_id IN (SELECT id FROM general_chat_sessions WHERE context = $1)
        AND role = 'user'
        AND created_at >= $2
    `, [context, weekStart.toISOString()]);

    // Top topics this week
    const topicsResult = await queryContext(context, `
      SELECT t.name, COUNT(*) as count
      FROM idea_topics it
      JOIN topics t ON t.id = it.topic_id
      JOIN ideas i ON i.id = it.idea_id
      WHERE i.context = $1 AND i.created_at >= $2
      GROUP BY t.name
      ORDER BY count DESC
      LIMIT 3
    `, [context, weekStart.toISOString()]);

    const thisWeek = parseInt(ideasResult.rows[0]?.this_week || '0');
    const lastWeek = parseInt(ideasResult.rows[0]?.last_week || '0');
    const chatMessages = parseInt(chatResult.rows[0]?.count || '0');
    const topTopics = topicsResult.rows.map((r: Record<string, unknown>) => r.name as string);

    // Calculate trend
    let trend: 'improving' | 'stable' | 'declining' = 'stable';
    let trendPercentage = 0;
    if (lastWeek > 0) {
      trendPercentage = Math.round(((thisWeek - lastWeek) / lastWeek) * 100);
      if (trendPercentage > 10) trend = 'improving';
      else if (trendPercentage < -10) trend = 'declining';
    } else if (thisWeek > 0) {
      trend = 'improving';
      trendPercentage = 100;
    }

    // Generate simple insight
    let insight = 'Weiter so! Konsistentes Arbeiten baut Wissen auf.';
    if (trend === 'improving') {
      insight = `Starke Woche! ${trendPercentage}% mehr Ideen als letzte Woche.`;
    } else if (trend === 'declining') {
      insight = 'Ruhigere Woche - manchmal braucht man Raum zum Nachdenken.';
    }
    if (topTopics.length > 0) {
      insight += ` Dein Fokus lag auf: ${topTopics.join(', ')}.`;
    }

    return {
      period: {
        start: weekStart.toISOString().split('T')[0],
        end: now.toISOString().split('T')[0],
      },
      ideasCreated: thisWeek,
      chatMessages,
      topTopics,
      trend,
      trendPercentage,
      insight,
    };
  } catch (error) {
    logger.warn('Failed to generate weekly report', { error });
    return {
      period: { start: '', end: '' },
      ideasCreated: 0,
      chatMessages: 0,
      topTopics: [],
      trend: 'stable',
      trendPercentage: 0,
      insight: 'Report konnte nicht erstellt werden.',
    };
  }
}
