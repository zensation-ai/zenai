/**
 * Tests for A2A Routes
 */

jest.mock('../../../../utils/database-context', () => ({
  queryContext: jest.fn(),
  isValidContext: jest.fn((ctx: string) => ['personal', 'work', 'learning', 'creative'].includes(ctx)),
}));

jest.mock('../../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
  requestLogger: jest.fn((_req: any, _res: any, next: any) => next()),
}));

jest.mock('../../../../middleware/auth', () => ({
  apiKeyAuth: jest.fn((_req: any, _res: any, next: any) => {
    _req.apiKey = { id: 'test-key', name: 'test', scopes: ['read', 'write', 'admin'], rateLimit: 1000 };
    next();
  }),
  requireScope: jest.fn(() => (_req: any, _res: any, next: any) => next()),
  rateLimiter: jest.fn((_req: any, _res: any, next: any) => next()),
}));

jest.mock('../../../../services/agent-orchestrator', () => ({
  executeTeamTask: jest.fn().mockResolvedValue({
    teamId: 'team-1',
    success: true,
    finalOutput: 'Result',
    agentResults: [],
    executionTimeMs: 500,
    strategy: 'research_only',
    totalTokens: { input: 50, output: 100 },
    memoryStats: { totalEntries: 0, byAgent: {} },
  }),
}));

import express from 'express';
import request from 'supertest';
import { a2aRouter, a2aWellKnownRouter } from '../../../../routes/a2a';
import { errorHandler } from '../../../../middleware/errorHandler';
import { queryContext } from '../../../../utils/database-context';

const mockQueryContext = queryContext as jest.MockedFunction<typeof queryContext>;

// Mock global fetch for external agent operations
const mockFetch = jest.fn();
global.fetch = mockFetch as any;

describe('A2A Routes', () => {
  let app: express.Application;

  const mockTaskRow = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    external_task_id: null,
    skill_id: 'research',
    status: 'submitted',
    message: { role: 'user', parts: [{ type: 'text', text: 'Research AI' }] },
    artifacts: [],
    metadata: {},
    error_message: null,
    caller_agent_url: null,
    caller_agent_name: null,
    auth_method: 'bearer',
    execution_id: null,
    tokens_used: 0,
    created_at: '2026-03-14T00:00:00Z',
    updated_at: '2026-03-14T00:00:00Z',
    completed_at: null,
  };

  const mockAgentRow = {
    id: 'agent-123',
    name: 'External Agent',
    description: 'Test external agent',
    url: 'https://agent.example.com',
    agent_card: null,
    skills: [],
    auth_type: 'bearer',
    auth_token: 'token-123',
    is_active: true,
    last_health_check: null,
    health_status: 'unknown',
    created_at: '2026-03-14T00:00:00Z',
    updated_at: '2026-03-14T00:00:00Z',
  };

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use(a2aWellKnownRouter);
    app.use('/api', a2aRouter);
    app.use(errorHandler);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryContext.mockReset();
    mockFetch.mockReset();
  });

  // ==========================================
  // Agent Card Discovery
  // ==========================================

  describe('GET /.well-known/agent.json', () => {
    it('should return agent card without authentication', async () => {
      const res = await request(app).get('/.well-known/agent.json');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('name', 'ZenAI Agent');
      expect(res.body).toHaveProperty('skills');
      expect(res.body.skills).toHaveLength(5);
    });

    it('should include version and capabilities', async () => {
      const res = await request(app).get('/.well-known/agent.json');

      expect(res.body).toHaveProperty('version', '1.0.0');
      expect(res.body.capabilities).toHaveProperty('streaming', true);
    });

    it('should include authentication schemes', async () => {
      const res = await request(app).get('/.well-known/agent.json');

      expect(res.body.authentication.schemes).toContain('Bearer');
    });
  });

  // ==========================================
  // Task CRUD
  // ==========================================

  describe('POST /api/a2a/tasks', () => {
    it('should create a task with valid skill_id', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [mockTaskRow], rowCount: 1 } as any);
      // processTask calls
      mockQueryContext.mockResolvedValue({ rows: [], rowCount: 0 } as any);

      const res = await request(app)
        .post('/api/a2a/tasks')
        .send({
          skill_id: 'research',
          message: { role: 'user', parts: [{ type: 'text', text: 'Research AI trends' }] },
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('id');
      expect(res.body.data).toHaveProperty('skill_id', 'research');
    });

    it('should return 400 for missing skill_id', async () => {
      const res = await request(app)
        .post('/api/a2a/tasks')
        .send({
          message: { role: 'user', parts: [{ type: 'text', text: 'test' }] },
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should return 400 for missing message', async () => {
      const res = await request(app)
        .post('/api/a2a/tasks')
        .send({ skill_id: 'research' });

      expect(res.status).toBe(400);
    });

    it('should return 400 for invalid skill_id', async () => {
      const res = await request(app)
        .post('/api/a2a/tasks')
        .send({
          skill_id: 'invalid-skill',
          message: { role: 'user', parts: [{ type: 'text', text: 'test' }] },
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid skill_id');
    });
  });

  describe('GET /api/a2a/tasks/:id', () => {
    it('should return task by ID', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [mockTaskRow], rowCount: 1 } as any);

      const res = await request(app).get(`/api/a2a/tasks/${mockTaskRow.id}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(mockTaskRow.id);
    });

    it('should search across contexts and return 404 when not found', async () => {
      // All 4 contexts return empty
      mockQueryContext.mockResolvedValue({ rows: [], rowCount: 0 } as any);

      const res = await request(app).get('/api/a2a/tasks/nonexistent-id');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('should find task in non-personal context', async () => {
      // personal: not found
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);
      // work: found
      mockQueryContext.mockResolvedValueOnce({ rows: [{ ...mockTaskRow, skill_id: 'code-review' }], rowCount: 1 } as any);

      const res = await request(app).get(`/api/a2a/tasks/${mockTaskRow.id}`);

      expect(res.status).toBe(200);
      expect(res.body.data.skill_id).toBe('code-review');
    });
  });

  describe('POST /api/a2a/tasks/:id/messages', () => {
    it('should send a follow-up message', async () => {
      // getTask
      mockQueryContext.mockResolvedValueOnce({ rows: [{ ...mockTaskRow, status: 'working' }], rowCount: 1 } as any);
      // update
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 1 } as any);
      // getTask again
      mockQueryContext.mockResolvedValueOnce({ rows: [{ ...mockTaskRow, status: 'working' }], rowCount: 1 } as any);

      const res = await request(app)
        .post(`/api/a2a/tasks/${mockTaskRow.id}/messages`)
        .send({
          message: { role: 'user', parts: [{ type: 'text', text: 'More context' }] },
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 400 for missing message', async () => {
      const res = await request(app)
        .post(`/api/a2a/tasks/${mockTaskRow.id}/messages`)
        .send({});

      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /api/a2a/tasks/:id', () => {
    it('should cancel a task', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [{ id: mockTaskRow.id }], rowCount: 1 } as any);

      const res = await request(app).delete(`/api/a2a/tasks/${mockTaskRow.id}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 404 when task not found in any context', async () => {
      // All 4 contexts fail
      mockQueryContext.mockResolvedValue({ rows: [], rowCount: 0 } as any);

      const res = await request(app).delete('/api/a2a/tasks/nonexistent');

      expect(res.status).toBe(404);
    });
  });

  // ==========================================
  // SSE Streaming
  // ==========================================

  describe('GET /api/a2a/tasks/:id/stream', () => {
    it('should set correct SSE headers', async () => {
      const completedTask = { ...mockTaskRow, status: 'completed', artifacts: [{ parts: [{ type: 'text', text: 'Done' }] }] };
      mockQueryContext.mockResolvedValue({ rows: [completedTask], rowCount: 1 } as any);

      const res = await request(app)
        .get(`/api/a2a/tasks/${mockTaskRow.id}/stream`)
        .set('Accept', 'text/event-stream');

      expect(res.headers['content-type']).toContain('text/event-stream');
      expect(res.headers['cache-control']).toContain('no-cache');
    });
  });

  // ==========================================
  // Context-Aware Endpoints
  // ==========================================

  describe('GET /api/:context/a2a/tasks', () => {
    it('should list tasks for valid context', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [mockTaskRow], rowCount: 1 } as any);

      const res = await request(app).get('/api/personal/a2a/tasks');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
    });

    it('should return 400 for invalid context', async () => {
      const res = await request(app).get('/api/invalid/a2a/tasks');

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid context');
    });

    it('should pass query filters', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      await request(app).get('/api/work/a2a/tasks?status=completed&skill_id=research&limit=10');

      expect(mockQueryContext).toHaveBeenCalledWith(
        'work',
        expect.stringContaining('status = $1'),
        expect.any(Array)
      );
    });
  });

  describe('GET /api/:context/a2a/external-agents', () => {
    it('should list external agents', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [mockAgentRow], rowCount: 1 } as any);

      const res = await request(app).get('/api/personal/a2a/external-agents');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].name).toBe('External Agent');
    });

    it('should return 400 for invalid context', async () => {
      const res = await request(app).get('/api/invalid/a2a/external-agents');

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/:context/a2a/external-agents', () => {
    it('should register an external agent', async () => {
      // discoverAgent fetch (may fail)
      mockFetch.mockRejectedValueOnce(new Error('timeout'));
      // DB insert
      mockQueryContext.mockResolvedValueOnce({ rows: [mockAgentRow], rowCount: 1 } as any);

      const res = await request(app)
        .post('/api/personal/a2a/external-agents')
        .send({
          name: 'New Agent',
          url: 'https://new-agent.example.com',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
    });

    it('should return 400 for missing name', async () => {
      const res = await request(app)
        .post('/api/personal/a2a/external-agents')
        .send({ url: 'https://agent.example.com' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('name and url are required');
    });

    it('should return 400 for missing url', async () => {
      const res = await request(app)
        .post('/api/personal/a2a/external-agents')
        .send({ name: 'Agent' });

      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /api/:context/a2a/external-agents/:id', () => {
    it('should remove an external agent', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [{ id: 'agent-123' }], rowCount: 1 } as any);

      const res = await request(app).delete('/api/personal/a2a/external-agents/agent-123');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('POST /api/:context/a2a/external-agents/:id/health', () => {
    it('should health check an external agent', async () => {
      // Get agent from DB
      mockQueryContext.mockResolvedValueOnce({ rows: [mockAgentRow], rowCount: 1 } as any);
      // Discover agent
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          name: 'External Agent',
          skills: [{ id: 'test', name: 'Test' }],
        }),
      });
      // Update health status
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      const res = await request(app).post('/api/personal/a2a/external-agents/agent-123/health');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty('status');
      expect(res.body.data).toHaveProperty('responseTimeMs');
    });
  });

  describe('POST /api/:context/a2a/external-agents/:id/send', () => {
    it('should send task to external agent', async () => {
      // listAgents
      mockQueryContext.mockResolvedValueOnce({ rows: [mockAgentRow], rowCount: 1 } as any);
      // sendTask fetch
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: { id: 'remote-task-1' } }),
      });

      const res = await request(app)
        .post('/api/personal/a2a/external-agents/agent-123/send')
        .send({
          skill_id: 'test',
          message: { role: 'user', parts: [{ type: 'text', text: 'Hello' }] },
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 400 for missing skill_id', async () => {
      const res = await request(app)
        .post('/api/personal/a2a/external-agents/agent-123/send')
        .send({ message: {} });

      expect(res.status).toBe(400);
    });

    it('should return 404 for nonexistent agent', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      const res = await request(app)
        .post('/api/personal/a2a/external-agents/nonexistent/send')
        .send({ skill_id: 'test', message: {} });

      expect(res.status).toBe(404);
    });
  });
});
