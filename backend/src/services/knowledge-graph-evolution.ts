/**
 * Knowledge Graph Evolution Service
 *
 * Advanced features for the knowledge graph:
 * - Auto-discovery of relationships through semantic analysis
 * - Temporal edges with decay and reinforcement
 * - Pattern learning and proactive insights
 * - Graph evolution over time
 *
 * Part of Phase 3: Knowledge Graph Temporal + Auto-Discovery
 */

import { query } from '../utils/database';
import { queryContext, AIContext } from '../utils/database-context';
import { queryOllamaJSON } from '../utils/ollama';
import { generateEmbedding } from '../utils/ollama';
import { logger } from '../utils/logger';
import { IdeaRelation, RelationType, RELATION_TYPE_METADATA } from './knowledge-graph';

// ===========================================
// Types and Interfaces
// ===========================================

export type DiscoveryMethod =
  | 'manual'
  | 'llm_analysis'
  | 'embedding_similarity'
  | 'co_occurrence'
  | 'user_action'
  | 'pattern_inference';

export interface TemporalEdge extends IdeaRelation {
  validFrom: Date;
  validUntil: Date | null;
  lastReinforced: Date;
  reinforcementCount: number;
  discoveryMethod: DiscoveryMethod;
  confidence: number;
  currentStrength: number;
}

export interface RelationChange {
  relationId: string;
  sourceId: string;
  targetId: string;
  relationType: RelationType;
  strengthBefore: number;
  strengthAfter: number;
  changeReason: 'reinforcement' | 'decay' | 'manual_update' | 'invalidation';
  changedAt: Date;
  changedBy: string;
}

export interface DiscoveredPattern {
  id: string;
  patternType: 'co_occurrence' | 'semantic_cluster' | 'temporal_sequence' | 'causal_chain';
  description: string;
  involvedIdeas: string[];
  confidence: number;
  occurrenceCount: number;
  firstSeen: Date;
  lastSeen: Date;
}

export interface AutoDiscoveryResult {
  discoveredRelations: IdeaRelation[];
  suggestedRelations: Array<{
    sourceId: string;
    targetId: string;
    suggestedType: RelationType;
    confidence: number;
    reason: string;
  }>;
  patterns: DiscoveredPattern[];
  processingTime: number;
}

export interface DecayResult {
  updatedCount: number;
  invalidatedCount: number;
  processedAt: Date;
}

// ===========================================
// Configuration
// ===========================================

const DECAY_CONFIG = {
  dailyDecayRate: 0.02,      // 2% daily decay
  minStrength: 0.15,          // Below this, relation is invalidated
  reinforcementBoost: 0.15,   // How much reinforcement increases strength
  maxReinforcements: 100,     // Cap on reinforcement count
};

const DISCOVERY_CONFIG = {
  embeddingSimilarityThreshold: 0.75,
  coOccurrenceMinCount: 3,
  maxCandidatesPerIdea: 15,
  batchSize: 10,
  confidenceThreshold: 0.6,
};

// ===========================================
// Temporal Edge Management
// ===========================================

/**
 * Apply decay to all knowledge graph edges.
 * Call this periodically (e.g., daily via cron job).
 */
export async function applyGraphDecay(): Promise<DecayResult> {
  try {
    const result = await query(`
      SELECT * FROM apply_relation_decay($1, $2)
    `, [DECAY_CONFIG.dailyDecayRate, DECAY_CONFIG.minStrength]);

    const decayResult: DecayResult = {
      updatedCount: result.rows[0]?.updated_count || 0,
      invalidatedCount: result.rows[0]?.invalidated_count || 0,
      processedAt: new Date(),
    };

    logger.info('Graph decay applied', { ...decayResult });
    return decayResult;
  } catch (error) {
    logger.error('Failed to apply graph decay', error instanceof Error ? error : undefined);
    throw error;
  }
}

/**
 * Reinforce a relationship (called when user interacts with both ideas).
 */
export async function reinforceRelation(
  sourceId: string,
  targetId: string,
  reason: string = 'user_interaction'
): Promise<number | null> {
  try {
    const result = await query(`
      SELECT reinforce_relation($1, $2, $3) as new_strength
    `, [sourceId, targetId, DECAY_CONFIG.reinforcementBoost]);

    const newStrength = result.rows[0]?.new_strength;

    if (newStrength !== null) {
      logger.debug('Relation reinforced', {
        sourceId,
        targetId,
        newStrength,
        reason,
      });
    }

    return newStrength;
  } catch (error) {
    logger.error('Failed to reinforce relation', error instanceof Error ? error : undefined);
    return null;
  }
}

/**
 * Get valid relations at a specific point in time.
 * Useful for temporal analysis and "time travel" queries.
 */
export async function getRelationsAtTime(
  context: AIContext,
  timestamp: Date = new Date(),
  minStrength: number = 0.3
): Promise<TemporalEdge[]> {
  const result = await queryContext(context, `
    SELECT * FROM get_relations_at_time($1, $2, $3)
  `, [timestamp, context, minStrength]);

  return result.rows.map(row => ({
    sourceId: row.source_id,
    targetId: row.target_id,
    relationType: row.relation_type as RelationType,
    strength: row.strength,
    reason: '',
    validFrom: row.valid_from,
    validUntil: row.valid_until,
    lastReinforced: row.last_reinforced || new Date(),
    reinforcementCount: row.reinforcement_count || 1,
    discoveryMethod: row.discovery_method || 'manual',
    confidence: row.confidence || 1.0,
    currentStrength: row.current_strength,
  }));
}

/**
 * Get relation history for temporal analysis.
 */
export async function getRelationHistory(
  sourceId: string,
  targetId: string,
  limit: number = 50
): Promise<RelationChange[]> {
  const result = await query(`
    SELECT *
    FROM relation_history
    WHERE source_id = $1 AND target_id = $2
    ORDER BY changed_at DESC
    LIMIT $3
  `, [sourceId, targetId, limit]);

  return result.rows.map(row => ({
    relationId: row.relation_id,
    sourceId: row.source_id,
    targetId: row.target_id,
    relationType: row.relation_type as RelationType,
    strengthBefore: row.strength_before,
    strengthAfter: row.strength_after,
    changeReason: row.change_reason,
    changedAt: row.changed_at,
    changedBy: row.changed_by,
  }));
}

// ===========================================
// Auto-Discovery System
// ===========================================

/**
 * Discover relationships for a single idea using multiple strategies.
 */
export async function discoverRelationsForIdea(
  ideaId: string,
  context: AIContext
): Promise<AutoDiscoveryResult> {
  const startTime = Date.now();
  const discoveredRelations: IdeaRelation[] = [];
  const suggestedRelations: AutoDiscoveryResult['suggestedRelations'] = [];
  const patterns: DiscoveredPattern[] = [];

  try {
    // 1. Get the idea
    const ideaResult = await queryContext(context, `
      SELECT id, title, summary, keywords, embedding
      FROM ideas
      WHERE id = $1 AND is_archived = FALSE
    `, [ideaId]);

    if (ideaResult.rows.length === 0) {
      return { discoveredRelations, suggestedRelations, patterns, processingTime: Date.now() - startTime };
    }

    const idea = ideaResult.rows[0];

    // 2. Find embedding-similar ideas not yet connected
    const similarResult = await query(`
      SELECT * FROM find_potential_relations($1, $2, $3)
    `, [ideaId, DISCOVERY_CONFIG.embeddingSimilarityThreshold, DISCOVERY_CONFIG.maxCandidatesPerIdea]);

    const unconnectedSimilar = similarResult.rows.filter(r => !r.already_connected);

    // 3. Use LLM to classify relationships for highly similar ideas
    if (unconnectedSimilar.length > 0) {
      const classified = await classifyRelationsWithLLM(idea, unconnectedSimilar);

      for (const rel of classified) {
        if (rel.confidence >= DISCOVERY_CONFIG.confidenceThreshold) {
          // High confidence - auto-create
          await createDiscoveredRelation(
            ideaId,
            rel.targetId,
            rel.relationType,
            rel.confidence,
            'llm_analysis',
            rel.reason
          );
          discoveredRelations.push({
            sourceId: ideaId,
            targetId: rel.targetId,
            relationType: rel.relationType,
            strength: rel.confidence,
            reason: rel.reason,
          });
        } else {
          // Lower confidence - suggest to user
          suggestedRelations.push({
            sourceId: ideaId,
            targetId: rel.targetId,
            suggestedType: rel.relationType,
            confidence: rel.confidence,
            reason: rel.reason,
          });
        }
      }
    }

    // 4. Check for co-occurrence patterns
    const coOccurrences = await findCoOccurrences(ideaId, context);
    if (coOccurrences.length > 0) {
      patterns.push(...coOccurrences);
    }

    // 5. Look for temporal sequences
    const temporalPatterns = await findTemporalSequences(ideaId, context);
    if (temporalPatterns.length > 0) {
      patterns.push(...temporalPatterns);
    }

    const processingTime = Date.now() - startTime;

    logger.info('Auto-discovery complete for idea', {
      ideaId,
      discoveredCount: discoveredRelations.length,
      suggestedCount: suggestedRelations.length,
      patternsFound: patterns.length,
      processingTime,
    });

    return { discoveredRelations, suggestedRelations, patterns, processingTime };
  } catch (error) {
    logger.error('Auto-discovery failed for idea', error instanceof Error ? error : undefined, { ideaId });
    return {
      discoveredRelations,
      suggestedRelations,
      patterns,
      processingTime: Date.now() - startTime,
    };
  }
}

/**
 * Process the auto-discovery queue (background job).
 */
export async function processDiscoveryQueue(
  batchSize: number = DISCOVERY_CONFIG.batchSize
): Promise<{ processed: number; discovered: number; failed: number }> {
  let processed = 0;
  let discovered = 0;
  let failed = 0;

  try {
    // Get pending items from queue
    const queueResult = await query(`
      UPDATE auto_discovery_queue
      SET status = 'processing', last_attempt = NOW(), attempts = attempts + 1
      WHERE id IN (
        SELECT id FROM auto_discovery_queue
        WHERE status = 'pending' AND attempts < 3
        ORDER BY priority DESC, created_at ASC
        LIMIT $1
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id, idea_id, context
    `, [batchSize]);

    for (const item of queueResult.rows) {
      try {
        const result = await discoverRelationsForIdea(item.idea_id, item.context);

        // Mark as completed
        await query(`
          UPDATE auto_discovery_queue
          SET status = 'completed', completed_at = NOW()
          WHERE id = $1
        `, [item.id]);

        processed++;
        discovered += result.discoveredRelations.length;
      } catch (error) {
        // Mark as failed
        await query(`
          UPDATE auto_discovery_queue
          SET status = CASE WHEN attempts >= 3 THEN 'failed' ELSE 'pending' END,
              error_message = $2
          WHERE id = $1
        `, [item.id, error instanceof Error ? error.message : 'Unknown error']);

        failed++;
      }
    }

    logger.info('Discovery queue processed', { processed, discovered, failed });
    return { processed, discovered, failed };
  } catch (error) {
    logger.error('Failed to process discovery queue', error instanceof Error ? error : undefined);
    return { processed, discovered, failed };
  }
}

/**
 * Queue an idea for auto-discovery.
 */
export async function queueForDiscovery(
  ideaId: string,
  context: AIContext,
  priority: number = 5
): Promise<void> {
  await query(`
    INSERT INTO auto_discovery_queue (idea_id, context, priority)
    VALUES ($1, $2, $3)
    ON CONFLICT DO NOTHING
  `, [ideaId, context, priority]);
}

// ===========================================
// Pattern Discovery
// ===========================================

/**
 * Find co-occurrence patterns (ideas frequently accessed together).
 */
async function findCoOccurrences(
  ideaId: string,
  context: AIContext
): Promise<DiscoveredPattern[]> {
  // This would integrate with session tracking
  // For now, we check for ideas in the same topics
  const result = await queryContext(context, `
    WITH idea_topics AS (
      SELECT topic_id FROM idea_topic_memberships WHERE idea_id = $1
    )
    SELECT
      ARRAY_AGG(DISTINCT m.idea_id) as co_occurring_ideas,
      t.name as topic_name,
      COUNT(DISTINCT m.idea_id) as count
    FROM idea_topic_memberships m
    JOIN idea_topics it ON m.topic_id = it.topic_id
    JOIN idea_topics tbl ON tbl.id = m.topic_id
    JOIN idea_topics t ON t.id = m.topic_id
    WHERE m.idea_id != $1
    GROUP BY t.name, m.topic_id
    HAVING COUNT(DISTINCT m.idea_id) >= $2
  `, [ideaId, DISCOVERY_CONFIG.coOccurrenceMinCount]);

  return result.rows.map(row => ({
    id: `co_${ideaId}_${Date.now()}`,
    patternType: 'co_occurrence' as const,
    description: `Ideas frequently appear together in topic: ${row.topic_name}`,
    involvedIdeas: row.co_occurring_ideas || [],
    confidence: Math.min(0.9, 0.5 + row.count * 0.1),
    occurrenceCount: row.count,
    firstSeen: new Date(),
    lastSeen: new Date(),
  }));
}

/**
 * Find temporal sequences (ideas created in meaningful order).
 */
async function findTemporalSequences(
  ideaId: string,
  context: AIContext
): Promise<DiscoveredPattern[]> {
  // Find ideas created shortly after this one with high similarity
  const result = await queryContext(context, `
    SELECT
      i.id,
      i.title,
      i.created_at,
      1 - (i.embedding <-> source.embedding) as similarity
    FROM ideas i
    CROSS JOIN (SELECT embedding, created_at FROM ideas WHERE id = $1) source
    WHERE i.id != $1
      AND i.context = $2
      AND i.is_archived = FALSE
      AND i.created_at > source.created_at
      AND i.created_at < source.created_at + INTERVAL '7 days'
      AND i.embedding IS NOT NULL
      AND 1 - (i.embedding <-> source.embedding) > 0.6
    ORDER BY i.created_at ASC
    LIMIT 5
  `, [ideaId, context]);

  if (result.rows.length >= 2) {
    return [{
      id: `seq_${ideaId}_${Date.now()}`,
      patternType: 'temporal_sequence' as const,
      description: `Sequence of related ideas developed over time`,
      involvedIdeas: [ideaId, ...result.rows.map(r => r.id)],
      confidence: 0.7,
      occurrenceCount: 1,
      firstSeen: new Date(),
      lastSeen: new Date(),
    }];
  }

  return [];
}

/**
 * Store a discovered pattern.
 */
export async function storePattern(pattern: Omit<DiscoveredPattern, 'id'>): Promise<string> {
  const embedding = await generateEmbedding(pattern.description);

  const result = await query(`
    INSERT INTO discovered_patterns (
      pattern_type, pattern_description, involved_ideas,
      pattern_embedding, confidence, occurrence_count
    )
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING id
  `, [
    pattern.patternType,
    pattern.description,
    pattern.involvedIdeas,
    embedding,
    pattern.confidence,
    pattern.occurrenceCount,
  ]);

  return result.rows[0].id;
}

/**
 * Get active patterns for insights.
 */
export async function getActivePatterns(
  context: AIContext,
  limit: number = 10
): Promise<DiscoveredPattern[]> {
  const result = await queryContext(context, `
    SELECT *
    FROM discovered_patterns
    WHERE is_active = TRUE
    ORDER BY confidence DESC, occurrence_count DESC
    LIMIT $1
  `, [limit]);

  return result.rows.map(row => ({
    id: row.id,
    patternType: row.pattern_type,
    description: row.pattern_description,
    involvedIdeas: row.involved_ideas || [],
    confidence: row.confidence,
    occurrenceCount: row.occurrence_count,
    firstSeen: row.first_seen,
    lastSeen: row.last_seen,
  }));
}

// ===========================================
// LLM-Based Relation Classification
// ===========================================

interface ClassifiedRelation {
  targetId: string;
  relationType: RelationType;
  confidence: number;
  reason: string;
}

/**
 * Use LLM to classify the type of relationship between ideas.
 */
async function classifyRelationsWithLLM(
  sourceIdea: { id: string; title: string; summary?: string; keywords?: string[] },
  candidates: Array<{ target_id: string; target_title: string; similarity: number }>
): Promise<ClassifiedRelation[]> {
  const relationTypes = Object.entries(RELATION_TYPE_METADATA)
    .map(([key, meta]) => `${key}: ${meta.labelDe}`)
    .join('\n');

  const prompt = `Analysiere die Beziehungen zwischen Ideen. Antworte NUR mit validem JSON.

HAUPTIDEE:
Titel: "${sourceIdea.title}"
${sourceIdea.summary ? `Beschreibung: ${sourceIdea.summary}` : ''}

KANDIDATEN (nach Ähnlichkeit sortiert):
${candidates.slice(0, 5).map((c, i) => `${i + 1}. "${c.target_title}" (Ähnlichkeit: ${(c.similarity * 100).toFixed(0)}%)`).join('\n')}

BEZIEHUNGSTYPEN:
${relationTypes}

Klassifiziere die Beziehungen. Berücksichtige:
- Hohe Ähnlichkeit = wahrscheinlich "similar_to" oder "related_tech"
- Thematische Abhängigkeit = "builds_on", "extends", "depends_on"
- Gegensätze = "contradicts", "alternative_to"

Antworte EXAKT in diesem JSON-Format:
[{"targetIndex": 1, "relationType": "similar_to", "confidence": 0.8, "reason": "Beide behandeln..."}]

Nur Beziehungen mit confidence >= 0.5. Wenn keine sinnvollen Beziehungen: []`;

  try {
    const response = await queryOllamaJSON<Array<{
      targetIndex: number;
      relationType: string;
      confidence: number;
      reason?: string;
    }>>(prompt);

    if (!Array.isArray(response)) {
      return [];
    }

    return response
      .filter(r =>
        r.targetIndex >= 1 &&
        r.targetIndex <= candidates.length &&
        r.confidence >= 0.5 &&
        RELATION_TYPE_METADATA[r.relationType as RelationType]
      )
      .map(r => ({
        targetId: candidates[r.targetIndex - 1].target_id,
        relationType: r.relationType as RelationType,
        confidence: Math.min(1, Math.max(0, r.confidence)),
        reason: r.reason || '',
      }));
  } catch (error) {
    logger.debug('LLM classification failed', { error: error instanceof Error ? error.message : 'Unknown' });
    return [];
  }
}

/**
 * Create a discovered relation in the database.
 */
async function createDiscoveredRelation(
  sourceId: string,
  targetId: string,
  relationType: RelationType,
  confidence: number,
  discoveryMethod: DiscoveryMethod,
  reason: string
): Promise<void> {
  await query(`
    INSERT INTO idea_relations (
      source_id, target_id, relation_type, strength, reason,
      discovery_method, confidence, current_strength,
      valid_from, last_reinforced
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
    ON CONFLICT (source_id, target_id, relation_type)
    DO UPDATE SET
      strength = GREATEST(idea_relations.strength, $4),
      confidence = GREATEST(idea_relations.confidence, $7),
      current_strength = GREATEST(idea_relations.current_strength, $8),
      last_reinforced = NOW(),
      reinforcement_count = idea_relations.reinforcement_count + 1
  `, [sourceId, targetId, relationType, confidence, reason, discoveryMethod, confidence, confidence]);
}

// ===========================================
// Graph Evolution Analytics
// ===========================================

export interface GraphEvolutionStats {
  totalNodes: number;
  totalEdges: number;
  activeEdges: number;
  invalidatedEdges: number;
  avgEdgeStrength: number;
  avgDecayRate: number;
  mostReinforcedRelations: Array<{
    sourceTitle: string;
    targetTitle: string;
    relationType: RelationType;
    reinforcementCount: number;
  }>;
  recentlyInvalidated: Array<{
    sourceTitle: string;
    targetTitle: string;
    relationType: RelationType;
    invalidatedAt: Date;
  }>;
}

/**
 * Get comprehensive graph evolution statistics.
 */
export async function getGraphEvolutionStats(context: AIContext): Promise<GraphEvolutionStats> {
  const statsResult = await queryContext(context, `
    SELECT
      (SELECT COUNT(*) FROM ideas WHERE context = $1 AND is_archived = FALSE) as total_nodes,
      (SELECT COUNT(*) FROM idea_relations WHERE context = $1) as total_edges,
      (SELECT COUNT(*) FROM idea_relations WHERE context = $1 AND valid_until IS NULL) as active_edges,
      (SELECT COUNT(*) FROM idea_relations WHERE context = $1 AND valid_until IS NOT NULL) as invalidated_edges,
      (SELECT AVG(current_strength) FROM idea_relations WHERE context = $1 AND valid_until IS NULL) as avg_strength,
      (SELECT AVG(strength - current_strength) FROM idea_relations WHERE context = $1 AND valid_until IS NULL) as avg_decay
  `, [context]);

  const stats = statsResult.rows[0] || {};

  // Most reinforced relations
  const reinforcedResult = await queryContext(context, `
    SELECT
      src.title as source_title,
      tgt.title as target_title,
      r.relation_type,
      r.reinforcement_count
    FROM idea_relations r
    JOIN ideas src ON r.source_id = src.id
    JOIN ideas tgt ON r.target_id = tgt.id
    WHERE r.context = $1 AND r.valid_until IS NULL
    ORDER BY r.reinforcement_count DESC
    LIMIT 5
  `, [context]);

  // Recently invalidated
  const invalidatedResult = await queryContext(context, `
    SELECT
      src.title as source_title,
      tgt.title as target_title,
      r.relation_type,
      r.valid_until as invalidated_at
    FROM idea_relations r
    JOIN ideas src ON r.source_id = src.id
    JOIN ideas tgt ON r.target_id = tgt.id
    WHERE r.context = $1 AND r.valid_until IS NOT NULL
    ORDER BY r.valid_until DESC
    LIMIT 5
  `, [context]);

  return {
    totalNodes: parseInt(stats.total_nodes, 10) || 0,
    totalEdges: parseInt(stats.total_edges, 10) || 0,
    activeEdges: parseInt(stats.active_edges, 10) || 0,
    invalidatedEdges: parseInt(stats.invalidated_edges, 10) || 0,
    avgEdgeStrength: parseFloat(stats.avg_strength) || 0,
    avgDecayRate: parseFloat(stats.avg_decay) || 0,
    mostReinforcedRelations: reinforcedResult.rows.map(r => ({
      sourceTitle: r.source_title,
      targetTitle: r.target_title,
      relationType: r.relation_type as RelationType,
      reinforcementCount: r.reinforcement_count,
    })),
    recentlyInvalidated: invalidatedResult.rows.map(r => ({
      sourceTitle: r.source_title,
      targetTitle: r.target_title,
      relationType: r.relation_type as RelationType,
      invalidatedAt: r.invalidated_at,
    })),
  };
}

/**
 * Trigger a full graph evolution cycle.
 * Call this periodically (e.g., nightly).
 */
export async function runGraphEvolutionCycle(context: AIContext): Promise<{
  decayResult: DecayResult;
  discoveryResult: { processed: number; discovered: number; failed: number };
  refreshedStats: boolean;
}> {
  logger.info('Starting graph evolution cycle', { context });

  // 1. Apply decay
  const decayResult = await applyGraphDecay();

  // 2. Process discovery queue
  const discoveryResult = await processDiscoveryQueue();

  // 3. Refresh materialized view
  let refreshedStats = false;
  try {
    await query('SELECT refresh_graph_statistics()');
    refreshedStats = true;
  } catch (error) {
    logger.debug('Could not refresh graph statistics', {
      error: error instanceof Error ? error.message : 'Unknown',
    });
  }

  logger.info('Graph evolution cycle complete', {
    context,
    decayResult,
    discoveryResult,
    refreshedStats,
  });

  return { decayResult, discoveryResult, refreshedStats };
}

// ===========================================
// Exports
// ===========================================

export {
  DECAY_CONFIG,
  DISCOVERY_CONFIG,
};
