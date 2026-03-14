/**
 * Proactive Engine API Routes
 *
 * Event log, proactive rules CRUD, stats, and manual processing trigger.
 */

import { Router, Request, Response } from 'express';
import { AIContext, isValidContext } from '../utils/database-context';
import { apiKeyAuth, requireScope } from '../middleware/auth';
import { requireUUID } from '../middleware/validate-params';
import { asyncHandler, ValidationError, NotFoundError } from '../middleware/errorHandler';
import { getEventHistory, getEventStats } from '../services/event-system';
import {
  createProactiveRule,
  updateProactiveRule,
  deleteProactiveRule,
  listProactiveRules,
  processUnhandledEvents,
} from '../services/proactive-decision-engine';
import { getUserId } from '../utils/user-context';

export const proactiveEngineRouter = Router();

const VALID_DECISIONS = ['notify', 'prepare_context', 'take_action', 'trigger_agent'] as const;
const VALID_RISK_LEVELS = ['low', 'medium', 'high', 'critical'] as const;

// ─── Event log ────────────────────────────────────────────
proactiveEngineRouter.get(
  '/:context/proactive-engine/events',
  apiKeyAuth,
  requireScope('read'),
  asyncHandler(async (req, res) => {
    getUserId(req); // auth check
    const context = req.params.context as AIContext;
    if (!isValidContext(context)) {throw new ValidationError('Invalid context');}

    const eventType = req.query.eventType as string | undefined;
    const limit = Math.min(parseInt(req.query.limit as string, 10) || 50, 100);
    const offset = parseInt(req.query.offset as string, 10) || 0;

    const result = await getEventHistory(context, { eventType, limit, offset });
    res.json({ success: true, data: result.events, total: result.total });
  })
);

// ─── Event stats ──────────────────────────────────────────
proactiveEngineRouter.get(
  '/:context/proactive-engine/stats',
  apiKeyAuth,
  requireScope('read'),
  asyncHandler(async (req, res) => {
    getUserId(req); // auth check
    const context = req.params.context as AIContext;
    if (!isValidContext(context)) {throw new ValidationError('Invalid context');}

    const stats = await getEventStats(context);
    res.json({ success: true, data: stats });
  })
);

// ─── List proactive rules ────────────────────────────────
proactiveEngineRouter.get(
  '/:context/proactive-engine/rules',
  apiKeyAuth,
  requireScope('read'),
  asyncHandler(async (req, res) => {
    getUserId(req); // auth check
    const context = req.params.context as AIContext;
    if (!isValidContext(context)) {throw new ValidationError('Invalid context');}

    const activeOnly = req.query.active === 'true';
    const rules = await listProactiveRules(context, activeOnly);
    res.json({ success: true, data: rules });
  })
);

// ─── Create proactive rule ───────────────────────────────
proactiveEngineRouter.post(
  '/:context/proactive-engine/rules',
  apiKeyAuth,
  requireScope('write'),
  asyncHandler(async (req, res) => {
    getUserId(req); // auth check
    const context = req.params.context as AIContext;
    if (!isValidContext(context)) {throw new ValidationError('Invalid context');}

    const { name, description, eventTypes, conditions, decision, actionConfig,
            riskLevel, requiresApproval, priority, cooldownMinutes, isActive } = req.body;

    if (!name || typeof name !== 'string') {throw new ValidationError('name is required');}
    if (!eventTypes || !Array.isArray(eventTypes) || eventTypes.length === 0) {
      throw new ValidationError('eventTypes must be a non-empty array');
    }
    if (!decision || !VALID_DECISIONS.includes(decision)) {
      throw new ValidationError(`decision must be one of: ${VALID_DECISIONS.join(', ')}`);
    }

    const rule = await createProactiveRule(context, {
      name,
      description: description || null,
      eventTypes,
      conditions: conditions || [],
      decision,
      actionConfig: actionConfig || {},
      riskLevel: VALID_RISK_LEVELS.includes(riskLevel) ? riskLevel : 'low',
      requiresApproval: requiresApproval === true,
      priority: priority ?? 50,
      cooldownMinutes: cooldownMinutes ?? 60,
      isActive: isActive !== false,
    });

    if (!rule) {throw new ValidationError('Failed to create proactive rule');}
    res.status(201).json({ success: true, data: rule });
  })
);

// ─── Update proactive rule ───────────────────────────────
proactiveEngineRouter.put(
  '/:context/proactive-engine/rules/:id',
  apiKeyAuth,
  requireScope('write'),
  requireUUID('id'),
  asyncHandler(async (req, res) => {
    getUserId(req); // auth check
    const context = req.params.context as AIContext;
    if (!isValidContext(context)) {throw new ValidationError('Invalid context');}

    if (req.body.decision && !VALID_DECISIONS.includes(req.body.decision)) {
      throw new ValidationError(`decision must be one of: ${VALID_DECISIONS.join(', ')}`);
    }

    const rule = await updateProactiveRule(context, req.params.id, req.body);
    if (!rule) {throw new NotFoundError('Proactive rule not found');}

    res.json({ success: true, data: rule });
  })
);

// ─── Delete proactive rule ───────────────────────────────
proactiveEngineRouter.delete(
  '/:context/proactive-engine/rules/:id',
  apiKeyAuth,
  requireScope('write'),
  requireUUID('id'),
  asyncHandler(async (req, res) => {
    getUserId(req); // auth check
    const context = req.params.context as AIContext;
    if (!isValidContext(context)) {throw new ValidationError('Invalid context');}

    const deleted = await deleteProactiveRule(context, req.params.id);
    if (!deleted) {throw new NotFoundError('Proactive rule not found');}

    res.json({ success: true, message: 'Proactive rule deleted' });
  })
);

// ─── Manual processing trigger ───────────────────────────
proactiveEngineRouter.post(
  '/:context/proactive-engine/process',
  apiKeyAuth,
  requireScope('write'),
  asyncHandler(async (req, res) => {
    getUserId(req); // auth check
    const context = req.params.context as AIContext;
    if (!isValidContext(context)) {throw new ValidationError('Invalid context');}

    const results = await processUnhandledEvents(context);
    res.json({ success: true, data: { processed: results.length, results } });
  })
);

// ─── SSE stream for real-time proactive notifications ────
const sseClients = new Map<string, Set<Response>>();

export function notifyProactiveClients(context: AIContext, event: Record<string, unknown>): void {
  const clients = sseClients.get(context);
  if (!clients || clients.size === 0) {return;}
  const data = JSON.stringify(event);
  for (const res of clients) {
    try { res.write(`data: ${data}\n\n`); } catch { clients.delete(res); }
  }
}

proactiveEngineRouter.get(
  '/:context/proactive-engine/stream',
  apiKeyAuth,
  requireScope('read'),
  (req: Request, res: Response) => {
    getUserId(req); // auth check
    const context = req.params.context as AIContext;
    if (!isValidContext(context)) {
      res.status(400).json({ error: 'Invalid context' });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    if (!sseClients.has(context)) {sseClients.set(context, new Set());}
    const clients = sseClients.get(context);
    if (clients) { clients.add(res); }

    res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);

    req.on('close', () => {
      sseClients.get(context)?.delete(res);
    });
  }
);
