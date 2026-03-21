/**
 * MCP Tool Bridge - Phase 55
 *
 * Bridges external MCP tools into ZenAI's internal tool registry.
 * When an external MCP server exposes tools, this bridge registers them
 * so they can be used by ZenAI's AI chat and agent systems.
 *
 * Features:
 * - Tool name namespacing to avoid collisions
 * - Latency tracking per tool
 * - Automatic registration/deregistration
 */

import { logger } from '../../utils/logger';
import { AIContext } from '../../utils/database-context';
import { MCPClientManager, MCPExternalTool, MCPToolCallResult } from './mcp-client';
import { mcpServerRegistry } from './mcp-registry';

// ===========================================
// Types
// ===========================================

export interface BridgedTool {
  /** Namespaced name: mcp_{serverId}_{toolName} */
  qualifiedName: string;
  /** Original tool name on the remote server */
  originalName: string;
  /** Server ID this tool belongs to */
  serverId: string;
  /** Server name for display */
  serverName: string;
  /** Tool description */
  description: string;
  /** Input schema */
  inputSchema: Record<string, unknown>;
}

export interface ToolExecutionResult {
  success: boolean;
  content: string;
  latencyMs: number;
  isError: boolean;
}

// ===========================================
// Tool Bridge
// ===========================================

export class MCPToolBridge {
  private clientManager: MCPClientManager;
  private bridgedTools: Map<string, BridgedTool> = new Map();

  constructor(clientManager: MCPClientManager) {
    this.clientManager = clientManager;
  }

  /**
   * Sync tools from a connected server into the bridge
   */
  async syncServerTools(serverId: string, serverName: string): Promise<BridgedTool[]> {
    const tools = await this.clientManager.listTools(serverId);
    const bridged: BridgedTool[] = [];

    // Remove existing bridged tools for this server
    this.removeBridgedTools(serverId);

    for (const tool of tools) {
      const qualifiedName = `mcp_${serverId.replace(/-/g, '_').substring(0, 8)}_${tool.name}`;

      const bridgedTool: BridgedTool = {
        qualifiedName,
        originalName: tool.name,
        serverId,
        serverName,
        description: tool.description || `External tool: ${tool.name}`,
        inputSchema: (tool.inputSchema as Record<string, unknown>) || { type: 'object', properties: {} },
      };

      this.bridgedTools.set(qualifiedName, bridgedTool);
      bridged.push(bridgedTool);
    }

    logger.info('MCP tools synced to bridge', {
      serverId,
      serverName,
      toolCount: bridged.length,
    });

    return bridged;
  }

  /**
   * Validate tool input against its JSON Schema (lightweight, no external deps).
   * Checks required fields and basic type constraints from the schema.
   */
  private validateToolInput(
    input: Record<string, unknown>,
    schema: Record<string, unknown>
  ): string | null {
    if (schema.type !== 'object') return null; // Only validate object schemas

    const properties = (schema.properties || {}) as Record<string, Record<string, unknown>>;
    const required = (schema.required || []) as string[];

    // Check required fields
    for (const field of required) {
      if (input[field] === undefined || input[field] === null) {
        return `Missing required field: ${field}`;
      }
    }

    // Check basic types for provided fields
    for (const [key, value] of Object.entries(input)) {
      const propSchema = properties[key];
      if (!propSchema || !propSchema.type) continue;

      const expectedType = propSchema.type as string;
      const actualType = Array.isArray(value) ? 'array' : typeof value;

      if (expectedType === 'integer' || expectedType === 'number') {
        if (typeof value !== 'number') {
          return `Field '${key}' expected ${expectedType}, got ${actualType}`;
        }
      } else if (expectedType === 'string') {
        if (typeof value !== 'string') {
          return `Field '${key}' expected string, got ${actualType}`;
        }
      } else if (expectedType === 'boolean') {
        if (typeof value !== 'boolean') {
          return `Field '${key}' expected boolean, got ${actualType}`;
        }
      } else if (expectedType === 'array') {
        if (!Array.isArray(value)) {
          return `Field '${key}' expected array, got ${actualType}`;
        }
      }
    }

    return null; // Validation passed
  }

  /**
   * Execute a bridged tool
   */
  async executeTool(
    qualifiedName: string,
    args: Record<string, unknown>,
    context?: AIContext
  ): Promise<ToolExecutionResult> {
    const bridgedTool = this.bridgedTools.get(qualifiedName);
    if (!bridgedTool) {
      return {
        success: false,
        content: `Tool not found: ${qualifiedName}`,
        latencyMs: 0,
        isError: true,
      };
    }

    // Validate input against schema before execution
    if (bridgedTool.inputSchema && Object.keys(bridgedTool.inputSchema).length > 0) {
      const validationError = this.validateToolInput(args, bridgedTool.inputSchema);
      if (validationError) {
        logger.warn('MCP tool input validation failed', {
          qualifiedName,
          error: validationError,
        });
        return {
          success: false,
          content: `MCP tool input validation failed: ${validationError}`,
          latencyMs: 0,
          isError: true,
        };
      }
    }

    const startTime = Date.now();

    try {
      const result = await this.clientManager.callTool(
        bridgedTool.serverId,
        bridgedTool.originalName,
        args
      );

      const latencyMs = Date.now() - startTime;

      // Record usage in registry
      if (context) {
        mcpServerRegistry.recordToolUsage(
          context,
          bridgedTool.serverId,
          bridgedTool.originalName,
          latencyMs
        ).catch((err) => logger.debug('Non-critical: MCP tool usage recording failed', { error: err }));
      }

      const text = result.content
        .map(c => c.text)
        .join('\n');

      return {
        success: !result.isError,
        content: text,
        latencyMs,
        isError: result.isError || false,
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      logger.error('MCP tool execution failed', error instanceof Error ? error : undefined, {
        qualifiedName,
        serverId: bridgedTool.serverId,
        toolName: bridgedTool.originalName,
      });

      return {
        success: false,
        content: error instanceof Error ? error.message : 'Unknown error',
        latencyMs,
        isError: true,
      };
    }
  }

  /**
   * Get all bridged tools
   */
  getAllBridgedTools(): BridgedTool[] {
    return Array.from(this.bridgedTools.values());
  }

  /**
   * Get bridged tools for a specific server
   */
  getServerTools(serverId: string): BridgedTool[] {
    return Array.from(this.bridgedTools.values())
      .filter(t => t.serverId === serverId);
  }

  /**
   * Check if a qualified name is a bridged tool
   */
  hasTool(qualifiedName: string): boolean {
    return this.bridgedTools.has(qualifiedName);
  }

  /**
   * Remove all bridged tools for a server
   */
  removeBridgedTools(serverId: string): void {
    const keysToDelete: string[] = [];
    for (const [key, tool] of this.bridgedTools) {
      if (tool.serverId === serverId) {
        keysToDelete.push(key);
      }
    }
    for (const key of keysToDelete) {
      this.bridgedTools.delete(key);
    }
  }

  /**
   * Clear all bridged tools
   */
  clear(): void {
    this.bridgedTools.clear();
  }

  /**
   * Get count of bridged tools
   */
  get toolCount(): number {
    return this.bridgedTools.size;
  }
}

// Factory
export function createToolBridge(clientManager: MCPClientManager): MCPToolBridge {
  return new MCPToolBridge(clientManager);
}
