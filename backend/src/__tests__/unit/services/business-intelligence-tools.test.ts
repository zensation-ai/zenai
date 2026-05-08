/**
 * Business Intelligence Tools - Unit Tests (Stufe 6.3)
 *
 * Tests the 3 memory-connected business tools:
 * - get_business_kpis: Aggregated KPI overview
 * - analyze_business_trend: Trend analysis with memory
 * - get_business_anomalies: Anomalies with context
 */

var mockPoolQuery = jest.fn<any, any[]>();

jest.mock('../../../utils/database', () => ({
  pool: { query: (...args: any[]) => mockPoolQuery(...args) },
}));

jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

var mockStripeCollect = jest.fn<any, any[]>();
var mockGA4Collect = jest.fn<any, any[]>();
var mockGSCCollect = jest.fn<any, any[]>();
var mockUptimeCollect = jest.fn<any, any[]>();

jest.mock('../../../services/business', () => ({
  stripeConnector: { collectMetrics: (...a: any[]) => mockStripeCollect(...a) },
  ga4Connector: { collectMetrics: (...a: any[]) => mockGA4Collect(...a) },
  gscConnector: { collectMetrics: (...a: any[]) => mockGSCCollect(...a) },
  uptimeConnector: { collectMetrics: (...a: any[]) => mockUptimeCollect(...a) },
  lighthouseConnector: { collectMetrics: jest.fn() },
}));

import {
  handleGetBusinessKPIs,
  handleAnalyzeBusinessTrend,
  handleGetBusinessAnomalies,
} from '../../../services/tool-handlers/business-intelligence-tools';

const execCtx = { aiContext: 'finance' as const } as any;

describe('Business Intelligence Tools', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPoolQuery.mockReset();
    mockStripeCollect.mockReset();
    mockGA4Collect.mockReset();
    mockGSCCollect.mockReset();
    mockUptimeCollect.mockReset();
  });

  // ========================================
  // get_business_kpis
  // ========================================
  describe('handleGetBusinessKPIs', () => {
    it('should aggregate all available metrics', async () => {
      mockStripeCollect.mockResolvedValue({ mrr: 5000, arr: 60000, churnRate: 2.1 });
      mockGA4Collect.mockResolvedValue({ users: 1200, sessions: 3000, bounceRate: 45 });
      mockGSCCollect.mockResolvedValue({ impressions: 50000, clicks: 2500, ctr: 5.0 });
      mockUptimeCollect.mockResolvedValue({ percentage: 99.95 });
      mockPoolQuery.mockResolvedValue({ rows: [] }); // no recent insights

      const result = await handleGetBusinessKPIs({}, execCtx);

      expect(result).toContain('Business KPI');
      expect(result).toContain('MRR');
      expect(result).toContain('5000');
      expect(result).toContain('1200');
      expect(result).toContain('50000');
      expect(result).toContain('99.95');
    });

    it('should show recent insights when available', async () => {
      mockStripeCollect.mockResolvedValue({ mrr: 5000 });
      mockGA4Collect.mockResolvedValue({ users: 1000 });
      mockGSCCollect.mockResolvedValue({ impressions: 5000 });
      mockUptimeCollect.mockResolvedValue({ percentage: 99.9 });
      mockPoolQuery.mockResolvedValue({
        rows: [{ title: 'MRR-Einbruch erkannt', severity: 'critical', created_at: '2026-04-07' }],
      });

      const result = await handleGetBusinessKPIs({}, execCtx);

      expect(result).toContain('Letzte Insights');
      expect(result).toContain('MRR-Einbruch');
      expect(result).toContain('critical');
    });

    it('should handle connector failures gracefully', async () => {
      mockStripeCollect.mockRejectedValue(new Error('Stripe unavailable'));
      mockGA4Collect.mockRejectedValue(new Error('GA4 unavailable'));
      mockGSCCollect.mockRejectedValue(new Error('GSC unavailable'));
      mockUptimeCollect.mockRejectedValue(new Error('Uptime unavailable'));
      mockPoolQuery.mockResolvedValue({ rows: [] });

      const result = await handleGetBusinessKPIs({}, execCtx);

      expect(result).toContain('Nicht verfügbar');
      // Should not throw
      expect(result).toContain('Business KPI');
    });
  });

  // ========================================
  // analyze_business_trend
  // ========================================
  describe('handleAnalyzeBusinessTrend', () => {
    it('should analyze revenue trend over 30 days', async () => {
      mockPoolQuery
        .mockResolvedValueOnce({
          rows: [
            { snapshot_date: '2026-03-08', metrics: { stripe: { mrr: 4000 } } },
            { snapshot_date: '2026-03-15', metrics: { stripe: { mrr: 4500 } } },
            { snapshot_date: '2026-03-22', metrics: { stripe: { mrr: 5000 } } },
          ],
        })
        .mockResolvedValue({ rows: [] }); // no insights

      const result = await handleAnalyzeBusinessTrend({ metric: 'revenue', period: '30d' }, execCtx);

      expect(result).toContain('Revenue-Trend');
      expect(result).toContain('Steigend');
      expect(result).toContain('Datenpunkte');
    });

    it('should report insufficient data', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ snapshot_date: '2026-04-07', metrics: {} }] });

      const result = await handleAnalyzeBusinessTrend({ metric: 'traffic' }, execCtx);

      expect(result).toContain('Nicht genügend Daten');
    });

    it('should show related insights for the metric', async () => {
      mockPoolQuery
        .mockResolvedValueOnce({
          rows: [
            { snapshot_date: '2026-03-08', metrics: { ga4: { users: 1000 } } },
            { snapshot_date: '2026-04-07', metrics: { ga4: { users: 800 } } },
          ],
        })
        .mockResolvedValueOnce({
          rows: [{ title: 'Traffic-Rückgang erkannt', severity: 'warning' }],
        });

      const result = await handleAnalyzeBusinessTrend({ metric: 'traffic', period: '30d' }, execCtx);

      expect(result).toContain('Relevante Insights');
      expect(result).toContain('Traffic-Rückgang');
    });
  });

  // ========================================
  // get_business_anomalies
  // ========================================
  describe('handleGetBusinessAnomalies', () => {
    it('should list recent anomalies', async () => {
      mockPoolQuery.mockResolvedValue({
        rows: [{
          id: '1',
          insight_type: 'anomaly',
          severity: 'critical',
          title: 'MRR-Einbruch erkannt',
          description: 'MRR ist um 20% gesunken',
          data_source: 'stripe',
          related_metrics: JSON.stringify({ currMRR: 4000, prevMRR: 5000 }),
          action_items: JSON.stringify([{ title: 'Prüfe Kündigungen' }]),
          created_at: '2026-04-07',
        }],
      });

      const result = await handleGetBusinessAnomalies({}, execCtx);

      expect(result).toContain('Business-Anomalien');
      expect(result).toContain('MRR-Einbruch');
      expect(result).toContain('CRITICAL');
      expect(result).toContain('stripe');
      expect(result).toContain('Prüfe Kündigungen');
    });

    it('should filter by severity', async () => {
      mockPoolQuery.mockResolvedValue({ rows: [] });

      const result = await handleGetBusinessAnomalies({ severity: 'critical' }, execCtx);

      expect(result).toContain('critical');
      // Verify the query used the severity filter
      const queryStr = mockPoolQuery.mock.calls[0][0] as string;
      expect(queryStr).toContain('severity = $1');
      expect(mockPoolQuery.mock.calls[0][1]).toEqual(['critical']);
    });

    it('should report when no anomalies exist', async () => {
      mockPoolQuery.mockResolvedValue({ rows: [] });

      const result = await handleGetBusinessAnomalies({}, execCtx);

      expect(result).toContain('Keine Anomalien');
      expect(result).toContain('normal');
    });
  });
});
