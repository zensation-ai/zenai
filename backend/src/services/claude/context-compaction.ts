/**
 * Context Compaction Service
 *
 * Enables effectively infinite conversations using Claude's Context Compaction API.
 * When conversations approach the context limit, older messages are automatically
 * summarized server-side by Claude, preserving key context while reducing tokens.
 *
 * Features:
 * - Automatic compaction when input tokens exceed threshold
 * - Configurable trigger thresholds (50k-200k tokens)
 * - Custom summarization instructions (German language)
 * - Compaction state tracking per session
 * - Seamless integration with streaming and tool use
 *
 * API: Beta feature "compact-2026-01-12" (Claude Opus 4.6)
 *
 * @module services/claude/context-compaction
 */

import { logger } from '../../utils/logger';

// ===========================================
// Types & Interfaces
// ===========================================

/**
 * Compaction configuration for a chat session
 */
export interface CompactionConfig {
  /** Enable context compaction (default: true) */
  enabled: boolean;
  /** Input token threshold to trigger compaction (min: 50000, default: 80000) */
  triggerThreshold: number;
  /** Pause after compaction for inspection (default: false) */
  pauseAfterCompaction: boolean;
  /** Custom summarization instructions (default: German-optimized) */
  instructions?: string;
}

/**
 * Compaction state tracked per session
 */
export interface CompactionState {
  /** Number of times compaction was triggered */
  compactionCount: number;
  /** Total tokens saved through compaction */
  totalTokensSaved: number;
  /** Last compaction timestamp */
  lastCompactionAt: Date | null;
  /** Whether compacted content is in the message history */
  hasCompactedContent: boolean;
}

/**
 * Context management parameter for the API request
 */
export interface ContextManagementParam {
  edits: Array<{
    type: 'compact_20260112';
    trigger?: {
      type: 'input_tokens';
      value: number;
    };
    pause_after_compaction?: boolean;
    instructions?: string;
  }>;
}

// ===========================================
// Constants
// ===========================================

/** Beta header value for compaction API */
export const COMPACTION_BETA = 'compact-2026-01-12';

/** Default German-optimized summarization instructions */
const DEFAULT_COMPACTION_INSTRUCTIONS = `Du schreibst eine Zusammenfassung des bisherigen Gesprächs.
Der Zweck dieser Zusammenfassung ist es, Kontinuität zu gewährleisten, damit das Gespräch
nahtlos fortgesetzt werden kann.

Bewahre:
- Das aktuelle Ziel/Thema des Nutzers
- Wichtige Entscheidungen und Ergebnisse
- Relevante Fakten, IDs und Metadaten
- Offene Fragen und nächste Schritte
- Persönliche Präferenzen und Kontext

Fasse zusammen in einer strukturierten Form. Schreibe auf Deutsch.
Wickle deine Zusammenfassung in einen <summary></summary> Block.`;

/** Default compaction configuration */
const DEFAULT_CONFIG: CompactionConfig = {
  enabled: true,
  triggerThreshold: 80000,
  pauseAfterCompaction: false,
  instructions: DEFAULT_COMPACTION_INSTRUCTIONS,
};

/** Minimum trigger threshold (API limit) */
const MIN_TRIGGER_THRESHOLD = 50000;

// ===========================================
// Session State Management
// ===========================================

/** In-memory compaction state per session */
const sessionStates = new Map<string, CompactionState>();

/**
 * Get or initialize compaction state for a session
 */
export function getCompactionState(sessionId: string): CompactionState {
  let state = sessionStates.get(sessionId);
  if (!state) {
    state = {
      compactionCount: 0,
      totalTokensSaved: 0,
      lastCompactionAt: null,
      hasCompactedContent: false,
    };
    sessionStates.set(sessionId, state);
  }
  return state;
}

/**
 * Record a compaction event for a session
 */
export function recordCompaction(sessionId: string, tokensSaved: number): void {
  const state = getCompactionState(sessionId);
  state.compactionCount++;
  state.totalTokensSaved += tokensSaved;
  state.lastCompactionAt = new Date();
  state.hasCompactedContent = true;

  logger.info('Context compaction recorded', {
    sessionId,
    compactionCount: state.compactionCount,
    tokensSaved,
    totalTokensSaved: state.totalTokensSaved,
  });
}

/**
 * Clean up session state (call on session end)
 */
export function clearCompactionState(sessionId: string): void {
  sessionStates.delete(sessionId);
}

// ===========================================
// Configuration Builders
// ===========================================

/**
 * Build compaction configuration for a session.
 * Uses defaults with optional overrides.
 */
export function buildCompactionConfig(
  overrides: Partial<CompactionConfig> = {}
): CompactionConfig {
  return {
    ...DEFAULT_CONFIG,
    ...overrides,
    triggerThreshold: Math.max(
      MIN_TRIGGER_THRESHOLD,
      overrides.triggerThreshold || DEFAULT_CONFIG.triggerThreshold
    ),
  };
}

/**
 * Build the context_management parameter for the Claude API request.
 * Returns undefined if compaction is disabled.
 */
export function buildContextManagement(
  config: CompactionConfig
): ContextManagementParam | undefined {
  if (!config.enabled) {
    return undefined;
  }

  return {
    edits: [
      {
        type: 'compact_20260112',
        trigger: {
          type: 'input_tokens',
          value: config.triggerThreshold,
        },
        pause_after_compaction: config.pauseAfterCompaction,
        ...(config.instructions ? { instructions: config.instructions } : {}),
      },
    ],
  };
}

// ===========================================
// Response Parsing
// ===========================================

/**
 * Check if an API response contains compaction blocks.
 */
export function hasCompactionBlock(
  content: Array<{ type: string }>
): boolean {
  return content.some(block => block.type === 'compaction');
}

/**
 * Extract text content from a response that may include compaction blocks.
 * Returns only the text parts, not the compaction summary.
 */
export function extractTextFromCompactedResponse(
  content: Array<{ type: string; text?: string; content?: string }>
): string {
  return content
    .filter(block => block.type === 'text')
    .map(block => block.text || '')
    .join('');
}

/**
 * Extract the compaction summary from a response.
 */
export function extractCompactionSummary(
  content: Array<{ type: string; text?: string; content?: string }>
): string | null {
  const compactionBlock = content.find(block => block.type === 'compaction');
  if (!compactionBlock) {
    return null;
  }
  return (compactionBlock as { type: string; content?: string }).content || null;
}

/**
 * Calculate tokens saved from compaction based on usage iterations.
 * The API provides per-iteration token counts.
 */
export function calculateTokensSaved(
  usage: {
    input_tokens: number;
    output_tokens: number;
    iterations?: Array<{
      type: string;
      input_tokens: number;
      output_tokens: number;
    }>;
  }
): number {
  if (!usage.iterations || usage.iterations.length <= 1) {
    return 0;
  }

  // Find compaction iteration
  const compactionIteration = usage.iterations.find(i => i.type === 'compaction');
  const messageIteration = usage.iterations.find(i => i.type === 'message');

  if (!compactionIteration || !messageIteration) {
    return 0;
  }

  // Tokens saved = input tokens before compaction - input tokens after
  return compactionIteration.input_tokens - messageIteration.input_tokens;
}

// ===========================================
// Message History Helpers
// ===========================================

/**
 * Serialize a response content array for storage.
 * Preserves compaction blocks so they work on the next API call.
 */
export function serializeResponseContent(
  content: Array<{ type: string; text?: string; content?: string }>
): string {
  // If there are compaction blocks, store the full array as JSON
  if (hasCompactionBlock(content)) {
    return JSON.stringify(content);
  }
  // Otherwise, store as plain text for backwards compatibility
  return extractTextFromCompactedResponse(content);
}

/**
 * Deserialize stored message content back to API-compatible format.
 * Handles both plain text (legacy) and JSON content arrays (compacted).
 */
export function deserializeMessageContent(
  stored: string
): string | Array<{ type: string; text?: string; content?: string }> {
  // Try to parse as JSON content array
  if (stored.startsWith('[')) {
    try {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].type) {
        return parsed;
      }
    } catch {
      // Not JSON, treat as plain text
    }
  }

  // Plain text (legacy or non-compacted)
  return stored;
}

/**
 * Estimate token count for a message (rough: ~4 chars per token).
 * Used to decide whether to enable compaction.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Estimate total tokens for a conversation history.
 */
export function estimateConversationTokens(
  messages: Array<{ content: string }>,
  systemPrompt: string
): number {
  const messageTokens = messages.reduce(
    (sum, msg) => sum + estimateTokens(msg.content),
    0
  );
  return messageTokens + estimateTokens(systemPrompt);
}

/**
 * Determine if compaction should be enabled for a conversation.
 * Only worth enabling if the conversation is approaching the threshold.
 */
export function shouldEnableCompaction(
  estimatedTokens: number,
  threshold: number = DEFAULT_CONFIG.triggerThreshold
): boolean {
  // Enable if we're within 30% of the threshold
  return estimatedTokens > threshold * 0.7;
}
