import { query } from '../utils/database';
import { queryContext, AIContext } from '../utils/database-context';
import { structureWithOllama } from '../utils/ollama';
import { getTopics, Topic } from './topic-clustering';

/**
 * Advanced Knowledge Graph Service
 * Uses PostgreSQL for relationship storage
 * Analyzes connections between ideas using LLM
 * Supports full graph visualization and context-aware queries
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
    const response = await structureWithOllama(prompt);

    // Parse the response - it might be wrapped in an object
    let relations: any[] = [];
    const responseAny = response as any;
    if (Array.isArray(responseAny)) {
      relations = responseAny;
    } else if (responseAny.relationships) {
      relations = responseAny.relationships;
    } else if (responseAny.relations) {
      relations = responseAny.relations;
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

// ============================================
// NEW: Full Graph Visualization Support
// ============================================

export interface GraphNode {
  id: string;
  title: string;
  type: string;
  category: string;
  priority: string;
  topicId: string | null;
  topicName: string | null;
  topicColor: string | null;
  position?: { x: number; y: number };
}

export interface GraphEdge {
  id: string;
  sourceId: string;
  targetId: string;
  relationType: RelationType;
  strength: number;
  reason: string | null;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  topics: Topic[];
  stats: {
    nodeCount: number;
    edgeCount: number;
    topicCount: number;
  };
}

/**
 * Get full graph data for visualization (context-aware)
 */
export async function getFullGraph(context: AIContext): Promise<GraphData> {
  // Get all ideas (nodes)
  const nodesResult = await queryContext(context, `
    SELECT
      i.id,
      i.title,
      i.type,
      i.category,
      i.priority,
      i.primary_topic_id,
      t.name as topic_name,
      t.color as topic_color
    FROM ideas i
    LEFT JOIN idea_topics t ON i.primary_topic_id = t.id
    WHERE i.is_archived = FALSE
    ORDER BY i.created_at DESC
    LIMIT 500
  `);

  const nodes: GraphNode[] = nodesResult.rows.map(row => ({
    id: row.id,
    title: row.title,
    type: row.type,
    category: row.category,
    priority: row.priority,
    topicId: row.primary_topic_id,
    topicName: row.topic_name,
    topicColor: row.topic_color,
  }));

  const nodeIds = nodes.map(n => n.id);

  // Get all edges (relationships) between visible nodes
  const edgesResult = await queryContext(context, `
    SELECT
      id,
      source_id,
      target_id,
      relation_type,
      strength,
      reason
    FROM idea_relations
    WHERE source_id = ANY($1)
      AND target_id = ANY($1)
      AND strength > 0.5
    ORDER BY strength DESC
  `, [nodeIds]);

  const edges: GraphEdge[] = edgesResult.rows.map(row => ({
    id: row.id?.toString() || `${row.source_id}-${row.target_id}`,
    sourceId: row.source_id,
    targetId: row.target_id,
    relationType: row.relation_type,
    strength: row.strength,
    reason: row.reason,
  }));

  // Get topics
  const topics = await getTopics(context);

  // Calculate simple force-directed layout positions
  const positions = calculateLayout(nodes, edges);
  nodes.forEach((node, i) => {
    node.position = positions[i];
  });

  return {
    nodes,
    edges,
    topics,
    stats: {
      nodeCount: nodes.length,
      edgeCount: edges.length,
      topicCount: topics.length,
    },
  };
}

/**
 * Get subgraph around a specific idea
 */
export async function getSubgraph(
  context: AIContext,
  ideaId: string,
  depth: number = 2,
  minStrength: number = 0.5
): Promise<GraphData> {
  // BFS to find all connected nodes within depth
  const visitedIds = new Set<string>();
  const queue: { id: string; currentDepth: number }[] = [{ id: ideaId, currentDepth: 0 }];
  const nodeIds: string[] = [];

  while (queue.length > 0) {
    const { id, currentDepth } = queue.shift()!;

    if (visitedIds.has(id)) continue;
    visitedIds.add(id);
    nodeIds.push(id);

    if (currentDepth >= depth) continue;

    // Get connected ideas
    const connectedResult = await queryContext(context, `
      SELECT DISTINCT target_id as id
      FROM idea_relations
      WHERE source_id = $1 AND strength >= $2
      UNION
      SELECT DISTINCT source_id as id
      FROM idea_relations
      WHERE target_id = $1 AND strength >= $2
    `, [id, minStrength]);

    for (const row of connectedResult.rows) {
      if (!visitedIds.has(row.id)) {
        queue.push({ id: row.id, currentDepth: currentDepth + 1 });
      }
    }
  }

  // Get node details
  const nodesResult = await queryContext(context, `
    SELECT
      i.id,
      i.title,
      i.type,
      i.category,
      i.priority,
      i.primary_topic_id,
      t.name as topic_name,
      t.color as topic_color
    FROM ideas i
    LEFT JOIN idea_topics t ON i.primary_topic_id = t.id
    WHERE i.id = ANY($1)
  `, [nodeIds]);

  const nodes: GraphNode[] = nodesResult.rows.map(row => ({
    id: row.id,
    title: row.title,
    type: row.type,
    category: row.category,
    priority: row.priority,
    topicId: row.primary_topic_id,
    topicName: row.topic_name,
    topicColor: row.topic_color,
  }));

  // Get edges between nodes
  const edgesResult = await queryContext(context, `
    SELECT
      id,
      source_id,
      target_id,
      relation_type,
      strength,
      reason
    FROM idea_relations
    WHERE source_id = ANY($1)
      AND target_id = ANY($1)
      AND strength >= $2
  `, [nodeIds, minStrength]);

  const edges: GraphEdge[] = edgesResult.rows.map(row => ({
    id: row.id?.toString() || `${row.source_id}-${row.target_id}`,
    sourceId: row.source_id,
    targetId: row.target_id,
    relationType: row.relation_type,
    strength: row.strength,
    reason: row.reason,
  }));

  // Get topics
  const topics = await getTopics(context);

  // Calculate layout
  const positions = calculateLayout(nodes, edges, ideaId);
  nodes.forEach((node, i) => {
    node.position = positions[i];
  });

  return {
    nodes,
    edges,
    topics,
    stats: {
      nodeCount: nodes.length,
      edgeCount: edges.length,
      topicCount: topics.length,
    },
  };
}

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
  console.log(`[Graph Discovery] Analyzing ${ideaIds.length} ideas`);

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
        console.error(`[Graph Discovery] Failed for idea ${ideaId}:`, error);
      }
    }

    // Small delay between batches to avoid overwhelming Ollama
    if (i + batchSize < ideaIds.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  const processingTime = Date.now() - startTime;
  console.log(`[Graph Discovery] Complete: ${newRelationships} relationships from ${processed} ideas in ${processingTime}ms`);

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

/**
 * Simple force-directed layout calculation
 * Returns positions normalized to 0-1 range
 */
function calculateLayout(
  nodes: GraphNode[],
  edges: GraphEdge[],
  centerId?: string
): { x: number; y: number }[] {
  if (nodes.length === 0) return [];
  if (nodes.length === 1) return [{ x: 0.5, y: 0.5 }];

  // Initialize positions in a circle or grid
  const positions = nodes.map((node, i) => {
    if (centerId && node.id === centerId) {
      return { x: 0.5, y: 0.5 };
    }
    const angle = (2 * Math.PI * i) / nodes.length;
    const radius = 0.35;
    return {
      x: 0.5 + radius * Math.cos(angle),
      y: 0.5 + radius * Math.sin(angle),
    };
  });

  // Build adjacency map
  const nodeIndex = new Map(nodes.map((n, i) => [n.id, i]));
  const adjacency: number[][] = nodes.map(() => []);

  for (const edge of edges) {
    const sourceIdx = nodeIndex.get(edge.sourceId);
    const targetIdx = nodeIndex.get(edge.targetId);
    if (sourceIdx !== undefined && targetIdx !== undefined) {
      adjacency[sourceIdx].push(targetIdx);
      adjacency[targetIdx].push(sourceIdx);
    }
  }

  // Simple force-directed iterations
  const iterations = 50;
  const repulsion = 0.01;
  const attraction = 0.1;

  for (let iter = 0; iter < iterations; iter++) {
    const forces = positions.map(() => ({ x: 0, y: 0 }));

    // Repulsion between all nodes
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = positions[j].x - positions[i].x;
        const dy = positions[j].y - positions[i].y;
        const dist = Math.sqrt(dx * dx + dy * dy) + 0.01;
        const force = repulsion / (dist * dist);

        forces[i].x -= (dx / dist) * force;
        forces[i].y -= (dy / dist) * force;
        forces[j].x += (dx / dist) * force;
        forces[j].y += (dy / dist) * force;
      }
    }

    // Attraction along edges
    for (let i = 0; i < nodes.length; i++) {
      for (const j of adjacency[i]) {
        const dx = positions[j].x - positions[i].x;
        const dy = positions[j].y - positions[i].y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        forces[i].x += dx * attraction;
        forces[i].y += dy * attraction;
      }
    }

    // Apply forces
    const damping = 0.8 - (iter / iterations) * 0.6;
    for (let i = 0; i < nodes.length; i++) {
      // Don't move center node
      if (centerId && nodes[i].id === centerId) continue;

      positions[i].x += forces[i].x * damping;
      positions[i].y += forces[i].y * damping;

      // Keep within bounds
      positions[i].x = Math.max(0.05, Math.min(0.95, positions[i].x));
      positions[i].y = Math.max(0.05, Math.min(0.95, positions[i].y));
    }
  }

  return positions;
}
