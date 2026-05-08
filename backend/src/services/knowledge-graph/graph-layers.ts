/**
 * Graph Layers Coordinator
 *
 * Routes queries across all 3 layers and merges results.
 * Layer 1: Event Subgraph (temporal interactions)
 * Layer 2: Semantic Graph (entities + relations)
 * Layer 3: Community Graph (cluster summaries)
 *
 * @module services/knowledge-graph/graph-layers
 */

import { AIContext } from '../../utils/database-context';
import { getEntityActivityScore, getActivityHeatmap, GraphEvent } from './event-subgraph';
import { logger } from '../../utils/logger';

// ===========================================
// Types
// ===========================================

export interface LayeredQueryResult {
  entityId: string;
  name: string;
  description?: string;
  semanticScore: number;    // From Layer 2
  eventScore: number;       // From Layer 1
  communityScore: number;   // From Layer 3
  combinedScore: number;    // Weighted combination
  recentEvents?: GraphEvent[];
}

export interface LayeredQueryOptions {
  weights?: {
    semantic: number;   // default 0.5
    event: number;      // default 0.3
    community: number;  // default 0.2
  };
  eventWindowDays?: number;  // default 7
  limit?: number;
}

const DEFAULT_WEIGHTS = { semantic: 0.5, event: 0.3, community: 0.2 };

// ===========================================
// Cross-Layer Query
// ===========================================

/**
 * Query across all 3 layers for a set of entity IDs.
 * Fetches event activity scores (Layer 1) and combines with
 * semantic (Layer 2) and community (Layer 3) scores.
 *
 * Callers should set semanticScore and communityScore on the returned
 * results before computing the final combinedScore, or provide them
 * via post-processing.
 */
export async function queryAcrossLayers(
  context: AIContext,
  entityIds: string[],
  options: LayeredQueryOptions = {}
): Promise<LayeredQueryResult[]> {
  const weights = options.weights || DEFAULT_WEIGHTS;
  const windowDays = options.eventWindowDays || 7;

  if (entityIds.length === 0) {
    return [];
  }

  // Fetch event scores for all entities in parallel
  const activityPromises = entityIds.map(id =>
    getEntityActivityScore(context, id, windowDays)
      .catch((err) => {
        logger.debug('Activity score fetch failed', { entityId: id, error: (err as Error).message });
        return { totalEvents: 0, eventsByType: {} as Record<string, number>, recencyScore: 0, lastActivity: null };
      })
  );

  const activities = await Promise.all(activityPromises);

  // Combine scores
  const results: LayeredQueryResult[] = entityIds.map((entityId, i) => {
    const activity = activities[i];

    // Normalize event score: log scale for frequency + recency
    const frequencyScore = activity.totalEvents > 0
      ? Math.min(1, Math.log(activity.totalEvents + 1) / Math.log(50))
      : 0;
    const eventScore = frequencyScore * 0.5 + activity.recencyScore * 0.5;

    // Combined score starts with event score only;
    // semantic and community scores should be set by callers
    const combinedScore = eventScore * weights.event;

    return {
      entityId,
      name: '',
      semanticScore: 0,
      eventScore,
      communityScore: 0,
      combinedScore,
    };
  });

  return results;
}

// ===========================================
// Graph Overview
// ===========================================

/**
 * Get a high-level overview of the graph across all layers.
 */
export async function getGraphOverview(context: AIContext): Promise<{
  eventLayer: { totalEvents: number; heatmap: Array<{ date: string; count: number }> };
}> {
  const heatmap = await getActivityHeatmap(context, 30);
  const totalEvents = heatmap.reduce((sum, day) => sum + day.count, 0);

  return {
    eventLayer: { totalEvents, heatmap },
  };
}
