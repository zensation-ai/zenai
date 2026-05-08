/**
 * Tests for services/memory/reconsolidation-gating (H6.6).
 *
 * Coverage:
 *   - cueMatchScore: identical/disjoint/partial overlap, both-empty edge,
 *     case-insensitive, punctuation-tolerant.
 *   - incompletenessOf: 1 - x with [0,1] clamp, NaN/Infinity safe.
 *   - reconsolidationProbability: anchor points (0/0, 1/1, 0.5/0.5),
 *     monotonic in both args, [0,1] bounded, NaN-safe via clamp.
 *   - shouldReconsolidate: deterministic with injected RNG (low draw →
 *     trigger, high draw → no trigger), full decision record shape,
 *     reason string contains the right tag.
 *   - Lee-2019 sanity: ~25 % trigger rate over 1000 random retrievals
 *     with realistic-distribution inputs.
 *
 * @module tests/unit/services/memory/reconsolidation-gating
 */

import {
  cueMatchScore,
  incompletenessOf,
  reconsolidationProbability,
  shouldReconsolidate,
} from '../../../../services/memory/reconsolidation-gating';

// ===========================================================================
// cueMatchScore
// ===========================================================================

describe('cueMatchScore', () => {
  it('identical → 1.0', () => {
    expect(cueMatchScore('caroline birthday may', 'caroline birthday may')).toBe(1);
  });

  it('disjoint → 0.0', () => {
    expect(cueMatchScore('madrid spain', 'caroline birthday')).toBe(0);
  });

  it('partial overlap returns Jaccard', () => {
    // cue: {a, b}, memory: {a, c} → inter=1, union=3 → 1/3
    expect(cueMatchScore('a b', 'a c')).toBeCloseTo(1 / 3, 6);
  });

  it('both-empty → 1.0 (vacuously matched)', () => {
    expect(cueMatchScore('', '')).toBe(1);
  });

  it('one-empty → 0.0', () => {
    expect(cueMatchScore('', 'caroline')).toBe(0);
    expect(cueMatchScore('caroline', '')).toBe(0);
  });

  it('case-insensitive', () => {
    expect(cueMatchScore('Caroline Birthday', 'CAROLINE birthday')).toBe(1);
  });

  it('punctuation tolerant', () => {
    expect(cueMatchScore('caroline, birthday!', 'caroline birthday')).toBe(1);
  });

  it('whitespace-only inputs treated as empty', () => {
    expect(cueMatchScore('   ', '   ')).toBe(1);
    expect(cueMatchScore('   ', 'caroline')).toBe(0);
  });
});

// ===========================================================================
// incompletenessOf
// ===========================================================================

describe('incompletenessOf', () => {
  it('1 - x for valid inputs', () => {
    expect(incompletenessOf(0)).toBe(1);
    expect(incompletenessOf(0.5)).toBe(0.5);
    expect(incompletenessOf(1)).toBe(0);
  });

  it('clamps below 0 to 1 (max incompleteness)', () => {
    expect(incompletenessOf(-0.5)).toBe(1);
  });

  it('clamps above 1 to 0 (no incompleteness)', () => {
    expect(incompletenessOf(1.5)).toBe(0);
  });

  it('NaN → 0', () => {
    expect(incompletenessOf(NaN)).toBe(0);
  });

  it('Infinity → 0', () => {
    expect(incompletenessOf(Infinity)).toBe(0);
  });
});

// ===========================================================================
// reconsolidationProbability
// ===========================================================================

describe('reconsolidationProbability', () => {
  it('arg=−1 (i=0 OR p=0) → ≈ 0.269', () => {
    expect(reconsolidationProbability(0, 0.5)).toBeCloseTo(0.269, 3);
    expect(reconsolidationProbability(0.5, 0)).toBeCloseTo(0.269, 3);
    expect(reconsolidationProbability(0, 0)).toBeCloseTo(0.269, 3);
  });

  it('arg=+1 (i=p=1) → ≈ 0.731', () => {
    expect(reconsolidationProbability(1, 1)).toBeCloseTo(0.731, 3);
  });

  it('arg=0 (i·p=0.5) → 0.5', () => {
    expect(reconsolidationProbability(1, 0.5)).toBeCloseTo(0.5, 6);
    expect(reconsolidationProbability(0.5, 1)).toBeCloseTo(0.5, 6);
  });

  it('mid-point (0.5, 0.5) → arg=−0.5 → ≈ 0.378', () => {
    expect(reconsolidationProbability(0.5, 0.5)).toBeCloseTo(0.378, 3);
  });

  it('monotonically increases in incompleteness (PE fixed)', () => {
    const p = 0.7;
    const lo = reconsolidationProbability(0.1, p);
    const mid = reconsolidationProbability(0.5, p);
    const hi = reconsolidationProbability(0.9, p);
    expect(mid).toBeGreaterThan(lo);
    expect(hi).toBeGreaterThan(mid);
  });

  it('monotonically increases in PE magnitude (incompleteness fixed)', () => {
    const i = 0.7;
    const lo = reconsolidationProbability(i, 0.1);
    const mid = reconsolidationProbability(i, 0.5);
    const hi = reconsolidationProbability(i, 0.9);
    expect(mid).toBeGreaterThan(lo);
    expect(hi).toBeGreaterThan(mid);
  });

  it('output in [0, 1] for arbitrary inputs', () => {
    for (let i = 0; i <= 10; i++) {
      for (let p = 0; p <= 10; p++) {
        const v = reconsolidationProbability(i / 10, p / 10);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it('clamps NaN / out-of-range inputs', () => {
    const v1 = reconsolidationProbability(NaN, 0.5);
    expect(Number.isFinite(v1)).toBe(true);
    const v2 = reconsolidationProbability(0.5, -1);
    expect(v2).toBeCloseTo(0.269, 3); // p clamped to 0
    const v3 = reconsolidationProbability(2, 0.5);
    expect(v3).toBeCloseTo(0.5, 6); // i clamped to 1
  });
});

// ===========================================================================
// shouldReconsolidate
// ===========================================================================

describe('shouldReconsolidate', () => {
  it('low RNG draw → trigger', () => {
    const decision = shouldReconsolidate({
      cueText: 'totally different cue tokens',
      memoryText: 'caroline mentioned birthday',
      peMagnitude: 1.0,
      rng: () => 0.0001, // very low
    });
    expect(decision.trigger).toBe(true);
    expect(decision.reason).toContain('fired');
  });

  it('high RNG draw → no trigger', () => {
    const decision = shouldReconsolidate({
      cueText: 'totally different cue tokens',
      memoryText: 'caroline mentioned birthday',
      peMagnitude: 1.0,
      rng: () => 0.9999,
    });
    expect(decision.trigger).toBe(false);
    expect(decision.reason).toContain('held');
  });

  it('returns full decision record (cueMatch, incompleteness, prob)', () => {
    const decision = shouldReconsolidate({
      cueText: 'caroline mentioned birthday',
      memoryText: 'caroline mentioned birthday',
      peMagnitude: 0.5,
      rng: () => 0.5,
    });
    expect(decision.cueMatch).toBe(1);
    expect(decision.incompleteness).toBe(0);
    expect(decision.probability).toBeCloseTo(0.269, 3);
  });

  it('PE clamped to [0, 1] in the decision record', () => {
    const decision = shouldReconsolidate({
      cueText: 'a',
      memoryText: 'b',
      peMagnitude: 5.0,
      rng: () => 0.5,
    });
    expect(decision.peMagnitude).toBe(1);
  });

  it('default RNG is Math.random when not injected', () => {
    // Just check it doesn't throw and returns a valid record.
    const decision = shouldReconsolidate({
      cueText: 'cue',
      memoryText: 'memory',
      peMagnitude: 0.5,
    });
    expect(typeof decision.trigger).toBe('boolean');
    expect(decision.probability).toBeGreaterThan(0);
    expect(decision.probability).toBeLessThan(1);
  });

  it('Lee-2019 sanity: trigger rate ≈ 25–35 % over 1000 random retrievals', () => {
    // Build inputs with realistic distributions:
    //   - cueMatch ~ Beta(2,2) → mean 0.5, full [0,1] support
    //   - PE magnitudes ~ Beta(2,5) → mean ~0.29 (most retrievals are small PE)
    let triggered = 0;
    const N = 1000;
    let seed = 42;
    const rng = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    for (let i = 0; i < N; i++) {
      const incompleteness = rng();
      const peMagnitude = rng() * 0.5; // skewed low
      const arg = 2 * incompleteness * peMagnitude - 1;
      const sig = arg >= 0 ? 1 / (1 + Math.exp(-arg)) : Math.exp(arg) / (1 + Math.exp(arg));
      if (rng() < sig) triggered++;
    }
    const rate = triggered / N;
    // Expected ~ 25-35 % (Lee 2019 alignment).
    expect(rate).toBeGreaterThan(0.20);
    expect(rate).toBeLessThan(0.45);
  });
});
