import express from 'express';
import request from 'supertest';
import { errorHandler } from '../../../middleware/errorHandler';

jest.mock('../../../services/auth/google-oauth-tokens', () => ({
  createGoogleToken: jest.fn(),
  getGoogleTokensForUser: jest.fn(),
  deleteGoogleToken: jest.fn(),
  getGoogleToken: jest.fn(),
}));

jest.mock('../../../utils/database', () => ({
  pool: { query: jest.fn() },
}));

jest.mock('../../../utils/database-context', () => ({
  queryContext: jest.fn(),
  isValidContext: jest.fn(() => true),
}));

jest.mock('../../../utils/user-context', () => ({
  getUserId: jest.fn(() => 'user-1'),
  SYSTEM_USER_ID: '00000000-0000-0000-0000-000000000001',
}));

jest.mock('../../../middleware/jwt-auth', () => ({
  jwtAuth: (_req: unknown, _res: unknown, next: () => void) => {
    (_req as Record<string, unknown>).jwtUser = { id: 'user-1', email: 'user@test.com' };
    next();
  },
}));

import { getGoogleTokensForUser, deleteGoogleToken } from '../../../services/auth/google-oauth-tokens';
import { pool } from '../../../utils/database';

const mockGetTokens = getGoogleTokensForUser as jest.Mock;
const mockDeleteToken = deleteGoogleToken as jest.Mock;
const mockPoolQuery = pool.query as jest.Mock;

let app: express.Application;

beforeAll(async () => {
  process.env.GOOGLE_CLIENT_ID = 'test-client-id';
  process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';

  const { googleOAuthRouter } = await import('../../../routes/google-oauth');
  app = express();
  app.use(express.json());
  // Simulate JWT auth
  app.use((req, _res, next) => {
    (req as any).jwtUser = { id: 'user-1', email: 'user@test.com' };
    next();
  });
  app.use('/api/auth/oauth/google', googleOAuthRouter);
  app.use(errorHandler);
});

describe('Google OAuth Routes', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('POST /connect', () => {
    it('should return authorization URL', async () => {
      // Mock state insertion
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .post('/api/auth/oauth/google/connect')
        .send({ context: 'personal' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.url).toContain('accounts.google.com');
      expect(res.body.data.state).toBeDefined();
    });

    it('should return 503 when Google OAuth not configured', async () => {
      const origId = process.env.GOOGLE_CLIENT_ID;
      delete process.env.GOOGLE_CLIENT_ID;

      const res = await request(app)
        .post('/api/auth/oauth/google/connect')
        .send({ context: 'personal' });

      expect(res.status).toBe(503);
      process.env.GOOGLE_CLIENT_ID = origId;
    });
  });

  describe('GET /tokens', () => {
    it('should list user tokens without sensitive fields', async () => {
      mockGetTokens.mockResolvedValue([
        { id: 't1', google_email: 'a@gmail.com', access_token: 'secret', refresh_token: 'secret', scopes: ['gmail.modify'], expires_at: '2026-03-22T12:00:00Z', created_at: '2026-03-22T11:00:00Z' },
      ]);

      const res = await request(app)
        .get('/api/auth/oauth/google/tokens');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].google_email).toBe('a@gmail.com');
      expect(res.body.data[0].access_token).toBeUndefined();
      expect(res.body.data[0].refresh_token).toBeUndefined();
    });
  });

  describe('DELETE /disconnect/:tokenId', () => {
    it('should delete token', async () => {
      mockDeleteToken.mockResolvedValue(undefined);
      const { queryContext } = require('../../../utils/database-context');
      (queryContext as jest.Mock).mockResolvedValue({ rows: [] });

      const res = await request(app)
        .delete('/api/auth/oauth/google/disconnect/token-1');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockDeleteToken).toHaveBeenCalledWith('token-1');
    });
  });
});
