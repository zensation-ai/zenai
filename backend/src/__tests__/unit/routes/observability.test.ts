/**
 * Observability Route Tests
 *
 * Tests the REST API for metrics, queue stats, and extended health.
 */

import express from 'express';
import request from 'supertest';
import { observabilityRouter } from '../../../routes/observability';
import { errorHandler } from '../../../middleware/errorHandler';

// Per-test toggleable auth — lets individual tests simulate non-admin / unauth.
const authState = { allowApiKey: true, allowedScopes: new Set(['read', 'admin']) };

jest.mock('../../../middleware/auth', () => ({
  apiKeyAuth: (_req: unknown, res: { status: (n: number) => { json: (b: unknown) => unknown } }, next: () => void) => {
    if (!authState.allowApiKey) {
      res.status(401).json({ success: false, error: 'unauthorized' });
      return;
    }
    next();
  },
  requireScope: (scope: string) =>
    (_req: unknown, res: { status: (n: number) => { json: (b: unknown) => unknown } }, next: () => void) => {
      if (!authState.allowedScopes.has(scope)) {
        res.status(403).json({ success: false, error: 'forbidden', required_scope: scope });
        return;
      }
      next();
    },
}));

const mockGetMetricSnapshots = jest.fn();
const mockGetMetricsSummary = jest.fn();
const mockIsMetricsEnabled = jest.fn();

jest.mock('../../../services/observability/metrics', () => ({
  getMetricSnapshots: (...args: unknown[]) => mockGetMetricSnapshots(...args),
  getMetricsSummary: (...args: unknown[]) => mockGetMetricsSummary(...args),
  isMetricsEnabled: (...args: unknown[]) => mockIsMetricsEnabled(...args),
}));

const mockIsTracingEnabled = jest.fn();

jest.mock('../../../services/observability/tracing', () => ({
  isTracingEnabled: (...args: unknown[]) => mockIsTracingEnabled(...args),
}));

const mockQueueService = {
  getAllStats: jest.fn(),
  getQueueStats: jest.fn(),
  isAvailable: jest.fn(),
  getQueueNames: jest.fn(),
  cleanQueue: jest.fn(),
};

jest.mock('../../../services/queue/job-queue', () => ({
  getQueueService: () => mockQueueService,
  QUEUE_NAMES: ['memory-consolidation', 'rag-indexing', 'email-processing', 'graph-indexing', 'sleep-compute'],
}));

const mockGetWorkerHealth = jest.fn();

jest.mock('../../../services/queue/workers', () => ({
  getWorkerHealth: (...args: unknown[]) => mockGetWorkerHealth(...args),
}));

const mockGetPoolStats = jest.fn();
const mockQueryPublic = jest.fn();
const mockQueryContext = jest.fn();

jest.mock('../../../utils/database-context', () => ({
  getPoolStats: (...args: unknown[]) => mockGetPoolStats(...args),
  queryPublic: (...args: unknown[]) => mockQueryPublic(...args),
  queryContext: (...args: unknown[]) => mockQueryContext(...args),
}));

describe('Observability Routes', () => {
  let app: express.Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/observability', observabilityRouter);
    app.use(errorHandler);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockIsMetricsEnabled.mockReturnValue(true);
    mockIsTracingEnabled.mockReturnValue(false);
    mockQueueService.isAvailable.mockReturnValue(true);
    mockQueueService.getQueueNames.mockReturnValue(['memory-consolidation']);
    authState.allowApiKey = true;
    authState.allowedScopes = new Set(['read', 'admin']);
  });

  describe('GET /metrics', () => {
    it('should return metric snapshots', async () => {
      mockGetMetricSnapshots.mockReturnValue([{ name: 'ai.tokens', value: 1000 }]);
      mockGetMetricsSummary.mockReturnValue({ totalSnapshots: 1 });
      const res = await request(app).get('/api/observability/metrics');
      expect(res.status).toBe(200);
      expect(res.body.data.snapshots).toHaveLength(1);
      expect(res.body.data.metricsEnabled).toBe(true);
    });
  });

  describe('GET /queue-stats', () => {
    it('should return all queue stats', async () => {
      mockQueueService.getAllStats.mockResolvedValue([{ name: 'memory-consolidation', active: 2, waiting: 5, failed: 0 }]);
      const res = await request(app).get('/api/observability/queue-stats');
      expect(res.status).toBe(200);
      expect(res.body.data.queues).toHaveLength(1);
      expect(res.body.data.available).toBe(true);
    });
  });

  describe('GET /queue-stats/:name', () => {
    it('should return stats for a specific queue', async () => {
      mockQueueService.getQueueStats.mockResolvedValue({ name: 'memory-consolidation', active: 1 });
      const res = await request(app).get('/api/observability/queue-stats/memory-consolidation');
      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('memory-consolidation');
    });

    it('should reject unknown queue name', async () => {
      const res = await request(app).get('/api/observability/queue-stats/nonexistent');
      expect(res.status).toBe(400);
    });

    it('should return 404 when queue stats not found', async () => {
      mockQueueService.getQueueStats.mockResolvedValue(null);
      const res = await request(app).get('/api/observability/queue-stats/rag-indexing');
      expect(res.status).toBe(404);
    });
  });

  describe('GET /health', () => {
    it('should return extended health status', async () => {
      mockQueueService.getAllStats.mockResolvedValue([{ active: 1, failed: 0 }]);
      mockGetPoolStats.mockReturnValue({ pool: { total: 8 }, events: {}, contexts: {} });
      mockGetWorkerHealth.mockReturnValue({ running: true });
      const res = await request(app).get('/api/observability/health');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty('tracing');
      expect(res.body.data).toHaveProperty('metrics');
      expect(res.body.data).toHaveProperty('queues');
      expect(res.body.data).toHaveProperty('workers');
      expect(res.body.data).toHaveProperty('database');
      expect(res.body.data).toHaveProperty('timestamp');
    });
  });

  describe('GET /saas-summary (Sprint 1.6)', () => {
    function primeSummaryQueries() {
      mockQueryPublic
        // active sessions
        .mockResolvedValueOnce({ rows: [{ active: 42 }] })
        // plan distribution
        .mockResolvedValueOnce({
          rows: [
            { plan: 'free', count: 120 },
            { plan: 'personal', count: 15 },
            { plan: 'pro', count: 8 },
            { plan: 'business', count: 2 },
          ],
        })
        // new subs in last 24h — only 2 personal + 1 pro
        .mockResolvedValueOnce({
          rows: [
            { plan: 'personal', count: 2 },
            { plan: 'pro', count: 1 },
          ],
        });
      mockQueryContext.mockResolvedValue({ rows: [{ count: 7 }] });
    }

    it('returns the expected top-level shape', async () => {
      primeSummaryQueries();

      const res = await request(app).get('/api/observability/saas-summary');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(
        expect.objectContaining({
          active_sessions: 42,
          plans: expect.any(Object),
          revenue_proxy_eur_24h: expect.any(Number),
          contexts: expect.any(Object),
          timestamp: expect.any(String),
        }),
      );
      // Revenue proxy = 2×19 + 1×39 = 77 EUR
      expect(res.body.data.revenue_proxy_eur_24h).toBe(77);
      expect(res.body.data.plans.pro).toBe(8);
    });

    it('aggregates context stats across ALL 4 schemas', async () => {
      primeSummaryQueries();

      const res = await request(app).get('/api/observability/saas-summary');

      expect(res.status).toBe(200);
      const contextsTouched = mockQueryContext.mock.calls
        .map(call => call[0] as string)
        .filter(ctx => ['operations', 'finance', 'people', 'strategy'].includes(ctx));
      expect(new Set(contextsTouched)).toEqual(
        new Set(['operations', 'finance', 'people', 'strategy']),
      );
      // All 4 contexts present in the response
      expect(Object.keys(res.body.data.contexts).sort()).toEqual([
        'finance', 'operations', 'people', 'strategy',
      ]);
    });

    it('returns 403 when caller lacks the admin scope', async () => {
      authState.allowedScopes = new Set(['read']); // read-only key — no admin

      const res = await request(app).get('/api/observability/saas-summary');

      expect(res.status).toBe(403);
      expect(res.body.required_scope).toBe('admin');
      // No DB traffic when authorization fails upstream
      expect(mockQueryPublic).not.toHaveBeenCalled();
    });

    it('returns 401 when unauthenticated', async () => {
      authState.allowApiKey = false;

      const res = await request(app).get('/api/observability/saas-summary');

      expect(res.status).toBe(401);
      expect(mockQueryPublic).not.toHaveBeenCalled();
    });

    it('returns a fresh ISO-8601 timestamp on every call (cache-busting)', async () => {
      primeSummaryQueries();
      const r1 = await request(app).get('/api/observability/saas-summary');

      primeSummaryQueries(); // prime the second batch of queries
      await new Promise(r => setTimeout(r, 5));
      const r2 = await request(app).get('/api/observability/saas-summary');

      expect(r1.body.data.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(r2.body.data.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(r2.body.data.timestamp).not.toBe(r1.body.data.timestamp);
    });

    it('treats missing memory_items table as zero rather than failing', async () => {
      mockQueryPublic
        .mockResolvedValueOnce({ rows: [{ active: 0 }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });
      // Even contexts with a missing table are handled gracefully
      mockQueryContext.mockRejectedValue(new Error('relation "memory_items" does not exist'));

      const res = await request(app).get('/api/observability/saas-summary');

      expect(res.status).toBe(200);
      expect(res.body.data.contexts.operations).toEqual({ ideas: 0, memories: 0 });
      expect(res.body.data.revenue_proxy_eur_24h).toBe(0);
    });
  });

  describe('POST /queue/:name/clean', () => {
    it('should clean completed jobs from a queue', async () => {
      mockQueueService.cleanQueue.mockResolvedValue(5);
      const res = await request(app).post('/api/observability/queue/memory-consolidation/clean').send({ status: 'completed' });
      expect(res.status).toBe(200);
      expect(res.body.data.cleaned).toBe(5);
      expect(res.body.data.queue).toBe('memory-consolidation');
    });

    it('should reject unknown queue name', async () => {
      const res = await request(app).post('/api/observability/queue/nonexistent/clean');
      expect(res.status).toBe(400);
    });
  });
});
