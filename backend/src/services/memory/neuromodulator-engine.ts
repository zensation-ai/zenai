/**
 * NeuromodulatorEngine — 4-Channel Neuromodulatory System
 *
 * Simulates global neuromodulation of memory system parameters via
 * four neurotransmitter channels:
 *
 *   Dopamine (VTA)         — exploration / novelty bias
 *   Norepinephrine (LC)    — learning rate
 *   Serotonin (Raphe)      — consolidation patience
 *   Acetylcholine (BF)     — attention / new-info ratio
 *
 * Key dynamics:
 *   - Phasic bursts on events, exponential decay (5-min half-life)
 *   - Tonic baseline with slow homeostatic drift toward 0.5
 *   - DA <-> 5HT opposition coupling (-0.3 coefficient, Stanford 2024)
 *   - Ablation flag for NeurIPS experiment control
 *
 * Part of the Predictive Memory Architecture (PMA).
 */

import { AIContext, queryContext } from '../../utils/database-context';
import { logger } from '../../utils/logger';

// ─── Constants ───────────────────────────────────────────────────────

/** Phasic half-life: 5 minutes */
export const HALF_LIFE_MS = 5 * 60 * 1000;

/** Tonic decay factor toward homeostasis */
export const TONIC_DECAY = 0.95;

/** Tonic signal integration factor */
export const TONIC_SIGNAL = 0.05;

/** DA <-> 5HT opposition coupling coefficient (Stanford 2024) */
export const OPPOSITION_COEFFICIENT = -0.3;

const BASELINE = 0.5;
const LN2 = Math.log(2);

// ─── Types ───────────────────────────────────────────────────────────

export interface NeuromodulatorState {
  dopamine: number;
  norepinephrine: number;
  serotonin: number;
  acetylcholine: number;
  lastUpdated: Date;
}

export interface ModulationParams {
  /** NE-driven */
  learningRate: number;
  /** DA-driven */
  explorationBias: number;
  /** 5HT-driven */
  consolidationPatience: number;
  /** ACh-driven */
  attentionRatio: number;
}

export interface NeuroEvent {
  magnitude: number;
  userId: string;
  context: AIContext;
}

export type EventType =
  | 'novelty'
  | 'prediction_error'
  | 'stable_focus'
  | 'exploration'
  | 'routine'
  | 'confirmation'
  | 'rejection'
  | 'context_switch';

// ─── Internal State ──────────────────────────────────────────────────

interface PhasicEntry {
  dopamine: number;
  norepinephrine: number;
  serotonin: number;
  acetylcholine: number;
  timestamp: number; // Date.now() at emission
}

interface ChannelTonic {
  dopamine: number;
  norepinephrine: number;
  serotonin: number;
  acetylcholine: number;
}

// ─── Event -> Channel Mappings ───────────────────────────────────────

interface ChannelDelta {
  dopamine: number;
  norepinephrine: number;
  serotonin: number;
  acetylcholine: number;
}

function eventToDeltas(type: EventType, magnitude: number): ChannelDelta {
  const d: ChannelDelta = { dopamine: 0, norepinephrine: 0, serotonin: 0, acetylcholine: 0 };

  switch (type) {
    case 'novelty':
      d.dopamine = magnitude;
      d.serotonin = OPPOSITION_COEFFICIENT * magnitude;
      break;
    case 'prediction_error':
      d.norepinephrine = magnitude;
      break;
    case 'stable_focus':
      d.serotonin = magnitude;
      d.dopamine = OPPOSITION_COEFFICIENT * magnitude;
      break;
    case 'exploration':
      d.acetylcholine = magnitude;
      break;
    case 'routine':
      d.dopamine = -0.2 * magnitude;
      d.serotonin = 0.2 * magnitude;
      break;
    case 'confirmation':
      d.norepinephrine = -0.1 * magnitude;
      break;
    case 'rejection':
      d.norepinephrine = 0.5 * magnitude;
      d.dopamine = -0.2 * magnitude;
      break;
    case 'context_switch':
      d.serotonin = -0.3 * magnitude;
      d.acetylcholine = 0.3 * magnitude;
      break;
  }

  return d;
}

// ─── Helpers ─────────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function stateKey(userId: string, context: AIContext): string {
  return `${userId}:${context}`;
}

function defaultTonic(): ChannelTonic {
  return {
    dopamine: BASELINE,
    norepinephrine: BASELINE,
    serotonin: BASELINE,
    acetylcholine: BASELINE,
  };
}

// ─── Engine ──────────────────────────────────────────────────────────

export class NeuromodulatorEngine {
  /**
   * Per user-context tonic baselines.
   * Lazy-loaded from DB, cached in memory.
   */
  private tonicMap: Map<string, ChannelTonic> = new Map();

  /**
   * Phasic event buffer — accumulates deltas that decay over time.
   */
  private phasicMap: Map<string, PhasicEntry[]> = new Map();

  /**
   * Virtual time offsets for advanceTime simulation (ms added to now).
   */
  private timeOffsets: Map<string, number> = new Map();

  /** Ablation toggle */
  private enabled = true;

  /**
   * Availability flag — false if the required DB table is missing.
   * Detected on first DB error with code 42P01 (undefined_table).
   * Starts true (optimistic) and only flips false on confirmed missing table.
   */
  private available = true;

  /**
   * Mark the service unavailable and log a warning. Called once on first
   * 42P01 error so all subsequent calls skip the DB entirely.
   */
  private markUnavailable(context: AIContext, operation: string): void {
    if (this.available) {
      this.available = false;
      logger.warn('NeuromodulatorEngine: neuromodulator_state table missing — running in degraded mode', { context, operation });
    }
  }

  /**
   * Returns true if the error indicates a missing table (PostgreSQL 42P01).
   */
  private static isMissingTable(err: unknown): boolean {
    return (
      typeof err === 'object' &&
      err !== null &&
      ((err as any).code === '42P01' ||
        (typeof (err as any).message === 'string' &&
          (err as any).message.includes('does not exist')))
    );
  }

  // ── Tonic Computations ──────────────────────────────────────────

  /** Homeostatic decay: tonic_new = current * TONIC_DECAY */
  computeTonicDecay(current: number): number {
    return current * TONIC_DECAY;
  }

  /** Tonic update on event signal: tonic_new = current * TONIC_DECAY + signal * TONIC_SIGNAL */
  computeTonicUpdate(current: number, signal: number): number {
    return current * TONIC_DECAY + signal * TONIC_SIGNAL;
  }

  // ── Ablation ────────────────────────────────────────────────────

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  // ── State Loading ───────────────────────────────────────────────

  /**
   * Load tonic state from DB or return defaults.
   * When the required table is unavailable, returns all-0.5 baseline immediately.
   */
  async getState(userId: string, context: AIContext): Promise<NeuromodulatorState> {
    const key = stateKey(userId, context);

    // Try cached
    const cached = this.tonicMap.get(key);
    if (cached) {
      return {
        ...cached,
        lastUpdated: new Date(),
      };
    }

    // If table is known to be missing, return default immediately
    if (!this.available) {
      return {
        dopamine: BASELINE,
        norepinephrine: BASELINE,
        serotonin: BASELINE,
        acetylcholine: BASELINE,
        lastUpdated: new Date(),
      };
    }

    // Try DB
    try {
      const result = await queryContext(
        context,
        `SELECT dopamine, norepinephrine, serotonin, acetylcholine, updated_at
         FROM neuromodulator_state
         WHERE user_id = $1
         LIMIT 1`,
        [userId],
      );

      if (result.rows.length > 0) {
        const row = result.rows[0];
        const tonic: ChannelTonic = {
          dopamine: Number(row.dopamine),
          norepinephrine: Number(row.norepinephrine),
          serotonin: Number(row.serotonin),
          acetylcholine: Number(row.acetylcholine),
        };
        this.tonicMap.set(key, tonic);
        return {
          ...tonic,
          lastUpdated: row.updated_at ? new Date(row.updated_at) : new Date(),
        };
      }
    } catch (err) {
      if (NeuromodulatorEngine.isMissingTable(err)) {
        this.markUnavailable(context, 'getState');
      } else {
        logger.warn('NeuromodulatorEngine: DB load failed, using defaults', { userId, context, error: err });
      }
    }

    // Default baseline
    const tonic = defaultTonic();
    this.tonicMap.set(key, tonic);
    return {
      ...tonic,
      lastUpdated: new Date(),
    };
  }

  // ── Event Emission ──────────────────────────────────────────────

  /**
   * Emit a neuromodulatory event, applying phasic deltas and updating tonic.
   */
  async emitEvent(type: EventType, event: NeuroEvent): Promise<void> {
    const { magnitude, userId, context } = event;
    const key = stateKey(userId, context);

    // Ensure tonic is loaded
    await this.getState(userId, context);

    const deltas = eventToDeltas(type, magnitude);
    const offset = this.timeOffsets.get(key) ?? 0;

    // Record phasic entry
    const entries = this.phasicMap.get(key) ?? [];
    const now = Date.now() + offset;
    entries.push({
      dopamine: deltas.dopamine,
      norepinephrine: deltas.norepinephrine,
      serotonin: deltas.serotonin,
      acetylcholine: deltas.acetylcholine,
      timestamp: now,
    });

    // Prune stale entries during writes (entries fully decayed after ~50 min)
    const staleThreshold = now - HALF_LIFE_MS * 10;
    const liveEntries = entries.filter((e) => e.timestamp >= staleThreshold);
    this.phasicMap.set(key, liveEntries);

    // Update tonic baseline slowly
    const tonic = this.tonicMap.get(key) ?? defaultTonic();
    tonic.dopamine = this.computeTonicUpdate(tonic.dopamine, clamp(tonic.dopamine + deltas.dopamine, 0, 1));
    tonic.norepinephrine = this.computeTonicUpdate(tonic.norepinephrine, clamp(tonic.norepinephrine + deltas.norepinephrine, 0, 1));
    tonic.serotonin = this.computeTonicUpdate(tonic.serotonin, clamp(tonic.serotonin + deltas.serotonin, 0, 1));
    tonic.acetylcholine = this.computeTonicUpdate(tonic.acetylcholine, clamp(tonic.acetylcholine + deltas.acetylcholine, 0, 1));
    this.tonicMap.set(key, tonic);

    logger.debug('NeuromodulatorEngine: event emitted', { type, userId, context, magnitude, deltas });
  }

  // ── Phasic State ────────────────────────────────────────────────

  /**
   * Compute effective neuromodulator levels:
   *   effective = clamp(tonic + sum(phasic_i * decay_i), 0, 1)
   *
   * Prunes stale entries older than 10 half-lives (~50 min) before iterating,
   * since their decay contribution is negligible (< 0.1% of original magnitude).
   */
  async getCurrentPhasicState(userId: string, context: AIContext): Promise<NeuromodulatorState> {
    const key = stateKey(userId, context);
    const tonic = this.tonicMap.get(key) ?? defaultTonic();
    const entries = this.phasicMap.get(key) ?? [];
    const offset = this.timeOffsets.get(key) ?? 0;
    const now = Date.now() + offset;

    // Prune entries older than 10 half-lives (fully decayed)
    const staleThreshold = now - HALF_LIFE_MS * 10;
    const liveEntries = entries.filter((e) => e.timestamp >= staleThreshold);
    if (liveEntries.length !== entries.length) {
      if (liveEntries.length > 0) {
        this.phasicMap.set(key, liveEntries);
      } else {
        this.phasicMap.delete(key);
      }
    }

    let da = tonic.dopamine;
    let ne = tonic.norepinephrine;
    let ht = tonic.serotonin;
    let ach = tonic.acetylcholine;

    for (const entry of liveEntries) {
      const elapsed = now - entry.timestamp;
      const decay = Math.exp(-(elapsed / HALF_LIFE_MS) * LN2);

      da += entry.dopamine * decay;
      ne += entry.norepinephrine * decay;
      ht += entry.serotonin * decay;
      ach += entry.acetylcholine * decay;
    }

    return {
      dopamine: clamp(da, 0, 1),
      norepinephrine: clamp(ne, 0, 1),
      serotonin: clamp(ht, 0, 1),
      acetylcholine: clamp(ach, 0, 1),
      lastUpdated: new Date(),
    };
  }

  // ── Time Simulation ─────────────────────────────────────────────

  /**
   * Advance virtual clock for a user-context pair (testing / simulation).
   */
  advanceTime(userId: string, context: AIContext, ms: number): void {
    const key = stateKey(userId, context);
    const current = this.timeOffsets.get(key) ?? 0;
    this.timeOffsets.set(key, current + ms);
  }

  // ── Modulation Params ───────────────────────────────────────────

  /**
   * Map channel levels to concrete system parameters.
   * When disabled (ablation), returns all-0.5 baseline.
   */
  async getModulationParams(userId: string, context: AIContext): Promise<ModulationParams> {
    if (!this.enabled) {
      return {
        learningRate: BASELINE,
        explorationBias: BASELINE,
        consolidationPatience: BASELINE,
        attentionRatio: BASELINE,
      };
    }

    const state = await this.getCurrentPhasicState(userId, context);

    return {
      learningRate: state.norepinephrine,
      explorationBias: state.dopamine,
      consolidationPatience: state.serotonin,
      attentionRatio: state.acetylcholine,
    };
  }

  // ── Persistence ─────────────────────────────────────────────────

  /**
   * Persist tonic levels to neuromodulator_state table via upsert.
   * No-op when the table is unavailable.
   */
  async persistState(userId: string, context: AIContext): Promise<void> {
    if (!this.available) return;

    const key = stateKey(userId, context);
    const tonic = this.tonicMap.get(key) ?? defaultTonic();

    try {
      await queryContext(
        context,
        `INSERT INTO neuromodulator_state (user_id, dopamine, norepinephrine, serotonin, acetylcholine, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         ON CONFLICT (user_id)
         DO UPDATE SET
           dopamine = EXCLUDED.dopamine,
           norepinephrine = EXCLUDED.norepinephrine,
           serotonin = EXCLUDED.serotonin,
           acetylcholine = EXCLUDED.acetylcholine,
           updated_at = NOW()`,
        [userId, tonic.dopamine, tonic.norepinephrine, tonic.serotonin, tonic.acetylcholine],
      );

      logger.debug('NeuromodulatorEngine: state persisted', { userId, context });
    } catch (err) {
      if (NeuromodulatorEngine.isMissingTable(err)) {
        this.markUnavailable(context, 'persistState');
      } else {
        logger.error('NeuromodulatorEngine: failed to persist state', err instanceof Error ? err : new Error(String(err)), { userId, context });
      }
    }
  }

  // ── Plasticity Index ────────────────────────────────────────────

  /**
   * BDNF analog — active users get more plastic memory system.
   * Computes plasticity index from recent message activity.
   *
   * @param messagesInLast2Hours - Number of messages in last 2 hours
   * @returns plasticityIndex in [0.5, 1.0]
   */
  computePlasticityIndex(messagesInLast2Hours: number): number {
    const activityLevel = Math.min(Math.max(messagesInLast2Hours, 0) / 20, 1.0); // Normalize to [0, 1]
    const sigmoid = 1 / (1 + Math.exp(-(activityLevel - 0.5) * 4));
    return 0.5 + 0.5 * sigmoid;
  }
}
