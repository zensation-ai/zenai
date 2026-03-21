/**
 * Analytics V2 Route Tests
 *
 * Tests the enhanced analytics endpoints with date ranges,
 * trends, productivity insights, and period comparison.
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

jest.mock('../../../utils/database-context', () => ({
  queryContext: jest.fn(),
  isValidContext: jest.fn((ctx: string) => ['personal', 'work', 'learning', 'creative'].includes(ctx)),
  AIContext: {},
}));

const mockGetOverview = jest.fn();
const mockGetTrends = jest.fn();
const mockGetProductivityInsights = jest.fn();
const mockGetComparison = jest.fn();

jest.mock('../../../services/analytics-v2', () => ({
  getOverview: (...args: unknown[]) => mockGetOverview(...args),
  getTrends: (...args: unknown[]) => mockGetTrends(...args),
  getProductivityInsights: (...args: unknown[]) => mockGetProductivityInsights(...args),
  getComparison: (...args: unknown[]) => mockGetComparison(...args),
}));

const mockGetUsageStats = jest.fn();
const mockGetDailyUsage = jest.fn();

jest.mock('../../../services/ai-usage-tracker', () => ({
  getUsageStats: (...args: unknown[]) => mockGetUsageStats(...args),
  getDailyUsage: (...args: unknown[]) => mockGetDailyUsage(...args),
}));

const mockGetMemoryHealth = jest.fn();

jest.mock('../../../services/memory-health', () => ({
  getMemoryHealth: (...args: unknown[]) => mockGetMemoryHealth(...args),
}));

import { analyticsV2Router } from '../../../routes/analytics-v2';
import { errorHandler } from '../../../middleware/errorHandler';

describe('Analytics V2 Routes', () => {
  let app: express.Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api', analyticsV2Router);
    app.use(errorHandler);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/:context/analytics/v2/overview', () => {
    it('should return overview data for valid date range', async () => {
      const overview = { totalIdeas: 42, avgPerDay: 2.1 };
      mockGetOverview.mockResolvedValue(overview);

      const res = await request(app)
        .get('/api/personal/analytics/v2/overview?from=2026-01-01&to=2026-01-31');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(overview);
      expect(mockGetOverview).toHaveBeenCalledWith('personal', '2026-01-01', '2026-01-31');
    });

    it('should reject missing date parameters', async () => {
      const res = await request(app)
        .get('/api/personal/analytics/v2/overview');

      expect(res.status).toBe(400);
    });

    it('should reject invalid date format', async () => {
      const res = await request(app)
        .get('/api/personal/analytics/v2/overview?from=01-2026-01&to=2026-01-31');

      expect(res.status).toBe(400);
    });

    it('should reject from date after to date', async () => {
      const res = await request(app)
        .get('/api/personal/analytics/v2/overview?from=2026-02-01&to=2026-01-01');

      expect(res.status).toBe(400);
    });

    it('should reject invalid context', async () => {
      const res = await request(app)
        .get('/api/invalid/analytics/v2/overview?from=2026-01-01&to=2026-01-31');

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/:context/analytics/v2/trends', () => {
    it('should return trends with default granularity', async () => {
      const trends = [{ date: '2026-01-01', count: 5 }];
      mockGetTrends.mockResolvedValue(trends);

      const res = await request(app)
        .get('/api/work/analytics/v2/trends?from=2026-01-01&to=2026-01-31');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockGetTrends).toHaveBeenCalledWith('work', '2026-01-01', '2026-01-31', 'day');
    });

    it('should accept valid granularity parameter', async () => {
      mockGetTrends.mockResolvedValue([]);

      const res = await request(app)
        .get('/api/personal/analytics/v2/trends?from=2026-01-01&to=2026-01-31&granularity=week');

      expect(res.status).toBe(200);
      expect(mockGetTrends).toHaveBeenCalledWith('personal', '2026-01-01', '2026-01-31', 'week');
    });

    it('should reject invalid granularity', async () => {
      const res = await request(app)
        .get('/api/personal/analytics/v2/trends?from=2026-01-01&to=2026-01-31&granularity=year');

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/:context/analytics/v2/comparison', () => {
    it('should return comparison for two valid periods', async () => {
      const comparison = { period1: { count: 10 }, period2: { count: 15 } };
      mockGetComparison.mockResolvedValue(comparison);

      const res = await request(app)
        .get('/api/personal/analytics/v2/comparison?p1_from=2026-01-01&p1_to=2026-01-31&p2_from=2026-02-01&p2_to=2026-02-28');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(comparison);
    });

    it('should reject missing period parameters', async () => {
      const res = await request(app)
        .get('/api/personal/analytics/v2/comparison?p1_from=2026-01-01&p1_to=2026-01-31');

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/:context/analytics/v2/memory-health', () => {
    it('should return memory health data', async () => {
      const health = { totalFacts: 100, avgConfidence: 0.85 };
      mockGetMemoryHealth.mockResolvedValue(health);

      const res = await request(app)
        .get('/api/learning/analytics/v2/memory-health?from=2026-01-01&to=2026-01-31');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(health);
    });
  });
});
