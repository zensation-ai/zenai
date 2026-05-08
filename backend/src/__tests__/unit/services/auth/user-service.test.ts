/**
 * Phase 56: User Service Unit Tests
 */

import bcrypt from 'bcrypt';

// Mock database — Sprint 1.1 (2026-04-16): also stubs queryContext + withTransaction
// for deleteUserCascade(), which runs schema-isolated DELETEs across all 4 contexts.
const mockQuery = jest.fn();
const mockQueryContext = jest.fn();
const mockWithTransaction = jest.fn(async (_ctx: string, fn: (q: unknown) => Promise<unknown>) =>
  fn(async () => ({ rows: [], rowCount: 0 })),
);
jest.mock('../../../../utils/database-context', () => ({
  queryPublic: (...args: unknown[]) => mockQuery(...args),
  queryContext: (...args: unknown[]) => mockQueryContext(...args),
  withTransaction: (...args: unknown[]) => mockWithTransaction(...(args as [string, (q: unknown) => Promise<unknown>])),
}));

// Stub auxiliary cascade dependencies so the test focuses on SQL behavior.
jest.mock('../../../../services/auth/session-store', () => ({
  sessionStore: { revokeAllUserSessions: jest.fn().mockResolvedValue(undefined) },
}));
jest.mock('../../../../utils/cache', () => ({
  cache: {
    isAvailable: () => false,
    delPattern: jest.fn().mockResolvedValue(0),
  },
}));
jest.mock('../../../../services/observability/sentry', () => ({
  setUser: jest.fn(),
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
  deleteUserCascade,
  markOnboardingComplete,
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
      expect(contexts).toEqual(['operations', 'finance', 'people', 'strategy']);
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

  // ----- deleteUserCascade (Sprint 1.1, DSGVO Art. 17) -----
  describe('deleteUserCascade', () => {
    beforeEach(() => {
      mockQueryContext.mockReset();
      mockWithTransaction.mockReset();
      mockWithTransaction.mockImplementation(async (_ctx: string, fn: (q: unknown) => Promise<unknown>) =>
        fn(async () => ({ rows: [], rowCount: 0 })),
      );
    });

    it('returns existed=false and skips deletes when user not found (idempotent)', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] }); // SELECT id from users → empty

      const result = await deleteUserCascade('missing-user');

      expect(result.existed).toBe(false);
      expect(result.userId).toBe('missing-user');
      expect(result.rowsDeletedPublic).toBe(0);
      // No further queries should run for the missing user.
      expect(mockQueryContext).not.toHaveBeenCalled();
    });

    it('iterates all 4 contexts and deletes from public.users when user exists', async () => {
      // 1) SELECT id (existence check) — returns the user.
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'usr_123' }] });
      // 2..N) public-table deletes (10 default tables) + final users delete.
      // We just resolve every public-schema call with rowCount=1 except the 'tables not present' ones.
      mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });
      // queryContext: information_schema lookup returns one table per context for simplicity.
      mockQueryContext.mockResolvedValue({ rows: [{ table_name: 'memory' }] });

      const result = await deleteUserCascade('usr_123');

      expect(result.existed).toBe(true);
      // All 4 contexts must be visited at least for the information_schema lookup.
      const contextsLookedUp = mockQueryContext.mock.calls
        .map(call => call[0] as string)
        .filter(ctx => ['operations', 'finance', 'people', 'strategy'].includes(ctx));
      expect(new Set(contextsLookedUp)).toEqual(
        new Set(['operations', 'finance', 'people', 'strategy']),
      );
      // withTransaction was invoked once per context (4 times).
      expect(mockWithTransaction).toHaveBeenCalledTimes(4);
      // Final public.users DELETE happened.
      const userDeleteCalls = mockQuery.mock.calls.filter(call =>
        typeof call[0] === 'string' && call[0].includes('DELETE FROM public.users'),
      );
      expect(userDeleteCalls.length).toBeGreaterThan(0);
    });
  });

  // ----- markOnboardingComplete (Sprint 1.6) -----
  describe('markOnboardingComplete', () => {
    it('should set onboarding_completed_at via COALESCE and return timestamp', async () => {
      const now = '2026-04-19T10:00:00Z';
      mockQuery.mockResolvedValueOnce({
        rows: [{ onboarding_completed_at: now }],
      });

      const result = await markOnboardingComplete('usr_123');

      expect(result).toBe(now);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('COALESCE(onboarding_completed_at, NOW())'),
        ['usr_123'],
      );
    });

    it('should be idempotent — returns preexisting timestamp when already onboarded', async () => {
      const existing = '2026-04-01T08:30:00Z';
      mockQuery.mockResolvedValueOnce({
        rows: [{ onboarding_completed_at: existing }],
      });

      const result = await markOnboardingComplete('usr_123');

      expect(result).toBe(existing);
      // COALESCE keeps the earlier value — function is safe to call repeatedly.
    });

    it('should throw UserServiceError(404) when user does not exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(markOnboardingComplete('missing')).rejects.toMatchObject({
        name: 'UserServiceError',
        code: 'NOT_FOUND',
        statusCode: 404,
      });
    });
  });

  // ----- toUserProfile onboarding_completed_at (Sprint 1.6) -----
  describe('toUserProfile — onboarding_completed_at', () => {
    it('exposes onboarding_completed_at when set', () => {
      const profile = toUserProfile({
        ...mockUser,
        onboarding_completed_at: '2026-04-19T12:00:00Z',
      });
      expect(profile.onboarding_completed_at).toBe('2026-04-19T12:00:00Z');
    });

    it('defaults onboarding_completed_at to null when not set', () => {
      const profile = toUserProfile({ ...mockUser, onboarding_completed_at: null });
      expect(profile.onboarding_completed_at).toBeNull();
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
