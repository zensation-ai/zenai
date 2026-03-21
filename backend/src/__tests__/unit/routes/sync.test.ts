/**
 * Sync Route Tests
 */

import express from 'express';
import request from 'supertest';

jest.mock('../../../middleware/auth', () => ({
  apiKeyAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireScope: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

jest.mock('../../../utils/user-context', () => ({
  getUserId: jest.fn(() => '00000000-0000-0000-0000-000000000001'),
  SYSTEM_USER_ID: '00000000-0000-0000-0000-000000000001',
}));

jest.mock('../../../utils/logger', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const mockQueryContext = jest.fn();
jest.mock('../../../utils/database-context', () => ({
  queryContext: (...args: unknown[]) => mockQueryContext(...args),
  isValidContext: jest.fn((ctx: string) => ['personal', 'work', 'learning', 'creative'].includes(ctx)),
  isValidUUID: jest.fn((id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)),
  AIContext: {},
}));

import { syncRouter } from '../../../routes/sync';
import { errorHandler } from '../../../middleware/errorHandler';

describe('Sync Routes', () => {
  let app: express.Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api', syncRouter);
    app.use(errorHandler);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryContext.mockReset();
  });

  // ---- Swipe Actions ----

  describe('POST /api/:context/sync/swipe-actions', () => {
    it('should sync swipe actions successfully', async () => {
      mockQueryContext.mockResolvedValue({ rows: [], rowCount: 1 });

      const res = await request(app)
        .post('/api/personal/sync/swipe-actions')
        .send({
          actions: [
            { ideaId: '550e8400-e29b-41d4-a716-446655440000', action: 'archive', timestamp: '2026-03-21T00:00:00Z' },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.processed).toBe(1);
    });

    it('should return 400 for invalid context', async () => {
      const res = await request(app)
        .post('/api/invalid/sync/swipe-actions')
        .send({ actions: [{ ideaId: '550e8400-e29b-41d4-a716-446655440000', action: 'archive', timestamp: '2026-03-21' }] });

      expect(res.status).toBe(400);
    });

    it('should return 400 for empty actions array', async () => {
      const res = await request(app)
        .post('/api/personal/sync/swipe-actions')
        .send({ actions: [] });

      expect(res.status).toBe(400);
    });

    it('should return 400 for missing actions', async () => {
      const res = await request(app)
        .post('/api/personal/sync/swipe-actions')
        .send({});

      expect(res.status).toBe(400);
    });

    it('should handle failed actions gracefully', async () => {
      mockQueryContext.mockRejectedValue(new Error('DB error'));

      const res = await request(app)
        .post('/api/personal/sync/swipe-actions')
        .send({
          actions: [
            { ideaId: '550e8400-e29b-41d4-a716-446655440000', action: 'archive', timestamp: '2026-03-21T00:00:00Z' },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.data.failed).toBe(1);
    });

    it('should reject batch exceeding max size', async () => {
      const actions = Array.from({ length: 501 }, (_, i) => ({
        ideaId: '550e8400-e29b-41d4-a716-446655440000',
        action: 'archive' as const,
        timestamp: `2026-03-${String(i % 28 + 1).padStart(2, '0')}T00:00:00Z`,
      }));

      const res = await request(app)
        .post('/api/personal/sync/swipe-actions')
        .send({ actions });

      expect(res.status).toBe(400);
    });
  });

  // ---- Batch Sync ----

  describe('POST /api/:context/sync/batch', () => {
    it('should process batch sync with voice memos', async () => {
      mockQueryContext.mockResolvedValue({ rows: [{ id: 'new-id' }], rowCount: 1 });

      const res = await request(app)
        .post('/api/personal/sync/batch')
        .send({
          voiceMemos: [
            { clientId: 'c1', text: 'Test memo', timestamp: '2026-03-21T00:00:00Z' },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.voiceMemos).toBeDefined();
    });

    it('should return 400 for invalid context', async () => {
      const res = await request(app)
        .post('/api/invalid/sync/batch')
        .send({ voiceMemos: [] });

      expect(res.status).toBe(400);
    });
  });

  // ---- Sync Status ----

  describe('GET /api/:context/sync/status', () => {
    it('should return sync status', async () => {
      mockQueryContext
        .mockResolvedValueOnce({ rows: [{ count: '3' }] }) // pending count
        .mockResolvedValueOnce({ rows: [] }); // devices

      const res = await request(app).get('/api/personal/sync/status');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.pending_changes).toBe(3);
      expect(res.body.sync_enabled).toBe(true);
    });

    it('should return 400 for invalid context', async () => {
      const res = await request(app).get('/api/invalid/sync/status');

      expect(res.status).toBe(400);
    });
  });

  // ---- Pending Changes ----

  describe('GET /api/:context/sync/pending', () => {
    it('should return pending changes', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [
          { id: 'i1', type: 'idea', updated_at: '2026-03-21T00:00:00Z' },
        ],
      });

      const res = await request(app).get('/api/personal/sync/pending');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 400 for invalid context', async () => {
      const res = await request(app).get('/api/invalid/sync/pending');

      expect(res.status).toBe(400);
    });
  });
});
