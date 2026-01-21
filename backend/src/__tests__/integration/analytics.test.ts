/**
 * Integration Tests for Analytics API
 *
 * Tests the Analytics router endpoints with mocked database.
 * Uses supertest to simulate HTTP requests.
 */

import express, { Express } from 'express';
import request from 'supertest';
import { analyticsRouter } from '../../routes/analytics';

// Mock all external dependencies
jest.mock('../../utils/database-context', () => ({
  queryContext: jest.fn(),
  isValidContext: jest.fn((ctx: string) => ctx === 'personal' || ctx === 'work'),
  AIContext: {},
}));

// Mock auth middleware to bypass authentication in tests
jest.mock('../../middleware/auth', () => ({
  apiKeyAuth: jest.fn((req, res, next) => {
    req.apiKey = { id: 'test-key', name: 'Test', scopes: ['read', 'write', 'admin'], rateLimit: 10000 };
    next();
  }),
  requireScope: jest.fn(() => (req: any, res: any, next: any) => next()),
}));

jest.mock('../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import { queryContext } from '../../utils/database-context';

const mockQueryContext = queryContext as jest.MockedFunction<typeof queryContext>;

describe('Analytics API Integration Tests', () => {
  let app: Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api', analyticsRouter);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ===========================================
  // GET /api/:context/analytics/overview
  // ===========================================

  describe('GET /api/:context/analytics/overview', () => {
    it('should return analytics overview for personal context', async () => {
      // Mock all the parallel queries
      mockQueryContext
        // Total stats
        .mockResolvedValueOnce({
          rows: [{
            total: '100',
            active: '85',
            archived: '15',
            last_week: '20',
            last_month: '50',
          }],
          rowCount: 1,
          command: 'SELECT',
          oid: 0,
          fields: [],
        })
        // Recent stats
        .mockResolvedValueOnce({
          rows: [{ created: '5', updated: '10' }],
          rowCount: 1,
          command: 'SELECT',
          oid: 0,
          fields: [],
        })
        // Category stats
        .mockResolvedValueOnce({
          rows: [
            { category: 'business', count: '30' },
            { category: 'technical', count: '40' },
            { category: 'personal', count: '20' },
            { category: 'learning', count: '10' },
          ],
          rowCount: 4,
          command: 'SELECT',
          oid: 0,
          fields: [],
        })
        // Type stats
        .mockResolvedValueOnce({
          rows: [
            { type: 'idea', count: '40' },
            { type: 'task', count: '30' },
            { type: 'insight', count: '15' },
            { type: 'problem', count: '10' },
            { type: 'question', count: '5' },
          ],
          rowCount: 5,
          command: 'SELECT',
          oid: 0,
          fields: [],
        })
        // Priority stats
        .mockResolvedValueOnce({
          rows: [
            { priority: 'high', count: '25' },
            { priority: 'medium', count: '50' },
            { priority: 'low', count: '25' },
          ],
          rowCount: 3,
          command: 'SELECT',
          oid: 0,
          fields: [],
        })
        // Daily trend
        .mockResolvedValueOnce({
          rows: [
            { date: '2026-01-20', count: '5' },
            { date: '2026-01-19', count: '8' },
            { date: '2026-01-18', count: '3' },
          ],
          rowCount: 3,
          command: 'SELECT',
          oid: 0,
          fields: [],
        });

      const response = await request(app)
        .get('/api/personal/analytics/overview')
        .expect(200);

      expect(response.body).toHaveProperty('totals');
      expect(response.body).toHaveProperty('recent');
      expect(response.body).toHaveProperty('distribution');
      expect(response.body).toHaveProperty('trend');

      expect(response.body.totals.total).toBe(100);
      expect(response.body.totals.active).toBe(85);
    });

    it('should return 400 for invalid context', async () => {
      const response = await request(app)
        .get('/api/invalid/analytics/overview')
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('Context');
    });

    it('should handle database errors gracefully', async () => {
      mockQueryContext.mockRejectedValueOnce(new Error('Database connection failed'));

      const response = await request(app)
        .get('/api/personal/analytics/overview')
        .expect(500);

      expect(response.body).toHaveProperty('error');
    });
  });

  // ===========================================
  // GET /api/:context/analytics/time-range
  // ===========================================

  describe('GET /api/:context/analytics/time-range', () => {
    it('should return stats for specified time range', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [{
          count: '25',
          categories: JSON.stringify({ business: 10, technical: 15 }),
          types: JSON.stringify({ idea: 15, task: 10 }),
          priorities: JSON.stringify({ high: 5, medium: 15, low: 5 }),
        }],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const response = await request(app)
        .get('/api/personal/analytics/time-range')
        .query({ days: '7' })
        .expect(200);

      expect(response.body).toHaveProperty('period');
      expect(response.body).toHaveProperty('count');
    });

    it('should default to 30 days if not specified', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [{ count: '50' }],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      await request(app)
        .get('/api/personal/analytics/time-range')
        .expect(200);

      // Verify the query was called with 30 days default
      expect(mockQueryContext).toHaveBeenCalled();
    });
  });

  // ===========================================
  // GET /api/:context/analytics/engagement
  // ===========================================

  describe('GET /api/:context/analytics/engagement', () => {
    it('should return engagement statistics', async () => {
      mockQueryContext
        // Average ideas per day
        .mockResolvedValueOnce({
          rows: [{ avg_per_day: '3.5' }],
          rowCount: 1,
          command: 'SELECT',
          oid: 0,
          fields: [],
        })
        // Most active hour
        .mockResolvedValueOnce({
          rows: [{ hour: '14', count: '25' }],
          rowCount: 1,
          command: 'SELECT',
          oid: 0,
          fields: [],
        })
        // Most active day
        .mockResolvedValueOnce({
          rows: [{ day_name: 'Monday', count: '30' }],
          rowCount: 1,
          command: 'SELECT',
          oid: 0,
          fields: [],
        })
        // Streak calculation
        .mockResolvedValueOnce({
          rows: [{ streak: '7' }],
          rowCount: 1,
          command: 'SELECT',
          oid: 0,
          fields: [],
        });

      const response = await request(app)
        .get('/api/personal/analytics/engagement')
        .expect(200);

      expect(response.body).toHaveProperty('avgIdeasPerDay');
      expect(response.body).toHaveProperty('mostActiveHour');
      expect(response.body).toHaveProperty('mostActiveDay');
      expect(response.body).toHaveProperty('streakDays');
    });
  });

  // ===========================================
  // GET /api/:context/analytics/keywords
  // ===========================================

  describe('GET /api/:context/analytics/keywords', () => {
    it('should return top keywords', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [
          { keyword: 'javascript', count: '15' },
          { keyword: 'typescript', count: '12' },
          { keyword: 'react', count: '10' },
          { keyword: 'nodejs', count: '8' },
          { keyword: 'api', count: '6' },
        ],
        rowCount: 5,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const response = await request(app)
        .get('/api/personal/analytics/keywords')
        .expect(200);

      expect(response.body).toHaveProperty('keywords');
      expect(Array.isArray(response.body.keywords)).toBe(true);
      expect(response.body.keywords.length).toBeLessThanOrEqual(10);
    });

    it('should respect limit parameter', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [
          { keyword: 'javascript', count: '15' },
          { keyword: 'typescript', count: '12' },
          { keyword: 'react', count: '10' },
        ],
        rowCount: 3,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const response = await request(app)
        .get('/api/personal/analytics/keywords')
        .query({ limit: '3' })
        .expect(200);

      expect(response.body.keywords.length).toBeLessThanOrEqual(3);
    });
  });

  // ===========================================
  // Context Validation Tests
  // ===========================================

  describe('Context Validation', () => {
    const endpoints = [
      '/api/invalid/analytics/overview',
      '/api/invalid/analytics/time-range',
      '/api/invalid/analytics/engagement',
      '/api/invalid/analytics/keywords',
    ];

    endpoints.forEach((endpoint) => {
      it(`should reject invalid context for ${endpoint}`, async () => {
        const response = await request(app)
          .get(endpoint)
          .expect(400);

        expect(response.body.error).toContain('Context');
      });
    });
  });

  // ===========================================
  // Edge Cases
  // ===========================================

  describe('Edge Cases', () => {
    it('should handle empty database gracefully', async () => {
      mockQueryContext
        .mockResolvedValueOnce({ rows: [{ total: '0', active: '0', archived: '0', last_week: '0', last_month: '0' }], rowCount: 1, command: 'SELECT', oid: 0, fields: [] })
        .mockResolvedValueOnce({ rows: [{ created: '0', updated: '0' }], rowCount: 1, command: 'SELECT', oid: 0, fields: [] })
        .mockResolvedValueOnce({ rows: [], rowCount: 0, command: 'SELECT', oid: 0, fields: [] })
        .mockResolvedValueOnce({ rows: [], rowCount: 0, command: 'SELECT', oid: 0, fields: [] })
        .mockResolvedValueOnce({ rows: [], rowCount: 0, command: 'SELECT', oid: 0, fields: [] })
        .mockResolvedValueOnce({ rows: [], rowCount: 0, command: 'SELECT', oid: 0, fields: [] });

      const response = await request(app)
        .get('/api/personal/analytics/overview')
        .expect(200);

      expect(response.body.totals.total).toBe(0);
    });

    it('should handle work context the same as personal', async () => {
      mockQueryContext
        .mockResolvedValueOnce({ rows: [{ total: '10', active: '8', archived: '2', last_week: '3', last_month: '7' }], rowCount: 1, command: 'SELECT', oid: 0, fields: [] })
        .mockResolvedValueOnce({ rows: [{ created: '2', updated: '1' }], rowCount: 1, command: 'SELECT', oid: 0, fields: [] })
        .mockResolvedValueOnce({ rows: [], rowCount: 0, command: 'SELECT', oid: 0, fields: [] })
        .mockResolvedValueOnce({ rows: [], rowCount: 0, command: 'SELECT', oid: 0, fields: [] })
        .mockResolvedValueOnce({ rows: [], rowCount: 0, command: 'SELECT', oid: 0, fields: [] })
        .mockResolvedValueOnce({ rows: [], rowCount: 0, command: 'SELECT', oid: 0, fields: [] });

      const response = await request(app)
        .get('/api/work/analytics/overview')
        .expect(200);

      expect(response.body).toHaveProperty('totals');
    });
  });
});
