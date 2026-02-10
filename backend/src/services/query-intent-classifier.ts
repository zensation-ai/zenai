/**
 * Query Intent Classifier Service
 *
 * Adaptive RAG: Determines whether retrieval is needed BEFORE calling RAG.
 * Based on Self-RAG research (2025) showing that indiscriminate retrieval
 * degrades response quality. Adaptive systems that skip retrieval for
 * simple queries are measurably better.
 *
 * 3-Tier Classification:
 * 1. Rule-based (< 1ms): Greetings, confirmations, very short messages
 * 2. Heuristic (< 5ms): Question patterns, data references, meta-questions
 * 3. LLM-based (reserved): Only when tiers 1+2 are uncertain (confidence < 0.6)
 *
 * @module services/query-intent-classifier
 */

/* eslint-disable security/detect-unsafe-regex */

import { logger } from '../utils/logger';
import { hasTemporalExpression } from './temporal-query-parser';

// ===========================================
// Types
// ===========================================

/**
 * Retrieval intent levels, from least to most retrieval
 */
export type RetrievalIntent =
  | 'skip'                // No retrieval needed (greetings, confirmations, meta)
  | 'conversation_only'   // Use conversation history, no external retrieval
  | 'quick_retrieve'      // Light retrieval (quick RAG, 1 iteration)
  | 'full_retrieve';      // Full RAG pipeline (HyDE + Agentic + Cross-Encoder)

/**
 * Classification result
 */
export interface IntentClassification {
  /** Determined retrieval intent */
  intent: RetrievalIntent;
  /** Confidence in the classification (0-1) */
  confidence: number;
  /** Which classifier tier made the decision */
  tier: 'rule_based' | 'heuristic' | 'llm';
  /** Human-readable reasoning */
  reasoning: string;
  /** Whether temporal context was detected */
  temporalDetected: boolean;
  /** Whether personal data reference was detected */
  personalReference: boolean;
}

/**
 * Conversation context for better classification
 */
export interface ConversationContext {
  /** Number of messages in current session */
  messageCount: number;
  /** Last few messages for follow-up detection */
  recentMessages?: Array<{ role: 'user' | 'assistant'; content: string }>;
  /** Current chat mode */
  currentMode?: string;
}

// ===========================================
// Rule-Based Patterns (Tier 1)
// ===========================================

/**
 * Messages that should ALWAYS skip retrieval.
 * These are unambiguous - no knowledge lookup will help.
 */
const SKIP_PATTERNS: RegExp[] = [
  // Greetings
  /^(hallo|hi|hey|guten\s+(morgen|tag|abend)|servus|moin|na)[!?.\s]*$/i,
  // Farewells
  /^(tschüss|bye|auf\s+wiedersehen|bis\s+(bald|später|dann)|ciao|adieu)[!?.\s]*$/i,
  // Confirmations
  /^(ja|nein|ok|okay|alles\s+klar|verstanden|genau|stimmt|richtig|klar|sicher|natürlich)[!?.\s]*$/i,
  // Thanks
  /^(danke|vielen\s+dank|dankeschön|thx|thanks|merci)[!?.\s]*$/i,
  // Agreements / reactions
  /^(super|toll|klasse|prima|perfekt|wunderbar|cool|nice|gut|schön|top)[!?.\s]*$/i,
  // Simple acknowledgments
  /^(aha|achso|ah\s+ok|oh|hmm|hm|interessant|spannend)[!?.\s]*$/i,
  // Meta questions about AI capabilities
  /^(was\s+)?kannst\s+du(\s+alles)?(\s+machen)?\??$/i,
  /^wer\s+bist\s+du\??$/i,
  /^wie\s+funktionierst\s+du\??$/i,
  /^hilfe\s*[!?]*$/i,
];

/**
 * Short affirmative follow-ups that don't need retrieval
 */
const FOLLOW_UP_PATTERNS: RegExp[] = [
  /^ja,?\s*(bitte|gerne|mach\s+(das|mal))[!?.\s]*$/i,
  /^(mach|tu)\s+(das|es|weiter)[!?.\s]*$/i,
  /^(erzähl|sag)\s+(mir\s+)?mehr[!?.\s]*$/i,
  /^(und|aber)\s+(was|wie|warum)\s+/i,
  /^(genauer|details|mehr\s+dazu)[!?.\s]*$/i,
  /^(kannst\s+du\s+das\s+)?(nochmal|wiederhol|erklär\s+das\s+nochmal)/i,
];

// ===========================================
// Heuristic Patterns (Tier 2)
// ===========================================

/**
 * Patterns that strongly indicate FULL retrieval is needed
 */
const FULL_RETRIEVAL_PATTERNS: Array<{ pattern: RegExp; weight: number; reason: string }> = [
  // Explicit references to user's data
  { pattern: /\b(meine?[rn]?\s+)(ideen?|notizen?|gedanken|einträge|konzepte)\b/i, weight: 0.95, reason: 'Explicit reference to user data' },
  { pattern: /\b(in\s+meinen?\s+)(notizen?|ideen?|einträgen?)\b/i, weight: 0.95, reason: 'Reference to user notes' },
  { pattern: /was\s+(habe|hatte)\s+ich\s+(zu|über|zum|zur)\b/i, weight: 0.95, reason: 'Personal recall question' },
  { pattern: /\b(laut|gemäß|basierend\s+auf)\s+meinen?\b/i, weight: 0.9, reason: 'Reference to personal knowledge' },

  // Memory/recall patterns
  { pattern: /erinner(e|st)?\s+(du\s+)?(dich|mich)\s+an\b/i, weight: 0.9, reason: 'Memory recall request' },
  { pattern: /weißt\s+du\s+noch\b/i, weight: 0.9, reason: 'Memory recall request' },
  { pattern: /haben\s+wir\s+(schon\s+)?(mal\s+)?besprochen\b/i, weight: 0.85, reason: 'Previous discussion reference' },

  // Temporal queries (strong signal for retrieval)
  { pattern: /\b(letzte[rn]?|letzten|vergangene[rn]?|vorige[rn]?)\s+(woche|monat|tage?)\b/i, weight: 0.9, reason: 'Temporal query' },
  { pattern: /\b(gestern|vorgestern|heute\s+(morgen|früh))\b/i, weight: 0.85, reason: 'Temporal query' },
  { pattern: /\bvor\s+\d+\s+(tagen?|wochen?|monaten?)\b/i, weight: 0.9, reason: 'Temporal query' },
  { pattern: /\b(im|seit|bis)\s+(januar|februar|märz|april|mai|juni|juli|august|september|oktober|november|dezember)\b/i, weight: 0.85, reason: 'Temporal query' },

  // Knowledge synthesis requests
  { pattern: /\b(fasse|zusammenfass|überblick|übersicht)\b.*\b(alle|meine|gesamt)\b/i, weight: 0.95, reason: 'Synthesis request' },
  { pattern: /was\s+weiß\s+(ich|du)\s+(über|zu|von)\b/i, weight: 0.9, reason: 'Knowledge overview request' },
];

/**
 * Patterns indicating QUICK retrieval (supplementary context)
 */
const QUICK_RETRIEVAL_PATTERNS: Array<{ pattern: RegExp; weight: number; reason: string }> = [
  // General questions that might benefit from context
  { pattern: /^(was|wie|warum|wann|wo|wer)\s+/i, weight: 0.7, reason: 'Question word detected' },
  // Topic-specific questions
  { pattern: /\b(zum\s+thema|bezüglich|hinsichtlich|in\s+bezug\s+auf)\b/i, weight: 0.75, reason: 'Topic-specific question' },
  // Comparison/analysis requests
  { pattern: /\b(vergleiche|analysiere|bewerte|einschätze)\b/i, weight: 0.75, reason: 'Analysis request' },
];

/**
 * Patterns indicating the message is about the AI itself (skip retrieval)
 */
const META_PATTERNS: RegExp[] = [
  /\b(kannst|könntest)\s+du\s+(mir\s+)?(helfen|erklären|sagen|zeigen)\b/i,
  /\bwie\s+kann\s+ich\s+(dich|die\s+app|zenai)\b/i,
  /\b(einstellungen?|settings?|konfiguration)\b/i,
  /\b(bug|fehler|problem)\s+(bei|mit|in)\s+(dir|der\s+app|zenai)\b/i,
];

// ===========================================
// Query Intent Classifier
// ===========================================

/**
 * Classify the retrieval intent for a user message.
 *
 * Performance targets:
 * - Tier 1 (rule-based): < 1ms
 * - Tier 2 (heuristic): < 5ms
 * - Tier 3 (LLM): < 2000ms (only when confidence < 0.6)
 */
export function classifyIntent(
  message: string,
  conversationContext?: ConversationContext
): IntentClassification {
  const startTime = performance.now();
  const trimmed = message.trim();
  const normalized = normalizeForClassification(trimmed);

  // ===== Tier 1: Rule-Based (fastest) =====
  const ruleResult = classifyRuleBased(trimmed, normalized, conversationContext);
  if (ruleResult.confidence >= 0.8) {
    const elapsed = performance.now() - startTime;
    logger.debug('Intent classified (rule-based)', {
      intent: ruleResult.intent,
      confidence: ruleResult.confidence,
      elapsed: `${elapsed.toFixed(2)}ms`,
    });
    return ruleResult;
  }

  // ===== Tier 2: Heuristic (fast) =====
  const heuristicResult = classifyHeuristic(normalized, trimmed, conversationContext);

  // If heuristic is confident enough, use it
  if (heuristicResult.confidence >= 0.6) {
    const elapsed = performance.now() - startTime;
    logger.debug('Intent classified (heuristic)', {
      intent: heuristicResult.intent,
      confidence: heuristicResult.confidence,
      elapsed: `${elapsed.toFixed(2)}ms`,
    });
    return heuristicResult;
  }

  // Merge rule-based and heuristic if both have partial signals
  if (ruleResult.confidence > 0 && heuristicResult.confidence > 0) {
    const merged = mergeClassifications(ruleResult, heuristicResult);
    if (merged.confidence >= 0.6) {
      const elapsed = performance.now() - startTime;
      logger.debug('Intent classified (merged rule+heuristic)', {
        intent: merged.intent,
        confidence: merged.confidence,
        elapsed: `${elapsed.toFixed(2)}ms`,
      });
      return merged;
    }
  }

  // ===== Default: conversation_only with moderate confidence =====
  // For messages that don't clearly need retrieval but aren't simple either,
  // default to conversation_only. This avoids expensive RAG calls while
  // still allowing Claude to use conversation history.
  const elapsed = performance.now() - startTime;
  const defaultResult: IntentClassification = {
    intent: 'conversation_only',
    confidence: 0.5,
    tier: 'heuristic',
    reasoning: 'No strong retrieval signals detected, defaulting to conversation context',
    temporalDetected: false,
    personalReference: false,
  };

  logger.debug('Intent classified (default)', {
    intent: defaultResult.intent,
    confidence: defaultResult.confidence,
    elapsed: `${elapsed.toFixed(2)}ms`,
  });

  return defaultResult;
}

// ===========================================
// Tier 1: Rule-Based Classification
// ===========================================

function classifyRuleBased(
  original: string,
  normalized: string,
  context?: ConversationContext
): IntentClassification {
  // Very short messages (< 5 chars) → skip
  if (normalized.length < 5) {
    return {
      intent: 'skip',
      confidence: 0.95,
      tier: 'rule_based',
      reasoning: 'Message too short for meaningful retrieval',
      temporalDetected: false,
      personalReference: false,
    };
  }

  // Check skip patterns (greetings, confirmations, etc.)
  for (const pattern of SKIP_PATTERNS) {
    if (pattern.test(original)) {
      return {
        intent: 'skip',
        confidence: 0.95,
        tier: 'rule_based',
        reasoning: 'Greeting/confirmation/meta-question - no retrieval needed',
        temporalDetected: false,
        personalReference: false,
      };
    }
  }

  // Check follow-up patterns (requires conversation context)
  if (context && context.messageCount > 0) {
    for (const pattern of FOLLOW_UP_PATTERNS) {
      if (pattern.test(original)) {
        return {
          intent: 'conversation_only',
          confidence: 0.85,
          tier: 'rule_based',
          reasoning: 'Follow-up message - use existing conversation context',
          temporalDetected: false,
          personalReference: false,
        };
      }
    }
  }

  // Check meta patterns
  for (const pattern of META_PATTERNS) {
    if (pattern.test(original)) {
      return {
        intent: 'skip',
        confidence: 0.8,
        tier: 'rule_based',
        reasoning: 'Meta-question about AI/app - no data retrieval needed',
        temporalDetected: false,
        personalReference: false,
      };
    }
  }

  // No rule-based match
  return {
    intent: 'conversation_only',
    confidence: 0.3,
    tier: 'rule_based',
    reasoning: 'No rule-based patterns matched',
    temporalDetected: false,
    personalReference: false,
  };
}

// ===========================================
// Tier 2: Heuristic Classification
// ===========================================

function classifyHeuristic(
  normalized: string,
  original: string,
  _context?: ConversationContext
): IntentClassification {
  let bestIntent: RetrievalIntent = 'conversation_only';
  let bestConfidence = 0;
  let bestReason = '';
  let temporalDetected = false;
  let personalReference = false;

  // Check full retrieval patterns
  for (const { pattern, weight, reason } of FULL_RETRIEVAL_PATTERNS) {
    if (pattern.test(original) || pattern.test(normalized)) {
      if (weight > bestConfidence) {
        bestIntent = 'full_retrieve';
        bestConfidence = weight;
        bestReason = reason;
      }
      // Track specific signals
      if (reason.includes('Temporal')) {temporalDetected = true;}
      if (reason.includes('Personal') || reason.includes('user data') || reason.includes('user notes')) {
        personalReference = true;
      }
    }
  }

  // If we already have a strong full retrieval signal, return it
  if (bestConfidence >= 0.85) {
    return {
      intent: bestIntent,
      confidence: bestConfidence,
      tier: 'heuristic',
      reasoning: bestReason,
      temporalDetected,
      personalReference,
    };
  }

  // Check quick retrieval patterns
  for (const { pattern, weight, reason } of QUICK_RETRIEVAL_PATTERNS) {
    if (pattern.test(original) || pattern.test(normalized)) {
      // Quick patterns only win if no full retrieval pattern was found
      if (bestIntent !== 'full_retrieve' && weight > bestConfidence) {
        bestIntent = 'quick_retrieve';
        bestConfidence = weight;
        bestReason = reason;
      }
    }
  }

  // Use temporal parser's quick check for additional temporal detection
  if (!temporalDetected && hasTemporalExpression(original)) {
    temporalDetected = true;
    if (bestConfidence < 0.8) {
      bestIntent = 'full_retrieve';
      bestConfidence = Math.max(bestConfidence, 0.85);
      bestReason = 'Temporal expression detected via parser';
    }
  }

  // Combined signal: personal pronoun + question → boost to full
  if (/\b(mein|ich|wir|unser)\b/i.test(original) && /^(was|wie|warum|wann|wo|wer)\s/i.test(original)) {
    if (bestIntent === 'quick_retrieve') {
      bestIntent = 'full_retrieve';
      bestConfidence = Math.max(bestConfidence, 0.8);
      bestReason = 'Personal question with question word - full retrieval recommended';
      personalReference = true;
    }
  }

  // Message length heuristic: very long messages often contain enough context
  if (normalized.length > 500 && bestConfidence < 0.6) {
    bestIntent = 'conversation_only';
    bestConfidence = Math.max(bestConfidence, 0.6);
    bestReason = 'Long message likely contains sufficient context';
  }

  return {
    intent: bestIntent,
    confidence: bestConfidence,
    tier: 'heuristic',
    reasoning: bestReason || 'Heuristic analysis found weak signals',
    temporalDetected,
    personalReference,
  };
}

// ===========================================
// Helpers
// ===========================================

function normalizeForClassification(message: string): string {
  return message
    .toLowerCase()
    .replace(/[.,!?;:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function mergeClassifications(
  a: IntentClassification,
  b: IntentClassification
): IntentClassification {
  // Higher-confidence classification wins
  const primary = a.confidence >= b.confidence ? a : b;
  const secondary = a.confidence >= b.confidence ? b : a;

  // If both agree on intent, boost confidence
  if (primary.intent === secondary.intent) {
    return {
      ...primary,
      confidence: Math.min(primary.confidence + secondary.confidence * 0.3, 1.0),
      reasoning: `${primary.reasoning} (confirmed by ${secondary.tier})`,
      temporalDetected: primary.temporalDetected || secondary.temporalDetected,
      personalReference: primary.personalReference || secondary.personalReference,
    };
  }

  // If they disagree, use the primary but note the conflict
  return {
    ...primary,
    reasoning: `${primary.reasoning} (${secondary.tier} suggested ${secondary.intent})`,
    temporalDetected: primary.temporalDetected || secondary.temporalDetected,
    personalReference: primary.personalReference || secondary.personalReference,
  };
}

// ===========================================
// Utility: Intent to RAG Config Mapping
// ===========================================

/**
 * Map a retrieval intent to concrete RAG behavior.
 * Used by general-chat.ts to configure retrieval.
 */
export interface RetrievalConfig {
  /** Whether to run RAG at all */
  shouldRetrieve: boolean;
  /** Use HyDE (slow but more accurate) */
  enableHyDE: boolean;
  /** Use cross-encoder reranking */
  enableCrossEncoder: boolean;
  /** Max results to retrieve */
  maxResults: number;
  /** Max agentic iterations */
  maxIterations: number;
}

export function intentToRetrievalConfig(intent: RetrievalIntent): RetrievalConfig {
  switch (intent) {
    case 'skip':
      return {
        shouldRetrieve: false,
        enableHyDE: false,
        enableCrossEncoder: false,
        maxResults: 0,
        maxIterations: 0,
      };
    case 'conversation_only':
      return {
        shouldRetrieve: false,
        enableHyDE: false,
        enableCrossEncoder: false,
        maxResults: 0,
        maxIterations: 0,
      };
    case 'quick_retrieve':
      return {
        shouldRetrieve: true,
        enableHyDE: false,
        enableCrossEncoder: false,
        maxResults: 5,
        maxIterations: 1,
      };
    case 'full_retrieve':
      return {
        shouldRetrieve: true,
        enableHyDE: true,
        enableCrossEncoder: true,
        maxResults: 8,
        maxIterations: 3,
      };
  }
}
