/**
 * Phase 143: Blueprint Registry
 *
 * Unified registry for all agent blueprints — built-in, user-created,
 * NL-generated, and community. Backed by the `agent_blueprints` table
 * in the public schema, with activation tracked via `agent_definitions`
 * in context schemas.
 *
 * @module services/agents/blueprint-registry
 */

import { v4 as uuidv4 } from 'uuid';
import { BUILT_IN_AGENTS, type AgentCategory, type ConfigField } from './built-in-agents';
import { queryPublic, queryContext } from '../../utils/database';
import type { QueryParam } from '../../utils/database-context';
import type { AIContext } from '../../types';
import { logger } from '../../utils/logger';

// ── Types ────────────────────────────────────────────────────────────

export type BlueprintType = 'autonomous' | 'triggered' | 'scheduled' | 'hybrid';
export type BlueprintSource = 'built_in' | 'user' | 'nl_generated' | 'community';

export interface AgentBlueprint {
  id: string;
  name: string;
  description: string | null;
  icon: string;
  category: AgentCategory;
  tags: string[];
  type: BlueprintType;
  triggers: Array<{ type: string; config: Record<string, unknown> }>;
  maxActionsPerDay: number;
  tokenBudgetDaily: number;
  approvalRequired: boolean;
  strategy: string | null;
  pipeline: string[] | null;
  skipReview: boolean;
  tools: string[];
  instructions: string;
  defaultContext: string;
  configurable: ConfigField[];
  source: BlueprintSource;
  version: string;
  author: string | null;
  rating: number | null;
  usageCount: number;
  userId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateBlueprintInput {
  name: string;
  description?: string;
  icon?: string;
  category: AgentCategory;
  tags?: string[];
  type?: BlueprintType;
  triggers?: Array<{ type: string; config: Record<string, unknown> }>;
  maxActionsPerDay?: number;
  tokenBudgetDaily?: number;
  approvalRequired?: boolean;
  strategy?: string;
  pipeline?: string[];
  skipReview?: boolean;
  tools?: string[];
  instructions: string;
  defaultContext?: string;
  configurable?: ConfigField[];
  source?: BlueprintSource;
  version?: string;
  author?: string;
  userId?: string;
}

export interface BlueprintFilters {
  category?: AgentCategory;
  type?: BlueprintType;
  source?: BlueprintSource;
  search?: string;
  userId?: string;
  limit?: number;
  offset?: number;
}

// ── Helpers ──────────────────────────────────────────────────────────

function rowToBlueprint(row: Record<string, unknown>): AgentBlueprint {
  return {
    id: row.id as string,
    name: row.name as string,
    description: (row.description as string) ?? null,
    icon: (row.icon as string) ?? '🤖',
    category: row.category as AgentCategory,
    tags: (row.tags as string[]) ?? [],
    type: (row.type as BlueprintType) ?? 'triggered',
    triggers: (row.triggers as AgentBlueprint['triggers']) ?? [],
    maxActionsPerDay: (row.max_actions_per_day as number) ?? 10,
    tokenBudgetDaily: (row.token_budget_daily as number) ?? 20000,
    approvalRequired: (row.approval_required as boolean) ?? false,
    strategy: (row.strategy as string) ?? null,
    pipeline: (row.pipeline as string[]) ?? null,
    skipReview: (row.skip_review as boolean) ?? false,
    tools: (row.tools as string[]) ?? [],
    instructions: (row.instructions as string) ?? '',
    defaultContext: (row.default_context as string) ?? 'operations',
    configurable: (row.configurable as ConfigField[]) ?? [],
    source: (row.source as BlueprintSource) ?? 'user',
    version: (row.version as string) ?? '1.0.0',
    author: (row.author as string) ?? null,
    rating: (row.rating as number) ?? null,
    usageCount: (row.usage_count as number) ?? 0,
    userId: (row.user_id as string) ?? null,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

// ── Registry ─────────────────────────────────────────────────────────

export class BlueprintRegistry {
  /**
   * List blueprints with optional filtering, search, and pagination.
   */
  async listBlueprints(filters: BlueprintFilters = {}): Promise<AgentBlueprint[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (filters.category) {
      conditions.push(`category = $${idx++}`);
      params.push(filters.category);
    }
    if (filters.type) {
      conditions.push(`type = $${idx++}`);
      params.push(filters.type);
    }
    if (filters.source) {
      conditions.push(`source = $${idx++}`);
      params.push(filters.source);
    }
    if (filters.search) {
      conditions.push(`(name ILIKE $${idx} OR description ILIKE $${idx})`);
      params.push(`%${filters.search}%`);
      idx++;
    }
    if (filters.userId) {
      conditions.push(`user_id = $${idx++}`);
      params.push(filters.userId);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = filters.limit ?? 50;
    const offset = filters.offset ?? 0;

    const sql = `
      SELECT * FROM agent_blueprints
      ${where}
      ORDER BY usage_count DESC, created_at DESC
      LIMIT $${idx++} OFFSET $${idx++}
    `;
    params.push(limit, offset);

    const result = await queryPublic(sql, params as QueryParam[]);
    return result.rows.map(rowToBlueprint);
  }

  /**
   * Get a single blueprint by ID.
   */
  async getBlueprint(id: string): Promise<AgentBlueprint> {
    const result = await queryPublic(
      'SELECT * FROM agent_blueprints WHERE id = $1',
      [id],
    );
    if (result.rows.length === 0) {
      throw new Error(`Blueprint not found: ${id}`);
    }
    return rowToBlueprint(result.rows[0]);
  }

  /**
   * Create a new blueprint and return it.
   */
  async createBlueprint(input: CreateBlueprintInput): Promise<AgentBlueprint> {
    const id = uuidv4();
    const now = new Date().toISOString();

    const result = await queryPublic(
      `INSERT INTO agent_blueprints (
        id, name, description, icon, category, tags, type,
        triggers, max_actions_per_day, token_budget_daily,
        approval_required, strategy, pipeline, skip_review,
        tools, instructions, default_context, configurable,
        source, version, author, user_id, usage_count,
        created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10,
        $11, $12, $13, $14,
        $15, $16, $17, $18,
        $19, $20, $21, $22, $23,
        $24, $25
      ) RETURNING *`,
      [
        id,
        input.name,
        input.description ?? null,
        input.icon ?? '🤖',
        input.category,
        input.tags ?? [],
        input.type ?? 'triggered',
        JSON.stringify(input.triggers ?? []),
        input.maxActionsPerDay ?? 10,
        input.tokenBudgetDaily ?? 20000,
        input.approvalRequired ?? false,
        input.strategy ?? null,
        input.pipeline ?? null,
        input.skipReview ?? false,
        input.tools ?? [],
        input.instructions,
        input.defaultContext ?? 'operations',
        JSON.stringify(input.configurable ?? []),
        input.source ?? 'user',
        input.version ?? '1.0.0',
        input.author ?? null,
        input.userId ?? null,
        0,
        now,
        now,
      ],
    );

    return rowToBlueprint(result.rows[0]);
  }

  /**
   * Update an existing blueprint. Builds SET clauses dynamically.
   */
  async updateBlueprint(id: string, data: Partial<CreateBlueprintInput>): Promise<AgentBlueprint> {
    const fieldMap: Record<string, unknown> = {
      name: data.name,
      description: data.description,
      icon: data.icon,
      category: data.category,
      tags: data.tags,
      type: data.type,
      max_actions_per_day: data.maxActionsPerDay,
      token_budget_daily: data.tokenBudgetDaily,
      approval_required: data.approvalRequired,
      strategy: data.strategy,
      pipeline: data.pipeline,
      skip_review: data.skipReview,
      tools: data.tools,
      instructions: data.instructions,
      default_context: data.defaultContext,
      source: data.source,
      version: data.version,
      author: data.author,
      user_id: data.userId,
    };

    const setClauses: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    // Scalar / array fields
    for (const [col, val] of Object.entries(fieldMap)) {
      if (val !== undefined) {
        setClauses.push(`${col} = $${idx++}`);
        params.push(val);
      }
    }

    // JSONB fields need JSON.stringify
    if (data.triggers !== undefined) {
      setClauses.push(`triggers = $${idx++}`);
      params.push(JSON.stringify(data.triggers));
    }
    if (data.configurable !== undefined) {
      setClauses.push(`configurable = $${idx++}`);
      params.push(JSON.stringify(data.configurable));
    }

    if (setClauses.length === 0) {
      return this.getBlueprint(id);
    }

    setClauses.push(`updated_at = $${idx++}`);
    params.push(new Date().toISOString());
    params.push(id);

    const sql = `
      UPDATE agent_blueprints
      SET ${setClauses.join(', ')}
      WHERE id = $${idx}
      RETURNING *
    `;

    const result = await queryPublic(sql, params as QueryParam[]);
    if (result.rows.length === 0) {
      throw new Error(`Blueprint not found: ${id}`);
    }
    return rowToBlueprint(result.rows[0]);
  }

  /**
   * Delete a blueprint. Built-in blueprints cannot be deleted.
   */
  async deleteBlueprint(id: string): Promise<void> {
    const bp = await this.getBlueprint(id);
    if (bp.source === 'built_in') {
      throw new Error('Cannot delete built-in blueprints');
    }
    await queryPublic('DELETE FROM agent_blueprints WHERE id = $1', [id]);
  }

  /**
   * Activate a blueprint in a specific context.
   * Creates (or re-activates) an agent_definition row linked to this blueprint.
   */
  async activateBlueprint(
    id: string,
    context: string | AIContext,
    config?: Record<string, unknown>,
  ): Promise<{ id: string; name: string; status: string; blueprintId: string }> {
    const bp = await this.getBlueprint(id);

    // Check for existing definition tied to this blueprint
    const existing = await queryContext(
      context as AIContext,
      'SELECT id, status FROM agent_definitions WHERE blueprint_id = $1 LIMIT 1',
      [id],
    );

    if (existing.rows.length > 0) {
      // Re-activate
      const defId = existing.rows[0].id as string;
      await queryContext(
        context as AIContext,
        `UPDATE agent_definitions SET status = 'active', updated_at = NOW() WHERE id = $1`,
        [defId],
      );
      logger.info('Re-activated agent definition', { blueprintId: id, definitionId: defId });
      return { id: defId, name: bp.name, status: 'active', blueprintId: id };
    }

    // Create new definition
    const defId = uuidv4();
    await queryContext(
      context as AIContext,
      `INSERT INTO agent_definitions (
        id, name, description, instructions, triggers, tools, context,
        status, approval_required, max_actions_per_day, token_budget_daily,
        blueprint_id, config, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW())`,
      [
        defId,
        bp.name,
        bp.description,
        bp.instructions,
        JSON.stringify(bp.triggers),
        bp.tools,
        context,
        'active',
        bp.approvalRequired,
        bp.maxActionsPerDay,
        bp.tokenBudgetDaily,
        id,
        config ? JSON.stringify(config) : '{}',
      ],
    );

    // Increment usage count
    await queryPublic(
      'UPDATE agent_blueprints SET usage_count = usage_count + 1 WHERE id = $1',
      [id],
    );

    logger.info('Activated blueprint', { blueprintId: id, definitionId: defId, context: context as AIContext });
    return { id: defId, name: bp.name, status: 'active', blueprintId: id };
  }

  /**
   * Deactivate a blueprint in a specific context.
   * Sets the linked agent_definition status to 'stopped'.
   */
  async deactivateBlueprint(id: string, context: string | AIContext): Promise<void> {
    const existing = await queryContext(
      context as AIContext,
      'SELECT id FROM agent_definitions WHERE blueprint_id = $1 LIMIT 1',
      [id],
    );

    if (existing.rows.length === 0) {
      logger.debug('No active definition found for blueprint', { blueprintId: id, context: context as AIContext });
      return;
    }

    await queryContext(
      context as AIContext,
      `UPDATE agent_definitions SET status = 'stopped', updated_at = NOW() WHERE id = $1`,
      [existing.rows[0].id],
    );
    logger.info('Deactivated blueprint', { blueprintId: id, context: context as AIContext });
  }

  /**
   * Upsert all 8 built-in agents as blueprints.
   * Uses ON CONFLICT to keep user customizations (rating, usage_count) intact.
   */
  async registerBuiltIns(): Promise<void> {
    const now = new Date().toISOString();

    for (const agent of BUILT_IN_AGENTS) {
      await queryPublic(
        `INSERT INTO agent_blueprints (
          id, name, description, icon, category, tags, type,
          triggers, max_actions_per_day, token_budget_daily,
          approval_required, strategy, pipeline, skip_review,
          tools, instructions, default_context, configurable,
          source, version, author, usage_count,
          created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7,
          $8, $9, $10,
          $11, $12, $13, $14,
          $15, $16, $17, $18,
          $19, $20, $21, $22,
          $23, $24
        )
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          description = EXCLUDED.description,
          icon = EXCLUDED.icon,
          category = EXCLUDED.category,
          tags = EXCLUDED.tags,
          triggers = EXCLUDED.triggers,
          max_actions_per_day = EXCLUDED.max_actions_per_day,
          token_budget_daily = EXCLUDED.token_budget_daily,
          approval_required = EXCLUDED.approval_required,
          tools = EXCLUDED.tools,
          instructions = EXCLUDED.instructions,
          default_context = EXCLUDED.default_context,
          configurable = EXCLUDED.configurable,
          version = EXCLUDED.version,
          updated_at = EXCLUDED.updated_at`,
        [
          agent.id,
          agent.name,
          agent.description,
          agent.icon,
          agent.category,
          agent.tags,
          'triggered',
          JSON.stringify(agent.triggers),
          agent.maxActionsPerDay,
          agent.tokenBudgetDaily,
          agent.approvalRequired,
          null, // strategy
          null, // pipeline
          false, // skipReview
          agent.tools,
          agent.instructions,
          agent.defaultContext,
          JSON.stringify(agent.configurable),
          'built_in',
          '1.0.0',
          'ZenAI',
          0,
          now,
          now,
        ],
      );
    }

    logger.info('Registered built-in agent blueprints', { count: BUILT_IN_AGENTS.length });
  }
}

export const blueprintRegistry = new BlueprintRegistry();
