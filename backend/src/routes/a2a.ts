/**
 * A2A Protocol Routes
 *
 * Phase 60: Agent-to-Agent Communication Protocol
 *
 * Provides both the A2A protocol endpoints (/.well-known/agent.json, task CRUD)
 * and context-aware management endpoints for external agents.
 *
 * @module routes/a2a
 */

import { Router, Request, Response } from 'express';
import { apiKeyAuth } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { isValidContext, AIContext } from '../utils/database-context';
import { logger } from '../utils/logger';
import { generateAgentCard, isValidSkill } from '../services/a2a/agent-card';
import { a2aTaskManager } from '../services/a2a/task-manager';
import { a2aClient } from '../services/a2a/a2a-client';


// ===========================================
// Well-Known Router (no auth)
// ===========================================

export const a2aWellKnownRouter = Router();

/**
 * GET /.well-known/agent.json
 * A2A Agent Card discovery endpoint - NO AUTH required
 */
a2aWellKnownRouter.get('/.well-known/agent.json', (_req: Request, res: Response) => {
  const card = generateAgentCard();
  res.json(card);
});

// ===========================================
// A2A API Router (auth required)
// ===========================================

export const a2aRouter = Router();

// ----- Task CRUD (non-context-specific, uses 'personal' as default) -----

/**
 * POST /api/a2a/tasks
 * Create a new A2A task
 */
a2aRouter.post('/a2a/tasks', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const { skill_id, message, metadata, caller_agent_url, caller_agent_name, external_task_id } = req.body;

  if (!skill_id || !message) {
    res.status(400).json({
      success: false,
      error: 'skill_id and message are required',
    });
    return;
  }

  if (!isValidSkill(skill_id)) {
    res.status(400).json({
      success: false,
      error: `Invalid skill_id: ${skill_id}. Use GET /.well-known/agent.json to see available skills.`,
    });
    return;
  }

  // Default to 'personal' context for non-context-specific A2A requests
  const context: AIContext = 'personal';

  const task = await a2aTaskManager.createTask(context, {
    skill_id,
    message,
    metadata,
    caller_agent_url,
    caller_agent_name,
    external_task_id,
  });

  res.status(201).json({ success: true, data: task });
}));

/**
 * GET /api/a2a/tasks/:id
 * Get task status
 */
a2aRouter.get('/a2a/tasks/:id', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const task = await a2aTaskManager.getTask('personal', req.params.id);

  if (!task) {
    // Try other contexts
    for (const ctx of ['work', 'learning', 'creative'] as AIContext[]) {
      const found = await a2aTaskManager.getTask(ctx, req.params.id);
      if (found) {
        res.json({ success: true, data: found });
        return;
      }
    }

    res.status(404).json({ success: false, error: 'Task not found' });
    return;
  }

  res.json({ success: true, data: task });
}));

/**
 * POST /api/a2a/tasks/:id/messages
 * Send a follow-up message to a task
 */
a2aRouter.post('/a2a/tasks/:id/messages', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const { message } = req.body;

  if (!message) {
    res.status(400).json({ success: false, error: 'message is required' });
    return;
  }

  // Try all contexts to find the task
  for (const ctx of ['personal', 'work', 'learning', 'creative'] as AIContext[]) {
    try {
      const task = await a2aTaskManager.sendMessage(ctx, req.params.id, message);
      res.json({ success: true, data: task });
      return;
    } catch {
      continue;
    }
  }

  res.status(404).json({ success: false, error: 'Task not found' });
}));

/**
 * DELETE /api/a2a/tasks/:id
 * Cancel a task
 */
a2aRouter.delete('/a2a/tasks/:id', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  // Try all contexts to find the task
  for (const ctx of ['personal', 'work', 'learning', 'creative'] as AIContext[]) {
    try {
      await a2aTaskManager.cancelTask(ctx, req.params.id);
      res.json({ success: true, message: 'Task canceled' });
      return;
    } catch {
      continue;
    }
  }

  res.status(404).json({ success: false, error: 'Task not found or cannot be canceled' });
}));

/**
 * GET /api/a2a/tasks/:id/stream
 * SSE stream for task progress
 */
a2aRouter.get('/a2a/tasks/:id/stream', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const taskId = req.params.id;

  // Set SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  let closed = false;

  req.on('close', () => {
    closed = true;
  });

  const sendEvent = (data: unknown) => {
    if (!closed) {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    }
  };

  // Poll task status every 1 second
  const pollInterval = setInterval(async () => {
    if (closed) {
      clearInterval(pollInterval);
      return;
    }

    try {
      // Try all contexts
      let task = null;
      for (const ctx of ['personal', 'work', 'learning', 'creative'] as AIContext[]) {
        task = await a2aTaskManager.getTask(ctx, taskId);
        if (task) break;
      }

      if (!task) {
        sendEvent({ type: 'error', message: 'Task not found' });
        clearInterval(pollInterval);
        res.end();
        return;
      }

      sendEvent({
        type: 'status',
        task: {
          id: task.id,
          status: task.status,
          artifacts: task.artifacts,
          error_message: task.error_message,
          tokens_used: task.tokens_used,
          updated_at: task.updated_at,
        },
      });

      // Close stream when task reaches terminal state
      if (task.status === 'completed' || task.status === 'failed' || task.status === 'canceled') {
        sendEvent({ type: 'done', task });
        clearInterval(pollInterval);
        res.end();
      }
    } catch (error) {
      logger.error('SSE poll error', error instanceof Error ? error : undefined, {
        operation: 'a2a-stream',
        taskId,
      });
      sendEvent({ type: 'error', message: 'Internal error during polling' });
      clearInterval(pollInterval);
      res.end();
    }
  }, 1000);
}));

// ----- Context-aware endpoints -----

/**
 * GET /api/:context/a2a/tasks
 * List tasks for a specific context
 */
a2aRouter.get('/:context/a2a/tasks', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const { context } = req.params;

  if (!isValidContext(context)) {
    res.status(400).json({ success: false, error: `Invalid context: ${context}` });
    return;
  }

  const { status, skill_id, limit, offset } = req.query;

  const tasks = await a2aTaskManager.listTasks(context as AIContext, {
    status: status as string | undefined,
    skill_id: skill_id as string | undefined,
    limit: limit ? parseInt(limit as string, 10) : undefined,
    offset: offset ? parseInt(offset as string, 10) : undefined,
  });

  res.json({ success: true, data: tasks });
}));

/**
 * GET /api/:context/a2a/external-agents
 * List external agents
 */
a2aRouter.get('/:context/a2a/external-agents', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const { context } = req.params;

  if (!isValidContext(context)) {
    res.status(400).json({ success: false, error: `Invalid context: ${context}` });
    return;
  }

  const agents = await a2aClient.listAgents(context as AIContext);
  res.json({ success: true, data: agents });
}));

/**
 * POST /api/:context/a2a/external-agents
 * Register an external agent
 */
a2aRouter.post('/:context/a2a/external-agents', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const { context } = req.params;

  if (!isValidContext(context)) {
    res.status(400).json({ success: false, error: `Invalid context: ${context}` });
    return;
  }

  const { name, description, url, auth_type, auth_token } = req.body;

  if (!name || !url) {
    res.status(400).json({ success: false, error: 'name and url are required' });
    return;
  }

  const agent = await a2aClient.registerAgent(context as AIContext, {
    name,
    description,
    url,
    auth_type,
    auth_token,
  });

  res.status(201).json({ success: true, data: agent });
}));

/**
 * DELETE /api/:context/a2a/external-agents/:id
 * Remove an external agent
 */
a2aRouter.delete('/:context/a2a/external-agents/:id', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const { context, id } = req.params;

  if (!isValidContext(context)) {
    res.status(400).json({ success: false, error: `Invalid context: ${context}` });
    return;
  }

  await a2aClient.removeAgent(context as AIContext, id);
  res.json({ success: true, message: 'External agent removed' });
}));

/**
 * POST /api/:context/a2a/external-agents/:id/health
 * Health check an external agent
 */
a2aRouter.post('/:context/a2a/external-agents/:id/health', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const { context, id } = req.params;

  if (!isValidContext(context)) {
    res.status(400).json({ success: false, error: `Invalid context: ${context}` });
    return;
  }

  const result = await a2aClient.healthCheck(context as AIContext, id);
  res.json({ success: true, data: result });
}));

/**
 * POST /api/:context/a2a/external-agents/:id/send
 * Send a task to an external agent
 */
a2aRouter.post('/:context/a2a/external-agents/:id/send', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const { context, id } = req.params;

  if (!isValidContext(context)) {
    res.status(400).json({ success: false, error: `Invalid context: ${context}` });
    return;
  }

  const { skill_id, message } = req.body;

  if (!skill_id || !message) {
    res.status(400).json({ success: false, error: 'skill_id and message are required' });
    return;
  }

  // Get agent details
  const agents = await a2aClient.listAgents(context as AIContext);
  const agent = agents.find(a => a.id === id);

  if (!agent) {
    res.status(404).json({ success: false, error: 'External agent not found' });
    return;
  }

  const result = await a2aClient.sendTask(agent.url, skill_id, message, agent.auth_token);
  res.json({ success: true, data: result });
}));
