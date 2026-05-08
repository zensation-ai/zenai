/**
 * Claude Tool Types & Registry
 *
 * Extracted to break circular dependency between tool-use.ts, tool-definitions.ts,
 * and tool-execution.ts. Contains all shared types and the ToolRegistry class.
 *
 * @module services/claude/tool-types
 */

import { logger } from '../../utils/logger';

// ===========================================
// Types & Interfaces
// ===========================================

/**
 * Execution context passed to tool handlers
 */
export interface ToolExecutionContext {
  /** The AI context (personal or work) */
  aiContext: 'operations' | 'finance' | 'people' | 'strategy' | 'demo';
  /** Optional session ID for tracking */
  sessionId?: string;
  /** Optional user ID for audit */
  userId?: string;
}

/**
 * Tool definition following Claude's schema
 */
export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description: string;
      enum?: string[];
      items?: { type: string };
    }>;
    required: string[];
  };
}

/**
 * Result from a tool execution
 */
export interface ToolResult {
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

/**
 * Tool call from Claude's response
 */
export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

/**
 * Handler function for tool execution
 */
export type ToolHandler = (
  input: Record<string, unknown>,
  context: ToolExecutionContext
) => Promise<string>;

/**
 * Registered tool with definition and handler
 */
export interface RegisteredTool {
  definition: ToolDefinition;
  handler: ToolHandler;
}

/**
 * Options for tool-enabled calls
 */
export interface ToolUseOptions {
  /** Maximum iterations for multi-turn tool use */
  maxIterations?: number;
  /** System prompt */
  systemPrompt?: string;
  /** Temperature (0-1) */
  temperature?: number;
  /** Force specific tool usage */
  toolChoice?: { type: 'auto' } | { type: 'any' } | { type: 'tool'; name: string };
  /** Execution context for request-scoped tool execution */
  executionContext?: ToolExecutionContext;
}

/**
 * Result from a tool-enabled conversation
 */
export interface ToolUseResult {
  /** Final text response */
  response: string;
  /** Tools that were called */
  toolsCalled: Array<{ name: string; input: Record<string, unknown>; result: string }>;
  /** Number of iterations used */
  iterations: number;
  /** Stop reason */
  stopReason: string;
}

// ===========================================
// Tool Registry
// ===========================================

/**
 * Global tool registry
 */
class ToolRegistry {
  private tools: Map<string, RegisteredTool> = new Map();

  register(definition: ToolDefinition, handler: ToolHandler): void {
    this.tools.set(definition.name, { definition, handler });
    logger.debug('Tool registered', { name: definition.name });
  }

  get(name: string): RegisteredTool | undefined {
    return this.tools.get(name);
  }

  getDefinitions(): ToolDefinition[] {
    return Array.from(this.tools.values()).map(t => t.definition);
  }

  getDefinitionsFor(names: string[]): ToolDefinition[] {
    return names
      .map(name => this.tools.get(name)?.definition)
      .filter((d): d is ToolDefinition => d !== undefined);
  }

  async execute(
    name: string,
    input: Record<string, unknown>,
    context: ToolExecutionContext
  ): Promise<string> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool not found: ${name}`);
    }
    return tool.handler(input, context);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }
}

export const toolRegistry = new ToolRegistry();
