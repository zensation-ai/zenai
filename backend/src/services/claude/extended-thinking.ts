/**
 * Claude Extended Thinking Module
 *
 * Provides advanced reasoning capabilities using Claude's
 * Extended Thinking feature for complex tasks.
 *
 * @module services/claude/extended-thinking
 */

import Anthropic from '@anthropic-ai/sdk';
import { logger } from '../../utils/logger';
import { StructuredIdea } from '../../utils/ollama';
import { AIContext } from '../../utils/database-context';
import { getUnifiedContext, trackContextUsage } from '../business-context';
import {
  getClaudeClient,
  executeWithProtection,
  CLAUDE_MODEL,
  SYSTEM_PROMPT_WITH_CONFIDENCE,
} from './client';
import {
  extractJSONOrThrow,
  extractThinkingContent,
  validateAndNormalizeIdea,
} from './helpers';
import {
  StructuredIdeaWithConfidence,
  getConfidenceLevel,
} from './confidence';
import { ClaudeOptions, ConversationMessage } from './core';

// ===========================================
// Extended Thinking Functions
// ===========================================

/**
 * Generate response with Extended Thinking for complex reasoning tasks.
 * Extended Thinking allows Claude to "think" longer before responding,
 * improving quality for complex tasks like draft generation,
 * multi-idea analysis, and knowledge graph discovery.
 *
 * @param systemPrompt - The system prompt
 * @param userPrompt - The user prompt
 * @param options - Configuration options
 * @returns Response with optional thinking content
 */
export async function generateWithExtendedThinking(
  systemPrompt: string,
  userPrompt: string,
  options: ClaudeOptions = {}
): Promise<{ response: string; thinking?: string }> {
  const client = getClaudeClient();

  const {
    thinkingBudget = 10000,
    maxTokens = 16000,
  } = options;

  // Use separate circuit breaker for extended thinking (longer operations)
  return executeWithProtection(async () => {
    logger.info('Generating with Extended Thinking', {
      thinkingBudget,
      maxTokens,
      promptLength: userPrompt.length,
    });

    const message = await client.messages.create({
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

    const result = extractThinkingContent(message.content as Array<{ type: string; text?: string; thinking?: string }>);

    logger.info('Extended Thinking complete', {
      hasThinking: !!result.thinking,
      thinkingLength: result.thinking?.length || 0,
      responseLength: result.response.length,
      inputTokens: message.usage?.input_tokens,
      outputTokens: message.usage?.output_tokens,
    });

    return result;
  }, true); // Use extended timeout
}

/**
 * Structure transcript with Extended Thinking for complex memos.
 * Uses deeper reasoning for better categorization and analysis.
 *
 * @param transcript - The raw transcript
 * @param context - The AI context (personal/work)
 * @param options - Configuration options
 * @returns Structured idea with confidence scores
 */
export async function structureWithClaudeAdvanced(
  transcript: string,
  context: AIContext,
  options: ClaudeOptions = {}
): Promise<StructuredIdeaWithConfidence> {
  const client = getClaudeClient();
  const { useExtendedThinking = false, thinkingBudget = 10000 } = options;

  // Get unified context for personalization
  const unifiedContext = await getUnifiedContext(context);

  // Build enhanced system prompt for complex analysis
  let enhancedPrompt = SYSTEM_PROMPT_WITH_CONFIDENCE;

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

  logger.info('Structuring with Claude Advanced', {
    useExtendedThinking,
    contextDepth: unifiedContext.contextDepthScore,
    transcriptLength: transcript.length,
  });

  let responseText: string;
  let thinkingUsed = false;

  if (useExtendedThinking) {
    // Extended thinking path
    const result = await generateWithExtendedThinking(
      enhancedPrompt,
      `USER MEMO:\n${transcript}\n\nSTRUCTURED OUTPUT:`,
      { thinkingBudget, maxTokens: 16000 }
    );
    responseText = result.response;
    thinkingUsed = true;
  } else {
    // Non-thinking path
    responseText = await executeWithProtection(async () => {
      const message = await client.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 1000,
        system: enhancedPrompt,
        messages: [
          { role: 'user', content: `USER MEMO:\n${transcript}\n\nSTRUCTURED OUTPUT:` }
        ],
      });

      const textBlock = message.content.find(block => block.type === 'text');
      return (textBlock as { type: string; text: string })?.text || '';
    });
  }

  if (!responseText) {
    throw new Error('No response from Claude');
  }

  const parsed = extractJSONOrThrow(responseText) as Record<string, unknown>;
  const baseIdea = validateAndNormalizeIdea(parsed, 'Unstrukturierte Notiz');

  // Extract confidence scores from parsed response
  const confidenceType = typeof parsed.confidence_type === 'number' ? parsed.confidence_type : 0.7;
  const confidenceCategory = typeof parsed.confidence_category === 'number' ? parsed.confidence_category : 0.7;
  const confidencePriority = typeof parsed.confidence_priority === 'number' ? parsed.confidence_priority : 0.7;
  const overallConfidence = (confidenceType + confidenceCategory + confidencePriority) / 3;

  const result: StructuredIdeaWithConfidence = {
    ...baseIdea,
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
}

/**
 * Query Claude for JSON response with Extended Thinking support
 *
 * @param systemPrompt - The system prompt
 * @param userPrompt - The user prompt
 * @param options - Configuration options
 * @returns Parsed JSON with optional thinking content
 */
export async function queryClaudeJSONAdvanced<T = unknown>(
  systemPrompt: string,
  userPrompt: string,
  options: ClaudeOptions = {}
): Promise<{ result: T; thinking?: string }> {
  const client = getClaudeClient();
  const { useExtendedThinking = false, thinkingBudget = 10000, maxTokens = 2000 } = options;

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
    responseText = await executeWithProtection(async () => {
      const message = await client.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      });

      const textBlock = message.content.find(block => block.type === 'text');
      return (textBlock as { type: string; text: string })?.text || '';
    });
  }

  if (!responseText) {
    throw new Error('No response from Claude');
  }

  return {
    result: extractJSONOrThrow(responseText) as T,
    thinking,
  };
}

/**
 * Generate response with conversation history and Extended Thinking
 *
 * @param systemPrompt - The system prompt
 * @param userPrompt - The current user prompt
 * @param conversationHistory - Previous conversation messages
 * @param options - Configuration options
 * @returns Generated response
 */
export async function generateWithConversationHistoryAdvanced(
  systemPrompt: string,
  userPrompt: string,
  conversationHistory: ConversationMessage[],
  options: ClaudeOptions = {}
): Promise<string> {
  const { useExtendedThinking = false, thinkingBudget = 10000, maxTokens = 1000 } = options;

  logger.info('Generating with conversation history (advanced)', {
    historyLength: conversationHistory.length,
    useExtendedThinking,
  });

  if (useExtendedThinking) {
    // Build context summary for extended thinking
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

  // For non-extended thinking, use the core function
  const { generateWithConversationHistory } = await import('./core');
  return generateWithConversationHistory(systemPrompt, userPrompt, conversationHistory, options);
}
