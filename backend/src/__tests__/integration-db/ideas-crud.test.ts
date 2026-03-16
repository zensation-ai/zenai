/**
 * Phase 80: Ideas CRUD Integration Test
 *
 * Tests the read/update/delete lifecycle for ideas
 * across all 4 contexts using supertest against the Express app.
 * Note: Ideas creation happens via voice-memo or AI tool calls, not a direct POST /api/ideas.
 */

import express, { Express } from 'express';
import request from 'supertest';
import { ideasRouter, ideasContextRouter } from '../../routes/ideas';
import { errorHandler } from '../../middleware/errorHandler';

// ============================================================
// Mocks
// ============================================================

const mockQueryContext = jest.fn();

jest.mock('../../utils/database-context', () => ({
  queryContext: (...args: any[]) => mockQueryContext(...args),
  isValidContext: jest.fn((ctx: string) => ['personal', 'work', 'learning', 'creative'].includes(ctx)),
  isValidUUID: jest.fn((id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)),
  AIContext: {},
}));

jest.mock('../../middleware/auth', () => ({
  apiKeyAuth: jest.fn((_req: any, _res: any, next: any) => {
    _req.apiKey = { id: 'test-key', name: 'Test', scopes: ['read', 'write', 'admin'], rateLimit: 10000 };
    next();
  }),
  requireScope: jest.fn(() => (_req: any, _res: any, next: any) => next()),
}));

jest.mock('../../utils/user-context', () => ({
  getUserId: jest.fn(() => 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'),
  SYSTEM_USER_ID: '00000000-0000-0000-0000-000000000001',
}));

jest.mock('../../utils/ollama', () => ({
  generateEmbedding: jest.fn().mockResolvedValue([0.1, 0.2, 0.3]),
}));

jest.mock('../../utils/embedding', () => ({
  formatForPgVector: jest.fn((arr: number[]) => `[${arr.join(',')}]`),
}));

jest.mock('../../services/user-profile', () => ({
  trackInteraction: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../services/webhooks', () => ({
  triggerWebhook: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../services/learning-engine', () => ({
  learnFromCorrection: jest.fn().mockResolvedValue(undefined),
  learnFromThought: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../services/ai-activity-logger', () => ({
  logAIActivity: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../services/duplicate-detection', () => ({
  findDuplicates: jest.fn().mockResolvedValue([]),
  mergeIdeas: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../services/activity-tracker', () => ({
  trackActivity: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../services/idea-move', () => ({
  moveIdea: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../middleware/response-cache', () => ({
  invalidateCacheForContext: jest.fn(),
}));

jest.mock('../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../utils/validation', () => ({
  validatePagination: jest.fn(() => ({ success: true, data: { limit: 50, offset: 0 } })),
  validateIdeaType: jest.fn(() => ({ success: true, data: undefined })),
  validateCategory: jest.fn(() => ({ success: true, data: undefined })),
  validatePriority: jest.fn(() => ({ success: true, data: undefined })),
  validateRequiredString: jest.fn(() => ({ success: true, value: 'test' })),
  parseIntSafe: jest.fn((v: string, opts: any) => ({ success: true, data: parseInt(v) || opts?.default || 20 })),
  validateContextParam: jest.fn((ctx: string) => {
    if (!['personal', 'work', 'learning', 'creative'].includes(ctx)) throw new Error('Invalid');
    return ctx;
  }),
}));

// ============================================================
// Test Data
// ============================================================

const TEST_USER_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const TEST_IDEA_ID = '11111111-2222-3333-aaaa-555555555555';

const mockIdea = {
  id: TEST_IDEA_ID,
  title: 'Test Idea',
  content: 'Some content',
  type: 'thought',
  category: 'general',
  priority: 'medium',
  status: 'active',
  is_archived: false,
  tags: ['test'],
  source: 'manual',
  user_id: TEST_USER_ID,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

// ============================================================
// Tests
// ============================================================

describe('Ideas CRUD Integration Tests', () => {
  let app: Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/ideas', ideasRouter);
    app.use('/api', ideasContextRouter);
    app.use(errorHandler);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryContext.mockReset();
  });

  describe('READ - GET /api/ideas', () => {
    it('should list ideas with pagination', async () => {
      mockQueryContext
        .mockResolvedValueOnce({ rows: [{ count: '2' }] } as any)
        .mockResolvedValueOnce({ rows: [mockIdea] } as any);

      const res = await request(app)
        .get('/api/ideas')
        .query({ limit: '10', offset: '0' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should get a single idea by ID', async () => {
      mockQueryContext.mockResolvedValue({ rows: [mockIdea] } as any);

      const res = await request(app)
        .get(`/api/ideas/${TEST_IDEA_ID}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.idea).toBeDefined();
    });

    it('should return 404 for non-existent idea', async () => {
      mockQueryContext.mockResolvedValue({ rows: [] } as any);

      const res = await request(app)
        .get(`/api/ideas/${TEST_IDEA_ID}`);

      expect(res.status).toBe(404);
    });

    it('should return 400 for invalid UUID', async () => {
      const res = await request(app)
        .get('/api/ideas/not-a-uuid');

      expect(res.status).toBe(400);
    });

    it('should get stats summary', async () => {
      mockQueryContext
        .mockResolvedValueOnce({ rows: [{ total: '10' }] } as any)
        .mockResolvedValueOnce({ rows: [{ type: 'thought', count: '5' }] } as any)
        .mockResolvedValueOnce({ rows: [{ category: 'general', count: '8' }] } as any)
        .mockResolvedValueOnce({ rows: [{ priority: 'medium', count: '6' }] } as any);

      const res = await request(app).get('/api/ideas/stats/summary');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body).toHaveProperty('total');
    });
  });

  describe('UPDATE - PUT /api/ideas/:id', () => {
    it('should update an existing idea', async () => {
      // First call: SELECT old values, Second call: UPDATE RETURNING
      mockQueryContext
        .mockResolvedValueOnce({ rows: [{ type: 'thought', category: 'general', priority: 'medium' }] } as any)
        .mockResolvedValueOnce({ rows: [{ ...mockIdea, title: 'Updated Title' }] } as any);

      const res = await request(app)
        .put(`/api/ideas/${TEST_IDEA_ID}`)
        .send({ title: 'Updated Title' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 404 when updating non-existent idea', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      const res = await request(app)
        .put(`/api/ideas/${TEST_IDEA_ID}`)
        .send({ title: 'Updated Title' });

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE - DELETE /api/ideas/:id', () => {
    it('should delete an idea', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [mockIdea] } as any);

      const res = await request(app)
        .delete(`/api/ideas/${TEST_IDEA_ID}`);

      expect([200, 204]).toContain(res.status);
    });

    it('should return 400 for invalid UUID on delete', async () => {
      const res = await request(app)
        .delete('/api/ideas/invalid');

      expect(res.status).toBe(400);
    });
  });

  describe('Context-aware routes', () => {
    it('should reject invalid context', async () => {
      const res = await request(app)
        .get('/api/ideas')
        .set('X-AI-Context', 'invalid_context');

      expect([400, 422]).toContain(res.status);
    });

    it('should list ideas across contexts via context router', async () => {
      for (const ctx of ['personal', 'work', 'learning', 'creative']) {
        mockQueryContext.mockReset();
        mockQueryContext
          .mockResolvedValueOnce({ rows: [{ count: '1' }] } as any)
          .mockResolvedValueOnce({ rows: [mockIdea] } as any);

        const res = await request(app)
          .get(`/api/${ctx}/ideas`);

        expect(res.status).toBe(200);
        expect(mockQueryContext).toHaveBeenCalledWith(
          ctx,
          expect.any(String),
          expect.any(Array)
        );
      }
    });
  });

  describe('SQL query verification', () => {
    it('should include user_id in SELECT queries', async () => {
      mockQueryContext
        .mockResolvedValueOnce({ rows: [{ count: '0' }] } as any)
        .mockResolvedValueOnce({ rows: [] } as any);

      await request(app).get('/api/ideas');

      const calls = mockQueryContext.mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      for (const call of calls) {
        const sql = call[1] as string;
        if (sql.includes('SELECT') && sql.includes('ideas')) {
          expect(sql.toLowerCase()).toContain('user_id');
        }
      }
    });

    it('should use parameterized queries (not string concatenation)', async () => {
      mockQueryContext
        .mockResolvedValueOnce({ rows: [{ count: '0' }] } as any)
        .mockResolvedValueOnce({ rows: [] } as any);

      await request(app).get('/api/ideas');

      const calls = mockQueryContext.mock.calls;
      for (const call of calls) {
        const sql = call[1] as string;
        if (sql.includes('WHERE')) {
          expect(sql).toMatch(/\$\d/);
        }
      }
    });

    it('should include user_id in UPDATE queries', async () => {
      mockQueryContext
        .mockResolvedValueOnce({ rows: [{ type: 'thought', category: 'general', priority: 'medium' }] } as any)
        .mockResolvedValueOnce({ rows: [mockIdea] } as any);

      await request(app)
        .put(`/api/ideas/${TEST_IDEA_ID}`)
        .send({ title: 'Test' });

      const calls = mockQueryContext.mock.calls;
      for (const call of calls) {
        const sql = (call[1] as string).toLowerCase();
        if (sql.includes('update') || sql.includes('select')) {
          expect(sql).toContain('user_id');
        }
      }
    });
  });
});
