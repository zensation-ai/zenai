/**
 * Incubator Route Tests
 *
 * Tests the REST API for thought incubation and clustering.
 */

import express from 'express';
import request from 'supertest';

// Mock auth middleware
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
  isValidUUID: jest.fn((id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)),
  AIContext: {},
  getPool: jest.fn(() => ({
    connect: jest.fn().mockResolvedValue({
      query: jest.fn().mockResolvedValue({ rows: [] }),
      release: jest.fn(),
    }),
  })),
}));

const mockAddLooseThought = jest.fn();
const mockGetLooseThoughts = jest.fn();
const mockGetAllClusters = jest.fn();
const mockGetReadyClusters = jest.fn();
const mockGenerateClusterSummary = jest.fn();
const mockConsolidateCluster = jest.fn();
const mockDismissCluster = jest.fn();
const mockMarkClusterPresented = jest.fn();
const mockRunBatchAnalysis = jest.fn();
const mockGetIncubatorStats = jest.fn();
const mockBackfillEmbeddings = jest.fn();

jest.mock('../../../services/thought-incubator', () => ({
  addLooseThought: (...args: unknown[]) => mockAddLooseThought(...args),
  getLooseThoughts: (...args: unknown[]) => mockGetLooseThoughts(...args),
  getAllClusters: (...args: unknown[]) => mockGetAllClusters(...args),
  getReadyClusters: (...args: unknown[]) => mockGetReadyClusters(...args),
  generateClusterSummary: (...args: unknown[]) => mockGenerateClusterSummary(...args),
  consolidateCluster: (...args: unknown[]) => mockConsolidateCluster(...args),
  dismissCluster: (...args: unknown[]) => mockDismissCluster(...args),
  markClusterPresented: (...args: unknown[]) => mockMarkClusterPresented(...args),
  runBatchAnalysis: (...args: unknown[]) => mockRunBatchAnalysis(...args),
  getIncubatorStats: (...args: unknown[]) => mockGetIncubatorStats(...args),
  backfillEmbeddings: (...args: unknown[]) => mockBackfillEmbeddings(...args),
}));

jest.mock('../../../services/learning-engine', () => ({
  runDailyLearning: jest.fn().mockResolvedValue({ confidence: 0.8, insights: [] }),
  getPersonalizedPromptContext: jest.fn().mockResolvedValue('context text'),
}));

jest.mock('../../../services/user-profile', () => ({
  getUserProfile: jest.fn().mockResolvedValue({
    preferred_categories: { tech: 5 },
    preferred_types: { idea: 3 },
    thinking_patterns: [],
    language_style: 'casual',
    total_ideas: 10,
    avg_ideas_per_day: 2,
  }),
  getRecommendations: jest.fn().mockResolvedValue([]),
}));

import incubatorRouter from '../../../routes/incubator';
import { errorHandler } from '../../../middleware/errorHandler';

describe('Incubator Routes', () => {
  let app: express.Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/incubator', incubatorRouter);
    app.use(errorHandler);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/incubator/thought', () => {
    it('should create a new thought', async () => {
      const thought = { id: 'abc', text: 'test thought' };
      mockAddLooseThought.mockResolvedValue(thought);

      const res = await request(app)
        .post('/api/incubator/thought')
        .send({ text: 'test thought', context: 'personal' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.thought).toEqual(thought);
    });

    it('should reject empty text', async () => {
      const res = await request(app)
        .post('/api/incubator/thought')
        .send({ text: '', context: 'personal' });

      expect(res.status).toBe(400);
    });

    it('should reject missing text', async () => {
      const res = await request(app)
        .post('/api/incubator/thought')
        .send({ context: 'personal' });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/incubator/thoughts', () => {
    it('should return thoughts list', async () => {
      mockGetLooseThoughts.mockResolvedValue([{ id: '1' }, { id: '2' }]);

      const res = await request(app)
        .get('/api/incubator/thoughts?context=personal');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.thoughts).toHaveLength(2);
      expect(res.body.count).toBe(2);
    });
  });

  describe('GET /api/incubator/clusters', () => {
    it('should return clusters', async () => {
      mockGetAllClusters.mockResolvedValue([{ id: 'c1', status: 'ready' }]);

      const res = await request(app)
        .get('/api/incubator/clusters?context=personal');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.clusters).toHaveLength(1);
    });
  });

  describe('GET /api/incubator/clusters/ready', () => {
    it('should return ready clusters with hasNew flag', async () => {
      mockGetReadyClusters.mockResolvedValue([{ id: 'c1', status: 'ready' }]);

      const res = await request(app)
        .get('/api/incubator/clusters/ready?context=personal');

      expect(res.status).toBe(200);
      expect(res.body.hasNew).toBe(true);
    });
  });

  describe('POST /api/incubator/clusters/:id/dismiss', () => {
    it('should dismiss a cluster', async () => {
      mockDismissCluster.mockResolvedValue(undefined);

      const res = await request(app)
        .post('/api/incubator/clusters/11111111-1111-4111-a111-111111111111/dismiss')
        .send({ context: 'personal' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should reject invalid cluster UUID', async () => {
      const res = await request(app)
        .post('/api/incubator/clusters/invalid-id/dismiss')
        .send({ context: 'personal' });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/incubator/stats', () => {
    it('should return incubator statistics', async () => {
      mockGetIncubatorStats.mockResolvedValue({ totalThoughts: 10, totalClusters: 3 });

      const res = await request(app)
        .get('/api/incubator/stats?context=personal');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.totalThoughts).toBe(10);
    });
  });

  describe('POST /api/incubator/analyze', () => {
    it('should run batch analysis', async () => {
      mockRunBatchAnalysis.mockResolvedValue({ processed: 5, clusters: 2 });

      const res = await request(app)
        .post('/api/incubator/analyze')
        .send({ context: 'personal' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.processed).toBe(5);
    });
  });

  describe('GET /api/incubator/learning', () => {
    it('should return learning status', async () => {
      const res = await request(app)
        .get('/api/incubator/learning');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body).toHaveProperty('learningProgress');
      expect(res.body).toHaveProperty('confidence');
    });
  });

  describe('GET /api/incubator/context', () => {
    it('should return personalized context', async () => {
      const res = await request(app)
        .get('/api/incubator/context');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.hasContext).toBe(true);
    });
  });
});
