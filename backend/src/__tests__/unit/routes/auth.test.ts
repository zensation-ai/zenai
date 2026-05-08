/**
 * Auth Route Tests
 */

import express from 'express';
import request from 'supertest';

const mockRegister = jest.fn();
const mockLogin = jest.fn();
const mockFindById = jest.fn();
const mockUpdateProfile = jest.fn();
const mockMarkOnboardingComplete = jest.fn();
const mockMarkConsentBannerShown = jest.fn();
const mockSetConsent = jest.fn();
const mockToUserProfile = jest.fn((u: Record<string, unknown>) => ({
  id: u.id,
  email: u.email,
  display_name: u.display_name,
  onboarding_completed_at: u.onboarding_completed_at ?? null,
}));
const mockGenerateTokenPair = jest.fn();
const mockRefreshTokens = jest.fn();

jest.mock('../../../services/security/rate-limit-advanced', () => ({
  createEndpointLimiter: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

jest.mock('../../../middleware/jwt-auth', () => ({
  requireJwt: (_req: unknown, _res: unknown, next: () => void) => {
    (_req as Record<string, unknown>).jwtUser = { id: 'user-123', email: 'test@example.com' };
    next();
  },
}));

jest.mock('../../../utils/logger', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('../../../services/auth/user-service', () => {
  // Must define class inside factory to avoid hoisting issues
  class UserServiceError extends Error {
    statusCode: number;
    code: string;
    constructor(msg: string, statusCode: number, code: string) {
      super(msg);
      this.statusCode = statusCode;
      this.code = code;
    }
  }
  return {
    register: (...args: unknown[]) => mockRegister(...args),
    login: (...args: unknown[]) => mockLogin(...args),
    findById: (...args: unknown[]) => mockFindById(...args),
    updateProfile: (...args: unknown[]) => mockUpdateProfile(...args),
    markOnboardingComplete: (...args: unknown[]) => mockMarkOnboardingComplete(...args),
    markConsentBannerShown: (...args: unknown[]) => mockMarkConsentBannerShown(...args),
    toUserProfile: (...args: unknown[]) => mockToUserProfile(...args),
    findOrCreateOAuthUser: (...args: unknown[]) => mockFindOrCreateOAuthUser(...args),
    UserServiceError,
  };
});

jest.mock('../../../services/auth/jwt-service', () => {
  class JwtError extends Error {
    statusCode: number;
    code: string;
    constructor(msg: string, statusCode: number, code: string) {
      super(msg);
      this.statusCode = statusCode;
      this.code = code;
    }
  }
  return {
    generateTokenPair: (...args: unknown[]) => mockGenerateTokenPair(...args),
    refreshTokens: (...args: unknown[]) => mockRefreshTokens(...args),
    JwtError,
  };
});

const mockHandleAppleCallback = jest.fn();
const mockFindOrCreateOAuthUser = jest.fn();

jest.mock('../../../services/auth/oauth-providers', () => ({
  oauthManager: {
    getAvailableProviders: jest.fn(() => ['google', 'apple']),
    isProviderAvailable: jest.fn(() => true),
    getAuthorizationUrl: jest.fn(() => ({ url: 'https://oauth.test/auth', state: 'abc' })),
    handleAppleCallback: (...args: unknown[]) => mockHandleAppleCallback(...args),
  },
}));

jest.mock('../../../services/auth/session-store', () => ({
  sessionStore: {
    findByRefreshTokenHash: jest.fn().mockResolvedValue(null),
    revokeSession: jest.fn(),
    revokeAllUserSessions: jest.fn(),
  },
}));

jest.mock('../../../services/security/field-encryption', () => ({
  decrypt: jest.fn((v: string) => v),
}));

jest.mock('otplib', () => ({
  authenticator: { verify: jest.fn(() => true) },
}));

jest.mock('qrcode', () => ({
  toDataURL: jest.fn().mockResolvedValue('data:image/png;base64,abc'),
}));

jest.mock('../../../services/auth/consent-service', () => {
  const CONSENT_KINDS = [
    'cookies_functional',
    'cookies_analytics',
    'ai_training_opt_out',
    'analytics_tracking',
    'functional_tracking',
  ] as const;
  return {
    CONSENT_KINDS,
    isConsentKind: (v: unknown) => typeof v === 'string' && (CONSENT_KINDS as readonly string[]).includes(v),
    getConsentState: jest.fn(),
    setConsent: (...args: unknown[]) => mockSetConsent(...args),
    revokeConsent: jest.fn(),
    getConsentHistory: jest.fn().mockResolvedValue([]),
  };
});

import { authRouter } from '../../../routes/auth';
import { errorHandler } from '../../../middleware/errorHandler';

// Import the mocked module to get access to the class
 
const { UserServiceError } = require('../../../services/auth/user-service');
 
const { JwtError } = require('../../../services/auth/jwt-service');

describe('Auth Routes', () => {
  let app: express.Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/auth', authRouter);
    app.use(errorHandler);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ---- Registration ----

  describe('POST /api/auth/register', () => {
    it('should register a new user successfully', async () => {
      const mockUser = { id: 'u1', email: 'new@test.com', display_name: 'New User' };
      mockRegister.mockResolvedValueOnce(mockUser);
      mockGenerateTokenPair.mockResolvedValueOnce({
        accessToken: 'at-123',
        refreshToken: 'rt-123',
      });

      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'new@test.com', password: 'secret123', display_name: 'New User' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.accessToken).toBe('at-123');
      expect(mockRegister).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'new@test.com', password: 'secret123' })
      );
    });

    it('should return 400 if email is missing', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ password: 'secret123' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 if password is missing', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'test@test.com' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should return error when user already exists', async () => {
      mockRegister.mockRejectedValueOnce(
        new UserServiceError('User already exists', 409, 'USER_EXISTS')
      );

      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'dup@test.com', password: 'secret123' });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('USER_EXISTS');
    });
  });

  // ---- Login ----

  describe('POST /api/auth/login', () => {
    it('should login successfully', async () => {
      const mockUser = { id: 'u1', email: 'test@test.com', mfa_enabled: false };
      mockLogin.mockResolvedValueOnce(mockUser);
      mockGenerateTokenPair.mockResolvedValueOnce({
        accessToken: 'at-456',
        refreshToken: 'rt-456',
      });

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@test.com', password: 'password' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.accessToken).toBe('at-456');
    });

    it('should return 400 if credentials missing', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('should return mfa_required when MFA is enabled without code', async () => {
      const mockUser = { id: 'u1', email: 'test@test.com', mfa_enabled: true, mfa_secret: 'secret' };
      mockLogin.mockResolvedValueOnce(mockUser);

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@test.com', password: 'password' });

      expect(res.status).toBe(200);
      expect(res.body.data.mfa_required).toBe(true);
    });
  });

  // ---- Refresh ----

  describe('POST /api/auth/refresh', () => {
    it('should refresh tokens successfully', async () => {
      mockRefreshTokens.mockResolvedValueOnce({
        accessToken: 'at-new',
        refreshToken: 'rt-new',
      });

      const res = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: 'rt-old' });

      expect(res.status).toBe(200);
      expect(res.body.data.accessToken).toBe('at-new');
    });

    it('should return 400 if refreshToken missing', async () => {
      const res = await request(app)
        .post('/api/auth/refresh')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('should return error on invalid refresh token', async () => {
      mockRefreshTokens.mockRejectedValueOnce(
        new JwtError('Invalid refresh token', 401, 'INVALID_TOKEN')
      );

      const res = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: 'invalid' });

      expect(res.status).toBe(401);
      expect(res.body.code).toBe('INVALID_TOKEN');
    });
  });

  // ---- Logout ----

  describe('POST /api/auth/logout', () => {
    it('should logout successfully', async () => {
      const res = await request(app)
        .post('/api/auth/logout')
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // ---- Profile ----

  describe('GET /api/auth/me', () => {
    it('should return user profile', async () => {
      mockFindById.mockResolvedValueOnce({ id: 'user-123', email: 'test@example.com', display_name: 'Test' });

      const res = await request(app).get('/api/auth/me');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
    });

    it('should return 404 if user not found', async () => {
      mockFindById.mockResolvedValueOnce(null);

      const res = await request(app).get('/api/auth/me');

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');
    });
  });

  describe('PUT /api/auth/me', () => {
    it('should update user profile', async () => {
      mockUpdateProfile.mockResolvedValueOnce({
        id: 'user-123',
        email: 'test@example.com',
        display_name: 'Updated',
      });

      const res = await request(app)
        .put('/api/auth/me')
        .send({ display_name: 'Updated' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // ---- Onboarding (Sprint 1.6) ----

  describe('POST /api/auth/onboarding/complete', () => {
    it('returns the persisted onboarding_completed_at timestamp', async () => {
      const now = '2026-04-19T12:34:56Z';
      mockMarkOnboardingComplete.mockResolvedValueOnce(now);

      const res = await request(app).post('/api/auth/onboarding/complete');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual({ onboarding_completed_at: now });
      expect(mockMarkOnboardingComplete).toHaveBeenCalledWith('user-123');
    });

    it('is idempotent — a second call returns the original timestamp', async () => {
      const first = '2026-04-19T12:00:00Z';
      mockMarkOnboardingComplete.mockResolvedValue(first);

      const r1 = await request(app).post('/api/auth/onboarding/complete');
      const r2 = await request(app).post('/api/auth/onboarding/complete');

      expect(r1.body.data.onboarding_completed_at).toBe(first);
      expect(r2.body.data.onboarding_completed_at).toBe(first);
    });

    it('surfaces UserServiceError (404) when user no longer exists', async () => {
      mockMarkOnboardingComplete.mockRejectedValueOnce(
        new UserServiceError('User not found', 404, 'NOT_FOUND'),
      );

      const res = await request(app).post('/api/auth/onboarding/complete');

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');
    });
  });

  // ---- Providers ----

  describe('GET /api/auth/providers', () => {
    it('should list available providers', async () => {
      const res = await request(app).get('/api/auth/providers');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toContain('google');
    });

    it('should include apple in provider list when configured', async () => {
      const res = await request(app).get('/api/auth/providers');

      expect(res.status).toBe(200);
      expect(res.body.data).toContain('apple');
    });
  });

  // ---- Apple Sign In ----

  describe('POST /api/auth/callback/apple', () => {
    const mockUser = { id: 'u-apple', email: 'user@apple.com', display_name: 'Apple User' };

    it('should complete Apple Sign In and redirect to frontend', async () => {
      mockHandleAppleCallback.mockResolvedValueOnce({
        email: 'user@apple.com',
        name: 'Apple User',
        avatarUrl: null,
        providerId: 'apple-sub-123',
      });
      mockFindOrCreateOAuthUser.mockResolvedValueOnce(mockUser);
      mockGenerateTokenPair.mockResolvedValueOnce({
        accessToken: 'at-apple',
        refreshToken: 'rt-apple',
        expiresIn: 900,
      });

      const res = await request(app)
        .post('/api/auth/callback/apple')
        .send({ code: 'auth-code', state: 'state-abc' });

      expect(res.status).toBe(302);
      expect(res.header.location).toContain('/auth/callback#');
      expect(res.header.location).toContain('accessToken=at-apple');
      expect(mockHandleAppleCallback).toHaveBeenCalledWith('auth-code', 'state-abc', undefined);
    });

    it('should pass user JSON to handleAppleCallback on first login', async () => {
      mockHandleAppleCallback.mockResolvedValueOnce({
        email: 'first@apple.com',
        name: 'First User',
        avatarUrl: null,
        providerId: 'apple-sub-456',
      });
      mockFindOrCreateOAuthUser.mockResolvedValueOnce(mockUser);
      mockGenerateTokenPair.mockResolvedValueOnce({ accessToken: 'at-2', refreshToken: 'rt-2', expiresIn: 900 });

      const userJson = JSON.stringify({ name: { firstName: 'First', lastName: 'User' } });

      await request(app)
        .post('/api/auth/callback/apple')
        .send({ code: 'auth-code-2', state: 'state-xyz', user: userJson });

      expect(mockHandleAppleCallback).toHaveBeenCalledWith('auth-code-2', 'state-xyz', userJson);
    });

    it('should return 400 if code is missing', async () => {
      const res = await request(app)
        .post('/api/auth/callback/apple')
        .send({ state: 'state-abc' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 if state is missing', async () => {
      const res = await request(app)
        .post('/api/auth/callback/apple')
        .send({ code: 'auth-code' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('should redirect to frontend error page on Apple oauth error', async () => {
      const res = await request(app)
        .post('/api/auth/callback/apple')
        .send({ error: 'user_cancelled_authorize' });

      expect(res.status).toBe(302);
      expect(res.header.location).toContain('/auth?error=');
    });

    it('should return 400 on invalid OAuth state', async () => {
      mockHandleAppleCallback.mockRejectedValueOnce(
        Object.assign(new Error('Invalid or expired OAuth state'), { code: 'INVALID_STATE', statusCode: 400 })
      );

      const res = await request(app)
        .post('/api/auth/callback/apple')
        .send({ code: 'code', state: 'bad-state' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_STATE');
    });
  });

  // ---- Sprint 1.10: Consent Banner ----

  describe('POST /api/auth/consent/banner-complete', () => {
    const validBody = {
      cookies_analytics: true,
      ai_training_opt_out: false,
      analytics_tracking: true,
      functional_tracking: false,
    };

    beforeEach(() => {
      mockSetConsent.mockResolvedValue({ id: 'consent-1', granted: true });
      mockMarkConsentBannerShown.mockResolvedValue('2026-04-19T12:00:00Z');
    });

    it('writes 5 consents (4 togglable + cookies_functional) and stamps timestamp', async () => {
      const res = await request(app)
        .post('/api/auth/consent/banner-complete')
        .send(validBody);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.consent_banner_shown_at).toBe('2026-04-19T12:00:00Z');

      expect(mockSetConsent).toHaveBeenCalledTimes(5);
      // cookies_functional is always granted=true
      const functionalCall = mockSetConsent.mock.calls.find(
        ([arg]) => (arg as { kind: string }).kind === 'cookies_functional',
      );
      expect(functionalCall?.[0]).toMatchObject({
        kind: 'cookies_functional',
        granted: true,
        source: 'signup',
      });
      expect(mockMarkConsentBannerShown).toHaveBeenCalledWith('user-123');
    });

    it('returns 400 when a togglable kind is not a boolean', async () => {
      const res = await request(app)
        .post('/api/auth/consent/banner-complete')
        .send({ ...validBody, analytics_tracking: 'yes' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(mockSetConsent).not.toHaveBeenCalled();
      expect(mockMarkConsentBannerShown).not.toHaveBeenCalled();
    });

    it('returns 400 when a togglable kind is missing', async () => {
      const incomplete = { ...validBody } as Partial<typeof validBody>;
      delete incomplete.cookies_analytics;

      const res = await request(app)
        .post('/api/auth/consent/banner-complete')
        .send(incomplete);

      expect(res.status).toBe(400);
      expect(mockSetConsent).not.toHaveBeenCalled();
    });

    it('double-submit is a no-op (markConsentBannerShown is idempotent by design)', async () => {
      // Simulate idempotent service: second call returns the original timestamp
      mockMarkConsentBannerShown
        .mockResolvedValueOnce('2026-04-19T12:00:00Z')
        .mockResolvedValueOnce('2026-04-19T12:00:00Z');

      const first = await request(app)
        .post('/api/auth/consent/banner-complete')
        .send(validBody);
      const second = await request(app)
        .post('/api/auth/consent/banner-complete')
        .send(validBody);

      expect(first.body.data.consent_banner_shown_at).toBe(
        second.body.data.consent_banner_shown_at,
      );
      // Both calls ran through setConsent (service handles idempotency)
      expect(mockSetConsent).toHaveBeenCalledTimes(10);
    });
  });
});
