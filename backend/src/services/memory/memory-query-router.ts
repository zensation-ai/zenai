/**
 * Memory Query Router — Query Classification & Extraction
 *
 * Extracted from memory-coordinator.ts (Phase 121 Architecture Decomposition)
 * Contains query analysis, constraint extraction, emotional context inference,
 * and concurrency-limited processing utility.
 */

import { logger } from '../../utils/logger';

// ===========================================
// Concurrency Utility
// ===========================================

/**
 * Process items with limited concurrency to avoid API rate limits.
 */
export async function processWithConcurrency<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  maxConcurrency: number
): Promise<R[]> {
  const results: R[] = [];
  const executing: Promise<void>[] = [];

  for (const item of items) {
    const promise = processor(item).then((result) => {
      results.push(result);
    });

    executing.push(promise);

    if (executing.length >= maxConcurrency) {
      await Promise.race(executing);
      // Remove completed promises
      const completedIndices: number[] = [];
      for (let i = 0; i < executing.length; i++) {
        // Check if promise is settled by racing with already-resolved promise
        const isSettled = await Promise.race([
          executing[i].then(() => true),
          Promise.resolve(false)
        ]);
        if (isSettled) {
          completedIndices.push(i);
        }
      }
      // Remove in reverse order to maintain indices
      for (let i = completedIndices.length - 1; i >= 0; i--) {
        executing.splice(completedIndices[i], 1);
      }
    }
  }

  // Wait for remaining promises
  await Promise.all(executing);
  return results;
}

// ===========================================
// Query Extraction
// ===========================================

/** Extracted constraint/fact from user query */
export interface ExtractedQueryItem {
  type: 'constraint' | 'fact' | 'hypothesis';
  content: string;
  priority: number;
}

/**
 * Extract implicit constraints/facts from user query using regex patterns.
 */
export async function extractFromQuery(query: string): Promise<ExtractedQueryItem[]> {
  const extracted: ExtractedQueryItem[] = [];

  // Detect constraints
  /* eslint-disable security/detect-unsafe-regex -- Patterns are bounded by sentence endings, no catastrophic backtracking */
  const constraintPatterns = [
    { pattern: /muss\s+(.+?)(?:\.|,|$)/gi, type: 'constraint' as const },
    { pattern: /sollte?\s+(.+?)(?:\.|,|$)/gi, type: 'constraint' as const },
    { pattern: /darf\s+nicht\s+(.+?)(?:\.|,|$)/gi, type: 'constraint' as const },
    { pattern: /wichtig(?:\s+ist)?[:\s]+(.+?)(?:\.|,|$)/gi, type: 'constraint' as const },
  ];
  /* eslint-enable security/detect-unsafe-regex */

  for (const { pattern, type } of constraintPatterns) {
    let match;
    while ((match = pattern.exec(query)) !== null) {
      extracted.push({
        type,
        content: match[1].trim(),
        priority: 0.8,
      });
    }
  }

  // Detect facts/assumptions
  const factPatterns = [
    { pattern: /ich\s+(?:bin|habe|arbeite)\s+(.+?)(?:\.|,|$)/gi, type: 'fact' as const },
    { pattern: /wir\s+(?:haben|nutzen|verwenden)\s+(.+?)(?:\.|,|$)/gi, type: 'fact' as const },
  ];

  for (const { pattern, type } of factPatterns) {
    let match;
    while ((match = pattern.exec(query)) !== null) {
      extracted.push({
        type,
        content: match[1].trim(),
        priority: 0.6,
      });
    }
  }

  return extracted;
}

// ===========================================
// Emotional Context Inference
// ===========================================

/**
 * Infer emotional context from query for episodic filtering.
 */
export async function inferEmotionalContext(query: string): Promise<{
  minValence?: number;
  maxValence?: number;
} | undefined> {
  const queryLower = query.toLowerCase();

  // Positive context keywords
  const positiveKeywords = ['erfolg', 'gut', 'super', 'freude', 'positiv', 'success', 'good', 'great'];
  // Negative context keywords
  const negativeKeywords = ['problem', 'fehler', 'schwierig', 'frustrier', 'error', 'issue', 'difficult'];

  const hasPositive = positiveKeywords.some(k => queryLower.includes(k));
  const hasNegative = negativeKeywords.some(k => queryLower.includes(k));

  if (hasPositive && !hasNegative) {
    return { minValence: 0.2 }; // Prefer positive episodes
  }
  if (hasNegative && !hasPositive) {
    return { maxValence: 0.2 }; // Include negative episodes (problem solving)
  }

  // Suppress unused logger warning — kept for future use
  void logger;

  return undefined; // No emotional filter
}
