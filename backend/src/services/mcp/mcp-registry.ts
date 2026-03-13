/**
 * MCP Server Registry - Phase 55
 *
 * Database CRUD for configured MCP server connections.
 * Stores server configurations with health status tracking.
 *
 * Uses queryContext for schema-aware database operations.
 */

import { AIContext, queryContext, QueryParam } from '../../utils/database-context';
import { logger } from '../../utils/logger';
import { MCPTransportType } from './mcp-transport';

// ===========================================
// Types
// ===========================================

export interface MCPServerRecord {
  id: string;
  name: string;
  transport: MCPTransportType;
  url: string | null;
  command: string | null;
  args: string[];
  envVars: Record<string, string>;
  authType: string | null;
  authConfig: Record<string, string>;
  enabled: boolean;
  healthStatus: 'healthy' | 'unhealthy' | 'unknown';
  lastHealthCheck: Date | null;
  toolCount: number;
  resourceCount: number;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MCPServerCreate {
  name: string;
  transport: MCPTransportType;
  url?: string;
  command?: string;
  args?: string[];
  envVars?: Record<string, string>;
  authType?: string;
  authConfig?: Record<string, string>;
  enabled?: boolean;
}

export interface MCPServerUpdate {
  name?: string;
  transport?: MCPTransportType;
  url?: string;
  command?: string;
  args?: string[];
  envVars?: Record<string, string>;
  authType?: string | null;
  authConfig?: Record<string, string>;
  enabled?: boolean;
}

export interface MCPExternalToolRecord {
  id: string;
  serverId: string;
  toolName: string;
  description: string | null;
  inputSchema: Record<string, unknown> | null;
  usageCount: number;
  avgLatencyMs: number;
  lastUsed: Date | null;
  createdAt: Date;
}

// ===========================================
// Registry
// ===========================================

class MCPServerRegistry {
  /**
   * Create a new MCP server connection record
   */
  async create(context: AIContext, data: MCPServerCreate): Promise<MCPServerRecord> {
    const result = await queryContext(context, `
      INSERT INTO mcp_server_connections
        (name, transport, url, command, args, env_vars, auth_type, auth_config, enabled)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [
      data.name,
      data.transport,
      data.url || null,
      data.command || null,
      JSON.stringify(data.args || []),
      JSON.stringify(data.envVars || {}),
      data.authType || null,
      JSON.stringify(data.authConfig || {}),
      data.enabled !== false,
    ]);

    logger.info('MCP server registered', { name: data.name, transport: data.transport });
    return this.rowToRecord(result.rows[0]);
  }

  /**
   * Get a server by ID
   */
  async getById(context: AIContext, id: string): Promise<MCPServerRecord | null> {
    const result = await queryContext(context, `
      SELECT * FROM mcp_server_connections WHERE id = $1
    `, [id]);

    return result.rows.length > 0 ? this.rowToRecord(result.rows[0]) : null;
  }

  /**
   * List all servers for a context
   */
  async list(context: AIContext, enabledOnly = false): Promise<MCPServerRecord[]> {
    const query = enabledOnly
      ? 'SELECT * FROM mcp_server_connections WHERE enabled = true ORDER BY created_at DESC'
      : 'SELECT * FROM mcp_server_connections ORDER BY created_at DESC';

    const result = await queryContext(context, query, []);
    return result.rows.map((r: Record<string, unknown>) => this.rowToRecord(r));
  }

  /**
   * Update a server configuration
   */
  async update(context: AIContext, id: string, data: MCPServerUpdate): Promise<MCPServerRecord | null> {
    const sets: string[] = [];
    const params: QueryParam[] = [];
    let idx = 1;

    if (data.name !== undefined) { sets.push(`name = $${idx++}`); params.push(data.name); }
    if (data.transport !== undefined) { sets.push(`transport = $${idx++}`); params.push(data.transport); }
    if (data.url !== undefined) { sets.push(`url = $${idx++}`); params.push(data.url || null); }
    if (data.command !== undefined) { sets.push(`command = $${idx++}`); params.push(data.command || null); }
    if (data.args !== undefined) { sets.push(`args = $${idx++}`); params.push(JSON.stringify(data.args)); }
    if (data.envVars !== undefined) { sets.push(`env_vars = $${idx++}`); params.push(JSON.stringify(data.envVars)); }
    if (data.authType !== undefined) { sets.push(`auth_type = $${idx++}`); params.push(data.authType); }
    if (data.authConfig !== undefined) { sets.push(`auth_config = $${idx++}`); params.push(JSON.stringify(data.authConfig)); }
    if (data.enabled !== undefined) { sets.push(`enabled = $${idx++}`); params.push(data.enabled); }

    if (sets.length === 0) return this.getById(context, id);

    sets.push('updated_at = NOW()');
    params.push(id);

    const result = await queryContext(context, `
      UPDATE mcp_server_connections SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *
    `, params);

    return result.rows.length > 0 ? this.rowToRecord(result.rows[0]) : null;
  }

  /**
   * Delete a server
   */
  async delete(context: AIContext, id: string): Promise<boolean> {
    const result = await queryContext(context, `
      DELETE FROM mcp_server_connections WHERE id = $1 RETURNING id
    `, [id]);
    return result.rows.length > 0;
  }

  /**
   * Update health status of a server
   */
  async updateHealthStatus(
    context: AIContext,
    id: string,
    status: 'healthy' | 'unhealthy' | 'unknown',
    toolCount: number,
    resourceCount: number,
    errorMessage: string | null
  ): Promise<void> {
    await queryContext(context, `
      UPDATE mcp_server_connections
      SET health_status = $1, tool_count = $2, resource_count = $3,
          last_health_check = NOW(), error_message = $4, updated_at = NOW()
      WHERE id = $5
    `, [status, toolCount, resourceCount, errorMessage, id]);
  }

  // ===========================================
  // External Tool Records
  // ===========================================

  /**
   * Sync discovered tools from a server
   */
  async syncTools(
    context: AIContext,
    serverId: string,
    tools: Array<{ name: string; description?: string; inputSchema?: Record<string, unknown> }>
  ): Promise<void> {
    // Delete existing tools for this server
    await queryContext(context, `
      DELETE FROM mcp_external_tools WHERE server_id = $1
    `, [serverId]);

    // Insert new tools
    for (const tool of tools) {
      await queryContext(context, `
        INSERT INTO mcp_external_tools (server_id, tool_name, description, input_schema)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (server_id, tool_name) DO UPDATE
          SET description = EXCLUDED.description, input_schema = EXCLUDED.input_schema
      `, [
        serverId,
        tool.name,
        tool.description || null,
        tool.inputSchema ? JSON.stringify(tool.inputSchema) : null,
      ]);
    }

    // Update tool count
    await queryContext(context, `
      UPDATE mcp_server_connections SET tool_count = $1, updated_at = NOW() WHERE id = $2
    `, [tools.length, serverId]);
  }

  /**
   * Get tools for a specific server
   */
  async getTools(context: AIContext, serverId: string): Promise<MCPExternalToolRecord[]> {
    const result = await queryContext(context, `
      SELECT * FROM mcp_external_tools WHERE server_id = $1 ORDER BY tool_name
    `, [serverId]);

    return result.rows.map((r: Record<string, unknown>) => this.toolRowToRecord(r));
  }

  /**
   * Record tool usage
   */
  async recordToolUsage(
    context: AIContext,
    serverId: string,
    toolName: string,
    latencyMs: number
  ): Promise<void> {
    await queryContext(context, `
      UPDATE mcp_external_tools
      SET usage_count = usage_count + 1,
          avg_latency_ms = (avg_latency_ms * usage_count + $1) / (usage_count + 1),
          last_used = NOW()
      WHERE server_id = $2 AND tool_name = $3
    `, [latencyMs, serverId, toolName]);
  }

  // ===========================================
  // Helpers
  // ===========================================

  private rowToRecord(row: Record<string, unknown>): MCPServerRecord {
    return {
      id: row.id as string,
      name: row.name as string,
      transport: row.transport as MCPTransportType,
      url: row.url as string | null,
      command: row.command as string | null,
      args: this.parseJsonArray(row.args),
      envVars: this.parseJsonObject(row.env_vars),
      authType: row.auth_type as string | null,
      authConfig: this.parseJsonObject(row.auth_config),
      enabled: row.enabled as boolean,
      healthStatus: (row.health_status as MCPServerRecord['healthStatus']) || 'unknown',
      lastHealthCheck: row.last_health_check ? new Date(row.last_health_check as string) : null,
      toolCount: (row.tool_count as number) || 0,
      resourceCount: (row.resource_count as number) || 0,
      errorMessage: row.error_message as string | null,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
    };
  }

  private toolRowToRecord(row: Record<string, unknown>): MCPExternalToolRecord {
    return {
      id: row.id as string,
      serverId: row.server_id as string,
      toolName: row.tool_name as string,
      description: row.description as string | null,
      inputSchema: row.input_schema ? this.parseJsonObject(row.input_schema) : null,
      usageCount: (row.usage_count as number) || 0,
      avgLatencyMs: (row.avg_latency_ms as number) || 0,
      lastUsed: row.last_used ? new Date(row.last_used as string) : null,
      createdAt: new Date(row.created_at as string),
    };
  }

  private parseJsonArray(val: unknown): string[] {
    if (Array.isArray(val)) return val as string[];
    if (typeof val === 'string') {
      try { return JSON.parse(val) as string[]; } catch { return []; }
    }
    return [];
  }

  private parseJsonObject(val: unknown): Record<string, string> {
    if (val && typeof val === 'object' && !Array.isArray(val)) return val as Record<string, string>;
    if (typeof val === 'string') {
      try { return JSON.parse(val) as Record<string, string>; } catch { return {}; }
    }
    return {};
  }
}

// Singleton
export const mcpServerRegistry = new MCPServerRegistry();
