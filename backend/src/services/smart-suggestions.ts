/**
 * Smart Suggestions Service (Phase 69.1)
 *
 * Aggregates proactive events into user-friendly suggestions.
 * Surfaces AI intelligence to users via dismissible/snoozable cards.
 */

import { AIContext, queryContext } from '../utils/database-context';
import { logger } from '../utils/logger';

// ===========================================
// Types
// ===========================================

export type SuggestionType =
  | 'connection_discovered'
  | 'task_reminder'
  | 'email_followup'
  | 'knowledge_insight'
  | 'context_switch'
  | 'meeting_prep'
  | 'learning_opportunity'
  | 'contradiction_alert';

export type SuggestionStatus = 'active' | 'dismissed' | 'snoozed' | 'accepted';

export type SnoozeDuration = '1h' | '4h' | 'tomorrow';

export interface SmartSuggestion {
  id: string;
  userId: string;
  type: SuggestionType;
  title: string;
  description: string | null;
  metadata: Record<string, unknown>;
  priority: number;
  status: SuggestionStatus;
  snoozedUntil: string | null;
  dismissedAt: string | null;
  createdAt: string;
}

// ===========================================
// Active Suggestions
// ===========================================

/**
 * Get the top active suggestions for a user, excluding:
 * - Dismissed (within 24h cooldown)
 * - Currently snoozed
 */
export async function getActiveSuggestions(
  context: AIContext,
  userId: string,
  limit = 3
): Promise<SmartSuggestion[]> {
  try {
    const result = await queryContext(
      context,
      `SELECT * FROM smart_suggestions
       WHERE user_id = $1
         AND (
           (status = 'active')
           OR (status = 'snoozed' AND snoozed_until IS NOT NULL AND snoozed_until <= NOW())
         )
       ORDER BY priority DESC, created_at DESC
       LIMIT $2`,
      [userId, limit]
    );
    return result.rows.map(parseSuggestion);
  } catch (error) {
    logger.error('Failed to get active suggestions', error instanceof Error ? error : undefined);
    return [];
  }
}

// ===========================================
// Actions
// ===========================================

/**
 * Dismiss a suggestion with 24h cooldown.
 */
export async function dismissSuggestion(
  context: AIContext,
  id: string,
  userId: string
): Promise<boolean> {
  try {
    const result = await queryContext(
      context,
      `UPDATE smart_suggestions
       SET status = 'dismissed', dismissed_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND user_id = $2
       RETURNING id`,
      [id, userId]
    );
    return (result.rowCount ?? 0) > 0;
  } catch (error) {
    logger.error('Failed to dismiss suggestion', error instanceof Error ? error : undefined);
    return false;
  }
}

/**
 * Snooze a suggestion for a given duration.
 */
export async function snoozeSuggestion(
  context: AIContext,
  id: string,
  userId: string,
  duration: SnoozeDuration
): Promise<boolean> {
  const interval = computeSnoozeInterval(duration);
  try {
    const result = await queryContext(
      context,
      `UPDATE smart_suggestions
       SET status = 'snoozed', snoozed_until = NOW() + $3::interval, updated_at = NOW()
       WHERE id = $1 AND user_id = $2
       RETURNING id`,
      [id, userId, interval]
    );
    return (result.rowCount ?? 0) > 0;
  } catch (error) {
    logger.error('Failed to snooze suggestion', error instanceof Error ? error : undefined);
    return false;
  }
}

/**
 * Accept a suggestion (mark as actioned).
 */
export async function acceptSuggestion(
  context: AIContext,
  id: string,
  userId: string
): Promise<boolean> {
  try {
    const result = await queryContext(
      context,
      `UPDATE smart_suggestions
       SET status = 'accepted', updated_at = NOW()
       WHERE id = $1 AND user_id = $2
       RETURNING id`,
      [id, userId]
    );
    return (result.rowCount ?? 0) > 0;
  } catch (error) {
    logger.error('Failed to accept suggestion', error instanceof Error ? error : undefined);
    return false;
  }
}

// ===========================================
// Create Suggestion
// ===========================================

export interface CreateSuggestionInput {
  userId: string;
  type: SuggestionType;
  title: string;
  description?: string;
  metadata?: Record<string, unknown>;
  priority?: number;
}

/**
 * Create a new suggestion. Deduplicates by checking for an active suggestion
 * of the same type with the same title within the last 24h.
 */
export async function createSuggestion(
  context: AIContext,
  input: CreateSuggestionInput
): Promise<SmartSuggestion | null> {
  try {
    // Deduplicate: skip if same type+title exists active within 24h
    const existing = await queryContext(
      context,
      `SELECT id FROM smart_suggestions
       WHERE user_id = $1 AND type = $2 AND title = $3
         AND status IN ('active', 'snoozed')
         AND created_at > NOW() - INTERVAL '24 hours'
       LIMIT 1`,
      [input.userId, input.type, input.title]
    );
    if (existing.rows.length > 0) {
      return null;
    }

    const result = await queryContext(
      context,
      `INSERT INTO smart_suggestions (user_id, type, title, description, metadata, priority)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        input.userId,
        input.type,
        input.title,
        input.description || null,
        JSON.stringify(input.metadata || {}),
        input.priority ?? 50,
      ]
    );
    return result.rows.length > 0 ? parseSuggestion(result.rows[0]) : null;
  } catch (error) {
    logger.error('Failed to create suggestion', error instanceof Error ? error : undefined);
    return null;
  }
}

// ===========================================
// Helpers
// ===========================================

function computeSnoozeInterval(duration: SnoozeDuration): string {
  switch (duration) {
    case '1h':
      return '1 hour';
    case '4h':
      return '4 hours';
    case 'tomorrow':
      return '16 hours';
  }
}

function parseSuggestion(row: Record<string, unknown>): SmartSuggestion {
  const parseJSON = <T>(val: unknown, fallback: T): T => {
    if (!val) return fallback;
    if (typeof val === 'object') return val as T;
    if (typeof val === 'string') {
      try { return JSON.parse(val); } catch { return fallback; }
    }
    return fallback;
  };

  return {
    id: row.id as string,
    userId: row.user_id as string,
    type: row.type as SuggestionType,
    title: row.title as string,
    description: (row.description as string) || null,
    metadata: parseJSON(row.metadata, {}),
    priority: parseInt(row.priority as string, 10) || 50,
    status: (row.status as SuggestionStatus) || 'active',
    snoozedUntil: row.snoozed_until ? String(row.snoozed_until) : null,
    dismissedAt: row.dismissed_at ? String(row.dismissed_at) : null,
    createdAt: row.created_at ? String(row.created_at) : new Date().toISOString(),
  };
}
