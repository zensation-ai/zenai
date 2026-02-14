/**
 * Automation Analytics - Statistics and execution history
 */

import { queryContext, AIContext } from '../../utils/database-context';
import { logger } from '../../utils/logger';
import { AutomationStats, AutomationExecution, TriggerType } from './automation-core';

// ===========================================
// Statistics
// ===========================================

/**
 * Holt Automation-Statistiken
 */
export async function getAutomationStats(
  context: AIContext
): Promise<AutomationStats> {
  try {
    // Basis-Statistiken
    const statsResult = await queryContext(
      context,
      `SELECT
         COUNT(*) as total,
         COUNT(*) FILTER (WHERE is_active = true) as active,
         SUM(run_count) as total_runs,
         SUM(success_count) as successful_runs,
         SUM(failure_count) as failed_runs
       FROM automation_definitions
       WHERE context = $1`,
      [context]
    );

    // Automationen nach Trigger-Typ
    const byTriggerResult = await queryContext(
      context,
      `SELECT trigger_type, COUNT(*) as count
       FROM automation_definitions
       WHERE context = $1
       GROUP BY trigger_type`,
      [context]
    );

    // Top Automationen
    const topResult = await queryContext(
      context,
      `SELECT id, name, run_count,
              CASE WHEN run_count > 0
                   THEN success_count::float / run_count
                   ELSE 0 END as success_rate
       FROM automation_definitions
       WHERE context = $1 AND run_count > 0
       ORDER BY run_count DESC
       LIMIT 5`,
      [context]
    );

    // Ausstehende Vorschläge
    const suggestionsResult = await queryContext(
      context,
      `SELECT COUNT(*) as pending
       FROM automation_suggestions
       WHERE context = $1 AND status = 'pending'`,
      [context]
    );

    const stats = statsResult.rows[0];
    const totalRuns = parseInt(stats.total_runs, 10) || 0;
    const successfulRuns = parseInt(stats.successful_runs, 10) || 0;

    const automationsByTrigger: Record<TriggerType, number> = {
      webhook: 0,
      schedule: 0,
      event: 0,
      manual: 0,
      pattern: 0,
    };

    for (const row of byTriggerResult.rows) {
      automationsByTrigger[row.trigger_type as TriggerType] = parseInt(row.count, 10);
    }

    return {
      total_automations: parseInt(stats.total, 10) || 0,
      active_automations: parseInt(stats.active, 10) || 0,
      total_executions: totalRuns,
      successful_executions: successfulRuns,
      failed_executions: parseInt(stats.failed_runs, 10) || 0,
      success_rate: totalRuns > 0 ? successfulRuns / totalRuns : 0,
      automations_by_trigger: automationsByTrigger,
      top_automations: topResult.rows.map(row => ({
        id: row.id,
        name: row.name,
        run_count: parseInt(row.run_count, 10),
        success_rate: parseFloat(row.success_rate),
      })),
      pending_suggestions: parseInt(suggestionsResult.rows[0]?.pending, 10) || 0,
    };
  } catch {
    logger.warn('Could not get automation stats');
    return {
      total_automations: 0,
      active_automations: 0,
      total_executions: 0,
      successful_executions: 0,
      failed_executions: 0,
      success_rate: 0,
      automations_by_trigger: { webhook: 0, schedule: 0, event: 0, manual: 0, pattern: 0 },
      top_automations: [],
      pending_suggestions: 0,
    };
  }
}

/**
 * Holt Ausführungshistorie einer Automation
 */
export async function getExecutionHistory(
  context: AIContext,
  automationId: string,
  limit: number = 20
): Promise<AutomationExecution[]> {
  try {
    const result = await queryContext(
      context,
      `SELECT * FROM automation_executions
       WHERE automation_id = $1
       ORDER BY executed_at DESC
       LIMIT $2`,
      [automationId, limit]
    );

    return result.rows.map(row => ({
      id: row.id,
      automation_id: row.automation_id,
      trigger_data: row.trigger_data,
      actions_executed: row.actions_executed,
      success: row.success,
      error_message: row.error_message,
      duration_ms: row.duration_ms,
      executed_at: row.executed_at,
    }));
  } catch {
    return [];
  }
}
