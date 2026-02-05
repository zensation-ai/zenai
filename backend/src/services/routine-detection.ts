/**
 * Routine Detection Service
 *
 * Detects user routines and patterns for proactive assistance.
 * Learns from user behavior to anticipate needs and suggest actions.
 *
 * Features:
 * - Time-based patterns (e.g., "Monday morning = week planning")
 * - Sequence-based patterns (e.g., "after meeting = follow-up email")
 * - Context-based patterns (e.g., "business ideas often need emails")
 * - Confidence scoring and decay
 */

import { v4 as uuidv4 } from 'uuid';
import { queryContext, AIContext } from '../utils/database-context';
import { logger } from '../utils/logger';

// ===========================================
// Types & Interfaces
// ===========================================

export interface RoutinePattern {
  id: string;
  context: AIContext;
  patternType: PatternType;
  triggerConfig: RoutineTrigger;
  actionType: string;
  actionConfig: Record<string, unknown>;
  confidence: number;
  occurrences: number;
  lastTriggered: Date | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type PatternType = 'time_based' | 'sequence_based' | 'context_based';

export interface RoutineTrigger {
  // Time-based triggers
  dayOfWeek?: number[];      // 0-6 (Sun-Sat)
  hourRange?: [number, number];
  specificTime?: string;     // HH:MM format

  // Sequence-based triggers
  afterAction?: string;      // e.g., "meeting_created", "idea_created"
  afterCategory?: string;    // e.g., "business"
  afterType?: string;        // e.g., "task"

  // Context-based triggers
  keywords?: string[];
  ideaType?: string;
  ideaCategory?: string;

  // Combined triggers
  combineWith?: 'AND' | 'OR';
}

export interface UserAction {
  actionType: string;
  actionData: Record<string, unknown>;
  timestamp?: Date;
}

export interface DetectedRoutine {
  pattern: RoutinePattern;
  triggerMatch: TriggerMatch;
  suggestedAction: SuggestedAction;
}

export interface TriggerMatch {
  matchType: PatternType;
  matchedConditions: string[];
  matchStrength: number;
}

export interface SuggestedAction {
  actionType: string;
  title: string;
  description: string;
  quickAction?: {
    label: string;
    endpoint: string;
    params: Record<string, unknown>;
  };
}

/** Database row for routine pattern */
interface RoutinePatternRow {
  id: string;
  context: AIContext;
  pattern_type: PatternType;
  trigger_config: string | RoutineTrigger;
  action_type: string;
  action_config: string | Record<string, unknown> | null;
  confidence: string | number;
  occurrences: string | number;
  last_triggered: string | Date | null;
  is_active: boolean;
  created_at: string | Date;
  updated_at: string | Date;
}

// ===========================================
// Configuration
// ===========================================

const CONFIG = {
  // Minimum occurrences before pattern is considered valid
  MIN_OCCURRENCES_FOR_PATTERN: 3,
  // Minimum confidence to suggest action
  MIN_CONFIDENCE_TO_SUGGEST: 0.5,
  // Confidence increase per occurrence
  CONFIDENCE_INCREMENT: 0.1,
  // Confidence decay per day without occurrence
  CONFIDENCE_DECAY_PER_DAY: 0.02,
  // Maximum patterns to analyze
  MAX_PATTERNS_TO_ANALYZE: 50,
  // Time window for action sequence (minutes)
  SEQUENCE_TIME_WINDOW_MINUTES: 60,
  // Hour tolerance for time-based patterns
  TIME_TOLERANCE_HOURS: 1,
};

// ===========================================
// Routine Detection Service
// ===========================================

class RoutineDetectionService {

  // ===========================================
  // Pattern Analysis
  // ===========================================

  /**
   * Analyzes user behavior and detects routine patterns
   */
  async analyzeUserPatterns(
    context: AIContext,
    days: number = 30
  ): Promise<RoutinePattern[]> {
    logger.info('Analyzing user patterns', { context, days });

    const patterns: RoutinePattern[] = [];

    try {
      // 1. Analyze time-based patterns
      const timePatterns = await this.analyzeTimeBasedPatterns(context, days);
      patterns.push(...timePatterns);

      // 2. Analyze sequence-based patterns
      const sequencePatterns = await this.analyzeSequencePatterns(context, days);
      patterns.push(...sequencePatterns);

      // 3. Analyze context-based patterns
      const contextPatterns = await this.analyzeContextPatterns(context, days);
      patterns.push(...contextPatterns);

      logger.info('Pattern analysis complete', {
        context,
        timePatterns: timePatterns.length,
        sequencePatterns: sequencePatterns.length,
        contextPatterns: contextPatterns.length,
      });

      return patterns;
    } catch (error) {
      logger.error('Pattern analysis failed', error instanceof Error ? error : undefined);
      return [];
    }
  }

  /**
   * Analyzes time-based patterns (when does the user typically do things?)
   */
  private async analyzeTimeBasedPatterns(
    context: AIContext,
    days: number
  ): Promise<RoutinePattern[]> {
    const patterns: RoutinePattern[] = [];

    try {
      // Find time-based action patterns
      const result = await queryContext(
        context,
        `SELECT
          action_type,
          day_of_week,
          hour_of_day,
          COUNT(*) as occurrence_count
        FROM user_action_log
        WHERE context = $1
          AND timestamp >= NOW() - ($2 || ' days')::INTERVAL
        GROUP BY action_type, day_of_week, hour_of_day
        HAVING COUNT(*) >= $3
        ORDER BY occurrence_count DESC
        LIMIT 20`,
        [context, days, CONFIG.MIN_OCCURRENCES_FOR_PATTERN]
      );

      for (const row of result.rows) {
        const confidence = Math.min(
          0.5 + (row.occurrence_count / 10) * 0.5,
          1.0
        );

        // Check if pattern already exists
        const existingPattern = await this.getExistingPattern(
          context,
          'time_based',
          row.action_type,
          row.day_of_week,
          row.hour_of_day
        );

        if (existingPattern) {
          // Update existing pattern
          await this.updatePatternConfidence(existingPattern.id, context, confidence);
          patterns.push({ ...existingPattern, confidence });
        } else {
          // Create new pattern
          const pattern = await this.createPattern(context, {
            patternType: 'time_based',
            triggerConfig: {
              dayOfWeek: [row.day_of_week],
              hourRange: [row.hour_of_day, row.hour_of_day + 1],
            },
            actionType: row.action_type,
            actionConfig: {},
            confidence,
            occurrences: row.occurrence_count,
          });
          if (pattern) {patterns.push(pattern);}
        }
      }
    } catch (error) {
      logger.error('Time pattern analysis failed', error instanceof Error ? error : undefined);
    }

    return patterns;
  }

  /**
   * Analyzes sequence-based patterns (what does the user do after certain actions?)
   */
  private async analyzeSequencePatterns(
    context: AIContext,
    days: number
  ): Promise<RoutinePattern[]> {
    const patterns: RoutinePattern[] = [];

    try {
      // Find action sequences
      const result = await queryContext(
        context,
        `WITH action_pairs AS (
          SELECT
            a1.action_type as first_action,
            a2.action_type as second_action,
            a1.timestamp as first_time,
            a2.timestamp as second_time
          FROM user_action_log a1
          JOIN user_action_log a2 ON
            a2.timestamp > a1.timestamp
            AND a2.timestamp <= a1.timestamp + make_interval(mins => $4)
            AND a1.context = a2.context
          WHERE a1.context = $1
            AND a1.timestamp >= NOW() - make_interval(days => $2)
        )
        SELECT
          first_action,
          second_action,
          COUNT(*) as sequence_count
        FROM action_pairs
        GROUP BY first_action, second_action
        HAVING COUNT(*) >= $3
        ORDER BY sequence_count DESC
        LIMIT 15`,
        [context, days, CONFIG.MIN_OCCURRENCES_FOR_PATTERN, CONFIG.SEQUENCE_TIME_WINDOW_MINUTES]
      );

      for (const row of result.rows) {
        const confidence = Math.min(
          0.4 + (row.sequence_count / 10) * 0.6,
          0.95
        );

        const pattern = await this.createPattern(context, {
          patternType: 'sequence_based',
          triggerConfig: {
            afterAction: row.first_action,
          },
          actionType: row.second_action,
          actionConfig: {},
          confidence,
          occurrences: row.sequence_count,
        });
        if (pattern) {patterns.push(pattern);}
      }
    } catch (error) {
      logger.error('Sequence pattern analysis failed', error instanceof Error ? error : undefined);
    }

    return patterns;
  }

  /**
   * Analyzes context-based patterns (what does the user do with certain types of content?)
   */
  private async analyzeContextPatterns(
    context: AIContext,
    days: number
  ): Promise<RoutinePattern[]> {
    const patterns: RoutinePattern[] = [];

    try {
      // Find patterns based on idea categories/types
      const result = await queryContext(
        context,
        `SELECT
          i.category,
          i.type,
          al.action_type,
          COUNT(*) as occurrence_count
        FROM ideas i
        JOIN user_action_log al ON
          al.action_data->>'ideaId' = i.id::text
          AND al.timestamp >= i.created_at
          AND al.timestamp <= i.created_at + INTERVAL '24 hours'
        WHERE i.context = $1
          AND i.created_at >= NOW() - ($2 || ' days')::INTERVAL
        GROUP BY i.category, i.type, al.action_type
        HAVING COUNT(*) >= $3
        ORDER BY occurrence_count DESC
        LIMIT 15`,
        [context, days, CONFIG.MIN_OCCURRENCES_FOR_PATTERN]
      );

      for (const row of result.rows) {
        const confidence = Math.min(
          0.4 + (row.occurrence_count / 8) * 0.5,
          0.9
        );

        const pattern = await this.createPattern(context, {
          patternType: 'context_based',
          triggerConfig: {
            ideaCategory: row.category,
            ideaType: row.type,
          },
          actionType: row.action_type,
          actionConfig: {},
          confidence,
          occurrences: row.occurrence_count,
        });
        if (pattern) {patterns.push(pattern);}
      }
    } catch (error) {
      logger.error('Context pattern analysis failed', error instanceof Error ? error : undefined);
    }

    return patterns;
  }

  // ===========================================
  // Active Routine Checking
  // ===========================================

  /**
   * Checks for currently active routines that should trigger
   */
  async checkActiveRoutines(context: AIContext): Promise<DetectedRoutine[]> {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const hourOfDay = now.getHours();

    const detectedRoutines: DetectedRoutine[] = [];

    try {
      // Get all active patterns for this context
      const result = await queryContext(
        context,
        `SELECT
          id, context, pattern_type, trigger_config, action_type, action_config,
          confidence, occurrences, last_triggered, is_active, created_at, updated_at
        FROM routine_patterns
        WHERE context = $1
          AND is_active = true
          AND confidence >= $2
        ORDER BY confidence DESC
        LIMIT $3`,
        [context, CONFIG.MIN_CONFIDENCE_TO_SUGGEST, CONFIG.MAX_PATTERNS_TO_ANALYZE]
      );

      for (const row of result.rows) {
        const pattern = this.rowToPattern(row);
        const triggerMatch = this.checkTriggerMatch(pattern, dayOfWeek, hourOfDay);

        if (triggerMatch && triggerMatch.matchStrength >= 0.5) {
          // Check if this pattern was triggered recently (avoid spam)
          if (pattern.lastTriggered) {
            const hoursSinceLastTrigger = (now.getTime() - pattern.lastTriggered.getTime()) / (1000 * 60 * 60);
            if (hoursSinceLastTrigger < 4) {
              continue; // Skip if triggered in last 4 hours
            }
          }

          const suggestedAction = this.buildSuggestedAction(pattern);

          detectedRoutines.push({
            pattern,
            triggerMatch,
            suggestedAction,
          });
        }
      }

      logger.info('Active routine check complete', {
        context,
        detected: detectedRoutines.length,
      });

      return detectedRoutines;
    } catch (error) {
      logger.error('Active routine check failed', error instanceof Error ? error : undefined);
      return [];
    }
  }

  /**
   * Checks if a pattern's trigger conditions are met
   */
  private checkTriggerMatch(
    pattern: RoutinePattern,
    currentDayOfWeek: number,
    currentHour: number
  ): TriggerMatch | null {
    const trigger = pattern.triggerConfig;
    const matchedConditions: string[] = [];
    let matchStrength = 0;

    // Time-based matching
    if (pattern.patternType === 'time_based') {
      // Check day of week
      if (trigger.dayOfWeek && trigger.dayOfWeek.length > 0) {
        if (trigger.dayOfWeek.includes(currentDayOfWeek)) {
          matchedConditions.push(`day:${currentDayOfWeek}`);
          matchStrength += 0.4;
        } else {
          return null; // Wrong day
        }
      }

      // Check hour range
      if (trigger.hourRange) {
        const [startHour, endHour] = trigger.hourRange;
        const inRange = currentHour >= startHour - CONFIG.TIME_TOLERANCE_HOURS &&
                        currentHour <= endHour + CONFIG.TIME_TOLERANCE_HOURS;
        if (inRange) {
          matchedConditions.push(`hour:${currentHour}`);
          matchStrength += 0.6;
        } else {
          return null; // Wrong time
        }
      }
    }

    // Sequence-based matching would need recent action context
    if (pattern.patternType === 'sequence_based') {
      // This needs the recent action context to be passed in
      // For now, we'll handle this in a different flow
      matchStrength = pattern.confidence * 0.8;
      matchedConditions.push(`after:${trigger.afterAction}`);
    }

    // Context-based matching
    if (pattern.patternType === 'context_based') {
      // This also needs current idea context
      matchStrength = pattern.confidence * 0.7;
      if (trigger.ideaCategory) {
        matchedConditions.push(`category:${trigger.ideaCategory}`);
      }
      if (trigger.ideaType) {
        matchedConditions.push(`type:${trigger.ideaType}`);
      }
    }

    if (matchStrength === 0) {
      return null;
    }

    return {
      matchType: pattern.patternType,
      matchedConditions,
      matchStrength: Math.min(matchStrength, 1.0),
    };
  }

  /**
   * Builds a suggested action from a pattern
   */
  private buildSuggestedAction(pattern: RoutinePattern): SuggestedAction {
    const actionMap: Record<string, SuggestedAction> = {
      'idea_created': {
        actionType: 'create_idea',
        title: 'Neue Idee erfassen',
        description: 'Basierend auf deinem Muster ist jetzt ein guter Zeitpunkt für neue Gedanken.',
      },
      'meeting_created': {
        actionType: 'create_meeting',
        title: 'Meeting planen',
        description: 'Du planst üblicherweise jetzt Meetings.',
      },
      'draft_generated': {
        actionType: 'generate_draft',
        title: 'Entwurf erstellen',
        description: 'Soll ich einen Entwurf vorbereiten?',
      },
      'export_created': {
        actionType: 'export',
        title: 'Export erstellen',
        description: 'Zeit für eine Zusammenfassung?',
      },
      'digest_requested': {
        actionType: 'create_digest',
        title: 'Zusammenfassung generieren',
        description: 'Soll ich eine Übersicht erstellen?',
      },
    };

    return actionMap[pattern.actionType] || {
      actionType: pattern.actionType,
      title: `${pattern.actionType} durchführen`,
      description: `Basierend auf deinem Verhaltensmuster (${Math.round(pattern.confidence * 100)}% Konfidenz)`,
    };
  }

  // ===========================================
  // Learning from Actions
  // ===========================================

  /**
   * Records a user action for pattern learning
   */
  async learnFromAction(
    context: AIContext,
    action: UserAction
  ): Promise<void> {
    const timestamp = action.timestamp || new Date();

    try {
      // 1. Log the action
      await queryContext(
        context,
        `INSERT INTO user_action_log (context, action_type, action_data, timestamp)
         VALUES ($1, $2, $3, $4)`,
        [context, action.actionType, JSON.stringify(action.actionData), timestamp]
      );

      // 2. Check for sequence pattern completion
      await this.checkSequenceCompletion(context, action.actionType, timestamp);

      // 3. Update related pattern confidence
      await this.updateRelatedPatterns(context, action.actionType, timestamp);

      logger.debug('Action logged for learning', {
        context,
        actionType: action.actionType,
      });
    } catch (error) {
      logger.error('Failed to learn from action', error instanceof Error ? error : undefined);
    }
  }

  /**
   * Checks if the action completes a sequence pattern
   */
  private async checkSequenceCompletion(
    context: AIContext,
    actionType: string,
    timestamp: Date
  ): Promise<void> {
    try {
      // Find patterns where this action is the "after" action
      const result = await queryContext(
        context,
        `SELECT id, trigger_config, confidence, occurrences
         FROM routine_patterns
         WHERE context = $1
           AND pattern_type = 'sequence_based'
           AND action_type = $2
           AND is_active = true`,
        [context, actionType]
      );

      for (const row of result.rows) {
        const trigger = typeof row.trigger_config === 'string'
          ? JSON.parse(row.trigger_config)
          : row.trigger_config;

        if (trigger.afterAction) {
          // Check if the "before" action happened recently
          const recentAction = await queryContext(
            context,
            `SELECT id FROM user_action_log
             WHERE context = $1
               AND action_type = $2
               AND timestamp >= $3 - make_interval(mins => $4)
               AND timestamp < $3
             LIMIT 1`,
            [context, trigger.afterAction, timestamp, CONFIG.SEQUENCE_TIME_WINDOW_MINUTES]
          );

          if (recentAction.rows.length > 0) {
            // Sequence completed! Increase confidence
            const newConfidence = Math.min(row.confidence + CONFIG.CONFIDENCE_INCREMENT, 1.0);
            await queryContext(
              context,
              `UPDATE routine_patterns
               SET confidence = $2,
                   occurrences = occurrences + 1,
                   last_triggered = $3,
                   updated_at = NOW()
               WHERE id = $1`,
              [row.id, newConfidence, timestamp]
            );
          }
        }
      }
    } catch (error) {
      logger.error('Sequence completion check failed', error instanceof Error ? error : undefined);
    }
  }

  /**
   * Updates patterns related to the action
   */
  private async updateRelatedPatterns(
    context: AIContext,
    actionType: string,
    timestamp: Date
  ): Promise<void> {
    const dayOfWeek = timestamp.getDay();

    try {
      // Find time-based patterns that match current action + time
      await queryContext(
        context,
        `UPDATE routine_patterns
         SET occurrences = occurrences + 1,
             confidence = LEAST(confidence + $4, 1.0),
             last_triggered = $5,
             updated_at = NOW()
         WHERE context = $1
           AND action_type = $2
           AND pattern_type = 'time_based'
           AND (trigger_config->>'dayOfWeek')::jsonb ? $3::text
           AND is_active = true`,
        [context, actionType, dayOfWeek.toString(), CONFIG.CONFIDENCE_INCREMENT, timestamp]
      );
    } catch (error) {
      logger.error('Related pattern update failed', error instanceof Error ? error : undefined);
    }
  }

  // ===========================================
  // Pattern Management
  // ===========================================

  /**
   * Creates a new routine pattern
   */
  private async createPattern(
    context: AIContext,
    data: {
      patternType: PatternType;
      triggerConfig: RoutineTrigger;
      actionType: string;
      actionConfig: Record<string, unknown>;
      confidence: number;
      occurrences: number;
    }
  ): Promise<RoutinePattern | null> {
    const id = uuidv4();

    try {
      await queryContext(
        context,
        `INSERT INTO routine_patterns (
          id, context, pattern_type, trigger_config, action_type, action_config,
          confidence, occurrences, is_active
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)
        ON CONFLICT DO NOTHING`,
        [
          id,
          context,
          data.patternType,
          JSON.stringify(data.triggerConfig),
          data.actionType,
          JSON.stringify(data.actionConfig),
          data.confidence,
          data.occurrences,
        ]
      );

      return {
        id,
        context,
        patternType: data.patternType,
        triggerConfig: data.triggerConfig,
        actionType: data.actionType,
        actionConfig: data.actionConfig,
        confidence: data.confidence,
        occurrences: data.occurrences,
        lastTriggered: null,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    } catch (error) {
      logger.error('Pattern creation failed', error instanceof Error ? error : undefined);
      return null;
    }
  }

  /**
   * Gets an existing pattern matching the criteria
   */
  private async getExistingPattern(
    context: AIContext,
    patternType: PatternType,
    actionType: string,
    dayOfWeek?: number,
    _hourOfDay?: number
  ): Promise<RoutinePattern | null> {
    try {
      let query = `
        SELECT id, context, pattern_type, trigger_config, action_type, action_config,
               confidence, occurrences, last_triggered, is_active, created_at, updated_at
        FROM routine_patterns
        WHERE context = $1
          AND pattern_type = $2
          AND action_type = $3
      `;
      const params: (AIContext | PatternType | string)[] = [context, patternType, actionType];

      if (dayOfWeek !== undefined && patternType === 'time_based') {
        query += ` AND (trigger_config->>'dayOfWeek')::jsonb ? $4::text`;
        params.push(dayOfWeek.toString());
      }

      query += ` LIMIT 1`;

      const result = await queryContext(context, query, params);

      if (result.rows.length === 0) {
        return null;
      }

      return this.rowToPattern(result.rows[0]);
    } catch (error) {
      logger.error('Get existing pattern failed', error instanceof Error ? error : undefined);
      return null;
    }
  }

  /**
   * Updates pattern confidence
   */
  private async updatePatternConfidence(
    patternId: string,
    context: AIContext,
    confidence: number
  ): Promise<void> {
    try {
      await queryContext(
        context,
        `UPDATE routine_patterns
         SET confidence = $2, updated_at = NOW()
         WHERE id = $1 AND context = $3`,
        [patternId, confidence, context]
      );
    } catch (error) {
      logger.error('Update pattern confidence failed', error instanceof Error ? error : undefined);
    }
  }

  /**
   * Applies confidence decay to patterns that haven't been triggered
   */
  async applyConfidenceDecay(context: AIContext): Promise<number> {
    try {
      const result = await queryContext(
        context,
        `UPDATE routine_patterns
         SET confidence = GREATEST(confidence - $2, 0.1),
             is_active = CASE
               WHEN GREATEST(confidence - $2, 0.1) < 0.3 THEN false
               ELSE is_active
             END,
             updated_at = NOW()
         WHERE context = $1
           AND is_active = true
           AND (last_triggered IS NULL OR last_triggered < NOW() - INTERVAL '7 days')
         RETURNING id`,
        [context, CONFIG.CONFIDENCE_DECAY_PER_DAY * 7] // Apply weekly decay
      );

      return result.rows.length;
    } catch (error) {
      logger.error('Confidence decay failed', error instanceof Error ? error : undefined);
      return 0;
    }
  }

  /**
   * Gets all patterns for a context
   */
  async getPatterns(
    context: AIContext,
    options: { activeOnly?: boolean; minConfidence?: number } = {}
  ): Promise<RoutinePattern[]> {
    const { activeOnly = true, minConfidence = 0 } = options;

    try {
      let query = `
        SELECT id, context, pattern_type, trigger_config, action_type, action_config,
               confidence, occurrences, last_triggered, is_active, created_at, updated_at
        FROM routine_patterns
        WHERE context = $1
          AND confidence >= $2
      `;
      const params: (AIContext | number)[] = [context, minConfidence];

      if (activeOnly) {
        query += ` AND is_active = true`;
      }

      query += ` ORDER BY confidence DESC`;

      const result = await queryContext(context, query, params);

      return result.rows.map(this.rowToPattern);
    } catch (error) {
      logger.error('Get patterns failed', error instanceof Error ? error : undefined);
      return [];
    }
  }

  // ===========================================
  // Helpers
  // ===========================================

  /**
   * Converts a database row to a RoutinePattern
   */
  private rowToPattern(row: RoutinePatternRow): RoutinePattern {
    return {
      id: row.id,
      context: row.context,
      patternType: row.pattern_type,
      triggerConfig: typeof row.trigger_config === 'string'
        ? JSON.parse(row.trigger_config)
        : row.trigger_config,
      actionType: row.action_type,
      actionConfig: typeof row.action_config === 'string'
        ? JSON.parse(row.action_config)
        : row.action_config || {},
      confidence: typeof row.confidence === 'string' ? parseFloat(row.confidence) : row.confidence,
      occurrences: typeof row.occurrences === 'string' ? parseInt(row.occurrences, 10) : row.occurrences,
      lastTriggered: row.last_triggered ? new Date(row.last_triggered) : null,
      isActive: row.is_active,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}

// ===========================================
// Singleton Export
// ===========================================

export const routineDetectionService = new RoutineDetectionService();
