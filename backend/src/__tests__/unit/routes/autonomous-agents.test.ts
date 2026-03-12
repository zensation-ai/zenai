/**
 * Autonomous Agents Route Tests
 *
 * Tests the REST API for managing persistent background agents.
 */

import express from 'express';
import request from 'supertest';
import { autonomousAgentsRouter } from '../../../routes/autonomous-agents';
import { errorHandler } from '../../../middleware/errorHandler';

// Mock auth middleware
jest.mock('../../../middleware/auth', () => ({
  apiKeyAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireScope: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

// Mock validate-params middleware
jest.mock('../../../middleware/validate-params', () => ({
  requireUUID: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

// Mock database-context
jest.mock('../../../utils/database-context', () => ({
  isValidContext: jest.fn().mockReturnValue(true),
  queryContext: jest.fn(),
}));

// Mock agent runtime - inline to avoid hoisting issues
const mockListAgents = jest.fn();
const mockListRunning = jest.fn();
const mockGetAgent = jest.fn();
const mockCreateAgent = jest.fn();
const mockUpdateAgent = jest.fn();
const mockDeleteAgent = jest.fn();
const mockStartAgent = jest.fn();
const mockStopAgent = jest.fn();
const mockGetExecutionLogs = jest.fn();
const mockGetAgentStats = jest.fn();
const mockApproveExecution = jest.fn();
const mockRejectExecution = jest.fn();

jest.mock('../../../services/agents/agent-runtime', () => ({
  agentRuntime: {
    listAgents: (...args: unknown[]) => mockListAgents(...args),
    listRunning: (...args: unknown[]) => mockListRunning(...args),
    getAgent: (...args: unknown[]) => mockGetAgent(...args),
    createAgent: (...args: unknown[]) => mockCreateAgent(...args),
    updateAgent: (...args: unknown[]) => mockUpdateAgent(...args),
    deleteAgent: (...args: unknown[]) => mockDeleteAgent(...args),
    startAgent: (...args: unknown[]) => mockStartAgent(...args),
    stopAgent: (...args: unknown[]) => mockStopAgent(...args),
    getExecutionLogs: (...args: unknown[]) => mockGetExecutionLogs(...args),
    getAgentStats: (...args: unknown[]) => mockGetAgentStats(...args),
    approveExecution: (...args: unknown[]) => mockApproveExecution(...args),
    rejectExecution: (...args: unknown[]) => mockRejectExecution(...args),
  },
  TriggerType: {},
}));

// Mock agent templates
jest.mock('../../../services/agents/agent-templates', () => ({
  AGENT_TEMPLATES: [
    {
      id: 'email-sorter',
      name: 'E-Mail Sortierer',
      description: 'Sortiert E-Mails automatisch',
      instructions: 'Sort emails',
      triggers: [{ type: 'email_received', config: {} }],
      tools: ['search_ideas'],
      approvalRequired: false,
      maxActionsPerDay: 50,
    },
  ],
}));

// Mock response utils
jest.mock('../../../utils/response', () => ({
  sendData: jest.fn((res: express.Response, data: unknown, status = 200) => res.status(status).json({ success: true, data })),
  sendList: jest.fn((res: express.Response, data: unknown[], total: number) => res.json({ success: true, data, total })),
  sendMessage: jest.fn((res: express.Response, msg: string) => res.json({ success: true, message: msg })),
  sendNotFound: jest.fn((res: express.Response, entity: string) => res.status(404).json({ success: false, error: `${entity} not found` })),
  parsePagination: jest.fn(() => ({ limit: 20, offset: 0 })),
}));

// Mock logger
jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

describe('Autonomous Agents Routes', () => {
  let app: express.Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api', autonomousAgentsRouter);
    app.use(errorHandler);
  });

  beforeEach(() => {
    jest.clearAllMocks();

    // Default happy-path return values
    mockListAgents.mockResolvedValue([{ id: 'a1', name: 'Test Agent', status: 'idle' }]);
    mockListRunning.mockReturnValue([]);
    mockGetAgent.mockResolvedValue({ id: 'a1', name: 'Test Agent', status: 'idle' });
    mockCreateAgent.mockResolvedValue({ id: 'new-1', name: 'New Agent' });
    mockUpdateAgent.mockResolvedValue({ id: 'a1', name: 'Updated Agent' });
    mockDeleteAgent.mockResolvedValue(true);
    mockStartAgent.mockResolvedValue(true);
    mockStopAgent.mockResolvedValue(true);
    mockGetExecutionLogs.mockResolvedValue([]);
    mockGetAgentStats.mockResolvedValue({ totalExecutions: 0 });
    mockApproveExecution.mockResolvedValue({ id: 'exec-1', status: 'approved' });
    mockRejectExecution.mockResolvedValue(true);
  });

  // ===========================================
  // List Agents
  // ===========================================
  describe('GET /api/:context/agents', () => {
    it('should list agents for a context', async () => {
      const res = await request(app).get('/api/personal/agents');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
    });

    it('should reject invalid context', async () => {
      const { isValidContext } = require('../../../utils/database-context');
      isValidContext.mockReturnValueOnce(false);

      const res = await request(app).get('/api/invalid/agents');
      expect(res.status).toBe(400);
    });
  });

  // ===========================================
  // List Running Agents
  // ===========================================
  describe('GET /api/:context/agents/running', () => {
    it('should list running agents', async () => {
      const res = await request(app).get('/api/personal/agents/running');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // ===========================================
  // Agent Templates
  // ===========================================
  describe('GET /api/:context/agents/templates', () => {
    it('should return available templates', async () => {
      const res = await request(app).get('/api/personal/agents/templates');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].id).toBe('email-sorter');
    });
  });

  // ===========================================
  // Create Agent from Template
  // ===========================================
  describe('POST /api/:context/agents/from-template', () => {
    it('should create agent from valid template', async () => {
      const res = await request(app)
        .post('/api/personal/agents/from-template')
        .send({ templateId: 'email-sorter' });
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(mockCreateAgent).toHaveBeenCalled();
    });

    it('should return 400 for unknown template', async () => {
      const res = await request(app)
        .post('/api/personal/agents/from-template')
        .send({ templateId: 'non-existent' });
      expect(res.status).toBe(400);
    });
  });

  // ===========================================
  // Get Agent Details
  // ===========================================
  describe('GET /api/:context/agents/:id', () => {
    it('should return agent details', async () => {
      const res = await request(app).get('/api/personal/agents/a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Test Agent');
    });

    it('should return 404 for non-existent agent', async () => {
      mockGetAgent.mockResolvedValueOnce(null);
      const res = await request(app).get('/api/personal/agents/00000000-0000-4000-8000-000000000000');
      expect(res.status).toBe(404);
    });
  });

  // ===========================================
  // Create Agent
  // ===========================================
  describe('POST /api/:context/agents', () => {
    it('should create a new agent', async () => {
      const res = await request(app)
        .post('/api/personal/agents')
        .send({ name: 'My Agent', instructions: 'Monitor things' });
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
    });

    it('should return 400 when name is missing', async () => {
      const res = await request(app)
        .post('/api/personal/agents')
        .send({ instructions: 'Monitor things' });
      expect(res.status).toBe(400);
    });

    it('should return 400 when instructions are missing', async () => {
      const res = await request(app)
        .post('/api/personal/agents')
        .send({ name: 'My Agent' });
      expect(res.status).toBe(400);
    });

    it('should validate trigger types', async () => {
      const res = await request(app)
        .post('/api/personal/agents')
        .send({
          name: 'Agent',
          instructions: 'Do stuff',
          triggers: [{ type: 'invalid_type', config: {} }],
        });
      expect(res.status).toBe(400);
    });

    it('should accept valid trigger types', async () => {
      const res = await request(app)
        .post('/api/personal/agents')
        .send({
          name: 'Agent',
          instructions: 'Do stuff',
          triggers: [{ type: 'schedule', config: { cron: '0 * * * *' } }],
        });
      expect(res.status).toBe(201);
    });
  });

  // ===========================================
  // Update Agent
  // ===========================================
  describe('PUT /api/:context/agents/:id', () => {
    it('should update an agent', async () => {
      const res = await request(app)
        .put('/api/personal/agents/a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11')
        .send({ name: 'Updated Agent' });
      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('Updated Agent');
    });

    it('should return 404 for non-existent agent', async () => {
      mockUpdateAgent.mockResolvedValueOnce(null);
      const res = await request(app)
        .put('/api/personal/agents/00000000-0000-4000-8000-000000000000')
        .send({ name: 'X' });
      expect(res.status).toBe(404);
    });
  });

  // ===========================================
  // Delete Agent
  // ===========================================
  describe('DELETE /api/:context/agents/:id', () => {
    it('should delete an agent', async () => {
      const res = await request(app).delete('/api/personal/agents/a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 404 for non-existent agent', async () => {
      mockDeleteAgent.mockResolvedValueOnce(false);
      const res = await request(app).delete('/api/personal/agents/00000000-0000-4000-8000-000000000000');
      expect(res.status).toBe(404);
    });
  });

  // ===========================================
  // Start/Stop Agent
  // ===========================================
  describe('POST /api/:context/agents/:id/start', () => {
    it('should start an agent', async () => {
      const res = await request(app).post('/api/personal/agents/a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11/start');
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Agent started');
    });

    it('should return 404 for non-existent agent', async () => {
      mockStartAgent.mockResolvedValueOnce(false);
      const res = await request(app).post('/api/personal/agents/00000000-0000-4000-8000-000000000000/start');
      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/:context/agents/:id/stop', () => {
    it('should stop an agent', async () => {
      const res = await request(app).post('/api/personal/agents/a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11/stop');
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Agent stopped');
    });
  });

  // ===========================================
  // Execution Logs & Stats
  // ===========================================
  describe('GET /api/:context/agents/:id/logs', () => {
    it('should return execution logs', async () => {
      const res = await request(app).get('/api/personal/agents/a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11/logs');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('GET /api/:context/agents/:id/stats', () => {
    it('should return agent statistics', async () => {
      const res = await request(app).get('/api/personal/agents/a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11/stats');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // ===========================================
  // Approve/Reject Execution
  // ===========================================
  describe('POST /api/:context/agents/:id/approve/:execId', () => {
    it('should approve a pending execution', async () => {
      const res = await request(app)
        .post('/api/personal/agents/a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11/approve/b1ffcd00-0d1c-5fa9-cc7e-7ccace491b22');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 404 for non-existent execution', async () => {
      mockApproveExecution.mockResolvedValueOnce(null);
      const res = await request(app)
        .post('/api/personal/agents/a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11/approve/00000000-0000-4000-8000-000000000000');
      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/:context/agents/:id/reject/:execId', () => {
    it('should reject a pending execution', async () => {
      const res = await request(app)
        .post('/api/personal/agents/a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11/reject/b1ffcd00-0d1c-5fa9-cc7e-7ccace491b22');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 404 for non-existent execution', async () => {
      mockRejectExecution.mockResolvedValueOnce(false);
      const res = await request(app)
        .post('/api/personal/agents/a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11/reject/00000000-0000-4000-8000-000000000000');
      expect(res.status).toBe(404);
    });
  });
});
