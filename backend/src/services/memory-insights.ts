/**
 * Phase 53: Memory Insights Service
 *
 * Provides deep analysis of the 4-layer memory system:
 * - Memory timeline (creation over time)
 * - Memory conflicts detection
 * - Memory curation suggestions
 * - Impact analysis (which memories influence AI responses most)
 */

import { queryContext, AIContext } from '../utils/database-context';
import { logger } from '../utils/logger';

// ===========================================
// Types
// ===========================================

export interface MemoryTimelineEntry {
  date: string;
  layer: 'working' | 'episodic' | 'short_term' | 'long_term';
  count: number;
}

export interface MemoryConflict {
  id: string;
  memory1: { id: string; content: string; layer: string; created: string };
  memory2: { id: string; content: string; layer: string; created: string };
  conflictType: 'contradiction' | 'outdated' | 'duplicate';
  confidence: number;
}

export interface CurationSuggestion {
  id: string;
  memoryId: string;
  content: string;
  layer: string;
  suggestion: 'archive' | 'promote' | 'merge' | 'delete';
  reason: string;
  priority: number;
}

export interface MemoryImpact {
  memoryId: string;
  content: string;
  layer: string;
  accessCount: number;
  lastAccessed: string | null;
  influenceScore: number;
}

export interface MemoryStatsResult {
  totalMemories: number;
  byLayer: Record<string, number>;
  averageAge: number;
  oldestMemory: string | null;
  newestMemory: string | null;
  growthRate: number;
}

// ===========================================
// Layer Definitions
// ===========================================

interface LayerConfig {
  name: 'working' | 'episodic' | 'short_term' | 'long_term';
  table: string;
  contentColumn: string;
  createdColumn: string;
  strengthColumn: string | null;
}

const LAYERS: LayerConfig[] = [
  { name: 'working', table: 'working_memory', contentColumn: 'content', createdColumn: 'created_at', strengthColumn: null },
  { name: 'episodic', table: 'episodic_memories', contentColumn: 'content', createdColumn: 'created_at', strengthColumn: 'importance' },
  { name: 'short_term', table: 'memory', contentColumn: 'content', createdColumn: 'created_at', strengthColumn: 'strength' },
  { name: 'long_term', table: 'long_term_memory', contentColumn: 'content', createdColumn: 'created_at', strengthColumn: 'strength' },
];

// ===========================================
// Helper: Safe query with table-not-found handling
// ===========================================

async function safeQuery(
  context: AIContext,
  sql: string,
  params?: (string | number | boolean | null | undefined)[]
): Promise<{ rows: Record<string, unknown>[] }> {
  try {
    return await queryContext(context, sql, params);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    // Table or column doesn't exist — return empty
    if (msg.includes('does not exist') || msg.includes('42P01') || msg.includes('42703')) {
      logger.debug('Memory insights: table/column not found, returning empty', {
        operation: 'memoryInsights',
        sql: sql.substring(0, 80),
      });
      return { rows: [] };
    }
    throw error;
  }
}

// ===========================================
// getMemoryTimeline
// ===========================================

export async function getMemoryTimeline(
  context: AIContext,
  from: string,
  to: string,
  granularity: 'day' | 'week' | 'month' = 'day'
): Promise<MemoryTimelineEntry[]> {
  const entries: MemoryTimelineEntry[] = [];

  for (const layer of LAYERS) {
    try {
      const result = await safeQuery(
        context,
        `SELECT date_trunc($1, ${layer.createdColumn})::date AS date, COUNT(*)::int AS count
         FROM ${layer.table}
         WHERE ${layer.createdColumn} >= $2::timestamp
           AND ${layer.createdColumn} <= $3::timestamp
         GROUP BY date_trunc($1, ${layer.createdColumn})
         ORDER BY date_trunc($1, ${layer.createdColumn})`,
        [granularity, from, to]
      );

      for (const row of result.rows) {
        entries.push({
          date: String(row.date),
          layer: layer.name,
          count: Number(row.count),
        });
      }
    } catch (error) {
      logger.error(`Memory timeline error for layer ${layer.name}`, error instanceof Error ? error : undefined, {
        operation: 'memoryInsights',
        context,
        layer: layer.name,
      });
    }
  }

  // Sort by date
  entries.sort((a, b) => a.date.localeCompare(b.date));
  return entries;
}

// ===========================================
// detectConflicts
// ===========================================

export async function detectConflicts(
  context: AIContext,
  limit: number = 20
): Promise<MemoryConflict[]> {
  const conflicts: MemoryConflict[] = [];
  let conflictIndex = 0;

  // 1. Duplicate detection: find memories with very similar content within same layer
  for (const layer of LAYERS) {
    try {
      const result = await safeQuery(
        context,
        `SELECT a.id AS id1, a.${layer.contentColumn} AS content1, a.${layer.createdColumn} AS created1,
                b.id AS id2, b.${layer.contentColumn} AS content2, b.${layer.createdColumn} AS created2
         FROM ${layer.table} a
         JOIN ${layer.table} b ON a.id < b.id
         WHERE LENGTH(a.${layer.contentColumn}) > 10
           AND LENGTH(b.${layer.contentColumn}) > 10
           AND a.${layer.contentColumn} ILIKE '%' || LEFT(b.${layer.contentColumn}, 50) || '%'
         LIMIT $1`,
        [Math.ceil(limit / 3)]
      );

      for (const row of result.rows) {
        conflicts.push({
          id: `conflict-dup-${conflictIndex++}`,
          memory1: {
            id: String(row.id1),
            content: String(row.content1).substring(0, 200),
            layer: layer.name,
            created: String(row.created1),
          },
          memory2: {
            id: String(row.id2),
            content: String(row.content2).substring(0, 200),
            layer: layer.name,
            created: String(row.created2),
          },
          conflictType: 'duplicate',
          confidence: 0.8,
        });
      }
    } catch (error) {
      logger.debug(`Conflict detection skipped for ${layer.name}: ${error instanceof Error ? error.message : String(error)}`, {
        operation: 'memoryInsights',
      });
    }
  }

  // 2. Outdated detection: long-term memories older than 90 days that haven't been updated
  try {
    const result = await safeQuery(
      context,
      `SELECT id, content, created_at, updated_at
       FROM long_term_memory
       WHERE created_at < NOW() - INTERVAL '90 days'
         AND (updated_at IS NULL OR updated_at < NOW() - INTERVAL '90 days')
       ORDER BY created_at ASC
       LIMIT $1`,
      [Math.ceil(limit / 3)]
    );

    for (const row of result.rows) {
      conflicts.push({
        id: `conflict-old-${conflictIndex++}`,
        memory1: {
          id: String(row.id),
          content: String(row.content).substring(0, 200),
          layer: 'long_term',
          created: String(row.created_at),
        },
        memory2: {
          id: String(row.id),
          content: 'No recent updates or access in 90+ days',
          layer: 'long_term',
          created: String(row.updated_at || row.created_at),
        },
        conflictType: 'outdated',
        confidence: 0.6,
      });
    }
  } catch (error) {
    logger.debug(`Outdated detection skipped: ${error instanceof Error ? error.message : String(error)}`, {
      operation: 'memoryInsights',
    });
  }

  return conflicts.slice(0, limit);
}

// ===========================================
// getCurationSuggestions
// ===========================================

export async function getCurationSuggestions(
  context: AIContext
): Promise<CurationSuggestion[]> {
  const suggestions: CurationSuggestion[] = [];
  let suggestionIndex = 0;

  // 1. Archive: old working memory items (>7 days)
  try {
    const result = await safeQuery(
      context,
      `SELECT id, content, created_at
       FROM working_memory
       WHERE created_at < NOW() - INTERVAL '7 days'
       ORDER BY created_at ASC
       LIMIT 10`
    );

    for (const row of result.rows) {
      suggestions.push({
        id: `sug-${suggestionIndex++}`,
        memoryId: String(row.id),
        content: String(row.content).substring(0, 200),
        layer: 'working',
        suggestion: 'archive',
        reason: 'Working memory item older than 7 days — likely no longer actively relevant',
        priority: 7,
      });
    }
  } catch (error) {
    logger.debug(`Curation archive check skipped: ${error instanceof Error ? error.message : String(error)}`, {
      operation: 'memoryInsights',
    });
  }

  // 2. Promote: frequently updated short-term memories → long-term candidates
  try {
    const result = await safeQuery(
      context,
      `SELECT id, content, created_at, updated_at, strength
       FROM memory
       WHERE strength > 0.7
         AND created_at < NOW() - INTERVAL '3 days'
       ORDER BY strength DESC
       LIMIT 10`
    );

    for (const row of result.rows) {
      suggestions.push({
        id: `sug-${suggestionIndex++}`,
        memoryId: String(row.id),
        content: String(row.content).substring(0, 200),
        layer: 'short_term',
        suggestion: 'promote',
        reason: `High strength (${Number(row.strength).toFixed(2)}) short-term memory — good candidate for long-term storage`,
        priority: 8,
      });
    }
  } catch (error) {
    logger.debug(`Curation promote check skipped: ${error instanceof Error ? error.message : String(error)}`, {
      operation: 'memoryInsights',
    });
  }

  // 3. Delete: very old, low-strength memories
  try {
    const result = await safeQuery(
      context,
      `SELECT id, content, created_at, strength
       FROM long_term_memory
       WHERE strength < 0.2
         AND created_at < NOW() - INTERVAL '60 days'
       ORDER BY strength ASC
       LIMIT 10`
    );

    for (const row of result.rows) {
      suggestions.push({
        id: `sug-${suggestionIndex++}`,
        memoryId: String(row.id),
        content: String(row.content).substring(0, 200),
        layer: 'long_term',
        suggestion: 'delete',
        reason: `Very low strength (${Number(row.strength).toFixed(2)}) and older than 60 days — likely obsolete`,
        priority: 5,
      });
    }
  } catch (error) {
    logger.debug(`Curation delete check skipped: ${error instanceof Error ? error.message : String(error)}`, {
      operation: 'memoryInsights',
    });
  }

  // Sort by priority descending
  suggestions.sort((a, b) => b.priority - a.priority);
  return suggestions;
}

// ===========================================
// getMemoryImpact
// ===========================================

export async function getMemoryImpact(
  context: AIContext,
  limit: number = 20
): Promise<MemoryImpact[]> {
  const impacts: MemoryImpact[] = [];

  // Long-term memories with strength scores
  try {
    const result = await safeQuery(
      context,
      `SELECT id, content, strength, updated_at, created_at,
              COALESCE(access_count, 0)::int AS access_count
       FROM long_term_memory
       ORDER BY COALESCE(strength, 0) DESC, updated_at DESC NULLS LAST
       LIMIT $1`,
      [Math.ceil(limit / 2)]
    );

    for (const row of result.rows) {
      const strength = Number(row.strength) || 0;
      const accessCount = Number(row.access_count) || 0;
      impacts.push({
        memoryId: String(row.id),
        content: String(row.content).substring(0, 200),
        layer: 'long_term',
        accessCount,
        lastAccessed: row.updated_at ? String(row.updated_at) : null,
        influenceScore: Math.round((strength * 0.7 + Math.min(accessCount / 100, 1) * 0.3) * 100) / 100,
      });
    }
  } catch (error) {
    logger.debug(`Impact analysis skipped for long_term: ${error instanceof Error ? error.message : String(error)}`, {
      operation: 'memoryInsights',
    });
  }

  // Episodic memories with importance scores
  try {
    const result = await safeQuery(
      context,
      `SELECT id, content, importance, updated_at, created_at
       FROM episodic_memories
       ORDER BY COALESCE(importance, 0) DESC, created_at DESC
       LIMIT $1`,
      [Math.ceil(limit / 2)]
    );

    for (const row of result.rows) {
      const importance = Number(row.importance) || 0;
      impacts.push({
        memoryId: String(row.id),
        content: String(row.content).substring(0, 200),
        layer: 'episodic',
        accessCount: 0,
        lastAccessed: row.updated_at ? String(row.updated_at) : null,
        influenceScore: Math.round(importance * 100) / 100,
      });
    }
  } catch (error) {
    logger.debug(`Impact analysis skipped for episodic: ${error instanceof Error ? error.message : String(error)}`, {
      operation: 'memoryInsights',
    });
  }

  // Sort by influence score descending
  impacts.sort((a, b) => b.influenceScore - a.influenceScore);
  return impacts.slice(0, limit);
}

// ===========================================
// getMemoryStats
// ===========================================

export async function getMemoryStats(
  context: AIContext
): Promise<MemoryStatsResult> {
  const byLayer: Record<string, number> = {};
  let totalMemories = 0;
  let oldestMemory: string | null = null;
  let newestMemory: string | null = null;
  let growthRate = 0;

  // Count per layer
  for (const layer of LAYERS) {
    try {
      const result = await safeQuery(
        context,
        `SELECT COUNT(*)::int AS count FROM ${layer.table}`
      );
      const count = Number(result.rows[0]?.count) || 0;
      byLayer[layer.name] = count;
      totalMemories += count;
    } catch (error) {
      byLayer[layer.name] = 0;
      logger.debug(`Stats count skipped for ${layer.name}: ${error instanceof Error ? error.message : String(error)}`, {
        operation: 'memoryInsights',
      });
    }
  }

  // Get oldest and newest across all layers
  for (const layer of LAYERS) {
    try {
      const result = await safeQuery(
        context,
        `SELECT MIN(${layer.createdColumn})::text AS min_date,
                MAX(${layer.createdColumn})::text AS max_date
         FROM ${layer.table}`
      );

      if (result.rows.length > 0 && result.rows[0].min_date) {
        const minDate = String(result.rows[0].min_date);
        const maxDate = String(result.rows[0].max_date);
        if (!oldestMemory || minDate < oldestMemory) {
          oldestMemory = minDate;
        }
        if (!newestMemory || maxDate > newestMemory) {
          newestMemory = maxDate;
        }
      }
    } catch {
      // skip
    }
  }

  // Growth rate: memories created in last 30 days
  for (const layer of LAYERS) {
    try {
      const result = await safeQuery(
        context,
        `SELECT COUNT(*)::int AS count
         FROM ${layer.table}
         WHERE ${layer.createdColumn} >= NOW() - INTERVAL '30 days'`
      );
      growthRate += Number(result.rows[0]?.count) || 0;
    } catch {
      // skip
    }
  }

  // Average as per-day rate
  growthRate = Math.round((growthRate / 30) * 100) / 100;

  // Calculate average age in days
  let averageAge = 0;
  if (totalMemories > 0 && oldestMemory && newestMemory) {
    const now = new Date();
    const oldest = new Date(oldestMemory);
    const diffMs = now.getTime() - oldest.getTime();
    const totalDays = diffMs / (1000 * 60 * 60 * 24);
    averageAge = Math.round(totalDays / 2); // Rough estimate: half the total span
  }

  return {
    totalMemories,
    byLayer,
    averageAge,
    oldestMemory,
    newestMemory,
    growthRate,
  };
}
