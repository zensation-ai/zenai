/**
 * Hindsight Network 1 — World Facts (Phase H4.1) tests.
 *
 * Covers:
 *   - SHA-256 hash determinism + normalisation (case / whitespace / entity order)
 *   - addWorldFact: dedup by hash → bump occurrences, new content → insert
 *   - forceInsert overrides dedup
 *   - recallWorldFacts: sort by occurrences DESC, confidence DESC, id ascend
 *   - requireEntity filter
 *   - Defensive (empty content, NaN confidence, empty entities)
 */

import {
  addWorldFact,
  recallWorldFacts,
  computeWorldFactHash,
  createInMemoryWorldFactStore,
  WORLD_FACT_PREFIX,
  WORLD_FACT_NETWORK,
  type WorldFact,
} from '../../../../services/memory/hindsight-networks/world-facts';

describe('computeWorldFactHash — normalisation contract', () => {
  it('different content → different hash', () => {
    const a = computeWorldFactHash('Stanford is in California');
    const b = computeWorldFactHash('Stanford is in Texas');
    expect(a).not.toBe(b);
  });

  it('case-insensitive', () => {
    const a = computeWorldFactHash('Stanford is in California');
    const b = computeWorldFactHash('stanford IS in california');
    expect(a).toBe(b);
  });

  it('whitespace-insensitive (collapsed runs + trimmed)', () => {
    const a = computeWorldFactHash('Stanford is  in California');
    const b = computeWorldFactHash('  Stanford is in California  ');
    expect(a).toBe(b);
  });

  it('entity order does NOT affect hash', () => {
    const a = computeWorldFactHash('X mentions Y', ['Alice', 'Bob']);
    const b = computeWorldFactHash('X mentions Y', ['Bob', 'Alice']);
    expect(a).toBe(b);
  });

  it('entity case + whitespace + dupes normalised before hashing', () => {
    const a = computeWorldFactHash('X', ['ALICE', '  bob ', 'alice']);
    const b = computeWorldFactHash('X', ['Alice', 'Bob']);
    expect(a).toBe(b);
  });

  it('different entities → different hash', () => {
    const a = computeWorldFactHash('X', ['Alice']);
    const b = computeWorldFactHash('X', ['Bob']);
    expect(a).not.toBe(b);
  });

  it('64-char hex output', () => {
    const h = computeWorldFactHash('test');
    expect(h).toMatch(/^[a-f0-9]{64}$/);
  });

  it('null / undefined / empty content → still produces a hash', () => {
    // Defensive: falsy inputs normalise to '' and still hash deterministically.
    const a = computeWorldFactHash('');
    const b = computeWorldFactHash(null as unknown as string);
    const c = computeWorldFactHash(undefined as unknown as string);
    expect(a).toBe(b);
    expect(b).toBe(c);
  });
});

describe('verbatim constants', () => {
  it('WORLD_FACT_PREFIX is the expected sentinel', () => {
    expect(WORLD_FACT_PREFIX).toBe('[world_fact] ');
  });
  it('WORLD_FACT_NETWORK is the expected network identifier', () => {
    expect(WORLD_FACT_NETWORK).toBe('world_facts');
  });
});

describe('addWorldFact — insert + dedup behaviour', () => {
  it('first call → inserted=true, deduplicated=false', async () => {
    const store = createInMemoryWorldFactStore();
    const r = await addWorldFact('Stanford is in California', store);
    expect(r.inserted).toBe(true);
    expect(r.deduplicated).toBe(false);
    expect(r.id).toBeTruthy();
    expect(r.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(store.size()).toBe(1);
  });

  it('same content → deduplicated=true, occurrences bumped', async () => {
    const store = createInMemoryWorldFactStore();
    const r1 = await addWorldFact('X is Y', store);
    const r2 = await addWorldFact('X is Y', store);
    expect(r1.id).toBe(r2.id);
    expect(r2.deduplicated).toBe(true);
    expect(r2.inserted).toBe(false);
    expect(store.size()).toBe(1);
    const snap = store.snapshot();
    expect(snap[0].occurrences).toBe(2);
  });

  it('different case → still dedup (normalised hash)', async () => {
    const store = createInMemoryWorldFactStore();
    await addWorldFact('Stanford is in California', store);
    const r = await addWorldFact('STANFORD is IN california', store);
    expect(r.deduplicated).toBe(true);
    expect(store.size()).toBe(1);
  });

  it('forceInsert=true bypasses dedup', async () => {
    const store = createInMemoryWorldFactStore();
    await addWorldFact('X is Y', store);
    const r = await addWorldFact('X is Y', store, { forceInsert: true });
    expect(r.inserted).toBe(true);
    expect(store.size()).toBe(2);
  });

  it('different entities for same content → different hash → 2 rows', async () => {
    const store = createInMemoryWorldFactStore();
    await addWorldFact('X is Y', store, { entities: ['Alice'] });
    const r = await addWorldFact('X is Y', store, { entities: ['Bob'] });
    expect(r.inserted).toBe(true);
    expect(store.size()).toBe(2);
  });

  it('confidence clamped to [0, 1]', async () => {
    const store = createInMemoryWorldFactStore();
    const r1 = await addWorldFact('A', store, { confidence: 1.5 });
    const r2 = await addWorldFact('B', store, { confidence: -0.2 });
    const r3 = await addWorldFact('C', store, { confidence: NaN });
    const snap = store.snapshot();
    const a = snap.find((f) => f.id === r1.id)!;
    const b = snap.find((f) => f.id === r2.id)!;
    const c = snap.find((f) => f.id === r3.id)!;
    expect(a.confidence).toBe(1);
    expect(b.confidence).toBe(0);
    expect(c.confidence).toBe(0);
  });

  it('empty content → throws', async () => {
    const store = createInMemoryWorldFactStore();
    await expect(addWorldFact('', store)).rejects.toThrow(/non-empty/);
    await expect(addWorldFact('   ', store)).rejects.toThrow(/non-empty/);
  });

  it('content trimmed before persistence', async () => {
    const store = createInMemoryWorldFactStore();
    await addWorldFact('  X is Y  ', store);
    const snap = store.snapshot();
    expect(snap[0].content).toBe('X is Y');
  });

  it('first / last timestamps set on insert + bumped on dedup', async () => {
    const store = createInMemoryWorldFactStore();
    const r1 = await addWorldFact('X', store);
    const t1 = store.snapshot()[0].lastConfirmed.getTime();
    await new Promise((r) => setTimeout(r, 5));
    await addWorldFact('X', store);
    const t2 = store.snapshot()[0].lastConfirmed.getTime();
    expect(t2).toBeGreaterThanOrEqual(t1);
    // First-seen never moves on dedup.
    expect(store.snapshot()[0].firstSeen.getTime()).toBeLessThanOrEqual(t1);
    expect(r1.id).toBe(store.snapshot()[0].id);
  });
});

describe('recallWorldFacts — search + sort + filter', () => {
  async function setup(): Promise<ReturnType<typeof createInMemoryWorldFactStore>> {
    const store = createInMemoryWorldFactStore();
    // Seed 4 facts with controlled occurrences + confidences.
    await addWorldFact('Stanford is a university', store, { confidence: 0.9 });
    await addWorldFact('Stanford is in California', store, { confidence: 0.7 });
    // Bump occurrences on the second fact.
    await addWorldFact('Stanford is in California', store);
    await addWorldFact('Stanford is in California', store);
    await addWorldFact('Caroline lives in Madrid', store, {
      confidence: 0.6,
      entities: ['Caroline'],
    });
    await addWorldFact('Bob lives in Berlin', store, {
      confidence: 0.8,
      entities: ['Bob'],
    });
    return store;
  }

  it('sorts by occurrences DESC then confidence DESC', async () => {
    const store = await setup();
    const out = await recallWorldFacts('Stanford', store, { limit: 5 });
    expect(out.length).toBeGreaterThanOrEqual(2);
    // Stanford-California has occurrences=3, Stanford-university occurrences=1.
    expect(out[0].content).toContain('California');
    expect(out[1].content).toContain('university');
  });

  it('limit applied AFTER sort', async () => {
    const store = await setup();
    const out = await recallWorldFacts('Stanford', store, { limit: 1 });
    expect(out.length).toBe(1);
    expect(out[0].content).toContain('California');
  });

  it('requireEntity filter: only matches with that entity', async () => {
    const store = await setup();
    const out = await recallWorldFacts('lives', store, { requireEntity: 'Caroline' });
    expect(out.length).toBe(1);
    expect(out[0].content).toContain('Caroline');
  });

  it('requireEntity case-insensitive', async () => {
    const store = await setup();
    const out = await recallWorldFacts('lives', store, { requireEntity: 'BOB' });
    expect(out.length).toBe(1);
    expect(out[0].content).toContain('Bob');
  });

  it('empty query → empty result', async () => {
    const store = await setup();
    const out = await recallWorldFacts('', store);
    expect(out).toEqual([]);
  });

  it('non-matching query → empty result', async () => {
    const store = await setup();
    const out = await recallWorldFacts('nonexistent', store);
    expect(out).toEqual([]);
  });

  it('determinism: same input → same order', async () => {
    const store = await setup();
    const a = await recallWorldFacts('Stanford', store, { limit: 5 });
    const b = await recallWorldFacts('Stanford', store, { limit: 5 });
    expect(a.map((f: WorldFact) => f.id)).toEqual(b.map((f: WorldFact) => f.id));
  });
});
