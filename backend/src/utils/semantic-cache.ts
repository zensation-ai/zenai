/**
 * Semantic Cache
 *
 * A caching layer that uses semantic similarity to match queries.
 * Instead of exact string matching, it compares embeddings to find
 * semantically similar queries that can reuse cached results.
 *
 * Features:
 * - Embedding-based similarity matching
 * - Configurable similarity threshold
 * - TTL-based expiration
 * - LRU eviction when cache is full
 * - Hit rate tracking
 */

import { generateEmbedding } from './ollama';
import { logger } from './logger';

// ===========================================
// Types & Interfaces
// ===========================================

interface CacheEntry<T = unknown> {
  /** Query embedding for similarity matching */
  embedding: number[];
  /** Cached result */
  result: T;
  /** Timestamp when entry was created */
  timestamp: number;
  /** Number of times this entry was hit */
  hitCount: number;
  /** Last access timestamp for LRU */
  lastAccessed: number;
  /** Optional tags for grouped invalidation */
  tags?: string[];
}

interface CacheStats {
  /** Total number of entries */
  entryCount: number;
  /** Total number of get requests */
  totalRequests: number;
  /** Number of cache hits */
  hits: number;
  /** Number of cache misses */
  misses: number;
  /** Hit rate (0-1) */
  hitRate: number;
  /** Average similarity score of hits */
  avgHitSimilarity: number;
}

interface SemanticCacheConfig {
  /** Minimum similarity score to consider a cache hit (0-1) */
  similarityThreshold: number;
  /** Time-to-live in milliseconds */
  ttlMs: number;
  /** Maximum number of entries */
  maxEntries: number;
  /** Whether to enable embedding-based matching */
  enableSemanticMatching: boolean;
}

// ===========================================
// Cosine Similarity
// ===========================================

/**
 * Calculate cosine similarity between two vectors
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) {
    return 0;
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;

  return dotProduct / denominator;
}

// ===========================================
// Semantic Cache Class
// ===========================================

export class SemanticCache<T = unknown> {
  private cache: Map<string, CacheEntry<T>> = new Map();
  private config: SemanticCacheConfig;
  private stats = {
    totalRequests: 0,
    hits: 0,
    misses: 0,
    totalHitSimilarity: 0,
  };

  constructor(config: Partial<SemanticCacheConfig> = {}) {
    this.config = {
      similarityThreshold: config.similarityThreshold ?? 0.95,
      ttlMs: config.ttlMs ?? 15 * 60 * 1000, // 15 minutes default
      maxEntries: config.maxEntries ?? 1000,
      enableSemanticMatching: config.enableSemanticMatching ?? true,
    };

    logger.info('SemanticCache initialized', {
      similarityThreshold: this.config.similarityThreshold,
      ttlMs: this.config.ttlMs,
      maxEntries: this.config.maxEntries,
    });
  }

  /**
   * Get a cached result by semantic similarity
   */
  async get(query: string): Promise<T | null> {
    this.stats.totalRequests++;

    // First, try exact match (fastest)
    const exactMatch = this.cache.get(query);
    if (exactMatch && !this.isExpired(exactMatch)) {
      exactMatch.hitCount++;
      exactMatch.lastAccessed = Date.now();
      this.stats.hits++;
      this.stats.totalHitSimilarity += 1.0;
      logger.debug('Semantic cache exact hit', { query: query.substring(0, 50) });
      return exactMatch.result;
    }

    // If semantic matching is disabled, return null
    if (!this.config.enableSemanticMatching) {
      this.stats.misses++;
      return null;
    }

    // Generate embedding for query
    let queryEmbedding: number[];
    try {
      queryEmbedding = await generateEmbedding(query);
    } catch (error) {
      logger.debug('Failed to generate embedding for cache lookup', {
        error: error instanceof Error ? error.message : 'Unknown',
      });
      this.stats.misses++;
      return null;
    }

    if (queryEmbedding.length === 0) {
      this.stats.misses++;
      return null;
    }

    // Find best semantic match
    let bestMatch: CacheEntry<T> | null = null;
    let bestSimilarity = 0;
    let bestKey: string | null = null;

    for (const [key, entry] of this.cache) {
      // Skip expired entries
      if (this.isExpired(entry)) {
        this.cache.delete(key);
        continue;
      }

      // Skip entries without embeddings
      if (!entry.embedding || entry.embedding.length === 0) {
        continue;
      }

      const similarity = cosineSimilarity(queryEmbedding, entry.embedding);
      if (similarity >= this.config.similarityThreshold && similarity > bestSimilarity) {
        bestMatch = entry;
        bestSimilarity = similarity;
        bestKey = key;
      }
    }

    if (bestMatch && bestKey) {
      bestMatch.hitCount++;
      bestMatch.lastAccessed = Date.now();
      this.stats.hits++;
      this.stats.totalHitSimilarity += bestSimilarity;

      logger.debug('Semantic cache similarity hit', {
        query: query.substring(0, 50),
        matchedKey: bestKey.substring(0, 50),
        similarity: bestSimilarity.toFixed(3),
      });

      return bestMatch.result;
    }

    this.stats.misses++;
    return null;
  }

  /**
   * Set a cache entry
   */
  async set(query: string, result: T, tags?: string[]): Promise<void> {
    // Evict if at capacity
    if (this.cache.size >= this.config.maxEntries) {
      this.evictLRU();
    }

    // Generate embedding for the query
    let embedding: number[] = [];
    if (this.config.enableSemanticMatching) {
      try {
        embedding = await generateEmbedding(query);
      } catch (error) {
        logger.debug('Failed to generate embedding for cache entry', {
          error: error instanceof Error ? error.message : 'Unknown',
        });
      }
    }

    const entry: CacheEntry<T> = {
      embedding,
      result,
      timestamp: Date.now(),
      hitCount: 0,
      lastAccessed: Date.now(),
      tags,
    };

    this.cache.set(query, entry);

    logger.debug('Semantic cache entry set', {
      query: query.substring(0, 50),
      hasEmbedding: embedding.length > 0,
      tags,
    });
  }

  /**
   * Check if an entry is expired
   */
  private isExpired(entry: CacheEntry<T>): boolean {
    return Date.now() - entry.timestamp > this.config.ttlMs;
  }

  /**
   * Evict the least recently used entry
   */
  private evictLRU(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      logger.debug('Semantic cache LRU eviction', {
        evictedKey: oldestKey.substring(0, 50),
      });
    }
  }

  /**
   * Invalidate entries by tag
   */
  invalidateByTag(tag: string): number {
    let count = 0;
    for (const [key, entry] of this.cache) {
      if (entry.tags?.includes(tag)) {
        this.cache.delete(key);
        count++;
      }
    }

    if (count > 0) {
      logger.info('Semantic cache tag invalidation', { tag, count });
    }

    return count;
  }

  /**
   * Invalidate a specific entry by exact key
   */
  invalidate(key: string): boolean {
    const existed = this.cache.has(key);
    this.cache.delete(key);
    return existed;
  }

  /**
   * Clear all entries
   */
  clear(): void {
    const count = this.cache.size;
    this.cache.clear();
    logger.info('Semantic cache cleared', { entriesCleared: count });
  }

  /**
   * Clean up expired entries
   */
  cleanup(): number {
    let count = 0;
    for (const [key, entry] of this.cache) {
      if (this.isExpired(entry)) {
        this.cache.delete(key);
        count++;
      }
    }

    if (count > 0) {
      logger.debug('Semantic cache cleanup', { expiredEntries: count });
    }

    return count;
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    return {
      entryCount: this.cache.size,
      totalRequests: this.stats.totalRequests,
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate: this.stats.totalRequests > 0 ? this.stats.hits / this.stats.totalRequests : 0,
      avgHitSimilarity: this.stats.hits > 0 ? this.stats.totalHitSimilarity / this.stats.hits : 0,
    };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      totalRequests: 0,
      hits: 0,
      misses: 0,
      totalHitSimilarity: 0,
    };
  }

  /**
   * Get current entry count
   */
  get size(): number {
    return this.cache.size;
  }
}

// ===========================================
// Singleton Instances
// ===========================================

/**
 * Default semantic cache for general use
 */
export const semanticCache = new SemanticCache({
  similarityThreshold: 0.95,
  ttlMs: 15 * 60 * 1000, // 15 minutes
  maxEntries: 1000,
});

/**
 * Cache for RAG/retrieval results (longer TTL)
 */
export const ragCache = new SemanticCache({
  similarityThreshold: 0.92,
  ttlMs: 30 * 60 * 1000, // 30 minutes
  maxEntries: 500,
});

/**
 * Cache for embeddings (very long TTL, exact match only)
 */
export const embeddingCache = new SemanticCache<number[]>({
  similarityThreshold: 1.0, // Exact match only
  ttlMs: 60 * 60 * 1000, // 1 hour
  maxEntries: 2000,
  enableSemanticMatching: false, // Disable semantic matching for embeddings
});

// ===========================================
// Utility Functions
// ===========================================

/**
 * Get cached embedding or generate new one
 */
export async function getCachedEmbedding(text: string): Promise<number[]> {
  // Check cache first
  const cached = await embeddingCache.get(text);
  if (cached) {
    return cached;
  }

  // Generate new embedding
  const embedding = await generateEmbedding(text);

  // Cache it
  await embeddingCache.set(text, embedding);

  return embedding;
}

/**
 * Periodic cleanup function - call this in a cron job or interval
 */
export function runCacheCleanup(): { semantic: number; rag: number; embedding: number } {
  return {
    semantic: semanticCache.cleanup(),
    rag: ragCache.cleanup(),
    embedding: embeddingCache.cleanup(),
  };
}

// ===========================================
// Adaptive Threshold Cache (Enhanced)
// ===========================================

/**
 * Adaptive Semantic Cache with dynamic threshold adjustment
 * Adjusts similarity threshold based on hit rate and cache performance
 */
export class AdaptiveSemanticCache<T = unknown> extends SemanticCache<T> {
  private adaptiveConfig = {
    /** Target hit rate to aim for */
    targetHitRate: 0.3,
    /** Minimum allowed threshold */
    minThreshold: 0.85,
    /** Maximum allowed threshold */
    maxThreshold: 0.99,
    /** Adjustment step size */
    adjustmentStep: 0.01,
    /** Number of requests between adjustments */
    adjustmentInterval: 100,
    /** Current dynamic threshold */
    currentThreshold: 0.95,
  };

  private requestsSinceAdjustment = 0;

  constructor(config: Partial<SemanticCacheConfig & {
    targetHitRate?: number;
    minThreshold?: number;
    maxThreshold?: number;
  }> = {}) {
    super(config);

    if (config.targetHitRate !== undefined) {
      this.adaptiveConfig.targetHitRate = config.targetHitRate;
    }
    if (config.minThreshold !== undefined) {
      this.adaptiveConfig.minThreshold = config.minThreshold;
    }
    if (config.maxThreshold !== undefined) {
      this.adaptiveConfig.maxThreshold = config.maxThreshold;
    }
    this.adaptiveConfig.currentThreshold = config.similarityThreshold ?? 0.95;

    logger.info('AdaptiveSemanticCache initialized', {
      initialThreshold: this.adaptiveConfig.currentThreshold,
      targetHitRate: this.adaptiveConfig.targetHitRate,
    });
  }

  /**
   * Get with adaptive threshold adjustment
   */
  async get(query: string): Promise<T | null> {
    const result = await super.get(query);

    this.requestsSinceAdjustment++;

    // Periodically adjust threshold
    if (this.requestsSinceAdjustment >= this.adaptiveConfig.adjustmentInterval) {
      this.adjustThreshold();
      this.requestsSinceAdjustment = 0;
    }

    return result;
  }

  /**
   * Adjust threshold based on hit rate
   */
  private adjustThreshold(): void {
    const stats = this.getStats();

    if (stats.totalRequests < 10) return; // Not enough data

    const hitRate = stats.hitRate;
    const targetRate = this.adaptiveConfig.targetHitRate;

    // If hit rate is too low, lower threshold to allow more matches
    if (hitRate < targetRate * 0.8) {
      this.adaptiveConfig.currentThreshold = Math.max(
        this.adaptiveConfig.minThreshold,
        this.adaptiveConfig.currentThreshold - this.adaptiveConfig.adjustmentStep
      );
      logger.debug('Adaptive cache: lowering threshold', {
        newThreshold: this.adaptiveConfig.currentThreshold,
        hitRate,
      });
    }
    // If hit rate is too high, raise threshold for better precision
    else if (hitRate > targetRate * 1.3) {
      this.adaptiveConfig.currentThreshold = Math.min(
        this.adaptiveConfig.maxThreshold,
        this.adaptiveConfig.currentThreshold + this.adaptiveConfig.adjustmentStep
      );
      logger.debug('Adaptive cache: raising threshold', {
        newThreshold: this.adaptiveConfig.currentThreshold,
        hitRate,
      });
    }
  }

  /**
   * Get current adaptive threshold
   */
  getCurrentThreshold(): number {
    return this.adaptiveConfig.currentThreshold;
  }

  /**
   * Get adaptive configuration
   */
  getAdaptiveConfig() {
    return { ...this.adaptiveConfig };
  }
}

// ===========================================
// Cache Warming Utilities
// ===========================================

/**
 * Cache warming configuration
 */
export interface CacheWarmingConfig {
  /** Maximum number of entries to warm */
  maxEntries: number;
  /** Batch size for parallel processing */
  batchSize: number;
  /** Delay between batches in ms */
  batchDelayMs: number;
}

/**
 * Warm cache with frequently accessed queries
 * @param cache The cache to warm
 * @param queries Array of query-result pairs to pre-populate
 * @param config Warming configuration
 */
export async function warmCache<T>(
  cache: SemanticCache<T>,
  queries: Array<{ query: string; result: T; tags?: string[] }>,
  config: Partial<CacheWarmingConfig> = {}
): Promise<{ warmed: number; failed: number; durationMs: number }> {
  const startTime = Date.now();
  const {
    maxEntries = 100,
    batchSize = 10,
    batchDelayMs = 100,
  } = config;

  let warmed = 0;
  let failed = 0;

  const toProcess = queries.slice(0, maxEntries);

  logger.info('Cache warming started', {
    totalQueries: toProcess.length,
    batchSize,
  });

  for (let i = 0; i < toProcess.length; i += batchSize) {
    const batch = toProcess.slice(i, i + batchSize);

    await Promise.all(
      batch.map(async ({ query, result, tags }) => {
        try {
          await cache.set(query, result, tags);
          warmed++;
        } catch (error) {
          failed++;
          logger.debug('Cache warming entry failed', {
            query: query.substring(0, 50),
            error: error instanceof Error ? error.message : 'Unknown',
          });
        }
      })
    );

    // Delay between batches to avoid overwhelming the system
    if (i + batchSize < toProcess.length && batchDelayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, batchDelayMs));
    }
  }

  const durationMs = Date.now() - startTime;

  logger.info('Cache warming completed', {
    warmed,
    failed,
    durationMs,
  });

  return { warmed, failed, durationMs };
}

/**
 * Pre-compute and cache embeddings for a list of texts
 */
export async function warmEmbeddingCache(
  texts: string[],
  config: Partial<CacheWarmingConfig> = {}
): Promise<{ warmed: number; failed: number; durationMs: number }> {
  const startTime = Date.now();
  const {
    maxEntries = 200,
    batchSize = 20,
    batchDelayMs = 200,
  } = config;

  let warmed = 0;
  let failed = 0;

  const toProcess = texts.slice(0, maxEntries);

  for (let i = 0; i < toProcess.length; i += batchSize) {
    const batch = toProcess.slice(i, i + batchSize);

    await Promise.all(
      batch.map(async (text) => {
        try {
          await getCachedEmbedding(text);
          warmed++;
        } catch (error) {
          failed++;
        }
      })
    );

    if (i + batchSize < toProcess.length && batchDelayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, batchDelayMs));
    }
  }

  return {
    warmed,
    failed,
    durationMs: Date.now() - startTime,
  };
}

// ===========================================
// Cache Performance Analysis
// ===========================================

/**
 * Analyze cache performance and provide recommendations
 */
export function analyzeCachePerformance(cache: SemanticCache): {
  performance: 'excellent' | 'good' | 'fair' | 'poor';
  hitRate: number;
  avgSimilarity: number;
  recommendations: string[];
} {
  const stats = cache.getStats();
  const recommendations: string[] = [];

  // Determine performance level
  let performance: 'excellent' | 'good' | 'fair' | 'poor';
  if (stats.hitRate >= 0.5) {
    performance = 'excellent';
  } else if (stats.hitRate >= 0.3) {
    performance = 'good';
  } else if (stats.hitRate >= 0.15) {
    performance = 'fair';
  } else {
    performance = 'poor';
  }

  // Generate recommendations
  if (stats.hitRate < 0.2) {
    recommendations.push('Consider lowering the similarity threshold to allow more matches');
    recommendations.push('Pre-warm the cache with common queries');
  }

  if (stats.avgHitSimilarity < 0.9 && stats.hits > 10) {
    recommendations.push('Average hit similarity is low - results may not be highly relevant');
  }

  if (stats.entryCount < 50 && stats.totalRequests > 100) {
    recommendations.push('Cache is underutilized - consider increasing entry count or TTL');
  }

  if (stats.entryCount > 900 && cache.size < 1000) {
    recommendations.push('Cache is nearly full - consider increasing max entries');
  }

  return {
    performance,
    hitRate: stats.hitRate,
    avgSimilarity: stats.avgHitSimilarity,
    recommendations,
  };
}

// ===========================================
// Adaptive Cache Singleton
// ===========================================

/**
 * Adaptive semantic cache with automatic threshold adjustment
 */
export const adaptiveCache = new AdaptiveSemanticCache({
  similarityThreshold: 0.93,
  ttlMs: 20 * 60 * 1000, // 20 minutes
  maxEntries: 800,
  targetHitRate: 0.3,
  minThreshold: 0.85,
  maxThreshold: 0.98,
});
