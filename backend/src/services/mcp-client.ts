/**
 * MCP Client SDK - Phase 44
 *
 * Client for connecting to external MCP servers via HTTP/SSE or stdio.
 * Enables ZenAI to consume tools and resources from external MCP servers
 * (e.g., Slack MCP, GitHub MCP, custom MCP servers).
 *
 * Supports:
 * - HTTP+SSE transport (remote MCP servers)
 * - Tool listing and execution
 * - Resource listing and reading
 * - Connection health checks
 * - Timeout and error handling
 */

import { logger } from '../utils/logger';

// ===========================================
// Types
// ===========================================

export interface MCPToolSchema {
  type: string;
  properties: Record<string, {
    type: string;
    description?: string;
    enum?: string[];
    items?: { type: string };
  }>;
  required?: string[];
}

export interface MCPExternalTool {
  name: string;
  description: string;
  inputSchema: MCPToolSchema;
  outputSchema?: MCPToolSchema;
}

export interface MCPExternalResource {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
}

export interface MCPToolResult {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

export interface MCPResourceResult {
  contents: Array<{ uri: string; mimeType: string; text: string }>;
}

export interface MCPClientConfig {
  /** Unique identifier for this connection */
  id: string;
  /** Human-readable name */
  name: string;
  /** Server URL (HTTP transport) */
  url: string;
  /** Optional API key for authentication */
  apiKey?: string;
  /** Request timeout in ms (default: 30000) */
  timeout?: number;
  /** Custom headers to send */
  headers?: Record<string, string>;
}

export interface MCPServerInfo {
  name: string;
  version: string;
  tools: MCPExternalTool[];
  resources: MCPExternalResource[];
  lastHealthCheck: Date | null;
  isHealthy: boolean;
}

// ===========================================
// MCP Client
// ===========================================

export class MCPClient {
  private config: MCPClientConfig;
  private cachedTools: MCPExternalTool[] | null = null;
  private cachedResources: MCPExternalResource[] | null = null;
  private lastHealthCheck: Date | null = null;
  private healthy = false;

  constructor(config: MCPClientConfig) {
    this.config = {
      timeout: 30000,
      ...config,
    };
  }

  get id(): string { return this.config.id; }
  get name(): string { return this.config.name; }
  get url(): string { return this.config.url; }
  get isHealthy(): boolean { return this.healthy; }

  // ===========================================
  // Core Protocol Methods
  // ===========================================

  /**
   * List available tools from the remote MCP server
   */
  async listTools(useCache = true): Promise<MCPExternalTool[]> {
    if (useCache && this.cachedTools) {return this.cachedTools;}

    const response = await this.request('tools/list');
    const tools = (response.tools as MCPExternalTool[]) || [];
    this.cachedTools = tools;
    return tools;
  }

  /**
   * Call a tool on the remote MCP server
   */
  async callTool(name: string, args: Record<string, unknown>): Promise<MCPToolResult> {
    const response = await this.request('tools/call', { name, arguments: args });
    return {
      content: (response.content as MCPToolResult['content']) || [{ type: 'text', text: 'No response' }],
      isError: response.isError as boolean | undefined,
    };
  }

  /**
   * List available resources from the remote MCP server
   */
  async listResources(useCache = true): Promise<MCPExternalResource[]> {
    if (useCache && this.cachedResources) {return this.cachedResources;}

    const response = await this.request('resources/list');
    const resources = (response.resources as MCPExternalResource[]) || [];
    this.cachedResources = resources;
    return resources;
  }

  /**
   * Read a resource from the remote MCP server
   */
  async readResource(uri: string): Promise<MCPResourceResult> {
    const response = await this.request('resources/read', { uri });
    return {
      contents: (response.contents as MCPResourceResult['contents']) || [],
    };
  }

  /**
   * Health check: verify server is reachable and responding
   */
  async healthCheck(): Promise<boolean> {
    try {
      const tools = await this.listTools(false);
      this.healthy = Array.isArray(tools);
      this.lastHealthCheck = new Date();
      return this.healthy;
    } catch {
      this.healthy = false;
      this.lastHealthCheck = new Date();
      return false;
    }
  }

  /**
   * Get server info including cached tools/resources and health status
   */
  getInfo(): MCPServerInfo {
    return {
      name: this.config.name,
      version: '1.0.0',
      tools: this.cachedTools || [],
      resources: this.cachedResources || [],
      lastHealthCheck: this.lastHealthCheck,
      isHealthy: this.healthy,
    };
  }

  /**
   * Clear cached tools and resources
   */
  clearCache(): void {
    this.cachedTools = null;
    this.cachedResources = null;
  }

  // ===========================================
  // HTTP Transport
  // ===========================================

  private async request(method: string, params?: Record<string, unknown>): Promise<Record<string, unknown>> {
    const url = this.config.url.replace(/\/$/, '');
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.config.headers,
    };

    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(`${url}/mcp`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: Date.now(),
          method,
          params: params || {},
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`MCP server responded with ${response.status}: ${response.statusText}`);
      }

      const data = await response.json() as Record<string, unknown>;

      // Handle JSON-RPC error
      if (data.error) {
        const err = data.error as Record<string, unknown>;
        throw new Error(`MCP error: ${err.message || JSON.stringify(err)}`);
      }

      return (data.result || data) as Record<string, unknown>;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`MCP request timed out after ${this.config.timeout}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

// ===========================================
// Factory
// ===========================================

/**
 * Create an MCP client for a remote server
 */
export function createMCPClient(config: MCPClientConfig): MCPClient {
  logger.info('Creating MCP client', { id: config.id, name: config.name, url: config.url });
  return new MCPClient(config);
}
