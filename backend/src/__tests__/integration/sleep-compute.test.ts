/**
 * Integration Tests for Sleep Compute API
 *
 * Tests sleep compute logs, stats, manual trigger, idle status, and context-v2 endpoints.
 */

import express, { Express } from 'express';
import request from 'supertest';

// Mock dependencies BEFORE imports
jest.mock('../../middleware/auth', () => ({
  apiKeyAuth: jest.fn((_req: unknown, _res: unknown, next: () => void) => next()),
  requireScope: jest.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}));

jest.mock('../../utils/user-context', () => ({
  getUserId: jest.fn(() => '00000000-0000-0000-0000-000000000001'),
  SYSTEM_USER_ID: '00000000-0000-0000-0000-000000000001',
}));

jest.mock('../../utils/logger', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const mockQueryContext = jest.fn();

jest.mock('../../utils/database-context', () => ({
  queryContext: (...args: unknown[]) => mockQueryContext(...args),
  isValidContext: jest.fn((ctx: string) => ['personal', 'work', 'learning', 'creative'].includes(ctx)),
  AIContext: {},
}));

const mockRunSleepCycle = jest.fn();
const mockIsSystemIdle = jest.fn();

jest.mock('../../services/memory/sleep-compute', () => ({
  getSleepComputeEngine: jest.fn(() => ({
    runSleepCycle: (...args: unknown[]) => mockRunSleepCycle(...args),
    isSystemIdle: (...args: unknown[]) => mockIsSystemIdle(...args),
  })),
}));

const mockClassifyDomain = jest.fn();
const mockEstimateComplexity = jest.fn();
const mockSelectModel = jest.fn();
const mockAssembleContext = jest.fn();
const mockCleanExpiredCache = jest.fn();

jest.mock('../../services/context-engine-v2', () => ({
  getContextEngineV2: jest.fn(() => ({
    classifyDomain: (...args: unknown[]) => mockClassifyDomain(...args),
    estimateComplexity: (...args: unknown[]) => mockEstimateComplexity(...args),
    selectModel: (...args: unknown[]) => mockSelectModel(...args),
    assembleContext: (...args: unknown[]) => mockAssembleContext(...args),
    cleanExpiredCache: (...args: unknown[]) => mockCleanExpiredCache(...args),
  })),
}));

import { sleepComputeRouter } from '../../routes/sleep-compute';
import { errorHandler } from '../../middleware/errorHandler';

describe('Sleep Compute API Integration Tests', () => {
  let app: Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api', sleepComputeRouter);
    app.use(errorHandler);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryContext.mockReset();
  });

  // ============================================================
  // GET /:context/sleep-compute/logs
  // ============================================================

  describe('GET /:context/sleep-compute/logs', () => {
    it('should return sleep compute logs', async () => {
      const logs = [
        { id: '1', cycle_type: 'full', processed_items: 10, insights_generated: 3, created_at: '2026-01-01' },
      ];
      mockQueryContext.mockResolvedValueOnce({ rows: logs });

      const res = await request(app)
        .get('/api/personal/sleep-compute/logs')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].cycle_type).toBe('full');
    });

    it('should respect limit parameter (capped at 100)', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] });

      await request(app)
        .get('/api/personal/sleep-compute/logs?limit=200')
        .expect(200);

      const params = mockQueryContext.mock.calls[0][2] as unknown[];
      expect(params[1]).toBe(100); // capped
    });

    it('should reject invalid context', async () => {
      const res = await request(app)
        .get('/api/invalid/sleep-compute/logs')
        .expect(400);

      expect(res.body.success).toBe(false);
    });
  });

  // ============================================================
  // GET /:context/sleep-compute/stats
  // ============================================================

  describe('GET /:context/sleep-compute/stats', () => {
    it('should return sleep compute statistics', async () => {
      const stats = {
        total_cycles: '5',
        total_processed: '50',
        total_insights: '12',
        total_contradictions: '3',
        total_memory_updates: '8',
        avg_duration_ms: 1500,
        last_cycle: '2026-01-01',
      };
      mockQueryContext.mockResolvedValueOnce({ rows: [stats] });

      const res = await request(app)
        .get('/api/personal/sleep-compute/stats')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.total_cycles).toBe('5');
    });

    it('should return empty object when no stats', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .get('/api/personal/sleep-compute/stats')
        .expect(200);

      expect(res.body.data).toEqual({});
    });
  });

  // ============================================================
  // POST /:context/sleep-compute/trigger
  // ============================================================

  describe('POST /:context/sleep-compute/trigger', () => {
    it('should trigger manual sleep cycle', async () => {
      const cycleResult = { processed: 15, insights: 4, duration: 2000 };
      mockRunSleepCycle.mockResolvedValueOnce(cycleResult);

      const res = await request(app)
        .post('/api/personal/sleep-compute/trigger')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.processed).toBe(15);
      expect(mockRunSleepCycle).toHaveBeenCalledWith('personal');
    });

    it('should reject invalid context', async () => {
      const res = await request(app)
        .post('/api/invalid/sleep-compute/trigger')
        .expect(400);

      expect(res.body.success).toBe(false);
    });
  });

  // ============================================================
  // GET /:context/sleep-compute/idle-status
  // ============================================================

  describe('GET /:context/sleep-compute/idle-status', () => {
    it('should return idle status true', async () => {
      mockIsSystemIdle.mockResolvedValueOnce(true);

      const res = await request(app)
        .get('/api/personal/sleep-compute/idle-status')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.idle).toBe(true);
    });

    it('should return idle status false', async () => {
      mockIsSystemIdle.mockResolvedValueOnce(false);

      const res = await request(app)
        .get('/api/personal/sleep-compute/idle-status')
        .expect(200);

      expect(res.body.data.idle).toBe(false);
    });
  });

  // ============================================================
  // POST /:context/context-v2/classify
  // ============================================================

  describe('POST /:context/context-v2/classify', () => {
    it('should classify query domain', async () => {
      mockClassifyDomain.mockReturnValueOnce({ domain: 'finance', confidence: 0.9 });
      mockEstimateComplexity.mockReturnValueOnce({ score: 0.6 });
      mockSelectModel.mockReturnValueOnce('claude-sonnet-4-20250514');

      const res = await request(app)
        .post('/api/personal/context-v2/classify')
        .send({ query: 'What is my revenue?' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.domain.domain).toBe('finance');
    });

    it('should require query parameter', async () => {
      const res = await request(app)
        .post('/api/personal/context-v2/classify')
        .send({})
        .expect(400);

      expect(res.body.success).toBe(false);
    });
  });

  // ============================================================
  // POST /:context/context-v2/assemble
  // ============================================================

  describe('POST /:context/context-v2/assemble', () => {
    it('should assemble context', async () => {
      mockAssembleContext.mockResolvedValueOnce({ systemPrompt: 'test', tokens: 500 });

      const res = await request(app)
        .post('/api/personal/context-v2/assemble')
        .send({ query: 'Help me' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.tokens).toBe(500);
    });

    it('should require query parameter', async () => {
      const res = await request(app)
        .post('/api/personal/context-v2/assemble')
        .send({})
        .expect(400);

      expect(res.body.success).toBe(false);
    });
  });

  // ============================================================
  // POST /:context/context-v2/cache/clean
  // ============================================================

  describe('POST /:context/context-v2/cache/clean', () => {
    it('should clean expired cache', async () => {
      mockCleanExpiredCache.mockResolvedValueOnce(5);

      const res = await request(app)
        .post('/api/personal/context-v2/cache/clean')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.cleaned).toBe(5);
    });
  });
});
