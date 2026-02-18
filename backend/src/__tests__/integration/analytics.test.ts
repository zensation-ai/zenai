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
  isValidContext: jest.fn((ctx: string) => ['personal', 'work', 'learning', 'creative'].includes(ctx)),
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

jest.mock('../../services/ai-activity-logger', () => ({
  getRecentAIActivities: jest.fn().mockResolvedValue([]),
  getUnreadActivityCount: jest.fn().mockResolvedValue(0),
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
      expect(response.body).toHaveProperty('summary');
      expect(response.body).toHaveProperty('recentActivity');
      expect(response.body).toHaveProperty('distribution');
      expect(response.body).toHaveProperty('dailyTrend');

      expect(response.body.summary.total).toBe(100);
      expect(response.body.summary.active).toBe(85);
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
      expect(response.body).toHaveProperty('byHour');
      expect(response.body).toHaveProperty('byDayOfWeek');
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
      expect(response.body).toHaveProperty('avgIdeasPerDay');
      expect(response.body).toHaveProperty('currentStreak');
      expect(response.body).toHaveProperty('processing');
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

      expect(response.body.summary.total).toBe(0);
    });

    it('should handle all four contexts', async () => {
      for (const ctx of ['personal', 'work', 'learning', 'creative']) {
        mockQueryContext
          .mockResolvedValueOnce({ rows: [{ total: '1', active: '1', archived: '0', last_week: '0', last_month: '0' }], rowCount: 1, command: 'SELECT', oid: 0, fields: [] })
          .mockResolvedValueOnce({ rows: [{ created: '0', updated: '0' }], rowCount: 1, command: 'SELECT', oid: 0, fields: [] })
          .mockResolvedValueOnce({ rows: [], rowCount: 0, command: 'SELECT', oid: 0, fields: [] })
          .mockResolvedValueOnce({ rows: [], rowCount: 0, command: 'SELECT', oid: 0, fields: [] })
          .mockResolvedValueOnce({ rows: [], rowCount: 0, command: 'SELECT', oid: 0, fields: [] })
          .mockResolvedValueOnce({ rows: [], rowCount: 0, command: 'SELECT', oid: 0, fields: [] });

        const response = await request(app)
          .get(`/api/${ctx}/analytics/overview`)
          .expect(200);

        expect(response.body.success).toBe(true);
      }
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
      expect(response.body.summary.total).toBe(50);
    });
  });

  // ===========================================
  // GET /api/:context/analytics/dashboard-summary
  // ===========================================

  describe('GET /api/:context/analytics/dashboard-summary', () => {
    const { getRecentAIActivities, getUnreadActivityCount } = jest.requireMock('../../services/ai-activity-logger');

    it('should return aggregated dashboard data', async () => {
      mockQueryContext
        // Stats
        .mockResolvedValueOnce({
          rows: [{ total: '42', this_week: '12', today: '3', high_priority: '7' }],
          rowCount: 1, command: 'SELECT', oid: 0, fields: [],
        })
        // Streak
        .mockResolvedValueOnce({
          rows: [{ streak_days: '5' }],
          rowCount: 1, command: 'SELECT', oid: 0, fields: [],
        })
        // Trend
        .mockResolvedValueOnce({
          rows: [
            { date: '2026-02-17', count: '4' },
            { date: '2026-02-18', count: '3' },
          ],
          rowCount: 2, command: 'SELECT', oid: 0, fields: [],
        })
        // Recent ideas
        .mockResolvedValueOnce({
          rows: [
            { id: 'idea-1', title: 'Test Idea', type: 'idea', priority: 'high', created_at: '2026-02-18T10:00:00Z' },
          ],
          rowCount: 1, command: 'SELECT', oid: 0, fields: [],
        });

      (getRecentAIActivities as jest.Mock).mockResolvedValueOnce([
        { id: 'act-1', activityType: 'idea_created', message: 'Test activity', ideaId: null, isRead: false, createdAt: '2026-02-18T10:00:00Z' },
      ]);
      (getUnreadActivityCount as jest.Mock).mockResolvedValueOnce(3);

      const response = await request(app)
        .get('/api/personal/analytics/dashboard-summary')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.stats).toEqual({
        total: 42,
        thisWeek: 12,
        todayCount: 3,
        highPriority: 7,
      });
      expect(response.body.streak).toBe(5);
      expect(response.body.trend).toHaveLength(2);
      expect(response.body.recentIdeas).toHaveLength(1);
      expect(response.body.activities).toHaveLength(1);
      expect(response.body.unreadCount).toBe(3);
      expect(response.body.context).toBe('personal');
    });

    it('should return 400 for invalid context', async () => {
      const response = await request(app)
        .get('/api/invalid/analytics/dashboard-summary')
        .expect(400);

      expect(response.body.error).toBeDefined();
    });

    it('should handle partial query failures gracefully', async () => {
      // Stats succeeds
      mockQueryContext
        .mockResolvedValueOnce({
          rows: [{ total: '10', this_week: '2', today: '1', high_priority: '0' }],
          rowCount: 1, command: 'SELECT', oid: 0, fields: [],
        })
        // Streak fails
        .mockRejectedValueOnce(new Error('Connection timeout'))
        // Trend succeeds
        .mockResolvedValueOnce({
          rows: [], rowCount: 0, command: 'SELECT', oid: 0, fields: [],
        })
        // Recent ideas succeeds
        .mockResolvedValueOnce({
          rows: [], rowCount: 0, command: 'SELECT', oid: 0, fields: [],
        });

      (getRecentAIActivities as jest.Mock).mockResolvedValueOnce([]);
      (getUnreadActivityCount as jest.Mock).mockResolvedValueOnce(0);

      const response = await request(app)
        .get('/api/personal/analytics/dashboard-summary')
        .expect(200);

      // Should still return 200 because safeQuery catches errors
      expect(response.body.success).toBe(true);
      expect(response.body.stats.total).toBe(10);
      expect(response.body.streak).toBe(0); // Fallback from failed query
    });

    it('should handle empty database', async () => {
      mockQueryContext
        .mockResolvedValueOnce({
          rows: [{ total: '0', this_week: '0', today: '0', high_priority: '0' }],
          rowCount: 1, command: 'SELECT', oid: 0, fields: [],
        })
        .mockResolvedValueOnce({
          rows: [], rowCount: 0, command: 'SELECT', oid: 0, fields: [],
        })
        .mockResolvedValueOnce({
          rows: [], rowCount: 0, command: 'SELECT', oid: 0, fields: [],
        })
        .mockResolvedValueOnce({
          rows: [], rowCount: 0, command: 'SELECT', oid: 0, fields: [],
        });

      (getRecentAIActivities as jest.Mock).mockResolvedValueOnce([]);
      (getUnreadActivityCount as jest.Mock).mockResolvedValueOnce(0);

      const response = await request(app)
        .get('/api/personal/analytics/dashboard-summary')
        .expect(200);

      expect(response.body.stats.total).toBe(0);
      expect(response.body.streak).toBe(0);
      expect(response.body.trend).toEqual([]);
      expect(response.body.recentIdeas).toEqual([]);
      expect(response.body.activities).toEqual([]);
      expect(response.body.unreadCount).toBe(0);
    });
  });
});
