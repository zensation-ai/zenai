/**
 * Autonomous Agent Routes - Phase 42
 *
 * REST API for managing persistent background agents.
 */

import { Router, Request, Response } from 'express';
import { AIContext, isValidContext } from '../utils/database-context';
import { apiKeyAuth, requireScope } from '../middleware/auth';
import { asyncHandler, ValidationError } from '../middleware/errorHandler';
import { requireUUID } from '../middleware/validate-params';
import { sendData, sendList, sendMessage, sendNotFound, parsePagination } from '../utils/response';
import { agentRuntime, AgentTrigger, TriggerType } from '../services/agents/agent-runtime';
import { AGENT_TEMPLATES } from '../services/agents/agent-templates';

export const autonomousAgentsRouter = Router();

const VALID_TRIGGER_TYPES: TriggerType[] = [
  'email_received', 'task_due', 'calendar_soon', 'schedule',
  'idea_created', 'webhook', 'pattern_detected', 'manual',
];

function validateContext(context: string): AIContext {
  if (!isValidContext(context)) {
    throw new ValidationError('Invalid context. Use "personal", "work", "learning", or "creative".');
  }
  return context as AIContext;
}

function validateTriggers(triggers: unknown[]): AgentTrigger[] {
  if (!Array.isArray(triggers)) { throw new ValidationError('triggers must be an array'); }
  for (const t of triggers) {
    const trigger = t as { type?: string; config?: unknown };
    if (!trigger.type || !VALID_TRIGGER_TYPES.includes(trigger.type as TriggerType)) {
      throw new ValidationError(`Invalid trigger type: ${trigger.type}. Use: ${VALID_TRIGGER_TYPES.join(', ')}`);
    }
  }
  return triggers as AgentTrigger[];
}

// GET /api/:context/agents - List agents
autonomousAgentsRouter.get(
  '/:context/agents',
  apiKeyAuth,
  requireScope('read'),
  asyncHandler(async (req: Request, res: Response) => {
    const context = validateContext(req.params.context);
    const agents = await agentRuntime.listAgents(context);
    sendList(res, agents, agents.length);
  })
);

// GET /api/:context/agents/running - List all running agents (across contexts)
autonomousAgentsRouter.get(
  '/:context/agents/running',
  apiKeyAuth,
  requireScope('read'),
  asyncHandler(async (_req: Request, res: Response) => {
    const running = agentRuntime.listRunning();
    sendData(res, running);
  })
);

// GET /api/:context/agents/templates - Available templates
autonomousAgentsRouter.get(
  '/:context/agents/templates',
  apiKeyAuth,
  requireScope('read'),
  asyncHandler(async (_req: Request, res: Response) => {
    sendData(res, AGENT_TEMPLATES);
  })
);

// POST /api/:context/agents/from-template - Create agent from template
autonomousAgentsRouter.post(
  '/:context/agents/from-template',
  apiKeyAuth,
  requireScope('write'),
  asyncHandler(async (req: Request, res: Response) => {
    const context = validateContext(req.params.context);
    const { templateId } = req.body;

    const template = AGENT_TEMPLATES.find(t => t.id === templateId);
    if (!template) {
      throw new ValidationError(`Template not found: ${templateId}`);
    }

    const agent = await agentRuntime.createAgent(context, {
      name: template.name,
      description: template.description,
      instructions: template.instructions,
      triggers: template.triggers,
      tools: template.tools,
      approvalRequired: template.approvalRequired,
      maxActionsPerDay: template.maxActionsPerDay,
      templateId: template.id,
    });

    sendData(res, agent, 201);
  })
);

// GET /api/:context/agents/:id - Agent details
autonomousAgentsRouter.get(
  '/:context/agents/:id',
  apiKeyAuth,
  requireScope('read'),
  requireUUID('id'),
  asyncHandler(async (req: Request, res: Response) => {
    const context = validateContext(req.params.context);
    const agent = await agentRuntime.getAgent(context, req.params.id);
    if (!agent) { sendNotFound(res, 'Agent'); return; }
    sendData(res, agent);
  })
);

// POST /api/:context/agents - Create agent
autonomousAgentsRouter.post(
  '/:context/agents',
  apiKeyAuth,
  requireScope('write'),
  asyncHandler(async (req: Request, res: Response) => {
    const context = validateContext(req.params.context);
    const { name, description, instructions, triggers, tools, approvalRequired, maxActionsPerDay, tokenBudgetDaily } = req.body;

    if (!name || !instructions) {
      throw new ValidationError('name and instructions are required');
    }

    const agent = await agentRuntime.createAgent(context, {
      name,
      description,
      instructions,
      triggers: triggers ? validateTriggers(triggers) : [],
      tools: tools || [],
      approvalRequired,
      maxActionsPerDay,
      tokenBudgetDaily,
    });

    sendData(res, agent, 201);
  })
);

// PUT /api/:context/agents/:id - Update agent
autonomousAgentsRouter.put(
  '/:context/agents/:id',
  apiKeyAuth,
  requireScope('write'),
  requireUUID('id'),
  asyncHandler(async (req: Request, res: Response) => {
    const context = validateContext(req.params.context);
    const { name, description, instructions, triggers, tools, approvalRequired, maxActionsPerDay, tokenBudgetDaily } = req.body;

    const updated = await agentRuntime.updateAgent(context, req.params.id, {
      ...(name !== undefined && { name }),
      ...(description !== undefined && { description }),
      ...(instructions !== undefined && { instructions }),
      ...(triggers !== undefined && { triggers: validateTriggers(triggers) }),
      ...(tools !== undefined && { tools }),
      ...(approvalRequired !== undefined && { approvalRequired }),
      ...(maxActionsPerDay !== undefined && { maxActionsPerDay }),
      ...(tokenBudgetDaily !== undefined && { tokenBudgetDaily }),
    });

    if (!updated) { sendNotFound(res, 'Agent'); return; }
    sendData(res, updated);
  })
);

// DELETE /api/:context/agents/:id - Delete agent
autonomousAgentsRouter.delete(
  '/:context/agents/:id',
  apiKeyAuth,
  requireScope('write'),
  requireUUID('id'),
  asyncHandler(async (req: Request, res: Response) => {
    const context = validateContext(req.params.context);
    const deleted = await agentRuntime.deleteAgent(context, req.params.id);
    if (!deleted) { sendNotFound(res, 'Agent'); return; }
    sendMessage(res, 'Agent deleted');
  })
);

// POST /api/:context/agents/:id/start - Start agent
autonomousAgentsRouter.post(
  '/:context/agents/:id/start',
  apiKeyAuth,
  requireScope('write'),
  requireUUID('id'),
  asyncHandler(async (req: Request, res: Response) => {
    const context = validateContext(req.params.context);
    const started = await agentRuntime.startAgent(context, req.params.id);
    if (!started) { sendNotFound(res, 'Agent'); return; }
    sendMessage(res, 'Agent started');
  })
);

// POST /api/:context/agents/:id/stop - Stop agent
autonomousAgentsRouter.post(
  '/:context/agents/:id/stop',
  apiKeyAuth,
  requireScope('write'),
  requireUUID('id'),
  asyncHandler(async (req: Request, res: Response) => {
    const context = validateContext(req.params.context);
    const stopped = await agentRuntime.stopAgent(context, req.params.id);
    if (!stopped) { sendNotFound(res, 'Agent'); return; }
    sendMessage(res, 'Agent stopped');
  })
);

// GET /api/:context/agents/:id/logs - Execution logs
autonomousAgentsRouter.get(
  '/:context/agents/:id/logs',
  apiKeyAuth,
  requireScope('read'),
  requireUUID('id'),
  asyncHandler(async (req: Request, res: Response) => {
    const context = validateContext(req.params.context);
    const { limit } = parsePagination(req, { defaultLimit: 20 });
    const logs = await agentRuntime.getExecutionLogs(context, req.params.id, limit);
    sendList(res, logs, logs.length);
  })
);

// GET /api/:context/agents/:id/stats - Agent statistics
autonomousAgentsRouter.get(
  '/:context/agents/:id/stats',
  apiKeyAuth,
  requireScope('read'),
  requireUUID('id'),
  asyncHandler(async (req: Request, res: Response) => {
    const context = validateContext(req.params.context);
    const stats = await agentRuntime.getAgentStats(context, req.params.id);
    sendData(res, stats);
  })
);

// POST /api/:context/agents/:id/approve/:execId - Approve pending execution
autonomousAgentsRouter.post(
  '/:context/agents/:id/approve/:execId',
  apiKeyAuth,
  requireScope('write'),
  requireUUID('id', 'execId'),
  asyncHandler(async (req: Request, res: Response) => {
    const context = validateContext(req.params.context);
    const execution = await agentRuntime.approveExecution(context, req.params.execId);
    if (!execution) { sendNotFound(res, 'Pending execution'); return; }
    sendData(res, execution);
  })
);

// POST /api/:context/agents/:id/reject/:execId - Reject pending execution
autonomousAgentsRouter.post(
  '/:context/agents/:id/reject/:execId',
  apiKeyAuth,
  requireScope('write'),
  requireUUID('id', 'execId'),
  asyncHandler(async (req: Request, res: Response) => {
    const context = validateContext(req.params.context);
    const rejected = await agentRuntime.rejectExecution(context, req.params.execId);
    if (!rejected) { sendNotFound(res, 'Pending execution'); return; }
    sendMessage(res, 'Execution rejected');
  })
);
