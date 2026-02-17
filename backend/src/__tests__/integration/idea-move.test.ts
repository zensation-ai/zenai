/**
 * Integration Tests for Idea Move API
 *
 * Tests the POST /api/:context/ideas/:id/move endpoint
 * which moves an idea between context schemas.
 */

import express, { Express } from 'express';
import request from 'supertest';
import { contextsRouter } from '../../routes/contexts';

// Mock all external dependencies
jest.mock('../../utils/database-context', () => ({
  queryContext: jest.fn(),
  isValidContext: jest.fn((ctx: string) => ['personal', 'work', 'learning', 'creative'].includes(ctx)),
  isValidUUID: jest.fn((id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)),
  AIContext: {},
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
}));

jest.mock('../../services/ai-activity-logger', () => ({
  getRecentAIActivities: jest.fn().mockResolvedValue([]),
  markActivitiesAsRead: jest.fn().mockResolvedValue(0),
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
import { invalidateCacheForContext } from '../../middleware/response-cache';

const mockQueryContext = queryContext as jest.MockedFunction<typeof queryContext>;
const mockInvalidateCache = invalidateCacheForContext as jest.MockedFunction<typeof invalidateCacheForContext>;

const VALID_UUID = '11111111-1111-4111-a111-111111111111';
const NEW_UUID = '22222222-2222-4222-a222-222222222222';

const mockIdeaExtended = {
  title: 'Test Idea',
  type: 'idea',
  category: 'general',
  priority: 'medium',
  summary: 'A test summary',
  raw_input: 'raw input text',
  raw_transcript: 'raw transcript text',
  next_steps: 'some steps',
  context_needed: null,
  keywords: ['test'],
  embedding: [0.1, 0.2],
  is_archived: false,
  viewed_count: 3,
  created_at: '2026-01-01T00:00:00Z',
};

const mockIdeaBasic = {
  title: 'Test Idea',
  type: 'idea',
  category: 'general',
  priority: 'medium',
  summary: 'A test summary',
  raw_input: 'raw input text',
  next_steps: 'some steps',
  context_needed: null,
  keywords: ['test'],
  embedding: [0.1, 0.2],
  is_archived: false,
  created_at: '2026-01-01T00:00:00Z',
};

describe('Idea Move API Integration Tests', () => {
  let app: Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api', contextsRouter);
    app.use(errorHandler);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryContext.mockReset();
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
    it('moves idea from personal to work with extended columns', async () => {
      mockQueryContext
        // Step 1: Extended SELECT from source succeeds
        .mockResolvedValueOnce({ rows: [mockIdeaExtended] } as any)
        // Step 2: Extended INSERT into target succeeds
        .mockResolvedValueOnce({ rows: [{ id: NEW_UUID }] } as any)
        // Step 3: DELETE from source succeeds
        .mockResolvedValueOnce({ rows: [] } as any);

      const res = await request(app)
        .post(`/api/personal/ideas/${VALID_UUID}/move`)
        .send({ targetContext: 'work' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.ideaId).toBe(VALID_UUID);
      expect(res.body.newIdeaId).toBe(NEW_UUID);
      expect(res.body.sourceContext).toBe('personal');
      expect(res.body.targetContext).toBe('work');
    });

    it('moves idea with basic columns when source lacks extended columns', async () => {
      mockQueryContext
        // Step 1: Extended SELECT fails (column doesn't exist)
        .mockRejectedValueOnce(new Error('column "raw_transcript" does not exist'))
        // Step 1b: Fallback SELECT succeeds
        .mockResolvedValueOnce({ rows: [mockIdeaBasic] } as any)
        // Step 2: Basic INSERT succeeds
        .mockResolvedValueOnce({ rows: [{ id: NEW_UUID }] } as any)
        // Step 3: DELETE succeeds
        .mockResolvedValueOnce({ rows: [] } as any);

      const res = await request(app)
        .post(`/api/personal/ideas/${VALID_UUID}/move`)
        .send({ targetContext: 'work' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.newIdeaId).toBe(NEW_UUID);
    }, 30000);

    it('invalidates cache for both source and target contexts', async () => {
      mockQueryContext
        .mockResolvedValueOnce({ rows: [mockIdeaBasic] } as any)
        .mockResolvedValueOnce({ rows: [{ id: NEW_UUID }] } as any)
        .mockResolvedValueOnce({ rows: [] } as any);

      // First call fails (extended SELECT), trigger fallback
      mockQueryContext.mockReset();
      mockQueryContext
        .mockRejectedValueOnce(new Error('column does not exist'))
        .mockResolvedValueOnce({ rows: [mockIdeaBasic] } as any)
        .mockResolvedValueOnce({ rows: [{ id: NEW_UUID }] } as any)
        .mockResolvedValueOnce({ rows: [] } as any);

      await request(app)
        .post(`/api/personal/ideas/${VALID_UUID}/move`)
        .send({ targetContext: 'work' });

      expect(mockInvalidateCache).toHaveBeenCalledWith('personal', 'ideas');
      expect(mockInvalidateCache).toHaveBeenCalledWith('work', 'ideas');
    });

    it('moves idea between any valid context pair', async () => {
      mockQueryContext
        .mockRejectedValueOnce(new Error('column does not exist'))
        .mockResolvedValueOnce({ rows: [mockIdeaBasic] } as any)
        .mockResolvedValueOnce({ rows: [{ id: NEW_UUID }] } as any)
        .mockResolvedValueOnce({ rows: [] } as any);

      const res = await request(app)
        .post(`/api/learning/ideas/${VALID_UUID}/move`)
        .send({ targetContext: 'creative' });

      expect(res.status).toBe(200);
      expect(res.body.sourceContext).toBe('learning');
      expect(res.body.targetContext).toBe('creative');
    });
  });

  describe('Error Handling', () => {
    it('returns 404 when idea does not exist in source', async () => {
      mockQueryContext
        // Extended SELECT fails
        .mockRejectedValueOnce(new Error('column does not exist'))
        // Fallback SELECT returns empty
        .mockResolvedValueOnce({ rows: [] } as any);

      const res = await request(app)
        .post(`/api/personal/ideas/${VALID_UUID}/move`)
        .send({ targetContext: 'work' });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('falls back to basic INSERT when extended INSERT fails on target', async () => {
      mockQueryContext
        // Step 1: Extended SELECT succeeds (source has extended columns)
        .mockResolvedValueOnce({ rows: [mockIdeaExtended] } as any)
        // Step 2: Extended INSERT fails (target lacks columns)
        .mockRejectedValueOnce(Object.assign(new Error('column "raw_transcript" does not exist'), { code: '42703' }))
        // Step 2b: Fallback basic INSERT succeeds
        .mockResolvedValueOnce({ rows: [{ id: NEW_UUID }] } as any)
        // Step 3: DELETE succeeds
        .mockResolvedValueOnce({ rows: [] } as any);

      const res = await request(app)
        .post(`/api/personal/ideas/${VALID_UUID}/move`)
        .send({ targetContext: 'work' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.newIdeaId).toBe(NEW_UUID);
    });

    it('returns 500 when DELETE from source fails', async () => {
      mockQueryContext
        .mockRejectedValueOnce(new Error('column does not exist'))
        .mockResolvedValueOnce({ rows: [mockIdeaBasic] } as any)
        .mockResolvedValueOnce({ rows: [{ id: NEW_UUID }] } as any)
        // DELETE fails
        .mockRejectedValueOnce(new Error('foreign key violation'));

      const res = await request(app)
        .post(`/api/personal/ideas/${VALID_UUID}/move`)
        .send({ targetContext: 'work' });

      expect(res.status).toBe(500);
    });
  });
});
