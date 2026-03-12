/**
 * Governance & Audit Trail Service
 *
 * Manages approval workflows for high-impact actions, policy evaluation,
 * and immutable audit logging. Acts as the trust layer for proactive AI,
 * agent execution, and automation systems.
 */

import { v4 as uuidv4 } from 'uuid';
import { queryContext, AIContext } from '../utils/database-context';
import { logger } from '../utils/logger';

// ===========================================
// Types
// ===========================================

export type ActionType =
  | 'send_email'
  | 'create_task'
  | 'modify_data'
  | 'agent_action'
  | 'proactive_action'
  | 'automation_action';

export type ActionSource =
  | 'agent'
  | 'automation'
  | 'proactive_engine'
  | 'user';

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export type GovernanceStatus =
  | 'pending'
  | 'auto_approved'
  | 'approved'
  | 'rejected'
  | 'expired'
  | 'executed'
  | 'failed';

export interface GovernanceAction {
  id: string;
  context: AIContext;
  action_type: ActionType;
  action_source: ActionSource;
  source_id: string | null;
  description: string;
  payload: Record<string, unknown> | null;
  risk_level: RiskLevel;
  status: GovernanceStatus;
  requires_approval: boolean;
  approved_by: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  executed_at: string | null;
  execution_result: Record<string, unknown> | null;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

export interface GovernancePolicy {
  id: string;
  context: AIContext;
  name: string;
  description: string | null;
  action_type: string;
  conditions: PolicyCondition[];
  risk_level: RiskLevel;
  auto_approve: boolean;
  notify_on_auto_approve: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PolicyCondition {
  field: string;
  operator: 'equals' | 'contains' | 'startsWith' | 'endsWith' | 'regex' | 'gt' | 'lt';
  value: string | number;
}

export interface AuditEntry {
  id: string;
  context: AIContext;
  event_type: string;
  actor: string;
  target_type: string | null;
  target_id: string | null;
  description: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface ActionRequest {
  action_type: ActionType;
  action_source: ActionSource;
  source_id?: string;
  description: string;
  payload?: Record<string, unknown>;
  risk_level?: RiskLevel;
}

export interface PolicyEvaluation {
  requires_approval: boolean;
  risk_level: RiskLevel;
  matched_policy: GovernancePolicy | null;
}

interface ActionFilters {
  status?: GovernanceStatus;
  action_type?: ActionType;
  limit?: number;
  offset?: number;
}

interface AuditFilters {
  event_type?: string;
  actor?: string;
  target_id?: string;
  limit?: number;
  offset?: number;
  days?: number;
}

// ===========================================
// Condition Evaluation (mirrors automation-core pattern)
// ===========================================

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function checkConditions(
  conditions: PolicyCondition[],
  data: Record<string, unknown>
): boolean {
  if (conditions.length === 0) return true;

  return conditions.every(condition => {
    const fieldValue = getNestedValue(data, condition.field);
    if (fieldValue === undefined) return false;

    const stringValue = String(fieldValue);
    const conditionValue = String(condition.value);

    switch (condition.operator) {
      case 'equals':
        return stringValue === conditionValue;
      case 'contains':
        return stringValue.toLowerCase().includes(conditionValue.toLowerCase());
      case 'startsWith':
        return stringValue.toLowerCase().startsWith(conditionValue.toLowerCase());
      case 'endsWith':
        return stringValue.toLowerCase().endsWith(conditionValue.toLowerCase());
      case 'regex':
        try {
          return new RegExp(conditionValue, 'i').test(stringValue);
        } catch {
          return false;
        }
      case 'gt':
        return Number(fieldValue) > Number(condition.value);
      case 'lt':
        return Number(fieldValue) < Number(condition.value);
      default:
        return false;
    }
  });
}

// ===========================================
// Policy Evaluation
// ===========================================

export async function evaluatePolicy(
  context: AIContext,
  action: ActionRequest
): Promise<PolicyEvaluation> {
  const result = await queryContext(
    context,
    `SELECT * FROM governance_policies
     WHERE action_type = $1 AND is_active = true
     ORDER BY created_at DESC`,
    [action.action_type]
  );

  const policies = result.rows as GovernancePolicy[];

  // Build data object for condition matching
  const actionData: Record<string, unknown> = {
    action_type: action.action_type,
    action_source: action.action_source,
    risk_level: action.risk_level || 'low',
    description: action.description,
    ...(action.payload || {}),
  };

  for (const policy of policies) {
    const conditions = Array.isArray(policy.conditions) ? policy.conditions : [];
    if (checkConditions(conditions, actionData)) {
      return {
        requires_approval: !policy.auto_approve,
        risk_level: policy.risk_level,
        matched_policy: policy,
      };
    }
  }

  // No matching policy: default behavior based on risk level
  const riskLevel = action.risk_level || 'low';
  return {
    requires_approval: riskLevel === 'high' || riskLevel === 'critical',
    risk_level: riskLevel,
    matched_policy: null,
  };
}

// ===========================================
// Action Management
// ===========================================

export async function requestApproval(
  context: AIContext,
  action: ActionRequest
): Promise<GovernanceAction> {
  const evaluation = await evaluatePolicy(context, action);
  const id = uuidv4();
  const status: GovernanceStatus = evaluation.requires_approval ? 'pending' : 'auto_approved';

  const result = await queryContext(
    context,
    `INSERT INTO governance_actions
     (id, context, action_type, action_source, source_id, description, payload,
      risk_level, status, requires_approval, expires_at, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
             NOW() + INTERVAL '24 hours', NOW(), NOW())
     RETURNING *`,
    [
      id, context, action.action_type, action.action_source,
      action.source_id || null, action.description,
      action.payload ? JSON.stringify(action.payload) : null,
      evaluation.risk_level, status, evaluation.requires_approval,
    ]
  );

  const governanceAction = result.rows[0] as GovernanceAction;

  // Log audit entry
  await logAudit(context, {
    event_type: 'action.requested',
    actor: action.action_source,
    target_type: action.action_type,
    target_id: id,
    description: action.description,
    metadata: {
      action_id: id,
      risk_level: evaluation.risk_level,
      requires_approval: evaluation.requires_approval,
      matched_policy: evaluation.matched_policy?.name || null,
    },
  });

  // Auto-approved actions: log and mark ready for execution
  if (status === 'auto_approved') {
    await logAudit(context, {
      event_type: 'action.auto_approved',
      actor: 'governance',
      target_type: action.action_type,
      target_id: id,
      description: `Auto-approved: ${action.description}`,
      metadata: {
        policy: evaluation.matched_policy?.name || 'default',
        notify: evaluation.matched_policy?.notify_on_auto_approve ?? false,
      },
    });

    logger.info('Governance: action auto-approved', {
      actionId: id, type: action.action_type, context,
    });
  } else {
    logger.info('Governance: action pending approval', {
      actionId: id, type: action.action_type, riskLevel: evaluation.risk_level, context,
    });
  }

  return governanceAction;
}

export async function approveAction(
  context: AIContext,
  actionId: string,
  approvedBy: string
): Promise<GovernanceAction> {
  const result = await queryContext(
    context,
    `UPDATE governance_actions
     SET status = 'approved', approved_by = $1, approved_at = NOW(), updated_at = NOW()
     WHERE id = $2 AND status = 'pending'
     RETURNING *`,
    [approvedBy, actionId]
  );

  if (result.rows.length === 0) {
    throw new Error(`Action ${actionId} not found or not pending`);
  }

  const action = result.rows[0] as GovernanceAction;

  await logAudit(context, {
    event_type: 'action.approved',
    actor: approvedBy,
    target_type: action.action_type,
    target_id: actionId,
    description: `Approved: ${action.description}`,
  });

  logger.info('Governance: action approved', { actionId, approvedBy, context });
  return action;
}

export async function rejectAction(
  context: AIContext,
  actionId: string,
  rejectedBy: string,
  reason: string
): Promise<GovernanceAction> {
  const result = await queryContext(
    context,
    `UPDATE governance_actions
     SET status = 'rejected', approved_by = $1, approved_at = NOW(),
         rejection_reason = $2, updated_at = NOW()
     WHERE id = $3 AND status = 'pending'
     RETURNING *`,
    [rejectedBy, reason, actionId]
  );

  if (result.rows.length === 0) {
    throw new Error(`Action ${actionId} not found or not pending`);
  }

  const action = result.rows[0] as GovernanceAction;

  await logAudit(context, {
    event_type: 'action.rejected',
    actor: rejectedBy,
    target_type: action.action_type,
    target_id: actionId,
    description: `Rejected: ${action.description}`,
    metadata: { reason },
  });

  logger.info('Governance: action rejected', { actionId, rejectedBy, reason, context });
  return action;
}

export async function markExecuted(
  context: AIContext,
  actionId: string,
  executionResult: Record<string, unknown>
): Promise<void> {
  await queryContext(
    context,
    `UPDATE governance_actions
     SET status = 'executed', executed_at = NOW(), execution_result = $1, updated_at = NOW()
     WHERE id = $2`,
    [JSON.stringify(executionResult), actionId]
  );

  await logAudit(context, {
    event_type: 'action.executed',
    actor: 'governance',
    target_type: 'governance_action',
    target_id: actionId,
    description: 'Action executed successfully',
    metadata: executionResult,
  });
}

export async function markFailed(
  context: AIContext,
  actionId: string,
  error: string
): Promise<void> {
  await queryContext(
    context,
    `UPDATE governance_actions
     SET status = 'failed', executed_at = NOW(),
         execution_result = $1, updated_at = NOW()
     WHERE id = $2`,
    [JSON.stringify({ error }), actionId]
  );

  await logAudit(context, {
    event_type: 'action.failed',
    actor: 'governance',
    target_type: 'governance_action',
    target_id: actionId,
    description: `Action failed: ${error}`,
  });
}

// ===========================================
// Query Functions
// ===========================================

export async function getPendingActions(
  context: AIContext,
  filters: ActionFilters = {}
): Promise<GovernanceAction[]> {
  const { action_type, limit = 50, offset = 0 } = filters;

  let sql = `SELECT * FROM governance_actions WHERE status = 'pending' AND expires_at > NOW()`;
  const params: (string | number)[] = [];
  let paramIndex = 1;

  if (action_type) {
    sql += ` AND action_type = $${paramIndex++}`;
    params.push(action_type);
  }

  sql += ` ORDER BY
    CASE risk_level WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
    created_at ASC
    LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
  params.push(limit, offset);

  const result = await queryContext(context, sql, params);
  return result.rows as GovernanceAction[];
}

export async function getActionHistory(
  context: AIContext,
  filters: ActionFilters = {}
): Promise<GovernanceAction[]> {
  const { status, action_type, limit = 50, offset = 0 } = filters;

  let sql = 'SELECT * FROM governance_actions WHERE 1=1';
  const params: (string | number)[] = [];
  let paramIndex = 1;

  if (status) {
    sql += ` AND status = $${paramIndex++}`;
    params.push(status);
  }
  if (action_type) {
    sql += ` AND action_type = $${paramIndex++}`;
    params.push(action_type);
  }

  sql += ` ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
  params.push(limit, offset);

  const result = await queryContext(context, sql, params);
  return result.rows as GovernanceAction[];
}

export async function getActionById(
  context: AIContext,
  actionId: string
): Promise<GovernanceAction | null> {
  const result = await queryContext(
    context,
    'SELECT * FROM governance_actions WHERE id = $1',
    [actionId]
  );
  return (result.rows[0] as GovernanceAction) || null;
}

// ===========================================
// Audit Log
// ===========================================

export async function logAudit(
  context: AIContext,
  entry: {
    event_type: string;
    actor: string;
    target_type?: string | null;
    target_id?: string | null;
    description?: string | null;
    metadata?: Record<string, unknown> | null;
  }
): Promise<void> {
  try {
    await queryContext(
      context,
      `INSERT INTO audit_log (id, context, event_type, actor, target_type, target_id, description, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        uuidv4(), context, entry.event_type, entry.actor,
        entry.target_type || null, entry.target_id || null,
        entry.description || null,
        entry.metadata ? JSON.stringify(entry.metadata) : null,
      ]
    );
  } catch (err) {
    // Audit logging should never break the main flow
    logger.warn('Failed to write audit log', {
      event_type: entry.event_type,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function getAuditLog(
  context: AIContext,
  filters: AuditFilters = {}
): Promise<AuditEntry[]> {
  const { event_type, actor, target_id, limit = 50, offset = 0, days = 30 } = filters;

  let sql = `SELECT * FROM audit_log WHERE created_at > NOW() - INTERVAL '1 day' * $1`;
  const params: (string | number)[] = [days];
  let paramIndex = 2;

  if (event_type) {
    sql += ` AND event_type = $${paramIndex++}`;
    params.push(event_type);
  }
  if (actor) {
    sql += ` AND actor = $${paramIndex++}`;
    params.push(actor);
  }
  if (target_id) {
    sql += ` AND target_id = $${paramIndex++}`;
    params.push(target_id);
  }

  sql += ` ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
  params.push(limit, offset);

  const result = await queryContext(context, sql, params);
  return result.rows as AuditEntry[];
}

// ===========================================
// Policy Management
// ===========================================

export async function createPolicy(
  context: AIContext,
  policy: Omit<GovernancePolicy, 'id' | 'context' | 'created_at' | 'updated_at'>
): Promise<GovernancePolicy> {
  const id = uuidv4();
  const result = await queryContext(
    context,
    `INSERT INTO governance_policies
     (id, context, name, description, action_type, conditions, risk_level,
      auto_approve, notify_on_auto_approve, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [
      id, context, policy.name, policy.description || null,
      policy.action_type, JSON.stringify(policy.conditions || []),
      policy.risk_level || 'medium', policy.auto_approve ?? false,
      policy.notify_on_auto_approve ?? true, policy.is_active ?? true,
    ]
  );
  return result.rows[0] as GovernancePolicy;
}

export async function updatePolicy(
  context: AIContext,
  policyId: string,
  updates: Partial<GovernancePolicy>
): Promise<GovernancePolicy> {
  const setClauses: string[] = [];
  const params: (string | number | boolean)[] = [];
  let paramIndex = 1;

  const fields: Array<{ key: keyof GovernancePolicy; serialize?: boolean }> = [
    { key: 'name' }, { key: 'description' }, { key: 'action_type' },
    { key: 'conditions', serialize: true }, { key: 'risk_level' },
    { key: 'auto_approve' }, { key: 'notify_on_auto_approve' }, { key: 'is_active' },
  ];

  for (const { key, serialize } of fields) {
    if (updates[key] !== undefined) {
      setClauses.push(`${key} = $${paramIndex++}`);
      const val = updates[key];
      params.push(serialize ? JSON.stringify(val) : val as string | number | boolean);
    }
  }

  if (setClauses.length === 0) {
    throw new Error('No fields to update');
  }

  setClauses.push('updated_at = NOW()');

  const result = await queryContext(
    context,
    `UPDATE governance_policies SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
    [...params, policyId]
  );

  if (result.rows.length === 0) {
    throw new Error(`Policy ${policyId} not found`);
  }

  return result.rows[0] as GovernancePolicy;
}

export async function deletePolicy(
  context: AIContext,
  policyId: string
): Promise<void> {
  await queryContext(context, 'DELETE FROM governance_policies WHERE id = $1', [policyId]);
}

export async function listPolicies(
  context: AIContext,
  activeOnly = false
): Promise<GovernancePolicy[]> {
  let sql = 'SELECT * FROM governance_policies';
  if (activeOnly) sql += ' WHERE is_active = true';
  sql += ' ORDER BY action_type, created_at DESC';
  const result = await queryContext(context, sql);
  return result.rows as GovernancePolicy[];
}

// ===========================================
// Maintenance
// ===========================================

export async function expireStaleActions(context: AIContext): Promise<number> {
  const result = await queryContext(
    context,
    `UPDATE governance_actions
     SET status = 'expired', updated_at = NOW()
     WHERE status = 'pending' AND expires_at < NOW()
     RETURNING id`
  );
  const expired = result.rows.length;
  if (expired > 0) {
    logger.info(`Governance: expired ${expired} stale actions`, { context });
  }
  return expired;
}
