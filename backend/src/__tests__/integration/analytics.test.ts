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
import { errorHandler } from '../../middleware/errorHandler';

const mockQueryContext = queryContext as jest.MockedFunction<typeof queryContext>;

describe('Analytics API Integration Tests', () => {
  let app: Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api', analyticsRouter);
    // Add error handler to catch ValidationErrors
    app.use(errorHandler);
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

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('summary');
      expect(response.body.data).toHaveProperty('recentActivity');
      expect(response.body.data).toHaveProperty('distribution');
      expect(response.body.data).toHaveProperty('dailyTrend');

      expect(response.body.data.summary.total).toBe(100);
      expect(response.body.data.summary.active).toBe(85);
    });

    it('should return 400 for invalid context', async () => {
      const response = await request(app)
        .get('/api/invalid/analytics/overview')
        .expect(400);

      expect(response.body.error).toBeDefined();
    });

    it('should handle database errors gracefully', async () => {
      mockQueryContext.mockRejectedValueOnce(new Error('Database connection failed'));

      const response = await request(app)
        .get('/api/personal/analytics/overview')
        .expect(500);

      expect(response.body.error).toBeDefined();
    });
  });

  // ===========================================
  // GET /api/:context/analytics/timeline
  // ===========================================

  describe('GET /api/:context/analytics/timeline', () => {
    it('should return timeline stats for specified period', async () => {
      mockQueryContext
        // Hourly breakdown
        .mockResolvedValueOnce({
          rows: [
            { hour: '9', count: '10' },
            { hour: '14', count: '15' },
            { hour: '16', count: '8' },
          ],
          rowCount: 3,
          command: 'SELECT',
          oid: 0,
          fields: [],
        })
        // Day of week breakdown
        .mockResolvedValueOnce({
          rows: [
            { dow: '1', count: '20' },
            { dow: '2', count: '15' },
          ],
          rowCount: 2,
          command: 'SELECT',
          oid: 0,
          fields: [],
        });

      const response = await request(app)
        .get('/api/personal/analytics/timeline')
        .query({ period: 'week' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('byHour');
      expect(response.body.data).toHaveProperty('byDayOfWeek');
    });

    it('should default to week period if not specified', async () => {
      mockQueryContext
        .mockResolvedValueOnce({ rows: [], rowCount: 0, command: 'SELECT', oid: 0, fields: [] })
        .mockResolvedValueOnce({ rows: [], rowCount: 0, command: 'SELECT', oid: 0, fields: [] });

      await request(app)
        .get('/api/personal/analytics/timeline')
        .expect(200);

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
          rows: [{ avg_per_day: '3.50' }],
          rowCount: 1,
          command: 'SELECT',
          oid: 0,
          fields: [],
        })
        // Streak calculation
        .mockResolvedValueOnce({
          rows: [{ streak_days: '7' }],
          rowCount: 1,
          command: 'SELECT',
          oid: 0,
          fields: [],
        })
        // Processing stats
        .mockResolvedValueOnce({
          rows: [{ total_processed: '25', avg_processing_time_sec: '1.5' }],
          rowCount: 1,
          command: 'SELECT',
          oid: 0,
          fields: [],
        });

      const response = await request(app)
        .get('/api/personal/analytics/engagement')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('avgIdeasPerDay');
      expect(response.body.data).toHaveProperty('currentStreak');
      expect(response.body.data).toHaveProperty('processing');
    });

    it('should return 400 for invalid context', async () => {
      const response = await request(app)
        .get('/api/invalid/analytics/engagement')
        .expect(400);

      expect(response.body.error).toBeDefined();
    });
  });

  // ===========================================
  // Context Validation Tests
  // ===========================================

  describe('Context Validation', () => {
    const endpoints = [
      '/api/invalid/analytics/overview',
      '/api/invalid/analytics/timeline',
      '/api/invalid/analytics/engagement',
    ];

    endpoints.forEach((endpoint) => {
      it(`should reject invalid context for ${endpoint}`, async () => {
        const response = await request(app)
          .get(endpoint)
          .expect(400);

        expect(response.body.error).toBeDefined();
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

      expect(response.body.data.summary.total).toBe(0);
    });

    it('should handle work context the same as personal', async () => {
      mockQueryContext
        .mockResolvedValueOnce({ rows: [{ total: '50', active: '45', archived: '5', last_week: '10', last_month: '25' }], rowCount: 1, command: 'SELECT', oid: 0, fields: [] })
        .mockResolvedValueOnce({ rows: [{ created: '2', updated: '5' }], rowCount: 1, command: 'SELECT', oid: 0, fields: [] })
        .mockResolvedValueOnce({ rows: [], rowCount: 0, command: 'SELECT', oid: 0, fields: [] })
        .mockResolvedValueOnce({ rows: [], rowCount: 0, command: 'SELECT', oid: 0, fields: [] })
        .mockResolvedValueOnce({ rows: [], rowCount: 0, command: 'SELECT', oid: 0, fields: [] })
        .mockResolvedValueOnce({ rows: [], rowCount: 0, command: 'SELECT', oid: 0, fields: [] });

      const response = await request(app)
        .get('/api/work/analytics/overview')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.summary.total).toBe(50);
    });
  });
});
