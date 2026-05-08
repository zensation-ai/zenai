/**
 * LLM Response Cache
 *
 * Redis-based cache for LLM responses to avoid duplicate API costs.
 * Uses SHA-256 hash of (model + system prompt + messages) as key.
 * Skips caching for creative tasks and high-temperature requests.
 *
 * @module services/llm-cache
 */

import crypto from 'crypto';
import { logger } from '../utils/logger';

// ===========================================
// Configuration
// ===========================================

let redisClient: {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string, mode: string, ttl: number) => Promise<unknown>;
} | null = null;

const CACHE_TTL_HOURS = parseInt(process.env.LLM_CACHE_TTL_HOURS || '24', 10);
const CACHE_PREFIX = 'llm:cache:';

// ===========================================
// Initialization
// ===========================================

/**
 * Initialize the LLM cache with a Redis client instance
 */
export function initLLMCache(redis: {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string, mode: string, ttl: number) => Promise<unknown>;
}): void {
  redisClient = redis;
  logger.info('LLM response cache initialized', { ttlHours: CACHE_TTL_HOURS });
}

// ===========================================
// Cache Key Generation
// ===========================================

/**
 * Generate a deterministic cache key from model + prompts
 */
export function generateCacheKey(model: string, systemPrompt: string, userMessage: string): string {
  const hash = crypto.createHash('sha256')
    .update(`${model}:${systemPrompt}:${userMessage}`)
    .digest('hex');
  return `${CACHE_PREFIX}${hash}`;
}

// ===========================================
// Types
// ===========================================

export interface CachedResponse {
  response: string;
  modelId: string;
  tokensUsed: number;
  cachedAt: number;
}

// ===========================================
// Cache Operations
// ===========================================

/**
 * Retrieve a cached LLM response
 */
export async function getCachedResponse(key: string): Promise<CachedResponse | null> {
  if (!redisClient) return null;

  try {
    const cached = await redisClient.get(key);
    if (!cached) return null;

    const parsed = JSON.parse(cached) as CachedResponse;
    logger.debug('LLM cache hit', { key: key.slice(-12) });
    return parsed;
  } catch (err) {
    logger.warn('LLM cache read error', { error: (err as Error).message });
    return null;
  }
}

/**
 * Store an LLM response in cache
 */
export async function setCachedResponse(key: string, response: CachedResponse): Promise<void> {
  if (!redisClient) return;

  try {
    const ttlSeconds = CACHE_TTL_HOURS * 3600;
    await redisClient.set(key, JSON.stringify(response), 'EX', ttlSeconds);
    logger.debug('LLM cache set', { key: key.slice(-12), ttl: ttlSeconds });
  } catch (err) {
    logger.warn('LLM cache write error', { error: (err as Error).message });
  }
}

// ===========================================
// Cache Policy
// ===========================================

/**
 * Determine if a request should be cached based on task type and temperature
 */
export function shouldCache(taskType: string, temperature: number): boolean {
  // Don't cache creative or high-temperature requests
  if (taskType === 'creative_generation') return false;
  if (temperature > 0.5) return false;
  return true;
}
