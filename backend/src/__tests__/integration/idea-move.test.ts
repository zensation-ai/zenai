/**
 * Integration Tests for Idea Move API
 *
 * Tests the POST /api/:context/ideas/:id/move endpoint
 * which moves an idea between context schemas.
 * Route lives in ideasContextRouter (ideas.ts), not contextsRouter.
 */

import express, { Express } from 'express';
import request from 'supertest';

// Mock all external dependencies
jest.mock('../../utils/database-context', () => ({
  queryContext: jest.fn(),
  isValidContext: jest.fn((ctx: string) => ['personal', 'work', 'learning', 'creative'].includes(ctx)),
  isValidUUID: jest.fn((id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)),
  AIContext: {},
  getPool: jest.fn(() => ({ query: jest.fn() })),
}));

jest.mock('../../middleware/auth', () => ({
  apiKeyAuth: jest.fn((req: any, _res: any, next: any) => {
    req.apiKey = { id: 'test-key', name: 'Test', scopes: ['read', 'write', 'admin'], rateLimit: 10000 };
    next();
  }),
  requireScope: jest.fn(() => (_req: any, _res: any, next: any) => next()),
}));

jest.mock('../../middleware/response-cache', () => ({
  responseCacheMiddleware: jest.fn((_req: any, _res: any, next: any) => next()),
  invalidateCacheForContext: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../services/learning-engine', () => ({
  learnFromCorrection: jest.fn().mockResolvedValue(undefined),
  runDailyLearning: jest.fn().mockResolvedValue({ confidence: 0, insights: [] }),
  getPersonalizedPromptContext: jest.fn().mockResolvedValue(''),
}));

jest.mock('../../services/user-profile', () => ({
  trackInteraction: jest.fn().mockResolvedValue(undefined),
  getUserProfile: jest.fn().mockResolvedValue({ preferred_categories: {}, preferred_types: {}, thinking_patterns: {}, language_style: {}, total_ideas: 0, avg_ideas_per_day: 0 }),
  getRecommendations: jest.fn().mockResolvedValue([]),
}));

jest.mock('../../services/thought-incubator', () => ({
  addLooseThought: jest.fn(),
  getLooseThoughts: jest.fn().mockResolvedValue([]),
  getAllClusters: jest.fn().mockResolvedValue([]),
  getReadyClusters: jest.fn().mockResolvedValue([]),
  generateClusterSummary: jest.fn(),
  consolidateCluster: jest.fn(),
  dismissCluster: jest.fn(),
  markClusterPresented: jest.fn(),
  runBatchAnalysis: jest.fn(),
  getIncubatorStats: jest.fn().mockResolvedValue({}),
  backfillEmbeddings: jest.fn().mockResolvedValue({ processed: 0, failed: 0 }),
}));

jest.mock('../../services/ai-activity-logger', () => ({
  getRecentAIActivities: jest.fn().mockResolvedValue([]),
  markActivitiesAsRead: jest.fn().mockResolvedValue(0),
  getUnreadActivityCount: jest.fn().mockResolvedValue(0),
  logAIActivity: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../services/idea-move', () => ({
  moveIdea: jest.fn(),
}));

jest.mock('../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import { moveIdea } from '../../services/idea-move';
import { errorHandler } from '../../middleware/errorHandler';
import { invalidateCacheForContext } from '../../middleware/response-cache';

// Import the actual router that owns the move route
import { ideasContextRouter } from '../../routes/ideas';

const mockMoveIdea = moveIdea as jest.MockedFunction<typeof moveIdea>;
const mockInvalidateCache = invalidateCacheForContext as jest.MockedFunction<typeof invalidateCacheForContext>;

const VALID_UUID = '11111111-1111-4111-a111-111111111111';
const NEW_UUID = '22222222-2222-4222-a222-222222222222';

describe('Idea Move API Integration Tests', () => {
  let app: Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api', ideasContextRouter);
    app.use(errorHandler);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockMoveIdea.mockReset();
  });

  describe('Validation', () => {
    it('returns 400 for invalid source context', async () => {
      const res = await request(app)
        .post(`/api/invalid/ideas/${VALID_UUID}/move`)
        .send({ targetContext: 'work' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('returns 400 for invalid target context', async () => {
      const res = await request(app)
        .post(`/api/personal/ideas/${VALID_UUID}/move`)
        .send({ targetContext: 'invalid' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('returns 400 when source equals target context', async () => {
      const res = await request(app)
        .post(`/api/personal/ideas/${VALID_UUID}/move`)
        .send({ targetContext: 'personal' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('returns 400 for invalid UUID format', async () => {
      const res = await request(app)
        .post('/api/personal/ideas/not-a-uuid/move')
        .send({ targetContext: 'work' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('returns 400 when targetContext is missing', async () => {
      const res = await request(app)
        .post(`/api/personal/ideas/${VALID_UUID}/move`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('Happy Path', () => {
    it('moves idea from personal to work', async () => {
      mockMoveIdea.mockResolvedValueOnce({
        success: true,
        ideaId: VALID_UUID,
        newIdeaId: NEW_UUID,
        sourceContext: 'personal',
        targetContext: 'work',
      });

      const res = await request(app)
        .post(`/api/personal/ideas/${VALID_UUID}/move`)
        .send({ targetContext: 'work' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.movedId).toBe(VALID_UUID);
      expect(res.body.newIdeaId).toBe(NEW_UUID);
      expect(res.body.from).toBe('personal');
      expect(res.body.to).toBe('work');
    });

    it('invalidates cache for both source and target contexts', async () => {
      mockMoveIdea.mockResolvedValueOnce({
        success: true,
        ideaId: VALID_UUID,
        newIdeaId: NEW_UUID,
        sourceContext: 'personal',
        targetContext: 'work',
      });

      await request(app)
        .post(`/api/personal/ideas/${VALID_UUID}/move`)
        .send({ targetContext: 'work' });

      expect(mockInvalidateCache).toHaveBeenCalledWith('personal', 'ideas');
      expect(mockInvalidateCache).toHaveBeenCalledWith('work', 'ideas');
    });

    it('moves idea between any valid context pair', async () => {
      mockMoveIdea.mockResolvedValueOnce({
        success: true,
        ideaId: VALID_UUID,
        newIdeaId: NEW_UUID,
        sourceContext: 'learning',
        targetContext: 'creative',
      });

      const res = await request(app)
        .post(`/api/learning/ideas/${VALID_UUID}/move`)
        .send({ targetContext: 'creative' });

      expect(res.status).toBe(200);
      expect(res.body.from).toBe('learning');
      expect(res.body.to).toBe('creative');
    });
  });

  describe('Error Handling', () => {
    it('returns 404 when idea does not exist in source', async () => {
      mockMoveIdea.mockRejectedValueOnce(new Error('IDEA_NOT_FOUND'));

      const res = await request(app)
        .post(`/api/personal/ideas/${VALID_UUID}/move`)
        .send({ targetContext: 'work' });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('returns 500 on SCHEMA_MISMATCH', async () => {
      mockMoveIdea.mockRejectedValueOnce(new Error('SCHEMA_MISMATCH'));

      const res = await request(app)
        .post(`/api/personal/ideas/${VALID_UUID}/move`)
        .send({ targetContext: 'work' });

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });

    it('returns 500 when DELETE from source fails', async () => {
      mockMoveIdea.mockRejectedValueOnce(new Error('foreign key violation'));

      const res = await request(app)
        .post(`/api/personal/ideas/${VALID_UUID}/move`)
        .send({ targetContext: 'work' });

      expect(res.status).toBe(500);
    });
  });
});
