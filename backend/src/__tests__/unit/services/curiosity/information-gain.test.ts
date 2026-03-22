/**
 * Tests for Phase 133: Artificial Curiosity Engine — Information Gain
 *
 * TDD: Tests written before implementation.
 * Covers cosineSimilarity, computeSurpriseScore, computeNoveltyScore,
 * computeInformationGain, FamiliarityBuffer, and recordInformationGain.
 */

jest.mock('../../../../utils/logger', () => ({
  logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('../../../../utils/database-context', () => ({
  queryContext: jest.fn(),
}));

import {
  cosineSimilarity,
  computeSurpriseScore,
  computeNoveltyScore,
  computeInformationGain,
  FamiliarityBuffer,
  recordInformationGain,
} from '../../../../services/curiosity/information-gain';
import { queryContext } from '../../../../utils/database-context';

const mockQueryContext = queryContext as jest.MockedFunction<typeof queryContext>;

beforeEach(() => {
  jest.clearAllMocks();
  mockQueryContext.mockReset();
});

// ---------------------------------------------------------------------------
// cosineSimilarity
// ---------------------------------------------------------------------------

describe('cosineSimilarity', () => {
  it('returns 1.0 for two identical vectors', () => {
    const v = [1, 2, 3];
    expect(cosineSimilarity(v, v)).toBeCloseTo(1.0, 5);
  });

  it('returns 0.0 for orthogonal vectors', () => {
    const a = [1, 0];
    const b = [0, 1];
    expect(cosineSimilarity(a, b)).toBeCloseTo(0.0, 5);
  });

  it('returns negative value for negatively correlated vectors', () => {
    const a = [1, 0];
    const b = [-1, 0];
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1.0, 5);
  });

  it('returns 0 for vectors of different lengths', () => {
    const a = [1, 2, 3];
    const b = [1, 2];
    expect(cosineSimilarity(a, b)).toBe(0);
  });

  it('returns 0 for zero vector a', () => {
    const a = [0, 0, 0];
    const b = [1, 2, 3];
    expect(cosineSimilarity(a, b)).toBe(0);
  });

  it('returns 0 for zero vector b', () => {
    const a = [1, 2, 3];
    const b = [0, 0, 0];
    expect(cosineSimilarity(a, b)).toBe(0);
  });

  it('returns 0 for both zero vectors', () => {
    expect(cosineSimilarity([0, 0], [0, 0])).toBe(0);
  });

  it('handles single-dimension vectors', () => {
    expect(cosineSimilarity([5], [3])).toBeCloseTo(1.0, 5);
  });

  it('handles empty vectors', () => {
    expect(cosineSimilarity([], [])).toBe(0);
  });

  it('computes correctly for known vectors', () => {
    // [1,0,1] . [0,1,1] = 1, |a|=sqrt(2), |b|=sqrt(2), cos=1/2=0.5
    expect(cosineSimilarity([1, 0, 1], [0, 1, 1])).toBeCloseTo(0.5, 5);
  });
});

// ---------------------------------------------------------------------------
// computeSurpriseScore
// ---------------------------------------------------------------------------

describe('computeSurpriseScore', () => {
  it('returns high surprise for low similarity', () => {
    const query = [1, 0, 0];
    const retrieved = [[0, 1, 0], [0, 0, 1]]; // orthogonal
    const score = computeSurpriseScore(query, retrieved);
    expect(score).toBeCloseTo(1.0, 1);
  });

  it('returns low surprise for high similarity', () => {
    const query = [1, 1, 0];
    const retrieved = [[1, 1, 0], [1, 1, 0.1]]; // very similar
    const score = computeSurpriseScore(query, retrieved);
    expect(score).toBeLessThan(0.2);
  });

  it('returns 1.0 (max surprise) for empty retrieved embeddings', () => {
    const query = [1, 0, 0];
    const score = computeSurpriseScore(query, []);
    expect(score).toBe(1.0);
  });

  it('returns value between 0 and 1', () => {
    const query = [1, 0.5, 0.3];
    const retrieved = [[0.8, 0.4, 0.2], [0.1, 0.9, 0.1]];
    const score = computeSurpriseScore(query, retrieved);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it('handles single retrieved embedding', () => {
    const query = [1, 0];
    const retrieved = [[1, 0]];
    const score = computeSurpriseScore(query, retrieved);
    expect(score).toBeCloseTo(0.0, 1);
  });

  it('clamps result to 0-1 range', () => {
    const query = [1, 0, 0];
    const retrieved = [[-1, 0, 0]]; // negative similarity -> 1 - (-1) = 2, should clamp to 1
    const score = computeSurpriseScore(query, retrieved);
    expect(score).toBeLessThanOrEqual(1);
    expect(score).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// computeNoveltyScore
// ---------------------------------------------------------------------------

describe('computeNoveltyScore', () => {
  it('returns 1.0 when all items are new', () => {
    const retrieved = ['a', 'b', 'c'];
    const familiar = new Set<string>();
    expect(computeNoveltyScore(retrieved, familiar)).toBe(1.0);
  });

  it('returns 0.0 when all items are familiar', () => {
    const retrieved = ['a', 'b', 'c'];
    const familiar = new Set(['a', 'b', 'c']);
    expect(computeNoveltyScore(retrieved, familiar)).toBe(0.0);
  });

  it('returns 0.5 when half are new', () => {
    const retrieved = ['a', 'b'];
    const familiar = new Set(['a']);
    expect(computeNoveltyScore(retrieved, familiar)).toBeCloseTo(0.5, 5);
  });

  it('returns 0 for empty retrieved list', () => {
    const familiar = new Set(['x']);
    expect(computeNoveltyScore([], familiar)).toBe(0);
  });

  it('returns 1.0 for empty familiarity set', () => {
    const retrieved = ['a', 'b'];
    const familiar = new Set<string>();
    expect(computeNoveltyScore(retrieved, familiar)).toBe(1.0);
  });

  it('handles single item that is new', () => {
    expect(computeNoveltyScore(['x'], new Set<string>())).toBe(1.0);
  });

  it('handles single item that is familiar', () => {
    expect(computeNoveltyScore(['x'], new Set(['x']))).toBe(0.0);
  });
});

// ---------------------------------------------------------------------------
// computeInformationGain
// ---------------------------------------------------------------------------

describe('computeInformationGain', () => {
  it('returns high gain when both surprise and novelty are high', () => {
    const gain = computeInformationGain(0.9, 0.9);
    expect(gain).toBeCloseTo(0.81, 1);
  });

  it('returns 0 when surprise is 0', () => {
    expect(computeInformationGain(0, 0.9)).toBe(0);
  });

  it('returns 0 when novelty is 0', () => {
    expect(computeInformationGain(0.9, 0)).toBe(0);
  });

  it('returns 0 when both are 0', () => {
    expect(computeInformationGain(0, 0)).toBe(0);
  });

  it('returns 1 when both are 1', () => {
    expect(computeInformationGain(1, 1)).toBe(1);
  });

  it('clamps result to 0-1 range', () => {
    const gain = computeInformationGain(1.5, 1.5);
    expect(gain).toBeLessThanOrEqual(1);
    expect(gain).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// FamiliarityBuffer
// ---------------------------------------------------------------------------

describe('FamiliarityBuffer', () => {
  it('creates a buffer with given maxSize', () => {
    const buf = new FamiliarityBuffer(10);
    expect(buf.size).toBe(0);
  });

  it('adds items and tracks them', () => {
    const buf = new FamiliarityBuffer(10);
    buf.add('item-1');
    expect(buf.has('item-1')).toBe(true);
    expect(buf.size).toBe(1);
  });

  it('returns false for unknown items', () => {
    const buf = new FamiliarityBuffer(10);
    expect(buf.has('unknown')).toBe(false);
  });

  it('evicts oldest item when full (FIFO)', () => {
    const buf = new FamiliarityBuffer(3);
    buf.add('a');
    buf.add('b');
    buf.add('c');
    expect(buf.size).toBe(3);

    buf.add('d');
    expect(buf.size).toBe(3);
    expect(buf.has('a')).toBe(false); // evicted
    expect(buf.has('d')).toBe(true);
  });

  it('does not duplicate items already in buffer', () => {
    const buf = new FamiliarityBuffer(5);
    buf.add('x');
    buf.add('x');
    expect(buf.size).toBe(1);
  });

  it('handles maxSize of 1', () => {
    const buf = new FamiliarityBuffer(1);
    buf.add('first');
    expect(buf.has('first')).toBe(true);
    buf.add('second');
    expect(buf.has('first')).toBe(false);
    expect(buf.has('second')).toBe(true);
  });

  it('handles maxSize of 0 gracefully', () => {
    const buf = new FamiliarityBuffer(0);
    buf.add('anything');
    expect(buf.size).toBe(0);
    expect(buf.has('anything')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// recordInformationGain
// ---------------------------------------------------------------------------

describe('recordInformationGain', () => {
  it('writes information gain record to database', async () => {
    mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

    await recordInformationGain('personal', {
      queryText: 'what is quantum computing',
      surprise: 0.8,
      novelty: 0.6,
      informationGain: 0.48,
    });

    expect(mockQueryContext).toHaveBeenCalledTimes(1);
    expect(mockQueryContext).toHaveBeenCalledWith(
      'personal',
      expect.stringContaining('INSERT'),
      expect.arrayContaining([0.8, 0.6, 0.48]),
    );
  });

  it('does not throw on DB error (fire-and-forget)', async () => {
    mockQueryContext.mockRejectedValueOnce(new Error('DB write failed'));

    await expect(
      recordInformationGain('personal', {
        queryText: 'test',
        surprise: 0.5,
        novelty: 0.5,
        informationGain: 0.25,
      }),
    ).resolves.toBeUndefined();
  });
});
