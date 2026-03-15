/**
 * Governance API Routes
 *
 * REST API for approval workflows, audit trail, and governance policies.
 * Supports SSE streaming for real-time approval notifications.
 */

import { Router, Request, Response } from 'express';
import { AIContext, isValidContext } from '../utils/database-context';
import { apiKeyAuth, requireScope } from '../middleware/auth';
import { requireUUID } from '../middleware/validate-params';
import { asyncHandler, ValidationError, NotFoundError } from '../middleware/errorHandler';
import { toIntBounded } from '../utils/validation';
import { getUserId } from '../utils/user-context';
import {
  requestApproval,
  approveAction,
  rejectAction,
  getPendingActions,
  getActionHistory,
  getActionById,
  getAuditLog,
  createPolicy,
  updatePolicy,
  deletePolicy,
  listPolicies,
  expireStaleActions,
  logAudit,
  ActionType,
  GovernanceStatus,
} from '../services/governance';

export const governanceRouter = Router();

// SSE connections for real-time approval notifications
const sseClients = new Map<string, Set<Response>>();

function notifySSEClients(context: string, data: Record<string, unknown>): void {
  const clients = sseClients.get(context);
  if (!clients || clients.size === 0) {return;}
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  for (const client of clients) {
    try {
      client.write(payload);
    } catch {
      clients.delete(client);
    }
  }
}

// ===========================================
// SSE Stream for real-time approval requests
// ===========================================

governanceRouter.get(
  '/:context/governance/stream',
  apiKeyAuth,
  (req: Request, res: Response) => {
    const { context } = req.params;
    if (!isValidContext(context)) {
      res.status(400).json({ success: false, error: 'Invalid context' });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    // Send initial heartbeat
    res.write('event: connected\ndata: {"status":"connected"}\n\n');

    // Register client
    if (!sseClients.has(context)) {
      sseClients.set(context, new Set());
    }
    const clients = sseClients.get(context);
    if (clients) { clients.add(res); }

    // Heartbeat every 30s
    const heartbeat = setInterval(() => {
      try { res.write(':heartbeat\n\n'); } catch { clearInterval(heartbeat); }
    }, 30000);

    req.on('close', () => {
      clearInterval(heartbeat);
      sseClients.get(context)?.delete(res);
    });
  }
);

// ===========================================
// Pending Actions
// ===========================================

governanceRouter.get(
  '/:context/governance/pending',
  apiKeyAuth,
  requireScope('read'),
  asyncHandler(async (req: Request, res: Response) => {
    getUserId(req); // auth check
    const { context } = req.params;
    if (!isValidContext(context)) {throw new ValidationError('Invalid context');}

    const limit = toIntBounded(req.query.limit as string, 1, 100, 50);
    const offset = toIntBounded(req.query.offset as string, 0, 10000, 0);
    const action_type = req.query.action_type as ActionType | undefined;

    const actions = await getPendingActions(context as AIContext, { action_type, limit, offset });

    res.json({ success: true, data: actions, count: actions.length });
  })
);

// ===========================================
// Action History
// ===========================================

governanceRouter.get(
  '/:context/governance/history',
  apiKeyAuth,
  requireScope('read'),
  asyncHandler(async (req: Request, res: Response) => {
    getUserId(req); // auth check
    const { context } = req.params;
    if (!isValidContext(context)) {throw new ValidationError('Invalid context');}

    const limit = toIntBounded(req.query.limit as string, 1, 100, 50);
    const offset = toIntBounded(req.query.offset as string, 0, 10000, 0);
    const status = req.query.status as GovernanceStatus | undefined;
    const action_type = req.query.action_type as ActionType | undefined;

    const actions = await getActionHistory(context as AIContext, { status, action_type, limit, offset });

    res.json({ success: true, data: actions, count: actions.length });
  })
);

// ===========================================
// Single Action
// ===========================================

governanceRouter.get(
  '/:context/governance/actions/:id',
  apiKeyAuth,
  requireUUID('id'),
  asyncHandler(async (req: Request, res: Response) => {
    getUserId(req); // auth check
    const { context, id } = req.params;
    if (!isValidContext(context)) {throw new ValidationError('Invalid context');}

    const action = await getActionById(context as AIContext, id);
    if (!action) {throw new NotFoundError('Action not found');}

    res.json({ success: true, data: action });
  })
);

// ===========================================
// Request Approval (programmatic, used by other services)
// ===========================================

governanceRouter.post(
  '/:context/governance/request',
  apiKeyAuth,
  requireScope('write'),
  asyncHandler(async (req: Request, res: Response) => {
    getUserId(req); // auth check
    const { context } = req.params;
    if (!isValidContext(context)) {throw new ValidationError('Invalid context');}

    const { action_type, action_source, source_id, description, payload, risk_level } = req.body;

    if (!action_type || !action_source || !description) {
      throw new ValidationError('action_type, action_source, and description are required');
    }

    const action = await requestApproval(context as AIContext, {
      action_type, action_source, source_id, description, payload, risk_level,
    });

    // Notify SSE clients if pending
    if (action.status === 'pending') {
      notifySSEClients(context, {
        type: 'approval_required',
        action: {
          id: action.id,
          action_type: action.action_type,
          description: action.description,
          risk_level: action.risk_level,
          created_at: action.created_at,
        },
      });
    }

    res.status(201).json({ success: true, data: action });
  })
);

// ===========================================
// Approve / Reject
// ===========================================

governanceRouter.post(
  '/:context/governance/:id/approve',
  apiKeyAuth,
  requireScope('admin'),
  requireUUID('id'),
  asyncHandler(async (req: Request, res: Response) => {
    getUserId(req); // auth check
    const { context, id } = req.params;
    if (!isValidContext(context)) {throw new ValidationError('Invalid context');}

    const approvedBy = req.body.approved_by || 'user';
    const action = await approveAction(context as AIContext, id, approvedBy);

    notifySSEClients(context, {
      type: 'action_approved',
      action_id: id,
      approved_by: approvedBy,
    });

    res.json({ success: true, data: action });
  })
);

governanceRouter.post(
  '/:context/governance/:id/reject',
  apiKeyAuth,
  requireScope('admin'),
  requireUUID('id'),
  asyncHandler(async (req: Request, res: Response) => {
    getUserId(req); // auth check
    const { context, id } = req.params;
    if (!isValidContext(context)) {throw new ValidationError('Invalid context');}

    const { rejected_by, reason } = req.body;
    if (!reason) {throw new ValidationError('reason is required');}

    const action = await rejectAction(context as AIContext, id, rejected_by || 'user', reason);

    notifySSEClients(context, {
      type: 'action_rejected',
      action_id: id,
      reason,
    });

    res.json({ success: true, data: action });
  })
);

// ===========================================
// Audit Log
// ===========================================

governanceRouter.get(
  '/:context/governance/audit',
  apiKeyAuth,
  requireScope('read'),
  asyncHandler(async (req: Request, res: Response) => {
    getUserId(req); // auth check
    const { context } = req.params;
    if (!isValidContext(context)) {throw new ValidationError('Invalid context');}

    const limit = toIntBounded(req.query.limit as string, 1, 100, 50);
    const offset = toIntBounded(req.query.offset as string, 0, 10000, 0);
    const days = toIntBounded(req.query.days as string, 1, 365, 30);
    const event_type = req.query.event_type as string | undefined;
    const actor = req.query.actor as string | undefined;
    const target_id = req.query.target_id as string | undefined;

    const entries = await getAuditLog(context as AIContext, {
      event_type, actor, target_id, limit, offset, days,
    });

    res.json({ success: true, data: entries, count: entries.length });
  })
);

// ===========================================
// Policy CRUD
// ===========================================

governanceRouter.get(
  '/:context/governance/policies',
  apiKeyAuth,
  requireScope('read'),
  asyncHandler(async (req: Request, res: Response) => {
    getUserId(req); // auth check
    const { context } = req.params;
    if (!isValidContext(context)) {throw new ValidationError('Invalid context');}

    const activeOnly = req.query.active_only === 'true';
    const policies = await listPolicies(context as AIContext, activeOnly);

    res.json({ success: true, data: policies });
  })
);

governanceRouter.post(
  '/:context/governance/policies',
  apiKeyAuth,
  requireScope('admin'),
  asyncHandler(async (req: Request, res: Response) => {
    getUserId(req); // auth check
    const { context } = req.params;
    if (!isValidContext(context)) {throw new ValidationError('Invalid context');}

    const { name, description, action_type, conditions, risk_level, auto_approve, notify_on_auto_approve } = req.body;
    if (!name || !action_type) {
      throw new ValidationError('name and action_type are required');
    }

    const policy = await createPolicy(context as AIContext, {
      name, description, action_type, conditions: conditions || [],
      risk_level: risk_level || 'medium',
      auto_approve: auto_approve ?? false,
      notify_on_auto_approve: notify_on_auto_approve ?? true,
      is_active: true,
    });

    await logAudit(context as AIContext, {
      event_type: 'policy.created',
      actor: 'user',
      target_type: 'governance_policy',
      target_id: policy.id,
      description: `Policy created: ${name}`,
    });

    res.status(201).json({ success: true, data: policy });
  })
);

governanceRouter.put(
  '/:context/governance/policies/:id',
  apiKeyAuth,
  requireScope('admin'),
  requireUUID('id'),
  asyncHandler(async (req: Request, res: Response) => {
    getUserId(req); // auth check
    const { context, id } = req.params;
    if (!isValidContext(context)) {throw new ValidationError('Invalid context');}

    const policy = await updatePolicy(context as AIContext, id, req.body);

    res.json({ success: true, data: policy });
  })
);

governanceRouter.delete(
  '/:context/governance/policies/:id',
  apiKeyAuth,
  requireScope('admin'),
  requireUUID('id'),
  asyncHandler(async (req: Request, res: Response) => {
    getUserId(req); // auth check
    const { context, id } = req.params;
    if (!isValidContext(context)) {throw new ValidationError('Invalid context');}

    const deleted = await deletePolicy(context as AIContext, id);
    if (!deleted) {throw new NotFoundError('Policy not found');}

    res.json({ success: true, message: 'Policy deleted' });
  })
);

// ===========================================
// Maintenance
// ===========================================

governanceRouter.post(
  '/:context/governance/expire',
  apiKeyAuth,
  requireScope('admin'),
  asyncHandler(async (req: Request, res: Response) => {
    getUserId(req); // auth check
    const { context } = req.params;
    if (!isValidContext(context)) {throw new ValidationError('Invalid context');}

    const count = await expireStaleActions(context as AIContext);
    res.json({ success: true, expired: count });
  })
);

// Export SSE notification function for use by other services
export { notifySSEClients as notifyGovernanceClients };
