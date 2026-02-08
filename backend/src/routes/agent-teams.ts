/**
 * Agent Teams API Routes
 *
 * Endpoints for multi-agent task execution.
 *
 * @module routes/agent-teams
 */

import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { logger } from '../utils/logger';
import { AIContext } from '../utils/database-context';
import {
  executeTeamTask,
  classifyTeamStrategy,
  TeamTask,
} from '../services/agent-orchestrator';

export const agentTeamsRouter = Router();

/**
 * POST /api/agents/execute
 * Execute a task with agent team
 */
agentTeamsRouter.post(
  '/execute',
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

    res.json({
      success: result.success,
      data: {
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
      data: {
        strategy,
        description: {
          research_write_review: 'Vollständige Pipeline: Recherche → Schreiben → Review',
          research_only: 'Nur Recherche',
          write_only: 'Nur Schreiben (optional mit Review)',
          custom: 'Benutzerdefinierte Pipeline',
        }[strategy],
      },
    });
  })
);
