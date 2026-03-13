/**
 * MCP Client Manager - Phase 55
 *
 * Manages connections to external MCP servers using a transport abstraction.
 * Supports multiple concurrent connections with health monitoring.
 *
 * Features:
 * - Connect/disconnect to external MCP servers
 * - Sync discovered tools into ZenAI's tool registry
 * - List and read resources from external servers
 * - Periodic health checks
 * - Transport-agnostic (HTTP, stdio, SSE)
 */

import { logger } from '../../utils/logger';
import { createTransport, IMCPTransport, MCPTransportConfig, MCPTransportResult } from './mcp-transport';

// ===========================================
// Types
// ===========================================

export interface MCPServerConfig {
  id: string;
  name: string;
  transport: MCPTransportConfig;
  enabled: boolean;
  healthCheckInterval?: number;
}

export interface MCPExternalTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface MCPExternalResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface MCPToolCallResult {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

export interface MCPResourceReadResult {
  contents: Array<{ uri: string; mimeType: string; text: string }>;
}

export interface MCPServerStatus {
  id: string;
  name: string;
  connected: boolean;
  healthy: boolean;
  toolCount: number;
  resourceCount: number;
  lastHealthCheck: Date | null;
  error: string | null;
}

// ===========================================
// MCP Client (single server connection)
// ===========================================

export class MCPClientInstance {
  private transport: IMCPTransport;
  private config: MCPServerConfig;
  private cachedTools: MCPExternalTool[] | null = null;
  private cachedResources: MCPExternalResource[] | null = null;
  private lastHealthCheck: Date | null = null;
  private healthy = false;
  private lastError: string | null = null;

  constructor(config: MCPServerConfig) {
    this.config = config;
    this.transport = createTransport(config.transport);
  }

  get id(): string { return this.config.id; }
  get name(): string { return this.config.name; }
  get isHealthy(): boolean { return this.healthy; }
  get isConnected(): boolean { return this.transport.isConnected(); }

  /**
   * Initialize connection by sending initialize request
   */
  async connect(): Promise<void> {
    try {
      await this.transport.request('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'zenai-client', version: '1.0.0' },
      });
      this.healthy = true;
      this.lastError = null;
      logger.info('MCP client connected', { id: this.config.id, name: this.config.name });
    } catch (error) {
      this.healthy = false;
      this.lastError = error instanceof Error ? error.message : String(error);
      logger.error('MCP client connection failed', error instanceof Error ? error : undefined, {
        id: this.config.id,
        name: this.config.name,
      });
      throw error;
    }
  }

  /**
   * Disconnect from the server
   */
  async disconnect(): Promise<void> {
    await this.transport.close();
    this.healthy = false;
    this.cachedTools = null;
    this.cachedResources = null;
    logger.info('MCP client disconnected', { id: this.config.id, name: this.config.name });
  }

  /**
   * List tools exposed by the remote server
   */
  async listTools(useCache = true): Promise<MCPExternalTool[]> {
    if (useCache && this.cachedTools) return this.cachedTools;

    const result = await this.transport.request('tools/list');
    const tools = (result.tools as MCPExternalTool[]) || [];
    this.cachedTools = tools;
    return tools;
  }

  /**
   * Call a tool on the remote server
   */
  async callTool(name: string, args: Record<string, unknown>): Promise<MCPToolCallResult> {
    const result = await this.transport.request('tools/call', {
      name,
      arguments: args,
    });
    return {
      content: (result.content as MCPToolCallResult['content']) || [{ type: 'text', text: 'No response' }],
      isError: result.isError as boolean | undefined,
    };
  }

  /**
   * List resources exposed by the remote server
   */
  async listResources(useCache = true): Promise<MCPExternalResource[]> {
    if (useCache && this.cachedResources) return this.cachedResources;

    const result = await this.transport.request('resources/list');
    const resources = (result.resources as MCPExternalResource[]) || [];
    this.cachedResources = resources;
    return resources;
  }

  /**
   * Read a resource from the remote server
   */
  async readResource(uri: string): Promise<MCPResourceReadResult> {
    const result = await this.transport.request('resources/read', { uri });
    return {
      contents: (result.contents as MCPResourceReadResult['contents']) || [],
    };
  }

  /**
   * List prompts exposed by the remote server
   */
  async listPrompts(): Promise<MCPTransportResult['prompts']> {
    const result = await this.transport.request('prompts/list');
    return result.prompts || [];
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.listTools(false);
      this.healthy = true;
      this.lastError = null;
      this.lastHealthCheck = new Date();
      return true;
    } catch (error) {
      this.healthy = false;
      this.lastError = error instanceof Error ? error.message : String(error);
      this.lastHealthCheck = new Date();
      return false;
    }
  }

  /**
   * Get current status
   */
  getStatus(): MCPServerStatus {
    return {
      id: this.config.id,
      name: this.config.name,
      connected: this.transport.isConnected(),
      healthy: this.healthy,
      toolCount: this.cachedTools?.length || 0,
      resourceCount: this.cachedResources?.length || 0,
      lastHealthCheck: this.lastHealthCheck,
      error: this.lastError,
    };
  }

  /**
   * Clear cached data
   */
  clearCache(): void {
    this.cachedTools = null;
    this.cachedResources = null;
  }
}

// ===========================================
// MCP Client Manager (manages all connections)
// ===========================================

export class MCPClientManager {
  private clients: Map<string, MCPClientInstance> = new Map();
  private healthCheckIntervals: Map<string, ReturnType<typeof setInterval>> = new Map();

  /**
   * Connect to an external MCP server
   */
  async connect(config: MCPServerConfig): Promise<MCPServerStatus> {
    // Disconnect existing connection if present
    if (this.clients.has(config.id)) {
      await this.disconnect(config.id);
    }

    const client = new MCPClientInstance(config);

    try {
      await client.connect();
      this.clients.set(config.id, client);

      // Start health check interval if configured
      if (config.healthCheckInterval && config.healthCheckInterval > 0) {
        this.startHealthCheck(config.id, config.healthCheckInterval);
      }

      return client.getStatus();
    } catch (error) {
      // Store client even on failure so we can retry
      this.clients.set(config.id, client);
      return client.getStatus();
    }
  }

  /**
   * Disconnect from an external MCP server
   */
  async disconnect(serverId: string): Promise<void> {
    const client = this.clients.get(serverId);
    if (client) {
      await client.disconnect();
      this.clients.delete(serverId);
    }

    // Clear health check interval
    const interval = this.healthCheckIntervals.get(serverId);
    if (interval) {
      clearInterval(interval);
      this.healthCheckIntervals.delete(serverId);
    }
  }

  /**
   * Get a client instance by server ID
   */
  getClient(serverId: string): MCPClientInstance | undefined {
    return this.clients.get(serverId);
  }

  /**
   * List tools from a specific server
   */
  async listTools(serverId: string): Promise<MCPExternalTool[]> {
    const client = this.clients.get(serverId);
    if (!client) throw new Error(`MCP server not connected: ${serverId}`);
    return client.listTools();
  }

  /**
   * Call a tool on a specific server
   */
  async callTool(serverId: string, toolName: string, args: Record<string, unknown>): Promise<MCPToolCallResult> {
    const client = this.clients.get(serverId);
    if (!client) throw new Error(`MCP server not connected: ${serverId}`);
    return client.callTool(toolName, args);
  }

  /**
   * List resources from a specific server
   */
  async listResources(serverId: string): Promise<MCPExternalResource[]> {
    const client = this.clients.get(serverId);
    if (!client) throw new Error(`MCP server not connected: ${serverId}`);
    return client.listResources();
  }

  /**
   * Read a resource from a specific server
   */
  async readResource(serverId: string, uri: string): Promise<MCPResourceReadResult> {
    const client = this.clients.get(serverId);
    if (!client) throw new Error(`MCP server not connected: ${serverId}`);
    return client.readResource(uri);
  }

  /**
   * Health check a specific server
   */
  async healthCheck(serverId: string): Promise<boolean> {
    const client = this.clients.get(serverId);
    if (!client) return false;
    return client.healthCheck();
  }

  /**
   * Get all connected server statuses
   */
  getAllStatuses(): MCPServerStatus[] {
    return Array.from(this.clients.values()).map(c => c.getStatus());
  }

  /**
   * Get status of a specific server
   */
  getStatus(serverId: string): MCPServerStatus | null {
    const client = this.clients.get(serverId);
    return client ? client.getStatus() : null;
  }

  /**
   * Disconnect all servers
   */
  async disconnectAll(): Promise<void> {
    const ids = Array.from(this.clients.keys());
    for (const id of ids) {
      await this.disconnect(id);
    }
  }

  /**
   * Get count of connected servers
   */
  get connectedCount(): number {
    return this.clients.size;
  }

  // ===========================================
  // Private
  // ===========================================

  private startHealthCheck(serverId: string, intervalMs: number): void {
    const interval = setInterval(async () => {
      const client = this.clients.get(serverId);
      if (!client) {
        clearInterval(interval);
        this.healthCheckIntervals.delete(serverId);
        return;
      }
      await client.healthCheck();
    }, intervalMs);

    this.healthCheckIntervals.set(serverId, interval);
  }
}

// Singleton
export const mcpClientManager = new MCPClientManager();
