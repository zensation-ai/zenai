/**
 * Phase 58: Graph Builder
 *
 * Extracts entities and relations from text using Claude API,
 * resolves duplicates via embedding similarity, and upserts
 * the extracted graph into the database.
 *
 * @module services/knowledge-graph/graph-builder
 */

import Anthropic from '@anthropic-ai/sdk';
import { AIContext, queryContext } from '../../utils/database-context';
import { generateEmbedding } from '../ai';
import { logger } from '../../utils/logger';

// ===========================================
// Types
// ===========================================

export interface Entity {
  id?: string;
  name: string;
  type: 'person' | 'organization' | 'concept' | 'technology' | 'location' | 'event' | 'product';
  description: string;
  importance: number;
  aliases?: string[];
}

export interface Relation {
  source: string; // entity name
  target: string; // entity name
  type: 'supports' | 'contradicts' | 'causes' | 'requires' | 'part_of' | 'similar_to' | 'created_by' | 'used_by';
  description: string;
  strength: number;
}

export interface GraphExtractionResult {
  entities: Entity[];
  relations: Relation[];
  entityCount: number;
  relationCount: number;
}

// ===========================================
// Constants
// ===========================================

const ENTITY_TYPES = ['person', 'organization', 'concept', 'technology', 'location', 'event', 'product'] as const;
const RELATION_TYPES = ['supports', 'contradicts', 'causes', 'requires', 'part_of', 'similar_to', 'created_by', 'used_by'] as const;

const ENTITY_EXTRACTION_PROMPT = `Extract named entities from the following text.
Return a JSON array of entities with these fields:
- name: string (canonical name)
- type: one of "person", "organization", "concept", "technology", "location", "event", "product"
- description: string (brief description based on context)
- importance: number 1-10 (how central is this entity to the text)
- aliases: string[] (alternative names or abbreviations, if any)

Rules:
- Extract at most 15 entities
- Focus on the most important/central entities
- Use canonical forms for names (e.g., "TypeScript" not "TS")
- Description should be context-specific, not generic

Return ONLY a JSON array, no other text.`;

const RELATION_EXTRACTION_PROMPT = `Given these entities and the source text, extract relationships between them.
Return a JSON array of relations with these fields:
- source: string (entity name, must match an entity from the list)
- target: string (entity name, must match an entity from the list)
- type: one of "supports", "contradicts", "causes", "requires", "part_of", "similar_to", "created_by", "used_by"
- description: string (brief description of the relationship)
- strength: number 0-1 (how strong/certain is this relationship)

Rules:
- Only use entity names from the provided list
- At most 20 relations
- Strength 0.9+ = explicitly stated, 0.7-0.9 = strongly implied, 0.5-0.7 = loosely connected

Return ONLY a JSON array, no other text.`;

// ===========================================
// Entity Similarity Threshold
// ===========================================

const ENTITY_SIMILARITY_THRESHOLD = 0.92;

// ===========================================
// Graph Builder
// ===========================================

export class GraphBuilder {
  private anthropic: Anthropic;

  constructor() {
    this.anthropic = new Anthropic();
  }

  /**
   * Extract entities and relations from text, then upsert to graph
   */
  async extractFromText(text: string, sourceId: string, context: AIContext): Promise<GraphExtractionResult> {
    if (!text || !text.trim()) {
      return { entities: [], relations: [], entityCount: 0, relationCount: 0 };
    }

    // Truncate to avoid excessive token usage
    const truncated = text.substring(0, 8000);

    // Step 1: Extract entities
    const rawEntities = await this.extractEntities(truncated);
    if (rawEntities.length === 0) {
      return { entities: [], relations: [], entityCount: 0, relationCount: 0 };
    }

    // Step 2: Resolve duplicates against existing graph
    const resolvedEntities = await this.resolveEntities(rawEntities, context);

    // Step 3: Extract relations
    const relations = await this.extractRelations(truncated, resolvedEntities);

    // Step 4: Upsert to database
    const stats = await this.upsertToGraph(resolvedEntities, relations, sourceId, context);

    logger.info('Graph extraction complete', {
      context,
      sourceId,
      entities: resolvedEntities.length,
      relations: relations.length,
      created: stats.entitiesCreated,
      updated: stats.entitiesUpdated,
    });

    // Phase 125: Record co-activation for all entities that appeared together in the same text.
    // Entities co-occurring in the same source strengthen their Hebbian association.
    // Fire-and-forget: errors must not affect the extraction result.
    const entityIds = resolvedEntities.map(e => e.id).filter((id): id is string => Boolean(id));
    if (entityIds.length >= 2) {
      import('./hebbian-dynamics').then(({ recordCoactivation }) => {
        recordCoactivation(context, entityIds).catch(() => {});
      }).catch(() => {});
    }

    return {
      entities: resolvedEntities,
      relations,
      entityCount: resolvedEntities.length,
      relationCount: relations.length,
    };
  }

  /**
   * Extract entities from text using Claude
   */
  private async extractEntities(text: string): Promise<Entity[]> {
    try {
      const response = await this.anthropic.messages.create({
        model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        messages: [
          {
            role: 'user',
            content: `${ENTITY_EXTRACTION_PROMPT}\n\nTEXT:\n${text}`,
          },
        ],
      });

      const content = response.content[0];
      if (content.type !== 'text') return [];

      return this.parseEntitiesJSON(content.text);
    } catch (error) {
      logger.error('Entity extraction failed', error instanceof Error ? error : undefined);
      return [];
    }
  }

  /**
   * Extract relations from text using Claude
   */
  private async extractRelations(text: string, entities: Entity[]): Promise<Relation[]> {
    if (entities.length < 2) return [];

    try {
      const entityList = entities.map(e => `- ${e.name} (${e.type})`).join('\n');

      const response = await this.anthropic.messages.create({
        model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        messages: [
          {
            role: 'user',
            content: `ENTITIES:\n${entityList}\n\n${RELATION_EXTRACTION_PROMPT}\n\nTEXT:\n${text}`,
          },
        ],
      });

      const content = response.content[0];
      if (content.type !== 'text') return [];

      return this.parseRelationsJSON(content.text, entities);
    } catch (error) {
      logger.error('Relation extraction failed', error instanceof Error ? error : undefined);
      return [];
    }
  }

  /**
   * Resolve extracted entities against existing graph to avoid duplicates.
   * Uses embedding-based similarity: cosine > 0.92 = same entity.
   */
  async resolveEntities(entities: Entity[], context: AIContext): Promise<Entity[]> {
    const resolved: Entity[] = [];

    for (const entity of entities) {
      const existing = await this.findSimilarEntity(entity.name, context);
      if (existing && existing.similarity >= ENTITY_SIMILARITY_THRESHOLD) {
        // Merge with existing
        resolved.push({
          ...entity,
          id: existing.id,
          name: existing.name, // Use canonical name
        });
      } else {
        resolved.push(entity);
      }
    }

    return resolved;
  }

  /**
   * Find existing entity by embedding similarity
   */
  private async findSimilarEntity(
    name: string,
    context: AIContext
  ): Promise<{ id: string; name: string; similarity: number } | null> {
    try {
      const embedding = await generateEmbedding(name);
      if (!embedding || embedding.length === 0) return null;

      const result = await queryContext(
        context,
        `SELECT id, name, 1 - (embedding <=> $1::vector) as similarity
         FROM knowledge_entities
         WHERE embedding IS NOT NULL
         ORDER BY embedding <=> $1::vector
         LIMIT 1`,
        [`[${embedding.join(',')}]`]
      );

      if (result.rows.length === 0) return null;

      const row = result.rows[0];
      const similarity = parseFloat(row.similarity) || 0;

      return {
        id: row.id,
        name: row.name,
        similarity,
      };
    } catch (error) {
      logger.debug('Entity similarity search failed', {
        name,
        error: error instanceof Error ? error.message : 'Unknown',
      });
      return null;
    }
  }

  /**
   * Upsert entities and relations to the database
   */
  async upsertToGraph(
    entities: Entity[],
    relations: Relation[],
    sourceId: string,
    context: AIContext
  ): Promise<{ entitiesCreated: number; entitiesUpdated: number; relationsCreated: number }> {
    let entitiesCreated = 0;
    let entitiesUpdated = 0;
    let relationsCreated = 0;

    // Map entity names to IDs for relation creation
    const entityNameToId = new Map<string, string>();

    // Upsert entities
    for (const entity of entities) {
      try {
        const embedding = await generateEmbedding(entity.name + ': ' + entity.description);
        const embeddingStr = embedding.length > 0 ? `[${embedding.join(',')}]` : null;

        if (entity.id) {
          // Update existing entity
          await queryContext(
            context,
            `UPDATE knowledge_entities
             SET mention_count = mention_count + 1,
                 source_ids = array_append(
                   CASE WHEN $2::uuid = ANY(source_ids) THEN source_ids
                        ELSE source_ids END,
                   CASE WHEN $2::uuid = ANY(source_ids) THEN NULL
                        ELSE $2::uuid END
                 ),
                 updated_at = NOW()
             WHERE id = $1`,
            [entity.id, sourceId]
          );
          entityNameToId.set(entity.name, entity.id);
          entitiesUpdated++;
        } else {
          // Insert new entity
          const result = await queryContext(
            context,
            `INSERT INTO knowledge_entities (name, type, description, importance, embedding, source_ids, aliases, metadata)
             VALUES ($1, $2, $3, $4, $5::vector, ARRAY[$6::uuid], $7, $8)
             ON CONFLICT DO NOTHING
             RETURNING id`,
            [
              entity.name,
              entity.type,
              entity.description,
              entity.importance,
              embeddingStr,
              sourceId,
              entity.aliases || [],
              JSON.stringify({}),
            ]
          );

          if (result.rows.length > 0) {
            entityNameToId.set(entity.name, result.rows[0].id);
            entitiesCreated++;
          } else {
            // Entity already exists (name collision), try to fetch its ID
            const existing = await queryContext(
              context,
              `SELECT id FROM knowledge_entities WHERE name = $1 LIMIT 1`,
              [entity.name]
            );
            if (existing.rows.length > 0) {
              entityNameToId.set(entity.name, existing.rows[0].id);
              entitiesUpdated++;
            }
          }
        }
      } catch (error) {
        logger.warn('Entity upsert failed', {
          entity: entity.name,
          error: error instanceof Error ? error.message : 'Unknown',
        });
      }
    }

    // Upsert relations
    for (const relation of relations) {
      const sourceEntityId = entityNameToId.get(relation.source);
      const targetEntityId = entityNameToId.get(relation.target);

      if (!sourceEntityId || !targetEntityId) continue;
      if (sourceEntityId === targetEntityId) continue;

      try {
        await queryContext(
          context,
          `INSERT INTO entity_relations (source_entity_id, target_entity_id, relation_type, description, strength, source_ids)
           VALUES ($1, $2, $3, $4, $5, ARRAY[$6::uuid])
           ON CONFLICT (source_entity_id, target_entity_id, relation_type)
           DO UPDATE SET
             strength = GREATEST(entity_relations.strength, EXCLUDED.strength),
             description = COALESCE(EXCLUDED.description, entity_relations.description),
             source_ids = array_cat(entity_relations.source_ids, EXCLUDED.source_ids)`,
          [sourceEntityId, targetEntityId, relation.type, relation.description, relation.strength, sourceId]
        );
        relationsCreated++;
      } catch (error) {
        logger.warn('Relation upsert failed', {
          source: relation.source,
          target: relation.target,
          error: error instanceof Error ? error.message : 'Unknown',
        });
      }
    }

    return { entitiesCreated, entitiesUpdated, relationsCreated };
  }

  // ===========================================
  // JSON Parsing Helpers
  // ===========================================

  private parseEntitiesJSON(text: string): Entity[] {
    try {
      // Try direct parse first
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        return this.validateEntities(parsed);
      }
      return [];
    } catch {
      // Try to extract JSON array from text
      const match = text.match(/\[[\s\S]*\]/);
      if (match) {
        try {
          const parsed = JSON.parse(match[0]);
          if (Array.isArray(parsed)) {
            return this.validateEntities(parsed);
          }
        } catch {
          // Malformed JSON
        }
      }
      logger.warn('Failed to parse entities JSON', { textPreview: text.substring(0, 100) });
      return [];
    }
  }

  private parseRelationsJSON(text: string, entities: Entity[]): Relation[] {
    const entityNames = new Set(entities.map(e => e.name));

    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        return this.validateRelations(parsed, entityNames);
      }
      return [];
    } catch {
      const match = text.match(/\[[\s\S]*\]/);
      if (match) {
        try {
          const parsed = JSON.parse(match[0]);
          if (Array.isArray(parsed)) {
            return this.validateRelations(parsed, entityNames);
          }
        } catch {
          // Malformed JSON
        }
      }
      logger.warn('Failed to parse relations JSON', { textPreview: text.substring(0, 100) });
      return [];
    }
  }

  private validateEntities(raw: unknown[]): Entity[] {
    return raw
      .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
      .filter(item => {
        const name = typeof item.name === 'string' ? item.name.trim() : '';
        const type = typeof item.type === 'string' ? item.type : '';
        return name.length > 0 && (ENTITY_TYPES as readonly string[]).includes(type);
      })
      .map(item => ({
        name: (item.name as string).trim(),
        type: item.type as Entity['type'],
        description: typeof item.description === 'string' ? item.description : '',
        importance: typeof item.importance === 'number'
          ? Math.min(10, Math.max(1, Math.round(item.importance)))
          : 5,
        aliases: Array.isArray(item.aliases) ? item.aliases.filter((a: unknown) => typeof a === 'string') : [],
      }));
  }

  private validateRelations(raw: unknown[], entityNames: Set<string>): Relation[] {
    return raw
      .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
      .filter(item => {
        const source = typeof item.source === 'string' ? item.source : '';
        const target = typeof item.target === 'string' ? item.target : '';
        const type = typeof item.type === 'string' ? item.type : '';
        return (
          entityNames.has(source) &&
          entityNames.has(target) &&
          source !== target &&
          (RELATION_TYPES as readonly string[]).includes(type)
        );
      })
      .map(item => ({
        source: item.source as string,
        target: item.target as string,
        type: item.type as Relation['type'],
        description: typeof item.description === 'string' ? item.description : '',
        strength: typeof item.strength === 'number'
          ? Math.min(1, Math.max(0, item.strength))
          : 0.5,
      }));
  }
}

// ===========================================
// Singleton Export
// ===========================================

export const graphBuilder = new GraphBuilder();
