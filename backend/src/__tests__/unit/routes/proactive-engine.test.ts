/**
 * Proactive Engine Route Tests
 *
 * Tests the REST API for proactive rules and event management.
 */

import express from 'express';
import request from 'supertest';
import { proactiveEngineRouter } from '../../../routes/proactive-engine';
import { errorHandler } from '../../../middleware/errorHandler';

// Mock auth middleware
jest.mock('../../../middleware/auth', () => ({
  apiKeyAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireScope: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

// Mock user-context
jest.mock('../../../utils/user-context', () => ({
  getUserId: () => '00000000-0000-0000-0000-000000000001',
}));

// Mock validate-params
jest.mock('../../../middleware/validate-params', () => ({
  requireUUID: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

// Mock event-system
const mockGetEventHistory = jest.fn();
const mockGetEventStats = jest.fn();
jest.mock('../../../services/event-system', () => ({
  getEventHistory: (...args: unknown[]) => mockGetEventHistory(...args),
  getEventStats: (...args: unknown[]) => mockGetEventStats(...args),
}));

// Mock proactive-decision-engine
const mockCreateProactiveRule = jest.fn();
const mockUpdateProactiveRule = jest.fn();
const mockDeleteProactiveRule = jest.fn();
const mockListProactiveRules = jest.fn();
const mockProcessUnhandledEvents = jest.fn();
jest.mock('../../../services/proactive-decision-engine', () => ({
  createProactiveRule: (...args: unknown[]) => mockCreateProactiveRule(...args),
  updateProactiveRule: (...args: unknown[]) => mockUpdateProactiveRule(...args),
  deleteProactiveRule: (...args: unknown[]) => mockDeleteProactiveRule(...args),
  listProactiveRules: (...args: unknown[]) => mockListProactiveRules(...args),
  processUnhandledEvents: (...args: unknown[]) => mockProcessUnhandledEvents(...args),
}));

describe('Proactive Engine Routes', () => {
  let app: express.Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api', proactiveEngineRouter);
    app.use(errorHandler);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /:context/proactive-engine/events', () => {
    it('should return event history', async () => {
      mockGetEventHistory.mockResolvedValue({ events: [{ id: '1', type: 'task.created' }], total: 1 });
      const res = await request(app).get('/api/personal/proactive-engine/events');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.total).toBe(1);
    });

    it('should reject invalid context', async () => {
      const res = await request(app).get('/api/invalid/proactive-engine/events');
      expect(res.status).toBe(400);
    });
  });

  describe('GET /:context/proactive-engine/stats', () => {
    it('should return event stats', async () => {
      mockGetEventStats.mockResolvedValue({ total: 100, byType: {} });
      const res = await request(app).get('/api/personal/proactive-engine/stats');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('total', 100);
    });
  });

  describe('GET /:context/proactive-engine/rules', () => {
    it('should return list of rules', async () => {
      const rules = [{ id: '1', name: 'Rule 1' }];
      mockListProactiveRules.mockResolvedValue(rules);
      const res = await request(app).get('/api/work/proactive-engine/rules');
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual(rules);
    });
  });

  describe('POST /:context/proactive-engine/rules', () => {
    const validRule = {
      name: 'Test Rule',
      eventTypes: ['task.created'],
      decision: 'notify',
    };

    it('should create a proactive rule', async () => {
      mockCreateProactiveRule.mockResolvedValue({ id: 'new-id', ...validRule });
      const res = await request(app).post('/api/personal/proactive-engine/rules').send(validRule);
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Test Rule');
    });

    it('should reject missing name', async () => {
      const res = await request(app).post('/api/personal/proactive-engine/rules').send({ eventTypes: ['x'], decision: 'notify' });
      expect(res.status).toBe(400);
    });

    it('should reject missing eventTypes', async () => {
      const res = await request(app).post('/api/personal/proactive-engine/rules').send({ name: 'Test', decision: 'notify' });
      expect(res.status).toBe(400);
    });

    it('should reject invalid decision', async () => {
      const res = await request(app).post('/api/personal/proactive-engine/rules').send({ name: 'Test', eventTypes: ['x'], decision: 'invalid' });
      expect(res.status).toBe(400);
    });
  });

  describe('PUT /:context/proactive-engine/rules/:id', () => {
    it('should update a proactive rule', async () => {
      mockUpdateProactiveRule.mockResolvedValue({ id: 'abc', name: 'Updated' });
      const res = await request(app).put('/api/personal/proactive-engine/rules/abc').send({ name: 'Updated' });
      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('Updated');
    });

    it('should return 404 for non-existent rule', async () => {
      mockUpdateProactiveRule.mockResolvedValue(null);
      const res = await request(app).put('/api/personal/proactive-engine/rules/abc').send({ name: 'X' });
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /:context/proactive-engine/rules/:id', () => {
    it('should delete a proactive rule', async () => {
      mockDeleteProactiveRule.mockResolvedValue(true);
      const res = await request(app).delete('/api/personal/proactive-engine/rules/abc');
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Proactive rule deleted');
    });

    it('should return 404 for non-existent rule', async () => {
      mockDeleteProactiveRule.mockResolvedValue(false);
      const res = await request(app).delete('/api/personal/proactive-engine/rules/abc');
      expect(res.status).toBe(404);
    });
  });

  describe('POST /:context/proactive-engine/process', () => {
    it('should trigger manual processing', async () => {
      mockProcessUnhandledEvents.mockResolvedValue([{ id: '1', decision: 'notify' }]);
      const res = await request(app).post('/api/personal/proactive-engine/process');
      expect(res.status).toBe(200);
      expect(res.body.data.processed).toBe(1);
    });
  });
});
