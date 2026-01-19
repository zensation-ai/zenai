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
