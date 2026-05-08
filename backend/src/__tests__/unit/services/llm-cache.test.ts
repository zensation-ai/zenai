/**
 * Tests for LLM Response Cache
 * @module tests/unit/services/llm-cache
 */

// Mock logger
jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import {
  generateCacheKey,
  getCachedResponse,
  setCachedResponse,
  shouldCache,
  initLLMCache,
  CachedResponse,
} from '../../../services/llm-cache';

describe('LLM Response Cache', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('generateCacheKey', () => {
    it('should produce consistent SHA-256 hash', () => {
      const key1 = generateCacheKey('model-a', 'system', 'user msg');
      const key2 = generateCacheKey('model-a', 'system', 'user msg');
      expect(key1).toBe(key2);
    });

    it('should produce different hashes for different inputs', () => {
      const key1 = generateCacheKey('model-a', 'system', 'user msg 1');
      const key2 = generateCacheKey('model-a', 'system', 'user msg 2');
      expect(key1).not.toBe(key2);
    });

    it('should include prefix in key', () => {
      const key = generateCacheKey('model', 'sys', 'msg');
      expect(key).toMatch(/^llm:cache:/);
    });

    it('should produce 64-char hex hash after prefix', () => {
      const key = generateCacheKey('model', 'sys', 'msg');
      const hash = key.replace('llm:cache:', '');
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[0-9a-f]+$/);
    });

    it('should differentiate by model', () => {
      const key1 = generateCacheKey('model-a', 'system', 'user');
      const key2 = generateCacheKey('model-b', 'system', 'user');
      expect(key1).not.toBe(key2);
    });
  });

  describe('getCachedResponse', () => {
    it('should return null without redis client', async () => {
      const result = await getCachedResponse('some-key');
      expect(result).toBeNull();
    });

    it('should return cached data when available', async () => {
      const mockCached: CachedResponse = {
        response: 'cached response',
        modelId: 'test-model',
        tokensUsed: 100,
        cachedAt: Date.now(),
      };

      const mockRedis = {
        get: jest.fn().mockResolvedValue(JSON.stringify(mockCached)),
        set: jest.fn(),
      };

      initLLMCache(mockRedis);

      const result = await getCachedResponse('test-key');
      expect(result).not.toBeNull();
      expect(result!.response).toBe('cached response');
      expect(result!.modelId).toBe('test-model');
      expect(mockRedis.get).toHaveBeenCalledWith('test-key');
    });

    it('should return null on cache miss', async () => {
      const mockRedis = {
        get: jest.fn().mockResolvedValue(null),
        set: jest.fn(),
      };

      initLLMCache(mockRedis);

      const result = await getCachedResponse('missing-key');
      expect(result).toBeNull();
    });

    it('should return null on redis error', async () => {
      const mockRedis = {
        get: jest.fn().mockRejectedValue(new Error('Connection lost')),
        set: jest.fn(),
      };

      initLLMCache(mockRedis);

      const result = await getCachedResponse('error-key');
      expect(result).toBeNull();
    });
  });

  describe('setCachedResponse', () => {
    it('should store with TTL', async () => {
      const mockRedis = {
        get: jest.fn(),
        set: jest.fn().mockResolvedValue('OK'),
      };

      initLLMCache(mockRedis);

      const response: CachedResponse = {
        response: 'test',
        modelId: 'model',
        tokensUsed: 50,
        cachedAt: Date.now(),
      };

      await setCachedResponse('cache-key', response);

      expect(mockRedis.set).toHaveBeenCalledWith(
        'cache-key',
        JSON.stringify(response),
        'EX',
        86400 // 24 hours in seconds
      );
    });

    it('should not throw on redis error', async () => {
      const mockRedis = {
        get: jest.fn(),
        set: jest.fn().mockRejectedValue(new Error('Write failed')),
      };

      initLLMCache(mockRedis);

      const response: CachedResponse = {
        response: 'test',
        modelId: 'model',
        tokensUsed: 50,
        cachedAt: Date.now(),
      };

      // Should not throw
      await setCachedResponse('key', response);
    });
  });

  describe('shouldCache', () => {
    it('should return false for creative tasks', () => {
      expect(shouldCache('creative_generation', 0.3)).toBe(false);
    });

    it('should return false for high temperature', () => {
      expect(shouldCache('standard_query', 0.8)).toBe(false);
      expect(shouldCache('standard_query', 0.6)).toBe(false);
      expect(shouldCache('standard_query', 0.51)).toBe(false);
    });

    it('should return true for low temperature non-creative', () => {
      expect(shouldCache('standard_query', 0.3)).toBe(true);
      expect(shouldCache('simple_query', 0.1)).toBe(true);
      expect(shouldCache('embedding', 0.0)).toBe(true);
    });

    it('should return true at exact boundary (0.5)', () => {
      expect(shouldCache('standard_query', 0.5)).toBe(true);
    });
  });
});
