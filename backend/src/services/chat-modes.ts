/**
 * Chat Mode Detection Service
 *
 * Intelligently determines the optimal processing mode for chat messages.
 * This enables the system to automatically select the best approach:
 * - Simple conversation (fast, no tools)
 * - Tool-assisted (structured actions)
 * - Agent mode (complex multi-step reasoning)
 * - RAG-enhanced (knowledge retrieval)
 *
 * @module services/chat-modes
 */

import { logger } from '../utils/logger';

// ===========================================
// Types & Interfaces
// ===========================================

/**
 * Available chat processing modes
 */
export type ChatMode =
  | 'conversation'      // Standard conversational response
  | 'tool_assisted'     // Requires tool execution (search, create, calculate)
  | 'agent'             // Complex multi-step task requiring reasoning
  | 'rag_enhanced';     // Needs knowledge retrieval from ideas

/**
 * Result of mode detection
 */
export interface ModeDetectionResult {
  /** Detected mode */
  mode: ChatMode;
  /** Confidence in the detection (0-1) */
  confidence: number;
  /** Human-readable reasoning */
  reasoning: string;
  /** Suggested tools for tool_assisted mode */
  suggestedTools?: string[];
  /** Patterns that matched */
  matchedPatterns?: string[];
}

/**
 * RAG decision result
 */
export interface RAGDecision {
  shouldUse: boolean;
  reason: string;
  urgency: 'required' | 'recommended' | 'optional';
}

// ===========================================
// Pattern Definitions
// ===========================================

/**
 * Patterns that indicate tool_assisted mode
 * These suggest the user wants to perform a specific action
 */
const TOOL_PATTERNS: Array<{ pattern: RegExp; tools: string[]; weight: number }> = [
  // Search patterns
  { pattern: /such(e|en?)\s+(nach\s+)?(meine[rn]?|in\s+meinen?)/i, tools: ['search_ideas'], weight: 0.95 },
  { pattern: /find(e|en?)\s+(meine[rn]?|alle)/i, tools: ['search_ideas'], weight: 0.9 },
  { pattern: /zeig(e?|en?)\s+(mir\s+)?(meine[rn]?|alle)/i, tools: ['search_ideas'], weight: 0.85 },
  { pattern: /wie\s+viele\s+(ideen?|notizen?|einträge)/i, tools: ['search_ideas'], weight: 0.9 },
  { pattern: /gibt\s+es\s+(ideen?|notizen?)\s+(zu|über|zum)/i, tools: ['search_ideas'], weight: 0.85 },

  // Create patterns
  { pattern: /erstell(e|en?)\s+(eine?\s+)?(neue[rn]?)?\s*(idee|notiz|eintrag)/i, tools: ['create_idea'], weight: 0.95 },
  { pattern: /speicher(e|n?)\s+(das|diese?|folgende)/i, tools: ['create_idea'], weight: 0.9 },
  { pattern: /notier(e|en?)\s+(dir\s+)?/i, tools: ['create_idea'], weight: 0.85 },
  { pattern: /leg(e?)\s+(eine?\s+)?(neue[rn]?)?\s*(idee|notiz)\s+an/i, tools: ['create_idea'], weight: 0.9 },

  // Remember/Recall patterns
  { pattern: /merk(e?)\s+(dir|es\s+dir)/i, tools: ['remember'], weight: 0.95 },
  { pattern: /erinner(e|st)?\s+(dich|mich)/i, tools: ['recall'], weight: 0.9 },
  { pattern: /vergiss\s+nicht/i, tools: ['remember'], weight: 0.85 },
  { pattern: /was\s+(hatte|habe)\s+ich\s+(dir\s+)?gesagt/i, tools: ['recall'], weight: 0.9 },

  // Calculate patterns
  { pattern: /berechn(e|en?)/i, tools: ['calculate'], weight: 0.95 },
  { pattern: /rechne\s+(aus|zusammen)/i, tools: ['calculate'], weight: 0.9 },
  { pattern: /wie\s+viel\s+(ist|sind|ergibt)/i, tools: ['calculate'], weight: 0.8 },
  { pattern: /(\d+\s*[\+\-\*\/]\s*\d+)/i, tools: ['calculate'], weight: 0.85 },

  // Related ideas patterns
  { pattern: /verwandte\s+(ideen?|notizen?|themen?)/i, tools: ['get_related_ideas'], weight: 0.9 },
  { pattern: /ähnliche\s+(ideen?|notizen?)/i, tools: ['get_related_ideas'], weight: 0.9 },
  { pattern: /was\s+hängt\s+(damit\s+)?zusammen/i, tools: ['get_related_ideas'], weight: 0.85 },
  { pattern: /verbundene\s+(ideen?|konzepte?)/i, tools: ['get_related_ideas'], weight: 0.85 },
];

/**
 * Patterns that indicate agent mode (complex multi-step tasks)
 */
const AGENT_PATTERNS: Array<{ pattern: RegExp; weight: number }> = [
  // Multi-step indicators
  { pattern: /analysiere\s+.{10,}\s+und\s+(dann\s+)?(erstelle|fasse|generiere)/i, weight: 0.95 },
  { pattern: /vergleiche\s+.{5,}\s+mit\s+/i, weight: 0.9 },
  { pattern: /fasse\s+.{5,}\s+zusammen\s+und\s+/i, weight: 0.9 },
  { pattern: /recherchiere\s+.{5,}\s+und\s+(erstelle|schreibe|generiere)/i, weight: 0.95 },

  // Overview/synthesis requests
  { pattern: /gib\s+(mir\s+)?(einen?\s+)?überblick\s+über\s+(alle|meine)/i, weight: 0.9 },
  { pattern: /fasse\s+(alle|meine)\s+.{5,}\s+zusammen/i, weight: 0.9 },
  { pattern: /was\s+sind\s+(die\s+)?hauptthemen/i, weight: 0.85 },
  { pattern: /identifiziere\s+(muster|trends|themen)/i, weight: 0.9 },

  // Complex analysis
  { pattern: /analysiere\s+(die\s+)?(entwicklung|trends?|muster)/i, weight: 0.85 },
  { pattern: /erstelle\s+(einen?\s+)?(bericht|report|analyse)\s+(über|zu)/i, weight: 0.9 },
  { pattern: /evaluiere\s+/i, weight: 0.85 },

  // Planning requests
  { pattern: /plane\s+.{10,}\s+basierend\s+auf/i, weight: 0.9 },
  { pattern: /entwickle\s+(eine?\s+)?strategie/i, weight: 0.9 },
];

/**
 * Patterns that indicate RAG enhancement is needed
 */
const RAG_PATTERNS: Array<{ pattern: RegExp; urgency: 'required' | 'recommended'; weight: number }> = [
  // Explicit knowledge references
  { pattern: /was\s+(habe|hatte)\s+ich\s+(zu|über|zum)/i, urgency: 'required', weight: 0.95 },
  { pattern: /laut\s+meinen?\s+(notizen?|ideen?)/i, urgency: 'required', weight: 0.95 },
  { pattern: /basierend\s+auf\s+meinen?/i, urgency: 'required', weight: 0.9 },
  { pattern: /gemäß\s+meinen?/i, urgency: 'required', weight: 0.9 },

  // Memory/recall references
  { pattern: /erinner(e|st)?\s+(dich|mich)\s+an/i, urgency: 'required', weight: 0.9 },
  { pattern: /weißt\s+du\s+noch/i, urgency: 'required', weight: 0.85 },
  { pattern: /haben\s+wir\s+(schon\s+)?(mal\s+)?besprochen/i, urgency: 'required', weight: 0.85 },

  // Context references
  { pattern: /im\s+kontext\s+(meiner?|von|der)/i, urgency: 'recommended', weight: 0.8 },
  { pattern: /wie\s+(bei|in)\s+meiner?\s+(letzten?|früheren?)/i, urgency: 'recommended', weight: 0.8 },

  // Personal knowledge questions
  { pattern: /was\s+weiß\s+(ich|du)\s+(über|zu|von)/i, urgency: 'recommended', weight: 0.75 },
  { pattern: /habe\s+ich\s+(schon\s+)?(mal|bereits)/i, urgency: 'recommended', weight: 0.75 },
];

// ===========================================
// Core Detection Functions
// ===========================================

/**
 * Detect the optimal chat mode for a message
 *
 * @param message - The user's message
 * @returns Mode detection result with confidence
 */
export function detectChatMode(message: string): ModeDetectionResult {
  const normalizedMessage = normalizeMessage(message);
  const matchedPatterns: string[] = [];

  // 1. Check for Agent patterns first (most complex)
  const agentScore = checkAgentPatterns(normalizedMessage, matchedPatterns);
  if (agentScore.confidence >= 0.85) {
    logger.debug('Agent mode detected', { confidence: agentScore.confidence, patterns: matchedPatterns });
    return {
      mode: 'agent',
      confidence: agentScore.confidence,
      reasoning: agentScore.reasoning,
      matchedPatterns,
    };
  }

  // 2. Check for Tool patterns
  const toolScore = checkToolPatterns(normalizedMessage, matchedPatterns);
  if (toolScore.confidence >= 0.8) {
    logger.debug('Tool mode detected', {
      confidence: toolScore.confidence,
      tools: toolScore.suggestedTools,
      patterns: matchedPatterns,
    });
    return {
      mode: 'tool_assisted',
      confidence: toolScore.confidence,
      reasoning: toolScore.reasoning,
      suggestedTools: toolScore.suggestedTools,
      matchedPatterns,
    };
  }

  // 3. Check for RAG patterns
  const ragScore = checkRAGPatterns(normalizedMessage, matchedPatterns);
  if (ragScore.confidence >= 0.75) {
    logger.debug('RAG mode detected', { confidence: ragScore.confidence, patterns: matchedPatterns });
    return {
      mode: 'rag_enhanced',
      confidence: ragScore.confidence,
      reasoning: ragScore.reasoning,
      matchedPatterns,
    };
  }

  // 4. Check for lower-confidence tool patterns
  if (toolScore.confidence >= 0.6) {
    return {
      mode: 'tool_assisted',
      confidence: toolScore.confidence,
      reasoning: toolScore.reasoning,
      suggestedTools: toolScore.suggestedTools,
      matchedPatterns,
    };
  }

  // 5. Default to conversation
  return {
    mode: 'conversation',
    confidence: 0.9,
    reasoning: 'No special patterns detected, using standard conversation',
    matchedPatterns: [],
  };
}

/**
 * Determine if RAG should be used regardless of mode
 */
export function shouldEnhanceWithRAG(message: string, mode: ChatMode): RAGDecision {
  // Always use RAG in rag_enhanced mode
  if (mode === 'rag_enhanced') {
    return {
      shouldUse: true,
      reason: 'Mode explicitly requires RAG',
      urgency: 'required',
    };
  }

  const normalizedMessage = normalizeMessage(message);
  const matchedPatterns: string[] = [];
  const ragScore = checkRAGPatterns(normalizedMessage, matchedPatterns);

  if (ragScore.confidence >= 0.7) {
    return {
      shouldUse: true,
      reason: ragScore.reasoning,
      urgency: ragScore.urgency,
    };
  }

  // Check for personal pronouns + question pattern
  if (/^(was|wie|warum|wann|wo|wer)\s/i.test(message) && /\b(mein|ich|wir|unser)\b/i.test(message)) {
    return {
      shouldUse: true,
      reason: 'Personal knowledge question detected',
      urgency: 'recommended',
    };
  }

  return {
    shouldUse: false,
    reason: 'No RAG indicators detected',
    urgency: 'optional',
  };
}

// ===========================================
// Pattern Checking Helpers
// ===========================================

function checkAgentPatterns(
  message: string,
  matchedPatterns: string[]
): { confidence: number; reasoning: string } {
  let maxWeight = 0;
  let matchedPattern: string | null = null;

  for (const { pattern, weight } of AGENT_PATTERNS) {
    if (pattern.test(message)) {
      matchedPatterns.push(pattern.source);
      if (weight > maxWeight) {
        maxWeight = weight;
        matchedPattern = pattern.source;
      }
    }
  }

  // Boost for multiple patterns
  if (matchedPatterns.length >= 2) {
    maxWeight = Math.min(maxWeight + 0.05, 1.0);
  }

  return {
    confidence: maxWeight,
    reasoning: matchedPattern
      ? `Agent pattern matched: complex multi-step task`
      : 'No agent patterns matched',
  };
}

function checkToolPatterns(
  message: string,
  matchedPatterns: string[]
): {
  confidence: number;
  reasoning: string;
  suggestedTools: string[];
} {
  let maxWeight = 0;
  const suggestedTools = new Set<string>();
  let matchedPattern: string | null = null;

  for (const { pattern, tools, weight } of TOOL_PATTERNS) {
    if (pattern.test(message)) {
      matchedPatterns.push(pattern.source);
      tools.forEach(t => suggestedTools.add(t));
      if (weight > maxWeight) {
        maxWeight = weight;
        matchedPattern = pattern.source;
      }
    }
  }

  // Keyword analysis for additional tool hints
  const keywordTools = analyzeKeywordsForTools(message);
  keywordTools.forEach(t => suggestedTools.add(t));

  if (keywordTools.length > 0 && maxWeight < 0.6) {
    maxWeight = Math.max(maxWeight, 0.6);
  }

  return {
    confidence: maxWeight,
    reasoning: matchedPattern
      ? `Tool pattern matched: ${Array.from(suggestedTools).join(', ')}`
      : 'Tool keywords detected',
    suggestedTools: Array.from(suggestedTools),
  };
}

function checkRAGPatterns(
  message: string,
  matchedPatterns: string[]
): {
  confidence: number;
  reasoning: string;
  urgency: 'required' | 'recommended' | 'optional';
} {
  let maxWeight = 0;
  let urgency: 'required' | 'recommended' | 'optional' = 'optional';
  let matchedPattern: string | null = null;

  for (const { pattern, urgency: patternUrgency, weight } of RAG_PATTERNS) {
    if (pattern.test(message)) {
      matchedPatterns.push(pattern.source);
      if (weight > maxWeight) {
        maxWeight = weight;
        urgency = patternUrgency;
        matchedPattern = pattern.source;
      }
    }
  }

  return {
    confidence: maxWeight,
    reasoning: matchedPattern
      ? `RAG pattern matched: knowledge retrieval ${urgency}`
      : 'No RAG patterns matched',
    urgency,
  };
}

// ===========================================
// Utility Functions
// ===========================================

/**
 * Normalize message for pattern matching
 */
function normalizeMessage(message: string): string {
  return message
    .toLowerCase()
    .replace(/[.,!?;:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Analyze keywords for tool suggestions
 */
function analyzeKeywordsForTools(message: string): string[] {
  const tools: string[] = [];
  const lowerMessage = message.toLowerCase();

  const toolKeywords: Record<string, string[]> = {
    search_ideas: ['ideen', 'notizen', 'suchen', 'finden', 'durchsuchen', 'liste'],
    create_idea: ['erstellen', 'anlegen', 'speichern', 'merken', 'notieren', 'aufschreiben'],
    calculate: ['berechnen', 'rechnen', 'prozent', 'summe', 'durchschnitt', 'addieren'],
    get_related_ideas: ['verwandt', 'ähnlich', 'zusammenhang', 'verbunden', 'bezug'],
    remember: ['merken', 'vergessen', 'behalten'],
    recall: ['erinnern', 'früher', 'gesagt', 'erwähnt'],
  };

  for (const [tool, keywords] of Object.entries(toolKeywords)) {
    if (keywords.some(kw => lowerMessage.includes(kw))) {
      tools.push(tool);
    }
  }

  return tools;
}

/**
 * Get the default tools for a mode
 */
export function getDefaultToolsForMode(mode: ChatMode): string[] {
  switch (mode) {
    case 'tool_assisted':
      return ['search_ideas', 'create_idea', 'calculate', 'remember', 'recall'];
    case 'agent':
      return ['search_ideas', 'create_idea', 'get_related_ideas', 'calculate', 'remember', 'recall'];
    case 'rag_enhanced':
      return ['search_ideas', 'recall'];
    default:
      return [];
  }
}

/**
 * Check if a message is a simple greeting/small talk
 */
export function isSimpleConversation(message: string): boolean {
  const simplePatterns = [
    /^(hallo|hi|hey|guten\s+(morgen|tag|abend)|servus|moin)/i,
    /^(danke|vielen\s+dank|thx|thanks)/i,
    /^(ja|nein|ok|okay|alles\s+klar|verstanden)/i,
    /^wie\s+geht('?s|\s+es\s+dir)/i,
    /^(tschüss|bye|auf\s+wiedersehen|bis\s+(bald|später|dann))/i,
  ];

  return simplePatterns.some(p => p.test(message.trim()));
}
