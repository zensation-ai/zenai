/**
 * Claude Service - Backward Compatibility Layer
 *
 * This file re-exports all functionality from the modular claude/ directory.
 * Existing imports will continue to work without changes.
 *
 * The Claude service has been refactored into modules:
 * - claude/client.ts - Client initialization and configuration
 * - claude/core.ts - Basic structuring and response generation
 * - claude/extended-thinking.ts - Advanced reasoning with Extended Thinking
 * - claude/confidence.ts - Confidence scoring for structured ideas
 * - claude/helpers.ts - JSON extraction and validation utilities
 *
 * @module services/claude
 * @deprecated Import directly from './claude/index' for new code
 */

// ===========================================
// Re-export everything from modular structure
// ===========================================

export {
  // Client
  isClaudeAvailable,
  CLAUDE_MODEL,
  SYSTEM_PROMPT,
  SYSTEM_PROMPT_WITH_CONFIDENCE,
  CLAUDE_RETRY_CONFIG,
  CLAUDE_EXTENDED_RETRY_CONFIG,

  // Core functions
  structureWithClaude,
  structureWithClaudePersonalized,
  queryClaudeJSON,
  generateClaudeResponse,
  generateWithConversationHistory,

  // Extended Thinking
  generateWithExtendedThinking,
  structureWithClaudeAdvanced,
  queryClaudeJSONAdvanced,
  generateWithConversationHistoryAdvanced,

  // Confidence
  calculateConfidence,
  getConfidenceLevel,
  addConfidenceToIdea,

  // Helpers
  extractJSONFromResponse,
  extractJSONOrThrow,
  validateAndNormalizeIdea,
  extractTextFromMessage,
  extractTextOrThrow,
  shouldUseExtendedThinking,
  extractThinkingContent,
} from './claude/index';

// ===========================================
// Re-export types
// ===========================================

export type {
  ClaudeOptions,
  ConversationMessage,
  ConfidenceScores,
  StructuredIdeaWithConfidence,
  JSONExtractionResult,
} from './claude/index';
