/**
 * Phase 58: Hybrid Retriever
 *
 * 4-Strategy Hybrid Retrieval combining:
 * - Vector Search (pgvector semantic search on ideas)
 * - Graph Traversal (entity-based 2-hop traversal)
 * - Community Search (GraphRAG community summaries)
 * - BM25 Search (PostgreSQL full-text search)
 *
 * Results are merged, deduplicated, and reranked.
 *
 * @module services/knowledge-graph/hybrid-retriever
 */

import { AIContext, queryContext } from '../../utils/database-context';
import { generateEmbedding } from '../ai';
import { hybridRerank } from '../cross-encoder-rerank';
import { communitySummarizer } from './community-summarizer';
import { logger } from '../../utils/logger';

// ===========================================
// Types
// ===========================================

export interface HybridRetrievalResult {
  id: string;
  title: string;
  content: string;
  score: number;
  source: 'vector' | 'graph' | 'community' | 'bm25';
  metadata?: Record<string, unknown>;
}

export interface HybridRetrievalOptions {
  maxResults?: number;
  enableVector?: boolean;
  enableGraph?: boolean;
  enableCommunity?: boolean;
  enableBM25?: boolean;
  minScore?: number;
}

// ===========================================
// Default Configuration
// ===========================================

const DEFAULT_OPTIONS: Required<HybridRetrievalOptions> = {
  maxResults: 10,
  enableVector: true,
  enableGraph: true,
  enableCommunity: true,
  enableBM25: true,
  minScore: 0.1,
};

// ===========================================
// Hybrid Retriever
// ===========================================

export class HybridRetriever {
  /**
   * Main retrieval method: runs 4 strategies in parallel, merges, deduplicates, reranks.
   */
  async retrieve(
    query: string,
    context: AIContext,
    options?: HybridRetrievalOptions
  ): Promise<HybridRetrievalResult[]> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const startTime = Date.now();

    // Run enabled strategies in parallel
    const strategies: Promise<HybridRetrievalResult[]>[] = [];
    const strategyNames: string[] = [];

    const perStrategyLimit = Math.ceil(opts.maxResults * 1.5);

    if (opts.enableVector) {
      strategies.push(
        this.vectorSearch(query, context, perStrategyLimit).catch(err => {
          logger.warn('Vector search failed', { error: err instanceof Error ? err.message : 'Unknown' });
          return [];
        })
      );
      strategyNames.push('vector');
    }

    if (opts.enableGraph) {
      strategies.push(
        this.graphTraversal(query, context, perStrategyLimit).catch(err => {
          logger.warn('Graph traversal failed', { error: err instanceof Error ? err.message : 'Unknown' });
          return [];
        })
      );
      strategyNames.push('graph');
    }

    if (opts.enableCommunity) {
      strategies.push(
        this.communitySearch(query, context, perStrategyLimit).catch(err => {
          logger.warn('Community search failed', { error: err instanceof Error ? err.message : 'Unknown' });
          return [];
        })
      );
      strategyNames.push('community');
    }

    if (opts.enableBM25) {
      strategies.push(
        this.bm25Search(query, context, perStrategyLimit).catch(err => {
          logger.warn('BM25 search failed', { error: err instanceof Error ? err.message : 'Unknown' });
          return [];
        })
      );
      strategyNames.push('bm25');
    }

    const allResults = await Promise.all(strategies);

    // Merge and deduplicate
    let merged = this.mergeResults(allResults);

    // Filter by minimum score
    merged = merged.filter(r => r.score >= opts.minScore);

    // Rerank if we have results
    if (merged.length > 0) {
      merged = await this.rerank(query, merged);
    }

    // Limit final results
    merged = merged.slice(0, opts.maxResults);

    const duration = Date.now() - startTime;
    logger.info('Hybrid retrieval complete', {
      context,
      strategies: strategyNames,
      totalResults: merged.length,
      duration_ms: duration,
    });

    return merged;
  }

  // ===========================================
  // Strategy: Vector Search
  // ===========================================

  private async vectorSearch(
    query: string,
    context: AIContext,
    limit: number
  ): Promise<HybridRetrievalResult[]> {
    const embedding = await generateEmbedding(query);
    if (!embedding || embedding.length === 0) return [];

    const result = await queryContext(
      context,
      `SELECT id, title, COALESCE(summary, '') as content,
              1 - (embedding <=> $1::vector) as similarity
       FROM ideas
       WHERE is_archived = FALSE
         AND embedding IS NOT NULL
       ORDER BY embedding <=> $1::vector
       LIMIT $2`,
      [`[${embedding.join(',')}]`, limit]
    );

    return result.rows.map((row: Record<string, unknown>) => ({
      id: row.id as string,
      title: row.title as string,
      content: row.content as string,
      score: parseFloat(row.similarity as string) || 0,
      source: 'vector' as const,
    }));
  }

  // ===========================================
  // Strategy: Graph Traversal
  // ===========================================

  private async graphTraversal(
    query: string,
    context: AIContext,
    limit: number
  ): Promise<HybridRetrievalResult[]> {
    // Step 1: Extract entities from query
    const queryEntities = await this.extractQueryEntities(query);
    if (queryEntities.length === 0) return [];

    // Step 2: Find matching knowledge_entities
    const matchingEntities = await queryContext(
      context,
      `SELECT id, name FROM knowledge_entities
       WHERE LOWER(name) = ANY($1::text[])
       LIMIT 10`,
      [queryEntities.map(e => e.toLowerCase())]
    );

    if (matchingEntities.rows.length === 0) {
      // Fallback: try fuzzy match
      const fuzzyResult = await queryContext(
        context,
        `SELECT id, name FROM knowledge_entities
         WHERE LOWER(name) LIKE ANY($1::text[])
         LIMIT 10`,
        [queryEntities.map(e => `%${e.toLowerCase()}%`)]
      );
      if (fuzzyResult.rows.length === 0) return [];
      matchingEntities.rows.push(...fuzzyResult.rows);
    }

    const entityIds = matchingEntities.rows.map((r: Record<string, unknown>) => r.id);

    // Step 3: 2-hop traversal to find connected ideas
    const result = await queryContext(
      context,
      `WITH direct_entities AS (
         SELECT UNNEST($1::uuid[]) as entity_id
       ),
       connected_entities AS (
         SELECT DISTINCT target_entity_id as entity_id, strength
         FROM entity_relations
         WHERE source_entity_id = ANY($1::uuid[])
         UNION
         SELECT DISTINCT source_entity_id as entity_id, strength
         FROM entity_relations
         WHERE target_entity_id = ANY($1::uuid[])
       ),
       all_entity_ids AS (
         SELECT entity_id FROM direct_entities
         UNION
         SELECT entity_id FROM connected_entities
       ),
       connected_ideas AS (
         SELECT DISTINCT UNNEST(ke.source_ids) as idea_id,
                ke.importance::float / 10.0 as relevance
         FROM knowledge_entities ke
         WHERE ke.id IN (SELECT entity_id FROM all_entity_ids)
           AND ke.source_ids IS NOT NULL
           AND array_length(ke.source_ids, 1) > 0
       )
       SELECT i.id, i.title, COALESCE(i.summary, '') as content,
              MAX(ci.relevance) as score
       FROM ideas i
       JOIN connected_ideas ci ON i.id = ci.idea_id
       WHERE i.is_archived = FALSE
       GROUP BY i.id, i.title, i.summary
       ORDER BY MAX(ci.relevance) DESC
       LIMIT $2`,
      [entityIds, limit]
    );

    return result.rows.map((row: Record<string, unknown>) => ({
      id: row.id as string,
      title: row.title as string,
      content: row.content as string,
      score: parseFloat(row.score as string) || 0.3,
      source: 'graph' as const,
      metadata: { traversalType: '2-hop', matchedEntities: entityIds.length },
    }));
  }

  // ===========================================
  // Strategy: Community Search
  // ===========================================

  private async communitySearch(
    query: string,
    context: AIContext,
    limit: number
  ): Promise<HybridRetrievalResult[]> {
    const summaries = await communitySummarizer.searchCommunitySummaries(query, context, limit);

    return summaries.map((s, idx) => ({
      id: s.communityId,
      title: `Community: ${s.keyThemes.slice(0, 3).join(', ') || 'Unnamed'}`,
      content: s.summary,
      score: Math.max(0.3, 1 - idx * 0.1), // Decay by rank
      source: 'community' as const,
      metadata: { entityCount: s.entityCount, keyThemes: s.keyThemes },
    }));
  }

  // ===========================================
  // Strategy: BM25 Full-Text Search
  // ===========================================

  private async bm25Search(
    query: string,
    context: AIContext,
    limit: number
  ): Promise<HybridRetrievalResult[]> {
    // Sanitize query for PostgreSQL ts_query
    const sanitized = query.replace(/[^\w\s]/g, ' ').trim();
    if (!sanitized) return [];

    // Split into words and join with & for AND search
    const tsQuery = sanitized
      .split(/\s+/)
      .filter(w => w.length > 1)
      .map(w => `${w}:*`)
      .join(' & ');

    if (!tsQuery) return [];

    const result = await queryContext(
      context,
      `SELECT id, title, COALESCE(summary, '') as content,
              ts_rank(
                to_tsvector('german', COALESCE(title, '') || ' ' || COALESCE(summary, '') || ' ' || COALESCE(raw_content, '')),
                to_tsquery('german', $1)
              ) as rank
       FROM ideas
       WHERE is_archived = FALSE
         AND to_tsvector('german', COALESCE(title, '') || ' ' || COALESCE(summary, '') || ' ' || COALESCE(raw_content, ''))
             @@ to_tsquery('german', $1)
       ORDER BY rank DESC
       LIMIT $2`,
      [tsQuery, limit]
    );

    // Normalize BM25 scores to 0-1 range
    const maxRank = result.rows.length > 0 ? Math.max(...result.rows.map((r: Record<string, unknown>) => parseFloat(r.rank as string) || 0)) : 1;

    return result.rows.map((row: Record<string, unknown>) => ({
      id: row.id as string,
      title: row.title as string,
      content: row.content as string,
      score: maxRank > 0 ? (parseFloat(row.rank as string) || 0) / maxRank : 0,
      source: 'bm25' as const,
    }));
  }

  // ===========================================
  // Merge & Deduplicate
  // ===========================================

  /**
   * Merge results from all strategies, deduplicate by ID, keep highest score per source
   */
  mergeResults(allResults: HybridRetrievalResult[][]): HybridRetrievalResult[] {
    const merged = new Map<string, HybridRetrievalResult>();

    // Weight factors per source
    const sourceWeights: Record<string, number> = {
      vector: 0.35,
      graph: 0.30,
      community: 0.15,
      bm25: 0.20,
    };

    for (const results of allResults) {
      for (const result of results) {
        const existing = merged.get(result.id);
        if (existing) {
          // Boost for appearing in multiple strategies
          const additionalScore = result.score * (sourceWeights[result.source] || 0.2);
          existing.score = Math.min(existing.score + additionalScore, 1.0);
          // Keep the longer content
          if (result.content.length > existing.content.length) {
            existing.content = result.content;
          }
        } else {
          const weight = sourceWeights[result.source] || 0.2;
          merged.set(result.id, {
            ...result,
            score: result.score * weight,
          });
        }
      }
    }

    return Array.from(merged.values()).sort((a, b) => b.score - a.score);
  }

  // ===========================================
  // Rerank
  // ===========================================

  /**
   * Rerank results using the existing cross-encoder reranker
   */
  private async rerank(
    query: string,
    results: HybridRetrievalResult[]
  ): Promise<HybridRetrievalResult[]> {
    try {
      const reranked = await hybridRerank(
        query,
        results.map(r => ({
          id: r.id,
          title: r.title,
          summary: r.content,
          content: r.content,
          score: r.score,
          strategy: 'hybrid' as const,
        })),
        { crossEncodeTop: Math.min(results.length, 10), minRelevance: 0.1 }
      );

      // Map back reranked scores
      const rerankedMap = new Map(reranked.map(r => [r.id, r]));

      return results
        .map(result => {
          const rerankedResult = rerankedMap.get(result.id);
          if (rerankedResult) {
            return {
              ...result,
              score: result.score * 0.3 + rerankedResult.relevanceScore * 0.7,
            };
          }
          return result;
        })
        .sort((a, b) => b.score - a.score);
    } catch (error) {
      logger.warn('Reranking failed, using original order', {
        error: error instanceof Error ? error.message : 'Unknown',
      });
      return results;
    }
  }

  // ===========================================
  // Entity Extraction from Query
  // ===========================================

  /**
   * Simple entity extraction from query (keyword-based, no LLM needed)
   */
  private async extractQueryEntities(query: string): Promise<string[]> {
    // Split query into potential entity names (capitalize-aware + multi-word)
    const words = query.split(/\s+/);
    const entities: string[] = [];

    // Capitalized words are likely entities
    for (const word of words) {
      const clean = word.replace(/[^\w]/g, '');
      if (clean.length >= 2 && /^[A-Z]/.test(clean)) {
        entities.push(clean);
      }
    }

    // Also try the full query and significant phrases
    if (entities.length === 0) {
      // Fall back to longer words as potential entities
      for (const word of words) {
        const clean = word.replace(/[^\w]/g, '');
        if (clean.length >= 4) {
          entities.push(clean);
        }
      }
    }

    return entities.slice(0, 10);
  }
}

// ===========================================
// Singleton Export
// ===========================================

export const hybridRetriever = new HybridRetriever();
