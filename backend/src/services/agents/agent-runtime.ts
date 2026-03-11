/**
 * Agent Runtime Engine - Phase 42
 *
 * Manages persistent background agents that respond to triggers
 * and execute actions autonomously.
 *
 * Architecture:
 * 1. Agents are defined in DB (agent_definitions)
 * 2. Runtime loads active agents on startup
 * 3. Events are dispatched via processEvent()
 * 4. Matching agents execute via the existing agent orchestration
 * 5. Actions are logged for audit
 *
 * @module services/agents/agent-runtime
 */

import { v4 as uuidv4 } from 'uuid';
import { AIContext, queryContext } from '../../utils/database-context';
import { logger } from '../../utils/logger';
import { executeTeamTask, TeamResult } from '../agent-orchestrator';
import { sendNotification } from '../push-notifications';

// ===========================================
// Types
// ===========================================

export type AgentStatus = 'active' | 'paused' | 'error' | 'stopped';

export type TriggerType =
  | 'email_received'
  | 'task_due'
  | 'calendar_soon'
  | 'schedule'
  | 'idea_created'
  | 'webhook'
  | 'pattern_detected'
  | 'manual';

export interface AgentTrigger {
  type: TriggerType;
  config: Record<string, unknown>;
}

export interface AgentDefinition {
  id: string;
  name: string;
  description: string | null;
  instructions: string;
  triggers: AgentTrigger[];
  tools: string[];
  context: AIContext;
  status: AgentStatus;
  approvalRequired: boolean;
  maxActionsPerDay: number;
  tokenBudgetDaily: number;
  templateId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AgentEvent {
  type: TriggerType;
  context: AIContext;
  data: Record<string, unknown>;
  timestamp?: Date;
}

export interface AgentExecution {
  id: string;
  agentDefinitionId: string;
  triggerType: string;
  triggerData: Record<string, unknown>;
  status: 'running' | 'completed' | 'failed' | 'pending_approval' | 'rejected';
  result: string | null;
  actionsTaken: unknown[];
  approvalStatus: string;
  tokensUsed: number;
  executionTimeMs: number | null;
  errorMessage: string | null;
  createdAt: Date;
  completedAt: Date | null;
}

interface RunningAgentState {
  definition: AgentDefinition;
  actionsToday: number;
  tokensToday: number;
  lastRun: Date | null;
  dayStart: Date;
}

// ===========================================
// Agent Runtime
// ===========================================

class AgentRuntime {
  private agents: Map<string, RunningAgentState> = new Map();
  private started = false;

  /**
   * Initialize runtime: load all active agents from DB
   */
  async start(): Promise<void> {
    if (this.started) return;

    const contexts: AIContext[] = ['personal', 'work', 'learning', 'creative'];
    let totalLoaded = 0;

    for (const context of contexts) {
      try {
        const result = await queryContext(context, `
          SELECT * FROM agent_definitions WHERE status = 'active'
        `, []);

        for (const row of result.rows) {
          const def = this.rowToDefinition(row);
          this.agents.set(def.id, {
            definition: def,
            actionsToday: 0,
            tokensToday: 0,
            lastRun: null,
            dayStart: this.getTodayStart(),
          });
          totalLoaded++;
        }
      } catch {
        // Table may not exist yet - not an error during first deployment
        logger.debug('Agent definitions table not ready', { context });
      }
    }

    this.started = true;
    logger.info('Agent runtime started', { agentsLoaded: totalLoaded });
  }

  /**
   * Stop the runtime and clear all agent state
   */
  stop(): void {
    this.agents.clear();
    this.started = false;
    logger.info('Agent runtime stopped');
  }

  /**
   * Process an event: find matching agents and execute them
   */
  async processEvent(event: AgentEvent): Promise<AgentExecution[]> {
    const executions: AgentExecution[] = [];

    for (const [, state] of this.agents) {
      const def = state.definition;

      // Must be in same context
      if (def.context !== event.context) continue;

      // Must be active
      if (def.status !== 'active') continue;

      // Check if any trigger matches
      const matchingTrigger = def.triggers.find(t => t.type === event.type);
      if (!matchingTrigger) continue;

      // Check daily limits
      this.resetDailyCountersIfNeeded(state);
      if (state.actionsToday >= def.maxActionsPerDay) {
        logger.info('Agent daily action limit reached', { agentId: def.id, name: def.name });
        continue;
      }
      if (state.tokensToday >= def.tokenBudgetDaily) {
        logger.info('Agent daily token budget exhausted', { agentId: def.id, name: def.name });
        continue;
      }

      // Execute the agent
      try {
        const execution = await this.executeAgent(state, event, matchingTrigger);
        executions.push(execution);
      } catch (error) {
        logger.error('Agent execution failed', error instanceof Error ? error : undefined, {
          agentId: def.id,
          name: def.name,
          event: event.type,
        });
      }
    }

    return executions;
  }

  /**
   * Execute a single agent for an event
   */
  private async executeAgent(
    state: RunningAgentState,
    event: AgentEvent,
    trigger: AgentTrigger
  ): Promise<AgentExecution> {
    const def = state.definition;
    const executionId = uuidv4();
    const startTime = Date.now();

    logger.info('Agent executing', {
      agentId: def.id,
      name: def.name,
      triggerType: event.type,
    });

    // Create execution record
    await queryContext(def.context, `
      INSERT INTO agent_executions (id, agent_definition_id, trigger_type, trigger_data, status)
      VALUES ($1, $2, $3, $4, $5)
    `, [executionId, def.id, event.type, JSON.stringify(event.data), 'running']);

    // If approval required, set as pending and notify user
    if (def.approvalRequired) {
      await queryContext(def.context, `
        UPDATE agent_executions SET status = 'pending_approval', approval_status = 'pending'
        WHERE id = $1
      `, [executionId]);

      // Send push notification for approval
      sendNotification(def.context, {
        type: 'custom',
        title: `Agent "${def.name}" wartet auf Genehmigung`,
        body: `Trigger: ${event.type}. Tippen zum Pruefen.`,
        data: { executionId, agentId: def.id },
      }).catch(() => {/* non-critical */});

      return {
        id: executionId,
        agentDefinitionId: def.id,
        triggerType: event.type,
        triggerData: event.data,
        status: 'pending_approval',
        result: null,
        actionsTaken: [],
        approvalStatus: 'pending',
        tokensUsed: 0,
        executionTimeMs: Date.now() - startTime,
        errorMessage: null,
        createdAt: new Date(),
        completedAt: null,
      };
    }

    // Execute via the team task system
    let teamResult: TeamResult | undefined;
    let error: string | null = null;

    try {
      const taskDescription = this.buildTaskDescription(def, event);
      teamResult = await executeTeamTask({
        description: taskDescription,
        aiContext: def.context,
        strategy: 'research_only',
      });
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }

    const executionTimeMs = Date.now() - startTime;
    const tokensUsed = teamResult?.totalTokens
      ? teamResult.totalTokens.input + teamResult.totalTokens.output
      : 0;

    // Update counters
    state.actionsToday++;
    state.tokensToday += tokensUsed;
    state.lastRun = new Date();

    // Log actions
    const actionsTaken = teamResult?.agentResults.map(r => ({
      role: r.role,
      success: r.success,
      toolsUsed: r.toolsUsed,
    })) || [];

    // Update execution record
    const status = teamResult?.success ? 'completed' : 'failed';
    await queryContext(def.context, `
      UPDATE agent_executions
      SET status = $1, result = $2, actions_taken = $3, tokens_used = $4,
          execution_time_ms = $5, error_message = $6, completed_at = NOW()
      WHERE id = $7
    `, [
      status,
      teamResult?.finalOutput || null,
      JSON.stringify(actionsTaken),
      tokensUsed,
      executionTimeMs,
      error,
      executionId,
    ]);

    // Log individual actions
    for (const action of actionsTaken) {
      await queryContext(def.context, `
        INSERT INTO agent_action_log (agent_id, execution_id, action_type, action_input, action_output, success)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [
        def.id,
        executionId,
        action.role,
        JSON.stringify({ toolsUsed: action.toolsUsed }),
        JSON.stringify({ success: action.success }),
        action.success,
      ]);
    }

    logger.info('Agent execution complete', {
      agentId: def.id,
      name: def.name,
      status,
      tokensUsed,
      executionTimeMs,
    });

    return {
      id: executionId,
      agentDefinitionId: def.id,
      triggerType: event.type,
      triggerData: event.data,
      status,
      result: teamResult?.finalOutput || null,
      actionsTaken,
      approvalStatus: 'auto_approved',
      tokensUsed,
      executionTimeMs,
      errorMessage: error,
      createdAt: new Date(),
      completedAt: new Date(),
    };
  }

  /**
   * Approve a pending execution and run it
   */
  async approveExecution(context: AIContext, executionId: string): Promise<AgentExecution | null> {
    const result = await queryContext(context, `
      SELECT e.*, d.instructions, d.tools, d.name as agent_name
      FROM agent_executions e
      JOIN agent_definitions d ON d.id = e.agent_definition_id
      WHERE e.id = $1 AND e.approval_status = 'pending'
    `, [executionId]);

    if (result.rows.length === 0) return null;

    const row = result.rows[0];

    await queryContext(context, `
      UPDATE agent_executions
      SET approval_status = 'approved', approved_at = NOW(), status = 'running'
      WHERE id = $1
    `, [executionId]);

    // Execute the task
    const startTime = Date.now();
    let teamResult: TeamResult | undefined;
    let error: string | null = null;

    try {
      teamResult = await executeTeamTask({
        description: `[Agent: ${row.agent_name}] ${row.instructions}\n\nTrigger: ${row.trigger_type}\nDaten: ${JSON.stringify(row.trigger_data)}`,
        aiContext: context,
        strategy: 'research_only',
      });
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }

    const status = teamResult?.success ? 'completed' : 'failed';
    const tokensUsed = teamResult?.totalTokens
      ? teamResult.totalTokens.input + teamResult.totalTokens.output
      : 0;

    await queryContext(context, `
      UPDATE agent_executions
      SET status = $1, result = $2, tokens_used = $3,
          execution_time_ms = $4, error_message = $5, completed_at = NOW()
      WHERE id = $6
    `, [status, teamResult?.finalOutput || null, tokensUsed, Date.now() - startTime, error, executionId]);

    return {
      id: executionId,
      agentDefinitionId: row.agent_definition_id,
      triggerType: row.trigger_type,
      triggerData: row.trigger_data,
      status,
      result: teamResult?.finalOutput || null,
      actionsTaken: [],
      approvalStatus: 'approved',
      tokensUsed,
      executionTimeMs: Date.now() - startTime,
      errorMessage: error,
      createdAt: new Date(row.created_at),
      completedAt: new Date(),
    };
  }

  /**
   * Reject a pending execution
   */
  async rejectExecution(context: AIContext, executionId: string): Promise<boolean> {
    const result = await queryContext(context, `
      UPDATE agent_executions
      SET approval_status = 'rejected', status = 'rejected', completed_at = NOW()
      WHERE id = $1 AND approval_status = 'pending'
      RETURNING id
    `, [executionId]);

    return result.rows.length > 0;
  }

  // ===========================================
  // CRUD for Agent Definitions
  // ===========================================

  async createAgent(context: AIContext, data: {
    name: string;
    description?: string;
    instructions: string;
    triggers: AgentTrigger[];
    tools: string[];
    approvalRequired?: boolean;
    maxActionsPerDay?: number;
    tokenBudgetDaily?: number;
    templateId?: string;
  }): Promise<AgentDefinition> {
    const result = await queryContext(context, `
      INSERT INTO agent_definitions (name, description, instructions, triggers, tools, context,
        approval_required, max_actions_per_day, token_budget_daily, template_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `, [
      data.name,
      data.description || null,
      data.instructions,
      JSON.stringify(data.triggers),
      data.tools,
      context,
      data.approvalRequired ?? false,
      data.maxActionsPerDay ?? 50,
      data.tokenBudgetDaily ?? 100000,
      data.templateId || null,
    ]);

    const def = this.rowToDefinition(result.rows[0]);

    // Register in runtime
    this.agents.set(def.id, {
      definition: def,
      actionsToday: 0,
      tokensToday: 0,
      lastRun: null,
      dayStart: this.getTodayStart(),
    });

    logger.info('Agent created', { agentId: def.id, name: def.name, context });
    return def;
  }

  async getAgent(context: AIContext, agentId: string): Promise<AgentDefinition | null> {
    const result = await queryContext(context, `
      SELECT * FROM agent_definitions WHERE id = $1
    `, [agentId]);

    return result.rows.length > 0 ? this.rowToDefinition(result.rows[0]) : null;
  }

  async listAgents(context: AIContext): Promise<AgentDefinition[]> {
    const result = await queryContext(context, `
      SELECT * FROM agent_definitions ORDER BY created_at DESC
    `, []);

    return result.rows.map((r: Record<string, unknown>) => this.rowToDefinition(r));
  }

  async updateAgent(context: AIContext, agentId: string, data: Partial<{
    name: string;
    description: string;
    instructions: string;
    triggers: AgentTrigger[];
    tools: string[];
    approvalRequired: boolean;
    maxActionsPerDay: number;
    tokenBudgetDaily: number;
  }>): Promise<AgentDefinition | null> {
    const sets: string[] = [];
    const params: (string | number | boolean | null | string[])[] = [];
    let idx = 1;

    if (data.name !== undefined) { sets.push(`name = $${idx++}`); params.push(data.name); }
    if (data.description !== undefined) { sets.push(`description = $${idx++}`); params.push(data.description); }
    if (data.instructions !== undefined) { sets.push(`instructions = $${idx++}`); params.push(data.instructions); }
    if (data.triggers !== undefined) { sets.push(`triggers = $${idx++}`); params.push(JSON.stringify(data.triggers)); }
    if (data.tools !== undefined) { sets.push(`tools = $${idx++}`); params.push(data.tools); }
    if (data.approvalRequired !== undefined) { sets.push(`approval_required = $${idx++}`); params.push(data.approvalRequired); }
    if (data.maxActionsPerDay !== undefined) { sets.push(`max_actions_per_day = $${idx++}`); params.push(data.maxActionsPerDay); }
    if (data.tokenBudgetDaily !== undefined) { sets.push(`token_budget_daily = $${idx++}`); params.push(data.tokenBudgetDaily); }

    if (sets.length === 0) return this.getAgent(context, agentId);

    sets.push(`updated_at = NOW()`);
    params.push(agentId);

    const result = await queryContext(context, `
      UPDATE agent_definitions SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *
    `, params);

    if (result.rows.length === 0) return null;

    const def = this.rowToDefinition(result.rows[0]);

    // Update runtime state
    const state = this.agents.get(agentId);
    if (state) {
      state.definition = def;
    }

    return def;
  }

  async deleteAgent(context: AIContext, agentId: string): Promise<boolean> {
    const result = await queryContext(context, `
      DELETE FROM agent_definitions WHERE id = $1 RETURNING id
    `, [agentId]);

    if (result.rows.length > 0) {
      this.agents.delete(agentId);
      return true;
    }
    return false;
  }

  async startAgent(context: AIContext, agentId: string): Promise<boolean> {
    const result = await queryContext(context, `
      UPDATE agent_definitions SET status = 'active', updated_at = NOW()
      WHERE id = $1 RETURNING *
    `, [agentId]);

    if (result.rows.length === 0) return false;

    const def = this.rowToDefinition(result.rows[0]);
    this.agents.set(agentId, {
      definition: def,
      actionsToday: 0,
      tokensToday: 0,
      lastRun: null,
      dayStart: this.getTodayStart(),
    });

    return true;
  }

  async stopAgent(context: AIContext, agentId: string): Promise<boolean> {
    const result = await queryContext(context, `
      UPDATE agent_definitions SET status = 'stopped', updated_at = NOW()
      WHERE id = $1 RETURNING id
    `, [agentId]);

    if (result.rows.length > 0) {
      this.agents.delete(agentId);
      return true;
    }
    return false;
  }

  // ===========================================
  // Logs & Stats
  // ===========================================

  async getExecutionLogs(context: AIContext, agentId: string, limit = 20): Promise<AgentExecution[]> {
    const result = await queryContext(context, `
      SELECT * FROM agent_executions
      WHERE agent_definition_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `, [agentId, limit]);

    return result.rows.map((r: Record<string, unknown>) => this.rowToExecution(r));
  }

  async getAgentStats(context: AIContext, agentId: string): Promise<{
    totalRuns: number;
    successRate: number;
    totalTokens: number;
    avgExecutionMs: number;
    actionsToday: number;
    tokensToday: number;
  }> {
    const result = await queryContext(context, `
      SELECT
        COUNT(*) as total_runs,
        COUNT(*) FILTER (WHERE status = 'completed') as successful,
        COALESCE(SUM(tokens_used), 0) as total_tokens,
        COALESCE(AVG(execution_time_ms) FILTER (WHERE execution_time_ms > 0), 0) as avg_ms
      FROM agent_executions
      WHERE agent_definition_id = $1
    `, [agentId]);

    const row = result.rows[0];
    const state = this.agents.get(agentId);

    return {
      totalRuns: parseInt(row.total_runs) || 0,
      successRate: row.total_runs > 0 ? parseInt(row.successful) / parseInt(row.total_runs) : 0,
      totalTokens: parseInt(row.total_tokens) || 0,
      avgExecutionMs: Math.round(parseFloat(row.avg_ms) || 0),
      actionsToday: state?.actionsToday || 0,
      tokensToday: state?.tokensToday || 0,
    };
  }

  /**
   * List all running agents with their status
   */
  listRunning(): Array<{ id: string; name: string; context: AIContext; status: AgentStatus; actionsToday: number; lastRun: Date | null }> {
    return Array.from(this.agents.values()).map(state => ({
      id: state.definition.id,
      name: state.definition.name,
      context: state.definition.context,
      status: state.definition.status,
      actionsToday: state.actionsToday,
      lastRun: state.lastRun,
    }));
  }

  // ===========================================
  // Helpers
  // ===========================================

  private buildTaskDescription(def: AgentDefinition, event: AgentEvent): string {
    return `[Autonomer Agent: ${def.name}]

Anweisungen: ${def.instructions}

Trigger-Typ: ${event.type}
Trigger-Daten: ${JSON.stringify(event.data, null, 2)}

Fuehre die Anweisungen basierend auf dem Trigger aus. Antworte auf Deutsch.`;
  }

  private rowToDefinition(row: Record<string, unknown>): AgentDefinition {
    return {
      id: row.id as string,
      name: row.name as string,
      description: row.description as string | null,
      instructions: row.instructions as string,
      triggers: (typeof row.triggers === 'string' ? JSON.parse(row.triggers) : row.triggers) as AgentTrigger[],
      tools: row.tools as string[],
      context: row.context as AIContext,
      status: row.status as AgentStatus,
      approvalRequired: row.approval_required as boolean,
      maxActionsPerDay: row.max_actions_per_day as number,
      tokenBudgetDaily: row.token_budget_daily as number,
      templateId: row.template_id as string | null,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
    };
  }

  private rowToExecution(row: Record<string, unknown>): AgentExecution {
    return {
      id: row.id as string,
      agentDefinitionId: row.agent_definition_id as string,
      triggerType: row.trigger_type as string,
      triggerData: (typeof row.trigger_data === 'string' ? JSON.parse(row.trigger_data) : row.trigger_data) as Record<string, unknown>,
      status: row.status as AgentExecution['status'],
      result: row.result as string | null,
      actionsTaken: (typeof row.actions_taken === 'string' ? JSON.parse(row.actions_taken) : row.actions_taken) as unknown[],
      approvalStatus: row.approval_status as string,
      tokensUsed: row.tokens_used as number,
      executionTimeMs: row.execution_time_ms as number | null,
      errorMessage: row.error_message as string | null,
      createdAt: new Date(row.created_at as string),
      completedAt: row.completed_at ? new Date(row.completed_at as string) : null,
    };
  }

  private resetDailyCountersIfNeeded(state: RunningAgentState): void {
    const today = this.getTodayStart();
    if (state.dayStart.getTime() !== today.getTime()) {
      state.actionsToday = 0;
      state.tokensToday = 0;
      state.dayStart = today;
    }
  }

  private getTodayStart(): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }
}

// Singleton
export const agentRuntime = new AgentRuntime();
