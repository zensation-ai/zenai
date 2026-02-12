/**
 * Reflection & Metacognition Engine (HiMeS Extension)
 *
 * Post-interaction self-analysis module. After important interactions,
 * the AI reflects on what worked, what didn't, and stores insights
 * as meta-knowledge that improves future responses.
 *
 * Research basis:
 * - ReFlexion Framework (2023): 91% success rate on coding tasks through
 *   iterative self-critique (vs 80% GPT-4 baseline)
 * - Self-Reflection reduces contradictions by up to 50%
 * - Stanford "curious replay": reflective experience replay boosted
 *   agent performance from 14→19/50
 *
 * Reflection types:
 * - quality_check: Was my response helpful?
 * - strategy_review: Could I have approached this differently?
 * - knowledge_gap: What didn't I know that I should have?
 * - user_alignment: Did I match the user's communication style?
 */

import { v4 as uuidv4 } from 'uuid';
import { AIContext, queryContext } from '../../utils/database-context';
import { logger } from '../../utils/logger';
import { longTermMemory } from './long-term-memory';
import { implicitFeedback, FeedbackSignal } from './implicit-feedback';

// ===========================================
// Types & Interfaces
// ===========================================

export type ReflectionType = 'quality_check' | 'strategy_review' | 'knowledge_gap' | 'user_alignment';

export interface ReflectionInsight {
  id: string;
  context: AIContext;
  sessionId: string;
  type: ReflectionType;
  /** The interaction that triggered reflection */
  triggerSummary: string;
  /** The reflection itself */
  insight: string;
  /** Confidence in this insight (0-1) */
  confidence: number;
  /** Action to take based on this insight */
  actionItem?: string;
  /** Was this insight applied in a later interaction? */
  applied: boolean;
  createdAt: Date;
}

export interface SessionReflection {
  sessionId: string;
  context: AIContext;
  insights: ReflectionInsight[];
  overallQuality: number; // 0-1
  lessonsLearned: string[];
}

// ===========================================
// Configuration
// ===========================================

const CONFIG = {
  /** Minimum messages in session before reflection */
  MIN_MESSAGES_FOR_REFLECTION: 4,
  /** Maximum reflection insights to store per session */
  MAX_INSIGHTS_PER_SESSION: 5,
  /** Maximum total insights in DB */
  MAX_TOTAL_INSIGHTS: 200,
  /** Reflection triggers: signals that should trigger reflection */
  REFLECTION_TRIGGERS: ['correction', 'frustration', 'rephrasing', 'deep_engagement', 'gratitude'] as FeedbackSignal[],
};

// ===========================================
// Reflection Engine
// ===========================================

class ReflectionEngineService {
  /**
   * Perform post-session reflection.
   * Analyzes the session's implicit feedback signals and generates
   * meta-insights about AI performance.
   */
  async reflectOnSession(
    sessionId: string,
    context: AIContext,
    messageCount: number
  ): Promise<SessionReflection> {
    const reflection: SessionReflection = {
      sessionId,
      context,
      insights: [],
      overallQuality: 0.5,
      lessonsLearned: [],
    };

    if (messageCount < CONFIG.MIN_MESSAGES_FOR_REFLECTION) {
      return reflection;
    }

    try {
      // Get feedback signals for this session
      const feedbackStats = implicitFeedback.getSessionStats(sessionId);

      if (!feedbackStats) {
        return reflection;
      }

      // Calculate overall quality from feedback
      reflection.overallQuality = feedbackStats.satisfactionEstimate;

      // Generate insights based on signals
      if (feedbackStats.negativeSignals > 0) {
        // There were problems - reflect on what went wrong
        const insight: ReflectionInsight = {
          id: uuidv4(),
          context,
          sessionId,
          type: 'quality_check',
          triggerSummary: `Session mit ${feedbackStats.negativeSignals} negativen Signalen`,
          insight: feedbackStats.negativeSignals > feedbackStats.positiveSignals
            ? 'Die Session hatte mehr negative als positive Signale. Moegliche Ursache: Antworten entsprachen nicht den Erwartungen.'
            : 'Gemischte Signale: Einige Antworten waren hilfreich, andere nicht.',
          confidence: feedbackStats.totalSignals > 3 ? 0.7 : 0.5,
          actionItem: 'Bei aehnlichen Fragen kuenftig praeziser nachfragen bevor ausfuehrlich geantwortet wird.',
          applied: false,
          createdAt: new Date(),
        };
        reflection.insights.push(insight);
        reflection.lessonsLearned.push(insight.actionItem || '');
      }

      if (feedbackStats.engagementScore > 0.6) {
        // High engagement - this topic/style resonated
        const insight: ReflectionInsight = {
          id: uuidv4(),
          context,
          sessionId,
          type: 'user_alignment',
          triggerSummary: `Hohe Engagement-Score: ${feedbackStats.engagementScore.toFixed(2)}`,
          insight: 'Hohe Nutzer-Engagement in dieser Session. Der Kommunikationsstil und die Tiefe der Antworten waren passend.',
          confidence: 0.65,
          applied: false,
          createdAt: new Date(),
        };
        reflection.insights.push(insight);
      }

      if (feedbackStats.satisfactionEstimate < 0.4 && feedbackStats.totalSignals >= 3) {
        // Low satisfaction - strategy review needed
        const insight: ReflectionInsight = {
          id: uuidv4(),
          context,
          sessionId,
          type: 'strategy_review',
          triggerSummary: `Niedrige Zufriedenheit: ${feedbackStats.satisfactionEstimate.toFixed(2)}`,
          insight: 'Die gewaehlte Strategie in dieser Session war suboptimal. Der Nutzer musste mehrfach korrigieren oder umformulieren.',
          confidence: 0.6,
          actionItem: 'Alternative Ansaetze pruefen: kuerzere Antworten, mehr Rueckfragen, andere Perspektive.',
          applied: false,
          createdAt: new Date(),
        };
        reflection.insights.push(insight);
        reflection.lessonsLearned.push(insight.actionItem || '');
      }

      // Persist insights and promote key lessons to long-term memory
      for (const insight of reflection.insights) {
        try {
          await this.persistInsight(context, insight);
        } catch (error) {
          logger.debug('Failed to persist reflection insight', { error });
        }
      }

      // Promote strong lessons to long-term memory
      if (reflection.lessonsLearned.length > 0) {
        for (const lesson of reflection.lessonsLearned.slice(0, 2)) {
          try {
            await longTermMemory.addFact(context, {
              factType: 'behavior',
              content: `[Selbst-Reflexion] ${lesson}`,
              confidence: 0.55,
              source: 'inferred' as const,
            });
          } catch (error) {
            logger.debug('Failed to promote lesson to long-term memory', { error });
          }
        }
      }

      logger.info('Session reflection complete', {
        sessionId,
        context,
        insights: reflection.insights.length,
        overallQuality: reflection.overallQuality,
        lessonsLearned: reflection.lessonsLearned.length,
      });

      return reflection;
    } catch (error) {
      logger.error('Reflection failed', error instanceof Error ? error : undefined, {
        sessionId,
        context,
      });
      return reflection;
    }
  }

  /**
   * Get recent reflection insights for a context
   */
  async getRecentInsights(context: AIContext, limit: number = 10): Promise<ReflectionInsight[]> {
    try {
      const result = await queryContext(
        context,
        `SELECT * FROM reflection_insights
         WHERE context = $1
         ORDER BY created_at DESC
         LIMIT $2`,
        [context, limit]
      );

      return result.rows.map(row => ({
        id: row.id as string,
        context: row.context as AIContext,
        sessionId: row.session_id as string,
        type: row.type as ReflectionType,
        triggerSummary: row.trigger_summary as string,
        insight: row.insight as string,
        confidence: (row.confidence as number) || 0.5,
        actionItem: row.action_item as string | undefined,
        applied: (row.applied as boolean) || false,
        createdAt: new Date(row.created_at as string),
      }));
    } catch (error) {
      if (error instanceof Error && error.message.includes('does not exist')) {
        return [];
      }
      logger.debug('Failed to get reflection insights', { error });
      return [];
    }
  }

  /**
   * Get unapplied action items (lessons not yet applied)
   */
  async getUnappliedLessons(context: AIContext): Promise<ReflectionInsight[]> {
    try {
      const result = await queryContext(
        context,
        `SELECT * FROM reflection_insights
         WHERE context = $1 AND applied = false AND action_item IS NOT NULL
         ORDER BY confidence DESC
         LIMIT 5`,
        [context]
      );

      return result.rows.map(row => ({
        id: row.id as string,
        context: row.context as AIContext,
        sessionId: row.session_id as string,
        type: row.type as ReflectionType,
        triggerSummary: row.trigger_summary as string,
        insight: row.insight as string,
        confidence: (row.confidence as number) || 0.5,
        actionItem: row.action_item as string | undefined,
        applied: false,
        createdAt: new Date(row.created_at as string),
      }));
    } catch {
      return [];
    }
  }

  /**
   * Mark a lesson as applied
   */
  async markApplied(context: AIContext, insightId: string): Promise<void> {
    try {
      await queryContext(
        context,
        `UPDATE reflection_insights SET applied = true WHERE id = $1`,
        [insightId]
      );
    } catch (error) {
      logger.debug('Failed to mark insight as applied', { insightId, error });
    }
  }

  /**
   * Persist a reflection insight
   */
  private async persistInsight(context: AIContext, insight: ReflectionInsight): Promise<void> {
    await queryContext(
      context,
      `INSERT INTO reflection_insights
       (id, context, session_id, type, trigger_summary, insight,
        confidence, action_item, applied, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (id) DO NOTHING`,
      [
        insight.id, context, insight.sessionId, insight.type,
        insight.triggerSummary, insight.insight, insight.confidence,
        insight.actionItem || null, insight.applied, insight.createdAt,
      ]
    );
  }
}

// ===========================================
// Singleton Export
// ===========================================

export const reflectionEngine = new ReflectionEngineService();
