/**
 * Observability Route Tests
 *
 * Tests the REST API for metrics, queue stats, and extended health.
 */

import express from 'express';
import request from 'supertest';
import { observabilityRouter } from '../../../routes/observability';
import { errorHandler } from '../../../middleware/errorHandler';

jest.mock('../../../middleware/auth', () => ({
  apiKeyAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireScope: () => (_req: unknown, _res: unknown, next: () => void) => next(),
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

jest.mock('../../../utils/database-context', () => ({
  getPoolStats: (...args: unknown[]) => mockGetPoolStats(...args),
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
