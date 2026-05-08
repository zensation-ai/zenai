/**
 * Event Subgraph (Layer 1)
 *
 * Records temporal interactions: tool invocations, entity references, search hits, chat turns.
 * Provides time-indexed queries and activity scoring for entities.
 * Auto-prunes events older than 90 days.
 *
 * @module services/knowledge-graph/event-subgraph
 */

import { AIContext, queryContext } from '../../utils/database-context';
import { logger } from '../../utils/logger';
import type { TemporalPrecision } from '../memory/temporal-normalizer';

// ===========================================
// Types
// ===========================================

export type GraphEventType = 'tool_invocation' | 'entity_creation' | 'search_hit' | 'chat_reference' | 'relation_creation';

export interface GraphEvent {
  id: string;
  eventType: GraphEventType;
  actor: string;  // 'user', 'agent:researcher', 'system:rag', etc.
  targetEntityId: string | null;
  relatedEntityIds: string[];
  payload: Record<string, unknown>;
  context: string;
  createdAt: Date;
  // Bi-temporal columns (Phase H1.2). NULL on legacy rows; filled when the
  // caller knows the real-world event timestamp distinct from ingest time.
  eventTime: Date | null;
  eventTimePrecision: TemporalPrecision | null;
  validFrom: Date | null;
  validTo: Date | null;
}

// ===========================================
// Event Recording
// ===========================================

/**
 * Record a graph event to the event subgraph.
 * Fire-and-forget safe: logs warnings on failure instead of throwing.
 *
 * Bi-temporal usage (Phase H1.2)
 * ------------------------------
 * Pass `eventTime` to record WHEN the real-world event happened, distinct
 * from when we (the system) ingested it. The migration
 * `phase_h_1_2_bi_temporal_edges.sql` adds the columns; until it runs the
 * INSERT silently includes the new columns and PostgreSQL rejects the
 * statement — so during the migration window the function falls back to a
 * legacy INSERT (no event_time columns) automatically when the first
 * bi-temporal INSERT errors with "column ... does not exist".
 *
 * For caller convenience the bi-temporal columns are accepted as either
 * `Date` or ISO-8601 string. Pass the matching `eventTimePrecision` so
 * downstream queries can correctly handle 'year'-precision events.
 */
export async function recordEvent(
  context: AIContext,
  eventType: GraphEventType,
  actor: string,
  options: {
    targetEntityId?: string;
    relatedEntityIds?: string[];
    payload?: Record<string, unknown>;
    eventTime?: Date | string | null;
    eventTimePrecision?: TemporalPrecision | null;
    validFrom?: Date | string | null;
    validTo?: Date | string | null;
  } = {}
): Promise<string> {
  const params = [
    eventType,
    actor,
    options.targetEntityId || null,
    options.relatedEntityIds || [],
    JSON.stringify(options.payload || {}),
    context,
  ];
  const hasBiTemporal =
    options.eventTime !== undefined ||
    options.eventTimePrecision !== undefined ||
    options.validFrom !== undefined ||
    options.validTo !== undefined;
  try {
    if (hasBiTemporal) {
      const result = await queryContext(context, `
        INSERT INTO graph_events (
          event_type, actor, target_entity_id, related_entity_ids, payload, context,
          event_time, event_time_precision, valid_from, valid_to
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING id
      `, [
        ...params,
        options.eventTime ?? null,
        options.eventTimePrecision ?? null,
        options.validFrom ?? null,
        options.validTo ?? null,
      ]);
      return result.rows[0].id;
    }
    const result = await queryContext(context, `
      INSERT INTO graph_events (event_type, actor, target_entity_id, related_entity_ids, payload, context)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id
    `, params);
    return result.rows[0].id;
  } catch (err) {
    const msg = (err as Error).message;
    // Migration window: bi-temporal columns not yet applied → retry without.
    // PostgreSQL emits 'column "event_time" does not exist' for missing cols.
    if (hasBiTemporal && /column .*event_time.* does not exist|column .*valid_(from|to).* does not exist/i.test(msg)) {
      try {
        const result = await queryContext(context, `
          INSERT INTO graph_events (event_type, actor, target_entity_id, related_entity_ids, payload, context)
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING id
        `, params);
        logger.warn('Bi-temporal columns not yet migrated; recordEvent fell back to legacy schema', { eventType });
        return result.rows[0].id;
      } catch (fallbackErr) {
        logger.warn('Failed to record graph event (fallback path)', { eventType, error: (fallbackErr as Error).message });
        return '';
      }
    }
    logger.warn('Failed to record graph event', { eventType, error: msg });
    return '';
  }
}

// ===========================================
// Time-Range Queries
// ===========================================

/**
 * Query events within a time range with optional filters.
 */
export async function queryEventsByTimeRange(
  context: AIContext,
  startDate: Date,
  endDate: Date,
  options: {
    eventType?: GraphEventType;
    entityId?: string;
    limit?: number;
  } = {}
): Promise<GraphEvent[]> {
  // SELECT *: bi-temporal columns (event_time / event_time_precision /
  // valid_from / valid_to) are returned when present, NULL on legacy rows
  // and pre-migration schemas. mapEventRow handles both shapes.
  let sql = `
    SELECT *
    FROM graph_events
    WHERE context = $1 AND created_at >= $2 AND created_at <= $3
  `;
  const params: (string | Date | number)[] = [context, startDate, endDate];
  let paramIdx = 4;

  if (options.eventType) {
    sql += ` AND event_type = $${paramIdx++}`;
    params.push(options.eventType);
  }

  if (options.entityId) {
    sql += ` AND (target_entity_id = $${paramIdx} OR $${paramIdx} = ANY(related_entity_ids))`;
    params.push(options.entityId);
    paramIdx++;
  }

  sql += ` ORDER BY created_at DESC LIMIT $${paramIdx}`;
  params.push(options.limit || 50);

  const result = await queryContext(context, sql, params);
  return result.rows.map(mapEventRow);
}

// ===========================================
// Activity Scoring
// ===========================================

/**
 * Calculate activity score for an entity within a time window.
 * Returns event counts, recency score (exponential decay), and last activity timestamp.
 */
export async function getEntityActivityScore(
  context: AIContext,
  entityId: string,
  windowDays: number = 7
): Promise<{
  totalEvents: number;
  eventsByType: Record<string, number>;
  recencyScore: number;
  lastActivity: Date | null;
}> {
  const cutoff = new Date(Date.now() - windowDays * 86400000);

  const result = await queryContext(context, `
    SELECT
      event_type,
      COUNT(*) as count,
      MAX(created_at) as last_activity
    FROM graph_events
    WHERE context = $1
      AND (target_entity_id = $2 OR $2 = ANY(related_entity_ids))
      AND created_at >= $3
    GROUP BY event_type
  `, [context, entityId, cutoff]);

  const eventsByType: Record<string, number> = {};
  let totalEvents = 0;
  let lastActivity: Date | null = null;

  for (const row of result.rows) {
    const count = parseInt(row.count, 10);
    eventsByType[row.event_type] = count;
    totalEvents += count;
    const rowDate = new Date(row.last_activity);
    if (!lastActivity || rowDate > lastActivity) {
      lastActivity = rowDate;
    }
  }

  // Recency score: exponential decay, 1.0 for today, ~0.37 at windowDays
  const daysSinceLastActivity = lastActivity
    ? (Date.now() - lastActivity.getTime()) / 86400000
    : windowDays;
  const recencyScore = Math.exp(-daysSinceLastActivity / windowDays);

  return { totalEvents, eventsByType, recencyScore, lastActivity };
}

// ===========================================
// Activity Heatmap
// ===========================================

/**
 * Get daily event counts for an activity heatmap visualization.
 */
export async function getActivityHeatmap(
  context: AIContext,
  windowDays: number = 30
): Promise<Array<{ date: string; count: number }>> {
  const cutoff = new Date(Date.now() - windowDays * 86400000);

  const result = await queryContext(context, `
    SELECT
      DATE(created_at) as date,
      COUNT(*) as count
    FROM graph_events
    WHERE context = $1 AND created_at >= $2
    GROUP BY DATE(created_at)
    ORDER BY date ASC
  `, [context, cutoff]);

  return result.rows.map((row: Record<string, unknown>) => ({
    date: row.date instanceof Date
      ? row.date.toISOString().split('T')[0]
      : String(row.date),
    count: parseInt(String(row.count), 10),
  }));
}

// ===========================================
// Pruning
// ===========================================

/**
 * Delete events older than retentionDays. Default: 90 days.
 */
export async function pruneOldEvents(context: AIContext, retentionDays: number = 90): Promise<number> {
  const cutoff = new Date(Date.now() - retentionDays * 86400000);

  const result = await queryContext(context, `
    DELETE FROM graph_events WHERE context = $1 AND created_at < $2
  `, [context, cutoff]);

  const deleted = result.rowCount || 0;
  if (deleted > 0) {
    logger.info('Pruned old graph events', { context, deleted, retentionDays });
  }
  return deleted;
}

// ===========================================
// Row Mapper
// ===========================================

function mapEventRow(row: Record<string, unknown>): GraphEvent {
  return {
    id: row.id as string,
    eventType: row.event_type as GraphEventType,
    actor: row.actor as string,
    targetEntityId: (row.target_entity_id as string) || null,
    relatedEntityIds: (row.related_entity_ids as string[]) || [],
    payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : (row.payload as Record<string, unknown>) || {},
    context: row.context as string,
    createdAt: new Date(row.created_at as string),
    eventTime: row.event_time ? new Date(row.event_time as string) : null,
    eventTimePrecision: (row.event_time_precision as TemporalPrecision | null) ?? null,
    validFrom: row.valid_from ? new Date(row.valid_from as string) : null,
    validTo: row.valid_to ? new Date(row.valid_to as string) : null,
  };
}
