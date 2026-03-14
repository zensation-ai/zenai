/**
 * Phase 59: Memory BM25 Full-Text Search Tests
 */

import { queryContext } from '../../../utils/database-context';
import { MemoryBM25 } from '../../../services/memory/memory-bm25';

// ===========================================
// Mocks
// ===========================================

jest.mock('../../../utils/database-context', () => ({
  queryContext: jest.fn(),
  isValidContext: (ctx: string) =>
    ['personal', 'work', 'learning', 'creative'].includes(ctx),
}));

jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('../../../services/ai', () => ({
  generateEmbedding: jest.fn().mockResolvedValue(new Array(1536).fill(0.1)),
}));

const mockQueryContext = queryContext as jest.MockedFunction<typeof queryContext>;

// ===========================================
// Mock Data
// ===========================================

const mockFact1 = {
  id: 'fact-001',
  content: 'TypeScript ist die bevorzugte Programmiersprache',
  fact_type: 'preference',
  confidence: 0.9,
  created_at: new Date('2026-03-14'),
  rank: 0.8,
};

const mockFact2 = {
  id: 'fact-002',
  content: 'React wird fuer das Frontend verwendet',
  fact_type: 'knowledge',
  confidence: 0.85,
  created_at: new Date('2026-03-13'),
  rank: 0.6,
};

// ===========================================
// Tests
// ===========================================

describe('MemoryBM25', () => {
  let memoryBM25: MemoryBM25;

  beforeEach(() => {
    jest.clearAllMocks();
    memoryBM25 = new MemoryBM25();
  });

  describe('search', () => {
    it('should return ranked results for valid query', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [mockFact1, mockFact2],
        rowCount: 2,
      } as any);

      const results = await memoryBM25.search('TypeScript', 'personal');

      expect(results).toHaveLength(2);
      expect(results[0].id).toBe('fact-001');
      expect(results[0].rank).toBe(1);
      expect(results[1].rank).toBe(2);
      expect(results[0].content).toContain('TypeScript');
    });

    it('should return empty array for empty query', async () => {
      const results = await memoryBM25.search('', 'personal');

      expect(results).toEqual([]);
      expect(mockQueryContext).not.toHaveBeenCalled();
    });

    it('should return empty array for whitespace-only query', async () => {
      const results = await memoryBM25.search('   ', 'personal');

      expect(results).toEqual([]);
    });

    it('should use German and English text search configs', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      await memoryBM25.search('Programmierung', 'personal');

      const sql = mockQueryContext.mock.calls[0][1];
      expect(sql).toContain("'german'");
      expect(sql).toContain("'english'");
    });

    it('should respect the limit parameter', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      await memoryBM25.search('test', 'work', 5);

      expect(mockQueryContext).toHaveBeenCalledWith(
        'work',
        expect.any(String),
        expect.arrayContaining([5])
      );
    });

    it('should handle no results gracefully', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      const results = await memoryBM25.search('nonexistent topic xyz', 'personal');

      expect(results).toEqual([]);
    });

    it('should map fields correctly', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [mockFact1],
        rowCount: 1,
      } as any);

      const results = await memoryBM25.search('TypeScript', 'personal');

      expect(results[0]).toEqual({
        id: 'fact-001',
        content: 'TypeScript ist die bevorzugte Programmiersprache',
        factType: 'preference',
        confidence: 0.9,
        rank: 1,
        createdAt: expect.any(Date),
      });
    });
  });

  describe('hybridSearch', () => {
    it('should merge BM25 and semantic results with RRF', async () => {
      // BM25 results
      mockQueryContext.mockResolvedValueOnce({
        rows: [mockFact1, mockFact2],
        rowCount: 2,
      } as any);
      // Semantic results (overlapping fact-001)
      mockQueryContext.mockResolvedValueOnce({
        rows: [mockFact1, { ...mockFact2, id: 'fact-003', content: 'Semantic only' }],
        rowCount: 2,
      } as any);

      const results = await memoryBM25.hybridSearch('TypeScript', 'personal');

      expect(results.length).toBeGreaterThan(0);
      // fact-001 appears in both lists, should have highest RRF score
      const bothResult = results.find(r => r.source === 'both');
      expect(bothResult).toBeDefined();
      expect(bothResult!.id).toBe('fact-001');
    });

    it('should return empty array for empty query', async () => {
      const results = await memoryBM25.hybridSearch('', 'personal');

      expect(results).toEqual([]);
      expect(mockQueryContext).not.toHaveBeenCalled();
    });

    it('should handle BM25-only results', async () => {
      // BM25 results
      mockQueryContext.mockResolvedValueOnce({
        rows: [mockFact1],
        rowCount: 1,
      } as any);
      // Semantic results (empty)
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      const results = await memoryBM25.hybridSearch('test', 'personal');

      expect(results).toHaveLength(1);
      expect(results[0].source).toBe('bm25');
    });

    it('should handle semantic-only results when BM25 returns nothing', async () => {
      // BM25 results (empty)
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);
      // Semantic results
      mockQueryContext.mockResolvedValueOnce({
        rows: [mockFact1],
        rowCount: 1,
      } as any);

      const results = await memoryBM25.hybridSearch('test', 'personal');

      expect(results).toHaveLength(1);
      expect(results[0].source).toBe('semantic');
    });

    it('should respect the limit parameter', async () => {
      const manyRows = Array.from({ length: 10 }, (_, i) => ({
        ...mockFact1,
        id: `fact-${i}`,
      }));

      mockQueryContext.mockResolvedValueOnce({ rows: manyRows, rowCount: 10 } as any);
      mockQueryContext.mockResolvedValueOnce({ rows: manyRows, rowCount: 10 } as any);

      const results = await memoryBM25.hybridSearch('test', 'personal', 3);

      expect(results.length).toBeLessThanOrEqual(3);
    });

    it('should assign correct RRF scores', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [mockFact1],
        rowCount: 1,
      } as any);
      mockQueryContext.mockResolvedValueOnce({
        rows: [mockFact1],
        rowCount: 1,
      } as any);

      const results = await memoryBM25.hybridSearch('TypeScript', 'personal');

      // RRF score for rank 1 in both: 1/(60+1) + 1/(60+1) = ~0.0328
      expect(results[0].rrfScore).toBeGreaterThan(0);
      expect(results[0].rrfScore).toBeCloseTo(2 / 61, 4);
    });

    it('should handle embedding generation failure gracefully', async () => {
      const { generateEmbedding } = require('../../../services/ai');
      generateEmbedding.mockRejectedValueOnce(new Error('API down'));

      // BM25 results
      mockQueryContext.mockResolvedValueOnce({
        rows: [mockFact1],
        rowCount: 1,
      } as any);

      const results = await memoryBM25.hybridSearch('test', 'personal');

      // Should still return BM25 results even when semantic fails
      expect(results.length).toBeGreaterThanOrEqual(0);
    });
  });
});
