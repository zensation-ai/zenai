/**
 * Smart Suggestions Service (Phase 69.1 + Phase 115)
 *
 * Phase 69.1: Basic CRUD for suggestions with simple priority ordering.
 * Phase 115: Scoring algorithm, personalized timing, dedup + merge.
 */

import { AIContext, queryContext } from '../utils/database-context';
import { logger } from '../utils/logger';

// ===========================================
// Column list — single source of truth
// ===========================================

const SUGGESTION_COLUMNS = `id, user_id, type, title, description, metadata,
  priority, status, snoozed_until, dismissed_at, created_at`;

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
  /** Computed relevance score (0-100), only set when scoring is applied */
  relevanceScore?: number;
}

// ===========================================
// Constants (T55: Scoring)
// ===========================================

/** Base weight per suggestion type */
export const TYPE_WEIGHTS: Record<SuggestionType, number> = {
  contradiction_alert: 90,
  meeting_prep: 85,
  task_reminder: 80,
  email_followup: 75,
  knowledge_insight: 60,
  connection_discovered: 50,
  learning_opportunity: 40,
  context_switch: 30,
};

/** Max active suggestions per user before auto-cleanup */
export const MAX_ACTIVE_SUGGESTIONS = 10;

/** Similarity threshold for dedup merge (0-1) */
export const SIMILARITY_THRESHOLD = 0.7;

// ===========================================
// In-Memory Activity Tracking (T56)
// ===========================================

interface ActivityRecord {
  /** Counts per hour-of-day (0-23) */
  hourCounts: number[];
  /** Counts per suggestion type that were accepted */
  acceptedTypeCounts: Record<string, number>;
  /** Total interactions */
  totalInteractions: number;
}

/**
 * In-memory user activity patterns.
 * Key: `${context}:${userId}`
 */
const userActivityMap = new Map<string, ActivityRecord>();

function getActivityKey(context: AIContext, userId: string): string {
  return `${context}:${userId}`;
}

function getOrCreateActivity(context: AIContext, userId: string): ActivityRecord {
  const key = getActivityKey(context, userId);
  let record = userActivityMap.get(key);
  if (!record) {
    record = {
      hourCounts: new Array(24).fill(0),
      acceptedTypeCounts: {},
      totalInteractions: 0,
    };
    userActivityMap.set(key, record);
  }
  return record;
}

/**
 * Record user activity when they accept or dismiss a suggestion.
 * Builds the personalized timing pattern over time.
 */
export function recordUserActivity(
  context: AIContext,
  userId: string,
  action: 'accept' | 'dismiss',
  suggestionType: SuggestionType
): void {
  const record = getOrCreateActivity(context, userId);
  const hour = new Date().getHours();
  record.hourCounts[hour]++;
  record.totalInteractions++;

  if (action === 'accept') {
    record.acceptedTypeCounts[suggestionType] =
      (record.acceptedTypeCounts[suggestionType] || 0) + 1;
  }
}

/**
 * Get user activity pattern: peak hours and preferred suggestion types.
 */
export function getUserActivityPattern(
  context: AIContext,
  userId: string
): { peakHours: number[]; preferredTypes: SuggestionType[]; totalInteractions: number } {
  const record = getOrCreateActivity(context, userId);

  // Find peak hours (top 3 hours with most activity, or all if fewer)
  const indexedHours = record.hourCounts
    .map((count, hour) => ({ hour, count }))
    .filter(h => h.count > 0)
    .sort((a, b) => b.count - a.count);
  const peakHours = indexedHours.slice(0, 3).map(h => h.hour);

  // Find preferred types (sorted by accept count)
  const preferredTypes = Object.entries(record.acceptedTypeCounts)
    .filter(([, count]) => count > 0)
    .sort(([, a], [, b]) => b - a)
    .map(([type]) => type as SuggestionType);

  return { peakHours, preferredTypes, totalInteractions: record.totalInteractions };
}

/**
 * Reset activity data (useful for testing).
 */
export function resetActivityData(): void {
  userActivityMap.clear();
}

// ===========================================
// T55: Scoring Algorithm
// ===========================================

/**
 * Compute a relevance score (0-100) for a suggestion.
 *
 * Components:
 * - Type weight (base importance)
 * - Recency decay (fresher suggestions score higher)
 * - Interaction boost (if user has accepted similar types before)
 */
export function computeRelevanceScore(
  suggestion: SmartSuggestion,
  context: AIContext,
  userId: string,
  now?: Date
): number {
  const currentTime = now ?? new Date();

  // 1. Type weight (0-100 scale)
  const typeWeight = TYPE_WEIGHTS[suggestion.type] ?? 50;

  // 2. Recency decay multiplier
  const ageMs = currentTime.getTime() - new Date(suggestion.createdAt).getTime();
  const recencyMultiplier = computeRecencyDecay(ageMs);

  // 3. Interaction boost
  const interactionMultiplier = computeInteractionBoost(context, userId, suggestion.type);

  // Combine: typeWeight * recency * interaction
  const rawScore = typeWeight * recencyMultiplier * interactionMultiplier;

  // Clamp to 0-100
  return Math.max(0, Math.min(100, Math.round(rawScore)));
}

/**
 * Compute recency decay multiplier based on age in milliseconds.
 */
export function computeRecencyDecay(ageMs: number): number {
  const ONE_HOUR = 60 * 60 * 1000;
  const FOUR_HOURS = 4 * ONE_HOUR;
  const TWENTY_FOUR_HOURS = 24 * ONE_HOUR;

  if (ageMs <= ONE_HOUR) return 1.0;
  if (ageMs <= FOUR_HOURS) return 0.85;
  if (ageMs <= TWENTY_FOUR_HOURS) return 0.6;
  return 0.3;
}

/**
 * Compute interaction boost multiplier.
 * If the user has accepted this type before, boost by 20%.
 */
export function computeInteractionBoost(
  context: AIContext,
  userId: string,
  type: SuggestionType
): number {
  const record = userActivityMap.get(getActivityKey(context, userId));
  if (!record) return 1.0;

  const acceptCount = record.acceptedTypeCounts[type] ?? 0;
  return acceptCount > 0 ? 1.2 : 1.0;
}

// ===========================================
// T57: Similarity / Dedup Helpers
// ===========================================

/**
 * Compute word-overlap similarity between two strings (0-1).
 * Uses Jaccard similarity on normalized word sets.
 */
export function computeTitleSimilarity(a: string, b: string): number {
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9äöüß\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 1);

  const wordsA = new Set(normalize(a));
  const wordsB = new Set(normalize(b));

  if (wordsA.size === 0 && wordsB.size === 0) return 1.0;
  if (wordsA.size === 0 || wordsB.size === 0) return 0.0;

  let intersection = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) intersection++;
  }

  const union = new Set([...wordsA, ...wordsB]).size;
  return union > 0 ? intersection / union : 0;
}

// ===========================================
// Active Suggestions (enhanced with scoring)
// ===========================================

/**
 * Get the top active suggestions for a user, excluding:
 * - Dismissed (within 24h cooldown)
 * - Currently snoozed
 *
 * Results are scored and sorted by computed relevance score.
 */
export async function getActiveSuggestions(
  context: AIContext,
  userId: string,
  limit = 3
): Promise<SmartSuggestion[]> {
  try {
    // Fetch more than needed so we can score and re-sort
    const fetchLimit = Math.max(limit * 3, MAX_ACTIVE_SUGGESTIONS);
    const result = await queryContext(
      context,
      `SELECT ${SUGGESTION_COLUMNS} FROM smart_suggestions
       WHERE user_id = $1
         AND (
           (status = 'active')
           OR (status = 'snoozed' AND snoozed_until IS NOT NULL AND snoozed_until <= NOW())
         )
       ORDER BY priority DESC, created_at DESC
       LIMIT $2`,
      [userId, fetchLimit]
    );

    const suggestions = result.rows.map(parseSuggestion);

    // Score each suggestion
    const now = new Date();
    const scored = suggestions.map(s => ({
      ...s,
      relevanceScore: computeRelevanceScore(s, context, userId, now),
    }));

    // Sort by relevance score descending
    scored.sort((a, b) => (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0));

    return scored.slice(0, limit);
  } catch (error) {
    logger.error('Failed to get active suggestions', error instanceof Error ? error : undefined);
    return [];
  }
}

/**
 * Get personalized suggestions: filters and boosts based on user activity patterns.
 */
export async function getPersonalizedSuggestions(
  context: AIContext,
  userId: string,
  limit = 3
): Promise<SmartSuggestion[]> {
  const scored = await getActiveSuggestions(context, userId, MAX_ACTIVE_SUGGESTIONS);
  const pattern = getUserActivityPattern(context, userId);

  if (pattern.totalInteractions === 0) {
    // No activity data yet, return default scored order
    return scored.slice(0, limit);
  }

  const currentHour = new Date().getHours();
  const isInPeakHour = pattern.peakHours.includes(currentHour);

  // Re-rank: boost preferred types and peak-hour alignment
  const reranked = scored.map(s => {
    let boost = 0;

    // Boost preferred types
    const typeIndex = pattern.preferredTypes.indexOf(s.type);
    if (typeIndex >= 0) {
      boost += (pattern.preferredTypes.length - typeIndex) * 3;
    }

    // During peak hours, boost higher-priority types more
    if (isInPeakHour) {
      boost += 5;
    }

    return {
      ...s,
      relevanceScore: Math.min(100, (s.relevanceScore ?? 0) + boost),
    };
  });

  reranked.sort((a, b) => (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0));
  return reranked.slice(0, limit);
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
// Create Suggestion (enhanced with dedup/merge)
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
 * Create a new suggestion with enhanced deduplication:
 * 1. Exact title + type match within 24h (original)
 * 2. Fuzzy title similarity >70% + same type = merge (keep newer)
 * 3. Enforce max 10 active suggestions per user
 */
export async function createSuggestion(
  context: AIContext,
  input: CreateSuggestionInput
): Promise<SmartSuggestion | null> {
  try {
    // 1. Check for exact dedup (same type + title within 24h)
    const exactDup = await queryContext(
      context,
      `SELECT id FROM smart_suggestions
       WHERE user_id = $1 AND type = $2 AND title = $3
         AND status IN ('active', 'snoozed')
         AND created_at > NOW() - INTERVAL '24 hours'
       LIMIT 1`,
      [input.userId, input.type, input.title]
    );
    if (exactDup.rows.length > 0) {
      return null;
    }

    // 2. Check for fuzzy dedup: fetch active suggestions of same type
    const sameTypeSuggestions = await queryContext(
      context,
      `SELECT ${SUGGESTION_COLUMNS} FROM smart_suggestions
       WHERE user_id = $1 AND type = $2
         AND status IN ('active', 'snoozed')
         AND created_at > NOW() - INTERVAL '24 hours'
       ORDER BY created_at DESC
       LIMIT 20`,
      [input.userId, input.type]
    );

    for (const row of sameTypeSuggestions.rows) {
      const existingTitle = row.title as string;
      const similarity = computeTitleSimilarity(input.title, existingTitle);
      if (similarity >= SIMILARITY_THRESHOLD) {
        // Merge: update existing with newer info
        const mergedDescription = input.description
          ? `${input.description} (auch: ${existingTitle})`
          : `${existingTitle} (zusammengefuehrt)`;

        await queryContext(
          context,
          `UPDATE smart_suggestions
           SET title = $3, description = $4, metadata = $5, priority = GREATEST(priority, $6), updated_at = NOW()
           WHERE id = $1 AND user_id = $2
           RETURNING *`,
          [
            row.id,
            input.userId,
            input.title,
            mergedDescription,
            JSON.stringify(input.metadata || {}),
            input.priority ?? 50,
          ]
        );
        // Return null to indicate merge happened (no new row)
        return null;
      }
    }

    // 3. Insert new suggestion
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

    // 4. Enforce max active limit
    await enforceMaxActiveSuggestions(context, input.userId);

    return result.rows.length > 0 ? parseSuggestion(result.rows[0]) : null;
  } catch (error) {
    logger.error('Failed to create suggestion', error instanceof Error ? error : undefined);
    return null;
  }
}

// ===========================================
// T57: Merge & Cleanup
// ===========================================

/**
 * Merge related active suggestions that are semantically similar.
 * Runs through all active suggestions pairwise and merges >70% similar ones.
 */
export async function mergeRelatedSuggestions(
  context: AIContext,
  userId: string
): Promise<number> {
  try {
    const result = await queryContext(
      context,
      `SELECT ${SUGGESTION_COLUMNS} FROM smart_suggestions
       WHERE user_id = $1 AND status IN ('active', 'snoozed')
       ORDER BY created_at DESC`,
      [userId]
    );

    const suggestions = result.rows.map(parseSuggestion);
    const merged = new Set<string>();
    let mergeCount = 0;

    for (let i = 0; i < suggestions.length; i++) {
      if (merged.has(suggestions[i].id)) continue;

      for (let j = i + 1; j < suggestions.length; j++) {
        if (merged.has(suggestions[j].id)) continue;

        // Only merge same type
        if (suggestions[i].type !== suggestions[j].type) continue;

        const similarity = computeTitleSimilarity(
          suggestions[i].title,
          suggestions[j].title
        );

        if (similarity >= SIMILARITY_THRESHOLD) {
          // Keep newer (i), dismiss older (j)
          const mergedDescription = suggestions[i].description
            ? `${suggestions[i].description} (auch: ${suggestions[j].title})`
            : `${suggestions[i].title} (zusammengefuehrt mit: ${suggestions[j].title})`;

          await queryContext(
            context,
            `UPDATE smart_suggestions
             SET description = $3, priority = GREATEST(priority, $4), updated_at = NOW()
             WHERE id = $1 AND user_id = $2`,
            [
              suggestions[i].id,
              userId,
              mergedDescription,
              suggestions[j].priority,
            ]
          );

          await queryContext(
            context,
            `UPDATE smart_suggestions
             SET status = 'dismissed', dismissed_at = NOW(), updated_at = NOW()
             WHERE id = $1 AND user_id = $2`,
            [suggestions[j].id, userId]
          );

          merged.add(suggestions[j].id);
          mergeCount++;
        }
      }
    }

    return mergeCount;
  } catch (error) {
    logger.error('Failed to merge related suggestions', error instanceof Error ? error : undefined);
    return 0;
  }
}

/**
 * Enforce max active suggestions limit. Auto-dismiss oldest low-priority ones.
 */
export async function enforceMaxActiveSuggestions(
  context: AIContext,
  userId: string
): Promise<number> {
  try {
    const countResult = await queryContext(
      context,
      `SELECT COUNT(*) as cnt FROM smart_suggestions
       WHERE user_id = $1 AND status IN ('active', 'snoozed')`,
      [userId]
    );

    const activeCount = parseInt(countResult.rows[0]?.cnt as string, 10) || 0;
    if (activeCount <= MAX_ACTIVE_SUGGESTIONS) return 0;

    const excess = activeCount - MAX_ACTIVE_SUGGESTIONS;

    // Dismiss oldest low-priority suggestions
    const dismissed = await queryContext(
      context,
      `UPDATE smart_suggestions
       SET status = 'dismissed', dismissed_at = NOW(), updated_at = NOW()
       WHERE id IN (
         SELECT id FROM smart_suggestions
         WHERE user_id = $1 AND status IN ('active', 'snoozed')
         ORDER BY priority ASC, created_at ASC
         LIMIT $2
       )
       RETURNING id`,
      [userId, excess]
    );

    return dismissed.rowCount ?? 0;
  } catch (error) {
    logger.error('Failed to enforce max suggestions', error instanceof Error ? error : undefined);
    return 0;
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
