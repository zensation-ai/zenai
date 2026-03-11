/**
 * Business Report Generator - Unit Tests
 *
 * Tests weekly/monthly report generation, metric aggregation,
 * correct DB column names, and AI summary generation.
 */

var mockPoolQuery = jest.fn<any, any[]>();

jest.mock('../../../utils/database', () => ({
  pool: { query: (...args: any[]) => mockPoolQuery(...args) },
}));

jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

var mockMessagesCreate = jest.fn();

jest.mock('@anthropic-ai/sdk', () => {
  return jest.fn().mockImplementation(() => ({
    messages: { create: (...args: any[]) => mockMessagesCreate(...args) },
  }));
});

import { reportGenerator } from '../../../services/business/report-generator';

describe('ReportGenerator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPoolQuery.mockReset();
    mockMessagesCreate.mockReset();
  });

  // Helper: build snapshot rows for a period
  const buildSnapshots = (count: number) => {
    const rows = [];
    for (let i = 0; i < count; i++) {
      rows.push({
        metrics: {
          stripe: { mrr: 5000 + i * 100 },
          ga4: { users: 1000 + i * 10 },
          gsc: { impressions: 2000 + i * 50 },
          uptime: { percentage: 99.9 },
          lighthouse: { score: 85 + i },
        },
        snapshot_date: new Date(Date.now() - (count - i) * 86400000).toISOString(),
      });
    }
    return rows;
  };

  const buildInsights = () => [
    {
      insight_type: 'anomaly',
      title: 'MRR-Einbruch erkannt',
      severity: 'critical',
      description: 'MRR dropped by 15%',
      created_at: new Date().toISOString(),
    },
    {
      insight_type: 'recommendation',
      title: 'Optimize SEO',
      severity: 'info',
      description: 'Improve meta tags',
      created_at: new Date().toISOString(),
    },
  ];

  // ========================================
  // generateWeeklyReport
  // ========================================
  describe('generateWeeklyReport', () => {
    it('should create a report with 7-day period', async () => {
      const snapshots = buildSnapshots(7);
      const insights = buildInsights();

      mockPoolQuery
        .mockResolvedValueOnce({ rows: snapshots }) // snapshots query
        .mockResolvedValueOnce({ rows: insights })  // insights query
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }); // INSERT report

      await reportGenerator.generateWeeklyReport();

      // Verify snapshots query uses date range
      const snapshotsCall = mockPoolQuery.mock.calls[0];
      expect(snapshotsCall[0]).toContain('business_metrics_snapshots');
      expect(snapshotsCall[0]).toContain('BETWEEN');

      // Verify INSERT was called
      const insertCall = mockPoolQuery.mock.calls.find(
        c => typeof c[0] === 'string' && c[0].includes('INSERT INTO business_reports')
      );
      expect(insertCall).toBeDefined();
      expect(insertCall![1][0]).toBe('weekly'); // report_type
    });
  });

  // ========================================
  // generateMonthlyReport
  // ========================================
  describe('generateMonthlyReport', () => {
    it('should create a report with 30-day period', async () => {
      const snapshots = buildSnapshots(30);
      const insights = buildInsights();

      mockPoolQuery
        .mockResolvedValueOnce({ rows: snapshots })
        .mockResolvedValueOnce({ rows: insights })
        .mockResolvedValueOnce({ rows: [{ id: 1 }] });

      await reportGenerator.generateMonthlyReport();

      const insertCall = mockPoolQuery.mock.calls.find(
        c => typeof c[0] === 'string' && c[0].includes('INSERT INTO business_reports')
      );
      expect(insertCall).toBeDefined();
      expect(insertCall![1][0]).toBe('monthly'); // report_type
    });
  });

  // ========================================
  // generateReport - column names
  // ========================================
  describe('generateReport (DB column names)', () => {
    it('should use correct DB column names (summary, metrics, insights, recommendations)', async () => {
      const snapshots = buildSnapshots(7);
      const insights = buildInsights();

      mockPoolQuery
        .mockResolvedValueOnce({ rows: snapshots })
        .mockResolvedValueOnce({ rows: insights })
        .mockResolvedValueOnce({ rows: [{ id: 1 }] });

      await reportGenerator.generateWeeklyReport();

      const insertCall = mockPoolQuery.mock.calls.find(
        c => typeof c[0] === 'string' && c[0].includes('INSERT INTO business_reports')
      );
      expect(insertCall).toBeDefined();

      const sql = insertCall![0] as string;
      // Correct column names
      expect(sql).toContain('summary');
      expect(sql).toContain('metrics');
      expect(sql).toContain('insights');
      expect(sql).toContain('recommendations');
      // Must NOT use wrong column names
      expect(sql).not.toContain('executive_summary');
      expect(sql).not.toContain('metrics_summary');
      expect(sql).not.toContain('insights_summary');
    });
  });

  // ========================================
  // generateReport - metric aggregation
  // ========================================
  describe('generateReport (metrics aggregation)', () => {
    it('should aggregate metrics from snapshots correctly', async () => {
      const snapshots = [
        {
          metrics: { stripe: { mrr: 4000 }, ga4: { users: 800 }, gsc: { impressions: 1500 }, uptime: { percentage: 99.8 }, lighthouse: { score: 80 } },
          snapshot_date: new Date(Date.now() - 7 * 86400000).toISOString(),
        },
        {
          metrics: { stripe: { mrr: 5000 }, ga4: { users: 1000 }, gsc: { impressions: 2000 }, uptime: { percentage: 99.9 }, lighthouse: { score: 90 } },
          snapshot_date: new Date().toISOString(),
        },
      ];

      mockPoolQuery
        .mockResolvedValueOnce({ rows: snapshots })
        .mockResolvedValueOnce({ rows: [] }) // no insights
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }); // INSERT

      await reportGenerator.generateWeeklyReport();

      const insertCall = mockPoolQuery.mock.calls.find(
        c => typeof c[0] === 'string' && c[0].includes('INSERT INTO business_reports')
      );
      expect(insertCall).toBeDefined();

      // metrics parameter (index 4 in params array, 0-indexed)
      const metricsJson = JSON.parse(insertCall![1][4]);
      // aggregateMetrics uses the last snapshot for latest values
      expect(metricsJson.mrr).toBe(5000);
      expect(metricsJson.users).toBe(1000);
      expect(metricsJson.snapshotCount).toBe(2);
      // mrrChange = (5000 - 4000) / 4000 = 0.25
      expect(metricsJson.mrrChange).toBeCloseTo(0.25, 2);
      // usersChange = (1000 - 800) / 800 = 0.25
      expect(metricsJson.usersChange).toBeCloseTo(0.25, 2);
    });
  });

  // ========================================
  // generateReport - includes insights
  // ========================================
  describe('generateReport (insights inclusion)', () => {
    it('should include insights from the period in the report', async () => {
      const snapshots = buildSnapshots(3);
      const insights = buildInsights();

      mockPoolQuery
        .mockResolvedValueOnce({ rows: snapshots })
        .mockResolvedValueOnce({ rows: insights })
        .mockResolvedValueOnce({ rows: [{ id: 1 }] });

      await reportGenerator.generateWeeklyReport();

      const insertCall = mockPoolQuery.mock.calls.find(
        c => typeof c[0] === 'string' && c[0].includes('INSERT INTO business_reports')
      );
      expect(insertCall).toBeDefined();

      // insights parameter (index 5 in params array)
      const insightsJson = JSON.parse(insertCall![1][5]);
      expect(insightsJson).toHaveLength(2);
      expect(insightsJson[0]).toHaveProperty('type');
      expect(insightsJson[0]).toHaveProperty('title');
      expect(insightsJson[0]).toHaveProperty('severity');
    });
  });

  // ========================================
  // generateReport - fallback summary
  // ========================================
  describe('generateReport (fallback summary)', () => {
    it('should use fallback summary when no AI is available', async () => {
      const original = process.env.ANTHROPIC_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;

      const snapshots = buildSnapshots(3);

      mockPoolQuery
        .mockResolvedValueOnce({ rows: snapshots })
        .mockResolvedValueOnce({ rows: [] }) // no insights
        .mockResolvedValueOnce({ rows: [{ id: 1 }] });

      await reportGenerator.generateWeeklyReport();

      const insertCall = mockPoolQuery.mock.calls.find(
        c => typeof c[0] === 'string' && c[0].includes('INSERT INTO business_reports')
      );
      expect(insertCall).toBeDefined();

      // summary parameter (index 3) should be the fallback string
      const summary = insertCall![1][3] as string;
      expect(summary).toContain('bericht');

      // AI should not have been called
      expect(mockMessagesCreate).not.toHaveBeenCalled();

      process.env.ANTHROPIC_API_KEY = original;
    });
  });

  // ========================================
  // generateAISummary
  // ========================================
  describe('generateAISummary', () => {
    it('should call Claude API with correct prompt structure', async () => {
      const original = process.env.ANTHROPIC_API_KEY;
      process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key';
      reportGenerator.initialize();

      mockMessagesCreate.mockResolvedValueOnce({
        content: [{
          type: 'text',
          text: '{"summary": "Positive Woche mit MRR-Wachstum.", "recommendations": ["SEO optimieren", "Pricing ueberarbeiten"]}',
        }],
      });

      const snapshots = buildSnapshots(7);
      const insights = buildInsights();

      mockPoolQuery
        .mockResolvedValueOnce({ rows: snapshots })
        .mockResolvedValueOnce({ rows: insights })
        .mockResolvedValueOnce({ rows: [{ id: 1 }] });

      await reportGenerator.generateWeeklyReport();

      expect(mockMessagesCreate).toHaveBeenCalledTimes(1);
      expect(mockMessagesCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          max_tokens: 1024,
          messages: expect.arrayContaining([
            expect.objectContaining({
              role: 'user',
              content: expect.stringContaining('Wochenbericht'),
            }),
          ]),
        })
      );

      // Verify the AI summary was stored (not the fallback)
      const insertCall = mockPoolQuery.mock.calls.find(
        c => typeof c[0] === 'string' && c[0].includes('INSERT INTO business_reports')
      );
      expect(insertCall).toBeDefined();

      const summary = insertCall![1][3] as string;
      expect(summary).toContain('MRR-Wachstum');

      const recommendations = JSON.parse(insertCall![1][6]);
      expect(recommendations).toContain('SEO optimieren');
      expect(recommendations).toContain('Pricing ueberarbeiten');

      process.env.ANTHROPIC_API_KEY = original;
    });
  });

  // ========================================
  // Error handling
  // ========================================
  describe('error handling', () => {
    it('should handle database errors gracefully without throwing', async () => {
      mockPoolQuery.mockRejectedValueOnce(new Error('Connection refused'));

      await expect(reportGenerator.generateWeeklyReport()).resolves.toBeUndefined();

      const { logger } = require('../../../utils/logger');
      expect(logger.error).toHaveBeenCalled();
    });
  });
});
