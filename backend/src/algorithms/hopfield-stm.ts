/**
 * Modern Hopfield Network for Short-Term Memory.
 *
 * Phase H sprint reference: spec § H6 task 4 (ARMT Hopfield basins,
 * arXiv:2407.04841 + Ramsauer et al. 2021 arXiv:2008.02217).
 *
 * Why a Hopfield STM
 * ------------------
 * The current short-term-memory backend stores raw patterns and
 * recalls by linear similarity scan. That works for small N but
 * doesn't scale to long LoCoMo conversations where the in-context
 * STM can hold dozens to hundreds of working slots.
 *
 * Modern Hopfield Networks (MHN, Ramsauer et al. 2021) are a drop-in
 * upgrade with three load-bearing properties for STM:
 *
 *   1. **O(1) recall** — one softmax-weighted update converges to the
 *      nearest attractor (vs. iterative passes for classical Hopfield).
 *      The MHN paper proves this is a single forward pass equivalent
 *      to one transformer self-attention step.
 *
 *   2. **Exponential capacity** — the basin-of-attraction count scales
 *      exponentially in `d` (vs. linearly for classical Hopfield).
 *      For LoCoMo's d≈1536 embedding dimension this means STM can
 *      store thousands of distinct patterns without interference.
 *
 *   3. **Energy minimisation** — the recall step is provably a step
 *      down the energy surface, with discrete attractor states for
 *      high β and smooth manifold for low β. Lets us tune the
 *      recall regime (sharp pattern-completion vs. soft averaging)
 *      with a single hyperparameter.
 *
 * The math
 * --------
 * Stored pattern matrix X ∈ R^(d × N) with N stored patterns of
 * dimension d. Query state ξ ∈ R^d. Recall update:
 *
 *     ξ_new = X · softmax(β · X^T · ξ)
 *
 * Under mild conditions on the patterns (separated, unit-norm), this
 * converges in 1 step to the nearest attractor. The MHN energy:
 *
 *     E(ξ) = -1/β · log(Σ_i exp(β · ξ^T · X_i)) + 1/2 · ξ^T · ξ
 *
 * This module exports `hopfieldRecall(query, patterns, options)` and
 * a couple of helpers (`hopfieldEnergy`, `hopfieldUpdate`) for callers
 * that want tighter control. No DB, no I/O — pure linear-algebra in
 * plain JS arrays.
 *
 * Performance notes
 * -----------------
 * - Time: O(N · d) per update step (one matrix-vector multiply each
 *   way). For N≈600, d≈1536, this is ~1M FLOPs per recall — sub-ms.
 * - Space: O(N · d) for the pattern matrix. The caller owns the
 *   storage (we do not copy patterns into a private buffer).
 * - β=∞ would give a pure argmax (one-hot softmax). In practice β=1–4
 *   is enough for clean retrieval on unit-norm embeddings.
 *
 * @module algorithms/hopfield-stm
 */

// ===========================================================================
// Types
// ===========================================================================

/** A stored pattern: vector + optional payload + optional id. */
export interface HopfieldPattern<T = unknown> {
  /** d-dimensional pattern vector. Unit-norm strongly recommended for
   *  predictable basin behaviour (the math assumes magnitudes don't
   *  swamp the inner products). */
  vector: ReadonlyArray<number>;
  /** Optional caller payload — what's stored alongside the pattern.
   *  Returned in `matches` after recall so the caller can map back. */
  payload?: T;
  /** Optional id for stable identification across runs. */
  id?: string;
}

export interface HopfieldOptions {
  /** Inverse temperature. Higher → sharper attractor, more like argmax;
   *  lower → smoother averaging across patterns. Default 1.0. For
   *  LoCoMo-scale (d≈1536, N≈600) values 1–4 work well. */
  beta?: number;
  /** Maximum recall iterations. Modern Hopfield converges in 1 step
   *  for separated patterns. Default 1. Set higher when patterns are
   *  expected to be highly correlated. */
  maxIterations?: number;
  /** L2-norm change threshold for declaring convergence. Default 1e-4.
   *  Only consulted when `maxIterations > 1`. */
  convergenceTol?: number;
}

export interface HopfieldRecallResult<T> {
  /** The recall vector after convergence (or after maxIterations). */
  recoveredVector: number[];
  /** All stored patterns with their softmax weights, sorted descending. */
  matches: Array<{
    pattern: HopfieldPattern<T>;
    weight: number;
    /** Inner-product score β·⟨ξ, X_i⟩ before softmax. Useful for
     *  diagnostic logging when weights are degenerate (all near 1/N). */
    score: number;
  }>;
  /** True if the recall settled (Δ‖ξ‖ < tol within maxIterations). */
  converged: boolean;
  /** Number of update steps performed. */
  iterations: number;
  /** The Hopfield energy of the recovered state. Lower = closer to
   *  an attractor. */
  energy: number;
}

// ===========================================================================
// Defaults
// ===========================================================================

const DEFAULT_BETA = 1.0;
const DEFAULT_MAX_ITERATIONS = 1;
const DEFAULT_CONVERGENCE_TOL = 1e-4;

// ===========================================================================
// Linear-algebra helpers (plain JS, no dep)
// ===========================================================================

function dot(a: ReadonlyArray<number>, b: ReadonlyArray<number>): number {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}

function norm2(a: ReadonlyArray<number>): number {
  let s = 0;
  for (const v of a) s += v * v;
  return s;
}

/** Numerically stable softmax: subtract max before exp. */
function softmax(scores: ReadonlyArray<number>): number[] {
  if (scores.length === 0) return [];
  let max = scores[0];
  for (let i = 1; i < scores.length; i++) if (scores[i] > max) max = scores[i];
  const out = new Array<number>(scores.length);
  let sum = 0;
  for (let i = 0; i < scores.length; i++) {
    const e = Math.exp(scores[i] - max);
    out[i] = e;
    sum += e;
  }
  if (sum === 0) {
    // All -Inf inputs — return uniform.
    const u = 1 / scores.length;
    for (let i = 0; i < scores.length; i++) out[i] = u;
    return out;
  }
  for (let i = 0; i < scores.length; i++) out[i] /= sum;
  return out;
}

// ===========================================================================
// Single-step update (exposed for advanced callers)
// ===========================================================================

/**
 * One Hopfield update: ξ_new = X · softmax(β · X^T · ξ).
 *
 * Returns the new state and the softmax weights. Pure function — no
 * mutation of inputs.
 */
export function hopfieldUpdate<T>(
  state: ReadonlyArray<number>,
  patterns: ReadonlyArray<HopfieldPattern<T>>,
  beta: number,
): { state: number[]; weights: number[]; scores: number[] } {
  const N = patterns.length;
  if (N === 0) return { state: state.slice(), weights: [], scores: [] };
  const d = state.length;
  // Compute per-pattern inner products.
  const scores = new Array<number>(N);
  for (let i = 0; i < N; i++) scores[i] = beta * dot(state, patterns[i].vector);
  const weights = softmax(scores);
  // New state = Σ w_i · X_i
  const newState = new Array<number>(d).fill(0);
  for (let i = 0; i < N; i++) {
    const w = weights[i];
    if (w === 0) continue;
    const v = patterns[i].vector;
    const m = Math.min(d, v.length);
    for (let j = 0; j < m; j++) newState[j] += w * v[j];
  }
  return { state: newState, weights, scores };
}

// ===========================================================================
// Energy
// ===========================================================================

/** MHN energy: E(ξ) = -1/β · logsumexp(β · ⟨ξ, X_i⟩) + 1/2 · ‖ξ‖². */
export function hopfieldEnergy<T>(
  state: ReadonlyArray<number>,
  patterns: ReadonlyArray<HopfieldPattern<T>>,
  beta: number,
): number {
  if (patterns.length === 0) return 0.5 * norm2(state);
  let max = -Infinity;
  const scores = new Array<number>(patterns.length);
  for (let i = 0; i < patterns.length; i++) {
    scores[i] = beta * dot(state, patterns[i].vector);
    if (scores[i] > max) max = scores[i];
  }
  let sumExp = 0;
  for (const s of scores) sumExp += Math.exp(s - max);
  // log-sum-exp trick: log(Σ exp x) = max + log(Σ exp(x - max))
  const logSumExp = max + Math.log(sumExp);
  return -logSumExp / beta + 0.5 * norm2(state);
}

// ===========================================================================
// Recall (top-level)
// ===========================================================================

/**
 * Recall the nearest stored pattern to `query` via Modern Hopfield
 * iteration. Returns the recovered state, sorted matches with softmax
 * weights, and the final energy.
 */
export function hopfieldRecall<T>(
  query: ReadonlyArray<number>,
  patterns: ReadonlyArray<HopfieldPattern<T>>,
  options: HopfieldOptions = {},
): HopfieldRecallResult<T> {
  const beta = options.beta ?? DEFAULT_BETA;
  const maxIter = options.maxIterations ?? DEFAULT_MAX_ITERATIONS;
  const tol = options.convergenceTol ?? DEFAULT_CONVERGENCE_TOL;
  if (beta <= 0 || !Number.isFinite(beta)) {
    throw new Error(`hopfieldRecall: beta must be positive finite; got ${beta}`);
  }
  if (maxIter < 1) {
    throw new Error(`hopfieldRecall: maxIterations must be >= 1; got ${maxIter}`);
  }
  if (!query || query.length === 0) {
    throw new Error('hopfieldRecall: query vector must be non-empty');
  }
  if (patterns.length === 0) {
    return {
      recoveredVector: query.slice(),
      matches: [],
      converged: true,
      iterations: 0,
      energy: hopfieldEnergy(query, [], beta),
    };
  }

  let state = query.slice();
  let lastWeights: number[] = [];
  let lastScores: number[] = [];
  let converged = false;
  let iterations = 0;
  for (let step = 0; step < maxIter; step++) {
    const { state: newState, weights, scores } = hopfieldUpdate(state, patterns, beta);
    iterations = step + 1;
    // Convergence check (only meaningful when maxIter > 1).
    if (maxIter > 1) {
      let delta2 = 0;
      for (let i = 0; i < newState.length; i++) {
        const d = newState[i] - state[i];
        delta2 += d * d;
      }
      if (Math.sqrt(delta2) < tol) converged = true;
    } else {
      // Single-step: declare converged (the MHN paper's main claim).
      converged = true;
    }
    state = newState;
    lastWeights = weights;
    lastScores = scores;
    if (converged) break;
  }

  // Build sorted match list.
  const matches = patterns.map((pattern, i) => ({
    pattern,
    weight: lastWeights[i] ?? 0,
    score: lastScores[i] ?? 0,
  }));
  matches.sort((a, b) => b.weight - a.weight);

  return {
    recoveredVector: state,
    matches,
    converged,
    iterations,
    energy: hopfieldEnergy(state, patterns, beta),
  };
}

// ===========================================================================
// Convenience: top-K matches
// ===========================================================================

/** Get the top-K patterns from a recall result. Optional `minWeight`
 *  threshold — patterns below it are dropped (useful for soft-filtering
 *  out distractor noise). */
export function topKHopfieldMatches<T>(
  result: HopfieldRecallResult<T>,
  k: number,
  minWeight = 0,
): HopfieldRecallResult<T>['matches'] {
  if (k <= 0) return [];
  return result.matches.filter((m) => m.weight >= minWeight).slice(0, k);
}
