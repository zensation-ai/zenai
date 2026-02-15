/**
 * Phase 4: Authentication & Authorization Middleware
 * Supports API Keys and JWT tokens for external integrations
 *
 * Phase 9 Security Hardening:
 * - bcrypt for API key hashing (replaces SHA256)
 * - Async verification for timing-attack resistance
 */

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { pool } from '../utils/database';
import { queryContext } from '../utils/database-context';
import { logger } from '../utils/logger';
import { checkKeyExpiry, KeyExpiryInfo } from '../services/api-key-security';

const BCRYPT_SALT_ROUNDS = 12;

// ===========================================
// In-Memory Rate Limiter Fallback
// ===========================================

/**
 * In-memory rate limiter used as fallback when database is unavailable.
 * This ensures rate limiting continues even during DB outages.
 *
 * ARCHITECTURE NOTES:
 * - Uses fixed-window counters (not sliding window). This means a burst of
 *   requests at the boundary of two windows can temporarily allow up to 2x
 *   the configured limit. This is an acceptable trade-off for simplicity.
 * - For multi-instance deployments (e.g., Railway scaled horizontally), the
 *   in-memory fallback does NOT share state across instances. Each instance
 *   tracks limits independently, which means effective limits are multiplied
 *   by the number of instances. The primary DB-backed limiter shares state
 *   via PostgreSQL and is not affected.
 * - The fallback activates only after MAX_CONSECUTIVE_ERRORS (3) database
 *   failures and automatically recovers on the next successful DB operation.
 * - Bounded to MAX_RATE_LIMIT_ENTRIES (10,000) with LRU-style eviction.
 */
interface MemoryRateLimitEntry {
  count: number;
  windowStart: number;
}

const memoryRateLimits = new Map<string, MemoryRateLimitEntry>();
let memoryRateLimiterEnabled = false;
let consecutiveDbErrors = 0;
const MAX_CONSECUTIVE_ERRORS = 3;
const MEMORY_CLEANUP_INTERVAL = 60 * 1000; // 1 minute
const MAX_RATE_LIMIT_ENTRIES = 10000; // Prevent unbounded growth

// Clean up old entries periodically (skip in test env to prevent Jest handle leaks)
let rateLimitCleanupInterval: ReturnType<typeof setInterval> | null = null;
if (process.env.NODE_ENV !== 'test') {
  rateLimitCleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of memoryRateLimits.entries()) {
      if (now - entry.windowStart > 120000) { // 2 minutes old
        memoryRateLimits.delete(key);
      }
    }
  }, MEMORY_CLEANUP_INTERVAL);
}

/** Stop the rate-limit cleanup interval (call during shutdown or in tests). */
export function stopRateLimitCleanup(): void {
  if (rateLimitCleanupInterval) {
    clearInterval(rateLimitCleanupInterval);
    rateLimitCleanupInterval = null;
  }
}

/**
 * Check rate limit using in-memory storage
 */
function checkMemoryRateLimit(key: string, limit: number, windowMs: number): { allowed: boolean; count: number; resetAt: number } {
  const now = Date.now();
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const cacheKey = `${key}:${windowStart}`;

  // Cleanup when approaching max entries to prevent unbounded growth
  if (memoryRateLimits.size >= MAX_RATE_LIMIT_ENTRIES) {
    // Remove oldest entries (first 10%)
    const entriesToRemove = Math.floor(MAX_RATE_LIMIT_ENTRIES * 0.1);
    const iterator = memoryRateLimits.keys();
    for (let i = 0; i < entriesToRemove; i++) {
      const keyToRemove = iterator.next().value;
      if (keyToRemove) {
        memoryRateLimits.delete(keyToRemove);
      }
    }
  }

  let entry = memoryRateLimits.get(cacheKey);

  if (!entry || entry.windowStart !== windowStart) {
    entry = { count: 1, windowStart };
    memoryRateLimits.set(cacheKey, entry);
  } else {
    entry.count++;
  }

  return {
    allowed: entry.count <= limit,
    count: entry.count,
    resetAt: windowStart + windowMs,
  };
}

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      apiKey?: {
        id: string;
        name: string;
        scopes: string[];
        rateLimit: number;
        expiryInfo?: KeyExpiryInfo;
      };
      user?: {
        id: string;
        provider: string;
      };
    }
  }
}

/**
 * Hash an API key for secure storage using bcrypt
 * Phase 9: Upgraded from SHA256 to bcrypt for better security
 */
export async function hashApiKey(key: string): Promise<string> {
  return bcrypt.hash(key, BCRYPT_SALT_ROUNDS);
}

/**
 * Verify an API key against a bcrypt hash
 * Timing-safe comparison to prevent timing attacks
 */
export async function verifyApiKey(key: string, hash: string): Promise<boolean> {
  // Support legacy SHA256 hashes during migration
  if (hash.length === 64 && /^[a-f0-9]+$/.test(hash)) {
    const sha256Hash = crypto.createHash('sha256').update(key).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(sha256Hash), Buffer.from(hash));
  }
  // bcrypt verification
  return bcrypt.compare(key, hash);
}

/**
 * Generate a new API key
 * Format: ab_live_xxxxxxxxxxxxxxxxxxxx
 */
export async function generateApiKey(): Promise<{ key: string; prefix: string; hash: string }> {
  const randomBytes = crypto.randomBytes(24).toString('hex');
  const key = `ab_live_${randomBytes}`;
  const prefix = key.substring(0, 10);
  const hash = await hashApiKey(key);
  return { key, prefix, hash };
}

/**
 * API Key Authentication Middleware
 * Validates API key from Authorization header or x-api-key header
 *
 * SECURITY HARDENING (Phase 9+):
 * - Dev bypass requires explicit ALLOW_DEV_BYPASS=true
 * - All access is logged for audit trail
 * - UUID-based auth deprecated with warning
 */
export async function apiKeyAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const apiKeyHeader = req.headers['x-api-key'] as string;

  let apiKey: string | undefined;

  // Accept API keys in multiple formats:
  // 1. Bearer ab_xxx - standard format
  // 2. Bearer <uuid> - legacy/alternative format (key ID lookup) - DEPRECATED
  // 3. x-api-key header
  if (authHeader?.startsWith('Bearer ')) {
    apiKey = authHeader.substring(7);
  } else if (apiKeyHeader) {
    apiKey = apiKeyHeader;
  }

  // SECURITY: Development mode bypass has been REMOVED for production safety.
  // All requests now require valid API key authentication.
  // For local development, use: npm run generate-api-key to create a dev key.
  //
  // The previous bypass code has been intentionally removed because:
  // 1. It could be accidentally enabled in production
  // 2. It bypassed authentication entirely
  // 3. Creating a dev API key is trivial and more secure

  if (!apiKey) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required. Provide API key via Authorization: Bearer ab_xxx or x-api-key header',
      code: 'UNAUTHORIZED',
    });
  }

  try {
    let result;

    // Check if key is UUID format (DEPRECATED - will be removed in future)
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(apiKey);

    if (isUUID) {
      logger.warn('DEPRECATED: UUID-based API key auth used', {
        operation: 'apiKeyAuth',
        keyIdPrefix: apiKey.substring(0, 8),
        deprecationNote: 'Please migrate to ab_live_xxx format keys'
      });
      // Lookup by key ID directly
      result = await pool.query(
        `SELECT id, name, scopes, rate_limit, expires_at, is_active, key_hash, created_at
         FROM api_keys
         WHERE id = $1`,
        [apiKey]
      );
    } else {
      // Extract prefix for fast lookup (first 10 chars: "ab_live_xx")
      const prefix = apiKey.substring(0, 10);

      // Find key candidates by prefix
      result = await pool.query(
        `SELECT id, name, scopes, rate_limit, expires_at, is_active, key_hash, created_at
         FROM api_keys
         WHERE key_prefix = $1`,
        [prefix]
      );
    }

    if (result.rows.length === 0) {
      // SECURITY HARDENED: No more automatic dev bypass for invalid keys
      // Invalid keys are rejected even in development mode
      logger.warn('Invalid API key rejected', {
        operation: 'apiKeyAuth',
        keyPrefix: apiKey.substring(0, 10)
      });
      return res.status(401).json({
        success: false,
        error: 'The provided API key is not valid',
        code: 'INVALID_API_KEY',
      });
    }

    // Verify the key against stored hash(es)
    let keyData = null;

    // SECURITY: Always verify hash for all key types
    for (const row of result.rows) {
      if (isUUID) {
        // UUID-based auth is DEPRECATED and requires key_hash verification
        // UUID lookup by ID still requires the stored key_hash to match
        // Client must provide the full key (UUID + secret), we verify against hash
        if (!row.key_hash) {
          logger.error('UUID auth rejected: no key_hash stored', undefined, {
            operation: 'apiKeyAuth',
            keyId: row.id,
            securityNote: 'UUID keys must have key_hash for authentication'
          });
          continue; // Skip this row, try next if any
        }
        // For UUID keys, require a query parameter or header with the actual secret
        // This is a security hardening - UUID alone is no longer sufficient
        const keySecret = req.headers['x-api-key-secret'] as string | undefined;
        if (!keySecret) {
          logger.warn('DEPRECATED: UUID-based API key auth rejected - secret required', {
            operation: 'apiKeyAuth',
            keyIdPrefix: apiKey.substring(0, 8),
            securityNote: 'UUID auth requires x-api-key-secret header or migrate to ab_live_xxx format'
          });
          return res.status(401).json({
            success: false,
            error: 'UUID-based authentication is deprecated. Provide x-api-key-secret header or migrate to ab_live_xxx format keys.',
            code: 'UNAUTHORIZED',
          });
        }
        // Verify the secret against stored hash
        if (await verifyApiKey(keySecret, row.key_hash)) {
          keyData = row;
          logger.warn('UUID auth with secret verification successful', {
            operation: 'apiKeyAuth',
            keyId: row.id,
            deprecationNote: 'Please migrate to ab_live_xxx format keys'
          });
          break;
        }
      } else {
        // Standard ab_ key: verify against hash
        if (await verifyApiKey(apiKey, row.key_hash)) {
          keyData = row;
          break;
        }
      }
    }

    if (!keyData) {
      return res.status(401).json({
        success: false,
        error: 'The provided API key is not valid',
        code: 'INVALID_API_KEY',
      });
    }

    if (!keyData.is_active) {
      return res.status(401).json({
        success: false,
        error: 'This API key has been disabled',
        code: 'INVALID_API_KEY',
      });
    }

    if (keyData.expires_at && new Date(keyData.expires_at) < new Date()) {
      return res.status(401).json({
        success: false,
        error: 'This API key has expired',
        code: 'INVALID_API_KEY',
      });
    }

    // Update last_used_at (fire-and-forget — no need to block the request)
    pool.query(
      'UPDATE api_keys SET last_used_at = NOW() WHERE id = $1',
      [keyData.id]
    ).catch((err) => {
      logger.warn('Failed to update last_used_at', {
        operation: 'apiKeyAuth',
        keyId: keyData.id,
        error: err instanceof Error ? err.message : String(err),
      });
    });

    // Phase Security Sprint 3: Check key expiry status and add warnings
    const expiryInfo = checkKeyExpiry(keyData.expires_at, keyData.created_at);

    // Set warning headers if key is expiring soon
    if (expiryInfo.warningMessage) {
      res.setHeader('X-API-Key-Warning', expiryInfo.warningMessage);
    }
    if (expiryInfo.isExpiringSoon || expiryInfo.isCritical) {
      res.setHeader('X-API-Key-Expires-In-Days', expiryInfo.daysUntilExpiry?.toString() || '0');
    }
    if (expiryInfo.rotationRecommended) {
      res.setHeader('X-API-Key-Rotation-Recommended', 'true');
    }

    // Log expiry warnings
    if (expiryInfo.isCritical) {
      logger.warn('API key expiring soon - CRITICAL', {
        operation: 'apiKeyAuth',
        keyId: keyData.id,
        keyName: keyData.name,
        daysUntilExpiry: expiryInfo.daysUntilExpiry,
        expiresAt: expiryInfo.expiresAt,
      });
    } else if (expiryInfo.isExpiringSoon) {
      logger.info('API key expiring soon', {
        operation: 'apiKeyAuth',
        keyId: keyData.id,
        keyName: keyData.name,
        daysUntilExpiry: expiryInfo.daysUntilExpiry,
      });
    }

    req.apiKey = {
      id: keyData.id,
      name: keyData.name,
      scopes: keyData.scopes || ['read'],
      rateLimit: keyData.rate_limit || 1000,
      expiryInfo,
    };

    next();
  } catch (error) {
    // Distinguish transient DB errors (503) from actual failures (500)
    const pgError = error as { code?: string };
    const transientCodes = ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'EPIPE', '57P01', '57P03', '53300'];
    const isTransient = pgError.code && transientCodes.includes(pgError.code);

    if (isTransient) {
      logger.warn('API key auth: transient DB error', {
        operation: 'apiKeyAuth',
        pgCode: pgError.code,
      });
      return res.status(503).json({
        success: false,
        error: 'Service temporarily unavailable, please retry',
        code: 'SERVICE_UNAVAILABLE',
      });
    }

    logger.error('API key auth error', error instanceof Error ? error : undefined, { operation: 'apiKeyAuth' });
    return res.status(500).json({
      success: false,
      error: 'Failed to validate API key',
      code: 'INTERNAL_ERROR',
    });
  }
}

/**
 * Scope validation middleware factory
 * Checks if the API key has the required scope
 */
export function requireScope(scope: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.apiKey) {
      return res.status(401).json({
        success: false,
        error: 'No API key found in request',
        code: 'UNAUTHORIZED',
      });
    }

    const hasScope = req.apiKey.scopes.includes(scope) ||
                     req.apiKey.scopes.includes('admin');

    if (!hasScope) {
      return res.status(403).json({
        success: false,
        error: `Insufficient permissions. This action requires the '${scope}' scope`,
        code: 'FORBIDDEN',
      });
    }

    next();
  };
}

/**
 * Endpoint-specific rate limits for critical operations.
 *
 * Rate limiting uses a fixed-window counter stored in PostgreSQL with an
 * in-memory fallback. The DB implementation uses UPSERT (ON CONFLICT) for
 * atomic increment, keyed by (identifier, window_start). The window_start
 * is computed as `floor(now / windowMs) * windowMs`.
 *
 * SECURITY Sprint 2: Added stricter limits for:
 * - Authentication endpoints (brute-force protection)
 * - API key management (abuse prevention)
 * - Voice memo uploads (resource protection)
 */
const ENDPOINT_LIMITS: Record<string, { limit: number; windowMs: number }> = {
  // ===========================================
  // SECURITY: Authentication & API Key endpoints - STRICT limits (brute-force protection)
  // ===========================================
  'POST:/api/keys': { limit: 5, windowMs: 60 * 1000 }, // 5/min - API key creation
  'DELETE:/api/keys': { limit: 10, windowMs: 60 * 1000 }, // 10/min - API key deletion
  'GET:/api/keys': { limit: 30, windowMs: 60 * 1000 }, // 30/min - API key listing

  // ===========================================
  // Heavy computation endpoints - stricter limits
  // ===========================================
  'POST:/api/personal/topics/generate': { limit: 2, windowMs: 60 * 1000 }, // 2/min
  'POST:/api/work/topics/generate': { limit: 2, windowMs: 60 * 1000 }, // 2/min
  'POST:/api/personal/incubator/consolidate': { limit: 5, windowMs: 60 * 1000 }, // 5/min
  'POST:/api/work/incubator/consolidate': { limit: 5, windowMs: 60 * 1000 }, // 5/min
  'POST:/api/personal/knowledge-graph/discover': { limit: 3, windowMs: 60 * 1000 }, // 3/min
  'POST:/api/work/knowledge-graph/discover': { limit: 3, windowMs: 60 * 1000 }, // 3/min

  // AI Chat endpoints - moderate limits to prevent abuse
  'POST:/api/chat/sessions': { limit: 10, windowMs: 60 * 1000 }, // 10/min - session creation
  'POST:/api/chat/quick': { limit: 20, windowMs: 60 * 1000 }, // 20/min - quick chat

  // ===========================================
  // Expensive AI endpoints - strict limits (cost protection)
  // ===========================================
  'POST:/api/vision/analyze': { limit: 10, windowMs: 60 * 1000 }, // 10/min - image analysis
  'POST:/api/vision/document': { limit: 5, windowMs: 60 * 1000 }, // 5/min - full document processing
  'POST:/api/vision/extract-text': { limit: 15, windowMs: 60 * 1000 }, // 15/min - OCR
  'POST:/api/vision/extract-ideas': { limit: 10, windowMs: 60 * 1000 }, // 10/min - idea extraction
  'POST:/api/vision/compare': { limit: 5, windowMs: 60 * 1000 }, // 5/min - image comparison
  'POST:/api/code/execute': { limit: 10, windowMs: 60 * 1000 }, // 10/min - code generation + execution
  'POST:/api/code/run': { limit: 15, windowMs: 60 * 1000 }, // 15/min - code execution only
  'POST:/api/project/analyze': { limit: 3, windowMs: 60 * 1000 }, // 3/min - full project analysis
  'POST:/api/project/summary': { limit: 5, windowMs: 60 * 1000 }, // 5/min - quick project summary

  // ===========================================
  // Media uploads - moderate limits (SECURITY Sprint 2)
  // ===========================================
  'POST:/api/media': { limit: 20, windowMs: 60 * 1000 }, // 20/min
  'POST:/api/voice-memo': { limit: 20, windowMs: 60 * 1000 }, // 20/min - voice memo upload
  'POST:/api/voice-memo/text': { limit: 30, windowMs: 60 * 1000 }, // 30/min - text processing
  'POST:/api/voice-memo/transcribe': { limit: 15, windowMs: 60 * 1000 }, // 15/min - transcription only
  'POST:/api/personal/voice-memo': { limit: 20, windowMs: 60 * 1000 }, // 20/min - context-aware upload
  'POST:/api/work/voice-memo': { limit: 20, windowMs: 60 * 1000 }, // 20/min - context-aware upload

  // ===========================================
  // Export endpoints - prevent data scraping
  // ===========================================
  'GET:/api/export/backup': { limit: 2, windowMs: 60 * 1000 }, // 2/min - full backup
  'GET:/api/export/ideas/pdf': { limit: 10, windowMs: 60 * 1000 }, // 10/min
  'GET:/api/export/ideas/csv': { limit: 10, windowMs: 60 * 1000 }, // 10/min
  'GET:/api/export/ideas/json': { limit: 10, windowMs: 60 * 1000 }, // 10/min
  'GET:/api/export/ideas/markdown': { limit: 10, windowMs: 60 * 1000 }, // 10/min

  // ===========================================
  // Write operations - moderate limits
  // ===========================================
  'POST:/api/personal/ideas': { limit: 60, windowMs: 60 * 1000 }, // 60/min
  'POST:/api/work/ideas': { limit: 60, windowMs: 60 * 1000 }, // 60/min
  'PUT:/api/personal/ideas': { limit: 100, windowMs: 60 * 1000 }, // 100/min
  'PUT:/api/work/ideas': { limit: 100, windowMs: 60 * 1000 }, // 100/min

  // Webhook management - prevent abuse
  'POST:/api/webhooks': { limit: 10, windowMs: 60 * 1000 }, // 10/min
  'DELETE:/api/webhooks': { limit: 20, windowMs: 60 * 1000 }, // 20/min
};

// Track if rate_limits table has been initialized
let rateLimitsTableInitialized = false;

/**
 * Ensure rate_limits table exists (auto-create if missing)
 * Uses queryContext to ensure it's created in the correct schema
 */
async function ensureRateLimitsTable(): Promise<void> {
  if (rateLimitsTableInitialized) {
    return;
  }

  try {
    await queryContext('personal', `
      CREATE TABLE IF NOT EXISTS rate_limits (
        id SERIAL PRIMARY KEY,
        key VARCHAR(255) NOT NULL,
        window_start TIMESTAMP WITH TIME ZONE NOT NULL,
        request_count INTEGER DEFAULT 1,
        UNIQUE(key, window_start)
      )
    `);
    await queryContext('personal', `
      CREATE INDEX IF NOT EXISTS idx_rate_limits_key ON rate_limits(key, window_start)
    `);
    rateLimitsTableInitialized = true;
    logger.info('Rate limits table initialized', { operation: 'rateLimiter' });
  } catch (error) {
    logger.warn('Could not create rate_limits table', { operation: 'rateLimiter', error });
  }
}

export async function rateLimiter(req: Request, res: Response, next: NextFunction) {
  // Use API key ID, client IP, or generate unique identifier
  // SECURITY: Never use 'anonymous' as it would share limits across all unauthenticated users
  // For unknown IPs, use a combination of available request info to create a unique identifier
  let key: string;

  if (req.apiKey?.id) {
    key = req.apiKey.id;
  } else if (req.ip) {
    key = req.ip;
  } else if (req.socket?.remoteAddress) {
    key = req.socket.remoteAddress;
  } else {
    // SECURITY: Fallback to request-based unique identifier rather than shared 'anonymous'
    // This prevents rate limit bypass attacks when IP cannot be determined
    const userAgent = req.headers['user-agent'] || 'unknown';
    const forwarded = req.headers['x-forwarded-for'];
    const forwardedStr = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    key = `unknown:${forwardedStr || 'no-ip'}:${userAgent.substring(0, 50)}`;
  }

  // Check for endpoint-specific limit
  const endpoint = `${req.method}:${req.path}`;
  const endpointConfig = ENDPOINT_LIMITS[endpoint];

  const limit = endpointConfig?.limit || req.apiKey?.rateLimit || 100; // Default 100 for non-authenticated
  const windowMs = endpointConfig?.windowMs || 60 * 1000; // Default 1 minute window

  try {
    // Ensure table exists on first request
    await ensureRateLimitsTable();

    const windowStart = new Date(Math.floor(Date.now() / windowMs) * windowMs);

    // Upsert rate limit counter
    // FIXED: Column name is 'key' not 'identifier' (matches schema in init-db.ts)
    // Uses queryContext to ensure correct schema
    const result = await queryContext(
      'personal',
      `INSERT INTO rate_limits (key, window_start, request_count)
       VALUES ($1, $2, 1)
       ON CONFLICT (key, window_start)
       DO UPDATE SET request_count = rate_limits.request_count + 1
       RETURNING request_count`,
      [key, windowStart]
    );

    const currentCount = result.rows[0].request_count;

    // Reset error counter on successful DB operation
    if (consecutiveDbErrors > 0) {
      consecutiveDbErrors = 0;
      if (memoryRateLimiterEnabled) {
        memoryRateLimiterEnabled = false;
        logger.info('Rate limiter restored to database mode', { operation: 'rateLimiter' });
      }
    }

    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', limit);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, limit - currentCount));
    res.setHeader('X-RateLimit-Reset', new Date(windowStart.getTime() + windowMs).toISOString());

    if (currentCount > limit) {
      return res.status(429).json({
        success: false,
        error: `Too many requests. Limit: ${limit}/minute`,
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter: Math.ceil((windowStart.getTime() + windowMs - Date.now()) / 1000),
      });
    }

    next();
  } catch (error) {
    consecutiveDbErrors++;
    logger.error('Rate limiter DB error', error instanceof Error ? error : undefined, {
      operation: 'rateLimiter',
      consecutiveErrors: consecutiveDbErrors,
    });

    // SECURITY: Use in-memory fallback instead of bypassing rate limiting
    // This maintains protection even during database outages
    if (consecutiveDbErrors >= MAX_CONSECUTIVE_ERRORS) {
      memoryRateLimiterEnabled = true;
      logger.warn('Rate limiter switched to in-memory fallback due to DB errors', {
        operation: 'rateLimiter',
        consecutiveErrors: consecutiveDbErrors,
      });
    }

    // Apply in-memory rate limiting
    const memResult = checkMemoryRateLimit(key, limit, windowMs);

    res.setHeader('X-RateLimit-Limit', limit);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, limit - memResult.count));
    res.setHeader('X-RateLimit-Reset', new Date(memResult.resetAt).toISOString());
    res.setHeader('X-RateLimit-Source', 'memory-fallback');

    if (!memResult.allowed) {
      return res.status(429).json({
        success: false,
        error: `Too many requests. Limit: ${limit}/minute`,
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter: Math.ceil((memResult.resetAt - Date.now()) / 1000),
      });
    }

    next();
  }
}

/**
 * Optional auth - continues even without authentication
 * Useful for endpoints that work differently for authenticated users
 */
export async function optionalAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const apiKeyHeader = req.headers['x-api-key'] as string;

  let apiKey: string | undefined;

  if (authHeader?.startsWith('Bearer ab_')) {
    apiKey = authHeader.substring(7);
  } else if (apiKeyHeader?.startsWith('ab_')) {
    apiKey = apiKeyHeader;
  }

  if (!apiKey) {
    return next(); // Continue without auth
  }

  try {
    // Extract prefix for fast lookup
    const prefix = apiKey.substring(0, 10);

    const result = await pool.query(
      `SELECT id, name, scopes, rate_limit, key_hash
       FROM api_keys
       WHERE key_prefix = $1 AND is_active = true
       AND (expires_at IS NULL OR expires_at > NOW())`,
      [prefix]
    );

    // Verify key against stored hash(es)
    for (const row of result.rows) {
      if (await verifyApiKey(apiKey, row.key_hash)) {
        req.apiKey = {
          id: row.id,
          name: row.name,
          scopes: row.scopes || ['read'],
          rateLimit: row.rate_limit || 1000
        };
        break;
      }
    }
  } catch (error) {
    logger.error('Optional auth error', error instanceof Error ? error : undefined, { operation: 'optionalAuth' });
  }

  next();
}

/**
 * Clean up old rate limit entries
 * Should be called periodically (e.g., every hour)
 */
export async function cleanupRateLimits() {
  try {
    const result = await queryContext(
      'personal',
      `DELETE FROM rate_limits
       WHERE window_start < NOW() - INTERVAL '1 hour'`
    );
    logger.info(`Cleaned up ${result.rowCount} old rate limit entries`, { operation: 'cleanupRateLimits' });
  } catch (error) {
    logger.error('Rate limit cleanup error', error instanceof Error ? error : undefined, { operation: 'cleanupRateLimits' });
  }
}
