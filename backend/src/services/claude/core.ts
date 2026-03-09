/**
 * Claude Core Module
 *
 * Provides core functionality for structuring transcripts
 * and generating responses using Claude API.
 *
 * @module services/claude/core
 */

import Anthropic from '@anthropic-ai/sdk';
import { logger } from '../../utils/logger';
import { StructuredIdea } from '../../utils/ollama';
import { AIContext } from '../../utils/database-context';
import { trackContextUsage, getUnifiedContext } from '../business-context';
import { getPersonalFactsPromptSection } from '../personal-facts-bridge';
import {
  getClaudeClient,
  executeWithProtection,
  CLAUDE_MODEL,
  SYSTEM_PROMPT,
} from './client';
import { extractTextOrThrow, extractJSONOrThrow, validateAndNormalizeIdea } from './helpers';

// ===========================================
// Types
// ===========================================

/**
 * Options for Claude API calls
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
 * Conversation message for memory
 */
export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

// ===========================================
// Re-exports
// ===========================================

export { isClaudeAvailable } from './client';

// ===========================================
// Basic Structuring
// ===========================================

/**
 * Structure transcript using Claude
 * Now with retry logic and circuit breaker for stability
 *
 * @param transcript - The raw transcript to structure
 * @returns Structured idea
 */
export async function structureWithClaude(transcript: string): Promise<StructuredIdea> {
  const client = getClaudeClient();

  return executeWithProtection(async () => {
    const message = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 500,
      system: SYSTEM_PROMPT,
      messages: [
        { role: 'user', content: `USER MEMO:\n${transcript}\n\nSTRUCTURED OUTPUT:` }
      ],
    });

    const responseText = extractTextOrThrow(message);
    const parsed = extractJSONOrThrow(responseText);

    return validateAndNormalizeIdea(parsed, 'Unstrukturierte Notiz');
  });
}

/**
 * Structure transcript using Claude with personalized context
 * Uses business profile and learning data for better results
 *
 * @param transcript - The raw transcript to structure
 * @param context - The AI context (personal/work) for personalization
 * @returns Structured idea with personalized categorization
 */
export async function structureWithClaudePersonalized(
  transcript: string,
  context: AIContext
): Promise<StructuredIdea> {
  const client = getClaudeClient();

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

  // Add personal facts from PersonalizationChat (cross-context)
  // Pass transcript for query-relevant fact selection
  const personalFactsSection = await getPersonalFactsPromptSection(transcript);
  if (personalFactsSection) {
    personalizedPrompt += personalFactsSection;
  }

  // API call WITH retry and circuit breaker protection
  return executeWithProtection(async () => {
    logger.info('Structuring with Claude (personalized)', {
      contextDepth: unifiedContext.contextDepthScore,
      hasProfile: !!unifiedContext.profile,
    });

    const message = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 500,
      system: personalizedPrompt,
      messages: [
        { role: 'user', content: `USER MEMO:\n${transcript}\n\nSTRUCTURED OUTPUT:` }
      ],
    });

    const responseText = extractTextOrThrow(message);
    const parsed = extractJSONOrThrow(responseText);

    const result = validateAndNormalizeIdea(parsed, 'Unstrukturierte Notiz');

    // Track that we used context (async, don't await)
    trackContextUsage(context, 'new', unifiedContext).catch(err => logger.debug('Context usage tracking skipped', { context, error: err instanceof Error ? err.message : String(err) }));

    return result;
  });
}

// ===========================================
// Generic Claude Calls
// ===========================================

/**
 * Generic Claude call that returns parsed JSON
 *
 * @param systemPrompt - The system prompt
 * @param userPrompt - The user prompt
 * @returns Parsed JSON response
 */
export async function queryClaudeJSON<T = unknown>(
  systemPrompt: string,
  userPrompt: string
): Promise<T> {
  const client = getClaudeClient();

  return executeWithProtection(async () => {
    const message = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 1000,
      system: systemPrompt,
      messages: [
        { role: 'user', content: userPrompt }
      ],
    });

    const responseText = extractTextOrThrow(message);
    return extractJSONOrThrow(responseText) as T;
  });
}

/**
 * Generate text response using Claude
 *
 * @param systemPrompt - The system prompt
 * @param userPrompt - The user prompt
 * @param options - Optional configuration
 * @returns Generated text response
 */
export async function generateClaudeResponse(
  systemPrompt: string,
  userPrompt: string,
  options: ClaudeOptions = {}
): Promise<string> {
  const client = getClaudeClient();
  const { maxTokens = 500, temperature } = options;

  return executeWithProtection(async () => {
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

    const message = await client.messages.create(requestParams);

    return extractTextOrThrow(message).trim();
  });
}

/**
 * Generate response with conversation history for better context.
 * Supports multi-turn conversations with memory.
 *
 * @param systemPrompt - The system prompt
 * @param userPrompt - The current user prompt
 * @param conversationHistory - Previous conversation messages
 * @param options - Optional configuration
 * @returns Generated response
 */
export async function generateWithConversationHistory(
  systemPrompt: string,
  userPrompt: string,
  conversationHistory: ConversationMessage[],
  options: ClaudeOptions = {}
): Promise<string> {
  const client = getClaudeClient();
  const { maxTokens = 1000 } = options;

  // Convert conversation history to Claude message format (OUTSIDE retry block)
  const messages: Anthropic.MessageParam[] = conversationHistory.map(msg => ({
    role: msg.role,
    content: msg.content,
  }));

  // Add current user prompt
  messages.push({ role: 'user', content: userPrompt });

  logger.info('Generating with conversation history', {
    historyLength: conversationHistory.length,
  });

  return executeWithProtection(async () => {
    const message = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages,
    });

    return extractTextOrThrow(message).trim();
  });
}
