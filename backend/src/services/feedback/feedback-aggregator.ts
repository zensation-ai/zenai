/**
 * Feedback Aggregator — Phase 137
 *
 * Computes statistics and trends from feedback events, both in-memory
 * (from an array) and from the database.
 */

import { logger } from '../../utils/logger';
import { queryContext } from '../../utils/database-context';
import type { FeedbackEvent, FeedbackType } from './feedback-bus';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FeedbackSummary {
  type: FeedbackType;
  totalCount: number;
  avgValue: number;
  positiveRate: number;
  recentTrend: number;
}

export interface SubsystemReport {
  subsystem: string;
  summaries: FeedbackSummary[];
  overallScore: number;
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/**
 * Proportion of values that are strictly greater than 0.
 * Returns 0 for an empty array.
 */
export function computePositiveRate(values: number[]): number {
  if (values.length === 0) return 0;
  const positiveCount = values.filter((v) => v > 0).length;
  return positiveCount / values.length;
}

/**
 * Trend = average of last `recentWindow` values minus the average of the rest.
 * If there are fewer than `recentWindow` values the trend is 0.
 */
export function computeTrend(
  values: number[],
  recentWindow: number = 10,
): number {
  if (values.length < recentWindow) return 0;

  const recent = values.slice(-recentWindow);
  const older = values.slice(0, -recentWindow);

  const avgRecent = recent.reduce((a, b) => a + b, 0) / recent.length;

  if (older.length === 0) return 0;
  const avgOlder = older.reduce((a, b) => a + b, 0) / older.length;

  return avgRecent - avgOlder;
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

/**
 * Group events by type and compute summary statistics for each type.
 * Returns an empty array when no events are provided.
 */
export function aggregateFeedback(events: FeedbackEvent[]): FeedbackSummary[] {
  if (events.length === 0) return [];

  const groups = new Map<FeedbackType, FeedbackEvent[]>();
  for (const event of events) {
    if (!groups.has(event.type)) {
      groups.set(event.type, []);
    }
    groups.get(event.type)!.push(event);
  }

  const summaries: FeedbackSummary[] = [];

  for (const [type, typeEvents] of groups) {
    const values = typeEvents.map((e) => e.value);
    const totalCount = values.length;
    const avgValue = values.reduce((a, b) => a + b, 0) / totalCount;
    const positiveRate = computePositiveRate(values);
    const recentTrend = computeTrend(values);

    summaries.push({ type, totalCount, avgValue, positiveRate, recentTrend });
  }

  return summaries;
}

/**
 * Build a per-subsystem report by filtering events to those whose `source`
 * matches the subsystem, then aggregating. The overall score is the weighted
 * average of avgValue across types (weight = totalCount).
 */
export function buildSubsystemReport(
  subsystem: string,
  events: FeedbackEvent[],
): SubsystemReport {
  const filtered = events.filter((e) => e.source === subsystem);
  const summaries = aggregateFeedback(filtered);

  let weightedSum = 0;
  let totalWeight = 0;
  for (const s of summaries) {
    weightedSum += s.avgValue * s.totalCount;
    totalWeight += s.totalCount;
  }
  const overallScore = totalWeight > 0 ? weightedSum / totalWeight : 0;

  return { subsystem, summaries, overallScore };
}

// ---------------------------------------------------------------------------
// DB loading
// ---------------------------------------------------------------------------

/**
 * Load feedback summaries from the database, optionally filtered by type.
 */
export async function loadFeedbackSummary(
  context: string,
  type?: FeedbackType,
): Promise<FeedbackSummary[]> {
  try {
    const params: unknown[] = [];
    let whereClause = '';
    if (type) {
      whereClause = 'WHERE type = $1';
      params.push(type);
    }

    const result = await queryContext(
      context,
      `SELECT type,
              COUNT(*)::int AS total_count,
              AVG(value)::float AS avg_value
       FROM feedback_events
       ${whereClause}
       GROUP BY type`,
      params,
    );

    return (result.rows || []).map((row: Record<string, unknown>) => ({
      type: row.type as FeedbackType,
      totalCount: Number(row.total_count) || 0,
      avgValue: Number(row.avg_value) || 0,
      positiveRate: 0, // not computed from aggregate query
      recentTrend: 0,  // not computed from aggregate query
    }));
  } catch (err) {
    logger.error('Failed to load feedback summary', { error: err, context });
    return [];
  }
}
