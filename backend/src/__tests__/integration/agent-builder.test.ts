import express from 'express';
import request from 'supertest';
import { errorHandler } from '../../middleware/errorHandler';

// Mock auth
jest.mock('../../middleware/auth', () => ({
  apiKeyAuth: (_req: any, _res: any, next: any) => { _req.userId = 'test-user'; next(); },
  requireScope: () => (_req: any, _res: any, next: any) => next(),
}));

// Mock NL builder
const mockGenerate = jest.fn();
const mockRefine = jest.fn();
const mockValidate = jest.fn();

jest.mock('../../services/agents/nl-agent-builder', () => ({
  nlAgentBuilder: {
    generateBlueprint: (...args: unknown[]) => mockGenerate(...args),
    refineBlueprint: (...args: unknown[]) => mockRefine(...args),
    validateBlueprint: (...args: unknown[]) => mockValidate(...args),
  },
}));

// Mock blueprint registry
const mockCreate = jest.fn();

jest.mock('../../services/agents/blueprint-registry', () => ({
  blueprintRegistry: {
    createBlueprint: (...args: unknown[]) => mockCreate(...args),
  },
}));

let app: express.Express;

beforeAll(async () => {
  const { agentBuilderRouter } = await import('../../routes/agent-builder');
  app = express();
  app.use(express.json());
  app.use('/api/agents', agentBuilderRouter);
  app.use(errorHandler);
});

beforeEach(() => jest.clearAllMocks());

describe('Agent Builder Routes', () => {
  describe('POST /api/agents/builder/generate', () => {
    it('generates blueprint from description', async () => {
      const generated = {
        blueprint: { name: 'Test Agent', tools: ['recall'], instructions: 'Do stuff' },
        confidence: 0.85,
        reasoning: 'Good match',
        warnings: [],
      };
      mockGenerate.mockResolvedValueOnce(generated);
      const res = await request(app)
        .post('/api/agents/builder/generate')
        .send({ description: 'An agent that helps with research' });
      expect(res.status).toBe(200);
      expect(res.body.data.confidence).toBe(0.85);
      expect(mockGenerate).toHaveBeenCalledWith('An agent that helps with research', undefined);
    });

    it('passes context parameter', async () => {
      mockGenerate.mockResolvedValueOnce({ blueprint: {}, confidence: 0.5, reasoning: '', warnings: [] });
      await request(app)
        .post('/api/agents/builder/generate')
        .send({ description: 'Helper', context: 'finance' });
      expect(mockGenerate).toHaveBeenCalledWith('Helper', 'finance');
    });

    it('rejects without description', async () => {
      const res = await request(app)
        .post('/api/agents/builder/generate')
        .send({});
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/agents/builder/refine', () => {
    it('refines blueprint with feedback', async () => {
      const refined = { name: 'Better Agent', tools: ['recall', 'web_search'] };
      mockRefine.mockResolvedValueOnce(refined);
      const res = await request(app)
        .post('/api/agents/builder/refine')
        .send({ blueprint: { name: 'Agent' }, feedback: 'Add web search' });
      expect(res.status).toBe(200);
      expect(res.body.data.tools).toContain('web_search');
    });

    it('rejects without blueprint', async () => {
      const res = await request(app)
        .post('/api/agents/builder/refine')
        .send({ feedback: 'Add stuff' });
      expect(res.status).toBe(400);
    });

    it('rejects without feedback', async () => {
      const res = await request(app)
        .post('/api/agents/builder/refine')
        .send({ blueprint: { name: 'Agent' } });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/agents/builder/validate', () => {
    it('validates a blueprint', async () => {
      mockValidate.mockReturnValueOnce({ valid: true, errors: [], warnings: [] });
      const res = await request(app)
        .post('/api/agents/builder/validate')
        .send({ blueprint: { name: 'Agent', type: 'autonomous', tools: ['recall'], instructions: 'Do' } });
      expect(res.status).toBe(200);
      expect(res.body.data.valid).toBe(true);
    });

    it('returns validation errors', async () => {
      mockValidate.mockReturnValueOnce({ valid: false, errors: ['Missing name'], warnings: [] });
      const res = await request(app)
        .post('/api/agents/builder/validate')
        .send({ blueprint: {} });
      expect(res.status).toBe(200);
      expect(res.body.data.valid).toBe(false);
      expect(res.body.data.errors).toHaveLength(1);
    });

    it('rejects without blueprint', async () => {
      const res = await request(app)
        .post('/api/agents/builder/validate')
        .send({});
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/agents/builder/save', () => {
    it('validates and saves blueprint', async () => {
      mockValidate.mockReturnValueOnce({ valid: true, errors: [], warnings: [] });
      const bp = { id: 'test', name: 'Test', type: 'autonomous', tools: ['recall'], instructions: 'Do stuff' };
      mockCreate.mockResolvedValueOnce({ ...bp, source: 'nl_generated' });
      const res = await request(app)
        .post('/api/agents/builder/save')
        .send({ blueprint: bp });
      expect(res.status).toBe(201);
      expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ source: 'nl_generated' }));
    });

    it('rejects invalid blueprint', async () => {
      mockValidate.mockReturnValueOnce({ valid: false, errors: ['Unknown tools: bad_tool'], warnings: [] });
      const res = await request(app)
        .post('/api/agents/builder/save')
        .send({ blueprint: { id: 'x', name: 'X', tools: ['bad_tool'], instructions: 'Do' } });
      expect(res.status).toBe(400);
      expect(res.body.details).toContain('Unknown tools: bad_tool');
    });

    it('rejects missing required fields', async () => {
      const res = await request(app)
        .post('/api/agents/builder/save')
        .send({ blueprint: { name: 'No id' } });
      expect(res.status).toBe(400);
    });
  });
});
