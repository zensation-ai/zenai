/**
 * Hebbian-KG → PPR loader.
 *
 * Phase H sprint reference: spec § H2 task 1 (HippoRAG 2 PPR over the
 * Hebbian KG). The pure PPR algorithm lives in
 * `backend/src/algorithms/personalized-pagerank.ts`. This module is the
 * DB-to-PPRGraph bridge: it loads a 2-hop subgraph anchored at the seed
 * entities, normalises edge weights, and produces the input shape PPR
 * expects.
 *
 * Why a separate file (vs. inline in hybrid-retriever.ts)
 * -------------------------------------------------------
 * - The PPR algorithm is pure and dependency-free. Mixing DB I/O into
 *   it would defeat the test layer that already exists in
 *   `__tests__/unit/algorithms/personalized-pagerank.test.ts`.
 * - The loader has its own concerns (subgraph extraction, edge
 *   weighting, two-source merge between `entity_relations` and
 *   `entity_coactivations`) that warrant their own tests.
 * - Future consumers (the planned H4 4-network composer, the temporal
 *   multi-route runner) can reuse the loader without going through the
 *   hybrid retriever's call shape.
 *
 * Edge sources
 * ------------
 * Two tables contribute edges to the PPR graph:
 *   1. `entity_relations` — explicit relationship rows with
 *      `hebbian_weight` (Phase 125's two-factor Hebbian dynamics).
 *      Treated as DIRECTED (source → target) when present.
 *   2. `entity_coactivations` — symmetric "fired together" co-activation
 *      counts. Treated as UNDIRECTED, which the PPR layer expands to two
 *      directed edges (`undirectedToDirected`).
 *
 * When both tables list the same pair we keep both edges and let PPR's
 * adjacency builder accumulate the out-strength. The two signals are
 * complementary: relations carry a labelled meaning, coactivations carry
 * an empirical co-occurrence that may not yet have a relation row.
 *
 * Subgraph extraction
 * -------------------
 * PPR over the FULL KG would be wasteful — we only need the seed
 * neighbourhood. The loader does a recursive BFS up to `maxHops` hops
 * (default 2) starting from the seed entity ids, gathering nodes and
 * edges as it goes. Two hops is the same exploration depth the legacy
 * 2-hop traversal already used in `hybrid-retriever.ts`, so the change
 * is "same neighbourhood, smarter ranking" rather than "wider net".
 *
 * @module services/knowledge-graph/hebbian-ppr-loader
 */

import { AIContext, queryContext } from '../../utils/database-context';
import {
  PPRGraph,
  WeightedEdge,
  undirectedToDirected,
} from '../../algorithms/personalized-pagerank';
import { logger } from '../../utils/logger';

// ===========================================================================
// Types
// ===========================================================================

export interface HebbianPPROptions {
  /** Hops to expand from seeds. Default 2 (matches legacy graph traversal). */
  maxHops?: number;
  /** Cap on subgraph node count to avoid loading large graphs. Default 500. */
  maxNodes?: number;
  /** Minimum hebbian_weight for `entity_relations` edges to be included.
   *  Default 0.1 — filters out near-decayed edges that add noise. */
  minRelationWeight?: number;
  /** Minimum coactivation_count for `entity_coactivations` edges to be
   *  included. Default 1 (any co-activation). Set higher to require
   *  stable signals. */
  minCoactivationCount?: number;
}

export interface HebbianSubgraph {
  graph: PPRGraph;
  /** The seed entity ids that were actually found in the KG (a subset
   *  of the input — missing seeds are silently dropped). */
  validSeeds: ReadonlyArray<string>;
  /** Stats for logging / observability. */
  stats: {
    nodes: number;
    relationEdges: number;
    coactivationEdges: number;
    hopsCovered: number;
    truncated: boolean;
  };
}

const DEFAULT_MAX_HOPS = 2;
const DEFAULT_MAX_NODES = 500;
const DEFAULT_MIN_RELATION_WEIGHT = 0.1;
const DEFAULT_MIN_COACTIVATION_COUNT = 1;

// ===========================================================================
// Public API
// ===========================================================================

/**
 * Load a subgraph centred on `seedEntityIds` from the production
 * Hebbian KG and convert it into the shape PPR expects.
 *
 * Returns `null` when the seed set yields zero valid nodes — the caller
 * should fall back to the legacy retrieval path in that case.
 */
export async function loadHebbianSubgraphForPPR(
  context: AIContext,
  seedEntityIds: ReadonlyArray<string>,
  options: HebbianPPROptions = {},
): Promise<HebbianSubgraph | null> {
  const maxHops = options.maxHops ?? DEFAULT_MAX_HOPS;
  const maxNodes = options.maxNodes ?? DEFAULT_MAX_NODES;
  const minRelationWeight = options.minRelationWeight ?? DEFAULT_MIN_RELATION_WEIGHT;
  const minCoactivationCount = options.minCoactivationCount ?? DEFAULT_MIN_COACTIVATION_COUNT;

  const validSeeds = await filterValidSeeds(context, seedEntityIds);
  if (validSeeds.length === 0) return null;

  const nodes = new Set<string>(validSeeds);
  const relationEdges: WeightedEdge[] = [];
  const undirectedCoactEdges: WeightedEdge[] = [];

  let frontier: string[] = [...validSeeds];
  let hopsCovered = 0;
  let truncated = false;

  for (let hop = 0; hop < maxHops; hop++) {
    if (frontier.length === 0) break;
    if (nodes.size >= maxNodes) {
      truncated = true;
      break;
    }
    const remainingBudget = maxNodes - nodes.size;
    const { newNodes, relRows, coactRows } = await loadOneHop(
      context,
      frontier,
      minRelationWeight,
      minCoactivationCount,
    );
    for (const row of relRows) {
      relationEdges.push([row.source_entity_id, row.target_entity_id, row.weight]);
    }
    for (const row of coactRows) {
      undirectedCoactEdges.push([row.entity_a_id, row.entity_b_id, row.weight]);
    }
    // Add new nodes up to the budget. Older entries (closer to seeds) win
    // when the budget is tight — Set preserves insertion order, but we
    // explicitly slice the discovered set so the traversal is predictable.
    const additions = newNodes.slice(0, remainingBudget);
    for (const n of additions) nodes.add(n);
    if (newNodes.length > remainingBudget) {
      truncated = true;
    }
    hopsCovered = hop + 1;
    frontier = additions;
  }

  // Now drop edges that reference nodes not in the final set (this can
  // happen when truncation cut off nodes mid-frontier).
  const finalNodeSet = nodes;
  const filteredRelations = relationEdges.filter(
    (e) => finalNodeSet.has(e[0]) && finalNodeSet.has(e[1]),
  );
  const filteredCoactivations = undirectedCoactEdges.filter(
    (e) => finalNodeSet.has(e[0]) && finalNodeSet.has(e[1]),
  );

  const directedEdges: WeightedEdge[] = [
    ...filteredRelations,
    ...undirectedToDirected(filteredCoactivations),
  ];

  if (finalNodeSet.size === 0) {
    return null;
  }

  return {
    graph: {
      nodes: Array.from(finalNodeSet),
      edges: directedEdges,
    },
    validSeeds,
    stats: {
      nodes: finalNodeSet.size,
      relationEdges: filteredRelations.length,
      coactivationEdges: filteredCoactivations.length,
      hopsCovered,
      truncated,
    },
  };
}

// ===========================================================================
// Helpers
// ===========================================================================

interface RelationRow {
  source_entity_id: string;
  target_entity_id: string;
  weight: number;
}

interface CoactivationRow {
  entity_a_id: string;
  entity_b_id: string;
  weight: number;
}

interface OneHopResult {
  /** Nodes discovered in this hop that were not already in the visited set. */
  newNodes: string[];
  relRows: RelationRow[];
  coactRows: CoactivationRow[];
}

/** Filter the input seed list to those that actually exist in the KG. */
async function filterValidSeeds(
  context: AIContext,
  ids: ReadonlyArray<string>,
): Promise<string[]> {
  if (ids.length === 0) return [];
  try {
    const result = await queryContext(
      context,
      `SELECT id FROM knowledge_entities WHERE id = ANY($1::uuid[])`,
      [ids as string[]],
    );
    return (result.rows as Array<{ id: string }>).map((r) => r.id);
  } catch (error) {
    logger.debug('PPR loader: filterValidSeeds query failed', {
      error: error instanceof Error ? error.message : 'Unknown',
    });
    return [];
  }
}

/**
 * Load all `entity_relations` and `entity_coactivations` rows that have
 * one endpoint in `nodeIds`. Returns the new nodes discovered (not in
 * `nodeIds`) plus the raw row arrays.
 */
async function loadOneHop(
  context: AIContext,
  nodeIds: ReadonlyArray<string>,
  minRelationWeight: number,
  minCoactivationCount: number,
): Promise<OneHopResult> {
  const ids = nodeIds as string[];
  if (ids.length === 0) return { newNodes: [], relRows: [], coactRows: [] };

  const visited = new Set<string>(ids);
  const newNodes: string[] = [];
  const relRows: RelationRow[] = [];
  const coactRows: CoactivationRow[] = [];

  // ── entity_relations: directed edges with hebbian_weight ──────────
  try {
    const relResult = await queryContext(
      context,
      `SELECT source_entity_id, target_entity_id,
              COALESCE(hebbian_weight, 1.0) AS weight
       FROM entity_relations
       WHERE (source_entity_id = ANY($1::uuid[]) OR target_entity_id = ANY($1::uuid[]))
         AND COALESCE(hebbian_weight, 1.0) >= $2`,
      [ids, minRelationWeight],
    );
    for (const r of relResult.rows as Array<RelationRow>) {
      const w = typeof r.weight === 'string' ? parseFloat(r.weight) : r.weight;
      relRows.push({
        source_entity_id: r.source_entity_id,
        target_entity_id: r.target_entity_id,
        weight: Number.isFinite(w) ? w : 1.0,
      });
      const other =
        visited.has(r.source_entity_id) ? r.target_entity_id : r.source_entity_id;
      if (!visited.has(other)) {
        visited.add(other);
        newNodes.push(other);
      }
    }
  } catch (error) {
    logger.debug('PPR loader: entity_relations query failed', {
      error: error instanceof Error ? error.message : 'Unknown',
    });
  }

  // ── entity_coactivations: undirected edges with coactivation_count ─
  try {
    const coactResult = await queryContext(
      context,
      `SELECT entity_a_id, entity_b_id,
              coactivation_count::float AS weight
       FROM entity_coactivations
       WHERE (entity_a_id = ANY($1::uuid[]) OR entity_b_id = ANY($1::uuid[]))
         AND coactivation_count >= $2`,
      [ids, minCoactivationCount],
    );
    for (const r of coactResult.rows as Array<CoactivationRow>) {
      const w = typeof r.weight === 'string' ? parseFloat(r.weight) : r.weight;
      coactRows.push({
        entity_a_id: r.entity_a_id,
        entity_b_id: r.entity_b_id,
        weight: Number.isFinite(w) && w > 0 ? w : 1.0,
      });
      const other =
        visited.has(r.entity_a_id) ? r.entity_b_id : r.entity_a_id;
      if (!visited.has(other)) {
        visited.add(other);
        newNodes.push(other);
      }
    }
  } catch (error) {
    logger.debug('PPR loader: entity_coactivations query failed', {
      error: error instanceof Error ? error.message : 'Unknown',
    });
  }

  return { newNodes, relRows, coactRows };
}
