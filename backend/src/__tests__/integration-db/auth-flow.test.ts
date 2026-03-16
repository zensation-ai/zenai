/**
 * Phase 80: Authentication Flow Integration Test
 *
 * Tests the full auth lifecycle: register, login, token refresh, logout.
 * Uses supertest against the Express app with mocked services.
 */

import express, { Express } from 'express';
import request from 'supertest';
import { authRouter } from '../../routes/auth';
import { errorHandler } from '../../middleware/errorHandler';

// ============================================================
// Mocks
// ============================================================

const mockRegister = jest.fn();
const mockLogin = jest.fn();
const mockToUserProfile = jest.fn();

jest.mock('../../services/auth/user-service', () => {
  class _MockUserServiceError extends Error {
    statusCode: number;
    code: string;
    constructor(message: string, statusCode: number, code: string) {
      super(message);
      this.statusCode = statusCode;
      this.code = code;
    }
  }
  return {
    register: (...args: any[]) => mockRegister(...args),
    login: (...args: any[]) => mockLogin(...args),
    toUserProfile: (...args: any[]) => mockToUserProfile(...args),
    UserServiceError: _MockUserServiceError,
  };
});

const mockGenerateTokenPair = jest.fn();
const mockRefreshTokens = jest.fn();

jest.mock('../../services/auth/jwt-service', () => {
  class _MockJwtError extends Error {
    statusCode: number;
    code: string;
    constructor(message: string, statusCode: number, code: string) {
      super(message);
      this.statusCode = statusCode;
      this.code = code;
    }
  }
  return {
    generateTokenPair: (...args: any[]) => mockGenerateTokenPair(...args),
    refreshTokens: (...args: any[]) => mockRefreshTokens(...args),
    JwtError: _MockJwtError,
  };
});

jest.mock('../../services/auth/oauth-providers', () => ({
  oauthManager: {
    getAuthUrl: jest.fn(),
    handleCallback: jest.fn(),
  },
}));

jest.mock('../../services/auth/session-store', () => ({
  sessionStore: {
    createSession: jest.fn(),
    getSession: jest.fn(),
    deleteSession: jest.fn(),
    getUserSessions: jest.fn().mockResolvedValue([]),
    findByRefreshTokenHash: jest.fn().mockResolvedValue(null),
    revokeSession: jest.fn(),
    revokeAllUserSessions: jest.fn(),
  },
}));

jest.mock('../../services/security/field-encryption', () => ({
  decrypt: jest.fn((val: string) => val),
}));

jest.mock('../../middleware/jwt-auth', () => ({
  requireJwt: jest.fn((_req: any, _res: any, next: any) => {
    _req.jwtUser = { id: 'test-user-id', email: 'test@example.com' };
    next();
  }),
}));

jest.mock('../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('otplib', () => ({
  authenticator: {
    generateSecret: jest.fn().mockReturnValue('JBSWY3DPEHPK3PXP'),
    verify: jest.fn().mockReturnValue(true),
    keyuri: jest.fn().mockReturnValue('otpauth://totp/ZenAI:test@example.com?secret=JBSWY3DPEHPK3PXP'),
  },
}));

jest.mock('qrcode', () => ({
  toDataURL: jest.fn().mockResolvedValue('data:image/png;base64,mockQR'),
}));

// ============================================================
// Test Data
// ============================================================

const TEST_USER = {
  id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  email: 'test@example.com',
  display_name: 'Test User',
  password_hash: '$2b$12$hashedpassword',
  mfa_enabled: false,
  mfa_secret: null,
  created_at: new Date().toISOString(),
};

const TEST_TOKENS = {
  accessToken: 'eyJ.mock.access-token',
  refreshToken: 'eyJ.mock.refresh-token',
  expiresIn: 900,
};

// ============================================================
// Tests
// ============================================================

describe('Auth Flow Integration Tests', () => {
  let app: Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/auth', authRouter);
    app.use(errorHandler);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Registration', () => {
    it('should register a new user with valid data', async () => {
      mockRegister.mockResolvedValue(TEST_USER);
      mockGenerateTokenPair.mockResolvedValue(TEST_TOKENS);
      mockToUserProfile.mockReturnValue({
        id: TEST_USER.id,
        email: TEST_USER.email,
        display_name: TEST_USER.display_name,
      });

      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'new@example.com',
          password: 'SecurePass123!',
          display_name: 'New User',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('accessToken');
      expect(res.body.data).toHaveProperty('refreshToken');
      expect(res.body.data).toHaveProperty('user');
    });

    it('should reject registration without email', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ password: 'SecurePass123!' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should reject registration without password', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'test@example.com' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should handle duplicate email gracefully', async () => {
      const { UserServiceError } = jest.requireMock('../../services/auth/user-service');
      mockRegister.mockRejectedValue(new UserServiceError('Email already registered', 409, 'DUPLICATE_EMAIL'));

      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'existing@example.com', password: 'Pass123!' });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
    });
  });

  describe('Login', () => {
    it('should login with valid credentials', async () => {
      mockLogin.mockResolvedValue(TEST_USER);
      mockGenerateTokenPair.mockResolvedValue(TEST_TOKENS);
      mockToUserProfile.mockReturnValue({
        id: TEST_USER.id,
        email: TEST_USER.email,
      });

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@example.com', password: 'correct-password' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('accessToken');
    });

    it('should reject login without credentials', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({});

      expect(res.status).toBe(400);
    });

    it('should reject invalid credentials', async () => {
      const { UserServiceError } = jest.requireMock('../../services/auth/user-service');
      mockLogin.mockRejectedValue(new UserServiceError('Invalid credentials', 401, 'INVALID_CREDENTIALS'));

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'wrong@example.com', password: 'wrong' });

      expect(res.status).toBe(401);
    });
  });

  describe('Token Refresh', () => {
    it('should refresh tokens with valid refresh token', async () => {
      mockRefreshTokens.mockResolvedValue({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
        expiresIn: 900,
      });

      const res = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: 'valid-refresh-token' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('accessToken');
    });

    it('should reject refresh without token', async () => {
      const res = await request(app)
        .post('/api/auth/refresh')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should reject expired refresh token', async () => {
      const { JwtError } = jest.requireMock('../../services/auth/jwt-service');
      mockRefreshTokens.mockRejectedValue(new JwtError('Token expired', 401, 'TOKEN_EXPIRED'));

      const res = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: 'expired-token' });

      expect(res.status).toBe(401);
    });
  });

  describe('Logout', () => {
    it('should logout successfully', async () => {
      // requireJwt mock sets req.jwtUser
      const { sessionStore } = jest.requireMock('../../services/auth/session-store');
      sessionStore.findByRefreshTokenHash.mockResolvedValue(null);

      const res = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', 'Bearer mock-jwt')
        .send({ refreshToken: 'token-to-revoke' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should logout without refresh token (revokes all sessions)', async () => {
      const { sessionStore } = jest.requireMock('../../services/auth/session-store');
      sessionStore.revokeAllUserSessions.mockResolvedValue(undefined);

      const res = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', 'Bearer mock-jwt')
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('Response format compliance', () => {
    it('should always return { success: boolean } in response', async () => {
      // Registration with missing fields
      let res = await request(app).post('/api/auth/register').send({});
      expect(res.body).toHaveProperty('success');
      expect(typeof res.body.success).toBe('boolean');

      // Login with missing fields
      res = await request(app).post('/api/auth/login').send({});
      expect(res.body).toHaveProperty('success');
      expect(typeof res.body.success).toBe('boolean');

      // Refresh with missing token
      res = await request(app).post('/api/auth/refresh').send({});
      expect(res.body).toHaveProperty('success');
      expect(typeof res.body.success).toBe('boolean');
    });
  });
});
