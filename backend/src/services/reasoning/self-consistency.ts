/**
 * Self-Consistency for chain-of-thought reasoning.
 *
 * Phase H sprint reference: spec § H7 task 3 (Wang et al. 2022,
 * arXiv:2203.11171, "Self-Consistency Improves Chain of Thought
 * Reasoning in Language Models").
 *
 * Why self-consistency lifts Cat 1 (Multi-Hop) accuracy
 * -----------------------------------------------------
 * Multi-hop QA at moderate temperatures is fundamentally noisy: the
 * model picks one reasoning path and commits to it, even when other
 * paths would lead to a better answer. Self-consistency runs N
 * parallel rollouts of the same query at temperature > 0, then
 * majority-votes the final answer.
 *
 * Wang et al. report +5–18 pp gains across reasoning benchmarks for
 * N=10 with no other change. The spec calls for N=3 on LoCoMo Cat 1
 * — a budget-conscious choice that captures most of the lift.
 *
 * What this module does
 * ---------------------
 * Generic, transport-agnostic vote aggregator. The caller supplies:
 *   - an async LLM rollout function `(prompt, seed) → answer`,
 *   - the prompt,
 *   - a list of seeds (length = number of rollouts),
 *   - optionally a normaliser to canonicalise answers before voting,
 *   - optionally a custom voter (default = plurality of normalised
 *     answers).
 *
 * The module:
 *   1. Runs the N rollouts in parallel (Promise.all).
 *   2. Normalises each answer.
 *   3. Aggregates a vote count per normalised answer.
 *   4. Returns the winner with a `consistency` score in [1/N, 1.0]
 *      (= winning-answer count / total-rollouts).
 *
 * No I/O of its own — caller provides the LLM transport.
 *
 * Why standalone (vs. inlining in general-chat.ts)
 * ------------------------------------------------
 * - Pure logic: no global state, deterministic given the rollout
 *   results.
 * - Reusable: caller plugs in any LLM SDK (Anthropic, OpenAI, Mistral)
 *   and any answer-normaliser (string-trim for short answers,
 *   `normalizeListAnswer` for list-style, JSON-parse for structured).
 * - Testable: stub the rollout function with deterministic outputs
 *   and verify the voting algorithm works.
 *
 * @module services/reasoning/self-consistency
 */

// ===========================================================================
// Types
// ===========================================================================

/** Caller-supplied LLM rollout. The seed is forwarded so the caller
 *  can wire it to whatever sampling-randomness knob their SDK exposes
 *  (or ignore it if they use server-side temperature only). */
export type RolloutFn = (prompt: string, seed: number) => Promise<string>;

/** Normalise a raw answer string into the canonical form used for
 *  voting (trim, lowercase, strip punctuation, whatever). Default is
 *  a trim + collapse-whitespace + lowercase. */
export type AnswerNormaliser = (answer: string) => string;

/** A single rollout's full record (raw answer + normalised key). */
export interface RolloutRecord {
  seed: number;
  raw: string;
  normalised: string;
}

export interface SelfConsistencyOptions {
  /** Optional answer normaliser — defaults to trim + collapse + lower. */
  normalise?: AnswerNormaliser;
  /** Cap on the number of rollouts that must succeed before voting.
   *  Default = the seed list length. Use this when partial-failure
   *  recovery is acceptable (e.g. accept 2/3 if one rollout errors). */
  minSuccessfulRollouts?: number;
  /** When true, fail loudly on any rollout error. When false (default),
   *  collect errors and proceed with whatever rollouts succeeded —
   *  provided `minSuccessfulRollouts` is met. */
  failFast?: boolean;
}

export interface SelfConsistencyResult {
  /** The winning answer in its raw (un-normalised) form, taken from
   *  the FIRST rollout that produced the winning normalised key. This
   *  preserves the original capitalisation / phrasing. */
  answer: string;
  /** The normalised winning key. */
  normalisedAnswer: string;
  /** consistency = winning-vote-count / successful-rollouts. In [1/N, 1]. */
  consistency: number;
  /** Per-key vote counts, sorted descending. */
  voteCounts: Array<{ normalised: string; votes: number; sample: string }>;
  /** All successful rollouts, in seed order. */
  rollouts: RolloutRecord[];
  /** Per-rollout errors (empty when failFast=true and we got here). */
  errors: Array<{ seed: number; error: string }>;
}

// ===========================================================================
// Default normaliser
// ===========================================================================

const DEFAULT_NORMALISER: AnswerNormaliser = (a) =>
  String(a ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    // Strip a trailing period (matches LoCoMo-style answer comparison).
    .replace(/\.+\s*$/, '');

// ===========================================================================
// Core
// ===========================================================================

/**
 * Run N parallel rollouts, normalise each answer, return the
 * majority-vote winner with a consistency score.
 *
 * Behaviour:
 *   - Rollouts execute in parallel (Promise.all when failFast=true,
 *     Promise.allSettled when failFast=false).
 *   - Tied votes → break by SEED ORDER: the answer whose first
 *     supporting seed is smaller wins. Deterministic across runs given
 *     the same seed list.
 *   - All rollouts produce empty / whitespace answers → result has
 *     consistency=0 and answer="".
 *
 * @throws when `seeds` is empty, when `failFast=true` and any rollout
 *         rejects, or when `minSuccessfulRollouts` is not met.
 */
export async function runSelfConsistency(
  prompt: string,
  rollout: RolloutFn,
  seeds: ReadonlyArray<number>,
  options: SelfConsistencyOptions = {},
): Promise<SelfConsistencyResult> {
  if (!seeds || seeds.length === 0) {
    throw new Error('runSelfConsistency: seeds must be a non-empty array');
  }
  const normalise = options.normalise ?? DEFAULT_NORMALISER;
  const failFast = options.failFast ?? false;
  const minSuccess = options.minSuccessfulRollouts ?? seeds.length;
  if (minSuccess > seeds.length) {
    throw new Error(
      `runSelfConsistency: minSuccessfulRollouts (${minSuccess}) > seeds.length (${seeds.length})`,
    );
  }

  const rollouts: RolloutRecord[] = [];
  const errors: Array<{ seed: number; error: string }> = [];

  if (failFast) {
    const raws = await Promise.all(seeds.map((s) => rollout(prompt, s)));
    for (let i = 0; i < seeds.length; i++) {
      const raw = String(raws[i] ?? '');
      rollouts.push({ seed: seeds[i], raw, normalised: normalise(raw) });
    }
  } else {
    const settled = await Promise.allSettled(seeds.map((s) => rollout(prompt, s)));
    for (let i = 0; i < seeds.length; i++) {
      const r = settled[i];
      if (r.status === 'fulfilled') {
        const raw = String(r.value ?? '');
        rollouts.push({ seed: seeds[i], raw, normalised: normalise(raw) });
      } else {
        const msg = r.reason instanceof Error ? r.reason.message : String(r.reason);
        errors.push({ seed: seeds[i], error: msg });
      }
    }
  }
  if (rollouts.length < minSuccess) {
    throw new Error(
      `runSelfConsistency: only ${rollouts.length}/${seeds.length} rollouts succeeded ` +
      `(< minSuccessfulRollouts=${minSuccess}). First error: ${errors[0]?.error ?? 'n/a'}`,
    );
  }

  // Tally votes by normalised key, tracking first-seed for tie-break and
  // first-raw for output preservation.
  type Tally = { normalised: string; votes: number; sample: string; firstSeed: number };
  const tally = new Map<string, Tally>();
  for (const r of rollouts) {
    const t = tally.get(r.normalised);
    if (t) {
      t.votes++;
      if (r.seed < t.firstSeed) {
        t.firstSeed = r.seed;
        t.sample = r.raw;
      }
    } else {
      tally.set(r.normalised, {
        normalised: r.normalised,
        votes: 1,
        sample: r.raw,
        firstSeed: r.seed,
      });
    }
  }

  // Sort: votes desc, then firstSeed asc (deterministic tie-break).
  const sorted = Array.from(tally.values()).sort((a, b) => {
    if (b.votes !== a.votes) return b.votes - a.votes;
    return a.firstSeed - b.firstSeed;
  });

  const winner = sorted[0];
  return {
    answer: winner.sample,
    normalisedAnswer: winner.normalised,
    consistency: winner.votes / rollouts.length,
    voteCounts: sorted.map((t) => ({ normalised: t.normalised, votes: t.votes, sample: t.sample })),
    rollouts,
    errors,
  };
}
