/**
 * Phase 62: Advanced Rate Limiting
 * Sprint 1.3 (2026-04-17): Plan-Based Rate Limits + Tier-Hit-Telemetry
 *
 * Redis-based sliding window rate limiting with per-user and per-endpoint support.
 * Falls back to in-memory when Redis is unavailable.
 *
 * Endpoint-Tiers (technisch):
 * - default: 100 req/min
 * - auth: 10 req/min (login, register)
 * - ai: 30 req/min (chat, agent execution)
 * - upload: 20 req/min
 *
 * Plan-Tiers (Sprint 1.3, pro Org-Plan):
 *   free:       100 req/min  |  1 000 req/day
 *   personal:   500 req/min  |  5 000 req/day
 *   pro:      5 000 req/min  | 50 000 req/day
 *   business: 50 000 req/min | 500 000 req/day
 *   enterprise: unbegrenzt (no-op limiter)
 *
 * 429-Antwort enthält strukturierte Plan-Info (plan, limit, resetAt, retryAfter,
 * upgradeHint).
 *
 * Telemetrie: tier_hit_ratio = blocked / total pro (plan, kind). Exposed via
 * getRateLimitTelemetry() → /api/security/rate-limits/stats.
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../../utils/logger';
import type { OrgPlan } from '../../types/multi-tenancy';

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
// Sprint 1.3 — Plan-Based Rate Limits
// ===========================================

export type RateLimitKind = 'api' | 'ai';

export interface PlanTierLimits {
  /** req/min (sliding window 60s) */
  perMinute: number;
  /** req/day (sliding window 86400s); null = unlimited */
  perDay: number | null;
}

/**
 * Plan-Limits pro OrgPlan. `null` = unbegrenzt (enterprise).
 *
 * Master-Plan v2 Sektion 7, Sprint 1.3 (2026-04-17).
 */
export const PLAN_RATE_LIMITS: Record<OrgPlan, { api: PlanTierLimits; ai: PlanTierLimits }> = {
  free: {
    api: { perMinute: 100, perDay: 1_000 },
    ai: { perMinute: 10, perDay: 100 },
  },
  personal: {
    api: { perMinute: 500, perDay: 5_000 },
    ai: { perMinute: 50, perDay: 500 },
  },
  pro: {
    api: { perMinute: 5_000, perDay: 50_000 },
    ai: { perMinute: 500, perDay: 5_000 },
  },
  business: {
    api: { perMinute: 50_000, perDay: 500_000 },
    ai: { perMinute: 5_000, perDay: 50_000 },
  },
  enterprise: {
    api: { perMinute: Number.POSITIVE_INFINITY, perDay: null },
    ai: { perMinute: Number.POSITIVE_INFINITY, perDay: null },
  },
};

function isValidOrgPlan(v: unknown): v is OrgPlan {
  return v === 'free' || v === 'personal' || v === 'pro' || v === 'business' || v === 'enterprise';
}

/**
 * Ermittelt den Plan eines Request-Users.
 *
 * Quelle (in dieser Reihenfolge):
 *   1. req.jwtUser.plan (JWT-Payload; seit Sprint 1.9 für alle Nicht-Legacy-
 *      Tokens gesetzt, inklusive Demo-User)
 *   2. 'free' (Fallback für unauthentifizierte / Legacy-Requests ohne Plan
 *      im Payload — z.B. Tokens, die vor Sprint 1.9 ausgestellt wurden und
 *      noch bis zu 15 min gültig sind)
 *
 * Es wird bewusst KEIN DB-Lookup gemacht — der Plan wird beim Token-Issue
 * einmalig in den JWT geschrieben (siehe jwt-service.ts lookupUserOrgPlan).
 */
export function resolvePlanFromRequest(req: Request): OrgPlan {
  const candidate = req.jwtUser?.plan;
  if (isValidOrgPlan(candidate)) {return candidate;}
  return 'free';
}

// ===========================================
// Sprint 1.3 — Tier-Hit-Telemetry
// ===========================================

interface TierHitCounter {
  total: number;
  blocked: number;
}

// Key-Format: `${plan}:${kind}` → counter
const tierHitCounters = new Map<string, TierHitCounter>();

function telemetryKey(plan: OrgPlan, kind: RateLimitKind): string {
  return `${plan}:${kind}`;
}

function recordTierHit(plan: OrgPlan, kind: RateLimitKind, blocked: boolean): void {
  const key = telemetryKey(plan, kind);
  const counter = tierHitCounters.get(key) ?? { total: 0, blocked: 0 };
  counter.total += 1;
  if (blocked) {counter.blocked += 1;}
  tierHitCounters.set(key, counter);
}

export interface RateLimitTelemetryEntry {
  plan: OrgPlan;
  kind: RateLimitKind;
  total: number;
  blocked: number;
  /** blocked / total — 0 wenn total = 0 */
  tier_hit_ratio: number;
}

export function getRateLimitTelemetry(): RateLimitTelemetryEntry[] {
  const entries: RateLimitTelemetryEntry[] = [];
  for (const [key, counter] of tierHitCounters.entries()) {
    const [planStr, kindStr] = key.split(':');
    if (!isValidOrgPlan(planStr)) {continue;}
    if (kindStr !== 'api' && kindStr !== 'ai') {continue;}
    entries.push({
      plan: planStr,
      kind: kindStr,
      total: counter.total,
      blocked: counter.blocked,
      tier_hit_ratio: counter.total === 0 ? 0 : counter.blocked / counter.total,
    });
  }
  return entries;
}

export function resetRateLimitTelemetry(): void {
  tierHitCounters.clear();
}

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

// ===========================================
// Sprint 1.3 — Plan-Based Middleware
// ===========================================

function upgradeHintFor(plan: OrgPlan): string | null {
  // Kein Hint für enterprise (der Plan ist bereits top-tier)
  const upgradePath: Record<OrgPlan, OrgPlan | null> = {
    free: 'personal',
    personal: 'pro',
    pro: 'business',
    business: 'enterprise',
    enterprise: null,
  };
  const next = upgradePath[plan];
  return next ? `Upgrade auf Plan '${next}' für höhere Limits.` : null;
}

/**
 * Plan-basiertes Rate-Limiting (Sprint 1.3).
 *
 * Prüft sowohl per-minute als auch per-day Limit des User-Plans. Blockt sobald
 * eines der beiden überschritten wird. Enterprise-Plan bypasst alle Limits.
 *
 * @param kind 'api' für generische Endpoints, 'ai' für Chat/Agents/Streaming
 */
export function createPlanRateLimiter(kind: RateLimitKind) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const plan = resolvePlanFromRequest(req);
    const limits = PLAN_RATE_LIMITS[plan][kind];

    // Enterprise: unlimited — nur Telemetrie, keine Blockade
    if (!Number.isFinite(limits.perMinute)) {
      recordTierHit(plan, kind, false);
      next();
      return;
    }

    const baseKey = defaultKeyGenerator(req);

    // Check 1: per-minute window
    const minuteKey = `plan:${plan}:${kind}:min:${baseKey}`;
    const minuteResult = await checkRateLimit(minuteKey, {
      maxRequests: limits.perMinute,
      windowSeconds: 60,
    });

    // Check 2: per-day window (wenn konfiguriert)
    let dayResult: RateLimitResult | null = null;
    if (limits.perDay !== null) {
      const dayKey = `plan:${plan}:${kind}:day:${baseKey}`;
      dayResult = await checkRateLimit(dayKey, {
        maxRequests: limits.perDay,
        windowSeconds: 86_400,
      });
    }

    // Entscheide: Welcher Limit hat zugeschlagen? Minute hat Priorität.
    let blocked = false;
    let violated: { window: 'minute' | 'day'; result: RateLimitResult } | null = null;

    if (!minuteResult.allowed) {
      blocked = true;
      violated = { window: 'minute', result: minuteResult };
    } else if (dayResult && !dayResult.allowed) {
      blocked = true;
      violated = { window: 'day', result: dayResult };
    }

    // Headers: immer setzen, damit der Client seine Auslastung kennt
    res.setHeader('X-RateLimit-Plan', plan);
    res.setHeader('X-RateLimit-Limit', minuteResult.limit);
    res.setHeader('X-RateLimit-Remaining', minuteResult.remaining);
    res.setHeader('X-RateLimit-Reset', minuteResult.resetAt);
    if (dayResult) {
      res.setHeader('X-RateLimit-Daily-Limit', dayResult.limit);
      res.setHeader('X-RateLimit-Daily-Remaining', dayResult.remaining);
      res.setHeader('X-RateLimit-Daily-Reset', dayResult.resetAt);
    }

    recordTierHit(plan, kind, blocked);

    if (!blocked || !violated) {
      next();
      return;
    }

    const retryAfter = Math.max(1, violated.result.resetAt - Math.floor(Date.now() / 1000));
    res.setHeader('Retry-After', retryAfter);

    res.status(429).json({
      success: false,
      error: `Rate limit exceeded (${violated.window}-window). Plan '${plan}' erlaubt ${violated.result.limit} ${kind}-requests pro ${violated.window === 'minute' ? 'Minute' : 'Tag'}.`,
      code: 'RATE_LIMIT_EXCEEDED',
      plan,
      kind,
      window: violated.window,
      limit: violated.result.limit,
      remaining: violated.result.remaining,
      resetAt: violated.result.resetAt,
      retryAfter,
      upgradeHint: upgradeHintFor(plan),
    });
  };
}

/**
 * Pre-configured plan-based rate limiters for common use cases.
 */
export const planRateLimiter = {
  api: createPlanRateLimiter('api'),
  ai: createPlanRateLimiter('ai'),
};

/**
 * Get rate limit hit statistics (memory store only, for now).
 *
 * Sprint 1.3: Enthält zusätzlich tier_hit_ratio pro Plan/Kind.
 */
export function getRateLimitStats(): {
  activeKeys: number;
  redisAvailable: boolean;
  telemetry: RateLimitTelemetryEntry[];
} {
  return {
    activeKeys: memoryStore.size,
    redisAvailable,
    telemetry: getRateLimitTelemetry(),
  };
}

// For testing
export function resetMemoryStore(): void {
  memoryStore.clear();
  runtimeTierConfigs.clear();
  resetRateLimitTelemetry();
}
