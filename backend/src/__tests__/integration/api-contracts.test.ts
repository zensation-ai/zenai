/**
 * Phase 8.2: API Contract Tests
 *
 * Backend-side tests verifying that API endpoints return responses
 * matching the shapes expected by the frontend. These tests serve as
 * a contract between frontend and backend, preventing breaking changes.
 *
 * Each test validates:
 * - Response status codes
 * - Response JSON structure (required fields, types)
 * - Response wrapping patterns ({ success, data } vs raw)
 * - Pagination shape
 * - Error response shape
 */

import express, { Express } from 'express';
import request from 'supertest';
import { ideasRouter } from '../../routes/ideas';
import { healthRouter } from '../../routes/health';

// Mock dependencies
jest.mock('../../utils/database-context', () => ({
  queryContext: jest.fn(),
  isValidContext: jest.fn((ctx: string) => ['personal', 'work', 'learning', 'creative'].includes(ctx)),
  isValidUUID: jest.fn((id: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id),
  ),
  getHealthCheckStatus: jest.fn().mockReturnValue({ isHealthy: true, consecutiveFailures: 0, lastCheck: new Date().toISOString(), status: 'ok' }),
  getPoolStats: jest.fn().mockReturnValue({ contexts: {}, pool: { totalCount: 5, idleCount: 3, activeCount: 2, waitingCount: 0, maxSize: 8 }, events: {} }),
  testConnections: jest.fn(),
  AIContext: {},
}));

jest.mock('../../middleware/auth', () => ({
  apiKeyAuth: jest.fn((req: any, _res: any, next: any) => {
    req.apiKey = { id: 'test-key', name: 'Test', scopes: ['read', 'write', 'admin'], rateLimit: 10000 };
    next();
  }),
  optionalAuth: jest.fn((req: any, _res: any, next: any) => {
    req.apiKey = { id: 'test-key', name: 'Test', scopes: ['read', 'write', 'admin'], rateLimit: 10000 };
    next();
  }),
  requireScope: jest.fn(() => (_req: any, _res: any, next: any) => next()),
}));

jest.mock('../../utils/ollama', () => ({
  generateEmbedding: jest.fn().mockResolvedValue([0.1, 0.2, 0.3]),
  checkOllamaAvailability: jest.fn().mockResolvedValue({ available: false, models: [] }),
}));

jest.mock('../../utils/embedding', () => ({
  formatForPgVector: jest.fn((arr: number[]) => `[${arr.join(',')}]`),
}));

jest.mock('../../services/user-profile', () => ({
  trackInteraction: jest.fn().mockReturnValue(Promise.resolve(undefined)),
}));

jest.mock('../../services/webhooks', () => ({
  triggerWebhook: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../services/learning-engine', () => ({
  learnFromCorrection: jest.fn().mockResolvedValue(undefined),
  learnFromThought: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../utils/database', () => ({
  query: jest.fn(),
  personalPool: { query: jest.fn() },
  workPool: { query: jest.fn() },
}));

jest.mock('../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('../../utils/retry', () => ({
  isCircuitOpen: jest.fn().mockReturnValue(false),
  recordFailure: jest.fn(),
  recordSuccess: jest.fn(),
  getCircuitBreakerStatus: jest.fn().mockReturnValue({}),
  withRetry: jest.fn(fn => fn()),
  withCircuitBreaker: jest.fn((_service, fn) => fn()),
}));

import { queryContext } from '../../utils/database-context';
import { query as dbQuery } from '../../utils/database';
import { errorHandler } from '../../middleware/errorHandler';

var mockQueryContext = queryContext as jest.MockedFunction<typeof queryContext>;
var mockDbQuery = dbQuery as jest.MockedFunction<typeof dbQuery>;

// Standard test UUID
const UUID = '550e8400-e29b-41d4-a716-446655440001';
const NOW = new Date().toISOString();

describe('Phase 8.2: API Contract Tests', () => {
  let ideasApp: Express;
  let healthApp: Express;

  beforeAll(() => {
    // Ideas app
    ideasApp = express();
    ideasApp.use(express.json());
    ideasApp.use('/api/ideas', ideasRouter);
    ideasApp.use(errorHandler);

    // Health app
    healthApp = express();
    healthApp.use(express.json());
    healthApp.use('/api/health', healthRouter);
    healthApp.use(errorHandler);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryContext.mockReset();
    mockDbQuery.mockReset();
  });

  // ===========================================
  // Ideas API Contract
  // ===========================================

  describe('Ideas API Contract', () => {
    describe('GET /api/ideas - List Ideas', () => {
      it('should match IdeasResponseSchema shape', async () => {
        // Route calls: 1) SELECT ideas (list), 2) SELECT COUNT (total)
        mockQueryContext
          .mockResolvedValueOnce({
            rows: [{
              id: UUID,
              title: 'Test',
              type: 'idea',
              category: 'business',
              priority: 'high',
              summary: 'Summary',
              next_steps: '["Step 1"]',
              context_needed: '[]',
              keywords: '["test"]',
              created_at: NOW,
              updated_at: NOW,
            }],
            rowCount: 1,
          } as any)
          .mockResolvedValueOnce({ rows: [{ total: '1' }], rowCount: 1 } as any);

        const res = await request(ideasApp)
          .get('/api/ideas')
          .set('x-ai-context', 'personal');

        expect(res.status).toBe(200);

        // Contract: must have 'ideas' array
        expect(res.body).toHaveProperty('ideas');
        expect(Array.isArray(res.body.ideas)).toBe(true);

        // Contract: must have 'pagination' object
        expect(res.body).toHaveProperty('pagination');
        expect(res.body.pagination).toHaveProperty('total');
        expect(typeof res.body.pagination.total).toBe('number');

        // Contract: each idea must have required fields
        const idea = res.body.ideas[0];
        expect(idea).toHaveProperty('id');
        expect(typeof idea.id).toBe('string');
        expect(idea).toHaveProperty('title');
        expect(idea).toHaveProperty('type');
        expect(idea).toHaveProperty('category');
        expect(idea).toHaveProperty('priority');
        expect(idea).toHaveProperty('created_at');
      });

      it('should return empty array when no ideas exist', async () => {
        // Route calls: 1) SELECT ideas (empty), 2) SELECT COUNT (0)
        mockQueryContext
          .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any)
          .mockResolvedValueOnce({ rows: [{ total: '0' }], rowCount: 1 } as any);

        const res = await request(ideasApp)
          .get('/api/ideas')
          .set('x-ai-context', 'personal');

        expect(res.status).toBe(200);
        expect(res.body.ideas).toEqual([]);
        expect(res.body.pagination.total).toBe(0);
      });
    });

    describe('GET /api/ideas/:id - Get Idea', () => {
      it('should return single idea with all fields', async () => {
        mockQueryContext
          .mockResolvedValueOnce({
            rows: [{
              id: UUID,
              title: 'Test',
              type: 'idea',
              category: 'business',
              priority: 'high',
              summary: 'Summary',
              next_steps: '["Step 1"]',
              context_needed: '["Context"]',
              keywords: '["test"]',
              raw_transcript: 'Original text',
              context: 'personal',
              created_at: NOW,
              updated_at: NOW,
            }],
            rowCount: 1,
          } as any)
          .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

        const res = await request(ideasApp)
          .get(`/api/ideas/${UUID}`)
          .set('x-ai-context', 'personal');

        expect(res.status).toBe(200);

        // Contract: { success: true, idea: { id, title, ... } }
        expect(res.body).toHaveProperty('success', true);
        expect(res.body).toHaveProperty('idea');
        expect(res.body.idea).toHaveProperty('id', UUID);
        expect(res.body.idea).toHaveProperty('title');
        expect(res.body.idea).toHaveProperty('summary');
        expect(res.body.idea).toHaveProperty('type');
        expect(res.body.idea).toHaveProperty('category');
        expect(res.body.idea).toHaveProperty('priority');
        expect(res.body.idea).toHaveProperty('created_at');
      });

      it('should return 404 with standard error shape for non-existent idea', async () => {
        mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

        const res = await request(ideasApp)
          .get(`/api/ideas/${UUID}`)
          .set('x-ai-context', 'personal');

        expect(res.status).toBe(404);
        // Contract: error response shape
        expect(res.body).toHaveProperty('error');
      });
    });

    describe('DELETE /api/ideas/:id - Delete Idea', () => {
      it('should match deletion response contract', async () => {
        mockQueryContext.mockResolvedValueOnce({
          rows: [{ id: UUID }],
          rowCount: 1,
        } as any);

        const res = await request(ideasApp)
          .delete(`/api/ideas/${UUID}`)
          .set('x-ai-context', 'personal');

        expect(res.status).toBe(200);
        // Contract: { success: true, deletedId: string }
        expect(res.body).toHaveProperty('success', true);
        expect(res.body).toHaveProperty('deletedId');
        expect(typeof res.body.deletedId).toBe('string');
      });
    });

    describe('PUT /api/ideas/:id/archive - Archive Idea', () => {
      it('should match archive response contract', async () => {
        mockQueryContext.mockResolvedValueOnce({
          rows: [{ id: UUID, title: 'Archived' }],
          rowCount: 1,
        } as any);

        const res = await request(ideasApp)
          .put(`/api/ideas/${UUID}/archive`)
          .set('x-ai-context', 'personal');

        expect(res.status).toBe(200);
        // Contract: { success: true, archivedId: string }
        expect(res.body).toHaveProperty('success', true);
        expect(res.body).toHaveProperty('archivedId');
        expect(typeof res.body.archivedId).toBe('string');
      });
    });

    describe('PUT /api/ideas/:id/restore - Restore Idea', () => {
      it('should match restore response contract', async () => {
        mockQueryContext.mockResolvedValueOnce({
          rows: [{ id: UUID, title: 'Restored Idea' }],
          rowCount: 1,
        } as any);

        const res = await request(ideasApp)
          .put(`/api/ideas/${UUID}/restore`)
          .set('x-ai-context', 'personal');

        expect(res.status).toBe(200);
        // Contract: { success: true, restoredId: string }
        expect(res.body).toHaveProperty('success', true);
        expect(res.body).toHaveProperty('restoredId');
        expect(typeof res.body.restoredId).toBe('string');
      });
    });

    describe('PUT /api/ideas/:id/priority - Set Priority', () => {
      it('should match priority response contract', async () => {
        // Route calls: 1) SELECT old priority, 2) UPDATE RETURNING
        mockQueryContext
          .mockResolvedValueOnce({ rows: [{ priority: 'low' }], rowCount: 1 } as any)
          .mockResolvedValueOnce({
            rows: [{ id: UUID, title: 'High Priority', priority: 'high' }],
            rowCount: 1,
          } as any);

        const res = await request(ideasApp)
          .put(`/api/ideas/${UUID}/priority`)
          .set('x-ai-context', 'personal')
          .send({ priority: 'high' });

        expect(res.status).toBe(200);
        // Contract: { success: true, idea: { id, title, priority } }
        expect(res.body).toHaveProperty('success', true);
        expect(res.body).toHaveProperty('idea');
        expect(res.body.idea).toHaveProperty('id');
        expect(res.body.idea).toHaveProperty('priority', 'high');
      });
    });

    describe('POST /api/ideas/search - Search', () => {
      it('should match search response contract', async () => {
        mockQueryContext.mockResolvedValueOnce({
          rows: [{
            id: UUID,
            title: 'Found Idea',
            type: 'idea',
            category: 'tech',
            priority: 'medium',
            summary: 'Found via search',
            created_at: NOW,
          }],
          rowCount: 1,
        } as any);

        const res = await request(ideasApp)
          .post('/api/ideas/search')
          .set('x-ai-context', 'personal')
          .send({ query: 'found', limit: 10 });

        expect(res.status).toBe(200);
        // Contract: { ideas: Array, searchType?: string, performance?: object }
        expect(res.body).toHaveProperty('ideas');
        expect(Array.isArray(res.body.ideas)).toBe(true);
      });
    });

    describe('GET /api/ideas/triage - Triage List', () => {
      it('should match triage response contract', async () => {
        // Route calls: 1) SELECT ideas for triage, 2) SELECT COUNT total
        mockQueryContext
          .mockResolvedValueOnce({
            rows: [{
              id: UUID,
              title: 'Triage Idea',
              type: 'idea',
              category: 'tech',
              priority: 'low',
              summary: 'Needs triage',
              next_steps: '[]',
              context_needed: '[]',
              keywords: '[]',
              context: 'personal',
              created_at: NOW,
              updated_at: NOW,
            }],
            rowCount: 1,
          } as any)
          .mockResolvedValueOnce({ rows: [{ total: '5' }], rowCount: 1 } as any);

        const res = await request(ideasApp)
          .get('/api/ideas/triage')
          .set('x-ai-context', 'personal');

        expect(res.status).toBe(200);
        // Contract: { success: true, ideas: Array, total: number, hasMore: boolean }
        expect(res.body).toHaveProperty('success', true);
        expect(res.body).toHaveProperty('ideas');
        expect(Array.isArray(res.body.ideas)).toBe(true);
      });
    });
  });

  // ===========================================
  // Error Response Contract
  // ===========================================

  describe('Error Response Contract', () => {
    it('should return standard error shape for 400 Bad Request', async () => {
      const res = await request(ideasApp)
        .get('/api/ideas/not-a-uuid')
        .set('x-ai-context', 'personal');

      expect(res.status).toBe(400);
      // Contract: { error: { code: string, message: string } } or { error: string }
      expect(res.body).toHaveProperty('error');
    });

    it('should return standard error shape for 404 Not Found', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      const res = await request(ideasApp)
        .get(`/api/ideas/${UUID}`)
        .set('x-ai-context', 'personal');

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error');
    });

    it('should return standard error shape for 500 Internal Error', async () => {
      // The route calls queryContext for the list query first - make it throw
      mockQueryContext.mockRejectedValue(new Error('DB crash'));

      const res = await request(ideasApp)
        .get('/api/ideas')
        .set('x-ai-context', 'personal');

      expect(res.status).toBe(500);
      expect(res.body).toHaveProperty('error');
    });
  });

  // ===========================================
  // Health API Contract
  // ===========================================

  describe('Health API Contract', () => {
    it('GET /api/health should match HealthResponseSchema shape', async () => {
      // Health endpoint queries the DB directly
      mockDbQuery.mockResolvedValue({ rows: [{ now: NOW }], rowCount: 1 } as any);

      const res = await request(healthApp)
        .get('/api/health');

      // Health endpoint should return 200 or 503
      expect([200, 503]).toContain(res.status);

      // Contract: must have 'status' field
      expect(res.body).toHaveProperty('status');
      expect(typeof res.body.status).toBe('string');
      expect(['healthy', 'degraded', 'unhealthy']).toContain(res.body.status);

      // Contract: must have 'timestamp' field
      expect(res.body).toHaveProperty('timestamp');
      expect(typeof res.body.timestamp).toBe('string');

      // Contract: must have 'services' object
      if (res.body.services) {
        expect(typeof res.body.services).toBe('object');
      }
    });
  });
});
