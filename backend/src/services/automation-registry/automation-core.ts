/**
 * Automation Core - Types, CRUD, Execution, and Utilities
 *
 * Central management for automation definitions and their execution.
 */

import { v4 as uuidv4 } from 'uuid';
import { queryContext, AIContext } from '../../utils/database-context';
import { triggerWebhook, WebhookEventType } from '../webhooks';
import { logger } from '../../utils/logger';

// ===========================================
// Types
// ===========================================

export type TriggerType = 'webhook' | 'schedule' | 'event' | 'manual' | 'pattern';

export type ActionType =
  | 'webhook_call'
  | 'notification'
  | 'tag_idea'
  | 'set_priority'
  | 'create_task'
  | 'slack_message'
  | 'email'
  | 'custom';

export interface AutomationTrigger {
  type: TriggerType;
  config: {
    /** For webhook: event types to listen for */
    events?: WebhookEventType[];
    /** For schedule: cron expression */
    cron?: string;
    /** For pattern: keyword or condition */
    pattern?: string;
    /** For event: internal event name */
    eventName?: string;
  };
}

export interface AutomationAction {
  type: ActionType;
  config: Record<string, unknown>;
  /** Order of execution (lower = first) */
  order: number;
}

export interface AutomationCondition {
  field: string;
  operator: 'equals' | 'contains' | 'startsWith' | 'endsWith' | 'regex' | 'gt' | 'lt';
  value: string | number;
}

export interface AutomationDefinition {
  id: string;
  context: AIContext;
  name: string;
  description: string;
  trigger: AutomationTrigger;
  conditions: AutomationCondition[];
  actions: AutomationAction[];
  is_active: boolean;
  is_system: boolean;
  created_at: string;
  updated_at: string;
  last_run_at: string | null;
  run_count: number;
  success_count: number;
  failure_count: number;
}

export interface AutomationSuggestion {
  id: string;
  context: AIContext;
  name: string;
  description: string;
  trigger: AutomationTrigger;
  actions: AutomationAction[];
  reasoning: string;
  confidence: number;
  based_on_pattern: string;
  sample_matches: number;
  status: 'pending' | 'accepted' | 'dismissed';
  created_at: string;
}

export interface AutomationExecution {
  id: string;
  automation_id: string;
  trigger_data: Record<string, unknown>;
  actions_executed: number;
  success: boolean;
  error_message: string | null;
  duration_ms: number;
  executed_at: string;
}

export interface AutomationStats {
  total_automations: number;
  active_automations: number;
  total_executions: number;
  successful_executions: number;
  failed_executions: number;
  success_rate: number;
  automations_by_trigger: Record<TriggerType, number>;
  top_automations: Array<{
    id: string;
    name: string;
    run_count: number;
    success_rate: number;
  }>;
  pending_suggestions: number;
}

// ===========================================
// Automation CRUD
// ===========================================

/**
 * Registriert eine neue Automation
 */
export async function registerAutomation(
  context: AIContext,
  definition: Omit<AutomationDefinition, 'id' | 'context' | 'created_at' | 'updated_at' | 'last_run_at' | 'run_count' | 'success_count' | 'failure_count'>
): Promise<AutomationDefinition> {
  const id = uuidv4();
  const now = new Date().toISOString();

  await queryContext(
    context,
    `INSERT INTO automation_definitions
      (id, context, name, description, trigger_type, trigger_config,
       conditions, actions, is_active, is_system, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11)`,
    [
      id,
      context,
      definition.name,
      definition.description,
      definition.trigger.type,
      JSON.stringify(definition.trigger.config),
      JSON.stringify(definition.conditions),
      JSON.stringify(definition.actions),
      definition.is_active,
      definition.is_system || false,
      now,
    ]
  );

  logger.info('Automation registered', { id, name: definition.name, context });

  return {
    id,
    context,
    ...definition,
    created_at: now,
    updated_at: now,
    last_run_at: null,
    run_count: 0,
    success_count: 0,
    failure_count: 0,
  };
}

/**
 * Aktualisiert eine bestehende Automation
 */
export async function updateAutomation(
  context: AIContext,
  id: string,
  updates: Partial<Pick<AutomationDefinition, 'name' | 'description' | 'trigger' | 'conditions' | 'actions' | 'is_active'>>
): Promise<void> {
  const setClauses: string[] = ['updated_at = NOW()'];
  const values: (string | number | boolean | null)[] = [];
  let paramIndex = 1;

  if (updates.name !== undefined) {
    setClauses.push(`name = $${paramIndex++}`);
    values.push(updates.name);
  }
  if (updates.description !== undefined) {
    setClauses.push(`description = $${paramIndex++}`);
    values.push(updates.description);
  }
  if (updates.trigger !== undefined) {
    setClauses.push(`trigger_type = $${paramIndex++}`);
    values.push(updates.trigger.type);
    setClauses.push(`trigger_config = $${paramIndex++}`);
    values.push(JSON.stringify(updates.trigger.config));
  }
  if (updates.conditions !== undefined) {
    setClauses.push(`conditions = $${paramIndex++}`);
    values.push(JSON.stringify(updates.conditions));
  }
  if (updates.actions !== undefined) {
    setClauses.push(`actions = $${paramIndex++}`);
    values.push(JSON.stringify(updates.actions));
  }
  if (updates.is_active !== undefined) {
    setClauses.push(`is_active = $${paramIndex++}`);
    values.push(updates.is_active);
  }

  values.push(id, context);

  await queryContext(
    context,
    `UPDATE automation_definitions
     SET ${setClauses.join(', ')}
     WHERE id = $${paramIndex++} AND context = $${paramIndex}`,
    values
  );

  logger.info('Automation updated', { id, context });
}

/**
 * Löscht eine Automation
 */
export async function deleteAutomation(
  context: AIContext,
  id: string
): Promise<boolean> {
  const result = await queryContext(
    context,
    `DELETE FROM automation_definitions
     WHERE id = $1 AND context = $2 AND is_system = false`,
    [id, context]
  );

  const deleted = (result.rowCount ?? 0) > 0;
  if (deleted) {
    logger.info('Automation deleted', { id, context });
  }
  return deleted;
}

/**
 * Holt eine Automation nach ID
 */
export async function getAutomation(
  context: AIContext,
  id: string
): Promise<AutomationDefinition | null> {
  const result = await queryContext(
    context,
    `SELECT * FROM automation_definitions
     WHERE id = $1 AND context = $2`,
    [id, context]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return mapRowToAutomation(result.rows[0]);
}

/**
 * Listet alle Automationen eines Kontexts
 */
export async function listAutomations(
  context: AIContext,
  options: { active_only?: boolean; trigger_type?: TriggerType } = {}
): Promise<AutomationDefinition[]> {
  let query = `SELECT * FROM automation_definitions WHERE context = $1`;
  const params: (string | number | boolean | null)[] = [context];

  if (options.active_only) {
    query += ` AND is_active = true`;
  }
  if (options.trigger_type) {
    query += ` AND trigger_type = $${params.length + 1}`;
    params.push(options.trigger_type);
  }

  query += ` ORDER BY created_at DESC`;

  const result = await queryContext(context, query, params);
  return result.rows.map(mapRowToAutomation);
}

// ===========================================
// Automation Execution
// ===========================================

/**
 * Führt eine Automation aus
 */
export async function executeAutomation(
  context: AIContext,
  automationId: string,
  triggerData: Record<string, unknown>
): Promise<AutomationExecution> {
  const startTime = Date.now();
  const executionId = uuidv4();
  let success = true;
  let errorMessage: string | null = null;
  let actionsExecuted = 0;

  try {
    const automation = await getAutomation(context, automationId);
    if (!automation) {
      throw new Error(`Automation ${automationId} not found`);
    }

    if (!automation.is_active) {
      throw new Error(`Automation ${automationId} is not active`);
    }

    // Prüfe Bedingungen
    if (!checkConditions(automation.conditions, triggerData)) {
      logger.debug('Automation conditions not met', { automationId, triggerData });
      return {
        id: executionId,
        automation_id: automationId,
        trigger_data: triggerData,
        actions_executed: 0,
        success: true,
        error_message: 'Conditions not met',
        duration_ms: Date.now() - startTime,
        executed_at: new Date().toISOString(),
      };
    }

    // Sortiere Actions nach Order
    const sortedActions = [...automation.actions].sort((a, b) => a.order - b.order);

    // Führe Actions aus
    for (const action of sortedActions) {
      try {
        await executeAction(context, action, triggerData);
        actionsExecuted++;
      } catch (actionError) {
        logger.error('Action execution failed', actionError instanceof Error ? actionError : undefined, {
          automationId,
          actionType: action.type,
        });
        throw actionError;
      }
    }

    // Update Statistiken
    await queryContext(
      context,
      `UPDATE automation_definitions
       SET run_count = run_count + 1,
           success_count = success_count + 1,
           last_run_at = NOW()
       WHERE id = $1`,
      [automationId]
    );

  } catch (error) {
    success = false;
    errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Update Failure Count
    await queryContext(
      context,
      `UPDATE automation_definitions
       SET run_count = run_count + 1,
           failure_count = failure_count + 1,
           last_run_at = NOW()
       WHERE id = $1`,
      [automationId]
    ).catch(err => logger.warn('Failed to update automation failure count', { automationId, error: err instanceof Error ? err.message : String(err) }));

    logger.error('Automation execution failed', error instanceof Error ? error : undefined, {
      automationId,
      executionId,
    });
  }

  const execution: AutomationExecution = {
    id: executionId,
    automation_id: automationId,
    trigger_data: triggerData,
    actions_executed: actionsExecuted,
    success,
    error_message: errorMessage,
    duration_ms: Date.now() - startTime,
    executed_at: new Date().toISOString(),
  };

  // Speichere Execution Log
  await saveExecution(context, execution);

  return execution;
}

/**
 * Prüft ob Bedingungen erfüllt sind
 */
function checkConditions(
  conditions: AutomationCondition[],
  data: Record<string, unknown>
): boolean {
  if (conditions.length === 0) {
    return true;
  }

  return conditions.every(condition => {
    const fieldValue = getNestedValue(data, condition.field);
    if (fieldValue === undefined) {
      return false;
    }

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
          // eslint-disable-next-line security/detect-non-literal-regexp -- User-defined regex patterns for automation conditions
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

/**
 * Führt eine einzelne Action aus
 */
async function executeAction(
  context: AIContext,
  action: AutomationAction,
  triggerData: Record<string, unknown>
): Promise<void> {
  switch (action.type) {
    case 'webhook_call': {
      const webhookUrl = action.config.url as string;
      if (webhookUrl) {
        const axios = (await import('axios')).default;
        const payload = action.config.payload && typeof action.config.payload === 'object'
          ? action.config.payload as Record<string, unknown>
          : {};
        await axios.post(webhookUrl, {
          automation: true,
          trigger_data: triggerData,
          ...payload,
        }, { timeout: 10000 });
      }
      break;
    }

    case 'notification':
      // Speichere Notification für späteren Abruf
      await queryContext(
        context,
        `INSERT INTO automation_notifications (id, context, title, message, created_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [
          uuidv4(),
          context,
          action.config.title || 'Automation',
          interpolateTemplate(action.config.message as string || '', triggerData),
        ]
      ).catch(err => logger.warn('Failed to save automation notification', { context, error: err instanceof Error ? err.message : String(err) }));
      break;

    case 'tag_idea': {
      const ideaId = triggerData.idea_id || triggerData.id;
      const tags = action.config.tags as string[];
      if (ideaId && tags) {
        await queryContext(
          context,
          `UPDATE ideas
           SET keywords = keywords || $1::jsonb
           WHERE id = $2`,
          [JSON.stringify(tags), ideaId]
        ).catch(err => logger.warn('Failed to tag idea via automation', { ideaId, tags, error: err instanceof Error ? err.message : String(err) }));
      }
      break;
    }

    case 'set_priority': {
      const targetIdeaId = triggerData.idea_id || triggerData.id;
      const newPriority = action.config.priority as string;
      if (targetIdeaId && newPriority) {
        await queryContext(
          context,
          `UPDATE ideas SET priority = $1 WHERE id = $2`,
          [newPriority, targetIdeaId]
        ).catch(err => logger.warn('Failed to set idea priority via automation', { targetIdeaId, newPriority, error: err instanceof Error ? err.message : String(err) }));
      }
      break;
    }

    case 'create_task':
      await queryContext(
        context,
        `INSERT INTO ideas (id, title, type, category, priority, summary, context, is_archived, created_at)
         VALUES ($1, $2, 'task', $3, $4, $5, $6, false, NOW())`,
        [
          uuidv4(),
          interpolateTemplate(action.config.title as string || 'Automatische Aufgabe', triggerData),
          action.config.category || 'business',
          action.config.priority || 'medium',
          interpolateTemplate(action.config.description as string || '', triggerData),
          context,
        ]
      ).catch(err => logger.warn('Failed to create task via automation', { context, error: err instanceof Error ? err.message : String(err) }));
      break;

    case 'slack_message':
      // Nutzt existierendes Webhook-System für Slack
      await triggerWebhook('idea.created', {
        automation: true,
        channel: action.config.channel,
        message: interpolateTemplate(action.config.message as string || '', triggerData),
        ...triggerData,
      });
      break;

    default:
      logger.warn('Unknown action type', { type: action.type });
  }
}

/**
 * Speichert eine Ausführung
 */
async function saveExecution(
  context: AIContext,
  execution: AutomationExecution
): Promise<void> {
  try {
    await queryContext(
      context,
      `INSERT INTO automation_executions
        (id, automation_id, trigger_data, actions_executed, success, error_message, duration_ms, executed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        execution.id,
        execution.automation_id,
        JSON.stringify(execution.trigger_data),
        execution.actions_executed,
        execution.success,
        execution.error_message,
        execution.duration_ms,
        execution.executed_at,
      ]
    );
  } catch {
    logger.warn('Could not save automation execution', { executionId: execution.id });
  }
}

// ===========================================
// Helper Functions
// ===========================================

export function mapRowToAutomation(row: Record<string, unknown>): AutomationDefinition {
  return {
    id: row.id as string,
    context: row.context as AIContext,
    name: row.name as string,
    description: row.description as string,
    trigger: {
      type: row.trigger_type as TriggerType,
      config: row.trigger_config as Record<string, unknown>,
    },
    conditions: (row.conditions as AutomationCondition[]) || [],
    actions: (row.actions as AutomationAction[]) || [],
    is_active: row.is_active as boolean,
    is_system: row.is_system as boolean,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    last_run_at: row.last_run_at as string | null,
    run_count: (row.run_count as number) || 0,
    success_count: (row.success_count as number) || 0,
    failure_count: (row.failure_count as number) || 0,
  };
}

export function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce((current, key) => {
    return current && typeof current === 'object' ? (current as Record<string, unknown>)[key] : undefined;
  }, obj as unknown);
}

export function interpolateTemplate(template: string, data: Record<string, unknown>): string {
  // eslint-disable-next-line security/detect-unsafe-regex -- Simple mustache-style interpolation, bounded template input
  return template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (match, path) => {
    const value = getNestedValue(data, path);
    return value !== undefined ? String(value) : match;
  });
}
