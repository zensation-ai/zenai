/**
 * Phase 67.1: RAG Result Cache Tests
 */

// Mock dependencies before imports
jest.mock('../../../utils/cache', () => {
  const store = new Map<string, { value: string; ttl: number }>();
  const sets = new Map<string, Set<string>>();
  return {
    cache: {
      get: jest.fn(async (key: string) => {
        const entry = store.get(key);
        return entry ? JSON.parse(entry.value) : null;
      }),
      set: jest.fn(async (key: string, value: unknown, ttl: number) => {
        store.set(key, { value: JSON.stringify(value), ttl });
        return true;
      }),
      del: jest.fn(async (key: string) => {
        store.delete(key);
        return true;
      }),
      delPattern: jest.fn(async () => 2),
      isAvailable: jest.fn(() => true),
      sAdd: jest.fn(async (key: string, member: string) => {
        if (!sets.has(key)) sets.set(key, new Set());
        sets.get(key)!.add(member);
        return true;
      }),
      sMembers: jest.fn(async (key: string) => {
        const s = sets.get(key);
        return s ? Array.from(s) : [];
      }),
    },
    cacheKeys: {
      search: (context: string, query: string) => `search:${context}:${query}`,
    },
    // Expose store for test manipulation
    __store: store,
    __sets: sets,
  };
});

jest.mock('../../../utils/semantic-cache', () => {
  const entries = new Map<string, unknown>();
  return {
    ragCache: {
      get: jest.fn(async (key: string) => entries.get(key) ?? null),
      set: jest.fn(async (key: string, value: unknown) => {
        entries.set(key, value);
      }),
      invalidateByTag: jest.fn(() => 1),
      clear: jest.fn(() => entries.clear()),
      get size() { return entries.size; },
      // Expose for test manipulation
      __entries: entries,
    },
  };
});

jest.mock('../../../utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import { ragResultCache } from '../../../services/rag-cache';
import { cache } from '../../../utils/cache';
import { ragCache } from '../../../utils/semantic-cache';
import type { EnhancedRAGResult } from '../../../services/enhanced-rag';

const mockCacheGet = cache.get as jest.MockedFunction<typeof cache.get>;
const mockCacheSet = cache.set as jest.MockedFunction<typeof cache.set>;
const mockCacheDelPattern = cache.delPattern as jest.MockedFunction<typeof cache.delPattern>;
const mockRagCacheGet = ragCache.get as jest.MockedFunction<typeof ragCache.get>;
const mockRagCacheInvalidateByTag = ragCache.invalidateByTag as jest.MockedFunction<typeof ragCache.invalidateByTag>;

// Sample RAG result for testing
const sampleResult: EnhancedRAGResult = {
  results: [
    {
      id: 'idea-1',
      title: 'Test Idea',
      summary: 'A test summary',
      score: 0.85,
      scores: { agentic: 0.85 },
      sources: ['agentic'],
    },
  ],
  confidence: 0.85,
  methodsUsed: ['agentic'],
  timing: { total: 150 },
};

describe('RAG Result Cache', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    ragResultCache.resetStats();
  });

  // ===========================================
  // Cache Get (Hit / Miss)
  // ===========================================

  describe('get', () => {
    it('should return cached result from Redis on hit', async () => {
      mockCacheGet.mockResolvedValueOnce(sampleResult);

      const result = await ragResultCache.get('test query', 'personal');

      expect(result).toEqual(sampleResult);
      expect(mockCacheGet).toHaveBeenCalledTimes(1);
      // Should NOT fall through to semantic cache on Redis hit
      expect(mockRagCacheGet).not.toHaveBeenCalled();
    });

    it('should fall through to semantic cache on Redis miss', async () => {
      mockCacheGet.mockResolvedValueOnce(null);
      mockRagCacheGet.mockResolvedValueOnce(sampleResult);

      const result = await ragResultCache.get('test query', 'personal');

      expect(result).toEqual(sampleResult);
      expect(mockCacheGet).toHaveBeenCalledTimes(1);
      expect(mockRagCacheGet).toHaveBeenCalledTimes(1);
    });

    it('should return null on both cache misses', async () => {
      mockCacheGet.mockResolvedValueOnce(null);
      mockRagCacheGet.mockResolvedValueOnce(null);

      const result = await ragResultCache.get('unknown query', 'work');

      expect(result).toBeNull();
    });

    it('should handle Redis errors gracefully and try semantic cache', async () => {
      mockCacheGet.mockRejectedValueOnce(new Error('Redis down'));
      mockRagCacheGet.mockResolvedValueOnce(sampleResult);

      const result = await ragResultCache.get('test query', 'personal');

      expect(result).toEqual(sampleResult);
    });

    it('should normalize query for consistent cache keys', async () => {
      mockCacheGet.mockResolvedValueOnce(null);
      mockRagCacheGet.mockResolvedValueOnce(null);

      await ragResultCache.get('  TEST Query  ', 'personal');
      await ragResultCache.get('test query', 'personal');

      // Both should produce the same Redis cache key
      const calls = mockCacheGet.mock.calls;
      expect(calls[0][0]).toBe(calls[1][0]);
    });
  });

  // ===========================================
  // Cache Set
  // ===========================================

  describe('set', () => {
    it('should write to both Redis and semantic cache', async () => {
      await ragResultCache.set('test query', 'personal', sampleResult);

      expect(mockCacheSet).toHaveBeenCalledTimes(1);
      expect(ragCache.set).toHaveBeenCalledTimes(1);
    });

    it('should not cache empty results', async () => {
      const emptyResult: EnhancedRAGResult = {
        ...sampleResult,
        results: [],
      };

      await ragResultCache.set('test query', 'personal', emptyResult);

      expect(mockCacheSet).not.toHaveBeenCalled();
      expect(ragCache.set).not.toHaveBeenCalled();
    });

    it('should accept custom TTL', async () => {
      await ragResultCache.set('test query', 'personal', sampleResult, 300);

      expect(mockCacheSet).toHaveBeenCalledWith(
        expect.any(String),
        sampleResult,
        300
      );
    });
  });

  // ===========================================
  // Cache Invalidation
  // ===========================================

  describe('invalidate', () => {
    it('should invalidate both Redis and semantic cache for context', async () => {
      mockCacheDelPattern.mockResolvedValueOnce(3);
      mockRagCacheInvalidateByTag.mockReturnValueOnce(2);

      const deleted = await ragResultCache.invalidate('personal');

      expect(deleted).toBe(5); // 3 redis + 2 semantic
      expect(mockCacheDelPattern).toHaveBeenCalledWith(
        expect.stringContaining('personal')
      );
      expect(mockRagCacheInvalidateByTag).toHaveBeenCalledWith('personal');
    });
  });

  describe('invalidateAll', () => {
    it('should clear all RAG caches', async () => {
      await ragResultCache.invalidateAll();

      expect(mockCacheDelPattern).toHaveBeenCalledWith(expect.stringContaining('rag:result'));
      expect(ragCache.clear).toHaveBeenCalled();
    });
  });

  // ===========================================
  // Statistics
  // ===========================================

  describe('getStats', () => {
    it('should track hit/miss counts', async () => {
      // Simulate 2 hits and 1 miss
      mockCacheGet.mockResolvedValueOnce(sampleResult);
      await ragResultCache.get('q1', 'personal');

      mockCacheGet.mockResolvedValueOnce(sampleResult);
      await ragResultCache.get('q2', 'personal');

      mockCacheGet.mockResolvedValueOnce(null);
      mockRagCacheGet.mockResolvedValueOnce(null);
      await ragResultCache.get('q3', 'personal');

      const stats = ragResultCache.getStats();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
      expect(stats.redisHits).toBe(2);
      expect(stats.hitRate).toBe('66.7%');
    });

    it('should return 0% hit rate when no requests', () => {
      const stats = ragResultCache.getStats();
      expect(stats.hitRate).toBe('0%');
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
    });

    it('should track semantic hits separately', async () => {
      mockCacheGet.mockResolvedValueOnce(null);
      mockRagCacheGet.mockResolvedValueOnce(sampleResult);

      await ragResultCache.get('q1', 'personal');

      const stats = ragResultCache.getStats();
      expect(stats.semanticHits).toBe(1);
      expect(stats.redisHits).toBe(0);
    });

    it('should track write count', async () => {
      await ragResultCache.set('q1', 'personal', sampleResult);
      await ragResultCache.set('q2', 'work', sampleResult);

      const stats = ragResultCache.getStats();
      expect(stats.writes).toBe(2);
    });

    it('should reset stats', async () => {
      mockCacheGet.mockResolvedValueOnce(sampleResult);
      await ragResultCache.get('q1', 'personal');

      ragResultCache.resetStats();
      const stats = ragResultCache.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
    });
  });

  // ===========================================
  // Edge Cases
  // ===========================================

  describe('edge cases', () => {
    it('should handle all 4 contexts', async () => {
      for (const ctx of ['personal', 'work', 'learning', 'creative'] as const) {
        mockCacheGet.mockResolvedValueOnce(null);
        mockRagCacheGet.mockResolvedValueOnce(null);
        await ragResultCache.get('query', ctx);
      }
      expect(mockCacheGet).toHaveBeenCalledTimes(4);
    });

    it('should include semanticCacheSize in stats', () => {
      const stats = ragResultCache.getStats();
      expect(stats).toHaveProperty('semanticCacheSize');
      expect(typeof stats.semanticCacheSize).toBe('number');
    });
  });
});
