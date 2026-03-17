/**
 * Focus Mode Service (Phase 88)
 *
 * Simple state management for user focus sessions.
 * Integrates with interruptibility scoring to suppress
 * non-critical interruptions during focus time.
 */

import { v4 as uuidv4 } from 'uuid';
import { queryContext } from '../utils/database-context';
import type { AIContext } from '../types';
import { logger } from '../utils/logger';

// ─── Types ─────────────────────────────────────────────

export type FocusSessionStatus = 'active' | 'completed' | 'cancelled';

export interface FocusSession {
  id: string;
  user_id: string;
  started_at: string;
  ends_at: string | null;
  duration_minutes: number;
  active_task_id: string | null;
  status: FocusSessionStatus;
  created_at: string;
}

// ─── Start focus mode ─────────────────────────────────

export async function startFocusMode(
  context: AIContext,
  userId: string,
  durationMinutes: number,
  taskId?: string,
): Promise<FocusSession> {
  try {
    // End any existing active session first
    await queryContext(context, `
      UPDATE focus_sessions
      SET status = 'cancelled', ends_at = NOW()
      WHERE user_id = $1 AND status = 'active'
    `, [userId]);

    const id = uuidv4();
    const endsAt = new Date(Date.now() + durationMinutes * 60 * 1000).toISOString();

    const result = await queryContext(context, `
      INSERT INTO focus_sessions (id, user_id, started_at, ends_at, duration_minutes, active_task_id, status, created_at)
      VALUES ($1, $2, NOW(), $3, $4, $5, 'active', NOW())
      RETURNING *
    `, [id, userId, endsAt, durationMinutes, taskId ?? null]);

    const row = result.rows[0];
    logger.info('Focus mode started', { context, userId, durationMinutes, taskId });

    return mapRow(row);
  } catch (error) {
    logger.error('Focus mode: Focus-Session konnte nicht gestartet werden', error instanceof Error ? error : new Error(String(error)), { context, userId });
    throw error;
  }
}

// ─── End focus mode ───────────────────────────────────

export async function endFocusMode(
  context: AIContext,
  userId: string,
): Promise<FocusSession | null> {
  try {
    const result = await queryContext(context, `
      UPDATE focus_sessions
      SET status = 'completed', ends_at = NOW()
      WHERE user_id = $1 AND status = 'active'
      RETURNING *
    `, [userId]);

    if (result.rows.length === 0) {
      return null;
    }

    logger.info('Focus mode ended', { context, userId });
    return mapRow(result.rows[0]);
  } catch (error) {
    logger.error('Focus mode: Focus-Session konnte nicht beendet werden', error instanceof Error ? error : new Error(String(error)), { context, userId });
    throw error;
  }
}

// ─── Get current focus status ─────────────────────────

export async function getFocusStatus(
  context: AIContext,
  userId: string,
): Promise<{ active: boolean; session: FocusSession | null; remainingMinutes: number }> {
  try {
    // Auto-complete expired sessions
    await queryContext(context, `
      UPDATE focus_sessions
      SET status = 'completed'
      WHERE user_id = $1 AND status = 'active' AND ends_at < NOW()
    `, [userId]);

    const result = await queryContext(context, `
      SELECT * FROM focus_sessions
      WHERE user_id = $1 AND status = 'active'
      ORDER BY started_at DESC
      LIMIT 1
    `, [userId]);

    if (result.rows.length === 0) {
      return { active: false, session: null, remainingMinutes: 0 };
    }

    const session = mapRow(result.rows[0]);
    const endsAt = session.ends_at ? new Date(session.ends_at).getTime() : 0;
    const remainingMinutes = Math.max(0, Math.round((endsAt - Date.now()) / 60000));

    return { active: true, session, remainingMinutes };
  } catch (error) {
    logger.error('Focus mode: Focus-Status konnte nicht abgerufen werden', error instanceof Error ? error : new Error(String(error)), { context, userId });
    throw error;
  }
}

// ─── Get focus history ────────────────────────────────

export async function getFocusHistory(
  context: AIContext,
  userId: string,
  days = 7,
): Promise<FocusSession[]> {
  try {
    const result = await queryContext(context, `
      SELECT * FROM focus_sessions
      WHERE user_id = $1
        AND created_at > NOW() - ($2 || ' days')::INTERVAL
      ORDER BY created_at DESC
      LIMIT 50
    `, [userId, String(days)]);

    return result.rows.map(mapRow);
  } catch (error) {
    logger.error('Focus mode: Focus-Verlauf konnte nicht geladen werden', error instanceof Error ? error : new Error(String(error)), { context, userId });
    throw error;
  }
}

// ─── Helper ───────────────────────────────────────────

function mapRow(row: Record<string, unknown>): FocusSession {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    started_at: String(row.started_at),
    ends_at: row.ends_at ? String(row.ends_at) : null,
    duration_minutes: Number(row.duration_minutes),
    active_task_id: row.active_task_id ? String(row.active_task_id) : null,
    status: row.status as FocusSessionStatus,
    created_at: String(row.created_at),
  };
}
