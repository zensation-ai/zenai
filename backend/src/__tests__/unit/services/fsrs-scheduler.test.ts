/**
 * FSRS Spaced Repetition Scheduler Tests (Phase 125)
 *
 * Tests for the Free Spaced Repetition Scheduler algorithm.
 * Written first (TDD) before the implementation.
 */

import {
  getRetrievability,
  scheduleNextReview,
  updateAfterRecall,
  updateAfterForgot,
  initFromDecayClass,
  initFromSM2,
  clampDifficulty,
  updateStabilityCompat,
  getRetentionProbabilityCompat,
  TARGET_RETENTION,
  MIN_STABILITY,
  MIN_DIFFICULTY,
  MAX_DIFFICULTY,
  MS_PER_DAY,
} from '../../../services/memory/fsrs-scheduler';
import type { FSRSState } from '../../../services/memory/fsrs-scheduler';

jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

// ===========================================
// Helpers
// ===========================================

function makeState(overrides: Partial<FSRSState> = {}): FSRSState {
  const stability = overrides.stability ?? 7;
  // nextReview defaults to exactly one review interval from now at 90% retention
  const intervalDays = -stability * Math.log(TARGET_RETENTION);
  const nextReview = overrides.nextReview ?? new Date(Date.now() + intervalDays * MS_PER_DAY);
  return {
    difficulty: overrides.difficulty ?? 5,
    stability,
    nextReview,
  };
}

/** Returns a state where nextReview is exactly `daysAgo` days in the past from now */
function stateReviewedDaysAgo(daysAgo: number, stability = 7): FSRSState {
  // lastReviewed = nextReview - intervalDays
  const intervalDays = -stability * Math.log(TARGET_RETENTION);
  const lastReviewed = new Date(Date.now() - daysAgo * MS_PER_DAY);
  const nextReview = new Date(lastReviewed.getTime() + intervalDays * MS_PER_DAY);
  return { difficulty: 5, stability, nextReview };
}

// ===========================================
// Constants
// ===========================================

describe('FSRS constants', () => {
  it('TARGET_RETENTION is 0.9', () => {
    expect(TARGET_RETENTION).toBeCloseTo(0.9);
  });

  it('MIN_STABILITY is 0.5', () => {
    expect(MIN_STABILITY).toBeCloseTo(0.5);
  });

  it('MIN_DIFFICULTY is 1.0', () => {
    expect(MIN_DIFFICULTY).toBeCloseTo(1.0);
  });

  it('MAX_DIFFICULTY is 10.0', () => {
    expect(MAX_DIFFICULTY).toBeCloseTo(10.0);
  });

  it('MS_PER_DAY is 86400000', () => {
    expect(MS_PER_DAY).toBe(86400000);
  });
});

// ===========================================
// clampDifficulty
// ===========================================

describe('clampDifficulty', () => {
  it('passes through values within range', () => {
    expect(clampDifficulty(5)).toBeCloseTo(5);
    expect(clampDifficulty(1)).toBeCloseTo(1);
    expect(clampDifficulty(10)).toBeCloseTo(10);
  });

  it('clamps values below 1 to 1', () => {
    expect(clampDifficulty(0)).toBeCloseTo(1);
    expect(clampDifficulty(-5)).toBeCloseTo(1);
    expect(clampDifficulty(0.5)).toBeCloseTo(1);
  });

  it('clamps values above 10 to 10', () => {
    expect(clampDifficulty(11)).toBeCloseTo(10);
    expect(clampDifficulty(100)).toBeCloseTo(10);
    expect(clampDifficulty(10.5)).toBeCloseTo(10);
  });
});

// ===========================================
// getRetrievability
// ===========================================

describe('getRetrievability', () => {
  it('returns approximately 0.9 at review time (t=intervalDays for target 0.9)', () => {
    const s = 7;
    const intervalDays = -s * Math.log(TARGET_RETENTION);
    const lastReviewed = new Date(Date.now() - intervalDays * MS_PER_DAY);
    const nextReview = new Date(lastReviewed.getTime() + intervalDays * MS_PER_DAY);
    const state: FSRSState = { difficulty: 5, stability: s, nextReview };
    const r = getRetrievability(state);
    expect(r).toBeCloseTo(TARGET_RETENTION, 3);
  });

  it('returns 1.0 immediately after review (t≈0)', () => {
    const stability = 7;
    const intervalDays = -stability * Math.log(TARGET_RETENTION);
    // nextReview is intervalDays from now; lastReviewed is now
    const nextReview = new Date(Date.now() + intervalDays * MS_PER_DAY);
    const state: FSRSState = { difficulty: 5, stability, nextReview };
    const r = getRetrievability(state);
    expect(r).toBeCloseTo(1.0, 3);
  });

  it('returns near-zero for very old facts (many half-lives ago)', () => {
    const stability = 1;
    const state = stateReviewedDaysAgo(100, stability);
    const r = getRetrievability(state);
    expect(r).toBeLessThan(0.01);
  });

  it('decays exponentially — higher stability = higher retention at same elapsed time', () => {
    const lowS = stateReviewedDaysAgo(14, 7);   // t=14, S=7
    const highS = stateReviewedDaysAgo(14, 30); // t=14, S=30
    expect(getRetrievability(highS)).toBeGreaterThan(getRetrievability(lowS));
  });

  it('accepts a custom now parameter', () => {
    const stability = 7;
    const intervalDays = -stability * Math.log(TARGET_RETENTION);
    const lastReviewed = new Date(Date.now() - intervalDays * MS_PER_DAY);
    const nextReview = new Date(lastReviewed.getTime() + intervalDays * MS_PER_DAY);
    const state: FSRSState = { difficulty: 5, stability, nextReview };
    // Passing now = nextReview means t = intervalDays → R ≈ 0.9
    const r = getRetrievability(state, new Date(nextReview.getTime()));
    expect(r).toBeCloseTo(TARGET_RETENTION, 3);
  });

  it('is between 0 and 1 at all times', () => {
    const state = stateReviewedDaysAgo(0, 7);
    expect(getRetrievability(state)).toBeGreaterThanOrEqual(0);
    expect(getRetrievability(state)).toBeLessThanOrEqual(1);
    const old = stateReviewedDaysAgo(365, 1);
    expect(getRetrievability(old)).toBeGreaterThanOrEqual(0);
    expect(getRetrievability(old)).toBeLessThanOrEqual(1);
  });
});

// ===========================================
// scheduleNextReview
// ===========================================

describe('scheduleNextReview', () => {
  it('schedules next review at -S * ln(targetRetention) days', () => {
    const stability = 10;
    const state = makeState({ stability });
    const expectedIntervalDays = -stability * Math.log(TARGET_RETENTION);
    const now = new Date();
    const next = scheduleNextReview(state, TARGET_RETENTION, now);
    const actualDays = (next.getTime() - now.getTime()) / MS_PER_DAY;
    expect(actualDays).toBeCloseTo(expectedIntervalDays, 3);
  });

  it('produces longer interval for higher stability', () => {
    const now = new Date();
    const lowS = makeState({ stability: 5 });
    const highS = makeState({ stability: 30 });
    const nextLow = scheduleNextReview(lowS, TARGET_RETENTION, now);
    const nextHigh = scheduleNextReview(highS, TARGET_RETENTION, now);
    expect(nextHigh.getTime()).toBeGreaterThan(nextLow.getTime());
  });

  it('uses default target retention of 0.9', () => {
    const stability = 7;
    const state = makeState({ stability });
    const now = new Date();
    const defaultNext = scheduleNextReview(state, undefined, now);
    const explicitNext = scheduleNextReview(state, 0.9, now);
    expect(defaultNext.getTime()).toBeCloseTo(explicitNext.getTime(), -2);
  });

  it('returns a future date', () => {
    const state = makeState({ stability: 7 });
    const now = new Date();
    const next = scheduleNextReview(state, TARGET_RETENTION, now);
    expect(next.getTime()).toBeGreaterThan(now.getTime());
  });
});

// ===========================================
// updateAfterRecall
// ===========================================

describe('updateAfterRecall', () => {
  it('increases stability after successful recall', () => {
    const state = makeState({ difficulty: 5, stability: 7 });
    const r = 0.9;
    const updated = updateAfterRecall(state, 4, r);
    expect(updated.stability).toBeGreaterThan(state.stability);
  });

  it('decreases difficulty on high grade (grade=5)', () => {
    const state = makeState({ difficulty: 5, stability: 7 });
    const updated = updateAfterRecall(state, 5, 0.9);
    expect(updated.difficulty).toBeLessThan(state.difficulty);
  });

  it('increases difficulty on low grade (grade=1)', () => {
    const state = makeState({ difficulty: 5, stability: 7 });
    const updated = updateAfterRecall(state, 1, 0.9);
    expect(updated.difficulty).toBeGreaterThan(state.difficulty);
  });

  it('clamps difficulty to [1, 10]', () => {
    const atMax = makeState({ difficulty: 10, stability: 7 });
    const atMin = makeState({ difficulty: 1, stability: 7 });
    const maxUpdated = updateAfterRecall(atMax, 1, 0.9);
    const minUpdated = updateAfterRecall(atMin, 5, 0.9);
    expect(maxUpdated.difficulty).toBeLessThanOrEqual(MAX_DIFFICULTY);
    expect(minUpdated.difficulty).toBeGreaterThanOrEqual(MIN_DIFFICULTY);
  });

  it('implements desirable difficulty: low R leads to bigger stability boost', () => {
    const state = makeState({ difficulty: 5, stability: 7 });
    const highR = updateAfterRecall(state, 4, 0.95);
    const lowR = updateAfterRecall(state, 4, 0.3);
    // Low R (fact was harder to recall) should produce larger stability gain
    expect(lowR.stability).toBeGreaterThan(highR.stability);
  });

  it('updates nextReview to a future date', () => {
    const state = makeState({ stability: 7 });
    const now = new Date();
    const updated = updateAfterRecall(state, 4, 0.9, now);
    expect(updated.nextReview.getTime()).toBeGreaterThan(now.getTime());
  });

  it('keeps stability at or above MIN_STABILITY', () => {
    const tiny = makeState({ difficulty: 10, stability: MIN_STABILITY });
    const updated = updateAfterRecall(tiny, 1, 0.1);
    expect(updated.stability).toBeGreaterThanOrEqual(MIN_STABILITY);
  });

  it('difficulty changes by 0.15*(grade-3) per review step', () => {
    const state = makeState({ difficulty: 5, stability: 7 });
    const updated = updateAfterRecall(state, 4, 0.9);
    // grade=4: delta = -0.15*(4-3) = -0.15
    expect(updated.difficulty).toBeCloseTo(5 - 0.15 * (4 - 3), 3);
  });
});

// ===========================================
// updateAfterForgot
// ===========================================

describe('updateAfterForgot', () => {
  it('decreases stability after forgetting', () => {
    const state = makeState({ difficulty: 5, stability: 7 });
    const updated = updateAfterForgot(state, 0.9);
    expect(updated.stability).toBeLessThan(state.stability);
  });

  it('never drops stability below MIN_STABILITY (0.5)', () => {
    const tiny = makeState({ difficulty: 5, stability: 0.5 });
    const updated = updateAfterForgot(tiny, 0.9);
    expect(updated.stability).toBeGreaterThanOrEqual(MIN_STABILITY);
  });

  it('increases difficulty after forgetting', () => {
    const state = makeState({ difficulty: 5, stability: 7 });
    const updated = updateAfterForgot(state, 0.9);
    expect(updated.difficulty).toBeGreaterThan(state.difficulty);
  });

  it('clamps difficulty to MAX_DIFFICULTY after forgetting', () => {
    const atMax = makeState({ difficulty: 10, stability: 7 });
    const updated = updateAfterForgot(atMax, 0.9);
    expect(updated.difficulty).toBeLessThanOrEqual(MAX_DIFFICULTY);
  });

  it('updates nextReview to a future date', () => {
    const state = makeState({ stability: 7 });
    const now = new Date();
    const updated = updateAfterForgot(state, 0.9, now);
    expect(updated.nextReview.getTime()).toBeGreaterThan(now.getTime());
  });

  it('difficulty increases by 0.2 after forgetting', () => {
    const state = makeState({ difficulty: 5, stability: 7 });
    const updated = updateAfterForgot(state, 0.9);
    expect(updated.difficulty).toBeCloseTo(5 + 0.2, 3);
  });
});

// ===========================================
// initFromDecayClass
// ===========================================

describe('initFromDecayClass', () => {
  it('permanent → low difficulty (~1.5) and high stability (~90)', () => {
    const state = initFromDecayClass('permanent');
    expect(state.difficulty).toBeCloseTo(1.5, 1);
    expect(state.stability).toBeCloseTo(90, 1);
  });

  it('slow_decay → medium-low difficulty (~3) and medium stability (~30)', () => {
    const state = initFromDecayClass('slow_decay');
    expect(state.difficulty).toBeCloseTo(3, 1);
    expect(state.stability).toBeCloseTo(30, 1);
  });

  it('normal_decay → medium difficulty (~5) and week stability (~7)', () => {
    const state = initFromDecayClass('normal_decay');
    expect(state.difficulty).toBeCloseTo(5, 1);
    expect(state.stability).toBeCloseTo(7, 1);
  });

  it('fast_decay → high difficulty (~7.5) and low stability (~2)', () => {
    const state = initFromDecayClass('fast_decay');
    expect(state.difficulty).toBeCloseTo(7.5, 1);
    expect(state.stability).toBeCloseTo(2, 1);
  });

  it('emotional weight 2.0 doubles stability', () => {
    const base = initFromDecayClass('normal_decay', 1.0);
    const emotional = initFromDecayClass('normal_decay', 2.0);
    expect(emotional.stability).toBeCloseTo(base.stability * 2, 3);
  });

  it('emotional weight 1.0 (no boost) leaves stability unchanged', () => {
    const noBoost = initFromDecayClass('normal_decay', 1.0);
    const base = initFromDecayClass('normal_decay');
    expect(noBoost.stability).toBeCloseTo(base.stability, 3);
  });

  it('nextReview is in the future', () => {
    const now = Date.now();
    const state = initFromDecayClass('normal_decay');
    expect(state.nextReview.getTime()).toBeGreaterThan(now);
  });

  it('unknown decay class falls back to normal_decay defaults', () => {
    const unknown = initFromDecayClass('unknown_type');
    const normal = initFromDecayClass('normal_decay');
    expect(unknown.difficulty).toBeCloseTo(normal.difficulty, 3);
    expect(unknown.stability).toBeCloseTo(normal.stability, 3);
  });
});

// ===========================================
// initFromSM2
// ===========================================

describe('initFromSM2', () => {
  it('null stability → default state (D:5, S:1)', () => {
    const state = initFromSM2(null);
    expect(state.difficulty).toBeCloseTo(5, 1);
    expect(state.stability).toBeCloseTo(1, 1);
  });

  it('high SM-2 stability (e.g. 90) → low difficulty', () => {
    const state = initFromSM2(90);
    expect(state.difficulty).toBeLessThan(5);
  });

  it('low SM-2 stability (e.g. 1) → higher difficulty', () => {
    const state = initFromSM2(1);
    expect(state.difficulty).toBeGreaterThan(4);
  });

  it('preserves the SM-2 stability value', () => {
    const state = initFromSM2(14);
    expect(state.stability).toBeCloseTo(14, 1);
  });

  it('nextReview is in the future', () => {
    const now = Date.now();
    const state = initFromSM2(7);
    expect(state.nextReview.getTime()).toBeGreaterThan(now);
  });
});

// ===========================================
// Backward-compat wrappers
// ===========================================

describe('updateStabilityCompat', () => {
  it('increases stability on success', () => {
    const updated = updateStabilityCompat(7, true);
    expect(updated).toBeGreaterThan(7);
  });

  it('decreases stability on failure', () => {
    const updated = updateStabilityCompat(7, false);
    expect(updated).toBeLessThan(7);
  });

  it('never drops below MIN_STABILITY', () => {
    const result = updateStabilityCompat(0.5, false);
    expect(result).toBeGreaterThanOrEqual(MIN_STABILITY);
  });

  it('accepts optional emotionalMultiplier without crashing', () => {
    expect(() => updateStabilityCompat(7, true, 1.5)).not.toThrow();
    const result = updateStabilityCompat(7, true, 1.5);
    expect(result).toBeGreaterThan(0);
  });
});

describe('getRetentionProbabilityCompat', () => {
  it('returns ~1.0 when lastAccess is now', () => {
    const r = getRetentionProbabilityCompat(new Date(), 7);
    expect(r).toBeCloseTo(1.0, 2);
  });

  it('returns lower value when lastAccess is further in the past', () => {
    const recent = getRetentionProbabilityCompat(new Date(Date.now() - 1 * MS_PER_DAY), 7);
    const old = getRetentionProbabilityCompat(new Date(Date.now() - 30 * MS_PER_DAY), 7);
    expect(recent).toBeGreaterThan(old);
  });

  it('returns value between 0 and 1', () => {
    const r = getRetentionProbabilityCompat(new Date(Date.now() - 14 * MS_PER_DAY), 7);
    expect(r).toBeGreaterThanOrEqual(0);
    expect(r).toBeLessThanOrEqual(1);
  });

  it('accepts optional emotionalMultiplier without crashing', () => {
    expect(() => getRetentionProbabilityCompat(new Date(), 7, 1.5)).not.toThrow();
  });

  it('higher emotionalMultiplier → higher retention for same elapsed time', () => {
    const lastAccess = new Date(Date.now() - 10 * MS_PER_DAY);
    const base = getRetentionProbabilityCompat(lastAccess, 7, 1.0);
    const boosted = getRetentionProbabilityCompat(lastAccess, 7, 2.0);
    expect(boosted).toBeGreaterThan(base);
  });
});
