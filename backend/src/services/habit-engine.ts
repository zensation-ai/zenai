/**
 * Habit Engine Service (Phase 88)
 *
 * Detects user behavior patterns and generates actionable
 * habit improvement suggestions.
 */

import { v4 as uuidv4 } from 'uuid';
import { queryContext } from '../utils/database-context';
import type { AIContext } from '../types';
import { logger } from '../utils/logger';

// ─── Types ─────────────────────────────────────────────

export interface HabitPattern {
  id: string;
  pattern_type: 'routine' | 'productivity' | 'break';
  description: string;
  detected_at: string;
  confidence: number;
  data: Record<string, unknown>;
}

export interface HabitSuggestion {
  id: string;
  type: 'optimize' | 'break' | 'focus' | 'routine';
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high';
}

export interface HabitStats {
  deepWorkMinutes: number;
  taskCompletionRate: number;
  currentStreak: number;
  activitiesThisWeek: number;
  topPages: Array<{ page: string; count: number }>;
}

// ─── Record activity ──────────────────────────────────

export async function recordActivity(
  context: AIContext,
  userId: string,
  activityType: string,
  metadata: Record<string, unknown> = {},
): Promise<{ id: string }> {
  const id = uuidv4();
  const page = (metadata.page as string) ?? '';

  await queryContext(context, `
    INSERT INTO habit_activities (id, user_id, activity_type, page, metadata, created_at)
    VALUES ($1, $2, $3, $4, $5, NOW())
  `, [id, userId, activityType, page, JSON.stringify(metadata)]);

  return { id };
}

// ─── Detect patterns ──────────────────────────────────

export async function detectPatterns(
  context: AIContext,
  userId: string,
): Promise<HabitPattern[]> {
  const patterns: HabitPattern[] = [];

  try {
    // 1. Find recurring page visits at similar times
    const routineResult = await queryContext(context, `
      SELECT page,
             EXTRACT(HOUR FROM created_at) AS hour,
             COUNT(*) AS visit_count
      FROM habit_activities
      WHERE user_id = $1
        AND created_at > NOW() - INTERVAL '14 days'
        AND page IS NOT NULL AND page != ''
      GROUP BY page, EXTRACT(HOUR FROM created_at)
      HAVING COUNT(*) >= 3
      ORDER BY visit_count DESC
      LIMIT 10
    `, [userId]);

    for (const row of routineResult.rows) {
      const confidence = Math.min(1, Number(row.visit_count) / 10);
      patterns.push({
        id: uuidv4(),
        pattern_type: 'routine',
        description: `You frequently visit "${row.page}" around ${row.hour}:00`,
        detected_at: new Date().toISOString(),
        confidence,
        data: { page: row.page, hour: Number(row.hour), count: Number(row.visit_count) },
      });
    }

    // 2. Detect productivity patterns (task completion bursts)
    const productivityResult = await queryContext(context, `
      SELECT DATE(created_at) AS day,
             COUNT(*) AS activity_count
      FROM habit_activities
      WHERE user_id = $1
        AND activity_type = 'task_complete'
        AND created_at > NOW() - INTERVAL '14 days'
      GROUP BY DATE(created_at)
      HAVING COUNT(*) >= 3
      ORDER BY day DESC
      LIMIT 5
    `, [userId]);

    for (const row of productivityResult.rows) {
      patterns.push({
        id: uuidv4(),
        pattern_type: 'productivity',
        description: `High productivity day: ${row.activity_count} tasks completed on ${row.day}`,
        detected_at: new Date().toISOString(),
        confidence: Math.min(1, Number(row.activity_count) / 8),
        data: { day: row.day, count: Number(row.activity_count) },
      });
    }

    // 3. Detect break patterns (gaps between activities)
    const breakResult = await queryContext(context, `
      SELECT EXTRACT(HOUR FROM created_at) AS hour,
             COUNT(*) AS count
      FROM habit_activities
      WHERE user_id = $1
        AND activity_type = 'break'
        AND created_at > NOW() - INTERVAL '14 days'
      GROUP BY EXTRACT(HOUR FROM created_at)
      HAVING COUNT(*) >= 2
      ORDER BY count DESC
      LIMIT 3
    `, [userId]);

    for (const row of breakResult.rows) {
      patterns.push({
        id: uuidv4(),
        pattern_type: 'break',
        description: `You usually take breaks around ${row.hour}:00`,
        detected_at: new Date().toISOString(),
        confidence: Math.min(1, Number(row.count) / 7),
        data: { hour: Number(row.hour), count: Number(row.count) },
      });
    }

    // Persist detected patterns
    for (const pattern of patterns) {
      await queryContext(context, `
        INSERT INTO habit_patterns (id, user_id, pattern_type, description, confidence, data, detected_at, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'active')
        ON CONFLICT (id) DO NOTHING
      `, [pattern.id, userId, pattern.pattern_type, pattern.description, pattern.confidence, JSON.stringify(pattern.data), pattern.detected_at]);
    }
  } catch (err) {
    logger.error('Failed to detect habit patterns', err instanceof Error ? err : new Error(String(err)), { context, userId });
  }

  return patterns;
}

// ─── Generate suggestions ─────────────────────────────

export function generateSuggestions(
  _context: AIContext,
  _userId: string,
  patterns: HabitPattern[],
): HabitSuggestion[] {
  const suggestions: HabitSuggestion[] = [];

  for (const pattern of patterns) {
    if (pattern.pattern_type === 'routine' && pattern.confidence >= 0.4) {
      suggestions.push({
        id: uuidv4(),
        type: 'routine',
        title: 'Optimize your routine',
        description: pattern.description + '. Consider scheduling focused time around this activity.',
        priority: pattern.confidence >= 0.7 ? 'high' : 'medium',
      });
    }

    if (pattern.pattern_type === 'productivity') {
      suggestions.push({
        id: uuidv4(),
        type: 'focus',
        title: 'Replicate your productive days',
        description: pattern.description + '. Try to recreate the conditions that led to high output.',
        priority: 'medium',
      });
    }

    if (pattern.pattern_type === 'break') {
      suggestions.push({
        id: uuidv4(),
        type: 'break',
        title: 'Keep your break schedule',
        description: pattern.description + '. Regular breaks improve sustained focus.',
        priority: 'low',
      });
    }
  }

  // If no patterns found, suggest starting tracking
  if (suggestions.length === 0) {
    suggestions.push({
      id: uuidv4(),
      type: 'optimize',
      title: 'Start building habits',
      description: 'Keep using ZenAI to build up enough data for habit detection. We need about 2 weeks of activity.',
      priority: 'low',
    });
  }

  return suggestions;
}

// ─── Get habit stats ──────────────────────────────────

export async function getHabitStats(
  context: AIContext,
  userId: string,
): Promise<HabitStats> {
  try {
    // Activities count this week
    const activityResult = await queryContext(context, `
      SELECT COUNT(*) AS cnt
      FROM habit_activities
      WHERE user_id = $1
        AND created_at > NOW() - INTERVAL '7 days'
    `, [userId]);

    // Task completion rate (completed / total tasks this week)
    const taskResult = await queryContext(context, `
      SELECT
        COUNT(*) FILTER (WHERE activity_type = 'task_complete') AS completed,
        COUNT(*) FILTER (WHERE activity_type IN ('task_complete', 'task_created')) AS total
      FROM habit_activities
      WHERE user_id = $1
        AND created_at > NOW() - INTERVAL '7 days'
    `, [userId]);

    // Deep work minutes (focus sessions)
    const focusResult = await queryContext(context, `
      SELECT COALESCE(SUM(duration_minutes), 0) AS total_minutes
      FROM focus_sessions
      WHERE user_id = $1
        AND status = 'completed'
        AND created_at > NOW() - INTERVAL '7 days'
    `, [userId]);

    // Current streak (consecutive days with activity)
    const streakResult = await queryContext(context, `
      WITH daily AS (
        SELECT DISTINCT DATE(created_at) AS day
        FROM habit_activities
        WHERE user_id = $1
        ORDER BY day DESC
      ),
      numbered AS (
        SELECT day, day - (ROW_NUMBER() OVER (ORDER BY day DESC))::int AS grp
        FROM daily
      )
      SELECT COUNT(*) AS streak
      FROM numbered
      WHERE grp = (SELECT grp FROM numbered LIMIT 1)
    `, [userId]);

    // Top pages
    const pagesResult = await queryContext(context, `
      SELECT page, COUNT(*) AS cnt
      FROM habit_activities
      WHERE user_id = $1
        AND created_at > NOW() - INTERVAL '7 days'
        AND page IS NOT NULL AND page != ''
      GROUP BY page
      ORDER BY cnt DESC
      LIMIT 5
    `, [userId]);

    const completed = Number(taskResult.rows[0]?.completed ?? 0);
    const total = Number(taskResult.rows[0]?.total ?? 0);

    return {
      deepWorkMinutes: Number(focusResult.rows[0]?.total_minutes ?? 0),
      taskCompletionRate: total > 0 ? completed / total : 0,
      currentStreak: Number(streakResult.rows[0]?.streak ?? 0),
      activitiesThisWeek: Number(activityResult.rows[0]?.cnt ?? 0),
      topPages: pagesResult.rows.map((r: Record<string, unknown>) => ({
        page: String(r.page),
        count: Number(r.cnt),
      })),
    };
  } catch (err) {
    logger.error('Failed to get habit stats', err instanceof Error ? err : new Error(String(err)), { context, userId });
    return {
      deepWorkMinutes: 0,
      taskCompletionRate: 0,
      currentStreak: 0,
      activitiesThisWeek: 0,
      topPages: [],
    };
  }
}

// ─── Get stored patterns ──────────────────────────────

export async function getStoredPatterns(
  context: AIContext,
  userId: string,
): Promise<HabitPattern[]> {
  const result = await queryContext(context, `
    SELECT id, pattern_type, description, confidence, data, detected_at
    FROM habit_patterns
    WHERE user_id = $1
      AND status = 'active'
    ORDER BY detected_at DESC
    LIMIT 20
  `, [userId]);

  return result.rows.map((r: Record<string, unknown>) => ({
    id: String(r.id),
    pattern_type: r.pattern_type as HabitPattern['pattern_type'],
    description: String(r.description),
    detected_at: String(r.detected_at),
    confidence: Number(r.confidence),
    data: (r.data as Record<string, unknown>) ?? {},
  }));
}
