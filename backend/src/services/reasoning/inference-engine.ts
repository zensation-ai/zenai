/**
 * Multi-Hop Inference Engine (Phase 128, Task 3)
 *
 * Derives new knowledge by chaining existing entity relations in the knowledge graph.
 * Supports three inference modes:
 *   1. Transitive — A→B→C implies A is indirectly connected to C (up to maxHops deep)
 *   2. Analogy    — C similar_to A, A→B implies C might relate to B
 *   3. Negation   — A supports B, B contradicts C → A incompatible with C
 *                   A contradicts B, B contradicts C → A might support C
 *
 * Confidence always degrades with each inference step to represent uncertainty growth.
 */

import { queryContext, type AIContext } from '../../utils/database-context';
import { logger } from '../../utils/logger';

// ──────────────────────────────────────────────────────────────
// Public types
// ──────────────────────────────────────────────────────────────

export interface InferredRelation {
  sourceEntityId: string;
  sourceEntityName: string;
  targetEntityId: string;
  targetEntityName: string;
  inferenceType: 'transitive' | 'analogy' | 'abduction' | 'negation';
  /** Always < source confidence — uncertainty grows with chain length */
  confidence: number;
  /** Human-readable explanation of how the inference was made */
  reasoning: string;
  /** Number of hops (edges) in the path */
  pathLength: number;
  /** Names of entities along the path (not including source / target) */
  intermediateEntities: string[];
}

// ──────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────

const POSITIVE_RELATION_TYPES = [
  'supports',
  'causes',
  'requires',
  'part_of',
  'similar_to',
] as const;

const POSITIVE_RELATION_PLACEHOLDER = POSITIVE_RELATION_TYPES.map(
  t => `'${t}'`,
).join(', ');

const CONFIDENCE_DECAY = 0.7; // per hop
const MAX_TRANSITIVE = 10;
const MAX_ANALOGY = 5;
const MAX_NEGATION = 5;
const MAX_FULL = 15;

// ──────────────────────────────────────────────────────────────
// findTransitiveInferences
// ──────────────────────────────────────────────────────────────

/**
 * Find indirect connections via chain traversal.
 * A→B→C means A is indirectly connected to C (pathLength=2).
 * A→B→C→D is pathLength=3, etc.
 *
 * confidence = product(strengths) * DECAY^(hops-1)
 */
export async function findTransitiveInferences(
  context: AIContext | string,
  entityId: string,
  maxHops = 3,
): Promise<InferredRelation[]> {
  const ctx = context as AIContext;

  // ── 2-hop query ──────────────────────────────────────────────
  const twoHopSql = `
    SELECT
      e1.id   AS source_id,   e1.name AS source_name,
      e3.id   AS target_id,   e3.name AS target_name,
      e2.id   AS intermediate_id, e2.name AS intermediate_name,
      r1.strength AS strength_1, r2.strength AS strength_2,
      r1.relation_type AS type_1, r2.relation_type AS type_2
    FROM entity_relations r1
    JOIN knowledge_entities e1 ON e1.id = r1.source_entity_id
    JOIN knowledge_entities e2 ON e2.id = r1.target_entity_id
    JOIN entity_relations r2 ON r2.source_entity_id = r1.target_entity_id
    JOIN knowledge_entities e3 ON e3.id = r2.target_entity_id
    WHERE r1.source_entity_id = $1
      AND r2.target_entity_id != $1
      AND e3.id != $1
      AND r1.relation_type IN (${POSITIVE_RELATION_PLACEHOLDER})
      AND r2.relation_type IN (${POSITIVE_RELATION_PLACEHOLDER})
  `;
  const twoHopResult = await queryContext(ctx, twoHopSql, [entityId]);

  // ── Collect direct relations (used to filter out already-known pairs) ──
  const directSql = `
    SELECT source_entity_id, target_entity_id
    FROM entity_relations
    WHERE source_entity_id = $1 OR target_entity_id = $1
  `;
  const directResult = await queryContext(ctx, directSql, [entityId]);
  const directSet = new Set<string>(
    directResult.rows.map(
      (r: { source_entity_id: string; target_entity_id: string }) =>
        `${r.source_entity_id}:${r.target_entity_id}`,
    ),
  );

  const inferences: InferredRelation[] = [];

  for (const row of twoHopResult.rows as Array<{
    source_id: string;
    source_name: string;
    target_id: string;
    target_name: string;
    intermediate_id: string;
    intermediate_name: string;
    strength_1: number;
    strength_2: number;
    type_1: string;
    type_2: string;
  }>) {
    // Skip self-loops
    if (row.target_id === row.source_id) continue;
    // Skip if direct relation already exists in either direction
    if (
      directSet.has(`${row.source_id}:${row.target_id}`) ||
      directSet.has(`${row.target_id}:${row.source_id}`)
    ) {
      continue;
    }

    const confidence = row.strength_1 * row.strength_2 * CONFIDENCE_DECAY; // hop=1 → decay^0=1... wait
    // confidence = s1 * s2 * 0.7^(hops-1) where hops=2, so 0.7^1 = 0.7
    const conf = row.strength_1 * row.strength_2 * Math.pow(CONFIDENCE_DECAY, 2 - 1);

    inferences.push({
      sourceEntityId: row.source_id,
      sourceEntityName: row.source_name,
      targetEntityId: row.target_id,
      targetEntityName: row.target_name,
      inferenceType: 'transitive',
      confidence: conf,
      reasoning: `${row.source_name} ${row.type_1} ${row.intermediate_name}, and ${row.intermediate_name} ${row.type_2} ${row.target_name} — therefore ${row.source_name} is indirectly connected to ${row.target_name}`,
      pathLength: 2,
      intermediateEntities: [row.intermediate_name],
    });
  }

  // ── 3-hop query (only when maxHops >= 3) ─────────────────────
  if (maxHops >= 3) {
    const threeHopSql = `
      SELECT
        e1.id  AS source_id,  e1.name AS source_name,
        e4.id  AS target_id,  e4.name AS target_name,
        e2.id  AS mid1_id,    e2.name AS mid1_name,
        e3.id  AS mid2_id,    e3.name AS mid2_name,
        r1.strength AS strength_1,
        r2.strength AS strength_2,
        r3.strength AS strength_3
      FROM entity_relations r1
      JOIN knowledge_entities e1 ON e1.id = r1.source_entity_id
      JOIN knowledge_entities e2 ON e2.id = r1.target_entity_id
      JOIN entity_relations r2 ON r2.source_entity_id = r1.target_entity_id
      JOIN knowledge_entities e3 ON e3.id = r2.target_entity_id
      JOIN entity_relations r3 ON r3.source_entity_id = r2.target_entity_id
      JOIN knowledge_entities e4 ON e4.id = r3.target_entity_id
      WHERE r1.source_entity_id = $1
        AND r3.target_entity_id != $1
        AND e4.id != $1
        AND r1.relation_type IN (${POSITIVE_RELATION_PLACEHOLDER})
        AND r2.relation_type IN (${POSITIVE_RELATION_PLACEHOLDER})
        AND r3.relation_type IN (${POSITIVE_RELATION_PLACEHOLDER})
    `;
    const threeHopResult = await queryContext(ctx, threeHopSql, [entityId]);

    for (const row of threeHopResult.rows as Array<{
      source_id: string;
      source_name: string;
      target_id: string;
      target_name: string;
      mid1_id: string;
      mid1_name: string;
      mid2_id: string;
      mid2_name: string;
      strength_1: number;
      strength_2: number;
      strength_3: number;
    }>) {
      if (row.target_id === row.source_id) continue;
      if (
        directSet.has(`${row.source_id}:${row.target_id}`) ||
        directSet.has(`${row.target_id}:${row.source_id}`)
      ) {
        continue;
      }

      // confidence = s1 * s2 * s3 * 0.7^(3-1) = s1*s2*s3*0.49
      const conf =
        row.strength_1 *
        row.strength_2 *
        row.strength_3 *
        Math.pow(CONFIDENCE_DECAY, 3 - 1);

      inferences.push({
        sourceEntityId: row.source_id,
        sourceEntityName: row.source_name,
        targetEntityId: row.target_id,
        targetEntityName: row.target_name,
        inferenceType: 'transitive',
        confidence: conf,
        reasoning: `${row.source_name} → ${row.mid1_name} → ${row.mid2_name} → ${row.target_name} (3-hop transitive chain)`,
        pathLength: 3,
        intermediateEntities: [row.mid1_name, row.mid2_name],
      });
    }
  }

  return inferences
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, MAX_TRANSITIVE);
}

// ──────────────────────────────────────────────────────────────
// findAnalogies
// ──────────────────────────────────────────────────────────────

/**
 * If A has relation R to B, and C is similar_to A, then C might have R to B.
 * confidence = similarity_strength * relation_strength * 0.5
 */
export async function findAnalogies(
  context: AIContext | string,
  entityId: string,
): Promise<InferredRelation[]> {
  const ctx = context as AIContext;

  // Find all entities C that are similar_to A (entityId),
  // and for each C pick up A's outgoing relations to B.
  const sql = `
    SELECT
      sim.source_entity_id AS analogous_id,
      esim.name            AS analogous_name,
      r.target_entity_id   AS target_id,
      etgt.name            AS target_name,
      sim.strength         AS similarity_strength,
      r.strength           AS relation_strength,
      r.relation_type      AS relation_type
    FROM entity_relations sim
    JOIN knowledge_entities esim ON esim.id = sim.source_entity_id
    JOIN entity_relations r      ON r.source_entity_id = $1
    JOIN knowledge_entities etgt ON etgt.id = r.target_entity_id
    WHERE sim.target_entity_id = $1
      AND sim.relation_type = 'similar_to'
      AND r.target_entity_id != sim.source_entity_id
  `;

  const result = await queryContext(ctx, sql, [entityId]);

  const inferences: InferredRelation[] = (
    result.rows as Array<{
      analogous_id: string;
      analogous_name: string;
      target_id: string;
      target_name: string;
      similarity_strength: number;
      relation_strength: number;
      relation_type: string;
    }>
  ).map(row => ({
    sourceEntityId: row.analogous_id,
    sourceEntityName: row.analogous_name,
    targetEntityId: row.target_id,
    targetEntityName: row.target_name,
    inferenceType: 'analogy' as const,
    confidence: row.similarity_strength * row.relation_strength * 0.5,
    reasoning: `${row.analogous_name} is similar to the source entity which has a ${row.relation_type} relation to ${row.target_name} — by analogy, ${row.analogous_name} may also ${row.relation_type} ${row.target_name}`,
    pathLength: 2,
    intermediateEntities: [],
  }));

  return inferences
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, MAX_ANALOGY);
}

// ──────────────────────────────────────────────────────────────
// findNegationChains
// ──────────────────────────────────────────────────────────────

/**
 * Pattern 1 (supports+contradicts): A supports B, B contradicts C → A incompatible with C
 * Pattern 2 (contradicts+contradicts): A contradicts B, B contradicts C → A might support C
 * Both patterns yield confidence = 0.4 (negation chains are inherently weak).
 */
export async function findNegationChains(
  context: AIContext | string,
  entityId: string,
): Promise<InferredRelation[]> {
  const ctx = context as AIContext;

  // Pattern 1
  const pattern1Sql = `
    SELECT
      e1.id   AS source_id,   e1.name AS source_name,
      e3.id   AS target_id,   e3.name AS target_name,
      e2.id   AS intermediate_id, e2.name AS intermediate_name,
      'supports_contradicts' AS pattern
    FROM entity_relations r1
    JOIN knowledge_entities e1 ON e1.id = r1.source_entity_id
    JOIN knowledge_entities e2 ON e2.id = r1.target_entity_id
    JOIN entity_relations r2 ON r2.source_entity_id = r1.target_entity_id
    JOIN knowledge_entities e3 ON e3.id = r2.target_entity_id
    WHERE r1.source_entity_id = $1
      AND r2.target_entity_id != $1
      AND e3.id != $1
      AND r1.relation_type = 'supports'
      AND r2.relation_type = 'contradicts'
  `;
  const pattern1Result = await queryContext(ctx, pattern1Sql, [entityId]);

  // Pattern 2
  const pattern2Sql = `
    SELECT
      e1.id   AS source_id,   e1.name AS source_name,
      e3.id   AS target_id,   e3.name AS target_name,
      e2.id   AS intermediate_id, e2.name AS intermediate_name,
      'contradicts_contradicts' AS pattern
    FROM entity_relations r1
    JOIN knowledge_entities e1 ON e1.id = r1.source_entity_id
    JOIN knowledge_entities e2 ON e2.id = r1.target_entity_id
    JOIN entity_relations r2 ON r2.source_entity_id = r1.target_entity_id
    JOIN knowledge_entities e3 ON e3.id = r2.target_entity_id
    WHERE r1.source_entity_id = $1
      AND r2.target_entity_id != $1
      AND e3.id != $1
      AND r1.relation_type = 'contradicts'
      AND r2.relation_type = 'contradicts'
  `;
  const pattern2Result = await queryContext(ctx, pattern2Sql, [entityId]);

  type NegRow = {
    source_id: string;
    source_name: string;
    target_id: string;
    target_name: string;
    intermediate_id: string;
    intermediate_name: string;
    pattern: string;
  };

  const buildInference = (row: NegRow): InferredRelation => {
    const description =
      row.pattern === 'supports_contradicts'
        ? `${row.source_name} supports ${row.intermediate_name} which contradicts ${row.target_name} — therefore ${row.source_name} is incompatible with ${row.target_name}`
        : `${row.source_name} contradicts ${row.intermediate_name} which contradicts ${row.target_name} — by "enemy of enemy", ${row.source_name} may align with ${row.target_name}`;

    return {
      sourceEntityId: row.source_id,
      sourceEntityName: row.source_name,
      targetEntityId: row.target_id,
      targetEntityName: row.target_name,
      inferenceType: 'negation',
      confidence: 0.4,
      reasoning: description,
      pathLength: 2,
      intermediateEntities: [row.intermediate_name],
    };
  };

  const inferences: InferredRelation[] = [
    ...(pattern1Result.rows as NegRow[]).map(buildInference),
    ...(pattern2Result.rows as NegRow[]).map(buildInference),
  ];

  return inferences.slice(0, MAX_NEGATION);
}

// ──────────────────────────────────────────────────────────────
// runFullInference
// ──────────────────────────────────────────────────────────────

/**
 * Runs all three inference types, deduplicates by target entity
 * (keeping the highest-confidence result per target), sorts by
 * confidence DESC, and returns at most 15 results.
 */
export async function runFullInference(
  context: AIContext | string,
  entityId: string,
): Promise<InferredRelation[]> {
  const ctx = context as AIContext;

  const transitive = await findTransitiveInferences(ctx, entityId);
  const analogies = await findAnalogies(ctx, entityId);
  const negations = await findNegationChains(ctx, entityId);

  logger.debug(
    `runFullInference entity=${entityId}: transitive=${transitive.length} analogies=${analogies.length} negations=${negations.length}`,
  );

  const all = [...transitive, ...analogies, ...negations];

  // Deduplicate by targetEntityId — keep highest confidence
  const byTarget = new Map<string, InferredRelation>();
  for (const inf of all) {
    const existing = byTarget.get(inf.targetEntityId);
    if (!existing || inf.confidence > existing.confidence) {
      byTarget.set(inf.targetEntityId, inf);
    }
  }

  return Array.from(byTarget.values())
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, MAX_FULL);
}

// ──────────────────────────────────────────────────────────────
// storeInferredFacts
// ──────────────────────────────────────────────────────────────

/**
 * Persists inferred relations to the inferred_facts table.
 * Uses ON CONFLICT DO NOTHING so duplicates are silently skipped.
 * Returns the count of newly inserted rows.
 */
export async function storeInferredFacts(
  context: AIContext | string,
  inferences: InferredRelation[],
): Promise<number> {
  if (inferences.length === 0) return 0;

  const ctx = context as AIContext;

  const sql = `
    INSERT INTO inferred_facts (content, inference_type, source_fact_ids, confidence, reasoning)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT DO NOTHING
  `;

  let insertedCount = 0;

  for (const inf of inferences) {
    const content = `${inf.sourceEntityName} [${inf.inferenceType}] ${inf.targetEntityName}`;
    const sourceFacts: string[] = []; // entity IDs serve as conceptual sources

    const result = await queryContext(ctx, sql, [
      content,
      inf.inferenceType,
      sourceFacts,
      inf.confidence,
      inf.reasoning,
    ]);

    if ((result.rowCount ?? 0) > 0) {
      insertedCount++;
    }
  }

  logger.info(
    `storeInferredFacts: inserted ${insertedCount}/${inferences.length} facts`,
  );

  return insertedCount;
}
