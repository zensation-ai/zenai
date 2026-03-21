/**
 * Agent Identity + Workflow Route Tests
 */

import express from 'express';
import request from 'supertest';
import { agentIdentityRouter } from '../../../routes/agent-identity';
import { errorHandler } from '../../../middleware/errorHandler';

jest.mock('../../../middleware/auth', () => ({
  apiKeyAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireScope: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

jest.mock('../../../utils/user-context', () => ({
  getUserId: () => '00000000-0000-0000-0000-000000000001',
}));

const mockIdentityService = {
  listIdentities: jest.fn(),
  getIdentity: jest.fn(),
  createIdentity: jest.fn(),
  updateIdentity: jest.fn(),
  deleteIdentity: jest.fn(),
  validateAction: jest.fn(),
};

jest.mock('../../../services/agents/agent-identity', () => ({
  getAgentIdentityService: () => mockIdentityService,
}));

const mockWorkflowStore = {
  listWorkflows: jest.fn(),
  getWorkflow: jest.fn(),
  saveWorkflow: jest.fn(),
  deleteWorkflow: jest.fn(),
  recordRun: jest.fn(),
  listRuns: jest.fn(),
};

jest.mock('../../../services/agents/workflow-store', () => ({
  getWorkflowStore: () => mockWorkflowStore,
}));

jest.mock('../../../services/agents/agent-graph', () => ({
  AgentGraph: jest.fn(),
  createResearchWriteReviewGraph: () => ({ serialize: () => ({ nodes: [], edges: [] }) }),
  createCodeReviewGraph: () => ({ serialize: () => ({ nodes: [], edges: [] }) }),
  createResearchCodeReviewGraph: () => ({ serialize: () => ({ nodes: [], edges: [] }) }),
}));

jest.mock('../../../services/agents/researcher', () => ({ createResearcher: jest.fn() }));
jest.mock('../../../services/agents/writer', () => ({ createWriter: jest.fn() }));
jest.mock('../../../services/agents/reviewer', () => ({ createReviewer: jest.fn() }));
jest.mock('../../../services/agents/coder', () => ({ createCoder: jest.fn() }));
jest.mock('../../../utils/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }));

describe('Agent Identity Routes', () => {
  let app: express.Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api', agentIdentityRouter);
    app.use(errorHandler);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ===== Agent Identities =====

  describe('GET /agent-identities', () => {
    it('should return list of identities', async () => {
      const identities = [{ id: '1', name: 'Research Agent', role: 'researcher' }];
      mockIdentityService.listIdentities.mockResolvedValue(identities);
      const res = await request(app).get('/api/agent-identities');
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual(identities);
    });
  });

  describe('GET /agent-identities/:id', () => {
    it('should return a single identity', async () => {
      mockIdentityService.getIdentity.mockResolvedValue({ id: '1', name: 'Agent' });
      const res = await request(app).get('/api/agent-identities/1');
      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('Agent');
    });

    it('should return 404 for non-existent identity', async () => {
      mockIdentityService.getIdentity.mockResolvedValue(null);
      const res = await request(app).get('/api/agent-identities/nonexistent');
      expect(res.status).toBe(404);
    });
  });

  describe('POST /agent-identities', () => {
    it('should create an agent identity', async () => {
      mockIdentityService.createIdentity.mockResolvedValue({ id: 'new', name: 'Test', role: 'writer' });
      const res = await request(app).post('/api/agent-identities').send({ name: 'Test', role: 'writer' });
      expect(res.status).toBe(201);
      expect(res.body.data.role).toBe('writer');
    });

    it('should reject missing name', async () => {
      const res = await request(app).post('/api/agent-identities').send({ role: 'writer' });
      expect(res.status).toBe(400);
    });

    it('should reject missing role', async () => {
      const res = await request(app).post('/api/agent-identities').send({ name: 'Test' });
      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /agent-identities/:id', () => {
    it('should delete an identity', async () => {
      mockIdentityService.deleteIdentity.mockResolvedValue(true);
      const res = await request(app).delete('/api/agent-identities/1');
      expect(res.status).toBe(200);
    });

    it('should return 404 for non-existent identity', async () => {
      mockIdentityService.deleteIdentity.mockResolvedValue(false);
      const res = await request(app).delete('/api/agent-identities/nonexistent');
      expect(res.status).toBe(404);
    });
  });

  describe('POST /agent-identities/:id/validate', () => {
    it('should validate an action', async () => {
      mockIdentityService.validateAction.mockResolvedValue({ allowed: true });
      const res = await request(app).post('/api/agent-identities/1/validate').send({ action: 'tools.web_search' });
      expect(res.status).toBe(200);
      expect(res.body.data.allowed).toBe(true);
    });

    it('should reject missing action', async () => {
      const res = await request(app).post('/api/agent-identities/1/validate').send({});
      expect(res.status).toBe(400);
    });
  });

  // ===== Workflows =====

  describe('GET /agent-workflows', () => {
    it('should return list of workflows', async () => {
      mockWorkflowStore.listWorkflows.mockResolvedValue([{ id: '1', name: 'Research Pipeline' }]);
      const res = await request(app).get('/api/agent-workflows');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
    });
  });

  describe('GET /agent-workflows/templates', () => {
    it('should return pre-built templates', async () => {
      const res = await request(app).get('/api/agent-workflows/templates');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(3);
      expect(res.body.data[0].name).toBe('research-write-review');
    });
  });

  describe('POST /agent-workflows', () => {
    it('should save a workflow', async () => {
      mockWorkflowStore.saveWorkflow.mockResolvedValue({ id: 'new', name: 'My Workflow' });
      const res = await request(app).post('/api/agent-workflows').send({ name: 'My Workflow', graphDefinition: {} });
      expect(res.status).toBe(201);
    });

    it('should reject missing name', async () => {
      const res = await request(app).post('/api/agent-workflows').send({});
      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /agent-workflows/:id', () => {
    it('should delete a workflow', async () => {
      mockWorkflowStore.deleteWorkflow.mockResolvedValue(true);
      const res = await request(app).delete('/api/agent-workflows/1');
      expect(res.status).toBe(200);
    });

    it('should return 404 for non-existent workflow', async () => {
      mockWorkflowStore.deleteWorkflow.mockResolvedValue(false);
      const res = await request(app).delete('/api/agent-workflows/nonexistent');
      expect(res.status).toBe(404);
    });
  });

  describe('GET /agent-workflow-runs', () => {
    it('should return list of runs', async () => {
      mockWorkflowStore.listRuns.mockResolvedValue([{ id: '1', status: 'completed' }]);
      const res = await request(app).get('/api/agent-workflow-runs');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
    });
  });
});
