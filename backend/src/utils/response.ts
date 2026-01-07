/**
 * Standardized API Response Utilities
 *
 * Provides consistent response format across all endpoints:
 * - Success responses with data
 * - Error responses with codes and messages
 * - Pagination helpers
 */

import { Response } from 'express';
import { ErrorCode, ErrorCodes, PaginationInfo } from '../types';
import { logger } from './logger';

// ===========================================
// Response Types
// ===========================================

export interface SuccessResponseOptions<T> {
  data: T;
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
 * Send a successful JSON response
 */
export function sendSuccess<T>(
  res: Response,
  options: SuccessResponseOptions<T>,
  statusCode: number = 200
): void {
  const response: Record<string, unknown> = {
    success: true,
    data: options.data,
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
export function sendCreated<T>(res: Response, data: T, requestId?: string): void {
  sendSuccess(res, { data, requestId }, 201);
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
  data: T[],
  total: number,
  limit: number,
  offset: number,
  requestId?: string
): void {
  sendSuccess(res, {
    data,
    pagination: createPaginationInfo(total, limit, offset),
    requestId,
  });
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
