/**
 * Digest Route Tests
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
  AIContext: {},
}));

jest.mock('../../../utils/ollama', () => ({
  queryOllamaJSON: jest.fn().mockResolvedValue(null),
}));

import { digestRouter } from '../../../routes/digest';
import { errorHandler } from '../../../middleware/errorHandler';

describe('Digest Routes', () => {
  let app: express.Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api', digestRouter);
    app.use(errorHandler);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryContext.mockReset();
  });

  describe('POST /api/:context/digest/generate/daily', () => {
    it('should return cached digest if exists', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [{
          id: 'd1', type: 'daily', period_start: '2026-03-21', period_end: '2026-03-21',
          title: 'Test', summary: 'Summary', highlights: [], statistics: {},
          ai_insights: [], recommendations: [], ideas_count: 5,
          top_categories: ['tech'], top_types: ['idea'], productivity_score: '80',
          created_at: '2026-03-21T00:00:00Z',
        }],
      });

      const res = await request(app)
        .post('/api/personal/digest/generate/daily')
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.cached).toBe(true);
    });

    it('should return null when no ideas found', async () => {
      // No existing digest
      mockQueryContext.mockResolvedValueOnce({ rows: [] });
      // No ideas
      mockQueryContext.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .post('/api/personal/digest/generate/daily')
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.data).toBeNull();
    });

    it('should generate new digest when ideas exist', async () => {
      // No existing digest
      mockQueryContext.mockResolvedValueOnce({ rows: [] });
      // Ideas found
      mockQueryContext.mockResolvedValueOnce({
        rows: [
          { id: 'i1', title: 'Test Idea', type: 'idea', category: 'tech', priority: 'high', summary: 'Test', created_at: '2026-03-21T10:00:00Z' },
        ],
      });
      // Store digest
      mockQueryContext.mockResolvedValueOnce({
        rows: [{
          id: 'd2', type: 'daily', period_start: '2026-03-21', period_end: '2026-03-21',
          title: 'Test', summary: 'Summary', highlights: [], statistics: {},
          ai_insights: [], recommendations: [], ideas_count: 1,
          top_categories: ['tech'], top_types: ['idea'], productivity_score: '50',
          created_at: '2026-03-21T00:00:00Z',
        }],
      });

      const res = await request(app)
        .post('/api/personal/digest/generate/daily')
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.cached).toBe(false);
    });

    it('should reject invalid context', async () => {
      const res = await request(app)
        .post('/api/invalid/digest/generate/daily')
        .send({});

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/:context/digest/history', () => {
    it('should return digest history', async () => {
      mockQueryContext.mockResolvedValue({
        rows: [{
          id: 'd1', type: 'daily', period_start: '2026-03-21', period_end: '2026-03-21',
          title: 'Daily', summary: 'S', highlights: [], statistics: {},
          ai_insights: [], recommendations: [], ideas_count: 3,
          top_categories: [], top_types: [], productivity_score: '70',
          created_at: '2026-03-21T00:00:00Z',
        }],
      });

      const res = await request(app).get('/api/personal/digest/history');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
    });
  });

  describe('GET /api/:context/digest/latest', () => {
    it('should return latest digest', async () => {
      mockQueryContext.mockResolvedValue({
        rows: [{
          id: 'd1', type: 'daily', period_start: '2026-03-21', period_end: '2026-03-21',
          title: 'Latest', summary: 'S', highlights: [], statistics: {},
          ai_insights: [], recommendations: [], ideas_count: 5,
          top_categories: [], top_types: [], productivity_score: '85',
          created_at: '2026-03-21T00:00:00Z',
        }],
      });

      const res = await request(app).get('/api/personal/digest/latest');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe('d1');
    });

    it('should return null when no digest exists', async () => {
      mockQueryContext.mockResolvedValue({ rows: [] });

      const res = await request(app).get('/api/personal/digest/latest');

      expect(res.status).toBe(200);
      expect(res.body.data).toBeNull();
    });
  });

  describe('GET /api/:context/digest/goals', () => {
    it('should return productivity goals', async () => {
      mockQueryContext.mockResolvedValue({
        rows: [{ id: 1, daily_ideas_target: 5, weekly_ideas_target: 25, focus_categories: ['tech'], enabled_insights: true, digest_time: '09:00' }],
      });

      const res = await request(app).get('/api/personal/digest/goals');

      expect(res.status).toBe(200);
      expect(res.body.data.dailyIdeasTarget).toBe(5);
    });

    it('should return defaults when no goals exist', async () => {
      mockQueryContext
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const res = await request(app).get('/api/personal/digest/goals');

      expect(res.status).toBe(200);
      expect(res.body.data.dailyIdeasTarget).toBe(3);
    });
  });

  describe('PUT /api/:context/digest/goals', () => {
    it('should update productivity goals', async () => {
      mockQueryContext.mockResolvedValue({ rows: [] });

      const res = await request(app)
        .put('/api/personal/digest/goals')
        .send({ dailyIdeasTarget: 10 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});
