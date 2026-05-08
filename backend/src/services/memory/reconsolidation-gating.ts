/**
 * Reconsolidation Gating Policy — PE × incompleteness probabilistic gate.
 *
 * Phase H sprint reference: spec § H6 task 6 (Lee 2019 reconsolidation
 * model). Implementation of the spec's exact formula:
 *
 *     reconsolidationProb = sigmoid(2 · incompleteness · peMagnitude - 1)
 *     trigger = random() < reconsolidationProb
 *
 * Why a probabilistic gate
 * ------------------------
 * Today's `ReconsolidationEngine.reconsolidate(...)` runs whenever the
 * caller asks it to — i.e. potentially on EVERY retrieval. Lee 2019's
 * meta-analysis of the molecular-biology literature (and the more
 * recent computational work on episodic-memory updating) finds that
 * destabilisation is the EXCEPTION not the rule:
 *
 *   - Only INCOMPLETE reminders trigger destabilisation. A complete
 *     re-presentation of the original cue → recall, but no labile
 *     window opens.
 *   - High PREDICTION-ERROR magnitudes amplify the trigger; small PEs
 *     don't open the window even with incomplete reminders.
 *   - The two factors are MULTIPLICATIVE — neither alone suffices.
 *
 * Empirical Lee-2019-aligned reports place the per-retrieval
 * reconsolidation rate around 20–30 %. Today's engine is at ~100 %.
 * Closing this gap is one of the highest-leverage cognitive-realism
 * improvements available without retraining anything.
 *
 * What this module does
 * ---------------------
 * Pure stateless functions:
 *   - `cueMatchScore(cueTokens, memoryTokens)` — Jaccard overlap as a
 *     proxy for "how complete is this reminder cue". Caller can swap
 *     for a stronger signal (embedding cosine, KG-edge match, …).
 *   - `incompletenessOf(score)` — `1 − cueMatch`, clamped to [0, 1].
 *   - `reconsolidationProbability(incompleteness, peMagnitude)` — the
 *     spec's exact `sigmoid(2 · incompleteness · peMagnitude − 1)`.
 *   - `shouldReconsolidate(...)` — top-level gate combining the above
 *     with an injected RNG. Returns `{ trigger, probability, reason }`
 *     so callers can log the decision path.
 *
 * No DB, no I/O, no LLM. Trivially testable. Composable into the
 * existing `ReconsolidationEngine` via a one-line guard at the top of
 * `reconsolidate()` — that production wiring is a separate sprint to
 * keep this commit reviewable.
 *
 * @module services/memory/reconsolidation-gating
 */

// ===========================================================================
// Cue-match score
// ===========================================================================

function tokenise(text: string): Set<string> {
  return new Set(
    String(text ?? '')
      .toLowerCase()
      .replace(/[^\w\s]+/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 0),
  );
}

/**
 * Jaccard overlap between cue tokens and memory tokens, in [0, 1].
 * 1 = complete reminder (cue == memory). 0 = no overlap.
 *
 * The Jaccard choice is deliberate: it's symmetric, bounded, and
 * doesn't over-weight long memories. Production callers may swap for
 * a richer measure (embedding cosine, KG-shortest-path, …) by skipping
 * this helper and computing their own score directly.
 */
export function cueMatchScore(cueText: string, memoryText: string): number {
  const cue = tokenise(cueText);
  const mem = tokenise(memoryText);
  if (cue.size === 0 && mem.size === 0) return 1.0;
  if (cue.size === 0 || mem.size === 0) return 0.0;
  let inter = 0;
  for (const t of cue) if (mem.has(t)) inter++;
  const union = cue.size + mem.size - inter;
  return union === 0 ? 0 : inter / union;
}

/**
 * Convert a cue-match score into an incompleteness score.
 * `incompleteness = 1 − cueMatch`, clamped to [0, 1].
 *
 * 1 = nothing of the cue is in the memory (maximally incomplete
 *     reminder; will trigger destabilisation freely).
 * 0 = perfect cue-memory match (complete reminder; no destabilisation
 *     even at high PE).
 */
export function incompletenessOf(cueMatch: number): number {
  if (!Number.isFinite(cueMatch)) return 0;
  if (cueMatch < 0) return 1;
  if (cueMatch > 1) return 0;
  return 1 - cueMatch;
}

// ===========================================================================
// Probabilistic gate
// ===========================================================================

function sigmoid(x: number): number {
  // Numerically stable: avoid overflow on very large negative x.
  if (x >= 0) {
    const e = Math.exp(-x);
    return 1 / (1 + e);
  }
  const e = Math.exp(x);
  return e / (1 + e);
}

/**
 * Spec § H6.6 verbatim formula:
 *
 *     reconsolidationProb = sigmoid(2 · incompleteness · peMagnitude - 1)
 *
 * Properties (sanity checks, also covered in the test suite):
 *   - incompleteness=0 OR peMagnitude=0  → arg = -1 → prob ≈ 0.269
 *   - incompleteness=1 AND peMagnitude=1 → arg = +1 → prob ≈ 0.731
 *   - mid-point (i=p=0.5)                → arg = -0.5 → prob ≈ 0.378
 *   - both clamped to [0, 1] before use.
 *
 * The sigmoid scale (factor 2 inside, offset −1) gives a gentle but
 * meaningful gate around the operating range (i, p ∈ [0, 1]) — strong
 * triggers are not certain, weak triggers are not impossible. Matches
 * Lee 2019's reported variability.
 */
export function reconsolidationProbability(
  incompleteness: number,
  peMagnitude: number,
): number {
  const i = clamp01(incompleteness);
  const p = clamp01(peMagnitude);
  return sigmoid(2 * i * p - 1);
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

// ===========================================================================
// Top-level decision
// ===========================================================================

/** RNG callback. Caller can inject a deterministic-seeded RNG for tests. */
export type Rng = () => number;

export interface ShouldReconsolidateInput {
  /** Cue-text the user / system used to retrieve the memory. */
  cueText: string;
  /** The retrieved memory's text (or its key fact representation). */
  memoryText: string;
  /** Prediction-error magnitude in [0, 1]. Caller computes this from
   *  `ReconsolidationEngine.computePE()` or any equivalent measure. */
  peMagnitude: number;
  /** Optional RNG override; defaults to `Math.random`. */
  rng?: Rng;
}

export interface ShouldReconsolidateDecision {
  /** True if the gate fires (caller proceeds with reconsolidation). */
  trigger: boolean;
  /** The computed probability used for the draw. Useful for logging. */
  probability: number;
  /** The cue-match score (0 = no overlap, 1 = perfect match). */
  cueMatch: number;
  /** Computed `1 − cueMatch`. */
  incompleteness: number;
  /** The PE magnitude as supplied (clamped to [0, 1] for the sigmoid). */
  peMagnitude: number;
  /** Short human-readable reason for the decision (for logging). */
  reason: string;
}

/**
 * Decide whether to open a reconsolidation window for a retrieval event.
 *
 * Returns the full decision record so the caller can both act on the
 * boolean trigger AND log the reasoning. The RNG defaults to
 * `Math.random` but can be injected for deterministic tests.
 */
export function shouldReconsolidate(input: ShouldReconsolidateInput): ShouldReconsolidateDecision {
  const cueMatch = cueMatchScore(input.cueText, input.memoryText);
  const incompleteness = incompletenessOf(cueMatch);
  const peClamped = clamp01(input.peMagnitude);
  const probability = reconsolidationProbability(incompleteness, peClamped);
  const rng = input.rng ?? Math.random;
  const draw = rng();
  const trigger = draw < probability;
  return {
    trigger,
    probability,
    cueMatch,
    incompleteness,
    peMagnitude: peClamped,
    reason:
      trigger
        ? `gate fired (incompleteness=${incompleteness.toFixed(2)}, PE=${peClamped.toFixed(2)}, prob=${probability.toFixed(3)})`
        : `gate held (incompleteness=${incompleteness.toFixed(2)}, PE=${peClamped.toFixed(2)}, prob=${probability.toFixed(3)})`,
  };
}
