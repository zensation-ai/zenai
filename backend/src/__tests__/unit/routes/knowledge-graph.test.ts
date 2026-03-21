/**
 * Knowledge Graph Route Tests
 */

import express from 'express';
import request from 'supertest';

const VALID_UUID = '11111111-1111-1111-1111-111111111111';

jest.mock('../../../middleware/auth', () => ({
  apiKeyAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireScope: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

jest.mock('../../../middleware/validate-params', () => ({
  requireUUID: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

jest.mock('../../../utils/logger', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('../../../utils/database-context', () => ({
  isValidContext: jest.fn((ctx: string) => ['personal', 'work', 'learning', 'creative'].includes(ctx)),
  AIContext: {},
}));

jest.mock('../../../utils/validation', () => ({
  toIntBounded: jest.fn((val: string, def: number) => val ? parseInt(val, 10) || def : def),
  toFloatBounded: jest.fn((val: string, def: number) => val ? parseFloat(val) || def : def),
}));

const mockAnalyzeRelationships = jest.fn();
const mockGetRelationships = jest.fn();
const mockMultiHopSearch = jest.fn();
const mockGetSuggestedConnections = jest.fn();
const mockGetGraphStats = jest.fn();
const mockGetFullGraph = jest.fn();
const mockGetSubgraph = jest.fn();
const mockDiscoverAllRelationships = jest.fn();
const mockGetGraphAnalytics = jest.fn();

jest.mock('../../../services/knowledge-graph', () => ({
  analyzeRelationships: (...args: unknown[]) => mockAnalyzeRelationships(...args),
  getRelationships: (...args: unknown[]) => mockGetRelationships(...args),
  multiHopSearch: (...args: unknown[]) => mockMultiHopSearch(...args),
  getSuggestedConnections: (...args: unknown[]) => mockGetSuggestedConnections(...args),
  getGraphStats: (...args: unknown[]) => mockGetGraphStats(...args),
  getFullGraph: (...args: unknown[]) => mockGetFullGraph(...args),
  getSubgraph: (...args: unknown[]) => mockGetSubgraph(...args),
  discoverAllRelationships: (...args: unknown[]) => mockDiscoverAllRelationships(...args),
  getGraphAnalytics: (...args: unknown[]) => mockGetGraphAnalytics(...args),
}));

const mockGetTopics = jest.fn();
const mockGetTopicWithIdeas = jest.fn();
const mockGenerateTopics = jest.fn();
const mockMergeTopics = jest.fn();
const mockAssignIdeaToTopic = jest.fn();

jest.mock('../../../services/topic-clustering', () => ({
  generateTopics: (...args: unknown[]) => mockGenerateTopics(...args),
  getTopics: (...args: unknown[]) => mockGetTopics(...args),
  getTopicWithIdeas: (...args: unknown[]) => mockGetTopicWithIdeas(...args),
  mergeTopics: (...args: unknown[]) => mockMergeTopics(...args),
  assignIdeaToTopic: (...args: unknown[]) => mockAssignIdeaToTopic(...args),
}));

import { knowledgeGraphRouter } from '../../../routes/knowledge-graph';
import { errorHandler } from '../../../middleware/errorHandler';

describe('Knowledge Graph Routes', () => {
  let app: express.Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/knowledge-graph', knowledgeGraphRouter);
    app.use(errorHandler);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/knowledge-graph/analyze/:ideaId', () => {
    it('should analyze relationships for an idea', async () => {
      mockAnalyzeRelationships.mockResolvedValue([{ type: 'related', targetId: 'x' }]);

      const res = await request(app)
        .post(`/api/knowledge-graph/analyze/${VALID_UUID}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.relationships).toHaveLength(1);
      expect(res.body.count).toBe(1);
    });
  });

  describe('GET /api/knowledge-graph/relations/:ideaId', () => {
    it('should return relationships for an idea', async () => {
      mockGetRelationships.mockResolvedValue([{ id: 'r1' }, { id: 'r2' }]);

      const res = await request(app)
        .get(`/api/knowledge-graph/relations/${VALID_UUID}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.count).toBe(2);
    });
  });

  describe('GET /api/knowledge-graph/multi-hop/:ideaId', () => {
    it('should return multi-hop paths', async () => {
      mockMultiHopSearch.mockResolvedValue([{ path: ['a', 'b', 'c'] }]);

      const res = await request(app)
        .get(`/api/knowledge-graph/multi-hop/${VALID_UUID}?maxHops=3`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.pathCount).toBe(1);
    });
  });

  describe('GET /api/knowledge-graph/stats', () => {
    it('should return graph statistics', async () => {
      mockGetGraphStats.mockResolvedValue({ nodes: 50, edges: 120 });

      const res = await request(app)
        .get('/api/knowledge-graph/stats');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.stats.nodes).toBe(50);
    });
  });

  describe('GET /api/knowledge-graph/full', () => {
    it('should return full graph data', async () => {
      mockGetFullGraph.mockResolvedValue({ nodes: [], edges: [] });

      const res = await request(app)
        .get('/api/knowledge-graph/full?context=personal');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should reject invalid context', async () => {
      const res = await request(app)
        .get('/api/knowledge-graph/full?context=invalid');

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/knowledge-graph/discover', () => {
    it('should discover relationships', async () => {
      mockDiscoverAllRelationships.mockResolvedValue({ discovered: 15, processed: 10 });

      const res = await request(app)
        .post('/api/knowledge-graph/discover')
        .send({ context: 'personal' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.discovered).toBe(15);
    });
  });

  describe('GET /api/knowledge-graph/topics', () => {
    it('should list topics', async () => {
      mockGetTopics.mockResolvedValue([{ id: 't1', name: 'Tech' }]);

      const res = await request(app)
        .get('/api/knowledge-graph/topics?context=personal');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.count).toBe(1);
    });
  });

  describe('POST /api/knowledge-graph/topics/merge', () => {
    it('should merge topics', async () => {
      mockMergeTopics.mockResolvedValue({ id: 'merged', name: 'Combined' });

      const res = await request(app)
        .post('/api/knowledge-graph/topics/merge')
        .send({ context: 'personal', topicIds: ['t1', 't2'], newName: 'Combined' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should reject merge with fewer than 2 topics', async () => {
      const res = await request(app)
        .post('/api/knowledge-graph/topics/merge')
        .send({ context: 'personal', topicIds: ['t1'], newName: 'X' });

      expect(res.status).toBe(400);
    });

    it('should reject merge without newName', async () => {
      const res = await request(app)
        .post('/api/knowledge-graph/topics/merge')
        .send({ context: 'personal', topicIds: ['t1', 't2'] });

      expect(res.status).toBe(400);
    });
  });
});
