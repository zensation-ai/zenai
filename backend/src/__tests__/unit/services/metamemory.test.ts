/**
 * Phase 87: Metamemory Service — Dedicated Unit Tests
 */

const mockQueryContext = jest.fn();

jest.mock('../../../utils/database-context', () => ({
  queryContext: (...args: unknown[]) => mockQueryContext(...args),
  AIContext: {},
  isValidContext: (c: string) => ['personal', 'work', 'learning', 'creative'].includes(c),
}));

jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import {
  getMetamemoryStats,
  getKnowledgeGaps,
  getConfidenceDistribution,
  findConflicts,
} from '../../../services/memory/metamemory';

// ═══════════════════════════════════════════════════════
// getMetamemoryStats
// ═══════════════════════════════════════════════════════

describe('getMetamemoryStats', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryContext.mockReset();
  });

  it('should return aggregated stats for valid context', async () => {
    // Stats query
    mockQueryContext.mockResolvedValueOnce({
      rows: [{
        total: '50',
        high_confidence: '30',
        medium_confidence: '15',
        low_confidence: '5',
        avg_confidence: '0.823',
      }],
    } as any);
    // Categories query
    mockQueryContext.mockResolvedValueOnce({
      rows: [
        { category: 'programming', count: '20' },
        { category: 'cooking', count: '10' },
      ],
    } as any);
    // Knowledge gaps query
    mockQueryContext.mockResolvedValueOnce({
      rows: [
        { category: 'music', count: '2' },
      ],
    } as any);

    const result = await getMetamemoryStats('personal', 'user-1');

    expect(result.totalFacts).toBe(50);
    expect(result.highConfidence).toBe(30);
    expect(result.mediumConfidence).toBe(15);
    expect(result.lowConfidence).toBe(5);
    expect(result.averageConfidence).toBe(0.823);
    expect(result.topCategories).toHaveLength(2);
    expect(result.topCategories[0]).toEqual({ category: 'programming', count: 20 });
    expect(result.knowledgeGaps).toEqual(['music']);
  });

  it('should handle zero facts gracefully', async () => {
    mockQueryContext.mockResolvedValueOnce({
      rows: [{
        total: '0',
        high_confidence: '0',
        medium_confidence: '0',
        low_confidence: '0',
        avg_confidence: '0',
      }],
    } as any);
    mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);
    mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

    const result = await getMetamemoryStats('personal', 'user-1');

    expect(result.totalFacts).toBe(0);
    expect(result.highConfidence).toBe(0);
    expect(result.topCategories).toEqual([]);
    expect(result.knowledgeGaps).toEqual([]);
    expect(result.averageConfidence).toBe(0);
  });

  it('should query all three data sources', async () => {
    mockQueryContext.mockResolvedValueOnce({
      rows: [{ total: '1', high_confidence: '1', medium_confidence: '0', low_confidence: '0', avg_confidence: '0.9' }],
    } as any);
    mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);
    mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

    await getMetamemoryStats('work', 'user-1');

    expect(mockQueryContext).toHaveBeenCalledTimes(3);
    expect(mockQueryContext).toHaveBeenNthCalledWith(1, 'work', expect.stringContaining('COUNT'), ['user-1']);
    expect(mockQueryContext).toHaveBeenNthCalledWith(2, 'work', expect.stringContaining('GROUP BY category'), ['user-1']);
    expect(mockQueryContext).toHaveBeenNthCalledWith(3, 'work', expect.stringContaining('HAVING COUNT'), ['user-1']);
  });

  it('should work with all valid contexts', async () => {
    for (const ctx of ['personal', 'work', 'learning', 'creative'] as const) {
      mockQueryContext.mockReset();
      mockQueryContext.mockResolvedValueOnce({
        rows: [{ total: '1', high_confidence: '1', medium_confidence: '0', low_confidence: '0', avg_confidence: '1.0' }],
      } as any);
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      const result = await getMetamemoryStats(ctx, 'user-1');
      expect(result.totalFacts).toBe(1);
    }
  });

  it('should handle multiple top categories', async () => {
    mockQueryContext.mockResolvedValueOnce({
      rows: [{ total: '100', high_confidence: '50', medium_confidence: '30', low_confidence: '20', avg_confidence: '0.7' }],
    } as any);
    mockQueryContext.mockResolvedValueOnce({
      rows: Array.from({ length: 10 }, (_, i) => ({
        category: `cat-${i}`,
        count: String(100 - i * 10),
      })),
    } as any);
    mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

    const result = await getMetamemoryStats('personal', 'user-1');
    expect(result.topCategories).toHaveLength(10);
    expect(result.topCategories[0].count).toBe(100);
  });

  it('should propagate database errors', async () => {
    mockQueryContext.mockRejectedValueOnce(new Error('DB timeout'));

    await expect(getMetamemoryStats('personal', 'user-1')).rejects.toThrow('DB timeout');
  });
});

// ═══════════════════════════════════════════════════════
// getKnowledgeGaps
// ═══════════════════════════════════════════════════════

describe('getKnowledgeGaps', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryContext.mockReset();
  });

  it('should return categories with fewer than 5 facts', async () => {
    mockQueryContext.mockResolvedValueOnce({
      rows: [
        { category: 'music', count: '2' },
        { category: 'art', count: '1' },
      ],
    } as any);

    const gaps = await getKnowledgeGaps('personal', 'user-1');

    expect(gaps).toHaveLength(2);
    expect(gaps[0]).toEqual({
      category: 'music',
      count: 2,
      suggestion: 'Consider learning more about "music" (only 2 facts stored)',
    });
    expect(gaps[1].category).toBe('art');
    expect(gaps[1].count).toBe(1);
  });

  it('should return empty array when no gaps', async () => {
    mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

    const gaps = await getKnowledgeGaps('personal', 'user-1');
    expect(gaps).toEqual([]);
  });

  it('should generate correct suggestion text', async () => {
    mockQueryContext.mockResolvedValueOnce({
      rows: [{ category: 'quantum physics', count: '3' }],
    } as any);

    const gaps = await getKnowledgeGaps('personal', 'user-1');
    expect(gaps[0].suggestion).toContain('quantum physics');
    expect(gaps[0].suggestion).toContain('3 facts stored');
  });

  it('should query with correct SQL containing HAVING clause', async () => {
    mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

    await getKnowledgeGaps('learning', 'user-1');

    expect(mockQueryContext).toHaveBeenCalledWith(
      'learning',
      expect.stringContaining('HAVING COUNT(*) < 5'),
      ['user-1'],
    );
  });

  it('should propagate database errors', async () => {
    mockQueryContext.mockRejectedValueOnce(new Error('Query failed'));

    await expect(getKnowledgeGaps('personal', 'user-1')).rejects.toThrow('Query failed');
  });
});

// ═══════════════════════════════════════════════════════
// getConfidenceDistribution
// ═══════════════════════════════════════════════════════

describe('getConfidenceDistribution', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryContext.mockReset();
  });

  it('should return histogram buckets', async () => {
    mockQueryContext.mockResolvedValueOnce({
      rows: [
        { range: '0.9-1.0', count: '20' },
        { range: '0.8-0.9', count: '15' },
        { range: '0.5-0.6', count: '5' },
      ],
    } as any);

    const buckets = await getConfidenceDistribution('personal', 'user-1');

    expect(buckets).toHaveLength(3);
    expect(buckets[0]).toEqual({ range: '0.9-1.0', count: 20 });
    expect(buckets[1]).toEqual({ range: '0.8-0.9', count: 15 });
    expect(buckets[2]).toEqual({ range: '0.5-0.6', count: 5 });
  });

  it('should return empty array when no facts exist', async () => {
    mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

    const buckets = await getConfidenceDistribution('personal', 'user-1');
    expect(buckets).toEqual([]);
  });

  it('should query with user_id parameter', async () => {
    mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

    await getConfidenceDistribution('work', 'user-42');

    expect(mockQueryContext).toHaveBeenCalledWith(
      'work',
      expect.stringContaining('CASE'),
      ['user-42'],
    );
  });

  it('should convert count strings to numbers', async () => {
    mockQueryContext.mockResolvedValueOnce({
      rows: [{ range: '0.0-0.1', count: '999' }],
    } as any);

    const buckets = await getConfidenceDistribution('personal', 'user-1');
    expect(typeof buckets[0].count).toBe('number');
    expect(buckets[0].count).toBe(999);
  });

  it('should propagate database errors', async () => {
    mockQueryContext.mockRejectedValueOnce(new Error('Timeout'));

    await expect(getConfidenceDistribution('personal', 'user-1')).rejects.toThrow('Timeout');
  });
});

// ═══════════════════════════════════════════════════════
// findConflicts
// ═══════════════════════════════════════════════════════

describe('findConflicts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryContext.mockReset();
  });

  it('should return conflicting fact pairs', async () => {
    mockQueryContext.mockResolvedValueOnce({
      rows: [{
        fact1_id: 'f1',
        fact1_content: 'The capital of France is Paris',
        fact2_id: 'f2',
        fact2_content: 'The capital of France is Lyon',
        sim: 0.85,
      }],
    } as any);

    const conflicts = await findConflicts('personal', 'user-1');

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].fact1Id).toBe('f1');
    expect(conflicts[0].fact2Id).toBe('f2');
    expect(conflicts[0].similarity).toBe(0.85);
    expect(conflicts[0].fact1Content).toContain('Paris');
    expect(conflicts[0].fact2Content).toContain('Lyon');
  });

  it('should return empty array when no conflicts', async () => {
    mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

    const conflicts = await findConflicts('personal', 'user-1');
    expect(conflicts).toEqual([]);
  });

  it('should use default similarity threshold of 0.4', async () => {
    mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

    await findConflicts('personal', 'user-1');

    expect(mockQueryContext).toHaveBeenCalledWith(
      'personal',
      expect.stringContaining('similarity'),
      ['user-1', 0.4],
    );
  });

  it('should use custom similarity threshold', async () => {
    mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

    await findConflicts('personal', 'user-1', 0.7);

    expect(mockQueryContext).toHaveBeenCalledWith(
      'personal',
      expect.any(String),
      ['user-1', 0.7],
    );
  });

  it('should gracefully handle pg_trgm not available', async () => {
    mockQueryContext.mockRejectedValueOnce(new Error('function similarity(text, text) does not exist'));

    const conflicts = await findConflicts('personal', 'user-1');
    expect(conflicts).toEqual([]);
  });

  it('should gracefully handle any database error', async () => {
    mockQueryContext.mockRejectedValueOnce(new Error('Connection refused'));

    const conflicts = await findConflicts('personal', 'user-1');
    expect(conflicts).toEqual([]);
  });

  it('should return multiple conflicts ordered by similarity', async () => {
    mockQueryContext.mockResolvedValueOnce({
      rows: [
        { fact1_id: 'a', fact1_content: 'fact a', fact2_id: 'b', fact2_content: 'fact b', sim: 0.9 },
        { fact1_id: 'c', fact1_content: 'fact c', fact2_id: 'd', fact2_content: 'fact d', sim: 0.6 },
      ],
    } as any);

    const conflicts = await findConflicts('personal', 'user-1');

    expect(conflicts).toHaveLength(2);
    expect(conflicts[0].similarity).toBe(0.9);
    expect(conflicts[1].similarity).toBe(0.6);
  });

  it('should work with all valid contexts', async () => {
    for (const ctx of ['personal', 'work', 'learning', 'creative'] as const) {
      mockQueryContext.mockReset();
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      const result = await findConflicts(ctx, 'user-1');
      expect(result).toEqual([]);
      expect(mockQueryContext).toHaveBeenCalledWith(ctx, expect.any(String), expect.any(Array));
    }
  });
});
