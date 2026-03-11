/**
 * AI Usage Tracker - Unit Tests
 */

import {
  calculateCost,
  recordUsage,
  getUsageStats,
  getDailyUsage,
} from '../../../services/ai-usage-tracker';
import type { AIUsageEntry } from '../../../services/ai-usage-tracker';

// Mock database
var mockQueryPublic = jest.fn();
jest.mock('../../../utils/database-context', () => ({
  queryPublic: (...args: unknown[]) => mockQueryPublic(...args),
}));

jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

describe('AI Usage Tracker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryPublic.mockReset();
  });

  // ========================================
  // calculateCost
  // ========================================
  describe('calculateCost', () => {
    it('should calculate cost for Sonnet model', () => {
      // 1000 input tokens at $3/1M = $0.003
      // 500 output tokens at $15/1M = $0.0075
      const cost = calculateCost('claude-sonnet-4-20250514', 1000, 500);
      expect(cost).toBeCloseTo(0.0105, 4);
    });

    it('should include thinking tokens at output rate', () => {
      const costWithThinking = calculateCost('claude-sonnet-4-20250514', 1000, 500, 200);
      const costWithout = calculateCost('claude-sonnet-4-20250514', 1000, 500, 0);
      expect(costWithThinking).toBeGreaterThan(costWithout);
      // 200 thinking tokens at $15/1M = $0.003
      expect(costWithThinking - costWithout).toBeCloseTo(0.003, 4);
    });

    it('should use default pricing for unknown models', () => {
      const cost = calculateCost('unknown-model', 1000, 500);
      // Same as Sonnet default pricing
      expect(cost).toBeCloseTo(0.0105, 4);
    });

    it('should handle zero tokens', () => {
      const cost = calculateCost('claude-sonnet-4-20250514', 0, 0, 0);
      expect(cost).toBe(0);
    });

    it('should calculate higher cost for Opus model', () => {
      const sonnetCost = calculateCost('claude-sonnet-4-20250514', 10000, 5000);
      const opusCost = calculateCost('claude-opus-4-20250514', 10000, 5000);
      expect(opusCost).toBeGreaterThan(sonnetCost);
    });

    it('should calculate lower cost for Haiku model', () => {
      const sonnetCost = calculateCost('claude-sonnet-4-20250514', 10000, 5000);
      const haikuCost = calculateCost('claude-haiku-3-20250307', 10000, 5000);
      expect(haikuCost).toBeLessThan(sonnetCost);
    });
  });

  // ========================================
  // recordUsage
  // ========================================
  describe('recordUsage', () => {
    it('should insert a usage record (fire-and-forget)', () => {
      mockQueryPublic.mockResolvedValueOnce({ rows: [] });

      const entry: AIUsageEntry = {
        model: 'claude-sonnet-4-20250514',
        inputTokens: 1500,
        outputTokens: 800,
        thinkingTokens: 200,
        costUsd: 0,
        feature: 'chat',
        context: 'personal',
        responseTimeMs: 1200,
      };

      recordUsage(entry);

      // Should have been called (async, but initiated)
      expect(mockQueryPublic).toHaveBeenCalledTimes(1);
      const [sql, params] = mockQueryPublic.mock.calls[0];
      expect(sql).toContain('INSERT INTO ai_usage_log');
      expect(params[0]).toBe('claude-sonnet-4-20250514');
      expect(params[1]).toBe(1500); // input_tokens
      expect(params[2]).toBe(800);  // output_tokens
      expect(params[3]).toBe(200);  // thinking_tokens
      expect(params[5]).toBe('chat');
      expect(params[6]).toBe('personal');
      expect(params[7]).toBe(1200); // response_time_ms
    });

    it('should use provided costUsd if > 0', () => {
      mockQueryPublic.mockResolvedValueOnce({ rows: [] });

      recordUsage({
        model: 'claude-sonnet-4-20250514',
        inputTokens: 1000,
        outputTokens: 500,
        thinkingTokens: 0,
        costUsd: 0.05,
        feature: 'rag',
        context: 'work',
        responseTimeMs: 800,
      });

      const params = mockQueryPublic.mock.calls[0][1];
      expect(params[4]).toBe(0.05); // cost_usd
    });

    it('should auto-calculate cost when costUsd is 0', () => {
      mockQueryPublic.mockResolvedValueOnce({ rows: [] });

      recordUsage({
        model: 'claude-sonnet-4-20250514',
        inputTokens: 1000,
        outputTokens: 500,
        thinkingTokens: 0,
        costUsd: 0,
        feature: 'chat',
        context: 'personal',
        responseTimeMs: 500,
      });

      const params = mockQueryPublic.mock.calls[0][1];
      expect(params[4]).toBeGreaterThan(0); // auto-calculated
    });

    it('should not throw on DB error (fire-and-forget)', () => {
      mockQueryPublic.mockRejectedValueOnce(new Error('DB error'));

      // Should not throw
      expect(() => {
        recordUsage({
          model: 'claude-sonnet-4-20250514',
          inputTokens: 100,
          outputTokens: 50,
          thinkingTokens: 0,
          costUsd: 0,
          feature: 'other',
          context: 'personal',
          responseTimeMs: 100,
        });
      }).not.toThrow();
    });
  });

  // ========================================
  // getUsageStats
  // ========================================
  describe('getUsageStats', () => {
    it('should aggregate stats from DB results', async () => {
      // Totals
      mockQueryPublic.mockResolvedValueOnce({
        rows: [{ total_tokens: '50000', total_cost: '1.25' }],
      });
      // By model
      mockQueryPublic.mockResolvedValueOnce({
        rows: [
          { model: 'claude-sonnet-4-20250514', tokens: '40000', cost: '1.00', count: 20 },
          { model: 'claude-haiku-3-20250307', tokens: '10000', cost: '0.25', count: 10 },
        ],
      });
      // By feature
      mockQueryPublic.mockResolvedValueOnce({
        rows: [
          { feature: 'chat', tokens: '30000', cost: '0.75', count: 15 },
          { feature: 'rag', tokens: '20000', cost: '0.50', count: 15 },
        ],
      });
      // Daily
      mockQueryPublic.mockResolvedValueOnce({
        rows: [
          { date: '2026-03-01', tokens: '25000', cost: '0.60' },
          { date: '2026-03-02', tokens: '25000', cost: '0.65' },
        ],
      });

      const stats = await getUsageStats('2026-03-01', '2026-03-02');

      expect(stats.totalTokens).toBe(50000);
      expect(stats.totalCost).toBe(1.25);
      expect(stats.byModel['claude-sonnet-4-20250514'].tokens).toBe(40000);
      expect(stats.byModel['claude-sonnet-4-20250514'].count).toBe(20);
      expect(stats.byFeature['chat'].cost).toBe(0.75);
      expect(stats.dailyUsage).toHaveLength(2);
      expect(stats.dailyUsage[0].date).toBe('2026-03-01');
    });

    it('should handle empty results', async () => {
      mockQueryPublic.mockResolvedValueOnce({ rows: [{ total_tokens: '0', total_cost: '0' }] });
      mockQueryPublic.mockResolvedValueOnce({ rows: [] });
      mockQueryPublic.mockResolvedValueOnce({ rows: [] });
      mockQueryPublic.mockResolvedValueOnce({ rows: [] });

      const stats = await getUsageStats('2026-03-01', '2026-03-01');

      expect(stats.totalTokens).toBe(0);
      expect(stats.totalCost).toBe(0);
      expect(Object.keys(stats.byModel)).toHaveLength(0);
      expect(Object.keys(stats.byFeature)).toHaveLength(0);
      expect(stats.dailyUsage).toHaveLength(0);
    });

    it('should handle missing totals row gracefully', async () => {
      mockQueryPublic.mockResolvedValueOnce({ rows: [] }); // no totals
      mockQueryPublic.mockResolvedValueOnce({ rows: [] });
      mockQueryPublic.mockResolvedValueOnce({ rows: [] });
      mockQueryPublic.mockResolvedValueOnce({ rows: [] });

      const stats = await getUsageStats('2026-03-01', '2026-03-01');

      expect(stats.totalTokens).toBe(0);
      expect(stats.totalCost).toBe(0);
    });
  });

  // ========================================
  // getDailyUsage
  // ========================================
  describe('getDailyUsage', () => {
    it('should return daily breakdown', async () => {
      mockQueryPublic.mockResolvedValueOnce({
        rows: [
          {
            date: '2026-03-01',
            tokens: '15000',
            cost: '0.40',
            input_tokens: '10000',
            output_tokens: '4000',
            thinking_tokens: '1000',
            request_count: 8,
          },
          {
            date: '2026-03-02',
            tokens: '20000',
            cost: '0.55',
            input_tokens: '13000',
            output_tokens: '5000',
            thinking_tokens: '2000',
            request_count: 12,
          },
        ],
      });

      const daily = await getDailyUsage('2026-03-01', '2026-03-02');

      expect(daily).toHaveLength(2);
      expect(daily[0].date).toBe('2026-03-01');
      expect(daily[0].tokens).toBe(15000);
      expect(daily[0].inputTokens).toBe(10000);
      expect(daily[0].outputTokens).toBe(4000);
      expect(daily[0].thinkingTokens).toBe(1000);
      expect(daily[0].requestCount).toBe(8);
      expect(daily[1].cost).toBe(0.55);
    });

    it('should return empty array for no data', async () => {
      mockQueryPublic.mockResolvedValueOnce({ rows: [] });

      const daily = await getDailyUsage('2026-03-01', '2026-03-01');

      expect(daily).toHaveLength(0);
    });
  });
});
