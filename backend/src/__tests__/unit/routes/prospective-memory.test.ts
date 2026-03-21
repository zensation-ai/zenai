/**
 * Prospective Memory Route Tests
 *
 * Tests the prospective memory CRUD and metamemory introspection endpoints.
 */

import express from 'express';
import request from 'supertest';

jest.mock('../../../middleware/auth', () => ({
  apiKeyAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireScope: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

jest.mock('../../../utils/user-context', () => ({
  getUserId: jest.fn(() => '00000000-0000-0000-0000-000000000001'),
  SYSTEM_USER_ID: '00000000-0000-0000-0000-000000000001',
}));

jest.mock('../../../utils/logger', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('../../../utils/database-context', () => ({
  queryContext: jest.fn(),
  isValidContext: jest.fn((ctx: string) => ['personal', 'work', 'learning', 'creative'].includes(ctx)),
  AIContext: {},
}));

const mockCreateProspectiveMemory = jest.fn();
const mockListPending = jest.fn();
const mockFireMemory = jest.fn();
const mockDismissMemory = jest.fn();

jest.mock('../../../services/memory/prospective-memory', () => ({
  createProspectiveMemory: (...args: unknown[]) => mockCreateProspectiveMemory(...args),
  listPending: (...args: unknown[]) => mockListPending(...args),
  fireMemory: (...args: unknown[]) => mockFireMemory(...args),
  dismissMemory: (...args: unknown[]) => mockDismissMemory(...args),
}));

const mockGetMetamemoryStats = jest.fn();
const mockGetKnowledgeGaps = jest.fn();
const mockFindConflicts = jest.fn();

jest.mock('../../../services/memory/metamemory', () => ({
  getMetamemoryStats: (...args: unknown[]) => mockGetMetamemoryStats(...args),
  getKnowledgeGaps: (...args: unknown[]) => mockGetKnowledgeGaps(...args),
  findConflicts: (...args: unknown[]) => mockFindConflicts(...args),
}));

import { prospectiveMemoryRouter } from '../../../routes/prospective-memory';
import { errorHandler } from '../../../middleware/errorHandler';

describe('Prospective Memory Routes', () => {
  let app: express.Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api', prospectiveMemoryRouter);
    app.use(errorHandler);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/:context/memory/prospective', () => {
    it('should list pending prospective memories', async () => {
      const memories = [{ id: 'm1', triggerType: 'time', memoryContent: 'Call dentist' }];
      mockListPending.mockResolvedValue(memories);

      const res = await request(app).get('/api/personal/memory/prospective');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
    });

    it('should reject invalid context', async () => {
      const res = await request(app).get('/api/invalid/memory/prospective');
      expect(res.status).toBe(400);
    });

    it('should handle service error gracefully', async () => {
      mockListPending.mockRejectedValue(new Error('DB error'));

      const res = await request(app).get('/api/personal/memory/prospective');

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/:context/memory/prospective', () => {
    it('should create a new prospective memory', async () => {
      const memory = { id: 'm2', triggerType: 'time', memoryContent: 'Send report' };
      mockCreateProspectiveMemory.mockResolvedValue(memory);

      const res = await request(app)
        .post('/api/personal/memory/prospective')
        .send({
          triggerType: 'time',
          triggerCondition: { at: '2026-03-22T09:00:00Z' },
          memoryContent: 'Send report',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe('m2');
    });

    it('should reject invalid triggerType', async () => {
      const res = await request(app)
        .post('/api/personal/memory/prospective')
        .send({
          triggerType: 'invalid',
          triggerCondition: {},
          memoryContent: 'Test',
        });

      expect(res.status).toBe(400);
    });

    it('should reject missing triggerCondition', async () => {
      const res = await request(app)
        .post('/api/personal/memory/prospective')
        .send({
          triggerType: 'time',
          memoryContent: 'Test',
        });

      expect(res.status).toBe(400);
    });

    it('should reject missing memoryContent', async () => {
      const res = await request(app)
        .post('/api/personal/memory/prospective')
        .send({
          triggerType: 'event',
          triggerCondition: { event: 'login' },
        });

      expect(res.status).toBe(400);
    });

    it('should reject invalid priority', async () => {
      const res = await request(app)
        .post('/api/personal/memory/prospective')
        .send({
          triggerType: 'time',
          triggerCondition: { at: '2026-03-22T09:00:00Z' },
          memoryContent: 'Test',
          priority: 'urgent',
        });

      expect(res.status).toBe(400);
    });

    it('should accept valid priority values', async () => {
      mockCreateProspectiveMemory.mockResolvedValue({ id: 'm3' });

      for (const priority of ['low', 'medium', 'high']) {
        const res = await request(app)
          .post('/api/personal/memory/prospective')
          .send({
            triggerType: 'time',
            triggerCondition: { at: '2026-03-22T09:00:00Z' },
            memoryContent: 'Test',
            priority,
          });

        expect(res.status).toBe(201);
      }
    });
  });

  describe('POST /api/:context/memory/prospective/:id/fire', () => {
    it('should fire a prospective memory', async () => {
      const memory = { id: 'm1', status: 'fired' };
      mockFireMemory.mockResolvedValue(memory);

      const res = await request(app)
        .post('/api/personal/memory/prospective/m1/fire');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 404 for non-existent memory', async () => {
      mockFireMemory.mockResolvedValue(null);

      const res = await request(app)
        .post('/api/personal/memory/prospective/nonexistent/fire');

      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/:context/memory/prospective/:id/dismiss', () => {
    it('should dismiss a prospective memory', async () => {
      const memory = { id: 'm1', status: 'dismissed' };
      mockDismissMemory.mockResolvedValue(memory);

      const res = await request(app)
        .post('/api/personal/memory/prospective/m1/dismiss');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 404 for non-existent memory', async () => {
      mockDismissMemory.mockResolvedValue(null);

      const res = await request(app)
        .post('/api/personal/memory/prospective/nonexistent/dismiss');

      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/:context/memory/metamemory/stats', () => {
    it('should return metamemory statistics', async () => {
      const stats = { totalFacts: 200, avgConfidence: 0.82 };
      mockGetMetamemoryStats.mockResolvedValue(stats);

      const res = await request(app).get('/api/personal/memory/metamemory/stats');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(stats);
    });
  });

  describe('GET /api/:context/memory/metamemory/gaps', () => {
    it('should return knowledge gaps', async () => {
      const gaps = [{ topic: 'React hooks', confidence: 0.3 }];
      mockGetKnowledgeGaps.mockResolvedValue(gaps);

      const res = await request(app).get('/api/work/memory/metamemory/gaps');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
    });
  });

  describe('GET /api/:context/memory/metamemory/conflicts', () => {
    it('should return conflicting facts', async () => {
      const conflicts = [{ fact1: 'A is true', fact2: 'A is false', similarity: 0.9 }];
      mockFindConflicts.mockResolvedValue(conflicts);

      const res = await request(app).get('/api/personal/memory/metamemory/conflicts');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
    });

    it('should accept custom threshold', async () => {
      mockFindConflicts.mockResolvedValue([]);

      await request(app).get('/api/personal/memory/metamemory/conflicts?threshold=0.6');

      expect(mockFindConflicts).toHaveBeenCalledWith('personal', '00000000-0000-0000-0000-000000000001', 0.6);
    });
  });
});
