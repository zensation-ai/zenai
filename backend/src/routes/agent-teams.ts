/**
 * Agent Teams API Routes
 *
 * Endpoints for multi-agent task execution.
 *
 * @module routes/agent-teams
 */

import { Router, Request, Response } from 'express';
import { asyncHandler, ValidationError } from '../middleware/errorHandler';
import { apiKeyAuth, requireScope } from '../middleware/auth';
import { logger } from '../utils/logger';
import { AIContext, queryContext, isValidContext } from '../utils/database-context';
import {
  executeTeamTask,
  classifyTeamStrategy,
  TeamTask,
} from '../services/agent-orchestrator';
import { trackActivity } from '../services/activity-tracker';
import { toIntBounded } from '../utils/validation';

export const agentTeamsRouter = Router();

/**
 * POST /api/agents/execute
 * Execute a task with agent team
 */
agentTeamsRouter.post(
  '/execute',
  apiKeyAuth,
  requireScope('write'),
  asyncHandler(async (req: Request, res: Response) => {
    const {
      task,
      context,
      aiContext = 'personal',
      strategy,
      skipReview,
    } = req.body as {
      task: string;
      context?: string;
      aiContext?: AIContext;
      strategy?: string;
      skipReview?: boolean;
    };

    if (!task || typeof task !== 'string' || task.trim().length === 0) {
      res.status(400).json({
        success: false,
        error: 'Task description is required',
      });
      return;
    }

    logger.info('Agent team execution requested', {
      taskLength: task.length,
      strategy,
      aiContext,
    });

    const teamTask: TeamTask = {
      description: task,
      context,
      aiContext,
      strategy: strategy as TeamTask['strategy'],
      skipReview,
    };

    const result = await executeTeamTask(teamTask);

    // Persist execution result (non-blocking)
    queryContext(
      aiContext,
      `INSERT INTO agent_executions (team_id, task_description, strategy, final_output, agent_results, execution_time_ms, tokens, success, context, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        result.teamId,
        task,
        result.strategy,
        result.finalOutput,
        JSON.stringify(result.agentResults.map(a => ({
          role: a.role,
          success: a.success,
          toolsUsed: a.toolsUsed,
          executionTimeMs: a.executionTimeMs,
          error: a.error,
        }))),
        result.executionTimeMs,
        result.totalTokens,
        result.success,
        aiContext,
        JSON.stringify({ sharedMemoryEntries: result.memoryStats.totalEntries }),
      ]
    ).catch(err => {
      logger.debug('Agent execution persistence failed (non-critical)', {
        error: err instanceof Error ? err.message : String(err),
      });
    });

    // Track activity (non-blocking)
    trackActivity(aiContext, {
      eventType: 'behavior_adapted',
      title: `Agent-Recherche: ${task.substring(0, 50)}${task.length > 50 ? '...' : ''}`,
      description: `Strategie: ${result.strategy}, Dauer: ${result.executionTimeMs}ms`,
      impact_score: result.success ? 0.6 : 0.3,
      actionType: 'agent_execution',
      actionData: { teamId: result.teamId, strategy: result.strategy, success: result.success },
    }).catch((err) => logger.debug('Failed to record agent team activity', { error: err instanceof Error ? err.message : String(err) }));

    res.json({
      success: result.success,
      teamId: result.teamId,
      finalOutput: result.finalOutput,
      strategy: result.strategy,
      agents: result.agentResults.map(a => ({
        role: a.role,
        success: a.success,
        toolsUsed: a.toolsUsed,
        executionTimeMs: a.executionTimeMs,
        error: a.error,
      })),
      stats: {
        executionTimeMs: result.executionTimeMs,
        totalTokens: result.totalTokens,
        sharedMemoryEntries: result.memoryStats.totalEntries,
      },
    });
  })
);

/**
 * POST /api/agents/classify
 * Classify which strategy would be used for a task (preview)
 */
agentTeamsRouter.post(
  '/classify',
  apiKeyAuth,
  requireScope('read'),
  asyncHandler(async (req: Request, res: Response) => {
    const { task } = req.body as { task: string };

    if (!task || typeof task !== 'string') {
      res.status(400).json({
        success: false,
        error: 'Task description is required',
      });
      return;
    }

    const strategy = classifyTeamStrategy(task);

    res.json({
      success: true,
      strategy,
      description: {
        research_write_review: 'Vollständige Pipeline: Recherche → Schreiben → Review',
        research_only: 'Nur Recherche',
        write_only: 'Nur Schreiben (optional mit Review)',
        custom: 'Benutzerdefinierte Pipeline',
      }[strategy],
    });
  })
);

/**
 * GET /api/agents/history
 * Get past agent executions
 */
agentTeamsRouter.get(
  '/history',
  apiKeyAuth,
  requireScope('read'),
  asyncHandler(async (req: Request, res: Response) => {
    const context = (req.query.context as string) || 'personal';
    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use "personal", "work", "learning", or "creative".');
    }

    const limit = toIntBounded(req.query.limit as string, 20, 1, 100);

    const result = await queryContext(
      context as AIContext,
      `SELECT id, team_id, task_description, strategy, final_output, agent_results,
              execution_time_ms, tokens, success, context, saved_as_idea_id, metadata, created_at
       FROM agent_executions
       WHERE context = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [context, limit]
    );

    res.json({
      success: true,
      executions: result.rows.map(row => ({
        id: row.id,
        teamId: row.team_id,
        task: row.task_description,
        strategy: row.strategy,
        finalOutput: row.final_output,
        agents: typeof row.agent_results === 'string' ? JSON.parse(row.agent_results) : row.agent_results,
        executionTimeMs: row.execution_time_ms,
        tokens: row.tokens,
        success: row.success,
        savedAsIdeaId: row.saved_as_idea_id,
        createdAt: row.created_at,
      })),
      count: result.rows.length,
    });
  })
);

/**
 * GET /api/agents/history/:id
 * Get a single agent execution by ID
 */
agentTeamsRouter.get(
  '/history/:id',
  apiKeyAuth,
  requireScope('read'),
  asyncHandler(async (req: Request, res: Response) => {
    const context = (req.query.context as string) || 'personal';
    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use "personal", "work", "learning", or "creative".');
    }

    const result = await queryContext(
      context as AIContext,
      `SELECT id, team_id, task_description, strategy, final_output, agent_results,
              execution_time_ms, tokens, success, context, saved_as_idea_id, metadata, created_at
       FROM agent_executions
       WHERE id = $1 AND context = $2`,
      [req.params.id, context]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Execution not found' });
      return;
    }

    const row = result.rows[0];
    res.json({
      success: true,
      execution: {
        id: row.id,
        teamId: row.team_id,
        task: row.task_description,
        strategy: row.strategy,
        finalOutput: row.final_output,
        agents: typeof row.agent_results === 'string' ? JSON.parse(row.agent_results) : row.agent_results,
        executionTimeMs: row.execution_time_ms,
        tokens: row.tokens,
        success: row.success,
        savedAsIdeaId: row.saved_as_idea_id,
        metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata,
        createdAt: row.created_at,
      },
    });
  })
);

/**
 * POST /api/agents/history/:id/save-as-idea
 * Save an agent execution result as an idea
 */
agentTeamsRouter.post(
  '/history/:id/save-as-idea',
  apiKeyAuth,
  requireScope('write'),
  asyncHandler(async (req: Request, res: Response) => {
    const context = (req.body.context as string) || 'personal';
    if (!isValidContext(context)) {
      throw new ValidationError('Invalid context. Use "personal", "work", "learning", or "creative".');
    }

    // Fetch execution
    const execResult = await queryContext(
      context as AIContext,
      `SELECT id, task_description, final_output, strategy FROM agent_executions WHERE id = $1 AND context = $2`,
      [req.params.id, context]
    );

    if (execResult.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Execution not found' });
      return;
    }

    const exec = execResult.rows[0];

    // Create idea
    const ideaResult = await queryContext(
      context as AIContext,
      `INSERT INTO ideas (title, summary, type, category, context, raw_transcript, source)
       VALUES ($1, $2, 'note', 'research', $3, $4, 'agent')
       RETURNING id`,
      [
        `Agent: ${exec.task_description.substring(0, 100)}`,
        exec.final_output.substring(0, 500),
        context,
        exec.final_output,
      ]
    );

    if (!ideaResult.rows[0]) {
      res.status(500).json({ success: false, error: 'Gedanke konnte nicht erstellt werden' });
      return;
    }

    const ideaId = ideaResult.rows[0].id;

    // Link execution to idea
    await queryContext(
      context as AIContext,
      `UPDATE agent_executions SET saved_as_idea_id = $1 WHERE id = $2`,
      [ideaId, req.params.id]
    );

    res.json({
      success: true,
      ideaId,
      message: 'Ergebnis als Gedanke gespeichert',
    });
  })
);
