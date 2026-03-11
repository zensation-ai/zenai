/**
 * Phase 49: Adaptive Retrieval Tests
 */

import {
  selectStrategy,
  denseRetrieve,
  sparseRetrieve,
  hybridRetrieve,
  rrfFusion,
  retrieve,
} from '../../../services/rag/adaptive-retrieval';
import { RetrievalResult } from '../../../services/agentic-rag';

// ===========================================
// Mocks
// ===========================================

jest.mock('../../../utils/database-context', () => ({
  queryContext: jest.fn(),
  isValidContext: jest.fn((ctx: string) => ['personal', 'work', 'learning', 'creative'].includes(ctx)),
}));

jest.mock('../../../services/ai', () => ({
  generateEmbedding: jest.fn().mockResolvedValue([0.1, 0.2, 0.3]),
}));

jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

var mockQueryContext = jest.requireMock('../../../utils/database-context').queryContext;
var mockGenerateEmbedding = jest.requireMock('../../../services/ai').generateEmbedding;

// ===========================================
// Helpers
// ===========================================

function makeResult(id: string, title: string, score: number, strategy: string = 'semantic'): RetrievalResult {
  return { id, title, summary: `Summary of ${title}`, score, strategy: strategy as RetrievalResult['strategy'] };
}

// ===========================================
// Strategy Selection Tests
// ===========================================

describe('selectStrategy', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('selects sparse for short keyword queries', () => {
    const result = selectStrategy('React TypeScript');
    expect(result.strategy).toBe('sparse');
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  test('selects sparse for quoted terms', () => {
    const result = selectStrategy('"machine learning" API');
    expect(result.strategy).toBe('sparse');
  });

  test('selects sparse for hashtag queries', () => {
    const result = selectStrategy('#project-alpha');
    expect(result.strategy).toBe('sparse');
  });

  test('selects sparse for abbreviations', () => {
    const result = selectStrategy('REST API');
    expect(result.strategy).toBe('sparse');
  });

  test('selects dense for question queries', () => {
    const result = selectStrategy('What is the best approach for handling errors in async code?');
    expect(result.strategy).toBe('dense');
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  test('selects dense for question mark queries', () => {
    const result = selectStrategy('Wie funktioniert die Memory-Architektur?');
    expect(result.strategy).toBe('dense');
  });

  test('selects dense for conceptual queries', () => {
    const result = selectStrategy('explain the difference between semantic search and keyword search');
    expect(result.strategy).toBe('dense');
  });

  test('selects hybrid for mixed queries', () => {
    // A query with both question indicator and keyword indicators triggers hybrid
    const result = selectStrategy('How does "React" work');
    // Question word gives dense score, quoted term gives sparse score
    expect(result.strategy).toBe('hybrid');
  });

  test('selects hybrid for ambiguous medium-length queries', () => {
    const result = selectStrategy('TypeScript error handling patterns');
    expect(['hybrid', 'sparse']).toContain(result.strategy);
  });

  test('returns confidence between 0 and 1', () => {
    const queries = [
      'test',
      'How does this work?',
      'React TypeScript error handling patterns for production',
    ];
    for (const q of queries) {
      const result = selectStrategy(q);
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    }
  });

  test('always provides a reason string', () => {
    const result = selectStrategy('anything');
    expect(result.reason).toBeTruthy();
    expect(typeof result.reason).toBe('string');
  });
});

// ===========================================
// Dense Retrieval Tests
// ===========================================

describe('denseRetrieve', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns results from pgvector query', async () => {
    mockQueryContext.mockResolvedValueOnce({
      rows: [
        { id: '1', title: 'Test Idea', summary: 'Summary', raw_transcript: 'Content', similarity: '0.85' },
      ],
    });

    const results = await denseRetrieve('test query', 'personal');
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('1');
    expect(results[0].score).toBeCloseTo(0.85);
    expect(results[0].strategy).toBe('semantic');
  });

  test('returns empty array when embedding fails', async () => {
    mockGenerateEmbedding.mockResolvedValueOnce([]);
    const results = await denseRetrieve('test', 'personal');
    expect(results).toEqual([]);
  });

  test('returns empty array on database error', async () => {
    mockQueryContext.mockRejectedValueOnce(new Error('DB error'));
    const results = await denseRetrieve('test', 'personal');
    expect(results).toEqual([]);
  });
});

// ===========================================
// Sparse Retrieval Tests
// ===========================================

describe('sparseRetrieve', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns results from tsvector query', async () => {
    mockQueryContext.mockResolvedValueOnce({
      rows: [
        { id: '2', title: 'Keyword Match', summary: 'Found via keywords', raw_transcript: null, rank: '0.08' },
      ],
    });

    const results = await sparseRetrieve('keyword test query', 'work');
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('2');
    expect(results[0].strategy).toBe('keyword');
  });

  test('returns empty array for very short queries', async () => {
    const results = await sparseRetrieve('ab', 'personal');
    expect(results).toEqual([]);
  });

  test('returns empty array on database error', async () => {
    mockQueryContext.mockRejectedValueOnce(new Error('DB error'));
    const results = await sparseRetrieve('test query here', 'personal');
    expect(results).toEqual([]);
  });
});

// ===========================================
// RRF Fusion Tests
// ===========================================

describe('rrfFusion', () => {
  test('merges results from both lists', () => {
    const dense = [makeResult('a', 'A', 0.9), makeResult('b', 'B', 0.8)];
    const sparse = [makeResult('c', 'C', 0.7), makeResult('a', 'A', 0.6)];

    const fused = rrfFusion(dense, sparse);
    expect(fused.length).toBe(3);
    // 'a' should be ranked highest since it appears in both lists
    expect(fused[0].id).toBe('a');
  });

  test('assigns hybrid strategy to all fused results', () => {
    const dense = [makeResult('a', 'A', 0.9)];
    const sparse = [makeResult('b', 'B', 0.7)];

    const fused = rrfFusion(dense, sparse);
    for (const r of fused) {
      expect(r.strategy).toBe('hybrid');
    }
  });

  test('normalizes scores to 0-1 range', () => {
    const dense = [makeResult('a', 'A', 0.9), makeResult('b', 'B', 0.5)];
    const sparse = [makeResult('c', 'C', 0.8)];

    const fused = rrfFusion(dense, sparse);
    expect(fused[0].score).toBeCloseTo(1.0);
    for (const r of fused) {
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(1);
    }
  });

  test('handles empty input lists', () => {
    expect(rrfFusion([], [])).toEqual([]);
    expect(rrfFusion([makeResult('a', 'A', 0.9)], []).length).toBe(1);
    expect(rrfFusion([], [makeResult('a', 'A', 0.9)]).length).toBe(1);
  });

  test('correct RRF scoring: item in both lists scores higher', () => {
    const dense = [makeResult('shared', 'Shared', 0.9), makeResult('dense-only', 'Dense', 0.8)];
    const sparse = [makeResult('sparse-only', 'Sparse', 0.7), makeResult('shared', 'Shared', 0.6)];

    const fused = rrfFusion(dense, sparse, 60);
    const sharedResult = fused.find(r => r.id === 'shared');
    const denseOnly = fused.find(r => r.id === 'dense-only');
    const sparseOnly = fused.find(r => r.id === 'sparse-only');

    expect(sharedResult!.score).toBeGreaterThan(denseOnly!.score);
    expect(sharedResult!.score).toBeGreaterThan(sparseOnly!.score);
  });
});

// ===========================================
// Hybrid Retrieval Tests
// ===========================================

describe('hybridRetrieve', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('combines dense and sparse results', async () => {
    // Dense query
    mockQueryContext.mockResolvedValueOnce({
      rows: [
        { id: '1', title: 'Dense Result', summary: 'Dense', raw_transcript: null, similarity: '0.9' },
      ],
    });
    // Sparse query
    mockQueryContext.mockResolvedValueOnce({
      rows: [
        { id: '2', title: 'Sparse Result', summary: 'Sparse', raw_transcript: null, rank: '0.05' },
      ],
    });

    const results = await hybridRetrieve('test query here', 'personal');
    expect(results.length).toBe(2);
    // All results should be 'hybrid' strategy
    for (const r of results) {
      expect(r.strategy).toBe('hybrid');
    }
  });
});

// ===========================================
// Main Retrieve Function Tests
// ===========================================

describe('retrieve', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('selects strategy automatically and returns results', async () => {
    mockQueryContext.mockResolvedValueOnce({
      rows: [
        { id: '1', title: 'Result', summary: 'Test', raw_transcript: null, similarity: '0.8' },
      ],
    });

    const result = await retrieve('What is machine learning?', 'personal');
    expect(result.strategyUsed).toBeDefined();
    expect(result.strategyUsed.strategy).toBeDefined();
    expect(result.timing.total).toBeGreaterThanOrEqual(0);
    expect(result.timing.strategy_selection).toBeGreaterThanOrEqual(0);
    expect(result.timing.retrieval).toBeGreaterThanOrEqual(0);
  });

  test('uses forced strategy when specified', async () => {
    mockQueryContext.mockResolvedValueOnce({ rows: [] });

    const result = await retrieve('test', 'personal', { forceStrategy: 'sparse' });
    expect(result.strategyUsed.strategy).toBe('sparse');
    expect(result.strategyUsed.confidence).toBe(1.0);
  });

  test('filters results below minimum score', async () => {
    mockQueryContext.mockResolvedValueOnce({
      rows: [
        { id: '1', title: 'High', summary: '', raw_transcript: null, similarity: '0.9' },
        { id: '2', title: 'Low', summary: '', raw_transcript: null, similarity: '0.05' },
      ],
    });

    const result = await retrieve('What is this?', 'personal', { minScore: 0.5 });
    expect(result.results.every(r => r.score >= 0.5)).toBe(true);
  });

  test('returns empty results when sparse finds no matches', async () => {
    // Sparse retrieval finds no matching documents
    mockQueryContext.mockResolvedValueOnce({ rows: [] });

    const result = await retrieve('test query here', 'personal', { forceStrategy: 'sparse' });
    expect(result.strategyUsed.strategy).toBe('sparse');
    expect(result.results).toEqual([]);
  });

  test('returns empty results when embedding generation returns empty', async () => {
    // Embedding returns empty -> dense returns []
    mockGenerateEmbedding.mockResolvedValueOnce([]);

    const result = await retrieve('What is machine learning?', 'personal', { forceStrategy: 'dense' });
    expect(result.results).toEqual([]);
    expect(result.strategyUsed.strategy).toBe('dense');
  });

  test('sparse retrieval gracefully handles DB error and returns empty', async () => {
    // DB error is caught inside sparseRetrieve, returns []
    mockQueryContext.mockRejectedValueOnce(new Error('Connection lost'));

    const result = await retrieve('test query here', 'personal', { forceStrategy: 'sparse' });
    expect(result.results).toEqual([]);
    expect(result.strategyUsed.strategy).toBe('sparse');
  });
});
