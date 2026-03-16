/**
 * Business Narrative Service (Phase 96)
 *
 * Generates AI business narratives by aggregating cross-context data sources.
 * All narrative generation is heuristic/template-based (NOT Claude API calls).
 */

import { AIContext, queryContext } from '../utils/database-context';
import { logger } from '../utils/logger';

// ===========================================
// Types
// ===========================================

export type NarrativeType = 'daily' | 'weekly' | 'anomaly';
export type TrendDirection = 'up' | 'down' | 'stable';
export type KPIAggregation = 'sum' | 'avg' | 'count' | 'max' | 'min';

export interface NarrativeSection {
  title: string;
  icon: string;
  narrative: string;
  metrics: MetricPoint[];
  actionItems: string[];
  anomalies: AnomalyInfo[];
}

export interface MetricPoint {
  label: string;
  value: number;
  previousValue?: number;
  unit?: string;
  trend: TrendDirection;
  changePercent: number;
}

export interface AnomalyInfo {
  metric: string;
  value: number;
  expected: number;
  deviation: number;
  severity: 'warning' | 'critical';
  description: string;
}

export interface DailyDigest {
  date: string;
  sections: NarrativeSection[];
  overallNarrative: string;
  actionItems: string[];
  anomalyCount: number;
}

export interface WeeklyReport {
  periodStart: string;
  periodEnd: string;
  sections: NarrativeSection[];
  overallNarrative: string;
  contextComparison: ContextComparison[];
  trendSummary: TrendSummary[];
}

export interface ContextComparison {
  context: string;
  taskCompletion: number;
  emailActivity: number;
  ideaCount: number;
}

export interface TrendSummary {
  metric: string;
  direction: TrendDirection;
  changePercent: number;
  sparkline: number[];
}

export interface CustomKPI {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  formula: KPIFormula;
  targetValue: number | null;
  currentValue: number | null;
  unit: string | null;
  trend: TrendDirection;
  lastCalculatedAt: string | null;
  createdAt: string;
}

export interface KPIFormula {
  sources: string[];
  aggregation: KPIAggregation;
  filters?: Record<string, unknown>;
}

export interface TrendData {
  metric: string;
  dataPoints: { date: string; value: number }[];
  direction: TrendDirection;
  changePercent: number;
}

// ===========================================
// Helpers
// ===========================================

function calculateTrend(current: number, previous: number): TrendDirection {
  if (previous === 0) return current > 0 ? 'up' : 'stable';
  const change = ((current - previous) / Math.abs(previous)) * 100;
  if (change > 2) return 'up';
  if (change < -2) return 'down';
  return 'stable';
}

function calculateChangePercent(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / Math.abs(previous)) * 100 * 10) / 10;
}

function detectAnomalies(values: number[], currentValue: number, metricName: string): AnomalyInfo | null {
  if (values.length < 3) return null;

  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  const stdDev = Math.sqrt(variance);

  if (stdDev === 0) return null;

  const deviation = Math.abs(currentValue - mean) / stdDev;

  if (deviation > 2) {
    return {
      metric: metricName,
      value: currentValue,
      expected: Math.round(mean * 100) / 100,
      deviation: Math.round(deviation * 100) / 100,
      severity: deviation > 3 ? 'critical' : 'warning',
      description: currentValue > mean
        ? `${metricName} is unusually high (${deviation.toFixed(1)} std devs above average)`
        : `${metricName} is unusually low (${deviation.toFixed(1)} std devs below average)`,
    };
  }

  return null;
}

function formatNumber(value: number, unit?: string): string {
  if (unit === '%') return `${value.toFixed(1)}%`;
  if (unit === 'EUR' || unit === 'USD') return `${value.toLocaleString('de-DE', { minimumFractionDigits: 2 })} ${unit}`;
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return value.toString();
}

function trendArrow(trend: TrendDirection): string {
  switch (trend) {
    case 'up': return '↑';
    case 'down': return '↓';
    case 'stable': return '→';
  }
}

function generateNarrativeText(section: string, metrics: MetricPoint[]): string {
  const parts: string[] = [];

  for (const m of metrics) {
    const arrow = trendArrow(m.trend);
    const change = m.changePercent !== 0 ? ` (${m.changePercent > 0 ? '+' : ''}${m.changePercent}%)` : '';
    parts.push(`${m.label}: ${formatNumber(m.value, m.unit)} ${arrow}${change}`);
  }

  if (parts.length === 0) return `No ${section.toLowerCase()} data available for this period.`;
  return parts.join('. ') + '.';
}

// ===========================================
// Data Fetchers
// ===========================================

async function fetchFinanceMetrics(context: AIContext, userId: string, daysBack: number): Promise<{
  revenue: number[];
  currentRevenue: number;
  transactionCount: number;
}> {
  try {
    const result = await queryContext(
      context,
      `SELECT
         COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) as revenue,
         COUNT(*) as tx_count
       FROM transactions
       WHERE user_id = $1
         AND date >= CURRENT_DATE - $2::int
       GROUP BY date
       ORDER BY date DESC
       LIMIT $2`,
      [userId, daysBack]
    );

    const revenues = result.rows.map((r: { revenue: string }) => parseFloat(r.revenue) || 0);
    const currentRevenue = revenues[0] ?? 0;
    const txCount = result.rows.length > 0 ? parseInt(result.rows[0].tx_count, 10) : 0;

    return { revenue: revenues, currentRevenue, transactionCount: txCount };
  } catch {
    return { revenue: [], currentRevenue: 0, transactionCount: 0 };
  }
}

async function fetchEmailActivity(context: AIContext, userId: string, daysBack: number): Promise<{
  counts: number[];
  todayCount: number;
  importantCount: number;
}> {
  try {
    const result = await queryContext(
      context,
      `SELECT
         COUNT(*) as total,
         COUNT(*) FILTER (WHERE ai_priority IN ('high', 'urgent')) as important
       FROM emails
       WHERE user_id = $1
         AND created_at >= CURRENT_DATE - $2::int
       GROUP BY DATE(created_at)
       ORDER BY DATE(created_at) DESC
       LIMIT $2`,
      [userId, daysBack]
    );

    const counts = result.rows.map((r: { total: string }) => parseInt(r.total, 10) || 0);
    const todayCount = counts[0] ?? 0;
    const importantCount = result.rows.length > 0 ? parseInt(result.rows[0].important, 10) : 0;

    return { counts, todayCount, importantCount };
  } catch {
    return { counts: [], todayCount: 0, importantCount: 0 };
  }
}

async function fetchTaskMetrics(context: AIContext, userId: string, daysBack: number): Promise<{
  completionRates: number[];
  currentCompletionRate: number;
  totalTasks: number;
  completedTasks: number;
  overdueTasks: number;
}> {
  try {
    const result = await queryContext(
      context,
      `SELECT
         COUNT(*) as total,
         COUNT(*) FILTER (WHERE status = 'done') as completed,
         COUNT(*) FILTER (WHERE status != 'done' AND due_date < CURRENT_DATE) as overdue
       FROM tasks
       WHERE user_id = $1
         AND created_at >= CURRENT_DATE - $2::int`,
      [userId, daysBack]
    );

    const row = result.rows[0] ?? { total: '0', completed: '0', overdue: '0' };
    const total = parseInt(row.total, 10);
    const completed = parseInt(row.completed, 10);
    const overdue = parseInt(row.overdue, 10);
    const rate = total > 0 ? (completed / total) * 100 : 0;

    return {
      completionRates: [rate],
      currentCompletionRate: Math.round(rate * 10) / 10,
      totalTasks: total,
      completedTasks: completed,
      overdueTasks: overdue,
    };
  } catch {
    return { completionRates: [], currentCompletionRate: 0, totalTasks: 0, completedTasks: 0, overdueTasks: 0 };
  }
}

async function fetchCalendarEvents(context: AIContext, userId: string): Promise<{
  todayCount: number;
  tomorrowCount: number;
  nextEvent: string | null;
}> {
  try {
    const result = await queryContext(
      context,
      `SELECT
         COUNT(*) FILTER (WHERE DATE(start_time) = CURRENT_DATE) as today,
         COUNT(*) FILTER (WHERE DATE(start_time) = CURRENT_DATE + 1) as tomorrow,
         MIN(CASE WHEN start_time > NOW() THEN title END) as next_event
       FROM calendar_events
       WHERE user_id = $1
         AND start_time >= CURRENT_DATE
         AND start_time < CURRENT_DATE + 2`,
      [userId]
    );

    const row = result.rows[0] ?? { today: '0', tomorrow: '0', next_event: null };
    return {
      todayCount: parseInt(row.today, 10),
      tomorrowCount: parseInt(row.tomorrow, 10),
      nextEvent: row.next_event,
    };
  } catch {
    return { todayCount: 0, tomorrowCount: 0, nextEvent: null };
  }
}

async function fetchSuggestionsSummary(context: AIContext, userId: string): Promise<{
  activeCount: number;
  topType: string | null;
}> {
  try {
    const result = await queryContext(
      context,
      `SELECT COUNT(*) as active,
              mode() WITHIN GROUP (ORDER BY type) as top_type
       FROM smart_suggestions
       WHERE user_id = $1
         AND status = 'active'
         AND (snoozed_until IS NULL OR snoozed_until < NOW())`,
      [userId]
    );

    const row = result.rows[0] ?? { active: '0', top_type: null };
    return {
      activeCount: parseInt(row.active, 10),
      topType: row.top_type,
    };
  } catch {
    return { activeCount: 0, topType: null };
  }
}

// ===========================================
// Daily Digest
// ===========================================

export async function generateDailyDigest(
  context: AIContext,
  userId: string
): Promise<DailyDigest> {
  const today = new Date().toISOString().split('T')[0];
  const sections: NarrativeSection[] = [];
  let allAnomalies: AnomalyInfo[] = [];
  const allActionItems: string[] = [];

  // Revenue Section
  const finance = await fetchFinanceMetrics(context, userId, 7);
  const revenueTrend = calculateTrend(
    finance.currentRevenue,
    finance.revenue[1] ?? 0
  );
  const revenueChange = calculateChangePercent(
    finance.currentRevenue,
    finance.revenue[1] ?? 0
  );
  const revenueAnomaly = detectAnomalies(finance.revenue, finance.currentRevenue, 'Revenue');

  const revenueMetrics: MetricPoint[] = [
    { label: 'Tagesumsatz', value: finance.currentRevenue, unit: 'EUR', trend: revenueTrend, changePercent: revenueChange },
    { label: 'Transaktionen', value: finance.transactionCount, trend: 'stable', changePercent: 0 },
  ];

  const revenueAnomalies = revenueAnomaly ? [revenueAnomaly] : [];
  if (revenueAnomaly) allAnomalies.push(revenueAnomaly);
  if (finance.currentRevenue === 0) allActionItems.push('Keine Umsaetze heute erfasst - Pruefen Sie die Zahlungseingaenge.');

  sections.push({
    title: 'Revenue',
    icon: '💰',
    narrative: generateNarrativeText('Revenue', revenueMetrics),
    metrics: revenueMetrics,
    actionItems: finance.currentRevenue === 0 ? ['Keine Umsaetze heute erfasst - Pruefen Sie die Zahlungseingaenge.'] : [],
    anomalies: revenueAnomalies,
  });

  // Email Activity Section
  const email = await fetchEmailActivity(context, userId, 7);
  const emailTrend = calculateTrend(email.todayCount, email.counts[1] ?? 0);
  const emailChange = calculateChangePercent(email.todayCount, email.counts[1] ?? 0);
  const emailAnomaly = detectAnomalies(email.counts, email.todayCount, 'Email-Volumen');
  const emailAnomalies = emailAnomaly ? [emailAnomaly] : [];
  if (emailAnomaly) allAnomalies.push(emailAnomaly);
  if (email.importantCount > 0) allActionItems.push(`${email.importantCount} wichtige E-Mail(s) erfordern Aufmerksamkeit.`);

  const emailMetrics: MetricPoint[] = [
    { label: 'E-Mails heute', value: email.todayCount, trend: emailTrend, changePercent: emailChange },
    { label: 'Wichtig', value: email.importantCount, trend: email.importantCount > 0 ? 'up' : 'stable', changePercent: 0 },
  ];

  sections.push({
    title: 'E-Mail-Aktivitaet',
    icon: '📧',
    narrative: generateNarrativeText('E-Mail', emailMetrics),
    metrics: emailMetrics,
    actionItems: email.importantCount > 0 ? [`${email.importantCount} wichtige E-Mail(s) erfordern Aufmerksamkeit.`] : [],
    anomalies: emailAnomalies,
  });

  // Tasks Section
  const tasks = await fetchTaskMetrics(context, userId, 7);
  const taskTrend = calculateTrend(tasks.currentCompletionRate, tasks.completionRates[1] ?? 0);
  const taskChange = calculateChangePercent(tasks.currentCompletionRate, tasks.completionRates[1] ?? 0);
  if (tasks.overdueTasks > 0) allActionItems.push(`${tasks.overdueTasks} ueberfaellige Aufgabe(n) bearbeiten.`);

  const taskMetrics: MetricPoint[] = [
    { label: 'Abschlussrate', value: tasks.currentCompletionRate, unit: '%', trend: taskTrend, changePercent: taskChange },
    { label: 'Gesamt', value: tasks.totalTasks, trend: 'stable', changePercent: 0 },
    { label: 'Erledigt', value: tasks.completedTasks, trend: 'stable', changePercent: 0 },
    { label: 'Ueberfaellig', value: tasks.overdueTasks, trend: tasks.overdueTasks > 0 ? 'up' : 'stable', changePercent: 0 },
  ];

  sections.push({
    title: 'Aufgaben',
    icon: '✅',
    narrative: generateNarrativeText('Aufgaben', taskMetrics),
    metrics: taskMetrics,
    actionItems: tasks.overdueTasks > 0 ? [`${tasks.overdueTasks} ueberfaellige Aufgabe(n) bearbeiten.`] : [],
    anomalies: [],
  });

  // Calendar Section
  const calendar = await fetchCalendarEvents(context, userId);
  const calendarMetrics: MetricPoint[] = [
    { label: 'Heute', value: calendar.todayCount, trend: 'stable', changePercent: 0 },
    { label: 'Morgen', value: calendar.tomorrowCount, trend: 'stable', changePercent: 0 },
  ];

  const calNarrative = calendar.nextEvent
    ? `${calendar.todayCount} Termine heute, ${calendar.tomorrowCount} morgen. Naechster Termin: ${calendar.nextEvent}.`
    : `${calendar.todayCount} Termine heute, ${calendar.tomorrowCount} morgen.`;

  sections.push({
    title: 'Kalender',
    icon: '📅',
    narrative: calNarrative,
    metrics: calendarMetrics,
    actionItems: [],
    anomalies: [],
  });

  // Suggestions Section
  const suggestions = await fetchSuggestionsSummary(context, userId);
  const suggestionsMetrics: MetricPoint[] = [
    { label: 'Aktive Vorschlaege', value: suggestions.activeCount, trend: 'stable', changePercent: 0 },
  ];

  sections.push({
    title: 'KI-Vorschlaege',
    icon: '💡',
    narrative: suggestions.activeCount > 0
      ? `${suggestions.activeCount} aktive KI-Vorschlaege warten auf Ihre Bearbeitung.`
      : 'Keine ausstehenden KI-Vorschlaege.',
    metrics: suggestionsMetrics,
    actionItems: suggestions.activeCount > 3 ? ['Zahlreiche KI-Vorschlaege ausstehend - Ueberpruefen empfohlen.'] : [],
    anomalies: [],
  });

  // Overall narrative
  const overallParts: string[] = [];
  if (finance.currentRevenue > 0) overallParts.push(`Umsatz ${formatNumber(finance.currentRevenue, 'EUR')}`);
  if (email.todayCount > 0) overallParts.push(`${email.todayCount} E-Mails`);
  if (tasks.completedTasks > 0) overallParts.push(`${tasks.completedTasks}/${tasks.totalTasks} Aufgaben erledigt`);
  if (calendar.todayCount > 0) overallParts.push(`${calendar.todayCount} Termine`);

  const overallNarrative = overallParts.length > 0
    ? `Tagesuebersicht: ${overallParts.join(', ')}.${allAnomalies.length > 0 ? ` ${allAnomalies.length} Anomalie(n) erkannt.` : ''}`
    : 'Keine Aktivitaeten fuer heute erfasst.';

  return {
    date: today,
    sections,
    overallNarrative,
    actionItems: allActionItems,
    anomalyCount: allAnomalies.length,
  };
}

// ===========================================
// Weekly Report
// ===========================================

export async function generateWeeklyReport(
  context: AIContext,
  userId: string
): Promise<WeeklyReport> {
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay() + 1); // Monday
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);

  const finance = await fetchFinanceMetrics(context, userId, 7);
  const email = await fetchEmailActivity(context, userId, 7);
  const tasks = await fetchTaskMetrics(context, userId, 7);

  const sections: NarrativeSection[] = [];

  // Finance weekly summary
  const weeklyRevenue = finance.revenue.reduce((a, b) => a + b, 0);
  sections.push({
    title: 'Wochenumsatz',
    icon: '💰',
    narrative: `Gesamtumsatz diese Woche: ${formatNumber(weeklyRevenue, 'EUR')}. Durchschnittlich ${formatNumber(weeklyRevenue / 7, 'EUR')} pro Tag.`,
    metrics: [
      { label: 'Wochenumsatz', value: weeklyRevenue, unit: 'EUR', trend: calculateTrend(weeklyRevenue, 0), changePercent: 0 },
    ],
    actionItems: [],
    anomalies: [],
  });

  // Email weekly summary
  const weeklyEmails = email.counts.reduce((a, b) => a + b, 0);
  sections.push({
    title: 'E-Mail-Woche',
    icon: '📧',
    narrative: `${weeklyEmails} E-Mails diese Woche verarbeitet.`,
    metrics: [
      { label: 'E-Mails gesamt', value: weeklyEmails, trend: 'stable', changePercent: 0 },
    ],
    actionItems: [],
    anomalies: [],
  });

  // Tasks weekly summary
  sections.push({
    title: 'Aufgaben-Woche',
    icon: '✅',
    narrative: `${tasks.completedTasks} von ${tasks.totalTasks} Aufgaben erledigt (${tasks.currentCompletionRate}%).${tasks.overdueTasks > 0 ? ` ${tasks.overdueTasks} ueberfaellig.` : ''}`,
    metrics: [
      { label: 'Erledigt', value: tasks.completedTasks, trend: 'stable', changePercent: 0 },
      { label: 'Abschlussrate', value: tasks.currentCompletionRate, unit: '%', trend: calculateTrend(tasks.currentCompletionRate, 50), changePercent: 0 },
    ],
    actionItems: tasks.overdueTasks > 0 ? [`${tasks.overdueTasks} ueberfaellige Aufgabe(n) priorisieren.`] : [],
    anomalies: [],
  });

  const trendSummary: TrendSummary[] = [
    { metric: 'Revenue', direction: calculateTrend(finance.currentRevenue, finance.revenue[finance.revenue.length - 1] ?? 0), changePercent: 0, sparkline: finance.revenue.slice(0, 7) },
    { metric: 'E-Mails', direction: calculateTrend(email.todayCount, email.counts[email.counts.length - 1] ?? 0), changePercent: 0, sparkline: email.counts.slice(0, 7) },
  ];

  const overallNarrative = `Wochenbericht ${weekStart.toISOString().split('T')[0]} bis ${weekEnd.toISOString().split('T')[0]}: ${formatNumber(weeklyRevenue, 'EUR')} Umsatz, ${weeklyEmails} E-Mails, ${tasks.currentCompletionRate}% Aufgaben-Abschlussrate.`;

  return {
    periodStart: weekStart.toISOString().split('T')[0],
    periodEnd: weekEnd.toISOString().split('T')[0],
    sections,
    overallNarrative,
    contextComparison: [],
    trendSummary,
  };
}

// ===========================================
// Anomaly Detection
// ===========================================

export async function detectAllAnomalies(
  context: AIContext,
  userId: string
): Promise<AnomalyInfo[]> {
  const anomalies: AnomalyInfo[] = [];

  const finance = await fetchFinanceMetrics(context, userId, 7);
  const revenueAnomaly = detectAnomalies(finance.revenue, finance.currentRevenue, 'Revenue');
  if (revenueAnomaly) anomalies.push(revenueAnomaly);

  const email = await fetchEmailActivity(context, userId, 7);
  const emailAnomaly = detectAnomalies(email.counts, email.todayCount, 'Email-Volumen');
  if (emailAnomaly) anomalies.push(emailAnomaly);

  return anomalies;
}

// ===========================================
// Custom KPIs
// ===========================================

export async function listKPIs(
  context: AIContext,
  userId: string
): Promise<CustomKPI[]> {
  const result = await queryContext(
    context,
    `SELECT * FROM custom_kpis WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId]
  );

  return result.rows.map(mapKPIRow);
}

export async function createKPI(
  context: AIContext,
  userId: string,
  data: { name: string; description?: string; formula: KPIFormula; targetValue?: number; unit?: string }
): Promise<CustomKPI> {
  const result = await queryContext(
    context,
    `INSERT INTO custom_kpis (user_id, name, description, formula, target_value, unit, trend, current_value)
     VALUES ($1, $2, $3, $4, $5, $6, 'stable', 0)
     RETURNING *`,
    [userId, data.name, data.description ?? null, JSON.stringify(data.formula), data.targetValue ?? null, data.unit ?? null]
  );

  return mapKPIRow(result.rows[0]);
}

export async function updateKPI(
  context: AIContext,
  userId: string,
  kpiId: string,
  data: { name?: string; description?: string; formula?: KPIFormula; targetValue?: number; unit?: string; currentValue?: number; trend?: TrendDirection }
): Promise<CustomKPI | null> {
  const sets: string[] = [];
  const params: (string | number | null)[] = [userId, kpiId];
  let idx = 3;

  if (data.name !== undefined) { sets.push(`name = $${idx++}`); params.push(data.name); }
  if (data.description !== undefined) { sets.push(`description = $${idx++}`); params.push(data.description); }
  if (data.formula !== undefined) { sets.push(`formula = $${idx++}`); params.push(JSON.stringify(data.formula)); }
  if (data.targetValue !== undefined) { sets.push(`target_value = $${idx++}`); params.push(data.targetValue); }
  if (data.unit !== undefined) { sets.push(`unit = $${idx++}`); params.push(data.unit); }
  if (data.currentValue !== undefined) { sets.push(`current_value = $${idx++}`); params.push(data.currentValue); sets.push(`last_calculated_at = NOW()`); }
  if (data.trend !== undefined) { sets.push(`trend = $${idx++}`); params.push(data.trend); }

  if (sets.length === 0) return null;

  const result = await queryContext(
    context,
    `UPDATE custom_kpis SET ${sets.join(', ')} WHERE user_id = $1 AND id = $2 RETURNING *`,
    params
  );

  return result.rows[0] ? mapKPIRow(result.rows[0]) : null;
}

export async function deleteKPI(
  context: AIContext,
  userId: string,
  kpiId: string
): Promise<boolean> {
  const result = await queryContext(
    context,
    `DELETE FROM custom_kpis WHERE user_id = $1 AND id = $2`,
    [userId, kpiId]
  );

  return (result.rowCount ?? 0) > 0;
}

// ===========================================
// Trends
// ===========================================

export async function getTrends(
  context: AIContext,
  userId: string,
  days: number = 7
): Promise<TrendData[]> {
  const trends: TrendData[] = [];

  // Revenue trend
  try {
    const result = await queryContext(
      context,
      `SELECT DATE(date) as d, COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) as revenue
       FROM transactions
       WHERE user_id = $1 AND date >= CURRENT_DATE - $2::int
       GROUP BY DATE(date)
       ORDER BY d`,
      [userId, days]
    );

    const dataPoints = result.rows.map((r: { d: string; revenue: string }) => ({
      date: r.d,
      value: parseFloat(r.revenue) || 0,
    }));

    if (dataPoints.length >= 2) {
      const first = dataPoints[0].value;
      const last = dataPoints[dataPoints.length - 1].value;
      trends.push({
        metric: 'Revenue',
        dataPoints,
        direction: calculateTrend(last, first),
        changePercent: calculateChangePercent(last, first),
      });
    }
  } catch {
    logger.debug('Could not fetch revenue trends');
  }

  // Email trend
  try {
    const result = await queryContext(
      context,
      `SELECT DATE(created_at) as d, COUNT(*) as count
       FROM emails
       WHERE user_id = $1 AND created_at >= CURRENT_DATE - $2::int
       GROUP BY DATE(created_at)
       ORDER BY d`,
      [userId, days]
    );

    const dataPoints = result.rows.map((r: { d: string; count: string }) => ({
      date: r.d,
      value: parseInt(r.count, 10) || 0,
    }));

    if (dataPoints.length >= 2) {
      const first = dataPoints[0].value;
      const last = dataPoints[dataPoints.length - 1].value;
      trends.push({
        metric: 'E-Mails',
        dataPoints,
        direction: calculateTrend(last, first),
        changePercent: calculateChangePercent(last, first),
      });
    }
  } catch {
    logger.debug('Could not fetch email trends');
  }

  // Task completion trend
  try {
    const result = await queryContext(
      context,
      `SELECT DATE(updated_at) as d, COUNT(*) as count
       FROM tasks
       WHERE user_id = $1 AND status = 'done' AND updated_at >= CURRENT_DATE - $2::int
       GROUP BY DATE(updated_at)
       ORDER BY d`,
      [userId, days]
    );

    const dataPoints = result.rows.map((r: { d: string; count: string }) => ({
      date: r.d,
      value: parseInt(r.count, 10) || 0,
    }));

    if (dataPoints.length >= 2) {
      const first = dataPoints[0].value;
      const last = dataPoints[dataPoints.length - 1].value;
      trends.push({
        metric: 'Erledigte Aufgaben',
        dataPoints,
        direction: calculateTrend(last, first),
        changePercent: calculateChangePercent(last, first),
      });
    }
  } catch {
    logger.debug('Could not fetch task trends');
  }

  return trends;
}

// ===========================================
// Persistence
// ===========================================

export async function saveNarrative(
  context: AIContext,
  userId: string,
  type: NarrativeType,
  periodStart: string,
  periodEnd: string,
  narrative: string,
  data: Record<string, unknown>,
  actionItems: string[]
): Promise<void> {
  try {
    await queryContext(
      context,
      `INSERT INTO business_narratives (user_id, type, period_start, period_end, narrative, data, action_items)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [userId, type, periodStart, periodEnd, narrative, JSON.stringify(data), JSON.stringify(actionItems)]
    );
  } catch (err) {
    logger.warn('Failed to save narrative', { error: err });
  }
}

// ===========================================
// Row Mapper
// ===========================================

function mapKPIRow(row: Record<string, unknown>): CustomKPI {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    name: row.name as string,
    description: row.description as string | null,
    formula: (typeof row.formula === 'string' ? JSON.parse(row.formula) : row.formula) as KPIFormula,
    targetValue: row.target_value as number | null,
    currentValue: row.current_value as number | null,
    unit: row.unit as string | null,
    trend: (row.trend as TrendDirection) ?? 'stable',
    lastCalculatedAt: row.last_calculated_at as string | null,
    createdAt: row.created_at as string,
  };
}

// Exported for testing
export { calculateTrend, calculateChangePercent, detectAnomalies, formatNumber, trendArrow, generateNarrativeText };
