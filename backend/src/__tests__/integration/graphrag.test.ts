/**
 * Integration Tests for GraphRAG API
 *
 * Tests the knowledge graph RAG routes:
 * - POST /api/:context/graphrag/extract         - Extract entities
 * - GET  /api/:context/graphrag/entities         - List entities
 * - GET  /api/:context/graphrag/entities/:id     - Get entity with relations
 * - DELETE /api/:context/graphrag/entities/:id   - Delete entity
 * - POST /api/:context/graphrag/retrieve         - Hybrid retrieval
 * - GET  /api/:context/graphrag/communities      - Community summaries
 * - POST /api/:context/graphrag/communities/refresh - Refresh communities
 * - POST /api/:context/graphrag/index            - Batch indexing
 *
 * Phase 122 - Worker 2
 */

import express, { Express } from 'express';
import request from 'supertest';

const VALID_UUID = '11111111-1111-1111-1111-111111111111';

// Mock dependencies BEFORE imports
jest.mock('../../middleware/auth', () => ({
  apiKeyAuth: jest.fn((_req: unknown, _res: unknown, next: () => void) => next()),
  requireScope: jest.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}));

jest.mock('../../utils/user-context', () => ({
  getUserId: jest.fn(() => '00000000-0000-0000-0000-000000000001'),
  SYSTEM_USER_ID: '00000000-0000-0000-0000-000000000001',
}));

jest.mock('../../utils/logger', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const mockQueryContext = jest.fn();

jest.mock('../../utils/database-context', () => ({
  queryContext: (...args: unknown[]) => mockQueryContext(...args),
  isValidContext: jest.fn((ctx: string) => ['personal', 'work', 'learning', 'creative'].includes(ctx)),
  AIContext: {},
}));

jest.mock('../../utils/validation', () => ({
  validateContextParam: jest.fn((ctx: string) => ctx),
}));

jest.mock('../../utils/sql-helpers', () => ({
  escapeLike: jest.fn((s: string) => s),
}));

const mockExtractFromText = jest.fn();
jest.mock('../../services/knowledge-graph/graph-builder', () => ({
  graphBuilder: {
    extractFromText: (...args: unknown[]) => mockExtractFromText(...args),
  },
}));

const mockRetrieve = jest.fn();
jest.mock('../../services/knowledge-graph/hybrid-retriever', () => ({
  hybridRetriever: {
    retrieve: (...args: unknown[]) => mockRetrieve(...args),
  },
}));

const mockGetCommunitySummaries = jest.fn();
const mockRefreshStaleCommunitySummaries = jest.fn();
jest.mock('../../services/knowledge-graph/community-summarizer', () => ({
  communitySummarizer: {
    getCommunitySummaries: (...args: unknown[]) => mockGetCommunitySummaries(...args),
    refreshStaleCommunitySummaries: (...args: unknown[]) => mockRefreshStaleCommunitySummaries(...args),
  },
}));

const mockIndexBatch = jest.fn();
jest.mock('../../services/knowledge-graph/graph-indexer', () => ({
  graphIndexer: {
    indexBatch: (...args: unknown[]) => mockIndexBatch(...args),
  },
}));

import { graphragRouter } from '../../routes/graphrag';
import { errorHandler } from '../../middleware/errorHandler';

describe('GraphRAG API Integration Tests', () => {
  let app: Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api', graphragRouter);
    app.use(errorHandler);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ============================================================
  // POST /:context/graphrag/extract
  // ============================================================

  describe('POST /:context/graphrag/extract', () => {
    it('should extract entities from text', async () => {
      const result = { entities: [{ name: 'TypeScript', type: 'technology' }], relations: [] };
      mockExtractFromText.mockResolvedValueOnce(result);

      const res = await request(app)
        .post('/api/personal/graphrag/extract')
        .send({ text: 'TypeScript is a programming language' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(result);
      expect(mockExtractFromText).toHaveBeenCalledWith(
        'TypeScript is a programming language',
        '00000000-0000-0000-0000-000000000000',
        'personal'
      );
    });

    it('should accept optional sourceId', async () => {
      mockExtractFromText.mockResolvedValueOnce({ entities: [], relations: [] });

      await request(app)
        .post('/api/personal/graphrag/extract')
        .send({ text: 'Hello', sourceId: VALID_UUID })
        .expect(200);

      expect(mockExtractFromText).toHaveBeenCalledWith('Hello', VALID_UUID, 'personal');
    });

    it('should return 400 for missing text', async () => {
      const res = await request(app)
        .post('/api/personal/graphrag/extract')
        .send({})
        .expect(400);

      expect(res.body.success).toBe(false);
    });

    it('should return 400 for empty text', async () => {
      const res = await request(app)
        .post('/api/personal/graphrag/extract')
        .send({ text: '   ' })
        .expect(400);

      expect(res.body.success).toBe(false);
    });
  });

  // ============================================================
  // GET /:context/graphrag/entities
  // ============================================================

  describe('GET /:context/graphrag/entities', () => {
    it('should list entities', async () => {
      const entities = [
        { id: VALID_UUID, name: 'React', type: 'technology', importance: 0.9, mention_count: 5 },
      ];
      mockQueryContext.mockResolvedValueOnce({ rows: entities });

      const res = await request(app)
        .get('/api/personal/graphrag/entities')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(entities);
    });

    it('should filter by type', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] });

      await request(app)
        .get('/api/personal/graphrag/entities?type=person')
        .expect(200);

      const sql = mockQueryContext.mock.calls[0][1] as string;
      expect(sql).toContain('type = ');
    });

    it('should filter by search term', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] });

      await request(app)
        .get('/api/personal/graphrag/entities?search=react')
        .expect(200);

      const sql = mockQueryContext.mock.calls[0][1] as string;
      expect(sql).toContain('LIKE');
    });
  });

  // ============================================================
  // GET /:context/graphrag/entities/:id
  // ============================================================

  describe('GET /:context/graphrag/entities/:id', () => {
    it('should return entity with relations', async () => {
      const entity = { id: VALID_UUID, name: 'React', type: 'technology' };
      const relations = [{ id: '22222222-2222-2222-2222-222222222222', relation_type: 'uses' }];
      mockQueryContext
        .mockResolvedValueOnce({ rows: [entity] })
        .mockResolvedValueOnce({ rows: relations });

      const res = await request(app)
        .get(`/api/personal/graphrag/entities/${VALID_UUID}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('React');
      expect(res.body.data.relations).toEqual(relations);
    });

    it('should return 404 for non-existent entity', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .get(`/api/personal/graphrag/entities/${VALID_UUID}`)
        .expect(404);

      expect(res.body.success).toBe(false);
    });
  });

  // ============================================================
  // DELETE /:context/graphrag/entities/:id
  // ============================================================

  describe('DELETE /:context/graphrag/entities/:id', () => {
    it('should delete an entity', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [{ id: VALID_UUID }] });

      const res = await request(app)
        .delete(`/api/personal/graphrag/entities/${VALID_UUID}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Entity deleted');
    });

    it('should return 404 for non-existent entity', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .delete(`/api/personal/graphrag/entities/${VALID_UUID}`)
        .expect(404);

      expect(res.body.success).toBe(false);
    });
  });

  // ============================================================
  // POST /:context/graphrag/retrieve
  // ============================================================

  describe('POST /:context/graphrag/retrieve', () => {
    it('should perform hybrid retrieval', async () => {
      const results = { items: [{ text: 'found', score: 0.95 }], strategy: 'hybrid' };
      mockRetrieve.mockResolvedValueOnce(results);

      const res = await request(app)
        .post('/api/personal/graphrag/retrieve')
        .send({ query: 'What is React?' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(results);
    });

    it('should return 400 for missing query', async () => {
      const res = await request(app)
        .post('/api/personal/graphrag/retrieve')
        .send({})
        .expect(400);

      expect(res.body.success).toBe(false);
    });

    it('should return 400 for empty query', async () => {
      const res = await request(app)
        .post('/api/personal/graphrag/retrieve')
        .send({ query: '   ' })
        .expect(400);

      expect(res.body.success).toBe(false);
    });
  });

  // ============================================================
  // GET /:context/graphrag/communities
  // ============================================================

  describe('GET /:context/graphrag/communities', () => {
    it('should return community summaries', async () => {
      const summaries = [{ community_id: 1, summary: 'Tech community', member_count: 5 }];
      mockGetCommunitySummaries.mockResolvedValueOnce(summaries);

      const res = await request(app)
        .get('/api/personal/graphrag/communities')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(summaries);
    });
  });

  // ============================================================
  // POST /:context/graphrag/communities/refresh
  // ============================================================

  describe('POST /:context/graphrag/communities/refresh', () => {
    it('should refresh stale communities', async () => {
      mockRefreshStaleCommunitySummaries.mockResolvedValueOnce(3);

      const res = await request(app)
        .post('/api/personal/graphrag/communities/refresh')
        .send({ maxAgeHours: 12 })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.refreshedCount).toBe(3);
    });
  });

  // ============================================================
  // POST /:context/graphrag/index
  // ============================================================

  describe('POST /:context/graphrag/index', () => {
    it('should trigger batch indexing', async () => {
      const result = { indexed: 10, errors: 0 };
      mockIndexBatch.mockResolvedValueOnce(result);

      const res = await request(app)
        .post('/api/personal/graphrag/index')
        .send({ limit: 20 })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(result);
    });

    it('should reject invalid context', async () => {
      const { isValidContext } = require('../../utils/database-context');
      (isValidContext as jest.Mock).mockReturnValueOnce(false);

      const res = await request(app)
        .post('/api/invalid/graphrag/index')
        .send({})
        .expect(400);

      expect(res.body.success).toBe(false);
    });
  });
});
