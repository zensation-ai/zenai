/**
 * Phase 125, Task 4: Hebbian Edge Dynamics
 *
 * Implements Hebbian learning rules for the ZenAI knowledge graph.
 * "Neurons that fire together, wire together" — entity co-activation
 * strengthens their connecting edges, while disuse causes decay.
 */

import { queryContext } from '../../utils/database-context';
import { AIContext } from '../../types';
import { logger } from '../../utils/logger';

// ===========================================
// Configuration
// ===========================================

export const HEBBIAN_CONFIG = {
  /** Rate at which co-activation strengthens an edge. */
  LEARNING_RATE: 0.1,
  /** Hard upper bound for hebbian_weight. */
  MAX_WEIGHT: 10.0,
  /** Fraction by which idle edges decay per batch cycle. */
  DECAY_RATE: 0.02,
  /** Weight floor; edges below this are pruned (reset to NEUTRAL). */
  MIN_WEIGHT: 0.1,
  /** Homeostatic target for the sum of weights in a context. */
  TARGET_SUM: 50.0,
  /** Default weight for edges with no Hebbian history. */
  NEUTRAL_WEIGHT: 1.0,
} as const;

// ===========================================
// Pure computation functions
// ===========================================

/**
 * Asymptotic Hebbian strengthening.
 * Formula: new = old + LR * (1 - old / MAX)
 * Growth diminishes as weight approaches MAX_WEIGHT.
 */
export function computeHebbianStrengthening(currentWeight: number): number {
  const growth = HEBBIAN_CONFIG.LEARNING_RATE * (1 - currentWeight / HEBBIAN_CONFIG.MAX_WEIGHT);
  const newWeight = currentWeight + Math.max(0, growth);
  return Math.min(HEBBIAN_CONFIG.MAX_WEIGHT, newWeight);
}

/**
 * Exponential Hebbian decay.
 * Formula: new = old * (1 - DECAY_RATE)
 * Returns 0 as a pruning signal when the result drops below MIN_WEIGHT.
 */
export function computeHebbianDecay(currentWeight: number): number {
  const decayed = currentWeight * (1 - HEBBIAN_CONFIG.DECAY_RATE);
  if (decayed < HEBBIAN_CONFIG.MIN_WEIGHT) {
    return 0; // pruning signal
  }
  return decayed;
}

/**
 * Homeostatic normalization: scale all weights proportionally so their
 * sum equals targetSum.  Preserves the ratios between individual weights.
 *
 * Edge cases:
 *  - Empty array  → return []
 *  - All-zero sum → return weights unchanged (cannot scale zeros)
 */
export function computeHomeostaticNormalization(
  weights: number[],
  targetSum: number,
): number[] {
  if (weights.length === 0) return [];

  const currentSum = weights.reduce((a, b) => a + b, 0);
  if (currentSum === 0) {
    // Cannot proportionally scale a zero vector — return as-is
    return [...weights];
  }

  const scale = targetSum / currentSum;
  return weights.map(w => w * scale);
}

// ===========================================
// Database-backed functions
// ===========================================

/**
 * Record that a set of entities were active at the same time.
 * Generates all C(n, 2) unique pairs and upserts each into
 * entity_coactivations, incrementing the count on conflict.
 * No-op if fewer than 2 entities are provided.
 */
export async function recordCoactivation(
  context: AIContext,
  entityIds: string[],
): Promise<void> {
  if (entityIds.length < 2) return;

  const pairs = generatePairs(entityIds);

  for (const [a, b] of pairs) {
    // Sort ids so (a, b) and (b, a) always map to the same row
    const [entityA, entityB] = [a, b].sort();

    const sql = `
      INSERT INTO entity_coactivations (entity_a_id, entity_b_id, coactivation_count, last_coactivated)
      VALUES ($1, $2, 1, NOW())
      ON CONFLICT (entity_a_id, entity_b_id)
      DO UPDATE SET
        coactivation_count = entity_coactivations.coactivation_count + 1,
        last_coactivated   = NOW()
    `;

    try {
      await queryContext(context, sql, [entityA, entityB]);
    } catch (err) {
      logger.error(
        `recordCoactivation: failed to upsert pair ${entityA}/${entityB}`,
        err instanceof Error ? err : undefined,
      );
    }
  }
}

/**
 * Apply Hebbian strengthening to a specific directed edge.
 * Reads the current hebbian_weight, computes the new value, and persists it.
 * Falls back to NEUTRAL_WEIGHT if the relation row does not exist.
 *
 * @returns The new hebbian_weight after strengthening.
 */
export async function strengthenEdge(
  context: AIContext,
  sourceEntityId: string,
  targetEntityId: string,
): Promise<number> {
  const selectSql = `
    SELECT hebbian_weight
    FROM entity_relations
    WHERE source_entity_id = $1
      AND target_entity_id = $2
    LIMIT 1
  `;

  const { rows } = await queryContext(context, selectSql, [sourceEntityId, targetEntityId]);

  const currentWeight =
    rows.length > 0
      ? (rows[0].hebbian_weight ?? HEBBIAN_CONFIG.NEUTRAL_WEIGHT)
      : HEBBIAN_CONFIG.NEUTRAL_WEIGHT;

  const newWeight = computeHebbianStrengthening(currentWeight);

  const updateSql = `
    UPDATE entity_relations
    SET hebbian_weight = $1,
        coactivation_count = COALESCE(coactivation_count, 0) + 1,
        last_coactivated   = NOW()
    WHERE source_entity_id = $2
      AND target_entity_id = $3
  `;

  await queryContext(context, updateSql, [newWeight, sourceEntityId, targetEntityId]);

  logger.debug(
    `strengthenEdge: ${context} ${sourceEntityId}→${targetEntityId} ${currentWeight}→${newWeight}`,
  );

  return newWeight;
}

/**
 * Apply Hebbian decay to all non-neutral edges in a context.
 *
 * Algorithm:
 *  1. SELECT all relations where hebbian_weight != NEUTRAL_WEIGHT.
 *  2. Compute decayed weight for each.
 *  3. Edges whose decay result is 0 (below MIN_WEIGHT) are pruned → reset
 *     to NEUTRAL_WEIGHT so they can be re-learned from scratch.
 *  4. Batch UPDATE all affected rows.
 *
 * @returns { decayed: number, pruned: number }
 *   decayed — total relations processed (includes pruned)
 *   pruned  — relations that fell below MIN_WEIGHT and were reset
 */
export async function applyHebbianDecayBatch(
  context: AIContext,
): Promise<{ decayed: number; pruned: number }> {
  const selectSql = `
    SELECT source_entity_id, target_entity_id, hebbian_weight
    FROM entity_relations
    WHERE hebbian_weight != $1
  `;

  const { rows } = await queryContext(context, selectSql, [HEBBIAN_CONFIG.NEUTRAL_WEIGHT]);

  if (rows.length === 0) {
    return { decayed: 0, pruned: 0 };
  }

  let pruned = 0;

  for (const row of rows) {
    const decayedWeight = computeHebbianDecay(row.hebbian_weight);
    const isPruned = decayedWeight === 0;
    if (isPruned) pruned++;

    const finalWeight = isPruned ? HEBBIAN_CONFIG.NEUTRAL_WEIGHT : decayedWeight;

    const updateSql = `
      UPDATE entity_relations
      SET hebbian_weight = $1
      WHERE source_entity_id = $2
        AND target_entity_id = $3
    `;

    try {
      await queryContext(context, updateSql, [
        finalWeight,
        row.source_entity_id,
        row.target_entity_id,
      ]);
    } catch (err) {
      logger.error(
        `applyHebbianDecayBatch: failed to update ${row.source_entity_id}→${row.target_entity_id}`,
        err instanceof Error ? err : undefined,
      );
    }
  }

  logger.info(`applyHebbianDecayBatch complete: context=${context} total=${rows.length} pruned=${pruned}`);

  return { decayed: rows.length, pruned };
}

/**
 * Look up the hebbian_weight for an edge between two entities.
 * Checks both A→B and B→A directions.
 * Returns NEUTRAL_WEIGHT if no relation exists.
 */
export async function getHebbianWeight(
  context: AIContext,
  entityA: string,
  entityB: string,
): Promise<number> {
  const sql = `
    SELECT hebbian_weight
    FROM entity_relations
    WHERE (source_entity_id = $1 AND target_entity_id = $2)
       OR (source_entity_id = $2 AND target_entity_id = $1)
    ORDER BY hebbian_weight DESC
    LIMIT 1
  `;

  const { rows } = await queryContext(context, sql, [entityA, entityB]);

  if (rows.length === 0) {
    return HEBBIAN_CONFIG.NEUTRAL_WEIGHT;
  }

  return rows[0].hebbian_weight ?? HEBBIAN_CONFIG.NEUTRAL_WEIGHT;
}

// ===========================================
// Internal helpers
// ===========================================

/**
 * Generate all unique pairs from an array (combinations, not permutations).
 * Order within each pair is preserved as given; callers sort if needed.
 */
function generatePairs<T>(items: T[]): [T, T][] {
  const pairs: [T, T][] = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      pairs.push([items[i], items[j]]);
    }
  }
  return pairs;
}
