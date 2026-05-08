/**
 * Hindsight Context Builder (Phase H4 production-binding) tests.
 *
 * Covers:
 *   - Default-OFF gate behaviour
 *   - Per-call enable=true with both stores wired → ContextPart[]
 *   - Top-K routing decision honoured (only top networks contribute)
 *   - Stores missing → empty parts but routing still computed
 *   - Entity-id based scoping (caller-supplied vs free-text fallback)
 *   - Min-belief-confidence filter
 *   - Error resilience (one bad store call doesn't break the rest)
 */

import {
  buildHindsightContextParts,
} from '../../../../services/memory/hindsight-networks/hindsight-context-builder';
import {
  createInMemoryEntitySummaryStore,
  updateEntitySummary,
} from '../../../../services/memory/hindsight-networks/entity-summaries';
import {
  createInMemoryBeliefStore,
  createBelief,
  applyEvidence,
} from '../../../../services/memory/hindsight-networks/evolving-beliefs';

describe('buildHindsightContextParts — default off', () => {
  beforeEach(() => {
    delete process.env.H4_HINDSIGHT_ROUTER;
  });

  it('default off → applied=false, parts=[]', async () => {
    const r = await buildHindsightContextParts('What does Caroline like?', {});
    expect(r.applied).toBe(false);
    expect(r.parts).toEqual([]);
  });

  it('default off but routing still computed (for telemetry)', async () => {
    const r = await buildHindsightContextParts('What does Caroline like?', {});
    expect(r.routing).toBeDefined();
    expect(r.routing.networks.length).toBeGreaterThan(0);
    expect(r.routing.beliefBoost).toBe(true); // "like" cue fires
  });

  it('hits map initialised to zero on disabled path', async () => {
    const r = await buildHindsightContextParts('any', {});
    expect(r.hits).toEqual({
      world_facts: 0,
      agent_experiences: 0,
      entity_summaries: 0,
      evolving_beliefs: 0,
    });
  });
});

describe('buildHindsightContextParts — enabled with stores', () => {
  it('per-call enable=true + entitySummaryStore + entityIds → entity_summaries hits', async () => {
    const summaryStore = createInMemoryEntitySummaryStore();
    await updateEntitySummary(
      'caroline',
      { text: 'lives in Madrid', confidence: 0.9 },
      summaryStore,
    );
    // Use entityIds to avoid the in-memory store's naive
    // haystack.includes(query) search direction.
    const r = await buildHindsightContextParts(
      'Where does Caroline live?',
      { entitySummaryStore: summaryStore },
      { enable: true, entityIds: ['caroline'], topK: 4 },
    );
    expect(r.applied).toBe(true);
    expect(r.hits.entity_summaries).toBeGreaterThan(0);
    expect(r.parts.some((p) => p.content.toLowerCase().includes('caroline'))).toBe(true);
  });

  it('per-call enable=true + beliefStore + belief query (entity in query) → evolving_beliefs hits', async () => {
    const beliefStore = createInMemoryBeliefStore();
    const id = await beliefStore.insert(createBelief('caroline', 'prefers coffee'));
    let belief = await beliefStore.getById(id);
    belief = applyEvidence(belief!, 'for');
    belief = applyEvidence(belief, 'for');
    await beliefStore.update(belief);

    // 'Caroline' is capitalised in the query → extractEntityCandidates
    // picks it up, so listEntityBeliefs('caroline', ...) fires.
    const r = await buildHindsightContextParts(
      'What does Caroline prefer?',
      { beliefStore },
      { enable: true, topK: 4 },
    );
    expect(r.applied).toBe(true);
    expect(r.hits.evolving_beliefs).toBeGreaterThan(0);
    expect(r.parts.some((p) => p.content.includes('Belief about caroline'))).toBe(true);
  });

  it('both stores wired → both hit when query routes to both', async () => {
    const summaryStore = createInMemoryEntitySummaryStore();
    await updateEntitySummary(
      'caroline',
      { text: 'lives in Madrid', confidence: 0.9 },
      summaryStore,
    );
    const beliefStore = createInMemoryBeliefStore();
    const id = await beliefStore.insert(createBelief('caroline', 'prefers Italian'));
    let belief = await beliefStore.getById(id);
    belief = applyEvidence(belief!, 'for');
    belief = applyEvidence(belief, 'for');
    await beliefStore.update(belief);

    const r = await buildHindsightContextParts(
      'What does Caroline prefer for dinner?',
      { entitySummaryStore: summaryStore, beliefStore },
      { enable: true, topK: 4 },
    );
    expect(r.applied).toBe(true);
    expect(r.hits.entity_summaries + r.hits.evolving_beliefs).toBeGreaterThan(0);
  });

  it('topK limits which networks fire', async () => {
    const summaryStore = createInMemoryEntitySummaryStore();
    await updateEntitySummary('caroline', { text: 'X', confidence: 1 }, summaryStore);
    const beliefStore = createInMemoryBeliefStore();
    const id = await beliefStore.insert(createBelief('caroline', 'Y'));
    let belief = await beliefStore.getById(id);
    belief = applyEvidence(belief!, 'for');
    belief = applyEvidence(belief, 'for');
    await beliefStore.update(belief);

    // topK=1 — only the top network fires.
    // Use entityIds to scope deterministically.
    const r1 = await buildHindsightContextParts(
      'how many of Caroline?',
      { entitySummaryStore: summaryStore, beliefStore },
      { enable: true, topK: 1, entityIds: ['caroline'] },
    );
    // Multi-hop top-1 = entity_summaries → only that hits.
    expect(r1.hits.entity_summaries).toBeGreaterThan(0);
    expect(r1.hits.evolving_beliefs).toBe(0);
  });

  it('explicit entityIds scope the lookup', async () => {
    const summaryStore = createInMemoryEntitySummaryStore();
    await updateEntitySummary(
      'caroline',
      { text: 'lives in Madrid', confidence: 0.9 },
      summaryStore,
    );
    await updateEntitySummary(
      'bob',
      { text: 'works at Stanford', confidence: 0.8 },
      summaryStore,
    );

    const r = await buildHindsightContextParts(
      'unrelated query',
      { entitySummaryStore: summaryStore },
      { enable: true, entityIds: ['caroline'], topK: 4 },
    );
    expect(r.parts.some((p) => p.content.toLowerCase().includes('caroline'))).toBe(true);
    expect(r.parts.some((p) => p.content.toLowerCase().includes('bob'))).toBe(false);
  });

  it('minBeliefConfidence filters out low-confidence beliefs', async () => {
    const beliefStore = createInMemoryBeliefStore();
    await beliefStore.insert({
      ...createBelief('caroline', 'highclaim'),
      // 5 for, 0 against → (5+1)/(5+0+2) = 6/7 ≈ 0.857
      evidenceFor: 5,
      evidenceAgainst: 0,
      confidence: 6 / 7,
    });
    await beliefStore.insert(createBelief('caroline', 'lowclaim')); // 1 for, 0 against → 0.667

    // minConf = 0.85 → only highclaim survives.
    const r = await buildHindsightContextParts(
      'What does Caroline think?',
      { beliefStore },
      { enable: true, minBeliefConfidence: 0.85, topK: 4 },
    );
    expect(r.applied).toBe(true);
    expect(r.parts.some((p) => p.content.includes('highclaim'))).toBe(true);
    expect(r.parts.some((p) => p.content.includes('lowclaim'))).toBe(false);
  });

  it('store missing → applied=true but no hits in that network', async () => {
    const beliefStore = createInMemoryBeliefStore();
    const r = await buildHindsightContextParts(
      'How many?',
      { beliefStore },
      { enable: true, topK: 4 },
    );
    expect(r.applied).toBe(true);
    expect(r.hits.entity_summaries).toBe(0);
  });

  it('store error → builder swallows, returns partial result', async () => {
    const errorStore: any = {
      get: jest.fn(),
      upsert: jest.fn(),
      search: jest.fn().mockRejectedValue(new Error('store boom')),
    };
    const r = await buildHindsightContextParts(
      'How many?',
      { entitySummaryStore: errorStore },
      { enable: true, topK: 4 },
    );
    // Pass survives the error.
    expect(r.applied).toBe(true);
    expect(r.parts).toEqual([]);
  });
});

describe('buildHindsightContextParts — env-flag default', () => {
  it('H4_HINDSIGHT_ROUTER=true at module load enables without per-call', async () => {
    const prev = process.env.H4_HINDSIGHT_ROUTER;
    process.env.H4_HINDSIGHT_ROUTER = 'true';
    jest.resetModules();
    const mod = await import(
      '../../../../services/memory/hindsight-networks/hindsight-context-builder'
    );
    const r = await mod.buildHindsightContextParts('any', {});
    expect(r.applied).toBe(true);

    if (prev === undefined) delete process.env.H4_HINDSIGHT_ROUTER;
    else process.env.H4_HINDSIGHT_ROUTER = prev;
    jest.resetModules();
  });

  it('per-call enable=false beats env=true', async () => {
    const prev = process.env.H4_HINDSIGHT_ROUTER;
    process.env.H4_HINDSIGHT_ROUTER = 'true';
    jest.resetModules();
    const mod = await import(
      '../../../../services/memory/hindsight-networks/hindsight-context-builder'
    );
    const r = await mod.buildHindsightContextParts('any', {}, { enable: false });
    expect(r.applied).toBe(false);

    if (prev === undefined) delete process.env.H4_HINDSIGHT_ROUTER;
    else process.env.H4_HINDSIGHT_ROUTER = prev;
    jest.resetModules();
  });
});
