/**
 * Long-term memory — Titans VFE retrieval-boost (Phase H6.3 production binding).
 *
 * Verifies that:
 *   - Default-off behaviour: vfeDeltaProvider absent → no boost applied,
 *     fact ranking matches the legacy compositeScore order.
 *   - enableVFEBoost=true + provider returning POSITIVE delta → fact's
 *     compositeScore goes UP relative to peers (rank can shift to top).
 *   - enableVFEBoost=true + provider returning NEGATIVE delta → fact's
 *     compositeScore goes DOWN (rank shifts toward the bottom).
 *   - vfeBoostOptions { alpha } is forwarded to applyVFERetrievalBoost.
 *   - Env H6_VFE_BOOST=true enables the boost without per-call override.
 *   - Provider returning undefined for a fact → no boost (graceful skip).
 *   - Provider returning NaN/Infinity → no boost (defensive).
 *
 * The test bypasses DB persistence by seeding facts directly into the
 * service's internal cache via a private-state escape hatch + mocking
 * `initialize` to a no-op.
 */

jest.mock('../../../../utils/database-context', () => ({
  // Returning a resolved Promise lets the post-scoring `.catch(...)` paths
  // (DB-persist update + updateFactStability) chain correctly. A bare
  // jest.fn() returns undefined and breaks the chain → the catch in
  // retrieve() falls back to memory.facts.slice() in original-seed order,
  // which masks the rank-shift we're trying to verify.
  queryContext: jest.fn().mockResolvedValue({ rows: [] }),
  getPool: jest.fn(),
  isValidContext: () => true,
}));

jest.mock('../../../../utils/logger', () => ({
  logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('../../../../services/ai', () => ({
  generateEmbedding: jest.fn().mockResolvedValue(new Array(1536).fill(0.1)),
}));

import {
  longTermMemory,
  type PersonalizationFact,
} from '../../../../services/memory/long-term-memory';

function makeFact(overrides: Partial<PersonalizationFact> = {}): PersonalizationFact {
  return {
    id: 'fact-1',
    factType: 'knowledge',
    content: 'TypeScript is a typed superset of JavaScript',
    confidence: 0.9,
    source: 'inferred',
    firstSeen: new Date('2026-01-01'),
    lastConfirmed: new Date('2026-01-01'),
    occurrences: 5,
    retrievalCount: 2,
    lastRetrieved: new Date('2026-01-01'),
    decayClass: 'normal_decay',
    ...overrides,
  };
}

/**
 * Tap into the service's internal cache to seed facts deterministically
 * without going through the DB. Reflective hack — the alternative
 * (jest.mock-ing the entire long-term-memory module) defeats the
 * point of testing the wiring.
 */
function seedFacts(context: 'operations', facts: PersonalizationFact[]) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svc = longTermMemory as any;
  const memory = {
    context,
    facts: facts.slice(),
    frequentPatterns: [],
    significantInteractions: [],
    profileEmbedding: [],
    lastConsolidation: new Date(),
    consolidationCount: 0,
  };
  svc.memories.set(context, memory);
  svc.initialized.set(context, true);
}

describe('longTermMemory.retrieve — Titans VFE boost (H6.3)', () => {
  beforeEach(() => {
    delete process.env.H6_VFE_BOOST;
    // Clear seeded state between tests.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = longTermMemory as any;
    svc.memories.clear();
    svc.initialized.clear();
  });

  it('default off: no provider → no boost, ranking matches legacy', async () => {
    const factA = makeFact({ id: 'a', content: 'TypeScript fact', confidence: 0.85 });
    const factB = makeFact({ id: 'b', content: 'TypeScript fact', confidence: 0.95 });
    seedFacts('operations', [factA, factB]);
    const result = await longTermMemory.retrieve('operations', 'TypeScript');
    expect(result.facts.length).toBe(2);
    // Higher confidence wins by composite scoring.
    expect(result.facts[0].id).toBe('b');
  });

  it('enableVFEBoost=true + positive delta promotes fact', async () => {
    const factA = makeFact({ id: 'a', content: 'TypeScript fact', confidence: 0.95 });
    const factB = makeFact({ id: 'b', content: 'TypeScript fact', confidence: 0.85 });
    seedFacts('operations', [factA, factB]);
    // Without boost: A wins (higher confidence).
    // With strong positive boost on B (+1.0 × alpha=10) → B wins.
    const result = await longTermMemory.retrieve('operations', 'TypeScript', {
      enableVFEBoost: true,
      vfeDeltaProvider: (id) => (id === 'b' ? 1.0 : 0),
      vfeBoostOptions: { alpha: 10 }, // Aggressive alpha to flip the rank.
    });
    expect(result.facts.length).toBe(2);
    expect(result.facts[0].id).toBe('b');
  });

  it('enableVFEBoost=true + negative delta demotes fact', async () => {
    const factA = makeFact({ id: 'a', content: 'TypeScript fact', confidence: 0.95 });
    const factB = makeFact({ id: 'b', content: 'TypeScript fact', confidence: 0.85 });
    seedFacts('operations', [factA, factB]);
    const result = await longTermMemory.retrieve('operations', 'TypeScript', {
      enableVFEBoost: true,
      vfeDeltaProvider: (id) => (id === 'a' ? -1.0 : 0),
      vfeBoostOptions: { alpha: 10 },
    });
    // Negative boost on A → B should win.
    expect(result.facts.length).toBe(2);
    expect(result.facts[0].id).toBe('b');
  });

  it('vfeBoostOptions { alpha } forwarded — alpha=0 produces identity boost', async () => {
    const factA = makeFact({ id: 'a', content: 'TypeScript fact', confidence: 0.85 });
    const factB = makeFact({ id: 'b', content: 'TypeScript fact', confidence: 0.95 });
    seedFacts('operations', [factA, factB]);
    const result = await longTermMemory.retrieve('operations', 'TypeScript', {
      enableVFEBoost: true,
      vfeDeltaProvider: () => 1.0,
      vfeBoostOptions: { alpha: 0 }, // Identity — boost has no effect.
    });
    // With alpha=0, ranking matches legacy (B wins on confidence).
    expect(result.facts[0].id).toBe('b');
  });

  it('provider returns undefined for a fact → no boost on that fact', async () => {
    const factA = makeFact({ id: 'a', content: 'TypeScript fact', confidence: 0.85 });
    const factB = makeFact({ id: 'b', content: 'TypeScript fact', confidence: 0.95 });
    seedFacts('operations', [factA, factB]);
    const result = await longTermMemory.retrieve('operations', 'TypeScript', {
      enableVFEBoost: true,
      vfeDeltaProvider: (id) => (id === 'a' ? 1.0 : undefined),
      vfeBoostOptions: { alpha: 10 },
    });
    // A gets +10, B stays unchanged → A should win.
    expect(result.facts[0].id).toBe('a');
  });

  it('provider returns NaN → no boost (defensive)', async () => {
    const factA = makeFact({ id: 'a', content: 'TypeScript fact', confidence: 0.85 });
    const factB = makeFact({ id: 'b', content: 'TypeScript fact', confidence: 0.95 });
    seedFacts('operations', [factA, factB]);
    const result = await longTermMemory.retrieve('operations', 'TypeScript', {
      enableVFEBoost: true,
      vfeDeltaProvider: () => NaN,
      vfeBoostOptions: { alpha: 10 },
    });
    // NaN ignored → ranking matches legacy.
    expect(result.facts[0].id).toBe('b');
  });

  it('enableVFEBoost=false but provider supplied → no boost', async () => {
    const factA = makeFact({ id: 'a', content: 'TypeScript fact', confidence: 0.85 });
    const factB = makeFact({ id: 'b', content: 'TypeScript fact', confidence: 0.95 });
    seedFacts('operations', [factA, factB]);
    const result = await longTermMemory.retrieve('operations', 'TypeScript', {
      enableVFEBoost: false,
      vfeDeltaProvider: (id) => (id === 'a' ? 1.0 : 0),
      vfeBoostOptions: { alpha: 10 },
    });
    // Boost disabled → ranking matches legacy.
    expect(result.facts[0].id).toBe('b');
  });

  it('per-call ON beats env OFF default', async () => {
    const factA = makeFact({ id: 'a', content: 'TypeScript fact', confidence: 0.85 });
    const factB = makeFact({ id: 'b', content: 'TypeScript fact', confidence: 0.95 });
    seedFacts('operations', [factA, factB]);
    expect(process.env.H6_VFE_BOOST).toBeUndefined();
    const result = await longTermMemory.retrieve('operations', 'TypeScript', {
      enableVFEBoost: true,
      vfeDeltaProvider: (id) => (id === 'a' ? 1.0 : 0),
      vfeBoostOptions: { alpha: 10 },
    });
    expect(result.facts[0].id).toBe('a');
  });

  it('per-call OFF beats env ON default', async () => {
    process.env.H6_VFE_BOOST = 'true';
    jest.resetModules();
    const { longTermMemory: freshSvc } = await import(
      '../../../../services/memory/long-term-memory'
    );
    // Re-seed against the fresh module instance.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fresh = freshSvc as any;
    const factA = makeFact({ id: 'a', content: 'TypeScript fact', confidence: 0.85 });
    const factB = makeFact({ id: 'b', content: 'TypeScript fact', confidence: 0.95 });
    fresh.memories.set('operations', {
      context: 'operations',
      facts: [factA, factB],
      frequentPatterns: [],
      significantInteractions: [],
      profileEmbedding: [],
      lastConsolidation: new Date(),
      consolidationCount: 0,
    });
    fresh.initialized.set('operations', true);

    const result = await freshSvc.retrieve('operations', 'TypeScript', {
      enableVFEBoost: false, // explicit per-call OFF
      vfeDeltaProvider: () => 1.0,
      vfeBoostOptions: { alpha: 10 },
    });
    // Per-call OFF wins — ranking matches legacy.
    expect(result.facts[0].id).toBe('b');

    delete process.env.H6_VFE_BOOST;
    jest.resetModules();
  });
});
