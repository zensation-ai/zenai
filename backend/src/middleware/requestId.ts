/**
 * Phase 12: Request ID Middleware
 *
 * Adds unique request IDs for tracing across logs.
 * - Generates UUID for each request
 * - Accepts X-Request-ID header from client (for distributed tracing)
 * - Adds X-Request-ID to response headers
 * - Makes request ID available via res.locals.requestId
 */

import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

const REQUEST_ID_HEADER = 'x-request-id';

/**
 * Middleware that assigns a unique ID to each request
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Use existing request ID from header or generate new one
  const requestId = (req.headers[REQUEST_ID_HEADER] as string) || randomUUID();

  // Store in res.locals for access in handlers and error middleware
  res.locals.requestId = requestId;

  // Add to response headers
  res.setHeader('X-Request-ID', requestId);

  next();
}

/**
 * Get request ID from response locals
 */
export function getRequestId(res: Response): string {
  return res.locals.requestId || 'unknown';
}

// Extend Express types to include requestId
declare global {
  namespace Express {
    interface Locals {
      requestId: string;
    }
  }
}
