/**
 * Phase 125, Task 5: Bayesian Confidence Propagation
 *
 * Propagates confidence scores through the knowledge graph via entity
 * relations. Each relation type has a propagation factor that determines
 * how much the source confidence influences the target confidence.
 *
 * Algorithm:
 *  1. For each fact, find connected facts via shared knowledge entities
 *     and entity_relations.
 *  2. Compute new propagated_confidence by accumulating contributions
 *     from all incoming edges.
 *  3. Apply damping to blend new value with old (stability).
 *  4. Only persist if change > threshold (avoid noise updates).
 *  5. Repeat up to MAX_ITERATIONS (early exit on convergence).
 */

import { queryContext, AIContext } from '../../utils/database-context';
import { logger } from '../../utils/logger';

// ============================================================
// Constants
// ============================================================

export const PROPAGATION_FACTORS: Record<string, number> = {
  supports: 1.0,   // Full positive propagation
  contradicts: -1.0, // Full negative propagation
  causes: 0.8,     // Strong causal link
  requires: 0.6,   // Moderate prerequisite link
  part_of: 0.3,    // Weak structural link
  similar_to: 0.2, // Minimal similarity link
  created_by: 0.0, // No epistemic propagation
  used_by: 0.0,    // No epistemic propagation
};

const DAMPING = 0.7;
const MAX_ITERATIONS = 3;
const CHANGE_THRESHOLD = 0.01;

// ============================================================
// Types
// ============================================================

interface PropagationEdge {
  target_fact_id: string;
  target_confidence: number;
  source_fact_id: string;
  source_confidence: number;
  relation_type: string;
  edge_weight: number;
  old_propagated: number | null;
}

interface ConfidenceSource {
  factId: string;
  relationType: string;
  contribution: number;
}

// ============================================================
// Pure propagation formula
// ============================================================

/**
 * Compute the new propagated confidence for a single directed edge.
 *
 * @param baseConfidence   - Current confidence of the target fact (0–1)
 * @param sourceConfidence - Confidence of the source fact (0–1)
 * @param edgeWeight       - Strength of the relation edge (0–1)
 * @param relationType     - One of the relation types in PROPAGATION_FACTORS
 * @returns New propagated confidence clamped to [0, 1]
 */
export function propagateForRelation(
  baseConfidence: number,
  sourceConfidence: number,
  edgeWeight: number,
  relationType: string,
): number {
  const factor = PROPAGATION_FACTORS[relationType] ?? 0;

  // Non-epistemic relation: no change
  if (factor === 0) {
    return baseConfidence;
  }

  let result: number;

  if (factor > 0) {
    // Positive reinforcement: Bayesian-style update toward 1
    result = baseConfidence + factor * edgeWeight * sourceConfidence * (1 - baseConfidence);
  } else {
    // Negative influence: reduce confidence proportionally
    result = baseConfidence * (1 - Math.abs(factor) * edgeWeight * sourceConfidence);
  }

  // Clamp to [0, 1]
  return Math.max(0, Math.min(1, result));
}

// ============================================================
// Batch propagation
// ============================================================

/**
 * Query all fact-to-fact connections through the knowledge graph:
 *
 * learned_facts → knowledge_entities (via source_ids overlap)
 *              → entity_relations
 *              → knowledge_entities
 *              → learned_facts
 *
 * Returns one row per (target_fact, source_fact, relation) combination.
 */
const EDGES_QUERY = `
  SELECT
    tf.id                    AS target_fact_id,
    tf.confidence            AS target_confidence,
    sf.id                    AS source_fact_id,
    sf.confidence            AS source_confidence,
    er.relation_type         AS relation_type,
    COALESCE(er.strength, 1.0)::float AS edge_weight,
    tf.propagated_confidence AS old_propagated
  FROM learned_facts tf
  -- join target fact to any entity that references it
  JOIN knowledge_entities te
    ON te.source_ids && ARRAY[tf.id]::text[]
  -- traverse the relation graph (target entity side)
  JOIN entity_relations er
    ON er.target_entity_id = te.id
  -- reach the source entity
  JOIN knowledge_entities se
    ON se.id = er.source_entity_id
  -- find facts linked to the source entity
  JOIN learned_facts sf
    ON se.source_ids && ARRAY[sf.id]::text[]
  WHERE tf.id <> sf.id
    AND er.relation_type IN (
      'supports', 'contradicts', 'causes', 'requires',
      'part_of', 'similar_to', 'created_by', 'used_by'
    )
`;

const UPDATE_QUERY = `
  UPDATE learned_facts
  SET
    propagated_confidence = $1,
    confidence_sources    = $2::jsonb
  WHERE id = $3
`;

/**
 * Run one propagation iteration.
 *
 * Returns the number of facts whose propagated_confidence changed by
 * more than CHANGE_THRESHOLD.
 */
async function runIteration(context: AIContext): Promise<number> {
  const { rows } = await queryContext(context, EDGES_QUERY, []);
  const edges = rows as PropagationEdge[];

  if (edges.length === 0) {
    return 0;
  }

  // Group edges by target fact
  const grouped = new Map<string, PropagationEdge[]>();
  for (const edge of edges) {
    const bucket = grouped.get(edge.target_fact_id) ?? [];
    bucket.push(edge);
    grouped.set(edge.target_fact_id, bucket);
  }

  let updatedCount = 0;

  for (const [targetFactId, incoming] of grouped) {
    const baseConfidence = incoming[0].target_confidence;
    const oldPropagated = incoming[0].old_propagated;

    // Accumulate contributions from all incoming edges
    let accumulated = baseConfidence;
    const sources: ConfidenceSource[] = [];

    for (const edge of incoming) {
      const contribution = propagateForRelation(
        accumulated,
        edge.source_confidence,
        edge.edge_weight,
        edge.relation_type,
      );
      const delta = contribution - accumulated;
      accumulated = contribution;

      sources.push({
        factId: edge.source_fact_id,
        relationType: edge.relation_type,
        contribution: delta,
      });
    }

    // Apply damping: blend new value with existing propagated confidence
    const previous = oldPropagated !== null && oldPropagated !== undefined
      ? oldPropagated
      : baseConfidence;
    const damped = Math.max(0, Math.min(1, DAMPING * accumulated + (1 - DAMPING) * previous));

    // Only persist if the change is significant
    const change = Math.abs(damped - previous);
    if (change <= CHANGE_THRESHOLD) {
      continue;
    }

    await queryContext(context, UPDATE_QUERY, [
      damped,
      JSON.stringify(sources),
      targetFactId,
    ]);

    updatedCount += 1;
  }

  return updatedCount;
}

/**
 * Propagate confidence scores across the entire knowledge graph for the
 * given context.
 *
 * Runs up to MAX_ITERATIONS passes, stopping early when no fact's
 * confidence changes by more than CHANGE_THRESHOLD in a pass.
 *
 * @returns Total number of fact updates and number of iterations run.
 */
export async function propagateBatch(
  context: AIContext,
): Promise<{ updated: number; iterations: number }> {
  let totalUpdated = 0;
  let iterationCount = 0;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const updated = await runIteration(context);
    totalUpdated += updated;
    iterationCount = i + 1;

    logger.info(`[confidence-propagation] iteration ${iterationCount}: ${updated} facts updated`);

    if (updated === 0) {
      // Converged — no changes above threshold
      break;
    }
  }

  if (totalUpdated === 0) {
    // No updates at all — report 0 iterations for the empty-graph case
    return { updated: 0, iterations: 0 };
  }

  return { updated: totalUpdated, iterations: iterationCount };
}
