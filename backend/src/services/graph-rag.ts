/**
 * GraphRAG Service - Phase 43
 *
 * Combines Knowledge Graph traversal with Enhanced RAG for
 * multi-hop reasoning and structurally-aware retrieval.
 *
 * Architecture:
 * 1. Query -> Knowledge Graph: find related entities via relationships
 * 2. Graph context enriches the RAG query
 * 3. Graph proximity boosts re-ranking scores
 * 4. Results include relationship context for better answers
 *
 * @module services/graph-rag
 */

import { logger } from '../utils/logger';
import { AIContext } from '../utils/database-context';
import { enhancedRAG, EnhancedRAGResult, EnhancedResult } from './enhanced-rag';
import { getRelationships, getSuggestedConnections } from './knowledge-graph/graph-core';
import { multiHopSearch } from './knowledge-graph';
import { queryContext } from '../utils/database-context';

// ===========================================
// Types
// ===========================================

export interface GraphRAGResult extends EnhancedRAGResult {
  /** Graph-derived context used to enrich the query */
  graphContext: GraphContext;
  /** Whether graph enrichment was applied */
  graphEnriched: boolean;
}

export interface GraphContext {
  /** Related ideas found via graph traversal */
  relatedIdeas: GraphRelatedIdea[];
  /** Relationship types discovered */
  relationTypes: string[];
  /** Multi-hop paths found */
  pathCount: number;
  /** Graph traversal time in ms */
  graphTimeMs: number;
}

interface GraphRelatedIdea {
  id: string;
  title: string;
  summary: string;
  relation: string;
  strength: number;
  hops: number;
}

// ===========================================
// Configuration
// ===========================================

const CONFIG = {
  /** Max ideas to seed graph traversal from */
  MAX_SEED_IDEAS: 3,
  /** Max hops for multi-hop search */
  MAX_HOPS: 2,
  /** Minimum relationship strength to consider */
  MIN_STRENGTH: 0.3,
  /** Boost factor for graph-connected results */
  GRAPH_PROXIMITY_BOOST: 1.2,
  /** Max graph-related ideas to include in context */
  MAX_GRAPH_CONTEXT: 5,
};

// ===========================================
// GraphRAG Service
// ===========================================

/**
 * Main GraphRAG retrieval - enriches RAG with Knowledge Graph context
 */
export async function graphRAGRetrieve(
  query: string,
  context: AIContext,
  options?: { maxResults?: number; maxHops?: number }
): Promise<GraphRAGResult> {
  const startTime = Date.now();
  const maxHops = options?.maxHops ?? CONFIG.MAX_HOPS;

  logger.info('GraphRAG retrieval starting', {
    query: query.substring(0, 50),
    context,
    maxHops,
  });

  // Step 1: Find seed ideas via quick keyword search
  const graphStart = Date.now();
  let graphContext: GraphContext = {
    relatedIdeas: [],
    relationTypes: [],
    pathCount: 0,
    graphTimeMs: 0,
  };

  try {
    const seedIdeas = await findSeedIdeas(query, context, CONFIG.MAX_SEED_IDEAS);

    if (seedIdeas.length > 0) {
      // Step 2: Traverse graph from seed ideas
      const graphIdeas: GraphRelatedIdea[] = [];
      const seenIds = new Set(seedIdeas.map(s => s.id));
      const relationTypes = new Set<string>();
      let totalPaths = 0;

      for (const seed of seedIdeas) {
        // Get direct relationships
        const relations = await getRelationships(seed.id);
        for (const rel of relations) {
          if (rel.strength >= CONFIG.MIN_STRENGTH && !seenIds.has(rel.targetId)) {
            seenIds.add(rel.targetId);
            relationTypes.add(rel.relationType);
            graphIdeas.push({
              id: rel.targetId,
              title: '', // Will be enriched later
              summary: '',
              relation: rel.relationType,
              strength: rel.strength,
              hops: 1,
            });
          }
        }

        // Get multi-hop paths
        if (maxHops > 1) {
          const paths = await multiHopSearch(seed.id, maxHops);
          totalPaths += paths.length;

          for (const path of paths) {
            if (path.path.length > 1) {
              const lastId = path.path[path.path.length - 1];
              const lastIdea = path.ideas.find(i => i.id === lastId);
              if (!seenIds.has(lastId)) {
                seenIds.add(lastId);
                graphIdeas.push({
                  id: lastId,
                  title: lastIdea?.title || '',
                  summary: '',
                  relation: 'multi_hop',
                  strength: 1.0 / path.path.length, // Strength inversely proportional to hops
                  hops: path.path.length,
                });
              }
            }
          }
        }

        // Get suggested (unlinked but similar) connections
        const suggestions = await getSuggestedConnections(seed.id);
        for (const sug of suggestions.slice(0, 2)) {
          if (!seenIds.has(sug.id)) {
            seenIds.add(sug.id);
            graphIdeas.push({
              id: sug.id,
              title: sug.title,
              summary: sug.summary,
              relation: 'suggested_connection',
              strength: sug.similarity,
              hops: 0,
            });
          }
        }
      }

      // Enrich graph ideas with titles/summaries if missing
      const idsToEnrich = graphIdeas.filter(g => !g.title).map(g => g.id);
      if (idsToEnrich.length > 0) {
        const enriched = await queryContext(context, `
          SELECT id, title, summary FROM ideas WHERE id = ANY($1::uuid[])
        `, [idsToEnrich]);

        const enrichMap = new Map(enriched.rows.map((r: { id: string; title: string; summary: string }) => [r.id, r]));
        for (const gi of graphIdeas) {
          const data = enrichMap.get(gi.id);
          if (data) {
            gi.title = data.title;
            gi.summary = data.summary || '';
          }
        }
      }

      // Sort by strength, limit
      graphIdeas.sort((a, b) => b.strength - a.strength);

      graphContext = {
        relatedIdeas: graphIdeas.slice(0, CONFIG.MAX_GRAPH_CONTEXT),
        relationTypes: Array.from(relationTypes),
        pathCount: totalPaths,
        graphTimeMs: Date.now() - graphStart,
      };
    }
  } catch (error) {
    logger.warn('Graph traversal failed, falling back to standard RAG', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // Step 3: Run standard Enhanced RAG
  const ragResult = await enhancedRAG.retrieve(query, context, {
    maxResults: options?.maxResults,
  });

  // Step 4: Boost results that appear in graph context
  const graphIdSet = new Set(graphContext.relatedIdeas.map(g => g.id));
  const boostedResults = ragResult.results.map(result => {
    if (graphIdSet.has(result.id)) {
      return {
        ...result,
        score: Math.min(result.score * CONFIG.GRAPH_PROXIMITY_BOOST, 1.0),
        sources: [...result.sources, 'agentic' as const], // Mark as graph-boosted
      };
    }
    return result;
  });

  // Step 5: Add graph-only results that RAG missed
  const ragIdSet = new Set(boostedResults.map(r => r.id));
  const graphOnlyResults: EnhancedResult[] = graphContext.relatedIdeas
    .filter(g => !ragIdSet.has(g.id) && g.title)
    .slice(0, 3)
    .map(g => ({
      id: g.id,
      title: g.title,
      summary: g.summary,
      score: g.strength * 0.5, // Lower score since not found by RAG
      scores: { agentic: g.strength },
      sources: ['agentic' as const],
      relevanceReason: `Graph: ${g.relation} (${g.hops} hops)`,
    }));

  const finalResults = [...boostedResults, ...graphOnlyResults]
    .sort((a, b) => b.score - a.score)
    .slice(0, options?.maxResults ?? 10);

  // Recalculate confidence
  const graphEnriched = graphContext.relatedIdeas.length > 0;
  let confidence = ragResult.confidence;
  if (graphEnriched) {
    confidence = Math.min(confidence * 1.1, 1.0); // Boost for graph support
  }

  const totalTime = Date.now() - startTime;

  logger.info('GraphRAG retrieval complete', {
    resultCount: finalResults.length,
    graphRelated: graphContext.relatedIdeas.length,
    graphPaths: graphContext.pathCount,
    confidence,
    totalTimeMs: totalTime,
    graphTimeMs: graphContext.graphTimeMs,
  });

  return {
    ...ragResult,
    results: finalResults,
    confidence,
    methodsUsed: [...ragResult.methodsUsed, ...(graphEnriched ? ['graph'] : [])],
    timing: {
      ...ragResult.timing,
      total: totalTime,
    },
    graphContext,
    graphEnriched,
  };
}

// ===========================================
// Helper Functions
// ===========================================

/**
 * Find seed ideas for graph traversal using keyword search
 */
async function findSeedIdeas(
  query: string,
  context: AIContext,
  limit: number
): Promise<Array<{ id: string; title: string }>> {
  try {
    // Extract key terms from query for keyword matching
    const keywords = query
      .toLowerCase()
      .split(/\s+/)
      .filter(w => w.length > 3)
      .slice(0, 5);

    if (keywords.length === 0) {return [];}

    const searchPattern = keywords.join(' | ');

    const result = await queryContext(context, `
      SELECT id, title
      FROM ideas
      WHERE is_archived = false
        AND (
          to_tsvector('german', title || ' ' || COALESCE(summary, '')) @@ to_tsquery('german', $1)
          OR title ILIKE ANY($2::text[])
        )
      LIMIT $3
    `, [searchPattern, keywords.map(k => `%${k}%`), limit]);

    return result.rows;
  } catch (error) {
    logger.debug('Seed idea search failed', { error: error instanceof Error ? error.message : String(error) });
    return [];
  }
}

/**
 * Build graph context string for LLM system prompt enrichment
 */
export function buildGraphContextPrompt(graphContext: GraphContext): string {
  if (graphContext.relatedIdeas.length === 0) {return '';}

  const lines = graphContext.relatedIdeas.map(idea => {
    const relLabel = idea.relation.replace(/_/g, ' ');
    return `- "${idea.title}" (${relLabel}, Staerke: ${(idea.strength * 100).toFixed(0)}%)${idea.summary ? `: ${idea.summary.substring(0, 100)}` : ''}`;
  });

  return `\n\nVerwandte Konzepte aus dem Wissensgraph:\n${lines.join('\n')}`;
}
