/**
 * Phase 67.1: RAG Result Caching
 *
 * Two-layer caching for RAG retrieval results:
 * 1. Redis (distributed, survives restarts) - exact key match
 * 2. In-memory semantic cache (fast, similarity-based) - via existing ragCache
 *
 * Cache key: hash of normalized query + context.
 * Default TTL: 1 hour (Redis), 30 min (semantic cache from Phase 11).
 *
 * Graceful degradation: works without Redis, falls back to semantic cache only.
 */

import { cache, cacheKeys } from '../utils/cache';
import { ragCache } from '../utils/semantic-cache';
import { logger } from '../utils/logger';
import type { AIContext } from '../utils/database-context';
import type { EnhancedRAGResult } from './enhanced-rag';

// ===========================================
// Configuration
// ===========================================

const RAG_CACHE_TTL_SECONDS = 3600; // 1 hour
const RAG_CACHE_PREFIX = 'rag:result';

// ===========================================
// Stats Tracking (in-memory, non-critical)
// ===========================================

interface RAGCacheStats {
  hits: number;
  misses: number;
  redisHits: number;
  semanticHits: number;
  writes: number;
  invalidations: number;
}

const stats: RAGCacheStats = {
  hits: 0,
  misses: 0,
  redisHits: 0,
  semanticHits: 0,
  writes: 0,
  invalidations: 0,
};

// ===========================================
// Cache Key Generation
// ===========================================

/**
 * Build a deterministic cache key from query + context.
 * Reuses the hash utility from cache.ts via cacheKeys.search().
 */
function buildCacheKey(query: string, context: AIContext): string {
  // Normalize: lowercase + trim to avoid near-duplicate keys
  const normalized = query.toLowerCase().trim();
  return `${RAG_CACHE_PREFIX}:${cacheKeys.search(context, normalized)}`;
}

// ===========================================
// RAG Cache Service
// ===========================================

export const ragResultCache = {
  /**
   * Look up a cached RAG result. Checks Redis first, then semantic cache.
   * Returns null on cache miss.
   */
  async get(query: string, context: AIContext): Promise<EnhancedRAGResult | null> {
    const key = buildCacheKey(query, context);

    // Layer 1: Redis (exact key match, distributed)
    try {
      const redisResult = await cache.get<EnhancedRAGResult>(key);
      if (redisResult) {
        stats.hits++;
        stats.redisHits++;
        logger.debug('RAG cache hit (Redis)', {
          query: query.substring(0, 60),
          context,
        });
        return redisResult;
      }
    } catch {
      // Redis unavailable - continue to semantic cache
    }

    // Layer 2: In-memory semantic cache (similarity-based)
    try {
      const semanticKey = `${context}:${query}`;
      const semanticResult = await ragCache.get(semanticKey) as EnhancedRAGResult | null;
      if (semanticResult) {
        stats.hits++;
        stats.semanticHits++;
        logger.debug('RAG cache hit (semantic)', {
          query: query.substring(0, 60),
          context,
        });
        return semanticResult;
      }
    } catch {
      // Semantic cache failure - not critical
    }

    stats.misses++;
    return null;
  },

  /**
   * Store a RAG result in both cache layers.
   * Fire-and-forget: failures are logged but don't propagate.
   */
  async set(
    query: string,
    context: AIContext,
    result: EnhancedRAGResult,
    ttlSeconds: number = RAG_CACHE_TTL_SECONDS
  ): Promise<void> {
    const key = buildCacheKey(query, context);

    // Only cache results with actual content
    if (!result.results || result.results.length === 0) {
      return;
    }

    stats.writes++;

    // Layer 1: Redis
    cache.set(key, result, ttlSeconds).catch(err => {
      logger.debug('RAG cache Redis write failed', {
        error: err instanceof Error ? err.message : 'Unknown',
      });
    });

    // Layer 2: Semantic cache (uses its own TTL internally)
    const semanticKey = `${context}:${query}`;
    ragCache.set(semanticKey, result, [context]).catch(err => {
      logger.debug('RAG cache semantic write failed', {
        error: err instanceof Error ? err.message : 'Unknown',
      });
    });
  },

  /**
   * Invalidate RAG caches for a given context.
   * Call this when ideas are created/updated/deleted.
   */
  async invalidate(context: AIContext): Promise<number> {
    stats.invalidations++;

    // Invalidate Redis keys matching the context pattern
    const redisDeleted = await cache.delPattern(`${RAG_CACHE_PREFIX}:search:${context}:*`);

    // Invalidate semantic cache entries tagged with the context
    const semanticDeleted = ragCache.invalidateByTag(context);

    const totalDeleted = redisDeleted + semanticDeleted;

    if (totalDeleted > 0) {
      logger.info('RAG cache invalidated', {
        context,
        redisDeleted,
        semanticDeleted,
      });
    }

    return totalDeleted;
  },

  /**
   * Invalidate all RAG caches across all contexts.
   */
  async invalidateAll(): Promise<void> {
    await cache.delPattern(`${RAG_CACHE_PREFIX}:*`);
    ragCache.clear();
    stats.invalidations++;
    logger.info('RAG cache fully invalidated');
  },

  /**
   * Get cache statistics.
   */
  getStats(): RAGCacheStats & { hitRate: string; semanticCacheSize: number } {
    const total = stats.hits + stats.misses;
    const hitRate = total > 0 ? `${((stats.hits / total) * 100).toFixed(1)}%` : '0%';
    return {
      ...stats,
      hitRate,
      semanticCacheSize: ragCache.size,
    };
  },

  /**
   * Reset statistics (for testing).
   */
  resetStats(): void {
    stats.hits = 0;
    stats.misses = 0;
    stats.redisHits = 0;
    stats.semanticHits = 0;
    stats.writes = 0;
    stats.invalidations = 0;
  },
};
