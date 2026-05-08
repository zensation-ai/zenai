/**
 * Business Insight Generator
 *
 * Analyzes business metrics to detect anomalies, trends, and generate
 * AI-powered recommendations. Runs daily after data collection.
 *
 * @module services/business/insight-generator
 */

// pool.query() is used intentionally — business tables are global (not per-context schema)
import { pool } from '../../utils/database';
import { AIContext, queryContext } from '../../utils/database-context';
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
    const stripe = current.stripe as Record<string, unknown> | undefined;
    const prevStripe = previous.stripe as Record<string, unknown> | undefined;
    const currMRR = (stripe?.mrr as number) ?? 0;
    const prevMRR = (prevStripe?.mrr as number) ?? 0;

    if (prevMRR === 0) { return; }

    const change = (currMRR - prevMRR) / prevMRR;

    if (change <= -0.1) {
      await this.storeInsight({
        type: 'anomaly',
        severity: 'critical',
        title: 'MRR-Einbruch erkannt',
        description: `MRR ist um ${(Math.abs(change) * 100).toFixed(1)}% gesunken (von €${prevMRR.toFixed(2)} auf €${currMRR.toFixed(2)}).`,
        recommendation: 'Pruefe Kuendigungen und Zahlungsfehler in Stripe. Kontaktiere betroffene Kunden.',
        dataSource: 'stripe',
        metrics: { currMRR, prevMRR, change },
      });
    } else if (change >= 0.2) {
      await this.storeInsight({
        type: 'milestone',
        severity: 'info',
        title: 'Starkes MRR-Wachstum',
        description: `MRR ist um ${(change * 100).toFixed(1)}% gewachsen (von €${prevMRR.toFixed(2)} auf €${currMRR.toFixed(2)}).`,
        recommendation: 'Analysiere, welche Massnahmen zum Wachstum beigetragen haben.',
        dataSource: 'stripe',
        metrics: { currMRR, prevMRR, change },
      });
    }
  }

  private async checkTrafficAnomaly(current: Record<string, unknown>, previous: Record<string, unknown>): Promise<void> {
    const ga4 = current.ga4 as Record<string, unknown> | undefined;
    const prevGa4 = previous.ga4 as Record<string, unknown> | undefined;
    const currUsers = (ga4?.users as number) ?? 0;
    const prevUsers = (prevGa4?.users as number) ?? 0;

    if (prevUsers === 0) { return; }

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
    const uptimeData = current.uptime as Record<string, unknown> | undefined;
    const uptime = (uptimeData?.percentage as number) ?? 100;

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
    const lighthouse = current.lighthouse as Record<string, unknown> | undefined;
    const score = (lighthouse?.score as number) ?? 100;

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
    if (!this.anthropic) { return; }

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
      if (!jsonMatch) { return; }

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

      if (existing.rows.length > 0) { return; }

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

      // Bridge to Episodic Memory — business insights become learnable experiences
      await this.storeAsEpisodicMemory(insight);

      // Bridge anomalies/alerts to Smart Suggestions for proactive user notification
      if (insight.type === 'anomaly' || insight.type === 'alert') {
        await this.createSmartSuggestion(insight);

        // Counterfactual Thinking (Byrne 2005, Stufe 9.3):
        // Generate 3 scenarios (best/base/worst) and store as hypotheses in Curiosity Engine
        this.generateCounterfactualHypotheses(insight).catch(err => {
          logger.warn('[InsightGenerator] Counterfactual hypothesis generation failed (non-critical)', {
            error: err instanceof Error ? err.message : String(err),
          });
        });
      }

      // Emit event for cross-system integration (proactive engine, smart suggestions)
      this.emitFactLearned(insight);
    } catch (error) {
      logger.error(`[InsightGenerator] Failed to store insight:`, error instanceof Error ? error : undefined);
    }
  }
  /**
   * Create a Smart Suggestion for anomalies/alerts so the user
   * gets proactive notification about business issues.
   */
  private async createSmartSuggestion(insight: {
    type: string;
    severity: string;
    title: string;
    description: string;
    recommendation: string;
    dataSource: string;
    metrics: Record<string, unknown>;
  }): Promise<void> {
    try {
      const { createSuggestion } = await import('../smart-suggestions');

      await createSuggestion('finance', {
        userId: 'system',
        type: 'business_anomaly',
        title: insight.title,
        description: `${insight.description} — ${insight.recommendation}`,
        priority: insight.severity === 'critical' ? 95 : 75,
        metadata: {
          insightType: insight.type,
          dataSource: insight.dataSource,
          metrics: insight.metrics,
          severity: insight.severity,
        },
      });

      logger.info(`[InsightGenerator] Smart suggestion created for: ${insight.title}`);
    } catch (error) {
      logger.warn('[InsightGenerator] Failed to create smart suggestion', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Store business insight as episodic memory so it can be recalled,
   * consolidated during sleep, and connected to other knowledge.
   */
  private async storeAsEpisodicMemory(insight: {
    type: string;
    severity: string;
    title: string;
    description: string;
    recommendation: string;
    dataSource: string;
    metrics: Record<string, unknown>;
  }): Promise<void> {
    try {
      const { episodicMemory } = await import('../memory/episodic-memory');
      const context: AIContext = 'finance'; // Business insights default to work context

      await episodicMemory.store(
        `Business ${insight.type}: ${insight.title}`,
        `${insight.description} Recommendation: ${insight.recommendation}`,
        `business-insight-${insight.dataSource}`,
        context,
      );

      logger.info(`[InsightGenerator] Insight bridged to episodic memory: ${insight.title}`);
    } catch (error) {
      // Non-critical — insight is already in business_insights table
      logger.warn('[InsightGenerator] Failed to bridge insight to episodic memory', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Counterfactual Thinking (Byrne 2005, Stufe 9.3):
   * When a business anomaly is detected, generate 3 scenarios:
   *   - Best Case: "Wenn der Trend anhält..."
   *   - Base Case: "Wahrscheinlichstes Ergebnis..."
   *   - Worst Case: "Wenn nichts getan wird..."
   * Each scenario becomes a hypothesis in the Curiosity Engine for weekly validation.
   */
  async generateCounterfactualHypotheses(insight: {
    type: string;
    title: string;
    description: string;
    dataSource: string;
    metrics: Record<string, unknown>;
  }): Promise<number> {
    const scenarios = [
      { label: 'Best Case', prefix: 'Wenn der positive Trend anhält: ', confidence: 0.3 },
      { label: 'Base Case', prefix: 'Wahrscheinlichstes Ergebnis: ', confidence: 0.5 },
      { label: 'Worst Case', prefix: 'Wenn nichts getan wird: ', confidence: 0.4 },
    ];

    let stored = 0;

    try {
      const context: AIContext = 'finance';
      for (const scenario of scenarios) {
        const hypothesis = `${scenario.prefix}${insight.description} (${scenario.label} — ${insight.title})`;

        await queryContext(context,
          `INSERT INTO hypotheses (hypothesis, source_type, source_entities, confidence, status, created_at, updated_at)
           VALUES ($1, 'analogy', $2, $3, 'pending', NOW(), NOW())
           ON CONFLICT DO NOTHING`,
          [
            hypothesis,
            JSON.stringify([insight.dataSource, insight.title]),
            scenario.confidence,
          ],
        );
        stored++;
      }

      logger.info(`[InsightGenerator] ${stored} counterfactual hypotheses generated for: ${insight.title}`);
    } catch (error) {
      logger.warn('[InsightGenerator] Failed to store counterfactual hypotheses', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return stored;
  }

  /**
   * Emit memory.fact_learned event so proactive engine and smart suggestions
   * can react to business insights in real-time.
   */
  private emitFactLearned(insight: {
    type: string;
    severity: string;
    title: string;
    dataSource: string;
    metrics: Record<string, unknown>;
  }): void {
    import('../event-system').then(({ emitSystemEvent }) =>
      emitSystemEvent({
        context: 'finance' as AIContext,
        eventType: 'memory.fact_learned',
        eventSource: 'business_insight_generator',
        payload: {
          factType: `business_${insight.type}`,
          content: insight.title,
          severity: insight.severity,
          dataSource: insight.dataSource,
          metrics: insight.metrics,
        },
      })
    ).catch(err => {
      logger.warn('Failed to emit memory.fact_learned for business insight', {
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }
}

export const insightGenerator = new InsightGenerator();
