/**
 * Lighthouse/PageSpeed Connector
 *
 * Uses Google PageSpeed Insights API for web performance metrics.
 *
 * @module services/business/lighthouse-connector
 */

import axios from 'axios';
import { pool } from '../../utils/database';
import { logger } from '../../utils/logger';
import type { BusinessConnector, PerformanceMetrics } from '../../types/business';

const PAGESPEED_API = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';

class LighthouseConnector implements BusinessConnector {
  readonly sourceType = 'lighthouse' as const;
  private apiKey: string | null = null;

  async initialize(): Promise<void> {
    this.apiKey = process.env.GOOGLE_PAGESPEED_API_KEY ?? null;
    // PageSpeed API works without a key but has stricter rate limits
    logger.info(`[LighthouseConnector] Initialized ${this.apiKey ? 'with API key' : 'without API key (rate-limited)'}`);
  }

  isAvailable(): boolean {
    // Always available - works with or without API key
    return true;
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      const scores = await this.getScores('https://zensation.ai');
      return {
        success: true,
        message: `PageSpeed API working. Performance score for zensation.ai: ${scores.score}/100`,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, message: `PageSpeed API failed: ${message}` };
    }
  }

  async collectMetrics(): Promise<Record<string, unknown>> {
    const urls = await this.getConfiguredUrls();
    if (urls.length === 0) { return {}; }

    const scores = await this.getScores(urls[0]);
    return scores as unknown as Record<string, unknown>;
  }

  // ============================================
  // Performance Scores
  // ============================================

  async getScores(url: string): Promise<PerformanceMetrics> {
    const params: Record<string, string> = {
      url,
      strategy: 'mobile',
      category: 'performance',
    };
    if (this.apiKey) {
      params.key = this.apiKey;
    }

    const response = await axios.get(PAGESPEED_API, {
      params,
      timeout: 60000,
    });

    const result = response.data;
    const lighthouse = result.lighthouseResult;
    const categories = lighthouse?.categories ?? {};
    const audits = lighthouse?.audits ?? {};

    return {
      score: Math.round((categories.performance?.score ?? 0) * 100),
      accessibilityScore: Math.round((categories.accessibility?.score ?? 0) * 100),
      bestPracticesScore: Math.round((categories['best-practices']?.score ?? 0) * 100),
      seoScore: Math.round((categories.seo?.score ?? 0) * 100),
      lcp: Math.round(audits['largest-contentful-paint']?.numericValue ?? 0),
      fid: Math.round(audits['max-potential-fid']?.numericValue ?? 0),
      cls: Math.round((audits['cumulative-layout-shift']?.numericValue ?? 0) * 1000) / 1000,
    };
  }

  async runAuditAndStore(url: string): Promise<void> {
    try {
      const scores = await this.getScores(url);

      await pool.query(`
        INSERT INTO performance_scores (
          url, audit_date, performance_score, accessibility_score,
          best_practices_score, seo_score, lcp, fid, cls, metrics
        )
        VALUES ($1, CURRENT_DATE, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [
        url,
        scores.score,
        scores.accessibilityScore,
        scores.bestPracticesScore,
        scores.seoScore,
        scores.lcp,
        scores.fid,
        scores.cls,
        JSON.stringify(scores),
      ]);

      logger.info(`[LighthouseConnector] Audit stored for ${url}: ${scores.score}/100`);
    } catch (error) {
      logger.error(`[LighthouseConnector] Audit failed for ${url}:`, error instanceof Error ? error : undefined);
    }
  }

  async getLatestScores(url?: string): Promise<PerformanceMetrics | null> {
    const query = url
      ? `SELECT * FROM performance_scores WHERE url = $1 ORDER BY audit_date DESC LIMIT 1`
      : `SELECT * FROM performance_scores ORDER BY audit_date DESC LIMIT 1`;

    const result = url
      ? await pool.query(query, [url])
      : await pool.query(query);

    if (result.rows.length === 0) { return null; }

    const row = result.rows[0];
    return {
      score: row.performance_score ?? 0,
      accessibilityScore: row.accessibility_score ?? 0,
      bestPracticesScore: row.best_practices_score ?? 0,
      seoScore: row.seo_score ?? 0,
      lcp: row.lcp ?? 0,
      fid: row.fid ?? 0,
      cls: row.cls ?? 0,
    };
  }

  private async getConfiguredUrls(): Promise<string[]> {
    try {
      const result = await pool.query(`
        SELECT config->>'urls' as urls FROM business_data_sources
        WHERE source_type = 'lighthouse' AND status = 'active'
        LIMIT 1
      `);
      if (result.rows.length > 0 && result.rows[0].urls) {
        return JSON.parse(result.rows[0].urls);
      }
    } catch { /* ignore */ }
    // Default URLs
    return ['https://zensation.ai', 'https://frontend-mu-six-93.vercel.app'];
  }
}

export const lighthouseConnector = new LighthouseConnector();
