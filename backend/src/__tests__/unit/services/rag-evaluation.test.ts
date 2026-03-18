/**
 * Phase 101 B1: RAG Evaluation Metrics Tests
 *
 * Tests for Precision@k, MRR, NDCG, and DB recording functions.
 */

import {
  calculatePrecisionAtK,
  calculateMRR,
  calculateNDCG,
  recordRAGEvaluation,
  getRAGEvaluationStats,
} from '../../../services/rag-evaluation';

// Mock database
jest.mock('../../../utils/database-context', () => ({
  queryContext: jest.fn(),
  isValidContext: jest.fn().mockReturnValue(true),
}));

import { queryContext } from '../../../utils/database-context';
const mockQueryContext = queryContext as jest.MockedFunction<typeof queryContext>;

describe('calculatePrecisionAtK', () => {
  it('returns 1.0 when all top-k docs are relevant', () => {
    const scores = [0.9, 0.8, 0.7, 0.4, 0.3];
    expect(calculatePrecisionAtK(scores, 3, 0.6)).toBeCloseTo(1.0);
  });

  it('returns 0.0 when no top-k docs are relevant', () => {
    const scores = [0.4, 0.3, 0.2];
    expect(calculatePrecisionAtK(scores, 3, 0.6)).toBeCloseTo(0.0);
  });

  it('returns correct fraction for partial relevance', () => {
    const scores = [0.9, 0.4, 0.8];
    // 2 out of 3 are above threshold 0.6
    expect(calculatePrecisionAtK(scores, 3, 0.6)).toBeCloseTo(2 / 3);
  });

  it('returns 0.0 for empty scores array', () => {
    expect(calculatePrecisionAtK([], 5, 0.6)).toBe(0.0);
  });

  it('handles k larger than scores length by using all scores', () => {
    const scores = [0.9, 0.8];
    // Both scores above threshold 0.6 → 2/2 = 1.0
    expect(calculatePrecisionAtK(scores, 10, 0.6)).toBeCloseTo(1.0);
  });

  it('uses threshold boundary correctly (score equal to threshold is relevant)', () => {
    const scores = [0.6, 0.5];
    expect(calculatePrecisionAtK(scores, 2, 0.6)).toBeCloseTo(0.5);
  });
});

describe('calculateMRR', () => {
  it('returns 1.0 when first doc is relevant', () => {
    const scores = [0.9, 0.4, 0.3];
    expect(calculateMRR(scores, 0.6)).toBeCloseTo(1.0);
  });

  it('returns 0.5 when second doc is first relevant', () => {
    const scores = [0.4, 0.8, 0.3];
    expect(calculateMRR(scores, 0.6)).toBeCloseTo(0.5);
  });

  it('returns 1/3 when third doc is first relevant', () => {
    const scores = [0.3, 0.4, 0.9];
    expect(calculateMRR(scores, 0.6)).toBeCloseTo(1 / 3);
  });

  it('returns 0.0 when no docs are relevant', () => {
    const scores = [0.3, 0.4, 0.2];
    expect(calculateMRR(scores, 0.6)).toBe(0.0);
  });

  it('returns 0.0 for empty scores array', () => {
    expect(calculateMRR([], 0.6)).toBe(0.0);
  });
});

describe('calculateNDCG', () => {
  it('returns 1.0 for perfect ranking (all relevant, best first)', () => {
    // All above threshold, perfect DCG = IDCG
    const scores = [0.9, 0.8, 0.7];
    // DCG = 1/log2(2) + 1/log2(3) + 1/log2(4) = IDCG since sorted
    expect(calculateNDCG(scores, 0.6)).toBeCloseTo(1.0);
  });

  it('returns 0.0 when no docs are relevant', () => {
    const scores = [0.2, 0.3, 0.4];
    expect(calculateNDCG(scores, 0.6)).toBe(0.0);
  });

  it('returns 0.0 for empty scores array', () => {
    expect(calculateNDCG([], 0.6)).toBe(0.0);
  });

  it('returns lower value when relevant docs appear later', () => {
    const goodOrder = [0.9, 0.3, 0.2];
    const badOrder = [0.2, 0.3, 0.9];
    const goodNDCG = calculateNDCG(goodOrder, 0.6);
    const badNDCG = calculateNDCG(badOrder, 0.6);
    expect(goodNDCG).toBeGreaterThan(badNDCG);
  });

  it('returns a value between 0 and 1', () => {
    const scores = [0.8, 0.3, 0.7, 0.2, 0.9];
    const ndcg = calculateNDCG(scores, 0.6);
    expect(ndcg).toBeGreaterThanOrEqual(0.0);
    expect(ndcg).toBeLessThanOrEqual(1.0);
  });
});

describe('recordRAGEvaluation', () => {
  beforeEach(() => {
    mockQueryContext.mockReset();
  });

  it('stores evaluation record to DB', async () => {
    mockQueryContext.mockResolvedValueOnce({ rows: [{ id: 'eval-123' }] } as never);

    const record = {
      queryText: 'What is machine learning?',
      precisionAtK: 0.8,
      mrr: 1.0,
      ndcg: 0.9,
      k: 5,
      threshold: 0.6,
      strategyUsed: 'hyde',
      resultCount: 5,
    };

    const id = await recordRAGEvaluation('personal', record);
    expect(id).toBe('eval-123');
    expect(mockQueryContext).toHaveBeenCalledWith(
      'personal',
      expect.stringContaining('INSERT INTO rag_evaluation_metrics'),
      expect.any(Array)
    );
  });

  it('handles DB errors gracefully', async () => {
    mockQueryContext.mockRejectedValueOnce(new Error('DB error'));

    const record = {
      queryText: 'test query',
      precisionAtK: 0.5,
      mrr: 0.5,
      ndcg: 0.5,
      k: 5,
      threshold: 0.6,
    };

    // Should not throw, returns empty string on error
    const id = await recordRAGEvaluation('personal', record);
    expect(typeof id).toBe('string');
  });
});

describe('getRAGEvaluationStats', () => {
  beforeEach(() => {
    mockQueryContext.mockReset();
  });

  it('returns aggregated stats from DB', async () => {
    mockQueryContext.mockResolvedValueOnce({
      rows: [
        {
          strategy_used: 'hyde',
          total_evaluations: '10',
          avg_precision: '0.75',
          avg_mrr: '0.80',
          avg_ndcg: '0.70',
        },
      ],
    } as never);

    const stats = await getRAGEvaluationStats('personal', 30);
    expect(stats).toHaveLength(1);
    expect(stats[0]).toMatchObject({
      strategyUsed: 'hyde',
      totalEvaluations: 10,
      avgPrecision: 0.75,
      avgMRR: 0.80,
      avgNDCG: 0.70,
    });
  });

  it('returns empty array when no data', async () => {
    mockQueryContext.mockResolvedValueOnce({ rows: [] } as never);

    const stats = await getRAGEvaluationStats('work', 7);
    expect(stats).toEqual([]);
  });

  it('handles DB error gracefully', async () => {
    mockQueryContext.mockRejectedValueOnce(new Error('DB error'));

    const stats = await getRAGEvaluationStats('personal', 30);
    expect(stats).toEqual([]);
  });
});
