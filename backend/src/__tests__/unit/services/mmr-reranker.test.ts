/**
 * Tests for services/rag/mmr-reranker.
 *
 * Coverage:
 *   - λ = 1 → pure relevance (same as relevance-sort).
 *   - λ = 0 → pure diversity (most-different from selected).
 *   - λ = 0.5 → balanced selection.
 *   - k cap respected, k > N returns N items.
 *   - Empty / single-item inputs.
 *   - Dedup by itemId (first occurrence wins).
 *   - Custom itemId.
 *   - Defensive: bad λ throws, negative relevance allowed.
 *   - Pairwise-cache helper: O(1) lookups, fallback when missing.
 *   - cosineSimilarity: known cases + degenerate input.
 *
 * @module tests/unit/services/mmr-reranker
 */

import {
  mmrRerank,
  precomputePairwiseSimilarity,
  cosineSimilarity,
  type MMRItem,
  type MMRSimilarity,
} from '../../../services/rag/mmr-reranker';

// ===========================================================================
// Fixtures
// ===========================================================================

interface Doc {
  id: string;
  text: string;
}

const DOCS: Doc[] = [
  { id: 'd1', text: 'caroline birthday celebration' },        // relevance high, similar to d2
  { id: 'd2', text: 'caroline birthday party' },              // relevance high, similar to d1
  { id: 'd3', text: 'joanna spain trip' },                    // relevance mid, different topic
  { id: 'd4', text: 'caroline daughter graduation' },         // relevance mid, partially similar to d1/d2
  { id: 'd5', text: 'weather today is sunny' },               // relevance low, totally different
];

/** Naive Jaccard over whitespace tokens — deterministic, no embeddings. */
const jaccardSim: MMRSimilarity<Doc> = (a, b) => {
  const toksA = new Set(a.text.toLowerCase().split(/\s+/));
  const toksB = new Set(b.text.toLowerCase().split(/\s+/));
  const inter = new Set<string>();
  for (const t of toksA) if (toksB.has(t)) inter.add(t);
  const union = new Set<string>([...toksA, ...toksB]);
  return union.size === 0 ? 0 : inter.size / union.size;
};

const candidates: MMRItem<Doc>[] = [
  { item: DOCS[0], relevance: 0.95 },
  { item: DOCS[1], relevance: 0.93 },
  { item: DOCS[2], relevance: 0.50 },
  { item: DOCS[3], relevance: 0.55 },
  { item: DOCS[4], relevance: 0.10 },
];

// ===========================================================================
// Lambda variants
// ===========================================================================

describe('mmrRerank — lambda variants', () => {
  it('λ = 1.0 returns items in pure relevance order', () => {
    const r = mmrRerank(candidates, { lambda: 1.0, similarity: jaccardSim, itemId: (d) => d.id });
    expect(r.map((c) => c.item.id)).toEqual(['d1', 'd2', 'd4', 'd3', 'd5']);
  });

  it('λ = 0.0 maximises diversity (different topics rank earlier)', () => {
    const r = mmrRerank(candidates, { lambda: 0.0, similarity: jaccardSim, itemId: (d) => d.id });
    // First pick: highest relevance (d1) — at λ=0 the first pick still
    // uses pure relevance because there's no "selected" set yet.
    expect(r[0].item.id).toBe('d1');
    // Second pick: max-diverse from d1. Both d3 and d5 have jaccard=0
    // with d1 — they're tied on the diversity term. The deterministic
    // tie-break inside mmrRerank picks the one earlier in the pool
    // (= higher original relevance), so d3 (rel 0.50) wins over d5
    // (rel 0.10). What matters: it must NOT be d2 (the near-duplicate).
    expect(['d3', 'd5']).toContain(r[1].item.id);
    expect(r[1].item.id).not.toBe('d2');
    // d2 (the near-duplicate of d1) should appear LATE.
    const d1Pos = r.findIndex((c) => c.item.id === 'd1');
    const d2Pos = r.findIndex((c) => c.item.id === 'd2');
    const d3Pos = r.findIndex((c) => c.item.id === 'd3');
    expect(d2Pos).toBeGreaterThan(d3Pos);
    expect(d2Pos).toBeGreaterThan(d1Pos + 1);
  });

  it('λ = 0.5 trades relevance for diversity (d5 below near-duplicate d2)', () => {
    const r = mmrRerank(candidates, { lambda: 0.5, similarity: jaccardSim, itemId: (d) => d.id });
    // Top is still d1 (highest relevance).
    expect(r[0].item.id).toBe('d1');
    // d2 is 0.93 relevance but high jaccard with d1. d3 is 0.50
    // relevance, low jaccard. With λ = 0.5, d3's penalty is much
    // smaller → d3 should rank above d2.
    const d2Pos = r.findIndex((c) => c.item.id === 'd2');
    const d3Pos = r.findIndex((c) => c.item.id === 'd3');
    expect(d3Pos).toBeLessThan(d2Pos);
  });
});

// ===========================================================================
// k cap & defensive
// ===========================================================================

describe('mmrRerank — k cap & defensive', () => {
  it('k = 2 returns 2 items', () => {
    const r = mmrRerank(candidates, { k: 2, similarity: jaccardSim, itemId: (d) => d.id });
    expect(r.length).toBe(2);
  });

  it('k > N returns N items', () => {
    const r = mmrRerank(candidates, { k: 99, similarity: jaccardSim, itemId: (d) => d.id });
    expect(r.length).toBe(candidates.length);
  });

  it('k = 0 returns empty', () => {
    const r = mmrRerank(candidates, { k: 0, similarity: jaccardSim, itemId: (d) => d.id });
    expect(r).toEqual([]);
  });

  it('empty candidates returns empty', () => {
    const r = mmrRerank([], { similarity: jaccardSim, itemId: (d: Doc) => d.id });
    expect(r).toEqual([]);
  });

  it('single candidate returns it', () => {
    const r = mmrRerank([candidates[0]], { similarity: jaccardSim, itemId: (d) => d.id });
    expect(r.length).toBe(1);
    expect(r[0].item.id).toBe('d1');
  });

  it('throws when lambda < 0', () => {
    expect(() => mmrRerank(candidates, { lambda: -0.1, similarity: jaccardSim, itemId: (d) => d.id }))
      .toThrow(/lambda/);
  });

  it('throws when lambda > 1', () => {
    expect(() => mmrRerank(candidates, { lambda: 1.5, similarity: jaccardSim, itemId: (d) => d.id }))
      .toThrow(/lambda/);
  });

  it('allows negative relevance (some retrievers report distance)', () => {
    const negCands: MMRItem<Doc>[] = [
      { item: DOCS[0], relevance: -0.1 },
      { item: DOCS[1], relevance: -0.2 },
    ];
    const r = mmrRerank(negCands, { similarity: jaccardSim, itemId: (d) => d.id });
    expect(r.length).toBe(2);
    expect(r[0].item.id).toBe('d1'); // higher (less negative) relevance first
  });
});

// ===========================================================================
// Dedup & itemId
// ===========================================================================

describe('mmrRerank — dedup', () => {
  it('deduplicates by itemId, first occurrence wins', () => {
    const dupCands: MMRItem<Doc>[] = [
      { item: DOCS[0], relevance: 0.95 },
      { item: DOCS[0], relevance: 0.10 }, // duplicate, lower relevance
      { item: DOCS[1], relevance: 0.50 },
    ];
    const r = mmrRerank(dupCands, { similarity: jaccardSim, itemId: (d) => d.id });
    expect(r.length).toBe(2);
    // The high-relevance d1 is kept, not the low-relevance duplicate.
    expect(r[0].item.id).toBe('d1');
    expect(r[0].relevance).toBe(0.95);
  });

  it('uses default itemId from .id property', () => {
    const r = mmrRerank(candidates, { similarity: jaccardSim });
    expect(r[0].item.id).toBe('d1');
  });

  it('uses default JSON.stringify when no .id', () => {
    type Bare = { text: string };
    const bareItems: MMRItem<Bare>[] = [
      { item: { text: 'a' }, relevance: 1 },
      { item: { text: 'b' }, relevance: 0.5 },
    ];
    const r = mmrRerank(bareItems, { similarity: () => 0.1 });
    expect(r.length).toBe(2);
  });

  it('skips items whose itemId returns empty string', () => {
    const noisy: MMRItem<Doc>[] = [
      { item: { id: '', text: 'noise' }, relevance: 1 },
      { item: DOCS[0], relevance: 0.5 },
    ];
    const r = mmrRerank(noisy, { similarity: jaccardSim, itemId: (d) => d.id });
    expect(r.length).toBe(1);
    expect(r[0].item.id).toBe('d1');
  });
});

// ===========================================================================
// Determinism
// ===========================================================================

describe('mmrRerank — determinism', () => {
  it('produces identical output across runs (same input)', () => {
    const r1 = mmrRerank(candidates, { lambda: 0.5, similarity: jaccardSim, itemId: (d) => d.id });
    const r2 = mmrRerank(candidates, { lambda: 0.5, similarity: jaccardSim, itemId: (d) => d.id });
    expect(r1.map((c) => c.item.id)).toEqual(r2.map((c) => c.item.id));
  });

  it('breaks ties on relevance alphabetically (initial pick)', () => {
    const tied: MMRItem<Doc>[] = [
      { item: { id: 'z', text: 'foo' }, relevance: 1.0 },
      { item: { id: 'a', text: 'bar' }, relevance: 1.0 },
      { item: { id: 'm', text: 'baz' }, relevance: 1.0 },
    ];
    const r = mmrRerank(tied, { similarity: () => 0.0, itemId: (d) => d.id });
    expect(r[0].item.id).toBe('a'); // alphabetical first
  });
});

// ===========================================================================
// precomputePairwiseSimilarity
// ===========================================================================

describe('precomputePairwiseSimilarity', () => {
  it('returns a function that gives identical results to the source sim', () => {
    const cached = precomputePairwiseSimilarity(DOCS, jaccardSim, (d) => d.id);
    for (let i = 0; i < DOCS.length; i++) {
      for (let j = 0; j < DOCS.length; j++) {
        expect(cached(DOCS[i], DOCS[j])).toBeCloseTo(jaccardSim(DOCS[i], DOCS[j]), 9);
      }
    }
  });

  it('returns 1.0 on self-similarity', () => {
    const cached = precomputePairwiseSimilarity(DOCS, jaccardSim, (d) => d.id);
    expect(cached(DOCS[0], DOCS[0])).toBe(1.0);
  });

  it('falls back to live similarity when item not in precomputed set', () => {
    const ghost: Doc = { id: 'ghost', text: 'unknown' };
    const cached = precomputePairwiseSimilarity(DOCS, jaccardSim, (d) => d.id);
    // Should still return a value (live computation), not throw.
    const v = cached(ghost, DOCS[0]);
    expect(v).toBeCloseTo(jaccardSim(ghost, DOCS[0]), 9);
  });
});

// ===========================================================================
// cosineSimilarity
// ===========================================================================

describe('cosineSimilarity', () => {
  it('returns 1 for identical vectors', () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 9);
  });

  it('returns 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 9);
  });

  it('returns -1 for anti-parallel vectors', () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1, 9);
  });

  it('returns 0 on length mismatch', () => {
    expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
  });

  it('returns 0 on empty input', () => {
    expect(cosineSimilarity([], [])).toBe(0);
  });

  it('returns 0 on zero vector', () => {
    expect(cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0);
  });
});
