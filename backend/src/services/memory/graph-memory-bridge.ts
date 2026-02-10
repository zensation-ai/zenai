/**
 * Graph-Memory Bridge
 *
 * Connects the Knowledge Graph with the Memory system for richer context.
 * When memory retrieval finds relevant ideas, this bridge expands context
 * via graph neighbors (1-hop and optional 2-hop for serendipity).
 *
 * Research: GraphRAG shows 3.4x improvement for relationship queries (Diffbot).
 * CHI 2025 "Provocateur" pattern: serendipitous connections as questions.
 *
 * @module services/memory/graph-memory-bridge
 */

import { queryContext, AIContext } from '../../utils/database-context';
import { RELATION_TYPE_METADATA, RelationType } from '../knowledge-graph';
import { logger } from '../../utils/logger';

// ===========================================
// Types
// ===========================================

export interface GraphNeighbor {
  ideaId: string;
  title: string;
  summary: string;
  relationType: RelationType;
  strength: number;
  /** German label describing the relationship */
  relationLabel: string;
  /** Direction: how the neighbor relates to the source */
  direction: 'outgoing' | 'incoming';
}

export interface GraphExpansionResult {
  /** Direct graph neighbors added as context */
  contextParts: GraphContextPart[];
  /** Serendipity suggestions (2-hop, as questions) */
  serendipityHints: string[];
  /** Number of unique ideas found via graph */
  expansionCount: number;
}

export interface GraphContextPart {
  content: string;
  relevance: number;
  sourceIdeaId: string;
  neighborIdeaId: string;
  relationType: RelationType;
}

export interface GraphExpansionOptions {
  /** Minimum strength for 1-hop neighbors (default: 0.5) */
  minStrength?: number;
  /** Maximum neighbors per seed idea (default: 3) */
  maxNeighborsPerSeed?: number;
  /** Enable serendipity mode (2-hop, lower threshold) */
  enableSerendipity?: boolean;
  /** Serendipity strength threshold (default: 0.3) */
  serendipityThreshold?: number;
  /** Maximum serendipity hints (default: 2) */
  maxSerendipityHints?: number;
}

// ===========================================
// Constants
// ===========================================

const DEFAULTS: Required<GraphExpansionOptions> = {
  minStrength: 0.5,
  maxNeighborsPerSeed: 3,
  enableSerendipity: false,
  serendipityThreshold: 0.3,
  maxSerendipityHints: 2,
};

/** Relevance boost for graph-connected context (1.1x) */
const GRAPH_RELEVANCE_BOOST = 1.1;

/** Serendipity relevance (lower, but visible) */
const SERENDIPITY_RELEVANCE = 0.6;

// ===========================================
// Core Functions
// ===========================================

/**
 * Get 1-hop neighbors for an idea from the knowledge graph.
 * Queries both directions (source→target and target→source).
 */
export async function getNeighbors(
  ideaId: string,
  context: AIContext,
  options: { minStrength?: number; limit?: number } = {}
): Promise<GraphNeighbor[]> {
  const minStrength = options.minStrength ?? 0.5;
  const limit = options.limit ?? 5;

  try {
    const result = await queryContext(context, `
      SELECT
        r.source_id, r.target_id, r.relation_type, r.strength, r.reason,
        i.id as neighbor_id, i.title as neighbor_title, i.summary as neighbor_summary,
        CASE WHEN r.source_id = $1 THEN 'outgoing' ELSE 'incoming' END as direction
      FROM idea_relations r
      JOIN ideas i ON (
        CASE WHEN r.source_id = $1 THEN r.target_id ELSE r.source_id END
      ) = i.id
      WHERE (r.source_id = $1 OR r.target_id = $1)
        AND r.strength >= $2
        AND r.context = $3
      ORDER BY r.strength DESC
      LIMIT $4
    `, [ideaId, minStrength, context, limit]);

    return result.rows.map((row: Record<string, unknown>) => {
      const relationType = row.relation_type as RelationType;
      const meta = RELATION_TYPE_METADATA[relationType];
      const direction = row.direction as 'outgoing' | 'incoming';

      // For incoming relations, use inverse label if available
      let relationLabel = meta?.labelDe || relationType;
      if (direction === 'incoming' && meta?.inverse) {
        const inverseMeta = RELATION_TYPE_METADATA[meta.inverse];
        if (inverseMeta) {
          relationLabel = inverseMeta.labelDe;
        }
      }

      return {
        ideaId: row.neighbor_id as string,
        title: row.neighbor_title as string,
        summary: (row.neighbor_summary as string || '').substring(0, 200),
        relationType,
        strength: row.strength as number,
        relationLabel,
        direction,
      };
    });
  } catch (error) {
    logger.warn('Failed to get graph neighbors', { ideaId, error });
    return [];
  }
}

/**
 * Get 2-hop neighbors (neighbors of neighbors) for serendipity.
 * Returns ideas that are connected through an intermediate idea.
 */
async function get2HopNeighbors(
  ideaId: string,
  context: AIContext,
  options: { minStrength?: number; limit?: number; excludeIds?: Set<string> } = {}
): Promise<GraphNeighbor[]> {
  const minStrength = options.minStrength ?? 0.3;
  const limit = options.limit ?? 3;
  const excludeIds = options.excludeIds ?? new Set();

  try {
    // 2-hop: idea → neighbor → neighbor's neighbor
    const result = await queryContext(context, `
      SELECT DISTINCT ON (i2.id)
        i2.id as neighbor_id, i2.title as neighbor_title, i2.summary as neighbor_summary,
        r2.relation_type, r2.strength * r1.strength as combined_strength,
        'outgoing' as direction
      FROM idea_relations r1
      JOIN idea_relations r2 ON r1.target_id = r2.source_id
      JOIN ideas i2 ON r2.target_id = i2.id
      WHERE r1.source_id = $1
        AND r1.context = $2
        AND r2.context = $2
        AND r1.strength >= $3
        AND r2.strength >= $3
        AND r2.target_id != $1
      ORDER BY i2.id, combined_strength DESC
      LIMIT $4
    `, [ideaId, context, minStrength, limit]);

    return result.rows
      .filter((row: Record<string, unknown>) => !excludeIds.has(row.neighbor_id as string))
      .map((row: Record<string, unknown>) => {
        const relationType = row.relation_type as RelationType;
        const meta = RELATION_TYPE_METADATA[relationType];

        return {
          ideaId: row.neighbor_id as string,
          title: row.neighbor_title as string,
          summary: (row.neighbor_summary as string || '').substring(0, 200),
          relationType,
          strength: row.combined_strength as number,
          relationLabel: meta?.labelDe || relationType,
          direction: 'outgoing' as const,
        };
      });
  } catch (error) {
    logger.warn('Failed to get 2-hop graph neighbors', { ideaId, error });
    return [];
  }
}

/**
 * Expand memory context using graph connections.
 *
 * Given a set of seed idea IDs (from RAG or memory retrieval),
 * finds graph neighbors and returns them as context parts.
 *
 * @param seedIdeaIds - Ideas already found by memory/RAG
 * @param context - AI context (personal/work)
 * @param options - Expansion options
 * @returns GraphExpansionResult with context parts and serendipity hints
 */
export async function expandViaGraph(
  seedIdeaIds: string[],
  context: AIContext,
  options: GraphExpansionOptions = {}
): Promise<GraphExpansionResult> {
  const opts = { ...DEFAULTS, ...options };

  if (seedIdeaIds.length === 0) {
    return { contextParts: [], serendipityHints: [], expansionCount: 0 };
  }

  const contextParts: GraphContextPart[] = [];
  const seenIds = new Set(seedIdeaIds);
  const serendipityHints: string[] = [];

  // 1. Get 1-hop neighbors for each seed idea
  const neighborPromises = seedIdeaIds.slice(0, 5).map((seedId) =>
    getNeighbors(seedId, context, {
      minStrength: opts.minStrength,
      limit: opts.maxNeighborsPerSeed,
    }).then((neighbors) => ({ seedId, neighbors }))
  );

  const neighborResults = await Promise.all(neighborPromises);

  for (const { seedId, neighbors } of neighborResults) {
    for (const neighbor of neighbors) {
      if (seenIds.has(neighbor.ideaId)) {continue;}
      seenIds.add(neighbor.ideaId);

      // Build annotated content: "[Relation] Title: Summary"
      const content = `[${neighbor.relationLabel} "${neighbor.title}"] ${neighbor.summary}`;

      contextParts.push({
        content,
        relevance: neighbor.strength * GRAPH_RELEVANCE_BOOST,
        sourceIdeaId: seedId,
        neighborIdeaId: neighbor.ideaId,
        relationType: neighbor.relationType,
      });
    }
  }

  // 2. Serendipity: 2-hop neighbors formulated as questions
  if (opts.enableSerendipity && seedIdeaIds.length > 0) {
    try {
      // Use first seed for 2-hop exploration
      const twoHopNeighbors = await get2HopNeighbors(
        seedIdeaIds[0],
        context,
        {
          minStrength: opts.serendipityThreshold,
          limit: opts.maxSerendipityHints,
          excludeIds: seenIds,
        }
      );

      for (const neighbor of twoHopNeighbors) {
        // Formulate as question (CHI 2025 Provocateur pattern)
        const hint = formatSerendipityQuestion(neighbor);
        serendipityHints.push(hint);
        seenIds.add(neighbor.ideaId);
      }
    } catch (error) {
      logger.debug('Serendipity expansion failed (non-critical)', { error });
    }
  }

  logger.debug('Graph expansion completed', {
    seedCount: seedIdeaIds.length,
    neighborsFound: contextParts.length,
    serendipityHints: serendipityHints.length,
  });

  return {
    contextParts,
    serendipityHints,
    expansionCount: contextParts.length,
  };
}

/**
 * Format a 2-hop neighbor as a serendipity question.
 * CHI 2025: Questions > assertions for promoting deeper thinking.
 */
function formatSerendipityQuestion(neighbor: GraphNeighbor): string {
  const templates = [
    `Hast du bedacht, dass "${neighbor.title}" hier relevant sein könnte?`,
    `Könnte "${neighbor.title}" eine unerwartete Verbindung zu deinem Thema haben?`,
    `Interessant: "${neighbor.title}" ist über mehrere Ecken mit deinem Thema verbunden.`,
  ];

  // Simple deterministic selection based on title length
  const index = neighbor.title.length % templates.length;
  return templates[index];
}

/**
 * Convert graph expansion results to memory ContextPart format.
 * This is the main integration point with MemoryCoordinator.
 */
export function toContextParts(
  expansion: GraphExpansionResult
): Array<{
  type: 'document' | 'hint';
  content: string;
  relevance: number;
  source: 'knowledge_graph';
}> {
  const parts: Array<{
    type: 'document' | 'hint';
    content: string;
    relevance: number;
    source: 'knowledge_graph';
  }> = [];

  // Graph neighbors as document-type context
  for (const gp of expansion.contextParts) {
    parts.push({
      type: 'document',
      content: gp.content,
      relevance: gp.relevance,
      source: 'knowledge_graph',
    });
  }

  // Serendipity hints as hint-type context
  for (const hint of expansion.serendipityHints) {
    parts.push({
      type: 'hint',
      content: hint,
      relevance: SERENDIPITY_RELEVANCE,
      source: 'knowledge_graph',
    });
  }

  return parts;
}
