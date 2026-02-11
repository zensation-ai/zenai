/**
 * Google Analytics 4 Connector
 *
 * Connects to GA4 Data API for traffic metrics: users, sessions, pageviews.
 *
 * @module services/business/ga4-connector
 */

import { BetaAnalyticsDataClient } from '@google-analytics/data';
import { logger } from '../../utils/logger';
import type { BusinessConnector, TrafficMetrics, TopPage, TrafficSource } from '../../types/business';

class GA4Connector implements BusinessConnector {
  readonly sourceType = 'ga4' as const;
  private client: BetaAnalyticsDataClient | null = null;
  private propertyId: string | null = null;

  async initialize(): Promise<void> {
    this.propertyId = process.env.GA4_PROPERTY_ID ?? null;
    const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;

    if (!this.propertyId) {
      logger.warn('[GA4Connector] GA4_PROPERTY_ID not configured - connector disabled');
      return;
    }

    try {
      if (clientEmail && privateKey) {
        this.client = new BetaAnalyticsDataClient({
          credentials: {
            client_email: clientEmail,
            private_key: privateKey.replace(/\\n/g, '\n'),
          },
        });
      } else {
        // Fall back to Application Default Credentials
        this.client = new BetaAnalyticsDataClient();
      }
      logger.info('[GA4Connector] Initialized successfully');
    } catch (error) {
      logger.warn(`[GA4Connector] Could not initialize: ${error instanceof Error ? error.message : 'Unknown'}`);
    }
  }

  isAvailable(): boolean {
    return this.client !== null && this.propertyId !== null;
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    if (!this.client || !this.propertyId) {
      return { success: false, message: 'GA4 not configured. Set GA4_PROPERTY_ID.' };
    }
    try {
      const [response] = await this.client.runReport({
        property: `properties/${this.propertyId}`,
        dateRanges: [{ startDate: '1daysAgo', endDate: 'today' }],
        metrics: [{ name: 'activeUsers' }],
      });
      const users = response.rows?.[0]?.metricValues?.[0]?.value ?? '0';
      return { success: true, message: `Connected to GA4 property ${this.propertyId}. Active users today: ${users}` };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, message: `GA4 connection failed: ${message}` };
    }
  }

  async collectMetrics(): Promise<Record<string, unknown>> {
    const metrics = await this.getTrafficMetrics('7d');
    return metrics as unknown as Record<string, unknown>;
  }

  // ============================================
  // Traffic Metrics
  // ============================================

  async getTrafficMetrics(period: string): Promise<TrafficMetrics> {
    if (!this.client || !this.propertyId) {throw new Error('GA4 not initialized');}

    const days = period === '1d' ? 1 : period === '7d' ? 7 : period === '30d' ? 30 : period === '90d' ? 90 : 7;
    const startDate = `${days}daysAgo`;

    // Main metrics
    const [metricsResponse] = await this.client.runReport({
      property: `properties/${this.propertyId}`,
      dateRanges: [
        { startDate, endDate: 'today' },
        { startDate: `${days * 2}daysAgo`, endDate: `${days}daysAgo` },
      ],
      metrics: [
        { name: 'totalUsers' },
        { name: 'newUsers' },
        { name: 'sessions' },
        { name: 'screenPageViews' },
        { name: 'bounceRate' },
        { name: 'averageSessionDuration' },
        { name: 'conversions' },
      ],
    });

    const currentRow = metricsResponse.rows?.[0]?.metricValues ?? [];
    const previousRow = metricsResponse.rows?.[1]?.metricValues ?? [];

    const users = parseInt(currentRow[0]?.value ?? '0', 10);
    const prevUsers = parseInt(previousRow[0]?.value ?? '0', 10);

    // Top pages
    const [pagesResponse] = await this.client.runReport({
      property: `properties/${this.propertyId}`,
      dateRanges: [{ startDate, endDate: 'today' }],
      dimensions: [{ name: 'pagePath' }],
      metrics: [
        { name: 'screenPageViews' },
        { name: 'bounceRate' },
      ],
      limit: 10,
      orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
    });

    const topPages: TopPage[] = (pagesResponse.rows ?? []).map((row) => ({
      page: row.dimensionValues?.[0]?.value ?? '',
      views: parseInt(row.metricValues?.[0]?.value ?? '0', 10),
      bounceRate: parseFloat(row.metricValues?.[1]?.value ?? '0') * 100,
    }));

    // Traffic sources
    const [sourcesResponse] = await this.client.runReport({
      property: `properties/${this.propertyId}`,
      dateRanges: [{ startDate, endDate: 'today' }],
      dimensions: [{ name: 'sessionSource' }],
      metrics: [
        { name: 'totalUsers' },
        { name: 'sessions' },
      ],
      limit: 10,
      orderBys: [{ metric: { metricName: 'totalUsers' }, desc: true }],
    });

    const trafficSources: TrafficSource[] = (sourcesResponse.rows ?? []).map((row) => ({
      source: row.dimensionValues?.[0]?.value ?? 'unknown',
      users: parseInt(row.metricValues?.[0]?.value ?? '0', 10),
      sessions: parseInt(row.metricValues?.[1]?.value ?? '0', 10),
    }));

    return {
      users,
      newUsers: parseInt(currentRow[1]?.value ?? '0', 10),
      sessions: parseInt(currentRow[2]?.value ?? '0', 10),
      pageviews: parseInt(currentRow[3]?.value ?? '0', 10),
      bounceRate: Math.round(parseFloat(currentRow[4]?.value ?? '0') * 100 * 100) / 100,
      avgSessionDuration: Math.round(parseFloat(currentRow[5]?.value ?? '0')),
      conversions: parseInt(currentRow[6]?.value ?? '0', 10),
      usersGrowth: prevUsers > 0
        ? Math.round(((users - prevUsers) / prevUsers) * 100 * 100) / 100
        : 0,
      topPages,
      trafficSources,
    };
  }
}

export const ga4Connector = new GA4Connector();
