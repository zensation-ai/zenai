/**
 * Agent Feedback Service
 *
 * Tracks execution quality, user ratings, and aggregates strategy
 * performance metrics for the self-evolving agent pipeline.
 *
 * @module services/agents/agent-feedback
 */

import { pool } from '../../utils/database-context';
import { logger } from '../../utils/logger';

// ===========================================
// Types & Interfaces
// ===========================================

export interface AgentExecutionFeedback {
  execution_id: string;
  strategy: string;
  agents_used: string[];
  completion_score: number; // 0 or 1
  user_rating?: number; // 1-5
  token_count: number;
  execution_time_ms: number;
  error_count: number;
  task_type?: string;
  metadata?: Record<string, unknown>;
}

export interface StrategyPerformance {
  strategy: string;
  total_executions: number;
  avg_user_rating: number;
  avg_completion_rate: number;
  avg_execution_time_ms: number;
  avg_tokens: number;
  success_trend: 'improving' | 'stable' | 'declining';
}

export interface AgentPerformance {
  agent_role: string;
  total_executions: number;
  avg_user_rating: number;
  avg_completion_rate: number;
  avg_execution_time_ms: number;
  avg_error_count: number;
}

// ===========================================
// Feedback Recording
// ===========================================

/**
 * Record execution feedback into the database.
 */
export async function recordFeedback(data: AgentExecutionFeedback): Promise<string> {
  try {
    const result = await pool.query(
      `INSERT INTO agent_execution_feedback
        (execution_id, strategy, agents_used, completion_score, user_rating,
         token_count, execution_time_ms, error_count, task_type, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      [
        data.execution_id,
        data.strategy,
        data.agents_used,
        data.completion_score,
        data.user_rating ?? null,
        data.token_count,
        data.execution_time_ms,
        data.error_count,
        data.task_type ?? null,
        JSON.stringify(data.metadata ?? {}),
      ]
    );

    logger.info('Agent execution feedback recorded', {
      executionId: data.execution_id,
      strategy: data.strategy,
    });

    return result.rows[0].id;
  } catch (error) {
    logger.error('Failed to record agent feedback', error instanceof Error ? error : undefined);
    throw error;
  }
}

/**
 * Record a user rating for a specific execution.
 */
export async function recordUserRating(executionId: string, rating: number): Promise<boolean> {
  if (rating < 1 || rating > 5 || !Number.isInteger(rating)) {
    throw new Error('Rating must be an integer between 1 and 5');
  }

  try {
    const result = await pool.query(
      `UPDATE agent_execution_feedback
       SET user_rating = $1
       WHERE execution_id = $2`,
      [rating, executionId]
    );

    const updated = (result.rowCount ?? 0) > 0;

    if (updated) {
      logger.info('User rating recorded', { executionId, rating });
    }

    return updated;
  } catch (error) {
    logger.error('Failed to record user rating', error instanceof Error ? error : undefined);
    throw error;
  }
}

// ===========================================
// Performance Aggregation
// ===========================================

/**
 * Compute success trend by comparing recent vs older performance.
 */
function computeTrend(recentRate: number, olderRate: number): 'improving' | 'stable' | 'declining' {
  const diff = recentRate - olderRate;
  if (diff > 0.05) {return 'improving';}
  if (diff < -0.05) {return 'declining';}
  return 'stable';
}

/**
 * Get aggregated performance metrics per strategy.
 */
export async function getStrategyPerformance(days: number = 30): Promise<StrategyPerformance[]> {
  try {
    // Get aggregate stats
    const statsResult = await pool.query(
      `SELECT
         strategy,
         COUNT(*) as total_executions,
         COALESCE(AVG(user_rating), 0) as avg_user_rating,
         AVG(completion_score) as avg_completion_rate,
         AVG(execution_time_ms) as avg_execution_time_ms,
         AVG(token_count) as avg_tokens
       FROM agent_execution_feedback
       WHERE created_at > NOW() - $1::interval
       GROUP BY strategy
       ORDER BY total_executions DESC`,
      [`${days} days`]
    );

    // For each strategy, compute trend
    const performances: StrategyPerformance[] = [];

    for (const row of statsResult.rows) {
      // Recent half vs older half for trend
      const halfDays = Math.floor(days / 2);
      const trendResult = await pool.query(
        `SELECT
           AVG(CASE WHEN created_at > NOW() - $2::interval THEN completion_score END) as recent_rate,
           AVG(CASE WHEN created_at <= NOW() - $2::interval THEN completion_score END) as older_rate
         FROM agent_execution_feedback
         WHERE strategy = $1 AND created_at > NOW() - $3::interval`,
        [row.strategy, `${halfDays} days`, `${days} days`]
      );

      const trend = trendResult.rows[0];
      const recentRate = parseFloat(trend.recent_rate) || 0;
      const olderRate = parseFloat(trend.older_rate) || 0;

      performances.push({
        strategy: row.strategy,
        total_executions: parseInt(row.total_executions, 10),
        avg_user_rating: parseFloat(parseFloat(row.avg_user_rating).toFixed(2)),
        avg_completion_rate: parseFloat(parseFloat(row.avg_completion_rate).toFixed(3)),
        avg_execution_time_ms: Math.round(parseFloat(row.avg_execution_time_ms)),
        avg_tokens: Math.round(parseFloat(row.avg_tokens)),
        success_trend: computeTrend(recentRate, olderRate),
      });
    }

    return performances;
  } catch (error) {
    logger.error('Failed to get strategy performance', error instanceof Error ? error : undefined);
    throw error;
  }
}

/**
 * Get performance metrics for a specific agent role.
 */
export async function getAgentPerformance(
  agentRole: string,
  days: number = 30
): Promise<AgentPerformance | null> {
  try {
    const result = await pool.query(
      `SELECT
         COUNT(*) as total_executions,
         COALESCE(AVG(user_rating), 0) as avg_user_rating,
         AVG(completion_score) as avg_completion_rate,
         AVG(execution_time_ms) as avg_execution_time_ms,
         AVG(error_count) as avg_error_count
       FROM agent_execution_feedback
       WHERE $1 = ANY(agents_used)
         AND created_at > NOW() - $2::interval`,
      [agentRole, `${days} days`]
    );

    const row = result.rows[0];
    if (!row || parseInt(row.total_executions, 10) === 0) {
      return null;
    }

    return {
      agent_role: agentRole,
      total_executions: parseInt(row.total_executions, 10),
      avg_user_rating: parseFloat(parseFloat(row.avg_user_rating).toFixed(2)),
      avg_completion_rate: parseFloat(parseFloat(row.avg_completion_rate).toFixed(3)),
      avg_execution_time_ms: Math.round(parseFloat(row.avg_execution_time_ms)),
      avg_error_count: parseFloat(parseFloat(row.avg_error_count).toFixed(2)),
    };
  } catch (error) {
    logger.error('Failed to get agent performance', error instanceof Error ? error : undefined);
    throw error;
  }
}

/**
 * Recommend the best strategy for a given task type based on historical performance.
 */
export async function getBestStrategy(taskType: string): Promise<string | null> {
  try {
    const result = await pool.query(
      `SELECT strategy,
              AVG(completion_score) as avg_completion,
              COALESCE(AVG(user_rating), 0) as avg_rating,
              COUNT(*) as exec_count
       FROM agent_execution_feedback
       WHERE task_type = $1
         AND created_at > NOW() - INTERVAL '60 days'
       GROUP BY strategy
       HAVING COUNT(*) >= 3
       ORDER BY
         AVG(completion_score) DESC,
         COALESCE(AVG(user_rating), 0) DESC,
         AVG(execution_time_ms) ASC
       LIMIT 1`,
      [taskType]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0].strategy;
  } catch (error) {
    logger.error('Failed to get best strategy', error instanceof Error ? error : undefined);
    throw error;
  }
}
