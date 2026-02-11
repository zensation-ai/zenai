/**
 * Google Search Console Connector
 *
 * Connects to GSC API for SEO metrics: impressions, clicks, CTR, rankings.
 *
 * @module services/business/gsc-connector
 */

import { google, searchconsole_v1 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { pool } from '../../utils/database';
import { logger } from '../../utils/logger';
import type { BusinessConnector, SEOMetrics, SEOQuery, SEOPage } from '../../types/business';

class GSCConnector implements BusinessConnector {
  readonly sourceType = 'gsc' as const;
  private oauth2Client: OAuth2Client | null = null;
  private searchConsole: searchconsole_v1.Searchconsole | null = null;

  async initialize(): Promise<void> {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI;

    if (!clientId || !clientSecret) {
      logger.warn('[GSCConnector] Google OAuth credentials not configured - connector disabled');
      return;
    }

    this.oauth2Client = new OAuth2Client(clientId, clientSecret, redirectUri);

    // Try to restore tokens from DB
    try {
      const result = await pool.query(`
        SELECT credentials FROM business_data_sources
        WHERE source_type = 'gsc' AND status = 'active'
        LIMIT 1
      `);
      if (result.rows.length > 0 && result.rows[0].credentials?.tokens) {
        this.oauth2Client.setCredentials(result.rows[0].credentials.tokens);
        this.searchConsole = google.searchconsole({ version: 'v1', auth: this.oauth2Client });
        logger.info('[GSCConnector] Restored OAuth tokens from database');
      }
    } catch {
      logger.warn('[GSCConnector] Could not restore OAuth tokens');
    }
  }

  isAvailable(): boolean {
    return this.searchConsole !== null;
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    if (!this.searchConsole) {
      return { success: false, message: 'Google Search Console not authenticated. Complete OAuth flow first.' };
    }
    try {
      const sites = await this.searchConsole.sites.list();
      const count = sites.data.siteEntry?.length ?? 0;
      return { success: true, message: `Connected to GSC. ${count} sites found.` };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, message: `GSC connection failed: ${message}` };
    }
  }

  async collectMetrics(): Promise<Record<string, unknown>> {
    const siteUrl = process.env.GSC_SITE_URL;
    if (!siteUrl) return {};
    const metrics = await this.getSearchMetrics(siteUrl, '28d');
    return metrics as unknown as Record<string, unknown>;
  }

  // ============================================
  // OAuth Flow
  // ============================================

  getAuthorizeUrl(): string {
    if (!this.oauth2Client) throw new Error('OAuth client not initialized');
    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: ['https://www.googleapis.com/auth/webmasters.readonly'],
      prompt: 'consent',
    });
  }

  async exchangeCode(code: string): Promise<void> {
    if (!this.oauth2Client) throw new Error('OAuth client not initialized');

    const { tokens } = await this.oauth2Client.getToken(code);
    this.oauth2Client.setCredentials(tokens);
    this.searchConsole = google.searchconsole({ version: 'v1', auth: this.oauth2Client });

    // Store tokens in DB
    await pool.query(`
      INSERT INTO business_data_sources (source_type, display_name, credentials, status)
      VALUES ('gsc', 'Google Search Console', $1, 'active')
      ON CONFLICT (source_type) DO UPDATE SET
        credentials = $1,
        status = 'active',
        last_error = NULL,
        updated_at = NOW()
    `, [JSON.stringify({ tokens })]);

    logger.info('[GSCConnector] OAuth tokens stored successfully');
  }

  // ============================================
  // Search Metrics
  // ============================================

  async getSearchMetrics(siteUrl: string, period: string): Promise<SEOMetrics> {
    if (!this.searchConsole) throw new Error('GSC not authenticated');

    const days = period === '7d' ? 7 : period === '28d' ? 28 : period === '90d' ? 90 : 28;
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const previousStartDate = new Date(startDate);
    previousStartDate.setDate(previousStartDate.getDate() - days);

    const [current, previous] = await Promise.all([
      this.searchConsole.searchanalytics.query({
        siteUrl,
        requestBody: {
          startDate: startDate.toISOString().split('T')[0],
          endDate: endDate.toISOString().split('T')[0],
          dimensions: ['query'],
          rowLimit: 20,
        },
      }),
      this.searchConsole.searchanalytics.query({
        siteUrl,
        requestBody: {
          startDate: previousStartDate.toISOString().split('T')[0],
          endDate: startDate.toISOString().split('T')[0],
          dimensions: ['query'],
          rowLimit: 1,
        },
      }),
    ]);

    const totalImpressions = current.data.rows?.reduce((sum, r) => sum + (r.impressions ?? 0), 0) ?? 0;
    const totalClicks = current.data.rows?.reduce((sum, r) => sum + (r.clicks ?? 0), 0) ?? 0;
    const avgCTR = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
    const avgPosition = current.data.rows && current.data.rows.length > 0
      ? current.data.rows.reduce((sum, r) => sum + (r.position ?? 0), 0) / current.data.rows.length
      : 0;

    const prevImpressions = previous.data.rows?.reduce((sum, r) => sum + (r.impressions ?? 0), 0) ?? 0;
    const prevClicks = previous.data.rows?.reduce((sum, r) => sum + (r.clicks ?? 0), 0) ?? 0;

    const topQueries: SEOQuery[] = (current.data.rows ?? []).slice(0, 10).map(r => ({
      query: r.keys?.[0] ?? '',
      impressions: r.impressions ?? 0,
      clicks: r.clicks ?? 0,
      ctr: Math.round((r.ctr ?? 0) * 100 * 100) / 100,
      position: Math.round((r.position ?? 0) * 10) / 10,
    }));

    // Get top pages
    const pagesResult = await this.searchConsole.searchanalytics.query({
      siteUrl,
      requestBody: {
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0],
        dimensions: ['page'],
        rowLimit: 10,
      },
    });

    const topPages: SEOPage[] = (pagesResult.data.rows ?? []).map(r => ({
      page: r.keys?.[0] ?? '',
      impressions: r.impressions ?? 0,
      clicks: r.clicks ?? 0,
      ctr: Math.round((r.ctr ?? 0) * 100 * 100) / 100,
      position: Math.round((r.position ?? 0) * 10) / 10,
    }));

    return {
      impressions: totalImpressions,
      clicks: totalClicks,
      ctr: Math.round(avgCTR * 100) / 100,
      avgPosition: Math.round(avgPosition * 10) / 10,
      impressionsGrowth: prevImpressions > 0
        ? Math.round(((totalImpressions - prevImpressions) / prevImpressions) * 100 * 100) / 100
        : 0,
      clicksGrowth: prevClicks > 0
        ? Math.round(((totalClicks - prevClicks) / prevClicks) * 100 * 100) / 100
        : 0,
      topQueries,
      topPages,
    };
  }
}

export const gscConnector = new GSCConnector();
