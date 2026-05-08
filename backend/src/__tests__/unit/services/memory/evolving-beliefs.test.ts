/**
 * Hindsight Network 4 — Evolving Beliefs (Phase H4.4) tests.
 *
 * Covers:
 *   - computeBeliefConfidence: Beta(α+1, β+1) posterior mean math,
 *     Laplace-smoothing properties (no 0/0, anchored at 0.50 on empty)
 *   - createBelief: initial direction nudges confidence above/below 0.50
 *   - applyEvidence: in-place increments, recomputed confidence, no-mutate
 *   - markSuperseded: pure, sets supersededAt + supersededBy
 *   - updateBelief: read-apply-write cycle, auto-supersede below threshold,
 *     successor claim insertion, defensive errors
 *   - listEntityBeliefs: filter by entity, sort by confidence DESC,
 *     min-confidence filter, limit
 */

import {
  computeBeliefConfidence,
  createBelief,
  applyEvidence,
  markSuperseded,
  updateBelief,
  listEntityBeliefs,
  createInMemoryBeliefStore,
  EVOLVING_BELIEF_NETWORK,
  DEFAULT_ABANDONMENT_THRESHOLD,
} from '../../../../services/memory/hindsight-networks/evolving-beliefs';

describe('verbatim constants', () => {
  it('EVOLVING_BELIEF_NETWORK identifier', () => {
    expect(EVOLVING_BELIEF_NETWORK).toBe('evolving_beliefs');
  });
  it('DEFAULT_ABANDONMENT_THRESHOLD = 0.30', () => {
    expect(DEFAULT_ABANDONMENT_THRESHOLD).toBe(0.30);
  });
});

describe('computeBeliefConfidence — Beta(α+1, β+1) posterior mean', () => {
  it('empty (0, 0) → 0.50 (uninformative prior)', () => {
    expect(computeBeliefConfidence(0, 0)).toBe(0.5);
  });
  it('1 for, 0 against → 2/3 ≈ 0.667', () => {
    expect(computeBeliefConfidence(1, 0)).toBeCloseTo(2 / 3, 5);
  });
  it('0 for, 1 against → 1/3 ≈ 0.333', () => {
    expect(computeBeliefConfidence(0, 1)).toBeCloseTo(1 / 3, 5);
  });
  it('balanced 5+5 → exactly 0.50', () => {
    expect(computeBeliefConfidence(5, 5)).toBe(0.5);
  });
  it('strongly confident 10 for, 0 against → 11/12', () => {
    expect(computeBeliefConfidence(10, 0)).toBeCloseTo(11 / 12, 5);
  });
  it('symmetric: f(a, b) = 1 - f(b, a)', () => {
    for (const [a, b] of [[1, 3], [5, 2], [10, 7], [0, 8]]) {
      expect(computeBeliefConfidence(a, b) + computeBeliefConfidence(b, a)).toBeCloseTo(1, 5);
    }
  });
  it('NaN / Infinity defensive (treated as 0)', () => {
    expect(computeBeliefConfidence(NaN, 0)).toBe(0.5);
    expect(computeBeliefConfidence(0, NaN)).toBe(0.5);
    expect(computeBeliefConfidence(-5, 0)).toBe(0.5); // negative clamped to 0
  });
  it('output always in (0, 1) — never exactly 0 or 1', () => {
    for (const [a, b] of [[1000, 0], [0, 1000], [100, 1], [1, 100]]) {
      const c = computeBeliefConfidence(a, b);
      expect(c).toBeGreaterThan(0);
      expect(c).toBeLessThan(1);
    }
  });
});

describe('createBelief', () => {
  it('initial direction "for" → confidence > 0.50', () => {
    const b = createBelief('caroline', 'lives in Madrid', 'for');
    expect(b.confidence).toBeCloseTo(2 / 3, 5);
    expect(b.evidenceFor).toBe(1);
    expect(b.evidenceAgainst).toBe(0);
  });

  it('initial direction "against" → confidence < 0.50', () => {
    const b = createBelief('caroline', 'lives in Madrid', 'against');
    expect(b.confidence).toBeCloseTo(1 / 3, 5);
    expect(b.evidenceFor).toBe(0);
    expect(b.evidenceAgainst).toBe(1);
  });

  it('default direction is "for"', () => {
    const b = createBelief('caroline', 'lives in Madrid');
    expect(b.evidenceFor).toBe(1);
  });

  it('entityId normalised to lowercase + trimmed', () => {
    const b = createBelief('  Caroline Smith  ', 'X');
    expect(b.entityId).toBe('caroline smith');
  });

  it('claim trimmed', () => {
    const b = createBelief('x', '  X is Y  ');
    expect(b.claim).toBe('X is Y');
  });

  it('throws on empty entityId', () => {
    expect(() => createBelief('', 'X')).toThrow(/entityId/);
  });

  it('throws on empty claim', () => {
    expect(() => createBelief('x', '   ')).toThrow(/claim/);
  });

  it('lastRevised is set, supersededAt/By null', () => {
    const b = createBelief('x', 'X');
    expect(b.lastRevised).toBeInstanceOf(Date);
    expect(b.supersededAt).toBeNull();
    expect(b.supersededBy).toBeNull();
  });
});

describe('applyEvidence — pure increment', () => {
  it('"for" increments evidenceFor + recomputes confidence', () => {
    const b = { ...createBelief('x', 'X'), beliefId: 'b-1' };
    const updated = applyEvidence(b, 'for');
    expect(updated.evidenceFor).toBe(2);
    expect(updated.evidenceAgainst).toBe(0);
    expect(updated.confidence).toBeCloseTo(3 / 4, 5);
  });

  it('"against" increments evidenceAgainst + drops confidence', () => {
    const b = { ...createBelief('x', 'X', 'for'), beliefId: 'b-1' };
    expect(b.confidence).toBeCloseTo(2 / 3, 5);
    const updated = applyEvidence(b, 'against');
    expect(updated.evidenceAgainst).toBe(1);
    expect(updated.confidence).toBeCloseTo(2 / 4, 5); // (1+1) / (1+1+2)
  });

  it('does NOT mutate input', () => {
    const b = { ...createBelief('x', 'X'), beliefId: 'b-1' };
    const oldFor = b.evidenceFor;
    const oldAgainst = b.evidenceAgainst;
    applyEvidence(b, 'against');
    expect(b.evidenceFor).toBe(oldFor);
    expect(b.evidenceAgainst).toBe(oldAgainst);
  });

  it('lastRevised bumped on each evidence', () => {
    const b = { ...createBelief('x', 'X'), beliefId: 'b-1', lastRevised: new Date(0) };
    const updated = applyEvidence(b, 'for');
    expect(updated.lastRevised.getTime()).toBeGreaterThan(0);
  });
});

describe('markSuperseded — pure', () => {
  it('sets supersededAt + supersededBy + lastRevised', () => {
    const b = { ...createBelief('x', 'X'), beliefId: 'b-1' };
    const at = new Date('2024-06-01');
    const sup = markSuperseded(b, 'b-2', at);
    expect(sup.supersededAt).toEqual(at);
    expect(sup.supersededBy).toBe('b-2');
    expect(sup.lastRevised).toEqual(at);
  });

  it('null successor allowed (just deprecation)', () => {
    const b = { ...createBelief('x', 'X'), beliefId: 'b-1' };
    const sup = markSuperseded(b, null);
    expect(sup.supersededBy).toBeNull();
    expect(sup.supersededAt).not.toBeNull();
  });

  it('does NOT mutate input', () => {
    const b = { ...createBelief('x', 'X'), beliefId: 'b-1' };
    markSuperseded(b, null);
    expect(b.supersededAt).toBeNull();
  });
});

describe('updateBelief — read-apply-write cycle', () => {
  it('reads, applies, writes', async () => {
    const store = createInMemoryBeliefStore();
    const id = await store.insert(createBelief('caroline', 'lives in Madrid'));
    const updated = await updateBelief(id, 'for', store);
    expect(updated.evidenceFor).toBe(2);
    expect(updated.confidence).toBeCloseTo(3 / 4, 5);

    // Persistence check.
    const persisted = await store.getById(id);
    expect(persisted!.evidenceFor).toBe(2);
  });

  it('throws on unknown beliefId', async () => {
    const store = createInMemoryBeliefStore();
    await expect(updateBelief('unknown', 'for', store)).rejects.toThrow(/not found/);
  });

  it('throws when belief is already superseded', async () => {
    const store = createInMemoryBeliefStore();
    const id = await store.insert(createBelief('x', 'X'));
    const fetched = await store.getById(id);
    await store.update(markSuperseded(fetched!, null));
    await expect(updateBelief(id, 'for', store)).rejects.toThrow(/superseded/);
  });

  it('auto-supersedes when confidence < threshold AND ≥ 2 against', async () => {
    const store = createInMemoryBeliefStore();
    const id = await store.insert(createBelief('caroline', 'lives in Madrid', 'for'));
    // Hammer with against until below 0.30 threshold.
    let belief = await updateBelief(id, 'against', store);
    expect(belief.supersededAt).toBeNull(); // 1 against, conf still > threshold
    belief = await updateBelief(id, 'against', store);
    belief = await updateBelief(id, 'against', store);
    belief = await updateBelief(id, 'against', store);
    // (1 for, 4 against) → conf = 2/7 ≈ 0.286 < 0.30 → auto-supersede.
    expect(belief.supersededAt).not.toBeNull();
  });

  it('auto-supersede inserts successor when successorClaim supplied', async () => {
    const store = createInMemoryBeliefStore();
    const id = await store.insert(createBelief('caroline', 'lives in Madrid'));
    // Path to confidence < 0.30 from initial (1, 0): need 4 against
    // (1+1)/(1+4+2) = 2/7 ≈ 0.286 < 0.30.
    let belief = await updateBelief(id, 'against', store);
    belief = await updateBelief(id, 'against', store);
    belief = await updateBelief(id, 'against', store);
    belief = await updateBelief(id, 'against', store, {
      successorClaim: 'lives in Barcelona',
    });
    expect(belief.supersededAt).not.toBeNull();
    expect(belief.supersededBy).toBeTruthy();

    // Successor should exist in store.
    const successor = await store.getById(belief.supersededBy!);
    expect(successor).not.toBeNull();
    expect(successor!.claim).toBe('lives in Barcelona');
    expect(successor!.entityId).toBe('caroline');
  });

  it('auto-supersede uses caller-supplied successorBeliefId when provided', async () => {
    const store = createInMemoryBeliefStore();
    const successorId = await store.insert(createBelief('caroline', 'new claim'));
    const id = await store.insert(createBelief('caroline', 'old claim'));
    let belief = await updateBelief(id, 'against', store);
    belief = await updateBelief(id, 'against', store);
    belief = await updateBelief(id, 'against', store);
    belief = await updateBelief(id, 'against', store, { successorBeliefId: successorId });
    expect(belief.supersededBy).toBe(successorId);
  });

  it('threshold=0 disables auto-supersession', async () => {
    const store = createInMemoryBeliefStore();
    const id = await store.insert(createBelief('x', 'X'));
    for (let i = 0; i < 10; i++) {
      await updateBelief(id, 'against', store, { abandonmentThreshold: 0 });
    }
    const belief = await store.getById(id);
    expect(belief!.supersededAt).toBeNull();
  });
});

describe('listEntityBeliefs', () => {
  async function setup() {
    const store = createInMemoryBeliefStore();
    const id1 = await store.insert(createBelief('caroline', 'A'));
    const id2 = await store.insert(createBelief('caroline', 'B'));
    const id3 = await store.insert(createBelief('caroline', 'C'));
    const id4 = await store.insert(createBelief('bob', 'D'));
    // Push id1 high, id2 low, id3 medium.
    await updateBelief(id1, 'for', store);
    await updateBelief(id1, 'for', store);
    await updateBelief(id1, 'for', store);
    await updateBelief(id3, 'for', store);
    // id2 stays at default (1, 0) → conf ≈ 0.667
    return store;
  }

  it('returns active beliefs only', async () => {
    const store = await setup();
    const out = await listEntityBeliefs('caroline', store);
    expect(out.length).toBe(3); // id1, id2, id3
    for (const b of out) expect(b.supersededAt).toBeNull();
  });

  it('sorts by confidence DESC', async () => {
    const store = await setup();
    const out = await listEntityBeliefs('caroline', store);
    for (let i = 1; i < out.length; i++) {
      expect(out[i - 1].confidence).toBeGreaterThanOrEqual(out[i].confidence);
    }
  });

  it('filters out beliefs below minConfidence', async () => {
    const store = await setup();
    const out = await listEntityBeliefs('caroline', store, { minConfidence: 0.7 });
    for (const b of out) expect(b.confidence).toBeGreaterThanOrEqual(0.7);
  });

  it('case-folded entity lookup', async () => {
    const store = await setup();
    const out = await listEntityBeliefs('  CAROLINE  ', store);
    expect(out.length).toBe(3);
  });

  it('limit applied AFTER sort', async () => {
    const store = await setup();
    const out = await listEntityBeliefs('caroline', store, { limit: 1 });
    expect(out.length).toBe(1);
  });

  it('empty entityId → empty result', async () => {
    const store = await setup();
    const out = await listEntityBeliefs('   ', store);
    expect(out).toEqual([]);
  });

  it('only own entity returned', async () => {
    const store = await setup();
    const carolineOut = await listEntityBeliefs('caroline', store);
    const bobOut = await listEntityBeliefs('bob', store);
    expect(carolineOut.every((b) => b.entityId === 'caroline')).toBe(true);
    expect(bobOut.every((b) => b.entityId === 'bob')).toBe(true);
  });
});
