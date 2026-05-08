/**
 * Business Intelligence Tool Handlers (Stufe 6.3)
 *
 * Memory-connected business tools that combine real-time metrics
 * with episodic memory and historical insights.
 *
 * @module services/tool-handlers/business-intelligence-tools
 */

import { logger } from '../../utils/logger';
import { pool } from '../../utils/database';
import type { ToolExecutionContext } from '../claude/tool-use';
import {
  stripeConnector,
  ga4Connector,
  gscConnector,
  uptimeConnector,
} from '../business';

// ===========================================
// get_business_kpis — Aggregated KPI Overview
// ===========================================

export async function handleGetBusinessKPIs(
  _input: Record<string, unknown>,
  _execContext: ToolExecutionContext
): Promise<string> {
  logger.debug('Tool: get_business_kpis');

  try {
    // Fetch all metrics in parallel (collectMetrics returns Record<string, unknown>)
    const [stripe, ga4, gsc, uptime] = await Promise.allSettled([
      stripeConnector.collectMetrics(),
      ga4Connector.collectMetrics(),
      gscConnector.collectMetrics(),
      uptimeConnector.collectMetrics(),
    ]);

    const parts: string[] = ['## Business KPI Übersicht\n'];

    // Revenue
    if (stripe.status === 'fulfilled' && stripe.value) {
      const m = stripe.value;
      parts.push(`**Revenue:** MRR €${m.mrr ?? 'n/a'}, ARR €${m.arr ?? 'n/a'}, Churn ${m.churnRate ?? 'n/a'}%`);
    } else {
      parts.push('**Revenue:** Nicht verfügbar');
    }

    // Traffic
    if (ga4.status === 'fulfilled' && ga4.value) {
      const m = ga4.value;
      parts.push(`**Traffic:** ${m.users ?? 'n/a'} Besucher, ${m.sessions ?? 'n/a'} Sessions, Bounce Rate ${m.bounceRate ?? 'n/a'}%`);
    } else {
      parts.push('**Traffic:** Nicht verfügbar');
    }

    // SEO
    if (gsc.status === 'fulfilled' && gsc.value) {
      const m = gsc.value;
      parts.push(`**SEO:** ${m.impressions ?? 'n/a'} Impressionen, ${m.clicks ?? 'n/a'} Klicks, CTR ${m.ctr ?? 'n/a'}%`);
    } else {
      parts.push('**SEO:** Nicht verfügbar');
    }

    // Uptime
    if (uptime.status === 'fulfilled' && uptime.value) {
      const m = uptime.value;
      parts.push(`**Uptime:** ${m.percentage ?? 'n/a'}%`);
    } else {
      parts.push('**Uptime:** Nicht verfügbar');
    }

    // Fetch recent business insights from episodic memory
    const recentInsights = await pool.query(`
      SELECT title, severity, created_at FROM business_insights
      WHERE created_at > NOW() - INTERVAL '7 days'
      ORDER BY created_at DESC LIMIT 3
    `).catch(() => ({ rows: [] }));

    if (recentInsights.rows.length > 0) {
      parts.push('\n**Letzte Insights (7 Tage):**');
      for (const row of recentInsights.rows) {
        parts.push(`- [${row.severity}] ${row.title} (${new Date(row.created_at).toLocaleDateString('de-DE')})`);
      }
    }

    return parts.join('\n');
  } catch (error) {
    logger.error('Tool get_business_kpis failed', error instanceof Error ? error : undefined);
    return 'Fehler beim Abrufen der Business-KPIs.';
  }
}

// ===========================================
// analyze_business_trend — Trend Analysis
// ===========================================

export async function handleAnalyzeBusinessTrend(
  input: Record<string, unknown>,
  _execContext: ToolExecutionContext
): Promise<string> {
  const metric = (input.metric as string) || 'revenue';
  const period = (input.period as string) || '30d';
  const days = period === '7d' ? 7 : period === '90d' ? 90 : 30;

  logger.debug('Tool: analyze_business_trend', { metric, period });

  try {
    const snapshots = await pool.query(`
      SELECT snapshot_date, metrics FROM business_metrics_snapshots
      WHERE snapshot_date > NOW() - INTERVAL '${days} days'
      ORDER BY snapshot_date ASC
    `);

    if (snapshots.rows.length < 2) {
      return `Nicht genügend Daten für Trend-Analyse (${snapshots.rows.length} Datenpunkte, mindestens 2 benötigt).`;
    }

    const metricKey = metric === 'revenue' ? 'stripe' : metric === 'traffic' ? 'ga4' : metric === 'seo' ? 'gsc' : 'uptime';
    const values: { date: string; value: number }[] = [];

    for (const row of snapshots.rows) {
      const metrics = typeof row.metrics === 'string' ? JSON.parse(row.metrics) : (row.metrics ?? {});
      const section = metrics[metricKey] as Record<string, unknown> | undefined;
      if (!section) continue;

      const val = metric === 'revenue' ? (section.mrr as number ?? 0)
        : metric === 'traffic' ? (section.users as number ?? 0)
        : metric === 'seo' ? (section.impressions as number ?? 0)
        : (section.percentage as number ?? 0);

      values.push({ date: row.snapshot_date, value: val });
    }

    if (values.length < 2) {
      return `Keine ${metric}-Daten im gewählten Zeitraum gefunden.`;
    }

    const first = values[0].value;
    const last = values[values.length - 1].value;
    const change = first > 0 ? ((last - first) / first * 100) : 0;
    const trend = change > 5 ? '📈 Steigend' : change < -5 ? '📉 Fallend' : '➡️ Stabil';
    const avg = values.reduce((s, v) => s + v.value, 0) / values.length;

    const parts = [
      `## ${metric.charAt(0).toUpperCase() + metric.slice(1)}-Trend (${period})`,
      '',
      `**Trend:** ${trend} (${change >= 0 ? '+' : ''}${change.toFixed(1)}%)`,
      `**Aktuell:** ${last.toFixed(metric === 'uptime' ? 2 : 0)}`,
      `**Durchschnitt:** ${avg.toFixed(metric === 'uptime' ? 2 : 0)}`,
      `**Datenpunkte:** ${values.length}`,
    ];

    // Fetch related insights from memory
    const insights = await pool.query(`
      SELECT title, severity FROM business_insights
      WHERE data_source = $1 AND created_at > NOW() - INTERVAL '${days} days'
      ORDER BY created_at DESC LIMIT 3
    `, [metricKey === 'stripe' ? 'stripe' : metricKey === 'ga4' ? 'ga4' : metricKey === 'gsc' ? 'gsc' : 'uptime']).catch(() => ({ rows: [] }));

    if (insights.rows.length > 0) {
      parts.push('\n**Relevante Insights:**');
      for (const row of insights.rows) {
        parts.push(`- [${row.severity}] ${row.title}`);
      }
    }

    return parts.join('\n');
  } catch (error) {
    logger.error('Tool analyze_business_trend failed', error instanceof Error ? error : undefined);
    return 'Fehler bei der Trend-Analyse.';
  }
}

// ===========================================
// get_business_anomalies — Current Anomalies
// ===========================================

export async function handleGetBusinessAnomalies(
  input: Record<string, unknown>,
  _execContext: ToolExecutionContext
): Promise<string> {
  const severity = (input.severity as string) || 'all';

  logger.debug('Tool: get_business_anomalies', { severity });

  try {
    let query = `
      SELECT id, insight_type, severity, title, description, data_source, related_metrics, action_items, created_at
      FROM business_insights
      WHERE created_at > NOW() - INTERVAL '30 days'
    `;
    const params: string[] = [];

    if (severity !== 'all') {
      query += ` AND severity = $1`;
      params.push(severity);
    }

    query += ` ORDER BY created_at DESC LIMIT 10`;

    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      return severity === 'all'
        ? 'Keine Anomalien in den letzten 30 Tagen erkannt. Alles läuft normal.'
        : `Keine Anomalien mit Schweregrad "${severity}" in den letzten 30 Tagen.`;
    }

    const parts = [`## Business-Anomalien (${severity === 'all' ? 'Alle' : severity})\n`];

    for (const row of result.rows) {
      const date = new Date(row.created_at).toLocaleDateString('de-DE');
      const metrics = typeof row.related_metrics === 'string' ? JSON.parse(row.related_metrics) : (row.related_metrics ?? {});
      const actions = typeof row.action_items === 'string' ? JSON.parse(row.action_items) : (row.action_items ?? []);

      parts.push(`### [${row.severity.toUpperCase()}] ${row.title}`);
      parts.push(`**Datum:** ${date} | **Quelle:** ${row.data_source} | **Typ:** ${row.insight_type}`);
      parts.push(row.description);

      if (actions.length > 0) {
        parts.push(`**Empfehlung:** ${actions[0]?.title ?? ''}`);
      }

      if (Object.keys(metrics).length > 0) {
        const metricStr = Object.entries(metrics).map(([k, v]) => `${k}: ${v}`).join(', ');
        parts.push(`**Metriken:** ${metricStr}`);
      }

      parts.push('');
    }

    return parts.join('\n');
  } catch (error) {
    logger.error('Tool get_business_anomalies failed', error instanceof Error ? error : undefined);
    return 'Fehler beim Abrufen der Business-Anomalien.';
  }
}
