/**
 * Phase 59: Entity Resolver
 *
 * Links facts from long-term memory to knowledge graph entities.
 * Uses GraphBuilder (Phase 58) for entity extraction from fact text,
 * then creates memory_entity_links records.
 *
 * @module services/memory/entity-resolver
 */

import { AIContext, queryContext } from '../../utils/database-context';
import { GraphBuilder } from '../knowledge-graph/graph-builder';
import { logger } from '../../utils/logger';

// ===========================================
// Types
// ===========================================

export interface MemoryEntityLink {
  id: string;
  factId: string;
  entityId: string;
  linkType: string;
  confidence: number;
  createdAt: Date;
}

export interface LinkedEntity {
  entityId: string;
  entityName: string;
  entityType: string;
  linkType: string;
  confidence: number;
}

export interface LinkedFact {
  factId: string;
  content: string;
  factType: string;
  linkType: string;
  confidence: number;
}

// ===========================================
// EntityResolver Class
// ===========================================

export class EntityResolver {
  private graphBuilder: GraphBuilder;

  /** Pending facts queued for batch resolution */
  private pendingFacts: Array<{ context: AIContext; content: string }> = [];
  /** Timer for batch processing */
  private batchTimer: NodeJS.Timeout | null = null;
  /** Maximum batch size before forced flush */
  private static readonly BATCH_SIZE = 10;
  /** Delay before processing incomplete batch (ms) */
  private static readonly BATCH_DELAY_MS = 5000;

  constructor() {
    this.graphBuilder = new GraphBuilder();
  }

  /**
   * Queue a fact for batched entity resolution.
   * Facts are collected and processed in batches of 10 or every 5 seconds.
   */
  queueFactForResolution(context: AIContext, content: string): void {
    this.pendingFacts.push({ context, content });

    if (this.pendingFacts.length >= EntityResolver.BATCH_SIZE) {
      this.processBatch();
    } else if (!this.batchTimer) {
      this.batchTimer = setTimeout(() => this.processBatch(), EntityResolver.BATCH_DELAY_MS);
    }
  }

  /**
   * Process all pending facts in a batch.
   */
  private processBatch(): void {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    if (this.pendingFacts.length === 0) return;

    const batch = this.pendingFacts.splice(0);

    // Process each fact in the batch (fire-and-forget)
    for (const { context, content } of batch) {
      this.resolveFromFact(context, content).catch(err => {
        logger.debug('Batched entity resolution failed for fact', {
          error: err instanceof Error ? err.message : String(err),
          contentPreview: content.substring(0, 80),
        });
      });
    }
  }

  /**
   * Extract entities from a fact's content and link them to the knowledge graph.
   * Uses GraphBuilder to extract entities, then matches them against existing
   * knowledge_entities and creates memory_entity_links.
   */
  async resolveFromFact(
    context: AIContext,
    factContent: string
  ): Promise<MemoryEntityLink[]> {
    if (!factContent || factContent.trim().length < 10) {
      return [];
    }

    try {
      // Use GraphBuilder to extract entities from the fact text
      const extraction = await this.graphBuilder.extractFromText(
        factContent,
        '00000000-0000-0000-0000-000000000000', // placeholder source
        context
      );

      if (extraction.entities.length === 0) {
        logger.debug('No entities extracted from fact', {
          contentPreview: factContent.substring(0, 80),
        });
        return [];
      }

      // Find the fact ID by matching content
      const factResult = await queryContext(
        context,
        `SELECT id FROM learned_facts WHERE content = $1 LIMIT 1`,
        [factContent]
      );

      if (factResult.rows.length === 0) {
        // Try personalization_facts as fallback
        const pfResult = await queryContext(
          context,
          `SELECT id FROM personalization_facts WHERE content = $1 LIMIT 1`,
          [factContent]
        );
        if (pfResult.rows.length === 0) {
          logger.debug('Fact not found in database for entity resolution');
          return [];
        }
        return this.linkFactToEntities(
          context,
          pfResult.rows[0].id,
          extraction.entities.map(e => ({
            entityId: e.id || '',
            name: e.name,
            type: e.type,
          }))
        );
      }

      return this.linkFactToEntities(
        context,
        factResult.rows[0].id,
        extraction.entities.map(e => ({
          entityId: e.id || '',
          name: e.name,
          type: e.type,
        }))
      );
    } catch (error) {
      logger.debug('Entity resolution failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * Create memory_entity_links records for a fact and its entities.
   */
  async linkFactToEntities(
    context: AIContext,
    factId: string,
    entities: Array<{ entityId: string; name: string; type: string }>
  ): Promise<MemoryEntityLink[]> {
    const links: MemoryEntityLink[] = [];

    for (const entity of entities) {
      // Resolve entity ID if not provided - look up by name in knowledge_entities
      let entityId = entity.entityId;
      if (!entityId || entityId === '') {
        const entityResult = await queryContext(
          context,
          `SELECT id FROM knowledge_entities WHERE name = $1 LIMIT 1`,
          [entity.name]
        );
        if (entityResult.rows.length === 0) {
          continue; // Skip if entity not found
        }
        entityId = entityResult.rows[0].id;
      }

      try {
        const result = await queryContext(
          context,
          `INSERT INTO memory_entity_links (fact_id, entity_id, link_type, confidence)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (fact_id, entity_id) DO UPDATE SET
             confidence = GREATEST(memory_entity_links.confidence, $4)
           RETURNING id, fact_id, entity_id, link_type, confidence, created_at`,
          [factId, entityId, 'mentions', 0.8]
        );

        if (result.rows.length > 0) {
          const row = result.rows[0];
          links.push({
            id: row.id,
            factId: row.fact_id,
            entityId: row.entity_id,
            linkType: row.link_type,
            confidence: row.confidence,
            createdAt: row.created_at,
          });
        }
      } catch (err) {
        logger.debug('Failed to link fact to entity', {
          factId,
          entityId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    if (links.length > 0) {
      logger.info('Linked fact to entities', {
        factId,
        entityCount: links.length,
        context,
      });
    }

    return links;
  }

  /**
   * Get all entities linked to a fact
   */
  async getFactEntities(
    context: AIContext,
    factId: string
  ): Promise<LinkedEntity[]> {
    const result = await queryContext(
      context,
      `SELECT mel.entity_id, ke.name AS entity_name, ke.type AS entity_type,
              mel.link_type, mel.confidence
       FROM memory_entity_links mel
       JOIN knowledge_entities ke ON ke.id = mel.entity_id
       WHERE mel.fact_id = $1
       ORDER BY mel.confidence DESC`,
      [factId]
    );

    return result.rows.map((row: Record<string, unknown>) => ({
      entityId: row.entity_id as string,
      entityName: row.entity_name as string,
      entityType: row.entity_type as string,
      linkType: row.link_type as string,
      confidence: row.confidence as number,
    }));
  }

  /**
   * Get all facts linked to an entity
   */
  async getEntityFacts(
    context: AIContext,
    entityId: string
  ): Promise<LinkedFact[]> {
    // Try learned_facts first, then personalization_facts
    const result = await queryContext(
      context,
      `SELECT mel.fact_id, COALESCE(lf.content, pf.content) AS content,
              COALESCE(lf.fact_type, pf.fact_type) AS fact_type,
              mel.link_type, mel.confidence
       FROM memory_entity_links mel
       LEFT JOIN learned_facts lf ON lf.id = mel.fact_id
       LEFT JOIN personalization_facts pf ON pf.id = mel.fact_id
       WHERE mel.entity_id = $1
       ORDER BY mel.confidence DESC`,
      [entityId]
    );

    return result.rows
      .filter((row: Record<string, unknown>) => row.content !== null)
      .map((row: Record<string, unknown>) => ({
        factId: row.fact_id as string,
        content: row.content as string,
        factType: row.fact_type as string,
        linkType: row.link_type as string,
        confidence: row.confidence as number,
      }));
  }
}

// Singleton export
export const entityResolver = new EntityResolver();
