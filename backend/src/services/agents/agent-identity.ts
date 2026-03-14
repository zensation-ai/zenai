/**
 * Phase 64: Agent Identity Service
 *
 * Manages agent identities with:
 * - Persona configuration (tone, expertise, style)
 * - Permission-based access control
 * - Trust levels + governance integration
 * - Execution stats tracking
 */

import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../utils/logger';

// ===========================================
// Types
// ===========================================

export interface AgentPersona {
  tone: string;
  expertise: string[];
  style: string;
  language: string;
  customInstructions?: string;
}

export interface AgentPermission {
  resource: string;
  actions: ('read' | 'write' | 'execute')[];
  conditions?: {
    maxCallsPerMinute?: number;
    requiresApproval?: boolean;
    allowedContexts?: string[];
  };
}

export interface AgentIdentity {
  id: string;
  name: string;
  role: string;
  persona: AgentPersona;
  model: string;
  permissions: AgentPermission[];
  maxTokenBudget: number;
  maxExecutionTimeMs: number;
  trustLevel: 'low' | 'medium' | 'high';
  governancePolicyId: string | null;
  memoryScope: string | null;
  createdBy: string | null;
  enabled: boolean;
  executionCount: number;
  successRate: number;
  createdAt: string;
  updatedAt: string;
}

export interface AgentAction {
  type: string;
  resource: string;
  impactLevel: 'low' | 'medium' | 'high';
  details?: Record<string, unknown>;
}

export interface ValidationResult {
  allowed: boolean;
  reason?: string;
  approvalId?: string;
}

// ===========================================
// Service
// ===========================================

class AgentIdentityService {
  /**
   * Create a new agent identity
   */
  async createIdentity(input: {
    name: string;
    role: string;
    persona?: Partial<AgentPersona>;
    model?: string;
    permissions?: AgentPermission[];
    maxTokenBudget?: number;
    maxExecutionTimeMs?: number;
    trustLevel?: 'low' | 'medium' | 'high';
    memoryScope?: string;
    createdBy?: string;
  }): Promise<AgentIdentity> {
    const id = uuidv4();
    const persona: AgentPersona = {
      tone: input.persona?.tone || 'professional',
      expertise: input.persona?.expertise || [],
      style: input.persona?.style || 'concise',
      language: input.persona?.language || 'de',
      customInstructions: input.persona?.customInstructions,
    };

    const { pool } = await import('../../utils/database-context');
    const result = await pool.query(`
      INSERT INTO public.agent_identities (id, name, role, persona, model, permissions, max_token_budget, max_execution_time_ms, trust_level, memory_scope, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `, [
      id,
      input.name,
      input.role,
      JSON.stringify(persona),
      input.model || 'claude-sonnet-4-20250514',
      JSON.stringify(input.permissions || []),
      input.maxTokenBudget || 10000,
      input.maxExecutionTimeMs || 120000,
      input.trustLevel || 'medium',
      input.memoryScope || null,
      input.createdBy || null,
    ]);

    return this.mapRow(result.rows[0]);
  }

  /**
   * Get an agent identity by ID
   */
  async getIdentity(id: string): Promise<AgentIdentity | null> {
    const { pool } = await import('../../utils/database-context');
    const result = await pool.query(
      'SELECT * FROM public.agent_identities WHERE id = $1', [id]
    );
    return result.rows.length > 0 ? this.mapRow(result.rows[0]) : null;
  }

  /**
   * List all agent identities
   */
  async listIdentities(filters?: { role?: string; enabled?: boolean }): Promise<AgentIdentity[]> {
    const { pool } = await import('../../utils/database-context');
    let sql = 'SELECT * FROM public.agent_identities WHERE 1=1';
    const params: unknown[] = [];

    if (filters?.role) {
      params.push(filters.role);
      sql += ` AND role = $${params.length}`;
    }
    if (filters?.enabled !== undefined) {
      params.push(filters.enabled);
      sql += ` AND enabled = $${params.length}`;
    }

    sql += ' ORDER BY created_at DESC';
    const result = await pool.query(sql, params);
    return result.rows.map((r: Record<string, unknown>) => this.mapRow(r));
  }

  /**
   * Update an agent identity
   */
  async updateIdentity(id: string, updates: Partial<{
    name: string;
    persona: Partial<AgentPersona>;
    model: string;
    permissions: AgentPermission[];
    maxTokenBudget: number;
    maxExecutionTimeMs: number;
    trustLevel: 'low' | 'medium' | 'high';
    enabled: boolean;
    memoryScope: string;
  }>): Promise<AgentIdentity | null> {
    const { pool } = await import('../../utils/database-context');
    const sets: string[] = ['updated_at = NOW()'];
    const params: unknown[] = [];

    if (updates.name) { params.push(updates.name); sets.push(`name = $${params.length}`); }
    if (updates.persona) { params.push(JSON.stringify(updates.persona)); sets.push(`persona = $${params.length}`); }
    if (updates.model) { params.push(updates.model); sets.push(`model = $${params.length}`); }
    if (updates.permissions) { params.push(JSON.stringify(updates.permissions)); sets.push(`permissions = $${params.length}`); }
    if (updates.maxTokenBudget) { params.push(updates.maxTokenBudget); sets.push(`max_token_budget = $${params.length}`); }
    if (updates.maxExecutionTimeMs) { params.push(updates.maxExecutionTimeMs); sets.push(`max_execution_time_ms = $${params.length}`); }
    if (updates.trustLevel) { params.push(updates.trustLevel); sets.push(`trust_level = $${params.length}`); }
    if (updates.enabled !== undefined) { params.push(updates.enabled); sets.push(`enabled = $${params.length}`); }
    if (updates.memoryScope) { params.push(updates.memoryScope); sets.push(`memory_scope = $${params.length}`); }

    params.push(id);
    const result = await pool.query(
      `UPDATE public.agent_identities SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    );
    return result.rows.length > 0 ? this.mapRow(result.rows[0]) : null;
  }

  /**
   * Delete an agent identity
   */
  async deleteIdentity(id: string): Promise<boolean> {
    const { pool } = await import('../../utils/database-context');
    const result = await pool.query('DELETE FROM public.agent_identities WHERE id = $1', [id]);
    return (result.rowCount || 0) > 0;
  }

  /**
   * Validate an action against agent permissions
   */
  async validateAction(agentId: string, action: AgentAction): Promise<ValidationResult> {
    const identity = await this.getIdentity(agentId);
    if (!identity) {
      return { allowed: false, reason: 'agent_not_found' };
    }
    if (!identity.enabled) {
      return { allowed: false, reason: 'agent_disabled' };
    }

    // 1. Permission check
    const hasPermission = this.checkPermission(identity, action);
    if (!hasPermission) {
      await this.logAction(agentId, action, 'denied');
      return { allowed: false, reason: 'insufficient_permissions' };
    }

    // 2. Rate limit check
    const withinLimits = await this.checkRateLimit(agentId, action, identity);
    if (!withinLimits) {
      await this.logAction(agentId, action, 'denied');
      return { allowed: false, reason: 'rate_limited' };
    }

    // 3. Trust level check for high-impact actions
    if (identity.trustLevel === 'low' && action.impactLevel === 'high') {
      await this.logAction(agentId, action, 'pending');
      return { allowed: false, reason: 'requires_approval' };
    }

    await this.logAction(agentId, action, 'allowed');
    return { allowed: true };
  }

  /**
   * Record execution result and update stats
   */
  async recordExecution(agentId: string, success: boolean): Promise<void> {
    const { pool } = await import('../../utils/database-context');
    await pool.query(`
      UPDATE public.agent_identities
      SET execution_count = execution_count + 1,
          success_rate = (success_rate * execution_count + $1) / (execution_count + 1),
          updated_at = NOW()
      WHERE id = $2
    `, [success ? 1.0 : 0.0, agentId]);
  }

  /**
   * Build system prompt with persona
   */
  buildPersonaPrompt(identity: AgentIdentity): string {
    const parts: string[] = [];

    parts.push(`You are ${identity.name}, a ${identity.role} agent.`);

    if (identity.persona.tone) {
      parts.push(`Communication tone: ${identity.persona.tone}`);
    }
    if (identity.persona.expertise.length > 0) {
      parts.push(`Areas of expertise: ${identity.persona.expertise.join(', ')}`);
    }
    if (identity.persona.style) {
      parts.push(`Response style: ${identity.persona.style}`);
    }
    if (identity.persona.language) {
      parts.push(`Primary language: ${identity.persona.language}`);
    }
    if (identity.persona.customInstructions) {
      parts.push(`\nSpecial instructions:\n${identity.persona.customInstructions}`);
    }

    return parts.join('\n');
  }

  /**
   * Check if agent has permission for action
   */
  private checkPermission(identity: AgentIdentity, action: AgentAction): boolean {
    for (const perm of identity.permissions) {
      const resourceMatch = perm.resource === '*' ||
        perm.resource === action.resource ||
        (perm.resource.endsWith('.*') && action.resource.startsWith(perm.resource.replace('.*', '')));

      if (resourceMatch && perm.actions.includes('execute')) {
        return true;
      }
    }

    // If no permissions defined, allow by default (backward compat)
    return identity.permissions.length === 0;
  }

  /**
   * Check rate limits for agent
   */
  private async checkRateLimit(agentId: string, action: AgentAction, identity: AgentIdentity): Promise<boolean> {
    let maxCallsPerMinute = 60;
    for (const perm of identity.permissions) {
      if (perm.conditions?.maxCallsPerMinute) {
        maxCallsPerMinute = perm.conditions.maxCallsPerMinute;
        break;
      }
    }

    const { pool } = await import('../../utils/database-context');
    const result = await pool.query(`
      SELECT COUNT(*) as cnt
      FROM public.agent_action_logs
      WHERE agent_id = $1 AND action_type = $2
        AND created_at > NOW() - INTERVAL '1 minute'
    `, [agentId, action.type]);

    return parseInt(result.rows[0]?.cnt || '0', 10) < maxCallsPerMinute;
  }

  /**
   * Log an action
   */
  private async logAction(agentId: string, action: AgentAction, result: 'allowed' | 'denied' | 'pending'): Promise<void> {
    try {
      const { pool } = await import('../../utils/database-context');
      await pool.query(`
        INSERT INTO public.agent_action_logs (id, agent_id, action_type, resource, result, details)
        VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)
      `, [agentId, action.type, action.resource, result, JSON.stringify(action.details || {})]);
    } catch (error) {
      logger.warn('Failed to log agent action', {
        operation: 'agent-identity',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Map DB row to AgentIdentity
   */
  private mapRow(row: Record<string, unknown>): AgentIdentity {
    return {
      id: row.id as string,
      name: row.name as string,
      role: row.role as string,
      persona: typeof row.persona === 'string' ? JSON.parse(row.persona as string) : (row.persona as AgentPersona || { tone: 'professional', expertise: [], style: 'concise', language: 'de' }),
      model: row.model as string,
      permissions: typeof row.permissions === 'string' ? JSON.parse(row.permissions as string) : (row.permissions as AgentPermission[] || []),
      maxTokenBudget: row.max_token_budget as number,
      maxExecutionTimeMs: row.max_execution_time_ms as number,
      trustLevel: row.trust_level as 'low' | 'medium' | 'high',
      governancePolicyId: row.governance_policy_id as string | null,
      memoryScope: row.memory_scope as string | null,
      createdBy: row.created_by as string | null,
      enabled: row.enabled as boolean,
      executionCount: row.execution_count as number,
      successRate: row.success_rate as number,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }
}

// ===========================================
// Singleton
// ===========================================

let instance: AgentIdentityService | null = null;

export function getAgentIdentityService(): AgentIdentityService {
  if (!instance) {
    instance = new AgentIdentityService();
  }
  return instance;
}

export function resetAgentIdentityService(): void {
  instance = null;
}
