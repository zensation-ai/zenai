/**
 * General Chat Routes
 *
 * Provides a ChatGPT-like chat interface for general questions and conversations.
 * Endpoints:
 * - POST /api/chat/sessions - Create new chat session
 * - GET /api/chat/sessions - List chat sessions
 * - GET /api/chat/sessions/:id - Get session with messages
 * - POST /api/chat/sessions/:id/messages - Send message and get response
 * - POST /api/chat/sessions/:id/messages/stream - Stream response with SSE
 * - DELETE /api/chat/sessions/:id - Delete session
 */

import { Router, Request, Response } from 'express';
import multer from 'multer';
import { apiKeyAuth, requireScope } from '../middleware/auth';
import { asyncHandler, ValidationError, NotFoundError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';
import {
  createSession,
  getSession,
  getSessions,
  deleteSession,
  sendMessage,
  sendMessageWithVision,
  addMessage,
  updateSessionTitle,
  GENERAL_CHAT_SYSTEM_PROMPT,
  type SendMessageResult,
} from '../services/general-chat';
import { getAssistantSystemPrompt } from '../services/assistant-knowledge';
import { isValidUUID, toIntBounded } from '../utils/validation';
import { isValidContext } from '../utils/database-context';
import { validateBody } from '../utils/schemas';
import { trackActivity } from '../services/activity-tracker';
import { CreateChatSessionSchema, ChatMessageSchema } from '../utils/schemas';
import Anthropic from '@anthropic-ai/sdk';
import { setupSSEHeaders, thinkingStream, streamToSSE } from '../services/claude/streaming';
import { toolRegistry, ToolExecutionContext } from '../services/claude/tool-use';
import { detectChatModeAsync } from '../services/chat-modes';
import { isValidThinkingMode, getAvailableModes, applyThinkingMode, ThinkingMode } from '../services/thinking-partner';
import {
  buildCompactionConfig,
  shouldEnableCompaction,
  estimateConversationTokens,
  getCompactionState,
} from '../services/claude/context-compaction';
import {
  classifyTaskType,
  calculateDynamicBudget,
} from '../services/claude/thinking-budget';
import { classifyIntent } from '../services/query-intent-classifier';
import { query } from '../utils/database';
import { queryContext } from '../utils/database-context';
import {
  VisionImage,
  bufferToVisionImage,
  isValidImageFormat,
  ImageMediaType,
} from '../services/claude-vision';
import { CHAT } from '../config/constants';
import { memoryCoordinator, episodicMemory, workingMemory } from '../services/memory';
import { getUnifiedContext } from '../services/business-context';
import { getPersonalFactsPromptSection } from '../services/personal-facts-bridge';
import { getUserId } from '../utils/user-context';

export const generalChatRouter = Router();

/**
 * Build metadata response from raw result metadata.
 * Extracted to avoid 3x code duplication across endpoints.
 */
function buildMetadataResponse(metadata: NonNullable<SendMessageResult['metadata']>) {
  return {
    mode: metadata.mode,
    modeConfidence: metadata.modeConfidence,
    modeReasoning: metadata.modeReasoning,
    toolsCalled: metadata.toolsCalled.map(t => ({
      name: t.name,
      input: t.input,
    })),
    ragUsed: metadata.ragUsed,
    ragDocumentsCount: metadata.ragDocumentsCount,
    ragQuality: metadata.ragQuality ? {
      confidence: metadata.ragQuality.confidence,
      methodsUsed: metadata.ragQuality.methodsUsed,
      topResultScore: metadata.ragQuality.topResultScore,
      hydeUsed: metadata.ragQuality.hydeUsed,
      crossEncoderUsed: metadata.ragQuality.crossEncoderUsed,
      timingMs: metadata.ragQuality.timing.total,
    } : undefined,
    processingTimeMs: metadata.processingTimeMs,
  };
}

// ===========================================
// Multer Configuration for Vision Chat
// ===========================================

/**
 * Multer storage for vision messages
 * Uses memory storage for direct buffer access
 */
const storage = multer.memoryStorage();

/**
 * File filter to validate image types
 */
const imageFilter = (
  _req: Request,
  file: Express.Multer.File,
  callback: multer.FileFilterCallback
) => {
  if (!isValidImageFormat(file.mimetype)) {
    callback(new Error(`Invalid image format: ${file.mimetype}. Supported: JPEG, PNG, GIF, WebP`));
    return;
  }
  callback(null, true);
};

/**
 * Multer upload for vision chat
 * Max 5 images, 10MB each
 */
const visionUpload = multer({
  storage,
  fileFilter: imageFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max
    files: 5,
  },
});

// ===========================================
// Create New Session
// ===========================================

/**
 * POST /api/chat/sessions
 * Create a new chat session
 */
generalChatRouter.post('/sessions', apiKeyAuth, requireScope('write'), validateBody(CreateChatSessionSchema), asyncHandler(async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const { context, type } = req.body;
  const sessionType = type === 'assistant' ? 'assistant' as const : 'general' as const;

  const session = await createSession(context, sessionType, userId);

  logger.info('Chat session created via API', { sessionId: session.id, context, sessionType });

  res.status(201).json({
    success: true,
    session,
  });
}));

// ===========================================
// List Sessions
// ===========================================

/**
 * GET /api/chat/sessions
 * List all chat sessions for a context
 */
generalChatRouter.get('/sessions', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const context = (req.query.context as string) || 'personal';
  const limit = toIntBounded(req.query.limit as string, 20, 1, 100);

  // Validate context
  if (!isValidContext(context)) {
    throw new ValidationError('Invalid context. Use "personal", "work", "learning", or "creative".');
  }

  const typeFilter = req.query.type as string | undefined;
  const sessionType = typeFilter === 'assistant' ? 'assistant' as const : undefined;
  const sessions = await getSessions(context as 'personal' | 'work' | 'learning' | 'creative', limit, sessionType, userId);

  res.json({
    success: true,
    sessions,
    count: sessions.length,
  });
}));

// ===========================================
// Get Session with Messages
// ===========================================

/**
 * GET /api/chat/sessions/:id
 * Get a specific session with all messages
 */
generalChatRouter.get('/sessions/:id', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const { id } = req.params;

  // Validate UUID format
  if (!isValidUUID(id)) {
    throw new ValidationError('Invalid session ID format. Must be a valid UUID.');
  }

  const session = await getSession(id, userId);

  if (!session) {
    throw new NotFoundError('Chat session');
  }

  res.json({
    success: true,
    session,
  });
}));

// ===========================================
// Send Message
// ===========================================

/**
 * POST /api/chat/sessions/:id/messages
 * Send a message and receive AI response
 *
 * Query params:
 * - include_metadata: boolean - Include processing metadata in response
 */
generalChatRouter.post('/sessions/:id/messages', apiKeyAuth, requireScope('write'), validateBody(ChatMessageSchema), asyncHandler(async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const { id } = req.params;
  const { message, include_metadata, thinking_mode } = req.body;
  const includeMetadata = req.query.include_metadata === 'true' || include_metadata === true;

  // Validate and resolve thinking mode (Phase 32C-1)
  const thinkingMode: ThinkingMode = thinking_mode && isValidThinkingMode(thinking_mode)
    ? thinking_mode
    : 'assist';

  // Validate UUID format
  if (!isValidUUID(id)) {
    throw new ValidationError('Invalid session ID format. Must be a valid UUID.');
  }

  // Check session exists and get context
  const session = await getSession(id, userId);
  if (!session) {
    throw new NotFoundError('Chat session');
  }

  logger.info('Processing chat message', {
    sessionId: id,
    messageLength: message.length,
    includeMetadata,
    thinkingMode,
  });

  // Send message and get response (message already trimmed by Zod schema)
  const result = await sendMessage(
    id,
    message,
    session.context as 'personal' | 'work' | 'learning' | 'creative',
    includeMetadata,
    thinkingMode,
    userId
  );

  // Track activity for evolution timeline + suggestions (non-blocking)
  trackActivity(session.context as 'personal' | 'work' | 'learning' | 'creative', {
    eventType: 'behavior_adapted',
    title: `Chat: ${message.substring(0, 50)}${message.length > 50 ? '...' : ''}`,
    description: `Chat-Nachricht in Session ${id}`,
    impact_score: 0.3,
    related_entity_type: 'chat_session',
    related_entity_id: id,
    actionType: 'chat_message_sent',
    actionData: { sessionId: id, messageLength: message.length },
  }).catch((err) => logger.debug('Failed to record chat activity', { error: err instanceof Error ? err.message : String(err) }));

  // Build response data
  const responseData: Record<string, unknown> = {
    userMessage: result.userMessage,
    assistantMessage: result.assistantMessage,
  };

  // Include metadata if requested
  if (includeMetadata && result.metadata) {
    responseData.metadata = buildMetadataResponse(result.metadata);
  }

  res.json({
    success: true,
    ...responseData,
  });
}));

// ===========================================
// Delete Session
// ===========================================

/**
 * DELETE /api/chat/sessions/:id
 * Delete a chat session and all its messages
 */
generalChatRouter.delete('/sessions/:id', apiKeyAuth, requireScope('write'), asyncHandler(async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const { id } = req.params;

  // Validate UUID format
  if (!isValidUUID(id)) {
    throw new ValidationError('Invalid session ID format. Must be a valid UUID.');
  }

  const deleted = await deleteSession(id, userId);

  if (!deleted) {
    throw new NotFoundError('Chat session');
  }

  res.json({
    success: true,
    message: 'Chat session deleted',
  });
}));

// ===========================================
// Quick Chat (No Session Required)
// ===========================================

/**
 * POST /api/chat/quick
 * Send a quick message without session management
 * Creates a temporary session, sends message, returns response
 *
 * Body params:
 * - include_metadata: boolean - Include processing metadata in response
 */
generalChatRouter.post('/quick', apiKeyAuth, requireScope('write'), asyncHandler(async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const { message, context = 'personal', include_metadata = false } = req.body;
  const includeMetadata = include_metadata === true;

  // Validate context
  if (!isValidContext(context)) {
    throw new ValidationError('Invalid context. Use "personal", "work", "learning", or "creative".');
  }

  // Validate message
  if (!message || typeof message !== 'string') {
    throw new ValidationError('Message is required and must be a string');
  }

  if (message.length > CHAT.MAX_MESSAGE_LENGTH) {
    throw new ValidationError(`Message too long. Maximum ${CHAT.MAX_MESSAGE_LENGTH} characters allowed.`);
  }

  const trimmedMessage = message.trim();
  if (trimmedMessage.length === 0) {
    throw new ValidationError('Message cannot be empty');
  }

  // Create session
  const session = await createSession(context, undefined, userId);

  logger.info('Processing quick chat message', {
    sessionId: session.id,
    messageLength: trimmedMessage.length,
    includeMetadata,
  });

  // Send message and get response
  const result = await sendMessage(session.id, trimmedMessage, context, includeMetadata, 'assist', userId);

  // Build response data
  const responseData: Record<string, unknown> = {
    sessionId: session.id,
    userMessage: result.userMessage,
    assistantMessage: result.assistantMessage,
  };

  // Include metadata if requested
  if (includeMetadata && result.metadata) {
    responseData.metadata = buildMetadataResponse(result.metadata);
  }

  res.json({
    success: true,
    ...responseData,
  });
}));

// ===========================================
// Vision Message (Image + Text)
// ===========================================

/**
 * POST /api/chat/sessions/:id/messages/vision
 * Send a message with image(s) and receive AI response
 *
 * Body (multipart/form-data):
 * - message: string (optional) - Text message with the image
 * - images: File[] (required, 1-5) - Images to analyze
 * - task?: string - Vision task type (default: 'qa' if message provided, 'describe' otherwise)
 * - include_metadata?: boolean - Include processing metadata
 */
generalChatRouter.post(
  '/sessions/:id/messages/vision',
  apiKeyAuth,
  requireScope('write'),
  visionUpload.array('images', 5),
  asyncHandler(async (req: Request, res: Response) => {
    const userId = getUserId(req);
    const { id } = req.params;
    const { message, task, include_metadata } = req.body;
    const includeMetadata = include_metadata === 'true' || include_metadata === true;
    const files = req.files as Express.Multer.File[];

    // Validate UUID format
    if (!isValidUUID(id)) {
      throw new ValidationError('Invalid session ID format. Must be a valid UUID.');
    }

    // Validate images
    if (!files || files.length === 0) {
      throw new ValidationError('At least one image is required');
    }

    // Check session exists and get context
    const session = await getSession(id, userId);
    if (!session) {
      throw new NotFoundError('Chat session');
    }

    // Convert files to VisionImages
    const visionImages: VisionImage[] = files.map(file =>
      bufferToVisionImage(file.buffer, file.mimetype as ImageMediaType)
    );

    // Determine task based on message presence
    const visionTask = task || (message ? 'qa' : 'describe');

    logger.info('Processing vision chat message', {
      sessionId: id,
      imageCount: visionImages.length,
      hasMessage: !!message,
      task: visionTask,
      includeMetadata,
    });

    // Send message with vision
    const result = await sendMessageWithVision(
      id,
      message || '',
      visionImages,
      visionTask,
      session.context as 'personal' | 'work' | 'learning' | 'creative',
      includeMetadata,
      userId
    );

    // Build response data
    const responseData: Record<string, unknown> = {
      userMessage: result.userMessage,
      assistantMessage: result.assistantMessage,
      visionUsed: true,
      imageCount: visionImages.length,
    };

    // Include metadata if requested
    if (includeMetadata && result.metadata) {
      responseData.metadata = {
        mode: result.metadata.mode,
        modeConfidence: result.metadata.modeConfidence,
        toolsCalled: result.metadata.toolsCalled?.map(t => ({
          name: t.name,
          input: t.input,
        })) || [],
        visionTask: visionTask,
        processingTimeMs: result.metadata.processingTimeMs,
      };
    }

    res.json({
      success: true,
      ...responseData,
    });
  })
);

// ===========================================
// Streaming Message (SSE)
// ===========================================

/**
 * POST /api/chat/sessions/:id/messages/stream
 * Send a message and receive AI response via Server-Sent Events
 *
 * Supports Extended Thinking for real-time thinking display
 *
 * Query params:
 * - enable_thinking: boolean - Enable Extended Thinking (default: true)
 * - thinking_budget: number - Max thinking tokens (default: 10000)
 *
 * SSE Events:
 * - thinking_start: Extended thinking begins
 * - thinking_delta: Thinking content chunk
 * - thinking_end: Extended thinking complete
 * - content_start: Response content begins
 * - content_delta: Response content chunk
 * - done: Stream complete with metadata
 * - error: Error occurred
 */
/**
 * GET /api/chat/thinking-modes
 * Get available thinking partner modes for the frontend
 */
generalChatRouter.get('/thinking-modes', apiKeyAuth, asyncHandler(async (_req: Request, res: Response) => {
  const modes = getAvailableModes();
  res.json({
    success: true,
    modes,
  });
}));

generalChatRouter.post('/sessions/:id/messages/stream', apiKeyAuth, requireScope('write'), validateBody(ChatMessageSchema), asyncHandler(async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const { id } = req.params;
  const { message, thinking_mode, assistantMode } = req.body;
  const isAssistantMode = assistantMode === true;
  const thinkingBudget = toIntBounded(req.query.thinking_budget as string, 10000, 1000, 50000);

  // Validate thinking mode (Phase 32C-1) - assistant always uses 'assist'
  const thinkingMode: ThinkingMode = isAssistantMode
    ? 'assist'
    : (thinking_mode && isValidThinkingMode(thinking_mode) ? thinking_mode : 'assist');

  // Validate UUID format
  if (!isValidUUID(id)) {
    throw new ValidationError('Invalid session ID format. Must be a valid UUID.');
  }

  // Check session exists
  const session = await getSession(id, userId);
  if (!session) {
    throw new NotFoundError('Chat session');
  }

  logger.info('Starting streaming chat', {
    sessionId: id,
    messageLength: message.length,
    thinkingBudget,
  });

  // Store user message first (already trimmed by Zod schema)
  await addMessage(id, 'user', message, userId);

  // Update title if this is the first message (same as non-streaming sendMessage)
  await updateSessionTitle(id, message);

  // Get context type from session for memory integration
  const contextType = (session.context as 'personal' | 'work' | 'learning' | 'creative') || 'personal';

  // Add user interaction to short-term memory (non-blocking)
  try {
    await memoryCoordinator.addInteraction(id, 'user', message);
  } catch (error) {
    logger.debug('Failed to add user interaction to memory (stream)', { sessionId: id, error });
  }

  // Get conversation history from public schema (chat tables are in public, not context schemas)
  const historyResult = await query(`
    SELECT role, content
    FROM general_chat_messages
    WHERE session_id = $1 AND user_id = $2
    ORDER BY created_at ASC
    LIMIT $3
  `, [id, userId, CHAT.MAX_HISTORY_MESSAGES]);

  // Build messages array
  const messages = historyResult.rows.map((row: { role: string; content: string }) => ({
    role: row.role as 'user' | 'assistant',
    content: row.content,
  }));

  // Detect mode for system prompt enhancement (message already trimmed by Zod)
  const modeResult = await detectChatModeAsync(message);

  // Build system prompt - use assistant knowledge for assistant mode
  let systemPrompt = isAssistantMode
    ? getAssistantSystemPrompt()
    : GENERAL_CHAT_SYSTEM_PROMPT;

  // Apply thinking partner mode (Phase 32C-1)
  if (thinkingMode !== 'assist') {
    systemPrompt = applyThinkingMode(systemPrompt, thinkingMode);
  }

  // === Memory Enhancement (HiMeS 4-Layer) ===
  // Enhance system prompt with memory context so the AI remembers past conversations
  try {
    const enhancedContext = await memoryCoordinator.prepareEnhancedContext(
      id,
      message,
      contextType,
      { maxContextTokens: CHAT.MAX_MEMORY_CONTEXT_TOKENS, includeEpisodic: true, includeLongTerm: true }
    );

    if (enhancedContext.systemEnhancement) {
      systemPrompt += `\n\n${enhancedContext.systemEnhancement}`;
    }

    const wmContextString = workingMemory.generateContextString(id);
    if (wmContextString) {
      systemPrompt += `\n\n${wmContextString}`;
    }

    if (enhancedContext.episodicMemory?.emotionalTone) {
      const tone = enhancedContext.episodicMemory.emotionalTone;
      if (tone.dominantMood !== 'neutral') {
        systemPrompt += `\n\n[EMOTIONALER KONTEXT]\nBisherige Stimmung: ${tone.dominantMood === 'positive' ? 'positiv' : 'negativ'}. Passe deinen Ton entsprechend an.`;
      }
    }

    // Load personal facts from PersonalizationChat (cross-context, cached)
    // Pass user message for query-relevant fact selection
    const personalFactsSection = await getPersonalFactsPromptSection(message);
    if (personalFactsSection) {
      systemPrompt += personalFactsSection;
    }

    logger.debug('Stream memory context prepared', {
      sessionId: id,
      memoryStats: enhancedContext.stats,
      hasPersonalFacts: !!personalFactsSection,
    });
  } catch (error) {
    logger.warn('Stream memory enhancement failed, using fallback', { sessionId: id, error });
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
        if (unifiedContext.recentTopics?.length > 0) {
          contextParts.push(`Aktuelle Themen: ${unifiedContext.recentTopics.slice(0, 5).join(', ')}.`);
        }
        if (contextParts.length > 0) {
          systemPrompt += `\n\n[BENUTZER-KONTEXT]\n${contextParts.join('\n')}\nBerücksichtige diesen Kontext wenn relevant.`;
        }
      }
    } catch (fallbackErr) {
      logger.debug('Context fallback also failed', { sessionId: id, error: fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr) });
    }
  }

  if (modeResult.mode === 'agent' || modeResult.mode === 'rag_enhanced') {
    systemPrompt += `\n\n[MODUS: ${modeResult.mode}]\nDiese Anfrage erfordert tieferes Nachdenken. Nutze Extended Thinking um deine Gedanken zu strukturieren.`;
  }

  // Determine if context compaction should be enabled
  const estimatedTokens = estimateConversationTokens(
    historyResult.rows as Array<{ content: string }>,
    systemPrompt
  );
  const compactionConfig = shouldEnableCompaction(estimatedTokens)
    ? buildCompactionConfig()
    : undefined;

  if (compactionConfig) {
    const state = getCompactionState(id);
    logger.info('Context compaction enabled for stream', {
      sessionId: id,
      estimatedTokens,
      threshold: compactionConfig.triggerThreshold,
      previousCompactions: state.compactionCount,
    });
  }

  // === Adaptive Thinking Budget (Phase 33A-2) ===
  // Dynamically adjust thinking budget based on query complexity.
  // Simple queries (greetings, confirmations) get minimal/no thinking.
  // Complex queries (analysis, synthesis) get full thinking budget.
  let adaptiveThinkingBudget = thinkingBudget;
  let enableThinking = true;

  try {
    const intentResult = classifyIntent(message, {
      messageCount: historyResult.rows.length,
      recentMessages: historyResult.rows.slice(-3).map((r: { role: string; content: string }) => ({
        role: r.role as 'user' | 'assistant',
        content: r.content,
      })),
      currentMode: modeResult.mode,
    });

    if (intentResult.intent === 'skip' || intentResult.intent === 'conversation_only') {
      // Simple queries: minimal or no thinking
      adaptiveThinkingBudget = 2000;
      if (intentResult.intent === 'skip') {
        enableThinking = false;
      }
    } else {
      // Use dynamic budget system for retrieval-worthy queries
      const taskType = classifyTaskType(message);
      const budgetRec = await calculateDynamicBudget(message, taskType, contextType);
      adaptiveThinkingBudget = budgetRec.recommendedBudget;

      logger.info('Adaptive thinking budget calculated', {
        sessionId: id,
        intent: intentResult.intent,
        taskType,
        staticBudget: thinkingBudget,
        adaptiveBudget: adaptiveThinkingBudget,
        complexity: budgetRec.complexity.score,
        reasoning: budgetRec.reasoning,
      });
    }
  } catch (error) {
    // Fallback to static budget if adaptive fails
    logger.warn('Adaptive thinking budget failed, using static', {
      sessionId: id,
      error: error instanceof Error ? error.message : 'Unknown',
      fallbackBudget: thinkingBudget,
    });
  }

  // Setup SSE and stream response
  setupSSEHeaders(res);

  // Track client disconnect to avoid wasted work after browser closes
  let clientDisconnected = false;
  req.on('close', () => { clientDisconnected = true; });

  // Use a PassThrough approach: intercept SSE events using a content collector
  // instead of monkey-patching res.write (which was fragile and error-prone)
  let fullResponse = '';
  let thinkingContent = '';

  // Install a listener that captures SSE data as it flows through
  const originalWrite = res.write.bind(res) as typeof res.write;
  let sseBuffer = '';

  const interceptWrite: typeof res.write = function(
    chunk: unknown,
    encodingOrCallback?: BufferEncoding | ((error: Error | null | undefined) => void),
    callback?: (error: Error | null | undefined) => void
  ): boolean {
    // Parse SSE events from chunk to collect content for DB storage
    try {
      sseBuffer += String(chunk);
      let eventEnd: number;
      while ((eventEnd = sseBuffer.indexOf('\n\n')) !== -1) {
        const eventBlock = sseBuffer.slice(0, eventEnd);
        sseBuffer = sseBuffer.slice(eventEnd + 2);

        const lines = eventBlock.split('\n');
        let eventType = '';
        let dataStr = '';
        for (const line of lines) {
          if (line.startsWith('event: ')) {eventType = line.slice(7).trim();}
          else if (line.startsWith('data:')) {dataStr = line.startsWith('data: ') ? line.slice(6) : line.slice(5);}
        }

        if (eventType && dataStr) {
          try {
            const data = JSON.parse(dataStr);
            if (eventType === 'content_delta' && data.content) {
              fullResponse += data.content;
            } else if (eventType === 'thinking_delta' && data.thinking) {
              thinkingContent += data.thinking;
            }
          } catch { /* skip malformed JSON */ }
        }
      }
    } catch { /* never let interception errors break the stream */ }

    // Forward to original write with proper overload handling
    if (typeof encodingOrCallback === 'function') {
      return originalWrite(chunk as string, encodingOrCallback);
    } else if (encodingOrCallback !== undefined) {
      return originalWrite(chunk as string, encodingOrCallback, callback);
    }
    return originalWrite(chunk as string);
  };

  res.write = interceptWrite;

  // === Tool Definitions ===
  // Always provide tools so the AI can proactively use memory (remember/recall),
  // even in 'conversation' or 'rag_enhanced' modes. The Letta pattern requires
  // tools to be always available — the LLM decides when to use them.
  const shouldUseTools = true;
  const toolDefinitions = toolRegistry.getDefinitions() as unknown as Anthropic.Tool[];
  const toolExecContext: ToolExecutionContext = {
    aiContext: contextType,
    sessionId: id,
  };

  // Tool executor that uses the registry with request-scoped context
  const toolExecutor = async (name: string, input: Record<string, unknown>) => {
    return toolRegistry.execute(name, input, toolExecContext);
  };

  try {
    // Stream the response with adaptive thinking + compaction + tools
    if (enableThinking) {
      await thinkingStream(
        res,
        messages,
        systemPrompt,
        adaptiveThinkingBudget,
        compactionConfig,
        id,
        toolDefinitions,
        toolExecutor
      );
    } else {
      // Simple queries: skip thinking entirely for faster response
      await streamToSSE(res, messages, {
        enableThinking: false,
        systemPrompt,
        temperature: CHAT.DEFAULT_TEMPERATURE,
        maxTokens: CHAT.DEFAULT_MAX_TOKENS,
        compactionConfig,
        sessionId: id,
        tools: toolDefinitions,
        toolExecutor,
      });
    }

    // Flush any remaining SSE events in the intercept buffer
    if (sseBuffer.length > 0) {
      try {
        const lines = sseBuffer.split('\n');
        let eventType = '';
        let dataStr = '';
        for (const line of lines) {
          if (line.startsWith('event: ')) {eventType = line.slice(7).trim();}
          else if (line.startsWith('data:')) {dataStr = line.startsWith('data: ') ? line.slice(6) : line.slice(5);}
        }
        if (eventType && dataStr) {
          try {
            const data = JSON.parse(dataStr);
            if (eventType === 'content_delta' && data.content) {fullResponse += data.content;}
            else if (eventType === 'thinking_delta' && data.thinking) {thinkingContent += data.thinking;}
          } catch { /* skip */ }
        }
      } catch { /* ignore flush errors */ }
    }

    // Store assistant response after stream completes (skip if client disconnected)
    if (clientDisconnected) {
      logger.info('Client disconnected during stream, skipping post-stream operations', { sessionId: id });
      // Still save partial response if we have content
      if (fullResponse) {
        try { await addMessage(id, 'assistant', fullResponse, userId); } catch { /* best-effort */ }
      }
    } else if (fullResponse) {
      await addMessage(id, 'assistant', fullResponse, userId);

      // Add assistant interaction to short-term memory (non-blocking)
      try {
        await memoryCoordinator.addInteraction(id, 'assistant', fullResponse);
      } catch (error) {
        logger.debug('Failed to add assistant interaction to memory (stream)', { sessionId: id, error });
      }

      // Record as episodic memory (non-blocking, fire-and-forget)
      episodicMemory.store(message, fullResponse, id, contextType).catch(error => {
        logger.warn('Failed to record episodic memory from stream - conversation may not be remembered', { sessionId: id, error });
      });

      logger.info('Streaming chat complete', {
        sessionId: id,
        responseLength: fullResponse.length,
        hadThinking: thinkingContent.length > 0,
        hadTools: shouldUseTools,
      });
    } else {
      // Stream completed but returned no content - store a fallback assistant message
      // to prevent dangling user messages with no response in chat history
      logger.warn('Stream completed with no content - storing fallback message', { sessionId: id });
      await addMessage(id, 'assistant', 'Es tut mir leid, ich konnte keine Antwort generieren. Bitte versuche es erneut.', userId);
    }
  } catch (error) {
    logger.error('Streaming chat failed', error instanceof Error ? error : undefined);

    // Save partial assistant response if we collected any content before failure
    if (fullResponse.length > 0) {
      try {
        await addMessage(id, 'assistant', fullResponse + '\n\n[Antwort unvollstaendig - Verbindung unterbrochen]', userId);
        logger.info('Saved partial assistant response after stream failure', {
          sessionId: id, partialLength: fullResponse.length,
        });
      } catch (saveErr) {
        logger.warn('Failed to save partial response', { sessionId: id, error: saveErr });
      }
    }

    // If headers already sent (SSE started), send error via SSE (if not already ended)
    if (res.headersSent) {
      if (!res.writableEnded) {
        try {
          const errorEvent = `event: error\ndata: ${JSON.stringify({ error: 'Stream failed' })}\n\n`;
          originalWrite(errorEvent);
          res.end();
        } catch {
          // Stream already broken, nothing more we can do
        }
      }
    } else {
      // Headers not sent yet, respond with JSON error
      const isProduction = process.env.NODE_ENV === 'production';
      res.status(500).json({
        success: false,
        error: isProduction
          ? 'An error occurred while processing your request'
          : (error instanceof Error ? error.message : 'Streaming failed'),
        code: 'INTERNAL_ERROR',
      });
    }
  } finally {
    // Restore original write to prevent leaks
    res.write = originalWrite;
  }
}));
