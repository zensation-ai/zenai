/**
 * Interaction Tracking Service
 * Phase 4: Deep Learning Feedback Loop
 *
 * Tracks user interactions for learning and personalization.
 * Provides granular correction handling and pattern extraction.
 */

import { v4 as uuidv4 } from 'uuid';
import { queryContext, AIContext } from '../utils/database-context';
import { logger } from '../utils/logger';

// ===========================================
// Types
// ===========================================

export type EntityType = 'idea' | 'cluster' | 'automation' | 'suggestion' | 'search' | 'profile';

export type InteractionType =
  | 'view'
  | 'create'
  | 'edit'
  | 'delete'
  | 'archive'
  | 'restore'
  | 'share'
  | 'export'
  | 'search_click'
  | 'suggestion_accept'
  | 'suggestion_dismiss'
  | 'feedback_positive'
  | 'feedback_negative'
  | 'correction'
  | 'bulk_action';

export type CorrectionField = 'type' | 'category' | 'priority' | 'title' | 'summary' | 'keywords' | 'next_steps';

export interface InteractionEvent {
  id: string;
  context: AIContext;
  entity_type: EntityType;
  entity_id?: string;
  interaction_type: InteractionType;
  metadata: Record<string, unknown>;
  session_id?: string;
  duration_ms: number;
  created_at: string;
}

export interface FieldCorrection {
  id: string;
  context: AIContext;
  idea_id: string;
  field_name: CorrectionField;
  old_value: string;
  new_value: string;
  weight: number;
  applied_to_learning: boolean;
  created_at: string;
}

export interface CorrectionPattern {
  id: string;
  context: AIContext;
  field_name: CorrectionField;
  pattern_type: 'value_mapping' | 'keyword_trigger' | 'category_preference' | 'priority_bias';
  trigger_condition: Record<string, unknown>;
  correction_value: string;
  confidence: number;
  times_applied: number;
  times_correct: number;
  is_active: boolean;
}

export interface LearningSession {
  id: string;
  context: AIContext;
  session_token: string;
  total_interactions: number;
  ideas_created: number;
  ideas_edited: number;
  corrections_made: number;
  searches_performed: number;
  started_at: string;
  last_activity_at: string;
  ended_at?: string;
}

export interface InteractionStats {
  total_interactions: number;
  interactions_today: number;
  interactions_this_week: number;
  by_type: Record<string, number>;
  by_entity: Record<string, number>;
  avg_session_duration_ms: number;
  total_corrections: number;
  correction_rate: number;
}

// ===========================================
// Interaction Tracking
// ===========================================

/**
 * Tracks a user interaction
 */
export async function trackInteraction(
  context: AIContext,
  entityType: EntityType,
  interactionType: InteractionType,
  options: {
    entity_id?: string;
    metadata?: Record<string, unknown>;
    session_id?: string;
    duration_ms?: number;
  } = {}
): Promise<string> {
  try {
    const id = uuidv4();
    const { entity_id, metadata = {}, session_id, duration_ms = 0 } = options;

    await queryContext(
      context,
      `INSERT INTO interaction_events
       (id, context, entity_type, entity_id, interaction_type, metadata, session_id, duration_ms)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [id, context, entityType, entity_id || null, interactionType, JSON.stringify(metadata), session_id || null, duration_ms]
    );

    logger.debug('Interaction tracked', {
      context,
      entityType,
      interactionType,
      entity_id,
    });

    return id;
  } catch (error) {
    logger.warn('Failed to track interaction', { error, context, entityType, interactionType });
    // Don't throw - tracking failures shouldn't break the app
    return '';
  }
}

/**
 * Tracks a view event with optional duration
 */
export async function trackView(
  context: AIContext,
  entityType: EntityType,
  entityId: string,
  durationMs?: number,
  sessionId?: string
): Promise<void> {
  await trackInteraction(context, entityType, 'view', {
    entity_id: entityId,
    duration_ms: durationMs,
    session_id: sessionId,
  });
}

/**
 * Tracks a search click (when user clicks on a search result)
 */
export async function trackSearchClick(
  context: AIContext,
  searchQuery: string,
  resultId: string,
  resultPosition: number,
  sessionId?: string
): Promise<void> {
  await trackInteraction(context, 'search', 'search_click', {
    entity_id: resultId,
    metadata: {
      query: searchQuery,
      position: resultPosition,
    },
    session_id: sessionId,
  });
}

/**
 * Tracks feedback (positive or negative)
 */
export async function trackFeedback(
  context: AIContext,
  entityType: EntityType,
  entityId: string,
  isPositive: boolean,
  comment?: string,
  sessionId?: string
): Promise<void> {
  await trackInteraction(context, entityType, isPositive ? 'feedback_positive' : 'feedback_negative', {
    entity_id: entityId,
    metadata: { comment },
    session_id: sessionId,
  });
}

// ===========================================
// Field-Level Corrections
// ===========================================

/**
 * Records a field-level correction
 * Corrections are weighted more heavily for learning (default 5x)
 */
export async function recordCorrection(
  context: AIContext,
  ideaId: string,
  fieldName: CorrectionField,
  oldValue: string | string[],
  newValue: string | string[],
  weight: number = 5.0
): Promise<string> {
  try {
    const id = uuidv4();

    // Convert arrays to JSON strings for storage
    const oldStr = Array.isArray(oldValue) ? JSON.stringify(oldValue) : oldValue;
    const newStr = Array.isArray(newValue) ? JSON.stringify(newValue) : newValue;

    await queryContext(
      context,
      `INSERT INTO field_corrections
       (id, context, idea_id, field_name, old_value, new_value, weight)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, context, ideaId, fieldName, oldStr, newStr, weight]
    );

    // Also track as an interaction
    await trackInteraction(context, 'idea', 'correction', {
      entity_id: ideaId,
      metadata: {
        field: fieldName,
        old_value: oldStr,
        new_value: newStr,
      },
    });

    logger.info('Correction recorded', {
      context,
      ideaId,
      field: fieldName,
      weight,
    });

    // Trigger pattern extraction asynchronously
    extractPatternsFromCorrection(context, fieldName, oldStr, newStr).catch(err => logger.debug('Pattern extraction skipped', { context, fieldName, error: err instanceof Error ? err.message : String(err) }));

    return id;
  } catch (error) {
    logger.error('Failed to record correction', error instanceof Error ? error : undefined, {
      context,
      ideaId,
      fieldName,
    });
    throw error;
  }
}

/**
 * Gets unprocessed corrections for learning
 */
export async function getUnprocessedCorrections(
  context: AIContext,
  limit: number = 100
): Promise<FieldCorrection[]> {
  try {
    const result = await queryContext(
      context,
      `SELECT * FROM field_corrections
       WHERE context = $1 AND applied_to_learning = false
       ORDER BY created_at ASC
       LIMIT $2`,
      [context, limit]
    );

    return result.rows.map(mapRowToCorrection);
  } catch (error) {
    logger.error('Failed to get unprocessed corrections', error instanceof Error ? error : undefined);
    return [];
  }
}

/**
 * Marks corrections as processed
 */
export async function markCorrectionsAsProcessed(
  context: AIContext,
  correctionIds: string[]
): Promise<void> {
  if (correctionIds.length === 0) {return;}

  try {
    await queryContext(
      context,
      `UPDATE field_corrections
       SET applied_to_learning = true, applied_at = NOW()
       WHERE id = ANY($1)`,
      [correctionIds]
    );
  } catch (error) {
    logger.error('Failed to mark corrections as processed', error instanceof Error ? error : undefined);
  }
}

/**
 * Gets correction history for a specific idea
 */
export async function getIdeaCorrectionHistory(
  context: AIContext,
  ideaId: string
): Promise<FieldCorrection[]> {
  try {
    const result = await queryContext(
      context,
      `SELECT * FROM field_corrections
       WHERE context = $1 AND idea_id = $2
       ORDER BY created_at DESC`,
      [context, ideaId]
    );

    return result.rows.map(mapRowToCorrection);
  } catch {
    return [];
  }
}

// ===========================================
// Pattern Extraction & Learning
// ===========================================

/**
 * Extracts patterns from a correction for predictive learning
 */
async function extractPatternsFromCorrection(
  context: AIContext,
  fieldName: string,
  oldValue: string,
  newValue: string
): Promise<void> {
  try {
    // Only extract patterns for certain fields
    const patternableFields = ['type', 'category', 'priority'];
    if (!patternableFields.includes(fieldName)) {return;}

    // Get the idea to extract keywords for pattern matching
    // This is intentionally simple - more complex ML would be overkill here

    // Check if we already have a similar pattern
    const existingPattern = await queryContext(
      context,
      `SELECT id, times_applied, times_correct, confidence
       FROM correction_patterns
       WHERE context = $1 AND field_name = $2 AND correction_value = $3
       LIMIT 1`,
      [context, fieldName, newValue]
    );

    if (existingPattern.rows.length > 0) {
      // Update existing pattern
      const pattern = existingPattern.rows[0];
      const newTimesApplied = pattern.times_applied + 1;
      const newTimesCorrect = pattern.times_correct + 1; // Assume correction is correct
      const newConfidence = Math.min(0.95, (newTimesCorrect / newTimesApplied) * 0.9 + 0.1);

      await queryContext(
        context,
        `UPDATE correction_patterns
         SET times_applied = $1, times_correct = $2, confidence = $3, updated_at = NOW()
         WHERE id = $4`,
        [newTimesApplied, newTimesCorrect, newConfidence, pattern.id]
      );
    }
    // Note: Creating new patterns requires more context (keywords from idea)
    // This would be done in the daily learning batch process
  } catch (error) {
    // Pattern extraction is non-critical
    logger.debug('Pattern extraction skipped', { error });
  }
}

/**
 * Gets active patterns for a field
 */
export async function getActivePatterns(
  context: AIContext,
  fieldName?: CorrectionField
): Promise<CorrectionPattern[]> {
  try {
    let query = `SELECT * FROM correction_patterns
                 WHERE context = $1 AND is_active = true AND confidence >= 0.6`;
    const params: (string | number)[] = [context];

    if (fieldName) {
      query += ` AND field_name = $2`;
      params.push(fieldName);
    }

    query += ` ORDER BY confidence DESC, times_applied DESC`;

    const result = await queryContext(context, query, params);
    return result.rows.map(mapRowToPattern);
  } catch {
    return [];
  }
}

/**
 * Applies patterns to suggest corrections
 */
export async function suggestCorrectionFromPatterns(
  context: AIContext,
  ideaContent: string,
  currentValues: Record<string, string>
): Promise<Record<string, string>> {
  const suggestions: Record<string, string> = {};

  try {
    const patterns = await getActivePatterns(context);

    for (const pattern of patterns) {
      // Skip if we already have a current value that differs significantly
      if (currentValues[pattern.field_name] === pattern.correction_value) {
        continue;
      }

      // Check trigger conditions
      const trigger = pattern.trigger_condition;

      if (trigger.contains && typeof trigger.contains === 'string') {
        if (ideaContent.toLowerCase().includes(trigger.contains.toLowerCase())) {
          suggestions[pattern.field_name] = pattern.correction_value;
        }
      }

      if (trigger.keywords && Array.isArray(trigger.keywords)) {
        const matchCount = trigger.keywords.filter(
          (kw: string) => ideaContent.toLowerCase().includes(kw.toLowerCase())
        ).length;

        const minMatches = typeof trigger.min_matches === 'number' ? trigger.min_matches : 1;
        if (matchCount >= minMatches) {
          suggestions[pattern.field_name] = pattern.correction_value;
        }
      }
    }
  } catch (error) {
    logger.debug('Pattern suggestion failed', { error });
  }

  return suggestions;
}

// ===========================================
// Session Management
// ===========================================

/**
 * Creates or gets a learning session
 */
export async function getOrCreateSession(
  context: AIContext,
  sessionToken: string,
  clientInfo?: Record<string, unknown>
): Promise<LearningSession> {
  try {
    // Try to get existing session
    const existing = await queryContext(
      context,
      `SELECT * FROM learning_sessions
       WHERE session_token = $1 AND ended_at IS NULL`,
      [sessionToken]
    );

    if (existing.rows.length > 0) {
      // Update last activity
      await queryContext(
        context,
        `UPDATE learning_sessions SET last_activity_at = NOW() WHERE session_token = $1`,
        [sessionToken]
      );
      return mapRowToSession(existing.rows[0]);
    }

    // Create new session
    const id = uuidv4();
    await queryContext(
      context,
      `INSERT INTO learning_sessions
       (id, context, session_token, client_info)
       VALUES ($1, $2, $3, $4)`,
      [id, context, sessionToken, JSON.stringify(clientInfo || {})]
    );

    const result = await queryContext(
      context,
      `SELECT * FROM learning_sessions WHERE id = $1`,
      [id]
    );

    return mapRowToSession(result.rows[0]);
  } catch (error) {
    logger.error('Failed to get/create session', error instanceof Error ? error : undefined);
    // Return a mock session so we don't break the flow
    return {
      id: uuidv4(),
      context,
      session_token: sessionToken,
      total_interactions: 0,
      ideas_created: 0,
      ideas_edited: 0,
      corrections_made: 0,
      searches_performed: 0,
      started_at: new Date().toISOString(),
      last_activity_at: new Date().toISOString(),
    };
  }
}

/**
 * Ends a learning session
 */
export async function endSession(sessionToken: string): Promise<void> {
  try {
    await queryContext(
      'personal', // Session table is global
      `UPDATE learning_sessions SET ended_at = NOW() WHERE session_token = $1`,
      [sessionToken]
    );
  } catch (error) {
    logger.debug('Failed to end session', { error });
  }
}

// ===========================================
// Statistics & Analytics
// ===========================================

/**
 * Gets interaction statistics
 */
export async function getInteractionStats(context: AIContext): Promise<InteractionStats> {
  try {
    const [totalResult, todayResult, weekResult, byTypeResult, byEntityResult, correctionsResult] = await Promise.all([
      // Total interactions
      queryContext(
        context,
        `SELECT COUNT(*) as count FROM interaction_events WHERE context = $1`,
        [context]
      ),

      // Today's interactions
      queryContext(
        context,
        `SELECT COUNT(*) as count FROM interaction_events
         WHERE context = $1 AND created_at >= CURRENT_DATE`,
        [context]
      ),

      // This week's interactions
      queryContext(
        context,
        `SELECT COUNT(*) as count FROM interaction_events
         WHERE context = $1 AND created_at >= CURRENT_DATE - INTERVAL '7 days'`,
        [context]
      ),

      // By interaction type
      queryContext(
        context,
        `SELECT interaction_type, COUNT(*) as count
         FROM interaction_events WHERE context = $1
         GROUP BY interaction_type`,
        [context]
      ),

      // By entity type
      queryContext(
        context,
        `SELECT entity_type, COUNT(*) as count
         FROM interaction_events WHERE context = $1
         GROUP BY entity_type`,
        [context]
      ),

      // Corrections count
      queryContext(
        context,
        `SELECT COUNT(*) as count FROM field_corrections WHERE context = $1`,
        [context]
      ),
    ]);

    const totalInteractions = parseInt(totalResult.rows[0]?.count || '0');
    const totalCorrections = parseInt(correctionsResult.rows[0]?.count || '0');

    const byType: Record<string, number> = {};
    byTypeResult.rows.forEach((row: { interaction_type: string; count: string }) => {
      byType[row.interaction_type] = parseInt(row.count);
    });

    const byEntity: Record<string, number> = {};
    byEntityResult.rows.forEach((row: { entity_type: string; count: string }) => {
      byEntity[row.entity_type] = parseInt(row.count);
    });

    // Calculate correction rate (corrections / edits)
    const editCount = byType['edit'] || 0;
    const correctionRate = editCount > 0 ? totalCorrections / editCount : 0;

    return {
      total_interactions: totalInteractions,
      interactions_today: parseInt(todayResult.rows[0]?.count || '0'),
      interactions_this_week: parseInt(weekResult.rows[0]?.count || '0'),
      by_type: byType,
      by_entity: byEntity,
      avg_session_duration_ms: 0, // Would need more complex calculation
      total_corrections: totalCorrections,
      correction_rate: Math.round(correctionRate * 100) / 100,
    };
  } catch (error) {
    logger.error('Failed to get interaction stats', error instanceof Error ? error : undefined);
    return {
      total_interactions: 0,
      interactions_today: 0,
      interactions_this_week: 0,
      by_type: {},
      by_entity: {},
      avg_session_duration_ms: 0,
      total_corrections: 0,
      correction_rate: 0,
    };
  }
}

/**
 * Gets correction statistics by field
 */
export async function getCorrectionStatsByField(
  context: AIContext
): Promise<Array<{ field: string; count: number; avgWeight: number }>> {
  try {
    const result = await queryContext(
      context,
      `SELECT field_name, COUNT(*) as count, AVG(weight) as avg_weight
       FROM field_corrections WHERE context = $1
       GROUP BY field_name
       ORDER BY count DESC`,
      [context]
    );

    return result.rows.map((row: { field_name: string; count: string; avg_weight: string }) => ({
      field: row.field_name,
      count: parseInt(row.count),
      avgWeight: parseFloat(row.avg_weight) || 1,
    }));
  } catch {
    return [];
  }
}

// ===========================================
// Helper Functions
// ===========================================

function mapRowToCorrection(row: Record<string, unknown>): FieldCorrection {
  return {
    id: row.id as string,
    context: row.context as AIContext,
    idea_id: row.idea_id as string,
    field_name: row.field_name as CorrectionField,
    old_value: row.old_value as string,
    new_value: row.new_value as string,
    weight: parseFloat(row.weight as string) || 1,
    applied_to_learning: row.applied_to_learning as boolean,
    created_at: (row.created_at as Date).toISOString(),
  };
}

function mapRowToPattern(row: Record<string, unknown>): CorrectionPattern {
  return {
    id: row.id as string,
    context: row.context as AIContext,
    field_name: row.field_name as CorrectionField,
    pattern_type: row.pattern_type as CorrectionPattern['pattern_type'],
    trigger_condition: row.trigger_condition as Record<string, unknown>,
    correction_value: row.correction_value as string,
    confidence: parseFloat(row.confidence as string) || 0.5,
    times_applied: parseInt(row.times_applied as string) || 0,
    times_correct: parseInt(row.times_correct as string) || 0,
    is_active: row.is_active as boolean,
  };
}

function mapRowToSession(row: Record<string, unknown>): LearningSession {
  return {
    id: row.id as string,
    context: row.context as AIContext,
    session_token: row.session_token as string,
    total_interactions: parseInt(row.total_interactions as string) || 0,
    ideas_created: parseInt(row.ideas_created as string) || 0,
    ideas_edited: parseInt(row.ideas_edited as string) || 0,
    corrections_made: parseInt(row.corrections_made as string) || 0,
    searches_performed: parseInt(row.searches_performed as string) || 0,
    started_at: (row.started_at as Date).toISOString(),
    last_activity_at: (row.last_activity_at as Date).toISOString(),
    ended_at: row.ended_at ? (row.ended_at as Date).toISOString() : undefined,
  };
}
