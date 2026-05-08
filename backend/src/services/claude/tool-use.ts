/**
 * Claude Tool Use Module (Facade)
 *
 * Implements Claude's native tool use (function calling) capability
 * for structured, reliable actions within conversations.
 *
 * Phase 119: Split into facade pattern.
 * - Tool types & registry: ./tool-types.ts
 * - Tool definitions (TOOL_* constants): ./tool-definitions.ts
 * - Execution functions: ./tool-execution.ts
 * - This file: Re-exports only (no circular dependencies)
 *
 * @module services/claude/tool-use
 */

// ===========================================
// Re-exports from tool-types (types + registry)
// ===========================================

export {
  toolRegistry,
} from './tool-types';

export type {
  ToolExecutionContext,
  ToolDefinition,
  ToolResult,
  ToolCall,
  ToolHandler,
  RegisteredTool,
  ToolUseOptions,
  ToolUseResult,
} from './tool-types';

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
  TOOL_GET_BUSINESS_KPIS, TOOL_ANALYZE_BUSINESS_TREND, TOOL_GET_BUSINESS_ANOMALIES,
  TOOL_CREATE_CALENDAR_EVENT, TOOL_LIST_CALENDAR_EVENTS, TOOL_DRAFT_EMAIL, TOOL_ESTIMATE_TRAVEL,
  TOOL_MEMORY_UPDATE, TOOL_MEMORY_DELETE, TOOL_MEMORY_UPDATE_PROFILE,
  TOOL_GET_DIRECTIONS, TOOL_GET_OPENING_HOURS, TOOL_FIND_NEARBY, TOOL_OPTIMIZE_ROUTE,
  TOOL_ASK_INBOX, TOOL_INBOX_SUMMARY,
  TOOL_MCP_CALL_TOOL, TOOL_MCP_LIST_TOOLS,
  TOOL_MEMORY_RETHINK, TOOL_MEMORY_RESTRUCTURE,
  TOOL_MEMORY_REPLACE, TOOL_MEMORY_ABSTRACT, TOOL_MEMORY_SEARCH_AND_LINK,
  TOOL_CORE_MEMORY_READ, TOOL_CORE_MEMORY_UPDATE, TOOL_CORE_MEMORY_APPEND,
  TOOL_OPEN_PANEL,
  TOOL_CREATE_DOCUMENT,
  TOOL_PREPARE_DOCUMENT_CONTEXT,
} from './tool-definitions';

// Execution functions
export {
  executeWithTools, callWithTools, forceToolCall,
  parseToolCalls, hasToolUse, extractText,
} from './tool-execution';
