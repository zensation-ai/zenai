/**
 * Context Rules Route Tests
 *
 * Tests the REST API for context engineering rules CRUD.
 */

import express from 'express';
import request from 'supertest';
import { contextRulesRouter } from '../../../routes/context-rules';
import { errorHandler } from '../../../middleware/errorHandler';

jest.mock('../../../middleware/auth', () => ({
  apiKeyAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireScope: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

jest.mock('../../../utils/user-context', () => ({
  getUserId: () => '00000000-0000-0000-0000-000000000001',
}));

jest.mock('../../../middleware/validate-params', () => ({
  requireUUID: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const mockListContextRules = jest.fn();
const mockCreateContextRule = jest.fn();
const mockUpdateContextRule = jest.fn();
const mockDeleteContextRule = jest.fn();
const mockGetRulePerformance = jest.fn();
const mockBuildContext = jest.fn();
const mockClassifyDomain = jest.fn();

jest.mock('../../../services/context-engine', () => ({
  listContextRules: (...args: unknown[]) => mockListContextRules(...args),
  createContextRule: (...args: unknown[]) => mockCreateContextRule(...args),
  updateContextRule: (...args: unknown[]) => mockUpdateContextRule(...args),
  deleteContextRule: (...args: unknown[]) => mockDeleteContextRule(...args),
  getRulePerformance: (...args: unknown[]) => mockGetRulePerformance(...args),
  buildContext: (...args: unknown[]) => mockBuildContext(...args),
  classifyDomain: (...args: unknown[]) => mockClassifyDomain(...args),
}));

describe('Context Rules Routes', () => {
  let app: express.Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api', contextRulesRouter);
    app.use(errorHandler);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /:context/context-rules', () => {
    it('should return list of context rules', async () => {
      const rules = [{ id: '1', name: 'Finance Rule', domain: 'finance' }];
      mockListContextRules.mockResolvedValue(rules);
      const res = await request(app).get('/api/personal/context-rules');
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual(rules);
    });

    it('should filter by domain', async () => {
      mockListContextRules.mockResolvedValue([]);
      const res = await request(app).get('/api/personal/context-rules?domain=finance');
      expect(res.status).toBe(200);
      expect(mockListContextRules).toHaveBeenCalledWith('personal', 'finance');
    });

    it('should reject invalid domain filter', async () => {
      const res = await request(app).get('/api/personal/context-rules?domain=invalid');
      expect(res.status).toBe(400);
    });
  });

  describe('GET /:context/context-rules/performance', () => {
    it('should return rule performance metrics', async () => {
      const perf = [{ ruleId: '1', avgLatency: 50, totalCalls: 100 }];
      mockGetRulePerformance.mockResolvedValue(perf);
      const res = await request(app).get('/api/personal/context-rules/performance');
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual(perf);
    });
  });

  describe('POST /:context/context-rules/test', () => {
    it('should test a query against rules', async () => {
      mockClassifyDomain.mockReturnValue('finance');
      mockBuildContext.mockResolvedValue({ tokens: 1500, sources: 3 });
      const res = await request(app).post('/api/personal/context-rules/test').send({ query: 'revenue report' });
      expect(res.status).toBe(200);
      expect(res.body.data.classifiedDomain).toBe('finance');
    });

    it('should reject missing query', async () => {
      const res = await request(app).post('/api/personal/context-rules/test').send({});
      expect(res.status).toBe(400);
    });
  });

  describe('POST /:context/context-rules', () => {
    const validRule = {
      name: 'Email Context',
      domain: 'email',
      dataSources: [{ type: 'db_query', config: {} }],
    };

    it('should create a context rule', async () => {
      mockCreateContextRule.mockResolvedValue({ id: 'new', ...validRule });
      const res = await request(app).post('/api/personal/context-rules').send(validRule);
      expect(res.status).toBe(201);
      expect(res.body.data.name).toBe('Email Context');
    });

    it('should reject missing name', async () => {
      const res = await request(app).post('/api/personal/context-rules').send({ domain: 'email', dataSources: [{}] });
      expect(res.status).toBe(400);
    });

    it('should reject invalid domain', async () => {
      const res = await request(app).post('/api/personal/context-rules').send({ name: 'X', domain: 'invalid', dataSources: [{}] });
      expect(res.status).toBe(400);
    });

    it('should reject empty dataSources', async () => {
      const res = await request(app).post('/api/personal/context-rules').send({ name: 'X', domain: 'email', dataSources: [] });
      expect(res.status).toBe(400);
    });
  });

  describe('PUT /:context/context-rules/:id', () => {
    it('should update a context rule', async () => {
      mockUpdateContextRule.mockResolvedValue({ id: 'abc', name: 'Updated' });
      const res = await request(app).put('/api/personal/context-rules/abc').send({ name: 'Updated' });
      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('Updated');
    });

    it('should return 404 for non-existent rule', async () => {
      mockUpdateContextRule.mockResolvedValue(null);
      const res = await request(app).put('/api/personal/context-rules/abc').send({ name: 'X' });
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /:context/context-rules/:id', () => {
    it('should delete a context rule', async () => {
      mockDeleteContextRule.mockResolvedValue(true);
      const res = await request(app).delete('/api/personal/context-rules/abc');
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Context rule deleted');
    });

    it('should return 404 for non-existent rule', async () => {
      mockDeleteContextRule.mockResolvedValue(false);
      const res = await request(app).delete('/api/personal/context-rules/abc');
      expect(res.status).toBe(404);
    });
  });
});
