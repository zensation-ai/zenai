/**
 * Phase 58: Community Summarizer
 *
 * Builds hierarchical summaries for detected graph communities
 * using the GraphRAG pattern. Community summaries enable efficient
 * global search over the knowledge graph.
 *
 * @module services/knowledge-graph/community-summarizer
 */

import Anthropic from '@anthropic-ai/sdk';
import { AIContext, queryContext } from '../../utils/database-context';
import { generateEmbedding } from '../ai';
import { detectCommunities } from './graph-reasoning';
import { logger } from '../../utils/logger';

// ===========================================
// Types
// ===========================================

export interface CommunitySummary {
  communityId: string;
  level: number;
  summary: string;
  keyThemes: string[];
  entityCount: number;
  edgeCount: number;
  entityNames: string[];
  updatedAt: Date;
}

// ===========================================
// Community Summarizer
// ===========================================

export class CommunitySummarizer {
  private anthropic: Anthropic;

  constructor() {
    this.anthropic = new Anthropic();
  }

  /**
   * Build community summaries for all detected communities.
   * Uses detectCommunities from graph-reasoning, then fetches entities
   * for each community and generates summaries via Claude.
   */
  async buildCommunitySummaries(context: AIContext): Promise<CommunitySummary[]> {
    // Step 1: Detect communities
    const communities = await detectCommunities(context, { minSize: 2, minStrength: 0.3 });

    if (communities.length === 0) {
      logger.info('No communities found for summarization', { context });
      return [];
    }

    const summaries: CommunitySummary[] = [];

    for (const community of communities) {
      try {
        // Step 2: Fetch entities and relations for this community
        const entitiesResult = await queryContext(
          context,
          `SELECT id, name, type, description, importance
           FROM knowledge_entities
           WHERE id = ANY($1::uuid[])
           ORDER BY importance DESC`,
          [community.memberIds]
        );

        const relationsResult = await queryContext(
          context,
          `SELECT er.source_entity_id, er.target_entity_id, er.relation_type, er.description, er.strength
           FROM entity_relations er
           WHERE er.source_entity_id = ANY($1::uuid[])
             AND er.target_entity_id = ANY($1::uuid[])`,
          [community.memberIds]
        );

        const entities = entitiesResult.rows;
        const relations = relationsResult.rows;

        if (entities.length === 0) {continue;}

        // Step 3: Generate summary via Claude
        const { summary, keyThemes } = await this.summarizeCommunity(entities, relations);

        // Step 4: Generate embedding for the summary
        const embedding = await generateEmbedding(summary);
        const embeddingStr = embedding.length > 0 ? `[${embedding.join(',')}]` : null;

        // Step 5: Store in database
        const entityNames = entities.map((e: Record<string, unknown>) => e.name as string);

        await queryContext(
          context,
          `INSERT INTO graph_communities_v2 (id, community_level, entity_ids, summary, summary_embedding, key_themes, entity_count, edge_count)
           VALUES ($1, 1, $2, $3, $4::vector, $5, $6, $7)
           ON CONFLICT (id) DO UPDATE SET
             entity_ids = EXCLUDED.entity_ids,
             summary = EXCLUDED.summary,
             summary_embedding = EXCLUDED.summary_embedding,
             key_themes = EXCLUDED.key_themes,
             entity_count = EXCLUDED.entity_count,
             edge_count = EXCLUDED.edge_count,
             updated_at = NOW()`,
          [
            community.id,
            community.memberIds,
            summary,
            embeddingStr,
            keyThemes,
            entities.length,
            relations.length,
          ]
        );

        summaries.push({
          communityId: community.id,
          level: 1,
          summary,
          keyThemes,
          entityCount: entities.length,
          edgeCount: relations.length,
          entityNames,
          updatedAt: new Date(),
        });
      } catch (error) {
        logger.warn('Community summarization failed', {
          communityId: community.id,
          error: error instanceof Error ? error.message : 'Unknown',
        });
      }
    }

    logger.info('Community summarization complete', {
      context,
      totalCommunities: communities.length,
      summarized: summaries.length,
    });

    return summaries;
  }

  /**
   * Get existing community summaries from the database
   */
  async getCommunitySummaries(context: AIContext): Promise<CommunitySummary[]> {
    try {
      const result = await queryContext(
        context,
        `SELECT gc.id, gc.community_level, gc.entity_ids, gc.summary, gc.key_themes,
                gc.entity_count, gc.edge_count, gc.updated_at
         FROM graph_communities_v2 gc
         ORDER BY gc.entity_count DESC`,
        []
      );

      const summaries: CommunitySummary[] = [];

      for (const row of result.rows) {
        // Fetch entity names for display
        const entityIds = row.entity_ids || [];
        let entityNames: string[] = [];

        if (entityIds.length > 0) {
          const namesResult = await queryContext(
            context,
            `SELECT name FROM knowledge_entities WHERE id = ANY($1::uuid[])`,
            [entityIds]
          );
          entityNames = namesResult.rows.map((r: Record<string, unknown>) => r.name as string);
        }

        summaries.push({
          communityId: row.id,
          level: row.community_level || 1,
          summary: row.summary,
          keyThemes: row.key_themes || [],
          entityCount: row.entity_count || 0,
          edgeCount: row.edge_count || 0,
          entityNames,
          updatedAt: new Date(row.updated_at),
        });
      }

      return summaries;
    } catch (error) {
      logger.error('Failed to get community summaries', error instanceof Error ? error : undefined);
      return [];
    }
  }

  /**
   * Search community summaries by vector similarity
   */
  async searchCommunitySummaries(
    query: string,
    context: AIContext,
    limit: number = 5
  ): Promise<CommunitySummary[]> {
    try {
      const embedding = await generateEmbedding(query);
      if (!embedding || embedding.length === 0) {return [];}

      const result = await queryContext(
        context,
        `SELECT gc.id, gc.community_level, gc.entity_ids, gc.summary, gc.key_themes,
                gc.entity_count, gc.edge_count, gc.updated_at,
                1 - (gc.summary_embedding <=> $1::vector) as similarity
         FROM graph_communities_v2 gc
         WHERE gc.summary_embedding IS NOT NULL
         ORDER BY gc.summary_embedding <=> $1::vector
         LIMIT $2`,
        [`[${embedding.join(',')}]`, limit]
      );

      return result.rows.map((row: Record<string, unknown>) => ({
        communityId: row.id as string,
        level: (row.community_level as number) || 1,
        summary: row.summary as string,
        keyThemes: (row.key_themes as string[]) || [],
        entityCount: (row.entity_count as number) || 0,
        edgeCount: (row.edge_count as number) || 0,
        entityNames: [], // Not fetched in search for performance
        updatedAt: new Date(row.updated_at as string),
      }));
    } catch (error) {
      logger.error('Community summary search failed', error instanceof Error ? error : undefined);
      return [];
    }
  }

  /**
   * Generate summary and key themes for a community
   */
  private async summarizeCommunity(
    entities: Record<string, unknown>[],
    relations: Record<string, unknown>[]
  ): Promise<{ summary: string; keyThemes: string[] }> {
    try {
      const entityDescriptions = entities
        .map(e => `- ${e.name} (${e.type}): ${e.description || 'No description'}`)
        .join('\n');

      const entityNameMap = new Map(entities.map(e => [e.id as string, e.name as string]));

      const relationDescriptions = relations
        .map(r => {
          const src = entityNameMap.get(r.source_entity_id as string) || 'unknown';
          const tgt = entityNameMap.get(r.target_entity_id as string) || 'unknown';
          return `- ${src} --[${r.relation_type}]--> ${tgt}${r.description ? ` (${r.description})` : ''}`;
        })
        .join('\n');

      const response = await this.anthropic.messages.create({
        model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: `Summarize this knowledge graph community. Provide a concise paragraph describing what this group of entities is about, and identify 3-5 key themes.

ENTITIES:
${entityDescriptions}

RELATIONS:
${relationDescriptions || 'No relations'}

Return JSON: { "summary": "...", "keyThemes": ["theme1", "theme2", ...] }`,
          },
        ],
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        return { summary: this.fallbackSummary(entities), keyThemes: [] };
      }

      try {
        const parsed = JSON.parse(content.text);
        return {
          summary: typeof parsed.summary === 'string' ? parsed.summary : this.fallbackSummary(entities),
          keyThemes: Array.isArray(parsed.keyThemes) ? parsed.keyThemes.filter((t: unknown) => typeof t === 'string') : [],
        };
      } catch {
        // Try extracting JSON from text
        const match = content.text.match(/\{[\s\S]*\}/);
        if (match) {
          try {
            const parsed = JSON.parse(match[0]);
            return {
              summary: typeof parsed.summary === 'string' ? parsed.summary : this.fallbackSummary(entities),
              keyThemes: Array.isArray(parsed.keyThemes) ? parsed.keyThemes.filter((t: unknown) => typeof t === 'string') : [],
            };
          } catch {
            // Fall through
          }
        }
        return { summary: this.fallbackSummary(entities), keyThemes: [] };
      }
    } catch (error) {
      logger.warn('Community summarization via Claude failed', {
        error: error instanceof Error ? error.message : 'Unknown',
      });
      return { summary: this.fallbackSummary(entities), keyThemes: [] };
    }
  }

  /**
   * Refresh community summaries older than maxAgeHours
   */
  async refreshStaleCommunitySummaries(context: AIContext, maxAgeHours: number = 24): Promise<number> {
    try {
      // Delete stale summaries
      const deleteResult = await queryContext(
        context,
        `DELETE FROM graph_communities_v2
         WHERE updated_at < NOW() - INTERVAL '1 hour' * $1
         RETURNING id`,
        [maxAgeHours]
      );

      const deletedCount = deleteResult.rows.length;

      if (deletedCount > 0) {
        logger.info('Deleted stale community summaries', { context, count: deletedCount });
      }

      // Rebuild
      const newSummaries = await this.buildCommunitySummaries(context);
      return newSummaries.length;
    } catch (error) {
      logger.error('Community refresh failed', error instanceof Error ? error : undefined);
      return 0;
    }
  }

  /**
   * Fallback summary when Claude is unavailable
   */
  private fallbackSummary(entities: Record<string, unknown>[]): string {
    const names = entities.slice(0, 5).map(e => e.name).join(', ');
    return `A community of ${entities.length} entities including: ${names}.`;
  }
}

// ===========================================
// Singleton Export
// ===========================================

export const communitySummarizer = new CommunitySummarizer();
