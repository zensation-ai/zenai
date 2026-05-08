/**
 * Temporal Index
 *
 * Provides time-based queries across the graph event subgraph.
 * Supports activity scoring, trend detection, and temporal entity ranking.
 *
 * Bi-temporal helpers (Phase H1.2)
 * --------------------------------
 * The existing functions (`getTemporalEntityRanking`, `getEntityTimeline`)
 * filter on `created_at` — i.e. ingest time. Phase H1.2 added the
 * `event_time` / `event_time_precision` / `valid_from` / `valid_to`
 * columns to graph_events so the system can distinguish ingest from
 * the real-world event timestamp. Two new helpers expose this:
 *
 *   - `queryEventsByEventTime`          — filter on event_time directly
 *   - `getBiTemporalAsOfSnapshot`       — "as-of"-style: rows where
 *                                          event_time ≤ asOfEvent AND
 *                                          created_at ≤ asOfIngest
 *
 * Both use COALESCE(event_time, created_at) so they degrade gracefully on
 * legacy rows where event_time is NULL — the row is treated as if its
 * event happened at ingest time, which matches what the system implicitly
 * assumed before this migration.
 *
 * @module services/knowledge-graph/temporal-index
 */

import { AIContext, queryContext } from '../../utils/database-context';
import type { TemporalPrecision } from '../memory/temporal-normalizer';
import type { GraphEvent, GraphEventType } from './event-subgraph';

// ===========================================
// Types
// ===========================================

export interface TemporalEntityRank {
  entityId: string;
  entityName: string;
  totalEvents: number;
  recentEvents: number;  // last 7 days
  trend: 'rising' | 'stable' | 'declining';
  activityScore: number;  // 0-1
}

// ===========================================
// Temporal Entity Ranking
// ===========================================

/**
 * Rank entities by temporal activity: recent events, total events, and trend direction.
 */
export async function getTemporalEntityRanking(
  context: AIContext,
  limit: number = 20
): Promise<TemporalEntityRank[]> {
  const result = await queryContext(context, `
    WITH recent AS (
      SELECT
        target_entity_id as entity_id,
        COUNT(*) as recent_count
      FROM graph_events
      WHERE context = $1
        AND target_entity_id IS NOT NULL
        AND created_at >= NOW() - INTERVAL '7 days'
      GROUP BY target_entity_id
    ),
    older AS (
      SELECT
        target_entity_id as entity_id,
        COUNT(*) as older_count
      FROM graph_events
      WHERE context = $1
        AND target_entity_id IS NOT NULL
        AND created_at >= NOW() - INTERVAL '30 days'
        AND created_at < NOW() - INTERVAL '7 days'
      GROUP BY target_entity_id
    ),
    total AS (
      SELECT
        target_entity_id as entity_id,
        COUNT(*) as total_count
      FROM graph_events
      WHERE context = $1 AND target_entity_id IS NOT NULL
      GROUP BY target_entity_id
    )
    SELECT
      t.entity_id,
      ke.name as entity_name,
      COALESCE(t.total_count, 0) as total_events,
      COALESCE(r.recent_count, 0) as recent_events,
      COALESCE(o.older_count, 0) as older_events
    FROM total t
    LEFT JOIN recent r ON t.entity_id = r.entity_id
    LEFT JOIN older o ON t.entity_id = o.entity_id
    LEFT JOIN knowledge_entities ke ON t.entity_id = ke.id
    ORDER BY COALESCE(r.recent_count, 0) DESC, t.total_count DESC
    LIMIT $2
  `, [context, limit]);

  return result.rows.map((row: Record<string, unknown>) => {
    const recent = parseInt(String(row.recent_events), 10);
    const older = parseInt(String(row.older_events), 10);
    const total = parseInt(String(row.total_events), 10);

    // Determine trend: compare recent week to average weekly rate over prior 23 days
    const weeklyAvgOlder = older / 3.29;  // ~23 days / 7
    let trend: 'rising' | 'stable' | 'declining' = 'stable';
    if (recent > weeklyAvgOlder * 1.5) trend = 'rising';
    else if (recent < weeklyAvgOlder * 0.5 && older > 0) trend = 'declining';

    // Activity score: log-normalized (0-1)
    const activityScore = Math.min(1, Math.log(total + 1) / Math.log(100));

    return {
      entityId: row.entity_id as string,
      entityName: (row.entity_name as string) || 'Unknown',
      totalEvents: total,
      recentEvents: recent,
      trend,
      activityScore,
    };
  });
}

// ===========================================
// Entity Timeline
// ===========================================

/**
 * Get the event timeline for a specific entity, most recent first.
 */
export async function getEntityTimeline(
  context: AIContext,
  entityId: string,
  limit: number = 50
): Promise<Array<{ eventType: string; actor: string; payload: Record<string, unknown>; createdAt: Date }>> {
  const result = await queryContext(context, `
    SELECT event_type, actor, payload, created_at
    FROM graph_events
    WHERE context = $1 AND (target_entity_id = $2 OR $2 = ANY(related_entity_ids))
    ORDER BY created_at DESC
    LIMIT $3
  `, [context, entityId, limit]);

  return result.rows.map((row: Record<string, unknown>) => ({
    eventType: row.event_type as string,
    actor: row.actor as string,
    payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : (row.payload as Record<string, unknown>) || {},
    createdAt: new Date(row.created_at as string),
  }));
}

// ===========================================
// Bi-temporal queries (Phase H1.2)
// ===========================================

/**
 * Query events by EVENT TIME (when the real-world event happened) rather
 * than INGEST TIME. Falls back to created_at on legacy rows where
 * event_time is NULL.
 *
 * Use this for LoCoMo Cat 2 questions where the right answer depends on
 * the event's real-world timestamp ("when did Caroline first mention X")
 * not on when we ingested the conversation.
 */
export async function queryEventsByEventTime(
  context: AIContext,
  eventTimeStart: Date,
  eventTimeEnd: Date,
  options: {
    eventType?: GraphEventType;
    entityId?: string;
    limit?: number;
  } = {}
): Promise<GraphEvent[]> {
  let sql = `
    SELECT *
    FROM graph_events
    WHERE context = $1
      AND COALESCE(event_time, created_at) >= $2
      AND COALESCE(event_time, created_at) <= $3
  `;
  const params: (string | Date | number)[] = [context, eventTimeStart, eventTimeEnd];
  let p = 4;

  if (options.eventType) {
    sql += ` AND event_type = $${p++}`;
    params.push(options.eventType);
  }
  if (options.entityId) {
    sql += ` AND (target_entity_id = $${p} OR $${p} = ANY(related_entity_ids))`;
    params.push(options.entityId);
    p++;
  }

  sql += ` ORDER BY COALESCE(event_time, created_at) DESC LIMIT $${p}`;
  params.push(options.limit ?? 50);

  const result = await queryContext(context, sql, params);
  return result.rows.map(rowToGraphEvent);
}

/**
 * Bi-temporal "as-of" snapshot: returns rows where the real-world event
 * happened on/before `asOfEventTime` AND we ingested the row on/before
 * `asOfIngestTime`. Useful for replaying "what did we know at ingest
 * time T about events through event time E?" — e.g. when reproducing a
 * historical retrieval result for ablation.
 *
 * Rows with NULL event_time are treated as if event_time = created_at.
 */
export async function getBiTemporalAsOfSnapshot(
  context: AIContext,
  asOfEventTime: Date,
  asOfIngestTime: Date,
  options: {
    eventType?: GraphEventType;
    entityId?: string;
    limit?: number;
  } = {}
): Promise<GraphEvent[]> {
  let sql = `
    SELECT *
    FROM graph_events
    WHERE context = $1
      AND COALESCE(event_time, created_at) <= $2
      AND created_at <= $3
  `;
  const params: (string | Date | number)[] = [context, asOfEventTime, asOfIngestTime];
  let p = 4;

  if (options.eventType) {
    sql += ` AND event_type = $${p++}`;
    params.push(options.eventType);
  }
  if (options.entityId) {
    sql += ` AND (target_entity_id = $${p} OR $${p} = ANY(related_entity_ids))`;
    params.push(options.entityId);
    p++;
  }

  sql += ` ORDER BY COALESCE(event_time, created_at) DESC LIMIT $${p}`;
  params.push(options.limit ?? 50);

  const result = await queryContext(context, sql, params);
  return result.rows.map(rowToGraphEvent);
}

function rowToGraphEvent(row: Record<string, unknown>): GraphEvent {
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
