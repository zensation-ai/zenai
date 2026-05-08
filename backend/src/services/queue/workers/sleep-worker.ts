/**
 * Phase 63: Sleep-Time Compute BullMQ Worker
 *
 * Processes sleep compute jobs from the memory-consolidation queue.
 * Supports repeatable jobs for scheduled execution.
 *
 * Phase H4.H (2026-05-07) extends the worker with the Hindsight reflect-
 * cycle: a periodic job per context that re-checks Bayesian belief
 * confidence + auto-supersedes beliefs that drifted below the H4.4
 * abandonment threshold. Default OFF via env `H4_REFLECT_CYCLE_SCHEDULED`.
 */

import { logger } from '../../../utils/logger';
import { AIContext, queryContext } from '../../../utils/database-context';
import { getSleepComputeEngine, SleepCycleResult } from '../../memory/sleep-compute';
import { getContextEngineV2 } from '../../context-engine-v2';
import {
  evaluateSleepGate,
  lightMemToIsIdle,
  type AttentionMetrics,
  type SleepGateOptions,
} from '../../memory/lightmem-sleep-trigger';
import { getHindsightStoresForContext } from '../../memory/memory-coordinator';
import { runReflectionPass } from '../../memory/hindsight-networks/reflect-cycle';

const VALID_CONTEXTS: AIContext[] = ['operations', 'finance', 'people', 'strategy'];

/** Read the H6_LIGHTMEM_GATE env flag once at module load. */
const H6_LIGHTMEM_GATE_DEFAULT = (() => {
  const raw = process.env.H6_LIGHTMEM_GATE;
  if (typeof raw !== 'string') return false;
  return raw === 'true' || raw === '1' || raw.toLowerCase() === 'yes';
})();

/** Read the H4_REFLECT_CYCLE_SCHEDULED env flag at call time.
 *  When true, scheduleSleepJobs enqueues a Hindsight reflect-cycle per
 *  context. Default OFF. The flag gates SCHEDULING only — the
 *  processSleepJob branch for 'hindsight_reflect' runs unconditionally
 *  if a job arrives (so manual / test enqueues work even with flag OFF).
 *
 *  Read at call time (not at module load) so tests can flip the env
 *  without needing `jest.resetModules` — the latter interacts poorly
 *  with the file-top `jest.mock` declarations elsewhere in the suite.
 */
function getH4ReflectScheduledEnv(): boolean {
  const raw = process.env.H4_REFLECT_CYCLE_SCHEDULED;
  if (typeof raw !== 'string') return false;
  const lower = raw.toLowerCase();
  return lower === 'true' || lower === '1' || lower === 'yes';
}

/** Initial delay (ms) before the first Hindsight reflect job per context.
 *  Spaced 7 minutes apart per context so they don't all fire at once. */
const HINDSIGHT_REFLECT_BASE_DELAY_MS = 90 * 60 * 1000; // 90 min
const HINDSIGHT_REFLECT_PER_CONTEXT_OFFSET_MS = 7 * 60 * 1000; // 7 min

/** Default lookback window for the entity-id query: only entities whose
 *  summaries were updated in the last N hours are considered for
 *  reflection. Older entities are deliberately skipped — if their
 *  underlying facts haven't changed, there's nothing to recompute. */
const HINDSIGHT_REFLECT_LOOKBACK_HOURS = 24;
/** Cap on entityIds passed to runReflectionPass per cycle. Bounds the
 *  worst-case wall-clock and DB load of one cycle. */
const HINDSIGHT_REFLECT_MAX_ENTITIES = 100;

export interface SleepJobData {
  context: AIContext;
  cycleType?:
    | 'full'
    | 'consolidation_only'
    | 'preload_only'
    | 'cache_cleanup'
    | 'hindsight_reflect';
}

/** Result shape returned from a Hindsight reflect-cycle job. */
export interface HindsightReflectResult {
  context: AIContext;
  entitiesConsidered: number;
  summariesRebuilt: number;
  beliefsSuperseded: number;
  durationMs: number;
  /** Set when the cycle was a no-op due to missing stores or empty
   *  candidate set. Useful for telemetry: "scheduled but skipped" vs.
   *  "scheduled and ran". */
  skipped?: 'no_stores_wired' | 'no_recent_entities';
}

export interface ScheduleHindsightReflectEntry {
  queueName: 'memory-consolidation';
  jobName: string;
  data: SleepJobData;
  delayMs: number;
}

export interface ScheduleHindsightReflectOptions {
  /** Override the env-default. When undefined, falls back to
   *  `H4_REFLECT_CYCLE_SCHEDULED`. */
  enable?: boolean;
  /** Override the per-context base delay (ms). */
  baseDelayMs?: number;
  /** Override the spacing between contexts (ms). */
  perContextOffsetMs?: number;
}

/**
 * Pure helper: returns the list of Hindsight reflect-cycle job entries
 * to enqueue, OR an empty list when the flag is OFF. Extracted from
 * scheduleSleepJobs so the scheduling logic is unit-testable without
 * spinning up BullMQ.
 */
export function getHindsightReflectScheduleEntries(
  options: ScheduleHindsightReflectOptions = {},
): ScheduleHindsightReflectEntry[] {
  const enable = options.enable ?? getH4ReflectScheduledEnv();
  if (!enable) return [];
  const baseDelay = Math.max(0, options.baseDelayMs ?? HINDSIGHT_REFLECT_BASE_DELAY_MS);
  const offset = Math.max(0, options.perContextOffsetMs ?? HINDSIGHT_REFLECT_PER_CONTEXT_OFFSET_MS);
  return VALID_CONTEXTS.map((context, idx) => ({
    queueName: 'memory-consolidation' as const,
    jobName: `hindsight-reflect:${context}`,
    data: { context, cycleType: 'hindsight_reflect' as const },
    delayMs: baseDelay + idx * offset,
  }));
}

// ─── Intelligent Scheduling ──────────────────────────────────────────

export interface SleepSchedulingInput {
  lastCycleAt: Date | null;        // When last sleep cycle ran
  unconsolidated: number;           // Count of unconsolidated episodic memories
  peAccumulation: number;           // Sum of prediction errors since last cycle
  fiedlerDelta: number;             // Change in Fiedler value since last cycle
  isIdle: boolean;                  // Whether system has been idle
  /**
   * Phase H6.2 binding: when supplied AND `enableLightMemGate` resolves
   * to true (per-call override or env `H6_LIGHTMEM_GATE=true`), the
   * `isIdle` field is REPLACED by the LightMem entropy-proxy decision.
   * Production callers leave this undefined to keep the legacy time-only
   * heuristic; the eval harness sets it to A/B the LightMem gate.
   */
  attentionMetrics?: AttentionMetrics;
  /** Per-call override of the env-default. When undefined, falls back
   *  to `H6_LIGHTMEM_GATE`. Has no effect unless `attentionMetrics` is
   *  also supplied. */
  enableLightMemGate?: boolean;
  /** Forwarded verbatim to `evaluateSleepGate` when LightMem is active
   *  (entropy threshold, hard/soft idle seconds, RPM saturation). */
  lightMemOptions?: SleepGateOptions;
}

export function shouldRunSleepCycle(input: SleepSchedulingInput): {
  shouldRun: boolean;
  mode: 'full' | 'consolidation_only' | 'skip';
  reason: string;
} {
  // Maximum staleness safeguard: force full if no cycle in 24h
  if (!input.lastCycleAt || Date.now() - input.lastCycleAt.getTime() > 24 * 60 * 60 * 1000) {
    return { shouldRun: true, mode: 'full', reason: 'max_staleness_24h' };
  }

  // ── Phase H6.2 binding: LightMem entropy-proxy idle gate ──────────
  // The legacy `isIdle` field comes from a coarse "no requests in 60s"
  // heuristic. LightMem replaces it with an entropy-proxy that fires
  // ~30% more often (catches low-load-but-routine windows the time-only
  // heuristic misses) while still respecting the hard 60s ceiling.
  // Default OFF — eval harness flips per-call or via env.
  const useLightMem =
    (input.enableLightMemGate ?? H6_LIGHTMEM_GATE_DEFAULT) &&
    input.attentionMetrics !== undefined;
  let isIdle = input.isIdle;
  if (useLightMem) {
    const gate = evaluateSleepGate(input.attentionMetrics!, input.lightMemOptions);
    isIdle = lightMemToIsIdle(gate);
  }

  // Must be idle to run
  if (!isIdle) {
    return {
      shouldRun: false,
      mode: 'skip',
      reason: useLightMem ? 'system_active_lightmem' : 'system_active',
    };
  }

  // High volume triggers: full cycle
  if (input.unconsolidated > 50) {
    return { shouldRun: true, mode: 'full', reason: 'high_unconsolidated' };
  }
  if (input.peAccumulation > 5.0) {
    return { shouldRun: true, mode: 'full', reason: 'high_pe_volume' };
  }
  if (input.fiedlerDelta < -0.1) {
    return { shouldRun: true, mode: 'full', reason: 'graph_fragmentation' };
  }

  // Moderate volume: consolidation only
  if (input.unconsolidated > 10) {
    return { shouldRun: true, mode: 'consolidation_only', reason: 'moderate_unconsolidated' };
  }

  // Nothing to do
  return { shouldRun: false, mode: 'skip', reason: 'below_thresholds' };
}

// ─── Job Processing ──────────────────────────────────────────────────

/**
 * Run a Hindsight reflect-cycle for a single context. Pure helper —
 * exposed for unit tests; production callers go through `processSleepJob`.
 *
 * Steps:
 *   1. Resolve Hindsight stores for the context. Bail out as a no-op
 *      when neither network's store is wired (e.g. on a fresh DB without
 *      the Postgres factory registered).
 *   2. Query `entity_summaries` for entities updated in the last
 *      `HINDSIGHT_REFLECT_LOOKBACK_HOURS` hours (capped at
 *      `HINDSIGHT_REFLECT_MAX_ENTITIES`). Older entities are skipped —
 *      their underlying facts haven't moved, no recompute needed.
 *   3. Hand the entityIds to `runReflectionPass`. The pass recomputes
 *      Bayesian belief confidence, auto-supersedes drifted beliefs,
 *      and refreshes the persisted confidence number. No LLM rebuilds
 *      are triggered (the optional `rebuildSummary` callback is
 *      deliberately omitted — that's an LLM call, deferred to a later
 *      sprint).
 *
 * The pass is resilient: per-entity errors don't abort, query failures
 * fall through to a `no_recent_entities` skip rather than a throw, so
 * BullMQ doesn't retry on a non-retriable DB hiccup.
 */
export async function processHindsightReflectJob(
  context: AIContext,
): Promise<HindsightReflectResult> {
  const start = Date.now();
  const stores = getHindsightStoresForContext(context);
  if (!stores.entitySummaryStore || !stores.beliefStore) {
    return {
      context,
      entitiesConsidered: 0,
      summariesRebuilt: 0,
      beliefsSuperseded: 0,
      durationMs: Date.now() - start,
      skipped: 'no_stores_wired',
    };
  }

  let entityIds: string[] = [];
  try {
    const sql = `
      SELECT entity_id
      FROM entity_summaries
      WHERE last_updated > NOW() - INTERVAL '${HINDSIGHT_REFLECT_LOOKBACK_HOURS} hours'
      ORDER BY last_updated DESC
      LIMIT $1
    `;
    const result = await queryContext(context, sql, [HINDSIGHT_REFLECT_MAX_ENTITIES]);
    entityIds = (result.rows ?? [])
      .map((r) => String((r as Record<string, unknown>).entity_id ?? ''))
      .filter((s) => s.length > 0);
  } catch (error) {
    logger.warn('Hindsight reflect-cycle: entity_summaries query failed', {
      operation: 'sleep-worker',
      context,
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      context,
      entitiesConsidered: 0,
      summariesRebuilt: 0,
      beliefsSuperseded: 0,
      durationMs: Date.now() - start,
      skipped: 'no_recent_entities',
    };
  }

  if (entityIds.length === 0) {
    return {
      context,
      entitiesConsidered: 0,
      summariesRebuilt: 0,
      beliefsSuperseded: 0,
      durationMs: Date.now() - start,
      skipped: 'no_recent_entities',
    };
  }

  const result = await runReflectionPass(
    { entityIds },
    stores.entitySummaryStore,
    stores.beliefStore,
  );

  return {
    context,
    entitiesConsidered: entityIds.length,
    summariesRebuilt: result.summariesRebuilt,
    beliefsSuperseded: result.beliefsSuperseded,
    durationMs: Date.now() - start,
  };
}

/**
 * Process a sleep compute job.
 */
export async function processSleepJob(
  data: Record<string, unknown>,
): Promise<SleepCycleResult | { cleaned: number } | HindsightReflectResult> {
  const jobData = data as unknown as SleepJobData;
  const context = jobData.context || 'operations';
  const cycleType = jobData.cycleType || 'full';

  if (!VALID_CONTEXTS.includes(context)) {
    logger.warn('Invalid context for sleep job', { operation: 'sleep-worker', context });
    return { processed: 0, insights: [], contradictionsResolved: 0, memoryUpdates: 0, preloadedItems: 0, durationMs: 0 };
  }

  logger.info('Processing sleep compute job', {
    operation: 'sleep-worker',
    context,
    cycleType,
  });

  if (cycleType === 'cache_cleanup') {
    const engine = getContextEngineV2();
    const cleaned = await engine.cleanExpiredCache(context);
    return { cleaned };
  }

  if (cycleType === 'hindsight_reflect') {
    return processHindsightReflectJob(context);
  }

  const engine = getSleepComputeEngine();
  return engine.runSleepCycle(context);
}

/**
 * Schedule repeatable sleep jobs via BullMQ.
 * Called during server startup.
 */
export async function scheduleSleepJobs(): Promise<void> {
  try {
    // Dynamic import to avoid issues when BullMQ is not available
    const { getQueueService } = await import('../job-queue');
    const queueService = getQueueService();

    if (!queueService.isAvailable()) {
      logger.info('Sleep jobs not scheduled: queue service not available', {
        operation: 'sleep-worker',
      });
      return;
    }

    // Schedule sleep cycles for each context (first run after 30 minutes)
    for (const context of VALID_CONTEXTS) {
      await queueService.enqueue('memory-consolidation', `sleep-cycle:${context}`, {
        context,
        cycleType: 'full',
      }, {
        delay: 60000 * 30, // First run after 30 minutes
      });
    }

    // Schedule cache cleanup (first run after 1 hour)
    for (const context of VALID_CONTEXTS) {
      await queueService.enqueue('memory-consolidation', `cache-cleanup:${context}`, {
        context,
        cycleType: 'cache_cleanup',
      }, {
        delay: 60000 * 60, // First run after 1 hour
      });
    }

    // Phase H4.H: Hindsight reflect-cycle scheduling. Default OFF
    // via env H4_REFLECT_CYCLE_SCHEDULED. When ON, one job per context,
    // staggered 7 minutes apart, first run at +90 min from startup.
    const hindsightEntries = getHindsightReflectScheduleEntries();
    for (const entry of hindsightEntries) {
      await queueService.enqueue(entry.queueName, entry.jobName, {
        context: entry.data.context,
        cycleType: entry.data.cycleType,
      }, {
        delay: entry.delayMs,
      });
    }
    if (hindsightEntries.length > 0) {
      logger.info('Hindsight reflect-cycle jobs scheduled', {
        operation: 'sleep-worker',
        count: hindsightEntries.length,
      });
    }

    logger.info('Sleep jobs scheduled', { operation: 'sleep-worker' });
  } catch (error) {
    logger.warn('Failed to schedule sleep jobs', {
      operation: 'sleep-worker',
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
