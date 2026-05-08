/**
 * Sleep worker — LightMem entropy gate (Phase H6.2 production binding).
 *
 * Verifies that:
 *   - Default-off behaviour: `attentionMetrics` undefined → legacy
 *     `isIdle` controls the path (no LightMem evaluation).
 *   - Per-call enableLightMemGate=true with metrics → LightMem decides
 *     the idle-state. High-entropy/idle metrics override `isIdle=false`
 *     into a triggering state when entropy + softIdle thresholds met.
 *   - Per-call enableLightMemGate=true with low-entropy metrics →
 *     legacy decision is overridden the OTHER way: even when caller
 *     says `isIdle: true`, LightMem says "active" → skip with
 *     reason='system_active_lightmem'.
 *   - lightMemOptions are forwarded to evaluateSleepGate (via behavioural
 *     check: changing entropyThreshold flips the decision).
 *   - max-staleness 24h short-circuit still wins over LightMem (safety
 *     guard).
 *   - Env H6_LIGHTMEM_GATE=true → routing applies without per-call flag.
 *
 * The wire-point under test is `shouldRunSleepCycle` — a pure function,
 * so no jest mocks are needed. We assert by passing inputs and reading
 * the returned decision.
 */

import {
  shouldRunSleepCycle,
  type SleepSchedulingInput,
} from '../../../services/queue/workers/sleep-worker';

const NOW = Date.now();
const RECENT = new Date(NOW - 60_000); // 1 minute ago
const STALE = new Date(NOW - 25 * 60 * 60 * 1000); // 25 hours ago

function baseInput(overrides: Partial<SleepSchedulingInput> = {}): SleepSchedulingInput {
  return {
    lastCycleAt: RECENT,
    unconsolidated: 0,
    peAccumulation: 0,
    fiedlerDelta: 0,
    isIdle: false,
    ...overrides,
  };
}

describe('shouldRunSleepCycle — LightMem gate (H6.2)', () => {
  beforeEach(() => {
    delete process.env.H6_LIGHTMEM_GATE;
  });

  it('default off: attentionMetrics absent → legacy isIdle wins', () => {
    const input = baseInput({ isIdle: false });
    const r = shouldRunSleepCycle(input);
    expect(r.shouldRun).toBe(false);
    expect(r.reason).toBe('system_active');
    // The "lightmem" suffix should NOT appear when LightMem is inactive.
    expect(r.reason).not.toContain('lightmem');
  });

  it('per-call enableLightMemGate=true + idle metrics → triggers (overrides isIdle=false)', () => {
    // High entropy proxy: zero load + high cache hit + idle-soft passed.
    const input = baseInput({
      isIdle: false, // legacy says active
      attentionMetrics: {
        idleSeconds: 35,
        requestsPerMinute: 0,
        cacheHitRate: 0.95, // routine work → high entropy
      },
      enableLightMemGate: true,
      unconsolidated: 11, // moderate volume → consolidation_only path
    });
    const r = shouldRunSleepCycle(input);
    expect(r.shouldRun).toBe(true);
    expect(r.mode).toBe('consolidation_only');
    expect(r.reason).toBe('moderate_unconsolidated');
  });

  it('per-call enableLightMemGate=true + busy metrics → blocks (overrides isIdle=true)', () => {
    const input = baseInput({
      isIdle: true, // legacy says idle
      attentionMetrics: {
        idleSeconds: 5, // below softIdle (30s default)
        requestsPerMinute: 30, // saturated
        cacheHitRate: 0.05, // novel work
      },
      enableLightMemGate: true,
    });
    const r = shouldRunSleepCycle(input);
    expect(r.shouldRun).toBe(false);
    expect(r.reason).toBe('system_active_lightmem');
  });

  it('lightMemOptions forwarded: low entropyThreshold flips a borderline decision', () => {
    // Borderline metrics: entropy ≈ 0.45 (load=0.5, routine=0.5, tokens=1.0).
    // Default entropyThreshold=0.7 → blocks. Lowered to 0.4 → triggers.
    const metrics = {
      idleSeconds: 35,
      requestsPerMinute: 5, // half-saturated → loadFactor=0.5
      cacheHitRate: 0.25, // sqrt → routineFactor=0.5
    };

    const blocked = shouldRunSleepCycle(
      baseInput({
        isIdle: false,
        attentionMetrics: metrics,
        enableLightMemGate: true,
      }),
    );
    expect(blocked.shouldRun).toBe(false);

    const triggered = shouldRunSleepCycle(
      baseInput({
        isIdle: false,
        attentionMetrics: metrics,
        enableLightMemGate: true,
        lightMemOptions: { entropyThreshold: 0.4 },
        unconsolidated: 11,
      }),
    );
    expect(triggered.shouldRun).toBe(true);
  });

  it('hard-idle path fires regardless of entropy', () => {
    const input = baseInput({
      isIdle: false, // legacy says active
      attentionMetrics: {
        idleSeconds: 65, // ≥ default hardIdle 60s
        requestsPerMinute: 50,
        cacheHitRate: 0.0,
      },
      enableLightMemGate: true,
      unconsolidated: 11,
    });
    const r = shouldRunSleepCycle(input);
    expect(r.shouldRun).toBe(true);
    expect(r.mode).toBe('consolidation_only');
  });

  it('max-staleness 24h short-circuit wins over LightMem', () => {
    const input = baseInput({
      lastCycleAt: STALE,
      isIdle: false,
      attentionMetrics: {
        idleSeconds: 5,
        requestsPerMinute: 100,
        cacheHitRate: 0.05,
      },
      enableLightMemGate: true,
    });
    const r = shouldRunSleepCycle(input);
    expect(r.shouldRun).toBe(true);
    expect(r.mode).toBe('full');
    expect(r.reason).toBe('max_staleness_24h');
  });

  it('attentionMetrics supplied but enableLightMemGate=false → legacy path', () => {
    const input = baseInput({
      isIdle: true,
      attentionMetrics: {
        idleSeconds: 5,
        requestsPerMinute: 60,
        cacheHitRate: 0.05,
      },
      enableLightMemGate: false,
      unconsolidated: 11,
    });
    const r = shouldRunSleepCycle(input);
    // Legacy path: isIdle=true + moderate volume → consolidation_only.
    expect(r.shouldRun).toBe(true);
    expect(r.mode).toBe('consolidation_only');
  });

  it('volume + PE + fiedler triggers still work with LightMem active', () => {
    const idleMetrics = {
      idleSeconds: 65,
      requestsPerMinute: 0,
      cacheHitRate: 1,
    };

    const high = shouldRunSleepCycle(
      baseInput({
        isIdle: false,
        attentionMetrics: idleMetrics,
        enableLightMemGate: true,
        unconsolidated: 100,
      }),
    );
    expect(high.mode).toBe('full');
    expect(high.reason).toBe('high_unconsolidated');

    const pe = shouldRunSleepCycle(
      baseInput({
        isIdle: false,
        attentionMetrics: idleMetrics,
        enableLightMemGate: true,
        peAccumulation: 6,
      }),
    );
    expect(pe.mode).toBe('full');
    expect(pe.reason).toBe('high_pe_volume');

    const frag = shouldRunSleepCycle(
      baseInput({
        isIdle: false,
        attentionMetrics: idleMetrics,
        enableLightMemGate: true,
        fiedlerDelta: -0.2,
      }),
    );
    expect(frag.mode).toBe('full');
    expect(frag.reason).toBe('graph_fragmentation');
  });

  it('per-call override beats env: enableLightMemGate=false with env=true', async () => {
    // Test against a fresh module load to pick up env-driven defaults.
    process.env.H6_LIGHTMEM_GATE = 'true';
    jest.resetModules();
    const { shouldRunSleepCycle: freshFn } = await import(
      '../../../services/queue/workers/sleep-worker'
    );
    const r = freshFn(
      baseInput({
        isIdle: true,
        attentionMetrics: {
          idleSeconds: 5,
          requestsPerMinute: 100,
          cacheHitRate: 0,
        },
        enableLightMemGate: false, // explicit per-call OFF
        unconsolidated: 11,
      }),
    );
    // With the per-call OFF, legacy isIdle=true wins → consolidation_only.
    expect(r.shouldRun).toBe(true);
    expect(r.mode).toBe('consolidation_only');
    delete process.env.H6_LIGHTMEM_GATE;
    jest.resetModules();
  });

  it('env H6_LIGHTMEM_GATE=true enables routing without per-call flag', async () => {
    process.env.H6_LIGHTMEM_GATE = 'true';
    jest.resetModules();
    const { shouldRunSleepCycle: freshFn } = await import(
      '../../../services/queue/workers/sleep-worker'
    );
    const r = freshFn(
      baseInput({
        isIdle: true, // legacy says idle
        attentionMetrics: {
          idleSeconds: 5,
          requestsPerMinute: 100,
          cacheHitRate: 0,
        },
      }),
    );
    // LightMem says active → blocks despite legacy isIdle=true.
    expect(r.shouldRun).toBe(false);
    expect(r.reason).toBe('system_active_lightmem');
    delete process.env.H6_LIGHTMEM_GATE;
    jest.resetModules();
  });
});
