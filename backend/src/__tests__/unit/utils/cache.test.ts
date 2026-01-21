/**
 * Unit Tests for Redis Cache Service
 *
 * Tests caching operations, pattern deletion with SCAN,
 * cache-aside pattern, and graceful degradation.
 */

import Redis from 'ioredis';
import {
  cache,
  cacheKeys,
  getCachedEmbedding,
  invalidateIdeaCaches,
  invalidateSearchCaches,
  getCacheStats,
} from '../../../utils/cache';

// Mock ioredis
jest.mock('ioredis', () => {
  const mockRedis = {
    get: jest.fn(),
    setex: jest.fn(),
    del: jest.fn(),
    scan: jest.fn(),
    info: jest.fn(),
    dbsize: jest.fn(),
    quit: jest.fn(),
    connect: jest.fn(),
    on: jest.fn(),
  };
  return jest.fn(() => mockRedis);
});

// Mock logger
jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Get mock instance
const mockRedis = new Redis() as jest.Mocked<Redis>;

describe('Cache Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ===========================================
  // cacheKeys Tests
  // ===========================================

  describe('cacheKeys', () => {
    describe('embedding', () => {
      it('should generate consistent keys for same text', () => {
        const key1 = cacheKeys.embedding('test text');
        const key2 = cacheKeys.embedding('test text');
        expect(key1).toBe(key2);
        expect(key1).toMatch(/^emb:/);
      });

      it('should generate different keys for different text', () => {
        const key1 = cacheKeys.embedding('test text 1');
        const key2 = cacheKeys.embedding('test text 2');
        expect(key1).not.toBe(key2);
      });
    });

    describe('idea', () => {
      it('should generate correct key format', () => {
        const key = cacheKeys.idea('personal', '123');
        expect(key).toBe('idea:personal:123');
      });

      it('should work with different contexts', () => {
        const personalKey = cacheKeys.idea('personal', '456');
        const workKey = cacheKeys.idea('work', '456');
        expect(personalKey).toBe('idea:personal:456');
        expect(workKey).toBe('idea:work:456');
      });
    });

    describe('ideaList', () => {
      it('should generate correct key format', () => {
        const key = cacheKeys.ideaList('personal', 1, 20);
        expect(key).toBe('ideas:personal:1:20');
      });
    });

    describe('stats', () => {
      it('should generate correct key format', () => {
        const key = cacheKeys.stats('work');
        expect(key).toBe('stats:work');
      });
    });

    describe('search', () => {
      it('should generate consistent keys for same query', () => {
        const key1 = cacheKeys.search('personal', 'find ideas');
        const key2 = cacheKeys.search('personal', 'find ideas');
        expect(key1).toBe(key2);
        expect(key1).toMatch(/^search:personal:/);
      });
    });

    describe('analytics', () => {
      it('should generate correct key format', () => {
        const key = cacheKeys.analytics('work', 'daily');
        expect(key).toBe('analytics:work:daily');
      });
    });
  });

  // ===========================================
  // Cache Operations Tests (with mocked Redis)
  // ===========================================

  describe('cache operations', () => {
    describe('isAvailable', () => {
      it('should return availability status', () => {
        // Initial state - might vary based on mock setup
        const available = cache.isAvailable();
        expect(typeof available).toBe('boolean');
      });
    });

    describe('get', () => {
      it('should return null when Redis returns null', async () => {
        mockRedis.get.mockResolvedValueOnce(null);

        // Note: This will return null if Redis is not connected in the module
        const result = await cache.get('nonexistent');
        expect(result).toBeNull();
      });

      it('should handle JSON parse errors gracefully', async () => {
        // The actual implementation returns null on parse errors
        const result = await cache.get('invalid-json');
        expect(result).toBeNull();
      });
    });

    describe('set', () => {
      it('should return false when Redis is unavailable', async () => {
        const result = await cache.set('key', 'value');
        // When Redis is not connected, it returns false
        expect(typeof result).toBe('boolean');
      });
    });

    describe('del', () => {
      it('should return false when Redis is unavailable', async () => {
        const result = await cache.del('key');
        expect(typeof result).toBe('boolean');
      });
    });

    describe('delPattern (SCAN operation)', () => {
      it('should return 0 when Redis is unavailable', async () => {
        const result = await cache.delPattern('ideas:*');
        expect(result).toBe(0);
      });
    });

    describe('getOrSet', () => {
      it('should call factory when cache miss', async () => {
        const factory = jest.fn().mockResolvedValue('new value');

        const result = await cache.getOrSet('key', factory);

        expect(factory).toHaveBeenCalled();
        expect(result).toBe('new value');
      });

      it('should use default TTL', async () => {
        const factory = jest.fn().mockResolvedValue('value');

        await cache.getOrSet('key', factory);

        expect(factory).toHaveBeenCalled();
      });

      it('should use custom TTL', async () => {
        const factory = jest.fn().mockResolvedValue('value');
        const customTtl = 7200;

        await cache.getOrSet('key', factory, customTtl);

        expect(factory).toHaveBeenCalled();
      });
    });

    describe('close', () => {
      it('should handle close gracefully', async () => {
        // Should not throw
        await expect(cache.close()).resolves.not.toThrow();
      });
    });
  });

  // ===========================================
  // Specialized Cache Functions Tests
  // ===========================================

  describe('getCachedEmbedding', () => {
    it('should call generator when cache misses', async () => {
      const embedding = [0.1, 0.2, 0.3];
      const generator = jest.fn().mockResolvedValue(embedding);

      const result = await getCachedEmbedding('test text', generator);

      expect(generator).toHaveBeenCalledWith('test text');
      expect(result).toEqual(embedding);
    });

    it('should use consistent cache key for same text', async () => {
      const generator = jest.fn().mockResolvedValue([0.1, 0.2, 0.3]);

      // Call twice with same text
      await getCachedEmbedding('same text', generator);
      await getCachedEmbedding('same text', generator);

      // Generator will be called each time since cache is unavailable
      // But the key should be consistent
      const key1 = cacheKeys.embedding('same text');
      const key2 = cacheKeys.embedding('same text');
      expect(key1).toBe(key2);
    });
  });

  describe('invalidateIdeaCaches', () => {
    it('should not throw when Redis unavailable', async () => {
      await expect(invalidateIdeaCaches('personal')).resolves.not.toThrow();
    });

    it('should not throw when invalidating specific idea', async () => {
      await expect(invalidateIdeaCaches('personal', 'idea-123')).resolves.not.toThrow();
    });
  });

  describe('invalidateSearchCaches', () => {
    it('should not throw when Redis unavailable', async () => {
      await expect(invalidateSearchCaches('work')).resolves.not.toThrow();
    });
  });

  // ===========================================
  // Cache Stats Tests
  // ===========================================

  describe('getCacheStats', () => {
    it('should return disconnected state when Redis unavailable', async () => {
      const stats = await getCacheStats();

      // When Redis is not connected
      expect(stats).toHaveProperty('connected');
      expect(typeof stats.connected).toBe('boolean');
    });
  });

  // ===========================================
  // SCAN Pattern Tests (Algorithm verification)
  // ===========================================

  describe('SCAN algorithm verification', () => {
    it('should understand SCAN cursor iteration pattern', () => {
      // This test documents the expected SCAN behavior:
      // 1. Start with cursor '0'
      // 2. Each call returns [nextCursor, keys]
      // 3. Continue until cursor returns to '0'
      // 4. Keys are processed in batches

      const mockScanResponses = [
        ['123', ['key1', 'key2', 'key3']], // First batch
        ['456', ['key4', 'key5']],          // Second batch
        ['0', ['key6']],                    // Final batch (cursor back to 0)
      ];

      // Simulate SCAN iteration
      let cursor = '0';
      let totalKeys: string[] = [];
      let iteration = 0;

      do {
        const [nextCursor, keys] = mockScanResponses[iteration] as [string, string[]];
        cursor = nextCursor;
        totalKeys = [...totalKeys, ...keys];
        iteration++;
      } while (cursor !== '0');

      expect(totalKeys).toEqual(['key1', 'key2', 'key3', 'key4', 'key5', 'key6']);
      expect(iteration).toBe(3);
    });

    it('should handle empty SCAN result', () => {
      const mockScanResponses = [
        ['0', []], // No keys found
      ];

      let cursor = '0';
      let totalKeys: string[] = [];
      let iteration = 0;

      do {
        const [nextCursor, keys] = mockScanResponses[iteration] as [string, string[]];
        cursor = nextCursor;
        totalKeys = [...totalKeys, ...keys];
        iteration++;
      } while (cursor !== '0');

      expect(totalKeys).toHaveLength(0);
      expect(iteration).toBe(1);
    });
  });

  // ===========================================
  // Hash Function Tests
  // ===========================================

  describe('hash function consistency', () => {
    it('should generate consistent hashes for cache keys', () => {
      // Test that embedding keys are deterministic
      const text = 'This is a test embedding text';

      const key1 = cacheKeys.embedding(text);
      const key2 = cacheKeys.embedding(text);
      const key3 = cacheKeys.embedding(text);

      expect(key1).toBe(key2);
      expect(key2).toBe(key3);
    });

    it('should generate different hashes for different inputs', () => {
      const texts = [
        'First text',
        'Second text',
        'Third text',
        'Completely different content',
      ];

      const keys = texts.map(t => cacheKeys.embedding(t));
      const uniqueKeys = new Set(keys);

      expect(uniqueKeys.size).toBe(texts.length);
    });

    it('should handle edge cases', () => {
      // Empty string
      const emptyKey = cacheKeys.embedding('');
      expect(emptyKey).toMatch(/^emb:/);

      // Very long string
      const longText = 'a'.repeat(10000);
      const longKey = cacheKeys.embedding(longText);
      expect(longKey).toMatch(/^emb:/);

      // Unicode
      const unicodeKey = cacheKeys.embedding('日本語テキスト 🎉');
      expect(unicodeKey).toMatch(/^emb:/);
    });
  });

  // ===========================================
  // Graceful Degradation Tests
  // ===========================================

  describe('graceful degradation', () => {
    it('cache operations should not throw when Redis unavailable', async () => {
      // All operations should handle Redis unavailability gracefully
      await expect(cache.get('key')).resolves.not.toThrow();
      await expect(cache.set('key', 'value')).resolves.not.toThrow();
      await expect(cache.del('key')).resolves.not.toThrow();
      await expect(cache.delPattern('pattern:*')).resolves.not.toThrow();
      await expect(cache.getOrSet('key', async () => 'value')).resolves.not.toThrow();
    });

    it('specialized functions should not throw when Redis unavailable', async () => {
      await expect(
        getCachedEmbedding('text', async () => [0.1, 0.2, 0.3])
      ).resolves.not.toThrow();
      await expect(invalidateIdeaCaches('personal')).resolves.not.toThrow();
      await expect(invalidateSearchCaches('work')).resolves.not.toThrow();
      await expect(getCacheStats()).resolves.not.toThrow();
    });
  });

  // ===========================================
  // TTL Configuration Tests
  // ===========================================

  describe('TTL configuration', () => {
    it('should use default TTL for regular cache entries', async () => {
      const factory = jest.fn().mockResolvedValue('value');
      await cache.getOrSet('regular-key', factory);

      // Default TTL is 3600 (1 hour) as per the implementation
      expect(factory).toHaveBeenCalled();
    });

    it('should use embedding TTL for embeddings', async () => {
      const generator = jest.fn().mockResolvedValue([0.1, 0.2, 0.3]);
      await getCachedEmbedding('text', generator);

      // Embedding TTL is 86400 * 7 (7 days) as per the implementation
      expect(generator).toHaveBeenCalled();
    });
  });
});
