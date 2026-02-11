/**
 * Business Tool Handlers
 *
 * AI Chat tools for querying business metrics, generating reports,
 * and analyzing business data through natural conversation.
 *
 * @module services/tool-handlers/business-tools
 */

import { logger } from '../../utils/logger';
import { pool } from '../../utils/database';
import {
  stripeConnector,
  gscConnector,
  ga4Connector,
  uptimeConnector,
  lighthouseConnector,
} from '../business';
import type { ToolExecutionContext } from '../claude/tool-use';

// ===========================================
// Revenue Metrics
// ===========================================

export async function handleGetRevenueMetrics(
  input: Record<string, unknown>,
  _execContext: ToolExecutionContext
): Promise<string> {
  const period = (input.period as string) || '30d';
  logger.debug('Tool: get_revenue_metrics', { period });

  try {
    if (!stripeConnector.isAvailable()) {
      return 'Stripe ist nicht konfiguriert. Bitte STRIPE_SECRET_KEY in den Umgebungsvariablen setzen.';
    }

    const metrics = await stripeConnector.getMetrics();
    const parts: string[] = [
      `📊 **Revenue-Übersicht**`,
      `- MRR: €${(metrics.mrr / 100).toFixed(2)}`,
      `- ARR: €${(metrics.arr / 100).toFixed(2)}`,
      `- Aktive Subscriptions: ${metrics.activeSubscriptions}`,
      `- Churn Rate: ${(metrics.churnRate * 100).toFixed(1)}%`,
    ];

    if (metrics.mrrGrowth !== undefined) {
      const direction = metrics.mrrGrowth >= 0 ? '📈' : '📉';
      parts.push(`- MRR-Wachstum: ${direction} ${(metrics.mrrGrowth * 100).toFixed(1)}%`);
    }

    if (metrics.recentPayments && metrics.recentPayments.length > 0) {
      parts.push('', '**Letzte Zahlungen:**');
      for (const p of metrics.recentPayments.slice(0, 5)) {
        parts.push(`- €${(p.amount / 100).toFixed(2)} (${p.status}) - ${new Date(p.occurred_at).toLocaleDateString('de-DE')}`);
      }
    }

    return parts.join('\n');
  } catch (error) {
    logger.error('Tool get_revenue_metrics failed', error instanceof Error ? error : undefined);
    return `Fehler beim Abrufen der Revenue-Daten: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`;
  }
}

// ===========================================
// Traffic Analytics
// ===========================================

export async function handleGetTrafficAnalytics(
  input: Record<string, unknown>,
  _execContext: ToolExecutionContext
): Promise<string> {
  const period = (input.period as string) || '28d';
  logger.debug('Tool: get_traffic_analytics', { period });

  try {
    if (!ga4Connector.isAvailable()) {
      return 'Google Analytics 4 ist nicht konfiguriert. Bitte GA4_PROPERTY_ID und Google OAuth Credentials setzen.';
    }

    const metrics = await ga4Connector.getTrafficMetrics(period);
    const parts: string[] = [
      `🌐 **Traffic-Übersicht** (${period})`,
      `- Besucher: ${metrics.users.toLocaleString('de-DE')}`,
      `- Sessions: ${metrics.sessions.toLocaleString('de-DE')}`,
      `- Seitenaufrufe: ${metrics.pageviews.toLocaleString('de-DE')}`,
      `- Bounce Rate: ${(metrics.bounceRate * 100).toFixed(1)}%`,
    ];

    if (metrics.usersGrowth !== undefined) {
      const direction = metrics.usersGrowth >= 0 ? '📈' : '📉';
      parts.push(`- Besucher-Wachstum: ${direction} ${(metrics.usersGrowth * 100).toFixed(1)}%`);
    }

    if (metrics.topPages && metrics.topPages.length > 0) {
      parts.push('', '**Top Seiten:**');
      for (const page of metrics.topPages.slice(0, 5)) {
        parts.push(`- ${page.page}: ${page.views} Aufrufe`);
      }
    }

    if (metrics.trafficSources && metrics.trafficSources.length > 0) {
      parts.push('', '**Traffic-Quellen:**');
      for (const source of metrics.trafficSources.slice(0, 5)) {
        parts.push(`- ${source.source}: ${source.users} Besucher`);
      }
    }

    return parts.join('\n');
  } catch (error) {
    logger.error('Tool get_traffic_analytics failed', error instanceof Error ? error : undefined);
    return `Fehler beim Abrufen der Traffic-Daten: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`;
  }
}

// ===========================================
// SEO Performance
// ===========================================

export async function handleGetSeoPerformance(
  input: Record<string, unknown>,
  _execContext: ToolExecutionContext
): Promise<string> {
  const period = (input.period as string) || '28d';
  logger.debug('Tool: get_seo_performance', { period });

  try {
    if (!gscConnector.isAvailable()) {
      return 'Google Search Console ist nicht konfiguriert. Bitte Google OAuth einrichten unter /business → Connectors.';
    }

    const siteUrl = process.env.GSC_SITE_URL ?? 'https://zensation.ai';
    const metrics = await gscConnector.getSearchMetrics(siteUrl, period);

    const parts: string[] = [
      `🔍 **SEO-Performance** (${period})`,
      `- Impressionen: ${metrics.impressions.toLocaleString('de-DE')}`,
      `- Klicks: ${metrics.clicks.toLocaleString('de-DE')}`,
      `- CTR: ${(metrics.ctr * 100).toFixed(2)}%`,
      `- Ø Position: ${metrics.avgPosition.toFixed(1)}`,
    ];

    if (metrics.impressionsGrowth !== undefined) {
      const direction = metrics.impressionsGrowth >= 0 ? '📈' : '📉';
      parts.push(`- Impressionen-Wachstum: ${direction} ${(metrics.impressionsGrowth * 100).toFixed(1)}%`);
    }

    if (metrics.topQueries && metrics.topQueries.length > 0) {
      parts.push('', '**Top Suchanfragen:**');
      for (const q of metrics.topQueries.slice(0, 10)) {
        parts.push(`- "${q.query}": ${q.clicks} Klicks, Pos. ${q.position.toFixed(1)}`);
      }
    }

    return parts.join('\n');
  } catch (error) {
    logger.error('Tool get_seo_performance failed', error instanceof Error ? error : undefined);
    return `Fehler beim Abrufen der SEO-Daten: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`;
  }
}

// ===========================================
// System Health
// ===========================================

export async function handleGetSystemHealth(
  input: Record<string, unknown>,
  _execContext: ToolExecutionContext
): Promise<string> {
  const includePerformance = input.include_performance !== false;
  logger.debug('Tool: get_system_health', { includePerformance });

  try {
    const parts: string[] = ['🏥 **System Health**'];

    // Uptime
    if (uptimeConnector.isAvailable()) {
      const uptime = await uptimeConnector.getUptimeStatus();
      parts.push(
        '',
        '**Uptime:**',
        `- Verfügbarkeit: ${uptime.percentage.toFixed(2)}%`,
        `- Ø Antwortzeit: ${uptime.avgResponseTime}ms`,
        `- Monitore: ${uptime.monitors.length}`,
      );

      if (uptime.incidents.length > 0) {
        parts.push(`- ⚠️ ${uptime.incidents.length} aktive Incidents`);
      } else {
        parts.push('- ✅ Keine aktiven Incidents');
      }
    } else {
      parts.push('', 'Uptime-Monitoring nicht konfiguriert.');
    }

    // Performance
    if (includePerformance) {
      const scores = await lighthouseConnector.getLatestScores();
      if (scores) {
        parts.push(
          '',
          '**Performance (Lighthouse):**',
          `- Performance Score: ${scores.score}/100`,
          `- Accessibility: ${scores.accessibilityScore}/100`,
          `- Best Practices: ${scores.bestPracticesScore}/100`,
          `- SEO Score: ${scores.seoScore}/100`,
          '',
          '**Core Web Vitals:**',
          `- LCP: ${scores.lcp}ms`,
          `- FID: ${scores.fid}ms`,
          `- CLS: ${scores.cls}`,
        );
      } else {
        parts.push('', 'Keine Performance-Daten verfügbar. Führe zuerst ein Audit durch.');
      }
    }

    return parts.join('\n');
  } catch (error) {
    logger.error('Tool get_system_health failed', error instanceof Error ? error : undefined);
    return `Fehler beim Abrufen der System-Health-Daten: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`;
  }
}

// ===========================================
// Business Report
// ===========================================

export async function handleGenerateBusinessReport(
  input: Record<string, unknown>,
  _execContext: ToolExecutionContext
): Promise<string> {
  const type = (input.type as string) || 'weekly';
  logger.debug('Tool: generate_business_report', { type });

  try {
    // Try to get the latest stored report
    const result = await pool.query(`
      SELECT * FROM business_reports
      WHERE report_type = $1
      ORDER BY period_end DESC
      LIMIT 1
    `, [type]);

    if (result.rows.length > 0) {
      const report = result.rows[0];
      const parts: string[] = [
        `📋 **${type === 'weekly' ? 'Wochenbericht' : 'Monatsbericht'}**`,
        `Zeitraum: ${new Date(report.period_start).toLocaleDateString('de-DE')} - ${new Date(report.period_end).toLocaleDateString('de-DE')}`,
        '',
      ];

      if (report.executive_summary) {
        parts.push('**Zusammenfassung:**', report.executive_summary, '');
      }

      if (report.metrics_summary) {
        const metrics = typeof report.metrics_summary === 'string'
          ? JSON.parse(report.metrics_summary)
          : report.metrics_summary;

        parts.push('**Kennzahlen:**');
        if (metrics.mrr !== undefined) parts.push(`- MRR: €${(metrics.mrr / 100).toFixed(2)}`);
        if (metrics.users !== undefined) parts.push(`- Besucher: ${metrics.users}`);
        if (metrics.impressions !== undefined) parts.push(`- SEO Impressionen: ${metrics.impressions}`);
        if (metrics.uptime !== undefined) parts.push(`- Uptime: ${metrics.uptime}%`);
      }

      if (report.recommendations) {
        const recs = typeof report.recommendations === 'string'
          ? JSON.parse(report.recommendations)
          : report.recommendations;
        if (Array.isArray(recs) && recs.length > 0) {
          parts.push('', '**Empfehlungen:**');
          for (const rec of recs) {
            parts.push(`- ${rec}`);
          }
        }
      }

      return parts.join('\n');
    }

    return `Noch kein ${type === 'weekly' ? 'Wochenbericht' : 'Monatsbericht'} verfügbar. Berichte werden automatisch generiert, sobald genügend Daten gesammelt wurden.`;
  } catch (error) {
    logger.error('Tool generate_business_report failed', error instanceof Error ? error : undefined);
    return `Fehler beim Abrufen des Berichts: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`;
  }
}

// ===========================================
// Anomaly Detection
// ===========================================

export async function handleIdentifyAnomalies(
  _input: Record<string, unknown>,
  _execContext: ToolExecutionContext
): Promise<string> {
  logger.debug('Tool: identify_anomalies');

  try {
    const result = await pool.query(`
      SELECT * FROM business_insights
      WHERE status = 'new'
        AND severity IN ('critical', 'warning')
      ORDER BY created_at DESC
      LIMIT 10
    `);

    if (result.rows.length === 0) {
      return '✅ Keine aktuellen Auffälligkeiten oder Anomalien erkannt. Alles läuft normal.';
    }

    const parts: string[] = [`⚠️ **${result.rows.length} Auffälligkeiten erkannt:**`, ''];

    for (const insight of result.rows) {
      const icon = insight.severity === 'critical' ? '🔴' : '🟡';
      parts.push(`${icon} **${insight.title}**`);
      parts.push(`  ${insight.description}`);
      if (insight.recommendation) {
        parts.push(`  💡 Empfehlung: ${insight.recommendation}`);
      }
      parts.push('');
    }

    return parts.join('\n');
  } catch (error) {
    logger.error('Tool identify_anomalies failed', error instanceof Error ? error : undefined);
    return `Fehler bei der Anomalie-Erkennung: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`;
  }
}

// ===========================================
// Period Comparison
// ===========================================

export async function handleComparePeriods(
  input: Record<string, unknown>,
  _execContext: ToolExecutionContext
): Promise<string> {
  const metric = (input.metric as string) || 'all';
  logger.debug('Tool: compare_periods', { metric });

  try {
    // Get last two snapshots for comparison
    const result = await pool.query(`
      SELECT * FROM business_metrics_snapshots
      ORDER BY snapshot_date DESC
      LIMIT 2
    `);

    if (result.rows.length < 2) {
      return 'Nicht genügend Daten für einen Periodenvergleich. Es werden mindestens zwei Datenpunkte benötigt.';
    }

    const current = result.rows[0];
    const previous = result.rows[1];
    const currentMetrics = typeof current.metrics === 'string' ? JSON.parse(current.metrics) : current.metrics;
    const previousMetrics = typeof previous.metrics === 'string' ? JSON.parse(previous.metrics) : previous.metrics;

    const parts: string[] = [
      `📊 **Periodenvergleich**`,
      `Aktuell: ${new Date(current.snapshot_date).toLocaleDateString('de-DE')}`,
      `Vorher: ${new Date(previous.snapshot_date).toLocaleDateString('de-DE')}`,
      '',
    ];

    const compareValue = (label: string, curr: number | undefined, prev: number | undefined, unit = '', divisor = 1) => {
      if (curr === undefined || prev === undefined) return;
      const c = curr / divisor;
      const p = prev / divisor;
      const change = p !== 0 ? ((c - p) / p) * 100 : 0;
      const direction = change >= 0 ? '📈' : '📉';
      parts.push(`- ${label}: ${c.toFixed(unit === '€' ? 2 : 0)}${unit} ${direction} ${change >= 0 ? '+' : ''}${change.toFixed(1)}%`);
    };

    if (metric === 'all' || metric === 'revenue') {
      parts.push('**Revenue:**');
      compareValue('MRR', currentMetrics.mrr, previousMetrics.mrr, '€', 100);
      compareValue('Subscriptions', currentMetrics.activeSubscriptions, previousMetrics.activeSubscriptions);
      parts.push('');
    }

    if (metric === 'all' || metric === 'traffic') {
      parts.push('**Traffic:**');
      compareValue('Besucher', currentMetrics.users, previousMetrics.users);
      compareValue('Sessions', currentMetrics.sessions, previousMetrics.sessions);
      parts.push('');
    }

    if (metric === 'all' || metric === 'seo') {
      parts.push('**SEO:**');
      compareValue('Impressionen', currentMetrics.impressions, previousMetrics.impressions);
      compareValue('Klicks', currentMetrics.clicks, previousMetrics.clicks);
      parts.push('');
    }

    return parts.join('\n');
  } catch (error) {
    logger.error('Tool compare_periods failed', error instanceof Error ? error : undefined);
    return `Fehler beim Periodenvergleich: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`;
  }
}
