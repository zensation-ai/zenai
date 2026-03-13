/**
 * Proactive Decision Engine
 *
 * Processes system events against proactive rules to determine
 * autonomous actions: notify, prepare context, take action, trigger agent.
 * All high-impact decisions go through governance approval.
 */

import { AIContext, queryContext } from '../utils/database-context';
import { logger } from '../utils/logger';
import {
  getUnprocessedEvents,
  markEventProcessed,
  type SystemEvent,
} from './event-system';
import { requestApproval, type ActionType, type RiskLevel } from './governance';

// ===========================================
// Types
// ===========================================

export interface ProactiveRule {
  id: string;
  context: AIContext;
  name: string;
  description: string | null;
  eventTypes: string[];
  conditions: RuleCondition[];
  decision: 'notify' | 'prepare_context' | 'take_action' | 'trigger_agent';
  actionConfig: Record<string, unknown>;
  riskLevel: RiskLevel;
  requiresApproval: boolean;
  priority: number;
  cooldownMinutes: number;
  lastTriggeredAt: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface RuleCondition {
  field: string;
  operator: 'equals' | 'contains' | 'gt' | 'lt' | 'exists' | 'regex';
  value: string | number | boolean;
}

export interface DecisionResult {
  eventId: string;
  decision: string;
  ruleName: string;
  ruleId: string;
  reason: string;
  actionTaken?: string;
}

// ===========================================
// Rule CRUD
// ===========================================

export async function createProactiveRule(
  context: AIContext,
  rule: Omit<ProactiveRule, 'id' | 'createdAt' | 'lastTriggeredAt' | 'context'>
): Promise<ProactiveRule | null> {
  try {
    const result = await queryContext(
      context,
      `INSERT INTO proactive_rules
       (context, name, description, event_types, conditions, decision, action_config,
        risk_level, requires_approval, priority, cooldown_minutes, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [
        context, rule.name, rule.description, rule.eventTypes,
        JSON.stringify(rule.conditions), rule.decision,
        JSON.stringify(rule.actionConfig), rule.riskLevel,
        rule.requiresApproval, rule.priority, rule.cooldownMinutes, rule.isActive,
      ]
    );
    return result.rows.length > 0 ? parseRule(result.rows[0]) : null;
  } catch (error) {
    logger.error('Failed to create proactive rule', error instanceof Error ? error : undefined);
    return null;
  }
}

export async function updateProactiveRule(
  context: AIContext,
  ruleId: string,
  updates: Partial<ProactiveRule>
): Promise<ProactiveRule | null> {
  try {
    const setClauses: string[] = [];
    const params: (string | number | boolean | null | string[])[] = [ruleId, context];
    let idx = 3;

    if (updates.name !== undefined) { setClauses.push(`name = $${idx++}`); params.push(updates.name); }
    if (updates.description !== undefined) { setClauses.push(`description = $${idx++}`); params.push(updates.description); }
    if (updates.eventTypes !== undefined) { setClauses.push(`event_types = $${idx++}`); params.push(updates.eventTypes); }
    if (updates.conditions !== undefined) { setClauses.push(`conditions = $${idx++}`); params.push(JSON.stringify(updates.conditions)); }
    if (updates.decision !== undefined) { setClauses.push(`decision = $${idx++}`); params.push(updates.decision); }
    if (updates.actionConfig !== undefined) { setClauses.push(`action_config = $${idx++}`); params.push(JSON.stringify(updates.actionConfig)); }
    if (updates.riskLevel !== undefined) { setClauses.push(`risk_level = $${idx++}`); params.push(updates.riskLevel); }
    if (updates.requiresApproval !== undefined) { setClauses.push(`requires_approval = $${idx++}`); params.push(updates.requiresApproval); }
    if (updates.priority !== undefined) { setClauses.push(`priority = $${idx++}`); params.push(updates.priority); }
    if (updates.cooldownMinutes !== undefined) { setClauses.push(`cooldown_minutes = $${idx++}`); params.push(updates.cooldownMinutes); }
    if (updates.isActive !== undefined) { setClauses.push(`is_active = $${idx++}`); params.push(updates.isActive); }

    if (setClauses.length === 0) {return null;}
    setClauses.push('updated_at = NOW()');

    const result = await queryContext(
      context,
      `UPDATE proactive_rules SET ${setClauses.join(', ')} WHERE id = $1 AND context = $2 RETURNING *`,
      params
    );
    return result.rows.length > 0 ? parseRule(result.rows[0]) : null;
  } catch (error) {
    logger.error('Failed to update proactive rule', error instanceof Error ? error : undefined);
    return null;
  }
}

export async function deleteProactiveRule(context: AIContext, ruleId: string): Promise<boolean> {
  try {
    const result = await queryContext(
      context,
      `DELETE FROM proactive_rules WHERE id = $1 AND context = $2`,
      [ruleId, context]
    );
    return (result.rowCount ?? 0) > 0;
  } catch {
    return false;
  }
}

export async function listProactiveRules(
  context: AIContext,
  activeOnly = false
): Promise<ProactiveRule[]> {
  try {
    const sql = activeOnly
      ? `SELECT * FROM proactive_rules WHERE context = $1 AND is_active = true ORDER BY priority DESC`
      : `SELECT * FROM proactive_rules WHERE context = $1 ORDER BY priority DESC`;
    const result = await queryContext(context, sql, [context]);
    return result.rows.map(parseRule);
  } catch {
    return [];
  }
}

// ===========================================
// Event Processing
// ===========================================

/**
 * Process all unhandled events for a context.
 * For each event, find matching rules (priority DESC), check cooldown, execute decision.
 */
export async function processUnhandledEvents(context: AIContext): Promise<DecisionResult[]> {
  const events = await getUnprocessedEvents(context, 20);
  if (events.length === 0) {return [];}

  const rules = await listProactiveRules(context, true);
  const results: DecisionResult[] = [];

  for (const event of events) {
    const result = await processEvent(context, event, rules);
    if (result) {
      results.push(result);
    } else {
      // No rule matched — mark as ignored
      await markEventProcessed(context, event.id, 'ignored', 'No matching rule', 'proactive_engine');
    }
  }

  return results;
}

/**
 * Process a single event against matching rules.
 */
async function processEvent(
  context: AIContext,
  event: SystemEvent,
  rules: ProactiveRule[]
): Promise<DecisionResult | null> {
  for (const rule of rules) {
    // Check event type match
    if (!rule.eventTypes.includes(event.eventType)) {continue;}

    // Check conditions
    if (!evaluateConditions(rule.conditions, event.payload)) {continue;}

    // Check cooldown
    if (rule.lastTriggeredAt) {
      const lastTriggered = new Date(rule.lastTriggeredAt).getTime();
      const cooldownMs = rule.cooldownMinutes * 60 * 1000;
      if (Date.now() - lastTriggered < cooldownMs) {continue;}
    }

    // Execute decision
    const result = await executeDecision(context, rule, event);

    // Update last_triggered_at
    await queryContext(
      context,
      `UPDATE proactive_rules SET last_triggered_at = NOW() WHERE id = $1`,
      [rule.id]
    ).catch(err => { logger.warn('Failed to update rule last_triggered_at', { error: err instanceof Error ? err.message : String(err), ruleId: rule.id }); });

    // Mark event processed
    await markEventProcessed(
      context, event.id, rule.decision,
      `Matched rule: ${rule.name}`, `proactive_engine:${rule.id}`
    );

    return result;
  }

  return null;
}

async function executeDecision(
  context: AIContext,
  rule: ProactiveRule,
  event: SystemEvent
): Promise<DecisionResult> {
  const base: DecisionResult = {
    eventId: event.id,
    decision: rule.decision,
    ruleName: rule.name,
    ruleId: rule.id,
    reason: `Event ${event.eventType} matched rule "${rule.name}"`,
  };

  switch (rule.decision) {
    case 'notify':
      base.actionTaken = 'notification_created';
      break;

    case 'prepare_context':
      base.actionTaken = 'context_prepared';
      break;

    case 'take_action':
    case 'trigger_agent':
      if (rule.requiresApproval) {
        // Route through governance
        await requestApproval(context, {
          action_type: 'proactive_action' as ActionType,
          action_source: 'proactive_engine',
          description: `${rule.name}: ${event.eventType}`,
          payload: {
            ruleId: rule.id,
            eventId: event.id,
            actionConfig: rule.actionConfig,
            eventPayload: event.payload,
          },
          risk_level: rule.riskLevel,
        });
        base.actionTaken = 'approval_requested';
      } else {
        base.actionTaken = 'auto_executed';
      }
      break;
  }

  return base;
}

// ===========================================
// Condition Evaluation
// ===========================================

function evaluateConditions(
  conditions: RuleCondition[],
  payload: Record<string, unknown>
): boolean {
  if (!conditions || conditions.length === 0) {return true;}

  for (const condition of conditions) {
    const fieldValue = getNestedValue(payload, condition.field);
    const condValue = condition.value;

    switch (condition.operator) {
      case 'equals':
        if (String(fieldValue).toLowerCase() !== String(condValue).toLowerCase()) {return false;}
        break;
      case 'contains':
        if (!String(fieldValue).toLowerCase().includes(String(condValue).toLowerCase())) {return false;}
        break;
      case 'gt':
        if (!(Number(fieldValue) > Number(condValue))) {return false;}
        break;
      case 'lt':
        if (!(Number(fieldValue) < Number(condValue))) {return false;}
        break;
      case 'exists':
        if ((fieldValue !== undefined && fieldValue !== null) !== Boolean(condValue)) {return false;}
        break;
      case 'regex':
        try {
          const pattern = String(condValue);
          // ReDoS protection: reject patterns with nested quantifiers
          if (/(\+|\*|\{)\s*(\+|\*|\{)/.test(pattern) || pattern.length > 200) {return false;}
          // eslint-disable-next-line security/detect-non-literal-regexp -- protected by ReDoS check above
          if (!new RegExp(pattern, 'i').test(String(fieldValue))) {return false;}
        } catch { return false; }
        break;
    }
  }
  return true;
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  let current: unknown = obj;
  for (const part of path.split('.')) {
    if (current === null || current === undefined || typeof current !== 'object') {return undefined;}
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

// ===========================================
// Helpers
// ===========================================

function parseRule(r: Record<string, unknown>): ProactiveRule {
  const parseJSON = <T>(val: unknown, fallback: T): T => {
    if (!val) {return fallback;}
    if (typeof val === 'object') {return val as T;}
    if (typeof val === 'string') { try { return JSON.parse(val); } catch { return fallback; } }
    return fallback;
  };

  return {
    id: r.id as string,
    context: r.context as AIContext,
    name: r.name as string,
    description: (r.description as string) || null,
    eventTypes: Array.isArray(r.event_types) ? r.event_types as string[] : [],
    conditions: parseJSON(r.conditions, []),
    decision: r.decision as ProactiveRule['decision'],
    actionConfig: parseJSON(r.action_config, {}),
    riskLevel: (r.risk_level as RiskLevel) || 'low',
    requiresApproval: r.requires_approval === true,
    priority: parseInt(r.priority as string, 10) || 50,
    cooldownMinutes: parseInt(r.cooldown_minutes as string, 10) || 60,
    lastTriggeredAt: r.last_triggered_at ? String(r.last_triggered_at) : null,
    isActive: r.is_active !== false,
    createdAt: r.created_at ? String(r.created_at) : new Date().toISOString(),
  };
}
