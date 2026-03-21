/**
 * Analytics Advanced Route Tests
 *
 * Tests the advanced analytics dashboard and productivity score endpoints.
 * Note: analytics-advanced.ts extends the base analyticsRouter.
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

// analytics-advanced.ts imports from analytics.ts which exports analyticsRouter
// We need to import the router after all mocks are set up
import { analyticsRouter } from '../../../routes/analytics';
// Trigger side-effect import that adds routes to analyticsRouter
import '../../../routes/analytics-advanced';
import { errorHandler } from '../../../middleware/errorHandler';

describe('Analytics Advanced Routes', () => {
  let app: express.Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api', analyticsRouter);
    app.use(errorHandler);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryContext.mockReset();
  });

  describe('GET /api/:context/analytics/dashboard', () => {
    it('should return comprehensive dashboard data', async () => {
      // Mock 8 parallel queries
      mockQueryContext
        .mockResolvedValueOnce({ rows: [{ total: '100', today: '5', this_week: '30', this_month: '80', high_priority: '10' }] })
        .mockResolvedValueOnce({ rows: [{ week: '2026-01-06', count: '15' }] })
        .mockResolvedValueOnce({ rows: [{ month: '2026-01', count: '60' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ daily_ideas_target: '5', weekly_ideas_target: '25', today_count: '3', week_count: '12' }] })
        .mockResolvedValueOnce({ rows: [{ current_streak: '7', longest_streak: '14' }] })
        .mockResolvedValueOnce({ rows: [{ hour: '10', count: '8' }] })
        .mockResolvedValueOnce({ rows: [] });

      const res = await request(app).get('/api/personal/analytics/dashboard');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.summary.total).toBe(100);
      expect(res.body.summary.today).toBe(5);
      expect(res.body.streaks.current).toBe(7);
    });

    it('should reject invalid context', async () => {
      const res = await request(app).get('/api/invalid/analytics/dashboard');

      expect(res.status).toBe(400);
    });

    it('should handle empty database gracefully', async () => {
      mockQueryContext
        .mockResolvedValueOnce({ rows: [{ total: '0', today: '0', this_week: '0', this_month: '0', high_priority: '0' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ daily_ideas_target: '3', weekly_ideas_target: '15', today_count: '0', week_count: '0' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const res = await request(app).get('/api/work/analytics/dashboard');

      expect(res.status).toBe(200);
      expect(res.body.summary.total).toBe(0);
      expect(res.body.streaks.current).toBe(0);
    });

    it('should work with all valid contexts', async () => {
      for (const ctx of ['personal', 'work', 'learning', 'creative']) {
        mockQueryContext.mockReset();
        mockQueryContext
          .mockResolvedValueOnce({ rows: [{ total: '1', today: '0', this_week: '0', this_month: '1', high_priority: '0' }] })
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({ rows: [{ daily_ideas_target: '3', weekly_ideas_target: '15', today_count: '0', week_count: '0' }] })
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({ rows: [] });

        const res = await request(app).get(`/api/${ctx}/analytics/dashboard`);
        expect(res.status).toBe(200);
      }
    });

    it('should include generated timestamp', async () => {
      mockQueryContext
        .mockResolvedValueOnce({ rows: [{ total: '0', today: '0', this_week: '0', this_month: '0', high_priority: '0' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ daily_ideas_target: '3', weekly_ideas_target: '15', today_count: '0', week_count: '0' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const res = await request(app).get('/api/personal/analytics/dashboard');

      expect(res.status).toBe(200);
      expect(res.body.generatedAt).toBeDefined();
    });
  });
});
