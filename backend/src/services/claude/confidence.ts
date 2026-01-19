/**
 * Claude Confidence Module
 *
 * Provides confidence scoring for AI-structured ideas.
 * Uses multilingual keyword matching and pattern recognition.
 *
 * @module services/claude/confidence
 */

import { StructuredIdea } from '../../utils/ollama';

// ===========================================
// Types
// ===========================================

/**
 * Confidence scores for a structured idea
 */
export interface ConfidenceScores {
  overall: number;
  type: number;
  category: number;
  priority: number;
  summary: number;
}

/**
 * Extended response with confidence scores
 */
export interface StructuredIdeaWithConfidence extends StructuredIdea {
  confidence: {
    overall: number;
    type: number;
    category: number;
    priority: number;
  };
  confidenceLevel: 'high' | 'medium' | 'low';
  suggestCorrection: boolean;
  thinkingUsed?: boolean;
}

// ===========================================
// Keyword Configuration
// ===========================================

interface KeywordConfig {
  de: string[];
  en: string[];
  patterns: RegExp[];
}

/**
 * Enhanced type keywords with multilingual support and semantic variations
 */
const TYPE_KEYWORDS: Record<string, KeywordConfig> = {
  idea: {
    de: ['idee', 'vorschlag', 'könnten', 'vielleicht', 'was wäre wenn', 'konzept', 'ansatz', 'möglichkeit', 'option', 'alternativ'],
    en: ['idea', 'thought', 'concept', 'could', 'maybe', 'what if', 'suggestion', 'proposal', 'approach', 'possibility'],
    patterns: [/könnte man/i, /was wenn/i, /wie wäre/i, /what about/i, /how about/i, /we could/i],
  },
  task: {
    de: ['aufgabe', 'muss', 'soll', 'todo', 'erledigen', 'machen', 'deadline', 'bis', 'fertig', 'umsetzen', 'implementieren', 'abarbeiten'],
    en: ['task', 'must', 'should', 'todo', 'complete', 'do', 'deadline', 'finish', 'implement', 'execute', 'deliver', 'action item'],
    patterns: [/muss ich/i, /sollte ich/i, /i need to/i, /have to/i, /don't forget/i, /nicht vergessen/i, /bis (morgen|heute|nächste)/i],
  },
  problem: {
    de: ['problem', 'fehler', 'bug', 'issue', 'nicht funktioniert', 'kaputt', 'defekt', 'schwierigkeit', 'herausforderung', 'blockiert', 'hängt'],
    en: ['problem', 'error', 'bug', 'issue', 'broken', 'not working', 'defect', 'difficulty', 'challenge', 'blocked', 'stuck'],
    patterns: [/funktioniert nicht/i, /geht nicht/i, /doesn't work/i, /won't work/i, /is broken/i, /hat einen fehler/i],
  },
  question: {
    de: ['frage', 'warum', 'wie', 'was', 'wer', 'wann', 'wo', 'wieso', 'weshalb', 'wozu', 'ob'],
    en: ['question', 'why', 'how', 'what', 'who', 'when', 'where', 'which', 'whether', 'wonder'],
    patterns: [/\?$/, /\?["\s]/, /frage mich/i, /i wonder/i, /do you know/i, /weißt du/i, /kannst du erklären/i],
  },
  insight: {
    de: ['erkannt', 'gelernt', 'verstanden', 'erkenntnis', 'aha', 'realisiert', 'bemerkt', 'festgestellt', 'entdeckt', 'herausgefunden'],
    en: ['insight', 'learned', 'understood', 'realized', 'noticed', 'discovered', 'found out', 'figured out', 'recognized', 'eureka'],
    patterns: [/mir ist aufgefallen/i, /ich habe erkannt/i, /i realized/i, /i noticed/i, /turns out/i, /it seems/i, /interessant.*dass/i],
  },
};

/**
 * Enhanced category keywords with multilingual support
 */
const CATEGORY_KEYWORDS: Record<string, KeywordConfig> = {
  business: {
    de: ['business', 'geschäft', 'kunde', 'kunden', 'verkauf', 'meeting', 'projekt', 'umsatz', 'gewinn', 'marketing', 'strategie', 'wettbewerb', 'markt', 'vertrieb', 'partner'],
    en: ['business', 'customer', 'client', 'sales', 'meeting', 'project', 'revenue', 'profit', 'marketing', 'strategy', 'competition', 'market', 'partnership', 'stakeholder'],
    patterns: [/mit (dem )?(kunde|client)/i, /im meeting/i, /geschäftlich/i, /business-/i, /b2b|b2c/i],
  },
  technical: {
    de: ['code', 'api', 'software', 'bug', 'feature', 'system', 'datenbank', 'server', 'deployment', 'architektur', 'framework', 'bibliothek', 'funktion', 'klasse', 'interface'],
    en: ['code', 'api', 'software', 'bug', 'feature', 'system', 'database', 'server', 'deployment', 'architecture', 'framework', 'library', 'function', 'class', 'interface', 'endpoint'],
    patterns: [/\b(react|vue|angular|node|python|java|typescript|javascript|sql|docker|kubernetes|aws|azure|gcp)\b/i, /\.(ts|js|py|java|go|rs)(\s|$)/i],
  },
  personal: {
    de: ['ich', 'mir', 'mein', 'meine', 'privat', 'hobby', 'zuhause', 'familie', 'freund', 'gesundheit', 'fitness', 'urlaub', 'freizeit'],
    en: ['i', 'me', 'my', 'mine', 'private', 'hobby', 'home', 'family', 'friend', 'health', 'fitness', 'vacation', 'leisure', 'personal'],
    patterns: [/für mich (selbst|persönlich)/i, /in meiner freizeit/i, /for myself/i, /my own/i, /work-life/i],
  },
  learning: {
    de: ['lernen', 'kurs', 'buch', 'tutorial', 'verstehen', 'wissen', 'studieren', 'recherchieren', 'nachlesen', 'schulung', 'weiterbildung', 'zertifikat'],
    en: ['learn', 'course', 'book', 'tutorial', 'understand', 'knowledge', 'study', 'research', 'training', 'certification', 'skill', 'competency'],
    patterns: [/will.*(lernen|verstehen)/i, /want to (learn|understand)/i, /how does.*work/i, /wie funktioniert/i, /dokumentation lesen/i],
  },
};

/**
 * Enhanced priority indicators with contextual patterns
 */
const PRIORITY_INDICATORS: Record<string, KeywordConfig> = {
  high: {
    de: ['dringend', 'sofort', 'asap', 'wichtig', 'kritisch', 'deadline', 'heute', 'morgen', 'blocker', 'notfall', 'eilig', 'priorität'],
    en: ['urgent', 'immediately', 'asap', 'important', 'critical', 'deadline', 'today', 'tomorrow', 'blocker', 'emergency', 'rush', 'priority'],
    patterns: [/bis (heute|morgen|übermorgen)/i, /by (today|tomorrow)/i, /muss.*sofort/i, /must.*immediately/i, /höchste priorität/i, /top priority/i, /\bp1\b/i],
  },
  medium: {
    de: ['bald', 'sollte', 'wichtig', 'relevant', 'nächste woche', 'zeitnah', 'demnächst'],
    en: ['soon', 'should', 'important', 'relevant', 'next week', 'timely', 'shortly'],
    patterns: [/in den nächsten (tagen|wochen)/i, /in the next (few|couple)/i, /when possible/i, /wenn möglich/i, /\bp2\b/i],
  },
  low: {
    de: ['irgendwann', 'später', 'nice to have', 'optional', 'wäre schön', 'eventuell', 'vielleicht mal', 'backlog'],
    en: ['sometime', 'later', 'nice to have', 'optional', 'would be nice', 'eventually', 'maybe', 'backlog', 'low priority'],
    patterns: [/wenn zeit ist/i, /when there's time/i, /nicht dringend/i, /not urgent/i, /\bp3\b/i, /nice.*to.*have/i],
  },
};

// ===========================================
// Confidence Calculation
// ===========================================

/**
 * Count keyword and pattern matches for a given config
 */
function countMatches(text: string, lowerText: string, config: KeywordConfig): number {
  let matches = 0;

  // Keyword matches (DE + EN)
  matches += [...config.de, ...config.en].filter(kw =>
    lowerText.includes(kw.toLowerCase())
  ).length;

  // Pattern matches (weighted higher)
  matches += config.patterns.filter(p => p.test(text)).length * 1.5;

  return matches;
}

/**
 * Get confidence level label from overall score
 */
export function getConfidenceLevel(confidence: number): 'high' | 'medium' | 'low' {
  if (confidence >= 0.8) return 'high';
  if (confidence >= 0.5) return 'medium';
  return 'low';
}

/**
 * Calculate confidence scores for a structured idea
 * Based on completeness and quality heuristics
 * Enhanced with multilingual support (DE/EN), semantic patterns, and contextual analysis
 *
 * @param structured - The structured idea to evaluate
 * @param transcript - The original transcript text
 * @returns Confidence scores for each field
 */
export function calculateConfidence(
  structured: StructuredIdea,
  transcript: string
): ConfidenceScores {
  const lowerTranscript = transcript.toLowerCase();

  // Calculate type confidence with pattern matching
  const typeConfig = TYPE_KEYWORDS[structured.type];
  const typeMatches = typeConfig ? countMatches(transcript, lowerTranscript, typeConfig) : 0;
  const typeConfidence = Math.min(0.4 + typeMatches * 0.12, 1.0);

  // Calculate category confidence with pattern matching
  const catConfig = CATEGORY_KEYWORDS[structured.category];
  const catMatches = catConfig ? countMatches(transcript, lowerTranscript, catConfig) : 0;
  const categoryConfidence = Math.min(0.4 + catMatches * 0.1, 1.0);

  // Calculate priority confidence with pattern matching
  const prioConfig = PRIORITY_INDICATORS[structured.priority];
  let prioMatches = 0;
  if (prioConfig) {
    prioMatches += [...prioConfig.de, ...prioConfig.en].filter(kw =>
      lowerTranscript.includes(kw.toLowerCase())
    ).length;
    // Patterns weighted higher for priority
    prioMatches += prioConfig.patterns.filter(p => p.test(transcript)).length * 2;
  }
  const priorityConfidence = prioMatches > 0 ? Math.min(0.5 + prioMatches * 0.12, 1.0) : 0.45;

  // Enhanced summary confidence: based on completeness, coherence, and actionability
  const summaryLength = structured.summary?.length || 0;
  const hasSummary = summaryLength > 20;
  const summaryQuality = Math.min(summaryLength / 200, 1.0);

  // Bonus for actionable summaries (contains verbs, specific details)
  const hasActionableContent = structured.next_steps?.length > 0 ||
    /\b(sollte|muss|wird|können|should|must|will|can)\b/i.test(structured.summary || '');
  const hasKeywords = (structured.keywords?.length || 0) >= 2;
  const hasContext = (structured.context_needed?.length || 0) > 0;

  const summaryBonus = (hasActionableContent ? 0.1 : 0) + (hasKeywords ? 0.05 : 0) + (hasContext ? 0.05 : 0);
  const summaryConfidence = hasSummary ? Math.min(0.4 + summaryQuality * 0.4 + summaryBonus, 1.0) : 0.3;

  // Calculate completeness score
  const completenessFactors = [
    structured.title && structured.title.length > 5 ? 1 : 0,
    structured.summary && structured.summary.length > 30 ? 1 : 0,
    (structured.next_steps?.length || 0) > 0 ? 1 : 0,
    (structured.keywords?.length || 0) >= 2 ? 1 : 0,
  ];
  const completenessScore = completenessFactors.reduce((a, b) => a + b, 0) / completenessFactors.length;

  // Overall confidence: weighted average with completeness factor
  const baseOverall = (
    typeConfidence * 0.25 +
    categoryConfidence * 0.25 +
    priorityConfidence * 0.2 +
    summaryConfidence * 0.2 +
    completenessScore * 0.1
  );

  // Apply penalty for very short transcripts (less reliable classification)
  const lengthPenalty = transcript.length < 50 ? 0.85 : (transcript.length < 100 ? 0.92 : 1.0);
  const overall = baseOverall * lengthPenalty;

  return {
    overall: Math.round(overall * 100) / 100,
    type: Math.round(typeConfidence * 100) / 100,
    category: Math.round(categoryConfidence * 100) / 100,
    priority: Math.round(priorityConfidence * 100) / 100,
    summary: Math.round(summaryConfidence * 100) / 100,
  };
}

/**
 * Create a StructuredIdeaWithConfidence from base idea and transcript
 *
 * @param idea - The base structured idea
 * @param transcript - The original transcript
 * @param thinkingUsed - Whether Extended Thinking was used
 * @returns Idea with confidence scores
 */
export function addConfidenceToIdea(
  idea: StructuredIdea,
  transcript: string,
  thinkingUsed = false
): StructuredIdeaWithConfidence {
  const scores = calculateConfidence(idea, transcript);

  return {
    ...idea,
    confidence: {
      overall: scores.overall,
      type: scores.type,
      category: scores.category,
      priority: scores.priority,
    },
    confidenceLevel: getConfidenceLevel(scores.overall),
    suggestCorrection: scores.overall < 0.6,
    thinkingUsed,
  };
}
