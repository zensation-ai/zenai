/**
 * RAG v2 Route Tests
 *
 * Tests the REST API for adaptive retrieval and citation tracking.
 */

import express from 'express';
import request from 'supertest';
import { ragV2Router } from '../../../routes/rag-v2';
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

// Mock adaptive-retrieval service
const mockRetrieve = jest.fn();
jest.mock('../../../services/rag/adaptive-retrieval', () => ({
  retrieve: (...args: unknown[]) => mockRetrieve(...args),
}));

// Mock citation-tracker
const mockGetCitations = jest.fn();
jest.mock('../../../services/rag/citation-tracker', () => ({
  getCitations: (...args: unknown[]) => mockGetCitations(...args),
}));

// Mock database-context
const mockQueryContext = jest.fn();
jest.mock('../../../utils/database-context', () => ({
  isValidContext: jest.fn((ctx: string) => ['personal', 'work', 'learning', 'creative'].includes(ctx)),
  queryContext: (...args: unknown[]) => mockQueryContext(...args),
}));

// Mock logger
jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

describe('RAG v2 Routes', () => {
  let app: express.Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api', ragV2Router);
    app.use(errorHandler);
  });

  beforeEach(() => {
    jest.clearAllMocks();

    mockRetrieve.mockResolvedValue({
      strategy: 'hybrid',
      results: [{ id: 'r1', content: 'Some retrieved content', score: 0.95 }],
      confidence: 0.92,
      timing: { total: 150 },
    });

    mockGetCitations.mockResolvedValue([
      { sourceId: 's1', content: 'Citation text', relevance: 0.9 },
    ]);

    mockQueryContext.mockResolvedValue({ rows: [] });
  });

  // ===========================================
  // POST /api/:context/rag/v2/retrieve
  // ===========================================

  describe('POST /api/:context/rag/v2/retrieve', () => {
    it('should perform adaptive retrieval', async () => {
      const res = await request(app)
        .post('/api/personal/rag/v2/retrieve')
        .send({ query: 'What is machine learning?' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.strategy).toBe('hybrid');
      expect(res.body.data.results).toHaveLength(1);
    });

    it('should accept a specific strategy', async () => {
      await request(app)
        .post('/api/personal/rag/v2/retrieve')
        .send({ query: 'test query', strategy: 'dense' });
      expect(mockRetrieve).toHaveBeenCalledWith(
        'test query',
        'personal',
        expect.objectContaining({ forceStrategy: 'dense' })
      );
    });

    it('should treat "auto" as no forced strategy', async () => {
      await request(app)
        .post('/api/personal/rag/v2/retrieve')
        .send({ query: 'test query', strategy: 'auto' });
      expect(mockRetrieve).toHaveBeenCalledWith(
        'test query',
        'personal',
        expect.objectContaining({ forceStrategy: undefined })
      );
    });

    it('should return 400 when query is missing', async () => {
      const res = await request(app)
        .post('/api/personal/rag/v2/retrieve')
        .send({});
      expect(res.status).toBe(400);
    });

    it('should return 400 for invalid strategy', async () => {
      const res = await request(app)
        .post('/api/personal/rag/v2/retrieve')
        .send({ query: 'test', strategy: 'invalid' });
      expect(res.status).toBe(400);
    });

    it('should reject invalid context', async () => {
      const { isValidContext } = require('../../../utils/database-context');
      isValidContext.mockReturnValueOnce(false);

      const res = await request(app)
        .post('/api/invalid/rag/v2/retrieve')
        .send({ query: 'test' });
      expect(res.status).toBe(400);
    });
  });

  // ===========================================
  // GET /api/:context/rag/v2/citations/:messageId
  // ===========================================

  describe('GET /api/:context/rag/v2/citations/:messageId', () => {
    it('should return citations for a message', async () => {
      const res = await request(app)
        .get('/api/personal/rag/v2/citations/a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.citations).toHaveLength(1);
    });
  });

  // ===========================================
  // POST /api/:context/rag/v2/source-feedback
  // ===========================================

  describe('POST /api/:context/rag/v2/source-feedback', () => {
    it('should record source feedback', async () => {
      const res = await request(app)
        .post('/api/personal/rag/v2/source-feedback')
        .send({ sourceId: 's1', helpful: true, queryType: 'dense' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.recorded).toBe(true);
    });

    it('should return 400 when sourceId is missing', async () => {
      const res = await request(app)
        .post('/api/personal/rag/v2/source-feedback')
        .send({ helpful: true });
      expect(res.status).toBe(400);
    });

    it('should return 400 when helpful is not a boolean', async () => {
      const res = await request(app)
        .post('/api/personal/rag/v2/source-feedback')
        .send({ sourceId: 's1', helpful: 'yes' });
      expect(res.status).toBe(400);
    });
  });

  // ===========================================
  // GET /api/:context/rag/v2/strategy-stats
  // ===========================================

  describe('GET /api/:context/rag/v2/strategy-stats', () => {
    it('should return strategy statistics', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [
          { query_type: 'dense', total: '10', helpful_count: '8', unhelpful_count: '2' },
          { query_type: 'hybrid', total: '20', helpful_count: '18', unhelpful_count: '2' },
        ],
      });

      const res = await request(app).get('/api/personal/rag/v2/strategy-stats');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.strategies).toHaveProperty('dense');
      expect(res.body.data.strategies).toHaveProperty('sparse');
      expect(res.body.data.strategies).toHaveProperty('hybrid');
    });

    it('should use default days parameter', async () => {
      await request(app).get('/api/personal/rag/v2/strategy-stats');
      expect(mockQueryContext).toHaveBeenCalledWith(
        'personal',
        expect.any(String),
        expect.arrayContaining(['personal', 30])
      );
    });

    it('should accept custom days parameter', async () => {
      await request(app).get('/api/personal/rag/v2/strategy-stats?days=7');
      expect(mockQueryContext).toHaveBeenCalledWith(
        'personal',
        expect.any(String),
        expect.arrayContaining(['personal', 7])
      );
    });

    it('should return defaults when query fails', async () => {
      mockQueryContext.mockRejectedValueOnce(new Error('Table not found'));
      const res = await request(app).get('/api/personal/rag/v2/strategy-stats');
      expect(res.status).toBe(200);
      expect(res.body.data.strategies.dense.total).toBe(0);
    });
  });
});
