/**
 * Phase 48: Knowledge Graph Reasoning
 *
 * Provides graph inference, transitive relationship detection,
 * community detection, and learning path generation.
 */

import { AIContext, queryContext } from '../../utils/database-context';
import { logger } from '../../utils/logger';

// ===========================================
// Types
// ===========================================

export interface InferredRelation {
  sourceId: string;
  targetId: string;
  inferenceType: 'transitive' | 'contradiction' | 'complementary' | 'bridging';
  confidence: number;
  reasoning: string;
  pathIds: string[];
}

export interface Community {
  id: string;
  name: string | null;
  description: string | null;
  memberIds: string[];
  memberCount: number;
  coherenceScore: number;
  createdAt: string;
}

export interface LearningPathStep {
  ideaId: string;
  title: string;
  summary: string;
  order: number;
  connectionType: string;
  connectionStrength: number;
}

export interface CentralityResult {
  ideaId: string;
  title: string;
  degreeCentrality: number;
  betweennessCentrality: number;
  isHub: boolean;
  isBridge: boolean;
}

// ===========================================
// Transitive Inference
// ===========================================

/**
 * Find transitive relationships: if A→B and B→C, suggest A→C
 */
export async function inferTransitiveRelations(
  context: AIContext,
  options: { minStrength?: number; maxResults?: number } = {}
): Promise<InferredRelation[]> {
  const { minStrength = 0.5, maxResults = 20 } = options;

  try {
    // Find 2-hop paths that don't have direct connections
    const result = await queryContext(
      context,
      `SELECT DISTINCT
         r1.source_id as start_id,
         r1.target_id as bridge_id,
         r2.target_id as end_id,
         r1.relation_type as type1,
         r2.relation_type as type2,
         r1.strength as strength1,
         r2.strength as strength2,
         LEAST(r1.strength, r2.strength) * 0.8 as inferred_strength
       FROM idea_relations r1
       JOIN idea_relations r2 ON r1.target_id = r2.source_id
       WHERE r1.context = $1
         AND r2.context = $1
         AND r1.source_id != r2.target_id
         AND r1.strength >= $2
         AND r2.strength >= $2
         AND NOT EXISTS (
           SELECT 1 FROM idea_relations r3
           WHERE r3.source_id = r1.source_id
             AND r3.target_id = r2.target_id
             AND r3.context = $1
         )
         AND NOT EXISTS (
           SELECT 1 FROM graph_reasoning_cache gc
           WHERE gc.source_id = r1.source_id
             AND gc.target_id = r2.target_id
             AND gc.inference_type = 'transitive'
             AND gc.expires_at > NOW()
         )
       ORDER BY inferred_strength DESC
       LIMIT $3`,
      [context, minStrength, maxResults]
    );

    const inferred: InferredRelation[] = result.rows.map((r: Record<string, string>) => {
      const strength = parseFloat(r.inferred_strength) || 0.4;
      return {
        sourceId: r.start_id,
        targetId: r.end_id,
        inferenceType: 'transitive' as const,
        confidence: strength,
        reasoning: `${r.type1} → ${r.type2} (via bridge node)`,
        pathIds: [r.start_id, r.bridge_id, r.end_id],
      };
    });

    // Cache the inferences
    for (const inf of inferred) {
      await cacheInference(context, inf);
    }

    logger.info('Transitive inference complete', { context, found: inferred.length });
    return inferred;
  } catch (error) {
    logger.error('Transitive inference failed', error instanceof Error ? error : undefined);
    return [];
  }
}

/**
 * Detect contradictions: A supports B, B contradicts C → potential issue
 */
export async function detectContradictions(
  context: AIContext
): Promise<InferredRelation[]> {
  try {
    const result = await queryContext(
      context,
      `SELECT DISTINCT
         r1.source_id,
         r1.target_id as bridge_id,
         r2.target_id,
         r1.strength as support_strength,
         r2.strength as contradict_strength
       FROM idea_relations r1
       JOIN idea_relations r2 ON r1.target_id = r2.source_id
       WHERE r1.context = $1
         AND r2.context = $1
         AND r1.relation_type IN ('supports', 'builds_on', 'similar_to')
         AND r2.relation_type = 'contradicts'
         AND r1.source_id != r2.target_id
         AND r1.strength >= 0.5
         AND r2.strength >= 0.5
       ORDER BY LEAST(r1.strength, r2.strength) DESC
       LIMIT 10`,
      [context]
    );

    return result.rows.map((r: Record<string, string>) => ({
      sourceId: r.source_id,
      targetId: r.target_id,
      inferenceType: 'contradiction' as const,
      confidence: Math.min(parseFloat(r.support_strength), parseFloat(r.contradict_strength)),
      reasoning: `Source supports bridge, but bridge contradicts target — potential logical conflict`,
      pathIds: [r.source_id, r.bridge_id, r.target_id],
    }));
  } catch (error) {
    logger.error('Contradiction detection failed', error instanceof Error ? error : undefined);
    return [];
  }
}

// ===========================================
// Community Detection (Label Propagation)
// ===========================================

/**
 * Detect communities in the knowledge graph using connected components.
 * Uses a simple label propagation approach suitable for our graph size.
 */
export async function detectCommunities(
  context: AIContext,
  options: { minSize?: number; minStrength?: number } = {}
): Promise<Community[]> {
  const { minSize = 3, minStrength = 0.4 } = options;

  try {
    // Get connected components using RECURSIVE CTE
    const result = await queryContext(
      context,
      `WITH RECURSIVE component AS (
         -- Start with each idea as its own component
         SELECT DISTINCT i.id as idea_id,
                i.id as component_id,
                0 as depth
         FROM ideas i
         WHERE i.is_archived = FALSE
           AND EXISTS (
             SELECT 1 FROM idea_relations r
             WHERE (r.source_id = i.id OR r.target_id = i.id)
               AND r.context = $1
               AND r.strength >= $2
           )

         UNION

         -- Extend components through strong relationships
         SELECT CASE
                  WHEN r.source_id = c.idea_id THEN r.target_id
                  ELSE r.source_id
                END as idea_id,
                LEAST(c.component_id, CASE
                  WHEN r.source_id = c.idea_id THEN r.target_id
                  ELSE r.source_id
                END) as component_id,
                c.depth + 1
         FROM component c
         JOIN idea_relations r ON (r.source_id = c.idea_id OR r.target_id = c.idea_id)
         WHERE r.context = $1
           AND r.strength >= $2
           AND c.depth < 5
       )
       SELECT component_id, ARRAY_AGG(DISTINCT idea_id) as member_ids, COUNT(DISTINCT idea_id) as member_count
       FROM (
         SELECT idea_id, MIN(component_id) as component_id
         FROM component
         GROUP BY idea_id
       ) final_components
       GROUP BY component_id
       HAVING COUNT(DISTINCT idea_id) >= $3
       ORDER BY member_count DESC
       LIMIT 20`,
      [context, minStrength, minSize]
    );

    const communities: Community[] = [];

    for (const row of result.rows) {
      const memberIds = row.member_ids || [];

      // Calculate coherence: avg internal connection strength / count
      const coherenceResult = await queryContext(
        context,
        `SELECT AVG(r.strength) as avg_strength
         FROM idea_relations r
         WHERE r.context = $1
           AND r.source_id = ANY($2::uuid[])
           AND r.target_id = ANY($2::uuid[])`,
        [context, memberIds]
      );

      const coherence = parseFloat(coherenceResult.rows[0]?.avg_strength) || 0;

      communities.push({
        id: row.component_id,
        name: null,
        description: null,
        memberIds,
        memberCount: parseInt(row.member_count, 10) || 0,
        coherenceScore: Math.min(coherence, 1.0),
        createdAt: new Date().toISOString(),
      });
    }

    logger.info('Community detection complete', { context, communities: communities.length });

    // Store communities
    for (const community of communities) {
      await queryContext(
        context,
        `INSERT INTO graph_communities (id, member_ids, member_count, coherence_score)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO UPDATE SET
           member_ids = EXCLUDED.member_ids,
           member_count = EXCLUDED.member_count,
           coherence_score = EXCLUDED.coherence_score,
           updated_at = NOW()`,
        [community.id, community.memberIds, community.memberCount, community.coherenceScore]
      );
    }

    return communities;
  } catch (error) {
    logger.error('Community detection failed', error instanceof Error ? error : undefined);
    return [];
  }
}

// ===========================================
// Centrality Analysis
// ===========================================

/**
 * Calculate centrality metrics for ideas in the graph.
 * Identifies hubs (many connections) and bridges (connect different clusters).
 */
export async function calculateCentrality(
  context: AIContext,
  options: { limit?: number } = {}
): Promise<CentralityResult[]> {
  const { limit = 20 } = options;

  try {
    // Degree centrality + betweenness approximation
    const result = await queryContext(
      context,
      `WITH degree AS (
         SELECT
           i.id,
           i.title,
           COUNT(DISTINCT r.id) as degree,
           COUNT(DISTINCT CASE WHEN r.source_id = i.id THEN r.target_id END) as out_degree,
           COUNT(DISTINCT CASE WHEN r.target_id = i.id THEN r.source_id END) as in_degree
         FROM ideas i
         LEFT JOIN idea_relations r ON (r.source_id = i.id OR r.target_id = i.id)
           AND r.context = $1
         WHERE i.is_archived = FALSE
         GROUP BY i.id, i.title
         HAVING COUNT(DISTINCT r.id) > 0
       ),
       max_degree AS (
         SELECT MAX(degree) as max_d FROM degree
       ),
       -- Betweenness approximation: nodes that connect different clusters
       bridge_score AS (
         SELECT
           d.id,
           -- A node is a bridge if it connects ideas that aren't otherwise connected
           (SELECT COUNT(*)
            FROM idea_relations r1
            JOIN idea_relations r2 ON r1.target_id = d.id AND r2.source_id = d.id
            WHERE r1.context = $1 AND r2.context = $1
              AND NOT EXISTS (
                SELECT 1 FROM idea_relations r3
                WHERE r3.source_id = r1.source_id
                  AND r3.target_id = r2.target_id
                  AND r3.context = $1
              )
           ) as bridge_paths
         FROM degree d
       )
       SELECT
         d.id as idea_id,
         d.title,
         d.degree::float / GREATEST(md.max_d, 1) as degree_centrality,
         COALESCE(bs.bridge_paths, 0)::float /
           GREATEST((SELECT MAX(bridge_paths) FROM bridge_score), 1) as betweenness_centrality,
         d.degree >= md.max_d * 0.7 as is_hub,
         COALESCE(bs.bridge_paths, 0) > 2 as is_bridge
       FROM degree d
       CROSS JOIN max_degree md
       LEFT JOIN bridge_score bs ON d.id = bs.id
       ORDER BY d.degree DESC
       LIMIT $2`,
      [context, limit]
    );

    return result.rows.map((r: Record<string, unknown>) => ({
      ideaId: r.idea_id as string,
      title: r.title as string,
      degreeCentrality: parseFloat(r.degree_centrality as string) || 0,
      betweennessCentrality: parseFloat(r.betweenness_centrality as string) || 0,
      isHub: r.is_hub === true,
      isBridge: r.is_bridge === true,
    }));
  } catch (error) {
    logger.error('Centrality calculation failed', error instanceof Error ? error : undefined);
    return [];
  }
}

// ===========================================
// Learning Path Generation
// ===========================================

/**
 * Generate a learning path from a starting idea through related concepts.
 * Follows the strongest connections to build a logical sequence.
 */
export async function generateLearningPath(
  context: AIContext,
  startIdeaId: string,
  options: { maxSteps?: number; minStrength?: number } = {}
): Promise<LearningPathStep[]> {
  const { maxSteps = 8, minStrength = 0.4 } = options;

  try {
    const path: LearningPathStep[] = [];
    const visited = new Set<string>();
    let currentId = startIdeaId;

    // Get starting idea
    const startResult = await queryContext(
      context,
      `SELECT id, title, summary FROM ideas WHERE id = $1 AND is_archived = FALSE`,
      [startIdeaId]
    );

    if (startResult.rows.length === 0) {return [];}

    path.push({
      ideaId: startResult.rows[0].id,
      title: startResult.rows[0].title,
      summary: startResult.rows[0].summary || '',
      order: 1,
      connectionType: 'start',
      connectionStrength: 1.0,
    });
    visited.add(currentId);

    // Follow strongest connections, preferring builds_on, enables, extends
    const preferredTypes = ['builds_on', 'enables', 'extends', 'implements', 'part_of', 'related_tech'];

    for (let step = 2; step <= maxSteps; step++) {
      const nextResult = await queryContext(
        context,
        `SELECT
           CASE WHEN r.source_id = $1 THEN r.target_id ELSE r.source_id END as next_id,
           i.title, i.summary,
           r.relation_type, r.strength,
           CASE WHEN r.relation_type = ANY($4::text[]) THEN r.strength * 1.2
                ELSE r.strength END as priority
         FROM idea_relations r
         JOIN ideas i ON i.id = CASE WHEN r.source_id = $1 THEN r.target_id ELSE r.source_id END
         WHERE r.context = $2
           AND (r.source_id = $1 OR r.target_id = $1)
           AND r.strength >= $3
           AND CASE WHEN r.source_id = $1 THEN r.target_id ELSE r.source_id END != ALL($5::uuid[])
           AND i.is_archived = FALSE
         ORDER BY priority DESC
         LIMIT 1`,
        [currentId, context, minStrength, preferredTypes, Array.from(visited)]
      );

      if (nextResult.rows.length === 0) {break;}

      const next = nextResult.rows[0];
      path.push({
        ideaId: next.next_id,
        title: next.title,
        summary: next.summary || '',
        order: step,
        connectionType: next.relation_type,
        connectionStrength: parseFloat(next.strength) || 0,
      });

      visited.add(next.next_id);
      currentId = next.next_id;
    }

    logger.debug('Learning path generated', { startIdeaId, steps: path.length });
    return path;
  } catch (error) {
    logger.error('Learning path generation failed', error instanceof Error ? error : undefined);
    return [];
  }
}

// ===========================================
// Manual Relation CRUD
// ===========================================

/**
 * Create a manual relationship between two ideas
 */
export async function createManualRelation(
  context: AIContext,
  sourceId: string,
  targetId: string,
  relationType: string,
  strength: number = 0.8
): Promise<string | null> {
  try {
    const result = await queryContext(
      context,
      `INSERT INTO idea_relations (source_id, target_id, relation_type, strength, context, discovery_method, confidence)
       VALUES ($1, $2, $3, $4, $5, 'manual', $4)
       ON CONFLICT (source_id, target_id, relation_type) DO UPDATE SET
         strength = GREATEST(idea_relations.strength, EXCLUDED.strength),
         discovery_method = 'manual'
       RETURNING id`,
      [sourceId, targetId, relationType, Math.min(Math.max(strength, 0), 1), context]
    );

    return result.rows[0]?.id || null;
  } catch (error) {
    logger.error('Failed to create manual relation', error instanceof Error ? error : undefined);
    throw error;
  }
}

/**
 * Update relationship strength
 */
export async function updateRelationStrength(
  context: AIContext,
  sourceId: string,
  targetId: string,
  strength: number
): Promise<void> {
  await queryContext(
    context,
    `UPDATE idea_relations
     SET strength = $3, last_reinforced = NOW()
     WHERE source_id = $1 AND target_id = $2 AND context = $4`,
    [sourceId, targetId, Math.min(Math.max(strength, 0), 1), context]
  );
}

/**
 * Delete a relationship
 */
export async function deleteRelation(
  context: AIContext,
  sourceId: string,
  targetId: string
): Promise<void> {
  await queryContext(
    context,
    `DELETE FROM idea_relations
     WHERE source_id = $1 AND target_id = $2 AND context = $3`,
    [sourceId, targetId, context]
  );
}

// ===========================================
// Helpers
// ===========================================

// ===========================================
// Temporal Knowledge Graph
// ===========================================

export interface TemporalRelation {
  id: string;
  sourceId: string;
  targetId: string;
  relationType: string;
  strength: number;
  validFrom: string;
  validUntil: string | null;
  supersededBy: string | null;
  isActive: boolean;
}

export interface FactVersion {
  id: string;
  factId: string;
  content: string;
  confidence: number;
  source: string | null;
  validFrom: string;
  validUntil: string | null;
  versionNumber: number;
  changeReason: string | null;
  previousVersionId: string | null;
}

/**
 * Query relations for an idea within a specific time range.
 * Returns both active and historical relations within the window.
 */
export async function queryTemporalRelations(
  context: AIContext,
  ideaId: string,
  timeRange?: { from?: string; to?: string }
): Promise<TemporalRelation[]> {
  try {
    const fromDate = timeRange?.from || '1970-01-01';
    const toDate = timeRange?.to || new Date().toISOString();

    const result = await queryContext(
      context,
      `SELECT id, source_id, target_id, relation_type, strength,
              valid_from, valid_until, superseded_by,
              (valid_until IS NULL) as is_active
       FROM idea_relations
       WHERE context = $1
         AND (source_id = $2 OR target_id = $2)
         AND valid_from <= $4::timestamptz
         AND (valid_until IS NULL OR valid_until >= $3::timestamptz)
       ORDER BY valid_from DESC`,
      [context, ideaId, fromDate, toDate]
    );

    return result.rows.map((r: Record<string, unknown>) => ({
      id: r.id as string,
      sourceId: r.source_id as string,
      targetId: r.target_id as string,
      relationType: r.relation_type as string,
      strength: parseFloat(r.strength as string) || 0,
      validFrom: (r.valid_from as string) || '',
      validUntil: r.valid_until as string | null,
      supersededBy: r.superseded_by as string | null,
      isActive: r.is_active === true,
    }));
  } catch (error) {
    logger.error('Temporal relation query failed', error instanceof Error ? error : undefined);
    return [];
  }
}

/**
 * Get the full change history between two specific ideas.
 */
export async function getRelationHistory(
  context: AIContext,
  sourceId: string,
  targetId: string
): Promise<TemporalRelation[]> {
  try {
    const result = await queryContext(
      context,
      `SELECT id, source_id, target_id, relation_type, strength,
              valid_from, valid_until, superseded_by,
              (valid_until IS NULL) as is_active
       FROM idea_relations
       WHERE context = $1
         AND source_id = $2 AND target_id = $3
       ORDER BY valid_from ASC`,
      [context, sourceId, targetId]
    );

    return result.rows.map((r: Record<string, unknown>) => ({
      id: r.id as string,
      sourceId: r.source_id as string,
      targetId: r.target_id as string,
      relationType: r.relation_type as string,
      strength: parseFloat(r.strength as string) || 0,
      validFrom: (r.valid_from as string) || '',
      validUntil: r.valid_until as string | null,
      supersededBy: r.superseded_by as string | null,
      isActive: r.is_active === true,
    }));
  } catch (error) {
    logger.error('Relation history query failed', error instanceof Error ? error : undefined);
    return [];
  }
}

/**
 * Detect temporal contradictions: facts or relations that were previously true
 * but have been superseded by contradicting information.
 */
export async function detectTemporalContradictions(
  context: AIContext
): Promise<{ current: TemporalRelation; previous: TemporalRelation; conflictType: string }[]> {
  try {
    // Find cases where a relation was superseded and the replacement contradicts it
    const result = await queryContext(
      context,
      `SELECT
         old.id as old_id, old.source_id as old_source, old.target_id as old_target,
         old.relation_type as old_type, old.strength as old_strength,
         old.valid_from as old_from, old.valid_until as old_until,
         new.id as new_id, new.source_id as new_source, new.target_id as new_target,
         new.relation_type as new_type, new.strength as new_strength,
         new.valid_from as new_from
       FROM idea_relations old
       JOIN idea_relations new ON old.superseded_by = new.id
       WHERE old.context = $1
         AND old.valid_until IS NOT NULL
         AND new.valid_until IS NULL
         AND (
           (old.relation_type = 'supports' AND new.relation_type = 'contradicts')
           OR (old.relation_type = 'contradicts' AND new.relation_type = 'supports')
           OR (old.relation_type = 'builds_on' AND new.relation_type = 'contradicts')
           OR (old.relation_type = 'similar_to' AND new.relation_type = 'contradicts')
         )
       ORDER BY new.valid_from DESC
       LIMIT 20`,
      [context]
    );

    return result.rows.map((r: Record<string, unknown>) => ({
      current: {
        id: r.new_id as string,
        sourceId: r.new_source as string,
        targetId: r.new_target as string,
        relationType: r.new_type as string,
        strength: parseFloat(r.new_strength as string) || 0,
        validFrom: r.new_from as string,
        validUntil: null,
        supersededBy: null,
        isActive: true,
      },
      previous: {
        id: r.old_id as string,
        sourceId: r.old_source as string,
        targetId: r.old_target as string,
        relationType: r.old_type as string,
        strength: parseFloat(r.old_strength as string) || 0,
        validFrom: r.old_from as string,
        validUntil: r.old_until as string | null,
        supersededBy: r.new_id as string,
        isActive: false,
      },
      conflictType: `${r.old_type} → ${r.new_type}`,
    }));
  } catch (error) {
    logger.error('Temporal contradiction detection failed', error instanceof Error ? error : undefined);
    return [];
  }
}

/**
 * Create a temporal relation: sets valid_until on existing active relation
 * before inserting the new one. Returns the new relation ID.
 */
export async function createTemporalRelation(
  context: AIContext,
  sourceId: string,
  targetId: string,
  relationType: string,
  strength: number = 0.8,
  changeReason?: string
): Promise<string | null> {
  try {
    // Supersede existing active relation of same type
    const existing = await queryContext(
      context,
      `SELECT id FROM idea_relations
       WHERE source_id = $1 AND target_id = $2 AND relation_type = $3
         AND context = $4 AND valid_until IS NULL
       LIMIT 1`,
      [sourceId, targetId, relationType, context]
    );

    // Insert new relation
    const newResult = await queryContext(
      context,
      `INSERT INTO idea_relations (source_id, target_id, relation_type, strength, context, discovery_method, confidence, valid_from)
       VALUES ($1, $2, $3, $4, $5, 'temporal', $4, NOW())
       RETURNING id`,
      [sourceId, targetId, relationType, Math.min(Math.max(strength, 0), 1), context]
    );

    const newId = newResult.rows[0]?.id;
    if (!newId) return null;

    // Mark old relation as superseded
    if (existing.rows.length > 0) {
      const oldId = existing.rows[0].id;
      await queryContext(
        context,
        `UPDATE idea_relations
         SET valid_until = NOW(), superseded_by = $1
         WHERE id = $2 AND context = $3`,
        [newId, oldId, context]
      );
    }

    return newId;
  } catch (error) {
    logger.error('Temporal relation creation failed', error instanceof Error ? error : undefined);
    return null;
  }
}

/**
 * Get version history for a learned fact.
 */
export async function getFactVersionHistory(
  context: AIContext,
  factId: string
): Promise<FactVersion[]> {
  try {
    const result = await queryContext(
      context,
      `SELECT id, fact_id, content, confidence, source,
              valid_from, valid_until, version_number, change_reason, previous_version_id
       FROM fact_versions
       WHERE fact_id = $1
       ORDER BY version_number DESC`,
      [factId]
    );

    return result.rows.map((r: Record<string, unknown>) => ({
      id: r.id as string,
      factId: r.fact_id as string,
      content: r.content as string,
      confidence: parseFloat(r.confidence as string) || 0,
      source: r.source as string | null,
      validFrom: r.valid_from as string,
      validUntil: r.valid_until as string | null,
      versionNumber: parseInt(r.version_number as string, 10) || 1,
      changeReason: r.change_reason as string | null,
      previousVersionId: r.previous_version_id as string | null,
    }));
  } catch (error) {
    logger.error('Fact version history query failed', error instanceof Error ? error : undefined);
    return [];
  }
}

/**
 * Create a new version of a fact (called when fact content changes).
 * Archives the current version and creates a new one.
 */
export async function versionFact(
  context: AIContext,
  factId: string,
  newContent: string,
  newConfidence: number,
  source: string,
  changeReason: string
): Promise<FactVersion | null> {
  try {
    // Get current version
    const currentResult = await queryContext(
      context,
      `SELECT fv.id, fv.version_number
       FROM fact_versions fv
       WHERE fv.fact_id = $1 AND fv.valid_until IS NULL
       ORDER BY fv.version_number DESC LIMIT 1`,
      [factId]
    );

    let prevId: string | null = null;
    let nextVersion = 1;

    if (currentResult.rows.length > 0) {
      prevId = currentResult.rows[0].id;
      nextVersion = (parseInt(currentResult.rows[0].version_number, 10) || 0) + 1;

      // Close current version
      await queryContext(
        context,
        `UPDATE fact_versions SET valid_until = NOW() WHERE id = $1`,
        [prevId]
      );
    }

    // Insert new version
    const result = await queryContext(
      context,
      `INSERT INTO fact_versions (fact_id, content, confidence, source, version_number, change_reason, previous_version_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [factId, newContent, newConfidence, source, nextVersion, changeReason, prevId]
    );

    if (result.rows.length === 0) return null;

    const r = result.rows[0];
    return {
      id: r.id,
      factId: r.fact_id,
      content: r.content,
      confidence: parseFloat(r.confidence) || 0,
      source: r.source,
      validFrom: r.valid_from,
      validUntil: r.valid_until,
      versionNumber: parseInt(r.version_number, 10) || 1,
      changeReason: r.change_reason,
      previousVersionId: r.previous_version_id,
    };
  } catch (error) {
    logger.error('Fact versioning failed', error instanceof Error ? error : undefined);
    return null;
  }
}

async function cacheInference(context: AIContext, inference: InferredRelation): Promise<void> {
  try {
    await queryContext(
      context,
      `INSERT INTO graph_reasoning_cache (source_id, target_id, inference_type, confidence, reasoning, path_ids)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (source_id, target_id, inference_type) DO UPDATE SET
         confidence = EXCLUDED.confidence,
         reasoning = EXCLUDED.reasoning,
         path_ids = EXCLUDED.path_ids,
         expires_at = NOW() + INTERVAL '7 days'`,
      [inference.sourceId, inference.targetId, inference.inferenceType, inference.confidence, inference.reasoning, inference.pathIds]
    );
  } catch (error) {
    logger.debug('Failed to cache inference', { error: error instanceof Error ? error.message : 'Unknown' });
  }
}
