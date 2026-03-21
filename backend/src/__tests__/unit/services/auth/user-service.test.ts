/**
 * Phase 56: User Service Unit Tests
 */

import bcrypt from 'bcrypt';

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

import {
  register,
  login,
  findByEmail,
  findById,
  findOrCreateOAuthUser,
  updateProfile,
  setMfaSecret,
  setMfaEnabled,
  toUserProfile,
  UserServiceError,
} from '../../../../services/auth/user-service';
import type { User } from '../../../../services/auth/user-service';

// ===========================================
// Test Data
// ===========================================

const mockUser: User = {
  id: 'usr_123',
  email: 'test@example.com',
  email_verified: false,
  display_name: 'Test User',
  avatar_url: null,
  auth_provider: 'local',
  auth_provider_id: null,
  mfa_enabled: false,
  mfa_secret: null,
  role: 'user',
  preferences: {},
  last_login: null,
  login_count: 0,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const mockUserWithHash = {
  ...mockUser,
  password_hash: '$2b$12$fakehashvalue',
};

// ===========================================
// Tests
// ===========================================

describe('UserService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockReset();
  });

  // ----- toUserProfile -----
  describe('toUserProfile', () => {
    it('should strip sensitive fields from user', () => {
      const profile = toUserProfile(mockUser);
      expect(profile).not.toHaveProperty('password_hash');
      expect(profile).not.toHaveProperty('mfa_secret');
      expect(profile).not.toHaveProperty('auth_provider_id');
      expect(profile.id).toBe(mockUser.id);
      expect(profile.email).toBe(mockUser.email);
      expect(profile.role).toBe(mockUser.role);
    });

    it('should preserve all non-sensitive fields', () => {
      const profile = toUserProfile(mockUser);
      expect(profile.display_name).toBe(mockUser.display_name);
      expect(profile.avatar_url).toBe(mockUser.avatar_url);
      expect(profile.mfa_enabled).toBe(mockUser.mfa_enabled);
      expect(profile.preferences).toEqual(mockUser.preferences);
      expect(profile.login_count).toBe(mockUser.login_count);
    });
  });

  // ----- register -----
  describe('register', () => {
    it('should register a new user successfully', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] }) // Check existing
        .mockResolvedValueOnce({ rows: [mockUser] }) // INSERT user
        .mockResolvedValueOnce({ rows: [] }) // Grant personal
        .mockResolvedValueOnce({ rows: [] }) // Grant work
        .mockResolvedValueOnce({ rows: [] }) // Grant learning
        .mockResolvedValueOnce({ rows: [] }); // Grant creative

      const user = await register({
        email: 'test@example.com',
        password: 'password123',
        display_name: 'Test User',
      });

      expect(user.id).toBe('usr_123');
      expect(mockQuery).toHaveBeenCalledTimes(6); // 1 check + 1 insert + 4 contexts
    });

    it('should throw on invalid email', async () => {
      await expect(
        register({ email: 'invalid', password: 'password123' })
      ).rejects.toThrow(UserServiceError);

      await expect(
        register({ email: 'invalid', password: 'password123' })
      ).rejects.toMatchObject({ code: 'INVALID_EMAIL' });
    });

    it('should throw on empty email', async () => {
      await expect(
        register({ email: '', password: 'password123' })
      ).rejects.toThrow(UserServiceError);
    });

    it('should throw on short password', async () => {
      await expect(
        register({ email: 'test@example.com', password: 'short' })
      ).rejects.toThrow(UserServiceError);

      await expect(
        register({ email: 'test@example.com', password: 'short' })
      ).rejects.toMatchObject({ code: 'WEAK_PASSWORD' });
    });

    it('should throw on password exceeding 128 chars', async () => {
      const longPassword = 'a'.repeat(129);
      await expect(
        register({ email: 'test@example.com', password: longPassword })
      ).rejects.toThrow(UserServiceError);
    });

    it('should throw if email already exists', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'existing' }] });

      await expect(
        register({ email: 'test@example.com', password: 'password123' })
      ).rejects.toMatchObject({ code: 'EMAIL_EXISTS' });
    });

    it('should lowercase email before storing', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [mockUser] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      await register({
        email: 'TEST@Example.COM',
        password: 'password123',
      });

      // Check the SELECT call used lowercase
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT'),
        ['test@example.com']
      );
    });

    it('should hash password with bcrypt', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [mockUser] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const hashSpy = jest.spyOn(bcrypt, 'hash');

      await register({
        email: 'test@example.com',
        password: 'password123',
      });

      expect(hashSpy).toHaveBeenCalledWith('password123', 12);
      hashSpy.mockRestore();
    });

    it('should grant all 4 contexts to new user', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [mockUser] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      await register({
        email: 'test@example.com',
        password: 'password123',
      });

      // Context grants are calls 3-6 (0-indexed: 2-5)
      const contextCalls = mockQuery.mock.calls.slice(2, 6);
      const contexts = contextCalls.map(call => call[1][1]);
      expect(contexts).toEqual(['personal', 'work', 'learning', 'creative']);
    });
  });

  // ----- login -----
  describe('login', () => {
    it('should login with valid credentials', async () => {
      const hashedPassword = await bcrypt.hash('password123', 4); // Use low rounds for test speed
      const userWithHash = { ...mockUser, password_hash: hashedPassword };

      mockQuery
        .mockResolvedValueOnce({ rows: [userWithHash] }) // SELECT user
        .mockResolvedValueOnce({ rows: [] }); // UPDATE login metadata

      const user = await login('test@example.com', 'password123');
      expect(user.id).toBe('usr_123');
    });

    it('should throw on non-existent email', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        login('nonexistent@example.com', 'password123')
      ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    });

    it('should throw on wrong password', async () => {
      const hashedPassword = await bcrypt.hash('correct', 4);
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...mockUser, password_hash: hashedPassword }],
      });

      await expect(
        login('test@example.com', 'wrong')
      ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    });

    it('should throw for OAuth-only accounts (no password_hash)', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...mockUser, password_hash: null, auth_provider: 'google' }],
      });

      await expect(
        login('test@example.com', 'anything')
      ).rejects.toMatchObject({ code: 'OAUTH_ONLY' });
    });

    it('should update login metadata on success', async () => {
      const hashedPassword = await bcrypt.hash('password123', 4);
      mockQuery
        .mockResolvedValueOnce({ rows: [{ ...mockUser, password_hash: hashedPassword }] })
        .mockResolvedValueOnce({ rows: [] });

      await login('test@example.com', 'password123');

      expect(mockQuery).toHaveBeenCalledTimes(2);
      expect(mockQuery.mock.calls[1][0]).toContain('UPDATE');
      expect(mockQuery.mock.calls[1][0]).toContain('last_login');
    });
  });

  // ----- findByEmail -----
  describe('findByEmail', () => {
    it('should return user when found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [mockUser] });
      const user = await findByEmail('test@example.com');
      expect(user).toEqual(mockUser);
    });

    it('should return null when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const user = await findByEmail('notfound@example.com');
      expect(user).toBeNull();
    });

    it('should lowercase email', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      await findByEmail('TEST@Example.COM');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        ['test@example.com']
      );
    });
  });

  // ----- findById -----
  describe('findById', () => {
    it('should return user when found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [mockUser] });
      const user = await findById('usr_123');
      expect(user).toEqual(mockUser);
    });

    it('should return null when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const user = await findById('usr_999');
      expect(user).toBeNull();
    });
  });

  // ----- findOrCreateOAuthUser -----
  describe('findOrCreateOAuthUser', () => {
    it('should return existing user by provider ID', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [mockUser] }) // Find by provider
        .mockResolvedValueOnce({ rows: [] }); // Update login metadata

      const user = await findOrCreateOAuthUser({
        email: 'test@example.com',
        provider: 'google',
        providerId: 'google-123',
      });

      expect(user.id).toBe('usr_123');
    });

    it('should link OAuth to existing email account', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] }) // Not found by provider
        .mockResolvedValueOnce({ rows: [mockUser] }) // Found by email
        .mockResolvedValueOnce({ rows: [] }); // UPDATE

      const user = await findOrCreateOAuthUser({
        email: 'test@example.com',
        provider: 'google',
        providerId: 'google-123',
      });

      expect(user.auth_provider).toBe('google');
    });

    it('should create new user if no match', async () => {
      const newUser = { ...mockUser, id: 'usr_new', auth_provider: 'github' };

      mockQuery
        .mockResolvedValueOnce({ rows: [] }) // Not found by provider
        .mockResolvedValueOnce({ rows: [] }) // Not found by email
        .mockResolvedValueOnce({ rows: [newUser] }) // INSERT
        .mockResolvedValueOnce({ rows: [] }) // Grant personal
        .mockResolvedValueOnce({ rows: [] }) // Grant work
        .mockResolvedValueOnce({ rows: [] }) // Grant learning
        .mockResolvedValueOnce({ rows: [] }); // Grant creative

      const user = await findOrCreateOAuthUser({
        email: 'new@example.com',
        provider: 'github',
        providerId: 'gh-456',
        displayName: 'New User',
        avatarUrl: 'https://example.com/avatar.png',
      });

      expect(user.id).toBe('usr_new');
      expect(mockQuery).toHaveBeenCalledTimes(7);
    });
  });

  // ----- updateProfile -----
  describe('updateProfile', () => {
    it('should update display_name', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ ...mockUser, display_name: 'New Name' }] });

      const user = await updateProfile('usr_123', { display_name: 'New Name' });
      expect(user.display_name).toBe('New Name');
      expect(mockQuery.mock.calls[0][0]).toContain('display_name');
    });

    it('should update multiple fields', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [mockUser] });

      await updateProfile('usr_123', {
        display_name: 'New',
        avatar_url: 'https://img.com/a.png',
        preferences: { theme: 'dark' },
      });

      const sql = mockQuery.mock.calls[0][0];
      expect(sql).toContain('display_name');
      expect(sql).toContain('avatar_url');
      expect(sql).toContain('preferences');
    });

    it('should return existing user if no fields provided', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [mockUser] });
      const user = await updateProfile('usr_123', {});
      expect(user).toEqual(mockUser);
    });

    it('should throw if user not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        updateProfile('usr_999', { display_name: 'X' })
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });
  });

  // ----- setMfaSecret -----
  describe('setMfaSecret', () => {
    it('should call UPDATE with secret', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      await setMfaSecret('usr_123', 'TOTP_SECRET');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('mfa_secret'),
        ['TOTP_SECRET', 'usr_123']
      );
    });
  });

  // ----- setMfaEnabled -----
  describe('setMfaEnabled', () => {
    it('should enable MFA', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      await setMfaEnabled('usr_123', true);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('mfa_enabled'),
        [true, 'usr_123']
      );
    });

    it('should disable MFA', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      await setMfaEnabled('usr_123', false);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('mfa_enabled'),
        [false, 'usr_123']
      );
    });
  });

  // ----- UserServiceError -----
  describe('UserServiceError', () => {
    it('should have correct properties', () => {
      const error = new UserServiceError('test', 'TEST_CODE', 409);
      expect(error.message).toBe('test');
      expect(error.code).toBe('TEST_CODE');
      expect(error.statusCode).toBe(409);
      expect(error.name).toBe('UserServiceError');
    });

    it('should default statusCode to 400', () => {
      const error = new UserServiceError('test', 'TEST');
      expect(error.statusCode).toBe(400);
    });
  });
});
