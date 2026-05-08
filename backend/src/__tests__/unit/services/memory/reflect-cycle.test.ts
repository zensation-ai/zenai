/**
 * Hindsight Reflect-Cycle (Phase H4.6) tests.
 *
 * Covers:
 *   - createReflectCycle: counter increments + fire-on-threshold + reset
 *   - forceTrigger one-shot
 *   - Custom interval + initialCount
 *   - runReflectionPass:
 *     - rebuild callback fires for known entities
 *     - belief auto-supersession on drift
 *     - confidence-drift correction (no supersession)
 *     - resilience to store errors (one bad call doesn't abort pass)
 *     - duration field populated
 */

import {
  createReflectCycle,
  runReflectionPass,
  DEFAULT_REFLECT_INTERVAL,
  type ReflectCycleHandle,
} from '../../../../services/memory/hindsight-networks/reflect-cycle';
import {
  createInMemoryEntitySummaryStore,
  updateEntitySummary,
} from '../../../../services/memory/hindsight-networks/entity-summaries';
import {
  createInMemoryBeliefStore,
  createBelief,
  applyEvidence,
} from '../../../../services/memory/hindsight-networks/evolving-beliefs';

describe('DEFAULT_REFLECT_INTERVAL', () => {
  it('is 20 per spec § H4 task 6', () => {
    expect(DEFAULT_REFLECT_INTERVAL).toBe(20);
  });
});

describe('createReflectCycle — counter + trigger', () => {
  it('fires on the Nth notice, resets after', () => {
    const cycle = createReflectCycle({ interval: 3 });
    expect(cycle.notice()).toBe(false); // 1
    expect(cycle.notice()).toBe(false); // 2
    expect(cycle.notice()).toBe(true); // 3 → fires
    expect(cycle.count()).toBe(0); // reset
    expect(cycle.fires()).toBe(1);
    // Continues firing every 3rd.
    expect(cycle.notice()).toBe(false);
    expect(cycle.notice()).toBe(false);
    expect(cycle.notice()).toBe(true);
    expect(cycle.fires()).toBe(2);
  });

  it('default interval = 20', () => {
    const cycle = createReflectCycle();
    for (let i = 0; i < 19; i++) cycle.notice();
    expect(cycle.notice()).toBe(true);
    expect(cycle.fires()).toBe(1);
  });

  it('interval coerced to >= 1', () => {
    const cycle = createReflectCycle({ interval: 0 });
    expect(cycle.notice()).toBe(true); // 0 → coerced to 1, first call fires
    expect(cycle.fires()).toBe(1);
  });

  it('interval=1 fires every call', () => {
    const cycle = createReflectCycle({ interval: 1 });
    expect(cycle.notice()).toBe(true);
    expect(cycle.notice()).toBe(true);
    expect(cycle.notice()).toBe(true);
    expect(cycle.fires()).toBe(3);
  });

  it('count() reads current count without firing', () => {
    const cycle = createReflectCycle({ interval: 5 });
    cycle.notice();
    cycle.notice();
    expect(cycle.count()).toBe(2);
    expect(cycle.fires()).toBe(0);
  });

  it('initialCount restores partial progress', () => {
    const cycle = createReflectCycle({ interval: 5, initialCount: 4 });
    expect(cycle.count()).toBe(4);
    expect(cycle.notice()).toBe(true); // 4 + 1 = 5 → fires
  });

  it('forceTrigger fires next call regardless of count', () => {
    const cycle = createReflectCycle({ interval: 100 });
    cycle.notice();
    cycle.notice();
    cycle.forceTrigger();
    expect(cycle.notice()).toBe(true);
    expect(cycle.fires()).toBe(1);
    // After forced fire, counter is reset; next forced flag is consumed.
    expect(cycle.notice()).toBe(false);
  });

  it('multiple cycles share no state', () => {
    const a = createReflectCycle({ interval: 3 });
    const b = createReflectCycle({ interval: 3 });
    a.notice();
    a.notice();
    a.notice();
    expect(a.fires()).toBe(1);
    expect(b.fires()).toBe(0);
  });
});

describe('runReflectionPass — orchestration', () => {
  it('rebuild callback fires for entities that have summaries', async () => {
    const summaries = createInMemoryEntitySummaryStore();
    const beliefs = createInMemoryBeliefStore();
    await updateEntitySummary('caroline', { text: 'X', confidence: 0.9 }, summaries);
    await updateEntitySummary('bob', { text: 'Y', confidence: 0.8 }, summaries);

    const rebuilds: string[] = [];
    const result = await runReflectionPass(
      {
        entityIds: ['caroline', 'bob', 'unknown_entity'],
        rebuildSummary: async (id) => {
          rebuilds.push(id);
        },
      },
      summaries,
      beliefs,
    );
    expect(rebuilds).toEqual(['caroline', 'bob']);
    expect(result.summariesRebuilt).toBe(2);
  });

  it('without rebuild callback → no summary work, observational only', async () => {
    const summaries = createInMemoryEntitySummaryStore();
    const beliefs = createInMemoryBeliefStore();
    await updateEntitySummary('caroline', { text: 'X', confidence: 0.9 }, summaries);
    const result = await runReflectionPass(
      { entityIds: ['caroline'] },
      summaries,
      beliefs,
    );
    expect(result.summariesRebuilt).toBe(0);
  });

  it('belief auto-supersession on drift below threshold', async () => {
    const summaries = createInMemoryEntitySummaryStore();
    const beliefs = createInMemoryBeliefStore();
    // Insert a belief and pre-stack heavy against evidence WITHOUT
    // going through updateBelief (so no auto-supersession at write time).
    const initial = createBelief('caroline', 'lives in Madrid', 'for');
    const id = await beliefs.insert(initial);
    let belief = await beliefs.getById(id);
    // Hammer with against to drift confidence below 0.30 — pre-set the
    // counters directly to simulate a drift case where many evidence
    // events accumulated outside the wrapper.
    belief = applyEvidence(belief!, 'against');
    belief = applyEvidence(belief, 'against');
    belief = applyEvidence(belief, 'against');
    belief = applyEvidence(belief, 'against');
    await beliefs.update(belief);

    const result = await runReflectionPass(
      { entityIds: ['caroline'] },
      summaries,
      beliefs,
    );
    expect(result.beliefsSuperseded).toBe(1);

    // Verify persistence.
    const persisted = await beliefs.getById(id);
    expect(persisted!.supersededAt).not.toBeNull();
  });

  it('drift correction without supersession (still active)', async () => {
    const summaries = createInMemoryEntitySummaryStore();
    const beliefs = createInMemoryBeliefStore();
    const initial = createBelief('caroline', 'X', 'for');
    const id = await beliefs.insert(initial);
    // Manually corrupt the persisted confidence to a different value
    // than what the counters imply, simulating drift.
    const fetched = await beliefs.getById(id);
    await beliefs.update({ ...fetched!, confidence: 0.99 });

    const result = await runReflectionPass(
      { entityIds: ['caroline'] },
      summaries,
      beliefs,
    );
    // No supersession because evidenceAgainst < 2 and confidence not
    // below threshold after recompute.
    expect(result.beliefsSuperseded).toBe(0);
    // But the persisted confidence should now be the correct value.
    const corrected = await beliefs.getById(id);
    expect(corrected!.confidence).toBeCloseTo(2 / 3, 5);
  });

  it('survives store error in rebuild callback (continues with other entities)', async () => {
    const summaries = createInMemoryEntitySummaryStore();
    const beliefs = createInMemoryBeliefStore();
    await updateEntitySummary('caroline', { text: 'X', confidence: 0.9 }, summaries);
    await updateEntitySummary('bob', { text: 'Y', confidence: 0.9 }, summaries);

    const rebuilds: string[] = [];
    const result = await runReflectionPass(
      {
        entityIds: ['caroline', 'bob'],
        rebuildSummary: async (id) => {
          if (id === 'caroline') throw new Error('boom');
          rebuilds.push(id);
        },
      },
      summaries,
      beliefs,
    );
    // 'bob' still got rebuilt; 'caroline' was caught.
    expect(rebuilds).toEqual(['bob']);
    expect(result.summariesRebuilt).toBe(1);
  });

  it('threshold=0 disables auto-supersession in pass', async () => {
    const summaries = createInMemoryEntitySummaryStore();
    const beliefs = createInMemoryBeliefStore();
    const initial = createBelief('caroline', 'X', 'for');
    const id = await beliefs.insert(initial);
    let belief = await beliefs.getById(id);
    for (let i = 0; i < 10; i++) belief = applyEvidence(belief!, 'against');
    await beliefs.update(belief!);

    const result = await runReflectionPass(
      { entityIds: ['caroline'] },
      summaries,
      beliefs,
      { abandonmentThreshold: 0 },
    );
    expect(result.beliefsSuperseded).toBe(0);
    const persisted = await beliefs.getById(id);
    expect(persisted!.supersededAt).toBeNull();
  });

  it('duration field populated', async () => {
    const summaries = createInMemoryEntitySummaryStore();
    const beliefs = createInMemoryBeliefStore();
    const result = await runReflectionPass(
      { entityIds: [] },
      summaries,
      beliefs,
    );
    expect(typeof result.durationMs).toBe('number');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});

describe('end-to-end reflect-cycle integration', () => {
  it('counter triggers a reflection pass after N notices', async () => {
    const summaries = createInMemoryEntitySummaryStore();
    const beliefs = createInMemoryBeliefStore();
    const cycle = createReflectCycle({ interval: 3 });
    let passes = 0;
    const runOne = async () => {
      passes += 1;
      await runReflectionPass({ entityIds: [] }, summaries, beliefs);
    };

    // Simulate 3 memories arriving — pass should fire on the 3rd.
    for (let i = 0; i < 3; i++) {
      if (cycle.notice()) await runOne();
    }
    expect(passes).toBe(1);
    expect(cycle.fires()).toBe(1);

    // Next 3 → 1 more pass.
    for (let i = 0; i < 3; i++) {
      if (cycle.notice()) await runOne();
    }
    expect(passes).toBe(2);
  });
});
