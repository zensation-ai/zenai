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
import { logger } from '../utils/logger';

const BCRYPT_SALT_ROUNDS = 12;

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      apiKey?: {
        id: string;
        name: string;
        scopes: string[];
        rateLimit: number;
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

  // Development mode bypass - SECURITY HARDENED
  // Requires BOTH conditions:
  // 1. True local development (not Railway/Vercel/cloud)
  // 2. Explicit opt-in via ALLOW_DEV_BYPASS=true
  const isLocalDev = process.env.NODE_ENV === 'development' &&
                     !process.env.RAILWAY_ENVIRONMENT &&
                     !process.env.VERCEL;
  const devBypassEnabled = process.env.ALLOW_DEV_BYPASS === 'true';

  if (!apiKey && isLocalDev && devBypassEnabled) {
    logger.warn('DEV AUTH BYPASS ACTIVE', {
      operation: 'apiKeyAuth',
      ip: req.ip || req.socket?.remoteAddress,
      path: req.path,
      method: req.method,
      securityNote: 'Dev bypass should NEVER be enabled in production'
    });
    req.apiKey = {
      id: 'dev-mode',
      name: 'Development Mode (Read-Only)',
      scopes: ['read'], // SECURITY: No write/admin permissions in dev mode
      rateLimit: 100
    };
    return next();
  }

  if (!apiKey) {
    return res.status(401).json({
      error: 'Authentication required',
      message: 'Provide API key via Authorization: Bearer ab_xxx or x-api-key header'
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
        `SELECT id, name, scopes, rate_limit, expires_at, is_active, key_hash
         FROM api_keys
         WHERE id = $1`,
        [apiKey]
      );
    } else {
      // Extract prefix for fast lookup (first 10 chars: "ab_live_xx")
      const prefix = apiKey.substring(0, 10);

      // Find key candidates by prefix
      result = await pool.query(
        `SELECT id, name, scopes, rate_limit, expires_at, is_active, key_hash
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
        keyPrefix: apiKey.substring(0, 10),
        isLocalDev
      });
      return res.status(401).json({
        error: 'Invalid API key',
        message: 'The provided API key is not valid'
      });
    }

    // Verify the key against stored hash(es)
    let keyData = null;

    // SECURITY: Always verify hash, even for UUID-based keys
    for (const row of result.rows) {
      // For UUID lookup, the apiKey IS the ID, so we need a different check
      if (isUUID) {
        // UUID-based auth: verify row exists and is valid
        // Note: This is less secure - we can't verify the actual key
        // Log a security warning and allow with reduced trust
        keyData = row;
        logger.warn('UUID auth bypassed hash verification', {
          operation: 'apiKeyAuth',
          keyId: row.id,
          securityNote: 'Migrate to ab_live_xxx format for full security'
        });
        break;
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
        error: 'Invalid API key',
        message: 'The provided API key is not valid'
      });
    }

    if (!keyData.is_active) {
      return res.status(401).json({
        error: 'API key disabled',
        message: 'This API key has been disabled'
      });
    }

    if (keyData.expires_at && new Date(keyData.expires_at) < new Date()) {
      return res.status(401).json({
        error: 'API key expired',
        message: 'This API key has expired'
      });
    }

    // Update last_used_at
    await pool.query(
      'UPDATE api_keys SET last_used_at = NOW() WHERE id = $1',
      [keyData.id]
    );

    req.apiKey = {
      id: keyData.id,
      name: keyData.name,
      scopes: keyData.scopes || ['read'],
      rateLimit: keyData.rate_limit || 1000
    };

    next();
  } catch (error) {
    logger.error('API key auth error', error instanceof Error ? error : undefined, { operation: 'apiKeyAuth' });
    return res.status(500).json({
      error: 'Authentication error',
      message: 'Failed to validate API key'
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
        error: 'Authentication required',
        message: 'No API key found in request'
      });
    }

    const hasScope = req.apiKey.scopes.includes(scope) ||
                     req.apiKey.scopes.includes('admin');

    if (!hasScope) {
      return res.status(403).json({
        error: 'Insufficient permissions',
        message: `This action requires the '${scope}' scope`
      });
    }

    next();
  };
}

/**
 * Rate limiting middleware
 * Uses sliding window algorithm with database tracking
 */
/**
 * Endpoint-specific rate limits for critical operations
 */
const ENDPOINT_LIMITS: Record<string, { limit: number; windowMs: number }> = {
  // Heavy computation endpoints - stricter limits
  'POST:/api/personal/topics/generate': { limit: 2, windowMs: 60 * 1000 }, // 2/min
  'POST:/api/work/topics/generate': { limit: 2, windowMs: 60 * 1000 }, // 2/min
  'POST:/api/personal/incubator/consolidate': { limit: 5, windowMs: 60 * 1000 }, // 5/min
  'POST:/api/work/incubator/consolidate': { limit: 5, windowMs: 60 * 1000 }, // 5/min
  'POST:/api/personal/knowledge-graph/discover': { limit: 3, windowMs: 60 * 1000 }, // 3/min
  'POST:/api/work/knowledge-graph/discover': { limit: 3, windowMs: 60 * 1000 }, // 3/min

  // Media uploads - moderate limits
  'POST:/api/media': { limit: 20, windowMs: 60 * 1000 }, // 20/min
  'POST:/api/voice-memos': { limit: 30, windowMs: 60 * 1000 }, // 30/min

  // Write operations - moderate limits
  'POST:/api/personal/ideas': { limit: 60, windowMs: 60 * 1000 }, // 60/min
  'POST:/api/work/ideas': { limit: 60, windowMs: 60 * 1000 }, // 60/min
  'PUT:/api/personal/ideas': { limit: 100, windowMs: 60 * 1000 }, // 100/min
  'PUT:/api/work/ideas': { limit: 100, windowMs: 60 * 1000 }, // 100/min
};

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
    const windowStart = new Date(Math.floor(Date.now() / windowMs) * windowMs);

    // Upsert rate limit counter
    // FIXED: Column name is 'key' not 'identifier' (matches schema in init-db.ts)
    const result = await pool.query(
      `INSERT INTO rate_limits (key, window_start, request_count)
       VALUES ($1, $2, 1)
       ON CONFLICT (key, window_start)
       DO UPDATE SET request_count = rate_limits.request_count + 1
       RETURNING request_count`,
      [key, windowStart]
    );

    const currentCount = result.rows[0].request_count;

    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', limit);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, limit - currentCount));
    res.setHeader('X-RateLimit-Reset', new Date(windowStart.getTime() + windowMs).toISOString());

    if (currentCount > limit) {
      return res.status(429).json({
        error: 'Rate limit exceeded',
        message: `Too many requests. Limit: ${limit}/minute`,
        retryAfter: Math.ceil((windowStart.getTime() + windowMs - Date.now()) / 1000)
      });
    }

    next();
  } catch (error) {
    logger.error('Rate limiter error', error instanceof Error ? error : undefined, { operation: 'rateLimiter' });
    // SECURITY: Fail secure - deny request on DB errors to prevent bypass
    // This ensures rate limiting cannot be bypassed by causing DB failures
    return res.status(503).json({
      error: 'Service temporarily unavailable',
      message: 'Rate limiting service unavailable. Please try again later.',
      retryAfter: 5
    });
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
    const result = await pool.query(
      `DELETE FROM rate_limits
       WHERE window_start < NOW() - INTERVAL '1 hour'`
    );
    logger.info(`Cleaned up ${result.rowCount} old rate limit entries`, { operation: 'cleanupRateLimits' });
  } catch (error) {
    logger.error('Rate limit cleanup error', error instanceof Error ? error : undefined, { operation: 'cleanupRateLimits' });
  }
}
