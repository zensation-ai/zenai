/**
 * Inference Engine — Unit Tests (Phase 128, Task 3)
 *
 * TDD: tests written first, then implementation.
 *
 * Covers:
 * - findTransitiveInferences: 2-hop, 3-hop, confidence decay, skip direct, max 10
 * - findAnalogies: similar_to chain, confidence formula, no similar entities
 * - findNegationChains: supports+contradicts, contradicts+contradicts, confidence=0.4
 * - runFullInference: combines all types, deduplicates, sorts, max 15
 * - storeInferredFacts: inserts rows, returns count, handles duplicates gracefully
 * - Edge cases: entity with no relations, cyclic graph, unknown entity
 */

import {
  findTransitiveInferences,
  findAnalogies,
  findNegationChains,
  runFullInference,
  storeInferredFacts,
  type InferredRelation,
} from '../../../../services/reasoning/inference-engine';

// ──────────────────────────────────────────────────────────────
// Mocks
// ──────────────────────────────────────────────────────────────

const mockQueryContext = jest.fn();

jest.mock('../../../../utils/database-context', () => ({
  queryContext: (...args: unknown[]) => mockQueryContext(...args),
  isValidContext: (ctx: string) =>
    ['personal', 'work', 'learning', 'creative'].includes(ctx),
}));

jest.mock('../../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────

function rows<T>(data: T[]): { rows: T[]; rowCount: number } {
  return { rows: data, rowCount: data.length };
}

const CTX = 'personal';
const ENTITY_A = 'entity-a-uuid';
const ENTITY_B = 'entity-b-uuid';
const ENTITY_C = 'entity-c-uuid';
const ENTITY_D = 'entity-d-uuid';

// ──────────────────────────────────────────────────────────────
// findTransitiveInferences
// ──────────────────────────────────────────────────────────────

describe('findTransitiveInferences', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('finds a 2-hop transitive inference', async () => {
    // A→B→C with no direct A→C relation
    const twoHopRows = [
      {
        source_id: ENTITY_A,
        source_name: 'Entity A',
        target_id: ENTITY_C,
        target_name: 'Entity C',
        intermediate_id: ENTITY_B,
        intermediate_name: 'Entity B',
        strength_1: 0.8,
        strength_2: 0.9,
        type_1: 'supports',
        type_2: 'causes',
      },
    ];
    // Query 1: 2-hop traversal
    mockQueryContext.mockResolvedValueOnce(rows(twoHopRows));
    // Query 2: direct relation check (none found → empty)
    mockQueryContext.mockResolvedValueOnce(rows([]));
    // Query 3: 3-hop traversal (empty for this test)
    mockQueryContext.mockResolvedValueOnce(rows([]));

    const result = await findTransitiveInferences(CTX, ENTITY_A);

    expect(result).toHaveLength(1);
    expect(result[0].sourceEntityId).toBe(ENTITY_A);
    expect(result[0].targetEntityId).toBe(ENTITY_C);
    expect(result[0].inferenceType).toBe('transitive');
    expect(result[0].pathLength).toBe(2);
    expect(result[0].intermediateEntities).toContain('Entity B');
  });

  it('calculates confidence decay correctly for 2-hop', async () => {
    const twoHopRows = [
      {
        source_id: ENTITY_A,
        source_name: 'A',
        target_id: ENTITY_C,
        target_name: 'C',
        intermediate_id: ENTITY_B,
        intermediate_name: 'B',
        strength_1: 1.0,
        strength_2: 1.0,
        type_1: 'supports',
        type_2: 'supports',
      },
    ];
    mockQueryContext.mockResolvedValueOnce(rows(twoHopRows));
    mockQueryContext.mockResolvedValueOnce(rows([]));
    mockQueryContext.mockResolvedValueOnce(rows([]));

    const result = await findTransitiveInferences(CTX, ENTITY_A);

    // confidence = strength_1 * strength_2 * 0.7^(2-1) = 1.0 * 1.0 * 0.7 = 0.7
    expect(result[0].confidence).toBeCloseTo(0.7, 5);
  });

  it('calculates confidence decay correctly for 3-hop', async () => {
    mockQueryContext.mockResolvedValueOnce(rows([])); // 2-hop: empty
    mockQueryContext.mockResolvedValueOnce(rows([])); // direct relations
    const threeHopRows = [
      {
        source_id: ENTITY_A,
        source_name: 'A',
        target_id: ENTITY_D,
        target_name: 'D',
        mid1_id: ENTITY_B,
        mid1_name: 'B',
        mid2_id: ENTITY_C,
        mid2_name: 'C',
        strength_1: 1.0,
        strength_2: 1.0,
        strength_3: 1.0,
      },
    ];
    mockQueryContext.mockResolvedValueOnce(rows(threeHopRows));

    const result = await findTransitiveInferences(CTX, ENTITY_A);

    // confidence = 1.0 * 1.0 * 1.0 * 0.7^(3-1) = 0.7^2 = 0.49
    expect(result[0].confidence).toBeCloseTo(0.49, 5);
    expect(result[0].pathLength).toBe(3);
    expect(result[0].intermediateEntities).toHaveLength(2);
  });

  it('skips inference when direct relation already exists', async () => {
    const twoHopRows = [
      {
        source_id: ENTITY_A,
        source_name: 'A',
        target_id: ENTITY_C,
        target_name: 'C',
        intermediate_id: ENTITY_B,
        intermediate_name: 'B',
        strength_1: 0.8,
        strength_2: 0.9,
        type_1: 'supports',
        type_2: 'supports',
      },
    ];
    const directRelations = [
      { source_entity_id: ENTITY_A, target_entity_id: ENTITY_C },
    ];
    mockQueryContext.mockResolvedValueOnce(rows(twoHopRows));
    mockQueryContext.mockResolvedValueOnce(rows(directRelations));
    mockQueryContext.mockResolvedValueOnce(rows([]));

    const result = await findTransitiveInferences(CTX, ENTITY_A);

    // C already directly connected to A → should be filtered
    expect(result).toHaveLength(0);
  });

  it('returns at most 10 results', async () => {
    const manyRows = Array.from({ length: 15 }, (_, i) => ({
      source_id: ENTITY_A,
      source_name: 'A',
      target_id: `entity-${i}`,
      target_name: `Entity ${i}`,
      intermediate_id: ENTITY_B,
      intermediate_name: 'B',
      strength_1: 0.9,
      strength_2: 0.9,
      type_1: 'supports',
      type_2: 'supports',
    }));
    mockQueryContext.mockResolvedValueOnce(rows(manyRows));
    mockQueryContext.mockResolvedValueOnce(rows([]));
    mockQueryContext.mockResolvedValueOnce(rows([]));

    const result = await findTransitiveInferences(CTX, ENTITY_A);

    expect(result.length).toBeLessThanOrEqual(10);
  });

  it('returns results sorted by confidence descending', async () => {
    const twoHopRows = [
      {
        source_id: ENTITY_A,
        source_name: 'A',
        target_id: ENTITY_C,
        target_name: 'C',
        intermediate_id: ENTITY_B,
        intermediate_name: 'B',
        strength_1: 0.5,
        strength_2: 0.5,
        type_1: 'supports',
        type_2: 'supports',
      },
      {
        source_id: ENTITY_A,
        source_name: 'A',
        target_id: ENTITY_D,
        target_name: 'D',
        intermediate_id: ENTITY_B,
        intermediate_name: 'B',
        strength_1: 0.9,
        strength_2: 0.9,
        type_1: 'supports',
        type_2: 'supports',
      },
    ];
    mockQueryContext.mockResolvedValueOnce(rows(twoHopRows));
    mockQueryContext.mockResolvedValueOnce(rows([]));
    mockQueryContext.mockResolvedValueOnce(rows([]));

    const result = await findTransitiveInferences(CTX, ENTITY_A);

    expect(result[0].confidence).toBeGreaterThan(result[1].confidence);
  });

  it('returns empty array for entity with no relations', async () => {
    mockQueryContext.mockResolvedValueOnce(rows([]));
    mockQueryContext.mockResolvedValueOnce(rows([]));
    mockQueryContext.mockResolvedValueOnce(rows([]));

    const result = await findTransitiveInferences(CTX, ENTITY_A);

    expect(result).toEqual([]);
  });

  it('uses custom maxHops when provided', async () => {
    // maxHops=2 should only call 2-hop query (not 3-hop)
    mockQueryContext.mockResolvedValueOnce(rows([])); // 2-hop
    mockQueryContext.mockResolvedValueOnce(rows([])); // direct check

    const result = await findTransitiveInferences(CTX, ENTITY_A, 2);

    expect(result).toEqual([]);
    // Should NOT have made a 3-hop query
    expect(mockQueryContext).toHaveBeenCalledTimes(2);
  });

  it('includes human-readable reasoning string', async () => {
    const twoHopRows = [
      {
        source_id: ENTITY_A,
        source_name: 'Alpha',
        target_id: ENTITY_C,
        target_name: 'Gamma',
        intermediate_id: ENTITY_B,
        intermediate_name: 'Beta',
        strength_1: 0.8,
        strength_2: 0.8,
        type_1: 'supports',
        type_2: 'supports',
      },
    ];
    mockQueryContext.mockResolvedValueOnce(rows(twoHopRows));
    mockQueryContext.mockResolvedValueOnce(rows([]));
    mockQueryContext.mockResolvedValueOnce(rows([]));

    const result = await findTransitiveInferences(CTX, ENTITY_A);

    expect(result[0].reasoning).toContain('Alpha');
    expect(result[0].reasoning).toContain('Gamma');
  });
});

// ──────────────────────────────────────────────────────────────
// findAnalogies
// ──────────────────────────────────────────────────────────────

describe('findAnalogies', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('finds analogy via similar_to chain', async () => {
    // C is similar_to A; A has relation R to B; infer C might have R to B
    const analogyRows = [
      {
        analogous_id: ENTITY_C,
        analogous_name: 'Entity C',
        target_id: ENTITY_B,
        target_name: 'Entity B',
        similarity_strength: 0.8,
        relation_strength: 0.9,
        relation_type: 'supports',
      },
    ];
    mockQueryContext.mockResolvedValueOnce(rows(analogyRows));

    const result = await findAnalogies(CTX, ENTITY_A);

    expect(result).toHaveLength(1);
    expect(result[0].sourceEntityId).toBe(ENTITY_C);
    expect(result[0].targetEntityId).toBe(ENTITY_B);
    expect(result[0].inferenceType).toBe('analogy');
  });

  it('calculates confidence as similarity_strength * relation_strength * 0.5', async () => {
    const analogyRows = [
      {
        analogous_id: ENTITY_C,
        analogous_name: 'C',
        target_id: ENTITY_B,
        target_name: 'B',
        similarity_strength: 0.8,
        relation_strength: 0.9,
        relation_type: 'supports',
      },
    ];
    mockQueryContext.mockResolvedValueOnce(rows(analogyRows));

    const result = await findAnalogies(CTX, ENTITY_A);

    // 0.8 * 0.9 * 0.5 = 0.36
    expect(result[0].confidence).toBeCloseTo(0.36, 5);
  });

  it('returns empty array when no similar entities exist', async () => {
    mockQueryContext.mockResolvedValueOnce(rows([]));

    const result = await findAnalogies(CTX, ENTITY_A);

    expect(result).toEqual([]);
  });

  it('returns at most 5 results', async () => {
    const manyRows = Array.from({ length: 10 }, (_, i) => ({
      analogous_id: `entity-${i}`,
      analogous_name: `Entity ${i}`,
      target_id: ENTITY_B,
      target_name: 'B',
      similarity_strength: 0.7,
      relation_strength: 0.8,
      relation_type: 'supports',
    }));
    mockQueryContext.mockResolvedValueOnce(rows(manyRows));

    const result = await findAnalogies(CTX, ENTITY_A);

    expect(result.length).toBeLessThanOrEqual(5);
  });

  it('includes inferenceType analogy and pathLength 2', async () => {
    const analogyRows = [
      {
        analogous_id: ENTITY_C,
        analogous_name: 'C',
        target_id: ENTITY_B,
        target_name: 'B',
        similarity_strength: 0.6,
        relation_strength: 0.7,
        relation_type: 'causes',
      },
    ];
    mockQueryContext.mockResolvedValueOnce(rows(analogyRows));

    const result = await findAnalogies(CTX, ENTITY_A);

    expect(result[0].inferenceType).toBe('analogy');
    expect(result[0].pathLength).toBe(2);
  });
});

// ──────────────────────────────────────────────────────────────
// findNegationChains
// ──────────────────────────────────────────────────────────────

describe('findNegationChains', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('detects supports+contradicts pattern (A supports B, B contradicts C → A incompatible with C)', async () => {
    const supportsContradictsRows = [
      {
        source_id: ENTITY_A,
        source_name: 'A',
        target_id: ENTITY_C,
        target_name: 'C',
        intermediate_id: ENTITY_B,
        intermediate_name: 'B',
        pattern: 'supports_contradicts',
      },
    ];
    // Query 1: supports+contradicts
    mockQueryContext.mockResolvedValueOnce(rows(supportsContradictsRows));
    // Query 2: contradicts+contradicts
    mockQueryContext.mockResolvedValueOnce(rows([]));

    const result = await findNegationChains(CTX, ENTITY_A);

    expect(result).toHaveLength(1);
    expect(result[0].inferenceType).toBe('negation');
    expect(result[0].sourceEntityId).toBe(ENTITY_A);
    expect(result[0].targetEntityId).toBe(ENTITY_C);
  });

  it('detects contradicts+contradicts pattern (enemy of enemy)', async () => {
    // Query 1: supports+contradicts (empty)
    mockQueryContext.mockResolvedValueOnce(rows([]));
    const doublyContradictsRows = [
      {
        source_id: ENTITY_A,
        source_name: 'A',
        target_id: ENTITY_C,
        target_name: 'C',
        intermediate_id: ENTITY_B,
        intermediate_name: 'B',
        pattern: 'contradicts_contradicts',
      },
    ];
    // Query 2: contradicts+contradicts
    mockQueryContext.mockResolvedValueOnce(rows(doublyContradictsRows));

    const result = await findNegationChains(CTX, ENTITY_A);

    expect(result).toHaveLength(1);
    expect(result[0].inferenceType).toBe('negation');
  });

  it('assigns confidence 0.4 to supports+contradicts pattern', async () => {
    const rows1 = [
      {
        source_id: ENTITY_A,
        source_name: 'A',
        target_id: ENTITY_C,
        target_name: 'C',
        intermediate_id: ENTITY_B,
        intermediate_name: 'B',
        pattern: 'supports_contradicts',
      },
    ];
    mockQueryContext.mockResolvedValueOnce(rows(rows1));
    mockQueryContext.mockResolvedValueOnce(rows([]));

    const result = await findNegationChains(CTX, ENTITY_A);

    expect(result[0].confidence).toBe(0.4);
  });

  it('assigns confidence 0.4 to contradicts+contradicts pattern', async () => {
    mockQueryContext.mockResolvedValueOnce(rows([]));
    const rows2 = [
      {
        source_id: ENTITY_A,
        source_name: 'A',
        target_id: ENTITY_C,
        target_name: 'C',
        intermediate_id: ENTITY_B,
        intermediate_name: 'B',
        pattern: 'contradicts_contradicts',
      },
    ];
    mockQueryContext.mockResolvedValueOnce(rows(rows2));

    const result = await findNegationChains(CTX, ENTITY_A);

    expect(result[0].confidence).toBe(0.4);
  });

  it('returns at most 5 results', async () => {
    const manyRows = Array.from({ length: 8 }, (_, i) => ({
      source_id: ENTITY_A,
      source_name: 'A',
      target_id: `entity-${i}`,
      target_name: `Entity ${i}`,
      intermediate_id: ENTITY_B,
      intermediate_name: 'B',
      pattern: 'supports_contradicts',
    }));
    mockQueryContext.mockResolvedValueOnce(rows(manyRows));
    mockQueryContext.mockResolvedValueOnce(rows([]));

    const result = await findNegationChains(CTX, ENTITY_A);

    expect(result.length).toBeLessThanOrEqual(5);
  });

  it('returns empty array when no negation chains found', async () => {
    mockQueryContext.mockResolvedValueOnce(rows([]));
    mockQueryContext.mockResolvedValueOnce(rows([]));

    const result = await findNegationChains(CTX, ENTITY_A);

    expect(result).toEqual([]);
  });
});

// ──────────────────────────────────────────────────────────────
// runFullInference
// ──────────────────────────────────────────────────────────────

describe('runFullInference', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('combines results from all three inference types', async () => {
    // findTransitiveInferences calls (2-hop, direct check, 3-hop)
    mockQueryContext.mockResolvedValueOnce(rows([
      { source_id: ENTITY_A, source_name: 'A', target_id: ENTITY_C, target_name: 'C', intermediate_id: ENTITY_B, intermediate_name: 'B', strength_1: 0.8, strength_2: 0.8, type_1: 'supports', type_2: 'supports' },
    ]));
    mockQueryContext.mockResolvedValueOnce(rows([])); // direct check
    mockQueryContext.mockResolvedValueOnce(rows([])); // 3-hop

    // findAnalogies
    mockQueryContext.mockResolvedValueOnce(rows([
      { analogous_id: ENTITY_D, analogous_name: 'D', target_id: ENTITY_B, target_name: 'B', similarity_strength: 0.6, relation_strength: 0.7, relation_type: 'supports' },
    ]));

    // findNegationChains (2 queries)
    mockQueryContext.mockResolvedValueOnce(rows([]));
    mockQueryContext.mockResolvedValueOnce(rows([]));

    const result = await runFullInference(CTX, ENTITY_A);

    // Should have both transitive (C) and analogy (D→B) results
    expect(result.length).toBeGreaterThan(0);
    const types = new Set(result.map(r => r.inferenceType));
    expect(types).toContain('transitive');
    expect(types).toContain('analogy');
  });

  it('deduplicates by target entity (keeps highest confidence)', async () => {
    // Both transitive and analogy point to ENTITY_C
    mockQueryContext.mockResolvedValueOnce(rows([
      { source_id: ENTITY_A, source_name: 'A', target_id: ENTITY_C, target_name: 'C', intermediate_id: ENTITY_B, intermediate_name: 'B', strength_1: 0.9, strength_2: 0.9, type_1: 'supports', type_2: 'supports' },
    ]));
    mockQueryContext.mockResolvedValueOnce(rows([]));
    mockQueryContext.mockResolvedValueOnce(rows([]));

    mockQueryContext.mockResolvedValueOnce(rows([
      { analogous_id: ENTITY_A, analogous_name: 'A', target_id: ENTITY_C, target_name: 'C', similarity_strength: 0.5, relation_strength: 0.5, relation_type: 'supports' },
    ]));

    mockQueryContext.mockResolvedValueOnce(rows([]));
    mockQueryContext.mockResolvedValueOnce(rows([]));

    const result = await runFullInference(CTX, ENTITY_A);

    const cResults = result.filter(r => r.targetEntityId === ENTITY_C);
    expect(cResults.length).toBe(1);
  });

  it('sorts results by confidence descending', async () => {
    mockQueryContext.mockResolvedValueOnce(rows([
      { source_id: ENTITY_A, source_name: 'A', target_id: ENTITY_C, target_name: 'C', intermediate_id: ENTITY_B, intermediate_name: 'B', strength_1: 0.5, strength_2: 0.5, type_1: 'supports', type_2: 'supports' },
      { source_id: ENTITY_A, source_name: 'A', target_id: ENTITY_D, target_name: 'D', intermediate_id: ENTITY_B, intermediate_name: 'B', strength_1: 0.9, strength_2: 0.9, type_1: 'supports', type_2: 'supports' },
    ]));
    mockQueryContext.mockResolvedValueOnce(rows([]));
    mockQueryContext.mockResolvedValueOnce(rows([]));
    mockQueryContext.mockResolvedValueOnce(rows([]));
    mockQueryContext.mockResolvedValueOnce(rows([]));
    mockQueryContext.mockResolvedValueOnce(rows([]));

    const result = await runFullInference(CTX, ENTITY_A);

    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1].confidence).toBeGreaterThanOrEqual(result[i].confidence);
    }
  });

  it('returns at most 15 results total', async () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      source_id: ENTITY_A,
      source_name: 'A',
      target_id: `entity-${i}`,
      target_name: `Entity ${i}`,
      intermediate_id: ENTITY_B,
      intermediate_name: 'B',
      strength_1: 0.8,
      strength_2: 0.8,
      type_1: 'supports',
      type_2: 'supports',
    }));
    mockQueryContext.mockResolvedValueOnce(rows(many));
    mockQueryContext.mockResolvedValueOnce(rows([]));
    mockQueryContext.mockResolvedValueOnce(rows([]));
    mockQueryContext.mockResolvedValueOnce(rows([]));
    mockQueryContext.mockResolvedValueOnce(rows([]));
    mockQueryContext.mockResolvedValueOnce(rows([]));

    const result = await runFullInference(CTX, ENTITY_A);

    expect(result.length).toBeLessThanOrEqual(15);
  });

  it('returns empty array when no inferences are possible', async () => {
    mockQueryContext.mockResolvedValue(rows([]));

    const result = await runFullInference(CTX, ENTITY_A);

    expect(result).toEqual([]);
  });
});

// ──────────────────────────────────────────────────────────────
// storeInferredFacts
// ──────────────────────────────────────────────────────────────

describe('storeInferredFacts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('inserts inferences and returns count of newly stored', async () => {
    mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const inferences: InferredRelation[] = [
      {
        sourceEntityId: ENTITY_A,
        sourceEntityName: 'A',
        targetEntityId: ENTITY_C,
        targetEntityName: 'C',
        inferenceType: 'transitive',
        confidence: 0.56,
        reasoning: 'A supports B, B supports C',
        pathLength: 2,
        intermediateEntities: ['B'],
      },
      {
        sourceEntityId: ENTITY_A,
        sourceEntityName: 'A',
        targetEntityId: ENTITY_D,
        targetEntityName: 'D',
        inferenceType: 'analogy',
        confidence: 0.36,
        reasoning: 'analogy via similar entity',
        pathLength: 2,
        intermediateEntities: [],
      },
    ];

    const count = await storeInferredFacts(CTX, inferences);

    expect(count).toBe(2);
    expect(mockQueryContext).toHaveBeenCalledTimes(2);
  });

  it('returns 0 for empty inferences array', async () => {
    const count = await storeInferredFacts(CTX, []);

    expect(count).toBe(0);
    expect(mockQueryContext).not.toHaveBeenCalled();
  });

  it('handles ON CONFLICT gracefully (duplicate skipped, count reflects actual inserts)', async () => {
    // rowCount=0 means duplicate → skipped
    mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const inferences: InferredRelation[] = [
      {
        sourceEntityId: ENTITY_A,
        sourceEntityName: 'A',
        targetEntityId: ENTITY_C,
        targetEntityName: 'C',
        inferenceType: 'transitive',
        confidence: 0.56,
        reasoning: 'A supports B, B supports C',
        pathLength: 2,
        intermediateEntities: ['B'],
      },
    ];

    const count = await storeInferredFacts(CTX, inferences);

    expect(count).toBe(0);
  });

  it('uses INSERT ... ON CONFLICT DO NOTHING SQL pattern', async () => {
    mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const inferences: InferredRelation[] = [
      {
        sourceEntityId: ENTITY_A,
        sourceEntityName: 'A',
        targetEntityId: ENTITY_C,
        targetEntityName: 'C',
        inferenceType: 'transitive',
        confidence: 0.7,
        reasoning: 'transitive',
        pathLength: 2,
        intermediateEntities: [],
      },
    ];

    await storeInferredFacts(CTX, inferences);

    const sql: string = mockQueryContext.mock.calls[0][1];
    expect(sql.toLowerCase()).toContain('on conflict');
    expect(sql.toLowerCase()).toContain('do nothing');
  });
});

// ──────────────────────────────────────────────────────────────
// Edge cases
// ──────────────────────────────────────────────────────────────

describe('edge cases', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('findTransitiveInferences handles database error gracefully', async () => {
    mockQueryContext.mockRejectedValueOnce(new Error('DB error'));

    await expect(findTransitiveInferences(CTX, ENTITY_A)).rejects.toThrow('DB error');
  });

  it('findTransitiveInferences does not create self-loops (source === target)', async () => {
    const selfLoopRows = [
      {
        source_id: ENTITY_A,
        source_name: 'A',
        target_id: ENTITY_A, // Same as source
        target_name: 'A',
        intermediate_id: ENTITY_B,
        intermediate_name: 'B',
        strength_1: 0.8,
        strength_2: 0.8,
        type_1: 'supports',
        type_2: 'supports',
      },
    ];
    mockQueryContext.mockResolvedValueOnce(rows(selfLoopRows));
    mockQueryContext.mockResolvedValueOnce(rows([]));
    mockQueryContext.mockResolvedValueOnce(rows([]));

    const result = await findTransitiveInferences(CTX, ENTITY_A);

    // Self-loops should be excluded
    const selfLoops = result.filter(r => r.targetEntityId === r.sourceEntityId);
    expect(selfLoops).toHaveLength(0);
  });

  it('runFullInference works with all three types returning results', async () => {
    // transitive: 2-hop
    mockQueryContext.mockResolvedValueOnce(rows([
      { source_id: ENTITY_A, source_name: 'A', target_id: ENTITY_C, target_name: 'C', intermediate_id: ENTITY_B, intermediate_name: 'B', strength_1: 0.8, strength_2: 0.8, type_1: 'supports', type_2: 'supports' },
    ]));
    mockQueryContext.mockResolvedValueOnce(rows([])); // direct check
    mockQueryContext.mockResolvedValueOnce(rows([])); // 3-hop

    // analogy
    mockQueryContext.mockResolvedValueOnce(rows([
      { analogous_id: ENTITY_D, analogous_name: 'D', target_id: ENTITY_B, target_name: 'B', similarity_strength: 0.7, relation_strength: 0.8, relation_type: 'supports' },
    ]));

    // negation: supports+contradicts
    mockQueryContext.mockResolvedValueOnce(rows([
      { source_id: ENTITY_A, source_name: 'A', target_id: 'entity-e', target_name: 'E', intermediate_id: ENTITY_B, intermediate_name: 'B', pattern: 'supports_contradicts' },
    ]));
    // negation: contradicts+contradicts
    mockQueryContext.mockResolvedValueOnce(rows([]));

    const result = await runFullInference(CTX, ENTITY_A);

    const types = new Set(result.map(r => r.inferenceType));
    expect(types.has('transitive')).toBe(true);
    expect(types.has('analogy')).toBe(true);
    expect(types.has('negation')).toBe(true);
  });
});
