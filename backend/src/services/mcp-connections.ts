/**
 * MCP Connection Manager - Phase 44
 *
 * Manages connections to external MCP servers.
 * Stores connection configs in the database, handles lifecycle,
 * and provides a unified interface for discovering/calling tools
 * across all connected MCP servers.
 *
 * Features:
 * - CRUD for MCP server connections
 * - Connection health monitoring
 * - Unified tool discovery across all connected servers
 * - Tool name prefixing to avoid collisions (server_name.tool_name)
 * - Connection status tracking
 */

import { v4 as uuidv4 } from 'uuid';
import { AIContext, queryContext } from '../utils/database-context';
import { logger } from '../utils/logger';
import {
  MCPClient,
  MCPExternalTool,
  MCPExternalResource,
  MCPToolResult,
  createMCPClient,
} from './mcp-client';

// ===========================================
// Types
// ===========================================

export type MCPConnectionStatus = 'connected' | 'disconnected' | 'error' | 'pending';

export interface MCPConnection {
  id: string;
  name: string;
  url: string;
  apiKey: string | null;
  status: MCPConnectionStatus;
  toolCount: number;
  resourceCount: number;
  lastHealthCheck: Date | null;
  errorMessage: string | null;
  context: AIContext;
  enabled: boolean;
  headers: Record<string, string> | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MCPConnectionCreate {
  name: string;
  url: string;
  apiKey?: string;
  headers?: Record<string, string>;
  enabled?: boolean;
}

export interface MCPUnifiedTool {
  /** Prefixed name: connectionId:toolName */
  qualifiedName: string;
  /** Original tool name on the remote server */
  originalName: string;
  /** Connection this tool belongs to */
  connectionId: string;
  connectionName: string;
  /** Tool metadata */
  tool: MCPExternalTool;
}

// ===========================================
// Connection Manager
// ===========================================

class MCPConnectionManager {
  private clients: Map<string, MCPClient> = new Map();
  private connections: Map<string, MCPConnection> = new Map();

  /**
   * Initialize: load all enabled connections from DB and connect
   */
  async initialize(context: AIContext): Promise<void> {
    try {
      const result = await queryContext(context, `
        SELECT * FROM mcp_connections WHERE enabled = true
      `, []);

      for (const row of result.rows) {
        const conn = this.rowToConnection(row);
        this.connections.set(conn.id, conn);

        const client = createMCPClient({
          id: conn.id,
          name: conn.name,
          url: conn.url,
          apiKey: conn.apiKey || undefined,
          headers: conn.headers || undefined,
        });

        this.clients.set(conn.id, client);

        // Non-blocking health check
        this.checkConnection(context, conn.id).catch(() => {
          logger.debug('MCP connection health check failed on init', { id: conn.id, name: conn.name });
        });
      }

      logger.info('MCP Connection Manager initialized', {
        context,
        connectionsLoaded: result.rows.length,
      });
    } catch {
      // Table may not exist yet
      logger.debug('MCP connections table not ready', { context });
    }
  }

  // ===========================================
  // CRUD Operations
  // ===========================================

  /**
   * Create a new MCP server connection
   */
  async createConnection(context: AIContext, data: MCPConnectionCreate): Promise<MCPConnection> {
    const id = uuidv4();

    const result = await queryContext(context, `
      INSERT INTO mcp_connections (id, name, url, api_key, status, enabled, headers, context)
      VALUES ($1, $2, $3, $4, 'pending', $5, $6, $7)
      RETURNING *
    `, [
      id,
      data.name,
      data.url,
      data.apiKey || null,
      data.enabled !== false,
      data.headers ? JSON.stringify(data.headers) : null,
      context,
    ]);

    const conn = this.rowToConnection(result.rows[0]);
    this.connections.set(conn.id, conn);

    // Create and store client
    const client = createMCPClient({
      id: conn.id,
      name: conn.name,
      url: conn.url,
      apiKey: conn.apiKey || undefined,
      headers: conn.headers || undefined,
    });
    this.clients.set(conn.id, client);

    // Test connection in background
    this.checkConnection(context, conn.id).catch((err) => logger.debug('Non-critical: MCP connection health check failed', { error: err, connId: conn.id }));

    logger.info('MCP connection created', { id: conn.id, name: conn.name, url: conn.url });
    return conn;
  }

  /**
   * Get a connection by ID
   */
  async getConnection(context: AIContext, connectionId: string): Promise<MCPConnection | null> {
    const result = await queryContext(context, `
      SELECT * FROM mcp_connections WHERE id = $1
    `, [connectionId]);

    return result.rows.length > 0 ? this.rowToConnection(result.rows[0]) : null;
  }

  /**
   * List all connections for a context
   */
  async listConnections(context: AIContext): Promise<MCPConnection[]> {
    const result = await queryContext(context, `
      SELECT * FROM mcp_connections ORDER BY created_at DESC
    `, []);

    return result.rows.map((r: Record<string, unknown>) => this.rowToConnection(r));
  }

  /**
   * Update a connection
   */
  async updateConnection(context: AIContext, connectionId: string, data: Partial<MCPConnectionCreate & { enabled: boolean }>): Promise<MCPConnection | null> {
    const sets: string[] = [];
    const params: (string | boolean | null)[] = [];
    let idx = 1;

    if (data.name !== undefined) { sets.push(`name = $${idx++}`); params.push(data.name); }
    if (data.url !== undefined) { sets.push(`url = $${idx++}`); params.push(data.url); }
    if (data.apiKey !== undefined) { sets.push(`api_key = $${idx++}`); params.push(data.apiKey || null); }
    if (data.headers !== undefined) { sets.push(`headers = $${idx++}`); params.push(data.headers ? JSON.stringify(data.headers) : null); }
    if (data.enabled !== undefined) { sets.push(`enabled = $${idx++}`); params.push(data.enabled); }

    if (sets.length === 0) {return this.getConnection(context, connectionId);}

    sets.push('updated_at = NOW()');
    params.push(connectionId);

    const result = await queryContext(context, `
      UPDATE mcp_connections SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *
    `, params);

    if (result.rows.length === 0) {return null;}

    const conn = this.rowToConnection(result.rows[0]);
    this.connections.set(conn.id, conn);

    // Recreate client with updated config
    const client = createMCPClient({
      id: conn.id,
      name: conn.name,
      url: conn.url,
      apiKey: conn.apiKey || undefined,
      headers: conn.headers || undefined,
    });
    this.clients.set(conn.id, client);

    // Re-check connection if URL changed
    if (data.url) {
      this.checkConnection(context, conn.id).catch((err) => logger.debug('Non-critical: MCP connection health check failed', { error: err, connId: conn.id }));
    }

    return conn;
  }

  /**
   * Delete a connection
   */
  async deleteConnection(context: AIContext, connectionId: string): Promise<boolean> {
    const result = await queryContext(context, `
      DELETE FROM mcp_connections WHERE id = $1 RETURNING id
    `, [connectionId]);

    if (result.rows.length > 0) {
      this.clients.delete(connectionId);
      this.connections.delete(connectionId);
      return true;
    }
    return false;
  }

  // ===========================================
  // Health Check
  // ===========================================

  /**
   * Check connection health and update status
   */
  async checkConnection(context: AIContext, connectionId: string): Promise<MCPConnection | null> {
    const client = this.clients.get(connectionId);
    if (!client) {return null;}

    let status: MCPConnectionStatus = 'disconnected';
    let toolCount = 0;
    let resourceCount = 0;
    let errorMessage: string | null = null;

    try {
      const healthy = await client.healthCheck();
      if (healthy) {
        status = 'connected';
        const tools = await client.listTools();
        const resources = await client.listResources();
        toolCount = tools.length;
        resourceCount = resources.length;
      } else {
        status = 'error';
        errorMessage = 'Health check failed';
      }
    } catch (error) {
      status = 'error';
      errorMessage = error instanceof Error ? error.message : 'Unknown error';
    }

    await queryContext(context, `
      UPDATE mcp_connections
      SET status = $1, tool_count = $2, resource_count = $3,
          last_health_check = NOW(), error_message = $4, updated_at = NOW()
      WHERE id = $5
    `, [status, toolCount, resourceCount, errorMessage, connectionId]);

    const conn = await this.getConnection(context, connectionId);
    if (conn) {
      this.connections.set(conn.id, conn);
    }

    return conn;
  }

  // ===========================================
  // Unified Tool Discovery
  // ===========================================

  /**
   * Get all tools across all connected MCP servers
   */
  async getAllTools(context: AIContext): Promise<MCPUnifiedTool[]> {
    const unified: MCPUnifiedTool[] = [];
    const connections = await this.listConnections(context);

    for (const conn of connections) {
      if (!conn.enabled || conn.status !== 'connected') {continue;}

      const client = this.clients.get(conn.id);
      if (!client) {continue;}

      try {
        const tools = await client.listTools();
        for (const tool of tools) {
          unified.push({
            qualifiedName: `${conn.id}:${tool.name}`,
            originalName: tool.name,
            connectionId: conn.id,
            connectionName: conn.name,
            tool,
          });
        }
      } catch (error) {
        logger.debug('Failed to list tools from MCP server', {
          connectionId: conn.id,
          name: conn.name,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return unified;
  }

  /**
   * Call a tool on a specific connection
   */
  async callTool(connectionId: string, toolName: string, args: Record<string, unknown>): Promise<MCPToolResult> {
    const client = this.clients.get(connectionId);
    if (!client) {
      throw new Error(`MCP connection not found: ${connectionId}`);
    }

    logger.info('MCP tool call', { connectionId, toolName });

    const startTime = Date.now();
    try {
      const result = await client.callTool(toolName, args);
      logger.info('MCP tool call completed', {
        connectionId,
        toolName,
        durationMs: Date.now() - startTime,
        isError: result.isError,
      });
      return result;
    } catch (error) {
      logger.error('MCP tool call failed', error instanceof Error ? error : undefined, {
        connectionId,
        toolName,
        durationMs: Date.now() - startTime,
      });
      throw error;
    }
  }

  /**
   * Get all resources across all connected MCP servers
   */
  async getAllResources(context: AIContext): Promise<Array<MCPExternalResource & { connectionId: string; connectionName: string }>> {
    const all: Array<MCPExternalResource & { connectionId: string; connectionName: string }> = [];
    const connections = await this.listConnections(context);

    for (const conn of connections) {
      if (!conn.enabled || conn.status !== 'connected') {continue;}

      const client = this.clients.get(conn.id);
      if (!client) {continue;}

      try {
        const resources = await client.listResources();
        for (const resource of resources) {
          all.push({ ...resource, connectionId: conn.id, connectionName: conn.name });
        }
      } catch {
        // Skip unavailable servers
      }
    }

    return all;
  }

  /**
   * Read a resource from a specific connection
   */
  async readResource(connectionId: string, uri: string): Promise<{ contents: Array<{ uri: string; mimeType: string; text: string }> }> {
    const client = this.clients.get(connectionId);
    if (!client) {
      throw new Error(`MCP connection not found: ${connectionId}`);
    }

    return client.readResource(uri);
  }

  // ===========================================
  // Helpers
  // ===========================================

  private rowToConnection(row: Record<string, unknown>): MCPConnection {
    return {
      id: row.id as string,
      name: row.name as string,
      url: row.url as string,
      apiKey: row.api_key as string | null,
      status: row.status as MCPConnectionStatus,
      toolCount: (row.tool_count as number) || 0,
      resourceCount: (row.resource_count as number) || 0,
      lastHealthCheck: row.last_health_check ? new Date(row.last_health_check as string) : null,
      errorMessage: row.error_message as string | null,
      context: row.context as AIContext,
      enabled: row.enabled as boolean,
      headers: row.headers ? (typeof row.headers === 'string' ? JSON.parse(row.headers) : row.headers) as Record<string, string> : null,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
    };
  }
}

// Singleton
export const mcpConnectionManager = new MCPConnectionManager();
