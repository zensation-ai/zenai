/**
 * Workspace Automation Service (Phase 93)
 *
 * AI-driven workflow automation connecting ZenAI features together.
 * Supports predefined templates and custom user-defined automations.
 */

import { queryContext, type AIContext } from '../utils/database-context';
import { logger } from '../utils/logger';

// ─── Types ──────────────────────────────────────────────

export type TriggerType = 'time' | 'event' | 'condition' | 'manual';

export type ActionType = 'create' | 'update' | 'notify' | 'ai-process' | 'navigate';

export interface AutomationTriggerConfig {
  /** Cron expression for time triggers */
  cron?: string;
  /** Event name for event triggers (e.g. email.received, task.created) */
  eventType?: string;
  /** Condition expression for condition triggers */
  conditionField?: string;
  conditionOperator?: 'eq' | 'gt' | 'lt' | 'contains' | 'exists';
  conditionValue?: string | number | boolean;
}

export interface AutomationCondition {
  field: string;
  operator: 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte' | 'contains' | 'exists';
  value: string | number | boolean;
}

export interface AutomationAction {
  type: ActionType;
  /** Target entity: idea, task, email-draft, notification, etc. */
  target: string;
  /** Action-specific parameters */
  params: Record<string, unknown>;
}

export interface WorkspaceAutomation {
  id: string;
  user_id: string | null;
  name: string;
  description: string | null;
  trigger_type: TriggerType;
  trigger_config: AutomationTriggerConfig;
  conditions: AutomationCondition[];
  actions: AutomationAction[];
  enabled: boolean;
  template_id: string | null;
  last_run_at: string | null;
  run_count: number;
  created_at: string;
  updated_at: string;
}

export interface AutomationExecution {
  id: string;
  automation_id: string;
  status: 'running' | 'completed' | 'failed';
  trigger_data: Record<string, unknown> | null;
  results: Record<string, unknown>[];
  error: string | null;
  started_at: string;
  completed_at: string | null;
}

export interface CreateAutomationInput {
  name: string;
  description?: string;
  trigger_type: TriggerType;
  trigger_config: AutomationTriggerConfig;
  conditions?: AutomationCondition[];
  actions: AutomationAction[];
  enabled?: boolean;
  template_id?: string;
}

// ─── Predefined Templates ───────────────────────────────

export interface AutomationTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  trigger_type: TriggerType;
  trigger_config: AutomationTriggerConfig;
  conditions: AutomationCondition[];
  actions: AutomationAction[];
}

const TEMPLATES: AutomationTemplate[] = [
  {
    id: 'email-to-task',
    name: 'Email zu Aufgabe',
    description: 'Extrahiert Handlungsschritte aus E-Mails und erstellt Aufgaben im richtigen Projekt.',
    category: 'productivity',
    trigger_type: 'event',
    trigger_config: { eventType: 'email.received' },
    conditions: [],
    actions: [
      {
        type: 'ai-process',
        target: 'email',
        params: { operation: 'extract_action_items' },
      },
      {
        type: 'create',
        target: 'task',
        params: { fromExtracted: true, assignProject: true },
      },
    ],
  },
  {
    id: 'meeting-notes-tasks',
    name: 'Meeting zu Notizen & Aufgaben',
    description: 'Fasst Meetings zusammen und erstellt automatisch Follow-up-Aufgaben.',
    category: 'productivity',
    trigger_type: 'event',
    trigger_config: { eventType: 'meeting.ended' },
    conditions: [],
    actions: [
      {
        type: 'ai-process',
        target: 'meeting',
        params: { operation: 'summarize' },
      },
      {
        type: 'create',
        target: 'task',
        params: { fromMeetingActionItems: true },
      },
    ],
  },
  {
    id: 'idea-research-draft',
    name: 'Idee zu Recherche & Entwurf',
    description: 'Researcher-Agent recherchiert eine Idee, Writer erstellt einen Entwurf.',
    category: 'creative',
    trigger_type: 'manual',
    trigger_config: {},
    conditions: [],
    actions: [
      {
        type: 'ai-process',
        target: 'idea',
        params: { operation: 'research', agent: 'researcher' },
      },
      {
        type: 'ai-process',
        target: 'idea',
        params: { operation: 'draft', agent: 'writer' },
      },
    ],
  },
  {
    id: 'contact-crm-update',
    name: 'Kontakt-CRM aktualisieren',
    description: 'Aktualisiert die CRM-Timeline automatisch aus E-Mail-Threads.',
    category: 'crm',
    trigger_type: 'event',
    trigger_config: { eventType: 'email.sent' },
    conditions: [],
    actions: [
      {
        type: 'update',
        target: 'contact',
        params: { updateTimeline: true, fromEmailThread: true },
      },
    ],
  },
  {
    id: 'finance-budget-alert',
    name: 'Budget-Warnung',
    description: 'Erstellt eine Smart Suggestion wenn ein Budget-Limit erreicht wird.',
    category: 'finance',
    trigger_type: 'condition',
    trigger_config: {
      conditionField: 'budget.usage_percent',
      conditionOperator: 'gt',
      conditionValue: 90,
    },
    conditions: [],
    actions: [
      {
        type: 'notify',
        target: 'smart-suggestion',
        params: { priority: 'high', category: 'finance' },
      },
    ],
  },
  {
    id: 'daily-digest',
    name: 'Tägliche Zusammenfassung',
    description: 'Morgens um 7:00 Uhr: Tagesagenda, verpasste Aufgaben, Vorschläge.',
    category: 'digest',
    trigger_type: 'time',
    trigger_config: { cron: '0 7 * * *' },
    conditions: [],
    actions: [
      {
        type: 'ai-process',
        target: 'digest',
        params: { type: 'daily', includeAgenda: true, includeMissed: true, includeSuggestions: true },
      },
      {
        type: 'notify',
        target: 'smart-suggestion',
        params: { category: 'briefing' },
      },
    ],
  },
  {
    id: 'weekly-report',
    name: 'Wochenbericht',
    description: 'Freitags um 17:00 Uhr: Wochenzusammenfassung aller Kontexte.',
    category: 'digest',
    trigger_type: 'time',
    trigger_config: { cron: '0 17 * * 5' },
    conditions: [],
    actions: [
      {
        type: 'ai-process',
        target: 'digest',
        params: { type: 'weekly', allContexts: true },
      },
      {
        type: 'create',
        target: 'idea',
        params: { category: 'weekly-report', fromDigest: true },
      },
    ],
  },
];

// ─── Service Functions ──────────────────────────────────

/**
 * Get all predefined templates.
 */
export function getTemplates(): AutomationTemplate[] {
  return TEMPLATES;
}

/**
 * Get a single template by ID.
 */
export function getTemplate(templateId: string): AutomationTemplate | undefined {
  return TEMPLATES.find(t => t.id === templateId);
}

/**
 * List all automations for a user in a context.
 */
export async function listAutomations(
  context: AIContext,
  userId: string,
): Promise<WorkspaceAutomation[]> {
  const result = await queryContext(
    context,
    `SELECT * FROM workspace_automations
     WHERE user_id = $1
     ORDER BY created_at DESC`,
    [userId],
  );
  return result.rows;
}

/**
 * Get a single automation by ID.
 */
export async function getAutomation(
  context: AIContext,
  automationId: string,
  userId: string,
): Promise<WorkspaceAutomation | null> {
  const result = await queryContext(
    context,
    `SELECT * FROM workspace_automations WHERE id = $1 AND user_id = $2`,
    [automationId, userId],
  );
  return result.rows[0] ?? null;
}

/**
 * Create a new automation.
 */
export async function createAutomation(
  context: AIContext,
  userId: string,
  input: CreateAutomationInput,
): Promise<WorkspaceAutomation> {
  const result = await queryContext(
    context,
    `INSERT INTO workspace_automations
       (user_id, name, description, trigger_type, trigger_config, conditions, actions, enabled, template_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      userId,
      input.name,
      input.description ?? null,
      input.trigger_type,
      JSON.stringify(input.trigger_config),
      JSON.stringify(input.conditions ?? []),
      JSON.stringify(input.actions),
      input.enabled ?? true,
      input.template_id ?? null,
    ],
  );
  return result.rows[0];
}

/**
 * Create an automation from a predefined template.
 */
export async function createFromTemplate(
  context: AIContext,
  userId: string,
  templateId: string,
  overrides?: Partial<CreateAutomationInput>,
): Promise<WorkspaceAutomation> {
  const template = getTemplate(templateId);
  if (!template) {
    throw new Error(`Template not found: ${templateId}`);
  }

  return createAutomation(context, userId, {
    name: overrides?.name ?? template.name,
    description: overrides?.description ?? template.description,
    trigger_type: template.trigger_type,
    trigger_config: overrides?.trigger_config ?? template.trigger_config,
    conditions: overrides?.conditions ?? template.conditions,
    actions: overrides?.actions ?? template.actions,
    enabled: overrides?.enabled ?? true,
    template_id: templateId,
  });
}

/**
 * Update an existing automation.
 */
export async function updateAutomation(
  context: AIContext,
  automationId: string,
  userId: string,
  updates: Partial<CreateAutomationInput>,
): Promise<WorkspaceAutomation | null> {
  const fields: string[] = [];
  const values: (string | number | boolean | null)[] = [];
  let idx = 1;

  if (updates.name !== undefined) {
    fields.push(`name = $${idx++}`);
    values.push(updates.name);
  }
  if (updates.description !== undefined) {
    fields.push(`description = $${idx++}`);
    values.push(updates.description);
  }
  if (updates.trigger_type !== undefined) {
    fields.push(`trigger_type = $${idx++}`);
    values.push(updates.trigger_type);
  }
  if (updates.trigger_config !== undefined) {
    fields.push(`trigger_config = $${idx++}`);
    values.push(JSON.stringify(updates.trigger_config));
  }
  if (updates.conditions !== undefined) {
    fields.push(`conditions = $${idx++}`);
    values.push(JSON.stringify(updates.conditions));
  }
  if (updates.actions !== undefined) {
    fields.push(`actions = $${idx++}`);
    values.push(JSON.stringify(updates.actions));
  }
  if (updates.enabled !== undefined) {
    fields.push(`enabled = $${idx++}`);
    values.push(updates.enabled);
  }

  if (fields.length === 0) return getAutomation(context, automationId, userId);

  fields.push(`updated_at = NOW()`);
  values.push(automationId, userId);

  const result = await queryContext(
    context,
    `UPDATE workspace_automations
     SET ${fields.join(', ')}
     WHERE id = $${idx++} AND user_id = $${idx}
     RETURNING *`,
    values,
  );
  return result.rows[0] ?? null;
}

/**
 * Delete an automation.
 */
export async function deleteAutomation(
  context: AIContext,
  automationId: string,
  userId: string,
): Promise<boolean> {
  const result = await queryContext(
    context,
    `DELETE FROM workspace_automations WHERE id = $1 AND user_id = $2`,
    [automationId, userId],
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Execute an automation manually.
 * Creates an execution record and simulates processing the action chain.
 */
export async function executeAutomation(
  context: AIContext,
  automationId: string,
  userId: string,
  triggerData?: Record<string, unknown>,
): Promise<AutomationExecution> {
  // Verify ownership
  const automation = await getAutomation(context, automationId, userId);
  if (!automation) {
    throw new Error('Automation not found');
  }

  // Create execution record
  const execResult = await queryContext(
    context,
    `INSERT INTO automation_executions (automation_id, status, trigger_data)
     VALUES ($1, 'running', $2)
     RETURNING *`,
    [automationId, triggerData ? JSON.stringify(triggerData) : null],
  );
  const execution = execResult.rows[0] as AutomationExecution;

  try {
    // Evaluate conditions
    const conditionsMet = evaluateConditions(automation.conditions, triggerData ?? {});
    if (!conditionsMet) {
      await queryContext(
        context,
        `UPDATE automation_executions
         SET status = 'completed', completed_at = NOW(),
             results = $1
         WHERE id = $2`,
        [JSON.stringify([{ skipped: true, reason: 'Conditions not met' }]), execution.id],
      );
      // Update automation metadata
      await queryContext(
        context,
        `UPDATE workspace_automations SET last_run_at = NOW(), run_count = run_count + 1 WHERE id = $1`,
        [automationId],
      );
      return {
        ...execution,
        status: 'completed',
        results: [{ skipped: true, reason: 'Conditions not met' }],
      };
    }

    // Process actions sequentially
    const results: Record<string, unknown>[] = [];
    for (const action of automation.actions) {
      const actionResult = await processAction(context, action, triggerData ?? {});
      results.push(actionResult);
    }

    // Mark completed
    await queryContext(
      context,
      `UPDATE automation_executions
       SET status = 'completed', completed_at = NOW(), results = $1
       WHERE id = $2`,
      [JSON.stringify(results), execution.id],
    );

    // Update automation metadata
    await queryContext(
      context,
      `UPDATE workspace_automations SET last_run_at = NOW(), run_count = run_count + 1 WHERE id = $1`,
      [automationId],
    );

    return { ...execution, status: 'completed', results, completed_at: new Date().toISOString() };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    logger.error(`Automation execution failed: ${automationId} - ${errorMessage}`);

    await queryContext(
      context,
      `UPDATE automation_executions
       SET status = 'failed', completed_at = NOW(), error = $1
       WHERE id = $2`,
      [errorMessage, execution.id],
    );

    // Still update run count
    await queryContext(
      context,
      `UPDATE workspace_automations SET last_run_at = NOW(), run_count = run_count + 1 WHERE id = $1`,
      [automationId],
    );

    return { ...execution, status: 'failed', error: errorMessage, completed_at: new Date().toISOString() };
  }
}

/**
 * Get execution history for an automation.
 */
export async function getExecutionHistory(
  context: AIContext,
  automationId: string,
  userId: string,
  limit = 20,
): Promise<AutomationExecution[]> {
  // Verify ownership
  const automation = await getAutomation(context, automationId, userId);
  if (!automation) return [];

  const result = await queryContext(
    context,
    `SELECT * FROM automation_executions
     WHERE automation_id = $1
     ORDER BY started_at DESC
     LIMIT $2`,
    [automationId, limit],
  );
  return result.rows;
}

// ─── Internal Helpers ───────────────────────────────────

/**
 * Evaluate conditions against trigger data.
 */
export function evaluateConditions(
  conditions: AutomationCondition[],
  data: Record<string, unknown>,
): boolean {
  if (conditions.length === 0) return true;

  return conditions.every(condition => {
    const value = getNestedValue(data, condition.field);

    switch (condition.operator) {
      case 'eq': return value === condition.value;
      case 'neq': return value !== condition.value;
      case 'gt': return typeof value === 'number' && value > (condition.value as number);
      case 'lt': return typeof value === 'number' && value < (condition.value as number);
      case 'gte': return typeof value === 'number' && value >= (condition.value as number);
      case 'lte': return typeof value === 'number' && value <= (condition.value as number);
      case 'contains':
        return typeof value === 'string' && value.includes(String(condition.value));
      case 'exists': return value !== undefined && value !== null;
      default: return false;
    }
  });
}

/**
 * Access nested values with dot notation (e.g. "email.subject").
 */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((current, key) => {
    if (current && typeof current === 'object' && key in (current as Record<string, unknown>)) {
      return (current as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

/**
 * Process a single automation action.
 * In a real system, this would call the corresponding service.
 * Here we simulate action processing and return a result descriptor.
 */
async function processAction(
  _context: AIContext,
  action: AutomationAction,
  _triggerData: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  logger.info('Processing automation action', { type: action.type, target: action.target });

  // Simulate action processing with a result
  return {
    action: action.type,
    target: action.target,
    params: action.params,
    success: true,
    processedAt: new Date().toISOString(),
  };
}

/**
 * Check if a trigger matches an event.
 */
export function matchesTrigger(
  automation: WorkspaceAutomation,
  eventType: string,
): boolean {
  if (automation.trigger_type !== 'event') return false;
  if (!automation.enabled) return false;
  return automation.trigger_config.eventType === eventType;
}
