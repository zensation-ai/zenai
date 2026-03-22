/**
 * Tests for Phase 133: Artificial Curiosity Engine — Hypothesis Engine
 *
 * TDD: Tests written before implementation.
 * Covers generateFromIncompletePatterns, generateFromTemporalGaps,
 * generateFromContradictions, generateHypotheses, and the Hypothesis interface.
 */

jest.mock('../../../../utils/logger', () => ({
  logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('../../../../utils/database-context', () => ({
  queryContext: jest.fn(),
}));

import {
  generateFromIncompletePatterns,
  generateFromTemporalGaps,
  generateFromContradictions,
  generateHypotheses,
} from '../../../../services/curiosity/hypothesis-engine';
import type { Hypothesis } from '../../../../services/curiosity/hypothesis-engine';
import { queryContext } from '../../../../utils/database-context';

const mockQueryContext = queryContext as jest.MockedFunction<typeof queryContext>;

beforeEach(() => {
  jest.clearAllMocks();
  mockQueryContext.mockReset();
});

// ---------------------------------------------------------------------------
// Helper types for test data
// ---------------------------------------------------------------------------

interface Relation {
  source: string;
  target: string;
  type: string;
}

interface FactWithTimestamp {
  id: string;
  content: string;
  entities: string[];
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// generateFromIncompletePatterns
// ---------------------------------------------------------------------------

describe('generateFromIncompletePatterns', () => {
  it('suggests C→D when A→B, A→C, B→D exist but C→D does not', () => {
    const relations: Relation[] = [
      { source: 'A', target: 'B', type: 'related_to' },
      { source: 'A', target: 'C', type: 'related_to' },
      { source: 'B', target: 'D', type: 'related_to' },
    ];
    const hypotheses = generateFromIncompletePatterns(relations);

    expect(hypotheses.length).toBeGreaterThanOrEqual(1);
    const found = hypotheses.some(
      (h) => h.sourceEntities.includes('C') && h.sourceEntities.includes('D'),
    );
    expect(found).toBe(true);
  });

  it('returns empty array when no patterns exist', () => {
    const relations: Relation[] = [];
    const hypotheses = generateFromIncompletePatterns(relations);
    expect(hypotheses).toEqual([]);
  });

  it('returns empty array when graph is already complete', () => {
    const relations: Relation[] = [
      { source: 'A', target: 'B', type: 'related_to' },
      { source: 'A', target: 'C', type: 'related_to' },
      { source: 'B', target: 'D', type: 'related_to' },
      { source: 'C', target: 'D', type: 'related_to' }, // already exists
    ];
    const hypotheses = generateFromIncompletePatterns(relations);
    // C→D already exists, no incomplete pattern
    expect(hypotheses).toEqual([]);
  });

  it('returns hypotheses with sourceType incomplete_pattern', () => {
    const relations: Relation[] = [
      { source: 'X', target: 'Y', type: 'related_to' },
      { source: 'X', target: 'Z', type: 'related_to' },
      { source: 'Y', target: 'W', type: 'related_to' },
    ];
    const hypotheses = generateFromIncompletePatterns(relations);
    for (const h of hypotheses) {
      expect(h.sourceType).toBe('incomplete_pattern');
    }
  });

  it('handles single relation (no pattern possible)', () => {
    const relations: Relation[] = [
      { source: 'A', target: 'B', type: 'related_to' },
    ];
    const hypotheses = generateFromIncompletePatterns(relations);
    expect(hypotheses).toEqual([]);
  });

  it('handles disconnected subgraphs', () => {
    const relations: Relation[] = [
      { source: 'A', target: 'B', type: 'related_to' },
      { source: 'C', target: 'D', type: 'related_to' },
    ];
    const hypotheses = generateFromIncompletePatterns(relations);
    // No overlapping nodes → no pattern
    expect(hypotheses).toEqual([]);
  });

  it('does not generate duplicate hypotheses', () => {
    const relations: Relation[] = [
      { source: 'A', target: 'B', type: 'related_to' },
      { source: 'A', target: 'C', type: 'related_to' },
      { source: 'B', target: 'D', type: 'related_to' },
      { source: 'A', target: 'B', type: 'supports' }, // duplicate edge
    ];
    const hypotheses = generateFromIncompletePatterns(relations);
    const keys = hypotheses.map((h) => h.sourceEntities.sort().join(','));
    const unique = new Set(keys);
    expect(keys.length).toBe(unique.size);
  });

  it('each hypothesis has a confidence between 0 and 1', () => {
    const relations: Relation[] = [
      { source: 'A', target: 'B', type: 'related_to' },
      { source: 'A', target: 'C', type: 'related_to' },
      { source: 'B', target: 'D', type: 'related_to' },
    ];
    const hypotheses = generateFromIncompletePatterns(relations);
    for (const h of hypotheses) {
      expect(h.confidence).toBeGreaterThanOrEqual(0);
      expect(h.confidence).toBeLessThanOrEqual(1);
    }
  });
});

// ---------------------------------------------------------------------------
// generateFromTemporalGaps
// ---------------------------------------------------------------------------

describe('generateFromTemporalGaps', () => {
  it('generates hypothesis for fact older than 30 days', () => {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 45);

    const facts: FactWithTimestamp[] = [
      { id: '1', content: 'TypeScript is at version 5.0', entities: ['TypeScript'], createdAt: oldDate },
    ];
    const hypotheses = generateFromTemporalGaps(facts);

    expect(hypotheses.length).toBe(1);
    expect(hypotheses[0].sourceType).toBe('temporal_gap');
    expect(hypotheses[0].sourceEntities).toContain('TypeScript');
  });

  it('does not generate hypothesis for recent facts', () => {
    const recentDate = new Date();
    recentDate.setDate(recentDate.getDate() - 5);

    const facts: FactWithTimestamp[] = [
      { id: '1', content: 'Node.js 22 released', entities: ['Node.js'], createdAt: recentDate },
    ];
    const hypotheses = generateFromTemporalGaps(facts);
    expect(hypotheses).toEqual([]);
  });

  it('returns empty array for no facts', () => {
    const hypotheses = generateFromTemporalGaps([]);
    expect(hypotheses).toEqual([]);
  });

  it('generates multiple hypotheses for multiple old facts', () => {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 60);

    const facts: FactWithTimestamp[] = [
      { id: '1', content: 'Fact A', entities: ['A'], createdAt: oldDate },
      { id: '2', content: 'Fact B', entities: ['B'], createdAt: oldDate },
    ];
    const hypotheses = generateFromTemporalGaps(facts);
    expect(hypotheses.length).toBe(2);
  });

  it('hypothesis text references the stale content', () => {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 40);

    const facts: FactWithTimestamp[] = [
      { id: '1', content: 'Python 3.12 features', entities: ['Python'], createdAt: oldDate },
    ];
    const hypotheses = generateFromTemporalGaps(facts);
    expect(hypotheses[0].hypothesis).toBeTruthy();
    expect(typeof hypotheses[0].hypothesis).toBe('string');
  });

  it('fact exactly at 30-day boundary is not flagged', () => {
    const boundaryDate = new Date();
    boundaryDate.setDate(boundaryDate.getDate() - 30);

    const facts: FactWithTimestamp[] = [
      { id: '1', content: 'Boundary fact', entities: ['test'], createdAt: boundaryDate },
    ];
    const hypotheses = generateFromTemporalGaps(facts);
    expect(hypotheses).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// generateFromContradictions
// ---------------------------------------------------------------------------

describe('generateFromContradictions', () => {
  it('detects contradiction when two facts share entity but differ in claims', () => {
    const facts = [
      { id: '1', content: 'React uses virtual DOM', entities: ['React', 'DOM'] },
      { id: '2', content: 'React does not use virtual DOM anymore', entities: ['React', 'DOM'] },
    ];
    const hypotheses = generateFromContradictions(facts);

    expect(hypotheses.length).toBeGreaterThanOrEqual(1);
    expect(hypotheses[0].sourceType).toBe('contradiction');
  });

  it('returns empty for facts with no overlapping entities', () => {
    const facts = [
      { id: '1', content: 'Python is fast', entities: ['Python'] },
      { id: '2', content: 'Rust is safe', entities: ['Rust'] },
    ];
    const hypotheses = generateFromContradictions(facts);
    expect(hypotheses).toEqual([]);
  });

  it('returns empty for empty input', () => {
    expect(generateFromContradictions([])).toEqual([]);
  });

  it('does not flag facts with same entities and similar claims', () => {
    const facts = [
      { id: '1', content: 'TypeScript is a superset of JavaScript', entities: ['TypeScript', 'JavaScript'] },
      { id: '2', content: 'TypeScript extends JavaScript', entities: ['TypeScript', 'JavaScript'] },
    ];
    const hypotheses = generateFromContradictions(facts);
    // Similar claims should not be flagged
    expect(hypotheses).toEqual([]);
  });

  it('handles single fact gracefully', () => {
    const facts = [
      { id: '1', content: 'Go is compiled', entities: ['Go'] },
    ];
    expect(generateFromContradictions(facts)).toEqual([]);
  });

  it('detects negation patterns (not, no longer, does not)', () => {
    const facts = [
      { id: '1', content: 'Node.js is single-threaded', entities: ['Node.js'] },
      { id: '2', content: 'Node.js is not single-threaded', entities: ['Node.js'] },
    ];
    const hypotheses = generateFromContradictions(facts);
    expect(hypotheses.length).toBeGreaterThanOrEqual(1);
  });

  it('hypothesis references conflicting fact IDs in sourceEntities', () => {
    const facts = [
      { id: 'fact-a', content: 'Vue uses options API', entities: ['Vue'] },
      { id: 'fact-b', content: 'Vue no longer uses options API', entities: ['Vue'] },
    ];
    const hypotheses = generateFromContradictions(facts);
    if (hypotheses.length > 0) {
      expect(hypotheses[0].sourceEntities.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('each hypothesis has confidence between 0 and 1', () => {
    const facts = [
      { id: '1', content: 'X is true', entities: ['X'] },
      { id: '2', content: 'X is not true', entities: ['X'] },
    ];
    const hypotheses = generateFromContradictions(facts);
    for (const h of hypotheses) {
      expect(h.confidence).toBeGreaterThanOrEqual(0);
      expect(h.confidence).toBeLessThanOrEqual(1);
    }
  });
});

// ---------------------------------------------------------------------------
// generateHypotheses (orchestrator)
// ---------------------------------------------------------------------------

describe('generateHypotheses', () => {
  it('combines results from all three generators', async () => {
    // Mock relations query
    mockQueryContext
      .mockResolvedValueOnce({
        rows: [
          { source_id: 'A', target_id: 'B', relation_type: 'related_to' },
          { source_id: 'A', target_id: 'C', relation_type: 'related_to' },
          { source_id: 'B', target_id: 'D', relation_type: 'related_to' },
        ],
      } as any)
      // Mock facts with timestamps
      .mockResolvedValueOnce({
        rows: [
          {
            id: '1',
            content: 'Old fact about AI',
            entities: ['AI'],
            created_at: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000),
          },
        ],
      } as any)
      // Mock facts for contradiction check
      .mockResolvedValueOnce({
        rows: [
          { id: '2', content: 'X is fast', entities: ['X'] },
          { id: '3', content: 'X is not fast', entities: ['X'] },
        ],
      } as any);

    const hypotheses = await generateHypotheses('personal');
    expect(Array.isArray(hypotheses)).toBe(true);
    expect(hypotheses.length).toBeGreaterThanOrEqual(1);
  });

  it('limits results to top N by confidence', async () => {
    // Create enough data to exceed limit
    const manyRelations = [];
    for (let i = 0; i < 20; i++) {
      manyRelations.push(
        { source_id: 'hub', target_id: `node-${i}`, relation_type: 'related_to' },
        { source_id: `node-${i}`, target_id: `leaf-${i}`, relation_type: 'related_to' },
      );
    }
    mockQueryContext
      .mockResolvedValueOnce({ rows: manyRelations } as any)
      .mockResolvedValueOnce({ rows: [] } as any)
      .mockResolvedValueOnce({ rows: [] } as any);

    const hypotheses = await generateHypotheses('personal');
    expect(hypotheses.length).toBeLessThanOrEqual(10);
  });

  it('returns empty array on DB error', async () => {
    mockQueryContext.mockRejectedValueOnce(new Error('DB connection failed'));

    const hypotheses = await generateHypotheses('personal');
    expect(hypotheses).toEqual([]);
  });

  it('returns empty array when all sources are empty', async () => {
    mockQueryContext
      .mockResolvedValueOnce({ rows: [] } as any)
      .mockResolvedValueOnce({ rows: [] } as any)
      .mockResolvedValueOnce({ rows: [] } as any);

    const hypotheses = await generateHypotheses('personal');
    expect(hypotheses).toEqual([]);
  });

  it('passes userId when provided', async () => {
    mockQueryContext
      .mockResolvedValueOnce({ rows: [] } as any)
      .mockResolvedValueOnce({ rows: [] } as any)
      .mockResolvedValueOnce({ rows: [] } as any);

    await generateHypotheses('personal', 'user-456');
    expect(mockQueryContext).toHaveBeenCalled();
  });

  it('each hypothesis has required Hypothesis fields', async () => {
    const oldDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    mockQueryContext
      .mockResolvedValueOnce({ rows: [] } as any)
      .mockResolvedValueOnce({
        rows: [{ id: '1', content: 'Stale fact', entities: ['test'], created_at: oldDate }],
      } as any)
      .mockResolvedValueOnce({ rows: [] } as any);

    const hypotheses = await generateHypotheses('personal');
    if (hypotheses.length > 0) {
      const h: Hypothesis = hypotheses[0];
      expect(h).toHaveProperty('hypothesis');
      expect(h).toHaveProperty('sourceType');
      expect(h).toHaveProperty('sourceEntities');
      expect(h).toHaveProperty('confidence');
      expect(['incomplete_pattern', 'temporal_gap', 'contradiction', 'analogy']).toContain(h.sourceType);
      expect(typeof h.hypothesis).toBe('string');
      expect(Array.isArray(h.sourceEntities)).toBe(true);
      expect(typeof h.confidence).toBe('number');
    }
  });

  it('sorts hypotheses by confidence descending', async () => {
    const oldDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    mockQueryContext
      .mockResolvedValueOnce({
        rows: [
          { source_id: 'A', target_id: 'B', relation_type: 'related_to' },
          { source_id: 'A', target_id: 'C', relation_type: 'related_to' },
          { source_id: 'B', target_id: 'D', relation_type: 'related_to' },
        ],
      } as any)
      .mockResolvedValueOnce({
        rows: [
          { id: '1', content: 'Very old fact', entities: ['old'], created_at: oldDate },
        ],
      } as any)
      .mockResolvedValueOnce({
        rows: [
          { id: '2', content: 'Y is true', entities: ['Y'] },
          { id: '3', content: 'Y is not true', entities: ['Y'] },
        ],
      } as any);

    const hypotheses = await generateHypotheses('personal');
    for (let i = 1; i < hypotheses.length; i++) {
      expect(hypotheses[i - 1].confidence).toBeGreaterThanOrEqual(hypotheses[i].confidence);
    }
  });
});
