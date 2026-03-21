/**
 * Memory Insights Route Tests
 */

import express from 'express';
import request from 'supertest';

jest.mock('../../../middleware/auth', () => ({
  apiKeyAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireScope: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

jest.mock('../../../utils/database-context', () => ({
  isValidContext: jest.fn((ctx: string) => ['personal', 'work', 'learning', 'creative'].includes(ctx)),
  AIContext: {},
}));

jest.mock('../../../utils/validation', () => ({
  validateContextParam: jest.fn((ctx: string) => {
    if (!['personal', 'work', 'learning', 'creative'].includes(ctx)) {
      throw new Error('Invalid context');
    }
    return ctx;
  }),
}));

const mockGetMemoryTimeline = jest.fn();
const mockDetectConflicts = jest.fn();
const mockGetCurationSuggestions = jest.fn();
const mockGetMemoryImpact = jest.fn();
const mockGetMemoryStats = jest.fn();

jest.mock('../../../services/memory-insights', () => ({
  getMemoryTimeline: (...args: unknown[]) => mockGetMemoryTimeline(...args),
  detectConflicts: (...args: unknown[]) => mockDetectConflicts(...args),
  getCurationSuggestions: (...args: unknown[]) => mockGetCurationSuggestions(...args),
  getMemoryImpact: (...args: unknown[]) => mockGetMemoryImpact(...args),
  getMemoryStats: (...args: unknown[]) => mockGetMemoryStats(...args),
}));

import { memoryInsightsRouter } from '../../../routes/memory-insights';
import { errorHandler } from '../../../middleware/errorHandler';

describe('Memory Insights Routes', () => {
  let app: express.Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api', memoryInsightsRouter);
    app.use(errorHandler);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/:context/memory/insights/timeline', () => {
    it('should return memory timeline', async () => {
      mockGetMemoryTimeline.mockResolvedValue([{ date: '2026-03-01', count: 5 }]);

      const res = await request(app)
        .get('/api/personal/memory/insights/timeline?from=2026-03-01&to=2026-03-21');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
    });

    it('should require from and to parameters', async () => {
      const res = await request(app)
        .get('/api/personal/memory/insights/timeline');

      expect(res.status).toBe(400);
    });

    it('should reject invalid granularity', async () => {
      const res = await request(app)
        .get('/api/personal/memory/insights/timeline?from=2026-03-01&to=2026-03-21&granularity=hour');

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/:context/memory/insights/conflicts', () => {
    it('should return memory conflicts', async () => {
      mockDetectConflicts.mockResolvedValue([{ type: 'duplicate', ids: ['a', 'b'] }]);

      const res = await request(app)
        .get('/api/personal/memory/insights/conflicts');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
    });
  });

  describe('GET /api/:context/memory/insights/curation', () => {
    it('should return curation suggestions', async () => {
      mockGetCurationSuggestions.mockResolvedValue([{ action: 'archive', factId: 'f1' }]);

      const res = await request(app)
        .get('/api/personal/memory/insights/curation');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('GET /api/:context/memory/insights/impact', () => {
    it('should return impactful memories', async () => {
      mockGetMemoryImpact.mockResolvedValue([{ factId: 'f1', score: 0.95 }]);

      const res = await request(app)
        .get('/api/personal/memory/insights/impact');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('GET /api/:context/memory/insights/stats', () => {
    it('should return memory stats', async () => {
      mockGetMemoryStats.mockResolvedValue({ totalFacts: 100, totalEpisodes: 50 });

      const res = await request(app)
        .get('/api/personal/memory/insights/stats');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.totalFacts).toBe(100);
    });
  });
});
