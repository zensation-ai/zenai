/**
 * Contexts Route Tests
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

jest.mock('../../../middleware/validate-params', () => ({
  requireUUID: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

jest.mock('../../../middleware/response-cache', () => ({
  responseCacheMiddleware: (_req: unknown, _res: unknown, next: () => void) => next(),
  invalidateCacheForContext: jest.fn(),
}));

jest.mock('../../../services/ai-activity-logger', () => ({
  getRecentAIActivities: jest.fn().mockResolvedValue([]),
  markActivitiesAsRead: jest.fn().mockResolvedValue(undefined),
  getUnreadActivityCount: jest.fn().mockResolvedValue(0),
}));

jest.mock('../../../utils/sql-helpers', () => ({
  escapeLike: jest.fn((s: string) => s),
}));

import { contextsRouter } from '../../../routes/contexts';
import { errorHandler } from '../../../middleware/errorHandler';

describe('Contexts Routes', () => {
  let app: express.Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api', contextsRouter);
    app.use(errorHandler);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryContext.mockReset();
  });

  // ---- List Contexts ----

  describe('GET /api/contexts', () => {
    it('should return all 4 available contexts', async () => {
      const res = await request(app).get('/api/contexts');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.contexts).toHaveLength(4);
      expect(res.body.default).toBe('personal');
    });

    it('should include correct context IDs', async () => {
      const res = await request(app).get('/api/contexts');

      const ids = res.body.contexts.map((c: { id: string }) => c.id);
      expect(ids).toContain('personal');
      expect(ids).toContain('work');
      expect(ids).toContain('learning');
      expect(ids).toContain('creative');
    });

    it('should include descriptions for each context', async () => {
      const res = await request(app).get('/api/contexts');

      for (const context of res.body.contexts) {
        expect(context.description).toBeDefined();
        expect(typeof context.description).toBe('string');
      }
    });
  });

  // ---- Ideas per Context ----

  describe('GET /api/:context/ideas', () => {
    it('should return ideas for a valid context', async () => {
      mockQueryContext
        .mockResolvedValueOnce({
          rows: [{ id: 'i1', title: 'Test Idea', type: 'idea', priority: 'medium' }],
        })
        .mockResolvedValueOnce({ rows: [{ count: '1' }] });

      const res = await request(app).get('/api/personal/ideas');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.ideas).toHaveLength(1);
      expect(res.body.pagination.total).toBe(1);
      expect(res.body.context).toBe('personal');
    });

    it('should return 400 for invalid context', async () => {
      const res = await request(app).get('/api/invalid/ideas');

      expect(res.status).toBe(400);
    });

    it('should support pagination parameters', async () => {
      mockQueryContext
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '50' }] });

      const res = await request(app).get('/api/work/ideas?limit=10&offset=20');

      expect(res.status).toBe(200);
      expect(res.body.pagination.limit).toBe(10);
      expect(res.body.pagination.offset).toBe(20);
    });

    it('should support type filter', async () => {
      mockQueryContext
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      const res = await request(app).get('/api/personal/ideas?type=task');

      expect(res.status).toBe(200);
      // Verify the query included the type filter
      expect(mockQueryContext).toHaveBeenCalledWith(
        'personal',
        expect.stringContaining('type'),
        expect.arrayContaining(['task'])
      );
    });

    it('should return empty list when no ideas exist', async () => {
      mockQueryContext
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      const res = await request(app).get('/api/learning/ideas');

      expect(res.status).toBe(200);
      expect(res.body.ideas).toHaveLength(0);
      expect(res.body.pagination.hasMore).toBe(false);
    });
  });

  // ---- Archived Ideas ----

  describe('GET /api/:context/ideas/archived', () => {
    it('should return archived ideas', async () => {
      mockQueryContext
        .mockResolvedValueOnce({
          rows: [{ id: 'a1', title: 'Archived', is_archived: true }],
        })
        .mockResolvedValueOnce({ rows: [{ count: '1' }] });

      const res = await request(app).get('/api/personal/ideas/archived');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});
