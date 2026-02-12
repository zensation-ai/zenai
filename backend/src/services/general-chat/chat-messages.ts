/**
 * Chat Messages - AI response generation, RAG, tool execution
 */

import { query } from '../../utils/database';
import { logger } from '../../utils/logger';
import { generateWithConversationHistory, ConversationMessage, isClaudeAvailable } from '../claude';
import { getUnifiedContext } from '../business-context';
import { memoryCoordinator, episodicMemory, workingMemory } from '../memory';
import { implicitFeedback } from '../memory/implicit-feedback';
import { detectChatMode, shouldEnhanceWithRAG, getDefaultToolsForMode } from '../chat-modes';
import { classifyIntent, intentToRetrievalConfig } from '../query-intent-classifier';
import { ThinkingMode, applyThinkingMode } from '../thinking-partner';
import { executeWithTools, ToolExecutionContext } from '../claude/tool-use';
import { enhancedRAG, EnhancedRAGResult, EnhancedResult } from '../enhanced-rag';
import { searchWeb } from '../web-search';
import { CHAT } from '../../config/constants';
import { routeToModel, recordUsage } from '../model-orchestrator';
import { logAIDecision } from '../compliance-logger';
import {
  RAGQualityMetrics,
  ResponseMetadata,
  EnhancedResponse,
  SendMessageResult,
  addMessage,
  updateSessionTitle,
} from './chat-sessions';

// ===========================================
// System Prompt
// ===========================================

/**
 * System prompt for general chat.
 * Exported so routes can reuse instead of duplicating.
 */
export const GENERAL_CHAT_SYSTEM_PROMPT = `Du bist ein hilfreicher, intelligenter KI-Assistent.

Deine Eigenschaften:
- Du antwortest auf Deutsch, es sei denn der Benutzer schreibt in einer anderen Sprache
- Du bist freundlich, präzise und hilfreich
- Du gibst strukturierte, gut lesbare Antworten
- Du verwendest Markdown-Formatierung wenn sinnvoll (Listen, Code-Blöcke, etc.)
- Du bist ehrlich und sagst wenn du etwas nicht weißt
- Du denkst mit und stellst Rückfragen wenn nötig

Du hilfst bei allen Arten von Fragen: Recherche, Erklärungen, Brainstorming, Problemlösung, Texte verfassen, Code, und vieles mehr.`;

// ===========================================
// AI Response Generation
// ===========================================

/**
 * Generate AI response for a chat message
 * Uses HiMeS 4-layer memory architecture for enhanced context
 *
 * ENHANCED: Now uses intelligent mode detection and tool execution
 */
export async function generateResponse(
  sessionId: string,
  userMessage: string,
  contextType: 'personal' | 'work' | 'learning' | 'creative' = 'personal'
): Promise<string> {
  const enhanced = await generateEnhancedResponse(sessionId, userMessage, contextType);
  return enhanced.content;
}

/**
 * Generate AI response with full metadata
 * Uses intelligent mode detection, tool execution, and RAG enhancement
 */
export async function generateEnhancedResponse(
  sessionId: string,
  userMessage: string,
  contextType: 'personal' | 'work' | 'learning' | 'creative' = 'personal',
  thinkingMode: ThinkingMode = 'assist'
): Promise<EnhancedResponse> {
  const startTime = Date.now();

  if (!isClaudeAvailable()) {
    throw new Error('Claude API ist nicht verfügbar');
  }

  // Create request-scoped execution context for tools (race-condition safe)
  const executionContext: ToolExecutionContext = {
    aiContext: contextType,
    sessionId,
  };

  // Detect optimal processing mode
  const modeResult = detectChatMode(userMessage);

  logger.info('Chat mode detected', {
    sessionId,
    mode: modeResult.mode,
    confidence: modeResult.confidence,
    reasoning: modeResult.reasoning,
  });

  // Get conversation history
  const messagesResult = await query(`
    SELECT role, content, created_at
    FROM general_chat_messages
    WHERE session_id = $1
    ORDER BY created_at ASC
    LIMIT ${CHAT.MAX_HISTORY_MESSAGES}
  `, [sessionId]);

  // Convert to ConversationMessage format
  const conversationHistory: ConversationMessage[] = messagesResult.rows.map(row => ({
    role: row.role as 'user' | 'assistant',
    content: row.content,
    timestamp: row.created_at,
  }));

  // Build enhanced system prompt with HiMeS memory context
  let systemPrompt = GENERAL_CHAT_SYSTEM_PROMPT;

  // Apply thinking partner mode (Phase 32C-1)
  if (thinkingMode !== 'assist') {
    systemPrompt = applyThinkingMode(systemPrompt, thinkingMode);
    logger.info('Thinking mode applied', { sessionId, thinkingMode });
  }
  let memoryStats = { longTermFacts: 0, episodesRetrieved: 0, workingMemorySlots: 0 };

  try {
    // Use HiMeS memory coordinator for enhanced context
    // Enable serendipity for agent mode or creative context (2-hop graph expansion)
    const enableSerendipity = modeResult.mode === 'agent' || contextType === 'creative';

    const enhancedContext = await memoryCoordinator.prepareEnhancedContext(
      sessionId,
      userMessage,
      contextType,
      { maxContextTokens: 2000, includeEpisodic: true, includeLongTerm: true, enableSerendipity }
    );

    memoryStats = enhancedContext.stats;

    // Add memory-enhanced context to system prompt
    if (enhancedContext.systemEnhancement) {
      systemPrompt += `\n\n${enhancedContext.systemEnhancement}`;
    }

    // Add working memory context (current goal/focus)
    const wmContextString = workingMemory.generateContextString(sessionId);
    if (wmContextString) {
      systemPrompt += `\n\n${wmContextString}`;
    }

    // Add emotional context if available
    if (enhancedContext.episodicMemory?.emotionalTone) {
      const tone = enhancedContext.episodicMemory.emotionalTone;
      if (tone.dominantMood !== 'neutral') {
        systemPrompt += `\n\n[EMOTIONALER KONTEXT]\nBisherige Stimmung: ${tone.dominantMood === 'positive' ? 'positiv' : 'negativ'}. Passe deinen Ton entsprechend an.`;
      }
    }

    logger.debug('Enhanced context prepared', {
      sessionId,
      memoryStats,
      systemPromptLength: systemPrompt.length,
    });
  } catch (error) {
    // Fallback to basic context if memory fails
    logger.warn('Memory enhancement failed, using fallback', { sessionId, error });

    try {
      const unifiedContext = await getUnifiedContext(contextType);
      if (unifiedContext.contextDepthScore > 20) {
        const contextParts: string[] = [];
        if (unifiedContext.profile?.role) {
          contextParts.push(`Der Benutzer ist ${unifiedContext.profile.role}.`);
        }
        if (unifiedContext.profile?.industry) {
          contextParts.push(`Branche: ${unifiedContext.profile.industry}.`);
        }
        if (unifiedContext.recentTopics.length > 0) {
          contextParts.push(`Aktuelle Themen: ${unifiedContext.recentTopics.slice(0, 5).join(', ')}.`);
        }
        if (contextParts.length > 0) {
          systemPrompt += `\n\n[BENUTZER-KONTEXT]\n${contextParts.join('\n')}\nBerücksichtige diesen Kontext wenn relevant.`;
        }
      }
    } catch {
      // Continue without any context enhancement
    }
  }

  // === Adaptive RAG: Intent Classification (Phase 32A-1) ===
  // Classify query intent BEFORE deciding whether to run RAG.
  // This prevents unnecessary retrieval for greetings, confirmations, etc.
  const intentClassification = classifyIntent(userMessage, {
    messageCount: conversationHistory.length,
    recentMessages: conversationHistory.slice(-3),
    currentMode: modeResult.mode,
  });

  const retrievalConfig = intentToRetrievalConfig(intentClassification.intent);

  logger.info('Intent classification', {
    sessionId,
    intent: intentClassification.intent,
    confidence: intentClassification.confidence,
    tier: intentClassification.tier,
    reasoning: intentClassification.reasoning,
    shouldRetrieve: retrievalConfig.shouldRetrieve,
  });

  // Determine if RAG should be used: combine intent classifier with legacy RAG decision
  const ragDecision = shouldEnhanceWithRAG(userMessage, modeResult.mode);
  const shouldRunRAG = retrievalConfig.shouldRetrieve || (
    ragDecision.shouldUse && ragDecision.urgency === 'required'
  );

  let ragDocumentsCount = 0;
  let ragQuality: RAGQualityMetrics | undefined;

  if (shouldRunRAG) {
    try {
      // Use intent classifier to determine RAG depth
      const useDeepRAG = intentClassification.intent === 'full_retrieve' ||
        modeResult.mode === 'rag_enhanced' ||
        ragDecision.urgency === 'required';

      let ragResults: EnhancedResult[];
      let ragMetadata: EnhancedRAGResult | undefined;

      if (useDeepRAG) {
        // Full RAG with HyDE + Cross-Encoder for knowledge-intensive queries
        ragMetadata = await enhancedRAG.retrieve(userMessage, contextType, {
          enableHyDE: retrievalConfig.enableHyDE,
          autoDetectHyDE: true,
          enableCrossEncoder: retrievalConfig.enableCrossEncoder,
          crossEncodeTop: 10,
          minRelevance: 0.35,
          maxResults: retrievalConfig.maxResults,
          agenticConfig: { maxIterations: retrievalConfig.maxIterations },
        });
        ragResults = ragMetadata.results;

        // Build quality metrics
        ragQuality = {
          used: true,
          documentsCount: ragResults.length,
          confidence: ragMetadata.confidence,
          methodsUsed: ragMetadata.methodsUsed,
          timing: ragMetadata.timing,
          topResultScore: ragResults[0]?.score || 0,
          hydeUsed: ragMetadata.debug?.hydeUsed || false,
          crossEncoderUsed: ragMetadata.methodsUsed.includes('cross_encoder'),
        };

        logger.info('Deep RAG retrieval completed', {
          sessionId,
          confidence: ragMetadata.confidence,
          methods: ragMetadata.methodsUsed,
          timing: ragMetadata.timing,
        });
      } else {
        // Quick RAG for supplementary context
        ragResults = await enhancedRAG.quickRetrieve(
          userMessage,
          contextType,
          retrievalConfig.maxResults || 5
        );

        ragQuality = {
          used: true,
          documentsCount: ragResults.length,
          confidence: ragResults.length > 0 ? ragResults[0].score : 0,
          methodsUsed: ['agentic'],
          timing: { total: 0 },
          topResultScore: ragResults[0]?.score || 0,
          hydeUsed: false,
          crossEncoderUsed: false,
        };
      }

      if (ragResults.length > 0) {
        ragDocumentsCount = ragResults.length;
        const confidence = ragQuality?.confidence || 0;

        // Format context with relevance scores and source attribution
        const ragContext = ragResults.map(r => {
          const scoreLabel = r.score >= 0.8 ? '🟢' : r.score >= 0.6 ? '🟡' : '🔵';
          const relevanceInfo = r.relevanceReason ? ` - ${r.relevanceReason}` : '';
          return `${scoreLabel} [Aus deinen Ideen] **${r.title}**: ${r.summary || 'Keine Zusammenfassung'}${relevanceInfo}`;
        }).join('\n');

        const methodInfo = ragQuality?.methodsUsed.length > 1
          ? ` (via ${ragQuality.methodsUsed.join(' + ')})`
          : '';

        // Confidence-Gate: determine how to use RAG results
        if (confidence >= 0.7) {
          // High confidence: use results directly
          systemPrompt += `\n\n[RELEVANTE IDEEN${methodInfo}]\n${ragContext}\n\nNutze diese Informationen für die Antwort. Bei hoher Relevanz (🟢) zitiere die Quelle mit [Aus deinen Ideen].`;
        } else if (confidence >= 0.4) {
          // Medium confidence: use with disclaimer
          systemPrompt += `\n\n[RELEVANTE IDEEN - MITTLERE KONFIDENZ${methodInfo}]\n${ragContext}\n\nDiese Ergebnisse haben mittlere Relevanz. Nutze sie als Kontext, aber ergänze mit deinem eigenen Wissen. Markiere eigenes Wissen mit [AI-Wissen].`;
        } else {
          // Low confidence: still include what was found, but trigger web search fallback
          systemPrompt += `\n\n[RELEVANTE IDEEN - NIEDRIGE KONFIDENZ${methodInfo}]\n${ragContext}\n\nDiese Ergebnisse haben niedrige Relevanz.`;

          // Corrective RAG: Web search fallback for low-confidence queries
          try {
            const webResults = await searchWeb(userMessage, { count: 3, timeout: 8000 });
            if (webResults.success && webResults.results.length > 0) {
              const webContext = webResults.results.map(r =>
                `🌐 [Aus Web-Recherche] **${r.title}**: ${r.description} (${r.domain})`
              ).join('\n');

              systemPrompt += `\n\n[WEB-RECHERCHE ERGÄNZUNG]\n${webContext}\n\nDie obigen Informationen stammen aus einer Web-Recherche. Kennzeichne Informationen aus dem Web mit [Aus Web-Recherche] und eigenes Wissen mit [AI-Wissen].`;

              logger.info('Corrective RAG: web search fallback triggered', {
                sessionId,
                ragConfidence: confidence,
                webResultCount: webResults.results.length,
              });
            }
          } catch (webError) {
            logger.debug('Corrective RAG web fallback failed (non-critical)', { webError });
          }
        }

        logger.debug('RAG enhancement applied', {
          sessionId,
          documentsRetrieved: ragDocumentsCount,
          intent: intentClassification.intent,
          confidence,
          confidenceTier: confidence >= 0.7 ? 'high' : confidence >= 0.4 ? 'medium' : 'low',
          methods: ragQuality?.methodsUsed,
        });
      }
    } catch (error) {
      logger.warn('RAG enhancement failed', { sessionId, error });
      ragQuality = {
        used: false,
        documentsCount: 0,
        confidence: 0,
        methodsUsed: [],
        timing: { total: 0 },
        topResultScore: 0,
        hydeUsed: false,
        crossEncoderUsed: false,
      };
    }
  }

  logger.info('Generating chat response', {
    sessionId,
    historyLength: conversationHistory.length,
    messageLength: userMessage.length,
    mode: modeResult.mode,
    memoryStats,
    ragDocuments: ragDocumentsCount,
  });

  let response: string;
  let toolsCalled: Array<{ name: string; input: Record<string, unknown>; result: string }> = [];

  // Process based on detected mode
  if (modeResult.mode === 'tool_assisted' || modeResult.mode === 'agent') {
    // Use tools for tool_assisted or agent modes
    const tools = modeResult.suggestedTools || getDefaultToolsForMode(modeResult.mode);

    try {
      // Add tool usage instructions to system prompt
      systemPrompt += `\n\n[WERKZEUG-MODUS]\nDu hast Zugriff auf Werkzeuge um dem Benutzer zu helfen. Nutze sie proaktiv wenn sinnvoll.`;

      // Build messages for tool execution
      const messages = conversationHistory.map(msg => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      }));
      messages.push({ role: 'user' as const, content: userMessage });

      const toolResult = await executeWithTools(
        messages,
        tools.length > 0 ? tools : 'all',
        {
          systemPrompt,
          maxIterations: modeResult.mode === 'agent' ? 5 : 3,
          temperature: 0.7,
          executionContext, // Pass request-scoped context
        }
      );

      response = toolResult.response;
      toolsCalled = toolResult.toolsCalled;

      logger.info('Tool-assisted response generated', {
        sessionId,
        toolsCalled: toolsCalled.map(t => t.name),
        iterations: toolResult.iterations,
      });
    } catch (error) {
      // Fallback to standard response on tool error
      logger.warn('Tool execution failed, falling back to standard response', {
        sessionId,
        error: error instanceof Error ? error.message : 'Unknown',
      });

      response = await generateWithConversationHistory(
        systemPrompt,
        userMessage,
        conversationHistory,
        { maxTokens: 2000 }
      );
    }
  } else {
    // Standard conversation or RAG-enhanced mode
    response = await generateWithConversationHistory(
      systemPrompt,
      userMessage,
      conversationHistory,
      { maxTokens: 2000 }
    );
  }

  const processingTimeMs = Date.now() - startTime;

  // Model Orchestrator: classify and record for cost/routing insights (Phase 32F)
  const routingDecision = routeToModel(userMessage, {
    requiresTools: modeResult.mode === 'tool_assisted' || modeResult.mode === 'agent',
    requiresSynthesis: modeResult.mode === 'rag_enhanced',
    hasConversationHistory: conversationHistory.length > 0,
  });

  // Estimate token usage (approximate: ~4 chars/token)
  const estimatedInputTokens = Math.ceil((systemPrompt.length + userMessage.length) / 4);
  const estimatedOutputTokens = Math.ceil(response.length / 4);
  recordUsage(
    routingDecision.model.modelId,
    routingDecision.model.provider,
    estimatedInputTokens,
    estimatedOutputTokens,
    contextType
  );

  // Compliance Logger: audit trail for AI decisions (Phase 32G)
  logAIDecision({
    input: userMessage,
    output: response,
    modelId: routingDecision.model.modelId,
    confidence: ragQuality?.confidence || 0.5,
    sources: ragDocumentsCount > 0
      ? [{ type: 'rag', description: `${ragDocumentsCount} ideas retrieved`, relevance: ragQuality?.confidence }]
      : [{ type: 'ai_knowledge', description: 'Direct AI response' }],
    context: contextType,
    processingTimeMs,
    toolsUsed: toolsCalled.map(t => t.name),
    ragUsed: ragDocumentsCount > 0,
    webSearchUsed: ragQuality?.confidence !== undefined && ragQuality.confidence < 0.4,
  });

  logger.debug('Model orchestrator routing', {
    sessionId,
    complexity: routingDecision.complexity,
    selectedModel: routingDecision.model.modelId,
    reason: routingDecision.reason,
  });

  return {
    content: response,
    metadata: {
      mode: modeResult.mode,
      modeConfidence: modeResult.confidence,
      modeReasoning: modeResult.reasoning,
      toolsCalled,
      intentClassification: {
        intent: intentClassification.intent,
        confidence: intentClassification.confidence,
        tier: intentClassification.tier,
        reasoning: intentClassification.reasoning,
      },
      ragUsed: ragDocumentsCount > 0,
      ragDocumentsCount,
      ragQuality,
      processingTimeMs,
      memoryStats,
    },
  };
}

/**
 * Send a message and get AI response (combined operation)
 * Records the conversation as an episodic memory for future context
 *
 * @param includeMetadata - If true, includes processing metadata in response
 */
export async function sendMessage(
  sessionId: string,
  userMessage: string,
  contextType: 'personal' | 'work' | 'learning' | 'creative' = 'personal',
  includeMetadata: boolean = false,
  thinkingMode: ThinkingMode = 'assist'
): Promise<SendMessageResult> {
  // Store user message
  const storedUserMessage = await addMessage(sessionId, 'user', userMessage);

  // Update title if this is the first message
  await updateSessionTitle(sessionId, userMessage);

  // Add user interaction to short-term memory
  try {
    await memoryCoordinator.addInteraction(sessionId, 'user', userMessage);
  } catch (error) {
    logger.debug('Failed to add user interaction to memory', { sessionId, error });
  }

  // Generate AI response (with or without metadata)
  let aiResponse: string;
  let metadata: ResponseMetadata | undefined;

  if (includeMetadata) {
    const enhancedResult = await generateEnhancedResponse(sessionId, userMessage, contextType, thinkingMode);
    aiResponse = enhancedResult.content;
    metadata = enhancedResult.metadata;
  } else {
    aiResponse = await generateResponse(sessionId, userMessage, contextType);
  }

  // Store AI response
  const storedAssistantMessage = await addMessage(sessionId, 'assistant', aiResponse);

  // Add assistant interaction to short-term memory
  try {
    await memoryCoordinator.addInteraction(sessionId, 'assistant', aiResponse);
  } catch (error) {
    logger.debug('Failed to add assistant interaction to memory', { sessionId, error });
  }

  // Record as episodic memory (non-blocking, fire-and-forget)
  recordEpisode(sessionId, userMessage, aiResponse, contextType).catch(error => {
    logger.warn('Failed to record episodic memory - conversation may not be remembered', { sessionId, error });
  });

  // Analyze implicit feedback signals (non-blocking)
  implicitFeedback.analyzeInteraction(
    sessionId,
    contextType,
    userMessage,
    aiResponse,
    [] // Previous messages loaded internally via session tracking
  ).catch(error => {
    logger.debug('Implicit feedback analysis failed', { sessionId, error });
  });

  logger.info('Chat message exchange complete', {
    sessionId,
    userMessageId: storedUserMessage.id,
    assistantMessageId: storedAssistantMessage.id,
    mode: metadata?.mode,
    toolsCalled: metadata?.toolsCalled.map(t => t.name),
  });

  return {
    userMessage: storedUserMessage,
    assistantMessage: storedAssistantMessage,
    metadata,
  };
}

/**
 * Record a conversation exchange as an episodic memory
 * This enables the AI to recall similar past conversations
 */
async function recordEpisode(
  sessionId: string,
  trigger: string,
  response: string,
  context: 'personal' | 'work' | 'learning' | 'creative'
): Promise<void> {
  try {
    await episodicMemory.store(trigger, response, sessionId, context);
    logger.debug('Episodic memory recorded', { sessionId, triggerLength: trigger.length });
  } catch (error) {
    // Non-critical: log and continue
    logger.warn('Failed to record episodic memory', { sessionId, error });
  }
}
