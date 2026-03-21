/**
 * API Keys Route Tests
 */

import express from 'express';
import request from 'supertest';

jest.mock('../../../middleware/auth', () => ({
  apiKeyAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireScope: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  generateApiKey: jest.fn().mockResolvedValue({
    key: 'zenai_test_abcdef1234567890',
    prefix: 'zenai_test_abc',
    hash: 'hashedvalue123',
  }),
}));

jest.mock('../../../utils/logger', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const mockPoolQuery = jest.fn();
jest.mock('../../../utils/database', () => ({
  pool: { query: (...args: unknown[]) => mockPoolQuery(...args) },
}));

jest.mock('../../../utils/database-context', () => ({
  isValidUUID: jest.fn((id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)),
}));

jest.mock('../../../services/api-key-security', () => ({
  getExpiringKeys: jest.fn().mockResolvedValue([]),
  getExpiredKeys: jest.fn().mockResolvedValue([]),
  getUnusedKeys: jest.fn().mockResolvedValue([]),
  getKeySecuritySummary: jest.fn().mockResolvedValue({ total: 0 }),
  extendKeyExpiry: jest.fn().mockResolvedValue(true),
}));

jest.mock('../../../services/audit-logger', () => ({
  auditLogger: {
    logApiKeyAction: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('../../../utils/validation', () => ({
  toIntBounded: jest.fn((val: string, def: number) => parseInt(val, 10) || def),
}));

import { apiKeysRouter } from '../../../routes/api-keys';
import { errorHandler } from '../../../middleware/errorHandler';

describe('API Keys Routes', () => {
  let app: express.Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/keys', apiKeysRouter);
    app.use(errorHandler);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockPoolQuery.mockReset();
  });

  // ---- Create ----

  describe('POST /api/keys', () => {
    it('should create a new API key', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const res = await request(app)
        .post('/api/keys')
        .send({ name: 'Test Key', scopes: ['read', 'write'] });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.apiKey).toBeDefined();
      expect(res.body.apiKey.name).toBe('Test Key');
      expect(res.body.apiKey.key).toBeDefined();
    });

    it('should return error for missing name', async () => {
      const res = await request(app)
        .post('/api/keys')
        .send({});

      expect(res.status).toBe(400);
    });

    it('should return error for invalid scopes', async () => {
      const res = await request(app)
        .post('/api/keys')
        .send({ name: 'Test', scopes: ['invalid_scope'] });

      expect(res.status).toBe(400);
    });

    it('should default scopes to read when not provided', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const res = await request(app)
        .post('/api/keys')
        .send({ name: 'Default Scope Key' });

      expect(res.status).toBe(201);
      expect(res.body.apiKey.scopes).toEqual(['read']);
    });
  });

  // ---- List ----

  describe('GET /api/keys', () => {
    it('should list all API keys', async () => {
      mockPoolQuery.mockResolvedValueOnce({
        rows: [
          {
            id: '550e8400-e29b-41d4-a716-446655440000',
            name: 'Key 1',
            scopes: ['read'],
            rate_limit: 1000,
            expires_at: null,
            last_used_at: null,
            created_at: '2026-01-01T00:00:00Z',
            is_active: true,
          },
        ],
      });

      const res = await request(app).get('/api/keys');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.count).toBe(1);
      expect(res.body.apiKeys[0].name).toBe('Key 1');
    });

    it('should return empty list when no keys exist', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).get('/api/keys');

      expect(res.status).toBe(200);
      expect(res.body.count).toBe(0);
    });
  });

  // ---- Get by ID ----

  describe('GET /api/keys/:id', () => {
    it('should return a specific API key', async () => {
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{
          id: '550e8400-e29b-41d4-a716-446655440000',
          name: 'My Key',
          scopes: ['read', 'write'],
          rate_limit: 500,
          expires_at: null,
          last_used_at: null,
          created_at: '2026-01-01T00:00:00Z',
          is_active: true,
        }],
      });

      const res = await request(app).get('/api/keys/550e8400-e29b-41d4-a716-446655440000');

      expect(res.status).toBe(200);
      expect(res.body.apiKey.name).toBe('My Key');
    });

    it('should return 404 for non-existent key', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).get('/api/keys/550e8400-e29b-41d4-a716-446655440000');

      expect(res.status).toBe(404);
    });

    it('should return 400 for invalid UUID', async () => {
      const res = await request(app).get('/api/keys/not-a-uuid');

      expect(res.status).toBe(400);
    });
  });

  // ---- Revoke ----

  describe('DELETE /api/keys/:id', () => {
    it('should revoke (deactivate) an API key', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ id: '550e8400-e29b-41d4-a716-446655440000' }], rowCount: 1 });

      const res = await request(app).delete('/api/keys/550e8400-e29b-41d4-a716-446655440000');

      expect([200, 204]).toContain(res.status);
    });
  });
});
