/**
 * Hindsight write-side hooks (Phase H4 prod-binding F+G) tests.
 *
 * Covers:
 *   - extractEntitiesFromFact: capitalised non-stop tokens, dedup, sort
 *   - detectBeliefDrafts: pattern firing per factType + content shape
 *   - contributeFactToEntitySummaries: per-entity summary updates,
 *     maxContributionsPerFact cap, error resilience
 *   - contributeFactToBeliefs: insert-when-new, bump-when-existing
 *     match by claim-prefix
 *   - contributeFact: composed hook with env-flag gate + per-call
 *     enable/disable + per-call enableBeliefExtraction
 */

import {
  contributeFact,
  contributeFactToEntitySummaries,
  contributeFactToBeliefs,
  detectBeliefDrafts,
  extractEntitiesFromFact,
  BELIEF_PATTERNS,
} from '../../../../services/memory/hindsight-networks/write-side-hooks';
import {
  createInMemoryEntitySummaryStore,
} from '../../../../services/memory/hindsight-networks/entity-summaries';
import {
  createInMemoryBeliefStore,
} from '../../../../services/memory/hindsight-networks/evolving-beliefs';
import type {
  PersonalizationFact,
} from '../../../../services/memory/ltm-types';

function makeFact(overrides: Partial<PersonalizationFact> = {}): PersonalizationFact {
  return {
    id: 'fact-1',
    factType: 'preference',
    content: 'Caroline prefers Italian food',
    confidence: 0.85,
    source: 'inferred',
    firstSeen: new Date('2024-01-01'),
    lastConfirmed: new Date('2024-06-01'),
    occurrences: 1,
    retrievalCount: 0,
    lastRetrieved: null,
    decayClass: 'normal_decay',
    ...overrides,
  };
}

describe('extractEntitiesFromFact', () => {
  it('captures capitalised non-stop tokens', () => {
    const out = extractEntitiesFromFact('Caroline prefers Italian food at Stanford');
    expect(out).toContain('caroline');
    expect(out).toContain('italian');
    expect(out).toContain('stanford');
  });

  it('skips ALL-CAPS (treated as acronyms)', () => {
    const out = extractEntitiesFromFact('Caroline used GPS');
    expect(out).toContain('caroline');
    expect(out).not.toContain('gps');
  });

  it('case-folds + dedupes + sorts', () => {
    const out = extractEntitiesFromFact('Caroline met Bob and CAROLINE again');
    expect(out).toEqual(expect.arrayContaining(['bob', 'caroline']));
    expect(out.filter((e) => e === 'caroline').length).toBe(1);
  });

  it('empty / whitespace input → empty', () => {
    expect(extractEntitiesFromFact('')).toEqual([]);
    expect(extractEntitiesFromFact('   ')).toEqual([]);
    expect(extractEntitiesFromFact(null as unknown as string)).toEqual([]);
  });
});

describe('BELIEF_PATTERNS', () => {
  it('exports preference + aversion patterns', () => {
    expect(BELIEF_PATTERNS.length).toBeGreaterThanOrEqual(4);
    const directions = new Set(BELIEF_PATTERNS.map((p) => p.direction));
    expect(directions.has('for')).toBe(true);
  });

  it('every pattern has a claim template', () => {
    for (const p of BELIEF_PATTERNS) {
      expect(typeof p.claimTemplate).toBe('string');
      expect(p.claimTemplate.length).toBeGreaterThan(0);
    }
  });
});

describe('detectBeliefDrafts', () => {
  it('factType=knowledge → no drafts (only preference/goal/behavior fire)', () => {
    const fact = makeFact({ factType: 'knowledge', content: 'Caroline prefers Italian food' });
    expect(detectBeliefDrafts(fact)).toEqual([]);
  });

  it('factType=preference + "prefers" → draft with for direction', () => {
    const fact = makeFact({ content: 'Caroline prefers Italian food' });
    const drafts = detectBeliefDrafts(fact);
    expect(drafts.length).toBe(1);
    expect(drafts[0].entityId).toBe('caroline');
    expect(drafts[0].direction).toBe('for');
    expect(drafts[0].claim).toContain('prefers:');
  });

  it('"likes" matches the like pattern', () => {
    const fact = makeFact({ content: 'Bob likes coffee' });
    const drafts = detectBeliefDrafts(fact);
    expect(drafts.length).toBe(1);
    expect(drafts[0].claim).toContain('likes:');
  });

  it('"dislikes" matches the dislike pattern', () => {
    const fact = makeFact({ content: 'Bob dislikes crowded restaurants' });
    const drafts = detectBeliefDrafts(fact);
    expect(drafts.length).toBe(1);
    expect(drafts[0].claim).toContain('dislikes:');
  });

  it('"thinks" matches with factType=behavior', () => {
    const fact = makeFact({
      factType: 'behavior',
      content: 'Caroline thinks the project is risky',
    });
    const drafts = detectBeliefDrafts(fact);
    expect(drafts.length).toBe(1);
    expect(drafts[0].claim).toContain('thinks:');
  });

  it('no entity in content → no drafts', () => {
    const fact = makeFact({ content: 'someone prefers coffee' });
    const drafts = detectBeliefDrafts(fact);
    expect(drafts).toEqual([]);
  });

  it('no pattern fires → no drafts', () => {
    const fact = makeFact({ factType: 'preference', content: 'Caroline ate dinner at 7pm' });
    expect(detectBeliefDrafts(fact)).toEqual([]);
  });

  it('multiple patterns fire → only first one wins (no double-counting)', () => {
    const fact = makeFact({ content: 'Caroline likes coffee but prefers tea' });
    const drafts = detectBeliefDrafts(fact);
    expect(drafts.length).toBe(1);
  });
});

describe('contributeFactToEntitySummaries', () => {
  it('one fact with one entity → one summary update', async () => {
    const store = createInMemoryEntitySummaryStore();
    // Use lowercase "italian" so only "Caroline" survives the entity filter.
    const fact = makeFact({ content: 'Caroline prefers italian food' });
    const count = await contributeFactToEntitySummaries(fact, store);
    expect(count).toBe(1);
    expect(store.size()).toBe(1);
    const summary = store.snapshot()[0];
    expect(summary.entityId).toBe('caroline');
    expect(summary.summary).toContain('Caroline prefers italian food');
  });

  it('multi-entity fact → one summary update per entity', async () => {
    const store = createInMemoryEntitySummaryStore();
    const fact = makeFact({
      content: 'Caroline met Bob at Stanford and they discussed AI',
    });
    const count = await contributeFactToEntitySummaries(fact, store);
    expect(count).toBeGreaterThanOrEqual(3); // caroline, bob, stanford
  });

  it('maxContributionsPerFact caps the entity count', async () => {
    const store = createInMemoryEntitySummaryStore();
    const fact = makeFact({
      content: 'Alice met Bob and Caroline and Dave at Stanford',
    });
    const count = await contributeFactToEntitySummaries(fact, store, {
      maxContributionsPerFact: 2,
    });
    expect(count).toBe(2);
  });

  it('no entities → 0 updates', async () => {
    const store = createInMemoryEntitySummaryStore();
    const fact = makeFact({ content: 'the user prefers coffee' });
    const count = await contributeFactToEntitySummaries(fact, store);
    expect(count).toBe(0);
  });

  it('store error → loop continues, returns partial count', async () => {
    let calls = 0;
    const errorStore: any = {
      get: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockImplementation(async () => {
        calls += 1;
        if (calls === 1) throw new Error('boom');
      }),
      search: jest.fn().mockResolvedValue([]),
    };
    const fact = makeFact({ content: 'Caroline met Bob' });
    const count = await contributeFactToEntitySummaries(fact, errorStore);
    // First entity errored, second succeeded → count=1.
    expect(count).toBe(1);
  });
});

describe('contributeFactToBeliefs', () => {
  it('new belief inserted when no existing match', async () => {
    const store = createInMemoryBeliefStore();
    const fact = makeFact({ content: 'Caroline prefers Italian food' });
    const count = await contributeFactToBeliefs(fact, store);
    expect(count).toBe(1);
    expect(store.size()).toBe(1);
    const stored = store.snapshot()[0];
    expect(stored.entityId).toBe('caroline');
    expect(stored.claim).toContain('prefers:');
    expect(stored.evidenceFor).toBe(1);
  });

  it('existing belief with matching prefix → applyEvidence (no new insert)', async () => {
    const store = createInMemoryBeliefStore();
    // Pre-seed with a "prefers" belief.
    const fact1 = makeFact({ content: 'Caroline prefers Italian' });
    await contributeFactToBeliefs(fact1, store);
    expect(store.size()).toBe(1);
    const initialFor = store.snapshot()[0].evidenceFor;

    // Second fact with same prefix → bump.
    const fact2 = makeFact({ content: 'Caroline prefers pasta', id: 'fact-2' });
    const count = await contributeFactToBeliefs(fact2, store);
    expect(count).toBe(1);
    expect(store.size()).toBe(1); // no new insert
    expect(store.snapshot()[0].evidenceFor).toBe(initialFor + 1);
  });

  it('different prefix → new belief inserted', async () => {
    const store = createInMemoryBeliefStore();
    await contributeFactToBeliefs(
      makeFact({ content: 'Caroline prefers Italian' }),
      store,
    );
    await contributeFactToBeliefs(
      makeFact({ id: 'fact-2', content: 'Caroline likes coffee' }),
      store,
    );
    expect(store.size()).toBe(2);
  });

  it('factType=knowledge → no drafts → 0 belief writes', async () => {
    const store = createInMemoryBeliefStore();
    const fact = makeFact({ factType: 'knowledge', content: 'Caroline prefers Italian' });
    const count = await contributeFactToBeliefs(fact, store);
    expect(count).toBe(0);
    expect(store.size()).toBe(0);
  });

  it('store error → caught, returns 0', async () => {
    const errorStore: any = {
      getById: jest.fn(),
      listActiveByEntity: jest.fn().mockResolvedValue([]),
      insert: jest.fn().mockRejectedValue(new Error('fk violation')),
      update: jest.fn(),
    };
    const fact = makeFact({ content: 'Caroline prefers tea' });
    const count = await contributeFactToBeliefs(fact, errorStore);
    expect(count).toBe(0);
  });
});

describe('contributeFact (composed hook)', () => {
  beforeEach(() => {
    delete process.env.H4_WRITE_HOOKS;
  });

  it('default-off → applied=false, zero counts', async () => {
    const summaryStore = createInMemoryEntitySummaryStore();
    const beliefStore = createInMemoryBeliefStore();
    const result = await contributeFact(
      makeFact({ content: 'Caroline prefers Italian' }),
      { entitySummaryStore: summaryStore, beliefStore },
    );
    expect(result.applied).toBe(false);
    expect(result.summaryUpdates).toBe(0);
    expect(result.beliefUpdates).toBe(0);
    expect(summaryStore.size()).toBe(0);
    expect(beliefStore.size()).toBe(0);
  });

  it('per-call enable=true → applies both networks', async () => {
    const summaryStore = createInMemoryEntitySummaryStore();
    const beliefStore = createInMemoryBeliefStore();
    const result = await contributeFact(
      makeFact({ content: 'Caroline prefers Italian' }),
      { entitySummaryStore: summaryStore, beliefStore },
      { enable: true },
    );
    expect(result.applied).toBe(true);
    expect(result.summaryUpdates).toBeGreaterThan(0);
    expect(result.beliefUpdates).toBeGreaterThan(0);
  });

  it('enableBeliefExtraction=false → only summary updates', async () => {
    const summaryStore = createInMemoryEntitySummaryStore();
    const beliefStore = createInMemoryBeliefStore();
    const result = await contributeFact(
      makeFact({ content: 'Caroline prefers Italian' }),
      { entitySummaryStore: summaryStore, beliefStore },
      { enable: true, enableBeliefExtraction: false },
    );
    expect(result.summaryUpdates).toBeGreaterThan(0);
    expect(result.beliefUpdates).toBe(0);
  });

  it('only entitySummaryStore wired → summary updates, beliefs skipped', async () => {
    const summaryStore = createInMemoryEntitySummaryStore();
    const result = await contributeFact(
      makeFact({ content: 'Caroline prefers Italian' }),
      { entitySummaryStore: summaryStore },
      { enable: true },
    );
    expect(result.summaryUpdates).toBeGreaterThan(0);
    expect(result.beliefUpdates).toBe(0);
  });

  it('env H4_WRITE_HOOKS=true at module load enables without per-call', async () => {
    const prev = process.env.H4_WRITE_HOOKS;
    process.env.H4_WRITE_HOOKS = 'true';
    jest.resetModules();
    const mod = await import(
      '../../../../services/memory/hindsight-networks/write-side-hooks'
    );
    const summaryStore = createInMemoryEntitySummaryStore();
    const beliefStore = createInMemoryBeliefStore();
    const result = await mod.contributeFact(
      makeFact({ content: 'Caroline prefers Italian' }),
      { entitySummaryStore: summaryStore, beliefStore },
    );
    expect(result.applied).toBe(true);

    if (prev === undefined) delete process.env.H4_WRITE_HOOKS;
    else process.env.H4_WRITE_HOOKS = prev;
    jest.resetModules();
  });

  it('per-call enable=false beats env=true', async () => {
    const prev = process.env.H4_WRITE_HOOKS;
    process.env.H4_WRITE_HOOKS = 'true';
    jest.resetModules();
    const mod = await import(
      '../../../../services/memory/hindsight-networks/write-side-hooks'
    );
    const summaryStore = createInMemoryEntitySummaryStore();
    const beliefStore = createInMemoryBeliefStore();
    const result = await mod.contributeFact(
      makeFact({ content: 'Caroline prefers Italian' }),
      { entitySummaryStore: summaryStore, beliefStore },
      { enable: false },
    );
    expect(result.applied).toBe(false);

    if (prev === undefined) delete process.env.H4_WRITE_HOOKS;
    else process.env.H4_WRITE_HOOKS = prev;
    jest.resetModules();
  });
});
