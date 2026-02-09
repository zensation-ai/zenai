/**
 * Centralized Error Handling Middleware
 *
 * Provides consistent error responses across all API endpoints.
 * Phase 9: Added structured logging and standardized error codes.
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

// ============================================
// Error Codes (Phase 9)
// ============================================

export enum ErrorCode {
  // Validation
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INVALID_UUID = 'INVALID_UUID',
  INVALID_CONTEXT = 'INVALID_CONTEXT',
  INVALID_JSON = 'INVALID_JSON',

  // Authentication
  UNAUTHORIZED = 'UNAUTHORIZED',
  INVALID_API_KEY = 'INVALID_API_KEY',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',

  // Authorization
  FORBIDDEN = 'FORBIDDEN',

  // Resources
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  DUPLICATE_ENTRY = 'DUPLICATE_ENTRY',
  REFERENCE_ERROR = 'REFERENCE_ERROR',

  // Services
  WHISPER_ERROR = 'WHISPER_ERROR',
  OLLAMA_ERROR = 'OLLAMA_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR',
  SCHEMA_ERROR = 'SCHEMA_ERROR',
  EXTERNAL_SERVICE_ERROR = 'EXTERNAL_SERVICE_ERROR',

  // System
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
}

// ============================================
// Custom Error Classes
// ============================================

export class AppError extends Error {
  statusCode: number;
  code: string;
  isOperational: boolean;

  constructor(message: string, statusCode: number, code?: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code || 'INTERNAL_ERROR';
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  details?: Record<string, string>;

  constructor(message: string, details?: Record<string, string>) {
    super(message, 400, 'VALIDATION_ERROR');
    this.details = details;
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Access denied') {
    super(message, 403, 'FORBIDDEN');
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, 'CONFLICT');
  }
}

export class RateLimitError extends AppError {
  retryAfter: number;

  constructor(retryAfter: number) {
    super('Rate limit exceeded', 429, 'RATE_LIMIT_EXCEEDED');
    this.retryAfter = retryAfter;
  }
}

export class DatabaseError extends AppError {
  constructor(message = 'Database operation failed') {
    super(message, 500, 'DATABASE_ERROR');
  }
}

export class ExternalServiceError extends AppError {
  service: string;

  constructor(service: string, message?: string) {
    super(message || `${service} service unavailable`, 503, 'EXTERNAL_SERVICE_ERROR');
    this.service = service;
  }
}

// ============================================
// Error Handler Middleware
// ============================================

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction // Required for Express error handler signature
): void {
  // Get request ID from response locals (set by requestIdMiddleware)
  const requestId = res.locals.requestId || 'unknown';

  // Log the error with structured logging
  const context = {
    requestId,
    method: req.method,
    path: req.path,
    operation: 'errorHandler',
  };

  if (err instanceof AppError) {
    logger.error(`${err.code}: ${err.message}`, err.isOperational ? undefined : err, context);
  } else {
    logger.error('UNEXPECTED_ERROR', err, context);
  }

  // Handle known errors
  if (err instanceof AppError) {
    const response: Record<string, unknown> = {
      success: false,
      error: err.message,
      code: err.code,
      requestId,
    };

    // Add specific error details
    if (err instanceof RateLimitError) {
      res.setHeader('Retry-After', err.retryAfter);
      response.retryAfter = err.retryAfter;
    }

    if (err instanceof ValidationError && err.details) {
      response.details = err.details;
    }

    res.status(err.statusCode).json(response);
    return;
  }

  // Handle PostgreSQL errors
  const errWithCode = err as Error & { code?: string };
  if (errWithCode.code) {
    const pgCode = errWithCode.code;

    switch (pgCode) {
      case '23505': // Unique violation
        res.status(409).json({
          success: false,
          error: 'Resource already exists',
          code: 'DUPLICATE_ENTRY',
          requestId,
        });
        return;

      case '23503': // Foreign key violation
        res.status(400).json({
          success: false,
          error: 'Referenced resource does not exist',
          code: 'REFERENCE_ERROR',
          requestId,
        });
        return;

      case '42P01': // Undefined table
      case '42703': // Undefined column
        res.status(500).json({
          success: false,
          error: 'Database schema error',
          code: 'SCHEMA_ERROR',
          requestId,
        });
        return;

      default:
        // Log unknown PostgreSQL errors
        logger.error(`PostgreSQL Error (${pgCode})`, err instanceof Error ? err : undefined, context);
    }
  }

  // Handle JSON parsing errors
  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json({
      success: false,
      error: 'Invalid JSON in request body',
      code: 'INVALID_JSON',
      requestId,
    });
    return;
  }

  // Handle unexpected errors
  res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === 'production'
      ? 'An unexpected error occurred'
      : err.message,
    code: 'INTERNAL_ERROR',
    requestId,
  });
}

// ============================================
// Async Handler Wrapper
// ============================================

/**
 * Wraps async route handlers to catch errors automatically
 *
 * Usage:
 * router.get('/route', asyncHandler(async (req, res) => {
 *   // async code that might throw
 * }));
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// ============================================
// Request Validation Helpers
// ============================================

/**
 * Validate required fields in request body
 */
export function validateRequired(
  body: Record<string, unknown>,
  fields: string[]
): void {
  const missing = fields.filter(field => {
    const value = body[field];
    return value === undefined || value === null || value === '';
  });

  if (missing.length > 0) {
    throw new ValidationError(
      `Missing required fields: ${missing.join(', ')}`,
      missing.reduce((acc, field) => ({ ...acc, [field]: 'required' }), {})
    );
  }
}

/**
 * Validate context parameter
 */
export function validateContext(context: string): void {
  if (!['personal', 'work', 'learning', 'creative'].includes(context)) {
    throw new ValidationError(
      'Invalid context. Use "personal", "work", "learning", or "creative".',
      { context: 'must be "personal", "work", "learning", or "creative"' }
    );
  }
}

/**
 * Validate UUID format
 */
export function validateUUID(id: string, fieldName = 'id'): void {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id)) {
    throw new ValidationError(
      `Invalid ${fieldName} format`,
      { [fieldName]: 'must be a valid UUID' }
    );
  }
}

/**
 * Validate pagination parameters
 */
export function validatePagination(
  limit?: string | number,
  offset?: string | number
): { limit: number; offset: number } {
  const parsedLimit = typeof limit === 'string' ? parseInt(limit, 10) : (limit || 20);
  const parsedOffset = typeof offset === 'string' ? parseInt(offset, 10) : (offset || 0);

  if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
    throw new ValidationError('Invalid limit', { limit: 'must be between 1 and 100' });
  }

  if (isNaN(parsedOffset) || parsedOffset < 0) {
    throw new ValidationError('Invalid offset', { offset: 'must be 0 or greater' });
  }

  return { limit: parsedLimit, offset: parsedOffset };
}
