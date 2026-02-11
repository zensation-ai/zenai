/**
 * Business Insight Generator
 *
 * Analyzes business metrics to detect anomalies, trends, and generate
 * AI-powered recommendations. Runs daily after data collection.
 *
 * @module services/business/insight-generator
 */

import { pool } from '../../utils/database';
import { logger } from '../../utils/logger';
import Anthropic from '@anthropic-ai/sdk';

class InsightGenerator {
  private anthropic: Anthropic | null = null;

  initialize(): void {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (apiKey) {
      this.anthropic = new Anthropic({ apiKey });
    }
  }

  /**
   * Generate insights from latest metrics
   * Called daily after data collection (05:00)
   */
  async generateDailyInsights(): Promise<void> {
    logger.info('[InsightGenerator] Starting daily insight generation');

    try {
      // Get latest two snapshots for comparison
      const snapshots = await pool.query(`
        SELECT * FROM business_metrics_snapshots
        ORDER BY snapshot_date DESC
        LIMIT 2
      `);

      if (snapshots.rows.length < 2) {
        logger.info('[InsightGenerator] Not enough data for insights (need 2+ snapshots)');
        return;
      }

      const current = snapshots.rows[0];
      const previous = snapshots.rows[1];
      const currentMetrics = typeof current.metrics === 'string' ? JSON.parse(current.metrics) : (current.metrics ?? {});
      const previousMetrics = typeof previous.metrics === 'string' ? JSON.parse(previous.metrics) : (previous.metrics ?? {});

      // Check for anomalies
      await this.checkMRRAnomaly(currentMetrics, previousMetrics);
      await this.checkTrafficAnomaly(currentMetrics, previousMetrics);
      await this.checkUptimeAnomaly(currentMetrics);
      await this.checkPerformanceAnomaly(currentMetrics);

      // Generate AI recommendations if available
      if (this.anthropic) {
        await this.generateAIRecommendations(currentMetrics, previousMetrics);
      }

      logger.info('[InsightGenerator] Daily insight generation complete');
    } catch (error) {
      logger.error('[InsightGenerator] Failed to generate insights:', error instanceof Error ? error : undefined);
    }
  }

  private async checkMRRAnomaly(current: Record<string, unknown>, previous: Record<string, unknown>): Promise<void> {
    const currMRR = (current.mrr as number) ?? 0;
    const prevMRR = (previous.mrr as number) ?? 0;

    if (prevMRR === 0) return;

    const change = (currMRR - prevMRR) / prevMRR;

    if (change <= -0.1) {
      await this.storeInsight({
        type: 'anomaly',
        severity: 'critical',
        title: 'MRR-Einbruch erkannt',
        description: `MRR ist um ${(Math.abs(change) * 100).toFixed(1)}% gesunken (von €${(prevMRR / 100).toFixed(2)} auf €${(currMRR / 100).toFixed(2)}).`,
        recommendation: 'Pruefe Kuendigungen und Zahlungsfehler in Stripe. Kontaktiere betroffene Kunden.',
        dataSource: 'stripe',
        metrics: { currMRR, prevMRR, change },
      });
    } else if (change >= 0.2) {
      await this.storeInsight({
        type: 'milestone',
        severity: 'info',
        title: 'Starkes MRR-Wachstum',
        description: `MRR ist um ${(change * 100).toFixed(1)}% gewachsen (von €${(prevMRR / 100).toFixed(2)} auf €${(currMRR / 100).toFixed(2)}).`,
        recommendation: 'Analysiere, welche Massnahmen zum Wachstum beigetragen haben.',
        dataSource: 'stripe',
        metrics: { currMRR, prevMRR, change },
      });
    }
  }

  private async checkTrafficAnomaly(current: Record<string, unknown>, previous: Record<string, unknown>): Promise<void> {
    const currUsers = (current.users as number) ?? 0;
    const prevUsers = (previous.users as number) ?? 0;

    if (prevUsers === 0) return;

    const change = (currUsers - prevUsers) / prevUsers;

    if (change <= -0.2) {
      await this.storeInsight({
        type: 'anomaly',
        severity: 'warning',
        title: 'Traffic-Rueckgang erkannt',
        description: `Besucher sind um ${(Math.abs(change) * 100).toFixed(1)}% zurueckgegangen.`,
        recommendation: 'Pruefe SEO-Rankings, Serverprobleme oder externe Faktoren.',
        dataSource: 'ga4',
        metrics: { currUsers, prevUsers, change },
      });
    }
  }

  private async checkUptimeAnomaly(current: Record<string, unknown>): Promise<void> {
    const uptime = (current.uptime as number) ?? 100;

    if (uptime < 99.5) {
      await this.storeInsight({
        type: 'alert',
        severity: uptime < 99 ? 'critical' : 'warning',
        title: 'Uptime unter Schwellenwert',
        description: `Aktuelle Verfuegbarkeit: ${uptime.toFixed(2)}% (Ziel: 99.5%).`,
        recommendation: 'Pruefe Server-Logs und Infrastruktur auf Fehler.',
        dataSource: 'uptime',
        metrics: { uptime },
      });
    }
  }

  private async checkPerformanceAnomaly(current: Record<string, unknown>): Promise<void> {
    const score = (current.performanceScore as number) ?? 100;

    if (score < 50) {
      await this.storeInsight({
        type: 'alert',
        severity: 'warning',
        title: 'Performance-Score niedrig',
        description: `Lighthouse Performance Score: ${score}/100.`,
        recommendation: 'Optimiere Bilder, reduziere JavaScript-Bundle-Groesse, aktiviere Caching.',
        dataSource: 'lighthouse',
        metrics: { score },
      });
    }
  }

  private async generateAIRecommendations(current: Record<string, unknown>, previous: Record<string, unknown>): Promise<void> {
    if (!this.anthropic) return;

    try {
      const prompt = `Analysiere folgende Business-Metriken und gib 2-3 konkrete, actionable Empfehlungen auf Deutsch:

Aktuelle Metriken: ${JSON.stringify(current, null, 2)}
Vorherige Metriken: ${JSON.stringify(previous, null, 2)}

Fokussiere auf: Umsatzoptimierung, Traffic-Wachstum, SEO-Verbesserungen, Performance.
Antworte im JSON-Format: [{"title": "...", "description": "...", "priority": "high|medium|low"}]`;

      const response = await this.anthropic.messages.create({
        model: process.env.CLAUDE_MODEL ?? 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      });

      const text = response.content[0].type === 'text' ? response.content[0].text : '';
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) return;

      const recommendations = JSON.parse(jsonMatch[0]) as Array<{ title: string; description: string; priority: string }>;

      for (const rec of recommendations) {
        await this.storeInsight({
          type: 'recommendation',
          severity: 'info',
          title: rec.title,
          description: rec.description,
          recommendation: rec.description,
          dataSource: 'ai',
          metrics: {},
        });
      }
    } catch (error) {
      logger.error('[InsightGenerator] AI recommendations failed:', error instanceof Error ? error : undefined);
    }
  }

  private async storeInsight(insight: {
    type: string;
    severity: string;
    title: string;
    description: string;
    recommendation: string;
    dataSource: string;
    metrics: Record<string, unknown>;
  }): Promise<void> {
    try {
      // Check for duplicate (same title in last 24h)
      const existing = await pool.query(`
        SELECT id FROM business_insights
        WHERE title = $1 AND created_at > NOW() - INTERVAL '24 hours'
        LIMIT 1
      `, [insight.title]);

      if (existing.rows.length > 0) return;

      await pool.query(`
        INSERT INTO business_insights (insight_type, severity, title, description, data_source, related_metrics, action_items)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [
        insight.type,
        insight.severity,
        insight.title,
        insight.description,
        insight.dataSource,
        JSON.stringify(insight.metrics),
        JSON.stringify([{ title: insight.recommendation, priority: 'medium' }]),
      ]);

      logger.info(`[InsightGenerator] Insight stored: ${insight.title}`);
    } catch (error) {
      logger.error(`[InsightGenerator] Failed to store insight:`, error instanceof Error ? error : undefined);
    }
  }
}

export const insightGenerator = new InsightGenerator();
