/**
 * Cross-Learning Service (Phase 143)
 *
 * Extracts strategy insights from successful agent executions and
 * injects them into future agent prompts, enabling agents to learn
 * from each other's successes.
 *
 * @module services/agents/cross-learning
 */

import { queryPublic } from '../../utils/database';
import { generateClaudeResponse } from '../claude/core';
import { logger } from '../../utils/logger';

// ===========================================
// Constants
// ===========================================

const MAX_INSIGHTS_PER_PROMPT = 5;
const MAX_ACTIVE_INSIGHTS = 100;
const INSIGHT_TTL_DAYS = 30;
const MIN_RATING_FOR_EXTRACTION = 4;

// ===========================================
// Types & Interfaces
// ===========================================

export interface StrategyInsight {
  id: string;
  sourceAgentRole: string;
  strategyType: string;
  insight: string;
  context: string;
  successRate: number;
  sampleSize: number;
  applicableRoles: string[];
  createdAt: Date;
  updatedAt: Date;
}

interface ExecutionInput {
  role: string;
  strategy: string;
  result: string;
  context: string;
  rating?: number;
}

// ===========================================
// Row Mapper
// ===========================================

function rowToInsight(row: Record<string, unknown>): StrategyInsight {
  return {
    id: row.id as string,
    sourceAgentRole: row.source_agent_role as string,
    strategyType: row.strategy_type as string,
    insight: row.insight as string,
    context: row.context as string,
    successRate: parseFloat(String(row.success_rate)),
    sampleSize: parseInt(String(row.sample_size), 10),
    applicableRoles: (row.applicable_roles as string[]) || [],
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

// ===========================================
// CrossLearningService
// ===========================================

export class CrossLearningService {
  /**
   * Extract a generalizable insight from a high-rated agent execution.
   * Only extracts if rating >= MIN_RATING_FOR_EXTRACTION.
   */
  async extractInsight(execution: ExecutionInput): Promise<StrategyInsight | null> {
    if (execution.rating === null || execution.rating === undefined || execution.rating < MIN_RATING_FOR_EXTRACTION) {
      return null;
    }

    try {
      const prompt = [
        'Extract one short, generalizable strategy insight from this agent execution.',
        'Return ONLY a JSON object with these fields:',
        '- insight: a concise sentence describing the reusable strategy',
        '- applicableRoles: an array of agent role strings this could help',
        '',
        `Agent Role: ${execution.role}`,
        `Strategy: ${execution.strategy}`,
        `Context: ${execution.context}`,
        `Result: ${execution.result}`,
      ].join('\n');

      const aiResponse = await generateClaudeResponse('Extract a strategy insight as JSON: { "insight": "...", "applicableRoles": ["..."] }', prompt);
      let parsed: { insight: string; applicableRoles: string[] };

      try {
        parsed = JSON.parse(aiResponse);
      } catch {
        parsed = {
          insight: aiResponse.slice(0, 500),
          applicableRoles: [execution.role],
        };
      }

      const result = await queryPublic(
        `INSERT INTO agent_strategy_insights
           (source_agent_role, strategy_type, insight, context, success_rate, sample_size, applicable_roles)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [
          execution.role,
          execution.strategy,
          parsed.insight,
          execution.context,
          1.0,
          1,
          parsed.applicableRoles,
        ]
      );

      const insight = rowToInsight(result.rows[0]);

      logger.info('Cross-learning insight extracted', {
        id: insight.id,
        role: execution.role,
        strategy: execution.strategy,
      });

      return insight;
    } catch (error) {
      logger.error(
        'Failed to extract cross-learning insight',
        error instanceof Error ? error : undefined
      );
      throw error;
    }
  }

  /**
   * Get insights relevant to a specific agent role and task.
   * Returns up to MAX_INSIGHTS_PER_PROMPT insights ordered by success rate.
   */
  async getRelevantInsights(role: string, _taskDescription: string): Promise<StrategyInsight[]> {
    try {
      const result = await queryPublic(
        `SELECT * FROM agent_strategy_insights
         WHERE $1 = ANY(applicable_roles) OR source_agent_role = $1
         ORDER BY success_rate DESC
         LIMIT $2`,
        [role, MAX_INSIGHTS_PER_PROMPT]
      );

      return result.rows.map((row: Record<string, unknown>) => rowToInsight(row));
    } catch (error) {
      logger.error(
        'Failed to get relevant insights',
        error instanceof Error ? error : undefined
      );
      return [];
    }
  }

  /**
   * Enrich an agent prompt with cross-learning insights.
   * Pure function — no database access.
   */
  enrichAgentPrompt(basePrompt: string, insights: StrategyInsight[]): string {
    if (insights.length === 0) {
      return basePrompt;
    }

    const header =
      '\n\n## Cross-Learning Insights\nThe following strategies have worked well for similar tasks:\n';

    const insightLines = insights
      .map(
        (ins) =>
          `- [from ${ins.sourceAgentRole}, ${Math.round(ins.successRate * 100)}% success]: ${ins.insight}`
      )
      .join('\n');

    return basePrompt + header + insightLines + '\n';
  }

  /**
   * Record whether an insight was helpful in a subsequent execution.
   * Updates success_rate via exponential moving average.
   */
  async recordInsightOutcome(insightId: string, wasHelpful: boolean): Promise<void> {
    try {
      const factor = wasHelpful ? 1 : 0;
      await queryPublic(
        `UPDATE agent_strategy_insights
         SET success_rate = success_rate * 0.9 + $1 * 0.1,
             sample_size = sample_size + 1,
             updated_at = NOW()
         WHERE id = $2`,
        [factor, insightId]
      );

      logger.debug('Insight outcome recorded', { insightId, wasHelpful });
    } catch (error) {
      logger.error(
        'Failed to record insight outcome',
        error instanceof Error ? error : undefined
      );
      throw error;
    }
  }

  /**
   * Prune weak insights that have low success rates after enough samples.
   * Deletes insights older than INSIGHT_TTL_DAYS with success_rate < minSuccessRate
   * and sample_size >= 5.
   */
  async pruneWeakInsights(minSuccessRate: number = 0.3): Promise<number> {
    try {
      const result = await queryPublic(
        `DELETE FROM agent_strategy_insights
         WHERE created_at < NOW() - $1::interval
           AND success_rate < $2
           AND sample_size >= 5
         RETURNING id`,
        [`${INSIGHT_TTL_DAYS} days`, minSuccessRate]
      );

      const deleted = result.rows.length;

      if (deleted > 0) {
        logger.info('Pruned weak cross-learning insights', { deleted, minSuccessRate });
      }

      return deleted;
    } catch (error) {
      logger.error(
        'Failed to prune weak insights',
        error instanceof Error ? error : undefined
      );
      throw error;
    }
  }
}

// ===========================================
// Singleton
// ===========================================

export const crossLearningService = new CrossLearningService();
