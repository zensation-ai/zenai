/**
 * Integration Tests for API Key Backward Compatibility (Phase 65)
 *
 * Verifies that API Key auth still works correctly and falls back
 * to SYSTEM_USER_ID when no linked user is present.
 * Ensures pre-multi-user data remains accessible.
 */

import express, { Express } from 'express';
import request from 'supertest';

// ============================================================
// Mocks
// ============================================================

jest.mock('../../utils/database-context', () => ({
  queryContext: jest.fn(),
  isValidContext: jest.fn((ctx: string) => ['personal', 'work', 'learning', 'creative'].includes(ctx)),
  isValidUUID: jest.fn((id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)),
  AIContext: {},
}));

jest.mock('../../middleware/auth', () => ({
  apiKeyAuth: jest.fn((req: any, _res: any, next: any) => {
    // Simulate default API Key auth: sets req.apiKey but no req.jwtUser
    req.apiKey = { id: 'test-key', name: 'Test', scopes: ['read', 'write', 'admin'], rateLimit: 10000 };
    // API Key auth typically sets user.id to 'api-key' prefix
    req.user = { id: 'api-key-test-key' };
    next();
  }),
  requireScope: jest.fn(() => (_req: any, _res: any, next: any) => next()),
}));

jest.mock('../../middleware/validate-params', () => ({
  requireUUID: () => (_req: any, _res: any, next: any) => next(),
}));

jest.mock('../../utils/schemas', () => ({
  CreateTaskSchema: {},
  UpdateTaskSchema: {},
  validateBody: () => (_req: any, _res: any, next: any) => next(),
}));

jest.mock('../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock tasks service
jest.mock('../../services/tasks', () => ({
  createTask: jest.fn(),
  getTasks: jest.fn(),
  getTask: jest.fn(),
  updateTask: jest.fn(),
  deleteTask: jest.fn(),
  reorderTasks: jest.fn(),
  getTasksForGantt: jest.fn(),
  addDependency: jest.fn(),
  removeDependency: jest.fn(),
  getTaskDependencies: jest.fn(),
  convertIdeaToTask: jest.fn(),
  TaskStatus: {},
}));

// Mock ideas route dependencies
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

jest.mock('../../services/activity-tracker', () => ({
  trackActivity: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../middleware/response-cache', () => ({
  invalidateCacheForContext: jest.fn(),
}));

jest.mock('../../services/duplicate-detection', () => ({
  findDuplicates: jest.fn().mockResolvedValue([]),
  mergeIdeas: jest.fn(),
}));

jest.mock('../../services/idea-move', () => ({
  moveIdea: jest.fn(),
}));

jest.mock('../../services/ai-activity-logger', () => ({
  logAIActivity: jest.fn().mockResolvedValue(undefined),
}));

import { queryContext } from '../../utils/database-context';
import { getUserId, SYSTEM_USER_ID, getOptionalUserId } from '../../utils/user-context';
import { errorHandler } from '../../middleware/errorHandler';
import { ideasRouter } from '../../routes/ideas';
import { tasksRouter } from '../../routes/tasks';
import { getTasks, createTask } from '../../services/tasks';

const mockQueryContext = queryContext as jest.MockedFunction<typeof queryContext>;
const mockGetTasks = getTasks as jest.MockedFunction<typeof getTasks>;
const mockCreateTask = createTask as jest.MockedFunction<typeof createTask>;

// ============================================================
// Helpers
// ============================================================

const LINKED_USER_ID = '33333333-3333-3333-3333-333333333333';

function mockRequest(overrides: Record<string, any> = {}): any {
  return {
    jwtUser: undefined,
    user: undefined,
    apiKey: undefined,
    headers: {},
    query: {},
    params: {},
    body: {},
    ...overrides,
  };
}

// ============================================================
// API Key Auth → SYSTEM_USER_ID Fallback
// ============================================================

describe('API Key backward compatibility', () => {
  describe('getUserId with API Key auth patterns', () => {
    it('returns SYSTEM_USER_ID for API key without linked user', () => {
      const req = mockRequest({
        apiKey: { id: 'test-key', name: 'Test', scopes: ['read', 'write'] },
        user: { id: 'api-key-test-key' },
      });
      expect(getUserId(req)).toBe(SYSTEM_USER_ID);
    });

    it('returns SYSTEM_USER_ID when user.id is exactly "api-key"', () => {
      const req = mockRequest({ user: { id: 'api-key' } });
      expect(getUserId(req)).toBe(SYSTEM_USER_ID);
    });

    it('returns SYSTEM_USER_ID for various api-key prefixed IDs', () => {
      const prefixes = ['api-key-abc', 'api-key-123', 'api-key-uuid-here'];
      for (const prefix of prefixes) {
        const req = mockRequest({ user: { id: prefix } });
        expect(getUserId(req)).toBe(SYSTEM_USER_ID);
      }
    });

    it('returns linked user ID when API key has a real user association', () => {
      // When an API key is linked to a real user, req.user.id is the actual UUID
      const req = mockRequest({
        apiKey: { id: 'linked-key', name: 'Linked', scopes: ['read'] },
        user: { id: LINKED_USER_ID },
      });
      expect(getUserId(req)).toBe(LINKED_USER_ID);
    });

    it('getOptionalUserId returns null for API key without linked user', () => {
      const req = mockRequest({
        apiKey: { id: 'test-key', name: 'Test', scopes: ['read'] },
        user: { id: 'api-key-test' },
      });
      expect(getOptionalUserId(req)).toBeNull();
    });

    it('getOptionalUserId returns user ID for API key with linked user', () => {
      const req = mockRequest({
        user: { id: LINKED_USER_ID },
      });
      expect(getOptionalUserId(req)).toBe(LINKED_USER_ID);
    });
  });

  // ============================================================
  // Data created with SYSTEM_USER_ID is accessible via API Key
  // ============================================================

  describe('data accessibility with SYSTEM_USER_ID', () => {
    let app: Express;

    beforeAll(() => {
      app = express();
      app.use(express.json());
      app.use('/api/ideas', ideasRouter);
      app.use('/api', tasksRouter);
      app.use(errorHandler);
    });

    beforeEach(() => {
      jest.clearAllMocks();
      mockQueryContext.mockReset();
      mockGetTasks.mockReset();
      mockCreateTask.mockReset();
    });

    it('ideas stats query uses SYSTEM_USER_ID when accessed via API key', async () => {
      mockQueryContext
        .mockResolvedValueOnce({ rows: [{ total: '10' }] } as any)
        .mockResolvedValueOnce({ rows: [] } as any)
        .mockResolvedValueOnce({ rows: [] } as any)
        .mockResolvedValueOnce({ rows: [] } as any);

      const res = await request(app)
        .get('/api/ideas/stats/summary')
        .set('x-api-key', 'test');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // All queries should use SYSTEM_USER_ID
      for (const call of mockQueryContext.mock.calls) {
        const params = call[2] as any[];
        expect(params[0]).toBe(SYSTEM_USER_ID);
      }
    });

    it('tasks list uses SYSTEM_USER_ID when accessed via API key', async () => {
      mockGetTasks.mockResolvedValue([
        { id: 'task-1', title: 'Legacy Task', status: 'todo', priority: 'medium' } as any,
      ]);

      const res = await request(app)
        .get('/api/personal/tasks')
        .set('x-api-key', 'test');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);

      // getTasks should receive SYSTEM_USER_ID
      const callArgs = mockGetTasks.mock.calls[0];
      expect(callArgs[2]).toBe(SYSTEM_USER_ID);
    });

    it('task creation uses SYSTEM_USER_ID when accessed via API key', async () => {
      const createdTask = {
        id: 'new-task-id',
        title: 'New Task via API Key',
        status: 'todo' as const,
        priority: 'medium' as const,
      };
      mockCreateTask.mockResolvedValue(createdTask as any);

      const res = await request(app)
        .post('/api/personal/tasks')
        .set('x-api-key', 'test')
        .send({ title: 'New Task via API Key' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);

      // createTask should receive SYSTEM_USER_ID
      const callArgs = mockCreateTask.mock.calls[0];
      expect(callArgs[2]).toBe(SYSTEM_USER_ID);
    });
  });

  // ============================================================
  // JWT auth overrides API Key fallback
  // ============================================================

  describe('JWT takes precedence over API key fallback', () => {
    let app: Express;

    beforeAll(() => {
      app = express();
      app.use(express.json());
      app.use('/api', tasksRouter);
      app.use(errorHandler);
    });

    beforeEach(() => {
      jest.clearAllMocks();
      mockGetTasks.mockReset();
    });

    it('uses JWT user ID even when API key is also present', async () => {
      const jwtUserId = '44444444-4444-4444-4444-444444444444';
      const { apiKeyAuth } = require('../../middleware/auth');

      (apiKeyAuth as jest.Mock).mockImplementationOnce((req: any, _res: any, next: any) => {
        // Simulate dual auth: both JWT and API key present
        req.jwtUser = { id: jwtUserId, email: 'jwt@test.com', role: 'user' };
        req.apiKey = { id: 'test-key', name: 'Test', scopes: ['read', 'write', 'admin'], rateLimit: 10000 };
        req.user = { id: 'api-key-test-key' };
        next();
      });

      mockGetTasks.mockResolvedValue([]);

      await request(app)
        .get('/api/personal/tasks')
        .set('x-api-key', 'test');

      expect(mockGetTasks).toHaveBeenCalledTimes(1);
      const callArgs = mockGetTasks.mock.calls[0];
      expect(callArgs[2]).toBe(jwtUserId);
      expect(callArgs[2]).not.toBe(SYSTEM_USER_ID);
    });
  });

  // ============================================================
  // SYSTEM_USER_ID constant integrity
  // ============================================================

  describe('SYSTEM_USER_ID constant', () => {
    it('is a well-known UUID value', () => {
      expect(SYSTEM_USER_ID).toBe('00000000-0000-0000-0000-000000000001');
    });

    it('is a valid UUID format', () => {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      expect(SYSTEM_USER_ID).toMatch(uuidRegex);
    });

    it('is consistent across imports', () => {
      // Re-import to verify same value
      const { SYSTEM_USER_ID: reimported } = require('../../utils/user-context');
      expect(reimported).toBe(SYSTEM_USER_ID);
    });
  });
});
