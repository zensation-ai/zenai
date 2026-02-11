/**
 * Business Report Generator
 *
 * Generates weekly and monthly business reports with AI-powered
 * executive summaries and recommendations.
 *
 * @module services/business/report-generator
 */

import { pool } from '../../utils/database';
import { logger } from '../../utils/logger';
import Anthropic from '@anthropic-ai/sdk';

class ReportGenerator {
  private anthropic: Anthropic | null = null;

  initialize(): void {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (apiKey) {
      this.anthropic = new Anthropic({ apiKey });
    }
  }

  /**
   * Generate a weekly report
   * Called every Sunday
   */
  async generateWeeklyReport(): Promise<void> {
    const periodEnd = new Date();
    const periodStart = new Date();
    periodStart.setDate(periodStart.getDate() - 7);

    await this.generateReport('weekly', periodStart, periodEnd);
  }

  /**
   * Generate a monthly report
   * Called on the 1st of each month
   */
  async generateMonthlyReport(): Promise<void> {
    const periodEnd = new Date();
    const periodStart = new Date();
    periodStart.setMonth(periodStart.getMonth() - 1);

    await this.generateReport('monthly', periodStart, periodEnd);
  }

  private async generateReport(type: 'weekly' | 'monthly', periodStart: Date, periodEnd: Date): Promise<void> {
    logger.info(`[ReportGenerator] Generating ${type} report`);

    try {
      // Gather metrics from snapshots
      const snapshots = await pool.query(`
        SELECT * FROM business_metrics_snapshots
        WHERE snapshot_date BETWEEN $1 AND $2
        ORDER BY snapshot_date ASC
      `, [periodStart.toISOString(), periodEnd.toISOString()]);

      // Gather insights from period
      const insights = await pool.query(`
        SELECT * FROM business_insights
        WHERE created_at BETWEEN $1 AND $2
        ORDER BY severity DESC, created_at DESC
      `, [periodStart.toISOString(), periodEnd.toISOString()]);

      // Calculate aggregated metrics
      const metricsSummary = this.aggregateMetrics(snapshots.rows);

      // Generate AI executive summary
      let executiveSummary = '';
      let recommendations: string[] = [];

      if (this.anthropic && snapshots.rows.length > 0) {
        const aiResult = await this.generateAISummary(type, metricsSummary, insights.rows);
        executiveSummary = aiResult.summary;
        recommendations = aiResult.recommendations;
      }

      // Store report
      await pool.query(`
        INSERT INTO business_reports (
          report_type, period_start, period_end,
          summary, metrics,
          insights, recommendations
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [
        type,
        periodStart.toISOString(),
        periodEnd.toISOString(),
        executiveSummary || `${type === 'weekly' ? 'Wochen' : 'Monats'}bericht fuer ${periodStart.toLocaleDateString('de-DE')} - ${periodEnd.toLocaleDateString('de-DE')}`,
        JSON.stringify(metricsSummary),
        JSON.stringify(insights.rows.map(i => ({ type: i.insight_type, title: i.title, severity: i.severity }))),
        JSON.stringify(recommendations),
      ]);

      logger.info(`[ReportGenerator] ${type} report generated successfully`);
    } catch (error) {
      logger.error(`[ReportGenerator] Failed to generate ${type} report:`, error instanceof Error ? error : undefined);
    }
  }

  private aggregateMetrics(snapshots: Array<Record<string, unknown>>): Record<string, unknown> {
    if (snapshots.length === 0) { return {}; }

    const first = snapshots[0];
    const last = snapshots[snapshots.length - 1];
    const firstMetrics = typeof first.metrics === 'string' ? JSON.parse(first.metrics as string) : (first.metrics ?? {});
    const lastMetrics = typeof last.metrics === 'string' ? JSON.parse(last.metrics as string) : (last.metrics ?? {});

    return {
      // Latest values
      mrr: lastMetrics.mrr ?? 0,
      users: lastMetrics.users ?? 0,
      impressions: lastMetrics.impressions ?? 0,
      uptime: lastMetrics.uptime ?? 0,
      performanceScore: lastMetrics.performanceScore ?? 0,
      // Period changes
      mrrChange: firstMetrics.mrr ? ((lastMetrics.mrr ?? 0) - firstMetrics.mrr) / firstMetrics.mrr : 0,
      usersChange: firstMetrics.users ? ((lastMetrics.users ?? 0) - firstMetrics.users) / firstMetrics.users : 0,
      // Counts
      snapshotCount: snapshots.length,
    };
  }

  private async generateAISummary(
    type: string,
    metrics: Record<string, unknown>,
    insights: Array<Record<string, unknown>>,
  ): Promise<{ summary: string; recommendations: string[] }> {
    if (!this.anthropic) {
      return { summary: '', recommendations: [] };
    }

    try {
      const prompt = `Erstelle einen kurzen ${type === 'weekly' ? 'Wochen' : 'Monats'}bericht fuer ein Software-Unternehmen (ZenSation) auf Deutsch.

Metriken: ${JSON.stringify(metrics, null, 2)}

Erkannte Insights (${insights.length}):
${insights.slice(0, 10).map(i => `- [${i.severity}] ${i.title}: ${i.description}`).join('\n')}

Antworte im JSON-Format:
{
  "summary": "2-3 Saetze Executive Summary",
  "recommendations": ["Empfehlung 1", "Empfehlung 2", "Empfehlung 3"]
}`;

      const response = await this.anthropic.messages.create({
        model: process.env.CLAUDE_MODEL ?? 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      });

      const text = response.content[0].type === 'text' ? response.content[0].text : '';
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) { return { summary: '', recommendations: [] }; }

      const parsed = JSON.parse(jsonMatch[0]);
      return {
        summary: parsed.summary ?? '',
        recommendations: parsed.recommendations ?? [],
      };
    } catch (error) {
      logger.error('[ReportGenerator] AI summary failed:', error instanceof Error ? error : undefined);
      return { summary: '', recommendations: [] };
    }
  }
}

export const reportGenerator = new ReportGenerator();
