/**
 * Phase 56: JWT Authentication Middleware
 *
 * Dual authentication strategy:
 * 1. Try JWT Bearer token first (Authorization: Bearer <jwt>)
 * 2. Fall back to API Key auth if no JWT is present
 *
 * This maintains full backward compatibility with existing API Key auth.
 */

import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, type AccessTokenPayload } from '../services/auth/jwt-service';
import { apiKeyAuth } from './auth';
import { logger } from '../utils/logger';
import { setCurrentUserId } from '../utils/request-context';

// ===========================================
// Extend Express Request type for JWT users
// ===========================================

declare global {
  namespace Express {
    interface Request {
      /** JWT-authenticated user. Populated when JWT auth succeeds. */
      jwtUser?: {
        id: string;
        email: string;
        role: string;
        plan?: string;
        isDemo?: boolean;
      };
    }
  }
}

/**
 * Check if a Bearer token looks like a JWT (has 3 dot-separated segments)
 * vs an API key (starts with "ab_" or is a UUID).
 */
function isLikelyJwt(token: string): boolean {
  // JWTs have 3 base64url segments separated by dots
  const parts = token.split('.');
  if (parts.length !== 3) {return false;}
  // API keys start with "ab_" prefix
  if (token.startsWith('ab_')) {return false;}
  return true;
}

/**
 * JWT-first authentication middleware.
 *
 * Strategy:
 * - If Authorization header contains a JWT-like token, verify it as JWT
 * - If it contains an API key (ab_xxx), delegate to apiKeyAuth
 * - If x-api-key header is present, delegate to apiKeyAuth
 * - If no auth header, return 401
 *
 * This replaces apiKeyAuth as the primary auth middleware on routes
 * that should support both JWT and API Key auth.
 */
export async function jwtAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  const apiKeyHeader = req.headers['x-api-key'] as string;

  // If x-api-key header is present, always use API Key auth
  if (apiKeyHeader) {
    apiKeyAuth(req, res, next);
    return;
  }

  // If no auth header at all, return 401
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      success: false,
      error: 'Authentication required. Provide JWT via Authorization: Bearer <token> or API key via x-api-key header',
      code: 'UNAUTHORIZED',
    });
    return;
  }

  const token = authHeader.substring(7);

  // Check if this looks like a JWT or an API key
  if (!isLikelyJwt(token)) {
    // Delegate to existing API Key auth
    apiKeyAuth(req, res, next);
    return;
  }

  // Try JWT verification
  try {
    const payload: AccessTokenPayload = verifyAccessToken(token);

    // Set JWT user on request
    req.jwtUser = {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
    };

    const payloadRecord = payload as unknown as Record<string, unknown>;
    if (payloadRecord.isDemo && req.jwtUser) {
      req.jwtUser.isDemo = true;
      req.jwtUser.plan = (payloadRecord.plan as string) || 'pro';
      // Force demo context
      if (req.params.context) {
        req.params.context = 'demo';
      }
    }

    // Also set the legacy req.user for backward compatibility
    req.user = {
      id: payload.sub,
      provider: 'jwt',
    };

    // Set a synthetic apiKey for backward compatibility with scope checks
    // JWT-authenticated users get all scopes
    req.apiKey = {
      id: `jwt:${payload.sub}`,
      name: `JWT:${payload.email}`,
      scopes: ['read', 'write', 'admin'],
      rateLimit: 1000,
    };

    // Phase 66: Store userId in AsyncLocalStorage for RLS
    setCurrentUserId(payload.sub);

    next();
  } catch (error) {
    const jwtError = error as { code?: string; message?: string };
    const statusCode = jwtError.code === 'TOKEN_EXPIRED' ? 401 : 403;

    res.status(statusCode).json({
      success: false,
      error: jwtError.message || 'Authentication failed',
      code: jwtError.code || 'UNAUTHORIZED',
    });
  }
}

/**
 * Optional JWT auth - continues even without authentication.
 * If JWT is present and valid, sets req.jwtUser. Otherwise, continues without.
 * Also tries API Key auth as fallback.
 */
export async function optionalJwtAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  const apiKeyHeader = req.headers['x-api-key'] as string;

  // If x-api-key header, try API Key auth (optional style)
  if (apiKeyHeader) {
    const { optionalAuth } = await import('./auth');
    return optionalAuth(req, res, next);
  }

  // If no auth header, continue without auth
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.substring(7);

  // If not a JWT, try optional API Key auth
  if (!isLikelyJwt(token)) {
    const { optionalAuth } = await import('./auth');
    return optionalAuth(req, res, next);
  }

  // Try JWT verification (silently)
  try {
    const payload = verifyAccessToken(token);
    req.jwtUser = {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
    };
    req.user = {
      id: payload.sub,
      provider: 'jwt',
    };
    req.apiKey = {
      id: `jwt:${payload.sub}`,
      name: `JWT:${payload.email}`,
      scopes: ['read', 'write', 'admin'],
      rateLimit: 1000,
    };
    // Phase 66: Store userId in AsyncLocalStorage for RLS
    setCurrentUserId(payload.sub);
  } catch {
    // Silent failure for optional auth
    logger.debug('Optional JWT auth failed', { operation: 'optionalJwtAuth' });
  }

  next();
}

/**
 * Require JWT auth specifically (no API key fallback).
 * Used for auth-specific endpoints like /auth/me, /auth/sessions.
 */
export function requireJwt(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      success: false,
      error: 'JWT authentication required',
      code: 'JWT_REQUIRED',
    });
    return;
  }

  const token = authHeader.substring(7);

  try {
    const payload = verifyAccessToken(token);
    req.jwtUser = {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
    };
    req.user = {
      id: payload.sub,
      provider: 'jwt',
    };
    // Phase 66: Store userId in AsyncLocalStorage for RLS
    setCurrentUserId(payload.sub);
    next();
  } catch (error) {
    const jwtError = error as { code?: string; message?: string };
    res.status(401).json({
      success: false,
      error: jwtError.message || 'JWT authentication failed',
      code: jwtError.code || 'UNAUTHORIZED',
    });
  }
}
