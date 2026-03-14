/**
 * Phase 59: Memory Procedures Routes Tests
 */

import express from 'express';
import request from 'supertest';

// ===========================================
// Mocks - must be before imports
// ===========================================

jest.mock('../../../utils/database-context', () => ({
  queryContext: jest.fn(),
  isValidContext: (ctx: string) =>
    ['personal', 'work', 'learning', 'creative'].includes(ctx),
}));

jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('../../../services/ai', () => ({
  generateEmbedding: jest.fn().mockResolvedValue(new Array(1536).fill(0.1)),
}));

jest.mock('../../../services/knowledge-graph/graph-builder', () => ({
  GraphBuilder: jest.fn().mockImplementation(() => ({
    extractFromText: jest.fn().mockResolvedValue({
      entities: [],
      relations: [],
      entityCount: 0,
      relationCount: 0,
    }),
  })),
}));

jest.mock('../../../middleware/auth', () => ({
  apiKeyAuth: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
  requireScope: () => (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}));

import { memoryProceduresRouter } from '../../../routes/memory-procedures';
import { errorHandler } from '../../../middleware/errorHandler';
import { queryContext } from '../../../utils/database-context';

const mockQueryContext = queryContext as jest.MockedFunction<typeof queryContext>;

// ===========================================
// App Setup
// ===========================================

let app: express.Application;

beforeAll(() => {
  app = express();
  app.use(express.json());
  app.use('/api', memoryProceduresRouter);
  app.use(errorHandler);
});

// ===========================================
// Mock Data
// ===========================================

const mockProcedure = {
  id: 'proc-001',
  trigger_description: 'Send email to user',
  steps: ['Parse recipient', 'Draft email', 'Send'],
  tools_used: ['email_send'],
  outcome: 'success',
  duration_ms: 2000,
  usage_count: 3,
  success_rate: 0.9,
  feedback_score: 4.0,
  metadata: {},
  created_at: new Date(),
  updated_at: new Date(),
};

// ===========================================
// Tests
// ===========================================

describe('Memory Procedures Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // -------------------------------------------
  // GET /api/:context/memory/procedures
  // -------------------------------------------
  describe('GET /api/:context/memory/procedures', () => {
    it('should list procedures', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [mockProcedure], rowCount: 1 } as any);

      const res = await request(app).get('/api/personal/memory/procedures');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
    });

    it('should filter by outcome', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      const res = await request(app).get('/api/personal/memory/procedures?outcome=success');

      expect(res.status).toBe(200);
      expect(mockQueryContext).toHaveBeenCalledWith(
        'personal',
        expect.stringContaining('WHERE outcome'),
        expect.any(Array)
      );
    });

    it('should reject invalid context', async () => {
      const res = await request(app).get('/api/invalid/memory/procedures');

      expect(res.status).toBe(400);
    });
  });

  // -------------------------------------------
  // GET /api/:context/memory/procedures/:id
  // -------------------------------------------
  describe('GET /api/:context/memory/procedures/:id', () => {
    it('should return a single procedure', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [mockProcedure], rowCount: 1 } as any);

      const res = await request(app).get('/api/personal/memory/procedures/proc-001');

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe('proc-001');
    });

    it('should return 404 when not found', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      const res = await request(app).get('/api/personal/memory/procedures/non-existent');

      expect(res.status).toBe(404);
    });
  });

  // -------------------------------------------
  // POST /api/:context/memory/procedures
  // -------------------------------------------
  describe('POST /api/:context/memory/procedures', () => {
    it('should create a procedure', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [mockProcedure], rowCount: 1 } as any);

      const res = await request(app)
        .post('/api/personal/memory/procedures')
        .send({
          triggerDescription: 'Send email to user',
          steps: ['Parse', 'Draft', 'Send'],
          toolsUsed: ['email_send'],
          outcome: 'success',
          durationMs: 2000,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
    });

    it('should reject missing triggerDescription', async () => {
      const res = await request(app)
        .post('/api/personal/memory/procedures')
        .send({
          steps: ['step1'],
          outcome: 'success',
        });

      expect(res.status).toBe(400);
    });

    it('should reject missing steps', async () => {
      const res = await request(app)
        .post('/api/personal/memory/procedures')
        .send({
          triggerDescription: 'test',
          outcome: 'success',
        });

      expect(res.status).toBe(400);
    });

    it('should reject empty steps array', async () => {
      const res = await request(app)
        .post('/api/personal/memory/procedures')
        .send({
          triggerDescription: 'test',
          steps: [],
          outcome: 'success',
        });

      expect(res.status).toBe(400);
    });

    it('should reject invalid outcome', async () => {
      const res = await request(app)
        .post('/api/personal/memory/procedures')
        .send({
          triggerDescription: 'test',
          steps: ['step1'],
          outcome: 'invalid',
        });

      expect(res.status).toBe(400);
    });

    it('should reject invalid context', async () => {
      const res = await request(app)
        .post('/api/bad/memory/procedures')
        .send({
          triggerDescription: 'test',
          steps: ['step1'],
          outcome: 'success',
        });

      expect(res.status).toBe(400);
    });
  });

  // -------------------------------------------
  // POST /api/:context/memory/procedures/recall
  // -------------------------------------------
  describe('POST /api/:context/memory/procedures/recall', () => {
    it('should recall similar procedures', async () => {
      mockQueryContext
        .mockResolvedValueOnce({ rows: [mockProcedure], rowCount: 1 } as any)
        .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any); // usage update

      const res = await request(app)
        .post('/api/personal/memory/procedures/recall')
        .send({ situation: 'I need to send an email' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should reject missing situation', async () => {
      const res = await request(app)
        .post('/api/personal/memory/procedures/recall')
        .send({});

      expect(res.status).toBe(400);
    });
  });

  // -------------------------------------------
  // PUT /api/:context/memory/procedures/:id/feedback
  // -------------------------------------------
  describe('PUT /api/:context/memory/procedures/:id/feedback', () => {
    it('should update feedback', async () => {
      mockQueryContext
        .mockResolvedValueOnce({ rows: [{ usage_count: 5, success_rate: 0.8 }], rowCount: 1 } as any)
        .mockResolvedValueOnce({ rows: [mockProcedure], rowCount: 1 } as any);

      const res = await request(app)
        .put('/api/personal/memory/procedures/proc-001/feedback')
        .send({ success: true, score: 4.5 });

      expect(res.status).toBe(200);
    });

    it('should reject missing success field', async () => {
      const res = await request(app)
        .put('/api/personal/memory/procedures/proc-001/feedback')
        .send({ score: 4.5 });

      expect(res.status).toBe(400);
    });

    it('should return 404 when procedure not found', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      const res = await request(app)
        .put('/api/personal/memory/procedures/non-existent/feedback')
        .send({ success: true });

      expect(res.status).toBe(404);
    });
  });

  // -------------------------------------------
  // DELETE /api/:context/memory/procedures/:id
  // -------------------------------------------
  describe('DELETE /api/:context/memory/procedures/:id', () => {
    it('should delete a procedure', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 1 } as any);

      const res = await request(app).delete('/api/personal/memory/procedures/proc-001');

      expect(res.status).toBe(200);
    });

    it('should return 404 when not found', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      const res = await request(app).delete('/api/personal/memory/procedures/non-existent');

      expect(res.status).toBe(404);
    });
  });

  // -------------------------------------------
  // GET /api/:context/memory/bm25
  // -------------------------------------------
  describe('GET /api/:context/memory/bm25', () => {
    it('should perform BM25 search', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [{ id: 'f1', content: 'test', fact_type: 'knowledge', confidence: 0.9, created_at: new Date(), rank: 0.5 }],
        rowCount: 1,
      } as any);

      const res = await request(app).get('/api/personal/memory/bm25?q=test');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should reject missing query', async () => {
      const res = await request(app).get('/api/personal/memory/bm25');

      expect(res.status).toBe(400);
    });

    it('should reject empty query', async () => {
      const res = await request(app).get('/api/personal/memory/bm25?q=');

      expect(res.status).toBe(400);
    });
  });

  // -------------------------------------------
  // GET /api/:context/memory/hybrid-search
  // -------------------------------------------
  describe('GET /api/:context/memory/hybrid-search', () => {
    it('should perform hybrid search', async () => {
      // BM25 results
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);
      // Semantic results
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      const res = await request(app).get('/api/personal/memory/hybrid-search?q=test');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should reject missing query', async () => {
      const res = await request(app).get('/api/personal/memory/hybrid-search');

      expect(res.status).toBe(400);
    });
  });

  // -------------------------------------------
  // GET /api/:context/memory/entity-links/:factId
  // -------------------------------------------
  describe('GET /api/:context/memory/entity-links/:factId', () => {
    it('should return entity links for fact', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [
          { entity_id: 'ent-001', entity_name: 'TypeScript', entity_type: 'technology', link_type: 'mentions', confidence: 0.9 },
        ],
        rowCount: 1,
      } as any);

      const res = await request(app).get('/api/personal/memory/entity-links/fact-001');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
    });

    it('should return empty array when no links', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      const res = await request(app).get('/api/personal/memory/entity-links/fact-no-links');

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });

    it('should reject invalid context', async () => {
      const res = await request(app).get('/api/bad/memory/entity-links/fact-001');

      expect(res.status).toBe(400);
    });
  });
});
