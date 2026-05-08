/**
 * FSRS scheduler — Titans VFE interval shrink (Phase H6.3 production binding).
 *
 * Verifies that:
 *   - Default-off behaviour: scheduleWithVFE returns the input interval
 *     unchanged (vfeApplied: false).
 *   - enableVFEShrink=true → interval shrinks proportional to |vfeDelta|.
 *     β=0.20 default, |delta|=1.0 → factor=0.80 (20% shorter).
 *   - vfeShrinkOptions { beta } and { intervalFloor } are forwarded
 *     verbatim.
 *   - Sign symmetry: positive AND negative deltas produce the same
 *     shrink (interval is keyed on |delta|).
 *   - Floor honoured: extreme |delta| with β=0.5 floors at the supplied
 *     floor fraction.
 *   - Env H6_VFE_BOOST=true at module load enables the shrink without
 *     per-call override.
 */

import {
  scheduleWithVFE,
  scheduleWithVmPFC,
} from '../../../../services/memory/fsrs-scheduler';

describe('scheduleWithVFE — Titans VFE interval shrink (H6.3)', () => {
  beforeEach(() => {
    delete process.env.H6_VFE_BOOST;
  });

  it('default off: returns input interval unchanged, vfeApplied=false', () => {
    const out = scheduleWithVFE(10, 0.5);
    expect(out.adaptedIntervalDays).toBe(10);
    expect(out.vfeApplied).toBe(false);
    expect(out.shrinkFactor).toBe(1);
  });

  it('enableVFEShrink=true + |delta|=1.0 → 20% shorter (β=0.20 default)', () => {
    const out = scheduleWithVFE(10, 1.0, { enableVFEShrink: true });
    expect(out.vfeApplied).toBe(true);
    expect(out.adaptedIntervalDays).toBeCloseTo(8.0, 5);
    expect(out.shrinkFactor).toBeCloseTo(0.8, 5);
  });

  it('vfeShrinkOptions { beta } forwarded — β=0.5 + |delta|=1.0 → 50% shorter', () => {
    const out = scheduleWithVFE(10, 1.0, {
      enableVFEShrink: true,
      vfeShrinkOptions: { beta: 0.5 },
    });
    expect(out.adaptedIntervalDays).toBeCloseTo(5.0, 5);
    expect(out.shrinkFactor).toBeCloseTo(0.5, 5);
  });

  it('sign symmetry: positive delta = negative delta', () => {
    const pos = scheduleWithVFE(10, 0.6, { enableVFEShrink: true });
    const neg = scheduleWithVFE(10, -0.6, { enableVFEShrink: true });
    expect(pos.adaptedIntervalDays).toBeCloseTo(neg.adaptedIntervalDays, 5);
  });

  it('zero delta → identity', () => {
    const out = scheduleWithVFE(10, 0, { enableVFEShrink: true });
    expect(out.adaptedIntervalDays).toBe(10);
    expect(out.vfeApplied).toBe(true);
    expect(out.shrinkFactor).toBe(1);
  });

  it('floor honoured at extreme delta', () => {
    // β=0.9 + |delta|=1.0 → raw factor 1 - 0.9 = 0.1 (below default floor 0.20).
    const out = scheduleWithVFE(10, 1.0, {
      enableVFEShrink: true,
      vfeShrinkOptions: { beta: 0.9, intervalFloor: 0.20 },
    });
    expect(out.adaptedIntervalDays).toBeCloseTo(2.0, 5);
    expect(out.shrinkFactor).toBeCloseTo(0.20, 5);
  });

  it('per-call enableVFEShrink=true beats env-undefined default', () => {
    expect(process.env.H6_VFE_BOOST).toBeUndefined();
    const out = scheduleWithVFE(10, 1.0, { enableVFEShrink: true });
    expect(out.vfeApplied).toBe(true);
  });

  it('non-finite delta → no-op (defensive, identity output)', () => {
    const nan = scheduleWithVFE(10, NaN, { enableVFEShrink: true });
    const inf = scheduleWithVFE(10, Infinity, { enableVFEShrink: true });
    expect(nan.adaptedIntervalDays).toBe(10);
    expect(inf.adaptedIntervalDays).toBe(10);
  });

  it('zero or negative base interval → 0 (matches algorithm contract)', () => {
    const z = scheduleWithVFE(0, 1.0, { enableVFEShrink: true });
    const n = scheduleWithVFE(-5, 1.0, { enableVFEShrink: true });
    expect(z.adaptedIntervalDays).toBe(0);
    expect(n.adaptedIntervalDays).toBe(0);
  });

  it('composes with scheduleWithVmPFC — chained call applies BOTH adaptations', () => {
    const baseDays = 10;
    const oldEmb = [1, 0, 0];
    const newEmb = [0, 1, 0]; // Orthogonal → high prediction error.
    const vm = scheduleWithVmPFC(baseDays, oldEmb, newEmb);
    const final = scheduleWithVFE(vm.adaptedIntervalDays, 0.8, {
      enableVFEShrink: true,
    });
    // vm shortens vs. base; vfe further shortens vs. vm.
    expect(vm.adaptedIntervalDays).toBeLessThan(baseDays);
    expect(final.adaptedIntervalDays).toBeLessThanOrEqual(vm.adaptedIntervalDays);
    expect(final.vfeApplied).toBe(true);
  });
});

describe('scheduleWithVFE — env default (H6_VFE_BOOST)', () => {
  it('env H6_VFE_BOOST=true at module load enables shrink without per-call flag', async () => {
    const prev = process.env.H6_VFE_BOOST;
    process.env.H6_VFE_BOOST = 'true';
    jest.resetModules();
    const mod = await import('../../../../services/memory/fsrs-scheduler');
    const out = mod.scheduleWithVFE(10, 1.0);
    expect(out.vfeApplied).toBe(true);
    expect(out.adaptedIntervalDays).toBeCloseTo(8.0, 5);

    if (prev === undefined) delete process.env.H6_VFE_BOOST;
    else process.env.H6_VFE_BOOST = prev;
    jest.resetModules();
  });

  it('per-call enableVFEShrink=false beats env=true', async () => {
    const prev = process.env.H6_VFE_BOOST;
    process.env.H6_VFE_BOOST = 'true';
    jest.resetModules();
    const mod = await import('../../../../services/memory/fsrs-scheduler');
    const out = mod.scheduleWithVFE(10, 1.0, { enableVFEShrink: false });
    expect(out.vfeApplied).toBe(false);
    expect(out.adaptedIntervalDays).toBe(10);

    if (prev === undefined) delete process.env.H6_VFE_BOOST;
    else process.env.H6_VFE_BOOST = prev;
    jest.resetModules();
  });
});
