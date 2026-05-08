/**
 * PMA Metacognition Routes Tests
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

import router from '../../../routes/pma-metacognition-routes';
import { errorHandler } from '../../../middleware/errorHandler';

describe('PMA Metacognition Routes', () => {
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

  // ─── Bias Report ──────────────────────────────────────────────────────

  describe('GET /:context/metacognition/bias-report', () => {
    it('should return latest bias metrics', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [{
          user_id: 'test-user',
          context: 'operations',
          recency_bias: 0.3,
          confirmation_bias: 0.2,
          availability_bias: 0.15,
          computed_at: '2026-04-05T10:00:00Z',
        }],
      });

      const res = await request(app).get('/operations/metacognition/bias-report');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.recency_bias).toBe(0.3);
      expect(mockQueryContext).toHaveBeenCalledWith(
        'operations',
        expect.stringContaining('cognitive_bias_metrics'),
        ['test-user', 'operations'],
      );
    });

    it('should return null when no bias data exists', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).get('/finance/metacognition/bias-report');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeNull();
    });

    it('should return null on database error', async () => {
      mockQueryContext.mockRejectedValueOnce(new Error('DB error'));

      const res = await request(app).get('/operations/metacognition/bias-report');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeNull();
    });
  });

  // ─── Efficiency ───────────────────────────────────────────────────────

  describe('GET /:context/metacognition/efficiency', () => {
    it('should return efficiency metrics', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [
          { date: '2026-04-05', avg_context_tokens: 2500, retrieval_precision: 0.85, prediction_accuracy: 0.78, response_quality_avg: 0.9 },
          { date: '2026-04-04', avg_context_tokens: 2200, retrieval_precision: 0.82, prediction_accuracy: 0.75, response_quality_avg: 0.88 },
        ],
      });

      const res = await request(app).get('/operations/metacognition/efficiency');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.data[0].retrieval_precision).toBe(0.85);
    });

    it('should use default 7-day window', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] });

      await request(app).get('/operations/metacognition/efficiency');

      expect(mockQueryContext).toHaveBeenCalledWith(
        'operations',
        expect.stringContaining('make_interval'),
        ['test-user', 'operations', 7],
      );
    });

    it('should respect custom days parameter', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] });

      await request(app).get('/operations/metacognition/efficiency?days=14');

      expect(mockQueryContext).toHaveBeenCalledWith(
        'operations',
        expect.any(String),
        ['test-user', 'operations', 14],
      );
    });

    it('should cap days at 30', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] });

      await request(app).get('/operations/metacognition/efficiency?days=365');

      expect(mockQueryContext).toHaveBeenCalledWith(
        'operations',
        expect.any(String),
        ['test-user', 'operations', 30],
      );
    });

    it('should return empty array on error', async () => {
      mockQueryContext.mockRejectedValueOnce(new Error('DB error'));

      const res = await request(app).get('/operations/metacognition/efficiency');

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });
  });

  // ─── Novelty Windows ─────────────────────────────────────────────────

  describe('GET /:context/metacognition/novelty-windows', () => {
    it('should return empty placeholder array', async () => {
      const res = await request(app).get('/operations/metacognition/novelty-windows');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual([]);
      expect(mockQueryContext).not.toHaveBeenCalled();
    });

    it('should work across different contexts', async () => {
      const res = await request(app).get('/people/metacognition/novelty-windows');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual([]);
    });
  });
});
