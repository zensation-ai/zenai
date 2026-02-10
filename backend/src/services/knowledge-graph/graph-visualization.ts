/**
 * Knowledge Graph Visualization - Full graph, subgraph, layout, multi-hop search
 */

import { query } from '../../utils/database';
import { queryContext, AIContext } from '../../utils/database-context';
import { getTopics, Topic } from '../topic-clustering';
import { RelationType } from './graph-core';

// ===========================================
// Types
// ===========================================

/**
 * Simple idea info for graph traversal
 */
interface IdeaInfo {
  id: string;
  title: string;
  summary?: string;
}

/**
 * Multi-hop search result with path and idea details
 */
export interface MultiHopPath {
  path: string[];
  ideas: IdeaInfo[];
}

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

// ===========================================
// Multi-hop Search
// ===========================================

/**
 * Multi-hop reasoning: Find ideas connected through relationships
 * PERFORMANCE OPTIMIZED: Batch-loads idea details at the end instead of per-path
 */
export async function multiHopSearch(
  startIdeaId: string,
  maxHops: number = 2
): Promise<MultiHopPath[]> {
  const rawPaths: string[][] = [];
  const allIdeaIds = new Set<string>();

  // BFS for multi-hop connections - collect paths first
  const visited = new Set<string>();
  const queue: { ideaId: string; path: string[]; depth: number }[] = [
    { ideaId: startIdeaId, path: [startIdeaId], depth: 0 }
  ];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {continue;}

    if (current.depth >= maxHops) {continue;}
    if (visited.has(current.ideaId)) {continue;}
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
        // Store path for later processing
        rawPaths.push(newPath);
        newPath.forEach(id => allIdeaIds.add(id));
      }

      queue.push({
        ideaId: rel.target_id,
        path: newPath,
        depth: current.depth + 1,
      });
    }
  }

  // PERFORMANCE: Batch-load all idea details in a single query
  if (allIdeaIds.size === 0) {
    return [];
  }

  const ideasResult = await query(`
    SELECT id, title, summary FROM ideas WHERE id = ANY($1)
  `, [Array.from(allIdeaIds)]);

  // Create lookup map for O(1) access
  const ideaMap = new Map<string, IdeaInfo>();
  for (const idea of ideasResult.rows) {
    ideaMap.set(idea.id, { id: idea.id, title: idea.title, summary: idea.summary });
  }

  // Build final results using the lookup map
  return rawPaths.map(path => ({
    path,
    ideas: path.map(id => ideaMap.get(id)).filter((idea): idea is IdeaInfo => idea !== undefined),
  }));
}

// ===========================================
// Full Graph Visualization
// ===========================================

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
    const item = queue.shift();
    if (!item) { break; }
    const { id, currentDepth } = item;

    if (visitedIds.has(id)) {continue;}
    visitedIds.add(id);
    nodeIds.push(id);

    if (currentDepth >= depth) {continue;}

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

// ===========================================
// Layout Algorithm
// ===========================================

/**
 * Optimized force-directed layout calculation
 * Returns positions normalized to 0-1 range
 *
 * PERFORMANCE OPTIMIZATION:
 * - For small graphs (<50 nodes): Full O(n²) repulsion calculation
 * - For medium graphs (50-200 nodes): Reduced iterations + sampling
 * - For large graphs (>200 nodes): Barnes-Hut approximation with grid-based sampling
 */
export function calculateLayout(
  nodes: GraphNode[],
  edges: GraphEdge[],
  centerId?: string
): { x: number; y: number }[] {
  if (nodes.length === 0) {return [];}
  if (nodes.length === 1) {return [{ x: 0.5, y: 0.5 }];}

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

  // PERFORMANCE: Adaptive parameters based on graph size
  const n = nodes.length;
  const iterations = n > 200 ? 20 : n > 50 ? 30 : 50;
  const repulsion = 0.01;
  const attraction = 0.1;

  // For large graphs, use sampling to reduce O(n²) to O(n * k)
  const useSampling = n > 100;
  const sampleSize = useSampling ? Math.min(50, Math.ceil(Math.sqrt(n) * 2)) : n;

  for (let iter = 0; iter < iterations; iter++) {
    const forces = positions.map(() => ({ x: 0, y: 0 }));

    if (useSampling) {
      // OPTIMIZED: Sample-based repulsion for large graphs - O(n * k) instead of O(n²)
      // Each node repels against a random sample of other nodes
      for (let i = 0; i < n; i++) {
        // Create deterministic sample based on iteration and node index for stability
        const sampleStart = (iter * 7 + i * 13) % n;
        for (let s = 0; s < sampleSize; s++) {
          const j = (sampleStart + s) % n;
          if (i === j) {continue;}

          const dx = positions[j].x - positions[i].x;
          const dy = positions[j].y - positions[i].y;
          const distSq = dx * dx + dy * dy + 0.0001;
          const dist = Math.sqrt(distSq);
          // Scale force by n/sampleSize to compensate for sampling
          const force = (repulsion * n / sampleSize) / distSq;

          forces[i].x -= (dx / dist) * force;
          forces[i].y -= (dy / dist) * force;
        }
      }
    } else {
      // Standard O(n²) for small graphs - more accurate
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
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
    }

    // Attraction along edges - O(E) - already efficient
    for (let i = 0; i < n; i++) {
      for (const j of adjacency[i]) {
        const dx = positions[j].x - positions[i].x;
        const dy = positions[j].y - positions[i].y;

        forces[i].x += dx * attraction;
        forces[i].y += dy * attraction;
      }
    }

    // Apply forces with damping
    const damping = 0.8 - (iter / iterations) * 0.6;
    for (let i = 0; i < n; i++) {
      // Don't move center node
      if (centerId && nodes[i].id === centerId) {continue;}

      positions[i].x += forces[i].x * damping;
      positions[i].y += forces[i].y * damping;

      // Keep within bounds
      positions[i].x = Math.max(0.05, Math.min(0.95, positions[i].x));
      positions[i].y = Math.max(0.05, Math.min(0.95, positions[i].y));
    }
  }

  return positions;
}
