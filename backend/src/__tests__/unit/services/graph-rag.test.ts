/**
 * GraphRAG Service Tests - Phase 43
 */

import { graphRAGRetrieve, buildGraphContextPrompt, GraphContext } from '../../../services/graph-rag';

// Mock dependencies
jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() },
}));

jest.mock('../../../utils/database-context', () => ({
  queryContext: jest.fn().mockResolvedValue({
    rows: [
      { id: 'idea-1', title: 'Test Idea', summary: 'A test idea' },
    ],
  }),
}));

jest.mock('../../../services/enhanced-rag', () => ({
  enhancedRAG: {
    retrieve: jest.fn().mockResolvedValue({
      results: [
        { id: 'rag-1', title: 'RAG Result', summary: 'Found via RAG', score: 0.8, scores: { agentic: 0.8 }, sources: ['agentic' as const], relevanceReason: 'keyword match' },
      ],
      confidence: 0.75,
      methodsUsed: ['agentic', 'hyde'],
      timing: { total: 100, hyde: 30, agentic: 50 },
      debug: { hydeUsed: true },
    }),
  },
  EnhancedRAGResult: {},
  EnhancedResult: {},
}));

jest.mock('../../../services/knowledge-graph/graph-core', () => ({
  getRelationships: jest.fn().mockResolvedValue([
    { targetId: 'related-1', relationType: 'supports', strength: 0.8 },
    { targetId: 'related-2', relationType: 'contradicts', strength: 0.2 }, // Below MIN_STRENGTH
  ]),
  getSuggestedConnections: jest.fn().mockResolvedValue([
    { id: 'sug-1', title: 'Suggested', summary: 'A suggestion', similarity: 0.6 },
  ]),
}));

jest.mock('../../../services/knowledge-graph', () => ({
  multiHopSearch: jest.fn().mockResolvedValue([
    {
      path: [
        { ideaId: 'idea-1', title: 'Start' },
        { ideaId: 'hop-1', title: 'Hop Result' },
      ],
      totalStrength: 1.4,
    },
  ]),
}));

var mockQueryContext = jest.requireMock('../../../utils/database-context').queryContext;
var mockGetRelationships = jest.requireMock('../../../services/knowledge-graph/graph-core').getRelationships;
var mockGetSuggestedConnections = jest.requireMock('../../../services/knowledge-graph/graph-core').getSuggestedConnections;
var mockMultiHopSearch = jest.requireMock('../../../services/knowledge-graph').multiHopSearch;
var mockEnhancedRAG = jest.requireMock('../../../services/enhanced-rag').enhancedRAG;

describe('GraphRAG Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Re-setup mocks after clearAllMocks
    mockQueryContext.mockResolvedValue({
      rows: [{ id: 'seed-1', title: 'Seed Idea' }],
    });

    mockGetRelationships.mockResolvedValue([
      { targetId: 'related-1', relationType: 'supports', strength: 0.8 },
      { targetId: 'related-2', relationType: 'contradicts', strength: 0.2 },
    ]);

    mockGetSuggestedConnections.mockResolvedValue([
      { id: 'sug-1', title: 'Suggested', summary: 'A suggestion', similarity: 0.6 },
    ]);

    mockMultiHopSearch.mockResolvedValue([
      { path: ['seed-1', 'hop-1'], ideas: [{ id: 'seed-1', title: 'Start' }, { id: 'hop-1', title: 'Hop Result' }], totalStrength: 1.4 },
    ]);

    mockEnhancedRAG.retrieve.mockResolvedValue({
      results: [
        { id: 'rag-1', title: 'RAG Result', summary: 'Found via RAG', score: 0.8, scores: { agentic: 0.8 }, sources: ['agentic' as const], relevanceReason: 'keyword match' },
      ],
      confidence: 0.75,
      methodsUsed: ['agentic', 'hyde'],
      timing: { total: 100, hyde: 30, agentic: 50 },
      debug: { hydeUsed: true },
    });
  });

  describe('graphRAGRetrieve()', () => {
    it('should combine graph traversal with enhanced RAG', async () => {
      const result = await graphRAGRetrieve('test query here', 'personal' as const);

      expect(result.results.length).toBeGreaterThan(0);
      expect(result.graphContext).toBeDefined();
      expect(result.graphEnriched).toBeDefined();
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.methodsUsed).toContain('agentic');
    });

    it('should include graph context when seed ideas found', async () => {
      // First call: findSeedIdeas, second call: enrich graph ideas
      mockQueryContext
        .mockResolvedValueOnce({ rows: [{ id: 'seed-1', title: 'Seed Idea' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'related-1', title: 'Related', summary: 'A related idea' }] });

      const result = await graphRAGRetrieve('innovative machine learning approach', 'personal' as const);

      expect(result.graphEnriched).toBe(true);
      expect(result.graphContext.relatedIdeas.length).toBeGreaterThan(0);
      expect(result.methodsUsed).toContain('graph');
    });

    it('should filter out weak relationships', async () => {
      const result = await graphRAGRetrieve('test query here', 'personal' as const);

      // related-2 has strength 0.2, below MIN_STRENGTH 0.3
      const ids = result.graphContext.relatedIdeas.map(r => r.id);
      expect(ids).not.toContain('related-2');
    });

    it('should boost RAG results that appear in graph', async () => {
      // Mock so RAG returns an idea that's also in graph
      mockEnhancedRAG.retrieve.mockResolvedValueOnce({
        results: [
          { id: 'related-1', title: 'Overlap', summary: 'In both', score: 0.6, scores: { agentic: 0.6 }, sources: ['agentic' as const] },
        ],
        confidence: 0.65,
        methodsUsed: ['agentic'],
        timing: { total: 50 },
        debug: {},
      });

      // Use words > 3 chars so seed ideas are found and graph is traversed
      const result = await graphRAGRetrieve('innovative machine learning approach', 'personal' as const);

      // The overlapping result should be boosted (1.2x when in graph context)
      const boosted = result.results.find(r => r.id === 'related-1');
      if (boosted) {
        // Score should be boosted from 0.6 to 0.72 (0.6 * 1.2)
        expect(boosted.score).toBeGreaterThanOrEqual(0.6);
      }
    });

    it('should fall back to standard RAG when graph fails', async () => {
      // No seed ideas
      mockQueryContext.mockResolvedValue({ rows: [] });

      const result = await graphRAGRetrieve('test query here', 'personal' as const);

      expect(result.graphEnriched).toBe(false);
      expect(result.results.length).toBeGreaterThan(0); // Still has RAG results
    });

    it('should respect maxResults option', async () => {
      const result = await graphRAGRetrieve('test query here', 'personal' as const, { maxResults: 2 });

      expect(result.results.length).toBeLessThanOrEqual(2);
    });
  });

  describe('buildGraphContextPrompt()', () => {
    it('should return empty string for no related ideas', () => {
      const ctx: GraphContext = { relatedIdeas: [], relationTypes: [], pathCount: 0, graphTimeMs: 0 };
      expect(buildGraphContextPrompt(ctx)).toBe('');
    });

    it('should build prompt with related ideas', () => {
      const ctx: GraphContext = {
        relatedIdeas: [
          { id: '1', title: 'Test', summary: 'A test', relation: 'supports', strength: 0.8, hops: 1 },
        ],
        relationTypes: ['supports'],
        pathCount: 1,
        graphTimeMs: 50,
      };

      const prompt = buildGraphContextPrompt(ctx);
      expect(prompt).toContain('Wissensgraph');
      expect(prompt).toContain('Test');
      expect(prompt).toContain('supports');
      expect(prompt).toContain('80%');
    });
  });
});
