/**
 * Unit Tests for PMA Sleep Scheduling + Activity Plasticity
 *
 * Tests:
 *   1. shouldRunSleepCycle (sleep-worker.ts) — intelligent idle/volume/PE/Fiedler-based triggers
 *   2. computePlasticityIndex (neuromodulator-engine.ts) — BDNF analog: active users → more plastic system
 *
 * Part of the Predictive Memory Architecture (PMA).
 */

// Mock dependencies of sleep-worker.ts (not under test here)
jest.mock('../../../../utils/logger', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('../../../../utils/database-context', () => ({
  queryContext: jest.fn(),
}));

jest.mock('../../../../services/memory/sleep-compute', () => ({
  getSleepComputeEngine: jest.fn(),
}));

jest.mock('../../../../services/context-engine-v2', () => ({
  getContextEngineV2: jest.fn(),
}));

import { shouldRunSleepCycle, SleepSchedulingInput } from '../../../../services/queue/workers/sleep-worker';
import { NeuromodulatorEngine } from '../../../../services/memory/neuromodulator-engine';

// ─── Helpers ─────────────────────────────────────────────────────────

function makeInput(overrides: Partial<SleepSchedulingInput> = {}): SleepSchedulingInput {
  return {
    lastCycleAt: new Date(Date.now() - 60 * 60 * 1000), // 1h ago by default
    unconsolidated: 0,
    peAccumulation: 0,
    fiedlerDelta: 0,
    isIdle: true,
    ...overrides,
  };
}

// ─── shouldRunSleepCycle ─────────────────────────────────────────────

describe('shouldRunSleepCycle', () => {
  describe('max staleness safeguard (24h)', () => {
    it('returns full cycle when lastCycleAt is null (never ran)', () => {
      const result = shouldRunSleepCycle(makeInput({ lastCycleAt: null, isIdle: false }));
      expect(result.shouldRun).toBe(true);
      expect(result.mode).toBe('full');
      expect(result.reason).toBe('max_staleness_24h');
    });

    it('returns full cycle when last cycle was 25h ago', () => {
      const lastCycleAt = new Date(Date.now() - 25 * 60 * 60 * 1000);
      const result = shouldRunSleepCycle(makeInput({ lastCycleAt, isIdle: false }));
      expect(result.shouldRun).toBe(true);
      expect(result.mode).toBe('full');
      expect(result.reason).toBe('max_staleness_24h');
    });

    it('staleness check overrides idle check (not idle but 25h ago)', () => {
      const lastCycleAt = new Date(Date.now() - 25 * 60 * 60 * 1000);
      const result = shouldRunSleepCycle(makeInput({ lastCycleAt, isIdle: false }));
      // Staleness takes priority over idle
      expect(result.shouldRun).toBe(true);
      expect(result.mode).toBe('full');
    });

    it('does not trigger max_staleness for 23h old cycle', () => {
      const lastCycleAt = new Date(Date.now() - 23 * 60 * 60 * 1000);
      const result = shouldRunSleepCycle(makeInput({ lastCycleAt, isIdle: true, unconsolidated: 0 }));
      expect(result.reason).not.toBe('max_staleness_24h');
    });
  });

  describe('idle check', () => {
    it('skips when system is not idle (recent cycle, low metrics)', () => {
      const result = shouldRunSleepCycle(makeInput({ isIdle: false }));
      expect(result.shouldRun).toBe(false);
      expect(result.mode).toBe('skip');
      expect(result.reason).toBe('system_active');
    });

    it('skips when not idle even with high unconsolidated count', () => {
      const result = shouldRunSleepCycle(makeInput({ isIdle: false, unconsolidated: 100 }));
      expect(result.shouldRun).toBe(false);
      expect(result.mode).toBe('skip');
      expect(result.reason).toBe('system_active');
    });

    it('skips when not idle even with high PE accumulation', () => {
      const result = shouldRunSleepCycle(makeInput({ isIdle: false, peAccumulation: 10.0 }));
      expect(result.shouldRun).toBe(false);
      expect(result.mode).toBe('skip');
      expect(result.reason).toBe('system_active');
    });
  });

  describe('high volume triggers (full cycle)', () => {
    it('returns full cycle when unconsolidated > 50', () => {
      const result = shouldRunSleepCycle(makeInput({ unconsolidated: 51, isIdle: true }));
      expect(result.shouldRun).toBe(true);
      expect(result.mode).toBe('full');
      expect(result.reason).toBe('high_unconsolidated');
    });

    it('returns full cycle when unconsolidated is exactly 51', () => {
      const result = shouldRunSleepCycle(makeInput({ unconsolidated: 51 }));
      expect(result.shouldRun).toBe(true);
      expect(result.mode).toBe('full');
    });

    it('returns full cycle when PE accumulation > 5.0', () => {
      const result = shouldRunSleepCycle(makeInput({ peAccumulation: 5.1 }));
      expect(result.shouldRun).toBe(true);
      expect(result.mode).toBe('full');
      expect(result.reason).toBe('high_pe_volume');
    });

    it('returns full cycle when fiedlerDelta < -0.1 (graph fragmentation)', () => {
      const result = shouldRunSleepCycle(makeInput({ fiedlerDelta: -0.11 }));
      expect(result.shouldRun).toBe(true);
      expect(result.mode).toBe('full');
      expect(result.reason).toBe('graph_fragmentation');
    });
  });

  describe('moderate volume (consolidation_only)', () => {
    it('returns consolidation_only when unconsolidated > 10 but <= 50', () => {
      const result = shouldRunSleepCycle(makeInput({ unconsolidated: 25 }));
      expect(result.shouldRun).toBe(true);
      expect(result.mode).toBe('consolidation_only');
      expect(result.reason).toBe('moderate_unconsolidated');
    });

    it('returns consolidation_only when unconsolidated is exactly 11', () => {
      const result = shouldRunSleepCycle(makeInput({ unconsolidated: 11 }));
      expect(result.shouldRun).toBe(true);
      expect(result.mode).toBe('consolidation_only');
      expect(result.reason).toBe('moderate_unconsolidated');
    });
  });

  describe('below thresholds (skip)', () => {
    it('skips when all metrics are low and system is idle', () => {
      const result = shouldRunSleepCycle(makeInput({ unconsolidated: 0, peAccumulation: 0, fiedlerDelta: 0 }));
      expect(result.shouldRun).toBe(false);
      expect(result.mode).toBe('skip');
      expect(result.reason).toBe('below_thresholds');
    });

    it('skips when unconsolidated=5, PE=2.0, fiedlerDelta=0.0', () => {
      const result = shouldRunSleepCycle(makeInput({ unconsolidated: 5, peAccumulation: 2.0, fiedlerDelta: 0.0 }));
      expect(result.shouldRun).toBe(false);
      expect(result.mode).toBe('skip');
      expect(result.reason).toBe('below_thresholds');
    });
  });

  describe('boundary conditions', () => {
    it('boundary: unconsolidated exactly 50 → consolidation_only (not full)', () => {
      const result = shouldRunSleepCycle(makeInput({ unconsolidated: 50 }));
      // 50 is NOT > 50, so falls through to moderate check (> 10)
      expect(result.mode).toBe('consolidation_only');
      expect(result.reason).toBe('moderate_unconsolidated');
    });

    it('boundary: unconsolidated exactly 10 → skip (not consolidation_only)', () => {
      const result = shouldRunSleepCycle(makeInput({ unconsolidated: 10 }));
      // 10 is NOT > 10, so falls through to skip
      expect(result.shouldRun).toBe(false);
      expect(result.mode).toBe('skip');
    });

    it('boundary: fiedlerDelta exactly -0.1 → skip (not fragmentation)', () => {
      const result = shouldRunSleepCycle(makeInput({ fiedlerDelta: -0.1 }));
      // -0.1 is NOT < -0.1, so not fragmentation
      expect(result.reason).not.toBe('graph_fragmentation');
    });

    it('boundary: peAccumulation exactly 5.0 → skip (not high_pe_volume)', () => {
      const result = shouldRunSleepCycle(makeInput({ peAccumulation: 5.0 }));
      // 5.0 is NOT > 5.0, so not high_pe_volume
      expect(result.reason).not.toBe('high_pe_volume');
    });
  });
});

// ─── computePlasticityIndex ──────────────────────────────────────────

describe('NeuromodulatorEngine.computePlasticityIndex', () => {
  let engine: NeuromodulatorEngine;

  beforeEach(() => {
    engine = new NeuromodulatorEngine();
  });

  it('returns ~0.56 for 0 messages (low activity → low plasticity, but >= 0.5)', () => {
    const result = engine.computePlasticityIndex(0);
    // activityLevel = min(0/20, 1) = 0
    // sigmoid = 1/(1+exp(-(0-0.5)*4)) = 1/(1+exp(2)) ≈ 0.119
    // result = 0.5 + 0.5*0.119 ≈ 0.559
    expect(result).toBeGreaterThanOrEqual(0.5);
    expect(result).toBeLessThan(0.65); // Should be on the lower end
  });

  it('returns 0.75 for 10 messages (inflection point, medium activity)', () => {
    const result = engine.computePlasticityIndex(10);
    // activityLevel = 10/20 = 0.5
    // sigmoid = 1/(1+exp(-(0.5-0.5)*4)) = 1/(1+1) = 0.5
    // result = 0.5 + 0.5*0.5 = 0.75
    expect(result).toBeCloseTo(0.75, 2);
  });

  it('returns ~0.94 for 20 messages (high activity)', () => {
    const result = engine.computePlasticityIndex(20);
    // activityLevel = min(20/20, 1) = 1.0
    // sigmoid = 1/(1+exp(-(1.0-0.5)*4)) = 1/(1+exp(-2)) ≈ 0.88
    // result = 0.5 + 0.5*0.88 ≈ 0.94
    expect(result).toBeGreaterThan(0.88);
    expect(result).toBeLessThanOrEqual(1.0);
  });

  it('returns same result for 40+ messages as 20 messages (normalization cap)', () => {
    const result = engine.computePlasticityIndex(40);
    // activityLevel = min(40/20, 1) = 1.0 (capped)
    const resultAt20 = engine.computePlasticityIndex(20);
    expect(result).toBeCloseTo(resultAt20, 6);
  });

  it('returns value in [0.5, 1.0] range for any non-negative input', () => {
    const testInputs = [0, 1, 5, 10, 15, 20, 30, 50, 100, 1000];
    for (const n of testInputs) {
      const result = engine.computePlasticityIndex(n);
      expect(result).toBeGreaterThanOrEqual(0.5);
      expect(result).toBeLessThanOrEqual(1.0);
    }
  });

  it('sigmoid inflection at 10 messages (activityLevel=0.5) → exactly 0.75', () => {
    const atInflection = engine.computePlasticityIndex(10);
    // At inflection point of sigmoid, output should be midpoint: 0.5 + 0.5*0.5 = 0.75
    expect(atInflection).toBeCloseTo(0.75, 6);
  });

  it('treats negative messages as 0 (clamp to 0)', () => {
    const atNegative = engine.computePlasticityIndex(-5);
    const atZero = engine.computePlasticityIndex(0);
    expect(atNegative).toBeCloseTo(atZero, 6);
  });

  it('very large number gives same output as 20 messages (activity normalized to 1.0)', () => {
    const atLarge = engine.computePlasticityIndex(10000);
    const atNormalized = engine.computePlasticityIndex(20);
    expect(atLarge).toBeCloseTo(atNormalized, 6);
  });

  it('1 message → slightly above 0.5 (low plasticity, but boosted)', () => {
    const result = engine.computePlasticityIndex(1);
    // activityLevel = 1/20 = 0.05
    // sigmoid = 1/(1+exp(-(0.05-0.5)*4)) ≈ 0.142
    // result ≈ 0.571
    expect(result).toBeGreaterThan(0.5);
    expect(result).toBeLessThan(0.65);
  });

  it('5 messages → between 0.5 and 0.75 (below inflection point)', () => {
    const result = engine.computePlasticityIndex(5);
    // activityLevel = 5/20 = 0.25
    // sigmoid = 1/(1+exp(-(0.25-0.5)*4)) ≈ 0.269
    // result ≈ 0.634
    expect(result).toBeGreaterThan(0.5);
    expect(result).toBeLessThan(0.75);
  });
});
