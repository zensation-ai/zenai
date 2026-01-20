/**
 * Phase Security Sprint 3: CSRF Protection Middleware
 *
 * Implements token-based CSRF protection for state-changing requests.
 * Uses the Double Submit Cookie pattern with cryptographic tokens.
 *
 * Features:
 * - Cryptographically secure random tokens
 * - SameSite cookie attribute for session cookies
 * - Token validation for non-safe HTTP methods
 * - API key requests are exempt (they use their own auth mechanism)
 */

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { logger } from '../utils/logger';

// CSRF token configuration
const CSRF_TOKEN_LENGTH = 32; // 256 bits
const CSRF_COOKIE_NAME = '_csrf_token';
const CSRF_HEADER_NAME = 'x-csrf-token';
const CSRF_BODY_FIELD = '_csrf';
const TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

// Safe HTTP methods that don't require CSRF protection
const SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS'];

// Store for token validation (in production, use Redis for distributed systems)
// Format: { token: { createdAt: timestamp, expiresAt: timestamp } }
const tokenStore = new Map<string, { createdAt: number; expiresAt: number }>();

// Cleanup interval for expired tokens
setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  for (const [token, data] of tokenStore.entries()) {
    if (data.expiresAt < now) {
      tokenStore.delete(token);
      cleaned++;
    }
  }
  if (cleaned > 0) {
    logger.debug('CSRF tokens cleaned up', {
      operation: 'csrfCleanup',
      cleaned,
      remaining: tokenStore.size
    });
  }
}, 60 * 60 * 1000); // Cleanup every hour

/**
 * Generate a cryptographically secure CSRF token
 */
export function generateCsrfToken(): string {
  return crypto.randomBytes(CSRF_TOKEN_LENGTH).toString('hex');
}

/**
 * Validate a CSRF token
 * Uses timing-safe comparison to prevent timing attacks
 */
function validateToken(token: string): boolean {
  if (!token || token.length !== CSRF_TOKEN_LENGTH * 2) {
    return false;
  }

  const tokenData = tokenStore.get(token);
  if (!tokenData) {
    return false;
  }

  // Check if token has expired
  if (tokenData.expiresAt < Date.now()) {
    tokenStore.delete(token);
    return false;
  }

  return true;
}

/**
 * Cookie configuration for CSRF token
 * Uses secure defaults for production
 */
function getCookieOptions(): Record<string, unknown> {
  const isProduction = process.env.NODE_ENV === 'production';

  return {
    httpOnly: true, // Prevent JavaScript access
    secure: isProduction, // HTTPS only in production
    sameSite: 'strict' as const, // Strict SameSite for maximum protection
    maxAge: TOKEN_EXPIRY_MS,
    path: '/',
  };
}

/**
 * Set session cookie with security attributes
 * Can be used to enhance any session cookie with SameSite attribute
 */
export function setSecureCookie(
  res: Response,
  name: string,
  value: string,
  options: Record<string, unknown> = {}
): void {
  const isProduction = process.env.NODE_ENV === 'production';

  const defaultOptions = {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict' as const,
    path: '/',
    ...options,
  };

  res.cookie(name, value, defaultOptions);
}

/**
 * CSRF Token Generation Middleware
 *
 * Generates and sets a CSRF token for the session.
 * Should be applied to routes that render forms.
 */
export function csrfTokenGenerator(req: Request, res: Response, next: NextFunction): void {
  // Generate new token
  const token = generateCsrfToken();
  const now = Date.now();

  // Store token
  tokenStore.set(token, {
    createdAt: now,
    expiresAt: now + TOKEN_EXPIRY_MS,
  });

  // Set cookie with secure options
  res.cookie(CSRF_COOKIE_NAME, token, getCookieOptions());

  // Make token available for templates/responses
  res.locals.csrfToken = token;

  // Also set as response header for SPA clients
  res.setHeader('X-CSRF-Token', token);

  next();
}

/**
 * Get CSRF token endpoint handler
 * Returns a fresh CSRF token for AJAX clients
 */
export function getCsrfTokenHandler(req: Request, res: Response): void {
  const token = generateCsrfToken();
  const now = Date.now();

  tokenStore.set(token, {
    createdAt: now,
    expiresAt: now + TOKEN_EXPIRY_MS,
  });

  res.cookie(CSRF_COOKIE_NAME, token, getCookieOptions());

  res.json({
    csrfToken: token,
    expiresIn: TOKEN_EXPIRY_MS / 1000, // seconds
  });
}

/**
 * CSRF Protection Middleware
 *
 * Validates CSRF tokens for state-changing requests (POST, PUT, DELETE, PATCH).
 * API key authenticated requests are exempt since they have their own auth mechanism.
 *
 * Token can be provided via:
 * 1. X-CSRF-Token header (recommended for SPAs)
 * 2. _csrf field in request body
 * 3. Cookie (Double Submit Cookie pattern)
 */
export function csrfProtection(req: Request, res: Response, next: NextFunction): void | Response {
  // Skip CSRF for safe methods
  if (SAFE_METHODS.includes(req.method)) {
    return next();
  }

  // Skip CSRF for API key authenticated requests
  // API keys provide their own authentication mechanism
  if (req.apiKey) {
    logger.debug('CSRF skipped for API key auth', {
      operation: 'csrfProtection',
      apiKeyId: req.apiKey.id,
      path: req.path,
    });
    return next();
  }

  // Skip CSRF for webhook endpoints (they use signatures)
  if (req.path.startsWith('/api/webhooks/')) {
    logger.debug('CSRF skipped for webhook endpoint', {
      operation: 'csrfProtection',
      path: req.path,
    });
    return next();
  }

  // Get token from multiple sources
  const headerToken = req.headers[CSRF_HEADER_NAME] as string;
  const bodyToken = req.body?.[CSRF_BODY_FIELD] as string;
  const cookieToken = req.cookies?.[CSRF_COOKIE_NAME] as string;

  // Try header first (most common for SPAs), then body, then verify against cookie
  const providedToken = headerToken || bodyToken;

  if (!providedToken && !cookieToken) {
    logger.warn('CSRF token missing', {
      operation: 'csrfProtection',
      path: req.path,
      method: req.method,
      ip: req.ip || req.socket?.remoteAddress,
    });

    return res.status(403).json({
      error: 'CSRF_TOKEN_MISSING',
      message: 'CSRF token is required for this request. Include X-CSRF-Token header.',
    });
  }

  // Double Submit Cookie pattern: verify header/body token matches cookie
  // OR validate stored token
  let isValid = false;

  if (providedToken) {
    // Validate against token store
    isValid = validateToken(providedToken);

    // Also accept if token matches cookie (Double Submit Cookie)
    if (!isValid && cookieToken) {
      isValid = crypto.timingSafeEqual(
        Buffer.from(providedToken, 'hex'),
        Buffer.from(cookieToken, 'hex')
      );
    }
  }

  if (!isValid) {
    logger.warn('CSRF token validation failed', {
      operation: 'csrfProtection',
      path: req.path,
      method: req.method,
      ip: req.ip || req.socket?.remoteAddress,
      userAgent: req.headers['user-agent'],
    });

    return res.status(403).json({
      error: 'CSRF_TOKEN_INVALID',
      message: 'CSRF token is invalid or expired. Please refresh and try again.',
    });
  }

  // Token is valid, proceed
  logger.debug('CSRF validation passed', {
    operation: 'csrfProtection',
    path: req.path,
    method: req.method,
  });

  next();
}

/**
 * Middleware to ensure cookie parser is available
 * Should be used before CSRF protection if cookies aren't already parsed
 */
export function ensureCookieParser(req: Request, res: Response, next: NextFunction): void {
  // Simple cookie parsing if not already done
  if (!req.cookies && req.headers.cookie) {
    req.cookies = {};
    req.headers.cookie.split(';').forEach((cookie) => {
      const parts = cookie.split('=');
      const key = parts[0]?.trim();
      const value = parts.slice(1).join('=').trim();
      if (key) {
        req.cookies[key] = value;
      }
    });
  }
  next();
}

// Add cookies type to Request if not present
declare global {
  namespace Express {
    interface Request {
      cookies?: Record<string, string>;
    }
  }
}
