/**
 * Phase 125, Task 5: Bayesian Confidence Propagation Tests
 *
 * Tests for the confidence propagation service that propagates
 * confidence scores through the knowledge graph via entity relations.
 */

import {
  propagateForRelation,
  propagateBatch,
  PROPAGATION_FACTORS,
} from '../../../services/knowledge-graph/confidence-propagation';

// ============================================================
// Mocks
// ============================================================

const mockQueryContext = jest.fn();
jest.mock('../../../utils/database-context', () => ({
  queryContext: (...args: unknown[]) => mockQueryContext(...args),
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

// ============================================================
// propagateForRelation — pure function tests
// ============================================================

describe('propagateForRelation', () => {
  const BASE = 0.5;
  const SOURCE = 0.8;
  const WEIGHT = 1.0;

  // ---- supports ----

  it('increases confidence for "supports" relation', () => {
    const result = propagateForRelation(BASE, SOURCE, WEIGHT, 'supports');
    expect(result).toBeGreaterThan(BASE);
  });

  it('supports with full weight: uses positive propagation formula', () => {
    // base + factor * weight * source * (1 - base)
    // 0.5 + 1.0 * 1.0 * 0.8 * 0.5 = 0.5 + 0.4 = 0.9
    const result = propagateForRelation(0.5, 0.8, 1.0, 'supports');
    expect(result).toBeCloseTo(0.9, 5);
  });

  // ---- contradicts ----

  it('decreases confidence for "contradicts" relation', () => {
    const result = propagateForRelation(BASE, SOURCE, WEIGHT, 'contradicts');
    expect(result).toBeLessThan(BASE);
  });

  it('contradicts with full weight: uses negative propagation formula', () => {
    // base * (1 - |factor| * weight * source)
    // 0.5 * (1 - 1.0 * 1.0 * 0.8) = 0.5 * 0.2 = 0.1
    const result = propagateForRelation(0.5, 0.8, 1.0, 'contradicts');
    expect(result).toBeCloseTo(0.1, 5);
  });

  // ---- causes ----

  it('increases confidence for "causes" (factor 0.8), but less than "supports"', () => {
    const causes = propagateForRelation(BASE, SOURCE, WEIGHT, 'causes');
    const supports = propagateForRelation(BASE, SOURCE, WEIGHT, 'supports');
    expect(causes).toBeGreaterThan(BASE);
    expect(causes).toBeLessThan(supports);
  });

  // ---- requires ----

  it('increases confidence for "requires" (factor 0.6)', () => {
    const result = propagateForRelation(BASE, SOURCE, WEIGHT, 'requires');
    expect(result).toBeGreaterThan(BASE);
  });

  it('"requires" propagates less than "causes"', () => {
    const requires = propagateForRelation(BASE, SOURCE, WEIGHT, 'requires');
    const causes = propagateForRelation(BASE, SOURCE, WEIGHT, 'causes');
    expect(requires).toBeLessThan(causes);
  });

  // ---- similar_to ----

  it('produces very weak propagation for "similar_to" (factor 0.2)', () => {
    const similar = propagateForRelation(BASE, SOURCE, WEIGHT, 'similar_to');
    const supports = propagateForRelation(BASE, SOURCE, WEIGHT, 'supports');
    expect(similar).toBeGreaterThan(BASE);
    // similar_to effect is much smaller than supports (diff ≥ 0.3)
    expect(supports - similar).toBeGreaterThan(0.3);
  });

  it('similar_to formula: 0.5 + 0.2 * 1.0 * 0.8 * 0.5 = 0.58', () => {
    const result = propagateForRelation(0.5, 0.8, 1.0, 'similar_to');
    expect(result).toBeCloseTo(0.58, 5);
  });

  // ---- part_of ----

  it('produces weak positive propagation for "part_of"', () => {
    const result = propagateForRelation(BASE, SOURCE, WEIGHT, 'part_of');
    expect(result).toBeGreaterThan(BASE);
    expect(result).toBeLessThan(propagateForRelation(BASE, SOURCE, WEIGHT, 'similar_to') + 0.2);
  });

  // ---- created_by / used_by (non-epistemic, factor === 0) ----

  it('returns base unchanged for "created_by" (non-epistemic)', () => {
    const result = propagateForRelation(BASE, SOURCE, WEIGHT, 'created_by');
    expect(result).toBe(BASE);
  });

  it('returns base unchanged for "used_by" (non-epistemic)', () => {
    const result = propagateForRelation(BASE, SOURCE, WEIGHT, 'used_by');
    expect(result).toBe(BASE);
  });

  // ---- clamping ----

  it('never exceeds 1.0 (upper clamp)', () => {
    // high base + high source + supports
    const result = propagateForRelation(0.95, 0.99, 1.0, 'supports');
    expect(result).toBeLessThanOrEqual(1.0);
  });

  it('never goes below 0.0 (lower clamp)', () => {
    // low base + high source + contradicts
    const result = propagateForRelation(0.05, 0.99, 1.0, 'contradicts');
    expect(result).toBeGreaterThanOrEqual(0.0);
  });

  it('handles edge weight of 0: no change from zero-weight edge', () => {
    const result = propagateForRelation(BASE, SOURCE, 0, 'supports');
    expect(result).toBeCloseTo(BASE, 5);
  });

  it('handles fractional edge weight', () => {
    const fullWeight = propagateForRelation(0.5, 0.8, 1.0, 'supports');
    const halfWeight = propagateForRelation(0.5, 0.8, 0.5, 'supports');
    expect(halfWeight).toBeGreaterThan(0.5);
    expect(halfWeight).toBeLessThan(fullWeight);
  });
});

// ============================================================
// PROPAGATION_FACTORS constant tests
// ============================================================

describe('PROPAGATION_FACTORS', () => {
  it('exports correct factors for all relation types', () => {
    expect(PROPAGATION_FACTORS['supports']).toBe(1.0);
    expect(PROPAGATION_FACTORS['contradicts']).toBe(-1.0);
    expect(PROPAGATION_FACTORS['causes']).toBe(0.8);
    expect(PROPAGATION_FACTORS['requires']).toBe(0.6);
    expect(PROPAGATION_FACTORS['part_of']).toBe(0.3);
    expect(PROPAGATION_FACTORS['similar_to']).toBe(0.2);
    expect(PROPAGATION_FACTORS['created_by']).toBe(0.0);
    expect(PROPAGATION_FACTORS['used_by']).toBe(0.0);
  });
});

// ============================================================
// propagateBatch tests
// ============================================================

describe('propagateBatch', () => {
  beforeEach(() => {
    mockQueryContext.mockReset();
  });

  it('returns { updated: 0, iterations: 0 } for an empty graph', async () => {
    // No edges found
    mockQueryContext.mockResolvedValue({ rows: [], rowCount: 0 });
    const result = await propagateBatch('personal');
    expect(result).toEqual({ updated: 0, iterations: 0 });
  });

  it('propagates confidence through a single supports edge', async () => {
    // First iteration: one edge from source fact to target fact
    const edges = [
      {
        target_fact_id: 'fact-target-1',
        target_confidence: 0.5,
        source_fact_id: 'fact-source-1',
        source_confidence: 0.8,
        relation_type: 'supports',
        edge_weight: 1.0,
        old_propagated: null,
      },
    ];
    // First call returns edges, second call (update) succeeds, subsequent calls return []
    mockQueryContext
      .mockResolvedValueOnce({ rows: edges, rowCount: 1 })         // iteration 1 edges
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })            // UPDATE
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });           // iteration 2 edges (converged)

    const result = await propagateBatch('personal');
    expect(result.updated).toBeGreaterThan(0);
    expect(result.iterations).toBeGreaterThanOrEqual(1);
  });

  it('applies damping when updating propagated_confidence', async () => {
    // Target already has propagated_confidence = 0.6; new computed = 0.9
    // Damped = 0.7 * 0.9 + 0.3 * 0.6 = 0.63 + 0.18 = 0.81 → change > 0.01 → update
    const edges = [
      {
        target_fact_id: 'fact-t',
        target_confidence: 0.5,
        source_fact_id: 'fact-s',
        source_confidence: 0.8,
        relation_type: 'supports',
        edge_weight: 1.0,
        old_propagated: 0.6,
      },
    ];
    mockQueryContext
      .mockResolvedValueOnce({ rows: edges, rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const result = await propagateBatch('personal');
    expect(result.updated).toBe(1);

    // Verify the UPDATE was called with a damped value
    const updateCall = mockQueryContext.mock.calls[1];
    expect(updateCall[0]).toBe('personal');
    expect(updateCall[1]).toMatch(/UPDATE/i);
    // The damped value should be ~0.81
    const dampedValue = updateCall[2][0];
    expect(dampedValue).toBeCloseTo(0.81, 1);
  });

  it('skips update when change is <= 0.01', async () => {
    // old_propagated very close to what would be computed → no update
    // supports: 0.5 + 1.0 * 1.0 * 0.01 * 0.5 = 0.505; damped with old 0.505 ≈ same
    const edges = [
      {
        target_fact_id: 'fact-t',
        target_confidence: 0.5,
        source_fact_id: 'fact-s',
        source_confidence: 0.01, // tiny source → tiny change
        relation_type: 'supports',
        edge_weight: 1.0,
        old_propagated: 0.505,
      },
    ];
    mockQueryContext
      .mockResolvedValueOnce({ rows: edges, rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // no update; iteration 2 empty

    const result = await propagateBatch('personal');
    expect(result.updated).toBe(0);
  });

  it('exits early after max iterations', async () => {
    // Always return the same edge so it never converges
    const edges = [
      {
        target_fact_id: 'fact-t',
        target_confidence: 0.5,
        source_fact_id: 'fact-s',
        source_confidence: 0.8,
        relation_type: 'supports',
        edge_weight: 1.0,
        old_propagated: null,
      },
    ];
    // Alternate: edges then update, repeating
    mockQueryContext.mockImplementation((_ctx: string, sql: string) => {
      if (/UPDATE/i.test(sql)) {
        return Promise.resolve({ rows: [], rowCount: 1 });
      }
      return Promise.resolve({ rows: edges, rowCount: 1 });
    });

    const result = await propagateBatch('personal');
    expect(result.iterations).toBeLessThanOrEqual(3); // MAX_ITERATIONS
  });

  it('accumulates contributions from multiple source facts for the same target', async () => {
    const edges = [
      {
        target_fact_id: 'fact-t',
        target_confidence: 0.4,
        source_fact_id: 'fact-s1',
        source_confidence: 0.9,
        relation_type: 'supports',
        edge_weight: 1.0,
        old_propagated: null,
      },
      {
        target_fact_id: 'fact-t',
        target_confidence: 0.4,
        source_fact_id: 'fact-s2',
        source_confidence: 0.7,
        relation_type: 'supports',
        edge_weight: 1.0,
        old_propagated: null,
      },
    ];
    mockQueryContext
      .mockResolvedValueOnce({ rows: edges, rowCount: 2 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const result = await propagateBatch('personal');
    expect(result.updated).toBe(1); // one target fact updated

    // The value passed to UPDATE should be higher than a single-source propagation
    const singleSource = propagateForRelation(0.4, 0.9, 1.0, 'supports');
    const updateCall = mockQueryContext.mock.calls[1];
    const updatedValue = updateCall[2][0];
    expect(updatedValue).toBeGreaterThanOrEqual(singleSource * 0.7); // damped
  });

  it('stores confidence_sources JSONB with contributing fact ids', async () => {
    const edges = [
      {
        target_fact_id: 'fact-t',
        target_confidence: 0.5,
        source_fact_id: 'fact-s',
        source_confidence: 0.8,
        relation_type: 'supports',
        edge_weight: 1.0,
        old_propagated: null,
      },
    ];
    mockQueryContext
      .mockResolvedValueOnce({ rows: edges, rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    await propagateBatch('personal');

    const updateCall = mockQueryContext.mock.calls[1];
    // confidence_sources should be JSON containing source fact id
    const sourcesArg = updateCall[2][1];
    const sources = typeof sourcesArg === 'string' ? JSON.parse(sourcesArg) : sourcesArg;
    expect(Array.isArray(sources)).toBe(true);
    expect(sources.length).toBeGreaterThan(0);
    const sourceIds = sources.map((s: { factId?: string; fact_id?: string }) => s.factId ?? s.fact_id);
    expect(sourceIds).toContain('fact-s');
  });

  it('handles contradicts relation — reduces confidence', async () => {
    const edges = [
      {
        target_fact_id: 'fact-t',
        target_confidence: 0.8,
        source_fact_id: 'fact-s',
        source_confidence: 0.9,
        relation_type: 'contradicts',
        edge_weight: 1.0,
        old_propagated: null,
      },
    ];
    mockQueryContext
      .mockResolvedValueOnce({ rows: edges, rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    await propagateBatch('personal');

    const updateCall = mockQueryContext.mock.calls[1];
    const updatedValue = updateCall[2][0];
    // Raw: 0.8 * (1 - 1.0 * 1.0 * 0.9) = 0.08
    // Damped with null old = 0.7 * 0.08 + 0.3 * 0.8 = 0.056 + 0.24 = 0.296 — still < 0.8
    expect(updatedValue).toBeLessThan(0.8);
  });

  it('uses correct context for all database queries', async () => {
    mockQueryContext.mockResolvedValue({ rows: [], rowCount: 0 });

    await propagateBatch('work');

    for (const call of mockQueryContext.mock.calls) {
      expect(call[0]).toBe('work');
    }
  });
});
