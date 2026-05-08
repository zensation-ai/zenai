/**
 * Hybrid retriever — PPR mode (Phase H2.1 production binding).
 *
 * Verifies that:
 *   - With `enablePPR: false` (default) the legacy graph traversal runs.
 *   - With `enablePPR: true` the PPR path runs:
 *       * the loader is invoked with the seed entity ids,
 *       * personalizedPageRank is called with the loaded subgraph,
 *       * results are tagged with `metadata.traversalType = 'ppr'`.
 *   - With `enablePPR: true` and an empty subgraph (no entities matched),
 *     the result is empty (graceful degradation, not an exception).
 *
 * The tests mock both the DB and the algorithm imports so neither is
 * actually exercised — what we're testing is the wiring.
 */

jest.mock('../../../utils/database-context', () => ({
  queryContext: jest.fn(),
  isValidContext: (ctx: string) => ['operations', 'finance', 'people', 'strategy'].includes(ctx),
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
  communitySummarizer: { searchCommunitySummaries: jest.fn() },
}));

jest.mock('../../../services/knowledge-graph/event-subgraph', () => ({
  getEntityActivityScore: jest.fn().mockResolvedValue({
    totalEvents: 0,
    eventsByType: {},
    recencyScore: 0,
    lastActivity: null,
  }),
  recordEvent: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../../services/knowledge-graph/hebbian-ppr-loader', () => ({
  loadHebbianSubgraphForPPR: jest.fn(),
}));

jest.mock('../../../algorithms/personalized-pagerank', () => ({
  personalizedPageRank: jest.fn(),
  topKByPageRank: jest.fn(),
}));

import { queryContext } from '../../../utils/database-context';
import { hybridRerank } from '../../../services/cross-encoder-rerank';
import { loadHebbianSubgraphForPPR } from '../../../services/knowledge-graph/hebbian-ppr-loader';
import {
  personalizedPageRank,
  topKByPageRank,
} from '../../../algorithms/personalized-pagerank';
import { HybridRetriever } from '../../../services/knowledge-graph/hybrid-retriever';

const mockQuery = queryContext as jest.MockedFunction<typeof queryContext>;
const mockRerank = hybridRerank as jest.MockedFunction<typeof hybridRerank>;
const mockLoadSubgraph = loadHebbianSubgraphForPPR as jest.MockedFunction<
  typeof loadHebbianSubgraphForPPR
>;
const mockPPR = personalizedPageRank as jest.MockedFunction<typeof personalizedPageRank>;
const mockTopK = topKByPageRank as jest.MockedFunction<typeof topKByPageRank>;

describe('HybridRetriever — PPR mode (H2.1)', () => {
  let retriever: HybridRetriever;

  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockReset();
    mockLoadSubgraph.mockReset();
    mockPPR.mockReset();
    mockTopK.mockReset();
    retriever = new HybridRetriever();
    // Pass-through reranker so we can read scores back unchanged.
    mockRerank.mockImplementation(async (_q, results) =>
      results.map((r) => ({
        ...r,
        originalScore: r.score,
        relevanceScore: r.score,
        movement: 'unchanged' as const,
      })),
    );
  });

  it('legacy 2-hop runs when enablePPR is unset (env default off)', async () => {
    // Save and restore the env flag so this test is hermetic.
    const prev = process.env.H2_PPR_IN_KG;
    delete process.env.H2_PPR_IN_KG;
    try {
      // graphTraversal: matching entities → 2-hop ideas.
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'ent-1', name: 'React' }] } as any);
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'idea-1', title: 'React Guide', content: 'Doc', score: '0.7' }],
      } as any);
      // No PPR mocks should be touched.
      const results = await retriever.retrieve('React notes', 'operations', {
        enableVector: false,
        enableGraph: true,
        enableCommunity: false,
        enableBM25: false,
        enableEventAware: false,
      });
      expect(mockLoadSubgraph).not.toHaveBeenCalled();
      expect(mockPPR).not.toHaveBeenCalled();
      expect(results.length).toBeGreaterThan(0);
      // Legacy results should NOT carry the PPR metadata marker.
      for (const r of results) {
        expect((r.metadata as Record<string, unknown> | undefined)?.traversalType).not.toBe('ppr');
      }
    } finally {
      if (prev !== undefined) process.env.H2_PPR_IN_KG = prev;
    }
  });

  it('PPR path runs when enablePPR=true: loader → PPR → topK → idea map', async () => {
    // 1) graphTraversal SQL: exact-match entity lookup.
    mockQuery.mockResolvedValueOnce({
      rows: [
        { id: 'seed-uuid-1', name: 'react' },
        { id: 'seed-uuid-2', name: 'typescript' },
      ],
    } as any);

    // 2) Subgraph loader returns a non-trivial graph.
    mockLoadSubgraph.mockResolvedValueOnce({
      graph: {
        nodes: ['seed-uuid-1', 'seed-uuid-2', 'neighbour-1'],
        edges: [
          ['seed-uuid-1', 'seed-uuid-2', 0.8],
          ['seed-uuid-1', 'neighbour-1', 0.5],
        ],
      },
      validSeeds: ['seed-uuid-1', 'seed-uuid-2'],
      stats: {
        nodes: 3,
        relationEdges: 2,
        coactivationEdges: 0,
        hopsCovered: 2,
        truncated: false,
      },
    });

    // 3) PPR result: scores per node.
    mockPPR.mockReturnValueOnce({
      scores: new Map([
        ['seed-uuid-1', 0.4],
        ['seed-uuid-2', 0.35],
        ['neighbour-1', 0.25],
      ]),
      iterations: 12,
      converged: true,
    });

    // 4) topKByPageRank: excludes seeds, keeps neighbour-1 plus more.
    mockTopK.mockReturnValueOnce([
      { nodeId: 'neighbour-1', score: 0.25 },
    ]);

    // 5) Idea-mapping SQL.
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 'idea-via-neighbour-1',
          title: 'Connected Idea',
          content: 'Idea content',
          best_rank: '1',
          importance: '8',
        },
      ],
    } as any);

    const results = await retriever.retrieve('React TypeScript', 'operations', {
      enableVector: false,
      enableGraph: true,
      enableCommunity: false,
      enableBM25: false,
      enableEventAware: false,
      enablePPR: true,
    });

    // Loader called with the seed UUIDs and the operations context.
    expect(mockLoadSubgraph).toHaveBeenCalledTimes(1);
    expect(mockLoadSubgraph.mock.calls[0][0]).toBe('operations');
    expect(mockLoadSubgraph.mock.calls[0][1]).toEqual(['seed-uuid-1', 'seed-uuid-2']);

    // PPR called with the loaded graph and the validSeeds.
    expect(mockPPR).toHaveBeenCalledTimes(1);
    const pprCall = mockPPR.mock.calls[0];
    expect(pprCall[0].nodes).toEqual(['seed-uuid-1', 'seed-uuid-2', 'neighbour-1']);
    expect(pprCall[1]).toEqual(['seed-uuid-1', 'seed-uuid-2']);

    // topKByPageRank called with excludeSeeds=true.
    expect(mockTopK).toHaveBeenCalledTimes(1);
    expect(mockTopK.mock.calls[0][2]).toEqual({
      excludeSeeds: true,
      seeds: ['seed-uuid-1', 'seed-uuid-2'],
    });

    // Result should be tagged with ppr metadata.
    expect(results.length).toBe(1);
    expect((results[0].metadata as Record<string, unknown>).traversalType).toBe('ppr');
    expect((results[0].metadata as Record<string, unknown>).converged).toBe(true);
    expect((results[0].metadata as Record<string, unknown>).iterations).toBe(12);
    expect((results[0].metadata as Record<string, unknown>).subgraphNodes).toBe(3);
    expect(results[0].source).toBe('graph');
    expect(results[0].score).toBeGreaterThan(0);
  });

  it('PPR path passes a custom alpha through to the algorithm', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'seed-1', name: 'foo' }] } as any);
    mockLoadSubgraph.mockResolvedValueOnce({
      graph: { nodes: ['seed-1'], edges: [] },
      validSeeds: ['seed-1'],
      stats: {
        nodes: 1,
        relationEdges: 0,
        coactivationEdges: 0,
        hopsCovered: 1,
        truncated: false,
      },
    });
    mockPPR.mockReturnValueOnce({
      scores: new Map([['seed-1', 1.0]]),
      iterations: 1,
      converged: true,
    });
    mockTopK.mockReturnValueOnce([]); // No non-seed results — defensive path.
    // (Idea-mapping query is skipped when topEntities is empty.)

    const results = await retriever.retrieve('Foo', 'operations', {
      enableVector: false,
      enableGraph: true,
      enableCommunity: false,
      enableBM25: false,
      enableEventAware: false,
      enablePPR: true,
      pprAlpha: 0.25,
    });

    expect(results).toEqual([]);
    expect(mockPPR).toHaveBeenCalledTimes(1);
    expect(mockPPR.mock.calls[0][2]?.alpha).toBe(0.25);
  });

  it('PPR path returns empty when no query entities can be extracted', async () => {
    // Entity extraction relies on capitalized words / 4+ char fallback.
    // A query like "x y" should yield 0 entities.
    const results = await retriever.retrieve('x y', 'operations', {
      enableVector: false,
      enableGraph: true,
      enableCommunity: false,
      enableBM25: false,
      enableEventAware: false,
      enablePPR: true,
    });
    expect(results).toEqual([]);
    expect(mockLoadSubgraph).not.toHaveBeenCalled();
    expect(mockPPR).not.toHaveBeenCalled();
  });

  it('PPR path tries fuzzy-match when exact entity match misses', async () => {
    // 1) exact match returns nothing.
    mockQuery.mockResolvedValueOnce({ rows: [] } as any);
    // 2) fuzzy match finds one.
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 'seed-fuzzy', name: 'TypeScript' }],
    } as any);
    // 3) Subgraph loader.
    mockLoadSubgraph.mockResolvedValueOnce({
      graph: { nodes: ['seed-fuzzy'], edges: [] },
      validSeeds: ['seed-fuzzy'],
      stats: {
        nodes: 1,
        relationEdges: 0,
        coactivationEdges: 0,
        hopsCovered: 1,
        truncated: false,
      },
    });
    // 4) PPR result.
    mockPPR.mockReturnValueOnce({
      scores: new Map([['seed-fuzzy', 1.0]]),
      iterations: 1,
      converged: true,
    });
    // 5) topK returns empty (only seed in graph).
    mockTopK.mockReturnValueOnce([]);

    const results = await retriever.retrieve('TypeScript stuff', 'operations', {
      enableVector: false,
      enableGraph: true,
      enableCommunity: false,
      enableBM25: false,
      enableEventAware: false,
      enablePPR: true,
    });

    expect(results).toEqual([]);
    expect(mockLoadSubgraph).toHaveBeenCalledWith('operations', ['seed-fuzzy']);
  });

  it('PPR path returns empty gracefully when subgraph loader returns null', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'seed-1', name: 'foo' }] } as any);
    mockLoadSubgraph.mockResolvedValueOnce(null);

    const results = await retriever.retrieve('Foo bar', 'operations', {
      enableVector: false,
      enableGraph: true,
      enableCommunity: false,
      enableBM25: false,
      enableEventAware: false,
      enablePPR: true,
    });
    expect(results).toEqual([]);
    expect(mockPPR).not.toHaveBeenCalled();
  });

  it('PPR path filters seeds out of the final idea result via excludeSeeds', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 'seed-uuid-1', name: 'react' }],
    } as any);
    mockLoadSubgraph.mockResolvedValueOnce({
      graph: {
        nodes: ['seed-uuid-1', 'n-1', 'n-2'],
        edges: [
          ['seed-uuid-1', 'n-1', 0.5],
          ['seed-uuid-1', 'n-2', 0.4],
        ],
      },
      validSeeds: ['seed-uuid-1'],
      stats: {
        nodes: 3,
        relationEdges: 2,
        coactivationEdges: 0,
        hopsCovered: 1,
        truncated: false,
      },
    });
    mockPPR.mockReturnValueOnce({
      scores: new Map([
        ['seed-uuid-1', 0.5],
        ['n-1', 0.3],
        ['n-2', 0.2],
      ]),
      iterations: 5,
      converged: true,
    });
    mockTopK.mockReturnValueOnce([
      { nodeId: 'n-1', score: 0.3 },
      { nodeId: 'n-2', score: 0.2 },
    ]);
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 'idea-1',
          title: 'Idea via n-1',
          content: 'Doc',
          best_rank: '1',
          importance: '5',
        },
        {
          id: 'idea-2',
          title: 'Idea via n-2',
          content: 'Doc 2',
          best_rank: '2',
          importance: '5',
        },
      ],
    } as any);

    const results = await retriever.retrieve('React', 'operations', {
      enableVector: false,
      enableGraph: true,
      enableCommunity: false,
      enableBM25: false,
      enableEventAware: false,
      enablePPR: true,
    });

    expect(results.length).toBe(2);
    // The first idea (via n-1) should outrank the second (via n-2).
    const idea1Score = results.find((r) => r.id === 'idea-1')?.score ?? 0;
    const idea2Score = results.find((r) => r.id === 'idea-2')?.score ?? 0;
    expect(idea1Score).toBeGreaterThan(idea2Score);
    // topKByPageRank was asked to exclude the seed.
    expect(mockTopK.mock.calls[0][2]).toEqual({
      excludeSeeds: true,
      seeds: ['seed-uuid-1'],
    });
  });
});
