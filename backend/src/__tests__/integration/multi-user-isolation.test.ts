/**
 * Integration Tests for Multi-User Isolation (Phase 65)
 *
 * Verifies that user_id isolation works correctly across routes.
 * Ensures getUserId extracts the correct user from JWT, API Key, or fallback.
 */

import express, { Express } from 'express';
import request from 'supertest';

// ============================================================
// Mocks — must be before imports that use mocked modules
// ============================================================

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

jest.mock('../../middleware/validate-params', () => ({
  requireUUID: () => (_req: any, _res: any, next: any) => next(),
}));

jest.mock('../../utils/schemas', () => ({
  CreateTaskSchema: {},
  UpdateTaskSchema: {},
  validateBody: () => (req: any, _res: any, next: any) => {
    // Pass-through: no validation in tests
    next();
  },
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

jest.mock('../../services/activity-tracker', () => ({
  trackActivity: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../middleware/response-cache', () => ({
  invalidateCacheForContext: jest.fn(),
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

// Mock email service
jest.mock('../../services/email', () => ({
  getEmails: jest.fn(),
  getEmail: jest.fn(),
  getThread: jest.fn(),
  createDraft: jest.fn(),
  updateDraft: jest.fn(),
  sendEmailById: jest.fn(),
  sendNewEmail: jest.fn(),
  replyToEmail: jest.fn(),
  forwardEmail: jest.fn(),
  updateEmailStatus: jest.fn(),
  markAsRead: jest.fn(),
  toggleStar: jest.fn(),
  batchUpdateStatus: jest.fn(),
  moveToTrash: jest.fn(),
  getEmailStats: jest.fn(),
  getAccounts: jest.fn(),
  getAccount: jest.fn(),
  createAccount: jest.fn(),
  createImapAccount: jest.fn(),
  updateAccount: jest.fn(),
  deleteAccount: jest.fn(),
  getLabels: jest.fn(),
  createLabel: jest.fn(),
  updateLabel: jest.fn(),
  deleteLabel: jest.fn(),
  EmailStatus: {},
  EmailDirection: {},
}));

jest.mock('../../services/imap-sync', () => ({
  testImapConnection: jest.fn(),
  syncAccount: jest.fn(),
}));

jest.mock('../../utils/encryption', () => ({
  encrypt: jest.fn((v: string) => `enc_${v}`),
}));

jest.mock('../../services/email-search', () => ({
  parseNaturalLanguageQuery: jest.fn(),
  searchEmails: jest.fn(),
  getInboxSummary: jest.fn(),
}));

jest.mock('../../services/email-digest', () => ({
  generateEmailDigest: jest.fn(),
  formatDigestForChat: jest.fn(),
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
import { getUserId, SYSTEM_USER_ID } from '../../utils/user-context';
import { errorHandler } from '../../middleware/errorHandler';
import { ideasRouter } from '../../routes/ideas';
import { tasksRouter } from '../../routes/tasks';
import { emailRouter } from '../../routes/email';
import { getTasks, createTask } from '../../services/tasks';
import { getEmails } from '../../services/email';

const mockQueryContext = queryContext as jest.MockedFunction<typeof queryContext>;
const mockGetTasks = getTasks as jest.MockedFunction<typeof getTasks>;
const mockCreateTask = createTask as jest.MockedFunction<typeof createTask>;
const mockGetEmails = getEmails as jest.MockedFunction<typeof getEmails>;

// ============================================================
// Test Helpers
// ============================================================

const TEST_JWT_USER_ID = '11111111-1111-1111-1111-111111111111';
const TEST_USER_ID = '22222222-2222-2222-2222-222222222222';

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
// getUserId Utility Tests
// ============================================================

describe('getUserId utility', () => {
  it('returns JWT user ID when req.jwtUser.id is set', () => {
    const req = mockRequest({ jwtUser: { id: TEST_JWT_USER_ID, email: 'test@test.com', role: 'user' } });
    expect(getUserId(req)).toBe(TEST_JWT_USER_ID);
  });

  it('returns req.user.id when no JWT but user is set', () => {
    const req = mockRequest({ user: { id: TEST_USER_ID } });
    expect(getUserId(req)).toBe(TEST_USER_ID);
  });

  it('returns SYSTEM_USER_ID when neither jwtUser nor user is set', () => {
    const req = mockRequest({});
    expect(getUserId(req)).toBe(SYSTEM_USER_ID);
  });

  it('returns SYSTEM_USER_ID when req.user.id starts with "api-key"', () => {
    const req = mockRequest({ user: { id: 'api-key-abc123' } });
    expect(getUserId(req)).toBe(SYSTEM_USER_ID);
  });

  it('prefers JWT user over req.user when both are set', () => {
    const req = mockRequest({
      jwtUser: { id: TEST_JWT_USER_ID, email: 'jwt@test.com', role: 'user' },
      user: { id: TEST_USER_ID },
    });
    expect(getUserId(req)).toBe(TEST_JWT_USER_ID);
  });

  it('returns SYSTEM_USER_ID when req.jwtUser exists but id is undefined', () => {
    const req = mockRequest({ jwtUser: { email: 'test@test.com' } });
    expect(getUserId(req)).toBe(SYSTEM_USER_ID);
  });

  it('returns SYSTEM_USER_ID when req.user exists but id is undefined', () => {
    const req = mockRequest({ user: { name: 'Test' } });
    expect(getUserId(req)).toBe(SYSTEM_USER_ID);
  });
});

// ============================================================
// Ideas Route — User Isolation Tests
// ============================================================

describe('Ideas API — user_id isolation', () => {
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

  it('GET /api/ideas/stats/summary includes user_id in query params', async () => {
    // Mock all 4 parallel queries for stats/summary
    mockQueryContext
      .mockResolvedValueOnce({ rows: [{ total: '5' }] } as any)
      .mockResolvedValueOnce({ rows: [{ type: 'idea', count: '3' }] } as any)
      .mockResolvedValueOnce({ rows: [{ category: 'personal', count: '2' }] } as any)
      .mockResolvedValueOnce({ rows: [{ priority: 'medium', count: '4' }] } as any);

    const res = await request(app)
      .get('/api/ideas/stats/summary')
      .set('x-api-key', 'test');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Verify each queryContext call includes user_id as parameter
    for (const call of mockQueryContext.mock.calls) {
      const sql = call[1] as string;
      const params = call[2] as any[];
      expect(sql).toContain('user_id = $1');
      expect(params).toBeDefined();
      expect(params.length).toBeGreaterThanOrEqual(1);
      // Should be SYSTEM_USER_ID since we use API key auth (no JWT)
      expect(params[0]).toBe(SYSTEM_USER_ID);
    }
  });

  it('POST /api/ideas/:id/triage includes user_id in WHERE clause', async () => {
    const ideaId = 'aaaaaaaa-bbbb-1111-8888-cccccccccccc';

    // Mock: idea lookup returns a match
    mockQueryContext
      .mockResolvedValueOnce({ rows: [{ id: ideaId, title: 'Test', priority: 'medium' }] } as any)
      // Mock: update
      .mockResolvedValueOnce({ rows: [{ id: ideaId, priority: 'high' }] } as any);

    const res = await request(app)
      .post(`/api/ideas/${ideaId}/triage`)
      .set('x-api-key', 'test')
      .send({ action: 'priority' });

    expect([200, 201]).toContain(res.status);

    // First queryContext call should be the SELECT with user_id
    const [, selectSql, selectParams] = mockQueryContext.mock.calls[0];
    expect(selectSql).toContain('user_id = $2');
    expect(selectParams).toContain(SYSTEM_USER_ID);
  });
});

// ============================================================
// Tasks Route — User Isolation Tests
// ============================================================

describe('Tasks API — user_id isolation', () => {
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
    mockCreateTask.mockReset();
  });

  it('GET /api/:context/tasks passes userId to getTasks service', async () => {
    mockGetTasks.mockResolvedValue([]);

    const res = await request(app)
      .get('/api/personal/tasks')
      .set('x-api-key', 'test');

    expect(res.status).toBe(200);
    expect(mockGetTasks).toHaveBeenCalledTimes(1);

    // Third argument should be userId
    const callArgs = mockGetTasks.mock.calls[0];
    expect(callArgs[0]).toBe('personal'); // context
    expect(callArgs[2]).toBe(SYSTEM_USER_ID); // userId
  });

  it('POST /api/:context/tasks passes userId to createTask service', async () => {
    const newTask = {
      id: 'dddddddd-eeee-1111-8888-ffffffffffff',
      title: 'Test Task',
      status: 'todo' as const,
      priority: 'medium' as const,
    };
    mockCreateTask.mockResolvedValue(newTask as any);

    const res = await request(app)
      .post('/api/personal/tasks')
      .set('x-api-key', 'test')
      .send({ title: 'Test Task' });

    expect(res.status).toBe(201);
    expect(mockCreateTask).toHaveBeenCalledTimes(1);

    const callArgs = mockCreateTask.mock.calls[0];
    expect(callArgs[0]).toBe('personal'); // context
    expect(callArgs[2]).toBe(SYSTEM_USER_ID); // userId
  });

  it('GET /api/:context/tasks/gantt passes userId to getTasksForGantt', async () => {
    const { getTasksForGantt } = require('../../services/tasks');
    const mockGetGantt = getTasksForGantt as jest.MockedFunction<typeof getTasksForGantt>;
    mockGetGantt.mockResolvedValue([]);

    const res = await request(app)
      .get('/api/work/tasks/gantt')
      .set('x-api-key', 'test');

    expect(res.status).toBe(200);
    expect(mockGetGantt).toHaveBeenCalledTimes(1);

    const callArgs = mockGetGantt.mock.calls[0];
    expect(callArgs[0]).toBe('work'); // context
    expect(callArgs[2]).toBe(SYSTEM_USER_ID); // userId
  });

  it('uses different userId when JWT user is present', async () => {
    // Override auth mock to simulate JWT user
    const { apiKeyAuth } = require('../../middleware/auth');
    (apiKeyAuth as jest.Mock).mockImplementationOnce((req: any, _res: any, next: any) => {
      req.jwtUser = { id: TEST_JWT_USER_ID, email: 'jwt@test.com', role: 'user' };
      req.apiKey = { id: 'test-key', name: 'Test', scopes: ['read', 'write', 'admin'], rateLimit: 10000 };
      next();
    });

    mockGetTasks.mockResolvedValue([]);

    await request(app)
      .get('/api/personal/tasks')
      .set('x-api-key', 'test');

    expect(mockGetTasks).toHaveBeenCalledTimes(1);
    const callArgs = mockGetTasks.mock.calls[0];
    expect(callArgs[2]).toBe(TEST_JWT_USER_ID); // JWT user takes priority
  });
});

// ============================================================
// Email Route — User Isolation Tests
// ============================================================

describe('Email API — user_id isolation', () => {
  let app: Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api', emailRouter);
    app.use(errorHandler);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetEmails.mockReset();
  });

  it('GET /api/:context/emails passes userId to getEmails service', async () => {
    mockGetEmails.mockResolvedValue({ emails: [], total: 0 });

    const res = await request(app)
      .get('/api/personal/emails')
      .set('x-api-key', 'test');

    expect(res.status).toBe(200);
    expect(mockGetEmails).toHaveBeenCalledTimes(1);

    const callArgs = mockGetEmails.mock.calls[0];
    expect(callArgs[0]).toBe('personal'); // context
    expect(callArgs[2]).toBe(SYSTEM_USER_ID); // userId (third arg after filters)
  });

  it('GET /api/:context/emails/stats passes userId to getEmailStats', async () => {
    const { getEmailStats } = require('../../services/email');
    const mockGetStats = getEmailStats as jest.MockedFunction<typeof getEmailStats>;
    mockGetStats.mockResolvedValue({ unread: 0, total: 0, byCategory: {} });

    const res = await request(app)
      .get('/api/personal/emails/stats')
      .set('x-api-key', 'test');

    expect(res.status).toBe(200);
    expect(mockGetStats).toHaveBeenCalledTimes(1);

    const callArgs = mockGetStats.mock.calls[0];
    expect(callArgs[0]).toBe('personal'); // context
    expect(callArgs[1]).toBe(SYSTEM_USER_ID); // userId
  });

  it('uses JWT userId for email queries when JWT is present', async () => {
    const { apiKeyAuth } = require('../../middleware/auth');
    (apiKeyAuth as jest.Mock).mockImplementationOnce((req: any, _res: any, next: any) => {
      req.jwtUser = { id: TEST_JWT_USER_ID, email: 'jwt@test.com', role: 'user' };
      req.apiKey = { id: 'test-key', name: 'Test', scopes: ['read', 'write', 'admin'], rateLimit: 10000 };
      next();
    });

    mockGetEmails.mockResolvedValue({ emails: [], total: 0 });

    await request(app)
      .get('/api/work/emails')
      .set('x-api-key', 'test');

    expect(mockGetEmails).toHaveBeenCalledTimes(1);
    const callArgs = mockGetEmails.mock.calls[0];
    expect(callArgs[2]).toBe(TEST_JWT_USER_ID); // JWT user takes priority
  });
});

// ============================================================
// Cross-user isolation: User A cannot see User B data
// ============================================================

describe('Cross-user data isolation', () => {
  it('different users get different SYSTEM_USER_IDs resolved', () => {
    const reqA = mockRequest({ jwtUser: { id: TEST_JWT_USER_ID, email: 'a@test.com', role: 'user' } });
    const reqB = mockRequest({ jwtUser: { id: TEST_USER_ID, email: 'b@test.com', role: 'user' } });
    const reqAnon = mockRequest({});

    const userA = getUserId(reqA);
    const userB = getUserId(reqB);
    const userAnon = getUserId(reqAnon);

    expect(userA).toBe(TEST_JWT_USER_ID);
    expect(userB).toBe(TEST_USER_ID);
    expect(userAnon).toBe(SYSTEM_USER_ID);

    // All three should be different
    expect(userA).not.toBe(userB);
    expect(userA).not.toBe(userAnon);
    expect(userB).not.toBe(userAnon);
  });

  it('SYSTEM_USER_ID is a valid UUID format', () => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    expect(SYSTEM_USER_ID).toMatch(uuidRegex);
  });
});
