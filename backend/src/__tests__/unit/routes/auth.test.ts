/**
 * Auth Route Tests
 */

import express from 'express';
import request from 'supertest';

const mockRegister = jest.fn();
const mockLogin = jest.fn();
const mockFindById = jest.fn();
const mockUpdateProfile = jest.fn();
const mockToUserProfile = jest.fn((u: Record<string, unknown>) => ({
  id: u.id,
  email: u.email,
  display_name: u.display_name,
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
    toUserProfile: (...args: unknown[]) => mockToUserProfile(...args),
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

jest.mock('../../../services/auth/oauth-providers', () => ({
  oauthManager: {
    getAvailableProviders: jest.fn(() => ['google']),
    isProviderAvailable: jest.fn(() => true),
    getAuthorizationUrl: jest.fn(() => ({ url: 'https://oauth.test/auth', state: 'abc' })),
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

  // ---- Providers ----

  describe('GET /api/auth/providers', () => {
    it('should list available providers', async () => {
      const res = await request(app).get('/api/auth/providers');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toContain('google');
    });
  });
});
