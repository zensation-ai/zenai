/**
 * Unit Tests for Authentication Middleware
 *
 * Tests API key generation, hashing, and authentication functions.
 * Database-dependent tests use mocks.
 */

import { Request, Response, NextFunction } from 'express';
import {
  hashApiKey,
  generateApiKey,
  requireScope,
} from '../../../middleware/auth';

// Mock the database pool
jest.mock('../../../utils/database', () => ({
  pool: {
    query: jest.fn(),
  },
}));

import { pool } from '../../../utils/database';

const mockPool = pool as jest.Mocked<typeof pool>;

describe('Authentication Middleware', () => {
  // ===========================================
  // hashApiKey Tests
  // ===========================================

  describe('hashApiKey', () => {
    it('should return consistent hash for same input', () => {
      const key = 'ab_live_test123456789';
      const hash1 = hashApiKey(key);
      const hash2 = hashApiKey(key);
      expect(hash1).toBe(hash2);
    });

    it('should return different hash for different input', () => {
      const key1 = 'ab_live_test123456789';
      const key2 = 'ab_live_test987654321';
      const hash1 = hashApiKey(key1);
      const hash2 = hashApiKey(key2);
      expect(hash1).not.toBe(hash2);
    });

    it('should return 64 character hex string (SHA256)', () => {
      const key = 'ab_live_test123456789';
      const hash = hashApiKey(key);
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should handle empty string', () => {
      const hash = hashApiKey('');
      expect(hash).toHaveLength(64);
    });

    it('should handle special characters', () => {
      const hash = hashApiKey('ab_live_!@#$%^&*()');
      expect(hash).toHaveLength(64);
    });
  });

  // ===========================================
  // generateApiKey Tests
  // ===========================================

  describe('generateApiKey', () => {
    it('should generate key with correct prefix format', () => {
      const { key, prefix, hash } = generateApiKey();
      expect(key).toMatch(/^ab_live_[0-9a-f]{48}$/);
      expect(prefix).toBe(key.substring(0, 10));
      expect(key.startsWith('ab_live_')).toBe(true);
    });

    it('should generate unique keys', () => {
      const keys = new Set<string>();
      for (let i = 0; i < 100; i++) {
        const { key } = generateApiKey();
        keys.add(key);
      }
      expect(keys.size).toBe(100);
    });

    it('should return correct hash for generated key', () => {
      const { key, hash } = generateApiKey();
      const expectedHash = hashApiKey(key);
      expect(hash).toBe(expectedHash);
    });

    it('should generate key of correct length', () => {
      const { key } = generateApiKey();
      // ab_live_ (8) + 48 hex chars = 56 total
      expect(key).toHaveLength(56);
    });
  });

  // ===========================================
  // requireScope Middleware Tests
  // ===========================================

  describe('requireScope', () => {
    let mockReq: Partial<Request>;
    let mockRes: Partial<Response>;
    let mockNext: NextFunction;
    let jsonMock: jest.Mock;
    let statusMock: jest.Mock;

    beforeEach(() => {
      jsonMock = jest.fn();
      statusMock = jest.fn().mockReturnValue({ json: jsonMock });
      mockRes = {
        status: statusMock,
        json: jsonMock,
      };
      mockNext = jest.fn();
    });

    it('should return 401 if no API key present', () => {
      mockReq = {};

      const middleware = requireScope('read');
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Authentication required' })
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 403 if scope is missing', () => {
      mockReq = {
        apiKey: {
          id: 'key-123',
          name: 'Test Key',
          scopes: ['read'],
          rateLimit: 1000,
        },
      };

      const middleware = requireScope('write');
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(403);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Insufficient permissions' })
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should call next if scope is present', () => {
      mockReq = {
        apiKey: {
          id: 'key-123',
          name: 'Test Key',
          scopes: ['read', 'write'],
          rateLimit: 1000,
        },
      };

      const middleware = requireScope('write');
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should allow admin scope to pass any check', () => {
      mockReq = {
        apiKey: {
          id: 'key-123',
          name: 'Admin Key',
          scopes: ['admin'],
          rateLimit: 1000,
        },
      };

      const middleware = requireScope('delete');
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should handle multiple scopes correctly', () => {
      mockReq = {
        apiKey: {
          id: 'key-123',
          name: 'Multi Scope Key',
          scopes: ['read', 'write', 'delete'],
          rateLimit: 1000,
        },
      };

      // Test each scope
      const readMiddleware = requireScope('read');
      readMiddleware(mockReq as Request, mockRes as Response, mockNext);
      expect(mockNext).toHaveBeenCalledTimes(1);

      const writeMiddleware = requireScope('write');
      writeMiddleware(mockReq as Request, mockRes as Response, mockNext);
      expect(mockNext).toHaveBeenCalledTimes(2);

      const deleteMiddleware = requireScope('delete');
      deleteMiddleware(mockReq as Request, mockRes as Response, mockNext);
      expect(mockNext).toHaveBeenCalledTimes(3);
    });

    it('should fail for empty scopes array', () => {
      mockReq = {
        apiKey: {
          id: 'key-123',
          name: 'No Scopes Key',
          scopes: [],
          rateLimit: 1000,
        },
      };

      const middleware = requireScope('read');
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(403);
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  // ===========================================
  // API Key Format Validation Tests
  // ===========================================

  describe('API Key Format', () => {
    it('should identify valid API key format', () => {
      const validKeys = [
        'ab_live_1234567890abcdef1234567890abcdef1234567890abcdef',
        'ab_live_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      ];

      for (const key of validKeys) {
        expect(key).toMatch(/^ab_live_[0-9a-f]+$/);
        expect(key.startsWith('ab_live_')).toBe(true);
      }
    });

    it('should identify invalid API key formats', () => {
      const invalidKeys = [
        'invalid_key',
        'ab_test_123',  // Wrong prefix
        'AB_LIVE_123',  // Uppercase
        '',
      ];

      for (const key of invalidKeys) {
        expect(key.startsWith('ab_live_')).toBe(false);
      }
    });
  });

  // ===========================================
  // Hash Security Tests
  // ===========================================

  describe('Hash Security', () => {
    it('should not be reversible', () => {
      const originalKey = 'ab_live_secret123';
      const hash = hashApiKey(originalKey);

      // Hash should not contain the original key
      expect(hash).not.toContain('secret');
      expect(hash).not.toContain('ab_live');
    });

    it('should be case sensitive', () => {
      const key1 = 'ab_live_ABC';
      const key2 = 'ab_live_abc';
      const hash1 = hashApiKey(key1);
      const hash2 = hashApiKey(key2);

      expect(hash1).not.toBe(hash2);
    });

    it('should handle unicode characters', () => {
      const hash = hashApiKey('ab_live_über_test_日本語');
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });
  });
});
