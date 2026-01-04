import { query } from '../utils/database';
import { structureWithOllama, generateEmbedding } from '../utils/ollama';

/**
 * Simple Knowledge Graph Service
 * Uses PostgreSQL for relationship storage
 * Analyzes connections between ideas using LLM
 */

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
  | 'related_tech';   // Verwendet ähnliche Technologie

interface RelatedIdea {
  id: string;
  title: string;
  summary: string;
  keywords: string[];
  distance: number;
}

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
  sourceIdea: any,
  candidates: RelatedIdea[]
): Promise<IdeaRelation[]> {
  const prompt = `Analysiere die Beziehungen zwischen dieser Idee und ähnlichen Ideen.

HAUPTIDEE:
Titel: ${sourceIdea.title}
Zusammenfassung: ${sourceIdea.summary}
Keywords: ${JSON.parse(sourceIdea.keywords || '[]').join(', ')}

ÄHNLICHE IDEEN:
${candidates.map((c, i) => `
${i + 1}. "${c.title}"
   Zusammenfassung: ${c.summary}
   Keywords: ${JSON.parse(c.keywords || '[]').join(', ')}
`).join('\n')}

Antworte NUR mit einem JSON-Array. Für jede relevante Beziehung:
{
  "targetIndex": <1-${candidates.length}>,
  "relationType": "similar_to|builds_on|contradicts|supports|enables|part_of|related_tech",
  "strength": <0.0-1.0>,
  "reason": "Kurze Begründung"
}

Nur Beziehungen mit strength > 0.5 ausgeben. Leeres Array [] wenn keine starken Beziehungen.`;

  try {
    const response = await structureWithOllama(prompt);

    // Parse the response - it might be wrapped in an object
    let relations: any[] = [];
    if (Array.isArray(response)) {
      relations = response;
    } else if (response.relationships) {
      relations = response.relationships;
    } else if (response.relations) {
      relations = response.relations;
    }

    // Map to proper structure
    return relations
      .filter((r: any) => r.targetIndex && r.relationType && r.strength > 0.5)
      .map((r: any) => ({
        sourceId: sourceIdea.id,
        targetId: candidates[r.targetIndex - 1]?.id,
        relationType: r.relationType as RelationType,
        strength: r.strength,
        reason: r.reason || '',
      }))
      .filter((r: IdeaRelation) => r.targetId); // Filter out invalid targets
  } catch (error) {
    console.error('LLM relationship analysis failed:', error);
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
 * Multi-hop reasoning: Find ideas connected through relationships
 */
export async function multiHopSearch(
  startIdeaId: string,
  maxHops: number = 2
): Promise<{ path: string[]; ideas: any[] }[]> {
  const paths: { path: string[]; ideas: any[] }[] = [];

  // BFS for multi-hop connections
  const visited = new Set<string>();
  const queue: { ideaId: string; path: string[]; depth: number }[] = [
    { ideaId: startIdeaId, path: [startIdeaId], depth: 0 }
  ];

  while (queue.length > 0) {
    const current = queue.shift()!;

    if (current.depth >= maxHops) continue;
    if (visited.has(current.ideaId)) continue;
    visited.add(current.ideaId);

    // Get connected ideas
    const relations = await query(`
      SELECT target_id, relation_type, strength
      FROM idea_relations
      WHERE source_id = $1 AND strength > 0.6
      ORDER BY strength DESC
      LIMIT 5
    `, [current.ideaId]);

    for (const rel of relations.rows) {
      const newPath = [...current.path, rel.target_id];

      if (current.depth + 1 === maxHops || relations.rows.length === 0) {
        // Fetch idea details for the path
        const ideasResult = await query(`
          SELECT id, title, summary FROM ideas WHERE id = ANY($1)
        `, [newPath]);

        paths.push({
          path: newPath,
          ideas: ideasResult.rows,
        });
      }

      queue.push({
        ideaId: rel.target_id,
        path: newPath,
        depth: current.depth + 1,
      });
    }
  }

  return paths;
}

/**
 * Get suggested connections for an idea (ideas that might be related but aren't linked yet)
 */
export async function getSuggestedConnections(ideaId: string): Promise<any[]> {
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

  return result.rows.map(row => ({
    id: row.id,
    title: row.title,
    summary: row.summary,
    keywords: JSON.parse(row.keywords || '[]'),
    similarity: 1 - (row.distance / 50), // Normalize to 0-1
  }));
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
  const ideasCount = await query('SELECT COUNT(*) FROM ideas');
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
