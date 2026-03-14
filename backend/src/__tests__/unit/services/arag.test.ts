/**
 * Phase 70: A-RAG (Autonomous Retrieval Strategy) Tests
 *
 * Tests for:
 * - Strategy agent plan generation (mock Claude)
 * - Plan execution with mock interfaces
 * - Self-evaluation scoring
 * - Early exit on high confidence
 * - Retry on low confidence
 * - Max iteration limit
 * - Fallback to fixed pipeline
 */

// ===========================================
// Mocks (must be before imports)
// ===========================================

jest.mock('../../../services/claude', () => ({
  queryClaudeJSON: jest.fn(),
}));

jest.mock('../../../services/ai', () => ({
  generateEmbedding: jest.fn(),
}));

jest.mock('../../../utils/database-context', () => ({
  queryContext: jest.fn(),
}));

jest.mock('../../../services/knowledge-graph/hybrid-retriever', () => ({
  hybridRetriever: {
    retrieve: jest.fn(),
  },
}));

jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// ===========================================
// Imports
// ===========================================

import {
  planRetrieval,
  buildDefaultPlan,
  classifyQueryHeuristic,
} from '../../../services/arag/strategy-agent';
import { evaluateResults } from '../../../services/arag/strategy-evaluator';
import { executeRetrievalPlan } from '../../../services/arag/iterative-retriever';
import type {
  RetrievalPlan,
  RetrievalResultItem,
  RetrievalInterface,
} from '../../../services/arag/retrieval-interfaces';

import { queryClaudeJSON } from '../../../services/claude';
import { generateEmbedding } from '../../../services/ai';
import { queryContext } from '../../../utils/database-context';
import { hybridRetriever } from '../../../services/knowledge-graph/hybrid-retriever';

const mockQueryClaudeJSON = queryClaudeJSON as jest.MockedFunction<typeof queryClaudeJSON>;
const mockGenerateEmbedding = generateEmbedding as jest.MockedFunction<typeof generateEmbedding>;
const mockQueryContext = queryContext as jest.MockedFunction<typeof queryContext>;
const mockHybridRetrieverRetrieve = hybridRetriever.retrieve as jest.MockedFunction<typeof hybridRetriever.retrieve>;

// ===========================================
// Setup
// ===========================================

beforeEach(() => {
  jest.clearAllMocks();
  mockQueryClaudeJSON.mockReset();
  mockGenerateEmbedding.mockReset();
  mockQueryContext.mockReset();
  mockHybridRetrieverRetrieve.mockReset();
});

// ===========================================
// Strategy Agent Tests
// ===========================================

describe('Strategy Agent', () => {
  describe('classifyQueryHeuristic', () => {
    it('should classify temporal queries', () => {
      expect(classifyQueryHeuristic('Was habe ich letzte Woche gemacht?')).toBe('temporal');
      expect(classifyQueryHeuristic('recent changes')).toBe('temporal');
      expect(classifyQueryHeuristic('Ideen von gestern')).toBe('temporal');
    });

    it('should classify comparison queries', () => {
      expect(classifyQueryHeuristic('Vergleich React vs Vue')).toBe('comparison');
      expect(classifyQueryHeuristic('What is the difference between A and B')).toBe('comparison');
    });

    it('should classify analytical queries', () => {
      expect(classifyQueryHeuristic('Analysiere meine Projektstruktur')).toBe('analytical');
      expect(classifyQueryHeuristic('Warum funktioniert das nicht?')).toBe('analytical');
      expect(classifyQueryHeuristic('Give me an overview of the system')).toBe('analytical');
    });

    it('should classify multi-hop queries', () => {
      expect(classifyQueryHeuristic('Verbindungen zwischen React und TypeScript')).toBe('multi_hop');
      expect(classifyQueryHeuristic('How are these related?')).toBe('multi_hop');
    });

    it('should default to simple_lookup', () => {
      expect(classifyQueryHeuristic('TypeScript generics')).toBe('simple_lookup');
      expect(classifyQueryHeuristic('React hooks')).toBe('simple_lookup');
    });
  });

  describe('buildDefaultPlan', () => {
    it('should build a plan for simple_lookup', () => {
      const plan = buildDefaultPlan('React hooks', ['keyword', 'semantic', 'graph']);
      expect(plan.queryType).toBe('simple_lookup');
      expect(plan.steps.length).toBeGreaterThanOrEqual(1);
      expect(plan.steps[0].interface).toBe('semantic');
    });

    it('should build a plan for temporal queries', () => {
      const plan = buildDefaultPlan('letzte Woche', ['keyword', 'semantic']);
      expect(plan.queryType).toBe('temporal');
      expect(plan.steps[0].interface).toBe('keyword');
    });

    it('should build a plan for multi_hop with graph', () => {
      const plan = buildDefaultPlan('Verbindung zwischen A und B', ['semantic', 'graph', 'community']);
      expect(plan.queryType).toBe('multi_hop');
      const interfaces = plan.steps.map(s => s.interface);
      expect(interfaces).toContain('graph');
    });

    it('should handle empty available interfaces gracefully', () => {
      const plan = buildDefaultPlan('test query', []);
      expect(plan.steps.length).toBe(0);
    });

    it('should set default expectedConfidence to 0.6', () => {
      const plan = buildDefaultPlan('test', ['semantic']);
      expect(plan.expectedConfidence).toBe(0.6);
    });
  });

  describe('planRetrieval', () => {
    it('should use Claude response when valid', async () => {
      mockQueryClaudeJSON.mockResolvedValueOnce({
        queryType: 'analytical',
        steps: [
          { interface: 'semantic', params: { query: 'test' } },
          { interface: 'keyword', params: { terms: 'test' } },
        ],
        reasoning: 'Combining semantic and keyword for coverage',
        expectedConfidence: 0.8,
      });

      const plan = await planRetrieval('test query', 'personal', ['semantic', 'keyword', 'graph']);
      expect(plan.steps.length).toBe(2);
      expect(plan.steps[0].interface).toBe('semantic');
      expect(plan.steps[1].interface).toBe('keyword');
      expect(plan.queryType).toBe('analytical');
      expect(plan.expectedConfidence).toBe(0.8);
    });

    it('should fall back to default plan when Claude fails', async () => {
      mockQueryClaudeJSON.mockRejectedValueOnce(new Error('API error'));

      const plan = await planRetrieval('React hooks', 'personal', ['semantic', 'keyword']);
      expect(plan.steps.length).toBeGreaterThanOrEqual(1);
      expect(plan.reasoning).toContain('Default plan');
    });

    it('should fall back when Claude returns invalid steps', async () => {
      mockQueryClaudeJSON.mockResolvedValueOnce({
        steps: [{ interface: 'invalid_interface', params: {} }],
      });

      const plan = await planRetrieval('test', 'personal', ['semantic', 'keyword']);
      expect(plan.reasoning).toContain('Default plan');
    });

    it('should fall back when Claude returns empty steps', async () => {
      mockQueryClaudeJSON.mockResolvedValueOnce({
        steps: [],
      });

      const plan = await planRetrieval('test', 'personal', ['semantic']);
      expect(plan.reasoning).toContain('Default plan');
    });

    it('should limit steps to 4', async () => {
      mockQueryClaudeJSON.mockResolvedValueOnce({
        queryType: 'analytical',
        steps: [
          { interface: 'semantic', params: {} },
          { interface: 'keyword', params: {} },
          { interface: 'graph', params: {} },
          { interface: 'community', params: {} },
          { interface: 'semantic', params: { query: 'extra' } },
        ],
        reasoning: 'Too many steps',
        expectedConfidence: 0.9,
      });

      const plan = await planRetrieval('test', 'personal', ['semantic', 'keyword', 'graph', 'community']);
      expect(plan.steps.length).toBeLessThanOrEqual(4);
    });

    it('should clamp expectedConfidence to 0-1', async () => {
      mockQueryClaudeJSON.mockResolvedValueOnce({
        steps: [{ interface: 'semantic', params: {} }],
        expectedConfidence: 1.5,
      });

      const plan = await planRetrieval('test', 'personal', ['semantic']);
      expect(plan.expectedConfidence).toBeLessThanOrEqual(1);
    });

    it('should filter out unavailable interfaces from Claude response', async () => {
      mockQueryClaudeJSON.mockResolvedValueOnce({
        steps: [
          { interface: 'semantic', params: {} },
          { interface: 'graph', params: {} }, // not available
        ],
        reasoning: 'test',
      });

      const plan = await planRetrieval('test', 'personal', ['semantic', 'keyword']);
      expect(plan.steps.length).toBe(1);
      expect(plan.steps[0].interface).toBe('semantic');
    });
  });
});

// ===========================================
// Strategy Evaluator Tests
// ===========================================

describe('Strategy Evaluator', () => {
  describe('evaluateResults', () => {
    it('should return zero confidence for empty results', () => {
      const evaluation = evaluateResults('test query', []);
      expect(evaluation.confidence).toBe(0);
      expect(evaluation.completeness).toBe(0);
      expect(evaluation.shouldRetry).toBe(true);
    });

    it('should return high confidence for good results', () => {
      const results: RetrievalResultItem[] = [
        { id: '1', content: 'Detailed content about test query topic with lots of information', score: 0.95, source: 'semantic', title: 'Test Query Result' },
        { id: '2', content: 'Another relevant document about test query with more details', score: 0.88, source: 'keyword', title: 'Related Test' },
        { id: '3', content: 'Third relevant result covering query aspects thoroughly', score: 0.82, source: 'graph', title: 'Query Context' },
        { id: '4', content: 'Fourth result with good relevance score and content', score: 0.75, source: 'community', title: 'More Info' },
      ];

      const evaluation = evaluateResults('test query', results);
      expect(evaluation.confidence).toBeGreaterThan(0.6);
      expect(evaluation.shouldRetry).toBe(false);
    });

    it('should return low confidence for poor results', () => {
      const results: RetrievalResultItem[] = [
        { id: '1', content: 'Short', score: 0.15, source: 'keyword', title: 'Weak' },
      ];

      const evaluation = evaluateResults('complex analytical query about systems', results);
      expect(evaluation.confidence).toBeLessThan(0.6);
      expect(evaluation.shouldRetry).toBe(true);
    });

    it('should give higher confidence when query terms are covered', () => {
      const resultsGood: RetrievalResultItem[] = [
        { id: '1', content: 'This document covers react hooks patterns in detail', score: 0.8, source: 'semantic', title: 'React Hooks Patterns' },
        { id: '2', content: 'More about react hooks and custom patterns', score: 0.75, source: 'keyword', title: 'Custom Hooks' },
        { id: '3', content: 'React hooks best practices and patterns guide', score: 0.7, source: 'graph', title: 'Best Practices' },
      ];

      const resultsBad: RetrievalResultItem[] = [
        { id: '4', content: 'Unrelated content about database optimization', score: 0.8, source: 'semantic', title: 'Database' },
        { id: '5', content: 'More unrelated content about networking', score: 0.75, source: 'keyword', title: 'Network' },
        { id: '6', content: 'Third unrelated document about cooking', score: 0.7, source: 'graph', title: 'Cooking' },
      ];

      const evalGood = evaluateResults('react hooks patterns', resultsGood);
      const evalBad = evaluateResults('react hooks patterns', resultsBad);

      expect(evalGood.confidence).toBeGreaterThan(evalBad.confidence);
    });

    it('should value source diversity', () => {
      const diverseResults: RetrievalResultItem[] = [
        { id: '1', content: 'Result from semantic search with good content', score: 0.8, source: 'semantic', title: 'Semantic Result' },
        { id: '2', content: 'Result from keyword search with good content', score: 0.75, source: 'keyword', title: 'Keyword Result' },
        { id: '3', content: 'Result from graph search with good content', score: 0.7, source: 'graph', title: 'Graph Result' },
      ];

      const sameSourceResults: RetrievalResultItem[] = [
        { id: '4', content: 'Result from semantic search with good content', score: 0.8, source: 'semantic', title: 'Semantic Result 1' },
        { id: '5', content: 'Another from semantic search with good content', score: 0.75, source: 'semantic', title: 'Semantic Result 2' },
        { id: '6', content: 'Third from semantic search with good content', score: 0.7, source: 'semantic', title: 'Semantic Result 3' },
      ];

      const evalDiverse = evaluateResults('test', diverseResults);
      const evalSame = evaluateResults('test', sameSourceResults);

      expect(evalDiverse.completeness).toBeGreaterThan(evalSame.completeness);
    });

    it('should handle results below relevance threshold', () => {
      const results: RetrievalResultItem[] = [
        { id: '1', content: 'Very low relevance result', score: 0.1, source: 'keyword', title: 'Low' },
        { id: '2', content: 'Another low relevance result', score: 0.05, source: 'semantic', title: 'Lower' },
      ];

      const evaluation = evaluateResults('test', results);
      expect(evaluation.confidence).toBeLessThan(0.5);
      expect(evaluation.shouldRetry).toBe(true);
    });
  });
});

// ===========================================
// Iterative Retriever Tests
// ===========================================

describe('Iterative Retriever', () => {
  const makeHighConfidenceResults = () => ({
    rows: [
      { id: 'id-1', title: 'Result 1', content: 'Very detailed and relevant content about the topic being searched for with lots of information', rank: '1.0', similarity: '0.95' },
      { id: 'id-2', title: 'Result 2', content: 'Another very relevant result with detailed information about the search topic', rank: '0.9', similarity: '0.88' },
      { id: 'id-3', title: 'Result 3', content: 'Third relevant result covering different aspects of the search query thoroughly', rank: '0.8', similarity: '0.82' },
      { id: 'id-4', title: 'Result 4', content: 'Fourth result providing additional context and information about the topic', rank: '0.7', similarity: '0.75' },
    ],
  });

  const makeLowConfidenceResults = () => ({
    rows: [
      { id: 'id-low', title: 'Weak', content: 'Short', rank: '0.1', similarity: '0.15' },
    ],
  });

  it('should execute a simple plan with semantic search', async () => {
    mockGenerateEmbedding.mockResolvedValueOnce([0.1, 0.2, 0.3]);
    mockQueryContext.mockResolvedValueOnce(makeHighConfidenceResults());

    const plan: RetrievalPlan = {
      steps: [{ interface: 'semantic', params: { query: 'test' } }],
      reasoning: 'Simple semantic search',
      expectedConfidence: 0.8,
      queryType: 'simple_lookup',
    };

    const { result, metadata } = await executeRetrievalPlan(plan, 'personal' as any, 'test query');

    expect(result.results.length).toBeGreaterThan(0);
    expect(result.confidence).toBeGreaterThan(0);
    expect(metadata.iterations).toBeGreaterThanOrEqual(1);
    expect(metadata.interfacesUsed).toContain('semantic');
    expect(metadata.usedStrategyAgent).toBe(true);
  });

  it('should execute keyword search', async () => {
    mockQueryContext.mockResolvedValueOnce(makeHighConfidenceResults());

    const plan: RetrievalPlan = {
      steps: [{ interface: 'keyword', params: { terms: 'React hooks' } }],
      reasoning: 'Keyword search',
      expectedConfidence: 0.7,
      queryType: 'simple_lookup',
    };

    const { result, metadata } = await executeRetrievalPlan(plan, 'personal' as any, 'React hooks');

    expect(result.results.length).toBeGreaterThan(0);
    expect(metadata.interfacesUsed).toContain('keyword');
  });

  it('should exit early on high confidence', async () => {
    // Return very strong results
    mockGenerateEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);
    mockQueryContext.mockResolvedValue(makeHighConfidenceResults());

    const plan: RetrievalPlan = {
      steps: [
        { interface: 'semantic', params: { query: 'test' } },
        { interface: 'keyword', params: { terms: 'test' } },
      ],
      reasoning: 'Multi-step plan',
      expectedConfidence: 0.8,
      queryType: 'simple_lookup',
    };

    const { result, metadata } = await executeRetrievalPlan(plan, 'personal' as any, 'test query about the topic');

    // Should complete in 1 iteration if confidence is high enough
    expect(metadata.iterations).toBeLessThanOrEqual(2);
    expect(result.results.length).toBeGreaterThan(0);
  });

  it('should retry on low confidence with strategy revision', async () => {
    // First call returns weak results
    mockGenerateEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);
    mockQueryContext
      .mockResolvedValueOnce(makeLowConfidenceResults()) // First iteration: weak semantic
      .mockResolvedValueOnce(makeHighConfidenceResults()); // Second iteration: strong keyword

    // Mock the strategy agent for revision
    mockQueryClaudeJSON.mockResolvedValueOnce({
      queryType: 'simple_lookup',
      steps: [{ interface: 'keyword', params: { terms: 'test' } }],
      reasoning: 'Revised to keyword',
      expectedConfidence: 0.8,
    });

    const plan: RetrievalPlan = {
      steps: [{ interface: 'semantic', params: { query: 'test' } }],
      reasoning: 'Initial plan',
      expectedConfidence: 0.7,
      queryType: 'simple_lookup',
    };

    const { result, metadata } = await executeRetrievalPlan(plan, 'personal' as any, 'test query');

    expect(metadata.iterations).toBeGreaterThan(1);
    expect(result.results.length).toBeGreaterThan(0);
  });

  it('should not exceed MAX_ITERATIONS (3)', async () => {
    // Always return weak results to force max iterations
    mockGenerateEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);
    mockQueryContext.mockResolvedValue(makeLowConfidenceResults());
    mockQueryClaudeJSON.mockResolvedValue({
      steps: [{ interface: 'keyword', params: { terms: 'test' } }],
      reasoning: 'Revised',
    });

    const plan: RetrievalPlan = {
      steps: [{ interface: 'semantic', params: { query: 'test' } }],
      reasoning: 'Initial plan',
      expectedConfidence: 0.7,
      queryType: 'simple_lookup',
    };

    const { metadata } = await executeRetrievalPlan(plan, 'personal' as any, 'test');

    expect(metadata.iterations).toBeLessThanOrEqual(3);
  });

  it('should execute parallel steps without dependencies', async () => {
    mockGenerateEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);
    mockQueryContext
      .mockResolvedValueOnce(makeHighConfidenceResults()) // semantic
      .mockResolvedValueOnce(makeHighConfidenceResults()); // keyword

    const plan: RetrievalPlan = {
      steps: [
        { interface: 'semantic', params: { query: 'test' } },
        { interface: 'keyword', params: { terms: 'test' } },
      ],
      reasoning: 'Parallel execution',
      expectedConfidence: 0.8,
      queryType: 'simple_lookup',
    };

    const { result, metadata } = await executeRetrievalPlan(plan, 'personal' as any, 'test query about the topic');

    expect(metadata.interfacesUsed).toContain('semantic');
    expect(metadata.interfacesUsed).toContain('keyword');
    expect(result.results.length).toBeGreaterThan(0);
  });

  it('should execute dependent steps sequentially', async () => {
    mockGenerateEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);
    mockQueryContext.mockResolvedValue(makeHighConfidenceResults());
    mockHybridRetrieverRetrieve.mockResolvedValue([
      { id: 'g-1', title: 'Graph Result', content: 'Connected via graph with detailed information about connections', score: 0.8, source: 'graph' },
    ]);

    const plan: RetrievalPlan = {
      steps: [
        { interface: 'semantic', params: { query: 'test' } },
        { interface: 'graph', params: { query: 'test' }, dependsOn: 0 },
      ],
      reasoning: 'Sequential with dependency',
      expectedConfidence: 0.8,
      queryType: 'multi_hop',
    };

    const { result, metadata } = await executeRetrievalPlan(plan, 'personal' as any, 'test query about connections');

    expect(metadata.interfacesUsed).toContain('semantic');
    expect(metadata.interfacesUsed).toContain('graph');
  });

  it('should handle step execution failures gracefully', async () => {
    // Semantic fails, keyword succeeds
    mockGenerateEmbedding.mockRejectedValueOnce(new Error('Embedding service down'));
    mockQueryContext.mockResolvedValueOnce(makeHighConfidenceResults());

    const plan: RetrievalPlan = {
      steps: [
        { interface: 'semantic', params: { query: 'test' } },
        { interface: 'keyword', params: { terms: 'test' } },
      ],
      reasoning: 'Test graceful failure',
      expectedConfidence: 0.7,
      queryType: 'simple_lookup',
    };

    const { result } = await executeRetrievalPlan(plan, 'personal' as any, 'test query about the topic');

    // Should still have results from keyword search
    expect(result.results.length).toBeGreaterThan(0);
  });

  it('should use graph interface via hybrid retriever', async () => {
    mockHybridRetrieverRetrieve.mockResolvedValueOnce([
      { id: 'g-1', title: 'Entity Result', content: 'Found via graph traversal with detailed entity connections and information', score: 0.85, source: 'graph' },
      { id: 'g-2', title: 'Entity Result 2', content: 'Second graph result with more entity relationship details', score: 0.78, source: 'graph' },
      { id: 'g-3', title: 'Entity Result 3', content: 'Third graph result covering additional relationship aspects', score: 0.72, source: 'graph' },
    ]);

    const plan: RetrievalPlan = {
      steps: [{ interface: 'graph', params: { query: 'test' } }],
      reasoning: 'Graph-only plan',
      expectedConfidence: 0.7,
      queryType: 'multi_hop',
    };

    const { result, metadata } = await executeRetrievalPlan(plan, 'personal' as any, 'test entity connections');

    expect(metadata.interfacesUsed).toContain('graph');
    expect(result.results.length).toBeGreaterThan(0);
    expect(mockHybridRetrieverRetrieve).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({
        enableGraph: true,
        enableVector: false,
        enableCommunity: false,
        enableBM25: false,
      })
    );
  });

  it('should use community interface via hybrid retriever', async () => {
    mockHybridRetrieverRetrieve.mockResolvedValueOnce([
      { id: 'c-1', title: 'Community Summary', content: 'Broad topic summary from community analysis with comprehensive details', score: 0.7, source: 'community' },
      { id: 'c-2', title: 'Community Summary 2', content: 'Second community summary with additional topic coverage', score: 0.65, source: 'community' },
      { id: 'c-3', title: 'Community Summary 3', content: 'Third community summary providing broader context overview', score: 0.6, source: 'community' },
    ]);

    const plan: RetrievalPlan = {
      steps: [{ interface: 'community', params: { query: 'test' } }],
      reasoning: 'Community search plan',
      expectedConfidence: 0.6,
      queryType: 'analytical',
    };

    const { result, metadata } = await executeRetrievalPlan(plan, 'personal' as any, 'test broad overview');

    expect(metadata.interfacesUsed).toContain('community');
    expect(result.results.length).toBeGreaterThan(0);
    expect(mockHybridRetrieverRetrieve).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({
        enableCommunity: true,
        enableVector: false,
        enableGraph: false,
        enableBM25: false,
      })
    );
  });

  it('should record step timings', async () => {
    mockGenerateEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);
    mockQueryContext.mockResolvedValue(makeHighConfidenceResults());

    const plan: RetrievalPlan = {
      steps: [
        { interface: 'semantic', params: { query: 'test' } },
        { interface: 'keyword', params: { terms: 'test' } },
      ],
      reasoning: 'Timing test',
      expectedConfidence: 0.9,
      queryType: 'simple_lookup',
    };

    const { metadata } = await executeRetrievalPlan(plan, 'personal' as any, 'test query about the topic');

    expect(metadata.stepTimings.length).toBeGreaterThanOrEqual(2);
    for (const timing of metadata.stepTimings) {
      expect(timing.durationMs).toBeGreaterThanOrEqual(0);
      expect(['semantic', 'keyword', 'chunk_read', 'graph', 'community']).toContain(timing.interface);
    }
  });

  it('should deduplicate results across iterations', async () => {
    const sameIdResults = {
      rows: [
        { id: 'shared-id', title: 'Same Result', content: 'Detailed content about the topic being searched', rank: '0.8', similarity: '0.85' },
      ],
    };

    mockGenerateEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);
    mockQueryContext
      .mockResolvedValueOnce(sameIdResults) // semantic
      .mockResolvedValueOnce(sameIdResults); // keyword

    const plan: RetrievalPlan = {
      steps: [
        { interface: 'semantic', params: { query: 'test' } },
        { interface: 'keyword', params: { terms: 'test' } },
      ],
      reasoning: 'Dedup test',
      expectedConfidence: 0.8,
      queryType: 'simple_lookup',
    };

    const { result } = await executeRetrievalPlan(plan, 'personal' as any, 'test query');

    // Should have only 1 unique result despite appearing in 2 sources
    const uniqueIds = new Set(result.results.map(r => r.id));
    expect(uniqueIds.size).toBe(1);

    // Score should be boosted for appearing in multiple sources
    expect(result.results[0].score).toBeGreaterThan(0.8);
  });

  it('should handle chunk_read interface', async () => {
    mockQueryContext.mockResolvedValueOnce({
      rows: [
        { id: 'chunk-1', title: 'Direct Read', summary: 'Summary of the chunk with details', content: 'Full detailed content of the chunk being read directly for analysis' },
      ],
    });

    const plan: RetrievalPlan = {
      steps: [{ interface: 'chunk_read', params: { ids: ['chunk-1'] } }],
      reasoning: 'Direct chunk read',
      expectedConfidence: 0.9,
      queryType: 'simple_lookup',
    };

    const { result, metadata } = await executeRetrievalPlan(plan, 'personal' as any, 'test direct');

    expect(metadata.interfacesUsed).toContain('chunk_read');
    expect(result.results.length).toBe(1);
    expect(result.results[0].score).toBe(1.0); // Direct lookup = perfect score
  });
});

// ===========================================
// Integration: Strategy + Evaluation + Execution
// ===========================================

describe('A-RAG Integration', () => {
  it('should plan, execute, and evaluate end-to-end', async () => {
    // Mock Claude for plan generation
    mockQueryClaudeJSON.mockResolvedValueOnce({
      queryType: 'simple_lookup',
      steps: [
        { interface: 'semantic', params: { query: 'TypeScript patterns' } },
        { interface: 'keyword', params: { terms: 'TypeScript patterns' } },
      ],
      reasoning: 'Combined search for TypeScript patterns',
      expectedConfidence: 0.8,
    });

    // Mock retrieval interfaces
    mockGenerateEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);
    mockQueryContext
      .mockResolvedValueOnce({
        rows: [
          { id: 'ts-1', title: 'TypeScript Patterns', content: 'Comprehensive guide to TypeScript design patterns and best practices', similarity: '0.9' },
          { id: 'ts-2', title: 'Advanced TypeScript', content: 'Advanced TypeScript techniques including generics and utility types', similarity: '0.85' },
          { id: 'ts-3', title: 'TypeScript Tips', content: 'Practical TypeScript tips and patterns for production code quality', similarity: '0.8' },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          { id: 'ts-1', title: 'TypeScript Patterns', content: 'Comprehensive guide to TypeScript design patterns and best practices', rank: '0.95' },
          { id: 'ts-4', title: 'Pattern Matching', content: 'Pattern matching in TypeScript with discriminated unions explained', rank: '0.7' },
          { id: 'ts-5', title: 'Design Patterns', content: 'Software design patterns implemented in TypeScript examples', rank: '0.65' },
        ],
      });

    // Plan
    const plan = await planRetrieval(
      'TypeScript patterns',
      'personal',
      ['semantic', 'keyword', 'graph']
    );

    expect(plan.steps.length).toBe(2);

    // Execute
    const { result, metadata } = await executeRetrievalPlan(
      plan,
      'personal' as any,
      'TypeScript patterns'
    );

    expect(result.results.length).toBeGreaterThan(0);
    expect(metadata.interfacesUsed.length).toBeGreaterThanOrEqual(2);

    // Evaluate
    const evaluation = evaluateResults('TypeScript patterns', result.results);
    expect(evaluation.confidence).toBeGreaterThan(0);
  });
});
