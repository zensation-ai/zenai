/**
 * Phase 46: Thinking Management Tests
 */

import { getThinkingChainById, deleteThinkingChain, getStrategyHistory, persistStrategies } from '../../../services/thinking-management';
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

describe('Thinking Management Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryContext.mockReset();
  });

  describe('getThinkingChainById', () => {
    it('should return a thinking chain by ID', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [{
          id: 'chain-1',
          session_id: 'sess-1',
          task_type: 'analysis',
          input_preview: 'Test input',
          thinking_tokens_used: '5000',
          response_quality: '0.85',
          feedback_text: 'Good',
          created_at: '2026-03-09T12:00:00Z',
        }],
      } as never);

      const result = await getThinkingChainById('chain-1', 'personal');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('chain-1');
      expect(result!.taskType).toBe('analysis');
      expect(result!.thinkingTokensUsed).toBe(5000);
      expect(result!.responseQuality).toBe(0.85);
    });

    it('should return null if chain not found', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as never);

      const result = await getThinkingChainById('nonexistent', 'personal');
      expect(result).toBeNull();
    });

    it('should return null on error', async () => {
      mockQueryContext.mockRejectedValueOnce(new Error('DB error'));

      const result = await getThinkingChainById('chain-1', 'personal');
      expect(result).toBeNull();
    });
  });

  describe('deleteThinkingChain', () => {
    it('should delete a thinking chain', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as never);

      await deleteThinkingChain('chain-1', 'personal');
      expect(mockQueryContext).toHaveBeenCalledWith(
        'personal',
        expect.stringContaining('DELETE FROM thinking_chains'),
        ['chain-1', 'personal']
      );
    });
  });

  describe('persistStrategies', () => {
    it('should persist all budget strategies', async () => {
      mockQueryContext.mockResolvedValue({ rows: [] } as never);

      await persistStrategies('personal');

      // Should persist 8 task types
      expect(mockQueryContext).toHaveBeenCalledTimes(8);
      expect(mockQueryContext).toHaveBeenCalledWith(
        'personal',
        expect.stringContaining('INSERT INTO thinking_budget_strategies'),
        expect.arrayContaining(['simple_structuring'])
      );
    });
  });

  describe('getStrategyHistory', () => {
    it('should return strategies with performance data', async () => {
      // First call: stored strategies
      mockQueryContext.mockResolvedValueOnce({
        rows: [
          { task_type: 'analysis', base_tokens: '15000', complexity_multiplier: '1.5', min_tokens: '8000', max_tokens: '40000', sample_count: '10', avg_quality: '0.82', last_optimized_at: '2026-03-09' },
        ],
      } as never);

      // Second call: recent performance
      mockQueryContext.mockResolvedValueOnce({
        rows: [
          { task_type: 'analysis', avg_tokens: '12000', avg_quality: '0.80', count: '15' },
        ],
      } as never);

      const result = await getStrategyHistory('personal');

      expect(result.strategies).toBeDefined();
      expect(result.strategies.length).toBeGreaterThan(0);
      expect(result.recentPerformance).toBeDefined();
      expect(result.recentPerformance[0].taskType).toBe('analysis');
      expect(result.recentPerformance[0].avgTokens).toBe(12000);
    });
  });
});
