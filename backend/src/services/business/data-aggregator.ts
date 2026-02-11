/**
 * Business Data Aggregation Service
 *
 * Orchestrates periodic data collection from all business connectors
 * and stores aggregated snapshots in the database.
 *
 * @module services/business/data-aggregator
 */

import { pool } from '../../utils/database';
import { logger } from '../../utils/logger';
import { stripeConnector } from './stripe-connector';
import { gscConnector } from './gsc-connector';
import { ga4Connector } from './ga4-connector';
import { uptimeConnector } from './uptime-connector';
import { lighthouseConnector } from './lighthouse-connector';

// ============================================
// Cron Schedule Configuration
// ============================================

const HOURLY_SCHEDULE = process.env.BUSINESS_METRICS_HOURLY_SCHEDULE ?? '0 * * * *';
const DAILY_SCHEDULE = process.env.BUSINESS_METRICS_DAILY_SCHEDULE ?? '0 4 * * *';

// ============================================
// Data Aggregation Service
// ============================================

class DataAggregatorService {
  private hourlyTimer: ReturnType<typeof setInterval> | null = null;
  private dailyTimer: ReturnType<typeof setInterval> | null = null;
  private isRunning = false;

  async start(): Promise<void> {
    if (!process.env.ENABLE_BUSINESS_METRICS) {
      logger.info('[DataAggregator] Business metrics disabled (ENABLE_BUSINESS_METRICS not set)');
      return;
    }

    this.isRunning = true;

    // Parse cron-like schedules to intervals
    // Hourly collection
    this.hourlyTimer = setInterval(() => {
      void this.collectHourlyMetrics();
    }, 60 * 60 * 1000); // Every hour

    // Daily collection at ~04:00
    this.scheduleDailyCollection();

    logger.info('[DataAggregator] Business metrics collection started');
    logger.info(`[DataAggregator] Hourly schedule: ${HOURLY_SCHEDULE}`);
    logger.info(`[DataAggregator] Daily schedule: ${DAILY_SCHEDULE}`);
  }

  stop(): void {
    this.isRunning = false;
    if (this.hourlyTimer) { clearInterval(this.hourlyTimer); }
    if (this.dailyTimer) { clearInterval(this.dailyTimer); }
    logger.info('[DataAggregator] Business metrics collection stopped');
  }

  private scheduleDailyCollection(): void {
    const now = new Date();
    const targetHour = 4; // 04:00
    const next = new Date(now);
    next.setHours(targetHour, 0, 0, 0);
    if (next <= now) { next.setDate(next.getDate() + 1); }

    const msUntilNext = next.getTime() - now.getTime();

    setTimeout(() => {
      void this.collectDailyMetrics();
      // Then repeat every 24 hours
      this.dailyTimer = setInterval(() => {
        void this.collectDailyMetrics();
      }, 24 * 60 * 60 * 1000);
    }, msUntilNext);
  }

  // ============================================
  // Hourly Collection (Revenue + Traffic)
  // ============================================

  async collectHourlyMetrics(): Promise<void> {
    if (!this.isRunning) return;
    logger.info('[DataAggregator] Starting hourly metrics collection');

    const metrics: Record<string, unknown> = {};

    // Collect from each available connector
    const collectors = [
      { name: 'stripe', connector: stripeConnector },
      { name: 'ga4', connector: ga4Connector },
    ];

    for (const { name, connector } of collectors) {
      if (!connector.isAvailable()) continue;
      try {
        metrics[name] = await connector.collectMetrics();
      } catch (error) {
        logger.error(`[DataAggregator] ${name} hourly collection failed:`, error instanceof Error ? error : undefined);
        await this.updateConnectorError(name, error instanceof Error ? error.message : 'Unknown error');
      }
    }

    // Store snapshot
    if (Object.keys(metrics).length > 0) {
      await this.storeSnapshot('hourly', metrics);
    }

    logger.info(`[DataAggregator] Hourly collection complete. Sources: ${Object.keys(metrics).join(', ') || 'none'}`);
  }

  // ============================================
  // Daily Collection (All sources)
  // ============================================

  async collectDailyMetrics(): Promise<void> {
    if (!this.isRunning) return;
    logger.info('[DataAggregator] Starting daily metrics collection');

    const metrics: Record<string, unknown> = {};

    const collectors = [
      { name: 'stripe', connector: stripeConnector },
      { name: 'ga4', connector: ga4Connector },
      { name: 'gsc', connector: gscConnector },
      { name: 'uptime', connector: uptimeConnector },
    ];

    for (const { name, connector } of collectors) {
      if (!connector.isAvailable()) continue;
      try {
        metrics[name] = await connector.collectMetrics();
        await this.updateConnectorSync(name);
      } catch (error) {
        logger.error(`[DataAggregator] ${name} daily collection failed:`, error instanceof Error ? error : undefined);
        await this.updateConnectorError(name, error instanceof Error ? error.message : 'Unknown error');
      }
    }

    // Lighthouse audits (separate - stores per-URL)
    if (lighthouseConnector.isAvailable()) {
      try {
        const urls = ['https://zensation.ai', 'https://frontend-mu-six-93.vercel.app'];
        for (const url of urls) {
          await lighthouseConnector.runAuditAndStore(url);
        }
        const latestScores = await lighthouseConnector.getLatestScores();
        if (latestScores) {
          metrics.lighthouse = latestScores;
        }
      } catch (error) {
        logger.error('[DataAggregator] Lighthouse daily collection failed:', error instanceof Error ? error : undefined);
      }
    }

    // Store daily snapshot
    if (Object.keys(metrics).length > 0) {
      await this.storeSnapshot('daily', metrics);
    }

    logger.info(`[DataAggregator] Daily collection complete. Sources: ${Object.keys(metrics).join(', ') || 'none'}`);

    // Trigger insight generation after daily collection
    try {
      const { insightGenerator } = await import('./insight-generator');
      await insightGenerator.generateDailyInsights();
      logger.info('[DataAggregator] Insight generation complete');
    } catch (error) {
      logger.error('[DataAggregator] Insight generation failed:', error instanceof Error ? error : undefined);
    }
  }

  // ============================================
  // Manual Trigger
  // ============================================

  async triggerCollection(): Promise<{ sources: string[]; errors: string[] }> {
    const sources: string[] = [];
    const errors: string[] = [];
    const metrics: Record<string, unknown> = {};

    const collectors = [
      { name: 'stripe', connector: stripeConnector },
      { name: 'ga4', connector: ga4Connector },
      { name: 'gsc', connector: gscConnector },
      { name: 'uptime', connector: uptimeConnector },
      { name: 'lighthouse', connector: lighthouseConnector },
    ];

    for (const { name, connector } of collectors) {
      if (!connector.isAvailable()) continue;
      try {
        metrics[name] = await connector.collectMetrics();
        sources.push(name);
      } catch (error) {
        errors.push(`${name}: ${error instanceof Error ? error.message : 'Unknown'}`);
      }
    }

    if (Object.keys(metrics).length > 0) {
      await this.storeSnapshot('daily', metrics);
    }

    return { sources, errors };
  }

  // ============================================
  // Snapshot Storage
  // ============================================

  private async storeSnapshot(type: string, metrics: Record<string, unknown>): Promise<void> {
    await pool.query(`
      INSERT INTO business_metrics_snapshots (snapshot_date, snapshot_type, metrics)
      VALUES (CURRENT_DATE, $1, $2)
    `, [type, JSON.stringify(metrics)]);
  }

  private async updateConnectorSync(sourceType: string): Promise<void> {
    await pool.query(`
      UPDATE business_data_sources
      SET last_sync = NOW(), last_error = NULL
      WHERE source_type = $1 AND status = 'active'
    `, [sourceType]);
  }

  private async updateConnectorError(sourceType: string, error: string): Promise<void> {
    await pool.query(`
      UPDATE business_data_sources
      SET last_error = $2, status = 'error'
      WHERE source_type = $1
    `, [sourceType, error]);
  }
}

export const dataAggregator = new DataAggregatorService();
