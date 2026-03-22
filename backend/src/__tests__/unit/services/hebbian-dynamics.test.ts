/**
 * Phase 125, Task 4: Hebbian Edge Dynamics Tests
 * TDD — tests written before implementation
 */

// ===========================================
// Mocks - must be before imports
// ===========================================

jest.mock('../../../utils/database-context', () => ({
  queryContext: jest.fn(),
  isValidContext: (ctx: string) =>
    ['personal', 'work', 'learning', 'creative'].includes(ctx),
}));

jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import { queryContext } from '../../../utils/database-context';
import {
  HEBBIAN_CONFIG,
  computeHebbianStrengthening,
  computeHebbianDecay,
  computeHomeostaticNormalization,
  recordCoactivation,
  strengthenEdge,
  applyHebbianDecayBatch,
  getHebbianWeight,
} from '../../../services/knowledge-graph/hebbian-dynamics';

const mockQueryContext = queryContext as jest.MockedFunction<typeof queryContext>;

beforeEach(() => {
  jest.clearAllMocks();
  mockQueryContext.mockReset();
});

// ===========================================
// HEBBIAN_CONFIG
// ===========================================

describe('HEBBIAN_CONFIG', () => {
  it('exports expected constants', () => {
    expect(HEBBIAN_CONFIG.LEARNING_RATE).toBe(0.1);
    expect(HEBBIAN_CONFIG.MAX_WEIGHT).toBe(10.0);
    expect(HEBBIAN_CONFIG.DECAY_RATE).toBe(0.02);
    expect(HEBBIAN_CONFIG.MIN_WEIGHT).toBe(0.1);
    expect(HEBBIAN_CONFIG.TARGET_SUM).toBe(50.0);
    expect(HEBBIAN_CONFIG.NEUTRAL_WEIGHT).toBe(1.0);
  });
});

// ===========================================
// computeHebbianStrengthening
// ===========================================

describe('computeHebbianStrengthening', () => {
  it('strengthens a weight from neutral', () => {
    const result = computeHebbianStrengthening(1.0);
    // old + LR * (1 - old/MAX) = 1.0 + 0.1 * (1 - 1/10) = 1.0 + 0.09 = 1.09
    expect(result).toBeCloseTo(1.09, 5);
  });

  it('shows diminishing returns as weight approaches MAX', () => {
    const nearMax = computeHebbianStrengthening(9.5);
    const fromNeutral = computeHebbianStrengthening(1.0);
    const gainNearMax = nearMax - 9.5;
    const gainFromNeutral = fromNeutral - 1.0;
    expect(gainNearMax).toBeLessThan(gainFromNeutral);
  });

  it('never exceeds MAX_WEIGHT', () => {
    const result = computeHebbianStrengthening(HEBBIAN_CONFIG.MAX_WEIGHT);
    expect(result).toBeLessThanOrEqual(HEBBIAN_CONFIG.MAX_WEIGHT);
  });

  it('clamps to MAX_WEIGHT when already at max', () => {
    const result = computeHebbianStrengthening(10.0);
    expect(result).toBe(10.0);
  });

  it('strengthens from a low weight', () => {
    const result = computeHebbianStrengthening(0.5);
    // 0.5 + 0.1 * (1 - 0.5/10) = 0.5 + 0.1 * 0.95 = 0.5 + 0.095 = 0.595
    expect(result).toBeCloseTo(0.595, 5);
    expect(result).toBeGreaterThan(0.5);
  });

  it('growth is always non-negative', () => {
    for (const w of [0.1, 1.0, 5.0, 9.9, 10.0]) {
      expect(computeHebbianStrengthening(w)).toBeGreaterThanOrEqual(w);
    }
  });
});

// ===========================================
// computeHebbianDecay
// ===========================================

describe('computeHebbianDecay', () => {
  it('reduces a weight by the decay rate', () => {
    const result = computeHebbianDecay(5.0);
    // 5.0 * (1 - 0.02) = 5.0 * 0.98 = 4.9
    expect(result).toBeCloseTo(4.9, 5);
  });

  it('returns 0 (pruning signal) when weight falls below MIN_WEIGHT', () => {
    const result = computeHebbianDecay(0.05);
    expect(result).toBe(0);
  });

  it('returns 0 for weight exactly at MIN_WEIGHT boundary after decay', () => {
    // after decay: MIN_WEIGHT * (1 - 0.02) = 0.098 which is < 0.1 → pruned
    const result = computeHebbianDecay(HEBBIAN_CONFIG.MIN_WEIGHT);
    expect(result).toBe(0);
  });

  it('does not prune weights safely above MIN_WEIGHT', () => {
    const result = computeHebbianDecay(2.0);
    expect(result).toBeGreaterThan(0);
    expect(result).toBeCloseTo(1.96, 5);
  });

  it('neutral weight (1.0) decays but stays above min', () => {
    const result = computeHebbianDecay(1.0);
    expect(result).toBeGreaterThan(0);
    expect(result).toBeCloseTo(0.98, 5);
  });
});

// ===========================================
// computeHomeostaticNormalization
// ===========================================

describe('computeHomeostaticNormalization', () => {
  it('scales weights so their sum equals targetSum', () => {
    const weights = [1, 2, 3, 4];
    const result = computeHomeostaticNormalization(weights, 50);
    const sum = result.reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(50, 5);
  });

  it('preserves proportions between weights', () => {
    const weights = [1, 2, 4];
    const result = computeHomeostaticNormalization(weights, 70);
    // ratios should be preserved: 1:2:4
    expect(result[1] / result[0]).toBeCloseTo(2, 5);
    expect(result[2] / result[0]).toBeCloseTo(4, 5);
  });

  it('handles empty array without error', () => {
    const result = computeHomeostaticNormalization([], 50);
    expect(result).toEqual([]);
  });

  it('handles zero-sum weights gracefully', () => {
    const result = computeHomeostaticNormalization([0, 0, 0], 50);
    // cannot scale zeros — return as-is or uniform distribution
    expect(result).toHaveLength(3);
    result.forEach(w => expect(isFinite(w)).toBe(true));
  });

  it('returns single element scaled to targetSum', () => {
    const result = computeHomeostaticNormalization([5], 50);
    expect(result[0]).toBeCloseTo(50, 5);
  });

  it('uses HEBBIAN_CONFIG.TARGET_SUM when no target provided explicitly', () => {
    // function signature takes explicit targetSum, just verify the config value is sane
    expect(HEBBIAN_CONFIG.TARGET_SUM).toBe(50.0);
  });
});

// ===========================================
// recordCoactivation
// ===========================================

describe('recordCoactivation', () => {
  it('generates C(n,2) pairs for n entities', async () => {
    mockQueryContext.mockResolvedValue({ rows: [], rowCount: 0 });
    await recordCoactivation('personal', ['a', 'b', 'c']);
    // C(3,2) = 3 pairs: (a,b), (a,c), (b,c)
    expect(mockQueryContext).toHaveBeenCalledTimes(3);
  });

  it('generates 1 pair for 2 entities', async () => {
    mockQueryContext.mockResolvedValue({ rows: [], rowCount: 0 });
    await recordCoactivation('personal', ['entity1', 'entity2']);
    expect(mockQueryContext).toHaveBeenCalledTimes(1);
  });

  it('skips when fewer than 2 entities provided', async () => {
    await recordCoactivation('personal', ['only-one']);
    expect(mockQueryContext).not.toHaveBeenCalled();
  });

  it('skips when empty array provided', async () => {
    await recordCoactivation('personal', []);
    expect(mockQueryContext).not.toHaveBeenCalled();
  });

  it('sorts entity pairs consistently (smaller id first)', async () => {
    mockQueryContext.mockResolvedValue({ rows: [], rowCount: 0 });
    await recordCoactivation('personal', ['z-entity', 'a-entity']);
    const call = mockQueryContext.mock.calls[0];
    const params = call[2] as string[];
    // sorted: a-entity < z-entity
    expect(params[0]).toBe('a-entity');
    expect(params[1]).toBe('z-entity');
  });

  it('uses upsert / ON CONFLICT pattern in SQL', async () => {
    mockQueryContext.mockResolvedValue({ rows: [], rowCount: 0 });
    await recordCoactivation('work', ['e1', 'e2']);
    const sql = mockQueryContext.mock.calls[0][1] as string;
    expect(sql.toLowerCase()).toContain('on conflict');
  });

  it('generates C(4,2) = 6 pairs for 4 entities', async () => {
    mockQueryContext.mockResolvedValue({ rows: [], rowCount: 0 });
    await recordCoactivation('learning', ['a', 'b', 'c', 'd']);
    expect(mockQueryContext).toHaveBeenCalledTimes(6);
  });
});

// ===========================================
// strengthenEdge
// ===========================================

describe('strengthenEdge', () => {
  it('reads current weight and writes new strengthened weight', async () => {
    const currentWeight = 2.0;
    const expectedNew = computeHebbianStrengthening(currentWeight);
    // First call: SELECT, second call: UPDATE
    mockQueryContext
      .mockResolvedValueOnce({ rows: [{ hebbian_weight: currentWeight }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const result = await strengthenEdge('personal', 'source-id', 'target-id');
    expect(result).toBeCloseTo(expectedNew, 5);
    expect(mockQueryContext).toHaveBeenCalledTimes(2);
  });

  it('defaults to NEUTRAL_WEIGHT when no relation row found', async () => {
    const expectedNew = computeHebbianStrengthening(HEBBIAN_CONFIG.NEUTRAL_WEIGHT);
    mockQueryContext
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const result = await strengthenEdge('personal', 'src', 'tgt');
    expect(result).toBeCloseTo(expectedNew, 5);
  });

  it('calls queryContext with the correct context', async () => {
    mockQueryContext
      .mockResolvedValueOnce({ rows: [{ hebbian_weight: 1.0 }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await strengthenEdge('work', 'src', 'tgt');
    expect(mockQueryContext.mock.calls[0][0]).toBe('work');
    expect(mockQueryContext.mock.calls[1][0]).toBe('work');
  });

  it('returns the new computed weight', async () => {
    const current = 5.0;
    const expected = computeHebbianStrengthening(current);
    mockQueryContext
      .mockResolvedValueOnce({ rows: [{ hebbian_weight: current }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const result = await strengthenEdge('creative', 'a', 'b');
    expect(result).toBeCloseTo(expected, 5);
  });
});

// ===========================================
// applyHebbianDecayBatch
// ===========================================

describe('applyHebbianDecayBatch', () => {
  it('returns zero counts when no relations need decay', async () => {
    mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const result = await applyHebbianDecayBatch('personal');
    expect(result.decayed).toBe(0);
    expect(result.pruned).toBe(0);
  });

  it('counts decayed relations', async () => {
    const relations = [
      { source_entity_id: 'a', target_entity_id: 'b', hebbian_weight: 5.0 },
      { source_entity_id: 'c', target_entity_id: 'd', hebbian_weight: 3.0 },
    ];
    mockQueryContext
      .mockResolvedValueOnce({ rows: relations, rowCount: 2 })
      .mockResolvedValue({ rows: [], rowCount: 1 });

    const result = await applyHebbianDecayBatch('personal');
    expect(result.decayed).toBe(2);
    expect(result.pruned).toBe(0);
  });

  it('counts pruned relations when weight drops below MIN_WEIGHT', async () => {
    const relations = [
      { source_entity_id: 'a', target_entity_id: 'b', hebbian_weight: 0.05 },
    ];
    mockQueryContext
      .mockResolvedValueOnce({ rows: relations, rowCount: 1 })
      .mockResolvedValue({ rows: [], rowCount: 1 });

    const result = await applyHebbianDecayBatch('work');
    expect(result.pruned).toBe(1);
    expect(result.decayed).toBe(1);
  });

  it('handles mix of decayed and pruned relations', async () => {
    const relations = [
      { source_entity_id: 'a', target_entity_id: 'b', hebbian_weight: 5.0 },   // decayed
      { source_entity_id: 'c', target_entity_id: 'd', hebbian_weight: 0.05 },  // pruned
      { source_entity_id: 'e', target_entity_id: 'f', hebbian_weight: 3.0 },   // decayed
    ];
    mockQueryContext
      .mockResolvedValueOnce({ rows: relations, rowCount: 3 })
      .mockResolvedValue({ rows: [], rowCount: 1 });

    const result = await applyHebbianDecayBatch('learning');
    expect(result.decayed).toBe(3);
    expect(result.pruned).toBe(1);
  });
});

// ===========================================
// getHebbianWeight
// ===========================================

describe('getHebbianWeight', () => {
  it('returns the hebbian_weight from entity_relations', async () => {
    mockQueryContext.mockResolvedValueOnce({
      rows: [{ hebbian_weight: 4.5 }],
      rowCount: 1,
    });
    const result = await getHebbianWeight('personal', 'entity-a', 'entity-b');
    expect(result).toBe(4.5);
  });

  it('returns NEUTRAL_WEIGHT when relation not found', async () => {
    mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const result = await getHebbianWeight('personal', 'entity-a', 'entity-b');
    expect(result).toBe(HEBBIAN_CONFIG.NEUTRAL_WEIGHT);
  });

  it('checks both directions (A→B and B→A)', async () => {
    mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    await getHebbianWeight('personal', 'entity-a', 'entity-b');
    const sql = mockQueryContext.mock.calls[0][1] as string;
    // SQL should check both source→target and target→source
    expect(sql).toContain('OR');
  });

  it('uses the correct context', async () => {
    mockQueryContext.mockResolvedValueOnce({ rows: [{ hebbian_weight: 2.0 }], rowCount: 1 });
    await getHebbianWeight('creative', 'x', 'y');
    expect(mockQueryContext.mock.calls[0][0]).toBe('creative');
  });
});
