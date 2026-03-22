/**
 * Tests for Phase 133: Artificial Curiosity Engine — Gap Detector
 *
 * TDD: Tests written before implementation.
 * Covers computeGapScore, suggestAction, groupQueriesByTopic,
 * detectGaps, and the KnowledgeGap interface.
 */

jest.mock('../../../../utils/logger', () => ({
  logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('../../../../utils/database-context', () => ({
  queryContext: jest.fn(),
}));

import {
  computeGapScore,
  suggestAction,
  groupQueriesByTopic,
  detectGaps,
} from '../../../../services/curiosity/gap-detector';
import type { KnowledgeGap } from '../../../../services/curiosity/gap-detector';
import { queryContext } from '../../../../utils/database-context';

const mockQueryContext = queryContext as jest.MockedFunction<typeof queryContext>;

beforeEach(() => {
  jest.clearAllMocks();
  mockQueryContext.mockReset();
});

// ---------------------------------------------------------------------------
// computeGapScore
// ---------------------------------------------------------------------------

describe('computeGapScore', () => {
  it('returns 0 when all params are at maximum', () => {
    const score = computeGapScore({
      queryCount: 0,
      maxQueries: 100,
      factCount: 50,
      maxFacts: 50,
      avgConfidence: 1.0,
      avgRAGScore: 1.0,
    });
    expect(score).toBeCloseTo(0.0, 5);
  });

  it('returns 1 when all params are at minimum', () => {
    const score = computeGapScore({
      queryCount: 100,
      maxQueries: 100,
      factCount: 0,
      maxFacts: 50,
      avgConfidence: 0,
      avgRAGScore: 0,
    });
    expect(score).toBeCloseTo(1.0, 5);
  });

  it('computes correct weighted score for partial values', () => {
    // 0.4*(50/100) + 0.3*(1-25/50) + 0.2*(1-0.5) + 0.1*(1-0.5)
    // = 0.4*0.5 + 0.3*0.5 + 0.2*0.5 + 0.1*0.5 = 0.5
    const score = computeGapScore({
      queryCount: 50,
      maxQueries: 100,
      factCount: 25,
      maxFacts: 50,
      avgConfidence: 0.5,
      avgRAGScore: 0.5,
    });
    expect(score).toBeCloseTo(0.5, 5);
  });

  it('clamps to 0 when result would be negative', () => {
    const score = computeGapScore({
      queryCount: 0,
      maxQueries: 100,
      factCount: 200,
      maxFacts: 50,
      avgConfidence: 1.5,
      avgRAGScore: 1.5,
    });
    expect(score).toBeGreaterThanOrEqual(0);
  });

  it('clamps to 1 when result would exceed 1', () => {
    const score = computeGapScore({
      queryCount: 200,
      maxQueries: 100,
      factCount: 0,
      maxFacts: 50,
      avgConfidence: -1,
      avgRAGScore: -1,
    });
    expect(score).toBeLessThanOrEqual(1);
  });

  it('handles all zeros gracefully', () => {
    const score = computeGapScore({
      queryCount: 0,
      maxQueries: 0,
      factCount: 0,
      maxFacts: 0,
      avgConfidence: 0,
      avgRAGScore: 0,
    });
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it('handles maxQueries of 0 without division by zero', () => {
    const score = computeGapScore({
      queryCount: 10,
      maxQueries: 0,
      factCount: 5,
      maxFacts: 10,
      avgConfidence: 0.5,
      avgRAGScore: 0.5,
    });
    expect(typeof score).toBe('number');
    expect(Number.isNaN(score)).toBe(false);
  });

  it('handles maxFacts of 0 without division by zero', () => {
    const score = computeGapScore({
      queryCount: 10,
      maxQueries: 100,
      factCount: 0,
      maxFacts: 0,
      avgConfidence: 0.5,
      avgRAGScore: 0.5,
    });
    expect(typeof score).toBe('number');
    expect(Number.isNaN(score)).toBe(false);
  });

  it('returns a number between 0 and 1 for typical values', () => {
    const score = computeGapScore({
      queryCount: 20,
      maxQueries: 100,
      factCount: 10,
      maxFacts: 50,
      avgConfidence: 0.7,
      avgRAGScore: 0.6,
    });
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it('gives higher weight to queryCount (0.4) than confidence (0.2)', () => {
    const highQuery = computeGapScore({
      queryCount: 100,
      maxQueries: 100,
      factCount: 50,
      maxFacts: 50,
      avgConfidence: 1.0,
      avgRAGScore: 1.0,
    });
    const lowConfidence = computeGapScore({
      queryCount: 0,
      maxQueries: 100,
      factCount: 50,
      maxFacts: 50,
      avgConfidence: 0.0,
      avgRAGScore: 1.0,
    });
    // queryCount weight (0.4) > confidence weight (0.2)
    expect(highQuery).toBeGreaterThan(lowConfidence);
  });
});

// ---------------------------------------------------------------------------
// suggestAction
// ---------------------------------------------------------------------------

describe('suggestAction', () => {
  it('returns web_research for gapScore > 0.8 and factCount 0', () => {
    expect(suggestAction(0.85, 0, 0.5)).toBe('web_research');
  });

  it('returns web_research for gapScore > 0.6 and avgConfidence < 0.3', () => {
    expect(suggestAction(0.65, 5, 0.2)).toBe('web_research');
  });

  it('returns consolidate_existing for gapScore > 0.5 and factCount > 0', () => {
    expect(suggestAction(0.55, 3, 0.5)).toBe('consolidate_existing');
  });

  it('returns ask_user for gapScore > 0.3', () => {
    expect(suggestAction(0.35, 0, 0.8)).toBe('ask_user');
  });

  it('returns monitor for low gapScore', () => {
    expect(suggestAction(0.1, 10, 0.9)).toBe('monitor');
  });

  it('returns monitor for gapScore exactly 0', () => {
    expect(suggestAction(0, 0, 1.0)).toBe('monitor');
  });

  it('prioritizes web_research (high gap + zero facts) over consolidate', () => {
    // gapScore > 0.8 and factCount 0 should win over consolidate condition
    expect(suggestAction(0.85, 0, 0.5)).toBe('web_research');
  });

  it('prioritizes web_research (low confidence) over consolidate', () => {
    // gapScore > 0.6 and avgConfidence < 0.3 should win
    expect(suggestAction(0.65, 3, 0.1)).toBe('web_research');
  });

  it('returns consolidate_existing at gapScore exactly 0.51 with facts', () => {
    expect(suggestAction(0.51, 1, 0.5)).toBe('consolidate_existing');
  });

  it('returns ask_user at gapScore exactly 0.31', () => {
    expect(suggestAction(0.31, 0, 0.8)).toBe('ask_user');
  });

  it('returns monitor at gapScore exactly 0.3', () => {
    expect(suggestAction(0.3, 0, 0.8)).toBe('monitor');
  });
});

// ---------------------------------------------------------------------------
// groupQueriesByTopic
// ---------------------------------------------------------------------------

describe('groupQueriesByTopic', () => {
  it('returns empty array for empty input', () => {
    const result = groupQueriesByTopic([]);
    expect(result).toEqual([]);
  });

  it('groups a single query into one topic', () => {
    const result = groupQueriesByTopic([{ text: 'machine learning algorithms', domain: 'learning' }]);
    expect(result).toHaveLength(1);
    expect(result[0].queryCount).toBe(1);
    expect(result[0].domain).toBe('learning');
  });

  it('groups multiple queries with shared keywords', () => {
    const result = groupQueriesByTopic([
      { text: 'machine learning basics', domain: 'learning' },
      { text: 'machine learning advanced topics', domain: 'learning' },
      { text: 'quantum computing principles', domain: 'work' },
    ]);
    expect(result.length).toBeGreaterThanOrEqual(2);
  });

  it('sorts results by queryCount descending', () => {
    const result = groupQueriesByTopic([
      { text: 'react hooks tutorial', domain: 'learning' },
      { text: 'react hooks examples', domain: 'learning' },
      { text: 'react hooks patterns', domain: 'learning' },
      { text: 'python basics', domain: 'learning' },
    ]);
    if (result.length >= 2) {
      expect(result[0].queryCount).toBeGreaterThanOrEqual(result[1].queryCount);
    }
  });

  it('each result has topic, domain, and queryCount', () => {
    const result = groupQueriesByTopic([
      { text: 'typescript generics', domain: 'work' },
    ]);
    expect(result[0]).toHaveProperty('topic');
    expect(result[0]).toHaveProperty('domain');
    expect(result[0]).toHaveProperty('queryCount');
  });

  it('filters out stop words from topic keywords', () => {
    const result = groupQueriesByTopic([
      { text: 'the best way to learn programming', domain: 'learning' },
    ]);
    // Topic should not be just stop words
    expect(result[0].topic).not.toBe('');
    expect(result[0].topic.toLowerCase()).not.toMatch(/^(the|a|to|is|in|of|and|for)$/);
  });

  it('handles queries with identical text', () => {
    const result = groupQueriesByTopic([
      { text: 'kubernetes deployment', domain: 'work' },
      { text: 'kubernetes deployment', domain: 'work' },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].queryCount).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// detectGaps
// ---------------------------------------------------------------------------

describe('detectGaps', () => {
  it('returns knowledge gaps from query history', async () => {
    // Mock query history
    mockQueryContext
      .mockResolvedValueOnce({
        rows: [
          { query_text: 'machine learning basics', domain: 'learning', confidence: 0.4, rag_score: 0.3 },
          { query_text: 'machine learning advanced', domain: 'learning', confidence: 0.3, rag_score: 0.2 },
          { query_text: 'react optimization', domain: 'work', confidence: 0.8, rag_score: 0.9 },
        ],
      } as any)
      // Mock fact counts
      .mockResolvedValueOnce({
        rows: [
          { domain: 'learning', fact_count: 2 },
          { domain: 'work', fact_count: 15 },
        ],
      } as any);

    const gaps = await detectGaps('personal');
    expect(Array.isArray(gaps)).toBe(true);
    expect(gaps.length).toBeLessThanOrEqual(5);
  });

  it('returns empty array when no query history exists', async () => {
    mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

    const gaps = await detectGaps('personal');
    expect(gaps).toEqual([]);
  });

  it('returns gaps sorted by gapScore descending', async () => {
    mockQueryContext
      .mockResolvedValueOnce({
        rows: [
          { query_text: 'unknown topic A', domain: 'learning', confidence: 0.1, rag_score: 0.1 },
          { query_text: 'unknown topic A again', domain: 'learning', confidence: 0.1, rag_score: 0.1 },
          { query_text: 'well known topic B', domain: 'work', confidence: 0.9, rag_score: 0.9 },
        ],
      } as any)
      .mockResolvedValueOnce({
        rows: [
          { domain: 'learning', fact_count: 0 },
          { domain: 'work', fact_count: 50 },
        ],
      } as any);

    const gaps = await detectGaps('personal');
    if (gaps.length >= 2) {
      expect(gaps[0].gapScore).toBeGreaterThanOrEqual(gaps[1].gapScore);
    }
  });

  it('limits results to top 5', async () => {
    const manyQueries = Array.from({ length: 20 }, (_, i) => ({
      query_text: `topic ${i} unique keywords ${i}`,
      domain: 'learning',
      confidence: 0.3,
      rag_score: 0.2,
    }));
    mockQueryContext
      .mockResolvedValueOnce({ rows: manyQueries } as any)
      .mockResolvedValueOnce({ rows: [] } as any);

    const gaps = await detectGaps('personal');
    expect(gaps.length).toBeLessThanOrEqual(5);
  });

  it('handles DB errors gracefully and returns empty array', async () => {
    mockQueryContext.mockRejectedValueOnce(new Error('DB connection failed'));

    const gaps = await detectGaps('personal');
    expect(gaps).toEqual([]);
  });

  it('passes userId when provided', async () => {
    mockQueryContext
      .mockResolvedValueOnce({ rows: [] } as any);

    await detectGaps('personal', 'user-123');
    expect(mockQueryContext).toHaveBeenCalled();
  });

  it('each gap has the required KnowledgeGap fields', async () => {
    mockQueryContext
      .mockResolvedValueOnce({
        rows: [
          { query_text: 'AI safety research', domain: 'learning', confidence: 0.3, rag_score: 0.2 },
        ],
      } as any)
      .mockResolvedValueOnce({
        rows: [{ domain: 'learning', fact_count: 1 }],
      } as any);

    const gaps = await detectGaps('personal');
    if (gaps.length > 0) {
      const gap: KnowledgeGap = gaps[0];
      expect(gap).toHaveProperty('topic');
      expect(gap).toHaveProperty('domain');
      expect(gap).toHaveProperty('queryCount');
      expect(gap).toHaveProperty('factCount');
      expect(gap).toHaveProperty('avgConfidence');
      expect(gap).toHaveProperty('avgRAGScore');
      expect(gap).toHaveProperty('gapScore');
      expect(gap).toHaveProperty('suggestedAction');
    }
  });
});
