/**
 * CLI Agent Types (Phase 132)
 *
 * Shared type definitions for the ZenAI CLI Agent.
 *
 * @module cli/types
 */

// ─── Tool Types ──────────────────────────────────────────────────────────────

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface ToolUse {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResult {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

// ─── Agent Loop Types ────────────────────────────────────────────────────────

export interface AgentConfig {
  model: string;
  maxTokens: number;
  maxIterations: number;
  apiKey: string;
  backendUrl?: string;
  backendApiKey?: string;
}

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string | ContentBlock[];
}

export type ContentBlock =
  | { type: 'text'; text: string }
  | ToolUse
  | ToolResult;

export interface AgentResponse {
  text: string;
  toolCalls: ToolCallRecord[];
  iterationCount: number;
}

export interface ToolCallRecord {
  name: string;
  input: Record<string, unknown>;
  output: string;
  isError: boolean;
  durationMs: number;
}

// ─── Context Types ───────────────────────────────────────────────────────────

export interface CLIContext {
  workingDirectory: string;
  zenaiDir: string;
  conversationHistory: ConversationMessage[];
  sessionId: string;
  projectType?: string;
}

export interface ProjectInfo {
  type: string;        // e.g. 'typescript', 'python', 'rust'
  name: string;
  framework?: string;
  hasGit: boolean;
  mainFiles: string[];
}

// ─── Filesystem Tool Types ───────────────────────────────────────────────────

export interface ReadFileInput {
  path: string;
  offset?: number;
  limit?: number;
}

export interface WriteFileInput {
  path: string;
  content: string;
}

export interface EditFileInput {
  path: string;
  old_string: string;
  new_string: string;
  replace_all?: boolean;
}

export interface ListFilesInput {
  pattern: string;
  path?: string;
}

export interface SearchContentInput {
  pattern: string;
  path?: string;
  glob?: string;
}

// ─── Shell Tool Types ────────────────────────────────────────────────────────

export interface RunCommandInput {
  command: string;
  timeout?: number;
}

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

// ─── Backend Bridge Types ────────────────────────────────────────────────────

export interface BackendToolCall {
  tool: string;
  input: Record<string, unknown>;
  context?: string;
}

export interface BackendToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}
