/**
 * Standardized API Response Utilities
 *
 * Provides consistent response format across all endpoints:
 * - Success responses with data
 * - Error responses with codes and messages
 * - Pagination helpers
 */

import { Request, Response } from 'express';
import { ErrorCode, ErrorCodes, PaginationInfo } from '../types';
import { logger } from './logger';
import { toIntBounded } from './validation';

// ===========================================
// Response Types
// ===========================================

export interface SuccessResponseOptions<T extends Record<string, unknown>> {
  /** Fields to include directly in the response (flat, not nested in `data`). */
  fields: T;
  pagination?: PaginationInfo;
  requestId?: string;
  message?: string;
}

export interface ErrorResponseOptions {
  code: ErrorCode;
  message: string;
  details?: unknown;
  requestId?: string;
  statusCode?: number;
}

// ===========================================
// Status Code Mapping
// ===========================================

const ERROR_STATUS_CODES: Partial<Record<ErrorCode, number>> = {
  [ErrorCodes.VALIDATION_ERROR]: 400,
  [ErrorCodes.INVALID_INPUT]: 400,
  [ErrorCodes.MISSING_FIELD]: 400,
  [ErrorCodes.INVALID_FORMAT]: 400,
  [ErrorCodes.UNAUTHORIZED]: 401,
  [ErrorCodes.INVALID_API_KEY]: 401,
  [ErrorCodes.EXPIRED_API_KEY]: 401,
  [ErrorCodes.NOT_FOUND]: 404,
  [ErrorCodes.IDEA_NOT_FOUND]: 404,
  [ErrorCodes.MEETING_NOT_FOUND]: 404,
  [ErrorCodes.MEDIA_NOT_FOUND]: 404,
  [ErrorCodes.CONFLICT]: 409,
  [ErrorCodes.DUPLICATE]: 409,
  [ErrorCodes.INTERNAL_ERROR]: 500,
  [ErrorCodes.DATABASE_ERROR]: 500,
  [ErrorCodes.OLLAMA_ERROR]: 502,
  [ErrorCodes.WHISPER_ERROR]: 502,
};

/**
 * Get HTTP status code for an error code
 */
function getStatusCode(code: ErrorCode, defaultCode: number = 500): number {
  return ERROR_STATUS_CODES[code] || defaultCode;
}

// ===========================================
// Success Response Helpers
// ===========================================

/**
 * Send a successful JSON response.
 *
 * Standard format: `{ success: true, ...fields, pagination?, message? }`
 * Fields are spread directly — NOT nested in a `data` property.
 */
export function sendSuccess<T extends Record<string, unknown>>(
  res: Response,
  options: SuccessResponseOptions<T>,
  statusCode: number = 200
): void {
  const response: Record<string, unknown> = {
    success: true,
    ...options.fields,
  };

  if (options.pagination) {
    response.pagination = options.pagination;
  }

  if (options.requestId) {
    response.requestId = options.requestId;
  }

  if (options.message) {
    response.message = options.message;
  }

  res.status(statusCode).json(response);
}

/**
 * Send a created (201) response
 */
export function sendCreated<T extends Record<string, unknown>>(res: Response, fields: T, requestId?: string): void {
  sendSuccess(res, { fields, requestId }, 201);
}

/**
 * Send a simple data response: `{ success: true, data }`.
 * Replaces the common `res.json({ success: true, data })` one-liner.
 */
export function sendData(res: Response, data: unknown, statusCode: number = 200): void {
  res.status(statusCode).json({ success: true, data });
}

/**
 * Send a list response: `{ success: true, data, count }`.
 * Replaces `res.json({ success: true, data: items, count: items.length })`.
 */
export function sendList(res: Response, data: unknown[], count?: number): void {
  res.json({ success: true, data, count: count ?? data.length });
}

/**
 * Send a message-only response: `{ success: true, message }`.
 */
export function sendMessage(res: Response, message: string, extra?: Record<string, unknown>): void {
  res.json({ success: true, message, ...extra });
}

/**
 * Send a no content (204) response
 */
export function sendNoContent(res: Response): void {
  res.status(204).send();
}

// ===========================================
// Error Response Helpers
// ===========================================

/**
 * Send an error JSON response
 */
export function sendError(res: Response, options: ErrorResponseOptions): void {
  const statusCode = options.statusCode || getStatusCode(options.code);

  const response: Record<string, unknown> = {
    success: false,
    error: {
      code: options.code,
      message: options.message,
    },
  };

  if (options.details) {
    (response.error as Record<string, unknown>).details = options.details;
  }

  if (options.requestId) {
    response.requestId = options.requestId;
  }

  // Log errors
  if (statusCode >= 500) {
    logger.error(`API Error: ${options.message}`, undefined, {
      requestId: options.requestId,
      operation: 'api_error',
    });
  }

  res.status(statusCode).json(response);
}

/**
 * Send a validation error response
 */
export function sendValidationError(
  res: Response,
  message: string,
  details?: unknown,
  requestId?: string
): void {
  sendError(res, {
    code: ErrorCodes.VALIDATION_ERROR,
    message,
    details,
    requestId,
  });
}

/**
 * Send a not found error response
 */
export function sendNotFound(
  res: Response,
  resource: string = 'Resource',
  requestId?: string
): void {
  sendError(res, {
    code: ErrorCodes.NOT_FOUND,
    message: `${resource} not found`,
    requestId,
  });
}

/**
 * Send an unauthorized error response
 */
export function sendUnauthorized(
  res: Response,
  message: string = 'Unauthorized',
  requestId?: string
): void {
  sendError(res, {
    code: ErrorCodes.UNAUTHORIZED,
    message,
    requestId,
  });
}

/**
 * Send an internal server error response
 */
export function sendInternalError(
  res: Response,
  error: Error,
  requestId?: string
): void {
  // Log the full error
  logger.error('Internal server error', error, { requestId });

  sendError(res, {
    code: ErrorCodes.INTERNAL_ERROR,
    message: process.env.NODE_ENV === 'production'
      ? 'An internal error occurred'
      : error.message,
    requestId,
  });
}

// ===========================================
// Pagination Helpers
// ===========================================

/**
 * Create pagination info from query results
 */
export function createPaginationInfo(
  total: number,
  limit: number,
  offset: number
): PaginationInfo {
  return {
    total,
    limit,
    offset,
    hasMore: offset + limit < total,
  };
}

/**
 * Send a paginated response
 */
export function sendPaginated<T>(
  res: Response,
  items: T[],
  itemKey: string,
  total: number,
  limit: number,
  offset: number,
  requestId?: string
): void {
  sendSuccess(res, {
    fields: { [itemKey]: items } as Record<string, unknown>,
    pagination: createPaginationInfo(total, limit, offset),
    requestId,
  });
}

/**
 * Parse pagination params from an Express request.
 * Replaces the repeated `Math.min(parseInt(req.query.limit, 10) || X, Y)` pattern.
 *
 * @example
 * const { limit, offset } = parsePagination(req); // defaults: limit=50, max=200
 * const { limit, offset } = parsePagination(req, { defaultLimit: 100, maxLimit: 500 });
 */
export function parsePagination(
  req: Request,
  options: { defaultLimit?: number; maxLimit?: number } = {}
): { limit: number; offset: number } {
  const { defaultLimit = 50, maxLimit = 200 } = options;
  return {
    limit: toIntBounded(req.query.limit as string | undefined, defaultLimit, 1, maxLimit),
    offset: toIntBounded(req.query.offset as string | undefined, 0, 0, Number.MAX_SAFE_INTEGER),
  };
}

// ===========================================
// Error Handler Wrapper
// ===========================================

/**
 * Wrap an async route handler with error handling
 */
export function asyncHandler<T>(
  handler: (req: T, res: Response) => Promise<void>
): (req: T, res: Response) => void {
  return (req, res) => {
    Promise.resolve(handler(req, res)).catch((error: Error) => {
      const requestId = (req as unknown as { requestId?: string }).requestId;
      sendInternalError(res, error, requestId);
    });
  };
}
