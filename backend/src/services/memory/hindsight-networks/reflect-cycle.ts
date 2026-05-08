/**
 * Hindsight Reflect-Cycle.
 *
 * Phase H sprint reference: spec § H4 task 6 (Hindsight pattern,
 * LoCoMo ~89.6 % SOTA reference).
 *
 * What this does
 * --------------
 * Tracks the count of new memories added since the last reflection
 * pass. After every N=20 (configurable) new memories, the cycle
 * trigger fires and a `reflect()` pass runs over the four networks:
 *
 *   - World Facts        → consolidate near-duplicates by hash
 *   - Agent Experiences  → no consolidation needed (immutable events)
 *   - Entity Summaries   → rebuild summaries for entities with
 *                          fresh contributions
 *   - Evolving Beliefs   → re-check confidence against accumulated
 *                          evidence; auto-supersede where < threshold
 *
 * Why a separate trigger module instead of per-write
 * --------------------------------------------------
 * Per-write reflection pollutes the write-path with O(N) work that's
 * largely redundant — most writes don't change the summary or
 * destabilise a belief. Batched reflection at fixed N intervals:
 *
 *   - amortises the work
 *   - matches the spec's "nach jeder N=20 neuen Memories" cadence
 *   - lets the production caller flip cadence per workload (LoCoMo
 *     ingest is bursty, interactive use is sparse)
 *
 * Pure module
 * -----------
 * The trigger is a tiny stateful counter wrapped in `createReflectCycle`,
 * plus the orchestration logic in `runReflectionPass`. The actual
 * mutations happen via injected store interfaces (one per network).
 *
 * @module services/memory/hindsight-networks/reflect-cycle
 */

import type { EntitySummaryStore } from './entity-summaries';
import type { BeliefStore, EvolvingBelief } from './evolving-beliefs';
import { computeBeliefConfidence, markSuperseded, DEFAULT_ABANDONMENT_THRESHOLD } from './evolving-beliefs';

// ===========================================================================
// Types
// ===========================================================================

/** Default trigger threshold per spec § H4 task 6. */
export const DEFAULT_REFLECT_INTERVAL = 20;

/** Stateful counter API returned from `createReflectCycle`. */
export interface ReflectCycleHandle {
  /**
   * Note that one new memory was added. Returns true when this call
   * crosses the trigger threshold (caller should now run a reflection
   * pass). The counter resets after each fire.
   */
  notice(): boolean;
  /** Force-fire the next call regardless of count. Useful for shutdown
   *  / explicit reflect requests. */
  forceTrigger(): void;
  /** Current count since last fire (0 immediately after a fire). */
  count(): number;
  /** Total number of trigger fires so far (for telemetry). */
  fires(): number;
}

export interface ReflectCycleOptions {
  /** Override the trigger threshold (default `DEFAULT_REFLECT_INTERVAL`). */
  interval?: number;
  /** Initial count, useful when restoring state from disk. */
  initialCount?: number;
}

export interface ReflectionPassInputs {
  /** Entities whose summaries may need a rebuild. The pass calls
   *  `entitySummaryStore.get(id)` for each and decides whether to
   *  trigger a rebuild via the supplied callback. */
  entityIds: ReadonlyArray<string>;
  /** Optional callback to rebuild a summary. When omitted, no rebuild
   *  fires — the pass is observational. Production caller wires this
   *  to the recompute path. */
  rebuildSummary?: (entityId: string) => Promise<void>;
}

export interface ReflectionPassResult {
  /** Number of summary rebuilds triggered. */
  summariesRebuilt: number;
  /** Number of beliefs auto-superseded due to confidence drift. */
  beliefsSuperseded: number;
  /** Wall-clock duration of the pass in ms. */
  durationMs: number;
}

// ===========================================================================
// Public API
// ===========================================================================

/**
 * Create a reflect-cycle counter. Each call to `notice()` increments;
 * when the count crosses `interval`, the call returns true and the
 * counter resets.
 *
 * Pure stateful container — production caller is responsible for keeping
 * it alive (typically per-context singleton).
 */
export function createReflectCycle(
  options: ReflectCycleOptions = {},
): ReflectCycleHandle {
  const interval = Math.max(1, Math.floor(options.interval ?? DEFAULT_REFLECT_INTERVAL));
  let counter = Math.max(0, Math.floor(options.initialCount ?? 0));
  let fireCount = 0;
  let pendingForce = false;

  return {
    notice(): boolean {
      counter += 1;
      const shouldFire = pendingForce || counter >= interval;
      if (shouldFire) {
        counter = 0;
        fireCount += 1;
        pendingForce = false;
        return true;
      }
      return false;
    },
    forceTrigger(): void {
      pendingForce = true;
    },
    count(): number {
      return counter;
    },
    fires(): number {
      return fireCount;
    },
  };
}

/**
 * Run a reflection pass: rebuild summaries for the supplied entities,
 * re-check beliefs for auto-supersession.
 *
 * Production caller injects:
 *   - `entitySummaryStore` from H4.3
 *   - `beliefStore` from H4.4
 *   - optional `rebuildSummary` callback (LLM call to re-render
 *     the summary block from updated facts)
 *
 * Returns counts of changes made — useful for telemetry.
 */
export async function runReflectionPass(
  inputs: ReflectionPassInputs,
  entitySummaryStore: EntitySummaryStore,
  beliefStore: BeliefStore,
  options: { abandonmentThreshold?: number } = {},
): Promise<ReflectionPassResult> {
  const start = Date.now();
  const threshold = options.abandonmentThreshold ?? DEFAULT_ABANDONMENT_THRESHOLD;

  let summariesRebuilt = 0;
  let beliefsSuperseded = 0;

  // 1. Rebuild summaries for the supplied entities (when callback
  //    provided). The pass is non-blocking when the store doesn't
  //    have an entry for an id (just skip).
  if (inputs.rebuildSummary) {
    for (const entityId of inputs.entityIds) {
      try {
        const existing = await entitySummaryStore.get(entityId);
        if (existing) {
          await inputs.rebuildSummary(entityId);
          summariesRebuilt += 1;
        }
      } catch {
        // Don't let one bad rebuild abort the pass.
      }
    }
  }

  // 2. Re-check beliefs for auto-supersession. We loop the entity ids
  //    and check active beliefs against the threshold. The Bayesian
  //    confidence may have drifted because of evidence accumulated
  //    between reflections.
  for (const entityId of inputs.entityIds) {
    let beliefs: ReadonlyArray<EvolvingBelief>;
    try {
      beliefs = await beliefStore.listActiveByEntity(entityId);
    } catch {
      continue;
    }
    for (const belief of beliefs) {
      // Recompute confidence from counters (defensive — counters may
      // have been written without the wrapper).
      const recomputed = computeBeliefConfidence(
        belief.evidenceFor,
        belief.evidenceAgainst,
      );
      // Apply the same auto-supersession guard as updateBelief.
      if (
        threshold > 0 &&
        recomputed < threshold &&
        belief.evidenceAgainst >= 2
      ) {
        try {
          const superseded = markSuperseded(
            { ...belief, confidence: recomputed },
            null,
          );
          await beliefStore.update(superseded);
          beliefsSuperseded += 1;
        } catch {
          // Skip on store error.
        }
      } else if (recomputed !== belief.confidence) {
        // Drift correction without supersession — refresh the
        // persisted confidence so listEntityBeliefs returns honest
        // numbers.
        try {
          await beliefStore.update({ ...belief, confidence: recomputed });
        } catch {
          // Skip on store error.
        }
      }
    }
  }

  return {
    summariesRebuilt,
    beliefsSuperseded,
    durationMs: Date.now() - start,
  };
}
