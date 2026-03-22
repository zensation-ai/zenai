/**
 * Phase 62: Advanced Rate Limiting
 *
 * Redis-based sliding window rate limiting with per-user and per-endpoint support.
 * Falls back to in-memory when Redis is unavailable.
 *
 * Tiers:
 * - default: 100 req/min
 * - auth: 10 req/min (login, register)
 * - ai: 30 req/min (chat, agent execution)
 * - upload: 20 req/min
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../../utils/logger';

// ===========================================
// Types
// ===========================================

export interface RateLimitConfig {
  maxRequests: number;
  windowSeconds: number;
  blockSeconds?: number;
  keyGenerator?: (req: Request) => string;
}

export type RateLimitTier = 'default' | 'auth' | 'ai' | 'upload';

// ===========================================
// Default tier configurations
// ===========================================

const TIER_CONFIGS: Record<RateLimitTier, RateLimitConfig> = {
  default: { maxRequests: 100, windowSeconds: 60 },
  auth: { maxRequests: 10, windowSeconds: 60, blockSeconds: 300 },
  ai: { maxRequests: 30, windowSeconds: 60 },
  upload: { maxRequests: 20, windowSeconds: 60 },
};

// Allow runtime tier config updates
const runtimeTierConfigs = new Map<string, RateLimitConfig>();

// ===========================================
// In-Memory Fallback
// ===========================================

interface MemoryWindow {
  count: number;
  expiresAt: number;
}

const memoryStore = new Map<string, MemoryWindow>();

// Periodic cleanup of expired entries (skip in test to avoid handle leaks)
let cleanupInterval: ReturnType<typeof setInterval> | null = null;
if (process.env.NODE_ENV !== 'test') {
  cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, window] of memoryStore.entries()) {
      if (window.expiresAt < now) {
        memoryStore.delete(key);
      }
    }
  }, 60_000);
}

export function stopAdvancedRateLimitCleanup(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}

// ===========================================
// Redis Client (lazy initialization)
// ===========================================

let redisClient: {
  incr: (key: string) => Promise<number>;
  expire: (key: string, seconds: number) => Promise<void>;
  ttl: (key: string) => Promise<number>;
  get: (key: string) => Promise<string | null>;
} | null = null;

let redisAvailable = false;

async function getRedisClient(): Promise<typeof redisClient> {
  if (redisClient) {return redisClient;}

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {return null;}

  try {
     
    const redisModule = 'redis';
    // Dynamic import erases module type information
    const { createClient } = await import(/* webpackIgnore: true */ redisModule) as { createClient: (opts: { url: string }) => { on: (event: string, cb: () => void) => void; connect: () => Promise<void>; incr: (key: string) => Promise<number>; expire: (key: string, seconds: number) => Promise<unknown>; ttl: (key: string) => Promise<number>; get: (key: string) => Promise<string | null>; quit: () => Promise<void> } };
    const client = createClient({ url: redisUrl });

    client.on('error', () => {
      redisAvailable = false;
    });

    await client.connect();
    redisAvailable = true;

    redisClient = {
      incr: async (key: string) => {
        const result = await client.incr(key);
        return result;
      },
      expire: async (key: string, seconds: number) => {
        await client.expire(key, seconds);
      },
      ttl: async (key: string) => {
        const result = await client.ttl(key);
        return result;
      },
      get: async (key: string) => {
        return client.get(key);
      },
    };

    return redisClient;
  } catch {
    logger.debug('Advanced rate limiter: Redis not available, using in-memory fallback', {
      operation: 'rate-limit-advanced',
    });
    return null;
  }
}

// ===========================================
// Rate Limit Check
// ===========================================

interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number; // Unix timestamp in seconds
}

async function checkRateLimit(
  key: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const redis = await getRedisClient();

  if (redis && redisAvailable) {
    return checkRedisRateLimit(redis, key, config);
  }

  return checkMemoryRateLimit(key, config);
}

async function checkRedisRateLimit(
  redis: NonNullable<typeof redisClient>,
  key: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  try {
    const redisKey = `rl:${key}`;
    const count = await redis.incr(redisKey);

    if (count === 1) {
      await redis.expire(redisKey, config.windowSeconds);
    }

    const ttl = await redis.ttl(redisKey);
    const resetAt = Math.floor(Date.now() / 1000) + Math.max(ttl, 0);

    return {
      allowed: count <= config.maxRequests,
      limit: config.maxRequests,
      remaining: Math.max(0, config.maxRequests - count),
      resetAt,
    };
  } catch {
    redisAvailable = false;
    return checkMemoryRateLimit(key, config);
  }
}

function checkMemoryRateLimit(
  key: string,
  config: RateLimitConfig
): RateLimitResult {
  const now = Date.now();
  const windowMs = config.windowSeconds * 1000;
  const existing = memoryStore.get(key);

  if (!existing || existing.expiresAt < now) {
    memoryStore.set(key, { count: 1, expiresAt: now + windowMs });
    return {
      allowed: true,
      limit: config.maxRequests,
      remaining: config.maxRequests - 1,
      resetAt: Math.floor((now + windowMs) / 1000),
    };
  }

  existing.count++;
  return {
    allowed: existing.count <= config.maxRequests,
    limit: config.maxRequests,
    remaining: Math.max(0, config.maxRequests - existing.count),
    resetAt: Math.floor(existing.expiresAt / 1000),
  };
}

// ===========================================
// Key Generation
// ===========================================

function defaultKeyGenerator(req: Request): string {
  // Prefer user ID from JWT, then API key ID, then IP
  if (req.jwtUser?.id) {return `user:${req.jwtUser.id}`;}
  if (req.apiKey?.id) {return `apikey:${req.apiKey.id}`;}
  return `ip:${req.ip || req.socket?.remoteAddress || 'unknown'}`;
}

// ===========================================
// Middleware Factory
// ===========================================

/**
 * Create a rate limiter middleware with custom configuration.
 */
export function createRateLimiter(config: RateLimitConfig) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const key = (config.keyGenerator || defaultKeyGenerator)(req);
    const result = await checkRateLimit(key, config);

    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', result.limit);
    res.setHeader('X-RateLimit-Remaining', result.remaining);
    res.setHeader('X-RateLimit-Reset', result.resetAt);

    if (!result.allowed) {
      const retryAfter = Math.max(1, result.resetAt - Math.floor(Date.now() / 1000));
      res.setHeader('Retry-After', retryAfter);

      res.status(429).json({
        success: false,
        error: `Too many requests. Limit: ${result.limit} per ${config.windowSeconds}s`,
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter,
      });
      return;
    }

    next();
  };
}

/**
 * Create a rate limiter for a specific tier.
 */
export function createEndpointLimiter(tier: RateLimitTier) {
  const config = runtimeTierConfigs.get(tier) || TIER_CONFIGS[tier] || TIER_CONFIGS.default;
  return createRateLimiter(config);
}

/**
 * Update a tier's configuration at runtime.
 */
export function updateTierConfig(tier: string, config: Partial<RateLimitConfig>): RateLimitConfig {
  const existing = runtimeTierConfigs.get(tier) || TIER_CONFIGS[tier as RateLimitTier] || TIER_CONFIGS.default;
  const updated: RateLimitConfig = {
    ...existing,
    ...config,
  };
  runtimeTierConfigs.set(tier, updated);
  return updated;
}

/**
 * Get current tier configuration.
 */
export function getTierConfig(tier: string): RateLimitConfig {
  return runtimeTierConfigs.get(tier) || TIER_CONFIGS[tier as RateLimitTier] || TIER_CONFIGS.default;
}

/**
 * Get all tier configurations.
 */
export function getAllTierConfigs(): Record<string, RateLimitConfig> {
  const configs: Record<string, RateLimitConfig> = {};
  for (const [tier, config] of Object.entries(TIER_CONFIGS)) {
    configs[tier] = runtimeTierConfigs.get(tier) || config;
  }
  // Include any custom runtime tiers
  for (const [tier, config] of runtimeTierConfigs.entries()) {
    if (!(tier in TIER_CONFIGS)) {
      configs[tier] = config;
    }
  }
  return configs;
}

/**
 * Pre-configured rate limiter for common use cases.
 */
export const advancedRateLimiter = {
  default: createEndpointLimiter('default'),
  auth: createEndpointLimiter('auth'),
  ai: createEndpointLimiter('ai'),
  upload: createEndpointLimiter('upload'),
};

/**
 * Get rate limit hit statistics (memory store only, for now).
 */
export function getRateLimitStats(): {
  activeKeys: number;
  redisAvailable: boolean;
} {
  return {
    activeKeys: memoryStore.size,
    redisAvailable,
  };
}

// For testing
export function resetMemoryStore(): void {
  memoryStore.clear();
  runtimeTierConfigs.clear();
}
