/**
 * FSRS (Free Spaced Repetition Scheduler)
 *
 * Re-exports from @zensation/algorithms. The inline implementation was
 * the original development copy; the published package is now the source of truth.
 *
 * All function signatures are identical — this is a drop-in replacement.
 */

export {
  type FSRSState,
  TARGET_RETENTION,
  MIN_STABILITY,
  MIN_DIFFICULTY,
  MAX_DIFFICULTY,
  MS_PER_DAY,
  clampDifficulty,
  getRetrievability,
  scheduleNextReview,
  updateAfterRecall,
  updateAfterForgot,
  initFromDecayClass,
  initFromSM2,
  updateStabilityCompat,
  getRetentionProbabilityCompat,
} from '@zensation/algorithms';

// --- vmPFC Prediction-Error Coupled FSRS Extension ---
import { computeAdaptiveFSRSInterval, computeKGPredictionError } from '../../algorithms/fsrs-vmPFC';

/**
 * vmPFC-enhanced FSRS scheduling: couples interval with KG prediction error.
 * Based on: Zou et al. (Cell Reports 2025)
 */
export function scheduleWithVmPFC(
  baseIntervalDays: number,
  embeddingAtLastReview: number[],
  currentEmbedding: number[],
): { adaptedIntervalDays: number; predictionError: number } {
  const pe = computeKGPredictionError(embeddingAtLastReview, currentEmbedding);
  const adaptedIntervalDays = computeAdaptiveFSRSInterval(baseIntervalDays, pe);
  return { adaptedIntervalDays, predictionError: pe };
}

// --- Titans VFE-Delta Coupled FSRS Extension (Phase H6.3 binding) ---
import {
  applyVFEIntervalShrink,
  type EncodingIntervalOptions,
} from '../../algorithms/surprise-gradient-memory';

/** Read the H6_VFE_BOOST env flag once at module load. */
const H6_VFE_BOOST_DEFAULT = (() => {
  const raw = process.env.H6_VFE_BOOST;
  if (typeof raw !== 'string') return false;
  return raw === 'true' || raw === '1' || raw.toLowerCase() === 'yes';
})();

export interface ScheduleWithVFEOptions {
  /** Per-call override of the env-default. When undefined, falls back
   *  to `H6_VFE_BOOST`. */
  enableVFEShrink?: boolean;
  /** Forwarded to `applyVFEIntervalShrink` (beta + intervalFloor). */
  vfeShrinkOptions?: EncodingIntervalOptions;
}

/**
 * Phase H6.3 binding — Titans surprise-gradient FSRS scheduling: shrinks
 * the next-review interval as a function of the memory's accumulated
 * VFE-delta (signed surprise EMA).
 *
 * High |delta| (lots of surprise) → faster review. Identity behaviour
 * (vfeDelta = 0 OR feature off) returns the input interval unchanged.
 *
 * This is the load-bearing coupling for the **A2 research novelty
 * hypothesis** — Titans surprise × FSRS-vmPFC PE-coupling. Production
 * caller composes this AFTER `scheduleWithVmPFC`:
 *
 * ```ts
 * const { adaptedIntervalDays } = scheduleWithVmPFC(base, oldEmb, newEmb);
 * const finalDays = scheduleWithVFE(adaptedIntervalDays, vfeDelta).adaptedIntervalDays;
 * ```
 *
 * Default OFF — eval harness flips per-call or via env.
 */
export function scheduleWithVFE(
  baseIntervalDays: number,
  vfeDelta: number,
  options: ScheduleWithVFEOptions = {},
): { adaptedIntervalDays: number; vfeApplied: boolean; shrinkFactor: number } {
  const useShrink = options.enableVFEShrink ?? H6_VFE_BOOST_DEFAULT;
  if (!useShrink) {
    return {
      adaptedIntervalDays: baseIntervalDays,
      vfeApplied: false,
      shrinkFactor: 1,
    };
  }
  const adapted = applyVFEIntervalShrink(
    baseIntervalDays,
    vfeDelta,
    options.vfeShrinkOptions,
  );
  const factor = baseIntervalDays > 0 ? adapted / baseIntervalDays : 1;
  return {
    adaptedIntervalDays: adapted,
    vfeApplied: true,
    shrinkFactor: factor,
  };
}
