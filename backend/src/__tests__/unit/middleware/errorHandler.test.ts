/**
 * Unit Tests for Error Handler Middleware
 *
 * Tests all custom error classes and the error handler middleware.
 */

import { Request, Response, NextFunction } from 'express';
import {
  AppError,
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  RateLimitError,
  DatabaseError,
  ExternalServiceError,
  errorHandler,
  asyncHandler,
  validateRequired,
  validateContext,
  validateUUID,
  validatePagination,
} from '../../../middleware/errorHandler';

describe('Error Handler Middleware', () => {
  // ===========================================
  // Custom Error Classes Tests
  // ===========================================

  describe('AppError', () => {
    it('should create error with default code', () => {
      const error = new AppError('Test error', 500);
      expect(error.message).toBe('Test error');
      expect(error.statusCode).toBe(500);
      expect(error.code).toBe('INTERNAL_ERROR');
      expect(error.isOperational).toBe(true);
    });

    it('should create error with custom code', () => {
      const error = new AppError('Test error', 400, 'CUSTOM_ERROR');
      expect(error.code).toBe('CUSTOM_ERROR');
    });

    it('should have stack trace', () => {
      const error = new AppError('Test', 500);
      expect(error.stack).toBeDefined();
    });
  });

  describe('ValidationError', () => {
    it('should create validation error with message', () => {
      const error = new ValidationError('Invalid input');
      expect(error.message).toBe('Invalid input');
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('VALIDATION_ERROR');
    });

    it('should include details', () => {
      const error = new ValidationError('Invalid input', { field: 'must be string' });
      expect(error.details).toEqual({ field: 'must be string' });
    });
  });

  describe('NotFoundError', () => {
    it('should create not found error for resource', () => {
      const error = new NotFoundError('Idea');
      expect(error.message).toBe('Idea not found');
      expect(error.statusCode).toBe(404);
      expect(error.code).toBe('NOT_FOUND');
    });
  });

  describe('UnauthorizedError', () => {
    it('should create unauthorized error with default message', () => {
      const error = new UnauthorizedError();
      expect(error.message).toBe('Authentication required');
      expect(error.statusCode).toBe(401);
      expect(error.code).toBe('UNAUTHORIZED');
    });

    it('should create unauthorized error with custom message', () => {
      const error = new UnauthorizedError('Invalid token');
      expect(error.message).toBe('Invalid token');
    });
  });

  describe('ForbiddenError', () => {
    it('should create forbidden error with default message', () => {
      const error = new ForbiddenError();
      expect(error.message).toBe('Access denied');
      expect(error.statusCode).toBe(403);
      expect(error.code).toBe('FORBIDDEN');
    });
  });

  describe('ConflictError', () => {
    it('should create conflict error', () => {
      const error = new ConflictError('Resource already exists');
      expect(error.message).toBe('Resource already exists');
      expect(error.statusCode).toBe(409);
      expect(error.code).toBe('CONFLICT');
    });
  });

  describe('RateLimitError', () => {
    it('should create rate limit error with retry info', () => {
      const error = new RateLimitError(60);
      expect(error.message).toBe('Rate limit exceeded');
      expect(error.statusCode).toBe(429);
      expect(error.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(error.retryAfter).toBe(60);
    });
  });

  describe('DatabaseError', () => {
    it('should create database error with default message', () => {
      const error = new DatabaseError();
      expect(error.message).toBe('Database operation failed');
      expect(error.statusCode).toBe(500);
      expect(error.code).toBe('DATABASE_ERROR');
    });

    it('should create database error with custom message', () => {
      const error = new DatabaseError('Connection timeout');
      expect(error.message).toBe('Connection timeout');
    });
  });

  describe('ExternalServiceError', () => {
    it('should create external service error', () => {
      const error = new ExternalServiceError('Ollama');
      expect(error.message).toBe('Ollama service unavailable');
      expect(error.statusCode).toBe(503);
      expect(error.code).toBe('EXTERNAL_SERVICE_ERROR');
      expect(error.service).toBe('Ollama');
    });

    it('should create external service error with custom message', () => {
      const error = new ExternalServiceError('Whisper', 'Model not loaded');
      expect(error.message).toBe('Model not loaded');
    });
  });

  // ===========================================
  // Error Handler Middleware Tests
  // ===========================================

  describe('errorHandler middleware', () => {
    let mockReq: Partial<Request>;
    let mockRes: Partial<Response>;
    let mockNext: NextFunction;
    let jsonMock: jest.Mock;
    let statusMock: jest.Mock;
    let setHeaderMock: jest.Mock;

    beforeEach(() => {
      jsonMock = jest.fn();
      setHeaderMock = jest.fn();
      statusMock = jest.fn().mockReturnValue({ json: jsonMock });
      mockRes = {
        status: statusMock,
        json: jsonMock,
        setHeader: setHeaderMock,
        locals: { requestId: 'test-request-id-123' },
      };
      mockReq = {
        method: 'GET',
        path: '/api/test',
      };
      mockNext = jest.fn();

      // Suppress console.error during tests
      jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should handle AppError correctly', () => {
      const error = new AppError('Test error', 400, 'TEST_ERROR');

      errorHandler(error, mockReq as Request, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        error: 'Test error',
        code: 'TEST_ERROR',
        requestId: 'test-request-id-123',
      });
    });

    it('should handle ValidationError with details', () => {
      const error = new ValidationError('Invalid input', { name: 'required' });

      errorHandler(error, mockReq as Request, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid input',
        code: 'VALIDATION_ERROR',
        requestId: 'test-request-id-123',
        details: { name: 'required' },
      });
    });

    it('should handle RateLimitError with Retry-After header', () => {
      const error = new RateLimitError(120);

      errorHandler(error, mockReq as Request, mockRes as Response, mockNext);

      expect(setHeaderMock).toHaveBeenCalledWith('Retry-After', 120);
      expect(statusMock).toHaveBeenCalledWith(429);
      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        error: 'Rate limit exceeded',
        code: 'RATE_LIMIT_EXCEEDED',
        requestId: 'test-request-id-123',
        retryAfter: 120,
      });
    });

    it('should handle PostgreSQL unique violation (23505)', () => {
      const error = new Error('duplicate key') as Error & { code: string };
      error.code = '23505';

      errorHandler(error, mockReq as Request, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(409);
      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        error: 'Resource already exists',
        code: 'DUPLICATE_ENTRY',
        requestId: 'test-request-id-123',
      });
    });

    it('should handle PostgreSQL foreign key violation (23503)', () => {
      const error = new Error('foreign key violation') as Error & { code: string };
      error.code = '23503';

      errorHandler(error, mockReq as Request, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        error: 'Referenced resource does not exist',
        code: 'REFERENCE_ERROR',
        requestId: 'test-request-id-123',
      });
    });

    it('should handle PostgreSQL schema errors (42P01, 42703)', () => {
      const error = new Error('undefined table') as Error & { code: string };
      error.code = '42P01';

      errorHandler(error, mockReq as Request, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        error: 'Database schema error',
        code: 'SCHEMA_ERROR',
        requestId: 'test-request-id-123',
      });
    });

    it('should handle JSON parsing errors', () => {
      const error = new SyntaxError('Unexpected token') as SyntaxError & { body: string };
      (error as any).body = 'invalid json';

      errorHandler(error, mockReq as Request, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid JSON in request body',
        code: 'INVALID_JSON',
        requestId: 'test-request-id-123',
      });
    });

    it('should handle unexpected errors in production', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const error = new Error('Sensitive internal error');

      errorHandler(error, mockReq as Request, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        error: 'Ein unerwarteter Fehler ist aufgetreten.',
        code: 'INTERNAL_ERROR',
        requestId: 'test-request-id-123',
      });

      process.env.NODE_ENV = originalEnv;
    });

    it('should expose error message in non-production', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const error = new Error('Debug info');

      errorHandler(error, mockReq as Request, mockRes as Response, mockNext);

      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        error: 'Debug info',
        code: 'INTERNAL_ERROR',
        requestId: 'test-request-id-123',
      });

      process.env.NODE_ENV = originalEnv;
    });
  });

  // ===========================================
  // asyncHandler Tests
  // ===========================================

  describe('asyncHandler', () => {
    let mockReq: Partial<Request>;
    let mockRes: Partial<Response>;
    let mockNext: NextFunction;

    beforeEach(() => {
      mockReq = {};
      mockRes = { json: jest.fn() };
      mockNext = jest.fn();
    });

    it('should call async function and pass result', async () => {
      const asyncFn = jest.fn().mockResolvedValue({ data: 'test' });
      const wrapped = asyncHandler(asyncFn);

      await wrapped(mockReq as Request, mockRes as Response, mockNext);

      expect(asyncFn).toHaveBeenCalledWith(mockReq, mockRes, mockNext);
    });

    it('should catch async errors and pass to next', async () => {
      const error = new Error('Async error');
      const asyncFn = jest.fn().mockRejectedValue(error);
      const wrapped = asyncHandler(asyncFn);

      await wrapped(mockReq as Request, mockRes as Response, mockNext);

      // Need to wait for the promise to resolve
      await new Promise(resolve => setImmediate(resolve));

      expect(mockNext).toHaveBeenCalledWith(error);
    });

    it('should catch sync errors thrown in async function', async () => {
      const error = new Error('Sync error in async');
      const asyncFn = jest.fn().mockImplementation(async () => {
        throw error;
      });
      const wrapped = asyncHandler(asyncFn);

      await wrapped(mockReq as Request, mockRes as Response, mockNext);

      await new Promise(resolve => setImmediate(resolve));

      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });

  // ===========================================
  // Validation Helpers Tests
  // ===========================================

  describe('validateRequired', () => {
    it('should not throw for present fields', () => {
      expect(() => {
        validateRequired({ name: 'test', age: 25 }, ['name', 'age']);
      }).not.toThrow();
    });

    it('should throw ValidationError for missing fields', () => {
      expect(() => {
        validateRequired({ name: 'test' }, ['name', 'age']);
      }).toThrow(ValidationError);
    });

    it('should throw for null values', () => {
      expect(() => {
        validateRequired({ name: null }, ['name']);
      }).toThrow(ValidationError);
    });

    it('should throw for empty string values', () => {
      expect(() => {
        validateRequired({ name: '' }, ['name']);
      }).toThrow(ValidationError);
    });

    it('should include all missing fields in error', () => {
      try {
        validateRequired({}, ['field1', 'field2']);
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        expect((error as ValidationError).message).toContain('field1');
        expect((error as ValidationError).message).toContain('field2');
      }
    });
  });

  describe('validateContext', () => {
    it('should not throw for valid contexts', () => {
      expect(() => validateContext('personal')).not.toThrow();
      expect(() => validateContext('work')).not.toThrow();
    });

    it('should throw for invalid context', () => {
      expect(() => validateContext('invalid')).toThrow(ValidationError);
    });

    it('should throw with helpful message', () => {
      try {
        validateContext('business');
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        expect((error as ValidationError).message).toContain('personal');
        expect((error as ValidationError).message).toContain('work');
      }
    });
  });

  describe('validateUUID', () => {
    it('should not throw for valid UUIDs', () => {
      expect(() => validateUUID('550e8400-e29b-41d4-a716-446655440000')).not.toThrow();
      expect(() => validateUUID('6ba7b810-9dad-11d1-80b4-00c04fd430c8')).not.toThrow();
    });

    it('should throw for invalid UUID format', () => {
      expect(() => validateUUID('not-a-uuid')).toThrow(ValidationError);
      expect(() => validateUUID('12345')).toThrow(ValidationError);
      expect(() => validateUUID('')).toThrow(ValidationError);
    });

    it('should include field name in error', () => {
      try {
        validateUUID('invalid', 'ideaId');
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        expect((error as ValidationError).message).toContain('ideaId');
      }
    });
  });

  describe('validatePagination', () => {
    it('should return defaults when no params', () => {
      const result = validatePagination();
      expect(result).toEqual({ limit: 20, offset: 0 });
    });

    it('should parse string parameters', () => {
      const result = validatePagination('10', '50');
      expect(result).toEqual({ limit: 10, offset: 50 });
    });

    it('should accept number parameters', () => {
      const result = validatePagination(15, 30);
      expect(result).toEqual({ limit: 15, offset: 30 });
    });

    it('should throw for invalid limit', () => {
      // Note: 0 becomes 20 due to (limit || 20) - this is expected behavior
      // 101 exceeds max
      expect(() => validatePagination(101)).toThrow(ValidationError);

      // Non-numeric string causes NaN
      expect(() => validatePagination('abc' as any)).toThrow(ValidationError);

      // -1 is less than 1
      expect(() => validatePagination(-1)).toThrow(ValidationError);
    });

    it('should throw for negative offset', () => {
      expect(() => validatePagination(10, -5)).toThrow(ValidationError);
    });

    it('should allow zero offset', () => {
      const result = validatePagination(10, 0);
      expect(result.offset).toBe(0);
    });
  });
});
