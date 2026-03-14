/**
 * Phase 59: Memory BM25 Full-Text Search
 *
 * PostgreSQL-native full-text search using ts_rank + to_tsvector
 * for the learned_facts table. Supports German/English configs
 * and hybrid search combining BM25 with semantic (vector) search
 * via Reciprocal Rank Fusion (RRF).
 *
 * @module services/memory/memory-bm25
 */

import { AIContext, queryContext } from '../../utils/database-context';
import { generateEmbedding } from '../ai';
import { logger } from '../../utils/logger';

// ===========================================
// Types
// ===========================================

export interface BM25Result {
  id: string;
  content: string;
  factType: string;
  confidence: number;
  rank: number;
  createdAt: Date;
}

export interface HybridResult extends BM25Result {
  rrfScore: number;
  source: 'bm25' | 'semantic' | 'both';
}

// ===========================================
// MemoryBM25 Class
// ===========================================

export class MemoryBM25 {
  /**
   * Full-text search using PostgreSQL ts_rank
   * Uses German config as primary, English as fallback
   */
  async search(
    query: string,
    context: AIContext,
    limit: number = 10
  ): Promise<BM25Result[]> {
    if (!query || query.trim().length === 0) {
      return [];
    }

    const tsQuery = this.buildTsQuery(query);

    const result = await queryContext(
      context,
      `SELECT id, content, fact_type, confidence, created_at,
              ts_rank(
                COALESCE(search_vector, to_tsvector('german', COALESCE(content, ''))),
                to_tsquery('german', $1)
              ) +
              ts_rank(
                COALESCE(search_vector, to_tsvector('english', COALESCE(content, ''))),
                to_tsquery('english', $1)
              ) AS rank
       FROM learned_facts
       WHERE
         COALESCE(search_vector, to_tsvector('german', COALESCE(content, '')))
           @@ to_tsquery('german', $1)
         OR
         COALESCE(search_vector, to_tsvector('english', COALESCE(content, '')))
           @@ to_tsquery('english', $1)
       ORDER BY rank DESC
       LIMIT $2`,
      [tsQuery, limit]
    );

    return result.rows.map((row: Record<string, unknown>, index: number) => ({
      id: row.id as string,
      content: row.content as string,
      factType: row.fact_type as string,
      confidence: row.confidence as number,
      rank: index + 1,
      createdAt: row.created_at as Date,
    }));
  }

  /**
   * Hybrid search: combine BM25 + semantic vector search
   * using Reciprocal Rank Fusion (RRF)
   *
   * RRF score = sum(1 / (k + rank_i)) for each ranking system
   * k = 60 (standard RRF constant)
   */
  async hybridSearch(
    query: string,
    context: AIContext,
    limit: number = 10
  ): Promise<HybridResult[]> {
    if (!query || query.trim().length === 0) {
      return [];
    }

    const k = 60; // RRF constant

    // Run BM25 and semantic search in parallel
    const [bm25Results, semanticResults] = await Promise.all([
      this.search(query, context, limit * 2),
      this.semanticSearch(query, context, limit * 2),
    ]);

    // Build RRF score map
    const scoreMap = new Map<string, {
      bm25Rank: number | null;
      semanticRank: number | null;
      rrfScore: number;
      data: BM25Result;
    }>();

    // Add BM25 results
    for (let i = 0; i < bm25Results.length; i++) {
      const result = bm25Results[i];
      const rrfScore = 1 / (k + i + 1);
      scoreMap.set(result.id, {
        bm25Rank: i + 1,
        semanticRank: null,
        rrfScore,
        data: result,
      });
    }

    // Add semantic results
    for (let i = 0; i < semanticResults.length; i++) {
      const result = semanticResults[i];
      const rrfScore = 1 / (k + i + 1);
      const existing = scoreMap.get(result.id);
      if (existing) {
        existing.semanticRank = i + 1;
        existing.rrfScore += rrfScore;
      } else {
        scoreMap.set(result.id, {
          bm25Rank: null,
          semanticRank: i + 1,
          rrfScore,
          data: result,
        });
      }
    }

    // Sort by RRF score and return
    const merged = Array.from(scoreMap.values())
      .sort((a, b) => b.rrfScore - a.rrfScore)
      .slice(0, limit);

    return merged.map((item, index) => ({
      ...item.data,
      rank: index + 1,
      rrfScore: item.rrfScore,
      source: item.bm25Rank !== null && item.semanticRank !== null
        ? 'both' as const
        : item.bm25Rank !== null
          ? 'bm25' as const
          : 'semantic' as const,
    }));
  }

  /**
   * Semantic vector search on learned_facts
   */
  private async semanticSearch(
    query: string,
    context: AIContext,
    limit: number
  ): Promise<BM25Result[]> {
    let embedding: number[];
    try {
      embedding = await generateEmbedding(query);
    } catch (err) {
      logger.debug('Embedding generation failed for semantic search', {
        error: err instanceof Error ? err.message : String(err),
      });
      return [];
    }

    const result = await queryContext(
      context,
      `SELECT id, content, fact_type, confidence, created_at
       FROM learned_facts
       WHERE embedding IS NOT NULL
       ORDER BY embedding <=> $1::vector
       LIMIT $2`,
      [JSON.stringify(embedding), limit]
    );

    return result.rows.map((row: Record<string, unknown>, index: number) => ({
      id: row.id as string,
      content: row.content as string,
      factType: row.fact_type as string,
      confidence: row.confidence as number,
      rank: index + 1,
      createdAt: row.created_at as Date,
    }));
  }

  /**
   * Build a tsquery string from user input
   * Joins words with & (AND) operator
   */
  private buildTsQuery(query: string): string {
    return query
      .trim()
      .split(/\s+/)
      .filter(word => word.length > 1)
      .map(word => word.replace(/[^a-zA-Z0-9äöüÄÖÜß]/g, ''))
      .filter(word => word.length > 0)
      .join(' & ');
  }
}

// Singleton export
export const memoryBM25 = new MemoryBM25();
