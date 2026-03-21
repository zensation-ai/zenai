/**
 * Memory Statistics & Scoring Functions
 *
 * Extracted from memory-coordinator.ts (Phase 121 Architecture Decomposition)
 * Contains decay calculation, importance scoring, type boosting,
 * diversity constraints, and token budget fitting.
 */

import { logger } from '../../utils/logger';
import type { ContextPart } from './memory-coordinator';

// ===========================================
// Configuration
// ===========================================

const CONFIG = {
  /** Approximate chars per token (for estimation) */
  CHARS_PER_TOKEN: 4,
  /** Priority weights for different memory types */
  PRIORITY_WEIGHTS: {
    working: 1.0,      // Highest priority (current task)
    episodic: 0.7,     // Recent experiences
    short_term: 0.8,   // Session context
    long_term: 0.6,    // Persistent knowledge
    pre_retrieved: 0.5, // Related documents
  },
};

// ===========================================
// Decay Calculation
// ===========================================

/**
 * Calculate time-based relevance decay.
 * Older context becomes less relevant over time.
 */
export function calculateDecay(timestamp: number | undefined, decayRate: number = 0.05): number {
  if (!timestamp) { return 1.0; }

  const now = Date.now();
  // Handle future timestamps (data corruption) - no decay for future items
  if (timestamp > now) {
    logger.debug('Future timestamp detected in decay calculation', { timestamp, now });
    return 1.0;
  }

  const ageMs = now - timestamp;
  const ageHours = ageMs / (1000 * 60 * 60);

  // Exponential decay: relevance decreases over time
  // After ~24 hours, relevance is ~30% of original
  return Math.exp(-decayRate * ageHours);
}

// ===========================================
// Importance Scoring
// ===========================================

/**
 * Calculate importance score for three-factor retrieval.
 * Based on source layer priority and content characteristics.
 * Range: 0.3 - 1.0 (never zero to prevent score collapse)
 */
export function getImportanceScore(part: ContextPart): number {
  // Source-based importance (from memory layer priority)
  const sourceImportance: Record<ContextPart['source'], number> = {
    working: 1.0,         // Active task = highest importance
    episodic: 0.8,        // Concrete past experiences
    short_term: 0.75,     // Current session context
    long_term: 0.7,       // Persistent knowledge
    pre_retrieved: 0.55,  // Related documents
    knowledge_graph: 0.6, // Graph-expanded context
  };
  const baseImportance = sourceImportance[part.source] || 0.5;

  // Content length bonus: longer, more detailed content slightly more important
  const contentLength = part.content.length;
  const lengthBonus = contentLength > 200 ? 1.1 : contentLength > 50 ? 1.0 : 0.9;

  // Ensure minimum importance (prevent score collapse in multiplicative formula)
  return Math.max(0.3, Math.min(1.0, baseImportance * lengthBonus));
}

// ===========================================
// Type Boosting
// ===========================================

/**
 * Apply type-based relevance boost.
 * Some context types are inherently more important.
 */
export function getTypeBoost(type: ContextPart['type']): number {
  const boosts: Record<ContextPart['type'], number> = {
    'working': 1.3,      // Working memory (current task) - highest priority
    'summary': 1.2,      // Conversation summaries are very important
    'episode': 1.15,     // Episodic memories (concrete experiences)
    'fact': 1.1,         // Known facts about user
    'pattern': 1.0,      // Behavioral patterns
    'document': 0.95,    // Pre-retrieved documents
    'interaction': 0.9,  // Past interactions
    'hint': 0.85,        // Contextual hints
  };
  return boosts[type] || 1.0;
}

// ===========================================
// Diversity Constraint
// ===========================================

/**
 * Apply diversity constraint to avoid too many entries of the same type.
 */
export function applyDiversity(parts: ContextPart[], maxPerType: number): ContextPart[] {
  const typeCounts: Record<string, number> = {};
  const result: ContextPart[] = [];

  for (const part of parts) {
    const count = typeCounts[part.type] || 0;
    if (count < maxPerType) {
      result.push(part);
      typeCounts[part.type] = count + 1;
    }
  }

  return result;
}

// ===========================================
// Token Budget Fitting
// ===========================================

/**
 * Fit context parts to token budget.
 */
export function fitToTokenBudget(
  parts: ContextPart[],
  maxTokens: number
): { parts: ContextPart[]; estimatedTokens: number } {
  // Sort by relevance
  const sorted = [...parts].sort((a, b) => b.relevance - a.relevance);

  const result: ContextPart[] = [];
  let totalTokens = 0;

  for (const part of sorted) {
    const partTokens = Math.ceil(part.content.length / CONFIG.CHARS_PER_TOKEN);

    if (totalTokens + partTokens <= maxTokens) {
      result.push(part);
      totalTokens += partTokens;
    } else if (totalTokens < maxTokens * 0.9) {
      // Try to fit a truncated version
      const availableTokens = maxTokens - totalTokens - 10; // Reserve for "..."
      const availableChars = availableTokens * CONFIG.CHARS_PER_TOKEN;

      if (availableChars > 50) {
        result.push({
          ...part,
          content: part.content.substring(0, availableChars) + '...',
        });
        totalTokens = maxTokens;
      }
      break;
    } else {
      break;
    }
  }

  return { parts: result, estimatedTokens: totalTokens };
}
