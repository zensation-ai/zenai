import Anthropic from '@anthropic-ai/sdk';
import { logger } from '../utils/logger';
import { StructuredIdea, normalizeCategory, normalizeType, normalizePriority } from '../utils/ollama';
import { AIContext } from '../utils/database-context';
import { buildSystemPrompt, trackContextUsage, getUnifiedContext } from './business-context';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514';

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
 */
export async function structureWithClaude(transcript: string): Promise<StructuredIdea> {
  if (!claudeClient) {
    throw new Error('Claude client not initialized');
  }

  try {
    const message = await claudeClient.messages.create({
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
  } catch (error: any) {
    logger.error('Claude structuring error', error);
    throw error;
  }
}

/**
 * Structure transcript using Claude with personalized context
 * Uses business profile and learning data for better results
 */
export async function structureWithClaudePersonalized(
  transcript: string,
  context: AIContext
): Promise<StructuredIdea> {
  if (!claudeClient) {
    throw new Error('Claude client not initialized');
  }

  try {
    // Get unified context for personalization
    const unifiedContext = await getUnifiedContext(context);

    // Build personalized system prompt
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

    logger.info('Structuring with Claude (personalized)', {
      contextDepth: unifiedContext.contextDepthScore,
      hasProfile: !!unifiedContext.profile,
    });

    const message = await claudeClient.messages.create({
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
  } catch (error: any) {
    logger.error('Claude personalized structuring error', error);
    throw error;
  }
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
 */
export function calculateConfidence(
  structured: StructuredIdea,
  transcript: string
): ConfidenceScores {
  // Type confidence: based on keyword matches
  const typeKeywords: Record<string, string[]> = {
    idea: ['idee', 'vorschlag', 'könnten', 'vielleicht', 'was wäre wenn', 'thought'],
    task: ['aufgabe', 'muss', 'soll', 'todo', 'erledigen', 'machen', 'deadline', 'task'],
    problem: ['problem', 'fehler', 'bug', 'issue', 'nicht funktioniert', 'kaputt'],
    question: ['frage', 'warum', 'wie', 'was', 'wer', 'wann', '?', 'question'],
    insight: ['erkannt', 'gelernt', 'verstanden', 'insight', 'erkenntnis', 'aha'],
  };

  const lowerTranscript = transcript.toLowerCase();
  const typeMatches = typeKeywords[structured.type]?.filter(kw =>
    lowerTranscript.includes(kw)
  ).length || 0;
  const typeConfidence = Math.min(0.5 + typeMatches * 0.15, 1.0);

  // Category confidence: based on content relevance
  const categoryKeywords: Record<string, string[]> = {
    business: ['business', 'geschäft', 'kunde', 'verkauf', 'meeting', 'projekt'],
    technical: ['code', 'api', 'software', 'bug', 'feature', 'system', 'datenbank'],
    personal: ['ich', 'mir', 'mein', 'privat', 'hobby', 'zuhause'],
    learning: ['lernen', 'kurs', 'buch', 'tutorial', 'verstehen', 'wissen'],
  };

  const catMatches = categoryKeywords[structured.category]?.filter(kw =>
    lowerTranscript.includes(kw)
  ).length || 0;
  const categoryConfidence = Math.min(0.5 + catMatches * 0.12, 1.0);

  // Priority confidence: based on urgency indicators
  const priorityIndicators: Record<string, string[]> = {
    high: ['dringend', 'sofort', 'asap', 'wichtig', 'kritisch', 'urgent', 'deadline'],
    medium: ['bald', 'sollte', 'wichtig', 'relevant'],
    low: ['irgendwann', 'später', 'nice to have', 'optional'],
  };

  const prioMatches = priorityIndicators[structured.priority]?.filter(kw =>
    lowerTranscript.includes(kw)
  ).length || 0;
  const priorityConfidence = prioMatches > 0 ? Math.min(0.6 + prioMatches * 0.15, 1.0) : 0.5;

  // Summary confidence: based on completeness
  const summaryLength = structured.summary?.length || 0;
  const hasSummary = summaryLength > 20;
  const summaryQuality = Math.min(summaryLength / 200, 1.0);
  const summaryConfidence = hasSummary ? 0.5 + summaryQuality * 0.5 : 0.3;

  // Overall confidence: weighted average
  const overall = (
    typeConfidence * 0.3 +
    categoryConfidence * 0.25 +
    priorityConfidence * 0.2 +
    summaryConfidence * 0.25
  );

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
 */
export async function queryClaudeJSON<T = unknown>(
  systemPrompt: string,
  userPrompt: string
): Promise<T> {
  if (!claudeClient) {
    throw new Error('Claude client not initialized');
  }

  try {
    const message = await claudeClient.messages.create({
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
  } catch (error: any) {
    logger.error('Claude JSON query error', error);
    throw error;
  }
}

/**
 * Generate text response using Claude
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

  try {
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

    const message = await claudeClient.messages.create(requestParams);

    const responseText = message.content[0]?.type === 'text' ? message.content[0].text : '';
    if (!responseText) {
      throw new Error('No response from Claude');
    }

    return responseText.trim();
  } catch (error: any) {
    logger.error('Claude text generation error', error);
    throw error;
  }
}

// ===========================================
// Extended Thinking Functions
// ===========================================

/**
 * Generate response with Extended Thinking for complex reasoning tasks.
 * Extended Thinking allows Claude to "think" longer before responding,
 * improving quality for complex tasks like draft generation,
 * multi-idea analysis, and knowledge graph discovery.
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

  try {
    logger.info('Generating with Extended Thinking', {
      thinkingBudget,
      maxTokens,
      promptLength: userPrompt.length,
    });

    const message = await claudeClient.messages.create({
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
  } catch (error: any) {
    logger.error('Extended Thinking generation error', error);
    throw error;
  }
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
      const result = await generateWithExtendedThinking(
        enhancedPrompt,
        `USER MEMO:\n${transcript}\n\nSTRUCTURED OUTPUT:`,
        { thinkingBudget, maxTokens: 16000 }
      );
      responseText = result.response;
      thinkingUsed = true;
    } else {
      const message = await claudeClient.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 1000,
        system: enhancedPrompt,
        messages: [
          { role: 'user', content: `USER MEMO:\n${transcript}\n\nSTRUCTURED OUTPUT:` }
        ],
      });
      responseText = message.content[0]?.type === 'text' ? message.content[0].text : '';
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

  try {
    // Convert conversation history to Claude message format
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
      // Extended thinking with conversation - combine into single prompt
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

    const message = await claudeClient.messages.create({
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
  } catch (error: any) {
    logger.error('Claude conversation generation error', error);
    throw error;
  }
}

/**
 * Query Claude for JSON response with Extended Thinking support
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

  try {
    let responseText: string;
    let thinking: string | undefined;

    if (useExtendedThinking) {
      const result = await generateWithExtendedThinking(
        systemPrompt,
        userPrompt,
        { thinkingBudget, maxTokens }
      );
      responseText = result.response;
      thinking = result.thinking;
    } else {
      const message = await claudeClient.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      });
      responseText = message.content[0]?.type === 'text' ? message.content[0].text : '';
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
  } catch (error: any) {
    logger.error('Claude JSON query error', error);
    throw error;
  }
}

// ===========================================
// Helper Functions
// ===========================================

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
