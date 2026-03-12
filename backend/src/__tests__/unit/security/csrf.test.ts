/**
 * Phase Security Sprint 3: CSRF Protection Tests
 */

import { Request, Response, NextFunction } from 'express';
import {
  generateCsrfToken,
  csrfProtection,
  getCsrfTokenHandler,
  ensureCookieParser,
} from '../../../middleware/csrf';

// Mock logger
jest.mock('../../../utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock Redis (returns null = memory fallback)
jest.mock('../../../utils/cache', () => ({
  getRedisClient: jest.fn(() => null),
}));

describe('CSRF Protection', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockRequest = {
      method: 'POST',
      path: '/api/test',
      headers: {},
      body: {},
      cookies: {},
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' } as any,
    } as any;
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      cookie: jest.fn().mockReturnThis(),
      setHeader: jest.fn().mockReturnThis(),
      locals: { requestId: 'test-request-id' },
    } as any;
    mockNext = jest.fn();
  });

  describe('generateCsrfToken', () => {
    it('should generate a 64-character hex token', () => {
      const token = generateCsrfToken();
      expect(token).toHaveLength(64);
      expect(token).toMatch(/^[a-f0-9]+$/);
    });

    it('should generate unique tokens', () => {
      const token1 = generateCsrfToken();
      const token2 = generateCsrfToken();
      expect(token1).not.toBe(token2);
    });
  });

  describe('csrfProtection middleware', () => {
    it('should allow GET requests without CSRF token', async () => {
      mockRequest.method = 'GET';

      await csrfProtection(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('should allow HEAD requests without CSRF token', async () => {
      mockRequest.method = 'HEAD';

      await csrfProtection(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should allow OPTIONS requests without CSRF token', async () => {
      mockRequest.method = 'OPTIONS';

      await csrfProtection(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should skip CSRF for API key authenticated requests', async () => {
      mockRequest.method = 'POST';
      mockRequest.apiKey = {
        id: 'test-key-id',
        name: 'Test Key',
        scopes: ['read', 'write'],
        rateLimit: 1000,
      };

      await csrfProtection(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('should skip CSRF for webhook endpoints', async () => {
      (mockRequest as any).method = 'POST';
      (mockRequest as any).path = '/api/webhooks/github';

      await csrfProtection(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should reject POST requests without CSRF token', async () => {
      (mockRequest as any).method = 'POST';
      (mockRequest as any).path = '/api/test';

      await csrfProtection(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'CSRF_TOKEN_MISSING',
        })
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject PUT requests without CSRF token', async () => {
      mockRequest.method = 'PUT';

      await csrfProtection(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(403);
    });

    it('should reject DELETE requests without CSRF token', async () => {
      mockRequest.method = 'DELETE';

      await csrfProtection(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(403);
    });

    it('should reject PATCH requests without CSRF token', async () => {
      mockRequest.method = 'PATCH';

      await csrfProtection(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(403);
    });
  });

  describe('getCsrfTokenHandler', () => {
    it('should return a new CSRF token', async () => {
      await getCsrfTokenHandler(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.cookie).toHaveBeenCalled();
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          csrfToken: expect.stringMatching(/^[a-f0-9]{64}$/),
          expiresIn: expect.any(Number),
        })
      );
    });

    it('should set CSRF cookie with secure options', async () => {
      await getCsrfTokenHandler(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.cookie).toHaveBeenCalledWith(
        '_csrf_token',
        expect.any(String),
        expect.objectContaining({
          httpOnly: true,
          sameSite: 'strict',
        })
      );
    });
  });

  describe('ensureCookieParser middleware', () => {
    it('should parse cookies from header if not already parsed', () => {
      mockRequest.cookies = undefined as any;
      mockRequest.headers = {
        cookie: 'session=abc123; _csrf_token=xyz789',
      };

      ensureCookieParser(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockRequest.cookies).toBeDefined();
      expect(mockRequest.cookies?.session).toBe('abc123');
      expect(mockRequest.cookies?._csrf_token).toBe('xyz789');
      expect(mockNext).toHaveBeenCalled();
    });

    it('should not re-parse if cookies already exist', () => {
      mockRequest.cookies = { existing: 'cookie' };

      ensureCookieParser(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockRequest.cookies?.existing).toBe('cookie');
      expect(mockNext).toHaveBeenCalled();
    });

    it('should handle requests without cookie header', () => {
      mockRequest.cookies = undefined as any;
      mockRequest.headers = {};

      ensureCookieParser(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });
});
