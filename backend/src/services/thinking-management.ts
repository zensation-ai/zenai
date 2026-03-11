/**
 * Phase 46: Thinking Management Service
 *
 * Handles strategy persistence, chain retrieval, and learning from feedback.
 * Bridges the in-memory budget strategies with database-backed persistence.
 */

import { AIContext, queryContext } from '../utils/database-context';
import { logger } from '../utils/logger';
import { BUDGET_STRATEGIES, ThinkingBudgetStrategy, TaskType } from './claude/thinking-budget';

// ===========================================
// Strategy Persistence
// ===========================================

/**
 * Persist current in-memory budget strategies to the database
 */
export async function persistStrategies(context: AIContext): Promise<void> {
  try {
    for (const [taskType, strategy] of Object.entries(BUDGET_STRATEGIES)) {
      await queryContext(
        context,
        `INSERT INTO thinking_budget_strategies (task_type, base_tokens, complexity_multiplier, min_tokens, max_tokens, last_optimized_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
         ON CONFLICT (task_type) DO UPDATE SET
           base_tokens = EXCLUDED.base_tokens,
           complexity_multiplier = EXCLUDED.complexity_multiplier,
           min_tokens = EXCLUDED.min_tokens,
           max_tokens = EXCLUDED.max_tokens,
           last_optimized_at = NOW(),
           updated_at = NOW()`,
        [taskType, strategy.baseTokens, strategy.complexityMultiplier, strategy.minTokens, strategy.maxTokens]
      );
    }

    logger.info('Budget strategies persisted', { context, strategyCount: Object.keys(BUDGET_STRATEGIES).length });
  } catch (error) {
    logger.error('Failed to persist strategies', error instanceof Error ? error : undefined);
    throw error;
  }
}

/**
 * Load persisted strategies from database into memory (on startup)
 */
export async function loadPersistedStrategies(context: AIContext): Promise<void> {
  try {
    const result = await queryContext(
      context,
      `SELECT task_type, base_tokens, complexity_multiplier, min_tokens, max_tokens, sample_count, avg_quality
       FROM thinking_budget_strategies`
    );

    for (const row of result.rows) {
      const taskType = row.task_type as TaskType;
      if (BUDGET_STRATEGIES[taskType]) {
        BUDGET_STRATEGIES[taskType] = {
          taskType,
          baseTokens: parseInt(row.base_tokens, 10),
          complexityMultiplier: parseFloat(row.complexity_multiplier),
          minTokens: parseInt(row.min_tokens, 10),
          maxTokens: parseInt(row.max_tokens, 10),
        };
      }
    }

    logger.info('Persisted strategies loaded', { context, count: result.rows.length });
  } catch (error) {
    logger.debug('No persisted strategies found (using defaults)', {
      error: error instanceof Error ? error.message : 'Unknown',
    });
  }
}

/**
 * Get strategy history with performance metrics
 */
export async function getStrategyHistory(context: AIContext): Promise<{
  strategies: Array<ThinkingBudgetStrategy & { sampleCount: number; avgQuality: number | null; lastOptimized: string | null }>;
  recentPerformance: Array<{ taskType: string; avgTokens: number; avgQuality: number; count: number }>;
}> {
  // Get stored strategies
  const strategiesResult = await queryContext(
    context,
    `SELECT task_type, base_tokens, complexity_multiplier, min_tokens, max_tokens,
            sample_count, avg_quality, last_optimized_at
     FROM thinking_budget_strategies
     ORDER BY task_type`
  );

  // Get recent performance from thinking_chains
  const performanceResult = await queryContext(
    context,
    `SELECT task_type,
            AVG(thinking_tokens_used) as avg_tokens,
            AVG(response_quality) FILTER (WHERE response_quality IS NOT NULL) as avg_quality,
            COUNT(*) as count
     FROM thinking_chains
     WHERE context = $1 AND created_at > NOW() - INTERVAL '30 days'
     GROUP BY task_type
     ORDER BY count DESC`,
    [context]
  );

  // Merge with in-memory strategies for completeness
  const strategies = Object.entries(BUDGET_STRATEGIES).map(([taskType, strategy]) => {
    const stored = strategiesResult.rows.find((r: { task_type: string }) => r.task_type === taskType);
    return {
      ...strategy,
      sampleCount: stored ? parseInt(stored.sample_count, 10) || 0 : 0,
      avgQuality: stored?.avg_quality ? parseFloat(stored.avg_quality) : null,
      lastOptimized: stored?.last_optimized_at || null,
    };
  });

  return {
    strategies,
    recentPerformance: performanceResult.rows.map((r: { task_type: string; avg_tokens: string; avg_quality: string; count: string }) => ({
      taskType: r.task_type,
      avgTokens: Math.round(parseFloat(r.avg_tokens) || 0),
      avgQuality: parseFloat(r.avg_quality) || 0,
      count: parseInt(r.count, 10) || 0,
    })),
  };
}

// ===========================================
// Chain Management
// ===========================================

/**
 * Get a specific thinking chain by ID
 */
export async function getThinkingChainById(
  id: string,
  context: AIContext
): Promise<{
  id: string;
  sessionId: string;
  taskType: string;
  inputPreview: string;
  thinkingTokensUsed: number;
  responseQuality: number | null;
  feedbackText: string | null;
  createdAt: string;
} | null> {
  try {
    const result = await queryContext(
      context,
      `SELECT id, session_id, task_type, input_preview,
              thinking_tokens_used, response_quality, feedback_text, created_at
       FROM thinking_chains
       WHERE id = $1 AND context = $2`,
      [id, context]
    );

    if (result.rows.length === 0) {return null;}

    const row = result.rows[0];
    return {
      id: row.id,
      sessionId: row.session_id,
      taskType: row.task_type,
      inputPreview: row.input_preview,
      thinkingTokensUsed: parseInt(row.thinking_tokens_used, 10) || 0,
      responseQuality: row.response_quality ? parseFloat(row.response_quality) : null,
      feedbackText: row.feedback_text,
      createdAt: row.created_at,
    };
  } catch (error) {
    logger.error('Failed to get thinking chain', error instanceof Error ? error : undefined);
    return null;
  }
}

/**
 * Delete a thinking chain
 */
export async function deleteThinkingChain(id: string, context: AIContext): Promise<void> {
  await queryContext(
    context,
    `DELETE FROM thinking_chains WHERE id = $1 AND context = $2`,
    [id, context]
  );
}
