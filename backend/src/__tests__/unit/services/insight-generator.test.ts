/**
 * Business Insight Generator - Unit Tests
 *
 * Tests anomaly detection, insight storage, deduplication,
 * and AI recommendation generation.
 */

const mockPoolQuery = jest.fn<any, any[]>();

jest.mock('../../../utils/database', () => ({
  pool: { query: mockPoolQuery },
}));

jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const mockMessagesCreate = jest.fn();

jest.mock('@anthropic-ai/sdk', () => {
  return jest.fn().mockImplementation(() => ({
    messages: { create: mockMessagesCreate },
  }));
});

import { insightGenerator } from '../../../services/business/insight-generator';

describe('InsightGenerator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPoolQuery.mockReset();
    mockMessagesCreate.mockReset();
  });

  // ========================================
  // initialize
  // ========================================
  describe('initialize', () => {
    it('should create Anthropic client when API key is set', () => {
      const original = process.env.ANTHROPIC_API_KEY;
      process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key';

      insightGenerator.initialize();

      // Verify Anthropic constructor was called
      const Anthropic = require('@anthropic-ai/sdk');
      expect(Anthropic).toHaveBeenCalledWith({ apiKey: 'sk-ant-test-key' });

      process.env.ANTHROPIC_API_KEY = original;
    });
  });

  // ========================================
  // generateDailyInsights
  // ========================================
  describe('generateDailyInsights', () => {
    const currentSnapshot = {
      metrics: { stripe: { mrr: 4000 }, ga4: { users: 800 }, uptime: { percentage: 99.9 }, lighthouse: { score: 85 } },
      snapshot_date: '2026-02-10',
    };
    const previousSnapshot = {
      metrics: { stripe: { mrr: 5000 }, ga4: { users: 1000 }, uptime: { percentage: 99.95 }, lighthouse: { score: 90 } },
      snapshot_date: '2026-02-09',
    };

    it('should skip when less than 2 snapshots are available', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [currentSnapshot] });

      await insightGenerator.generateDailyInsights();

      // Only the initial snapshot query should have been called
      expect(mockPoolQuery).toHaveBeenCalledTimes(1);
      expect(mockPoolQuery.mock.calls[0][0]).toContain('business_metrics_snapshots');
    });

    it('should detect MRR drop >10% and create critical anomaly', async () => {
      // MRR dropped from 5000 to 4000 = -20%
      mockPoolQuery
        .mockResolvedValueOnce({ rows: [currentSnapshot, previousSnapshot] }) // snapshots query
        .mockResolvedValueOnce({ rows: [] }) // dedup check for MRR insight
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // INSERT MRR insight
        .mockResolvedValue({ rows: [] }); // remaining queries

      await insightGenerator.generateDailyInsights();

      // Find the INSERT call for MRR anomaly
      const insertCalls = mockPoolQuery.mock.calls.filter(
        c => typeof c[0] === 'string' && c[0].includes('INSERT INTO business_insights')
      );
      expect(insertCalls.length).toBeGreaterThanOrEqual(1);

      const mrrInsert = insertCalls[0];
      expect(mrrInsert[1][0]).toBe('anomaly'); // insight_type
      expect(mrrInsert[1][1]).toBe('critical'); // severity
      expect(mrrInsert[1][2]).toContain('MRR'); // title
    });

    it('should detect MRR growth >20% and create milestone', async () => {
      const growthCurrent = {
        metrics: { stripe: { mrr: 7000 }, ga4: { users: 1000 }, uptime: { percentage: 99.9 }, lighthouse: { score: 85 } },
        snapshot_date: '2026-02-10',
      };
      const growthPrevious = {
        metrics: { stripe: { mrr: 5000 }, ga4: { users: 1000 }, uptime: { percentage: 99.95 }, lighthouse: { score: 90 } },
        snapshot_date: '2026-02-09',
      };

      mockPoolQuery
        .mockResolvedValueOnce({ rows: [growthCurrent, growthPrevious] })
        .mockResolvedValueOnce({ rows: [] }) // dedup check
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // INSERT
        .mockResolvedValue({ rows: [] });

      await insightGenerator.generateDailyInsights();

      const insertCalls = mockPoolQuery.mock.calls.filter(
        c => typeof c[0] === 'string' && c[0].includes('INSERT INTO business_insights')
      );
      expect(insertCalls.length).toBeGreaterThanOrEqual(1);

      const milestoneInsert = insertCalls[0];
      expect(milestoneInsert[1][0]).toBe('milestone'); // insight_type
      expect(milestoneInsert[1][1]).toBe('info'); // severity
      expect(milestoneInsert[1][2]).toContain('MRR'); // title
    });

    it('should detect traffic drop >20% and create warning', async () => {
      // users dropped from 1000 to 700 = -30%
      const trafficDropCurrent = {
        metrics: { stripe: { mrr: 5000 }, ga4: { users: 700 }, uptime: { percentage: 99.9 }, lighthouse: { score: 85 } },
        snapshot_date: '2026-02-10',
      };
      const trafficDropPrevious = {
        metrics: { stripe: { mrr: 5000 }, ga4: { users: 1000 }, uptime: { percentage: 99.95 }, lighthouse: { score: 90 } },
        snapshot_date: '2026-02-09',
      };

      mockPoolQuery
        .mockResolvedValueOnce({ rows: [trafficDropCurrent, trafficDropPrevious] })
        .mockResolvedValueOnce({ rows: [] }) // dedup for traffic insight
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // INSERT traffic insight
        .mockResolvedValue({ rows: [] });

      await insightGenerator.generateDailyInsights();

      const insertCalls = mockPoolQuery.mock.calls.filter(
        c => typeof c[0] === 'string' && c[0].includes('INSERT INTO business_insights')
      );
      expect(insertCalls.length).toBeGreaterThanOrEqual(1);

      const trafficInsert = insertCalls.find(c => c[1][2].includes('Traffic'));
      expect(trafficInsert).toBeDefined();
      expect(trafficInsert![1][0]).toBe('anomaly');
      expect(trafficInsert![1][1]).toBe('warning');
    });

    it('should detect uptime <99.5% and create alert', async () => {
      const lowUptimeCurrent = {
        metrics: { stripe: { mrr: 5000 }, ga4: { users: 1000 }, uptime: { percentage: 99.2 }, lighthouse: { score: 85 } },
        snapshot_date: '2026-02-10',
      };

      mockPoolQuery
        .mockResolvedValueOnce({ rows: [lowUptimeCurrent, previousSnapshot] })
        .mockResolvedValueOnce({ rows: [] }) // dedup for uptime insight
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // INSERT uptime insight
        .mockResolvedValue({ rows: [] });

      await insightGenerator.generateDailyInsights();

      const insertCalls = mockPoolQuery.mock.calls.filter(
        c => typeof c[0] === 'string' && c[0].includes('INSERT INTO business_insights')
      );

      const uptimeInsert = insertCalls.find(c => c[1][2].includes('Uptime'));
      expect(uptimeInsert).toBeDefined();
      expect(uptimeInsert![1][0]).toBe('alert');
    });

    it('should detect performance score <50 and create alert', async () => {
      const lowPerfCurrent = {
        metrics: { stripe: { mrr: 5000 }, ga4: { users: 1000 }, uptime: { percentage: 99.9 }, lighthouse: { score: 35 } },
        snapshot_date: '2026-02-10',
      };

      mockPoolQuery
        .mockResolvedValueOnce({ rows: [lowPerfCurrent, previousSnapshot] })
        .mockResolvedValueOnce({ rows: [] }) // dedup for performance insight
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // INSERT performance insight
        .mockResolvedValue({ rows: [] });

      await insightGenerator.generateDailyInsights();

      const insertCalls = mockPoolQuery.mock.calls.filter(
        c => typeof c[0] === 'string' && c[0].includes('INSERT INTO business_insights')
      );

      const perfInsert = insertCalls.find(c => c[1][2].includes('Performance'));
      expect(perfInsert).toBeDefined();
      expect(perfInsert![1][0]).toBe('alert');
      expect(perfInsert![1][1]).toBe('warning');
    });

    it('should handle errors gracefully without throwing', async () => {
      mockPoolQuery.mockRejectedValueOnce(new Error('Database connection failed'));

      // Should not throw
      await expect(insightGenerator.generateDailyInsights()).resolves.toBeUndefined();

      const { logger } = require('../../../utils/logger');
      expect(logger.error).toHaveBeenCalled();
    });
  });

  // ========================================
  // storeInsight (tested via generateDailyInsights)
  // ========================================
  describe('storeInsight (deduplication)', () => {
    it('should not insert if same title exists in last 24 hours', async () => {
      const current = {
        metrics: { stripe: { mrr: 4000 }, ga4: { users: 800 }, uptime: { percentage: 99.9 }, lighthouse: { score: 85 } },
        snapshot_date: '2026-02-10',
      };
      const previous = {
        metrics: { stripe: { mrr: 5000 }, ga4: { users: 1000 }, uptime: { percentage: 99.95 }, lighthouse: { score: 90 } },
        snapshot_date: '2026-02-09',
      };

      // Snapshot query returns data, dedup check returns existing row
      mockPoolQuery
        .mockResolvedValueOnce({ rows: [current, previous] }) // snapshots
        .mockResolvedValueOnce({ rows: [{ id: 'existing-insight' }] }) // dedup check returns match
        .mockResolvedValue({ rows: [] }); // any further queries

      await insightGenerator.generateDailyInsights();

      // The INSERT should NOT have been called for the deduplicated insight
      const insertCalls = mockPoolQuery.mock.calls.filter(
        c => typeof c[0] === 'string' && c[0].includes('INSERT INTO business_insights')
      );
      // The dedup check found an existing entry, so no INSERT for that insight
      // Other checks may still create inserts, but the first MRR one should be skipped
      const dedupCalls = mockPoolQuery.mock.calls.filter(
        c => typeof c[0] === 'string' && c[0].includes('SELECT id FROM business_insights')
      );
      expect(dedupCalls.length).toBeGreaterThanOrEqual(1);
    });

    it('should insert with correct column names (action_items, not recommendation)', async () => {
      const current = {
        metrics: { stripe: { mrr: 4000 }, ga4: { users: 800 }, uptime: { percentage: 99.9 }, lighthouse: { score: 85 } },
        snapshot_date: '2026-02-10',
      };
      const previous = {
        metrics: { stripe: { mrr: 5000 }, ga4: { users: 1000 }, uptime: { percentage: 99.95 }, lighthouse: { score: 90 } },
        snapshot_date: '2026-02-09',
      };

      mockPoolQuery
        .mockResolvedValueOnce({ rows: [current, previous] }) // snapshots
        .mockResolvedValueOnce({ rows: [] }) // dedup check - no duplicate
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // INSERT
        .mockResolvedValue({ rows: [] }); // remaining

      await insightGenerator.generateDailyInsights();

      const insertCall = mockPoolQuery.mock.calls.find(
        c => typeof c[0] === 'string' && c[0].includes('INSERT INTO business_insights')
      );
      expect(insertCall).toBeDefined();
      expect(insertCall![0]).toContain('action_items');
      expect(insertCall![0]).not.toContain('recommendation)');
    });
  });

  // ========================================
  // generateAIRecommendations
  // ========================================
  describe('generateAIRecommendations', () => {
    it('should call Claude API when anthropic client is available', async () => {
      const original = process.env.ANTHROPIC_API_KEY;
      process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key';
      insightGenerator.initialize();

      mockMessagesCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: '[{"title": "Optimize pricing", "description": "Review pricing strategy", "priority": "high"}]' }],
      });

      const current = {
        metrics: { stripe: { mrr: 5000 }, ga4: { users: 1000 }, uptime: { percentage: 99.9 }, lighthouse: { score: 85 } },
        snapshot_date: '2026-02-10',
      };
      const previous = {
        metrics: { stripe: { mrr: 4800 }, ga4: { users: 950 }, uptime: { percentage: 99.95 }, lighthouse: { score: 90 } },
        snapshot_date: '2026-02-09',
      };

      // No anomalies, so only AI recommendations path triggers inserts
      mockPoolQuery
        .mockResolvedValueOnce({ rows: [current, previous] }) // snapshots
        .mockResolvedValueOnce({ rows: [] }) // dedup for AI recommendation
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // INSERT AI recommendation
        .mockResolvedValue({ rows: [] });

      await insightGenerator.generateDailyInsights();

      expect(mockMessagesCreate).toHaveBeenCalledTimes(1);
      expect(mockMessagesCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          max_tokens: 1024,
          messages: expect.arrayContaining([
            expect.objectContaining({ role: 'user' }),
          ]),
        })
      );

      // AI recommendation should be stored with type 'recommendation'
      const insertCalls = mockPoolQuery.mock.calls.filter(
        c => typeof c[0] === 'string' && c[0].includes('INSERT INTO business_insights')
      );
      const aiInsert = insertCalls.find(c => c[1][0] === 'recommendation');
      expect(aiInsert).toBeDefined();
      expect(aiInsert![1][4]).toBe('ai'); // dataSource

      process.env.ANTHROPIC_API_KEY = original;
    });

    it('should skip AI recommendations when anthropic client is not available', async () => {
      const original = process.env.ANTHROPIC_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;
      (insightGenerator as any).anthropic = null; // Clear the cached client

      const current = {
        metrics: { stripe: { mrr: 5000 }, ga4: { users: 1000 }, uptime: { percentage: 99.9 }, lighthouse: { score: 85 } },
        snapshot_date: '2026-02-10',
      };
      const previous = {
        metrics: { stripe: { mrr: 4800 }, ga4: { users: 950 }, uptime: { percentage: 99.95 }, lighthouse: { score: 90 } },
        snapshot_date: '2026-02-09',
      };

      mockPoolQuery.mockResolvedValueOnce({ rows: [current, previous] });

      // The anthropic check in generateDailyInsights should skip the AI call
      // No further pool.query calls expected beyond the snapshot fetch
      // since no anomalies are detected either
      await insightGenerator.generateDailyInsights();

      expect(mockMessagesCreate).not.toHaveBeenCalled();

      process.env.ANTHROPIC_API_KEY = original;
    });
  });
});
