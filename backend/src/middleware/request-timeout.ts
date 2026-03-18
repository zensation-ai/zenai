/**
 * Request-Level Timeout Middleware
 *
 * Applies per-request timeouts based on endpoint type:
 * - 30s default for standard API endpoints
 * - 120s for streaming/voice endpoints
 * - 180s for vision processing endpoints
 *
 * On timeout: sends 504 Gateway Timeout (if headers not yet sent).
 * Cleans up timer on response close/finish.
 *
 * @module middleware/request-timeout
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

/** Default timeout for standard API requests (30 seconds) */
const DEFAULT_TIMEOUT_MS = 30_000;

/** Extended timeout for streaming and voice endpoints (120 seconds) */
const STREAMING_TIMEOUT_MS = 120_000;

/** Extended timeout for vision processing endpoints (180 seconds) */
const VISION_TIMEOUT_MS = 180_000;

/**
 * Determine the timeout for a given request path.
 */
function getTimeoutForPath(path: string): number {
  if (path.includes('/vision/') || path.includes('/vision')) {
    return VISION_TIMEOUT_MS;
  }
  if (path.includes('/stream') || path.includes('/voice')) {
    return STREAMING_TIMEOUT_MS;
  }
  return DEFAULT_TIMEOUT_MS;
}

/**
 * Express middleware that enforces request-level timeouts.
 */
export function requestTimeoutMiddleware(req: Request, res: Response, next: NextFunction): void {
  const timeoutMs = getTimeoutForPath(req.path);

  const timer = setTimeout(() => {
    if (!res.headersSent) {
      logger.warn('Request timeout exceeded', {
        method: req.method,
        path: req.path,
        timeoutMs,
        operation: 'requestTimeout',
      });
      res.status(504).json({
        success: false,
        error: 'Gateway Timeout',
      });
    }
  }, timeoutMs);

  // Clean up timer when response completes
  const cleanup = () => {
    clearTimeout(timer);
  };

  res.on('close', cleanup);
  res.on('finish', cleanup);

  next();
}

// Export constants for testing
export { DEFAULT_TIMEOUT_MS, STREAMING_TIMEOUT_MS, VISION_TIMEOUT_MS, getTimeoutForPath };
