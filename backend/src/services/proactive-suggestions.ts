/**
 * Proactive Suggestion Engine
 *
 * Generates intelligent, proactive suggestions for the user based on:
 * - Detected routines and patterns
 * - Unlinked similar ideas
 * - Follow-up opportunities
 * - Time-based reminders
 *
 * This transforms the app from reactive to proactive assistance.
 */

import { v4 as uuidv4 } from 'uuid';
import { queryContext, AIContext } from '../utils/database-context';
import { logger } from '../utils/logger';
import { routineDetectionService, UserAction } from './routine-detection';

// ===========================================
// Types & Interfaces
// ===========================================

export interface ProactiveSuggestion {
  id: string;
  type: SuggestionType;
  title: string;
  description: string;
  action: SuggestedAction;
  confidence: number;
  relevanceScore: number;
  expiresAt: Date;
  metadata: Record<string, unknown>;
  source: SuggestionSource;
  priority: 'high' | 'medium' | 'low';
  createdAt: Date;
}

export type SuggestionType = 'routine' | 'connection' | 'reminder' | 'draft' | 'follow_up' | 'insight';

export type SuggestionSource = 'routine_detection' | 'knowledge_graph' | 'time_trigger' | 'context_analysis' | 'user_history';

export interface SuggestedAction {
  actionType: ActionType;
  params: Record<string, unknown>;
  quickActionLabel: string;
  endpoint?: string;
}

export type ActionType =
  | 'generate_draft'
  | 'create_idea'
  | 'link_ideas'
  | 'schedule_reminder'
  | 'start_task'
  | 'view_digest'
  | 'export_data'
  | 'open_idea'
  | 'create_meeting';

export interface SuggestionFeedback {
  suggestionId: string;
  accepted: boolean;
  dismissReason?: string;
  actionTaken?: Record<string, unknown>;
}

export interface ProactiveSettings {
  proactivityLevel: 'aggressive' | 'balanced' | 'minimal' | 'off';
  enabledTypes: SuggestionType[];
  quietHoursStart: number;
  quietHoursEnd: number;
  maxSuggestionsPerDay: number;
}

// ===========================================
// Configuration
// ===========================================

const CONFIG = {
  // Default max suggestions to return
  DEFAULT_MAX_SUGGESTIONS: 5,
  // Suggestion expiry time in hours
  SUGGESTION_EXPIRY_HOURS: 24,
  // Minimum confidence for routine-based suggestions
  MIN_ROUTINE_CONFIDENCE: 0.5,
  // Minimum similarity for connection suggestions
  MIN_CONNECTION_SIMILARITY: 0.7,
  // Hours to look back for follow-up opportunities
  FOLLOW_UP_LOOKBACK_HOURS: 48,
  // Maximum age of ideas for connection suggestions (days)
  MAX_IDEA_AGE_FOR_CONNECTIONS: 30,
};

// ===========================================
// Proactive Suggestion Engine
// ===========================================

export class ProactiveSuggestionEngine {

  // ===========================================
  // Main Suggestion Generation
  // ===========================================

  /**
   * Get all current proactive suggestions for a context
   */
  async getSuggestions(
    context: AIContext,
    options: { limit?: number; types?: SuggestionType[] } = {}
  ): Promise<ProactiveSuggestion[]> {
    const { limit = CONFIG.DEFAULT_MAX_SUGGESTIONS, types } = options;

    logger.info('Generating proactive suggestions', { context, limit, types });

    // Check if proactive suggestions are enabled
    const settings = await this.getSettings(context);
    if (settings.proactivityLevel === 'off') {
      return [];
    }

    // Check quiet hours
    if (this.isQuietHours(settings)) {
      logger.debug('In quiet hours, skipping suggestions', { context });
      return [];
    }

    const suggestions: ProactiveSuggestion[] = [];
    const enabledTypes = types || settings.enabledTypes;

    try {
      // 1. Routine-based suggestions
      if (enabledTypes.includes('routine')) {
        const routineSuggestions = await this.generateRoutineSuggestions(context);
        suggestions.push(...routineSuggestions);
      }

      // 2. Connection suggestions (unlinked similar ideas)
      if (enabledTypes.includes('connection')) {
        const connectionSuggestions = await this.generateConnectionSuggestions(context);
        suggestions.push(...connectionSuggestions);
      }

      // 3. Follow-up suggestions
      if (enabledTypes.includes('follow_up')) {
        const followUpSuggestions = await this.generateFollowUpSuggestions(context);
        suggestions.push(...followUpSuggestions);
      }

      // 4. Draft suggestions
      if (enabledTypes.includes('draft')) {
        const draftSuggestions = await this.generateDraftSuggestions(context);
        suggestions.push(...draftSuggestions);
      }

      // 5. Insight suggestions
      if (enabledTypes.includes('insight')) {
        const insightSuggestions = await this.generateInsightSuggestions(context);
        suggestions.push(...insightSuggestions);
      }

      // Rank and deduplicate
      const rankedSuggestions = this.rankSuggestions(suggestions);

      // Apply daily limit
      const dailySuggestionCount = await this.getDailySuggestionCount(context);
      const remainingQuota = Math.max(0, settings.maxSuggestionsPerDay - dailySuggestionCount);
      const limitedSuggestions = rankedSuggestions.slice(0, Math.min(limit, remainingQuota));

      // Cold-start: if no suggestions at all, show getting-started suggestions
      if (limitedSuggestions.length === 0 && dailySuggestionCount === 0) {
        const gettingStarted = this.getGettingStartedSuggestions();
        logger.info('Returning getting-started suggestions (cold start)', { context });
        return gettingStarted.slice(0, limit);
      }

      logger.info('Proactive suggestions generated', {
        context,
        total: suggestions.length,
        returned: limitedSuggestions.length,
        dailyCount: dailySuggestionCount,
      });

      return limitedSuggestions;
    } catch (error) {
      logger.error('Failed to generate suggestions', error instanceof Error ? error : undefined);
      return [];
    }
  }

  // ===========================================
  // Suggestion Generators
  // ===========================================

  /**
   * Generate suggestions based on detected routines
   */
  private async generateRoutineSuggestions(context: AIContext): Promise<ProactiveSuggestion[]> {
    const suggestions: ProactiveSuggestion[] = [];

    try {
      const detectedRoutines = await routineDetectionService.checkActiveRoutines(context);

      for (const routine of detectedRoutines) {
        if (routine.pattern.confidence >= CONFIG.MIN_ROUTINE_CONFIDENCE) {
          suggestions.push({
            id: uuidv4(),
            type: 'routine',
            title: routine.suggestedAction.title,
            description: routine.suggestedAction.description,
            action: {
              actionType: routine.suggestedAction.actionType as ActionType || 'open_idea',
              params: routine.pattern.actionConfig,
              quickActionLabel: 'Jetzt',
            },
            confidence: routine.pattern.confidence,
            relevanceScore: routine.triggerMatch.matchStrength * routine.pattern.confidence,
            expiresAt: this.calculateExpiryTime(4), // 4 hours
            metadata: {
              patternId: routine.pattern.id,
              patternType: routine.pattern.patternType,
              matchedConditions: routine.triggerMatch.matchedConditions,
            },
            source: 'routine_detection',
            priority: routine.pattern.confidence > 0.8 ? 'high' : 'medium',
            createdAt: new Date(),
          });
        }
      }
    } catch (error) {
      logger.error('Routine suggestion generation failed', error instanceof Error ? error : undefined);
    }

    return suggestions;
  }

  /**
   * Generate suggestions for connecting similar unlinked ideas
   */
  private async generateConnectionSuggestions(context: AIContext): Promise<ProactiveSuggestion[]> {
    const suggestions: ProactiveSuggestion[] = [];

    try {
      // Find pairs of similar ideas that aren't linked
      const result = await queryContext(
        context,
        `WITH similar_pairs AS (
          SELECT
            i1.id as idea1_id,
            i1.title as idea1_title,
            i2.id as idea2_id,
            i2.title as idea2_title,
            1 - (i1.embedding <=> i2.embedding) as similarity
          FROM ideas i1
          JOIN ideas i2 ON i1.id < i2.id
          WHERE i1.context = $1
            AND i2.context = $1
            AND i1.is_archived = false
            AND i2.is_archived = false
            AND i1.embedding IS NOT NULL
            AND i2.embedding IS NOT NULL
            AND i1.created_at >= NOW() - ($2 || ' days')::INTERVAL
            AND 1 - (i1.embedding <=> i2.embedding) >= $3
        )
        SELECT sp.*
        FROM similar_pairs sp
        WHERE NOT EXISTS (
          SELECT 1 FROM idea_relations ir
          WHERE (ir.source_id = sp.idea1_id AND ir.target_id = sp.idea2_id)
             OR (ir.source_id = sp.idea2_id AND ir.target_id = sp.idea1_id)
        )
        ORDER BY sp.similarity DESC
        LIMIT 5`,
        [context, CONFIG.MAX_IDEA_AGE_FOR_CONNECTIONS, CONFIG.MIN_CONNECTION_SIMILARITY]
      );

      for (const row of result.rows) {
        suggestions.push({
          id: uuidv4(),
          type: 'connection',
          title: 'Verbindung entdeckt',
          description: `"${row.idea1_title}" und "${row.idea2_title}" scheinen zusammenzuhängen.`,
          action: {
            actionType: 'link_ideas',
            params: {
              ideaId1: row.idea1_id,
              ideaId2: row.idea2_id,
            },
            quickActionLabel: 'Verknüpfen',
            endpoint: '/api/knowledge-graph/link',
          },
          confidence: row.similarity,
          relevanceScore: row.similarity * 0.9,
          expiresAt: this.calculateExpiryTime(48), // 48 hours
          metadata: {
            idea1Id: row.idea1_id,
            idea1Title: row.idea1_title,
            idea2Id: row.idea2_id,
            idea2Title: row.idea2_title,
            similarity: row.similarity,
          },
          source: 'knowledge_graph',
          priority: row.similarity > 0.85 ? 'high' : 'medium',
          createdAt: new Date(),
        });
      }
    } catch (error) {
      logger.error('Connection suggestion generation failed', error instanceof Error ? error : undefined);
    }

    return suggestions;
  }

  /**
   * Generate follow-up suggestions for meetings and tasks
   */
  private async generateFollowUpSuggestions(context: AIContext): Promise<ProactiveSuggestion[]> {
    const suggestions: ProactiveSuggestion[] = [];

    try {
      // Find completed meetings without follow-up
      const meetingsResult = await queryContext(
        context,
        `SELECT m.id, m.title, m.date, m.meeting_type
         FROM meetings m
         WHERE m.context = $1
           AND m.status = 'completed'
           AND m.date >= NOW() - make_interval(hours => $2)
           AND NOT EXISTS (
             SELECT 1 FROM ideas i
             WHERE i.raw_transcript ILIKE '%' || m.title || '%'
               AND i.created_at > m.date
               AND i.type = 'task'
           )
         ORDER BY m.date DESC
         LIMIT 3`,
        [context, CONFIG.FOLLOW_UP_LOOKBACK_HOURS]
      );

      for (const meeting of meetingsResult.rows) {
        suggestions.push({
          id: uuidv4(),
          type: 'follow_up',
          title: 'Follow-up erstellen',
          description: `Meeting "${meeting.title}" könnte ein Follow-up benötigen.`,
          action: {
            actionType: 'generate_draft',
            params: {
              meetingId: meeting.id,
              draftType: 'email',
              topic: `Follow-up: ${meeting.title}`,
            },
            quickActionLabel: 'Entwurf erstellen',
            endpoint: '/api/drafts/generate',
          },
          confidence: 0.7,
          relevanceScore: 0.75,
          expiresAt: this.calculateExpiryTime(24),
          metadata: {
            meetingId: meeting.id,
            meetingTitle: meeting.title,
            meetingDate: meeting.date,
          },
          source: 'context_analysis',
          priority: 'medium',
          createdAt: new Date(),
        });
      }

      // Find tasks that might need a draft
      const tasksResult = await queryContext(
        context,
        `SELECT i.id, i.title, i.summary, i.type, i.created_at
         FROM ideas i
         WHERE i.context = $1
           AND i.type = 'task'
           AND i.is_archived = false
           AND i.created_at >= NOW() - make_interval(hours => $2)
           AND NOT EXISTS (
             SELECT 1 FROM idea_drafts d WHERE d.idea_id = i.id
           )
           AND (
             i.title ILIKE '%schreib%'
             OR i.title ILIKE '%email%'
             OR i.title ILIKE '%mail%'
             OR i.summary ILIKE '%schreib%'
           )
         LIMIT 3`,
        [context, CONFIG.FOLLOW_UP_LOOKBACK_HOURS]
      );

      for (const task of tasksResult.rows) {
        suggestions.push({
          id: uuidv4(),
          type: 'draft',
          title: 'Entwurf vorbereiten',
          description: `Soll ich für "${task.title}" einen Entwurf erstellen?`,
          action: {
            actionType: 'generate_draft',
            params: {
              ideaId: task.id,
              ideaTitle: task.title,
            },
            quickActionLabel: 'Generieren',
            endpoint: '/api/drafts/generate',
          },
          confidence: 0.8,
          relevanceScore: 0.8,
          expiresAt: this.calculateExpiryTime(24),
          metadata: {
            ideaId: task.id,
            ideaTitle: task.title,
          },
          source: 'context_analysis',
          priority: 'medium',
          createdAt: new Date(),
        });
      }
    } catch (error) {
      logger.error('Follow-up suggestion generation failed', error instanceof Error ? error : undefined);
    }

    return suggestions;
  }

  /**
   * Generate draft suggestions based on recent tasks
   */
  private async generateDraftSuggestions(_context: AIContext): Promise<ProactiveSuggestion[]> {
    // This is handled in generateFollowUpSuggestions for now
    // Could be expanded for more sophisticated draft suggestions
    return [];
  }

  /**
   * Generate insight suggestions based on knowledge graph analysis
   */
  private async generateInsightSuggestions(context: AIContext): Promise<ProactiveSuggestion[]> {
    const suggestions: ProactiveSuggestion[] = [];

    try {
      // Find clusters of related ideas that could form an insight
      const result = await queryContext(
        context,
        `WITH idea_clusters AS (
          SELECT
            i.primary_topic_id,
            t.name as topic_name,
            COUNT(*) as idea_count,
            MAX(i.created_at) as latest_idea
          FROM ideas i
          JOIN idea_topics t ON i.primary_topic_id = t.id
          WHERE i.context = $1
            AND i.is_archived = false
            AND i.created_at >= NOW() - INTERVAL '14 days'
          GROUP BY i.primary_topic_id, t.name
          HAVING COUNT(*) >= 3
        )
        SELECT * FROM idea_clusters
        WHERE latest_idea >= NOW() - INTERVAL '3 days'
        ORDER BY idea_count DESC
        LIMIT 2`,
        [context]
      );

      for (const cluster of result.rows) {
        suggestions.push({
          id: uuidv4(),
          type: 'insight',
          title: `Themen-Fokus: ${cluster.topic_name}`,
          description: `Du hast ${cluster.idea_count} Gedanken zu "${cluster.topic_name}". Soll ich eine Zusammenfassung erstellen?`,
          action: {
            actionType: 'view_digest',
            params: {
              topicId: cluster.primary_topic_id,
              topicName: cluster.topic_name,
            },
            quickActionLabel: 'Zusammenfassung',
            endpoint: '/api/digest/topic',
          },
          confidence: 0.6,
          relevanceScore: Math.min(cluster.idea_count / 10, 1) * 0.7,
          expiresAt: this.calculateExpiryTime(72), // 3 days
          metadata: {
            topicId: cluster.primary_topic_id,
            topicName: cluster.topic_name,
            ideaCount: cluster.idea_count,
          },
          source: 'knowledge_graph',
          priority: cluster.idea_count >= 5 ? 'medium' : 'low',
          createdAt: new Date(),
        });
      }
    } catch (error) {
      logger.error('Insight suggestion generation failed', error instanceof Error ? error : undefined);
    }

    return suggestions;
  }

  // ===========================================
  // Feedback Handling
  // ===========================================

  /**
   * Record feedback on a suggestion
   */
  async recordFeedback(
    suggestionId: string,
    accepted: boolean,
    context: AIContext,
    additionalData?: { dismissReason?: string; actionTaken?: Record<string, unknown> }
  ): Promise<void> {
    try {
      await queryContext(
        context,
        `INSERT INTO proactive_suggestion_feedback (
          suggestion_id, context, suggestion_type, was_accepted, dismiss_reason, action_taken
        ) VALUES ($1, $2, 'unknown', $3, $4, $5)`,
        [
          suggestionId,
          context,
          accepted,
          additionalData?.dismissReason || null,
          additionalData?.actionTaken ? JSON.stringify(additionalData.actionTaken) : null,
        ]
      );

      // Update routine patterns if this was a routine suggestion
      if (accepted) {
        // Increase confidence for accepted routines
        await queryContext(
          context,
          `UPDATE routine_patterns
           SET confidence = LEAST(confidence + 0.05, 1.0),
               last_triggered = NOW()
           WHERE id IN (
             SELECT (metadata->>'patternId')::uuid
             FROM proactive_suggestion_feedback
             WHERE suggestion_id = $1
           )`,
          [suggestionId]
        );
      } else {
        // Decrease confidence for rejected routines
        await queryContext(
          context,
          `UPDATE routine_patterns
           SET confidence = GREATEST(confidence - 0.1, 0.1)
           WHERE id IN (
             SELECT (metadata->>'patternId')::uuid
             FROM proactive_suggestion_feedback
             WHERE suggestion_id = $1
           )`,
          [suggestionId]
        );
      }

      logger.info('Suggestion feedback recorded', {
        suggestionId,
        accepted,
        dismissReason: additionalData?.dismissReason,
      });
    } catch (error) {
      logger.error('Failed to record feedback', error instanceof Error ? error : undefined);
    }
  }

  // ===========================================
  // Settings Management
  // ===========================================

  /**
   * Get proactive settings for a context
   */
  async getSettings(context: AIContext): Promise<ProactiveSettings> {
    try {
      const result = await queryContext(
        context,
        `SELECT proactivity_level, enabled_types, quiet_hours_start, quiet_hours_end, max_suggestions_per_day
         FROM proactive_settings
         WHERE context = $1`,
        [context]
      );

      if (result.rows.length === 0) {
        // Return defaults
        return {
          proactivityLevel: 'balanced',
          enabledTypes: ['routine', 'connection', 'reminder', 'draft', 'follow_up'],
          quietHoursStart: 22,
          quietHoursEnd: 7,
          maxSuggestionsPerDay: 10,
        };
      }

      const row = result.rows[0];
      let enabledTypes = row.enabled_types;
      if (typeof enabledTypes === 'string') {
        try {
          enabledTypes = JSON.parse(enabledTypes);
        } catch {
          enabledTypes = ['routine', 'connection', 'follow_up'];
        }
      }
      return {
        proactivityLevel: row.proactivity_level,
        enabledTypes,
        quietHoursStart: row.quiet_hours_start,
        quietHoursEnd: row.quiet_hours_end,
        maxSuggestionsPerDay: row.max_suggestions_per_day,
      };
    } catch (error) {
      logger.error('Failed to get settings', error instanceof Error ? error : undefined);
      return {
        proactivityLevel: 'balanced',
        enabledTypes: ['routine', 'connection', 'follow_up'],
        quietHoursStart: 22,
        quietHoursEnd: 7,
        maxSuggestionsPerDay: 10,
      };
    }
  }

  /**
   * Update proactive settings
   */
  async updateSettings(context: AIContext, settings: Partial<ProactiveSettings>): Promise<void> {
    try {
      const updateParts: string[] = [];
      const params: (string | number | string[])[] = [context];
      let paramIndex = 2;

      if (settings.proactivityLevel !== undefined) {
        updateParts.push(`proactivity_level = $${paramIndex++}`);
        params.push(settings.proactivityLevel);
      }
      if (settings.enabledTypes !== undefined) {
        updateParts.push(`enabled_types = $${paramIndex++}`);
        params.push(JSON.stringify(settings.enabledTypes));
      }
      if (settings.quietHoursStart !== undefined) {
        updateParts.push(`quiet_hours_start = $${paramIndex++}`);
        params.push(settings.quietHoursStart);
      }
      if (settings.quietHoursEnd !== undefined) {
        updateParts.push(`quiet_hours_end = $${paramIndex++}`);
        params.push(settings.quietHoursEnd);
      }
      if (settings.maxSuggestionsPerDay !== undefined) {
        updateParts.push(`max_suggestions_per_day = $${paramIndex++}`);
        params.push(settings.maxSuggestionsPerDay);
      }

      if (updateParts.length > 0) {
        await queryContext(
          context,
          `UPDATE proactive_settings
           SET ${updateParts.join(', ')}, updated_at = NOW()
           WHERE context = $1`,
          params
        );
      }
    } catch (error) {
      logger.error('Failed to update settings', error instanceof Error ? error : undefined);
    }
  }

  // ===========================================
  // Helpers
  // ===========================================

  /**
   * Cold-start getting-started suggestions for new users
   */
  private getGettingStartedSuggestions(): ProactiveSuggestion[] {
    const now = new Date();
    return [
      {
        id: `gs-profile-${now.getTime()}`,
        type: 'insight' as SuggestionType,
        title: 'Profil vervollständigen',
        description: 'Erzähle der KI mehr über dich, damit sie bessere Vorschläge machen kann.',
        action: { actionType: 'navigate' as ActionType, params: { path: '/my-ai' }, quickActionLabel: 'Profil öffnen' },
        confidence: 1,
        relevanceScore: 1,
        expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
        metadata: { type: 'getting_started' },
        source: 'context_analysis' as SuggestionSource,
        priority: 'high',
        createdAt: now,
      },
      {
        id: `gs-idea-${now.getTime()}`,
        type: 'draft' as SuggestionType,
        title: 'Ersten Gedanken erfassen',
        description: 'Halte deinen ersten Gedanken fest – per Text oder Sprache.',
        action: { actionType: 'create_idea' as ActionType, params: {}, quickActionLabel: 'Gedanke erstellen' },
        confidence: 1,
        relevanceScore: 0.9,
        expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
        metadata: { type: 'getting_started' },
        source: 'context_analysis' as SuggestionSource,
        priority: 'medium',
        createdAt: now,
      },
      {
        id: `gs-chat-${now.getTime()}`,
        type: 'insight' as SuggestionType,
        title: 'Chat ausprobieren',
        description: 'Stelle der KI eine Frage oder diskutiere eine Idee im Chat.',
        action: { actionType: 'navigate' as ActionType, params: { path: '/chat' }, quickActionLabel: 'Chat öffnen' },
        confidence: 1,
        relevanceScore: 0.8,
        expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
        metadata: { type: 'getting_started' },
        source: 'context_analysis' as SuggestionSource,
        priority: 'medium',
        createdAt: now,
      },
    ];
  }

  /**
   * Rank suggestions by relevance and confidence
   */
  private rankSuggestions(suggestions: ProactiveSuggestion[]): ProactiveSuggestion[] {
    return suggestions.sort((a, b) => {
      // Priority first
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority];
      if (priorityDiff !== 0) {return priorityDiff;}

      // Then by combined score
      const scoreA = a.relevanceScore * 0.6 + a.confidence * 0.4;
      const scoreB = b.relevanceScore * 0.6 + b.confidence * 0.4;
      return scoreB - scoreA;
    });
  }

  /**
   * Check if we're in quiet hours
   */
  private isQuietHours(settings: ProactiveSettings): boolean {
    const now = new Date();
    const currentHour = now.getHours();

    if (settings.quietHoursStart <= settings.quietHoursEnd) {
      // Normal range (e.g., 22-23)
      return currentHour >= settings.quietHoursStart && currentHour < settings.quietHoursEnd;
    } else {
      // Overnight range (e.g., 22-7)
      return currentHour >= settings.quietHoursStart || currentHour < settings.quietHoursEnd;
    }
  }

  /**
   * Calculate expiry time
   */
  private calculateExpiryTime(hours: number): Date {
    return new Date(Date.now() + hours * 60 * 60 * 1000);
  }

  /**
   * Get count of suggestions shown today
   */
  private async getDailySuggestionCount(context: AIContext): Promise<number> {
    try {
      const result = await queryContext(
        context,
        `SELECT COUNT(*) as count
         FROM proactive_suggestion_feedback
         WHERE context = $1
           AND created_at >= CURRENT_DATE`,
        [context]
      );
      return parseInt(result.rows[0]?.count || '0', 10);
    } catch {
      return 0;
    }
  }

  // ===========================================
  // Action Recording
  // ===========================================

  /**
   * Record a user action for learning
   */
  async recordAction(context: AIContext, action: UserAction): Promise<void> {
    await routineDetectionService.learnFromAction(context, action);
  }
}

// ===========================================
// Singleton Export
// ===========================================

export const proactiveSuggestionEngine = new ProactiveSuggestionEngine();
