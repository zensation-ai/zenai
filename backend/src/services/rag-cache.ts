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
   *
   * Stores idea IDs from results as tags for fine-grained invalidation.
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

    // Extract idea IDs from results for fine-grained invalidation
    const ideaIds = result.results.map(r => r.id).filter(Boolean);

    // Layer 1: Redis — store result and track idea-to-key mapping
    cache.set(key, result, ttlSeconds).catch(err => {
      logger.debug('RAG cache Redis write failed', {
        error: err instanceof Error ? err.message : 'Unknown',
      });
    });

    // Store reverse mapping: idea ID -> set of cache keys (for targeted invalidation)
    for (const ideaId of ideaIds) {
      const mappingKey = `${RAG_CACHE_PREFIX}:idea-keys:${context}:${ideaId}`;
      cache.sAdd(mappingKey, key, ttlSeconds).catch((err) => logger.debug('Non-critical: RAG cache mapping write failed', { error: err }));
    }

    // Layer 2: Semantic cache — tag with context and individual idea IDs
    const semanticKey = `${context}:${query}`;
    const tags = [context, ...ideaIds.map(id => `idea:${id}`)];
    ragCache.set(semanticKey, result, tags).catch(err => {
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
   * Invalidate RAG caches that contain a specific idea.
   * More targeted than invalidate(context) — only clears queries whose
   * results included the given idea ID.
   *
   * @param context - The AI context
   * @param ideaId - The idea ID that was created/updated/deleted
   * @returns Number of entries invalidated
   */
  async invalidateForIdea(context: AIContext, ideaId: string): Promise<number> {
    stats.invalidations++;
    let totalDeleted = 0;

    // Layer 1: Redis — look up cache keys that contain this idea
    try {
      const mappingKey = `${RAG_CACHE_PREFIX}:idea-keys:${context}:${ideaId}`;
      const cacheKeys = await cache.sMembers(mappingKey);
      if (cacheKeys && cacheKeys.length > 0) {
        for (const key of cacheKeys) {
          const deleted = await cache.del(key);
          if (deleted) {totalDeleted++;}
        }
        await cache.del(mappingKey);
      }
    } catch {
      // Redis unavailable — fall through to semantic cache
    }

    // Layer 2: Semantic cache — invalidate by idea tag
    const semanticDeleted = ragCache.invalidateByTag(`idea:${ideaId}`);
    totalDeleted += semanticDeleted;

    if (totalDeleted > 0) {
      logger.info('RAG cache invalidated for idea', {
        context,
        ideaId,
        totalDeleted,
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
