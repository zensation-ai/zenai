/**
 * STCRescue -- Synaptic Tagging & Capture Rescue Bridge
 *
 * Implements the Frey & Morris 1997 Synaptic Tagging and Capture (STC) paradigm:
 * weak memories (low confidence) are "tagged" at encoding time. If a strong memory
 * (high confidence) in the same topic cluster is formed within a 30-minute rescue
 * window, it can donate its plasticity-related proteins to rescue the weak memory,
 * preventing its decay.
 *
 * This is the first STC implementation outside spiking neural networks, adapted
 * for a semantic memory store with confidence-based strength encoding.
 *
 * Key mechanisms:
 *   - Tag creation: memories with confidence < 0.4 are tagged for potential rescue
 *   - Donor matching: memories with confidence > 0.7 in same cluster within 30min
 *   - Rescue execution: boosts tagged memory strength by +0.3, halves decay rate
 *   - Sweep: periodic scan to rescue all eligible tagged memories
 *   - Ablation: fully disableable via setEnabled() for experiments
 *
 * Part of the Predictive Memory Architecture (PMA).
 *
 * Reference: Frey, U., & Morris, R. G. M. (1997). Synaptic tagging and long-term
 *   potentiation. Nature, 385(6616), 533-536.
 */

import { AIContext, queryContext } from '../../utils/database-context';
import { logger } from '../../utils/logger';

// ─── Constants ───────────────────────────────────────────────────────

/** Tag memory when confidence falls below this threshold */
export const TAG_THRESHOLD = 0.4;

/** Donor must have confidence strictly above this to rescue */
export const DONOR_THRESHOLD = 0.7;

/** Rescue window: donor must have formed within 30 minutes of the tagged memory */
export const RESCUE_WINDOW_MS = 30 * 60 * 1000;

/** Strength boost applied to rescued memory */
export const STRENGTH_BOOST = 0.3;

/** Decay rate multiplier applied to rescued memory (50% reduction) */
const DECAY_RATE_MULTIPLIER = 0.5;

// ─── Types ───────────────────────────────────────────────────────────

export interface TagRecord {
  id: string;
  memoryId: string;
  topicClusterId: string | null;
  taggedAt: Date;
  rescued: boolean;
}

export interface DonorMatch {
  donorId: string;
  donorConfidence: number;
}

// ─── Engine ──────────────────────────────────────────────────────────

export class STCRescue {
  private enabled = true;

  /**
   * Availability flag — false if the stc_tags table is missing.
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
      logger.warn('STCRescue: stc_tags table missing — running in degraded mode', { context, operation });
    }
  }

  // ── Ablation ────────────────────────────────────────────────────

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  // ── Tag Creation ────────────────────────────────────────────────

  /**
   * Tag a memory for potential rescue if its confidence is below TAG_THRESHOLD.
   *
   * Idempotent: if the memory is already tagged, returns true without inserting.
   *
   * @returns true if tagged (or already tagged), false if confidence >= TAG_THRESHOLD
   */
  async tagMemory(
    memoryId: string,
    confidence: number,
    topicClusterId: string | null,
    userId: string,
    context: AIContext,
  ): Promise<boolean> {
    if (!this.enabled) return false;
    if (!this.available) return false;

    // Only tag weak memories
    if (confidence >= TAG_THRESHOLD) return false;

    try {
      // Idempotency: check if already tagged
      const existing = await queryContext(
        context,
        `SELECT id FROM stc_tags
         WHERE memory_id = $1 AND user_id = $2`,
        [memoryId, userId],
      );

      if (existing.rows.length > 0) {
        logger.debug('STCRescue: memory already tagged, skipping insert', {
          memoryId,
          context,
        });
        return true;
      }

      // Insert new tag
      await queryContext(
        context,
        `INSERT INTO stc_tags
           (memory_id, original_confidence, topic_cluster_id, user_id, tagged_at, rescued)
         VALUES ($1, $2, $3, $4, NOW(), false)
         RETURNING id`,
        [memoryId, confidence, topicClusterId, userId],
      );

      logger.debug('STCRescue: tagged weak memory', {
        memoryId,
        confidence,
        topicClusterId,
        context,
      });

      return true;
    } catch (err) {
      if (STCRescue.isMissingTable(err)) {
        this.markUnavailable(context, 'tagMemory');
        return false;
      }
      throw err;
    }
  }

  // ── Donor Matching ──────────────────────────────────────────────

  /**
   * Find the strongest eligible donor for a given tag.
   *
   * A donor must:
   *   - Have confidence > DONOR_THRESHOLD (0.7)
   *   - Belong to the same topic cluster
   *   - Have been encoded within RESCUE_WINDOW_MS of the tagged memory
   *
   * Returns the strongest donor (highest confidence), or null if none found.
   */
  async findDonor(
    tag: { topicClusterId: string; taggedAt: Date },
    context: AIContext,
    userId: string,
  ): Promise<DonorMatch | null> {
    if (!this.enabled) return null;

    const windowStart = new Date(tag.taggedAt.getTime() - RESCUE_WINDOW_MS);

    const result = await queryContext(
      context,
      `SELECT id, confidence, topic_cluster_id
       FROM episodic_memories
       WHERE topic_cluster_id = $1
         AND confidence > $2
         AND user_id = $3
         AND created_at >= $4
         AND created_at <= $5
       ORDER BY confidence DESC
       LIMIT 1`,
      [
        tag.topicClusterId,
        DONOR_THRESHOLD,
        userId,
        windowStart,
        new Date(tag.taggedAt.getTime() + RESCUE_WINDOW_MS),
      ],
    );

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      donorId: row.id,
      donorConfidence: Number(row.confidence),
    };
  }

  // ── Rescue Execution ────────────────────────────────────────────

  /**
   * Execute a rescue: boost the tagged memory's strength and halve its decay rate,
   * then mark the tag as rescued.
   *
   * Skips silently if the tag is already rescued (idempotent).
   */
  async executeRescue(tagId: string, donorId: string, context: AIContext): Promise<void> {
    // Fetch tag to get the memory_id and check rescue state
    const tagResult = await queryContext(
      context,
      `SELECT id, memory_id, rescued FROM stc_tags WHERE id = $1`,
      [tagId],
    );

    if (tagResult.rows.length === 0) {
      logger.warn('STCRescue: tag not found for rescue', { tagId, context });
      return;
    }

    const tag = tagResult.rows[0];

    // Skip if already rescued
    if (tag.rescued) {
      logger.debug('STCRescue: tag already rescued, skipping', { tagId });
      return;
    }

    const memoryId: string = tag.memory_id;

    // Boost strength and reduce decay rate (conceptual update on episodic_memories)
    await queryContext(
      context,
      `UPDATE episodic_memories
       SET strength = LEAST(1.0, COALESCE(strength, 0) + $1),
           decay_rate = COALESCE(decay_rate, 1.0) * $2
       WHERE id = $3`,
      [STRENGTH_BOOST, DECAY_RATE_MULTIPLIER, memoryId],
    );

    // Mark tag as rescued
    await queryContext(
      context,
      `UPDATE stc_tags
       SET rescued = true,
           rescued_by = $1,
           rescued_at = NOW()
       WHERE id = $2`,
      [donorId, tagId],
    );

    logger.info('STCRescue: rescue complete', {
      tagId,
      memoryId,
      donorId,
      context,
      strengthBoost: STRENGTH_BOOST,
      decayMultiplier: DECAY_RATE_MULTIPLIER,
    });
  }

  // ── Sweep ───────────────────────────────────────────────────────

  /**
   * Process all unrescued tags for the given context and user.
   *
   * For each unrescued tag:
   *   1. Find an eligible donor
   *   2. If found, execute the rescue
   *
   * @returns Number of rescues performed
   */
  async sweepRescues(context: AIContext, userId: string): Promise<number> {
    if (!this.enabled) return 0;
    if (!this.available) return 0;

    let tagsResult: { rows: any[] };
    try {
      // Fetch all unrescued tags for this user/context
      tagsResult = await queryContext(
        context,
        `SELECT id, memory_id, topic_cluster_id, tagged_at, rescued
         FROM stc_tags
         WHERE user_id = $1 AND rescued = false
         ORDER BY tagged_at ASC`,
        [userId],
      );
    } catch (err) {
      if (STCRescue.isMissingTable(err)) {
        this.markUnavailable(context, 'sweepRescues');
        return 0;
      }
      throw err;
    }

    const tags = tagsResult.rows;
    let rescueCount = 0;

    for (const tag of tags) {
      const topicClusterId: string = tag.topic_cluster_id;
      const taggedAt: Date = new Date(tag.tagged_at);

      // Find a donor for this tag
      const donor = await this.findDonor({ topicClusterId, taggedAt }, context, userId);

      if (!donor) {
        logger.debug('STCRescue: no donor found for tag', {
          tagId: tag.id,
          topicClusterId,
          context,
        });
        continue;
      }

      // Execute rescue
      await this.executeRescue(tag.id, donor.donorId, context);
      rescueCount++;
    }

    if (rescueCount > 0) {
      logger.info('STCRescue: sweep complete', { rescueCount, context, userId });
    }

    return rescueCount;
  }
}
