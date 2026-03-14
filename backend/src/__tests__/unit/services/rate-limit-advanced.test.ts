/**
 * Phase 62: Advanced Rate Limiting Tests
 */

// Redis is not installed in dev dependencies - rate limiter falls back to in-memory store
// No mock needed since the dynamic import will fail gracefully

jest.mock('../../../utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import { Request, Response, NextFunction } from 'express';
import {
  createRateLimiter,
  createEndpointLimiter,
  updateTierConfig,
  getTierConfig,
  getAllTierConfigs,
  getRateLimitStats,
  resetMemoryStore,
} from '../../../services/security/rate-limit-advanced';

describe('Advanced Rate Limiting', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;
  let jsonMock: jest.Mock;
  let statusMock: jest.Mock;
  let setHeaderMock: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    resetMemoryStore();

    jsonMock = jest.fn();
    setHeaderMock = jest.fn();
    statusMock = jest.fn().mockReturnValue({ json: jsonMock });
    mockReq = {
      ip: '127.0.0.1',
      path: '/api/test',
      method: 'GET',
      headers: {},
      socket: { remoteAddress: '127.0.0.1' } as any,
    };
    mockRes = {
      status: statusMock,
      json: jsonMock,
      setHeader: setHeaderMock,
    };
    mockNext = jest.fn();
  });

  // ===========================================
  // createRateLimiter
  // ===========================================

  describe('createRateLimiter', () => {
    it('should allow requests within limit', async () => {
      const limiter = createRateLimiter({ maxRequests: 5, windowSeconds: 60 });

      await limiter(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(setHeaderMock).toHaveBeenCalledWith('X-RateLimit-Limit', 5);
      expect(setHeaderMock).toHaveBeenCalledWith('X-RateLimit-Remaining', 4);
    });

    it('should block requests exceeding limit', async () => {
      const limiter = createRateLimiter({ maxRequests: 2, windowSeconds: 60 });

      // First 2 requests should pass
      await limiter(mockReq as Request, mockRes as Response, mockNext);
      await limiter(mockReq as Request, mockRes as Response, mockNext);

      // Third should be blocked
      const newNext = jest.fn();
      await limiter(mockReq as Request, mockRes as Response, newNext);

      expect(newNext).not.toHaveBeenCalled();
      expect(statusMock).toHaveBeenCalledWith(429);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          code: 'RATE_LIMIT_EXCEEDED',
        })
      );
    });

    it('should set rate limit headers', async () => {
      const limiter = createRateLimiter({ maxRequests: 10, windowSeconds: 60 });

      await limiter(mockReq as Request, mockRes as Response, mockNext);

      expect(setHeaderMock).toHaveBeenCalledWith('X-RateLimit-Limit', 10);
      expect(setHeaderMock).toHaveBeenCalledWith('X-RateLimit-Remaining', 9);
      expect(setHeaderMock).toHaveBeenCalledWith('X-RateLimit-Reset', expect.any(Number));
    });

    it('should use custom key generator', async () => {
      const limiter = createRateLimiter({
        maxRequests: 1,
        windowSeconds: 60,
        keyGenerator: () => 'custom-key',
      });

      await limiter(mockReq as Request, mockRes as Response, mockNext);
      expect(mockNext).toHaveBeenCalled();

      // Different request with same custom key should be rate limited
      const newNext = jest.fn();
      const mockReq2 = { ...mockReq, ip: '10.0.0.1' };
      await limiter(mockReq2 as Request, mockRes as Response, newNext);
      expect(newNext).not.toHaveBeenCalled();
    });

    it('should use JWT user ID for rate limit key when available', async () => {
      const limiter = createRateLimiter({ maxRequests: 1, windowSeconds: 60 });

      mockReq.jwtUser = { id: 'user-1', email: 'test@test.com', role: 'admin' };
      await limiter(mockReq as Request, mockRes as Response, mockNext);
      expect(mockNext).toHaveBeenCalled();

      // Different IP but same user should be rate limited
      const newNext = jest.fn();
      mockReq.ip = '10.0.0.1';
      await limiter(mockReq as Request, mockRes as Response, newNext);
      expect(newNext).not.toHaveBeenCalled();
    });

    it('should use API key ID when no JWT user', async () => {
      const limiter = createRateLimiter({ maxRequests: 1, windowSeconds: 60 });

      mockReq.apiKey = { id: 'key-1', name: 'test', scopes: ['read'], rateLimit: 1000 };
      await limiter(mockReq as Request, mockRes as Response, mockNext);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should set Retry-After header when rate limited', async () => {
      const limiter = createRateLimiter({ maxRequests: 1, windowSeconds: 60 });

      await limiter(mockReq as Request, mockRes as Response, mockNext);

      const newNext = jest.fn();
      await limiter(mockReq as Request, mockRes as Response, newNext);

      expect(setHeaderMock).toHaveBeenCalledWith('Retry-After', expect.any(Number));
    });
  });

  // ===========================================
  // createEndpointLimiter
  // ===========================================

  describe('createEndpointLimiter', () => {
    it('should create limiter with default tier config', async () => {
      const limiter = createEndpointLimiter('default');
      await limiter(mockReq as Request, mockRes as Response, mockNext);
      expect(mockNext).toHaveBeenCalled();
      expect(setHeaderMock).toHaveBeenCalledWith('X-RateLimit-Limit', 100);
    });

    it('should create limiter with auth tier config', async () => {
      const limiter = createEndpointLimiter('auth');
      await limiter(mockReq as Request, mockRes as Response, mockNext);
      expect(setHeaderMock).toHaveBeenCalledWith('X-RateLimit-Limit', 10);
    });

    it('should create limiter with ai tier config', async () => {
      const limiter = createEndpointLimiter('ai');
      await limiter(mockReq as Request, mockRes as Response, mockNext);
      expect(setHeaderMock).toHaveBeenCalledWith('X-RateLimit-Limit', 30);
    });

    it('should create limiter with upload tier config', async () => {
      const limiter = createEndpointLimiter('upload');
      await limiter(mockReq as Request, mockRes as Response, mockNext);
      expect(setHeaderMock).toHaveBeenCalledWith('X-RateLimit-Limit', 20);
    });
  });

  // ===========================================
  // Tier config management
  // ===========================================

  describe('tier config management', () => {
    it('should get default tier config', () => {
      const config = getTierConfig('default');
      expect(config.maxRequests).toBe(100);
      expect(config.windowSeconds).toBe(60);
    });

    it('should update tier config', () => {
      const updated = updateTierConfig('default', { maxRequests: 200 });
      expect(updated.maxRequests).toBe(200);
      expect(updated.windowSeconds).toBe(60); // unchanged

      const config = getTierConfig('default');
      expect(config.maxRequests).toBe(200);
    });

    it('should get all tier configs', () => {
      const configs = getAllTierConfigs();
      expect(configs).toHaveProperty('default');
      expect(configs).toHaveProperty('auth');
      expect(configs).toHaveProperty('ai');
      expect(configs).toHaveProperty('upload');
    });

    it('should create custom tier via update', () => {
      updateTierConfig('custom', { maxRequests: 50, windowSeconds: 30 });
      const config = getTierConfig('custom');
      expect(config.maxRequests).toBe(50);
    });
  });

  // ===========================================
  // Stats
  // ===========================================

  describe('getRateLimitStats', () => {
    it('should return stats', () => {
      const stats = getRateLimitStats();
      expect(stats).toHaveProperty('activeKeys');
      expect(stats).toHaveProperty('redisAvailable');
      expect(typeof stats.activeKeys).toBe('number');
    });
  });
});
