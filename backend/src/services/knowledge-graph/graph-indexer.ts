/**
 * Phase 58: Graph Indexer
 *
 * Background indexing job that processes ideas into the knowledge graph.
 * Extracts entities and relations from idea text and upserts them.
 *
 * @module services/knowledge-graph/graph-indexer
 */

import { AIContext, queryContext } from '../../utils/database-context';
import { graphBuilder, GraphExtractionResult } from './graph-builder';
import { logger } from '../../utils/logger';

// ===========================================
// Types
// ===========================================

export interface IndexingResult {
  processedCount: number;
  entitiesCreated: number;
  relationsCreated: number;
  errors: string[];
  duration_ms: number;
}

// ===========================================
// Graph Indexer
// ===========================================

export class GraphIndexer {
  private isRunning: boolean = false;

  /**
   * Index a single idea: extract entities/relations and upsert to graph
   */
  async indexIdea(ideaId: string, context: AIContext): Promise<GraphExtractionResult> {
    const result = await queryContext(
      context,
      `SELECT id, title, COALESCE(summary, '') as summary, COALESCE(raw_content, '') as raw_content
       FROM ideas
       WHERE id = $1 AND is_archived = FALSE`,
      [ideaId]
    );

    if (result.rows.length === 0) {
      return { entities: [], relations: [], entityCount: 0, relationCount: 0 };
    }

    const idea = result.rows[0];
    const text = `${idea.title}\n\n${idea.summary}\n\n${idea.raw_content}`.trim();

    if (!text || text.length < 10) {
      return { entities: [], relations: [], entityCount: 0, relationCount: 0 };
    }

    return graphBuilder.extractFromText(text, ideaId, context);
  }

  /**
   * Index a batch of ideas that haven't been indexed yet.
   * An idea is considered "not indexed" if its ID doesn't appear in
   * any knowledge_entities.source_ids array.
   */
  async indexBatch(
    context: AIContext,
    options?: { limit?: number; sinceHours?: number }
  ): Promise<IndexingResult> {
    if (this.isRunning) {
      return {
        processedCount: 0,
        entitiesCreated: 0,
        relationsCreated: 0,
        errors: ['Indexing already in progress'],
        duration_ms: 0,
      };
    }

    this.isRunning = true;
    const startTime = Date.now();
    const limit = options?.limit || 50;
    const sinceHours = options?.sinceHours;

    let processedCount = 0;
    let entitiesCreated = 0;
    let relationsCreated = 0;
    const errors: string[] = [];

    try {
      // Find ideas not yet indexed
      let sql = `
        SELECT i.id, i.title, COALESCE(i.summary, '') as summary, COALESCE(i.raw_content, '') as raw_content
        FROM ideas i
        WHERE i.is_archived = FALSE
          AND NOT EXISTS (
            SELECT 1 FROM knowledge_entities ke
            WHERE i.id = ANY(ke.source_ids)
          )`;

      const params: (string | number)[] = [];

      if (sinceHours) {
        sql += ` AND i.created_at >= NOW() - INTERVAL '1 hour' * $${params.length + 1}`;
        params.push(sinceHours);
      }

      sql += ` ORDER BY i.created_at DESC LIMIT $${params.length + 1}`;
      params.push(limit);

      const ideasResult = await queryContext(context, sql, params);

      for (const idea of ideasResult.rows) {
        try {
          const text = `${idea.title}\n\n${idea.summary}\n\n${idea.raw_content}`.trim();
          if (!text || text.length < 10) continue;

          const extraction = await graphBuilder.extractFromText(text, idea.id, context);
          processedCount++;
          entitiesCreated += extraction.entityCount;
          relationsCreated += extraction.relationCount;
        } catch (error) {
          const msg = `Failed to index idea ${idea.id}: ${error instanceof Error ? error.message : 'Unknown'}`;
          errors.push(msg);
          logger.warn(msg);
          // Continue processing other ideas
        }
      }

      const duration = Date.now() - startTime;

      logger.info('Batch indexing complete', {
        context,
        processedCount,
        entitiesCreated,
        relationsCreated,
        errors: errors.length,
        duration_ms: duration,
      });

      return {
        processedCount,
        entitiesCreated,
        relationsCreated,
        errors,
        duration_ms: duration,
      };
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Reindex all ideas (clear existing graph data first)
   */
  async reindexAll(context: AIContext): Promise<IndexingResult> {
    if (this.isRunning) {
      return {
        processedCount: 0,
        entitiesCreated: 0,
        relationsCreated: 0,
        errors: ['Indexing already in progress'],
        duration_ms: 0,
      };
    }

    this.isRunning = true;
    const startTime = Date.now();

    try {
      // Clear existing graph data
      await queryContext(context, `DELETE FROM entity_relations`, []);
      await queryContext(context, `DELETE FROM knowledge_entities`, []);
      await queryContext(context, `DELETE FROM graph_communities_v2`, []);

      logger.info('Cleared existing graph data for reindex', { context });
    } catch (error) {
      this.isRunning = false;
      return {
        processedCount: 0,
        entitiesCreated: 0,
        relationsCreated: 0,
        errors: [`Failed to clear graph data: ${error instanceof Error ? error.message : 'Unknown'}`],
        duration_ms: Date.now() - startTime,
      };
    }

    this.isRunning = false;

    // Now run normal batch indexing with high limit
    return this.indexBatch(context, { limit: 1000 });
  }

  /**
   * Get current indexing status
   */
  async getIndexingStatus(
    context: AIContext
  ): Promise<{ totalIdeas: number; indexedIdeas: number; lastIndexedAt: Date | null }> {
    try {
      const totalResult = await queryContext(
        context,
        `SELECT COUNT(*) as total FROM ideas WHERE is_archived = FALSE`,
        []
      );

      const indexedResult = await queryContext(
        context,
        `SELECT COUNT(DISTINCT idea_id) as indexed
         FROM (
           SELECT UNNEST(source_ids) as idea_id
           FROM knowledge_entities
           WHERE source_ids IS NOT NULL AND array_length(source_ids, 1) > 0
         ) t`,
        []
      );

      const lastResult = await queryContext(
        context,
        `SELECT MAX(updated_at) as last_indexed FROM knowledge_entities`,
        []
      );

      return {
        totalIdeas: parseInt(totalResult.rows[0]?.total, 10) || 0,
        indexedIdeas: parseInt(indexedResult.rows[0]?.indexed, 10) || 0,
        lastIndexedAt: lastResult.rows[0]?.last_indexed
          ? new Date(lastResult.rows[0].last_indexed)
          : null,
      };
    } catch (error) {
      logger.error('Failed to get indexing status', error instanceof Error ? error : undefined);
      return { totalIdeas: 0, indexedIdeas: 0, lastIndexedAt: null };
    }
  }

  /**
   * Check if indexing is currently running
   */
  isIndexing(): boolean {
    return this.isRunning;
  }
}

// ===========================================
// Singleton Export
// ===========================================

export const graphIndexer = new GraphIndexer();
