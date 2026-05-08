import express from 'express';
import request from 'supertest';
import { errorHandler } from '../../middleware/errorHandler';

// Mock auth
jest.mock('../../middleware/auth', () => ({
  apiKeyAuth: (_req: any, _res: any, next: any) => { _req.userId = 'test-user'; next(); },
  requireScope: () => (_req: any, _res: any, next: any) => next(),
}));

// Mock blueprint registry
const mockList = jest.fn();
const mockGet = jest.fn();
const mockCreate = jest.fn();
const mockUpdate = jest.fn();
const mockDelete = jest.fn();
const mockActivate = jest.fn();
const mockDeactivate = jest.fn();

jest.mock('../../services/agents/blueprint-registry', () => ({
  blueprintRegistry: {
    listBlueprints: (...args: unknown[]) => mockList(...args),
    getBlueprint: (...args: unknown[]) => mockGet(...args),
    createBlueprint: (...args: unknown[]) => mockCreate(...args),
    updateBlueprint: (...args: unknown[]) => mockUpdate(...args),
    deleteBlueprint: (...args: unknown[]) => mockDelete(...args),
    activateBlueprint: (...args: unknown[]) => mockActivate(...args),
    deactivateBlueprint: (...args: unknown[]) => mockDeactivate(...args),
  },
}));

let app: express.Express;

beforeAll(async () => {
  const { agentBlueprintsRouter } = await import('../../routes/agent-blueprints');
  app = express();
  app.use(express.json());
  app.use('/api/agents', agentBlueprintsRouter);
  app.use(errorHandler);
});

beforeEach(() => jest.clearAllMocks());

describe('Blueprint Routes', () => {
  describe('GET /api/agents/blueprints', () => {
    it('returns blueprint list', async () => {
      mockList.mockResolvedValueOnce([{ id: 'email_triage', name: 'Email Triage' }]);
      const res = await request(app).get('/api/agents/blueprints');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
    });

    it('passes filter params', async () => {
      mockList.mockResolvedValueOnce([]);
      await request(app).get('/api/agents/blueprints?category=productivity&source=built_in');
      expect(mockList).toHaveBeenCalledWith(expect.objectContaining({
        category: 'productivity',
        source: 'built_in',
      }));
    });

    it('passes search param', async () => {
      mockList.mockResolvedValueOnce([]);
      await request(app).get('/api/agents/blueprints?search=email');
      expect(mockList).toHaveBeenCalledWith(expect.objectContaining({
        search: 'email',
      }));
    });
  });

  describe('GET /api/agents/blueprints/:id', () => {
    it('returns single blueprint', async () => {
      mockGet.mockResolvedValueOnce({ id: 'email_triage', name: 'Email Triage' });
      const res = await request(app).get('/api/agents/blueprints/email_triage');
      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe('email_triage');
    });

    it('returns 404 for missing', async () => {
      mockGet.mockRejectedValueOnce(new Error('Blueprint not found: nope'));
      const res = await request(app).get('/api/agents/blueprints/nope');
      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/agents/blueprints', () => {
    it('creates blueprint', async () => {
      const body = { id: 'custom', name: 'Custom', type: 'autonomous', tools: ['recall'], instructions: 'Do stuff' };
      mockCreate.mockResolvedValueOnce({ ...body, source: 'user_created' });
      const res = await request(app).post('/api/agents/blueprints').send(body);
      expect(res.status).toBe(201);
      expect(res.body.data.id).toBe('custom');
    });

    it('forces source to user_created', async () => {
      const body = { id: 'custom', name: 'Custom', type: 'autonomous', tools: ['recall'], instructions: 'Do stuff', source: 'built_in' };
      mockCreate.mockResolvedValueOnce({ ...body, source: 'user_created' });
      const res = await request(app).post('/api/agents/blueprints').send(body);
      expect(res.status).toBe(201);
      expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ source: 'user_created' }));
    });

    it('rejects without required fields', async () => {
      const res = await request(app).post('/api/agents/blueprints').send({ name: 'No tools' });
      expect(res.status).toBe(400);
    });
  });

  describe('PUT /api/agents/blueprints/:id', () => {
    it('updates blueprint', async () => {
      mockUpdate.mockResolvedValueOnce({ id: 'custom', name: 'Updated' });
      const res = await request(app).put('/api/agents/blueprints/custom').send({ name: 'Updated' });
      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('Updated');
    });

    it('returns 404 for missing', async () => {
      mockUpdate.mockRejectedValueOnce(new Error('Blueprint not found: nope'));
      const res = await request(app).put('/api/agents/blueprints/nope').send({ name: 'X' });
      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/agents/blueprints/:id/activate', () => {
    it('activates blueprint in context', async () => {
      mockActivate.mockResolvedValueOnce({ id: 'uuid', status: 'active', blueprintId: 'email_triage' });
      const res = await request(app)
        .post('/api/agents/blueprints/email_triage/activate')
        .send({ context: 'finance' });
      expect(res.status).toBe(200);
      expect(mockActivate).toHaveBeenCalledWith('email_triage', 'finance', undefined);
    });

    it('rejects without context', async () => {
      const res = await request(app)
        .post('/api/agents/blueprints/email_triage/activate')
        .send({});
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/agents/blueprints/:id/deactivate', () => {
    it('deactivates blueprint', async () => {
      mockDeactivate.mockResolvedValueOnce(undefined);
      const res = await request(app)
        .post('/api/agents/blueprints/email_triage/deactivate')
        .send({ context: 'finance' });
      expect(res.status).toBe(200);
    });

    it('rejects without context', async () => {
      const res = await request(app)
        .post('/api/agents/blueprints/email_triage/deactivate')
        .send({});
      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /api/agents/blueprints/:id', () => {
    it('deletes user blueprint', async () => {
      mockDelete.mockResolvedValueOnce(undefined);
      const res = await request(app).delete('/api/agents/blueprints/custom');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('returns 400 for built-in', async () => {
      mockDelete.mockRejectedValueOnce(new Error('Cannot delete built-in blueprints'));
      const res = await request(app).delete('/api/agents/blueprints/email_triage');
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/agents/blueprints/export', () => {
    it('exports blueprint as JSON', async () => {
      mockGet.mockResolvedValueOnce({ id: 'email_triage', name: 'Email Triage' });
      const res = await request(app)
        .post('/api/agents/blueprints/export')
        .send({ id: 'email_triage' });
      expect(res.status).toBe(200);
      expect(res.body.version).toBe('1.0');
      expect(res.body.blueprint.id).toBe('email_triage');
    });
  });

  describe('POST /api/agents/blueprints/import', () => {
    it('imports blueprint', async () => {
      const bp = { id: 'imported', name: 'Imported', type: 'autonomous', tools: ['recall'], instructions: 'Do stuff' };
      mockCreate.mockResolvedValueOnce({ ...bp, source: 'user_created' });
      const res = await request(app)
        .post('/api/agents/blueprints/import')
        .send({ blueprint: bp });
      expect(res.status).toBe(201);
      expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ source: 'user_created' }));
    });

    it('rejects invalid format', async () => {
      const res = await request(app)
        .post('/api/agents/blueprints/import')
        .send({ blueprint: { name: 'Missing fields' } });
      expect(res.status).toBe(400);
    });
  });
});
