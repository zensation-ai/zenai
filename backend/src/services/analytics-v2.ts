/**
 * Phase 50: Analytics V2 Service
 *
 * Enhanced analytics with custom date ranges, trend analysis,
 * productivity insights, and period comparison.
 */

import { queryContext, AIContext } from '../utils/database-context';
import { logger } from '../utils/logger';

// ===========================================
// Types
// ===========================================

export interface AnalyticsOverview {
  ideas: { total: number; created: number; completed: number; trend: number };
  tasks: { total: number; completed: number; inProgress: number; trend: number };
  chats: { total: number; messages: number; avgDuration: number; trend: number };
  documents: { total: number; uploaded: number; trend: number };
}

export interface TrendDataPoint {
  date: string;
  value: number;
  label?: string;
}

export interface TrendData {
  ideas: TrendDataPoint[];
  tasks: TrendDataPoint[];
  chats: TrendDataPoint[];
}

export interface ProductivityInsight {
  taskCompletionRate: number;
  avgTaskDuration: number; // hours
  mostProductiveHour: number;
  focusTimeMinutes: number;
  contextSwitches: number;
}

export interface PeriodComparison {
  period1: AnalyticsOverview;
  period2: AnalyticsOverview;
  changes: {
    ideas: number;
    tasks: number;
    chats: number;
    documents: number;
  };
}

type Granularity = 'day' | 'week' | 'month';

// ===========================================
// Helper: Calculate trend percentage
// ===========================================

function calcTrend(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

// ===========================================
// Helper: Date trunc expression for granularity
// ===========================================

const VALID_GRANULARITIES: ReadonlySet<string> = new Set(['day', 'week', 'month']);

function dateTrunc(granularity: Granularity, column: string): string {
  if (!VALID_GRANULARITIES.has(granularity)) {
    throw new Error(`Invalid granularity: ${granularity}`);
  }
  return `DATE_TRUNC('${granularity}', ${column})`;
}

// ===========================================
// Helper: Calculate previous period
// ===========================================

function getPreviousPeriod(from: string, to: string): { from: string; to: string } {
  const fromDate = new Date(from);
  const toDate = new Date(to);
  const durationMs = toDate.getTime() - fromDate.getTime();
  const prevTo = new Date(fromDate.getTime() - 1); // day before 'from'
  const prevFrom = new Date(prevTo.getTime() - durationMs);
  return {
    from: prevFrom.toISOString().split('T')[0],
    to: prevTo.toISOString().split('T')[0],
  };
}

// ===========================================
// getOverview
// ===========================================

export async function getOverview(
  context: AIContext,
  from: string,
  to: string
): Promise<AnalyticsOverview> {
  const prev = getPreviousPeriod(from, to);

  // Current period counts
  const [ideasCur, tasksCur, chatsCur, docsCur] = await Promise.all([
    queryContext(context, `
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE created_at >= $1 AND created_at <= $2) AS created,
        COUNT(*) FILTER (WHERE status = 'completed' AND updated_at >= $1 AND updated_at <= $2) AS completed
      FROM ideas
      WHERE created_at <= $2
    `, [from, to]),

    queryContext(context, `
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE status = 'done') AS completed,
        COUNT(*) FILTER (WHERE status = 'in_progress') AS in_progress
      FROM tasks
      WHERE created_at <= $2
    `, [to]),

    queryContext(context, `
      SELECT
        COUNT(*) AS total,
        COALESCE(SUM(message_count), 0) AS messages,
        COALESCE(AVG(EXTRACT(EPOCH FROM (updated_at - created_at)) / 60), 0) AS avg_duration
      FROM general_chat_sessions
      WHERE created_at >= $1 AND created_at <= $2
    `, [from, to]),

    queryContext(context, `
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE created_at >= $1 AND created_at <= $2) AS uploaded
      FROM documents
      WHERE created_at <= $2
    `, [from, to]),
  ]);

  // Previous period counts (for trend)
  const [ideasPrev, tasksPrev, chatsPrev, docsPrev] = await Promise.all([
    queryContext(context, `
      SELECT COUNT(*) AS created
      FROM ideas
      WHERE created_at >= $1 AND created_at <= $2
    `, [prev.from, prev.to]),

    queryContext(context, `
      SELECT COUNT(*) FILTER (WHERE status = 'done') AS completed
      FROM tasks
      WHERE updated_at >= $1 AND updated_at <= $2
    `, [prev.from, prev.to]),

    queryContext(context, `
      SELECT COUNT(*) AS total
      FROM general_chat_sessions
      WHERE created_at >= $1 AND created_at <= $2
    `, [prev.from, prev.to]),

    queryContext(context, `
      SELECT COUNT(*) AS uploaded
      FROM documents
      WHERE created_at >= $1 AND created_at <= $2
    `, [prev.from, prev.to]),
  ]);

  const ideasRow = ideasCur.rows[0] || {};
  const tasksRow = tasksCur.rows[0] || {};
  const chatsRow = chatsCur.rows[0] || {};
  const docsRow = docsCur.rows[0] || {};

  const ideasCreated = parseInt(ideasRow.created || '0', 10);
  const ideasPrevCreated = parseInt(ideasPrev.rows[0]?.created || '0', 10);
  const tasksCompleted = parseInt(tasksRow.completed || '0', 10);
  const tasksPrevCompleted = parseInt(tasksPrev.rows[0]?.completed || '0', 10);
  const chatsTotal = parseInt(chatsRow.total || '0', 10);
  const chatsPrevTotal = parseInt(chatsPrev.rows[0]?.total || '0', 10);
  const docsUploaded = parseInt(docsRow.uploaded || '0', 10);
  const docsPrevUploaded = parseInt(docsPrev.rows[0]?.uploaded || '0', 10);

  return {
    ideas: {
      total: parseInt(ideasRow.total || '0', 10),
      created: ideasCreated,
      completed: parseInt(ideasRow.completed || '0', 10),
      trend: calcTrend(ideasCreated, ideasPrevCreated),
    },
    tasks: {
      total: parseInt(tasksRow.total || '0', 10),
      completed: tasksCompleted,
      inProgress: parseInt(tasksRow.in_progress || '0', 10),
      trend: calcTrend(tasksCompleted, tasksPrevCompleted),
    },
    chats: {
      total: chatsTotal,
      messages: parseInt(chatsRow.messages || '0', 10),
      avgDuration: parseFloat(chatsRow.avg_duration || '0'),
      trend: calcTrend(chatsTotal, chatsPrevTotal),
    },
    documents: {
      total: parseInt(docsRow.total || '0', 10),
      uploaded: docsUploaded,
      trend: calcTrend(docsUploaded, docsPrevUploaded),
    },
  };
}

// ===========================================
// getTrends
// ===========================================

export async function getTrends(
  context: AIContext,
  from: string,
  to: string,
  granularity: Granularity = 'day'
): Promise<TrendData> {
  const trunc = dateTrunc(granularity, 'created_at');

  const [ideasResult, tasksResult, chatsResult] = await Promise.all([
    queryContext(context, `
      SELECT ${trunc} AS date, COUNT(*) AS value
      FROM ideas
      WHERE created_at >= $1 AND created_at <= $2
      GROUP BY date
      ORDER BY date
    `, [from, to]),

    queryContext(context, `
      SELECT ${trunc} AS date, COUNT(*) AS value
      FROM tasks
      WHERE created_at >= $1 AND created_at <= $2
      GROUP BY date
      ORDER BY date
    `, [from, to]),

    queryContext(context, `
      SELECT ${trunc} AS date, COUNT(*) AS value
      FROM general_chat_sessions
      WHERE created_at >= $1 AND created_at <= $2
      GROUP BY date
      ORDER BY date
    `, [from, to]),
  ]);

  const mapRows = (rows: Array<{ date: string; value: string }>): TrendDataPoint[] =>
    rows.map(r => ({
      date: new Date(r.date).toISOString().split('T')[0],
      value: parseInt(r.value, 10),
    }));

  return {
    ideas: mapRows(ideasResult.rows),
    tasks: mapRows(tasksResult.rows),
    chats: mapRows(chatsResult.rows),
  };
}

// ===========================================
// getProductivityInsights
// ===========================================

export async function getProductivityInsights(
  context: AIContext,
  from: string,
  to: string
): Promise<ProductivityInsight> {
  const [completionResult, hourResult, focusResult, switchResult] = await Promise.all([
    // Task completion rate and avg duration
    queryContext(context, `
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE status = 'done') AS completed,
        COALESCE(
          AVG(EXTRACT(EPOCH FROM (updated_at - created_at)) / 3600)
          FILTER (WHERE status = 'done'),
          0
        ) AS avg_duration_hours
      FROM tasks
      WHERE created_at >= $1 AND created_at <= $2
    `, [from, to]),

    // Most productive hour (by ideas created)
    queryContext(context, `
      SELECT EXTRACT(HOUR FROM created_at)::int AS hour, COUNT(*) AS cnt
      FROM ideas
      WHERE created_at >= $1 AND created_at <= $2
      GROUP BY hour
      ORDER BY cnt DESC
      LIMIT 1
    `, [from, to]),

    // Focus time: total chat minutes
    queryContext(context, `
      SELECT COALESCE(
        SUM(EXTRACT(EPOCH FROM (updated_at - created_at)) / 60),
        0
      ) AS focus_minutes
      FROM general_chat_sessions
      WHERE created_at >= $1 AND created_at <= $2
    `, [from, to]),

    // Context switches: count of distinct sessions per day, averaged
    queryContext(context, `
      SELECT COALESCE(AVG(daily_sessions), 0) AS avg_switches
      FROM (
        SELECT DATE(created_at) AS day, COUNT(*) AS daily_sessions
        FROM general_chat_sessions
        WHERE created_at >= $1 AND created_at <= $2
        GROUP BY day
      ) sub
    `, [from, to]),
  ]);

  const compRow = completionResult.rows[0] || {};
  const totalTasks = parseInt(compRow.total || '0', 10);
  const completedTasks = parseInt(compRow.completed || '0', 10);

  return {
    taskCompletionRate: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
    avgTaskDuration: parseFloat(compRow.avg_duration_hours || '0'),
    mostProductiveHour: hourResult.rows[0] ? parseInt(hourResult.rows[0].hour, 10) : 9,
    focusTimeMinutes: parseFloat(focusResult.rows[0]?.focus_minutes || '0'),
    contextSwitches: parseFloat(switchResult.rows[0]?.avg_switches || '0'),
  };
}

// ===========================================
// getComparison
// ===========================================

export async function getComparison(
  context: AIContext,
  period1: { from: string; to: string },
  period2: { from: string; to: string }
): Promise<PeriodComparison> {
  logger.info('Analytics V2: Comparing periods', {
    context,
    period1,
    period2,
  });

  const [p1, p2] = await Promise.all([
    getOverview(context, period1.from, period1.to),
    getOverview(context, period2.from, period2.to),
  ]);

  return {
    period1: p1,
    period2: p2,
    changes: {
      ideas: calcTrend(p1.ideas.created, p2.ideas.created),
      tasks: calcTrend(p1.tasks.completed, p2.tasks.completed),
      chats: calcTrend(p1.chats.total, p2.chats.total),
      documents: calcTrend(p1.documents.uploaded, p2.documents.uploaded),
    },
  };
}
