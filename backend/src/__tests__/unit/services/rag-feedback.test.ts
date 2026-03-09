/**
 * Phase 47: RAG Feedback & Analytics Tests
 */

import { recordRAGFeedback, recordRAGQueryAnalytics, getRAGAnalytics, getRAGStrategyPerformance, getRAGQueryHistory } from '../../../services/rag-feedback';
import { queryContext } from '../../../utils/database-context';

jest.mock('../../../utils/database-context', () => ({
  queryContext: jest.fn(),
  isValidContext: jest.fn().mockReturnValue(true),
}));

jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

var mockQueryContext = queryContext as jest.MockedFunction<typeof queryContext>;

describe('RAG Feedback Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryContext.mockReset();
  });

  describe('recordRAGFeedback', () => {
    it('should record feedback and return ID', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [{ id: 'fb-1' }],
      } as never);

      const id = await recordRAGFeedback('personal', {
        queryText: 'How does memory work?',
        wasHelpful: true,
        relevanceRating: 4,
        strategiesUsed: ['semantic', 'hyde'],
        confidence: 0.85,
      });

      expect(id).toBe('fb-1');
      expect(mockQueryContext).toHaveBeenCalledWith(
        'personal',
        expect.stringContaining('INSERT INTO rag_feedback'),
        expect.arrayContaining(['How does memory work?', true, 4])
      );
    });

    it('should throw on database error', async () => {
      mockQueryContext.mockRejectedValueOnce(new Error('DB error'));

      await expect(recordRAGFeedback('personal', {
        queryText: 'test',
        wasHelpful: false,
      })).rejects.toThrow('DB error');
    });
  });

  describe('recordRAGQueryAnalytics', () => {
    it('should record analytics without throwing', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as never);

      await recordRAGQueryAnalytics('personal', {
        queryText: 'search query',
        strategiesUsed: ['semantic'],
        resultCount: 5,
        confidence: 0.7,
        responseTimeMs: 250,
      });

      expect(mockQueryContext).toHaveBeenCalledWith(
        'personal',
        expect.stringContaining('INSERT INTO rag_query_analytics'),
        expect.any(Array)
      );
    });

    it('should not throw on database error', async () => {
      mockQueryContext.mockRejectedValueOnce(new Error('DB error'));

      // Should not throw
      await recordRAGQueryAnalytics('personal', {
        queryText: 'test',
        strategiesUsed: [],
        resultCount: 0,
      });
    });
  });

  describe('getRAGAnalytics', () => {
    it('should return comprehensive analytics', async () => {
      // Summary
      mockQueryContext.mockResolvedValueOnce({
        rows: [{ total_queries: '100', avg_confidence: '0.75', avg_response_time: '300' }],
      } as never);
      // Feedback stats
      mockQueryContext.mockResolvedValueOnce({
        rows: [{ total: '50', helpful: '40', avg_rating: '3.8' }],
      } as never);
      // Strategy usage
      mockQueryContext.mockResolvedValueOnce({
        rows: [
          { strategy_selected: 'semantic', count: '60' },
          { strategy_selected: 'hybrid', count: '30' },
        ],
      } as never);
      // Daily trend
      mockQueryContext.mockResolvedValueOnce({
        rows: [
          { date: '2026-03-09', queries: '15', avg_confidence: '0.80' },
        ],
      } as never);

      const result = await getRAGAnalytics('personal', 30);

      expect(result.totalQueries).toBe(100);
      expect(result.avgConfidence).toBe(0.75);
      expect(result.feedbackStats.total).toBe(50);
      expect(result.feedbackStats.helpful).toBe(40);
      expect(result.feedbackStats.helpfulRate).toBe(0.8);
      expect(result.strategyUsage['semantic']).toBe(60);
      expect(result.dailyTrend).toHaveLength(1);
    });
  });

  describe('getRAGStrategyPerformance', () => {
    it('should return per-strategy metrics', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [{
          strategy: 'semantic',
          query_count: '45',
          avg_confidence: '0.78',
          avg_response_time: '200',
          avg_result_count: '7.5',
          hyde_rate: '0.3',
          cross_encoder_rate: '0.8',
        }],
      } as never);

      const result = await getRAGStrategyPerformance('personal');

      expect(result).toHaveLength(1);
      expect(result[0].strategy).toBe('semantic');
      expect(result[0].queryCount).toBe(45);
      expect(result[0].avgConfidence).toBe(0.78);
    });
  });

  describe('getRAGQueryHistory', () => {
    it('should return recent queries', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [{
          id: 'q-1',
          query_text: 'How does memory consolidation work?',
          query_type: 'causal',
          strategies_used: ['semantic', 'hyde'],
          result_count: '8',
          confidence: '0.82',
          response_time_ms: '350',
          created_at: '2026-03-09T12:00:00Z',
        }],
      } as never);

      const result = await getRAGQueryHistory('personal', 10);

      expect(result).toHaveLength(1);
      expect(result[0].queryType).toBe('causal');
      expect(result[0].resultCount).toBe(8);
    });
  });
});
