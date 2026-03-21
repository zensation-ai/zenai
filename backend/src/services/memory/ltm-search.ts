/**
 * Long-Term Memory Search & Retrieval Functions
 *
 * Extracted from long-term-memory.ts (Phase 121 Architecture Decomposition)
 * Contains composite importance scoring, contextual memory building,
 * and context-dependent retrieval boost logic.
 */

import type { PersonalizationFact, FrequentPattern, SignificantInteraction } from './long-term-memory';
import { captureEncodingContext, calculateContextSimilarity, type EncodingContext } from './context-enrichment';

// ===========================================
// Configuration (mirrored from main file)
// ===========================================

const COMPOSITE_WEIGHTS = {
  recency: 0.3,    // How recently the fact was confirmed/retrieved
  usage: 0.4,      // How often the fact is actually used in conversations
  confidence: 0.3,  // How reliable the fact source is
};

// ===========================================
// Composite Importance Scoring
// ===========================================

/**
 * Compute composite importance score for a fact.
 *
 * Three-factor scoring (based on 2026 State-of-the-Art research):
 * - Recency (0.3): How recently the fact was confirmed or retrieved
 * - Usage (0.4): How frequently the fact is retrieved and useful
 * - Confidence (0.3): How reliable the source and how often confirmed
 *
 * Returns a score between 0 and 1.
 */
export function computeCompositeImportance(fact: PersonalizationFact): number {
  const now = Date.now();
  const w = COMPOSITE_WEIGHTS;

  // 1. Recency score (exponential decay from last confirmation or retrieval)
  const lastActive = fact.lastRetrieved
    ? Math.max(fact.lastConfirmed.getTime(), fact.lastRetrieved.getTime())
    : fact.lastConfirmed.getTime();
  const daysSinceActive = (now - lastActive) / (1000 * 60 * 60 * 24);
  const recencyScore = Math.exp(-0.02 * daysSinceActive); // ~50% after 35 days

  // 2. Usage score (logarithmic, based on retrieval count + occurrences)
  const totalUsage = fact.retrievalCount + fact.occurrences;
  const usageScore = Math.min(1.0, Math.log(1 + totalUsage) / Math.log(20)); // Saturates at ~20 uses

  // 3. Confidence score (direct)
  const confidenceScore = fact.confidence;

  return (w.recency * recencyScore) + (w.usage * usageScore) + (w.confidence * confidenceScore);
}

// ===========================================
// Contextual Memory Building
// ===========================================

/**
 * Build a contextual memory string for Claude from retrieved memory parts.
 */
export function buildContextualMemory(
  facts: PersonalizationFact[],
  patterns: FrequentPattern[],
  interactions: SignificantInteraction[]
): string {
  const parts: string[] = [];

  if (facts.length > 0) {
    parts.push(`[Bekannte Fakten]\n${facts.map(f => `- ${f.content}`).join('\n')}`);
  }

  if (patterns.length > 0) {
    parts.push(`[Erkannte Muster]\n${patterns.map(p => `- ${p.pattern}`).join('\n')}`);
  }

  if (interactions.length > 0) {
    parts.push(`[Relevante frühere Gespräche]\n${interactions.map(i => `- ${i.summary}`).join('\n')}`);
  }

  return parts.join('\n\n');
}

// ===========================================
// Context-Dependent Retrieval Boost
// ===========================================

/**
 * Apply context-dependent retrieval boost to a set of facts.
 * Memories encoded in a similar context get up to 30% retrieval boost.
 */
export function applyContextBoostToFacts(
  facts: Array<{ encodingContext?: EncodingContext | null; score: number }>
): void {
  const currentCtx = captureEncodingContext();

  for (const item of facts) {
    if (item.encodingContext) {
      const similarity = calculateContextSimilarity(item.encodingContext, currentCtx);
      item.score *= similarity.boost;
    }
  }
}
