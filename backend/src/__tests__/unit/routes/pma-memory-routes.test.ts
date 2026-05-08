/**
 * PMA Memory Routes Tests
 */

import express from 'express';
import request from 'supertest';

// Sprint 1.5 Item 4 — router now has `router.use(apiKeyAuth)`. Pass-through
// stub so the suite (which predates the change) keeps running as-authenticated.
jest.mock('../../../middleware/auth', () => ({
  apiKeyAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireScope: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

jest.mock('../../../utils/logger', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const mockQueryContext = jest.fn();
jest.mock('../../../utils/database-context', () => ({
  queryContext: (...args: unknown[]) => mockQueryContext(...args),
  isValidContext: jest.fn((ctx: string) => ['operations', 'finance', 'people', 'strategy'].includes(ctx)),
  AIContext: {},
}));

import router from '../../../routes/pma-memory-routes';
import { errorHandler } from '../../../middleware/errorHandler';

describe('PMA Memory Routes', () => {
  let app: express.Application;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use((req: any, _res: any, next: any) => {
      req.user = { id: 'test-user' };
      next();
    });
    app.use('/', router);
    app.use(errorHandler);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryContext.mockReset();
  });

  // ─── Neuromodulators ────────────────────────────────────────────────────

  describe('GET /:context/memory/neuromodulators', () => {
    it('should return neuromodulator state from database', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [{
          dopamine: 0.7,
          norepinephrine: 0.6,
          serotonin: 0.8,
          acetylcholine: 0.5,
          updated_at: '2026-04-05T10:00:00Z',
        }],
      });

      const res = await request(app).get('/operations/memory/neuromodulators');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.dopamine).toBe(0.7);
      expect(res.body.data.serotonin).toBe(0.8);
      expect(mockQueryContext).toHaveBeenCalledWith(
        'operations',
        expect.stringContaining('neuromodulator_state'),
        ['test-user'],
      );
    });

    it('should return defaults when no state exists', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).get('/finance/memory/neuromodulators');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.dopamine).toBe(0.5);
      expect(res.body.data.norepinephrine).toBe(0.5);
    });

    it('should return defaults on database error', async () => {
      mockQueryContext.mockRejectedValueOnce(new Error('DB error'));

      const res = await request(app).get('/operations/memory/neuromodulators');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.dopamine).toBe(0.5);
    });
  });

  describe('GET /:context/memory/neuromodulators/history', () => {
    it('should return 7-day history', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [
          { dopamine: 0.7, norepinephrine: 0.6, serotonin: 0.5, acetylcholine: 0.4, updated_at: '2026-04-05T10:00:00Z' },
          { dopamine: 0.5, norepinephrine: 0.5, serotonin: 0.5, acetylcholine: 0.5, updated_at: '2026-04-04T10:00:00Z' },
        ],
      });

      const res = await request(app).get('/operations/memory/neuromodulators/history');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(2);
      expect(mockQueryContext).toHaveBeenCalledWith(
        'operations',
        expect.stringContaining('7 days'),
        ['test-user'],
      );
    });

    it('should return empty array on error', async () => {
      mockQueryContext.mockRejectedValueOnce(new Error('DB error'));

      const res = await request(app).get('/operations/memory/neuromodulators/history');

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });
  });

  // ─── Reconsolidation ──────────────────────────────────────────────────

  describe('GET /:context/memory/reconsolidation/active', () => {
    it('should return empty placeholder array', async () => {
      const res = await request(app).get('/operations/memory/reconsolidation/active');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual([]);
      expect(mockQueryContext).not.toHaveBeenCalled();
    });
  });

  describe('GET /:context/memory/reconsolidation/history', () => {
    it('should return reconsolidation events', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [
          { id: 'e1', memory_id: 'm1', prediction_error: 0.8, update_mode: 'strengthen', context: 'operations', session_id: 's1', rolled_back: false, created_at: '2026-04-05T10:00:00Z' },
        ],
      });

      const res = await request(app).get('/operations/memory/reconsolidation/history');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].prediction_error).toBe(0.8);
    });

    it('should respect limit parameter', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] });

      await request(app).get('/operations/memory/reconsolidation/history?limit=5');

      expect(mockQueryContext).toHaveBeenCalledWith(
        'operations',
        expect.stringContaining('LIMIT $2'),
        ['test-user', 5],
      );
    });

    it('should cap limit at 100', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] });

      await request(app).get('/operations/memory/reconsolidation/history?limit=500');

      expect(mockQueryContext).toHaveBeenCalledWith(
        'operations',
        expect.any(String),
        ['test-user', 100],
      );
    });

    it('should return empty array on error', async () => {
      mockQueryContext.mockRejectedValueOnce(new Error('DB error'));

      const res = await request(app).get('/operations/memory/reconsolidation/history');

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });
  });

  describe('POST /:context/memory/reconsolidation/:eventId/rollback', () => {
    it('should rollback a reconsolidation event', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [{ id: 'e1' }] });

      const res = await request(app)
        .post('/operations/memory/reconsolidation/e1/rollback');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.eventId).toBe('e1');
      expect(res.body.data.rolledBack).toBe(true);
    });

    it('should return 404 when event not found', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .post('/operations/memory/reconsolidation/nonexistent/rollback');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('not found');
    });

    it('should return 500 on database error', async () => {
      mockQueryContext.mockRejectedValueOnce(new Error('DB error'));

      const res = await request(app)
        .post('/operations/memory/reconsolidation/e1/rollback');

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });
  });

  // ─── Memory Copies ────────────────────────────────────────────────────

  describe('GET /:context/memory/copies/:eventId', () => {
    it('should return copies for a memory event', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [
          { id: 'c1', memory_event_id: 'ev1', copy_type: 'hippocampal', storage_ref: 'ref1', strength: 0.9, created_at: '2026-04-05T10:00:00Z', last_accessed: null },
          { id: 'c2', memory_event_id: 'ev1', copy_type: 'cortical', storage_ref: 'ref2', strength: 0.6, created_at: '2026-04-05T10:00:00Z', last_accessed: null },
        ],
      });

      const res = await request(app).get('/operations/memory/copies/ev1');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.data[0].copy_type).toBe('hippocampal');
    });

    it('should return empty array when no copies exist', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).get('/operations/memory/copies/nonexistent');

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });

    it('should return empty array on error', async () => {
      mockQueryContext.mockRejectedValueOnce(new Error('DB error'));

      const res = await request(app).get('/operations/memory/copies/ev1');

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });
  });

  // ─── Rediscoveries ────────────────────────────────────────────────────

  describe('GET /:context/memory/rediscoveries', () => {
    it('should return empty placeholder with default limit', async () => {
      const res = await request(app).get('/operations/memory/rediscoveries');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual([]);
      expect(res.body.limit).toBe(10);
    });

    it('should respect custom limit', async () => {
      const res = await request(app).get('/operations/memory/rediscoveries?limit=25');

      expect(res.status).toBe(200);
      expect(res.body.limit).toBe(25);
    });

    it('should cap limit at 50', async () => {
      const res = await request(app).get('/operations/memory/rediscoveries?limit=200');

      expect(res.status).toBe(200);
      expect(res.body.limit).toBe(50);
    });
  });

  // ─── Clusters ─────────────────────────────────────────────────────────

  describe('GET /:context/memory/clusters', () => {
    it('should return semantic clusters', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [
          { id: 'cl1', member_count: 5, avg_importance: 0.8, last_accessed: '2026-04-05T10:00:00Z', label: 'AI Research' },
        ],
      });

      const res = await request(app).get('/operations/memory/clusters');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].label).toBe('AI Research');
    });

    it('should return empty array when no clusters exist', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).get('/operations/memory/clusters');

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });

    it('should return empty array on error', async () => {
      mockQueryContext.mockRejectedValueOnce(new Error('DB error'));

      const res = await request(app).get('/operations/memory/clusters');

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });
  });

  describe('GET /:context/memory/clusters/:id/members', () => {
    it('should return cluster members', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [
          { memory_id: 'm1', similarity_to_centroid: 0.95, added_at: '2026-04-05T10:00:00Z' },
          { memory_id: 'm2', similarity_to_centroid: 0.88, added_at: '2026-04-04T10:00:00Z' },
        ],
      });

      const res = await request(app).get('/operations/memory/clusters/cl1/members');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.data[0].similarity_to_centroid).toBe(0.95);
    });

    it('should respect limit parameter', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] });

      await request(app).get('/operations/memory/clusters/cl1/members?limit=5');

      expect(mockQueryContext).toHaveBeenCalledWith(
        'operations',
        expect.stringContaining('LIMIT $2'),
        ['cl1', 5],
      );
    });

    it('should cap limit at 100', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] });

      await request(app).get('/operations/memory/clusters/cl1/members?limit=500');

      expect(mockQueryContext).toHaveBeenCalledWith(
        'operations',
        expect.any(String),
        ['cl1', 100],
      );
    });

    it('should return empty array on error', async () => {
      mockQueryContext.mockRejectedValueOnce(new Error('DB error'));

      const res = await request(app).get('/operations/memory/clusters/cl1/members');

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });
  });
});
