import Anthropic from '@anthropic-ai/sdk';
import { logger } from '../utils/logger';
import { StructuredIdea, normalizeCategory, normalizeType, normalizePriority } from '../utils/ollama';
import { AIContext } from '../utils/database-context';
import { buildSystemPrompt, trackContextUsage, getUnifiedContext } from './business-context';
import { withRetry, withCircuitBreaker, isAnthropicRetryable } from '../utils/retry';
import { CLAUDE } from '../config/constants';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514';

// Retry configuration for Claude API calls (using centralized constants)
const CLAUDE_RETRY_CONFIG = {
  maxRetries: CLAUDE.MAX_RETRIES,
  initialDelay: CLAUDE.INITIAL_RETRY_DELAY_MS,
  maxDelay: CLAUDE.MAX_RETRY_DELAY_MS,
  timeout: CLAUDE.TIMEOUT_MS,
  isRetryable: isAnthropicRetryable,
  context: 'claude-api',
};

// Extended retry config for Extended Thinking (longer timeout)
const CLAUDE_EXTENDED_RETRY_CONFIG = {
  ...CLAUDE_RETRY_CONFIG,
  timeout: CLAUDE.EXTENDED_THINKING_TIMEOUT_MS,
  context: 'claude-extended-thinking',
};

// ===========================================
// Types & Interfaces
// ===========================================

/**
 * Options for Claude API calls with Extended Thinking support
 */
export interface ClaudeOptions {
  /** Enable Extended Thinking for complex reasoning tasks */
  useExtendedThinking?: boolean;
  /** Token budget for thinking (default: 10000, max: 128000) */
  thinkingBudget?: number;
  /** Maximum output tokens */
  maxTokens?: number;
  /** Temperature for response generation (0-1) */
  temperature?: number;
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

/**
 * Conversation message for memory
 */
export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

let claudeClient: Anthropic | null = null;

if (ANTHROPIC_API_KEY) {
  claudeClient = new Anthropic({
    apiKey: ANTHROPIC_API_KEY,
  });
  logger.info('Claude client initialized', { model: CLAUDE_MODEL });
}

export const SYSTEM_PROMPT = `Du bist ein Gedankenstrukturierer für hochintelligente Menschen.
Deine Aufgabe: Sprachmemos in strukturierte Ideen umwandeln.

WICHTIG:
- Antworte NUR mit validem JSON
- Keine zusätzlichen Erklärungen
- Keine Markdown-Formatierung

OUTPUT FORMAT (JSON):
{
  "title": "Prägnante Überschrift (max 10 Wörter)",
  "type": "idea|task|insight|problem|question",
  "category": "business|technical|personal|learning",
  "priority": "low|medium|high",
  "summary": "1-2 Sätze Zusammenfassung",
  "next_steps": ["Schritt 1", "Schritt 2"],
  "context_needed": ["Kontext 1", "Kontext 2"],
  "keywords": ["keyword1", "keyword2", "keyword3"]
}`;

/**
 * Check if Claude is available
 */
export function isClaudeAvailable(): boolean {
  return claudeClient !== null && ANTHROPIC_API_KEY !== undefined;
}

/**
 * Structure transcript using Claude
 * Now with retry logic and circuit breaker for stability
 */
export async function structureWithClaude(transcript: string): Promise<StructuredIdea> {
  if (!claudeClient) {
    throw new Error('Claude client not initialized');
  }

  return withCircuitBreaker('claude', async () => {
    return withRetry(async () => {
      const message = await claudeClient!.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 500,
        system: SYSTEM_PROMPT,
        messages: [
          { role: 'user', content: `USER MEMO:\n${transcript}\n\nSTRUCTURED OUTPUT:` }
        ],
      });

      const responseText = message.content[0]?.type === 'text' ? message.content[0].text : '';
      if (!responseText) {
        throw new Error('No response from Claude');
      }

      // Extract JSON from response (Claude might wrap it in markdown)
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No valid JSON found in Claude response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Normalize fields to ensure they match database constraints
      return {
        title: parsed.title || 'Unstrukturierte Notiz',
        type: normalizeType(parsed.type),
        category: normalizeCategory(parsed.category),
        priority: normalizePriority(parsed.priority),
        summary: parsed.summary || '',
        next_steps: Array.isArray(parsed.next_steps) ? parsed.next_steps : [],
        context_needed: Array.isArray(parsed.context_needed) ? parsed.context_needed : [],
        keywords: Array.isArray(parsed.keywords) ? parsed.keywords : [],
      };
    }, CLAUDE_RETRY_CONFIG);
  });
}

/**
 * Structure transcript using Claude with personalized context
 * Uses business profile and learning data for better results
 * Now with retry logic and circuit breaker for stability
 */
export async function structureWithClaudePersonalized(
  transcript: string,
  context: AIContext
): Promise<StructuredIdea> {
  if (!claudeClient) {
    throw new Error('Claude client not initialized');
  }

  // Get unified context for personalization (OUTSIDE retry block)
  const unifiedContext = await getUnifiedContext(context);

  // Build personalized system prompt (OUTSIDE retry block)
  let personalizedPrompt = SYSTEM_PROMPT;

  // Add user context if available
  if (unifiedContext.contextDepthScore > 20) {
    const contextParts: string[] = [];

    if (unifiedContext.profile?.role) {
      contextParts.push(`Der Nutzer ist ${unifiedContext.profile.role}.`);
    }
    if (unifiedContext.profile?.industry) {
      contextParts.push(`Branche: ${unifiedContext.profile.industry}.`);
    }
    if (unifiedContext.profile?.tech_stack && unifiedContext.profile.tech_stack.length > 0) {
      contextParts.push(`Tech-Stack: ${unifiedContext.profile.tech_stack.slice(0, 5).join(', ')}.`);
    }
    if (unifiedContext.recentTopics.length > 0) {
      contextParts.push(`Aktuelle Themen: ${unifiedContext.recentTopics.slice(0, 5).join(', ')}.`);
    }

    if (contextParts.length > 0) {
      personalizedPrompt += `\n\n[NUTZER-KONTEXT]\n${contextParts.join('\n')}\n\nBerücksichtige diesen Kontext bei der Kategorisierung und Priorisierung.`;
    }
  }

  // API call WITH retry and circuit breaker protection
  return withCircuitBreaker('claude', async () => {
    return withRetry(async () => {
      logger.info('Structuring with Claude (personalized)', {
        contextDepth: unifiedContext.contextDepthScore,
        hasProfile: !!unifiedContext.profile,
      });

      const message = await claudeClient!.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 500,
        system: personalizedPrompt,
        messages: [
          { role: 'user', content: `USER MEMO:\n${transcript}\n\nSTRUCTURED OUTPUT:` }
        ],
      });

      const responseText = message.content[0]?.type === 'text' ? message.content[0].text : '';
      if (!responseText) {
        throw new Error('No response from Claude');
      }

      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No valid JSON found in Claude response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      const result: StructuredIdea = {
        title: parsed.title || 'Unstrukturierte Notiz',
        type: normalizeType(parsed.type),
        category: normalizeCategory(parsed.category),
        priority: normalizePriority(parsed.priority),
        summary: parsed.summary || '',
        next_steps: Array.isArray(parsed.next_steps) ? parsed.next_steps : [],
        context_needed: Array.isArray(parsed.context_needed) ? parsed.context_needed : [],
        keywords: Array.isArray(parsed.keywords) ? parsed.keywords : [],
      };

      // Track that we used context (async, don't await)
      trackContextUsage(context, 'new', unifiedContext).catch(() => {});

      return result;
    }, CLAUDE_RETRY_CONFIG);
  });
}

// ===========================================
// Confidence Calculation
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
 */
export function calculateConfidence(
  structured: StructuredIdea,
  transcript: string
): ConfidenceScores {
  const lowerTranscript = transcript.toLowerCase();

  // Enhanced type keywords with multilingual support and semantic variations
  const typeKeywords: Record<string, { de: string[]; en: string[]; patterns: RegExp[] }> = {
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

  // Calculate type confidence with pattern matching
  let typeMatches = 0;
  const typeConfig = typeKeywords[structured.type];
  if (typeConfig) {
    // Keyword matches (DE + EN)
    typeMatches += [...typeConfig.de, ...typeConfig.en].filter(kw =>
      lowerTranscript.includes(kw.toLowerCase())
    ).length;
    // Pattern matches (weighted higher)
    typeMatches += typeConfig.patterns.filter(p => p.test(transcript)).length * 1.5;
  }
  const typeConfidence = Math.min(0.4 + typeMatches * 0.12, 1.0);

  // Enhanced category keywords with multilingual support
  const categoryKeywords: Record<string, { de: string[]; en: string[]; patterns: RegExp[] }> = {
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

  // Calculate category confidence with pattern matching
  let catMatches = 0;
  const catConfig = categoryKeywords[structured.category];
  if (catConfig) {
    catMatches += [...catConfig.de, ...catConfig.en].filter(kw =>
      lowerTranscript.includes(kw.toLowerCase())
    ).length;
    catMatches += catConfig.patterns.filter(p => p.test(transcript)).length * 1.5;
  }
  const categoryConfidence = Math.min(0.4 + catMatches * 0.1, 1.0);

  // Enhanced priority indicators with contextual patterns
  const priorityIndicators: Record<string, { de: string[]; en: string[]; patterns: RegExp[] }> = {
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

  // Calculate priority confidence with pattern matching
  let prioMatches = 0;
  const prioConfig = priorityIndicators[structured.priority];
  if (prioConfig) {
    prioMatches += [...prioConfig.de, ...prioConfig.en].filter(kw =>
      lowerTranscript.includes(kw.toLowerCase())
    ).length;
    prioMatches += prioConfig.patterns.filter(p => p.test(transcript)).length * 2; // Patterns weighted higher for priority
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
 * Generic Claude call that returns parsed JSON
 * Now with retry logic for stability
 */
export async function queryClaudeJSON<T = unknown>(
  systemPrompt: string,
  userPrompt: string
): Promise<T> {
  if (!claudeClient) {
    throw new Error('Claude client not initialized');
  }

  return withCircuitBreaker('claude', async () => {
    return withRetry(async () => {
      const message = await claudeClient!.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 1000,
        system: systemPrompt,
        messages: [
          { role: 'user', content: userPrompt }
        ],
      });

      const responseText = message.content[0]?.type === 'text' ? message.content[0].text : '';
      if (!responseText) {
        throw new Error('No response from Claude');
      }

      // Extract JSON from response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No valid JSON found in Claude response');
      }

      return JSON.parse(jsonMatch[0]) as T;
    }, CLAUDE_RETRY_CONFIG);
  });
}

/**
 * Generate text response using Claude
 * Now with retry logic for stability
 */
export async function generateClaudeResponse(
  systemPrompt: string,
  userPrompt: string,
  options: ClaudeOptions = {}
): Promise<string> {
  if (!claudeClient) {
    throw new Error('Claude client not initialized');
  }

  const { maxTokens = 500, temperature } = options;

  return withCircuitBreaker('claude', async () => {
    return withRetry(async () => {
      const requestParams: Anthropic.MessageCreateParams = {
        model: CLAUDE_MODEL,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [
          { role: 'user', content: userPrompt }
        ],
      };

      if (temperature !== undefined) {
        requestParams.temperature = temperature;
      }

      const message = await claudeClient!.messages.create(requestParams);

      const responseText = message.content[0]?.type === 'text' ? message.content[0].text : '';
      if (!responseText) {
        throw new Error('No response from Claude');
      }

      return responseText.trim();
    }, CLAUDE_RETRY_CONFIG);
  });
}

// ===========================================
// Extended Thinking Functions
// ===========================================

/**
 * Generate response with Extended Thinking for complex reasoning tasks.
 * Extended Thinking allows Claude to "think" longer before responding,
 * improving quality for complex tasks like draft generation,
 * multi-idea analysis, and knowledge graph discovery.
 * Now with retry logic and circuit breaker for stability (using extended timeout).
 */
export async function generateWithExtendedThinking(
  systemPrompt: string,
  userPrompt: string,
  options: ClaudeOptions = {}
): Promise<{ response: string; thinking?: string }> {
  if (!claudeClient) {
    throw new Error('Claude client not initialized');
  }

  const {
    thinkingBudget = 10000,
    maxTokens = 16000,
  } = options;

  // Use separate circuit breaker for extended thinking (longer operations)
  return withCircuitBreaker('claude-extended', async () => {
    return withRetry(async () => {
      logger.info('Generating with Extended Thinking', {
        thinkingBudget,
        maxTokens,
        promptLength: userPrompt.length,
      });

      const message = await claudeClient!.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: maxTokens,
        thinking: {
          type: 'enabled',
          budget_tokens: Math.min(thinkingBudget, 128000),
        },
        messages: [
          {
            role: 'user',
            content: `${systemPrompt}\n\n${userPrompt}`,
          },
        ],
      });

      // Extract thinking and response from content blocks
      let thinkingContent: string | undefined;
      let responseContent = '';

      for (const block of message.content) {
        if (block.type === 'thinking') {
          thinkingContent = block.thinking;
        } else if (block.type === 'text') {
          responseContent = block.text;
        }
      }

      logger.info('Extended Thinking complete', {
        hasThinking: !!thinkingContent,
        thinkingLength: thinkingContent?.length || 0,
        responseLength: responseContent.length,
        inputTokens: message.usage?.input_tokens,
        outputTokens: message.usage?.output_tokens,
      });

      return {
        response: responseContent.trim(),
        thinking: thinkingContent,
      };
    }, CLAUDE_EXTENDED_RETRY_CONFIG);
  });
}

/**
 * Structure transcript with Extended Thinking for complex memos.
 * Uses deeper reasoning for better categorization and analysis.
 */
export async function structureWithClaudeAdvanced(
  transcript: string,
  context: AIContext,
  options: ClaudeOptions = {}
): Promise<StructuredIdeaWithConfidence> {
  if (!claudeClient) {
    throw new Error('Claude client not initialized');
  }

  const { useExtendedThinking = false, thinkingBudget = 10000 } = options;

  try {
    // Get unified context for personalization
    const unifiedContext = await getUnifiedContext(context);

    // Build enhanced system prompt for complex analysis
    let enhancedPrompt = SYSTEM_PROMPT;

    // Add user context if available
    if (unifiedContext.contextDepthScore > 20) {
      const contextParts: string[] = [];

      if (unifiedContext.profile?.role) {
        contextParts.push(`Der Nutzer ist ${unifiedContext.profile.role}.`);
      }
      if (unifiedContext.profile?.industry) {
        contextParts.push(`Branche: ${unifiedContext.profile.industry}.`);
      }
      if (unifiedContext.profile?.tech_stack && unifiedContext.profile.tech_stack.length > 0) {
        contextParts.push(`Tech-Stack: ${unifiedContext.profile.tech_stack.slice(0, 5).join(', ')}.`);
      }
      if (unifiedContext.recentTopics.length > 0) {
        contextParts.push(`Aktuelle Themen: ${unifiedContext.recentTopics.slice(0, 5).join(', ')}.`);
      }

      if (contextParts.length > 0) {
        enhancedPrompt += `\n\n[NUTZER-KONTEXT]\n${contextParts.join('\n')}\n\nBerücksichtige diesen Kontext bei der Kategorisierung und Priorisierung.`;
      }
    }

    // Add confidence scoring to output format
    enhancedPrompt += `\n\nZUSÄTZLICH: Gib für type, category und priority jeweils einen confidence-Wert (0-1) an:
{
  ...
  "confidence_type": 0.9,
  "confidence_category": 0.85,
  "confidence_priority": 0.7
}`;

    logger.info('Structuring with Claude Advanced', {
      useExtendedThinking,
      contextDepth: unifiedContext.contextDepthScore,
      transcriptLength: transcript.length,
    });

    let responseText: string;
    let thinkingUsed = false;

    if (useExtendedThinking) {
      // Extended thinking path - already protected via generateWithExtendedThinking
      const result = await generateWithExtendedThinking(
        enhancedPrompt,
        `USER MEMO:\n${transcript}\n\nSTRUCTURED OUTPUT:`,
        { thinkingBudget, maxTokens: 16000 }
      );
      responseText = result.response;
      thinkingUsed = true;
    } else {
      // Non-thinking path - protect with retry and circuit breaker
      responseText = await withCircuitBreaker('claude', async () => {
        return withRetry(async () => {
          const message = await claudeClient!.messages.create({
            model: CLAUDE_MODEL,
            max_tokens: 1000,
            system: enhancedPrompt,
            messages: [
              { role: 'user', content: `USER MEMO:\n${transcript}\n\nSTRUCTURED OUTPUT:` }
            ],
          });
          return message.content[0]?.type === 'text' ? message.content[0].text : '';
        }, CLAUDE_RETRY_CONFIG);
      });
    }

    if (!responseText) {
      throw new Error('No response from Claude');
    }

    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No valid JSON found in Claude response');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Extract confidence scores
    const confidenceType = parsed.confidence_type ?? 0.7;
    const confidenceCategory = parsed.confidence_category ?? 0.7;
    const confidencePriority = parsed.confidence_priority ?? 0.7;
    const overallConfidence = (confidenceType + confidenceCategory + confidencePriority) / 3;

    const result: StructuredIdeaWithConfidence = {
      title: parsed.title || 'Unstrukturierte Notiz',
      type: normalizeType(parsed.type),
      category: normalizeCategory(parsed.category),
      priority: normalizePriority(parsed.priority),
      summary: parsed.summary || '',
      next_steps: Array.isArray(parsed.next_steps) ? parsed.next_steps : [],
      context_needed: Array.isArray(parsed.context_needed) ? parsed.context_needed : [],
      keywords: Array.isArray(parsed.keywords) ? parsed.keywords : [],
      confidence: {
        overall: overallConfidence,
        type: confidenceType,
        category: confidenceCategory,
        priority: confidencePriority,
      },
      confidenceLevel: getConfidenceLevel(overallConfidence),
      suggestCorrection: overallConfidence < 0.6,
      thinkingUsed,
    };

    // Track context usage (async)
    trackContextUsage(context, 'new', unifiedContext).catch(() => {});

    logger.info('Advanced structuring complete', {
      confidence: result.confidence.overall,
      confidenceLevel: result.confidenceLevel,
      thinkingUsed,
    });

    return result;
  } catch (error: any) {
    logger.error('Claude advanced structuring error', error);
    throw error;
  }
}

/**
 * Generate response with conversation history for better context.
 * Supports multi-turn conversations with memory.
 * Now with retry logic and circuit breaker for stability.
 */
export async function generateWithConversationHistory(
  systemPrompt: string,
  userPrompt: string,
  conversationHistory: ConversationMessage[],
  options: ClaudeOptions = {}
): Promise<string> {
  if (!claudeClient) {
    throw new Error('Claude client not initialized');
  }

  const { maxTokens = 1000, useExtendedThinking = false, thinkingBudget = 10000 } = options;

  // Convert conversation history to Claude message format (OUTSIDE retry block)
  const messages: Anthropic.MessageParam[] = conversationHistory.map(msg => ({
    role: msg.role,
    content: msg.content,
  }));

  // Add current user prompt
  messages.push({ role: 'user', content: userPrompt });

  logger.info('Generating with conversation history', {
    historyLength: conversationHistory.length,
    useExtendedThinking,
  });

  if (useExtendedThinking) {
    // Extended thinking path - already protected via generateWithExtendedThinking
    const contextSummary = conversationHistory
      .map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
      .join('\n');

    const combinedPrompt = `Bisherige Konversation:\n${contextSummary}\n\nAktuelle Anfrage: ${userPrompt}`;

    const result = await generateWithExtendedThinking(
      systemPrompt,
      combinedPrompt,
      { thinkingBudget, maxTokens }
    );
    return result.response;
  }

  // Non-thinking path - protect with retry and circuit breaker
  return withCircuitBreaker('claude', async () => {
    return withRetry(async () => {
      const message = await claudeClient!.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages,
      });

      const responseText = message.content[0]?.type === 'text' ? message.content[0].text : '';
      if (!responseText) {
        throw new Error('No response from Claude');
      }

      return responseText.trim();
    }, CLAUDE_RETRY_CONFIG);
  });
}

/**
 * Query Claude for JSON response with Extended Thinking support
 * Now with retry logic and circuit breaker for stability.
 */
export async function queryClaudeJSONAdvanced<T = unknown>(
  systemPrompt: string,
  userPrompt: string,
  options: ClaudeOptions = {}
): Promise<{ result: T; thinking?: string }> {
  if (!claudeClient) {
    throw new Error('Claude client not initialized');
  }

  const { useExtendedThinking = false, thinkingBudget = 10000, maxTokens = 2000 } = options;

  let responseText: string;
  let thinking: string | undefined;

  if (useExtendedThinking) {
    // Extended thinking path - already protected via generateWithExtendedThinking
    const result = await generateWithExtendedThinking(
      systemPrompt,
      userPrompt,
      { thinkingBudget, maxTokens }
    );
    responseText = result.response;
    thinking = result.thinking;
  } else {
    // Non-thinking path - protect with retry and circuit breaker
    responseText = await withCircuitBreaker('claude', async () => {
      return withRetry(async () => {
        const message = await claudeClient!.messages.create({
          model: CLAUDE_MODEL,
          max_tokens: maxTokens,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        });
        return message.content[0]?.type === 'text' ? message.content[0].text : '';
      }, CLAUDE_RETRY_CONFIG);
    });
  }

  if (!responseText) {
    throw new Error('No response from Claude');
  }

  // Extract JSON from response
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('No valid JSON found in Claude response');
  }

  return {
    result: JSON.parse(jsonMatch[0]) as T,
    thinking,
  };
}

// ===========================================
// Helper Functions
// ===========================================

/**
 * Robust JSON extraction from LLM response with multiple fallback strategies
 * Handles common issues like markdown wrapping, trailing text, malformed JSON
 */
export function extractJSONFromResponse(responseText: string): { json: any; method: string } | null {
  if (!responseText || typeof responseText !== 'string') {
    logger.debug('JSON extraction: empty or invalid input');
    return null;
  }

  const methods = [
    // Method 1: Direct JSON object
    () => {
      const match = responseText.match(/\{[\s\S]*\}/);
      if (match) {
        return { json: JSON.parse(match[0]), method: 'direct-object' };
      }
      return null;
    },

    // Method 2: JSON in markdown code block
    () => {
      const markdownMatch = responseText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
      if (markdownMatch) {
        return { json: JSON.parse(markdownMatch[1]), method: 'markdown-block' };
      }
      return null;
    },

    // Method 3: JSON array extraction
    () => {
      const arrayMatch = responseText.match(/\[[\s\S]*\]/);
      if (arrayMatch) {
        return { json: JSON.parse(arrayMatch[0]), method: 'array' };
      }
      return null;
    },

    // Method 4: Fix common JSON errors (trailing commas, unquoted keys)
    () => {
      let fixed = responseText;
      // Find JSON-like content
      const jsonMatch = fixed.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;

      let jsonStr = jsonMatch[0];

      // Fix trailing commas before closing brackets/braces
      jsonStr = jsonStr.replace(/,(\s*[}\]])/g, '$1');

      // Fix single quotes to double quotes (but not within strings)
      jsonStr = jsonStr.replace(/'/g, '"');

      // Remove trailing text after closing brace
      const lastBrace = jsonStr.lastIndexOf('}');
      if (lastBrace !== -1) {
        jsonStr = jsonStr.substring(0, lastBrace + 1);
      }

      return { json: JSON.parse(jsonStr), method: 'fixed-json' };
    },

    // Method 5: Extract key-value pairs manually and reconstruct
    () => {
      const lines = responseText.split('\n');
      const obj: Record<string, any> = {};

      for (const line of lines) {
        // Match "key": "value" or "key": value patterns
        const kvMatch = line.match(/"?(\w+)"?\s*:\s*(?:"([^"]*)"|\[([^\]]*)\]|(\d+(?:\.\d+)?)|(\w+))/);
        if (kvMatch) {
          const key = kvMatch[1];
          if (kvMatch[2] !== undefined) {
            obj[key] = kvMatch[2]; // String value
          } else if (kvMatch[3] !== undefined) {
            // Array value - try to parse
            try {
              obj[key] = JSON.parse(`[${kvMatch[3]}]`);
            } catch {
              obj[key] = kvMatch[3].split(',').map(s => s.trim().replace(/^["']|["']$/g, ''));
            }
          } else if (kvMatch[4] !== undefined) {
            obj[key] = parseFloat(kvMatch[4]); // Number
          } else if (kvMatch[5] !== undefined) {
            const val = kvMatch[5].toLowerCase();
            obj[key] = val === 'true' ? true : val === 'false' ? false : kvMatch[5];
          }
        }
      }

      if (Object.keys(obj).length > 0) {
        return { json: obj, method: 'line-parsing' };
      }
      return null;
    },
  ];

  for (const method of methods) {
    try {
      const result = method();
      if (result) {
        logger.debug('JSON extraction successful', { method: result.method });
        return result;
      }
    } catch (error) {
      // Continue to next method
    }
  }

  logger.warn('JSON extraction failed with all methods', {
    responseLength: responseText.length,
    responsePreview: responseText.substring(0, 200)
  });
  return null;
}

/**
 * Validate and normalize a structured idea from parsed JSON
 * Ensures all required fields are present with correct types
 */
export function validateAndNormalizeIdea(parsed: any, fallbackTitle?: string): StructuredIdea {
  // Ensure required fields
  const title = typeof parsed.title === 'string' && parsed.title.length > 0
    ? parsed.title.substring(0, 200)
    : (fallbackTitle || 'Unstrukturierte Notiz');

  const summary = typeof parsed.summary === 'string'
    ? parsed.summary.substring(0, 1000)
    : '';

  // Handle next_steps - can be string or array
  let nextSteps: string[] = [];
  if (Array.isArray(parsed.next_steps)) {
    nextSteps = parsed.next_steps.filter((s: any) => typeof s === 'string').slice(0, 10);
  } else if (typeof parsed.next_steps === 'string') {
    nextSteps = [parsed.next_steps];
  }

  // Handle context_needed - can be string or array
  let contextNeeded: string[] = [];
  if (Array.isArray(parsed.context_needed)) {
    contextNeeded = parsed.context_needed.filter((s: any) => typeof s === 'string').slice(0, 10);
  } else if (typeof parsed.context_needed === 'string') {
    contextNeeded = [parsed.context_needed];
  }

  // Handle keywords - can be string or array
  let keywords: string[] = [];
  if (Array.isArray(parsed.keywords)) {
    keywords = parsed.keywords.filter((s: any) => typeof s === 'string').slice(0, 20);
  } else if (typeof parsed.keywords === 'string') {
    keywords = parsed.keywords.split(',').map((k: string) => k.trim()).filter((k: string) => k.length > 0);
  }

  return {
    title,
    type: normalizeType(parsed.type),
    category: normalizeCategory(parsed.category),
    priority: normalizePriority(parsed.priority),
    summary,
    next_steps: nextSteps,
    context_needed: contextNeeded,
    keywords,
  };
}

/**
 * Determine if a task is complex enough to warrant Extended Thinking
 */
export function shouldUseExtendedThinking(text: string, taskType: string): boolean {
  // Use extended thinking for:
  // 1. Long transcripts (> 500 chars)
  // 2. Draft generation tasks
  // 3. Multi-idea analysis
  // 4. Complex relationship analysis

  const isLongText = text.length > 500;
  const isComplexTask = ['draft', 'analysis', 'relationship', 'graph'].includes(taskType);
  const hasMultipleTopics = (text.match(/\b(und|sowie|außerdem|zusätzlich|also|furthermore|moreover)\b/gi) || []).length > 2;

  return isLongText || isComplexTask || hasMultipleTopics;
}
