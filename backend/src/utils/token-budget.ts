/**
 * Token Budget Management (Phase 100)
 *
 * Provides token estimation, truncation, and budget allocation
 * for assembling context within Claude's context window.
 *
 * Budget allocation:
 * - systemBase: 2K tokens
 * - workingMemory: 2K tokens
 * - personalFacts: 3K tokens
 * - ragContext: 8K tokens
 * - rest: for history
 * - If history > 80K tokens: flag for summarization
 *
 * @module utils/token-budget
 */

import { logger } from './logger';

// ===========================================
// Constants
// ===========================================

const HISTORY_SUMMARIZATION_THRESHOLD = 80000; // tokens

/**
 * Default budget allocation for context sections (in tokens).
 */
export const DEFAULT_BUDGET_ALLOCATION = {
  systemBase: 2000,
  workingMemory: 2000,
  personalFacts: 3000,
  ragContext: 8000,
} as const;

// German indicator pattern for language detection
const GERMAN_PATTERN = /\b(der|die|das|und|ist|ein|eine|für|mit|auf|den|dem|nicht|sich|von|werden|haben|auch|nach|wie|über|aber|kann|noch|nur|bei|oder|alle|wenn|sehr|weil|wir|sie|ich)\b/gi;

// ===========================================
// Types
// ===========================================

export interface ContextSections {
  systemBase?: string;
  workingMemory?: string;
  personalFacts?: string;
  ragContext?: string;
  history?: string;
}

export interface AssembledContext {
  assembled: string;
  tokenEstimate: number;
  summarizationNeeded: boolean;
  allocations: Record<string, number>;
}

// ===========================================
// Token Estimation
// ===========================================

/**
 * Estimate tokens using char/4 heuristic (char/5 for German text).
 * Simpler than the existing estimateTokens in token-estimation.ts
 * but specifically designed for budget allocation.
 */
export function estimateTokensBudget(text: string): number {
  if (!text || text.length === 0) return 0;

  // Detect German content
  const germanMatches = text.match(GERMAN_PATTERN) || [];
  const wordCount = text.split(/\s+/).length;
  const germanRatio = wordCount > 0 ? germanMatches.length / wordCount : 0;

  // German text: ~2.5 chars/token, English: ~4 chars/token
  const ratio = germanRatio > 0.1 ? 2.5 : 4;

  return Math.ceil(text.length / ratio);
}

// ===========================================
// Truncation
// ===========================================

/**
 * Truncate text to fit within a token budget, breaking at sentence boundaries.
 *
 * @param text - Text to truncate
 * @param maxTokens - Maximum token budget
 * @returns Truncated text ending at a sentence boundary
 */
export function truncateToTokenBudget(text: string, maxTokens: number): string {
  if (!text || text.length === 0) return '';

  const currentTokens = estimateTokensBudget(text);
  if (currentTokens <= maxTokens) return text;

  // Estimate max chars based on ratio
  const germanMatches = text.match(GERMAN_PATTERN) || [];
  const wordCount = text.split(/\s+/).length;
  const germanRatio = wordCount > 0 ? germanMatches.length / wordCount : 0;
  const ratio = germanRatio > 0.1 ? 2.5 : 4;
  const maxChars = Math.floor(maxTokens * ratio);

  // Truncate to maxChars
  let truncated = text.substring(0, maxChars);

  // Try to find the last sentence boundary
  const sentenceEnd = /[.!?]\s/g;
  let lastEnd = -1;
  let match;

  while ((match = sentenceEnd.exec(truncated)) !== null) {
    lastEnd = match.index + 1;
  }

  // If we found a sentence boundary in the latter half, use it
  if (lastEnd > truncated.length * 0.3) {
    truncated = truncated.substring(0, lastEnd);
  }

  return truncated.trim() || text.substring(0, Math.max(10, maxChars));
}

// ===========================================
// Context Assembly
// ===========================================

/**
 * Assemble context from multiple sections, respecting a total token budget.
 *
 * Budget allocation:
 * - Fixed sections (systemBase, workingMemory, personalFacts, ragContext)
 *   get their default allocation
 * - History gets the remainder of the total budget
 * - If history exceeds 80K tokens, flag summarizationNeeded
 *
 * @param sections - Named context sections
 * @param totalBudget - Total token budget for all sections
 * @returns Assembled context with metadata
 */
export function assembleContextWithBudget(
  sections: ContextSections,
  totalBudget: number
): AssembledContext {
  const allocations: Record<string, number> = {};
  const parts: string[] = [];
  let totalTokens = 0;

  // Calculate fixed section budgets
  const fixedBudget =
    DEFAULT_BUDGET_ALLOCATION.systemBase +
    DEFAULT_BUDGET_ALLOCATION.workingMemory +
    DEFAULT_BUDGET_ALLOCATION.personalFacts +
    DEFAULT_BUDGET_ALLOCATION.ragContext;

  // History gets the remainder
  const historyBudget = Math.max(0, totalBudget - fixedBudget);

  // Process each section with its budget
  const sectionEntries: Array<[keyof ContextSections, number]> = [
    ['systemBase', DEFAULT_BUDGET_ALLOCATION.systemBase],
    ['workingMemory', DEFAULT_BUDGET_ALLOCATION.workingMemory],
    ['personalFacts', DEFAULT_BUDGET_ALLOCATION.personalFacts],
    ['ragContext', DEFAULT_BUDGET_ALLOCATION.ragContext],
    ['history', historyBudget],
  ];

  for (const [key, budget] of sectionEntries) {
    const content = sections[key];
    if (!content || content.length === 0) continue;

    const truncated = truncateToTokenBudget(content, budget);
    const tokens = estimateTokensBudget(truncated);

    parts.push(truncated);
    allocations[key] = tokens;
    totalTokens += tokens;
  }

  // Check if history needs summarization
  const historyTokens = sections.history ? estimateTokensBudget(sections.history) : 0;
  const summarizationNeeded = historyTokens > HISTORY_SUMMARIZATION_THRESHOLD;

  if (summarizationNeeded) {
    logger.info('Context assembly: history exceeds 80K tokens, summarization recommended', {
      historyTokens,
      totalBudget,
    });
  }

  return {
    assembled: parts.join('\n\n'),
    tokenEstimate: totalTokens,
    summarizationNeeded,
    allocations,
  };
}
