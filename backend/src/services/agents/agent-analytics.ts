import { queryPublic } from '../../utils/database';
import { logger } from '../../utils/logger';

export interface SystemOverview {
  totalAgents: number;
  activeAgents: number;
  totalExecutionsToday: number;
  totalTokensToday: number;
  overallSuccessRate: number;
  topPerformingAgent: { id: string; name: string; successRate: number } | null;
  mostUsedAgent: { id: string; name: string; executionCount: number } | null;
  tokenBudgetUtilization: number;
}

export interface AgentPerformance {
  agentId: string;
  agentName: string;
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  successRate: number;
  avgExecutionTimeMs: number;
  totalTokensUsed: number;
  avgTokensPerExecution: number;
  lastExecutedAt: Date | null;
}

export interface OptimizationSuggestion {
  type: 'underused' | 'inefficient' | 'over_budget' | 'high_failure';
  agentId: string;
  agentName: string;
  message: string;
  severity: 'info' | 'warning' | 'critical';
}

export interface UsageTrend {
  date: string;
  executions: number;
  tokensUsed: number;
  successRate: number;
}

class AgentAnalyticsService {
  async getSystemOverview(): Promise<SystemOverview> {
    try {
      // Total agents
      const totalResult = await queryPublic(
        'SELECT COUNT(*)::int AS count FROM agent_blueprints'
      );
      const totalAgents = totalResult.rows[0]?.count ?? 0;

      // Active agents (those with usage_count > 0)
      const activeResult = await queryPublic(
        'SELECT COUNT(*)::int AS count FROM agent_blueprints WHERE usage_count > 0'
      );
      const activeAgents = activeResult.rows[0]?.count ?? 0;

      // Today's execution stats
      const todayStatsResult = await queryPublic(
        `SELECT
           COUNT(*)::int AS total_executions,
           COALESCE(SUM(tokens_used), 0)::bigint AS total_tokens,
           CASE WHEN COUNT(*) > 0
             THEN (COUNT(*) FILTER (WHERE status = 'completed'))::float / COUNT(*)
             ELSE 0
           END AS success_rate
         FROM agent_executions
         WHERE created_at >= CURRENT_DATE`
      );
      const todayStats = todayStatsResult.rows[0] ?? {
        total_executions: 0,
        total_tokens: 0,
        success_rate: 0,
      };

      // Top performing agent (highest success rate with >= 5 executions)
      const topPerformingResult = await queryPublic(
        `SELECT
           e.agent_id AS id,
           b.name,
           (COUNT(*) FILTER (WHERE e.status = 'completed'))::float / COUNT(*) AS success_rate
         FROM agent_executions e
         JOIN agent_blueprints b ON b.id = e.agent_id
         GROUP BY e.agent_id, b.name
         HAVING COUNT(*) >= 5
         ORDER BY success_rate DESC
         LIMIT 1`
      );
      const topPerformingAgent = topPerformingResult.rows[0]
        ? {
            id: topPerformingResult.rows[0].id,
            name: topPerformingResult.rows[0].name,
            successRate: parseFloat(topPerformingResult.rows[0].success_rate),
          }
        : null;

      // Most used agent
      const mostUsedResult = await queryPublic(
        `SELECT
           b.id,
           b.name,
           b.usage_count AS execution_count
         FROM agent_blueprints b
         WHERE b.usage_count > 0
         ORDER BY b.usage_count DESC
         LIMIT 1`
      );
      const mostUsedAgent = mostUsedResult.rows[0]
        ? {
            id: mostUsedResult.rows[0].id,
            name: mostUsedResult.rows[0].name,
            executionCount: parseInt(mostUsedResult.rows[0].execution_count, 10),
          }
        : null;

      // Token budget utilization
      const budgetResult = await queryPublic(
        `SELECT COALESCE(SUM(token_budget_daily), 0)::bigint AS total_budget
         FROM agent_blueprints
         WHERE usage_count > 0`
      );
      const totalBudget = parseInt(budgetResult.rows[0]?.total_budget ?? '0', 10);
      const totalTokensToday = parseInt(String(todayStats.total_tokens), 10);
      const tokenBudgetUtilization =
        totalBudget > 0 ? totalTokensToday / totalBudget : 0;

      return {
        totalAgents,
        activeAgents,
        totalExecutionsToday: todayStats.total_executions,
        totalTokensToday,
        overallSuccessRate: parseFloat(String(todayStats.success_rate)),
        topPerformingAgent,
        mostUsedAgent,
        tokenBudgetUtilization,
      };
    } catch (error) {
      logger.error('Failed to get system overview', error instanceof Error ? error : undefined);
      return {
        totalAgents: 0,
        activeAgents: 0,
        totalExecutionsToday: 0,
        totalTokensToday: 0,
        overallSuccessRate: 0,
        topPerformingAgent: null,
        mostUsedAgent: null,
        tokenBudgetUtilization: 0,
      };
    }
  }

  async getAgentPerformance(
    agentId: string,
    periodDays: number = 30
  ): Promise<AgentPerformance> {
    try {
      // Get agent name
      const blueprintResult = await queryPublic(
        'SELECT name FROM agent_blueprints WHERE id = $1',
        [agentId]
      );
      const agentName = blueprintResult.rows[0]?.name ?? 'Unknown';

      // Get execution stats for the period
      const statsResult = await queryPublic(
        `SELECT
           COUNT(*)::int AS total,
           (COUNT(*) FILTER (WHERE status = 'completed'))::int AS successful,
           (COUNT(*) FILTER (WHERE status = 'failed'))::int AS failed,
           COALESCE(AVG(duration_ms), 0)::float AS avg_duration,
           COALESCE(SUM(tokens_used), 0)::bigint AS total_tokens,
           MAX(created_at) AS last_executed
         FROM agent_executions
         WHERE agent_id = $1
           AND created_at > NOW() - make_interval(days => $2)`,
        [agentId, periodDays]
      );

      const stats = statsResult.rows[0] ?? {
        total: 0,
        successful: 0,
        failed: 0,
        avg_duration: 0,
        total_tokens: 0,
        last_executed: null,
      };

      const totalExecutions = stats.total;
      const successfulExecutions = stats.successful;
      const totalTokensUsed = parseInt(String(stats.total_tokens), 10);

      return {
        agentId,
        agentName,
        totalExecutions,
        successfulExecutions,
        failedExecutions: stats.failed,
        successRate: totalExecutions > 0 ? successfulExecutions / totalExecutions : 0,
        avgExecutionTimeMs: stats.avg_duration,
        totalTokensUsed,
        avgTokensPerExecution:
          totalExecutions > 0 ? totalTokensUsed / totalExecutions : 0,
        lastExecutedAt: stats.last_executed ? new Date(stats.last_executed) : null,
      };
    } catch (error) {
      logger.error('Failed to get agent performance', error instanceof Error ? error : undefined);
      return {
        agentId,
        agentName: 'Unknown',
        totalExecutions: 0,
        successfulExecutions: 0,
        failedExecutions: 0,
        successRate: 0,
        avgExecutionTimeMs: 0,
        totalTokensUsed: 0,
        avgTokensPerExecution: 0,
        lastExecutedAt: null,
      };
    }
  }

  async getOptimizationSuggestions(): Promise<OptimizationSuggestion[]> {
    const suggestions: OptimizationSuggestion[] = [];

    try {
      // Underused: blueprints with usage_count = 0 created more than 7 days ago
      const underusedResult = await queryPublic(
        `SELECT id, name
         FROM agent_blueprints
         WHERE usage_count = 0
           AND created_at < NOW() - INTERVAL '7 days'`
      );
      for (const row of underusedResult.rows) {
        suggestions.push({
          type: 'underused',
          agentId: row.id,
          agentName: row.name,
          message: `Agent "${row.name}" has never been used since creation over 7 days ago. Consider removing or reconfiguring it.`,
          severity: 'info',
        });
      }

      // High failure: success rate < 50% with >= 10 executions in last 30 days
      const highFailureResult = await queryPublic(
        `SELECT
           e.agent_id AS id,
           b.name,
           COUNT(*)::int AS total,
           (COUNT(*) FILTER (WHERE e.status = 'completed'))::float / COUNT(*) AS success_rate
         FROM agent_executions e
         JOIN agent_blueprints b ON b.id = e.agent_id
         WHERE e.created_at > NOW() - INTERVAL '30 days'
         GROUP BY e.agent_id, b.name
         HAVING COUNT(*) >= 10
           AND (COUNT(*) FILTER (WHERE e.status = 'completed'))::float / COUNT(*) < 0.5`
      );
      for (const row of highFailureResult.rows) {
        const rate = (parseFloat(row.success_rate) * 100).toFixed(0);
        suggestions.push({
          type: 'high_failure',
          agentId: row.id,
          agentName: row.name,
          message: `Agent "${row.name}" has a ${rate}% success rate over ${row.total} executions. Investigate failure causes.`,
          severity: 'critical',
        });
      }

      // Over budget: agents using > 90% of daily token budget
      const overBudgetResult = await queryPublic(
        `SELECT
           b.id,
           b.name,
           b.token_budget_daily,
           COALESCE(SUM(e.tokens_used), 0)::bigint AS tokens_today
         FROM agent_blueprints b
         LEFT JOIN agent_executions e
           ON e.agent_id = b.id AND e.created_at >= CURRENT_DATE
         WHERE b.token_budget_daily > 0
         GROUP BY b.id, b.name, b.token_budget_daily
         HAVING COALESCE(SUM(e.tokens_used), 0) > b.token_budget_daily * 0.9`
      );
      for (const row of overBudgetResult.rows) {
        const pct = (
          (parseInt(String(row.tokens_today), 10) /
            parseInt(String(row.token_budget_daily), 10)) *
          100
        ).toFixed(0);
        suggestions.push({
          type: 'over_budget',
          agentId: row.id,
          agentName: row.name,
          message: `Agent "${row.name}" has used ${pct}% of its daily token budget. Consider increasing the budget or reducing usage.`,
          severity: 'warning',
        });
      }
    } catch (error) {
      logger.error('Failed to get optimization suggestions', error instanceof Error ? error : undefined);
    }

    // Sort by severity: critical > warning > info
    const severityOrder: Record<string, number> = {
      critical: 0,
      warning: 1,
      info: 2,
    };
    suggestions.sort(
      (a, b) => severityOrder[a.severity] - severityOrder[b.severity]
    );

    return suggestions;
  }

  async getUsageTrends(periodDays: number = 7): Promise<UsageTrend[]> {
    try {
      const result = await queryPublic(
        `SELECT
           created_at::date::text AS date,
           COUNT(*)::int AS executions,
           COALESCE(SUM(tokens_used), 0)::bigint AS tokens_used,
           CASE WHEN COUNT(*) > 0
             THEN (COUNT(*) FILTER (WHERE status = 'completed'))::float / COUNT(*)
             ELSE 0
           END AS success_rate
         FROM agent_executions
         WHERE created_at > NOW() - make_interval(days => $1)
         GROUP BY created_at::date
         ORDER BY date ASC`,
        [periodDays]
      );

      return result.rows.map((row) => ({
        date: row.date,
        executions: row.executions,
        tokensUsed: parseInt(String(row.tokens_used), 10),
        successRate: parseFloat(String(row.success_rate)),
      }));
    } catch (error) {
      logger.error('Failed to get usage trends', error instanceof Error ? error : undefined);
      return [];
    }
  }
}

export const agentAnalytics = new AgentAnalyticsService();
