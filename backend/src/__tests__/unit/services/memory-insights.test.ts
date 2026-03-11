/**
 * Phase 53: Memory Insights Service Tests
 */

jest.mock('../../../utils/database-context', () => ({
  queryContext: jest.fn(),
  isValidContext: jest.fn(() => true),
}));

jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import { queryContext } from '../../../utils/database-context';
import {
  getMemoryTimeline,
  detectConflicts,
  getCurationSuggestions,
  getMemoryImpact,
  getMemoryStats,
} from '../../../services/memory-insights';

var mockQueryContext = queryContext as jest.Mock;

describe('Memory Insights Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryContext.mockReset();
  });

  // ==========================================
  // getMemoryTimeline
  // ==========================================

  describe('getMemoryTimeline', () => {
    test('returns timeline entries from all layers', async () => {
      // 4 queries - one per layer
      mockQueryContext
        .mockResolvedValueOnce({ rows: [{ date: '2026-03-01', count: 5 }] })
        .mockResolvedValueOnce({ rows: [{ date: '2026-03-01', count: 3 }] })
        .mockResolvedValueOnce({ rows: [{ date: '2026-03-01', count: 8 }] })
        .mockResolvedValueOnce({ rows: [{ date: '2026-03-01', count: 12 }] });

      const result = await getMemoryTimeline('personal', '2026-03-01', '2026-03-31');
      expect(result.length).toBe(4);
      expect(result[0].layer).toBe('working');
      expect(result[0].count).toBe(5);
      expect(result[1].layer).toBe('episodic');
      expect(result[2].layer).toBe('short_term');
      expect(result[3].layer).toBe('long_term');
    });

    test('handles empty results', async () => {
      mockQueryContext.mockResolvedValue({ rows: [] });
      const result = await getMemoryTimeline('personal', '2026-03-01', '2026-03-31');
      expect(result).toEqual([]);
    });

    test('returns entries sorted by date', async () => {
      mockQueryContext
        .mockResolvedValueOnce({ rows: [{ date: '2026-03-05', count: 2 }] })
        .mockResolvedValueOnce({ rows: [{ date: '2026-03-01', count: 1 }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await getMemoryTimeline('personal', '2026-03-01', '2026-03-31');
      expect(result.length).toBe(2);
      expect(result[0].date).toContain('2026-03-01');
      expect(result[1].date).toContain('2026-03-05');
    });

    test('handles table-not-found errors gracefully', async () => {
      mockQueryContext.mockRejectedValue(new Error('relation "working_memory" does not exist'));
      const result = await getMemoryTimeline('learning', '2026-03-01', '2026-03-31');
      expect(result).toEqual([]);
    });
  });

  // ==========================================
  // detectConflicts
  // ==========================================

  describe('detectConflicts', () => {
    test('returns empty array on no conflicts', async () => {
      mockQueryContext.mockResolvedValue({ rows: [] });
      const result = await detectConflicts('personal');
      expect(result).toEqual([]);
    });

    test('returns duplicate conflicts', async () => {
      // Duplicate detection queries (4 layers) + outdated query
      mockQueryContext
        .mockResolvedValueOnce({
          rows: [{
            id1: 'a1', content1: 'Remember to buy groceries', created1: '2026-03-01',
            id2: 'a2', content2: 'Remember to buy groceries today', created2: '2026-03-02',
          }],
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] }); // outdated

      const result = await detectConflicts('personal');
      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result[0].conflictType).toBe('duplicate');
      expect(result[0].confidence).toBe(0.8);
    });

    test('respects limit parameter', async () => {
      mockQueryContext.mockResolvedValue({ rows: [] });
      const result = await detectConflicts('personal', 5);
      expect(result.length).toBeLessThanOrEqual(5);
    });
  });

  // ==========================================
  // getCurationSuggestions
  // ==========================================

  describe('getCurationSuggestions', () => {
    test('returns suggestions for old working memories', async () => {
      mockQueryContext
        .mockResolvedValueOnce({
          rows: [{ id: 'wm1', content: 'old task context', created_at: '2026-01-01' }],
        })
        .mockResolvedValueOnce({ rows: [] })  // promote
        .mockResolvedValueOnce({ rows: [] }); // delete

      const result = await getCurationSuggestions('personal');
      expect(result.length).toBe(1);
      expect(result[0].suggestion).toBe('archive');
      expect(result[0].layer).toBe('working');
    });

    test('returns promote suggestions for high-strength memories', async () => {
      mockQueryContext
        .mockResolvedValueOnce({ rows: [] }) // archive
        .mockResolvedValueOnce({
          rows: [{
            id: 'mem1', content: 'important fact', created_at: '2026-02-01',
            updated_at: '2026-03-01', strength: 0.9,
          }],
        })
        .mockResolvedValueOnce({ rows: [] }); // delete

      const result = await getCurationSuggestions('personal');
      expect(result.length).toBe(1);
      expect(result[0].suggestion).toBe('promote');
      expect(result[0].layer).toBe('short_term');
    });

    test('returns delete suggestions for low-strength old memories', async () => {
      mockQueryContext
        .mockResolvedValueOnce({ rows: [] }) // archive
        .mockResolvedValueOnce({ rows: [] }) // promote
        .mockResolvedValueOnce({
          rows: [{ id: 'lt1', content: 'outdated info', created_at: '2025-01-01', strength: 0.1 }],
        });

      const result = await getCurationSuggestions('personal');
      expect(result.length).toBe(1);
      expect(result[0].suggestion).toBe('delete');
    });

    test('sorts by priority descending', async () => {
      mockQueryContext
        .mockResolvedValueOnce({
          rows: [{ id: 'wm1', content: 'old working', created_at: '2026-01-01' }],
        })
        .mockResolvedValueOnce({
          rows: [{
            id: 'mem1', content: 'promote me', created_at: '2026-02-01',
            updated_at: '2026-03-01', strength: 0.85,
          }],
        })
        .mockResolvedValueOnce({ rows: [] });

      const result = await getCurationSuggestions('personal');
      expect(result.length).toBe(2);
      // Promote (priority 8) before archive (priority 7)
      expect(result[0].suggestion).toBe('promote');
      expect(result[1].suggestion).toBe('archive');
    });

    test('handles missing tables gracefully', async () => {
      mockQueryContext.mockRejectedValue(new Error('relation does not exist'));
      const result = await getCurationSuggestions('learning');
      expect(result).toEqual([]);
    });
  });

  // ==========================================
  // getMemoryImpact
  // ==========================================

  describe('getMemoryImpact', () => {
    test('returns ranked memories from long-term', async () => {
      mockQueryContext
        .mockResolvedValueOnce({
          rows: [{
            id: 'lt1', content: 'important fact', strength: 0.9,
            updated_at: '2026-03-01', created_at: '2026-01-01', access_count: 15,
          }],
        })
        .mockResolvedValueOnce({ rows: [] }); // episodic

      const result = await getMemoryImpact('personal', 10);
      expect(result.length).toBe(1);
      expect(result[0].layer).toBe('long_term');
      expect(result[0].influenceScore).toBeGreaterThan(0);
    });

    test('returns memories from episodic layer', async () => {
      mockQueryContext
        .mockResolvedValueOnce({ rows: [] }) // long-term
        .mockResolvedValueOnce({
          rows: [{
            id: 'ep1', content: 'past experience', importance: 0.75,
            updated_at: '2026-02-15', created_at: '2026-02-01',
          }],
        });

      const result = await getMemoryImpact('personal', 10);
      expect(result.length).toBe(1);
      expect(result[0].layer).toBe('episodic');
      expect(result[0].influenceScore).toBe(0.75);
    });

    test('sorts by influence score descending', async () => {
      mockQueryContext
        .mockResolvedValueOnce({
          rows: [{
            id: 'lt1', content: 'low strength', strength: 0.3,
            updated_at: null, created_at: '2026-01-01', access_count: 0,
          }],
        })
        .mockResolvedValueOnce({
          rows: [{
            id: 'ep1', content: 'high importance', importance: 0.95,
            updated_at: null, created_at: '2026-02-01',
          }],
        });

      const result = await getMemoryImpact('personal', 10);
      expect(result.length).toBe(2);
      expect(result[0].influenceScore).toBeGreaterThan(result[1].influenceScore);
    });

    test('handles missing tables gracefully', async () => {
      mockQueryContext.mockRejectedValue(new Error('relation does not exist'));
      const result = await getMemoryImpact('creative', 10);
      expect(result).toEqual([]);
    });
  });

  // ==========================================
  // getMemoryStats
  // ==========================================

  describe('getMemoryStats', () => {
    test('returns aggregated stats', async () => {
      // Count queries (4 layers)
      mockQueryContext
        .mockResolvedValueOnce({ rows: [{ count: 5 }] })    // working
        .mockResolvedValueOnce({ rows: [{ count: 10 }] })   // episodic
        .mockResolvedValueOnce({ rows: [{ count: 8 }] })    // short_term
        .mockResolvedValueOnce({ rows: [{ count: 20 }] })   // long_term
        // Min/max queries (4 layers)
        .mockResolvedValueOnce({ rows: [{ min_date: '2026-01-01', max_date: '2026-03-09' }] })
        .mockResolvedValueOnce({ rows: [{ min_date: '2026-02-01', max_date: '2026-03-08' }] })
        .mockResolvedValueOnce({ rows: [{ min_date: '2026-01-15', max_date: '2026-03-09' }] })
        .mockResolvedValueOnce({ rows: [{ min_date: '2025-12-01', max_date: '2026-03-07' }] })
        // Growth rate queries (4 layers)
        .mockResolvedValueOnce({ rows: [{ count: 3 }] })
        .mockResolvedValueOnce({ rows: [{ count: 5 }] })
        .mockResolvedValueOnce({ rows: [{ count: 4 }] })
        .mockResolvedValueOnce({ rows: [{ count: 3 }] });

      const result = await getMemoryStats('personal');
      expect(result.totalMemories).toBe(43);
      expect(result.byLayer.working).toBe(5);
      expect(result.byLayer.episodic).toBe(10);
      expect(result.byLayer.short_term).toBe(8);
      expect(result.byLayer.long_term).toBe(20);
      expect(result.oldestMemory).toBe('2025-12-01');
      expect(result.newestMemory).toContain('2026-03-09');
      expect(result.growthRate).toBeGreaterThan(0);
    });

    test('handles missing tables gracefully', async () => {
      mockQueryContext.mockRejectedValue(new Error('relation does not exist'));
      const result = await getMemoryStats('learning');
      expect(result.totalMemories).toBe(0);
      expect(result.byLayer).toBeDefined();
      expect(result.oldestMemory).toBeNull();
      expect(result.newestMemory).toBeNull();
    });

    test('handles empty database', async () => {
      mockQueryContext.mockResolvedValue({ rows: [{ count: 0 }] });
      const result = await getMemoryStats('personal');
      expect(result.totalMemories).toBe(0);
    });
  });
});
