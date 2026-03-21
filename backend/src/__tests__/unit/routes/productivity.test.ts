/**
 * Productivity Route Tests
 *
 * Tests the productivity analytics endpoints:
 * dashboard, time-saved, heatmap, knowledge-growth, streak, weekly-report.
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

const mockGetProductivityDashboard = jest.fn();
const mockGetTimeSavedMetrics = jest.fn();
const mockGetActivityHeatmap = jest.fn();
const mockGetKnowledgeGrowth = jest.fn();
const mockGetStreakInfo = jest.fn();
const mockGetWeeklyReport = jest.fn();

jest.mock('../../../services/productivity-analytics', () => ({
  getProductivityDashboard: (...args: unknown[]) => mockGetProductivityDashboard(...args),
  getTimeSavedMetrics: (...args: unknown[]) => mockGetTimeSavedMetrics(...args),
  getActivityHeatmap: (...args: unknown[]) => mockGetActivityHeatmap(...args),
  getKnowledgeGrowth: (...args: unknown[]) => mockGetKnowledgeGrowth(...args),
  getStreakInfo: (...args: unknown[]) => mockGetStreakInfo(...args),
  getWeeklyReport: (...args: unknown[]) => mockGetWeeklyReport(...args),
}));

import { productivityRouter } from '../../../routes/productivity';
import { errorHandler } from '../../../middleware/errorHandler';

describe('Productivity Routes', () => {
  let app: express.Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api', productivityRouter);
    app.use(errorHandler);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/:context/productivity/dashboard', () => {
    it('should return productivity dashboard data', async () => {
      const dashboard = { score: 85, insights: [] };
      mockGetProductivityDashboard.mockResolvedValue(dashboard);

      const res = await request(app).get('/api/personal/productivity/dashboard');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.score).toBe(85);
    });

    it('should reject invalid context', async () => {
      const res = await request(app).get('/api/invalid/productivity/dashboard');
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/:context/productivity/time-saved', () => {
    it('should return time saved metrics', async () => {
      const metrics = { totalMinutesSaved: 120, thisWeek: 30 };
      mockGetTimeSavedMetrics.mockResolvedValue(metrics);

      const res = await request(app).get('/api/work/productivity/time-saved');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.totalMinutesSaved).toBe(120);
    });

    it('should reject invalid context', async () => {
      const res = await request(app).get('/api/bad/productivity/time-saved');
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/:context/productivity/heatmap', () => {
    it('should return activity heatmap data', async () => {
      const heatmap = { data: [[0, 1, 2], [3, 4, 5]] };
      mockGetActivityHeatmap.mockResolvedValue(heatmap);

      const res = await request(app).get('/api/learning/productivity/heatmap');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
    });
  });

  describe('GET /api/:context/productivity/knowledge-growth', () => {
    it('should return knowledge growth metrics', async () => {
      const growth = { totalEntities: 500, growthRate: 0.12 };
      mockGetKnowledgeGrowth.mockResolvedValue(growth);

      const res = await request(app).get('/api/creative/productivity/knowledge-growth');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.totalEntities).toBe(500);
    });
  });

  describe('GET /api/:context/productivity/streak', () => {
    it('should return streak information', async () => {
      const streak = { currentStreak: 14, longestStreak: 30 };
      mockGetStreakInfo.mockResolvedValue(streak);

      const res = await request(app).get('/api/personal/productivity/streak');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.currentStreak).toBe(14);
    });
  });

  describe('GET /api/:context/productivity/weekly-report', () => {
    it('should return weekly report card', async () => {
      const report = { grade: 'A', summary: 'Great week!' };
      mockGetWeeklyReport.mockResolvedValue(report);

      const res = await request(app).get('/api/personal/productivity/weekly-report');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.grade).toBe('A');
    });

    it('should reject invalid context', async () => {
      const res = await request(app).get('/api/bad/productivity/weekly-report');
      expect(res.status).toBe(400);
    });
  });
});
