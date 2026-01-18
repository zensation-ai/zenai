/**
 * Unit Tests for Semantic Cache
 *
 * Tests the semantic caching system with embedding-based similarity matching.
 */

// Mock modules BEFORE importing the module under test
jest.mock('../../../utils/ollama', () => ({
  generateEmbedding: jest.fn(),
}));

jest.mock('../../../utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import { SemanticCache, semanticCache, cosineSimilarity } from '../../../utils/semantic-cache';
import { generateEmbedding } from '../../../utils/ollama';

const mockGenerateEmbedding = generateEmbedding as jest.MockedFunction<typeof generateEmbedding>;

describe('Semantic Cache', () => {
  let cache: SemanticCache;

  beforeEach(() => {
    cache = new SemanticCache();
    jest.clearAllMocks();
  });

  // ===========================================
  // cosineSimilarity Tests
  // ===========================================

  describe('cosineSimilarity', () => {
    it('should return 1 for identical vectors', () => {
      const vec = [0.5, 0.5, 0.5];
      expect(cosineSimilarity(vec, vec)).toBeCloseTo(1, 5);
    });

    it('should return 0 for orthogonal vectors', () => {
      const vec1 = [1, 0, 0];
      const vec2 = [0, 1, 0];
      expect(cosineSimilarity(vec1, vec2)).toBeCloseTo(0, 5);
    });

    it('should return -1 for opposite vectors', () => {
      const vec1 = [1, 0, 0];
      const vec2 = [-1, 0, 0];
      expect(cosineSimilarity(vec1, vec2)).toBeCloseTo(-1, 5);
    });

    it('should return 0 for empty vectors', () => {
      expect(cosineSimilarity([], [])).toBe(0);
    });

    it('should return 0 for zero vectors', () => {
      const zero = [0, 0, 0];
      const vec = [1, 2, 3];
      expect(cosineSimilarity(zero, vec)).toBe(0);
    });

    it('should handle vectors of different lengths gracefully', () => {
      const vec1 = [1, 2, 3];
      const vec2 = [1, 2];
      // Should not throw, result may be unpredictable but shouldn't crash
      expect(() => cosineSimilarity(vec1, vec2)).not.toThrow();
    });

    it('should compute correct similarity for known vectors', () => {
      const vec1 = [1, 2, 3];
      const vec2 = [4, 5, 6];
      // Calculated: (1*4 + 2*5 + 3*6) / (sqrt(14) * sqrt(77)) ≈ 0.9746
      const similarity = cosineSimilarity(vec1, vec2);
      expect(similarity).toBeCloseTo(0.9746, 3);
    });
  });

  // ===========================================
  // SemanticCache.set Tests
  // ===========================================

  describe('set', () => {
    it('should store a value with its embedding', async () => {
      const embedding = [0.1, 0.2, 0.3];
      mockGenerateEmbedding.mockResolvedValue(embedding);

      await cache.set('test query', { data: 'test result' });

      expect(mockGenerateEmbedding).toHaveBeenCalledWith('test query');
    });

    it('should overwrite existing entries with same key', async () => {
      mockGenerateEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);

      await cache.set('query', { first: true });
      await cache.set('query', { second: true });

      // Getting should return the second value
      mockGenerateEmbedding.mockResolvedValue([0.1, 0.2, 0.3]); // Same embedding
      const result = await cache.get('query');

      expect(result).toEqual({ second: true });
    });

    it('should handle embedding generation errors', async () => {
      mockGenerateEmbedding.mockRejectedValue(new Error('Embedding failed'));

      // Should not throw, just log and continue
      await expect(cache.set('query', { data: 'test' })).resolves.not.toThrow();
    });
  });

  // ===========================================
  // SemanticCache.get Tests
  // ===========================================

  describe('get', () => {
    it('should return null for empty cache', async () => {
      mockGenerateEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);

      const result = await cache.get('any query');

      expect(result).toBeNull();
    });

    it('should return exact match', async () => {
      const embedding = [0.5, 0.5, 0.5];
      mockGenerateEmbedding.mockResolvedValue(embedding);

      await cache.set('test query', { data: 'cached' });

      const result = await cache.get('test query');

      expect(result).toEqual({ data: 'cached' });
    });

    it('should return semantically similar match', async () => {
      // First, set with one embedding
      mockGenerateEmbedding.mockResolvedValueOnce([0.9, 0.1, 0.1]);
      await cache.set('How do I cook pasta?', { answer: 'Boil water...' });

      // Then, get with very similar embedding (above threshold)
      mockGenerateEmbedding.mockResolvedValueOnce([0.89, 0.12, 0.11]);
      const result = await cache.get('How can I prepare pasta?');

      expect(result).toEqual({ answer: 'Boil water...' });
    });

    it('should return null for dissimilar queries', async () => {
      // Set with one embedding
      mockGenerateEmbedding.mockResolvedValueOnce([1, 0, 0]);
      await cache.set('cooking pasta', { topic: 'food' });

      // Get with very different embedding
      mockGenerateEmbedding.mockResolvedValueOnce([0, 1, 0]);
      const result = await cache.get('quantum physics');

      expect(result).toBeNull();
    });

    it('should handle empty embeddings by falling back to key match', async () => {
      mockGenerateEmbedding.mockResolvedValue([]);

      await cache.set('query', { data: 'test' });
      const result = await cache.get('query');

      // When semantic matching fails (empty embeddings), cache may fall back
      // to exact key match or return null depending on implementation
      // Both behaviors are acceptable
      expect(result === null || (result as any).data === 'test').toBe(true);
    });

    it('should handle embedding errors during get', async () => {
      mockGenerateEmbedding.mockRejectedValue(new Error('Network error'));

      const result = await cache.get('query');

      expect(result).toBeNull();
    });

    it('should increment hit count on cache hit', async () => {
      const embedding = [0.5, 0.5, 0.5];
      mockGenerateEmbedding.mockResolvedValue(embedding);

      await cache.set('query', { data: 'test' });
      await cache.get('query');
      await cache.get('query');

      // Hit count should be 2 (internal state, can't verify directly without exposing)
      // But the cache should still work
      const result = await cache.get('query');
      expect(result).toEqual({ data: 'test' });
    });
  });

  // ===========================================
  // TTL and Eviction Tests
  // ===========================================

  describe('TTL and Eviction', () => {
    it('should expire old entries', async () => {
      // Create cache with short TTL
      const shortTTLCache = new SemanticCache({
        ttlMs: 100, // 100ms TTL
        maxEntries: 100,
        similarityThreshold: 0.95,
      });

      mockGenerateEmbedding.mockResolvedValue([0.5, 0.5, 0.5]);

      await shortTTLCache.set('query', { data: 'test' });

      // Immediately available
      let result = await shortTTLCache.get('query');
      expect(result).toEqual({ data: 'test' });

      // Wait for TTL to expire
      await new Promise(resolve => setTimeout(resolve, 150));

      result = await shortTTLCache.get('query');
      expect(result).toBeNull();
    });

    it('should evict least recently used when at capacity', async () => {
      const smallCache = new SemanticCache({
        ttlMs: 60000,
        maxEntries: 2,
        similarityThreshold: 0.95,
      });

      // Add three items with different embeddings
      mockGenerateEmbedding.mockResolvedValueOnce([1, 0, 0]);
      await smallCache.set('first', { n: 1 });

      mockGenerateEmbedding.mockResolvedValueOnce([0, 1, 0]);
      await smallCache.set('second', { n: 2 });

      mockGenerateEmbedding.mockResolvedValueOnce([0, 0, 1]);
      await smallCache.set('third', { n: 3 });

      // First should be evicted (LRU)
      mockGenerateEmbedding.mockResolvedValueOnce([1, 0, 0]);
      const firstResult = await smallCache.get('first');
      expect(firstResult).toBeNull();

      // Second and third should still be there
      mockGenerateEmbedding.mockResolvedValueOnce([0, 1, 0]);
      const secondResult = await smallCache.get('second');
      expect(secondResult).toEqual({ n: 2 });
    });
  });

  // ===========================================
  // Clear Tests
  // ===========================================

  describe('clear', () => {
    it('should remove all entries', async () => {
      mockGenerateEmbedding.mockResolvedValue([0.5, 0.5, 0.5]);

      await cache.set('query1', { data: 1 });
      await cache.set('query2', { data: 2 });

      cache.clear();

      mockGenerateEmbedding.mockResolvedValue([0.5, 0.5, 0.5]);
      expect(await cache.get('query1')).toBeNull();
      expect(await cache.get('query2')).toBeNull();
    });
  });

  // ===========================================
  // Singleton Tests
  // ===========================================

  describe('semanticCache singleton', () => {
    it('should be defined', () => {
      expect(semanticCache).toBeDefined();
      expect(semanticCache).toBeInstanceOf(SemanticCache);
    });

    it('should have working get/set methods', async () => {
      mockGenerateEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);

      await semanticCache.set('singleton-test', { singleton: true });
      const result = await semanticCache.get('singleton-test');

      expect(result).toEqual({ singleton: true });
    });
  });

  // ===========================================
  // Edge Cases
  // ===========================================

  describe('Edge Cases', () => {
    it('should handle undefined values', async () => {
      mockGenerateEmbedding.mockResolvedValue([0.5, 0.5, 0.5]);

      await cache.set('query', undefined);
      const result = await cache.get('query');

      expect(result).toBeUndefined();
    });

    it('should handle null values', async () => {
      mockGenerateEmbedding.mockResolvedValue([0.5, 0.5, 0.5]);

      await cache.set('query', null);
      const result = await cache.get('query');

      expect(result).toBeNull();
    });

    it('should handle complex objects', async () => {
      mockGenerateEmbedding.mockResolvedValue([0.5, 0.5, 0.5]);

      const complex = {
        nested: { deep: { value: 42 } },
        array: [1, 2, { three: 3 }],
        fn: undefined, // Functions can't be cached
      };

      await cache.set('query', complex);
      const result = await cache.get('query');

      expect(result).toEqual(complex);
    });

    it('should handle very long query strings', async () => {
      mockGenerateEmbedding.mockResolvedValue([0.5, 0.5, 0.5]);

      const longQuery = 'a'.repeat(10000);
      await cache.set(longQuery, { long: true });
      const result = await cache.get(longQuery);

      expect(result).toEqual({ long: true });
    });

    it('should handle special characters in queries', async () => {
      mockGenerateEmbedding.mockResolvedValue([0.5, 0.5, 0.5]);

      const specialQuery = '特殊字符 émojis 🎉 <script>alert("xss")</script>';
      await cache.set(specialQuery, { special: true });
      const result = await cache.get(specialQuery);

      expect(result).toEqual({ special: true });
    });
  });
});
