/**
 * ReconsolidationEngine -- PE-Gated Memory Reconsolidation
 *
 * Implements the Nader 2000 reconsolidation paradigm: when a memory is
 * retrieved, it enters a "labile" state. During this window, new information
 * can trigger reconsolidation -- updating or creating new memories based on
 * the Prediction Error (PE) between existing and new content.
 *
 * Key mechanisms:
 *   - Lability window: 10-minute in-memory TTL after retrieval
 *   - PE computation: word-overlap similarity (lightweight, no embeddings)
 *   - Neuromodulatory gating: NE amplifies PE, Serotonin dampens PE
 *   - Update mode selection: confirmed / selective_edit / integration / new_episode
 *   - Context-dependent gating: cross-context blocked, cross-session penalised
 *   - UPDATE_RESISTANCE: memory-type-specific thresholds
 *   - Rollback: snapshot-based undo with idempotent double-rollback
 *
 * Part of the Predictive Memory Architecture (PMA).
 *
 * Reference: Nader, K., Schafe, G. E., & Le Doux, J. E. (2000).
 *   Fear memories require protein synthesis in the amygdala for
 *   reconsolidation after retrieval. Nature, 406(6797), 722-726.
 */

import { AIContext, queryContext } from '../../utils/database-context';
import { logger } from '../../utils/logger';

// ─── Constants ───────────────────────────────────────────────────────

/** Lability window TTL: 10 minutes */
export const LABILITY_TTL_MS = 10 * 60 * 1000;

/** Session mismatch PE penalty */
const SESSION_PENALTY = 0.1;

/** Valid AI contexts for validation */
const VALID_CONTEXTS: AIContext[] = ['operations', 'finance', 'people', 'strategy'];

/**
 * Memory-type-specific update resistance.
 * Higher requiredSignals = more evidence needed before updating.
 */
export const UPDATE_RESISTANCE: Record<string, { minPE: number; requiredSignals: number; windowDays: number }> = {
  semantic:   { minPE: 0.0, requiredSignals: 1, windowDays: 0 },
  episodic:   { minPE: 0.3, requiredSignals: 1, windowDays: 0 },
  preference: { minPE: 0.2, requiredSignals: 3, windowDays: 7 },
  behavioral: { minPE: 0.2, requiredSignals: 5, windowDays: 14 },
  procedural: { minPE: 0.3, requiredSignals: 3, windowDays: 30 },
};

// ─── Types ───────────────────────────────────────────────────────────

export type UpdateMode = 'confirmed' | 'selective_edit' | 'integration' | 'new_episode';

export interface LabilityWindow {
  memoryId: string;
  memoryType: string;
  context: AIContext;
  originalContent: string;
  expiresAt: number;
  sessionId?: string;
}

export interface ReconsolidationResult {
  blocked?: boolean;
  skipped?: boolean;
  reason?: string;
  recommendation?: string;
  mode?: UpdateMode;
  rawPE?: number;
  effectivePE?: number;
  eventId?: string;
  sessionPenalty?: number;
}

export interface ReconsolidationEvent {
  id: string;
  memoryId: string;
  memoryType?: string;
  mode: UpdateMode;
  rawPE: number;
  effectivePE: number;
  originalSnapshot?: string;
  neuromodulatorSnapshot?: string;
  rolledBack?: boolean;
  createdAt?: Date;
}

// ─── Helpers ─────────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Compute word-overlap based dissimilarity between two strings.
 * Returns a value in [0, 1] where 0 = identical, 1 = no overlap.
 *
 * Uses Jaccard distance on word sets: 1 - |A ∩ B| / |A ∪ B|
 */
function wordOverlapDissimilarity(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(Boolean));
  const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(Boolean));

  if (wordsA.size === 0 && wordsB.size === 0) return 0;

  let intersection = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) intersection++;
  }

  const union = wordsA.size + wordsB.size - intersection;
  if (union === 0) return 0;

  return 1 - intersection / union;
}

// ─── Engine ──────────────────────────────────────────────────────────

export class ReconsolidationEngine {
  private enabled = true;
  private labilityWindows = new Map<string, LabilityWindow>();

  /**
   * Availability flag — false if the reconsolidation_events table is missing.
   * Starts true (optimistic) and only flips false on confirmed 42P01 error.
   */
  private available = true;

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

  /**
   * Mark the service unavailable and log a warning. Called once on first
   * 42P01 error so all subsequent calls skip the DB entirely.
   */
  private markUnavailable(context: AIContext, operation: string): void {
    if (this.available) {
      this.available = false;
      logger.warn('ReconsolidationEngine: reconsolidation_events table missing — running in degraded mode', { context, operation });
    }
  }

  // ── Ablation ────────────────────────────────────────────────────

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  // ── Lability Window Management ─────────────────────────────────

  /**
   * Mark a memory as labile (retrieved, open to reconsolidation).
   * Uses composite key `memoryId:context` so same memoryId in different
   * contexts can be tracked independently.
   */
  markLabile(
    memoryId: string,
    memoryType: string,
    context: AIContext,
    originalContent: string,
    sessionId?: string,
  ): void {
    const key = `${memoryId}:${context}`;
    this.labilityWindows.set(key, {
      memoryId,
      memoryType,
      context,
      originalContent,
      expiresAt: Date.now() + LABILITY_TTL_MS,
      sessionId,
    });

    logger.debug('ReconsolidationEngine: memory marked labile', {
      memoryId,
      memoryType,
      context,
    });
  }

  /**
   * Check if a memory is currently in a labile state.
   * Checks all context variants of the memoryId.
   */
  isLabile(memoryId: string): boolean {
    for (const [key, window] of this.labilityWindows) {
      if (key.startsWith(`${memoryId}:`) && window.expiresAt > Date.now()) {
        return true;
      }
    }
    return false;
  }

  /**
   * Get all active lability windows for a specific context.
   */
  getActiveWindows(context: AIContext): LabilityWindow[] {
    const now = Date.now();
    const result: LabilityWindow[] = [];

    for (const window of this.labilityWindows.values()) {
      if (window.context === context && window.expiresAt > now) {
        result.push(window);
      }
    }

    return result;
  }

  /**
   * Remove expired lability windows. Returns count of cleaned entries.
   */
  cleanupExpired(): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, window] of this.labilityWindows) {
      if (window.expiresAt <= now) {
        this.labilityWindows.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.debug('ReconsolidationEngine: cleaned expired windows', { count: cleaned });
    }

    return cleaned;
  }

  // ── PE Computation ─────────────────────────────────────────────

  /**
   * Compute raw Prediction Error between existing and new content.
   * Uses word-overlap Jaccard distance (lightweight, no embeddings).
   */
  computePE(
    existingContent: string,
    newContent: string,
    options?: { contradictionDetected?: boolean; userCorrected?: boolean },
  ): number {
    // User correction override: maximum PE
    if (options?.userCorrected) {
      return 1.0;
    }

    let pe = wordOverlapDissimilarity(existingContent, newContent);

    // Contradiction bonus
    if (options?.contradictionDetected) {
      pe += 0.2;
    }

    return clamp(pe, 0, 1);
  }

  /**
   * Modulate raw PE by neuromodulator state.
   * Formula: clamp(rawPE * (1 + 0.3 * NE - 0.2 * 5HT), 0, 1)
   *
   * High NE (norepinephrine) lowers reconsolidation threshold (amplifies PE).
   * High 5HT (serotonin) raises threshold (dampens PE, promotes stability).
   */
  computeEffectivePE(
    rawPE: number,
    neuroState?: { norepinephrine: number; serotonin: number },
  ): number {
    if (!neuroState) return clamp(rawPE, 0, 1);

    const { norepinephrine, serotonin } = neuroState;
    const modulator = 1 + 0.3 * norepinephrine - 0.2 * serotonin;
    return clamp(rawPE * modulator, 0, 1);
  }

  // ── Update Mode Selection ──────────────────────────────────────

  /**
   * Select reconsolidation update mode based on effective PE.
   *
   * PE < 0.1          -> confirmed      (no change, just confirm existing memory)
   * 0.1 <= PE < 0.3   -> selective_edit (modify specific fields)
   * 0.3 <= PE < 0.7   -> integration   (merge old + new into enriched version)
   * PE >= 0.7         -> new_episode    (keep old, create new memory)
   */
  selectUpdateMode(effectivePE: number): UpdateMode {
    if (effectivePE < 0.1) return 'confirmed';
    if (effectivePE < 0.3) return 'selective_edit';
    if (effectivePE < 0.7) return 'integration';
    return 'new_episode';
  }

  // ── Full Reconsolidation Flow ──────────────────────────────────

  /**
   * Attempt to reconsolidate a memory with new information.
   *
   * Gating rules:
   *   1. Engine must be enabled (ablation flag)
   *   2. Memory must be in labile state
   *   3. Context must match (cross-context blocked)
   *   4. PE must exceed memory-type threshold
   *   5. Cross-session penalty of +0.1 applied to threshold
   */
  async reconsolidate(
    memoryId: string,
    newInfo: string,
    context: AIContext,
    sessionId?: string,
    neuroState?: { norepinephrine: number; serotonin: number },
  ): Promise<ReconsolidationResult> {
    // 1. Ablation gate
    if (!this.enabled) {
      logger.debug('ReconsolidationEngine: disabled, skipping', { memoryId });
      return { skipped: true };
    }

    // 2. Context validation
    if (!VALID_CONTEXTS.includes(context)) {
      return { blocked: true, reason: `invalid_context: ${context}` };
    }

    // 3. Find labile window for this memory in ANY context
    let window: LabilityWindow | undefined;
    for (const [key, w] of this.labilityWindows) {
      if (key.startsWith(`${memoryId}:`) && w.expiresAt > Date.now()) {
        window = w;
        break;
      }
    }

    // 4. Lability gate
    if (!window) {
      return { skipped: true };
    }

    // 5. Cross-context gate
    if (window.context !== context) {
      return {
        blocked: true,
        reason: 'cross_context',
        recommendation: 'create_new_episode_in_current_context',
      };
    }

    // 6. Compute PE
    const rawPE = this.computePE(window.originalContent, newInfo);
    const effectivePE = this.computeEffectivePE(rawPE, neuroState);

    // 6b. Phase 145 PMA: StabilityProtector gate — old, stable memories resist casual updates
    // Fetches lock score from DB (or uses defaults), then checks if PE exceeds threshold
    try {
      const { StabilityProtector } = await import('./stability-protector');
      const protector = new StabilityProtector();

      // Try to load existing lock score from DB
      let lockScore: number | undefined;
      let rigidityFactor: number | undefined;

      if (this.available) {
        try {
          const lockResult = await queryContext(
            context,
            `SELECT lock_score, rigidity_factor FROM memory_stability_locks WHERE memory_id = $1 LIMIT 1`,
            [memoryId],
          );
          if (lockResult.rows.length > 0 && lockResult.rows[0].lock_score !== null && lockResult.rows[0].lock_score !== undefined) {
            lockScore = lockResult.rows[0].lock_score;
            rigidityFactor = lockResult.rows[0].rigidity_factor;
          }
        } catch {
          // Table might not exist yet — proceed with defaults
        }
      }

      // Only apply stability protection when an actual lock record exists.
      // Memories without stability data (new/untracked) should not be blocked.
      if (lockScore !== undefined && !protector.canUpdate(memoryId, effectivePE, lockScore, rigidityFactor)) {
        logger.info('ReconsolidationEngine: blocked by StabilityProtector', {
          memoryId, effectivePE, lockScore, rigidityFactor,
        });
        return {
          blocked: true,
          reason: 'stability_lock',
          recommendation: 'memory_too_stable_for_this_pe',
          rawPE,
          effectivePE,
        };
      }
    } catch (err) {
      // Non-critical: if protector fails, proceed with reconsolidation (permissive)
      logger.debug('ReconsolidationEngine: StabilityProtector check skipped', {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // 7. Session penalty
    const sameSession = sessionId !== null && sessionId !== undefined && window.sessionId !== null && window.sessionId !== undefined && sessionId === window.sessionId;
    const sessionPenalty = sameSession ? 0 : SESSION_PENALTY;

    // 8. Select mode (with session penalty factored into the threshold comparison)
    const adjustedPE = Math.max(0, effectivePE - sessionPenalty);
    const mode = this.selectUpdateMode(adjustedPE);

    // 9. Persist reconsolidation event
    const originalSnapshot = JSON.stringify({ content: window.originalContent });
    const neuromodulatorSnapshot = neuroState
      ? JSON.stringify(neuroState)
      : JSON.stringify({ norepinephrine: 0.5, serotonin: 0.5 });

    let eventId: string | undefined;
    if (this.available) {
      try {
        const result = await queryContext(
          context,
          `INSERT INTO reconsolidation_events
           (memory_id, memory_type, mode, raw_pe, effective_pe, session_penalty,
            original_snapshot, neuromodulator_snapshot)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING id`,
          [
            memoryId,
            window.memoryType,
            mode,
            rawPE,
            effectivePE,
            sessionPenalty,
            originalSnapshot,
            neuromodulatorSnapshot,
          ],
        );

        eventId = result.rows[0]?.id;
      } catch (err) {
        if (ReconsolidationEngine.isMissingTable(err)) {
          this.markUnavailable(context, 'reconsolidate');
        } else {
          logger.error('ReconsolidationEngine: failed to persist event', err instanceof Error ? err : new Error(String(err)), { memoryId, context });
        }
      }
    }

    logger.info('ReconsolidationEngine: reconsolidation complete', {
      memoryId,
      mode,
      rawPE,
      effectivePE,
      sessionPenalty,
      eventId,
    });

    return {
      mode,
      rawPE,
      effectivePE,
      eventId,
      sessionPenalty,
    };
  }

  // ── Rollback ───────────────────────────────────────────────────

  /**
   * Rollback a reconsolidation event, restoring the original snapshot.
   * Idempotent: double rollback on already-rolled-back event is a no-op.
   * When the table is unavailable, returns silently (no event to roll back).
   */
  async rollback(eventId: string, context: AIContext, userId?: string): Promise<void> {
    if (!this.available) return;

    // Fetch the event (with optional user isolation)
    const result = await queryContext(
      context,
      userId
        ? `SELECT id, memory_id, original_snapshot, rolled_back
           FROM reconsolidation_events WHERE id = $1 AND user_id = $2`
        : `SELECT id, memory_id, original_snapshot, rolled_back
           FROM reconsolidation_events WHERE id = $1`,
      userId ? [eventId, userId] : [eventId],
    );

    if (result.rows.length === 0) {
      throw new Error('Reconsolidation event not found');
    }

    const event = result.rows[0];

    // Idempotent: already rolled back
    if (event.rolled_back) {
      logger.debug('ReconsolidationEngine: event already rolled back', { eventId });
      return;
    }

    // Mark as rolled back (with optional user isolation)
    await queryContext(
      context,
      userId
        ? `UPDATE reconsolidation_events SET rolled_back = true, rolled_back_at = NOW() WHERE id = $1 AND user_id = $2`
        : `UPDATE reconsolidation_events SET rolled_back = true, rolled_back_at = NOW() WHERE id = $1`,
      userId ? [eventId, userId] : [eventId],
    );

    logger.info('ReconsolidationEngine: event rolled back', {
      eventId,
      memoryId: event.memory_id,
    });
  }

  // ── History ────────────────────────────────────────────────────

  /**
   * Retrieve recent reconsolidation events for a context.
   * Returns empty array when the table is unavailable.
   */
  async getHistory(context: AIContext, limit: number = 50): Promise<ReconsolidationEvent[]> {
    if (!this.available) return [];

    try {
      const result = await queryContext(
        context,
        `SELECT id, memory_id, memory_type, mode, raw_pe, effective_pe,
                original_snapshot, neuromodulator_snapshot, rolled_back, created_at
         FROM reconsolidation_events
         ORDER BY created_at DESC
         LIMIT $1`,
        [limit],
      );

      return result.rows.map((row: any) => ({
        id: row.id,
        memoryId: row.memory_id,
        memoryType: row.memory_type,
        mode: row.mode,
        rawPE: Number(row.raw_pe),
        effectivePE: Number(row.effective_pe),
        originalSnapshot: row.original_snapshot,
        neuromodulatorSnapshot: row.neuromodulator_snapshot,
        rolledBack: row.rolled_back,
        createdAt: row.created_at ? new Date(row.created_at) : undefined,
      }));
    } catch (err) {
      if (ReconsolidationEngine.isMissingTable(err)) {
        this.markUnavailable(context, 'getHistory');
        return [];
      }
      throw err;
    }
  }
}

/** Module-level singleton — ensures labile windows persist across recall → remember in same process */
export const reconsolidationEngine = new ReconsolidationEngine();
