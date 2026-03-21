/**
 * Integration Tests for A2A Protocol API
 *
 * Supplements existing a2a-routes.test.ts with additional integration-level tests:
 * - GET  /.well-known/agent.json              - Agent card discovery
 * - POST /api/a2a/tasks                       - Create A2A task
 * - GET  /api/a2a/tasks/:id                   - Get task status
 * - DELETE /api/a2a/tasks/:id                 - Cancel task
 * - GET  /api/:context/a2a/tasks              - List tasks
 * - GET  /api/:context/a2a/external-agents    - List external agents
 * - POST /api/:context/a2a/external-agents    - Register external agent
 *
 * Phase 122 - Worker 2
 */

import express, { Express } from 'express';
import request from 'supertest';

const VALID_UUID = '11111111-1111-1111-1111-111111111111';

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

jest.mock('../../utils/database-context', () => ({
  queryContext: jest.fn(),
  isValidContext: jest.fn((ctx: string) => ['personal', 'work', 'learning', 'creative'].includes(ctx)),
  AIContext: {},
}));

const mockGenerateAgentCard = jest.fn();
const mockIsValidSkill = jest.fn();

jest.mock('../../services/a2a/agent-card', () => ({
  generateAgentCard: (...args: unknown[]) => mockGenerateAgentCard(...args),
  isValidSkill: (...args: unknown[]) => mockIsValidSkill(...args),
}));

const mockCreateTask = jest.fn();
const mockGetTask = jest.fn();
const mockCancelTask = jest.fn();
const mockListTasks = jest.fn();
const mockSendMessage = jest.fn();

jest.mock('../../services/a2a/task-manager', () => ({
  a2aTaskManager: {
    createTask: (...args: unknown[]) => mockCreateTask(...args),
    getTask: (...args: unknown[]) => mockGetTask(...args),
    cancelTask: (...args: unknown[]) => mockCancelTask(...args),
    listTasks: (...args: unknown[]) => mockListTasks(...args),
    sendMessage: (...args: unknown[]) => mockSendMessage(...args),
  },
}));

const mockListAgents = jest.fn();
const mockRegisterAgent = jest.fn();
const mockRemoveAgent = jest.fn();
const mockHealthCheck = jest.fn();
const mockSendTaskToExternal = jest.fn();

jest.mock('../../services/a2a/a2a-client', () => ({
  a2aClient: {
    listAgents: (...args: unknown[]) => mockListAgents(...args),
    registerAgent: (...args: unknown[]) => mockRegisterAgent(...args),
    removeAgent: (...args: unknown[]) => mockRemoveAgent(...args),
    healthCheck: (...args: unknown[]) => mockHealthCheck(...args),
    sendTask: (...args: unknown[]) => mockSendTaskToExternal(...args),
  },
}));

import { a2aWellKnownRouter, a2aRouter } from '../../routes/a2a';
import { errorHandler } from '../../middleware/errorHandler';

describe('A2A Protocol Integration Tests', () => {
  let app: Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use(a2aWellKnownRouter);
    app.use('/api', a2aRouter);
    app.use(errorHandler);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ============================================================
  // GET /.well-known/agent.json
  // ============================================================

  describe('GET /.well-known/agent.json', () => {
    it('should return agent card without auth', async () => {
      const card = {
        name: 'ZenAI',
        version: '1.0',
        skills: [{ id: 'research', name: 'Research' }],
        authentication: { schemes: ['bearer'] },
      };
      mockGenerateAgentCard.mockReturnValueOnce(card);

      const res = await request(app)
        .get('/.well-known/agent.json')
        .expect(200);

      expect(res.body.name).toBe('ZenAI');
      expect(res.body.skills).toHaveLength(1);
    });
  });

  // ============================================================
  // POST /api/a2a/tasks
  // ============================================================

  describe('POST /api/a2a/tasks', () => {
    it('should create a task with valid skill', async () => {
      mockIsValidSkill.mockReturnValueOnce(true);
      const task = { id: VALID_UUID, status: 'submitted', skill_id: 'research' };
      mockCreateTask.mockResolvedValueOnce(task);

      const res = await request(app)
        .post('/api/a2a/tasks')
        .send({ skill_id: 'research', message: 'Find info about React' })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(VALID_UUID);
    });

    it('should return 400 for missing skill_id', async () => {
      const res = await request(app)
        .post('/api/a2a/tasks')
        .send({ message: 'Test' })
        .expect(400);

      expect(res.body.error).toContain('skill_id');
    });

    it('should return 400 for missing message', async () => {
      const res = await request(app)
        .post('/api/a2a/tasks')
        .send({ skill_id: 'research' })
        .expect(400);

      expect(res.body.error).toContain('message');
    });

    it('should return 400 for invalid skill_id', async () => {
      mockIsValidSkill.mockReturnValueOnce(false);

      const res = await request(app)
        .post('/api/a2a/tasks')
        .send({ skill_id: 'nonexistent', message: 'Test' })
        .expect(400);

      expect(res.body.error).toContain('Invalid skill_id');
    });
  });

  // ============================================================
  // GET /api/a2a/tasks/:id
  // ============================================================

  describe('GET /api/a2a/tasks/:id', () => {
    it('should return task found in personal context', async () => {
      const task = { id: VALID_UUID, status: 'completed', skill_id: 'research' };
      mockGetTask.mockResolvedValueOnce(task);

      const res = await request(app)
        .get(`/api/a2a/tasks/${VALID_UUID}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('completed');
    });

    it('should search across contexts and return 404', async () => {
      mockGetTask.mockResolvedValue(null);

      const res = await request(app)
        .get(`/api/a2a/tasks/${VALID_UUID}`)
        .expect(404);

      expect(res.body.success).toBe(false);
      // 1 personal + 3 fallbacks = 4 calls
      expect(mockGetTask).toHaveBeenCalledTimes(4);
    });
  });

  // ============================================================
  // GET /api/:context/a2a/tasks
  // ============================================================

  describe('GET /api/:context/a2a/tasks', () => {
    it('should list tasks for context', async () => {
      const tasks = [{ id: VALID_UUID, status: 'working' }];
      mockListTasks.mockResolvedValueOnce(tasks);

      const res = await request(app)
        .get('/api/personal/a2a/tasks')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(tasks);
    });

    it('should return 400 for invalid context', async () => {
      const res = await request(app)
        .get('/api/invalid/a2a/tasks')
        .expect(400);

      expect(res.body.success).toBe(false);
    });
  });

  // ============================================================
  // POST /api/:context/a2a/external-agents
  // ============================================================

  describe('POST /api/:context/a2a/external-agents', () => {
    it('should register an external agent', async () => {
      const agent = { id: VALID_UUID, name: 'External Bot', url: 'https://bot.example.com' };
      mockRegisterAgent.mockResolvedValueOnce(agent);

      const res = await request(app)
        .post('/api/personal/a2a/external-agents')
        .send({ name: 'External Bot', url: 'https://bot.example.com' })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('External Bot');
    });

    it('should return 400 for missing name', async () => {
      const res = await request(app)
        .post('/api/personal/a2a/external-agents')
        .send({ url: 'https://bot.example.com' })
        .expect(400);

      expect(res.body.error).toContain('name');
    });

    it('should return 400 for missing url', async () => {
      const res = await request(app)
        .post('/api/personal/a2a/external-agents')
        .send({ name: 'Bot' })
        .expect(400);

      expect(res.body.error).toContain('url');
    });
  });

  // ============================================================
  // DELETE /api/a2a/tasks/:id
  // ============================================================

  describe('DELETE /api/a2a/tasks/:id', () => {
    it('should cancel a task', async () => {
      mockCancelTask.mockResolvedValueOnce(undefined);

      const res = await request(app)
        .delete(`/api/a2a/tasks/${VALID_UUID}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('canceled');
    });

    it('should return 404 when task not found in any context', async () => {
      mockCancelTask.mockRejectedValue(new Error('not found'));

      const res = await request(app)
        .delete(`/api/a2a/tasks/${VALID_UUID}`)
        .expect(404);

      expect(res.body.success).toBe(false);
    });
  });
});
