/**
 * Phase 134: Prediction Engine — Pattern Tracker
 *
 * Tracks temporal and sequential user activity patterns to enable
 * intent prediction. Extracts temporal patterns (hour/day/domain)
 * and sequential patterns (intent bigrams with probabilities).
 */

import { logger } from '../../utils/logger';
import { queryContext } from '../../utils/database-context';
import type { AIContext } from '../../types/context';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TemporalPattern {
  timeOfDay: number;
  dayOfWeek: number;
  domain: string;
  intent: string;
  frequency: number;
}

export interface SequentialPattern {
  fromIntent: string;
  toIntent: string;
  count: number;
  probability: number;
}

export interface ActivityRecord {
  timestamp: Date;
  domain: string;
  intent: string;
  entities?: string[];
}

// ---------------------------------------------------------------------------
// Time helpers
// ---------------------------------------------------------------------------

export function getHourOfDay(date: Date): number {
  return date.getHours();
}

export function getDayOfWeek(date: Date): number {
  return date.getDay();
}

// ---------------------------------------------------------------------------
// extractTemporalPatterns
// ---------------------------------------------------------------------------

export function extractTemporalPatterns(activities: ActivityRecord[]): TemporalPattern[] {
  if (activities.length === 0) {return [];}

  // Group by (hour, dayOfWeek, domain, intent)
  const groups = new Map<string, TemporalPattern>();

  for (const activity of activities) {
    const hour = getHourOfDay(activity.timestamp);
    const day = getDayOfWeek(activity.timestamp);
    const key = `${hour}:${day}:${activity.domain}:${activity.intent}`;

    const existing = groups.get(key);
    if (existing) {
      existing.frequency++;
    } else {
      groups.set(key, {
        timeOfDay: hour,
        dayOfWeek: day,
        domain: activity.domain,
        intent: activity.intent,
        frequency: 1,
      });
    }
  }

  // Sort by frequency descending
  const patterns = Array.from(groups.values());
  patterns.sort((a, b) => b.frequency - a.frequency);

  return patterns;
}

// ---------------------------------------------------------------------------
// extractSequentialPatterns
// ---------------------------------------------------------------------------

export function extractSequentialPatterns(activities: ActivityRecord[]): SequentialPattern[] {
  if (activities.length < 2) {return [];}

  // Count bigrams
  const bigramCounts = new Map<string, number>();
  const fromCounts = new Map<string, number>();

  for (let i = 0; i < activities.length - 1; i++) {
    const fromIntent = activities[i].intent;
    const toIntent = activities[i + 1].intent;
    const key = `${fromIntent}→${toIntent}`;

    bigramCounts.set(key, (bigramCounts.get(key) || 0) + 1);
    fromCounts.set(fromIntent, (fromCounts.get(fromIntent) || 0) + 1);
  }

  // Compute probabilities
  const patterns: SequentialPattern[] = [];

  for (const [key, count] of bigramCounts.entries()) {
    const [fromIntent, toIntent] = key.split('→');
    const totalFromTransitions = fromCounts.get(fromIntent) || 1;

    patterns.push({
      fromIntent,
      toIntent,
      count,
      probability: count / totalFromTransitions,
    });
  }

  // Sort by count descending
  patterns.sort((a, b) => b.count - a.count);

  return patterns;
}

// ---------------------------------------------------------------------------
// findDominantPattern
// ---------------------------------------------------------------------------

export function findDominantPattern(
  patterns: TemporalPattern[],
  currentHour: number,
  currentDay: number,
): TemporalPattern | null {
  if (patterns.length === 0) {return null;}

  // Find exact hour+day match first
  const exactMatches = patterns.filter(
    (p) => p.timeOfDay === currentHour && p.dayOfWeek === currentDay,
  );
  if (exactMatches.length > 0) {
    // Return the one with highest frequency
    return exactMatches.reduce((best, p) => (p.frequency > best.frequency ? p : best));
  }

  // Find closest hour match (same day)
  const sameDayPatterns = patterns.filter((p) => p.dayOfWeek === currentDay);
  if (sameDayPatterns.length > 0) {
    let closest: TemporalPattern | null = null;
    let closestDist = Infinity;
    for (const p of sameDayPatterns) {
      const dist = Math.abs(p.timeOfDay - currentHour);
      if (dist < closestDist || (dist === closestDist && closest && p.frequency > closest.frequency)) {
        closest = p;
        closestDist = dist;
      }
    }
    if (closest && closestDist <= 3) {
      return closest;
    }
  }

  // Find closest hour match (any day)
  let closest: TemporalPattern | null = null;
  let closestDist = Infinity;
  for (const p of patterns) {
    const dist = Math.abs(p.timeOfDay - currentHour);
    if (dist < closestDist || (dist === closestDist && closest && p.frequency > closest.frequency)) {
      closest = p;
      closestDist = dist;
    }
  }

  if (closest && closestDist <= 2) {
    return closest;
  }

  return null;
}

// ---------------------------------------------------------------------------
// recordActivity
// ---------------------------------------------------------------------------

export async function recordActivity(
  context: string,
  activity: ActivityRecord,
): Promise<void> {
  try {
    const sql = `INSERT INTO activity_patterns (timestamp, domain, intent, entities)
                 VALUES ($1, $2, $3, $4)`;
    await queryContext(context as AIContext, sql, [
      activity.timestamp.toISOString(),
      activity.domain,
      activity.intent,
      JSON.stringify(activity.entities || []),
    ]);
    logger.debug('Recorded activity pattern', { domain: activity.domain, intent: activity.intent });
  } catch (error) {
    // Fire-and-forget: log but do not throw
    logger.error('Failed to record activity pattern', error instanceof Error ? error : new Error(String(error)));
  }
}

// ---------------------------------------------------------------------------
// loadPatterns
// ---------------------------------------------------------------------------

export async function loadPatterns(
  context: string,
  userId?: string,
): Promise<TemporalPattern[]> {
  try {
    const sql = userId
      ? `SELECT timestamp, domain, intent, entities
         FROM activity_patterns
         WHERE user_id = $1
         ORDER BY timestamp DESC
         LIMIT 500`
      : `SELECT timestamp, domain, intent, entities
         FROM activity_patterns
         ORDER BY timestamp DESC
         LIMIT 500`;

    const params = userId ? [userId] : [];
    const result = await queryContext(context as AIContext, sql, params);

    if (!result.rows || result.rows.length === 0) {
      return [];
    }

    const activities: ActivityRecord[] = result.rows.map((r: Record<string, unknown>) => ({
      timestamp: new Date(r.timestamp as string),
      domain: r.domain as string,
      intent: r.intent as string,
      entities: typeof r.entities === 'string' ? JSON.parse(r.entities) : (r.entities as string[]),
    }));

    return extractTemporalPatterns(activities);
  } catch (error) {
    logger.error('Failed to load activity patterns', error instanceof Error ? error : new Error(String(error)));
    return [];
  }
}
