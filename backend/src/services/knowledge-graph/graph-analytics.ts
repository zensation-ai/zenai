/**
 * Knowledge Graph Analytics - Discovery, analytics, graph-enhanced retrieval
 */

import { queryContext, AIContext } from '../../utils/database-context';
import { logger } from '../../utils/logger';
import { analyzeRelationships } from './graph-core';

// ===========================================
// Types
// ===========================================

export interface GraphRetrievalResult {
  id: string;
  title: string;
  summary: string;
  graphScore: number;
  centrality: number;
  connectionStrength: number;
  path?: string[];
}

export interface GraphRetrievalOptions {
  maxHops?: number;
  minStrength?: number;
  includeCentrality?: boolean;
}

// ===========================================
// Discovery
// ===========================================

/**
 * Discover relationships for all ideas in a context (batch processing)
 */
export async function discoverAllRelationships(
  context: AIContext,
  options: { force?: boolean; batchSize?: number } = {}
): Promise<{ newRelationships: number; processed: number; processingTime: number }> {
  const startTime = Date.now();
  const { force = false, batchSize = 10 } = options;

  // Get ideas that need relationship analysis
  let ideasResult;
  if (force) {
    ideasResult = await queryContext(context, `
      SELECT id FROM ideas
      WHERE is_archived = FALSE AND embedding IS NOT NULL
      ORDER BY created_at DESC
      LIMIT 100
    `);
  } else {
    // Only analyze ideas without relationships
    ideasResult = await queryContext(context, `
      SELECT i.id FROM ideas i
      WHERE i.is_archived = FALSE
        AND i.embedding IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM idea_relations r WHERE r.source_id = i.id
        )
      ORDER BY i.created_at DESC
      LIMIT 50
    `);
  }

  const ideaIds = ideasResult.rows.map(r => r.id);
  logger.info('Graph discovery started', { ideaCount: ideaIds.length });

  let newRelationships = 0;
  let processed = 0;

  // Process in batches
  for (let i = 0; i < ideaIds.length; i += batchSize) {
    const batch = ideaIds.slice(i, i + batchSize);

    for (const ideaId of batch) {
      try {
        const relations = await analyzeRelationships(ideaId);
        newRelationships += relations.length;
        processed++;
      } catch (error) {
        logger.error('Graph discovery failed for idea', error instanceof Error ? error : undefined, { ideaId });
      }
    }

    // Small delay between batches to avoid overwhelming Ollama
    if (i + batchSize < ideaIds.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  const processingTime = Date.now() - startTime;
  logger.info('Graph discovery complete', { newRelationships, processed, processingTime });

  return {
    newRelationships,
    processed,
    processingTime,
  };
}

/**
 * Get graph analytics for a context
 */
export async function getGraphAnalytics(context: AIContext): Promise<{
  totalIdeas: number;
  totalRelations: number;
  totalTopics: number;
  avgRelationsPerIdea: number;
  orphanedIdeas: number;
  mostConnectedIdeas: { id: string; title: string; connections: number }[];
  relationTypeDistribution: Record<string, number>;
}> {
  // Use the SQL function we created in migration
  const analyticsResult = await queryContext(context, `
    SELECT * FROM get_graph_analytics($1)
  `, [context]);

  const analytics = analyticsResult.rows[0] || {};

  // Get most connected ideas
  const connectedResult = await queryContext(context, `
    SELECT i.id, i.title, COUNT(r.id) as connections
    FROM ideas i
    LEFT JOIN idea_relations r ON r.source_id = i.id OR r.target_id = i.id
    WHERE i.context = $1 AND i.is_archived = FALSE
    GROUP BY i.id, i.title
    ORDER BY connections DESC
    LIMIT 5
  `, [context]);

  // Get relation type distribution
  const typesResult = await queryContext(context, `
    SELECT relation_type, COUNT(*) as count
    FROM idea_relations
    WHERE context = $1
    GROUP BY relation_type
  `, [context]);

  return {
    totalIdeas: parseInt(analytics.total_ideas) || 0,
    totalRelations: parseInt(analytics.total_relations) || 0,
    totalTopics: parseInt(analytics.total_topics) || 0,
    avgRelationsPerIdea: parseFloat(analytics.avg_relations_per_idea) || 0,
    orphanedIdeas: parseInt(analytics.orphaned_ideas) || 0,
    mostConnectedIdeas: connectedResult.rows.map(r => ({
      id: r.id,
      title: r.title,
      connections: parseInt(r.connections),
    })),
    relationTypeDistribution: typesResult.rows.reduce((acc, r) => {
      acc[r.relation_type] = parseInt(r.count);
      return acc;
    }, {} as Record<string, number>),
  };
}

// ===========================================
// Graph-Enhanced Retrieval (Phase D - Agentic RAG)
// ===========================================

/**
 * Graph-enhanced retrieval for Agentic RAG
 * Finds relevant ideas through knowledge graph traversal
 */
export async function graphEnhancedRetrieval(
  _query: string,
  context: AIContext,
  seedIdeaIds: string[],
  options: GraphRetrievalOptions = {}
): Promise<GraphRetrievalResult[]> {
  const { maxHops = 2, minStrength = 0.5, includeCentrality = true } = options;

  if (seedIdeaIds.length === 0) {
    return [];
  }

  try {
    // 1. Get directly connected ideas
    const directResult = await queryContext(
      context,
      `SELECT DISTINCT
         i.id, i.title, i.summary,
         kc.strength as connection_strength,
         ARRAY[seed.id::text, i.id::text] as path
       FROM knowledge_connections kc
       JOIN ideas i ON (
         (kc.target_idea_id = i.id AND kc.source_idea_id = ANY($2::uuid[]))
         OR (kc.source_idea_id = i.id AND kc.target_idea_id = ANY($2::uuid[]))
       )
       JOIN unnest($2::uuid[]) as seed(id) ON (
         kc.source_idea_id = seed.id OR kc.target_idea_id = seed.id
       )
       WHERE i.context = $1
         AND i.is_archived = false
         AND i.id != ALL($2::uuid[])
         AND kc.strength >= $3
       ORDER BY kc.strength DESC
       LIMIT 20`,
      [context, seedIdeaIds, minStrength]
    );

    const results: GraphRetrievalResult[] = directResult.rows.map((r: { id: string; title: string; summary?: string; connection_strength: string; path?: string[] }) => ({
      id: r.id,
      title: r.title,
      summary: r.summary || '',
      graphScore: parseFloat(r.connection_strength) || 0.5,
      centrality: 0,
      connectionStrength: parseFloat(r.connection_strength) || 0.5,
      path: r.path,
    }));

    // 2. If maxHops > 1, expand to secondary connections
    if (maxHops > 1 && results.length > 0) {
      const firstHopIds = results.map(r => r.id);
      const allIds = [...seedIdeaIds, ...firstHopIds];

      const secondaryResult = await queryContext(
        context,
        `SELECT DISTINCT
           i.id, i.title, i.summary,
           kc.strength * 0.7 as connection_strength
         FROM knowledge_connections kc
         JOIN ideas i ON (
           (kc.target_idea_id = i.id AND kc.source_idea_id = ANY($2::uuid[]))
           OR (kc.source_idea_id = i.id AND kc.target_idea_id = ANY($2::uuid[]))
         )
         WHERE i.context = $1
           AND i.is_archived = false
           AND i.id != ALL($3::uuid[])
           AND kc.strength >= $4
         ORDER BY kc.strength DESC
         LIMIT 10`,
        [context, firstHopIds, allIds, minStrength]
      );

      for (const r of secondaryResult.rows) {
        results.push({
          id: r.id,
          title: r.title,
          summary: r.summary || '',
          graphScore: parseFloat(r.connection_strength) || 0.3,
          centrality: 0,
          connectionStrength: parseFloat(r.connection_strength) || 0.3,
        });
      }
    }

    // 3. Calculate centrality if requested
    if (includeCentrality && results.length > 0) {
      const resultIds = results.map(r => r.id);

      const centralityResult = await queryContext(
        context,
        `SELECT
           i.id,
           (
             SELECT COUNT(DISTINCT kc2.source_idea_id) + COUNT(DISTINCT kc2.target_idea_id)
             FROM knowledge_connections kc2
             WHERE kc2.source_idea_id = i.id OR kc2.target_idea_id = i.id
           ) as degree_centrality
         FROM ideas i
         WHERE i.id = ANY($1::uuid[])`,
        [resultIds]
      );

      const centralityMap = new Map<string, number>();
      const maxCentrality = Math.max(
        ...centralityResult.rows.map((r: { id: string; degree_centrality: string }) => parseInt(r.degree_centrality) || 0),
        1
      );

      for (const r of centralityResult.rows) {
        centralityMap.set(r.id, (parseInt(r.degree_centrality) || 0) / maxCentrality);
      }

      // Update results with centrality and recalculate score
      for (const result of results) {
        result.centrality = centralityMap.get(result.id) || 0;
        result.graphScore = result.connectionStrength * 0.7 + result.centrality * 0.3;
      }
    }

    // Sort by graph score
    results.sort((a, b) => b.graphScore - a.graphScore);

    logger.debug('Graph-enhanced retrieval complete', {
      seedCount: seedIdeaIds.length,
      resultCount: results.length,
      maxHops,
    });

    return results;
  } catch (error) {
    logger.error('Graph-enhanced retrieval failed', error instanceof Error ? error : undefined);
    return [];
  }
}
