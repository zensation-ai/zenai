/**
 * Unit Tests for Global Search Service
 *
 * Tests unified search across ideas, documents, meetings, facts, chat, etc.
 */

import { queryContext } from '../../../utils/database-context';
import { globalSearch } from '../../../services/global-search';

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

const mockQueryContext = queryContext as jest.MockedFunction<typeof queryContext>;

// ===========================================
// Tests
// ===========================================

describe('GlobalSearchService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryContext.mockReset();
  });

  describe('search', () => {
    it('should return empty results for queries shorter than MIN_QUERY_LENGTH', async () => {
      const result = await globalSearch.search({ query: 'a' });

      expect(result.totalResults).toBe(0);
      expect(result.results).toEqual([]);
      expect(result.timing.totalMs).toBe(0);
      expect(mockQueryContext).not.toHaveBeenCalled();
    });

    it('should search ideas across all contexts by default', async () => {
      mockQueryContext.mockResolvedValue({ rows: [], rowCount: 0 } as any);

      const result = await globalSearch.search({ query: 'test query' });

      expect(result.query).toBe('test query');
      expect(result.totalResults).toBe(0);
      // Should search across all 4 contexts x 11 types = up to 44 queries
      expect(mockQueryContext).toHaveBeenCalled();
    });

    it('should search only specified types', async () => {
      mockQueryContext.mockResolvedValue({ rows: [], rowCount: 0 } as any);

      await globalSearch.search({
        query: 'test query',
        types: ['idea'],
        contexts: ['personal'],
      });

      // Only 1 context x 1 type = 1 query
      expect(mockQueryContext).toHaveBeenCalledTimes(1);
      const sql = mockQueryContext.mock.calls[0][1] as string;
      expect(sql).toContain('FROM ideas');
    });

    it('should search only specified contexts', async () => {
      mockQueryContext.mockResolvedValue({ rows: [], rowCount: 0 } as any);

      await globalSearch.search({
        query: 'test',
        contexts: ['work'],
        types: ['meeting'],
      });

      expect(mockQueryContext).toHaveBeenCalledTimes(1);
      expect(mockQueryContext).toHaveBeenCalledWith('work', expect.any(String), expect.any(Array));
    });

    it('should return and sort results by score', async () => {
      const ideaRow = {
        id: 'idea-1',
        title: 'Test Idea',
        summary: 'A test summary',
        type: 'task',
        category: null,
        priority: 'high',
        created_at: new Date('2026-03-20'),
        score: 0.9,
      };
      const meetingRow = {
        id: 'meet-1',
        title: 'Test Meeting',
        notes: 'meeting notes',
        meeting_type: 'team',
        date: new Date('2026-03-19'),
        created_at: new Date('2026-03-19'),
        score: 0.5,
      };

      mockQueryContext
        .mockResolvedValueOnce({ rows: [ideaRow], rowCount: 1 } as any) // ideas
        .mockResolvedValueOnce({ rows: [meetingRow], rowCount: 1 } as any); // meetings

      const result = await globalSearch.search({
        query: 'test',
        types: ['idea', 'meeting'],
        contexts: ['personal'],
      });

      expect(result.totalResults).toBe(2);
      expect(result.results[0].type).toBe('idea');
      expect(result.results[0].score).toBe(0.9);
      expect(result.results[1].type).toBe('meeting');
    });

    it('should deduplicate results by type:id', async () => {
      const row = {
        id: 'idea-dup',
        title: 'Dup Idea',
        summary: 'dup',
        type: 'task',
        category: null,
        priority: 'medium',
        created_at: new Date(),
        score: 0.8,
      };

      // Same idea returned from two contexts
      mockQueryContext
        .mockResolvedValueOnce({ rows: [row], rowCount: 1 } as any)
        .mockResolvedValueOnce({ rows: [row], rowCount: 1 } as any);

      const result = await globalSearch.search({
        query: 'dup',
        types: ['idea'],
        contexts: ['personal', 'work'],
      });

      expect(result.totalResults).toBe(1);
    });

    it('should limit results to MAX_LIMIT (50)', async () => {
      const rows = Array.from({ length: 60 }, (_, i) => ({
        id: `idea-${i}`,
        title: `Idea ${i}`,
        summary: 'sum',
        type: 'idea',
        category: null,
        priority: 'low',
        created_at: new Date(),
        score: 0.5,
      }));

      mockQueryContext.mockResolvedValue({ rows, rowCount: rows.length } as any);

      const result = await globalSearch.search({
        query: 'test query',
        types: ['idea'],
        contexts: ['personal'],
        limit: 100, // Over max
      });

      expect(result.totalResults).toBeLessThanOrEqual(50);
    });

    it('should not search facts when includeMemory is false', async () => {
      mockQueryContext.mockResolvedValue({ rows: [], rowCount: 0 } as any);

      await globalSearch.search({
        query: 'test',
        types: ['fact'],
        contexts: ['personal'],
        includeMemory: false,
      });

      // No queries should be made for facts
      expect(mockQueryContext).not.toHaveBeenCalled();
    });

    it('should handle individual search failures gracefully', async () => {
      // Ideas succeeds, documents fails
      mockQueryContext
        .mockResolvedValueOnce({ rows: [{ id: 'i1', title: 'OK', summary: '', type: 'idea', category: null, priority: 'low', created_at: new Date(), score: 0.8 }], rowCount: 1 } as any)
        .mockRejectedValueOnce(new Error('DB error'));

      const result = await globalSearch.search({
        query: 'test',
        types: ['idea', 'document'],
        contexts: ['personal'],
      });

      // Should still return the successful idea result
      expect(result.totalResults).toBe(1);
      expect(result.results[0].type).toBe('idea');
    });

    it('should include timing information', async () => {
      mockQueryContext.mockResolvedValue({ rows: [], rowCount: 0 } as any);

      const result = await globalSearch.search({
        query: 'test',
        types: ['idea'],
        contexts: ['personal'],
      });

      expect(result.timing.totalMs).toBeGreaterThanOrEqual(0);
      expect(result.timing.perType).toHaveProperty('parallel_search');
    });

    it('should escape percent signs in query', async () => {
      mockQueryContext.mockResolvedValue({ rows: [], rowCount: 0 } as any);

      await globalSearch.search({
        query: '50% discount',
        types: ['idea'],
        contexts: ['personal'],
      });

      const params = mockQueryContext.mock.calls[0][2] as string[];
      // The search pattern should have the % stripped from original query
      expect(params[1]).toBe('%50 discount%');
    });
  });
});
