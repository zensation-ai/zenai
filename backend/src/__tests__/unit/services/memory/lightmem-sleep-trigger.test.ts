/**
 * Tests for LightMem sleep-trigger (Phase H6.2).
 *
 * Verifies:
 *   - Hard-idle path: any idle ≥ hardIdleSeconds fires regardless
 *     of entropy.
 *   - Entropy + soft-idle dual-signal path.
 *   - Each entropy contributor moves in the documented direction.
 *   - selectTopKForReplay sorts by utility desc with stable id tie-break.
 *   - lightMemToIsIdle bridge function.
 */

import {
  evaluateSleepGate,
  selectTopKForReplay,
  lightMemToIsIdle,
} from '../../../../services/memory/lightmem-sleep-trigger';

describe('evaluateSleepGate — hard-idle path', () => {
  it('fires when idleSeconds >= hardIdleSeconds regardless of entropy', () => {
    // Heavy load: very low entropy. But idle ≥ 60 → fire.
    const sig = evaluateSleepGate({
      idleSeconds: 90,
      requestsPerMinute: 60, // saturated
      cacheHitRate: 0,
      tokensPerRequest: 5000, // heavy generation
    });
    expect(sig.shouldTrigger).toBe(true);
    expect(sig.reason).toContain('hard idle');
  });

  it('does not fire when idleSeconds < hardIdleSeconds and entropy low', () => {
    const sig = evaluateSleepGate({
      idleSeconds: 30,
      requestsPerMinute: 30,
      cacheHitRate: 0,
      tokensPerRequest: 1000,
    });
    expect(sig.shouldTrigger).toBe(false);
  });

  it('hardIdleSeconds=0 disables the time-only path', () => {
    const sig = evaluateSleepGate(
      { idleSeconds: 999, requestsPerMinute: 60, cacheHitRate: 0 },
      { hardIdleSeconds: 0, entropyThreshold: 0.99 },
    );
    expect(sig.shouldTrigger).toBe(false);
  });

  it('custom hardIdleSeconds threshold respected', () => {
    const sig = evaluateSleepGate(
      { idleSeconds: 25, requestsPerMinute: 60, cacheHitRate: 0 },
      { hardIdleSeconds: 20 },
    );
    expect(sig.shouldTrigger).toBe(true);
  });
});

describe('evaluateSleepGate — entropy + soft-idle dual signal', () => {
  it('fires when both entropy >= threshold and idle >= softIdle', () => {
    const sig = evaluateSleepGate({
      idleSeconds: 35,
      requestsPerMinute: 0, // idle → high entropy
      cacheHitRate: 0.9, // routine
    });
    expect(sig.entropy).toBeGreaterThanOrEqual(0.7);
    expect(sig.shouldTrigger).toBe(true);
    expect(sig.reason).toContain('entropy');
  });

  it('does not fire when entropy >= threshold but idle < softIdle', () => {
    const sig = evaluateSleepGate({
      idleSeconds: 5,
      requestsPerMinute: 0,
      cacheHitRate: 0.95,
    });
    expect(sig.shouldTrigger).toBe(false);
  });

  it('does not fire when idle >= softIdle but entropy < threshold', () => {
    const sig = evaluateSleepGate({
      idleSeconds: 45,
      requestsPerMinute: 8, // moderate load
      cacheHitRate: 0.1, // novel work
      tokensPerRequest: 3000,
    });
    expect(sig.entropy).toBeLessThan(0.7);
    expect(sig.shouldTrigger).toBe(false);
  });
});

describe('evaluateSleepGate — entropy contributors', () => {
  it('high requestsPerMinute lowers loadFactor', () => {
    const idle = evaluateSleepGate({
      idleSeconds: 0,
      requestsPerMinute: 0,
      cacheHitRate: 0,
    });
    const busy = evaluateSleepGate({
      idleSeconds: 0,
      requestsPerMinute: 10,
      cacheHitRate: 0,
    });
    expect(idle.contributors.load).toBeGreaterThan(busy.contributors.load);
    expect(idle.contributors.load).toBe(1.0);
    expect(busy.contributors.load).toBe(0.0);
  });

  it('high cacheHitRate raises routineFactor', () => {
    const novel = evaluateSleepGate({
      idleSeconds: 0,
      requestsPerMinute: 5,
      cacheHitRate: 0.0,
    });
    const routine = evaluateSleepGate({
      idleSeconds: 0,
      requestsPerMinute: 5,
      cacheHitRate: 1.0,
    });
    expect(routine.contributors.routine).toBe(1.0);
    expect(novel.contributors.routine).toBe(0.0);
  });

  it('routineFactor uses sqrt spread (0.5 hit rate ≈ 0.71)', () => {
    const sig = evaluateSleepGate({
      idleSeconds: 0,
      requestsPerMinute: 5,
      cacheHitRate: 0.5,
    });
    expect(sig.contributors.routine).toBeCloseTo(Math.sqrt(0.5), 5);
  });

  it('omitting tokensPerRequest treats it as fully-idle (1.0)', () => {
    const sig = evaluateSleepGate({
      idleSeconds: 0,
      requestsPerMinute: 0,
      cacheHitRate: 0,
    });
    expect(sig.contributors.tokens).toBe(1.0);
  });

  it('high tokensPerRequest decays the tokensFactor', () => {
    const light = evaluateSleepGate({
      idleSeconds: 0,
      requestsPerMinute: 0,
      cacheHitRate: 0,
      tokensPerRequest: 0,
    });
    const heavy = evaluateSleepGate({
      idleSeconds: 0,
      requestsPerMinute: 0,
      cacheHitRate: 0,
      tokensPerRequest: 10000,
    });
    expect(light.contributors.tokens).toBe(1.0);
    expect(heavy.contributors.tokens).toBeLessThan(0.05);
  });

  it('rpmSaturation option scales the load contributor', () => {
    const conservative = evaluateSleepGate(
      { idleSeconds: 0, requestsPerMinute: 5, cacheHitRate: 0 },
      { rpmSaturation: 5 }, // saturates at 5 → loadFactor = 0
    );
    expect(conservative.contributors.load).toBe(0);
    const aggressive = evaluateSleepGate(
      { idleSeconds: 0, requestsPerMinute: 5, cacheHitRate: 0 },
      { rpmSaturation: 50 }, // load = 1 - 5/50 = 0.9
    );
    expect(aggressive.contributors.load).toBeCloseTo(0.9, 5);
  });
});

describe('evaluateSleepGate — defensive inputs', () => {
  it('negative idleSeconds is clamped to 0', () => {
    const sig = evaluateSleepGate({
      idleSeconds: -10,
      requestsPerMinute: 0,
      cacheHitRate: 0,
    });
    expect(sig.idleSeconds).toBe(0);
    expect(sig.shouldTrigger).toBe(false);
  });

  it('negative requestsPerMinute is clamped to 0 (max load)', () => {
    const sig = evaluateSleepGate({
      idleSeconds: 0,
      requestsPerMinute: -5,
      cacheHitRate: 0,
    });
    expect(sig.contributors.load).toBe(1.0);
  });

  it('cacheHitRate > 1 is clamped to 1', () => {
    const sig = evaluateSleepGate({
      idleSeconds: 0,
      requestsPerMinute: 0,
      cacheHitRate: 5,
    });
    expect(sig.contributors.routine).toBe(1.0);
  });

  it('NaN cacheHitRate falls back to 0', () => {
    const sig = evaluateSleepGate({
      idleSeconds: 0,
      requestsPerMinute: 0,
      cacheHitRate: NaN,
    });
    expect(sig.contributors.routine).toBe(0);
  });
});

describe('selectTopKForReplay', () => {
  const memories = [
    { id: 'b', utility: 0.5 },
    { id: 'a', utility: 0.9 },
    { id: 'd', utility: 0.5 },
    { id: 'c', utility: 0.7 },
  ];

  it('returns top-K sorted by utility desc', () => {
    const top2 = selectTopKForReplay(memories, 2);
    expect(top2.map((m) => m.id)).toEqual(['a', 'c']);
  });

  it('stable id tie-break for equal utilities', () => {
    const top3 = selectTopKForReplay(memories, 3);
    // a (0.9), c (0.7), then b/d tied at 0.5 — alphabetical wins.
    expect(top3.map((m) => m.id)).toEqual(['a', 'c', 'b']);
  });

  it('k=0 → empty', () => {
    expect(selectTopKForReplay(memories, 0)).toEqual([]);
  });

  it('k > N → returns all sorted', () => {
    const all = selectTopKForReplay(memories, 100);
    expect(all.length).toBe(4);
    expect(all[0].id).toBe('a');
    expect(all[3].id).toBe('d');
  });

  it('preserves payload through the selection', () => {
    const withPayload = selectTopKForReplay(
      [{ id: 'x', utility: 1.0, payload: { meta: 'preserved' } }],
      1,
    );
    expect(withPayload[0].payload).toEqual({ meta: 'preserved' });
  });

  it('does not mutate input array', () => {
    const original = [...memories];
    selectTopKForReplay(memories, 2);
    expect(memories).toEqual(original);
  });

  it('empty input → empty output', () => {
    expect(selectTopKForReplay([], 5)).toEqual([]);
  });
});

describe('lightMemToIsIdle', () => {
  it('shouldTrigger=true → isIdle=true', () => {
    expect(
      lightMemToIsIdle({
        shouldTrigger: true,
        entropy: 0.8,
        idleSeconds: 60,
        contributors: {},
        reason: 'fired',
      }),
    ).toBe(true);
  });

  it('shouldTrigger=false → isIdle=false', () => {
    expect(
      lightMemToIsIdle({
        shouldTrigger: false,
        entropy: 0.3,
        idleSeconds: 5,
        contributors: {},
        reason: 'not yet',
      }),
    ).toBe(false);
  });
});

describe('evaluateSleepGate — determinism', () => {
  it('same input produces same signal', () => {
    const m = {
      idleSeconds: 45,
      requestsPerMinute: 2,
      cacheHitRate: 0.8,
      tokensPerRequest: 100,
    };
    const a = evaluateSleepGate(m);
    const b = evaluateSleepGate(m);
    expect(a).toEqual(b);
  });
});
