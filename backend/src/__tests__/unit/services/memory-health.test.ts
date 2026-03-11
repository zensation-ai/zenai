/**
 * Memory Health Service Tests (Phase 50)
 */

jest.mock('../../../utils/database-context', () => ({
  queryContext: jest.fn(),
  isValidContext: jest.fn(() => true),
}));

jest.mock('../../../utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import { queryContext } from '../../../utils/database-context';
import { getMemoryHealth } from '../../../services/memory-health';

var mockQueryContext = queryContext as jest.Mock;

describe('Memory Health Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryContext.mockReset();
  });

  test('returns health data with all layers populated', async () => {
    // Mock 4 parallel queries returning data
    mockQueryContext
      .mockResolvedValueOnce({ rows: [{ count: '5', active_count: '3', avg_age: '2.5' }] })
      .mockResolvedValueOnce({ rows: [{ count: '10', recent_count: '4', avg_importance: '0.7' }] })
      .mockResolvedValueOnce({ rows: [{ count: '8', expiring_count: '2', avg_relevance: '0.6' }] })
      .mockResolvedValueOnce({ rows: [{ count: '20', avg_strength: '0.8', consolidated_count: '15' }] });

    const result = await getMemoryHealth('personal');

    expect(result.overall.healthScore).toBe(100);
    expect(result.overall.totalMemories).toBe(43);
    expect(result.working.count).toBe(5);
    expect(result.working.activeCount).toBe(3);
    expect(result.working.avgAge).toBe(2.5);
    expect(result.episodic.count).toBe(10);
    expect(result.episodic.recentCount).toBe(4);
    expect(result.episodic.avgImportance).toBe(0.7);
    expect(result.shortTerm.count).toBe(8);
    expect(result.shortTerm.expiringCount).toBe(2);
    expect(result.shortTerm.avgRelevance).toBe(0.6);
    expect(result.longTerm.count).toBe(20);
    expect(result.longTerm.avgStrength).toBe(0.8);
    expect(result.longTerm.consolidatedCount).toBe(15);
    expect(result.overall.lastConsolidation).toBeNull();
    expect(result.overall.lastDecay).toBeNull();
  });

  test('returns 0 health score with empty memories', async () => {
    mockQueryContext.mockResolvedValue({
      rows: [{
        count: '0',
        active_count: '0',
        recent_count: '0',
        expiring_count: '0',
        avg_age: '0',
        avg_importance: '0',
        avg_relevance: '0',
        avg_strength: '0',
        consolidated_count: '0',
      }],
    });

    const result = await getMemoryHealth('work');

    expect(result.overall.healthScore).toBe(0);
    expect(result.overall.totalMemories).toBe(0);
    expect(result.working.count).toBe(0);
    expect(result.episodic.count).toBe(0);
    expect(result.shortTerm.count).toBe(0);
    expect(result.longTerm.count).toBe(0);
  });

  test('returns partial health score when some layers have data', async () => {
    mockQueryContext
      .mockResolvedValueOnce({ rows: [{ count: '3', active_count: '1', avg_age: '1.0' }] })
      .mockResolvedValueOnce({ rows: [{ count: '0', recent_count: '0', avg_importance: '0' }] })
      .mockResolvedValueOnce({ rows: [{ count: '5', expiring_count: '0', avg_relevance: '0.5' }] })
      .mockResolvedValueOnce({ rows: [{ count: '0', avg_strength: '0', consolidated_count: '0' }] });

    const result = await getMemoryHealth('personal');

    expect(result.overall.healthScore).toBe(50); // 2 of 4 layers
    expect(result.overall.totalMemories).toBe(8);
    expect(result.working.count).toBe(3);
    expect(result.episodic.count).toBe(0);
    expect(result.shortTerm.count).toBe(5);
    expect(result.longTerm.count).toBe(0);
  });

  test('handles query errors gracefully', async () => {
    mockQueryContext.mockRejectedValue(new Error('Table not found'));

    const result = await getMemoryHealth('learning');

    expect(result.overall.healthScore).toBe(0);
    expect(result.overall.totalMemories).toBe(0);
    expect(result.working.count).toBe(0);
    expect(result.episodic.count).toBe(0);
    expect(result.shortTerm.count).toBe(0);
    expect(result.longTerm.count).toBe(0);
  });

  test('handles mixed success and failure queries', async () => {
    mockQueryContext
      .mockResolvedValueOnce({ rows: [{ count: '10', active_count: '5', avg_age: '3.0' }] })
      .mockRejectedValueOnce(new Error('episodic_memories does not exist'))
      .mockResolvedValueOnce({ rows: [{ count: '7', expiring_count: '1', avg_relevance: '0.8' }] })
      .mockRejectedValueOnce(new Error('long_term_memory does not exist'));

    const result = await getMemoryHealth('creative');

    expect(result.overall.healthScore).toBe(50); // 2 of 4 layers
    expect(result.overall.totalMemories).toBe(17);
    expect(result.working.count).toBe(10);
    expect(result.episodic.count).toBe(0);
    expect(result.shortTerm.count).toBe(7);
    expect(result.longTerm.count).toBe(0);
  });

  test('queries use correct context parameter', async () => {
    mockQueryContext.mockResolvedValue({
      rows: [{ count: '0', active_count: '0', recent_count: '0', expiring_count: '0', avg_age: '0', avg_importance: '0', avg_relevance: '0', avg_strength: '0', consolidated_count: '0' }],
    });

    await getMemoryHealth('creative');

    // All 4 queries should use the 'creative' context
    expect(mockQueryContext).toHaveBeenCalledTimes(4);
    for (let i = 0; i < 4; i++) {
      expect(mockQueryContext.mock.calls[i][0]).toBe('creative');
    }
  });

  test('handles empty rows gracefully', async () => {
    mockQueryContext.mockResolvedValue({ rows: [] });

    const result = await getMemoryHealth('personal');

    expect(result.overall.healthScore).toBe(0);
    expect(result.overall.totalMemories).toBe(0);
  });
});
