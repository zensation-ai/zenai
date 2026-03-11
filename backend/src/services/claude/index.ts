/**
 * Claude Services Module
 *
 * Unified export for all Claude-related functionality.
 * This module provides a clean API for interacting with Claude.
 *
 * @module services/claude
 *
 * @example
 * ```typescript
 * import {
 *   isClaudeAvailable,
 *   structureWithClaude,
 *   structureWithClaudePersonalized,
 *   generateWithExtendedThinking,
 * } from './services/claude';
 * ```
 */

// ===========================================
// Client Exports
// ===========================================

export {
  isClaudeAvailable,
  CLAUDE_MODEL,
  SYSTEM_PROMPT,
  SYSTEM_PROMPT_WITH_CONFIDENCE,
  CLAUDE_RETRY_CONFIG,
  CLAUDE_EXTENDED_RETRY_CONFIG,
} from './client';

// ===========================================
// Core Function Exports
// ===========================================

export {
  structureWithClaude,
  structureWithClaudePersonalized,
  queryClaudeJSON,
  generateClaudeResponse,
  generateWithConversationHistory,
} from './core';

export type {
  ClaudeOptions,
  ConversationMessage,
} from './core';

// ===========================================
// Extended Thinking Exports
// ===========================================

export {
  generateWithExtendedThinking,
  structureWithClaudeAdvanced,
  queryClaudeJSONAdvanced,
  generateWithConversationHistoryAdvanced,
} from './extended-thinking';

// ===========================================
// Confidence Exports
// ===========================================

export {
  calculateConfidence,
  getConfidenceLevel,
  addConfidenceToIdea,
} from './confidence';

export type {
  ConfidenceScores,
  StructuredIdeaWithConfidence,
} from './confidence';

// ===========================================
// Helper Exports
// ===========================================

export {
  extractJSONFromResponse,
  extractJSONOrThrow,
  validateAndNormalizeIdea,
  extractTextFromMessage,
  extractTextOrThrow,
  shouldUseExtendedThinking,
  extractThinkingContent,
} from './helpers';

export type {
  JSONExtractionResult,
} from './helpers';

// ===========================================
// Tool Use Exports
// ===========================================

export {
  toolRegistry,
  executeWithTools,
  callWithTools,
  forceToolCall,
  parseToolCalls,
  hasToolUse,
  extractText,
  TOOL_SEARCH_IDEAS,
  TOOL_CREATE_IDEA,
  TOOL_GET_RELATED,
  TOOL_WEB_SEARCH,
  TOOL_CALCULATE,
} from './tool-use';

export type {
  ToolDefinition,
  ToolResult,
  ToolCall,
  ToolHandler,
  RegisteredTool,
  ToolUseOptions,
  ToolUseResult,
} from './tool-use';

// ===========================================
// Streaming Exports
// ===========================================

export {
  setupSSEHeaders,
  streamToSSE,
  streamAndCollect,
  simpleStream,
  thinkingStream,
} from './streaming';

export type {
  StreamEventType,
  StreamEvent,
  StreamingOptions,
  StreamingResult,
} from './streaming';
