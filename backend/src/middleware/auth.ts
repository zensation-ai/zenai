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
 * In development mode (NODE_ENV !== 'production'), allows requests without API key
 * for easier local testing.
 */
export async function apiKeyAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const apiKeyHeader = req.headers['x-api-key'] as string;

  let apiKey: string | undefined;

  if (authHeader?.startsWith('Bearer ab_')) {
    apiKey = authHeader.substring(7);
  } else if (apiKeyHeader?.startsWith('ab_')) {
    apiKey = apiKeyHeader;
  }

  // Development mode: Allow requests without API key (whitelist approach)
  const devModeAllowed = process.env.NODE_ENV === 'development' || process.env.ALLOW_DEV_MODE === 'true';
  if (!apiKey && devModeAllowed) {
    req.apiKey = {
      id: 'dev-mode',
      name: 'Development Mode',
      scopes: ['read', 'write', 'admin'],
      rateLimit: 10000
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
    // Extract prefix for fast lookup (first 10 chars: "ab_live_xx")
    const prefix = apiKey.substring(0, 10);

    // Find key candidates by prefix
    const result = await pool.query(
      `SELECT id, name, scopes, rate_limit, expires_at, is_active, key_hash
       FROM api_keys
       WHERE key_prefix = $1`,
      [prefix]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        error: 'Invalid API key',
        message: 'The provided API key is not valid'
      });
    }

    // Verify the key against stored hash(es)
    let keyData = null;
    for (const row of result.rows) {
      if (await verifyApiKey(apiKey, row.key_hash)) {
        keyData = row;
        break;
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
  // Use API key ID, client IP, or fallback to anonymous
  // req.ip can be undefined if trust proxy is not configured
  const key = req.apiKey?.id || req.ip || req.socket?.remoteAddress || 'anonymous';

  // Check for endpoint-specific limit
  const endpoint = `${req.method}:${req.path}`;
  const endpointConfig = ENDPOINT_LIMITS[endpoint];

  const limit = endpointConfig?.limit || req.apiKey?.rateLimit || 100; // Default 100 for non-authenticated
  const windowMs = endpointConfig?.windowMs || 60 * 1000; // Default 1 minute window

  try {
    const windowStart = new Date(Math.floor(Date.now() / windowMs) * windowMs);

    // Upsert rate limit counter
    const result = await pool.query(
      `INSERT INTO rate_limits (identifier, window_start, request_count)
       VALUES ($1, $2, 1)
       ON CONFLICT (identifier, window_start)
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
    // Don't block requests on rate limiter errors
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
    const result = await pool.query(
      `DELETE FROM rate_limits
       WHERE window_start < NOW() - INTERVAL '1 hour'`
    );
    logger.info(`Cleaned up ${result.rowCount} old rate limit entries`, { operation: 'cleanupRateLimits' });
  } catch (error) {
    logger.error('Rate limit cleanup error', error instanceof Error ? error : undefined, { operation: 'cleanupRateLimits' });
  }
}
