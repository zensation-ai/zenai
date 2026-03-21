/**
 * Phase 56: JWT Service Unit Tests
 */

import jwt from 'jsonwebtoken';
import crypto from 'crypto';

// Mock database
const mockQuery = jest.fn();
jest.mock('../../../../utils/database-context', () => ({
  queryPublic: (...args: unknown[]) => mockQuery(...args),
}));

// Mock logger
jest.mock('../../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock session store
const mockCreateSession = jest.fn();
const mockFindByRefreshTokenHash = jest.fn();
const mockRevokeSession = jest.fn();
const mockRevokeAllUserSessions = jest.fn();

jest.mock('../../../../services/auth/session-store', () => ({
  sessionStore: {
    createSession: (...args: unknown[]) => mockCreateSession(...args),
    findByRefreshTokenHash: (...args: unknown[]) => mockFindByRefreshTokenHash(...args),
    revokeSession: (...args: unknown[]) => mockRevokeSession(...args),
    revokeAllUserSessions: (...args: unknown[]) => mockRevokeAllUserSessions(...args),
  },
}));

import {
  generateTokenPair,
  verifyAccessToken,
  refreshTokens,
  revokeSession,
  revokeAllUserSessions,
  JwtError,
} from '../../../../services/auth/jwt-service';
import type { User } from '../../../../services/auth/user-service';

// ===========================================
// Test Data
// ===========================================

const mockUser: User = {
  id: 'usr_123',
  email: 'test@example.com',
  email_verified: true,
  display_name: 'Test User',
  avatar_url: null,
  auth_provider: 'local',
  auth_provider_id: null,
  mfa_enabled: false,
  mfa_secret: null,
  role: 'user',
  preferences: {},
  last_login: null,
  login_count: 1,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

// ===========================================
// Tests
// ===========================================

describe('JwtService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockReset();
    mockCreateSession.mockReset();
    mockFindByRefreshTokenHash.mockReset();
    mockRevokeSession.mockReset();
    mockRevokeAllUserSessions.mockReset();
    process.env = { ...originalEnv, JWT_SECRET: 'test-secret-for-jwt-unit-tests' };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  // ----- generateTokenPair -----
  describe('generateTokenPair', () => {
    it('should return access token, refresh token, and expiresIn', async () => {
      mockCreateSession.mockResolvedValueOnce({ id: 'sess_1' });

      const result = await generateTokenPair(mockUser);

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result).toHaveProperty('expiresIn');
      expect(result.expiresIn).toBe(900);
      expect(typeof result.accessToken).toBe('string');
      expect(typeof result.refreshToken).toBe('string');
    });

    it('should create a valid JWT access token', async () => {
      mockCreateSession.mockResolvedValueOnce({ id: 'sess_1' });

      const result = await generateTokenPair(mockUser);
      const decoded = jwt.verify(result.accessToken, 'test-secret-for-jwt-unit-tests') as Record<string, unknown>;

      expect(decoded.sub).toBe('usr_123');
      expect(decoded.email).toBe('test@example.com');
      expect(decoded.role).toBe('user');
    });

    it('should generate a 128-character hex refresh token', async () => {
      mockCreateSession.mockResolvedValueOnce({ id: 'sess_1' });

      const result = await generateTokenPair(mockUser);
      expect(result.refreshToken).toMatch(/^[a-f0-9]{128}$/);
    });

    it('should store session with hashed refresh token', async () => {
      mockCreateSession.mockResolvedValueOnce({ id: 'sess_1' });

      const result = await generateTokenPair(mockUser, { browser: 'Chrome' }, '192.168.1.1');

      expect(mockCreateSession).toHaveBeenCalledTimes(1);
      const sessionInput = mockCreateSession.mock.calls[0][0];
      expect(sessionInput.userId).toBe('usr_123');
      expect(sessionInput.ipAddress).toBe('192.168.1.1');
      expect(sessionInput.deviceInfo).toEqual({ browser: 'Chrome' });

      // Verify the hash is SHA256 of the refresh token
      const expectedHash = crypto.createHash('sha256').update(result.refreshToken).digest('hex');
      expect(sessionInput.refreshTokenHash).toBe(expectedHash);
    });

    it('should pass empty object for deviceInfo when not provided', async () => {
      mockCreateSession.mockResolvedValueOnce({ id: 'sess_1' });

      await generateTokenPair(mockUser);

      const sessionInput = mockCreateSession.mock.calls[0][0];
      expect(sessionInput.deviceInfo).toEqual({});
      expect(sessionInput.ipAddress).toBeNull();
    });
  });

  // ----- verifyAccessToken -----
  describe('verifyAccessToken', () => {
    it('should verify a valid token and return payload', async () => {
      mockCreateSession.mockResolvedValueOnce({ id: 'sess_1' });
      const { accessToken } = await generateTokenPair(mockUser);

      const payload = verifyAccessToken(accessToken);
      expect(payload.sub).toBe('usr_123');
      expect(payload.email).toBe('test@example.com');
      expect(payload.role).toBe('user');
    });

    it('should throw JwtError for expired token', () => {
      const token = jwt.sign(
        { sub: 'usr_123', email: 'test@example.com', role: 'user' },
        'test-secret-for-jwt-unit-tests',
        { expiresIn: '-1s', algorithm: 'HS256' }
      );

      expect(() => verifyAccessToken(token)).toThrow(JwtError);
      try {
        verifyAccessToken(token);
      } catch (e) {
        expect((e as JwtError).code).toBe('TOKEN_EXPIRED');
      }
    });

    it('should throw JwtError for invalid token', () => {
      expect(() => verifyAccessToken('invalid.token.here')).toThrow(JwtError);
    });

    it('should throw JwtError for token signed with wrong secret', () => {
      const token = jwt.sign(
        { sub: 'usr_123', email: 'test@example.com', role: 'user' },
        'wrong-secret',
        { expiresIn: '15m', algorithm: 'HS256' }
      );

      expect(() => verifyAccessToken(token)).toThrow(JwtError);
    });

    it('should throw JwtError for malformed token', () => {
      expect(() => verifyAccessToken('not-a-jwt')).toThrow(JwtError);
    });
  });

  // ----- refreshTokens -----
  describe('refreshTokens', () => {
    it('should generate new token pair and revoke old session', async () => {
      const oldRefreshToken = crypto.randomBytes(64).toString('hex');
      const oldHash = crypto.createHash('sha256').update(oldRefreshToken).digest('hex');

      const futureExpiry = new Date();
      futureExpiry.setDate(futureExpiry.getDate() + 7);

      mockFindByRefreshTokenHash.mockResolvedValueOnce({
        id: 'sess_old',
        user_id: 'usr_123',
        refresh_token_hash: oldHash,
        revoked: false,
        expires_at: futureExpiry.toISOString(),
        device_info: { browser: 'Firefox' },
      });
      mockRevokeSession.mockResolvedValueOnce(undefined);
      mockQuery.mockResolvedValueOnce({ rows: [mockUser] }); // User lookup
      mockCreateSession.mockResolvedValueOnce({ id: 'sess_new' }); // New session

      const result = await refreshTokens(oldRefreshToken);

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(mockRevokeSession).toHaveBeenCalledWith('sess_old');
    });

    it('should throw for unknown refresh token', async () => {
      mockFindByRefreshTokenHash.mockResolvedValueOnce(null);

      await expect(
        refreshTokens('unknown-token')
      ).rejects.toMatchObject({ code: 'INVALID_REFRESH_TOKEN' });
    });

    it('should revoke all sessions on reuse of revoked token', async () => {
      const token = crypto.randomBytes(64).toString('hex');

      mockFindByRefreshTokenHash.mockResolvedValueOnce({
        id: 'sess_old',
        user_id: 'usr_123',
        revoked: true, // Already revoked!
        expires_at: new Date(Date.now() + 86400000).toISOString(),
      });
      mockRevokeAllUserSessions.mockResolvedValueOnce(undefined);

      await expect(refreshTokens(token)).rejects.toMatchObject({ code: 'REVOKED_TOKEN' });
      expect(mockRevokeAllUserSessions).toHaveBeenCalledWith('usr_123');
    });

    it('should throw for expired refresh token', async () => {
      const token = crypto.randomBytes(64).toString('hex');

      mockFindByRefreshTokenHash.mockResolvedValueOnce({
        id: 'sess_old',
        user_id: 'usr_123',
        revoked: false,
        expires_at: '2020-01-01T00:00:00Z', // Expired
      });

      await expect(refreshTokens(token)).rejects.toMatchObject({ code: 'EXPIRED_REFRESH_TOKEN' });
    });

    it('should throw if user not found during refresh', async () => {
      const token = crypto.randomBytes(64).toString('hex');
      const hash = crypto.createHash('sha256').update(token).digest('hex');

      mockFindByRefreshTokenHash.mockResolvedValueOnce({
        id: 'sess_old',
        user_id: 'usr_deleted',
        refresh_token_hash: hash,
        revoked: false,
        expires_at: new Date(Date.now() + 86400000).toISOString(),
        device_info: {},
      });
      mockRevokeSession.mockResolvedValueOnce(undefined);
      mockQuery.mockResolvedValueOnce({ rows: [] }); // User not found

      await expect(refreshTokens(token)).rejects.toMatchObject({ code: 'USER_NOT_FOUND' });
    });
  });

  // ----- revokeSession -----
  describe('revokeSession', () => {
    it('should delegate to sessionStore', async () => {
      mockRevokeSession.mockResolvedValueOnce(undefined);
      await revokeSession('sess_123');
      expect(mockRevokeSession).toHaveBeenCalledWith('sess_123');
    });
  });

  // ----- revokeAllUserSessions -----
  describe('revokeAllUserSessions', () => {
    it('should delegate to sessionStore', async () => {
      mockRevokeAllUserSessions.mockResolvedValueOnce(undefined);
      await revokeAllUserSessions('usr_123');
      expect(mockRevokeAllUserSessions).toHaveBeenCalledWith('usr_123');
    });
  });

  // ----- JwtError -----
  describe('JwtError', () => {
    it('should have correct properties', () => {
      const error = new JwtError('test', 'TEST_CODE', 403);
      expect(error.message).toBe('test');
      expect(error.code).toBe('TEST_CODE');
      expect(error.statusCode).toBe(403);
      expect(error.name).toBe('JwtError');
    });

    it('should default statusCode to 401', () => {
      const error = new JwtError('test', 'TEST');
      expect(error.statusCode).toBe(401);
    });
  });

  // ----- JWT_SECRET handling -----
  describe('JWT_SECRET environment', () => {
    it('should use fallback in non-production', async () => {
      delete process.env.JWT_SECRET;
      process.env.NODE_ENV = 'development';
      mockCreateSession.mockResolvedValueOnce({ id: 'sess_1' });

      // Should not throw — uses fallback
      const result = await generateTokenPair(mockUser);
      expect(result.accessToken).toBeTruthy();
    });
  });
});
