/**
 * Claude Extended Thinking Module
 *
 * Provides advanced reasoning capabilities using Claude's
 * Extended Thinking feature for complex tasks.
 *
 * @module services/claude/extended-thinking
 */

import { logger } from '../../utils/logger';
import { AIContext } from '../../utils/database-context';
import { getUnifiedContext, trackContextUsage } from '../business-context';
import {
  getClaudeClient,
  executeWithProtection,
  CLAUDE_MODEL,
  SYSTEM_PROMPT_WITH_CONFIDENCE,
} from './client';
import {
  extractThinkingContent,
  extractJSONOrThrow,
  validateAndNormalizeIdea,
} from './helpers';
import {
  StructuredIdeaWithConfidence,
  getConfidenceLevel,
} from './confidence';
import { ClaudeOptions, ConversationMessage } from './core';
import {
  calculateDynamicBudget,
  classifyTaskType,
  storeThinkingChain,
  generatePrimingPrompt,
  TaskType,
  BudgetRecommendation,
} from './thinking-budget';

// ===========================================
// Extended Options with Dynamic Budget
// ===========================================

export interface ExtendedThinkingOptions extends ClaudeOptions {
  /** Enable dynamic budget calculation */
  useDynamicBudget?: boolean;
  /** Task type hint (for budget calculation) */
  taskTypeHint?: TaskType;
  /** Session ID for thinking chain persistence */
  sessionId?: string;
  /** Store thinking chain for learning */
  storeChain?: boolean;
  /** Use priming from similar successful chains */
  usePriming?: boolean;
}

export interface ExtendedThinkingResult {
  response: string;
  thinking?: string;
  chainId?: string;
  budgetUsed: number;
  budgetRecommendation?: BudgetRecommendation;
}

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
      context: 0.5,
    },
    confidenceLevel: getConfidenceLevel(overallConfidence),
    suggestCorrection: overallConfidence < 0.6,
    thinkingUsed,
  };

  // Track context usage (async)
  trackContextUsage(context, 'new', unifiedContext).catch(err => logger.debug('Context usage tracking skipped', { context, error: err instanceof Error ? err.message : String(err) }));

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

// ===========================================
// Dynamic Budget Extended Thinking
// ===========================================

/**
 * Generate with Extended Thinking using dynamic budget optimization.
 * This is the recommended function for production use.
 *
 * Features:
 * - Automatic task type classification
 * - Dynamic budget calculation based on complexity
 * - Thinking chain persistence for learning
 * - Priming from similar successful chains
 *
 * @param systemPrompt - The system prompt
 * @param userPrompt - The user prompt
 * @param context - AI context (personal/work)
 * @param options - Extended configuration options
 * @returns Extended thinking result with metadata
 */
export async function generateWithDynamicThinking(
  systemPrompt: string,
  userPrompt: string,
  context: AIContext,
  options: ExtendedThinkingOptions = {}
): Promise<ExtendedThinkingResult> {
  const client = getClaudeClient();

  const {
    useDynamicBudget = true,
    taskTypeHint,
    sessionId = `session_${Date.now()}`,
    storeChain = true,
    usePriming = true,
    maxTokens = 16000,
  } = options;

  // 1. Classify task type
  const taskType = taskTypeHint || classifyTaskType(userPrompt);

  // 2. Calculate dynamic budget or use provided
  let budgetRecommendation: BudgetRecommendation | undefined;
  let thinkingBudget: number;

  if (useDynamicBudget) {
    budgetRecommendation = await calculateDynamicBudget(userPrompt, taskType, context);
    thinkingBudget = budgetRecommendation.recommendedBudget;

    logger.info('Dynamic budget calculated', {
      taskType,
      budget: thinkingBudget,
      complexity: budgetRecommendation.complexity.score,
      similarChains: budgetRecommendation.similarChains.length,
    });
  } else {
    thinkingBudget = options.thinkingBudget || 10000;
  }

  // 3. Get priming from similar successful chains
  let enhancedSystemPrompt = systemPrompt;

  if (usePriming && budgetRecommendation?.similarChains && budgetRecommendation.similarChains.length > 0) {
    const primingPrompt = generatePrimingPrompt(budgetRecommendation.similarChains);
    if (primingPrompt) {
      enhancedSystemPrompt = `${systemPrompt}\n\n${primingPrompt}`;
    }
  }

  // 4. Execute with Extended Thinking
  return executeWithProtection(async () => {
    logger.info('Generating with Dynamic Extended Thinking', {
      taskType,
      thinkingBudget,
      maxTokens,
      usePriming,
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
          content: `${enhancedSystemPrompt}\n\n${userPrompt}`,
        },
      ],
    });

    const result = extractThinkingContent(
      message.content as Array<{ type: string; text?: string; thinking?: string }>
    );

    // Calculate actual tokens used
    const budgetUsed = message.usage?.output_tokens || thinkingBudget;

    logger.info('Dynamic Extended Thinking complete', {
      taskType,
      budgetRequested: thinkingBudget,
      budgetUsed,
      hasThinking: !!result.thinking,
      thinkingLength: result.thinking?.length || 0,
      responseLength: result.response.length,
    });

    // 5. Store thinking chain for learning
    let chainId: string | undefined;

    if (storeChain && result.thinking) {
      try {
        chainId = await storeThinkingChain(
          sessionId,
          context,
          taskType,
          userPrompt,
          result.thinking,
          budgetUsed
        );
      } catch (error) {
        logger.debug('Failed to store thinking chain', {
          error: error instanceof Error ? error.message : 'Unknown',
        });
      }
    }

    return {
      response: result.response,
      thinking: result.thinking,
      chainId,
      budgetUsed,
      budgetRecommendation,
    };
  }, true); // Use extended timeout
}

/**
 * Strategic business analysis with Extended Thinking
 */
export async function analyzeBusinessOpportunity(
  opportunity: string,
  context: AIContext,
  options: ExtendedThinkingOptions = {}
): Promise<ExtendedThinkingResult> {
  const systemPrompt = `Du bist ein erfahrener Business-Stratege und Unternehmensberater.

Analysiere die vorgestellte Geschäftsmöglichkeit systematisch:

1. **Market Fit**: Passt die Idee zu aktuellen Marktbedürfnissen?
2. **Competitive Landscape**: Wer sind die Wettbewerber? Was ist das Alleinstellungsmerkmal?
3. **Resource Requirements**: Welche Ressourcen (Kapital, Team, Zeit) werden benötigt?
4. **Risk Assessment**: Welche Risiken bestehen? Wie können sie mitigiert werden?
5. **Implementation Roadmap**: Welche Schritte sind für die Umsetzung notwendig?

Gib eine strukturierte, actionable Analyse.`;

  return generateWithDynamicThinking(
    systemPrompt,
    opportunity,
    context,
    {
      ...options,
      taskTypeHint: 'strategic_planning',
      useDynamicBudget: true,
    }
  );
}

/**
 * Technical architecture review with Extended Thinking
 */
export async function reviewArchitectureDecision(
  decision: string,
  codeContext: string,
  context: AIContext,
  options: ExtendedThinkingOptions = {}
): Promise<ExtendedThinkingResult> {
  const systemPrompt = `Du bist ein Senior Software Architect mit Erfahrung in großen Systemen.

Analysiere diese Architekturentscheidung systematisch:

1. **Skalierbarkeit**: Wie gut skaliert diese Lösung?
2. **Wartbarkeit**: Ist der Code langfristig wartbar?
3. **Performance**: Welche Performance-Implikationen gibt es?
4. **Security**: Gibt es Sicherheitsbedenken?
5. **Alternativen**: Welche alternativen Ansätze gäbe es?
6. **Migrationspfad**: Wie sähe eine Migration aus?

Gib konkrete, technisch fundierte Empfehlungen.`;

  const userPrompt = `ARCHITEKTURENTSCHEIDUNG:\n${decision}\n\nKONTEXT:\n${codeContext}`;

  return generateWithDynamicThinking(
    systemPrompt,
    userPrompt,
    context,
    {
      ...options,
      taskTypeHint: 'analysis',
      useDynamicBudget: true,
    }
  );
}

/**
 * Multi-document synthesis with Extended Thinking
 */
export async function synthesizeDocuments(
  documents: Array<{ title: string; content: string }>,
  synthesisGoal: string,
  context: AIContext,
  options: ExtendedThinkingOptions = {}
): Promise<ExtendedThinkingResult> {
  const systemPrompt = `Du synthetisierst mehrere Dokumente zu einer kohärenten Analyse.

ZIEL: ${synthesisGoal}

Identifiziere und analysiere:
- **Gemeinsame Themen**: Was verbindet die Dokumente?
- **Widersprüche**: Wo gibt es unterschiedliche Aussagen?
- **Wissenslücken**: Was fehlt noch?
- **Handlungsempfehlungen**: Was sollte als nächstes passieren?

Erstelle eine strukturierte Synthese, die das Beste aus allen Quellen kombiniert.`;

  const docsText = documents
    .map(d => `[${d.title}]\n${d.content}`)
    .join('\n\n---\n\n');

  return generateWithDynamicThinking(
    systemPrompt,
    docsText,
    context,
    {
      ...options,
      taskTypeHint: 'synthesis',
      useDynamicBudget: true,
    }
  );
}

/**
 * Complex problem solving with Extended Thinking
 */
export async function solveProblem(
  problem: string,
  constraints: string[],
  context: AIContext,
  options: ExtendedThinkingOptions = {}
): Promise<ExtendedThinkingResult> {
  const constraintsText = constraints.length > 0
    ? `\n\nCONSTRAINTS:\n${constraints.map(c => `- ${c}`).join('\n')}`
    : '';

  const systemPrompt = `Du bist ein systematischer Problemlöser.

Analysiere das Problem schrittweise:

1. **Problem verstehen**: Was ist das Kernproblem?
2. **Ursachenanalyse**: Was sind die Ursachen?
3. **Lösungsoptionen**: Welche Lösungen gibt es?
4. **Bewertung**: Vor- und Nachteile jeder Lösung
5. **Empfehlung**: Die beste Lösung mit Begründung
6. **Umsetzung**: Konkrete nächste Schritte

Denke gründlich nach und begründe deine Empfehlungen.`;

  return generateWithDynamicThinking(
    systemPrompt,
    `PROBLEM:\n${problem}${constraintsText}`,
    context,
    {
      ...options,
      taskTypeHint: 'problem_solving',
      useDynamicBudget: true,
    }
  );
}

// ===========================================
// Re-exports for convenience
// ===========================================

export {
  calculateDynamicBudget,
  classifyTaskType,
  storeThinkingChain,
  findSimilarSuccessfulChains,
  recordThinkingFeedback,
  getThinkingStats,
  TaskType,
  BudgetRecommendation,
} from './thinking-budget';
