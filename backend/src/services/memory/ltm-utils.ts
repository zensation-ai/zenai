/**
 * Long-Term Memory Utility Functions
 *
 * Extracted from long-term-memory.ts (Phase 119 Architecture Decomposition)
 * Contains negation detection, string similarity, and JSON parsing utilities.
 */

import { logger } from '../../utils/logger';

// ===========================================
// Negation Detection (Phase 112)
// ===========================================

/**
 * Result of negation detection analysis.
 */
export interface NegationResult {
  /** Whether the text contains a negation */
  isNegated: boolean;
  /** The target of the negation (the thing being negated), or null */
  negationTarget: string | null;
  /** Confidence in the negation detection (0-1) */
  confidence: number;
}

/**
 * Negation patterns for English and German.
 * Each pattern includes a regex and the group index for the negation target.
 */
const NEGATION_PATTERNS_WITH_TARGET = [
  // English patterns
  { regex: /\b(?:does(?:n't|n't| not)|doesn't)\s+(\w+(?:\s+\w+)?)/i, lang: 'en' as const },
  { regex: /\b(?:is(?:n't|n't| not)|isn't)\s+(\w+(?:\s+\w+)?)/i, lang: 'en' as const },
  { regex: /\b(?:has(?:n't|n't| not)|hasn't)\s+(\w+(?:\s+\w+)?)/i, lang: 'en' as const },
  { regex: /\b(?:do(?:n't|n't| not)|don't)\s+(\w+(?:\s+\w+)?)/i, lang: 'en' as const },
  { regex: /\bnot\s+(\w+(?:\s+\w+)?)/i, lang: 'en' as const },
  { regex: /\bnever\s+(\w+(?:\s+\w+)?)/i, lang: 'en' as const },
  { regex: /\bno longer\s+(\w+(?:\s+\w+)?)/i, lang: 'en' as const },
  { regex: /\bno\s+(\w+(?:\s+\w+)?)/i, lang: 'en' as const },
  // German patterns
  { regex: /\bnicht\s+(?:mehr\s+)?(\w+(?:\s+\w+)?)/i, lang: 'de' as const },
  { regex: /\bkein(?:e|en|em|er|es)?\s+(\w+(?:\s+\w+)?)/i, lang: 'de' as const },
  { regex: /\bnie(?:mals)?\s+(\w+(?:\s+\w+)?)/i, lang: 'de' as const },
  { regex: /\bnicht mehr\s+(\w+(?:\s+\w+)?)/i, lang: 'de' as const },
] as const;

/** Simple negation keyword patterns (no target extraction) - order matters for counting */
const SIMPLE_NEGATION_PATTERNS = [
  /\bnot\b/i,
  /\bnever\b/i,
  /\bdoes(?:n'|')t\b/i,
  /\bdon(?:'|')t\b/i,
  /\bisn(?:'|')t\b/i,
  /\bhasn(?:'|')t\b/i,
  /\bno longer\b/i,
  /\bno\b/i,
  /\bnicht mehr\b/i,
  /\bnicht\b/i,
  /\bkein(?:e|en|em|er|es)?\b/i,
  /\bnie(?:mals)?\b/i,
];

/**
 * Detect negation in text using regex-based heuristics.
 *
 * Supports English and German negation patterns.
 * Pure CPU-only - no LLM calls.
 *
 * @param text - The text to analyze for negation
 * @returns NegationResult with isNegated flag, target, and confidence
 */
export function detectNegation(text: string): NegationResult {
  if (!text || text.trim().length === 0) {
    return { isNegated: false, negationTarget: null, confidence: 0 };
  }

  const lowerText = text.toLowerCase();

  // Count distinct negation occurrences for double-negation detection.
  // Remove already-matched regions to avoid double-counting compound patterns
  // like "nicht mehr" (which is ONE negation, not two).
  let countText = lowerText;
  let negationCount = 0;
  // Check compound patterns first, then simple ones
  const COUNTING_PATTERNS = [
    /\bnicht mehr\b/gi,
    /\bno longer\b/gi,
    /\bdoes(?:n'|'|n')t\b/gi,
    /\bdon(?:'|'|n')t\b/gi,
    /\bisn(?:'|'|n')t\b/gi,
    /\bhasn(?:'|'|n')t\b/gi,
    /\bnot\b/gi,
    /\bnever\b/gi,
    /\bno\b/gi,
    /\bnicht\b/gi,
    /\bkein(?:e|en|em|er|es)?\b/gi,
    /\bnie(?:mals)?\b/gi,
  ];
  for (const pattern of COUNTING_PATTERNS) {
    const matches = countText.match(pattern);
    if (matches) {
      negationCount += matches.length;
      // Remove matched text to prevent double-counting
      countText = countText.replace(pattern, '___');
    }
  }

  if (negationCount >= 2) {
    // Double negation: might be affirmative. Low confidence negation.
    return { isNegated: true, negationTarget: null, confidence: 0.3 };
  }

  // Try to extract negation target with detailed patterns
  for (const { regex } of NEGATION_PATTERNS_WITH_TARGET) {
    const match = text.match(regex);
    if (match && match[1]) {
      const target = match[1].trim().replace(/[.,!?;:]+$/, '');
      return {
        isNegated: true,
        negationTarget: target.length > 0 ? target : null,
        confidence: 0.85,
      };
    }
  }

  // Fallback: check simple patterns without target extraction
  for (const pattern of SIMPLE_NEGATION_PATTERNS) {
    if (pattern.test(lowerText)) {
      return { isNegated: true, negationTarget: null, confidence: 0.6 };
    }
  }

  return { isNegated: false, negationTarget: null, confidence: 0 };
}

/**
 * Compute simple string similarity between two texts using word overlap (Jaccard-like).
 * Used for finding similar facts with opposite polarity.
 *
 * @returns Similarity score 0-1
 */
export function computeStringSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let intersection = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) intersection++;
  }
  const union = new Set([...wordsA, ...wordsB]).size;
  return union > 0 ? intersection / union : 0;
}

/**
 * Strip negation words from text for comparison.
 */
export function stripNegation(text: string): string {
  return text
    .replace(/\b(?:not|never|no longer|doesn't|don't|isn't|hasn't|can't|won't)\b/gi, '')
    .replace(/\b(?:nicht|kein(?:e|en|em|er|es)?|nie(?:mals)?|nicht mehr)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Safely parse JSON with fallback value
 * Prevents crashes from corrupted database data
 */
export function safeJsonParse<T>(json: string | null | undefined, fallback: T): T {
  if (!json || typeof json !== 'string') {
    return fallback;
  }
  try {
    return JSON.parse(json) as T;
  } catch (error) {
    logger.warn('Failed to parse JSON, using fallback', {
      jsonPreview: json.substring(0, 100),
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return fallback;
  }
}
