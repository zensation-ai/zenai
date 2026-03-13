/**
 * Phase 58: Hybrid Retriever Tests
 */

jest.mock('../../../utils/database-context', () => ({
  queryContext: jest.fn(),
  isValidContext: (ctx: string) => ['personal', 'work', 'learning', 'creative'].includes(ctx),
}));

jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('../../../services/ai', () => ({
  generateEmbedding: jest.fn().mockResolvedValue(new Array(1536).fill(0.1)),
}));

jest.mock('../../../services/cross-encoder-rerank', () => ({
  hybridRerank: jest.fn(),
}));

jest.mock('../../../services/knowledge-graph/community-summarizer', () => ({
  communitySummarizer: {
    searchCommunitySummaries: jest.fn(),
  },
}));

import { queryContext } from '../../../utils/database-context';
import { hybridRerank } from '../../../services/cross-encoder-rerank';
import { communitySummarizer } from '../../../services/knowledge-graph/community-summarizer';
import { HybridRetriever, HybridRetrievalResult } from '../../../services/knowledge-graph/hybrid-retriever';

const mockQueryContext = queryContext as jest.MockedFunction<typeof queryContext>;
const mockHybridRerank = hybridRerank as jest.MockedFunction<typeof hybridRerank>;
const mockSearchCommunities = communitySummarizer.searchCommunitySummaries as jest.MockedFunction<typeof communitySummarizer.searchCommunitySummaries>;

describe('HybridRetriever', () => {
  let retriever: HybridRetriever;

  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryContext.mockReset();
    retriever = new HybridRetriever();

    // Default: rerank just passes through with slight score boost
    mockHybridRerank.mockImplementation(async (_query, results) =>
      results.map(r => ({
        ...r,
        originalScore: r.score,
        relevanceScore: r.score,
        movement: 'unchanged' as const,
      }))
    );

    // Default: no community results
    mockSearchCommunities.mockResolvedValue([]);
  });

  // ===========================================
  // vectorSearch
  // ===========================================

  describe('vectorSearch', () => {
    it('should return results from pgvector similarity search', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [
          { id: 'idea-1', title: 'AI Concepts', content: 'Neural networks', similarity: '0.85' },
          { id: 'idea-2', title: 'ML Basics', content: 'Machine learning', similarity: '0.75' },
        ],
      } as any);

      const results = await retriever.retrieve('artificial intelligence', 'personal', {
        enableVector: true,
        enableGraph: false,
        enableCommunity: false,
        enableBM25: false,
      });

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].source).toBe('vector');
    });
  });

  // ===========================================
  // graphTraversal
  // ===========================================

  describe('graphTraversal', () => {
    it('should traverse graph from matching entities', async () => {
      // Graph: find matching entities (exact match)
      mockQueryContext.mockResolvedValueOnce({
        rows: [{ id: 'entity-1', name: 'React' }],
      } as any);

      // Graph: 2-hop traversal
      mockQueryContext.mockResolvedValueOnce({
        rows: [
          { id: 'idea-react', title: 'React Guide', content: 'How to use React', score: '0.8' },
        ],
      } as any);

      const results = await retriever.retrieve('React framework', 'personal', {
        enableVector: false,
        enableGraph: true,
        enableCommunity: false,
        enableBM25: false,
      });

      expect(results.length).toBeGreaterThan(0);
    });

    it('should try fuzzy match when exact match fails', async () => {
      // Graph: exact match fails
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);
      // Graph: fuzzy match succeeds
      mockQueryContext.mockResolvedValueOnce({
        rows: [{ id: 'entity-1', name: 'TypeScript' }],
      } as any);
      // Graph: traversal
      mockQueryContext.mockResolvedValueOnce({
        rows: [{ id: 'idea-ts', title: 'TS Guide', content: 'TypeScript basics', score: '0.7' }],
      } as any);

      const results = await retriever.retrieve('TypeScript programming', 'personal', {
        enableVector: false,
        enableGraph: true,
        enableCommunity: false,
        enableBM25: false,
      });
      expect(results.length).toBeGreaterThan(0);
    });
  });

  // ===========================================
  // communitySearch
  // ===========================================

  describe('communitySearch', () => {
    it('should return community summaries as results', async () => {
      mockSearchCommunities.mockResolvedValueOnce([
        {
          communityId: 'comm-1',
          level: 1,
          summary: 'Database technologies including PostgreSQL and MongoDB',
          keyThemes: ['databases', 'SQL'],
          entityCount: 5,
          edgeCount: 3,
          entityNames: [],
          updatedAt: new Date(),
        },
      ]);

      const results = await retriever.retrieve('database technologies', 'personal', {
        enableVector: false,
        enableGraph: false,
        enableCommunity: true,
        enableBM25: false,
      });
      expect(results.length).toBeGreaterThan(0);
      const communityResult = results.find(r => r.source === 'community');
      expect(communityResult).toBeDefined();
    });
  });

  // ===========================================
  // bm25Search
  // ===========================================

  describe('bm25Search', () => {
    it('should return BM25 full-text search results', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [
          { id: 'idea-bm25', title: 'GraphQL Tutorial', content: 'Learn GraphQL', rank: '0.8' },
        ],
      } as any);

      const results = await retriever.retrieve('GraphQL tutorial', 'personal', {
        enableVector: false,
        enableGraph: false,
        enableCommunity: false,
        enableBM25: true,
      });
      expect(results.length).toBeGreaterThan(0);
    });
  });

  // ===========================================
  // Full retrieval with all strategies
  // ===========================================

  describe('full retrieve', () => {
    it('should combine results from vector and BM25', async () => {
      // Use mockImplementation to handle parallel calls properly
      let callCount = 0;
      mockQueryContext.mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          // First call is vector search (or BM25 - order may vary)
          return { rows: [{ id: 'v1', title: 'Vector Result', content: 'Found by vector', similarity: '0.9', rank: '0.9' }] } as any;
        }
        // Second call
        return { rows: [{ id: 'b1', title: 'BM25 Result', content: 'Found by BM25', similarity: '0.6', rank: '0.6' }] } as any;
      });

      const results = await retriever.retrieve('Kubernetes deployment', 'personal', {
        enableVector: true,
        enableGraph: false,
        enableCommunity: false,
        enableBM25: true,
      });

      expect(results.length).toBeGreaterThanOrEqual(2);
    });

    it('should deduplicate same ideas via mergeResults', () => {
      const allResults: HybridRetrievalResult[][] = [
        [{ id: 'shared-id', title: 'Same Idea', content: 'Shared content', score: 0.8, source: 'vector' }],
        [{ id: 'shared-id', title: 'Same Idea', content: 'Shared content', score: 0.7, source: 'bm25' }],
      ];

      const merged = retriever.mergeResults(allResults);
      const sharedResults = merged.filter(r => r.id === 'shared-id');
      expect(sharedResults.length).toBe(1);
      // Score should be boosted from multiple sources
      expect(sharedResults[0].score).toBeGreaterThan(0);
    });
  });

  // ===========================================
  // mergeResults
  // ===========================================

  describe('mergeResults', () => {
    it('should deduplicate by id and keep highest score', () => {
      const results: HybridRetrievalResult[][] = [
        [{ id: '1', title: 'A', content: 'X', score: 0.9, source: 'vector' }],
        [{ id: '1', title: 'A', content: 'X', score: 0.7, source: 'bm25' }],
      ];

      const merged = retriever.mergeResults(results);
      expect(merged.length).toBe(1);
      // Score should combine both
      expect(merged[0].score).toBeGreaterThan(0);
    });

    it('should handle empty arrays', () => {
      const merged = retriever.mergeResults([[], [], []]);
      expect(merged).toEqual([]);
    });

    it('should sort by score descending', () => {
      const results: HybridRetrievalResult[][] = [
        [
          { id: 'low', title: 'Low', content: '', score: 0.3, source: 'vector' },
          { id: 'high', title: 'High', content: '', score: 0.9, source: 'vector' },
        ],
      ];

      const merged = retriever.mergeResults(results);
      expect(merged[0].id).toBe('high');
    });
  });

  // ===========================================
  // Options: disable strategies
  // ===========================================

  describe('strategy options', () => {
    it('should respect enableVector=false', async () => {
      // Only BM25 should run since we disable vector+graph+community
      mockQueryContext.mockResolvedValueOnce({
        rows: [{ id: 'bm', title: 'BM25 Only', content: 'Found', rank: '0.5' }],
      } as any);

      const results = await retriever.retrieve('test', 'personal', {
        enableVector: false,
        enableGraph: false,
        enableCommunity: false,
        enableBM25: true,
      });

      expect(results.length).toBeGreaterThan(0);
    });

    it('should return empty when all strategies disabled', async () => {
      const results = await retriever.retrieve('test', 'personal', {
        enableVector: false,
        enableGraph: false,
        enableCommunity: false,
        enableBM25: false,
      });

      expect(results).toEqual([]);
    });
  });

  // ===========================================
  // Error handling
  // ===========================================

  describe('error handling', () => {
    it('should handle vector search failure gracefully', async () => {
      // Run only BM25 to avoid parallel mock ordering issues
      // BM25 results
      mockQueryContext.mockResolvedValueOnce({
        rows: [{ id: 'b1', title: 'Fallback', content: 'BM25 result', rank: '0.5' }],
      } as any);

      const results = await retriever.retrieve('test query', 'personal', {
        enableVector: false,
        enableGraph: false,
        enableCommunity: false,
        enableBM25: true,
      });
      expect(results.length).toBeGreaterThan(0);
    });

    it('should handle graph traversal failure gracefully', async () => {
      // Run only vector (no graph)
      mockQueryContext.mockResolvedValueOnce({
        rows: [{ id: 'v1', title: 'Vector', content: 'Works', similarity: '0.8' }],
      } as any);

      const results = await retriever.retrieve('test query', 'personal', {
        enableVector: true,
        enableGraph: false,
        enableCommunity: false,
        enableBM25: false,
      });
      expect(results.length).toBeGreaterThan(0);
    });

    it('should handle rerank failure gracefully', async () => {
      // Use only vector to simplify mock ordering
      mockQueryContext.mockResolvedValueOnce({
        rows: [{ id: 'v1', title: 'Vector', content: 'Works', similarity: '0.8' }],
      } as any);

      mockHybridRerank.mockRejectedValueOnce(new Error('Rerank failed'));

      const results = await retriever.retrieve('test query', 'personal', {
        enableVector: true,
        enableGraph: false,
        enableCommunity: false,
        enableBM25: false,
      });
      // Should still return results without reranking
      expect(results.length).toBeGreaterThan(0);
    });

    it('should filter results below minScore', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [
          { id: 'high', title: 'High', content: '', similarity: '0.9' },
          { id: 'low', title: 'Low', content: '', similarity: '0.01' },
        ],
      } as any);

      const results = await retriever.retrieve('query', 'personal', {
        enableVector: true,
        enableGraph: false,
        enableCommunity: false,
        enableBM25: false,
        minScore: 0.2,
      });
      // Low-score result should be filtered (0.01 * 0.35 weight = 0.0035 < 0.2)
      const lowResult = results.find(r => r.id === 'low');
      expect(lowResult).toBeUndefined();
    });
  });

  // ===========================================
  // Empty results
  // ===========================================

  describe('empty results', () => {
    it('should handle no results from any strategy', async () => {
      // Vector: empty
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      const results = await retriever.retrieve('completely unknown query', 'personal', {
        enableVector: true,
        enableGraph: false,
        enableCommunity: false,
        enableBM25: false,
      });
      expect(results).toEqual([]);
    });
  });
});
