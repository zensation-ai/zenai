/**
 * MCP Transport Layer Abstraction - Phase 55
 *
 * Provides unified transport creation for MCP client connections.
 * Supports: Streamable HTTP, stdio, SSE transports.
 *
 * Uses the official @modelcontextprotocol/sdk transports where available,
 * with a custom HTTP JSON-RPC fallback for maximum compatibility.
 */

import { logger } from '../../utils/logger';

// ===========================================
// Types
// ===========================================

export type MCPTransportType = 'streamable-http' | 'stdio' | 'sse';

export interface MCPTransportConfig {
  type: MCPTransportType;
  /** URL for HTTP-based transports */
  url?: string;
  /** Command for stdio transport */
  command?: string;
  /** Arguments for stdio transport */
  args?: string[];
  /** Environment variables for stdio transport */
  env?: Record<string, string>;
  /** Auth configuration */
  auth?: {
    type: 'bearer' | 'api-key';
    token?: string;
  };
  /** Request timeout in ms */
  timeout?: number;
}

export interface MCPTransportResult {
  content?: Array<{ type: string; text: string }>;
  contents?: Array<{ uri: string; mimeType: string; text: string }>;
  tools?: Array<{
    name: string;
    description?: string;
    inputSchema?: Record<string, unknown>;
  }>;
  resources?: Array<{
    uri: string;
    name: string;
    description?: string;
    mimeType?: string;
  }>;
  prompts?: Array<{
    name: string;
    description?: string;
    arguments?: Array<{ name: string; description?: string; required?: boolean }>;
  }>;
  isError?: boolean;
  [key: string]: unknown;
}

// ===========================================
// Transport Interface
// ===========================================

export interface IMCPTransport {
  /** Send a JSON-RPC request and get the result */
  request(method: string, params?: Record<string, unknown>): Promise<MCPTransportResult>;
  /** Close the transport connection */
  close(): Promise<void>;
  /** Check if the transport is connected */
  isConnected(): boolean;
}

// ===========================================
// HTTP Transport (Streamable HTTP / SSE)
// ===========================================

export class HttpMCPTransport implements IMCPTransport {
  private config: MCPTransportConfig;
  private connected = false;
  private requestId = 0;

  constructor(config: MCPTransportConfig) {
    if (!config.url) {
      throw new Error('HTTP transport requires a URL');
    }
    this.config = {
      timeout: 30000,
      ...config,
    };
  }

  async request(method: string, params?: Record<string, unknown>): Promise<MCPTransportResult> {
    const url = (this.config.url ?? '').replace(/\/$/, '');
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.config.auth?.token) {
      if (this.config.auth.type === 'bearer') {
        headers['Authorization'] = `Bearer ${this.config.auth.token}`;
      } else if (this.config.auth.type === 'api-key') {
        headers['X-API-Key'] = this.config.auth.token;
      }
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: ++this.requestId,
          method,
          params: params || {},
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`MCP server responded with ${response.status}: ${response.statusText}`);
      }

      const data = await response.json() as Record<string, unknown>;

      if (data.error) {
        const err = data.error as Record<string, unknown>;
        throw new Error(`MCP error: ${err.message || JSON.stringify(err)}`);
      }

      this.connected = true;
      return (data.result || data) as MCPTransportResult;
    } catch (error) {
      this.connected = false;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`MCP request timed out after ${this.config.timeout}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  async close(): Promise<void> {
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }
}

// ===========================================
// Stdio Transport (for local MCP servers)
// ===========================================

export class StdioMCPTransport implements IMCPTransport {
  private config: MCPTransportConfig;
  private connected = false;

  constructor(config: MCPTransportConfig) {
    if (!config.command) {
      throw new Error('Stdio transport requires a command');
    }
    this.config = config;
  }

  async request(method: string, params?: Record<string, unknown>): Promise<MCPTransportResult> {
    // Stdio transport spawns a child process and communicates via stdin/stdout
    // For now, we use a simplified exec-based approach
    const { execSync } = await import('child_process');

    const input = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method,
      params: params || {},
    });

    const stdioTimeout = this.config.timeout || 30000;

    try {
      const env = { ...process.env, ...this.config.env };
      const args = this.config.args?.join(' ') || '';
      const cmd = `echo '${input.replace(/'/g, "'\\''")}' | ${this.config.command} ${args}`;

      const output = execSync(cmd, {
        env,
        timeout: stdioTimeout,
        encoding: 'utf-8',
      });

      const data = JSON.parse(output.trim()) as Record<string, unknown>;

      if (data.error) {
        const err = data.error as Record<string, unknown>;
        throw new Error(`MCP error: ${err.message || JSON.stringify(err)}`);
      }

      this.connected = true;
      return (data.result || data) as MCPTransportResult;
    } catch (error) {
      this.connected = false;
      // Detect timeout from execSync (throws with .killed = true or ETIMEDOUT)
      if (error instanceof Error && ('killed' in error || error.message.includes('ETIMEDOUT') || error.message.includes('timed out'))) {
        throw new Error(`MCP stdio transport timeout after ${stdioTimeout}ms for method '${method}'`);
      }
      throw error;
    }
  }

  async close(): Promise<void> {
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }
}

// ===========================================
// Factory
// ===========================================

/**
 * Create a transport instance based on configuration
 */
export function createTransport(config: MCPTransportConfig): IMCPTransport {
  switch (config.type) {
    case 'streamable-http':
    case 'sse':
      return new HttpMCPTransport(config);
    case 'stdio':
      return new StdioMCPTransport(config);
    default:
      throw new Error(`Unsupported transport type: ${config.type}`);
  }
}

/**
 * Validate transport configuration
 */
export function validateTransportConfig(config: MCPTransportConfig): string | null {
  if (!config.type) {
    return 'Transport type is required';
  }

  if (!['streamable-http', 'stdio', 'sse'].includes(config.type)) {
    return `Invalid transport type: ${config.type}`;
  }

  if ((config.type === 'streamable-http' || config.type === 'sse') && !config.url) {
    return 'URL is required for HTTP/SSE transport';
  }

  if (config.type === 'stdio' && !config.command) {
    return 'Command is required for stdio transport';
  }

  if (config.url) {
    try {
      new URL(config.url);
    } catch {
      return 'Invalid URL format';
    }
  }

  return null;
}

logger.debug('MCP Transport layer initialized');
