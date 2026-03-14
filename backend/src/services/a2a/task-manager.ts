/**
 * A2A Task Manager
 *
 * Manages the lifecycle of A2A tasks: creation, processing, status tracking.
 * Routes incoming A2A requests to the internal Agent Orchestrator.
 *
 * Task lifecycle: submitted -> working -> completed/failed/canceled
 *
 * @module services/a2a/task-manager
 */

import { AIContext, queryContext } from '../../utils/database-context';
import { logger } from '../../utils/logger';
import { executeTeamTask, TeamStrategy, TeamResult } from '../agent-orchestrator';
import { isValidSkill } from './agent-card';

// ===========================================
// Types
// ===========================================

export interface A2AMessage {
  role: string;
  parts: Array<{ type: string; text?: string; [key: string]: unknown }>;
}

export interface A2AArtifact {
  name?: string;
  description?: string;
  parts: Array<{ type: string; text?: string; [key: string]: unknown }>;
}

export interface A2ATask {
  id: string;
  external_task_id?: string;
  skill_id: string;
  status: 'submitted' | 'working' | 'completed' | 'failed' | 'canceled';
  message: A2AMessage;
  artifacts: A2AArtifact[];
  metadata: Record<string, unknown>;
  error_message?: string;
  caller_agent_url?: string;
  caller_agent_name?: string;
  auth_method?: string;
  execution_id?: string;
  tokens_used: number;
  created_at: string;
  updated_at: string;
  completed_at?: string;
}

export interface CreateTaskRequest {
  skill_id: string;
  message: A2AMessage;
  metadata?: Record<string, unknown>;
  caller_agent_url?: string;
  caller_agent_name?: string;
  external_task_id?: string;
}

export interface TaskFilter {
  status?: string;
  skill_id?: string;
  limit?: number;
  offset?: number;
}

// ===========================================
// Skill to Strategy Mapping
// ===========================================

const SKILL_STRATEGY_MAP: Record<string, TeamStrategy> = {
  'research': 'research_only',
  'code-review': 'research_code_review',
  'knowledge-query': 'research_only',
  'content-creation': 'research_write_review',
  'task-execution': 'research_write_review',
};

// ===========================================
// A2ATaskManager
// ===========================================

export class A2ATaskManager {
  /**
   * Create a new A2A task and begin async processing
   */
  async createTask(context: AIContext, request: CreateTaskRequest): Promise<A2ATask> {
    if (!isValidSkill(request.skill_id)) {
      throw new Error(`Invalid skill_id: ${request.skill_id}`);
    }

    const result = await queryContext(
      context,
      `INSERT INTO a2a_tasks (skill_id, message, metadata, caller_agent_url, caller_agent_name, external_task_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        request.skill_id,
        JSON.stringify(request.message),
        JSON.stringify(request.metadata || {}),
        request.caller_agent_url || null,
        request.caller_agent_name || null,
        request.external_task_id || null,
      ]
    );

    const task = this.rowToTask(result.rows[0]);

    // Start async processing (fire-and-forget)
    this.processTask(context, task).catch(err => {
      logger.error('A2A task processing failed', err instanceof Error ? err : undefined, {
        operation: 'a2a-task-manager',
        taskId: task.id,
      });
    });

    return task;
  }

  /**
   * Get a task by ID
   */
  async getTask(context: AIContext, taskId: string): Promise<A2ATask | null> {
    const result = await queryContext(
      context,
      'SELECT * FROM a2a_tasks WHERE id = $1',
      [taskId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.rowToTask(result.rows[0]);
  }

  /**
   * List tasks with optional filters
   */
  async listTasks(context: AIContext, filters: TaskFilter = {}): Promise<A2ATask[]> {
    const conditions: string[] = [];
    const params: (string | number)[] = [];
    let paramIndex = 1;

    if (filters.status) {
      conditions.push(`status = $${paramIndex++}`);
      params.push(filters.status);
    }

    if (filters.skill_id) {
      conditions.push(`skill_id = $${paramIndex++}`);
      params.push(filters.skill_id);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = filters.limit || 50;
    const offset = filters.offset || 0;

    const result = await queryContext(
      context,
      `SELECT * FROM a2a_tasks ${where} ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      [...params, limit, offset]
    );

    return result.rows.map(row => this.rowToTask(row));
  }

  /**
   * Cancel a task
   */
  async cancelTask(context: AIContext, taskId: string): Promise<void> {
    const result = await queryContext(
      context,
      `UPDATE a2a_tasks SET status = 'canceled', updated_at = NOW()
       WHERE id = $1 AND status IN ('submitted', 'working')
       RETURNING id`,
      [taskId]
    );

    if (result.rows.length === 0) {
      throw new Error(`Task ${taskId} not found or cannot be canceled`);
    }

    logger.info('A2A task canceled', { operation: 'a2a-task-manager', taskId });
  }

  /**
   * Send a follow-up message to a task
   */
  async sendMessage(context: AIContext, taskId: string, message: A2AMessage): Promise<A2ATask> {
    // Get existing task
    const existing = await this.getTask(context, taskId);
    if (!existing) {
      throw new Error(`Task ${taskId} not found`);
    }

    if (existing.status === 'completed' || existing.status === 'failed' || existing.status === 'canceled') {
      throw new Error(`Task ${taskId} is already in terminal state: ${existing.status}`);
    }

    // Store the message in metadata for context
    const updatedMetadata = {
      ...existing.metadata,
      follow_up_messages: [
        ...((existing.metadata.follow_up_messages as A2AMessage[]) || []),
        message,
      ],
    };

    await queryContext(
      context,
      `UPDATE a2a_tasks SET metadata = $1, updated_at = NOW() WHERE id = $2`,
      [JSON.stringify(updatedMetadata), taskId]
    );

    const updatedTask = await this.getTask(context, taskId);
    return updatedTask!;
  }

  /**
   * Process a task by routing it to the agent orchestrator
   */
  private async processTask(context: AIContext, task: A2ATask): Promise<void> {
    // Update status to working
    await queryContext(
      context,
      `UPDATE a2a_tasks SET status = 'working', updated_at = NOW() WHERE id = $1`,
      [task.id]
    );

    try {
      const strategy = this.mapSkillToStrategy(task.skill_id);

      // Extract text from message parts
      const taskDescription = task.message.parts
        .filter(p => p.type === 'text' && p.text)
        .map(p => p.text)
        .join('\n');

      if (!taskDescription) {
        throw new Error('No text content found in message');
      }

      // Execute via agent orchestrator
      const result: TeamResult = await executeTeamTask({
        description: taskDescription,
        aiContext: context,
        strategy,
        context: task.metadata.additional_context as string | undefined,
      });

      // Create artifact from result
      const artifact: A2AArtifact = {
        name: `${task.skill_id}-result`,
        description: `Result from ${task.skill_id} skill execution`,
        parts: [{ type: 'text', text: result.finalOutput }],
      };

      // Calculate total tokens
      const totalTokens = result.totalTokens.input + result.totalTokens.output;

      // Update task to completed
      await queryContext(
        context,
        `UPDATE a2a_tasks SET
          status = 'completed',
          artifacts = $1,
          tokens_used = $2,
          execution_id = $3,
          updated_at = NOW(),
          completed_at = NOW()
         WHERE id = $4`,
        [
          JSON.stringify([artifact]),
          totalTokens,
          result.teamId,
          task.id,
        ]
      );

      logger.info('A2A task completed', {
        operation: 'a2a-task-manager',
        taskId: task.id,
        skillId: task.skill_id,
        strategy,
        tokensUsed: totalTokens,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      await queryContext(
        context,
        `UPDATE a2a_tasks SET
          status = 'failed',
          error_message = $1,
          updated_at = NOW(),
          completed_at = NOW()
         WHERE id = $2`,
        [errorMessage, task.id]
      );

      logger.error('A2A task failed', error instanceof Error ? error : undefined, {
        operation: 'a2a-task-manager',
        taskId: task.id,
        skillId: task.skill_id,
      });
    }
  }

  /**
   * Map an A2A skill ID to an internal TeamStrategy
   */
  private mapSkillToStrategy(skillId: string): TeamStrategy {
    const strategy = SKILL_STRATEGY_MAP[skillId];
    if (!strategy) {
      return 'research_write_review'; // Default fallback
    }
    return strategy;
  }

  /**
   * Convert a database row to an A2ATask object
   */
  private rowToTask(row: Record<string, unknown>): A2ATask {
    return {
      id: row.id as string,
      external_task_id: row.external_task_id as string | undefined,
      skill_id: row.skill_id as string,
      status: row.status as A2ATask['status'],
      message: (typeof row.message === 'string' ? JSON.parse(row.message) : row.message) as A2AMessage,
      artifacts: (typeof row.artifacts === 'string' ? JSON.parse(row.artifacts) : row.artifacts) as A2AArtifact[],
      metadata: (typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata) as Record<string, unknown>,
      error_message: row.error_message as string | undefined,
      caller_agent_url: row.caller_agent_url as string | undefined,
      caller_agent_name: row.caller_agent_name as string | undefined,
      auth_method: row.auth_method as string | undefined,
      execution_id: row.execution_id as string | undefined,
      tokens_used: (row.tokens_used as number) || 0,
      created_at: row.created_at as string,
      updated_at: row.updated_at as string,
      completed_at: row.completed_at as string | undefined,
    };
  }
}

// Export singleton instance
export const a2aTaskManager = new A2ATaskManager();
