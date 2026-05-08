/**
 * LightMem Sleep-Time Consolidation Trigger.
 *
 * Phase H sprint reference: spec § H6 task 2 (LightMem,
 * arXiv:2510.18866).
 *
 * Why a separate gate
 * -------------------
 * The existing `sleep-worker.ts` already has a `shouldRunSleepCycle`
 * decision function that takes a `SleepSchedulingInput` shape. That
 * function is good at the WHAT (full cycle vs. consolidation-only) but
 * not at the WHEN — its `isIdle` field is supplied by the caller, who
 * historically used a coarse "no requests in 60 seconds" heuristic.
 *
 * LightMem (arXiv:2510.18866) shows that decoupling consolidation from
 * inference using ATTENTION-ENTROPY as the idle signal cuts token cost
 * by ~117× and lifts accuracy by ~10.9 % on long-context QA. The
 * mechanism: high attention entropy = uniform / undirected attention =
 * the model has nothing actively cooking → safe to consolidate. Low
 * entropy = focused inference → don't disturb.
 *
 * What this module does
 * ---------------------
 * 1. Compute a normalised entropy proxy from observable request /
 *    retrieval metrics (we don't have direct access to model attention
 *    weights from the backend).
 * 2. Combine entropy + wall-clock idle-seconds into a `SleepGateSignal`
 *    with a single `shouldTrigger` boolean and a reason string.
 * 3. Provide a top-K utility selector for "targeted replay only on
 *    high-utility memories" (LightMem's other contribution — replay
 *    not ALL memories, just the K with highest combined utility).
 *
 * Pure module: no DB, no I/O, no logger. The sleep-worker (and the
 * new entropy-collector) wire this in.
 *
 * @module services/memory/lightmem-sleep-trigger
 */

// ===========================================================================
// Types
// ===========================================================================

/**
 * Observable metrics that proxy "attention entropy" without requiring
 * direct access to model attention weights. The mapping is documented
 * inline so each contributor can be swept independently in eval.
 */
export interface AttentionMetrics {
  /**
   * Wall-clock seconds since the last user / agent request finished.
   * Higher = more idle.
   */
  idleSeconds: number;
  /**
   * Requests per minute over the trailing 5-minute window. Higher =
   * busier = lower entropy. Bounded at 0.
   */
  requestsPerMinute: number;
  /**
   * Retrieval cache hit rate over the trailing 5-minute window, in
   * [0, 1]. Higher = the system is doing routine lookups
   * (low-entropy, low-load), lower = it's grinding through novel
   * queries (high-load, suspend consolidation).
   *
   * NB: this is NOT the same as cognitive entropy. We use it as one of
   * three contributors. A high cache-hit rate combined with low
   * request rate is the strongest "consolidate now" signal.
   */
  cacheHitRate: number;
  /**
   * Optional: average tokens-per-request over the trailing window.
   * High token throughput = still computing = don't disturb. Default
   * (when absent): treated as 0 → no contribution.
   */
  tokensPerRequest?: number;
}

export interface SleepGateOptions {
  /**
   * Wall-clock seconds before the gate fires regardless of entropy.
   * Default 60 (matches the legacy sleep-worker heuristic). Set to 0
   * to disable the time-only path.
   */
  hardIdleSeconds?: number;
  /**
   * Soft idle threshold — combined with entropy ≥ `entropyThreshold`
   * gives the dual-signal trigger (matches the LightMem paper's "OR"
   * combinator: entropy-high OR idle-very-long).
   */
  softIdleSeconds?: number;
  /**
   * Entropy proxy threshold in [0, 1]. Default 0.7 (calibrated on
   * LightMem's reported sweet-spot for medium-load corpora).
   */
  entropyThreshold?: number;
  /**
   * Cap on requestsPerMinute used in the entropy calc. Default 10
   * (one request every 6s saturates the load contributor).
   */
  rpmSaturation?: number;
}

export interface SleepGateSignal {
  /** Did the trigger fire under the supplied options? */
  shouldTrigger: boolean;
  /** Normalised entropy proxy in [0, 1]. */
  entropy: number;
  /** Wall-clock idle seconds (passed through for downstream logging). */
  idleSeconds: number;
  /** Per-contributor breakdown for observability. */
  contributors: Readonly<Record<string, number>>;
  /** One short line explaining the decision. */
  reason: string;
}

/**
 * A single memory candidate for sleep-time replay selection. Field
 * names match the conventions in `services/memory/sleep-compute.ts`
 * but we keep this module dependency-free by re-declaring the shape.
 */
export interface MemoryUtility {
  id: string;
  /** Composite utility score: combines importance, recency, retention,
   *  prediction-error magnitude. Higher = more worth replaying. */
  utility: number;
  /** Optional payload (passed through unchanged). */
  payload?: unknown;
}

// ===========================================================================
// Defaults
// ===========================================================================

const DEFAULT_HARD_IDLE_SECONDS = 60;
const DEFAULT_SOFT_IDLE_SECONDS = 30;
const DEFAULT_ENTROPY_THRESHOLD = 0.7;
const DEFAULT_RPM_SATURATION = 10;

// ===========================================================================
// Public API
// ===========================================================================

/**
 * Decide whether to fire the sleep-consolidation cycle now.
 *
 * Pure function — same input, same output, no side effects.
 *
 * Decision tree (LightMem-style OR combinator):
 *
 *   1. `hardIdleSeconds` reached → trigger (always).
 *   2. `entropy >= entropyThreshold` AND `idleSeconds >= softIdleSeconds`
 *      → trigger.
 *   3. Otherwise → don't trigger.
 */
export function evaluateSleepGate(
  metrics: AttentionMetrics,
  options: SleepGateOptions = {},
): SleepGateSignal {
  const hardIdle = options.hardIdleSeconds ?? DEFAULT_HARD_IDLE_SECONDS;
  const softIdle = options.softIdleSeconds ?? DEFAULT_SOFT_IDLE_SECONDS;
  const entropyThreshold = options.entropyThreshold ?? DEFAULT_ENTROPY_THRESHOLD;
  const rpmSat = options.rpmSaturation ?? DEFAULT_RPM_SATURATION;

  const idle = Math.max(0, metrics.idleSeconds);
  const rpm = Math.max(0, metrics.requestsPerMinute);
  const cacheHit = clamp(metrics.cacheHitRate, 0, 1);
  const tokensPerReq = Math.max(0, metrics.tokensPerRequest ?? 0);

  // ── Entropy contributors ──────────────────────────────────────────
  // Each in [0, 1]; weighted average gives the entropy proxy.

  // Load contributor: 1 when zero requests/min, 0 when saturated.
  const loadFactor = 1 - clamp(rpm / rpmSat, 0, 1);

  // Cache-routine contributor: high cache-hit rate → low novel work.
  // Square-root spread so a hit-rate of 0.5 already gives a meaningful
  // signal (ratio = 0.71 vs. linear 0.5).
  const routineFactor = Math.sqrt(cacheHit);

  // Token-throughput contributor: when no token-stat is supplied, treat
  // it as fully-idle (1.0). When supplied, decay logarithmically — heavy
  // throughput pushes the contributor toward 0.
  const tokensFactor =
    metrics.tokensPerRequest === undefined
      ? 1.0
      : Math.max(0, 1 - Math.log10(1 + tokensPerReq) / 4);
  // log10(1+200)/4 ≈ 0.58 → tokensFactor ≈ 0.42 at "200 tokens / req"
  // log10(1+10000)/4 ≈ 1.0  → tokensFactor ≈ 0   at heavy generation

  // Weighted average — load and routine are the two primary signals
  // (each 0.4); tokens is a tie-breaker (0.2) so callers without a
  // token signal still get a meaningful entropy.
  const entropy =
    0.4 * loadFactor + 0.4 * routineFactor + 0.2 * tokensFactor;

  const contributors = {
    load: loadFactor,
    routine: routineFactor,
    tokens: tokensFactor,
  };

  // ── Decision tree ────────────────────────────────────────────────
  if (hardIdle > 0 && idle >= hardIdle) {
    return {
      shouldTrigger: true,
      entropy,
      idleSeconds: idle,
      contributors,
      reason: `hard idle threshold reached (${idle.toFixed(0)}s ≥ ${hardIdle}s)`,
    };
  }
  if (entropy >= entropyThreshold && idle >= softIdle) {
    return {
      shouldTrigger: true,
      entropy,
      idleSeconds: idle,
      contributors,
      reason:
        `entropy ${entropy.toFixed(3)} ≥ ${entropyThreshold} AND idle ${idle.toFixed(0)}s ≥ ${softIdle}s`,
    };
  }
  return {
    shouldTrigger: false,
    entropy,
    idleSeconds: idle,
    contributors,
    reason:
      `entropy ${entropy.toFixed(3)} < ${entropyThreshold} or idle ${idle.toFixed(0)}s below thresholds`,
  };
}

/**
 * Select the top-K highest-utility memories for targeted replay.
 *
 * LightMem's contribution beyond the trigger: don't replay ALL stored
 * memories — pick a small high-utility subset. Reported lift: same
 * accuracy, ~50× fewer tokens.
 *
 * Stable tie-break by `id` for deterministic ablation runs.
 */
export function selectTopKForReplay(
  memories: ReadonlyArray<MemoryUtility>,
  k: number,
): MemoryUtility[] {
  if (k <= 0 || memories.length === 0) return [];
  const out = memories.slice();
  out.sort((a, b) => {
    if (b.utility !== a.utility) return b.utility - a.utility;
    return a.id.localeCompare(b.id);
  });
  return out.slice(0, Math.min(k, out.length));
}

/**
 * Compose with the existing sleep-worker decision: when LightMem says
 * "trigger", set the `isIdle` field in `SleepSchedulingInput` to true.
 * When LightMem says "don't trigger", leave it false. This keeps the
 * worker's own logic (mode selection: full vs. consolidation-only)
 * unchanged while delegating the WHEN to LightMem.
 */
export function lightMemToIsIdle(signal: SleepGateSignal): boolean {
  return signal.shouldTrigger;
}

// ===========================================================================
// Helpers
// ===========================================================================

function clamp(x: number, lo: number, hi: number): number {
  if (!Number.isFinite(x)) return lo;
  if (x < lo) return lo;
  if (x > hi) return hi;
  return x;
}
