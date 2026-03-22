/**
 * Tests for Phase 135: Metacognitive State Vector
 *
 * TDD: Tests written before implementation.
 * Covers computeCoherence, computeKnowledgeCoverage, detectConfusion,
 * buildMetacognitiveState, recordEvaluation, getRecentStates.
 */

jest.mock('../../../../utils/logger', () => ({
  logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('../../../../utils/database-context', () => ({
  queryContext: jest.fn(),
}));

import {
  computeCoherence,
  computeKnowledgeCoverage,
  detectConfusion,
  buildMetacognitiveState,
  recordEvaluation,
  getRecentStates,
} from '../../../../services/metacognition/state-vector';
import type { MetacognitiveState, ConfusionLevel } from '../../../../services/metacognition/state-vector';
import { queryContext } from '../../../../utils/database-context';
import { logger } from '../../../../utils/logger';

const mockQueryContext = queryContext as jest.MockedFunction<typeof queryContext>;

beforeEach(() => {
  jest.clearAllMocks();
  mockQueryContext.mockReset();
});

// ---------------------------------------------------------------------------
// computeCoherence
// ---------------------------------------------------------------------------

describe('computeCoherence', () => {
  it('returns 1 for identical unit vectors', () => {
    const v = [1, 0, 0];
    const result = computeCoherence(v, [v], v);
    expect(result).toBeCloseTo(1.0, 5);
  });

  it('returns 0 for orthogonal vectors', () => {
    const q = [1, 0, 0];
    const c = [[0, 1, 0]];
    const r = [0, 0, 1];
    const result = computeCoherence(q, c, r);
    expect(result).toBeCloseTo(0.0, 5);
  });

  it('returns 0 for empty queryEmbedding', () => {
    const result = computeCoherence([], [[1, 0]], [1, 0]);
    expect(result).toBe(0);
  });

  it('returns 0 for empty contextEmbeddings array', () => {
    const result = computeCoherence([1, 0], [], [1, 0]);
    expect(result).toBe(0);
  });

  it('returns 0 for empty responseEmbedding', () => {
    const result = computeCoherence([1, 0], [[1, 0]], []);
    expect(result).toBe(0);
  });

  it('returns value between 0 and 1 for partial similarity', () => {
    const q = [1, 1, 0];
    const c = [[1, 0, 0]];
    const r = [0, 1, 0];
    const result = computeCoherence(q, c, r);
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(1);
  });

  it('averages across multiple context embeddings', () => {
    const q = [1, 0, 0];
    const c = [[1, 0, 0], [0, 1, 0]]; // one identical, one orthogonal to q
    const r = [1, 0, 0];
    const result = computeCoherence(q, c, r);
    // q-r = 1.0, q-c[0] = 1.0, q-c[1] = 0.0, r-c[0] = 1.0, r-c[1] = 0.0
    // avg of all pairs
    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThan(1);
  });

  it('clamps negative cosine similarities to 0', () => {
    const q = [1, 0];
    const c = [[-1, 0]]; // opposite direction
    const r = [1, 0];
    const result = computeCoherence(q, c, r);
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(1);
  });

  it('handles zero-magnitude vectors gracefully', () => {
    const q = [0, 0, 0];
    const c = [[1, 0, 0]];
    const r = [1, 0, 0];
    const result = computeCoherence(q, c, r);
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// computeKnowledgeCoverage
// ---------------------------------------------------------------------------

describe('computeKnowledgeCoverage', () => {
  it('returns 1 when all entities are known', () => {
    const result = computeKnowledgeCoverage(['a', 'b', 'c'], new Set(['a', 'b', 'c', 'd']));
    expect(result).toBeCloseTo(1.0, 5);
  });

  it('returns 0 when no entities are known', () => {
    const result = computeKnowledgeCoverage(['a', 'b'], new Set(['x', 'y']));
    expect(result).toBeCloseTo(0.0, 5);
  });

  it('returns 0.5 when half the entities are known', () => {
    const result = computeKnowledgeCoverage(['a', 'b'], new Set(['a']));
    expect(result).toBeCloseTo(0.5, 5);
  });

  it('returns 0 for empty queryEntities', () => {
    const result = computeKnowledgeCoverage([], new Set(['a', 'b']));
    expect(result).toBe(0);
  });

  it('returns 0 for empty knownEntities set', () => {
    const result = computeKnowledgeCoverage(['a', 'b'], new Set());
    expect(result).toBeCloseTo(0.0, 5);
  });

  it('handles case-sensitive matching', () => {
    const result = computeKnowledgeCoverage(['React', 'typescript'], new Set(['React', 'TypeScript']));
    // Only 'React' matches exactly
    expect(result).toBeCloseTo(0.5, 5);
  });

  it('handles single entity that is known', () => {
    const result = computeKnowledgeCoverage(['x'], new Set(['x']));
    expect(result).toBeCloseTo(1.0, 5);
  });

  it('handles single entity that is unknown', () => {
    const result = computeKnowledgeCoverage(['x'], new Set(['y']));
    expect(result).toBeCloseTo(0.0, 5);
  });
});

// ---------------------------------------------------------------------------
// detectConfusion
// ---------------------------------------------------------------------------

describe('detectConfusion', () => {
  it('returns high when conflictLevel > 2', () => {
    const state: MetacognitiveState = {
      confidence: 0.9,
      coherence: 0.9,
      conflictLevel: 3,
      knowledgeCoverage: 0.9,
      confusionLevel: 'low',
    };
    expect(detectConfusion(state)).toBe('high');
  });

  it('returns high when knowledgeCoverage < 0.3', () => {
    const state: MetacognitiveState = {
      confidence: 0.9,
      coherence: 0.9,
      conflictLevel: 0,
      knowledgeCoverage: 0.2,
      confusionLevel: 'low',
    };
    expect(detectConfusion(state)).toBe('high');
  });

  it('returns medium when confidence < 0.4', () => {
    const state: MetacognitiveState = {
      confidence: 0.3,
      coherence: 0.9,
      conflictLevel: 0,
      knowledgeCoverage: 0.5,
      confusionLevel: 'low',
    };
    expect(detectConfusion(state)).toBe('medium');
  });

  it('returns medium when coherence < 0.5', () => {
    const state: MetacognitiveState = {
      confidence: 0.9,
      coherence: 0.4,
      conflictLevel: 0,
      knowledgeCoverage: 0.5,
      confusionLevel: 'low',
    };
    expect(detectConfusion(state)).toBe('medium');
  });

  it('returns low when all values are good', () => {
    const state: MetacognitiveState = {
      confidence: 0.9,
      coherence: 0.9,
      conflictLevel: 0,
      knowledgeCoverage: 0.9,
      confusionLevel: 'low',
    };
    expect(detectConfusion(state)).toBe('low');
  });

  it('prioritizes high over medium (conflictLevel > 2 and confidence < 0.4)', () => {
    const state: MetacognitiveState = {
      confidence: 0.3,
      coherence: 0.3,
      conflictLevel: 5,
      knowledgeCoverage: 0.1,
      confusionLevel: 'low',
    };
    expect(detectConfusion(state)).toBe('high');
  });

  it('returns high at conflictLevel exactly 2.01', () => {
    const state: MetacognitiveState = {
      confidence: 0.9,
      coherence: 0.9,
      conflictLevel: 2.01,
      knowledgeCoverage: 0.9,
      confusionLevel: 'low',
    };
    expect(detectConfusion(state)).toBe('high');
  });

  it('returns low at conflictLevel exactly 2', () => {
    const state: MetacognitiveState = {
      confidence: 0.9,
      coherence: 0.9,
      conflictLevel: 2,
      knowledgeCoverage: 0.9,
      confusionLevel: 'low',
    };
    expect(detectConfusion(state)).toBe('low');
  });

  it('returns high at knowledgeCoverage exactly 0.29', () => {
    const state: MetacognitiveState = {
      confidence: 0.9,
      coherence: 0.9,
      conflictLevel: 0,
      knowledgeCoverage: 0.29,
      confusionLevel: 'low',
    };
    expect(detectConfusion(state)).toBe('high');
  });

  it('returns low at knowledgeCoverage exactly 0.3', () => {
    const state: MetacognitiveState = {
      confidence: 0.9,
      coherence: 0.9,
      conflictLevel: 0,
      knowledgeCoverage: 0.3,
      confusionLevel: 'low',
    };
    expect(detectConfusion(state)).toBe('low');
  });

  it('returns medium at confidence exactly 0.39', () => {
    const state: MetacognitiveState = {
      confidence: 0.39,
      coherence: 0.9,
      conflictLevel: 0,
      knowledgeCoverage: 0.5,
      confusionLevel: 'low',
    };
    expect(detectConfusion(state)).toBe('medium');
  });

  it('returns low at confidence exactly 0.4', () => {
    const state: MetacognitiveState = {
      confidence: 0.4,
      coherence: 0.9,
      conflictLevel: 0,
      knowledgeCoverage: 0.5,
      confusionLevel: 'low',
    };
    expect(detectConfusion(state)).toBe('low');
  });
});

// ---------------------------------------------------------------------------
// buildMetacognitiveState
// ---------------------------------------------------------------------------

describe('buildMetacognitiveState', () => {
  it('builds state with computed confusionLevel', () => {
    const state = buildMetacognitiveState({
      confidence: 0.9,
      coherence: 0.9,
      conflictLevel: 0,
      knowledgeCoverage: 0.9,
    });
    expect(state.confusionLevel).toBe('low');
    expect(state.confidence).toBe(0.9);
    expect(state.coherence).toBe(0.9);
    expect(state.conflictLevel).toBe(0);
    expect(state.knowledgeCoverage).toBe(0.9);
  });

  it('builds state with high confusion', () => {
    const state = buildMetacognitiveState({
      confidence: 0.1,
      coherence: 0.1,
      conflictLevel: 5,
      knowledgeCoverage: 0.1,
    });
    expect(state.confusionLevel).toBe('high');
  });

  it('builds state with medium confusion', () => {
    const state = buildMetacognitiveState({
      confidence: 0.3,
      coherence: 0.9,
      conflictLevel: 0,
      knowledgeCoverage: 0.5,
    });
    expect(state.confusionLevel).toBe('medium');
  });

  it('returns all required MetacognitiveState fields', () => {
    const state = buildMetacognitiveState({
      confidence: 0.5,
      coherence: 0.5,
      conflictLevel: 1,
      knowledgeCoverage: 0.5,
    });
    expect(state).toHaveProperty('confidence');
    expect(state).toHaveProperty('coherence');
    expect(state).toHaveProperty('conflictLevel');
    expect(state).toHaveProperty('knowledgeCoverage');
    expect(state).toHaveProperty('confusionLevel');
  });
});

// ---------------------------------------------------------------------------
// recordEvaluation
// ---------------------------------------------------------------------------

describe('recordEvaluation', () => {
  it('writes state to database', async () => {
    mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

    const state: MetacognitiveState = {
      confidence: 0.8,
      coherence: 0.7,
      conflictLevel: 1,
      knowledgeCoverage: 0.6,
      confusionLevel: 'low',
    };

    await recordEvaluation('personal', state, 'test query', 'general');

    expect(mockQueryContext).toHaveBeenCalledTimes(1);
    expect(mockQueryContext).toHaveBeenCalledWith(
      'personal',
      expect.stringContaining('INSERT INTO metacognitive_evaluations'),
      expect.arrayContaining([0.8, 0.7, 1, 0.6, 'low', 'test query', 'general']),
    );
  });

  it('does not throw on DB error (fire-and-forget)', async () => {
    mockQueryContext.mockRejectedValueOnce(new Error('DB write failed'));

    const state: MetacognitiveState = {
      confidence: 0.5,
      coherence: 0.5,
      conflictLevel: 0,
      knowledgeCoverage: 0.5,
      confusionLevel: 'low',
    };

    // Should not throw
    await expect(recordEvaluation('personal', state, 'q', 'general')).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// getRecentStates
// ---------------------------------------------------------------------------

describe('getRecentStates', () => {
  it('returns states from database', async () => {
    mockQueryContext.mockResolvedValueOnce({
      rows: [
        { confidence: 0.8, coherence: 0.7, conflict_level: 1, knowledge_coverage: 0.6, confusion_level: 'low' },
        { confidence: 0.3, coherence: 0.4, conflict_level: 3, knowledge_coverage: 0.2, confusion_level: 'high' },
      ],
    } as any);

    const states = await getRecentStates('personal');
    expect(states).toHaveLength(2);
    expect(states[0].confidence).toBe(0.8);
    expect(states[0].confusionLevel).toBe('low');
    expect(states[1].confusionLevel).toBe('high');
  });

  it('returns empty array when no rows', async () => {
    mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

    const states = await getRecentStates('personal');
    expect(states).toEqual([]);
  });

  it('returns empty array on DB error', async () => {
    mockQueryContext.mockRejectedValueOnce(new Error('DB read failed'));

    const states = await getRecentStates('personal');
    expect(states).toEqual([]);
    expect(logger.error).toHaveBeenCalled();
  });

  it('passes limit to query', async () => {
    mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

    await getRecentStates('personal', 5);
    expect(mockQueryContext).toHaveBeenCalledWith(
      'personal',
      expect.stringContaining('LIMIT'),
      [5],
    );
  });

  it('uses default limit of 20 when not specified', async () => {
    mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

    await getRecentStates('personal');
    expect(mockQueryContext).toHaveBeenCalledWith(
      'personal',
      expect.stringContaining('LIMIT'),
      [20],
    );
  });
});
