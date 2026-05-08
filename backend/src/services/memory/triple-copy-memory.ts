/**
 * TripleCopyMemory -- Divergent Strength Dynamics
 *
 * Basel 2024 (Science): Every memory event creates 3 copies with different
 * decay/growth dynamics:
 *
 *   FastCopy   (Redis-like, τ=4h exponential decay)  — immediate vivid access
 *   MediumCopy (DB episodic, τ=14d exponential decay) — session-accessible
 *   DeepCopy   (LTM/KG, τ=7d logarithmic growth)     — permanent essence
 *
 * MediumCopy is created synchronously at store time (NOT deferred to
 * sleep-compute) to prevent data loss if sleep doesn't run within
 * FastCopy's 24h TTL.
 *
 * Part of the Predictive Memory Architecture (PMA).
 *
 * Reference: Cascade model of memory trace formation inspired by
 * multi-store consolidation research (Basel 2024, Science).
 */

import { AIContext, queryContext } from '../../utils/database-context';
import { logger } from '../../utils/logger';
import { randomUUID } from 'crypto';

// ─── Constants ───────────────────────────────────────────────────────

/** FastCopy time constant: 4 hours in milliseconds */
export const TAU_FAST = 4 * 3600 * 1000;

/** MediumCopy time constant: 14 days in milliseconds */
export const TAU_MEDIUM = 14 * 24 * 3600 * 1000;

/** DeepCopy time constant: 7 days in milliseconds */
export const TAU_DEEP = 7 * 24 * 3600 * 1000;

/** Minimum strength to consider a copy retrievable */
export const RETRIEVAL_THRESHOLD = 0.3;

/** MediumCopy initial strength multiplier relative to importance */
const MEDIUM_STRENGTH_RATIO = 0.8;

// ─── Types ───────────────────────────────────────────────────────────

export interface MemoryCopy {
  id: string;
  memoryEventId: string;
  copyType: 'fast' | 'medium' | 'deep';
  storageRef: string;
  strength: number;
  createdAt: Date;
  lastAccessed: Date | null;
}

export interface RetrievalResult {
  copy: MemoryCopy;
  suddenRecall: boolean;
}

export interface StoreResult {
  memoryEventId: string;
  fastCopyId: string;
  mediumCopyId: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function rowToCopy(row: Record<string, unknown>): MemoryCopy {
  return {
    id: row.id as string,
    memoryEventId: row.memory_event_id as string,
    copyType: row.copy_type as 'fast' | 'medium' | 'deep',
    storageRef: row.storage_ref as string,
    strength: row.strength as number,
    createdAt: row.created_at as Date,
    lastAccessed: (row.last_accessed as Date) || null,
  };
}

// ─── Main Class ──────────────────────────────────────────────────────

export class TripleCopyMemory {
  private enabled = true;

  /**
   * Availability flag — false if the memory_copies table is missing.
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
      logger.warn('TripleCopyMemory: memory_copies table missing — running in degraded mode', {
        context,
        operation,
      });
    }
  }

  /**
   * Toggle the triple-copy subsystem (ablation flag).
   * When disabled, only MediumCopy is created and retrieved.
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    logger.info(`TripleCopyMemory ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Store a new memory event, creating FastCopy and MediumCopy synchronously.
   * DeepCopy is created later via promoteToDeep (typically during sleep-compute).
   */
  async storeEvent(
    content: string,
    context: AIContext,
    userId: string,
    importance?: number,
  ): Promise<StoreResult> {
    const memoryEventId = randomUUID();

    // When table is unavailable, return a no-op result with no DB writes
    if (!this.available) {
      return { memoryEventId, fastCopyId: '', mediumCopyId: '' };
    }

    const initialStrength = importance ?? 1.0;

    let fastCopyId = '';
    let mediumCopyId = '';

    try {
      if (this.enabled) {
        // FastCopy: full-strength immediate access
        const fastResult = await queryContext(
          context,
          `INSERT INTO memory_copies
             (memory_event_id, copy_type, storage_ref, strength, content, user_id, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, NOW())
           RETURNING id`,
          [memoryEventId, 'fast', `fast:${memoryEventId}`, initialStrength, content, userId],
        );
        fastCopyId = fastResult.rows[0]?.id ?? '';

        logger.debug(`FastCopy created for event ${memoryEventId}`, { copyId: fastCopyId });
      }

      // MediumCopy: always created (even when ablation is off) to prevent data loss
      const mediumStrength = initialStrength * MEDIUM_STRENGTH_RATIO;
      const mediumResult = await queryContext(
        context,
        `INSERT INTO memory_copies
           (memory_event_id, copy_type, storage_ref, strength, content, user_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())
         RETURNING id`,
        [memoryEventId, 'medium', `medium:${memoryEventId}`, mediumStrength, content, userId],
      );
      mediumCopyId = mediumResult.rows[0]?.id ?? '';

      logger.debug(`MediumCopy created for event ${memoryEventId}`, { copyId: mediumCopyId });
    } catch (err) {
      if (TripleCopyMemory.isMissingTable(err)) {
        this.markUnavailable(context, 'storeEvent');
        return { memoryEventId, fastCopyId: '', mediumCopyId: '' };
      }
      throw err;
    }

    return { memoryEventId, fastCopyId, mediumCopyId };
  }

  /**
   * Compute the current strength of a memory copy based on its type and age.
   *
   * - Fast:   S0 * exp(-t / TAU_FAST)    — exponential decay
   * - Medium: S0 * exp(-t / TAU_MEDIUM)   — slower exponential decay
   * - Deep:   Smax * (1 - exp(-t / TAU_DEEP)) — logarithmic growth
   */
  computeStrength(
    copyType: 'fast' | 'medium' | 'deep',
    createdAt: Date,
    initialStrength: number = 1.0,
    now: Date = new Date(),
  ): number {
    const deltaMs = now.getTime() - createdAt.getTime();

    if (deltaMs < 0) return 0;

    let raw: number;

    switch (copyType) {
      case 'fast':
        raw = initialStrength * Math.exp(-deltaMs / TAU_FAST);
        break;
      case 'medium':
        raw = initialStrength * Math.exp(-deltaMs / TAU_MEDIUM);
        break;
      case 'deep':
        raw = initialStrength * (1 - Math.exp(-deltaMs / TAU_DEEP));
        break;
    }

    return clamp(raw, 0, 1);
  }

  /**
   * Retrieve a memory event using the cascade: Fast → Medium → Deep.
   * Returns the first copy whose current strength exceeds RETRIEVAL_THRESHOLD.
   *
   * Detects "sudden recall": when Fast+Medium are below threshold but
   * Deep is above it — the hallmark of deep memory resurfacing.
   */
  async retrieve(
    memoryEventId: string,
    context: AIContext,
  ): Promise<RetrievalResult | null> {
    if (!this.available) return null;

    let result: { rows: any[] };
    try {
      result = await queryContext(
        context,
        `SELECT id, memory_event_id, copy_type, storage_ref, strength, created_at, last_accessed
         FROM memory_copies
         WHERE memory_event_id = $1
         ORDER BY CASE copy_type
           WHEN 'fast' THEN 1
           WHEN 'medium' THEN 2
           WHEN 'deep' THEN 3
         END`,
        [memoryEventId],
      );
    } catch (err) {
      if (TripleCopyMemory.isMissingTable(err)) {
        this.markUnavailable(context, 'retrieve');
        return null;
      }
      throw err;
    }

    if (result.rows.length === 0) {
      return null;
    }

    const copies = result.rows.map(rowToCopy);
    const now = new Date();

    // Compute current strengths
    const strengths = new Map<string, number>();
    for (const copy of copies) {
      strengths.set(copy.copyType, this.computeStrength(copy.copyType, copy.createdAt, copy.strength, now));
    }

    // Determine cascade order (skip fast when ablation disabled)
    const cascadeOrder: Array<'fast' | 'medium' | 'deep'> = this.enabled
      ? ['fast', 'medium', 'deep']
      : ['medium', 'deep'];

    // Find first copy above threshold
    let selectedCopy: MemoryCopy | null = null;
    for (const type of cascadeOrder) {
      const copy = copies.find((c) => c.copyType === type);
      if (copy && (strengths.get(type) ?? 0) >= RETRIEVAL_THRESHOLD) {
        selectedCopy = copy;
        break;
      }
    }

    if (!selectedCopy) {
      return null;
    }

    // Detect sudden recall: Fast+Medium below threshold, Deep above
    const fastStrength = strengths.get('fast') ?? 0;
    const mediumStrength = strengths.get('medium') ?? 0;
    const deepStrength = strengths.get('deep') ?? 0;

    const suddenRecall =
      fastStrength < RETRIEVAL_THRESHOLD &&
      mediumStrength < RETRIEVAL_THRESHOLD &&
      deepStrength >= RETRIEVAL_THRESHOLD &&
      selectedCopy.copyType === 'deep';

    // Update last_accessed
    await queryContext(
      context,
      `UPDATE memory_copies SET last_accessed = NOW() WHERE id = $1`,
      [selectedCopy.id],
    );

    if (suddenRecall) {
      logger.info(`Sudden recall detected for event ${memoryEventId}`, {
        deepStrength,
        fastStrength,
        mediumStrength,
      });
    }

    return { copy: selectedCopy, suddenRecall };
  }

  /**
   * Promote a memory event to DeepCopy with distilled content.
   * Typically called during sleep-compute after consolidation.
   * Requires an existing MediumCopy for the event.
   */
  async promoteToDeep(
    memoryEventId: string,
    distilledContent: string,
    context: AIContext,
    userId?: string,
  ): Promise<string> {
    // Verify MediumCopy exists
    const existing = await queryContext(
      context,
      userId
        ? `SELECT id FROM memory_copies WHERE memory_event_id = $1 AND copy_type = 'medium' AND user_id = $2`
        : `SELECT id FROM memory_copies WHERE memory_event_id = $1 AND copy_type = 'medium'`,
      userId ? [memoryEventId, userId] : [memoryEventId],
    );

    if (existing.rows.length === 0) {
      throw new Error(`No medium copy found for event ${memoryEventId}`);
    }

    // Create DeepCopy
    const result = await queryContext(
      context,
      `INSERT INTO memory_copies
         (memory_event_id, copy_type, storage_ref, strength, content, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       RETURNING id`,
      [memoryEventId, 'deep', `deep:${memoryEventId}`, 1.0, distilledContent],
    );

    const deepId = result.rows[0]?.id ?? '';
    logger.info(`DeepCopy created for event ${memoryEventId}`, { deepId });
    return deepId;
  }

  /**
   * Get all copies for a memory event.
   */
  async getCopies(
    memoryEventId: string,
    context: AIContext,
    userId?: string,
  ): Promise<MemoryCopy[]> {
    const result = await queryContext(
      context,
      userId
        ? `SELECT id, memory_event_id, copy_type, storage_ref, strength, created_at, last_accessed
           FROM memory_copies WHERE memory_event_id = $1 AND user_id = $2 ORDER BY created_at ASC`
        : `SELECT id, memory_event_id, copy_type, storage_ref, strength, created_at, last_accessed
           FROM memory_copies WHERE memory_event_id = $1 ORDER BY created_at ASC`,
      userId ? [memoryEventId, userId] : [memoryEventId],
    );

    return result.rows.map(rowToCopy);
  }

  /**
   * Get recent sudden recall ("rediscovery") events for a user.
   */
  async getRediscoveries(
    context: AIContext,
    userId: string,
    limit: number = 10,
  ): Promise<Array<Record<string, unknown>>> {
    const result = await queryContext(
      context,
      `SELECT memory_event_id, detected_at, deep_strength
       FROM memory_rediscoveries
       WHERE user_id = $1
       ORDER BY detected_at DESC
       LIMIT $2`,
      [userId, limit],
    );

    return result.rows;
  }
}
