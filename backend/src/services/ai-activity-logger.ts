/**
 * AI Activity Logger Service
 *
 * Logs AI activities for the dashboard activity feed.
 * Provides transparency about what the AI system is doing.
 *
 * Activity types:
 * - idea_created: New idea was created and structured
 * - idea_structured: Text was structured by AI
 * - search_performed: Semantic search was performed
 * - draft_generated: AI-generated draft was created
 * - pattern_detected: Learning pattern was detected
 * - suggestion_made: Proactive suggestion was created
 * - triage_completed: User completed triage session
 */

import { queryContext, AIContext } from '../utils/database-context';
import { logger } from '../utils/logger';

/**
 * Valid activity types for the AI activity log
 */
export type AIActivityType =
  | 'idea_created'
  | 'idea_structured'
  | 'idea_triaged'
  | 'search_performed'
  | 'draft_generated'
  | 'pattern_detected'
  | 'suggestion_made'
  | 'triage_completed'
  | 'learning_applied';

/**
 * Activity log entry
 */
export interface AIActivity {
  context: AIContext;
  type: AIActivityType;
  message: string;
  ideaId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Activity log entry from database
 */
export interface AIActivityLogEntry {
  id: string;
  context: AIContext;
  activityType: AIActivityType;
  message: string;
  ideaId: string | null;
  metadata: Record<string, unknown>;
  isRead: boolean;
  createdAt: Date;
}

/**
 * Log an AI activity to the database
 *
 * @param activity - The activity to log
 * @returns The created activity ID or null on error
 */
export async function logAIActivity(
  activity: AIActivity
): Promise<string | null> {
  try {
    const result = await queryContext(
      activity.context,
      `INSERT INTO ai_activity_log (activity_type, message, idea_id, metadata)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [
        activity.type,
        activity.message,
        activity.ideaId || null,
        JSON.stringify(activity.metadata || {}),
      ]
    );

    const activityId = result.rows[0]?.id;

    logger.debug('AI activity logged', {
      activityId,
      type: activity.type,
      context: activity.context,
    });

    return activityId;
  } catch (error) {
    // Table might not exist yet (migration not run)
    if (
      error instanceof Error &&
      error.message.includes('does not exist')
    ) {
      logger.warn(
        'AI activity log table does not exist. Run migrations to enable activity logging.'
      );
      return null;
    }

    logger.error('Failed to log AI activity', error instanceof Error ? error : undefined);
    return null;
  }
}

/**
 * Get recent AI activities for the dashboard feed
 *
 * @param context - The context to filter by
 * @param limit - Maximum number of activities to return (default: 10)
 * @returns Array of activity log entries
 */
export async function getRecentAIActivities(
  context: AIContext,
  limit: number = 10
): Promise<AIActivityLogEntry[]> {
  try {
    const result = await queryContext(
      context,
      `SELECT
         id,
         activity_type as "activityType",
         message,
         idea_id as "ideaId",
         metadata,
         is_read as "isRead",
         created_at as "createdAt"
       FROM ai_activity_log
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit]
    );

    return result.rows;
  } catch (error) {
    // Gracefully handle any database errors (table missing, schema issues, XX000 etc.)
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('does not exist')) {
      logger.warn('AI activity log table does not exist. Run migrations to enable activity feed.');
    } else {
      logger.warn('Failed to get AI activities', { error: msg, context });
    }
    return [];
  }
}

/**
 * Mark activities as read
 *
 * @param context - The context to filter by
 * @param activityIds - Optional specific activity IDs to mark as read
 * @returns Number of activities marked as read
 */
export async function markActivitiesAsRead(
  context: AIContext,
  activityIds?: string[]
): Promise<number> {
  try {
    let result;

    if (activityIds && activityIds.length > 0) {
      result = await queryContext(
        context,
        `UPDATE ai_activity_log
         SET is_read = true
         WHERE id = ANY($1) AND is_read = false
         RETURNING id`,
        [activityIds]
      );
    } else {
      result = await queryContext(
        context,
        `UPDATE ai_activity_log
         SET is_read = true
         WHERE is_read = false
         RETURNING id`
      );
    }

    return result.rowCount || 0;
  } catch (error) {
    logger.error('Failed to mark activities as read', error instanceof Error ? error : undefined);
    return 0;
  }
}

/**
 * Get count of unread activities
 *
 * @param context - The context to filter by
 * @returns Number of unread activities
 */
export async function getUnreadActivityCount(
  context: AIContext
): Promise<number> {
  try {
    const result = await queryContext(
      context,
      `SELECT COUNT(*) as count
       FROM ai_activity_log
       WHERE is_read = false`
    );

    return parseInt(result.rows[0]?.count || '0', 10);
  } catch (error) {
    logger.error('Failed to get unread activity count', error instanceof Error ? error : undefined);
    return 0;
  }
}

/**
 * Helper functions for common activity types
 */
export const AIActivityHelpers = {
  /**
   * Log when a new idea is structured
   */
  async logIdeaStructured(
    context: AIContext,
    ideaId: string,
    title: string,
    type: string,
    category: string
  ): Promise<string | null> {
    const truncatedTitle =
      title.length > 50 ? title.substring(0, 50) + '...' : title;

    return logAIActivity({
      context,
      type: 'idea_structured',
      message: `Gedanke strukturiert: "${truncatedTitle}"`,
      ideaId,
      metadata: { ideaType: type, category },
    });
  },

  /**
   * Log when a search is performed
   */
  async logSearchPerformed(
    context: AIContext,
    query: string,
    resultCount: number
  ): Promise<string | null> {
    const truncatedQuery =
      query.length > 30 ? query.substring(0, 30) + '...' : query;

    return logAIActivity({
      context,
      type: 'search_performed',
      message: `Suche nach "${truncatedQuery}" - ${resultCount} Ergebnisse`,
      metadata: { query, resultCount },
    });
  },

  /**
   * Log when a draft is generated
   */
  async logDraftGenerated(
    context: AIContext,
    ideaId: string,
    draftType: string
  ): Promise<string | null> {
    return logAIActivity({
      context,
      type: 'draft_generated',
      message: `${draftType}-Entwurf erstellt`,
      ideaId,
      metadata: { draftType },
    });
  },

  /**
   * Log when a pattern is detected
   */
  async logPatternDetected(
    context: AIContext,
    patternType: string,
    description: string
  ): Promise<string | null> {
    return logAIActivity({
      context,
      type: 'pattern_detected',
      message: `Muster erkannt: ${description}`,
      metadata: { patternType },
    });
  },

  /**
   * Log when triage is completed
   */
  async logTriageCompleted(
    context: AIContext,
    totalTriaged: number,
    prioritized: number,
    archived: number
  ): Promise<string | null> {
    return logAIActivity({
      context,
      type: 'triage_completed',
      message: `${totalTriaged} Gedanken sortiert (${prioritized} priorisiert, ${archived} archiviert)`,
      metadata: { totalTriaged, prioritized, archived },
    });
  },
};
