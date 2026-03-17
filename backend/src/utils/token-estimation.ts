/**
 * Token Estimation Utility
 *
 * Provides heuristic token counting for Claude API usage estimation.
 * More accurate than the naive `text.length / 4` approach by accounting
 * for language mix, code blocks, and message structure overhead.
 *
 * @module utils/token-estimation
 */

// German-specific keywords that indicate mixed/German content (lower chars-per-token ratio)
const GERMAN_INDICATORS = /\b(der|die|das|und|ist|ein|eine|für|mit|auf|den|dem|des|nicht|sich|von|werden|haben|auch|nach|wie|über|aber|kann|noch|nur|durch|bei|oder|alle|zum|zur|wenn|mehr|sehr|schon|weil|wir|sie|ich|mein|dein|sein)\b/gi;

// Code block detection
const CODE_BLOCK_PATTERN = /```[\s\S]*?```/g;

/**
 * Estimate token count for a given text.
 *
 * Heuristic approach:
 * - English text: ~3.5 chars per token
 * - German/mixed text: ~2.5 chars per token (compound words, umlauts)
 * - Code blocks: ~3.0 chars per token (higher density due to syntax)
 * - Adds structural overhead for message framing
 *
 * @param text - The text to estimate tokens for
 * @returns Estimated token count
 */
export function estimateTokens(text: string): number {
  if (!text || text.length === 0) return 0;

  // Extract code blocks and compute them separately
  const codeBlocks = text.match(CODE_BLOCK_PATTERN) || [];
  let codeLength = 0;
  for (const block of codeBlocks) {
    codeLength += block.length;
  }
  const proseLength = text.length - codeLength;

  // Detect language mix: count German indicator words
  const germanMatches = text.match(GERMAN_INDICATORS) || [];
  const wordCount = text.split(/\s+/).length;
  const germanRatio = wordCount > 0 ? germanMatches.length / wordCount : 0;

  // Determine chars-per-token ratio for prose
  // German text uses ~2.5 chars/token, English ~3.5, blend based on ratio
  const proseRatio = germanRatio > 0.1 ? 2.5 + (1.0 * (1 - Math.min(germanRatio * 3, 1))) : 3.5;

  // Code uses ~3.0 chars/token (syntax tokens are short but frequent)
  const CODE_RATIO = 3.0;

  const proseTokens = proseLength > 0 ? Math.ceil(proseLength / proseRatio) : 0;
  const codeTokens = codeLength > 0 ? Math.ceil(codeLength / CODE_RATIO) : 0;

  return proseTokens + codeTokens;
}

/**
 * Estimate total input tokens for a chat request.
 *
 * Accounts for:
 * - System prompt tokens
 * - User message tokens
 * - Message structure overhead (~50 tokens per message for role/framing)
 * - Tool definitions overhead (~30% of tool JSON size)
 *
 * @param systemPrompt - The system prompt text
 * @param userMessage - The current user message
 * @param options - Additional estimation inputs
 * @returns Estimated total input tokens
 */
export function estimateChatInputTokens(
  systemPrompt: string,
  userMessage: string,
  options?: {
    /** Number of conversation history messages */
    historyMessageCount?: number;
    /** Approximate total length of history messages */
    historyTotalLength?: number;
    /** Whether tools are included in the request */
    hasTools?: boolean;
    /** Approximate JSON size of tool definitions */
    toolDefinitionsSize?: number;
  }
): number {
  const MESSAGE_OVERHEAD = 50; // ~50 tokens per message for role/structure framing

  let total = estimateTokens(systemPrompt) + estimateTokens(userMessage);

  // System message overhead
  total += MESSAGE_OVERHEAD;

  // User message overhead
  total += MESSAGE_OVERHEAD;

  // History messages
  if (options?.historyTotalLength) {
    total += estimateTokens('x'.repeat(options.historyTotalLength));
  }
  if (options?.historyMessageCount) {
    total += options.historyMessageCount * MESSAGE_OVERHEAD;
  }

  // Tool definitions add ~30% overhead as JSON tokens
  if (options?.hasTools && options?.toolDefinitionsSize) {
    total += Math.ceil(options.toolDefinitionsSize / 3.5 * 0.3);
  } else if (options?.hasTools) {
    // Default estimate: ~49 tools at ~100 tokens each = ~5000 tokens overhead
    total += 5000;
  }

  return total;
}
