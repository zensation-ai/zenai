/**
 * Claude Tool Use Module (Facade)
 *
 * Implements Claude's native tool use (function calling) capability
 * for structured, reliable actions within conversations.
 *
 * Phase 119: Split into facade pattern.
 * - Tool definitions (TOOL_* constants): ./tool-definitions.ts
 * - Execution functions: ./tool-execution.ts
 * - This file: Types, ToolRegistry class, and re-exports
 *
 * @module services/claude/tool-use
 */

import { logger } from '../../utils/logger';

// ===========================================
// Types & Interfaces
// ===========================================

/**
 * Execution context passed to tool handlers
 * This replaces the global context state to enable request-scoped execution
 */
export interface ToolExecutionContext {
  /** The AI context (personal or work) */
  aiContext: 'personal' | 'work' | 'learning' | 'creative' | 'demo';
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
 * Now accepts ToolExecutionContext for request-scoped execution
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

  /**
   * Register a tool with its handler
   */
  register(definition: ToolDefinition, handler: ToolHandler): void {
    this.tools.set(definition.name, { definition, handler });
    logger.debug('Tool registered', { name: definition.name });
  }

  /**
   * Get a tool by name
   */
  get(name: string): RegisteredTool | undefined {
    return this.tools.get(name);
  }

  /**
   * Get all tool definitions
   */
  getDefinitions(): ToolDefinition[] {
    return Array.from(this.tools.values()).map(t => t.definition);
  }

  /**
   * Get specific tool definitions by name
   */
  getDefinitionsFor(names: string[]): ToolDefinition[] {
    return names
      .map(name => this.tools.get(name)?.definition)
      .filter((d): d is ToolDefinition => d !== undefined);
  }

  /**
   * Execute a tool by name with execution context
   * @param name - Tool name
   * @param input - Tool input parameters
   * @param context - Execution context (request-scoped)
   */
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

  /**
   * Check if a tool exists
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }
}

export const toolRegistry = new ToolRegistry();

// ===========================================
// Re-exports from extracted modules (Phase 119 facade pattern)
// ===========================================

// Tool definitions (all TOOL_* constants)
export {
  TOOL_SEARCH_IDEAS, TOOL_CREATE_IDEA, TOOL_GET_RELATED,
  TOOL_WEB_SEARCH, TOOL_FETCH_URL,
  TOOL_GITHUB_SEARCH, TOOL_GITHUB_CREATE_ISSUE, TOOL_GITHUB_REPO_INFO, TOOL_GITHUB_LIST_ISSUES, TOOL_GITHUB_PR_SUMMARY,
  TOOL_CALCULATE, TOOL_REMEMBER, TOOL_RECALL, TOOL_MEMORY_INTROSPECT,
  TOOL_ANALYZE_PROJECT, TOOL_PROJECT_SUMMARY, TOOL_LIST_PROJECT_FILES,
  TOOL_EXECUTE_CODE, TOOL_ANALYZE_DOCUMENT, TOOL_SEARCH_DOCUMENTS, TOOL_SYNTHESIZE_KNOWLEDGE,
  TOOL_CREATE_MEETING, TOOL_NAVIGATE_TO, TOOL_APP_HELP,
  TOOL_UPDATE_IDEA, TOOL_ARCHIVE_IDEA, TOOL_DELETE_IDEA,
  TOOL_GET_REVENUE_METRICS, TOOL_GET_TRAFFIC_ANALYTICS, TOOL_GET_SEO_PERFORMANCE,
  TOOL_GET_SYSTEM_HEALTH, TOOL_GENERATE_BUSINESS_REPORT, TOOL_IDENTIFY_ANOMALIES, TOOL_COMPARE_PERIODS,
  TOOL_CREATE_CALENDAR_EVENT, TOOL_LIST_CALENDAR_EVENTS, TOOL_DRAFT_EMAIL, TOOL_ESTIMATE_TRAVEL,
  TOOL_MEMORY_UPDATE, TOOL_MEMORY_DELETE, TOOL_MEMORY_UPDATE_PROFILE,
  TOOL_GET_DIRECTIONS, TOOL_GET_OPENING_HOURS, TOOL_FIND_NEARBY, TOOL_OPTIMIZE_ROUTE,
  TOOL_ASK_INBOX, TOOL_INBOX_SUMMARY,
  TOOL_MCP_CALL_TOOL, TOOL_MCP_LIST_TOOLS,
  TOOL_MEMORY_RETHINK, TOOL_MEMORY_RESTRUCTURE,
  TOOL_MEMORY_REPLACE, TOOL_MEMORY_ABSTRACT, TOOL_MEMORY_SEARCH_AND_LINK,
  TOOL_CORE_MEMORY_READ, TOOL_CORE_MEMORY_UPDATE, TOOL_CORE_MEMORY_APPEND,
} from './tool-definitions';

// Execution functions
export {
  executeWithTools, callWithTools, forceToolCall,
  parseToolCalls, hasToolUse, extractText,
} from './tool-execution';
