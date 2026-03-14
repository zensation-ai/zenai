/**
 * Phase 61: Observability Routes Tests
 *
 * Tests for all observability API endpoints, auth, and error cases.
 */

import express from 'express';
import request from 'supertest';

// Mock auth middleware
jest.mock('../../../middleware/auth', () => ({
  apiKeyAuth: jest.fn((_req: unknown, _res: unknown, next: () => void) => next()),
  requireScope: jest.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}));

// Mock metrics module
jest.mock('../../../services/observability/metrics', () => ({
  getMetricSnapshots: jest.fn().mockReturnValue([
    {
      name: 'ai.tokens.total',
      type: 'counter',
      value: 500,
      labels: { model: 'claude-3' },
      recordedAt: '2026-03-14T12:00:00Z',
    },
  ]),
  getMetricsSummary: jest.fn().mockReturnValue({
    'ai.tokens.total': { count: 10, lastValue: 500, lastRecorded: '2026-03-14T12:00:00Z' },
  }),
  isMetricsEnabled: jest.fn().mockReturnValue(true),
}));

// Mock tracing module
jest.mock('../../../services/observability/tracing', () => ({
  isTracingEnabled: jest.fn().mockReturnValue(true),
}));

// Mock queue service - use inline jest.fn() to avoid hoisting issues
jest.mock('../../../services/queue/job-queue', () => ({
  getQueueService: jest.fn().mockReturnValue({
    getAllStats: jest.fn().mockResolvedValue([
      { name: 'memory-consolidation', waiting: 5, active: 2, completed: 100, failed: 3, delayed: 1 },
      { name: 'rag-indexing', waiting: 3, active: 0, completed: 50, failed: 1, delayed: 0 },
    ]),
    getQueueStats: jest.fn().mockResolvedValue({
      name: 'memory-consolidation',
      waiting: 5,
      active: 2,
      completed: 100,
      failed: 3,
      delayed: 1,
    }),
    cleanQueue: jest.fn().mockResolvedValue(10),
    isAvailable: jest.fn().mockReturnValue(true),
    getQueueNames: jest.fn().mockReturnValue(['memory-consolidation', 'rag-indexing', 'email-processing', 'graph-indexing']),
  }),
  QUEUE_NAMES: ['memory-consolidation', 'rag-indexing', 'email-processing', 'graph-indexing'],
}));

jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import { observabilityRouter } from '../../../routes/observability';
import { errorHandler } from '../../../middleware/errorHandler';
import { getQueueService } from '../../../services/queue/job-queue';

// Get references to the mock functions for per-test overrides
const mockQueueService = getQueueService() as {
  getAllStats: jest.Mock;
  getQueueStats: jest.Mock;
  cleanQueue: jest.Mock;
  isAvailable: jest.Mock;
  getQueueNames: jest.Mock;
};

describe('Observability Routes', () => {
  let app: express.Application;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/observability', observabilityRouter);
    app.use(errorHandler);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // Restore default mock return values after clearAllMocks
    mockQueueService.getAllStats.mockResolvedValue([
      { name: 'memory-consolidation', waiting: 5, active: 2, completed: 100, failed: 3, delayed: 1 },
      { name: 'rag-indexing', waiting: 3, active: 0, completed: 50, failed: 1, delayed: 0 },
    ]);
    mockQueueService.getQueueStats.mockResolvedValue({
      name: 'memory-consolidation',
      waiting: 5,
      active: 2,
      completed: 100,
      failed: 3,
      delayed: 1,
    });
    mockQueueService.cleanQueue.mockResolvedValue(10);
    mockQueueService.isAvailable.mockReturnValue(true);
    mockQueueService.getQueueNames.mockReturnValue(['memory-consolidation', 'rag-indexing', 'email-processing', 'graph-indexing']);
  });

  describe('GET /api/observability/metrics', () => {
    it('should return metric snapshots', async () => {
      const res = await request(app)
        .get('/api/observability/metrics')
        .set('x-api-key', 'test-key');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.snapshots).toBeDefined();
      expect(res.body.data.summary).toBeDefined();
      expect(res.body.data.metricsEnabled).toBe(true);
    });

    it('should accept limit parameter', async () => {
      const res = await request(app)
        .get('/api/observability/metrics?limit=50')
        .set('x-api-key', 'test-key');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should include snapshot count', async () => {
      const res = await request(app)
        .get('/api/observability/metrics')
        .set('x-api-key', 'test-key');

      expect(res.body.data.count).toBeDefined();
    });
  });

  describe('GET /api/observability/queue-stats', () => {
    it('should return all queue statistics', async () => {
      const res = await request(app)
        .get('/api/observability/queue-stats')
        .set('x-api-key', 'test-key');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.queues).toHaveLength(2);
      expect(res.body.data.available).toBe(true);
      expect(res.body.data.queueNames).toHaveLength(4);
    });

    it('should include queue availability status', async () => {
      mockQueueService.isAvailable.mockReturnValueOnce(false);
      const res = await request(app)
        .get('/api/observability/queue-stats')
        .set('x-api-key', 'test-key');

      expect(res.body.data.available).toBe(false);
    });
  });

  describe('GET /api/observability/queue-stats/:name', () => {
    it('should return stats for a specific queue', async () => {
      const res = await request(app)
        .get('/api/observability/queue-stats/memory-consolidation')
        .set('x-api-key', 'test-key');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('memory-consolidation');
      expect(res.body.data.waiting).toBe(5);
    });

    it('should return 400 for unknown queue name', async () => {
      const res = await request(app)
        .get('/api/observability/queue-stats/unknown-queue')
        .set('x-api-key', 'test-key');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should return 404 when queue stats are null', async () => {
      mockQueueService.getQueueStats.mockResolvedValueOnce(null);
      const res = await request(app)
        .get('/api/observability/queue-stats/memory-consolidation')
        .set('x-api-key', 'test-key');

      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/observability/health', () => {
    it('should return extended health status', async () => {
      const res = await request(app)
        .get('/api/observability/health')
        .set('x-api-key', 'test-key');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.tracing.enabled).toBe(true);
      expect(res.body.data.metrics.enabled).toBe(true);
      expect(res.body.data.queues.available).toBe(true);
      expect(res.body.data.timestamp).toBeDefined();
    });

    it('should include total active and failed counts', async () => {
      const res = await request(app)
        .get('/api/observability/health')
        .set('x-api-key', 'test-key');

      expect(res.body.data.queues.totalActive).toBe(2);
      expect(res.body.data.queues.totalFailed).toBe(4);
    });

    it('should include queue details', async () => {
      const res = await request(app)
        .get('/api/observability/health')
        .set('x-api-key', 'test-key');

      expect(res.body.data.queues.queues).toHaveLength(2);
    });
  });

  describe('POST /api/observability/queue/:name/clean', () => {
    it('should clean completed jobs from a queue', async () => {
      const res = await request(app)
        .post('/api/observability/queue/memory-consolidation/clean')
        .set('x-api-key', 'test-key')
        .send({ status: 'completed' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.queue).toBe('memory-consolidation');
      expect(res.body.data.cleaned).toBe(10);
    });

    it('should clean failed jobs', async () => {
      const res = await request(app)
        .post('/api/observability/queue/rag-indexing/clean')
        .set('x-api-key', 'test-key')
        .send({ status: 'failed' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('failed');
    });

    it('should return 400 for unknown queue name', async () => {
      const res = await request(app)
        .post('/api/observability/queue/unknown-queue/clean')
        .set('x-api-key', 'test-key')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should use default status and grace period', async () => {
      const res = await request(app)
        .post('/api/observability/queue/email-processing/clean')
        .set('x-api-key', 'test-key')
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('completed');
    });

    it('should accept custom grace period', async () => {
      const res = await request(app)
        .post('/api/observability/queue/graph-indexing/clean')
        .set('x-api-key', 'test-key')
        .send({ gracePeriodMs: 7200000 });

      expect(res.status).toBe(200);
      expect(mockQueueService.cleanQueue).toHaveBeenCalledWith('graph-indexing', 'completed', 7200000);
    });
  });

  describe('error handling', () => {
    it('should return 404 for unknown routes', async () => {
      const res = await request(app)
        .get('/api/observability/unknown-endpoint')
        .set('x-api-key', 'test-key');

      expect(res.status).toBe(404);
    });
  });
});
