/**
 * Phase 11: Redis Cache Service
 *
 * Provides caching for:
 * - Embeddings (expensive to compute)
 * - API responses (frequently accessed)
 * - Search results
 *
 * Falls back gracefully if Redis is unavailable.
 */

import Redis from 'ioredis';
import { logger } from './logger';

// ===========================================
// Configuration
// ===========================================

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const DEFAULT_TTL = 3600; // 1 hour
const EMBEDDING_TTL = 86400 * 7; // 7 days (embeddings are expensive)

// ===========================================
// Redis Client
// ===========================================

let redis: Redis | null = null;
let isConnected = false;

function getClient(): Redis | null {
  if (!redis) {
    try {
      redis = new Redis(REDIS_URL, {
        maxRetriesPerRequest: 3,
        retryStrategy: (times) => {
          if (times > 3) {
            logger.warn('Redis connection failed, caching disabled');
            return null; // Stop retrying
          }
          return Math.min(times * 100, 3000);
        },
        lazyConnect: true,
      });

      redis.on('connect', () => {
        isConnected = true;
        logger.info('Redis connected');
      });

      redis.on('error', (err) => {
        if (isConnected) {
          logger.error('Redis error', err);
        }
        isConnected = false;
      });

      redis.on('close', () => {
        isConnected = false;
      });

      // Attempt connection
      redis.connect().catch(() => {
        // Silently handle - lazyConnect will retry
      });
    } catch (error) {
      logger.warn('Redis initialization failed, caching disabled');
      redis = null;
    }
  }
  return redis;
}

// ===========================================
// Cache Operations
// ===========================================

export const cache = {
  /**
   * Check if Redis is available
   */
  isAvailable(): boolean {
    return isConnected && redis !== null;
  },

  /**
   * Get a value from cache
   */
  async get<T>(key: string): Promise<T | null> {
    const client = getClient();
    if (!client || !isConnected) return null;

    try {
      const value = await client.get(key);
      if (!value) return null;
      return JSON.parse(value) as T;
    } catch (error) {
      logger.error('Cache get error', error instanceof Error ? error : undefined, { key });
      return null;
    }
  },

  /**
   * Set a value in cache
   */
  async set(key: string, value: unknown, ttl: number = DEFAULT_TTL): Promise<boolean> {
    const client = getClient();
    if (!client || !isConnected) return false;

    try {
      await client.setex(key, ttl, JSON.stringify(value));
      return true;
    } catch (error) {
      logger.error('Cache set error', error instanceof Error ? error : undefined, { key });
      return false;
    }
  },

  /**
   * Delete a value from cache
   */
  async del(key: string): Promise<boolean> {
    const client = getClient();
    if (!client || !isConnected) return false;

    try {
      await client.del(key);
      return true;
    } catch (error) {
      logger.error('Cache del error', error instanceof Error ? error : undefined, { key });
      return false;
    }
  },

  /**
   * Delete multiple keys matching a pattern
   */
  async delPattern(pattern: string): Promise<number> {
    const client = getClient();
    if (!client || !isConnected) return 0;

    try {
      const keys = await client.keys(pattern);
      if (keys.length === 0) return 0;
      return await client.del(...keys);
    } catch (error) {
      logger.error('Cache delPattern error', error instanceof Error ? error : undefined, { pattern });
      return 0;
    }
  },

  /**
   * Get or set a value (cache-aside pattern)
   */
  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    ttl: number = DEFAULT_TTL
  ): Promise<T> {
    // Try to get from cache
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    // Generate new value
    const value = await factory();

    // Store in cache (don't await - fire and forget)
    this.set(key, value, ttl).catch(() => {});

    return value;
  },

  /**
   * Graceful shutdown
   */
  async close(): Promise<void> {
    if (redis) {
      await redis.quit();
      redis = null;
      isConnected = false;
    }
  },
};

// ===========================================
// Specialized Cache Functions
// ===========================================

/**
 * Cache key generators for consistency
 */
export const cacheKeys = {
  embedding: (text: string) => `emb:${hashText(text)}`,
  idea: (context: string, id: string) => `idea:${context}:${id}`,
  ideaList: (context: string, page: number, limit: number) => `ideas:${context}:${page}:${limit}`,
  stats: (context: string) => `stats:${context}`,
  search: (context: string, query: string) => `search:${context}:${hashText(query)}`,
  analytics: (context: string, type: string) => `analytics:${context}:${type}`,
};

/**
 * Get cached embedding or generate new one
 */
export async function getCachedEmbedding(
  text: string,
  generator: (text: string) => Promise<number[]>
): Promise<number[]> {
  const key = cacheKeys.embedding(text);

  return cache.getOrSet(
    key,
    () => generator(text),
    EMBEDDING_TTL
  );
}

/**
 * Invalidate idea-related caches
 */
export async function invalidateIdeaCaches(context: string, ideaId?: string): Promise<void> {
  // Invalidate list caches
  await cache.delPattern(`ideas:${context}:*`);

  // Invalidate stats
  await cache.del(cacheKeys.stats(context));

  // Invalidate specific idea if provided
  if (ideaId) {
    await cache.del(cacheKeys.idea(context, ideaId));
  }
}

/**
 * Invalidate search caches for a context
 */
export async function invalidateSearchCaches(context: string): Promise<void> {
  await cache.delPattern(`search:${context}:*`);
}

// ===========================================
// Helper Functions
// ===========================================

/**
 * Simple hash function for cache keys
 */
function hashText(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36);
}

// ===========================================
// Cache Stats (for monitoring)
// ===========================================

export async function getCacheStats(): Promise<{
  connected: boolean;
  keys?: number;
  memory?: string;
}> {
  if (!isConnected || !redis) {
    return { connected: false };
  }

  try {
    const info = await redis.info('memory');
    const dbsize = await redis.dbsize();

    const memoryMatch = info.match(/used_memory_human:(\S+)/);
    const memory = memoryMatch ? memoryMatch[1] : 'unknown';

    return {
      connected: true,
      keys: dbsize,
      memory,
    };
  } catch {
    return { connected: false };
  }
}
