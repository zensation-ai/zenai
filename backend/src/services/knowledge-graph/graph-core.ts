/**
 * Knowledge Graph Core - Types, relationship analysis, storage
 *
 * Uses PostgreSQL for relationship storage.
 * Analyzes connections between ideas using LLM.
 */

import { query } from '../../utils/database';
import { queryOllamaJSON } from '../../utils/ollama';
import { logger } from '../../utils/logger';

// ===========================================
// Types
// ===========================================

export interface IdeaRelation {
  sourceId: string;
  targetId: string;
  relationType: RelationType;
  strength: number; // 0-1
  reason: string;
}

export type RelationType =
  | 'similar_to'      // Thematisch ähnlich
  | 'builds_on'       // Baut auf anderer Idee auf
  | 'contradicts'     // Widerspricht einer anderen Idee
  | 'supports'        // Unterstützt eine andere Idee
  | 'enables'         // Ermöglicht eine andere Idee
  | 'part_of'         // Teil eines größeren Konzepts
  | 'related_tech'    // Verwendet ähnliche Technologie
  | 'depends_on'      // Hängt von einer anderen Idee ab
  | 'alternative_to'  // Alternative Lösung
  | 'extends'         // Erweitert eine bestehende Idee
  | 'implements'      // Konkrete Implementierung einer abstrakten Idee
  | 'caused_by'       // Wird verursacht durch
  | 'precedes'        // Geht einer anderen Idee zeitlich voraus
  | 'follows';        // Folgt auf eine andere Idee

interface RelatedIdea {
  id: string;
  title: string;
  summary: string;
  keywords: string[];
  distance: number;
}

interface SourceIdea {
  id: string;
  title: string;
  summary?: string;
  keywords?: string[];
  embedding?: number[];
}

interface LLMRelationResponse {
  targetIndex: number;
  relationType: string;
  strength: number;
  reason?: string;
}

/**
 * Suggested connection based on embedding similarity
 */
export interface SuggestedConnection {
  id: string;
  title: string;
  summary: string;
  keywords: string[];
  similarity: number;
}

export const VALID_RELATION_TYPES: RelationType[] = [
  'similar_to', 'builds_on', 'contradicts', 'supports', 'enables', 'part_of', 'related_tech',
  'depends_on', 'alternative_to', 'extends', 'implements', 'caused_by', 'precedes', 'follows'
];

// Relationship type metadata for better scoring and UI
export const RELATION_TYPE_METADATA: Record<RelationType, {
  label: string;
  labelDe: string;
  weight: number;
  bidirectional: boolean;
  inverse?: RelationType;
  color: string;
}> = {
  similar_to: { label: 'Similar to', labelDe: 'Ähnlich zu', weight: 0.8, bidirectional: true, color: '#6366f1' },
  builds_on: { label: 'Builds on', labelDe: 'Baut auf', weight: 0.9, bidirectional: false, inverse: 'part_of', color: '#10b981' },
  contradicts: { label: 'Contradicts', labelDe: 'Widerspricht', weight: 0.7, bidirectional: true, color: '#ef4444' },
  supports: { label: 'Supports', labelDe: 'Unterstützt', weight: 0.85, bidirectional: false, color: '#22c55e' },
  enables: { label: 'Enables', labelDe: 'Ermöglicht', weight: 0.9, bidirectional: false, inverse: 'depends_on', color: '#3b82f6' },
  part_of: { label: 'Part of', labelDe: 'Teil von', weight: 0.85, bidirectional: false, inverse: 'builds_on', color: '#8b5cf6' },
  related_tech: { label: 'Related tech', labelDe: 'Ähnliche Technologie', weight: 0.75, bidirectional: true, color: '#f59e0b' },
  depends_on: { label: 'Depends on', labelDe: 'Hängt ab von', weight: 0.95, bidirectional: false, inverse: 'enables', color: '#dc2626' },
  alternative_to: { label: 'Alternative to', labelDe: 'Alternative zu', weight: 0.7, bidirectional: true, color: '#14b8a6' },
  extends: { label: 'Extends', labelDe: 'Erweitert', weight: 0.85, bidirectional: false, color: '#a855f7' },
  implements: { label: 'Implements', labelDe: 'Implementiert', weight: 0.9, bidirectional: false, color: '#0ea5e9' },
  caused_by: { label: 'Caused by', labelDe: 'Verursacht durch', weight: 0.8, bidirectional: false, color: '#f97316' },
  precedes: { label: 'Precedes', labelDe: 'Geht voraus', weight: 0.7, bidirectional: false, inverse: 'follows', color: '#64748b' },
  follows: { label: 'Follows', labelDe: 'Folgt auf', weight: 0.7, bidirectional: false, inverse: 'precedes', color: '#64748b' },
};

// ===========================================
// Core Functions
// ===========================================

/**
 * Find and create relationships for a new idea
 */
export async function analyzeRelationships(ideaId: string): Promise<IdeaRelation[]> {
  // 1. Get the idea
  const ideaResult = await query(
    'SELECT id, title, summary, keywords, embedding FROM ideas WHERE id = $1',
    [ideaId]
  );

  if (ideaResult.rows.length === 0) {
    throw new Error('Idea not found');
  }

  const idea = ideaResult.rows[0];

  // 2. Find similar ideas (potential relationships)
  const similarResult = await query(`
    SELECT id, title, summary, keywords, embedding <-> $1 as distance
    FROM ideas
    WHERE id != $2
    ORDER BY distance
    LIMIT 10
  `, [idea.embedding, ideaId]);

  const similarIdeas: RelatedIdea[] = similarResult.rows;

  if (similarIdeas.length === 0) {
    return [];
  }

  // 3. Use LLM to analyze relationships
  const relationships = await analyzeWithLLM(idea, similarIdeas);

  // 4. Store relationships in database
  for (const rel of relationships) {
    await storeRelationship(rel);
  }

  return relationships;
}

/**
 * Use Mistral to analyze relationships between ideas
 */
async function analyzeWithLLM(
  sourceIdea: SourceIdea,
  candidates: RelatedIdea[]
): Promise<IdeaRelation[]> {
  const prompt = `Du analysierst Beziehungen zwischen Ideen. Antworte NUR mit validem JSON.

HAUPTIDEE:
- Titel: ${sourceIdea.title}
- Zusammenfassung: ${sourceIdea.summary || 'Keine'}

KANDIDATEN:
${candidates.slice(0, 5).map((c, i) => `${i + 1}. "${c.title}" - ${c.summary || 'Keine Zusammenfassung'}`).join('\n')}

Finde Beziehungen zwischen der Hauptidee und den Kandidaten.
Mögliche Beziehungstypen: similar_to, builds_on, supports, enables, related_tech

Antworte EXAKT in diesem JSON-Format (nur das Array, kein Text davor/danach):
[{"targetIndex": 1, "relationType": "similar_to", "strength": 0.8, "reason": "Beide behandeln KI"}]

Wenn keine Beziehungen: []`;

  try {
    // Use generic JSON query for relationship analysis
    const response = await queryOllamaJSON<LLMRelationResponse[] | { relationships?: LLMRelationResponse[]; relations?: LLMRelationResponse[]; data?: LLMRelationResponse[] }>(prompt);

    // Safely parse the response with validation
    let relations: LLMRelationResponse[] = [];

    // Handle different response formats
    if (response === null || response === undefined) {
      logger.debug('LLM returned null/undefined response');
      return [];
    }

    if (Array.isArray(response)) {
      relations = response;
    } else if (typeof response === 'object') {
      // Try common wrapper properties
      if (Array.isArray(response.relationships)) {
        relations = response.relationships;
      } else if (Array.isArray(response.relations)) {
        relations = response.relations;
      } else if (Array.isArray(response.data)) {
        relations = response.data;
      } else {
        logger.debug('LLM returned unexpected object structure');
        return [];
      }
    } else {
      logger.debug('LLM returned unexpected type', { type: typeof response });
      return [];
    }

    // Validate and map to proper structure
    return relations
      .filter((r): r is LLMRelationResponse => {
        // Validate required fields
        if (!r || typeof r !== 'object') {return false;}
        if (typeof r.targetIndex !== 'number' || r.targetIndex < 1 || r.targetIndex > candidates.length) {return false;}
        if (typeof r.relationType !== 'string') {return false;}
        if (typeof r.strength !== 'number' || r.strength < 0 || r.strength > 1) {return false;}
        if (r.strength <= 0.5) {return false;}
        return true;
      })
      .map((r): IdeaRelation => {
        // Normalize relation type to valid value
        let relationType: RelationType = 'similar_to';
        if (VALID_RELATION_TYPES.includes(r.relationType as RelationType)) {
          relationType = r.relationType as RelationType;
        }

        return {
          sourceId: sourceIdea.id,
          targetId: candidates[r.targetIndex - 1]?.id,
          relationType,
          strength: Math.min(1, Math.max(0, r.strength)), // Clamp to 0-1
          reason: typeof r.reason === 'string' ? r.reason : '',
        };
      })
      .filter((r): r is IdeaRelation => !!r.targetId); // Filter out invalid targets
  } catch (error) {
    logger.error('LLM relationship analysis failed', error instanceof Error ? error : undefined);
    return [];
  }
}

/**
 * Store a relationship in the database
 */
async function storeRelationship(relation: IdeaRelation): Promise<void> {
  await query(`
    INSERT INTO idea_relations (source_id, target_id, relation_type, strength, reason, created_at)
    VALUES ($1, $2, $3, $4, $5, NOW())
    ON CONFLICT (source_id, target_id, relation_type)
    DO UPDATE SET strength = $4, reason = $5, updated_at = NOW()
  `, [relation.sourceId, relation.targetId, relation.relationType, relation.strength, relation.reason]);
}

/**
 * Get all relationships for an idea
 */
export async function getRelationships(ideaId: string): Promise<IdeaRelation[]> {
  const result = await query(`
    SELECT
      r.source_id, r.target_id, r.relation_type, r.strength, r.reason,
      i.title as target_title, i.summary as target_summary
    FROM idea_relations r
    JOIN ideas i ON r.target_id = i.id
    WHERE r.source_id = $1
    ORDER BY r.strength DESC
  `, [ideaId]);

  return result.rows.map(row => ({
    sourceId: row.source_id,
    targetId: row.target_id,
    relationType: row.relation_type,
    strength: row.strength,
    reason: row.reason,
  }));
}

/**
 * Get suggested connections for an idea (ideas that might be related but aren't linked yet)
 */
export async function getSuggestedConnections(ideaId: string): Promise<SuggestedConnection[]> {
  // Find similar ideas that don't have a relationship yet
  const result = await query(`
    SELECT i.id, i.title, i.summary, i.keywords,
           i.embedding <-> (SELECT embedding FROM ideas WHERE id = $1) as distance
    FROM ideas i
    WHERE i.id != $1
      AND i.id NOT IN (
        SELECT target_id FROM idea_relations WHERE source_id = $1
      )
    ORDER BY distance
    LIMIT 5
  `, [ideaId]);

  return result.rows.map(row => {
    let keywords: string[] = [];
    try {
      keywords = typeof row.keywords === 'string' ? JSON.parse(row.keywords) : (row.keywords || []);
    } catch {
      keywords = [];
    }
    return {
      id: row.id,
      title: row.title,
      summary: row.summary,
      keywords,
      similarity: 1 - (row.distance / 50), // Normalize to 0-1
    };
  });
}

/**
 * Get knowledge graph stats
 */
export async function getGraphStats(): Promise<{
  totalIdeas: number;
  totalRelations: number;
  avgRelationsPerIdea: number;
  relationTypes: Record<string, number>;
}> {
  const ideasCount = await query('SELECT COUNT(*) FROM ideas WHERE is_archived = false');
  const relationsCount = await query('SELECT COUNT(*) FROM idea_relations');
  const relationTypes = await query(`
    SELECT relation_type, COUNT(*) as count
    FROM idea_relations
    GROUP BY relation_type
  `);

  const totalIdeas = parseInt(ideasCount.rows[0].count);
  const totalRelations = parseInt(relationsCount.rows[0].count);

  return {
    totalIdeas,
    totalRelations,
    avgRelationsPerIdea: totalIdeas > 0 ? totalRelations / totalIdeas : 0,
    relationTypes: relationTypes.rows.reduce((acc, row) => {
      acc[row.relation_type] = parseInt(row.count);
      return acc;
    }, {} as Record<string, number>),
  };
}
