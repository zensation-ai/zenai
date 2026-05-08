/**
 * Sleep worker — Hindsight reflect-cycle scheduler (Phase H4.H).
 *
 * Verifies:
 *   - `getHindsightReflectScheduleEntries` is OFF by default and returns
 *     four entries (one per context) when enabled.
 *   - `processHindsightReflectJob` no-ops when stores aren't wired,
 *     no-ops when the entity_summaries query is empty, and triggers a
 *     reflection pass when entities are present.
 *   - Errors from the DB query are caught and surfaced as a
 *     `'no_recent_entities'` skip marker (so BullMQ doesn't retry).
 *   - Per-call options for delay / offset / enable beat the env default.
 *   - Env `H4_REFLECT_CYCLE_SCHEDULED=true` enables scheduling without
 *     a per-call flag.
 *
 * Tests for the scheduler entry-tuple shape are pure (no module mocks);
 * tests for the job processor mock `queryContext` and the
 * `memory-coordinator` factory.
 */

// Module-level mocks — must precede the import-under-test. We avoid
// `requireActual` to sidestep circular-init of the database-context
// module's circuit-breaker singleton (lazy-loaded; reading it during
// jest mocking trips a TDZ).
const mockQueryContext = jest.fn();
jest.mock('../../../utils/database-context', () => ({
  queryContext: (...args: unknown[]) => mockQueryContext(...args),
}));

const mockGetStoresForContext = jest.fn();
jest.mock('../../../services/memory/memory-coordinator', () => ({
  getHindsightStoresForContext: (ctx: string) => mockGetStoresForContext(ctx),
}));

import {
  getHindsightReflectScheduleEntries,
  processHindsightReflectJob,
  type HindsightReflectResult,
} from '../../../services/queue/workers/sleep-worker';

const VALID_CONTEXTS = ['operations', 'finance', 'people', 'strategy'] as const;

// --- entitySummaryStore + beliefStore in-memory stubs ---------------

function makeStubEntitySummaryStore() {
  const store = new Map<string, { entityId: string; summary: string; factCount: number; lastUpdated: Date; confidence: number }>();
  return {
    get: jest.fn(async (id: string) => store.get(id) ?? null),
    upsert: jest.fn(async (s: { entityId: string; summary: string; factCount: number; lastUpdated: Date; confidence: number }) => {
      store.set(s.entityId, s);
    }),
    search: jest.fn(async () => [] as unknown[]),
    _store: store,
  };
}

function makeStubBeliefStore() {
  const store = new Map<string, ReadonlyArray<unknown>>();
  return {
    getById: jest.fn(async () => null),
    listActiveByEntity: jest.fn(async (id: string) => store.get(id) ?? []),
    insert: jest.fn(async () => 'b-id'),
    update: jest.fn(async () => undefined),
    _store: store,
  };
}

// ===========================================================================
// getHindsightReflectScheduleEntries
// ===========================================================================

describe('getHindsightReflectScheduleEntries — H4.H scheduling helper', () => {
  beforeEach(() => {
    delete process.env.H4_REFLECT_CYCLE_SCHEDULED;
  });

  it('default off (env unset, no opts) → empty list', () => {
    const entries = getHindsightReflectScheduleEntries();
    expect(entries).toEqual([]);
  });

  it('per-call enable=true → one entry per context, staggered', () => {
    const entries = getHindsightReflectScheduleEntries({ enable: true });
    expect(entries).toHaveLength(VALID_CONTEXTS.length);
    for (let i = 0; i < entries.length; i += 1) {
      expect(entries[i]).toMatchObject({
        queueName: 'memory-consolidation',
        jobName: `hindsight-reflect:${VALID_CONTEXTS[i]}`,
        data: { context: VALID_CONTEXTS[i], cycleType: 'hindsight_reflect' },
      });
      expect(entries[i].delayMs).toBeGreaterThanOrEqual(0);
    }
    // Stagger: first two entries differ by exactly perContextOffsetMs.
    const offset = entries[1].delayMs - entries[0].delayMs;
    expect(offset).toBe(7 * 60 * 1000);
  });

  it('per-call enable=false → empty list', () => {
    const entries = getHindsightReflectScheduleEntries({ enable: false });
    expect(entries).toEqual([]);
  });

  it('respects custom baseDelayMs override', () => {
    const entries = getHindsightReflectScheduleEntries({
      enable: true,
      baseDelayMs: 60_000,
    });
    expect(entries[0].delayMs).toBe(60_000);
  });

  it('respects custom perContextOffsetMs override', () => {
    const entries = getHindsightReflectScheduleEntries({
      enable: true,
      baseDelayMs: 0,
      perContextOffsetMs: 1_000,
    });
    expect(entries.map((e) => e.delayMs)).toEqual([0, 1_000, 2_000, 3_000]);
  });

  it('clamps negative delays to zero (defensive)', () => {
    const entries = getHindsightReflectScheduleEntries({
      enable: true,
      baseDelayMs: -100,
      perContextOffsetMs: -50,
    });
    expect(entries.every((e) => e.delayMs === 0)).toBe(true);
  });

  it('env H4_REFLECT_CYCLE_SCHEDULED=true enables without per-call flag', () => {
    process.env.H4_REFLECT_CYCLE_SCHEDULED = 'true';
    const entries = getHindsightReflectScheduleEntries();
    expect(entries).toHaveLength(VALID_CONTEXTS.length);
  });

  it('per-call enable=false beats env=true', () => {
    process.env.H4_REFLECT_CYCLE_SCHEDULED = 'true';
    const entries = getHindsightReflectScheduleEntries({ enable: false });
    expect(entries).toEqual([]);
  });

  it('env truthy variants ("1", "yes", "TRUE") also enable', () => {
    for (const val of ['1', 'yes', 'TRUE']) {
      process.env.H4_REFLECT_CYCLE_SCHEDULED = val;
      const entries = getHindsightReflectScheduleEntries();
      expect(entries.length).toBe(VALID_CONTEXTS.length);
      delete process.env.H4_REFLECT_CYCLE_SCHEDULED;
    }
  });
});

// ===========================================================================
// processHindsightReflectJob
// ===========================================================================

describe('processHindsightReflectJob — H4.H job processor', () => {
  beforeEach(() => {
    mockQueryContext.mockReset();
    mockGetStoresForContext.mockReset();
  });

  it('no stores wired → skipped="no_stores_wired", zero counts', async () => {
    mockGetStoresForContext.mockReturnValue({});
    const result: HindsightReflectResult = await processHindsightReflectJob('operations');
    expect(result.skipped).toBe('no_stores_wired');
    expect(result.entitiesConsidered).toBe(0);
    expect(result.summariesRebuilt).toBe(0);
    expect(result.beliefsSuperseded).toBe(0);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(mockQueryContext).not.toHaveBeenCalled();
  });

  it('only entitySummaryStore wired (no beliefStore) → skipped="no_stores_wired"', async () => {
    mockGetStoresForContext.mockReturnValue({
      entitySummaryStore: makeStubEntitySummaryStore(),
    });
    const result = await processHindsightReflectJob('operations');
    expect(result.skipped).toBe('no_stores_wired');
    expect(mockQueryContext).not.toHaveBeenCalled();
  });

  it('stores wired but DB query throws → skipped="no_recent_entities", no throw', async () => {
    mockGetStoresForContext.mockReturnValue({
      entitySummaryStore: makeStubEntitySummaryStore(),
      beliefStore: makeStubBeliefStore(),
    });
    mockQueryContext.mockRejectedValue(new Error('relation does not exist'));
    const result = await processHindsightReflectJob('finance');
    expect(result.skipped).toBe('no_recent_entities');
    expect(result.entitiesConsidered).toBe(0);
    expect(result.context).toBe('finance');
  });

  it('stores wired + empty rows → skipped="no_recent_entities"', async () => {
    mockGetStoresForContext.mockReturnValue({
      entitySummaryStore: makeStubEntitySummaryStore(),
      beliefStore: makeStubBeliefStore(),
    });
    mockQueryContext.mockResolvedValue({ rows: [] });
    const result = await processHindsightReflectJob('people');
    expect(result.skipped).toBe('no_recent_entities');
    expect(result.entitiesConsidered).toBe(0);
  });

  it('stores wired + entity rows present → runs pass, no skip marker', async () => {
    const entitySummaryStore = makeStubEntitySummaryStore();
    const beliefStore = makeStubBeliefStore();
    mockGetStoresForContext.mockReturnValue({ entitySummaryStore, beliefStore });
    mockQueryContext.mockResolvedValue({
      rows: [
        { entity_id: 'caroline' },
        { entity_id: 'melanie' },
      ],
    });
    const result = await processHindsightReflectJob('strategy');
    expect(result.skipped).toBeUndefined();
    expect(result.entitiesConsidered).toBe(2);
    expect(result.context).toBe('strategy');
    // runReflectionPass calls listActiveByEntity for each id.
    expect(beliefStore.listActiveByEntity).toHaveBeenCalledTimes(2);
    expect(beliefStore.listActiveByEntity).toHaveBeenCalledWith('caroline');
    expect(beliefStore.listActiveByEntity).toHaveBeenCalledWith('melanie');
  });

  it('filters out empty / undefined entity_id values defensively', async () => {
    const entitySummaryStore = makeStubEntitySummaryStore();
    const beliefStore = makeStubBeliefStore();
    mockGetStoresForContext.mockReturnValue({ entitySummaryStore, beliefStore });
    mockQueryContext.mockResolvedValue({
      rows: [
        { entity_id: 'caroline' },
        { entity_id: '' },
        { entity_id: null },
        { entity_id: undefined },
        { entity_id: 'melanie' },
      ],
    });
    const result = await processHindsightReflectJob('operations');
    expect(result.entitiesConsidered).toBe(2);
    expect(beliefStore.listActiveByEntity).toHaveBeenCalledTimes(2);
  });

  it('sql query passes max-entity cap as the LIMIT param', async () => {
    mockGetStoresForContext.mockReturnValue({
      entitySummaryStore: makeStubEntitySummaryStore(),
      beliefStore: makeStubBeliefStore(),
    });
    mockQueryContext.mockResolvedValue({ rows: [] });
    await processHindsightReflectJob('operations');
    expect(mockQueryContext).toHaveBeenCalledTimes(1);
    const [ctx, sql, params] = mockQueryContext.mock.calls[0];
    expect(ctx).toBe('operations');
    expect(sql).toContain('FROM entity_summaries');
    expect(sql).toContain('last_updated');
    // The LIMIT cap is the only positional param; assert it's a number.
    expect(Array.isArray(params)).toBe(true);
    expect(params).toHaveLength(1);
    expect(typeof params[0]).toBe('number');
    expect(params[0]).toBeGreaterThan(0);
  });

  it('durationMs is non-negative for every code path', async () => {
    mockGetStoresForContext.mockReturnValue({});
    const r1 = await processHindsightReflectJob('operations');
    expect(r1.durationMs).toBeGreaterThanOrEqual(0);

    mockGetStoresForContext.mockReturnValue({
      entitySummaryStore: makeStubEntitySummaryStore(),
      beliefStore: makeStubBeliefStore(),
    });
    mockQueryContext.mockResolvedValue({ rows: [] });
    const r2 = await processHindsightReflectJob('finance');
    expect(r2.durationMs).toBeGreaterThanOrEqual(0);

    mockQueryContext.mockResolvedValue({ rows: [{ entity_id: 'x' }] });
    const r3 = await processHindsightReflectJob('people');
    expect(r3.durationMs).toBeGreaterThanOrEqual(0);
  });
});
