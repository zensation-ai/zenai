/**
 * StabilityProtector -- NogoA Analog with HDAC3 Rigidity
 *
 * Well-established memories resist casual updates. The StabilityProtector
 * computes a "lock score" from multiple factors and gates reconsolidation:
 * high lock scores require proportionally higher Prediction Error (PE) to
 * trigger an update.
 *
 * Biological analogs:
 *   - NogoA: inhibitory signal that prevents synaptic rewiring in mature circuits
 *   - HDAC3: epigenetic brake that increases chromatin compaction with memory age,
 *     making memory traces progressively harder to modify
 *
 * Lock score formula:
 *   0.3 * normAccess + 0.3 * confidence + 0.2 * normAge + 0.2 * coreFactor
 *   where:
 *     normAccess = log2(1 + min(accessCount, 10)) / log2(11)
 *     normAge    = min(ageInDays / 365, 1)
 *     coreFactor = isCoreFact ? 1 : 0
 *
 * Rigidity formula (HDAC3 analog):
 *   1 + 0.1 * log2(1 + ageInDays)
 *
 * Update threshold:
 *   0.5 + 0.3 * lockScore * rigidityFactor
 *
 * Part of the Predictive Memory Architecture (PMA).
 */

import { AIContext, queryContext } from '../../utils/database-context';
import { logger } from '../../utils/logger';

// ─── Constants ───────────────────────────────────────────────────────────────

/** Weights for lock score components */
const W_ACCESS = 0.3;
const W_CONFIDENCE = 0.3;
const W_AGE = 0.2;
const W_CORE = 0.2;

/** Access count ceiling for normalisation */
const ACCESS_CAP = 10;

/** log2(11) — denominator for access normalisation */
const LOG2_11 = Math.log2(ACCESS_CAP + 1);

/** Base update threshold (for lock=0, rigidity=1) */
const BASE_THRESHOLD = 0.5;

/** Scaling of lock × rigidity on threshold */
const LOCK_SCALE = 0.3;

// ─── StabilityProtector ──────────────────────────────────────────────────────

export class StabilityProtector {
  private enabled = true;

  /**
   * Availability flag — false if the memory_stability_locks table is missing.
   * Starts true (optimistic) and only flips false on confirmed 42P01 error.
   * Only gates evaluateAndStore (the single DB-writing method).
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
   * Enable or disable the protector.
   * When disabled, canUpdate() always returns true (ablation mode).
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    logger.debug(`StabilityProtector enabled=${enabled}`);
  }

  /**
   * Compute the lock score for a memory from its usage and age metrics.
   *
   * @param accessCount  Number of times the memory has been accessed
   * @param confidence   Confidence / strength of the memory (0-1)
   * @param ageInDays    Age of the memory in days (negative treated as 0)
   * @param isCoreFact   Whether this is a pinned core fact
   * @returns            Lock score in [0, 1]
   */
  computeLockScore(
    accessCount: number,
    confidence: number,
    ageInDays: number,
    isCoreFact: boolean,
  ): number {
    const safeAge = Math.max(0, ageInDays);
    const cappedAccess = Math.min(accessCount, ACCESS_CAP);

    const normAccess = Math.log2(1 + cappedAccess) / LOG2_11;
    const normAge = Math.min(safeAge / 365, 1);
    const coreFactor = isCoreFact ? 1 : 0;

    const raw =
      W_ACCESS * normAccess +
      W_CONFIDENCE * confidence +
      W_AGE * normAge +
      W_CORE * coreFactor;

    return Math.max(0, Math.min(1, raw));
  }

  /**
   * Compute the HDAC3-analog rigidity factor: progressive epigenetic brake
   * that increases with memory age.
   *
   * Formula: 1 + 0.1 * log2(1 + ageInDays)
   *
   * @param ageInDays  Age of the memory in days (negative treated as 0)
   * @returns          Rigidity factor >= 1.0
   */
  computeRigidityFactor(ageInDays: number): number {
    const safeAge = Math.max(0, ageInDays);
    return 1 + 0.1 * Math.log2(1 + safeAge);
  }

  /**
   * Determine whether a proposed update can proceed given the PE strength.
   *
   * Threshold = 0.5 + 0.3 * lockScore * rigidityFactor
   *
   * @param _memoryId       Memory identifier (for logging)
   * @param proposedPE      Prediction Error magnitude of the proposed update
   * @param lockScore       Pre-computed lock score (default 0 = no protection)
   * @param rigidityFactor  Pre-computed rigidity factor (default 1.0)
   * @returns               true if the update is permitted
   */
  canUpdate(
    _memoryId: string,
    proposedPE: number,
    lockScore = 0,
    rigidityFactor = 1.0,
  ): boolean {
    if (!this.enabled) {
      return true;
    }

    const threshold = BASE_THRESHOLD + LOCK_SCALE * lockScore * rigidityFactor;

    logger.debug(`StabilityProtector.canUpdate memoryId=${_memoryId} PE=${proposedPE.toFixed(3)} threshold=${threshold.toFixed(3)}`);

    return proposedPE >= threshold;
  }

  /**
   * Variance-based lock score for agent strategy reconsolidation.
   * Higher variance → less stable → lower lock score.
   *
   * Formula: 1 - clamp(variance, 0, 1)
   *
   * @param variance  Variance of recent outcomes (0-1)
   * @returns         Lock score in [0, 1]
   */
  computeLockScoreFromVariance(variance: number): number {
    const clamped = Math.max(0, Math.min(1, variance));
    return 1 - clamped;
  }

  /**
   * Compute lock score and rigidity factor for a memory, then persist the
   * result to the `memory_stability_locks` table.
   *
   * @param memoryId    UUID of the memory
   * @param accessCount Number of accesses
   * @param confidence  Memory confidence (0-1)
   * @param ageInDays   Memory age in days
   * @param isCoreFact  Whether this is a pinned core fact
   * @param userId      Owner user ID
   * @param context     AI context schema
   * @returns           Computed { lockScore, rigidityFactor }
   */
  async evaluateAndStore(
    memoryId: string,
    accessCount: number,
    confidence: number,
    ageInDays: number,
    isCoreFact: boolean,
    userId: string,
    context: AIContext,
  ): Promise<{ lockScore: number; rigidityFactor: number }> {
    // Pure computation always runs regardless of table availability
    const lockScore = this.computeLockScore(accessCount, confidence, ageInDays, isCoreFact);
    const rigidityFactor = this.computeRigidityFactor(ageInDays);

    // Skip DB write if table is known to be missing
    if (!this.available) {
      logger.debug(`StabilityProtector.evaluateAndStore memoryId=${memoryId} (in-memory only, table unavailable) lockScore=${lockScore.toFixed(3)} rigidity=${rigidityFactor.toFixed(3)}`);
      return { lockScore, rigidityFactor };
    }

    const sql = `
      INSERT INTO memory_stability_locks
        (memory_id, user_id, lock_score, rigidity_factor, last_evaluated)
      VALUES
        ($1, $2, $3, $4, NOW())
      ON CONFLICT (memory_id, user_id)
      DO UPDATE SET
        lock_score       = EXCLUDED.lock_score,
        rigidity_factor  = EXCLUDED.rigidity_factor,
        last_evaluated   = NOW()
    `;

    try {
      await queryContext(context, sql, [memoryId, userId, lockScore, rigidityFactor]);
    } catch (err) {
      if (StabilityProtector.isMissingTable(err)) {
        this.available = false;
        logger.warn(
          'StabilityProtector: memory_stability_locks table missing — running in degraded mode (in-memory only)',
          { context, memoryId },
        );
        // Still return computed scores; just skip the DB persist
        return { lockScore, rigidityFactor };
      }
      throw err;
    }

    logger.debug(`StabilityProtector.evaluateAndStore memoryId=${memoryId} lockScore=${lockScore.toFixed(3)} rigidity=${rigidityFactor.toFixed(3)}`);

    return { lockScore, rigidityFactor };
  }
}
