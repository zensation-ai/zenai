/**
 * Graph Reasoning Routes Tests - Phase 48
 *
 * Tests knowledge graph inference, community detection,
 * centrality analysis, learning paths, and relation CRUD.
 */

import express from 'express';
import request from 'supertest';
import { errorHandler } from '../../../middleware/errorHandler';

// Mock auth
jest.mock('../../../middleware/auth', () => ({
  apiKeyAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireScope: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

// Mock validate-params
jest.mock('../../../middleware/validate-params', () => ({
  requireUUID: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

// Mock database-context
const mockQueryContext = jest.fn().mockResolvedValue({ rows: [] });
jest.mock('../../../utils/database-context', () => ({
  isValidContext: jest.fn().mockReturnValue(true),
  queryContext: (...args: unknown[]) => mockQueryContext(...args),
}));

// Mock validation
jest.mock('../../../utils/validation', () => ({
  validateContextParam: jest.fn((ctx: string) => ctx),
}));

// Mock graph-reasoning service
const mockInfer = jest.fn().mockResolvedValue([
  { sourceId: 'a', targetId: 'c', relationType: 'related', strength: 0.6, path: ['a', 'b', 'c'] },
]);
const mockContradictions = jest.fn().mockResolvedValue([]);
const mockCommunities = jest.fn().mockResolvedValue([
  { id: 'comm-1', name: 'Cluster 1', memberIds: ['a', 'b', 'c'], memberCount: 3, coherenceScore: 0.8 },
]);
const mockCentrality = jest.fn().mockResolvedValue({
  nodes: [{ ideaId: 'a', degree: 5, betweenness: 0.3, isHub: true, isBridge: false }],
});
const mockLearningPath = jest.fn().mockResolvedValue({
  steps: [{ ideaId: 'a', title: 'Start', order: 1 }],
  totalSteps: 1,
});
const mockCreateRelation = jest.fn().mockResolvedValue('rel-123');
const mockUpdateRelation = jest.fn().mockResolvedValue(undefined);
const mockDeleteRelation = jest.fn().mockResolvedValue(undefined);

jest.mock('../../../services/knowledge-graph/graph-reasoning', () => ({
  inferTransitiveRelations: (...args: unknown[]) => mockInfer(...args),
  detectContradictions: (...args: unknown[]) => mockContradictions(...args),
  detectCommunities: (...args: unknown[]) => mockCommunities(...args),
  calculateCentrality: (...args: unknown[]) => mockCentrality(...args),
  generateLearningPath: (...args: unknown[]) => mockLearningPath(...args),
  createManualRelation: (...args: unknown[]) => mockCreateRelation(...args),
  updateRelationStrength: (...args: unknown[]) => mockUpdateRelation(...args),
  deleteRelation: (...args: unknown[]) => mockDeleteRelation(...args),
}));

describe('Graph Reasoning Routes', () => {
  let app: express.Express;

  beforeAll(async () => {
    const { graphReasoningRouter } = await import('../../../routes/graph-reasoning');
    app = express();
    app.use(express.json());
    app.use('/api', graphReasoningRouter);
    app.use(errorHandler);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryContext.mockResolvedValue({ rows: [] });
  });

  // ===========================================
  // Transitive Inference
  // ===========================================
  describe('POST /api/:context/knowledge-graph/infer', () => {
    it('should run transitive inference', async () => {
      const res = await request(app)
        .post('/api/personal/knowledge-graph/infer')
        .send({ minStrength: 0.6, maxResults: 10 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(mockInfer).toHaveBeenCalledWith('personal', { minStrength: 0.6, maxResults: 10 });
    });

    it('should use defaults when no params provided', async () => {
      const res = await request(app)
        .post('/api/personal/knowledge-graph/infer')
        .send({});

      expect(res.status).toBe(200);
      expect(mockInfer).toHaveBeenCalledWith('personal', { minStrength: 0.5, maxResults: 20 });
    });

    it('should reject invalid context', async () => {
      const { isValidContext } = require('../../../utils/database-context');
      isValidContext.mockReturnValueOnce(false);

      const res = await request(app)
        .post('/api/invalid/knowledge-graph/infer')
        .send({});
      expect(res.status).toBe(400);
    });
  });

  // ===========================================
  // Contradictions
  // ===========================================
  describe('GET /api/:context/knowledge-graph/contradictions', () => {
    it('should detect contradictions', async () => {
      const res = await request(app).get('/api/personal/knowledge-graph/contradictions');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual([]);
    });
  });

  // ===========================================
  // Communities
  // ===========================================
  describe('POST /api/:context/knowledge-graph/communities', () => {
    it('should detect communities', async () => {
      const res = await request(app)
        .post('/api/personal/knowledge-graph/communities')
        .send({ minSize: 3, minStrength: 0.4 });

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].name).toBe('Cluster 1');
    });
  });

  describe('GET /api/:context/knowledge-graph/communities', () => {
    it('should return cached communities', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [{
          id: 'c1', name: 'Cached', description: 'test',
          member_ids: ['a'], member_count: '1', coherence_score: '0.9', created_at: '2026-03-01',
        }],
      });

      const res = await request(app).get('/api/personal/knowledge-graph/communities');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].name).toBe('Cached');
    });
  });

  // ===========================================
  // Centrality
  // ===========================================
  describe('GET /api/:context/knowledge-graph/centrality', () => {
    it('should return centrality metrics', async () => {
      const res = await request(app).get('/api/personal/knowledge-graph/centrality');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockCentrality).toHaveBeenCalledWith('personal', { limit: 20 });
    });

    it('should accept limit parameter', async () => {
      const res = await request(app).get('/api/personal/knowledge-graph/centrality?limit=5');
      expect(res.status).toBe(200);
      expect(mockCentrality).toHaveBeenCalledWith('personal', { limit: 5 });
    });
  });

  // ===========================================
  // Learning Path
  // ===========================================
  describe('GET /api/:context/knowledge-graph/learning-path/:ideaId', () => {
    it('should generate a learning path', async () => {
      const res = await request(app).get('/api/personal/knowledge-graph/learning-path/a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11');
      expect(res.status).toBe(200);
      expect(res.body.data.totalSteps).toBe(1);
      expect(mockLearningPath).toHaveBeenCalledWith('personal', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', { maxSteps: 8 });
    });

    it('should accept maxSteps parameter', async () => {
      const res = await request(app).get('/api/personal/knowledge-graph/learning-path/a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11?maxSteps=4');
      expect(res.status).toBe(200);
      expect(mockLearningPath).toHaveBeenCalledWith('personal', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', { maxSteps: 4 });
    });
  });

  // ===========================================
  // Manual Relation CRUD
  // ===========================================
  describe('POST /api/:context/knowledge-graph/relations', () => {
    it('should create a relation', async () => {
      const res = await request(app)
        .post('/api/personal/knowledge-graph/relations')
        .send({ sourceId: 'a', targetId: 'b', relationType: 'supports' });

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe('rel-123');
    });

    it('should return 400 without required fields', async () => {
      const res = await request(app)
        .post('/api/personal/knowledge-graph/relations')
        .send({ sourceId: 'a' });
      expect(res.status).toBe(400);
    });

    it('should return 400 without relationType', async () => {
      const res = await request(app)
        .post('/api/personal/knowledge-graph/relations')
        .send({ sourceId: 'a', targetId: 'b' });
      expect(res.status).toBe(400);
    });
  });

  describe('PUT /api/:context/knowledge-graph/relations', () => {
    it('should update relation strength', async () => {
      const res = await request(app)
        .put('/api/personal/knowledge-graph/relations')
        .send({ sourceId: 'a', targetId: 'b', strength: 0.8 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 400 without strength', async () => {
      const res = await request(app)
        .put('/api/personal/knowledge-graph/relations')
        .send({ sourceId: 'a', targetId: 'b' });
      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /api/:context/knowledge-graph/relations', () => {
    it('should delete a relation', async () => {
      const res = await request(app)
        .delete('/api/personal/knowledge-graph/relations')
        .send({ sourceId: 'a', targetId: 'b' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 400 without sourceId or targetId', async () => {
      const res = await request(app)
        .delete('/api/personal/knowledge-graph/relations')
        .send({ sourceId: 'a' });
      expect(res.status).toBe(400);
    });
  });
});
