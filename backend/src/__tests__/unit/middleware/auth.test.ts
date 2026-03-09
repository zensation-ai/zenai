/**
 * Unit Tests for Authentication Middleware
 *
 * Tests API key generation, hashing, and authentication functions.
 * Phase 9: Updated for bcrypt hashing with legacy SHA256 support.
 */

import { Request, Response, NextFunction } from 'express';
import {
  hashApiKey,
  verifyApiKey,
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

var mockPool = pool as jest.Mocked<typeof pool>;

describe('Authentication Middleware', () => {
  // ===========================================
  // hashApiKey Tests (bcrypt)
  // ===========================================

  describe('hashApiKey', () => {
    it('should return bcrypt hash format', async () => {
      const key = 'ab_live_test123456789';
      const hash = await hashApiKey(key);
      // bcrypt hashes start with $2b$ or $2a$
      expect(hash).toMatch(/^\$2[ab]\$\d{2}\$/);
    });

    it('should return different hashes for same input (due to salt)', async () => {
      const key = 'ab_live_test123456789';
      const hash1 = await hashApiKey(key);
      const hash2 = await hashApiKey(key);
      // bcrypt generates different hashes each time due to random salt
      expect(hash1).not.toBe(hash2);
    });

    it('should handle empty string', async () => {
      const hash = await hashApiKey('');
      expect(hash).toMatch(/^\$2[ab]\$\d{2}\$/);
    });

    it('should handle special characters', async () => {
      const hash = await hashApiKey('ab_live_!@#$%^&*()');
      expect(hash).toMatch(/^\$2[ab]\$\d{2}\$/);
    });

    it('should handle unicode characters', async () => {
      const hash = await hashApiKey('ab_live_über_test_日本語');
      expect(hash).toMatch(/^\$2[ab]\$\d{2}\$/);
    });
  });

  // ===========================================
  // verifyApiKey Tests
  // ===========================================

  describe('verifyApiKey', () => {
    it('should verify bcrypt hash correctly', async () => {
      const key = 'ab_live_test123456789';
      const hash = await hashApiKey(key);

      const isValid = await verifyApiKey(key, hash);
      expect(isValid).toBe(true);
    });

    it('should reject wrong key against bcrypt hash', async () => {
      const key = 'ab_live_test123456789';
      const wrongKey = 'ab_live_wrongkey123';
      const hash = await hashApiKey(key);

      const isValid = await verifyApiKey(wrongKey, hash);
      expect(isValid).toBe(false);
    });

    it('should verify legacy SHA256 hash for migration', async () => {
      const crypto = await import('crypto');
      const key = 'ab_live_legacytest';
      // Simulate legacy SHA256 hash
      const legacyHash = crypto.createHash('sha256').update(key).digest('hex');

      const isValid = await verifyApiKey(key, legacyHash);
      expect(isValid).toBe(true);
    });

    it('should reject wrong key against legacy SHA256 hash', async () => {
      const crypto = await import('crypto');
      const key = 'ab_live_legacytest';
      const wrongKey = 'ab_live_wrongkey';
      const legacyHash = crypto.createHash('sha256').update(key).digest('hex');

      const isValid = await verifyApiKey(wrongKey, legacyHash);
      expect(isValid).toBe(false);
    });
  });

  // ===========================================
  // generateApiKey Tests
  // ===========================================

  describe('generateApiKey', () => {
    it('should generate key with correct prefix format', async () => {
      const { key, prefix, hash } = await generateApiKey();
      expect(key).toMatch(/^ab_live_[0-9a-f]{48}$/);
      expect(prefix).toBe(key.substring(0, 10));
      expect(key.startsWith('ab_live_')).toBe(true);
    });

    it('should generate unique keys', async () => {
      const keys = new Set<string>();
      for (let i = 0; i < 10; i++) {
        const { key } = await generateApiKey();
        keys.add(key);
      }
      expect(keys.size).toBe(10);
    }, 30000);

    it('should return verifiable hash for generated key', async () => {
      const { key, hash } = await generateApiKey();
      const isValid = await verifyApiKey(key, hash);
      expect(isValid).toBe(true);
    });

    it('should generate key of correct length', async () => {
      const { key } = await generateApiKey();
      // ab_live_ (8) + 48 hex chars = 56 total
      expect(key).toHaveLength(56);
    });

    it('should generate bcrypt hash', async () => {
      const { hash } = await generateApiKey();
      expect(hash).toMatch(/^\$2[ab]\$\d{2}\$/);
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
        expect.objectContaining({ error: 'No API key found in request', code: 'UNAUTHORIZED' })
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
        expect.objectContaining({ code: 'FORBIDDEN' })
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
    it('should not be reversible', async () => {
      const originalKey = 'ab_live_secret123';
      const hash = await hashApiKey(originalKey);

      // Hash should not contain the original key
      expect(hash).not.toContain('secret');
      expect(hash).not.toContain('ab_live');
    });

    it('should be case sensitive', async () => {
      const key1 = 'ab_live_ABC';
      const key2 = 'ab_live_abc';
      const hash1 = await hashApiKey(key1);
      const hash2 = await hashApiKey(key2);

      // Verify both keys against their respective hashes
      expect(await verifyApiKey(key1, hash1)).toBe(true);
      expect(await verifyApiKey(key2, hash2)).toBe(true);

      // Cross-verify should fail
      expect(await verifyApiKey(key1, hash2)).toBe(false);
      expect(await verifyApiKey(key2, hash1)).toBe(false);
    });
  });
});
