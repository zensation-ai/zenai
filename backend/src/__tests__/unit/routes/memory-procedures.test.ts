/**
 * Memory Procedures Route Tests
 *
 * Tests the REST API for procedural memory, BM25 search, and entity links.
 */

import express from 'express';
import request from 'supertest';
import { memoryProceduresRouter } from '../../../routes/memory-procedures';
import { errorHandler } from '../../../middleware/errorHandler';

jest.mock('../../../middleware/auth', () => ({
  apiKeyAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireScope: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

jest.mock('../../../utils/user-context', () => ({
  getUserId: () => '00000000-0000-0000-0000-000000000001',
}));

const mockListProcedures = jest.fn();
const mockGetProcedure = jest.fn();
const mockRecordProcedure = jest.fn();
const mockRecallProcedure = jest.fn();
const mockOptimizeProcedure = jest.fn();
const mockDeleteProcedure = jest.fn();

jest.mock('../../../services/memory/procedural-memory', () => ({
  proceduralMemory: {
    listProcedures: (...args: unknown[]) => mockListProcedures(...args),
    getProcedure: (...args: unknown[]) => mockGetProcedure(...args),
    recordProcedure: (...args: unknown[]) => mockRecordProcedure(...args),
    recallProcedure: (...args: unknown[]) => mockRecallProcedure(...args),
    optimizeProcedure: (...args: unknown[]) => mockOptimizeProcedure(...args),
    deleteProcedure: (...args: unknown[]) => mockDeleteProcedure(...args),
  },
}));

const mockBM25Search = jest.fn();
const mockHybridSearch = jest.fn();

jest.mock('../../../services/memory/memory-bm25', () => ({
  memoryBM25: {
    search: (...args: unknown[]) => mockBM25Search(...args),
    hybridSearch: (...args: unknown[]) => mockHybridSearch(...args),
  },
}));

const mockGetFactEntities = jest.fn();

jest.mock('../../../services/memory/entity-resolver', () => ({
  entityResolver: {
    getFactEntities: (...args: unknown[]) => mockGetFactEntities(...args),
  },
}));

describe('Memory Procedures Routes', () => {
  let app: express.Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api', memoryProceduresRouter);
    app.use(errorHandler);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /:context/memory/procedures', () => {
    it('should return list of procedures', async () => {
      const procs = [{ id: '1', triggerDescription: 'Send email' }];
      mockListProcedures.mockResolvedValue(procs);
      const res = await request(app).get('/api/personal/memory/procedures');
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual(procs);
    });

    it('should reject invalid context', async () => {
      const res = await request(app).get('/api/invalid/memory/procedures');
      expect(res.status).toBe(400);
    });
  });

  describe('GET /:context/memory/procedures/:id', () => {
    it('should return a single procedure', async () => {
      mockGetProcedure.mockResolvedValue({ id: '1', triggerDescription: 'Deploy' });
      const res = await request(app).get('/api/personal/memory/procedures/1');
      expect(res.status).toBe(200);
      expect(res.body.data.triggerDescription).toBe('Deploy');
    });

    it('should return 404 for non-existent procedure', async () => {
      mockGetProcedure.mockResolvedValue(null);
      const res = await request(app).get('/api/personal/memory/procedures/nonexistent');
      expect(res.status).toBe(404);
    });
  });

  describe('POST /:context/memory/procedures', () => {
    const validProcedure = {
      triggerDescription: 'Send report email',
      steps: ['Draft email', 'Review', 'Send'],
      outcome: 'success',
    };

    it('should record a new procedure', async () => {
      mockRecordProcedure.mockResolvedValue({ id: 'new', ...validProcedure });
      const res = await request(app).post('/api/personal/memory/procedures').send(validProcedure);
      expect(res.status).toBe(201);
      expect(res.body.data.triggerDescription).toBe('Send report email');
    });

    it('should reject missing triggerDescription', async () => {
      const res = await request(app).post('/api/personal/memory/procedures').send({ steps: ['x'], outcome: 'success' });
      expect(res.status).toBe(400);
    });

    it('should reject empty steps', async () => {
      const res = await request(app).post('/api/personal/memory/procedures').send({ triggerDescription: 'x', steps: [], outcome: 'success' });
      expect(res.status).toBe(400);
    });

    it('should reject invalid outcome', async () => {
      const res = await request(app).post('/api/personal/memory/procedures').send({ triggerDescription: 'x', steps: ['y'], outcome: 'unknown' });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /:context/memory/procedures/recall', () => {
    it('should recall similar procedures', async () => {
      mockRecallProcedure.mockResolvedValue([{ id: '1', similarity: 0.9 }]);
      const res = await request(app).post('/api/personal/memory/procedures/recall').send({ situation: 'sending an email' });
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
    });

    it('should reject missing situation', async () => {
      const res = await request(app).post('/api/personal/memory/procedures/recall').send({});
      expect(res.status).toBe(400);
    });
  });

  describe('PUT /:context/memory/procedures/:id/feedback', () => {
    it('should submit feedback', async () => {
      mockOptimizeProcedure.mockResolvedValue({ id: '1', successRate: 0.8 });
      const res = await request(app).put('/api/personal/memory/procedures/1/feedback').send({ success: true, score: 5 });
      expect(res.status).toBe(200);
    });

    it('should reject missing success field', async () => {
      const res = await request(app).put('/api/personal/memory/procedures/1/feedback').send({ score: 5 });
      expect(res.status).toBe(400);
    });

    it('should return 404 for non-existent procedure', async () => {
      mockOptimizeProcedure.mockResolvedValue(null);
      const res = await request(app).put('/api/personal/memory/procedures/1/feedback').send({ success: false });
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /:context/memory/procedures/:id', () => {
    it('should delete a procedure', async () => {
      mockDeleteProcedure.mockResolvedValue(true);
      const res = await request(app).delete('/api/personal/memory/procedures/1');
      expect(res.status).toBe(200);
    });

    it('should return 404 for non-existent procedure', async () => {
      mockDeleteProcedure.mockResolvedValue(false);
      const res = await request(app).delete('/api/personal/memory/procedures/nonexistent');
      expect(res.status).toBe(404);
    });
  });

  describe('GET /:context/memory/bm25', () => {
    it('should perform BM25 search', async () => {
      mockBM25Search.mockResolvedValue([{ id: '1', rank: 1 }]);
      const res = await request(app).get('/api/personal/memory/bm25?q=test+query');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
    });

    it('should reject missing query', async () => {
      const res = await request(app).get('/api/personal/memory/bm25');
      expect(res.status).toBe(400);
    });
  });

  describe('GET /:context/memory/hybrid-search', () => {
    it('should perform hybrid search', async () => {
      mockHybridSearch.mockResolvedValue([{ id: '1', score: 0.85 }]);
      const res = await request(app).get('/api/personal/memory/hybrid-search?q=search+term');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
    });
  });

  describe('GET /:context/memory/entity-links/:factId', () => {
    it('should return entity links for a fact', async () => {
      mockGetFactEntities.mockResolvedValue([{ entityId: 'e1', name: 'React' }]);
      const res = await request(app).get('/api/personal/memory/entity-links/fact-123');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
    });
  });
});
