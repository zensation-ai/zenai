/**
 * Cache-Control & ETag Middleware
 * Phase 9: Performance & Bundle Optimization
 *
 * Sets appropriate Cache-Control headers and ETag support for GET responses.
 * Enables browser caching and 304 Not Modified responses to reduce bandwidth.
 */

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

/**
 * Cache-Control configuration per endpoint pattern.
 * Maps URL patterns to max-age (seconds) and visibility (public/private).
 */
interface CacheRule {
  maxAge: number;
  visibility: 'public' | 'private';
}

const CACHE_RULES: Array<{ pattern: RegExp; rule: CacheRule }> = [
  // Static/rarely-changing data - long cache
  { pattern: /^\/api\/contexts$/, rule: { maxAge: 3600, visibility: 'public' } },
  { pattern: /^\/api\/code\/languages$/, rule: { maxAge: 86400, visibility: 'public' } },
  { pattern: /^\/api\/code\/health$/, rule: { maxAge: 60, visibility: 'public' } },
  { pattern: /^\/api\/health$/, rule: { maxAge: 30, visibility: 'public' } },

  // User-specific data - private cache with moderate TTL
  { pattern: /^\/api\/\w+\/ideas\/archived/, rule: { maxAge: 600, visibility: 'private' } },
  { pattern: /^\/api\/\w+\/ideas$/, rule: { maxAge: 120, visibility: 'private' } },
  { pattern: /^\/api\/\w+\/ideas\/[^/]+$/, rule: { maxAge: 300, visibility: 'private' } },
  { pattern: /^\/api\/\w+\/analytics/, rule: { maxAge: 300, visibility: 'private' } },
  { pattern: /^\/api\/\w+\/stats/, rule: { maxAge: 300, visibility: 'private' } },
  { pattern: /^\/api\/\w+\/knowledge-graph/, rule: { maxAge: 600, visibility: 'private' } },
  { pattern: /^\/api\/\w+\/topics/, rule: { maxAge: 900, visibility: 'private' } },
  { pattern: /^\/api\/\w+\/digest/, rule: { maxAge: 600, visibility: 'private' } },
  { pattern: /^\/api\/\w+\/evolution/, rule: { maxAge: 300, visibility: 'private' } },

  // Session-specific - short cache
  { pattern: /^\/api\/chat\/sessions$/, rule: { maxAge: 60, visibility: 'private' } },
  { pattern: /^\/api\/\w+\/notifications/, rule: { maxAge: 30, visibility: 'private' } },
];

/**
 * Find matching cache rule for a request path
 */
function findCacheRule(path: string): CacheRule | null {
  for (const { pattern, rule } of CACHE_RULES) {
    if (pattern.test(path)) {
      return rule;
    }
  }
  return null;
}

/**
 * Generate a weak ETag from response body
 */
function generateETag(body: string): string {
  const hash = crypto.createHash('md5').update(body).digest('hex').substring(0, 16);
  return `W/"${hash}"`;
}

/**
 * Cache-Control middleware
 *
 * - Sets Cache-Control headers on GET responses based on endpoint patterns
 * - Generates ETag headers for conditional request support (304 Not Modified)
 * - Skips non-GET requests and mutation endpoints
 */
export function cacheControlMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Only apply to GET requests
  if (req.method !== 'GET') {
    // Explicitly prevent caching on mutations
    res.setHeader('Cache-Control', 'no-store');
    return next();
  }

  const rule = findCacheRule(req.path);

  if (!rule) {
    // No matching rule - use conservative default
    res.setHeader('Cache-Control', 'no-cache');
    return next();
  }

  // Set Cache-Control header
  res.setHeader(
    'Cache-Control',
    `${rule.visibility}, max-age=${rule.maxAge}, stale-while-revalidate=${Math.floor(rule.maxAge / 2)}`
  );

  // Intercept json() to add ETag
  const originalJson = res.json.bind(res);

  res.json = function (data: unknown) {
    // Generate ETag from response data
    const body = JSON.stringify(data);
    const etag = generateETag(body);
    res.setHeader('ETag', etag);

    // Check If-None-Match for conditional requests
    const ifNoneMatch = req.headers['if-none-match'];
    if (ifNoneMatch === etag) {
      res.status(304).end();
      return res;
    }

    return originalJson(data);
  };

  next();
}
