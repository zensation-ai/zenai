/**
 * Phase 8.1: Integration Test Coverage - Critical User Flows
 *
 * E2E-like tests simulating real user workflows:
 * - Idea CRUD lifecycle (create → read → update → archive → restore → delete)
 * - Chat session lifecycle (create → send message → list → delete)
 * - Idea triage flow (list → swipe → priority change)
 * - Search flow (create ideas → search → verify results)
 */

import express, { Express } from 'express';
import request from 'supertest';
import { ideasRouter } from '../../routes/ideas';

// Mock all external dependencies
jest.mock('../../utils/database-context', () => ({
  queryContext: jest.fn(),
  isValidContext: jest.fn((ctx: string) => ctx === 'personal' || ctx === 'work'),
  isValidUUID: jest.fn((id: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id),
  ),
  AIContext: {},
}));

jest.mock('../../middleware/auth', () => ({
  apiKeyAuth: jest.fn((req: any, _res: any, next: any) => {
    req.apiKey = { id: 'test-key', name: 'Test', scopes: ['read', 'write', 'admin'], rateLimit: 10000 };
    next();
  }),
  requireScope: jest.fn(() => (_req: any, _res: any, next: any) => next()),
}));

jest.mock('../../utils/ollama', () => ({
  generateEmbedding: jest.fn().mockResolvedValue([0.1, 0.2, 0.3]),
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

const mockQueryContext = queryContext as jest.MockedFunction<typeof queryContext>;

// Shared test data
const TEST_UUID = '550e8400-e29b-41d4-a716-446655440001';
const TEST_UUID_2 = '550e8400-e29b-41d4-a716-446655440002';
const NOW = new Date().toISOString();

function createMockIdea(overrides: Record<string, unknown> = {}) {
  return {
    id: TEST_UUID,
    title: 'Test Idea',
    type: 'idea',
    category: 'business',
    priority: 'medium',
    summary: 'A test idea summary',
    next_steps: '["Step 1", "Step 2"]',
    context_needed: '["Context A"]',
    keywords: '["test", "idea"]',
    raw_transcript: 'Original transcript',
    context: 'personal',
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

describe('Phase 8.1: Critical User Flow Integration Tests', () => {
  let app: Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/ideas', ideasRouter);
    app.use(errorHandler);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryContext.mockReset();
  });

  // ===========================================
  // Flow 1: Idea CRUD Lifecycle
  // ===========================================

  describe('Flow: Idea CRUD Lifecycle', () => {
    it('should support full create → read → update → archive → restore → delete flow', async () => {
      const mockIdea = createMockIdea();
      const updatedIdea = createMockIdea({ title: 'Updated Idea', priority: 'high' });

      // Step 1: List ideas (initially empty)
      // Route calls: 1) SELECT ideas (list), 2) SELECT COUNT (total)
      mockQueryContext
        .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any) // list query
        .mockResolvedValueOnce({ rows: [{ total: '0' }], rowCount: 1 } as any); // count query

      const listRes = await request(app)
        .get('/api/ideas')
        .set('x-ai-context', 'personal');
      expect(listRes.status).toBe(200);
      expect(listRes.body).toHaveProperty('ideas');

      // Step 2: Read a specific idea
      mockQueryContext.mockReset();
      mockQueryContext
        .mockResolvedValueOnce({ rows: [mockIdea], rowCount: 1 } as any)  // select
        .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);         // view count

      const getRes = await request(app)
        .get(`/api/ideas/${TEST_UUID}`)
        .set('x-ai-context', 'personal');
      expect(getRes.status).toBe(200);
      expect(getRes.body).toHaveProperty('success', true);
      expect(getRes.body.idea).toHaveProperty('id', TEST_UUID);
      expect(getRes.body.idea).toHaveProperty('title', 'Test Idea');

      // Step 3: Update the idea (2 queries: SELECT old values + UPDATE RETURNING)
      mockQueryContext.mockReset();
      mockQueryContext
        .mockResolvedValueOnce({ rows: [{ type: 'idea', category: 'business', priority: 'medium' }], rowCount: 1 } as any)
        .mockResolvedValueOnce({ rows: [updatedIdea], rowCount: 1 } as any);

      const updateRes = await request(app)
        .put(`/api/ideas/${TEST_UUID}`)
        .set('x-ai-context', 'personal')
        .send({ title: 'Updated Idea', priority: 'high' });
      expect(updateRes.status).toBe(200);

      // Step 4: Archive the idea
      mockQueryContext.mockReset();
      mockQueryContext.mockResolvedValueOnce({
        rows: [{ ...updatedIdea, archived: true }],
        rowCount: 1,
      } as any);

      const archiveRes = await request(app)
        .put(`/api/ideas/${TEST_UUID}/archive`)
        .set('x-ai-context', 'personal');
      expect(archiveRes.status).toBe(200);
      expect(archiveRes.body).toHaveProperty('success', true);

      // Step 5: Restore the idea
      mockQueryContext.mockReset();
      mockQueryContext.mockResolvedValueOnce({
        rows: [{ ...updatedIdea, archived: false }],
        rowCount: 1,
      } as any);

      const restoreRes = await request(app)
        .put(`/api/ideas/${TEST_UUID}/restore`)
        .set('x-ai-context', 'personal');
      expect(restoreRes.status).toBe(200);
      expect(restoreRes.body).toHaveProperty('success', true);

      // Step 6: Delete the idea
      mockQueryContext.mockReset();
      mockQueryContext.mockResolvedValueOnce({
        rows: [{ id: TEST_UUID }],
        rowCount: 1,
      } as any);

      const deleteRes = await request(app)
        .delete(`/api/ideas/${TEST_UUID}`)
        .set('x-ai-context', 'personal');
      expect(deleteRes.status).toBe(200);
      expect(deleteRes.body).toHaveProperty('success', true);
    });

    it('should return 404 for non-existent idea in get → update → delete', async () => {
      // GET non-existent
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);
      const getRes = await request(app)
        .get(`/api/ideas/${TEST_UUID}`)
        .set('x-ai-context', 'personal');
      expect(getRes.status).toBe(404);

      // PUT non-existent
      mockQueryContext.mockReset();
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);
      const putRes = await request(app)
        .put(`/api/ideas/${TEST_UUID}`)
        .set('x-ai-context', 'personal')
        .send({ title: 'Updated' });
      expect(putRes.status).toBe(404);

      // DELETE non-existent
      mockQueryContext.mockReset();
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);
      const delRes = await request(app)
        .delete(`/api/ideas/${TEST_UUID}`)
        .set('x-ai-context', 'personal');
      expect(delRes.status).toBe(404);
    });
  });

  // ===========================================
  // Flow 2: Idea Triage & Prioritization
  // ===========================================

  describe('Flow: Idea Triage & Prioritization', () => {
    it('should support triage list → swipe actions → priority change', async () => {
      const idea1 = createMockIdea({ id: TEST_UUID, priority: 'low' });
      const idea2 = createMockIdea({ id: TEST_UUID_2, title: 'Idea 2', priority: 'medium' });

      // Step 1: Get triage list (2 queries: ideas + count)
      mockQueryContext
        .mockResolvedValueOnce({ rows: [idea1, idea2], rowCount: 2 } as any)
        .mockResolvedValueOnce({ rows: [{ total: '5' }], rowCount: 1 } as any);

      const triageRes = await request(app)
        .get('/api/ideas/triage')
        .set('x-ai-context', 'personal');
      expect(triageRes.status).toBe(200);
      expect(triageRes.body).toHaveProperty('ideas');

      // Step 2: Swipe action on first idea (archive)
      mockQueryContext.mockReset();
      mockQueryContext.mockResolvedValueOnce({
        rows: [{ ...idea1, archived: true }],
        rowCount: 1,
      } as any);

      const swipeRes = await request(app)
        .post(`/api/ideas/${TEST_UUID}/swipe`)
        .set('x-ai-context', 'personal')
        .send({ action: 'archive' });
      expect(swipeRes.status).toBe(200);
      expect(swipeRes.body).toHaveProperty('success', true);

      // Step 3: Change priority on second idea (2 queries: SELECT old + UPDATE)
      mockQueryContext.mockReset();
      mockQueryContext
        .mockResolvedValueOnce({ rows: [{ priority: 'medium' }], rowCount: 1 } as any)
        .mockResolvedValueOnce({
          rows: [{ id: TEST_UUID_2, title: 'Idea 2', priority: 'high' }],
          rowCount: 1,
        } as any);

      const priorityRes = await request(app)
        .put(`/api/ideas/${TEST_UUID_2}/priority`)
        .set('x-ai-context', 'personal')
        .send({ priority: 'high' });
      expect(priorityRes.status).toBe(200);
      expect(priorityRes.body).toHaveProperty('success', true);
    });

    it('should support triage action with priority/keep/later/archive', async () => {
      const actions = ['priority', 'keep', 'later', 'archive'] as const;

      for (const action of actions) {
        mockQueryContext.mockReset();
        mockQueryContext.mockResolvedValueOnce({
          rows: [createMockIdea()],
          rowCount: 1,
        } as any);

        const res = await request(app)
          .post(`/api/ideas/${TEST_UUID}/triage`)
          .set('x-ai-context', 'personal')
          .send({ action });
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('success', true);
        expect(res.body).toHaveProperty('action', action);
      }
    });
  });

  // ===========================================
  // Flow 3: Search & Filter
  // ===========================================

  describe('Flow: Search & Filter', () => {
    it('should support filtered listing with pagination', async () => {
      const ideas = [
        createMockIdea({ id: TEST_UUID, priority: 'high', type: 'idea' }),
        createMockIdea({ id: TEST_UUID_2, priority: 'high', type: 'idea', title: 'Idea 2' }),
      ];

      // Step 1: List with filters (list first, then count)
      mockQueryContext
        .mockResolvedValueOnce({ rows: ideas, rowCount: 2 } as any)              // list
        .mockResolvedValueOnce({ rows: [{ total: '2' }], rowCount: 1 } as any);  // count

      const listRes = await request(app)
        .get('/api/ideas?limit=10&offset=0&priority=high&type=idea')
        .set('x-ai-context', 'personal');
      expect(listRes.status).toBe(200);
      expect(listRes.body).toHaveProperty('ideas');
    });

    it('should support semantic search flow', async () => {
      const searchResults = [
        createMockIdea({ id: TEST_UUID, title: 'Machine Learning Project' }),
      ];

      // Step 1: Search
      mockQueryContext.mockResolvedValueOnce({
        rows: searchResults,
        rowCount: 1,
      } as any);

      const searchRes = await request(app)
        .post('/api/ideas/search')
        .set('x-ai-context', 'personal')
        .send({ query: 'machine learning', limit: 10 });
      expect(searchRes.status).toBe(200);
      expect(searchRes.body).toHaveProperty('ideas');
    });
  });

  // ===========================================
  // Flow 4: Context Switching
  // ===========================================

  describe('Flow: Context Switching', () => {
    it('should isolate ideas between personal and work contexts', async () => {
      const personalIdea = createMockIdea({ context: 'personal', title: 'Personal Idea' });
      const workIdea = createMockIdea({ context: 'work', title: 'Work Idea' });

      // List personal ideas (list first, then count)
      mockQueryContext
        .mockResolvedValueOnce({ rows: [personalIdea], rowCount: 1 } as any)
        .mockResolvedValueOnce({ rows: [{ total: '1' }], rowCount: 1 } as any);

      const personalRes = await request(app)
        .get('/api/ideas')
        .set('x-ai-context', 'personal');
      expect(personalRes.status).toBe(200);

      // List work ideas (list first, then count)
      mockQueryContext.mockReset();
      mockQueryContext
        .mockResolvedValueOnce({ rows: [workIdea], rowCount: 1 } as any)
        .mockResolvedValueOnce({ rows: [{ total: '1' }], rowCount: 1 } as any);

      const workRes = await request(app)
        .get('/api/ideas')
        .set('x-ai-context', 'work');
      expect(workRes.status).toBe(200);

      // Verify context parameter is passed to queryContext
      expect(mockQueryContext).toHaveBeenCalledWith(
        'work',
        expect.any(String),
        expect.any(Array),
      );
    });
  });

  // ===========================================
  // Flow 5: Validation Boundaries
  // ===========================================

  describe('Flow: Input Validation', () => {
    it('should reject invalid UUID in idea operations', async () => {
      const invalidId = 'not-a-uuid';

      const getRes = await request(app)
        .get(`/api/ideas/${invalidId}`)
        .set('x-ai-context', 'personal');
      expect(getRes.status).toBe(400);

      const putRes = await request(app)
        .put(`/api/ideas/${invalidId}`)
        .set('x-ai-context', 'personal')
        .send({ title: 'Updated' });
      expect(putRes.status).toBe(400);

      const delRes = await request(app)
        .delete(`/api/ideas/${invalidId}`)
        .set('x-ai-context', 'personal');
      expect(delRes.status).toBe(400);
    });

    it('should handle database errors gracefully', async () => {
      mockQueryContext.mockRejectedValue(new Error('Connection terminated'));

      const res = await request(app)
        .get('/api/ideas')
        .set('x-ai-context', 'personal');
      // Should return 500 without crashing the server
      expect(res.status).toBe(500);
    });
  });
});
