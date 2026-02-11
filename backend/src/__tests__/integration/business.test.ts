/**
 * Integration Tests for Business Manager API
 *
 * Tests all business manager endpoints across 8 sub-routers:
 * - /overview - Aggregated business dashboard
 * - /revenue - Stripe revenue metrics
 * - /traffic - GA4 traffic metrics
 * - /seo - Google Search Console metrics
 * - /health - Uptime + performance monitoring
 * - /insights - AI-generated business insights
 * - /reports - Periodic business reports
 * - /connectors - Data source management
 */

import express, { Express } from 'express';
import request from 'supertest';
import { errorHandler } from '../../middleware/errorHandler';

// Mock auth middleware as passthrough
jest.mock('../../middleware/auth', () => ({
  apiKeyAuth: (_req: any, _res: any, next: any) => next(),
}));

// Mock database
jest.mock('../../utils/database', () => ({
  pool: {
    query: jest.fn(),
  },
}));

// Mock all business service connectors
jest.mock('../../services/business', () => ({
  stripeConnector: {
    isAvailable: jest.fn().mockReturnValue(true),
    getMetrics: jest.fn().mockResolvedValue({
      mrr: 5000,
      arr: 60000,
      activeSubscriptions: 10,
      churnRate: 0.02,
      mrrGrowth: 0.05,
      totalCustomers: 50,
      recentPayments: [],
    }),
    getRevenueTimeline: jest.fn().mockResolvedValue([
      { date: '2026-01-01', mrr: 4500, subscriptions: 9 },
      { date: '2026-02-01', mrr: 5000, subscriptions: 10 },
    ]),
    getRecentEvents: jest.fn().mockResolvedValue([
      { id: 'evt_1', event_type: 'payment', amount: 100, currency: 'eur', occurred_at: '2026-02-01' },
    ]),
    handleWebhook: jest.fn().mockResolvedValue(undefined),
    testConnection: jest.fn().mockResolvedValue({ success: true, message: 'Connected to Stripe' }),
  },
  ga4Connector: {
    isAvailable: jest.fn().mockReturnValue(true),
    getTrafficMetrics: jest.fn().mockResolvedValue({
      users: 1200,
      newUsers: 400,
      sessions: 1800,
      pageviews: 5000,
      bounceRate: 0.45,
      avgSessionDuration: 180,
      conversions: 25,
      usersGrowth: 0.1,
      topPages: [{ page: '/', views: 1000, bounceRate: 0.4 }],
      trafficSources: [{ source: 'google', users: 600, sessions: 900 }],
    }),
    testConnection: jest.fn().mockResolvedValue({ success: true, message: 'Connected to GA4' }),
  },
  gscConnector: {
    isAvailable: jest.fn().mockReturnValue(true),
    getSearchMetrics: jest.fn().mockResolvedValue({
      impressions: 50000,
      clicks: 2500,
      ctr: 0.05,
      avgPosition: 15.2,
      impressionsGrowth: 0.12,
      clicksGrowth: 0.08,
      topQueries: [{ query: 'zenai', impressions: 1000, clicks: 200, ctr: 0.2, position: 3.1 }],
      topPages: [],
    }),
    getAuthorizeUrl: jest.fn().mockReturnValue('https://accounts.google.com/o/oauth2/auth?...'),
    exchangeCode: jest.fn().mockResolvedValue(undefined),
    testConnection: jest.fn().mockResolvedValue({ success: true, message: 'Connected to GSC' }),
  },
  uptimeConnector: {
    isAvailable: jest.fn().mockReturnValue(true),
    getUptimeStatus: jest.fn().mockResolvedValue({
      percentage: 99.95,
      avgResponseTime: 245,
      incidents: [],
      monitors: [{ id: 'mon_1', name: 'API', status: 'up', uptime: 99.95, responseTime: 245 }],
    }),
    testConnection: jest.fn().mockResolvedValue({ success: true, message: 'Connected to UptimeRobot' }),
  },
  lighthouseConnector: {
    isAvailable: jest.fn().mockReturnValue(true),
    getLatestScores: jest.fn().mockResolvedValue({
      score: 92,
      accessibilityScore: 95,
      bestPracticesScore: 88,
      seoScore: 97,
      lcp: 1.8,
      fid: 12,
      cls: 0.05,
    }),
    getScores: jest.fn().mockResolvedValue({
      score: 92,
      accessibilityScore: 95,
      bestPracticesScore: 88,
      seoScore: 97,
      lcp: 1.8,
      fid: 12,
      cls: 0.05,
    }),
    runAuditAndStore: jest.fn().mockResolvedValue(undefined),
    testConnection: jest.fn().mockResolvedValue({ success: true, message: 'Lighthouse available' }),
  },
  getConnectorStatuses: jest.fn().mockReturnValue([
    { name: 'Stripe', type: 'stripe', available: true },
    { name: 'Google Search Console', type: 'gsc', available: true },
    { name: 'Google Analytics 4', type: 'ga4', available: true },
    { name: 'UptimeRobot', type: 'uptime', available: true },
    { name: 'Lighthouse', type: 'lighthouse', available: true },
  ]),
  insightGenerator: {
    generateDailyInsights: jest.fn().mockResolvedValue(undefined),
  },
  reportGenerator: {
    generateWeeklyReport: jest.fn().mockResolvedValue(undefined),
    generateMonthlyReport: jest.fn().mockResolvedValue(undefined),
  },
  dataAggregator: {
    triggerCollection: jest.fn().mockResolvedValue({ collected: 5, errors: [] }),
  },
}));

// Mock logger
jest.mock('../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import { businessRouter } from '../../routes/business/index';
import { pool } from '../../utils/database';
import {
  stripeConnector,
  ga4Connector,
  gscConnector,
  uptimeConnector,
  lighthouseConnector,
  getConnectorStatuses,
  insightGenerator,
  reportGenerator,
  dataAggregator,
} from '../../services/business';

const mockPoolQuery = pool.query as jest.Mock;

describe('Business Manager API Integration Tests', () => {
  let app: Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/business', businessRouter);
    app.use(errorHandler);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockPoolQuery.mockReset();
    mockPoolQuery.mockResolvedValue({ rows: [], rowCount: 0 } as any);
  });

  // ===========================================
  // GET /api/business/overview
  // ===========================================

  describe('GET /api/business/overview', () => {
    it('should return aggregated overview when all connectors are available', async () => {
      const response = await request(app)
        .get('/api/business/overview')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.overview).toBeDefined();
      expect(response.body.overview.revenue.mrr).toBe(5000);
      expect(response.body.overview.revenue.mrrGrowth).toBe(0.05);
      expect(response.body.overview.revenue.activeSubscriptions).toBe(10);
      expect(response.body.overview.revenue.churnRate).toBe(0.02);
      expect(response.body.overview.traffic.users).toBe(1200);
      expect(response.body.overview.traffic.sessions).toBe(1800);
      expect(response.body.overview.seo.impressions).toBe(50000);
      expect(response.body.overview.seo.clicks).toBe(2500);
      expect(response.body.overview.health.uptime).toBe(99.95);
      expect(response.body.overview.performance.score).toBe(92);
      expect(response.body.connectors).toBeDefined();
      expect(response.body.lastUpdated).toBeDefined();
    });

    it('should return zeroed overview when no connectors are available', async () => {
      (stripeConnector.isAvailable as jest.Mock).mockReturnValue(false);
      (ga4Connector.isAvailable as jest.Mock).mockReturnValue(false);
      (gscConnector.isAvailable as jest.Mock).mockReturnValue(false);
      (uptimeConnector.isAvailable as jest.Mock).mockReturnValue(false);
      (lighthouseConnector.getLatestScores as jest.Mock).mockResolvedValue(null);

      const response = await request(app)
        .get('/api/business/overview')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.overview.revenue.mrr).toBe(0);
      expect(response.body.overview.traffic.users).toBe(0);
      expect(response.body.overview.seo.impressions).toBe(0);
    });

    it('should include errors array when a connector fails', async () => {
      (stripeConnector.isAvailable as jest.Mock).mockReturnValue(true);
      (stripeConnector.getMetrics as jest.Mock).mockRejectedValue(new Error('Stripe API error'));
      (ga4Connector.isAvailable as jest.Mock).mockReturnValue(false);
      (gscConnector.isAvailable as jest.Mock).mockReturnValue(false);
      (uptimeConnector.isAvailable as jest.Mock).mockReturnValue(false);
      (lighthouseConnector.getLatestScores as jest.Mock).mockResolvedValue(null);

      const response = await request(app)
        .get('/api/business/overview')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.errors).toBeDefined();
      expect(response.body.errors).toContain('stripe');
    });

    it('should fall back to snapshot when connectors fail', async () => {
      (stripeConnector.isAvailable as jest.Mock).mockReturnValue(true);
      (stripeConnector.getMetrics as jest.Mock).mockRejectedValue(new Error('API error'));
      (ga4Connector.isAvailable as jest.Mock).mockReturnValue(false);
      (gscConnector.isAvailable as jest.Mock).mockReturnValue(false);
      (uptimeConnector.isAvailable as jest.Mock).mockReturnValue(false);
      (lighthouseConnector.getLatestScores as jest.Mock).mockResolvedValue(null);

      mockPoolQuery.mockResolvedValueOnce({
        rows: [{
          metrics: {
            stripe: { mrr: 4800, mrrGrowth: 0.03, activeSubscriptions: 9, churnRate: 0.01 },
          },
        }],
        rowCount: 1,
      } as any);

      const response = await request(app)
        .get('/api/business/overview')
        .expect(200);

      expect(response.body.success).toBe(true);
      // Revenue should come from snapshot fallback
      expect(response.body.overview.revenue.mrr).toBe(4800);
    });
  });

  // ===========================================
  // GET /api/business/revenue
  // ===========================================

  describe('GET /api/business/revenue', () => {
    it('should return revenue metrics when Stripe is available', async () => {
      (stripeConnector.isAvailable as jest.Mock).mockReturnValue(true);
      (stripeConnector.getMetrics as jest.Mock).mockResolvedValue({
        mrr: 5000,
        arr: 60000,
        activeSubscriptions: 10,
        churnRate: 0.02,
        mrrGrowth: 0.05,
        totalCustomers: 50,
        recentPayments: [],
      });

      const response = await request(app)
        .get('/api/business/revenue')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.revenue).toBeDefined();
      expect(response.body.revenue.mrr).toBe(5000);
      expect(response.body.revenue.arr).toBe(60000);
      expect(response.body.revenue.activeSubscriptions).toBe(10);
      expect(response.body.revenue.totalCustomers).toBe(50);
    });

    it('should return null revenue when Stripe is not configured', async () => {
      (stripeConnector.isAvailable as jest.Mock).mockReturnValue(false);

      const response = await request(app)
        .get('/api/business/revenue')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.revenue).toBeNull();
      expect(response.body.message).toBe('Stripe not configured');
    });
  });

  // ===========================================
  // GET /api/business/revenue/timeline
  // ===========================================

  describe('GET /api/business/revenue/timeline', () => {
    it('should return revenue timeline with default 30-day period', async () => {
      const response = await request(app)
        .get('/api/business/revenue/timeline')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.timeline).toBeDefined();
      expect(Array.isArray(response.body.timeline)).toBe(true);
      expect(response.body.period).toBe('30 days');
      expect(stripeConnector.getRevenueTimeline).toHaveBeenCalledWith(30);
    });

    it('should accept custom period via query parameter', async () => {
      const response = await request(app)
        .get('/api/business/revenue/timeline?period=90')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.period).toBe('90 days');
      expect(stripeConnector.getRevenueTimeline).toHaveBeenCalledWith(90);
    });

    it('should clamp period to min 7 and max 365 days', async () => {
      await request(app)
        .get('/api/business/revenue/timeline?period=3')
        .expect(200);
      expect(stripeConnector.getRevenueTimeline).toHaveBeenCalledWith(7);

      jest.clearAllMocks();

      await request(app)
        .get('/api/business/revenue/timeline?period=999')
        .expect(200);
      expect(stripeConnector.getRevenueTimeline).toHaveBeenCalledWith(365);
    });
  });

  // ===========================================
  // GET /api/business/revenue/events
  // ===========================================

  describe('GET /api/business/revenue/events', () => {
    it('should return recent revenue events', async () => {
      const response = await request(app)
        .get('/api/business/revenue/events')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.events).toBeDefined();
      expect(response.body.count).toBe(1);
      expect(stripeConnector.getRecentEvents).toHaveBeenCalledWith(20);
    });

    it('should accept custom limit', async () => {
      await request(app)
        .get('/api/business/revenue/events?limit=5')
        .expect(200);

      expect(stripeConnector.getRecentEvents).toHaveBeenCalledWith(5);
    });
  });

  // ===========================================
  // GET /api/business/traffic
  // ===========================================

  describe('GET /api/business/traffic', () => {
    it('should return traffic metrics when GA4 is available', async () => {
      (ga4Connector.isAvailable as jest.Mock).mockReturnValue(true);

      const response = await request(app)
        .get('/api/business/traffic')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.traffic).toBeDefined();
      expect(response.body.traffic.users).toBe(1200);
      expect(response.body.traffic.sessions).toBe(1800);
      expect(response.body.traffic.bounceRate).toBe(0.45);
      expect(ga4Connector.getTrafficMetrics).toHaveBeenCalledWith('7d');
    });

    it('should return null traffic when GA4 is not configured', async () => {
      (ga4Connector.isAvailable as jest.Mock).mockReturnValue(false);

      const response = await request(app)
        .get('/api/business/traffic')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.traffic).toBeNull();
      expect(response.body.message).toBe('Google Analytics not configured');
    });

    it('should accept custom period', async () => {
      (ga4Connector.isAvailable as jest.Mock).mockReturnValue(true);

      await request(app)
        .get('/api/business/traffic?period=30d')
        .expect(200);

      expect(ga4Connector.getTrafficMetrics).toHaveBeenCalledWith('30d');
    });
  });

  // ===========================================
  // GET /api/business/seo
  // ===========================================

  describe('GET /api/business/seo', () => {
    it('should return SEO metrics when GSC is available', async () => {
      (gscConnector.isAvailable as jest.Mock).mockReturnValue(true);

      const response = await request(app)
        .get('/api/business/seo')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.seo).toBeDefined();
      expect(response.body.seo.impressions).toBe(50000);
      expect(response.body.seo.clicks).toBe(2500);
      expect(response.body.seo.ctr).toBe(0.05);
      expect(response.body.seo.avgPosition).toBe(15.2);
    });

    it('should return null seo when GSC is not configured', async () => {
      (gscConnector.isAvailable as jest.Mock).mockReturnValue(false);

      const response = await request(app)
        .get('/api/business/seo')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.seo).toBeNull();
      expect(response.body.message).toBe('Google Search Console not configured');
    });

    it('should accept custom period', async () => {
      (gscConnector.isAvailable as jest.Mock).mockReturnValue(true);

      await request(app)
        .get('/api/business/seo?period=90d')
        .expect(200);

      expect(gscConnector.getSearchMetrics).toHaveBeenCalledWith(
        expect.any(String),
        '90d',
      );
    });
  });

  // ===========================================
  // GET /api/business/health
  // ===========================================

  describe('GET /api/business/health', () => {
    it('should return combined health status with uptime and performance', async () => {
      (uptimeConnector.isAvailable as jest.Mock).mockReturnValue(true);
      (uptimeConnector.getUptimeStatus as jest.Mock).mockResolvedValue({
        percentage: 99.95,
        avgResponseTime: 245,
        incidents: [],
        monitors: [{ id: 'mon_1', name: 'API', status: 'up', uptime: 99.95, responseTime: 245 }],
      });
      (lighthouseConnector.getLatestScores as jest.Mock).mockResolvedValue({
        score: 92,
        accessibilityScore: 95,
        bestPracticesScore: 88,
        seoScore: 97,
        lcp: 1.8,
        fid: 12,
        cls: 0.05,
      });

      const response = await request(app)
        .get('/api/business/health')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.health).toBeDefined();
      expect(response.body.health.uptime.percentage).toBe(99.95);
      expect(response.body.health.uptime.avgResponseTime).toBe(245);
      expect(response.body.health.performance.score).toBe(92);
      expect(response.body.health.performance.lcp).toBe(1.8);
    });

    it('should return defaults when uptime connector is not available', async () => {
      (uptimeConnector.isAvailable as jest.Mock).mockReturnValue(false);

      const response = await request(app)
        .get('/api/business/health')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.health.uptime.percentage).toBe(100);
      expect(response.body.health.uptime.incidents).toEqual([]);
    });

    it('should return default performance when lighthouse returns null', async () => {
      (uptimeConnector.isAvailable as jest.Mock).mockReturnValue(false);
      (lighthouseConnector.getLatestScores as jest.Mock).mockResolvedValue(null);

      const response = await request(app)
        .get('/api/business/health')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.health.performance.score).toBe(0);
    });
  });

  // ===========================================
  // GET /api/business/insights
  // ===========================================

  describe('GET /api/business/insights', () => {
    it('should return active insights from database', async () => {
      const mockInsights = [
        {
          id: 'insight-1',
          insight_type: 'anomaly',
          severity: 'warning',
          title: 'Revenue Drop Detected',
          description: 'MRR dropped 15% compared to last month',
          data_source: 'stripe',
          related_metrics: { mrr: 5000, previousMrr: 5900 },
          action_items: [{ title: 'Review churn', description: 'Check recent cancellations', priority: 'high' }],
          status: 'active',
          generated_at: '2026-02-10T08:00:00Z',
          dismissed_at: null,
        },
        {
          id: 'insight-2',
          insight_type: 'trend',
          severity: 'info',
          title: 'Traffic Increasing',
          description: 'Organic traffic up 20%',
          data_source: 'ga4',
          related_metrics: {},
          action_items: [],
          status: 'active',
          generated_at: '2026-02-10T08:00:00Z',
          dismissed_at: null,
        },
      ];

      mockPoolQuery.mockResolvedValueOnce({ rows: mockInsights, rowCount: 2 } as any);

      const response = await request(app)
        .get('/api/business/insights')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.insights).toHaveLength(2);
      expect(response.body.count).toBe(2);
      expect(response.body.insights[0].id).toBe('insight-1');
      expect(response.body.insights[0].severity).toBe('warning');
      expect(response.body.insights[1].insight_type).toBe('trend');
    });

    it('should return empty array when no insights exist', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      const response = await request(app)
        .get('/api/business/insights')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.insights).toEqual([]);
      expect(response.body.count).toBe(0);
    });

    it('should filter by status query parameter', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      await request(app)
        .get('/api/business/insights?status=dismissed')
        .expect(200);

      expect(mockPoolQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE status = $1'),
        ['dismissed', 50],
      );
    });

    it('should respect limit query parameter', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      await request(app)
        .get('/api/business/insights?limit=10')
        .expect(200);

      expect(mockPoolQuery).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT $2'),
        ['active', 10],
      );
    });
  });

  // ===========================================
  // POST /api/business/insights/generate
  // ===========================================

  describe('POST /api/business/insights/generate', () => {
    it('should trigger insight generation and return new insights', async () => {
      const generatedInsights = [
        {
          id: 'new-1',
          insight_type: 'recommendation',
          severity: 'info',
          title: 'Optimize Landing Page',
          description: 'Landing page bounce rate is above average',
          status: 'active',
          generated_at: '2026-02-10T09:00:00Z',
        },
      ];

      mockPoolQuery.mockResolvedValueOnce({ rows: generatedInsights, rowCount: 1 } as any);

      const response = await request(app)
        .post('/api/business/insights/generate')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(insightGenerator.generateDailyInsights).toHaveBeenCalled();
      expect(response.body.insights).toHaveLength(1);
      expect(response.body.count).toBe(1);
    });
  });

  // ===========================================
  // POST /api/business/insights/:id/dismiss
  // ===========================================

  describe('POST /api/business/insights/:id/dismiss', () => {
    it('should dismiss an existing insight', async () => {
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ id: 'insight-1' }],
        rowCount: 1,
      } as any);

      const response = await request(app)
        .post('/api/business/insights/insight-1/dismiss')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Insight dismissed');
      expect(mockPoolQuery).toHaveBeenCalledWith(
        expect.stringContaining('SET status = \'dismissed\''),
        ['insight-1'],
      );
    });

    it('should return 404 for non-existent insight', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      const response = await request(app)
        .post('/api/business/insights/nonexistent/dismiss')
        .expect(404);

      expect(response.body.success).toBe(false);
    });
  });

  // ===========================================
  // POST /api/business/insights/:id/act
  // ===========================================

  describe('POST /api/business/insights/:id/act', () => {
    it('should mark insight as acted on', async () => {
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ id: 'insight-1' }],
        rowCount: 1,
      } as any);

      const response = await request(app)
        .post('/api/business/insights/insight-1/act')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Insight marked as acted on');
      expect(mockPoolQuery).toHaveBeenCalledWith(
        expect.stringContaining('SET status = \'acted_on\''),
        ['insight-1'],
      );
    });

    it('should return 404 for non-existent insight', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      const response = await request(app)
        .post('/api/business/insights/nonexistent/act')
        .expect(404);

      expect(response.body.success).toBe(false);
    });
  });

  // ===========================================
  // GET /api/business/reports
  // ===========================================

  describe('GET /api/business/reports', () => {
    it('should return list of generated reports', async () => {
      const mockReports = [
        {
          id: 'report-1',
          report_type: 'weekly',
          period_start: '2026-02-03',
          period_end: '2026-02-09',
          summary: 'Weekly business summary',
          metrics: { revenue: { mrr: 5000 } },
          insights: [],
          recommendations: [],
          generated_at: '2026-02-10T00:00:00Z',
        },
      ];

      mockPoolQuery.mockResolvedValueOnce({ rows: mockReports, rowCount: 1 } as any);

      const response = await request(app)
        .get('/api/business/reports')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.reports).toHaveLength(1);
      expect(response.body.count).toBe(1);
      expect(response.body.reports[0].report_type).toBe('weekly');
    });

    it('should filter by report type when specified', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      await request(app)
        .get('/api/business/reports?type=monthly')
        .expect(200);

      expect(mockPoolQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE report_type = $1'),
        ['monthly', 10],
      );
    });

    it('should return empty array when no reports exist', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      const response = await request(app)
        .get('/api/business/reports')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.reports).toEqual([]);
      expect(response.body.count).toBe(0);
    });
  });

  // ===========================================
  // POST /api/business/reports/generate
  // ===========================================

  describe('POST /api/business/reports/generate', () => {
    it('should generate a weekly report by default', async () => {
      const mockReport = {
        id: 'report-new',
        report_type: 'weekly',
        period_start: '2026-02-03',
        period_end: '2026-02-09',
        summary: 'Generated weekly report',
        generated_at: '2026-02-10T09:00:00Z',
      };

      mockPoolQuery.mockResolvedValueOnce({ rows: [mockReport], rowCount: 1 } as any);

      const response = await request(app)
        .post('/api/business/reports/generate')
        .send({})
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(reportGenerator.generateWeeklyReport).toHaveBeenCalled();
      expect(response.body.report).toBeDefined();
      expect(response.body.report.report_type).toBe('weekly');
    });

    it('should generate a monthly report when type is monthly', async () => {
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ id: 'report-monthly', report_type: 'monthly' }],
        rowCount: 1,
      } as any);

      const response = await request(app)
        .post('/api/business/reports/generate')
        .send({ type: 'monthly' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(reportGenerator.generateMonthlyReport).toHaveBeenCalled();
    });

    it('should reject invalid report type with validation error', async () => {
      const response = await request(app)
        .post('/api/business/reports/generate')
        .send({ type: 'daily' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid report type');
    });
  });

  // ===========================================
  // GET /api/business/connectors
  // ===========================================

  describe('GET /api/business/connectors', () => {
    it('should return list of configured connectors and their statuses', async () => {
      const mockConnectors = [
        {
          id: 'src-1',
          source_type: 'stripe',
          display_name: 'Stripe Production',
          status: 'active',
          last_sync: '2026-02-10T08:00:00Z',
          last_error: null,
          created_at: '2026-01-01T00:00:00Z',
        },
        {
          id: 'src-2',
          source_type: 'ga4',
          display_name: 'Google Analytics',
          status: 'active',
          last_sync: '2026-02-10T07:00:00Z',
          last_error: null,
          created_at: '2026-01-01T00:00:00Z',
        },
      ];

      mockPoolQuery.mockResolvedValueOnce({ rows: mockConnectors, rowCount: 2 } as any);

      const response = await request(app)
        .get('/api/business/connectors')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.connectors).toHaveLength(2);
      expect(response.body.count).toBe(2);
      expect(response.body.available).toBeDefined();
      expect(response.body.available).toHaveLength(5);
      expect(getConnectorStatuses).toHaveBeenCalled();
    });

    it('should return empty connectors when none configured', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      const response = await request(app)
        .get('/api/business/connectors')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.connectors).toEqual([]);
      expect(response.body.count).toBe(0);
      // Available statuses should still be returned
      expect(response.body.available).toBeDefined();
    });
  });

  // ===========================================
  // POST /api/business/connectors
  // ===========================================

  describe('POST /api/business/connectors', () => {
    it('should add a new data source', async () => {
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ id: 'src-new', source_type: 'stripe', display_name: 'New Stripe', status: 'active', created_at: '2026-02-10' }],
        rowCount: 1,
      } as any);

      const response = await request(app)
        .post('/api/business/connectors')
        .send({ source_type: 'stripe', display_name: 'New Stripe', config: { mode: 'live' } })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.connector).toBeDefined();
      expect(response.body.connector.source_type).toBe('stripe');
    });

    it('should reject invalid source_type', async () => {
      const response = await request(app)
        .post('/api/business/connectors')
        .send({ source_type: 'invalid', display_name: 'Test' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid source_type');
    });

    it('should reject missing display_name', async () => {
      const response = await request(app)
        .post('/api/business/connectors')
        .send({ source_type: 'stripe' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('display_name is required');
    });
  });

  // ===========================================
  // POST /api/business/connectors/:type/test
  // ===========================================

  describe('POST /api/business/connectors/:type/test', () => {
    it('should test a connector connection', async () => {
      const response = await request(app)
        .post('/api/business/connectors/stripe/test')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.test).toBeDefined();
      expect(response.body.test.success).toBe(true);
      expect(response.body.test.message).toBe('Connected to Stripe');
    });

    it('should reject unknown connector type', async () => {
      const response = await request(app)
        .post('/api/business/connectors/unknown/test')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Unknown connector type');
    });
  });

  // ===========================================
  // POST /api/business/connectors/collect
  // ===========================================

  describe('POST /api/business/connectors/collect', () => {
    it('should trigger manual data collection', async () => {
      const response = await request(app)
        .post('/api/business/connectors/collect')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.collected).toBe(5);
      expect(response.body.errors).toEqual([]);
      expect(dataAggregator.triggerCollection).toHaveBeenCalled();
    });
  });

  // ===========================================
  // DELETE /api/business/connectors/:id
  // ===========================================

  describe('DELETE /api/business/connectors/:id', () => {
    it('should remove a connector', async () => {
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ id: 'src-1' }],
        rowCount: 1,
      } as any);

      const response = await request(app)
        .delete('/api/business/connectors/src-1')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Connector removed');
    });

    it('should return 404 for non-existent connector', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      const response = await request(app)
        .delete('/api/business/connectors/nonexistent')
        .expect(404);

      expect(response.body.success).toBe(false);
    });
  });

  // ===========================================
  // GET /api/business/reports/latest
  // ===========================================

  describe('GET /api/business/reports/latest', () => {
    it('should return the most recent report', async () => {
      const mockReport = {
        id: 'report-latest',
        report_type: 'weekly',
        period_start: '2026-02-03',
        period_end: '2026-02-09',
        summary: 'Latest weekly report',
        generated_at: '2026-02-10',
      };

      mockPoolQuery.mockResolvedValueOnce({ rows: [mockReport], rowCount: 1 } as any);

      const response = await request(app)
        .get('/api/business/reports/latest')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.report).toBeDefined();
      expect(response.body.report.id).toBe('report-latest');
    });

    it('should return null report when none exist', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      const response = await request(app)
        .get('/api/business/reports/latest')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.report).toBeNull();
    });
  });

  // ===========================================
  // Business Health Sub-routes
  // ===========================================

  describe('GET /api/business/health/uptime', () => {
    it('should return detailed uptime data when available', async () => {
      (uptimeConnector.isAvailable as jest.Mock).mockReturnValue(true);

      const response = await request(app)
        .get('/api/business/health/uptime')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.uptime).toBeDefined();
      expect(response.body.uptime.percentage).toBe(99.95);
      expect(response.body.uptime.monitors).toHaveLength(1);
    });

    it('should return null when UptimeRobot is not configured', async () => {
      (uptimeConnector.isAvailable as jest.Mock).mockReturnValue(false);

      const response = await request(app)
        .get('/api/business/health/uptime')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.uptime).toBeNull();
      expect(response.body.message).toBe('UptimeRobot not configured');
    });
  });

  describe('GET /api/business/health/performance', () => {
    it('should return performance scores timeline', async () => {
      const mockScores = [
        { date: '2026-02-08', score: 90, lcp: 2.0, fid: 15, cls: 0.06 },
        { date: '2026-02-09', score: 92, lcp: 1.8, fid: 12, cls: 0.05 },
      ];

      mockPoolQuery.mockResolvedValueOnce({ rows: mockScores, rowCount: 2 } as any);

      const response = await request(app)
        .get('/api/business/health/performance')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.timeline).toHaveLength(2);
      expect(response.body.period).toBe('30 days');
    });
  });

  // ===========================================
  // SEO Sub-routes
  // ===========================================

  describe('GET /api/business/seo/queries', () => {
    it('should return top search queries from latest snapshot', async () => {
      const mockQueries = [
        { query: 'zenai platform', impressions: 500, clicks: 50, ctr: 0.1, position: 5.2 },
        { query: 'ai business manager', impressions: 300, clicks: 30, ctr: 0.1, position: 8.1 },
      ];

      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ queries: mockQueries }],
        rowCount: 1,
      } as any);

      const response = await request(app)
        .get('/api/business/seo/queries')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.queries).toHaveLength(2);
      expect(response.body.queries[0].query).toBe('zenai platform');
    });

    it('should return empty array when no snapshot exists', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      const response = await request(app)
        .get('/api/business/seo/queries')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.queries).toEqual([]);
    });
  });

  // ===========================================
  // Google OAuth Routes
  // ===========================================

  describe('GET /api/business/connectors/google/authorize', () => {
    it('should return Google OAuth authorize URL', async () => {
      const response = await request(app)
        .get('/api/business/connectors/google/authorize')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.authorizeUrl).toBeDefined();
      expect(response.body.authorizeUrl).toContain('accounts.google.com');
    });
  });
});
