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
} from '../services/general-chat';
import { isValidUUID, toIntBounded } from '../utils/validation';
import { setupSSEHeaders, thinkingStream } from '../services/claude/streaming';
import { detectChatMode } from '../services/chat-modes';
import { query } from '../utils/database';
import {
  VisionImage,
  bufferToVisionImage,
  isValidImageFormat,
  ImageMediaType,
} from '../services/claude-vision';
import { CHAT } from '../config/constants';

export const generalChatRouter = Router();

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
generalChatRouter.post('/sessions', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const { context = 'personal' } = req.body;

  // Validate context
  if (context !== 'personal' && context !== 'work') {
    throw new ValidationError('Context must be "personal" or "work"');
  }

  const session = await createSession(context);

  logger.info('Chat session created via API', { sessionId: session.id, context });

  res.status(201).json({
    success: true,
    data: {
      session,
    },
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
  const context = (req.query.context as string) || 'personal';
  const limit = toIntBounded(req.query.limit as string, 20, 1, 100);

  // Validate context
  if (context !== 'personal' && context !== 'work') {
    throw new ValidationError('Context must be "personal" or "work"');
  }

  const sessions = await getSessions(context as 'personal' | 'work', limit);

  res.json({
    success: true,
    data: {
      sessions,
      count: sessions.length,
    },
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
  const { id } = req.params;

  // Validate UUID format
  if (!isValidUUID(id)) {
    throw new ValidationError('Invalid session ID format. Must be a valid UUID.');
  }

  const session = await getSession(id);

  if (!session) {
    throw new NotFoundError('Chat session');
  }

  res.json({
    success: true,
    data: {
      session,
    },
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
generalChatRouter.post('/sessions/:id/messages', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { message } = req.body;
  const includeMetadata = req.query.include_metadata === 'true' || req.body.include_metadata === true;

  // Validate UUID format
  if (!isValidUUID(id)) {
    throw new ValidationError('Invalid session ID format. Must be a valid UUID.');
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

  // Check session exists and get context
  const session = await getSession(id);
  if (!session) {
    throw new NotFoundError('Chat session');
  }

  logger.info('Processing chat message', {
    sessionId: id,
    messageLength: trimmedMessage.length,
    includeMetadata,
  });

  // Send message and get response
  const result = await sendMessage(
    id,
    trimmedMessage,
    session.context as 'personal' | 'work',
    includeMetadata
  );

  // Build response data
  const responseData: Record<string, unknown> = {
    userMessage: result.userMessage,
    assistantMessage: result.assistantMessage,
  };

  // Include metadata if requested
  if (includeMetadata && result.metadata) {
    responseData.metadata = {
      mode: result.metadata.mode,
      modeConfidence: result.metadata.modeConfidence,
      modeReasoning: result.metadata.modeReasoning,
      toolsCalled: result.metadata.toolsCalled.map(t => ({
        name: t.name,
        input: t.input,
      })),
      ragUsed: result.metadata.ragUsed,
      ragDocumentsCount: result.metadata.ragDocumentsCount,
      ragQuality: result.metadata.ragQuality ? {
        confidence: result.metadata.ragQuality.confidence,
        methodsUsed: result.metadata.ragQuality.methodsUsed,
        topResultScore: result.metadata.ragQuality.topResultScore,
        hydeUsed: result.metadata.ragQuality.hydeUsed,
        crossEncoderUsed: result.metadata.ragQuality.crossEncoderUsed,
        timingMs: result.metadata.ragQuality.timing.total,
      } : undefined,
      processingTimeMs: result.metadata.processingTimeMs,
    };
  }

  res.json({
    success: true,
    data: responseData,
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
  const { id } = req.params;

  // Validate UUID format
  if (!isValidUUID(id)) {
    throw new ValidationError('Invalid session ID format. Must be a valid UUID.');
  }

  const deleted = await deleteSession(id);

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
generalChatRouter.post('/quick', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const { message, context = 'personal', include_metadata = false } = req.body;
  const includeMetadata = include_metadata === true;

  // Validate context
  if (context !== 'personal' && context !== 'work') {
    throw new ValidationError('Context must be "personal" or "work"');
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
  const session = await createSession(context);

  logger.info('Processing quick chat message', {
    sessionId: session.id,
    messageLength: trimmedMessage.length,
    includeMetadata,
  });

  // Send message and get response
  const result = await sendMessage(session.id, trimmedMessage, context, includeMetadata);

  // Build response data
  const responseData: Record<string, unknown> = {
    sessionId: session.id,
    userMessage: result.userMessage,
    assistantMessage: result.assistantMessage,
  };

  // Include metadata if requested
  if (includeMetadata && result.metadata) {
    responseData.metadata = {
      mode: result.metadata.mode,
      modeConfidence: result.metadata.modeConfidence,
      modeReasoning: result.metadata.modeReasoning,
      toolsCalled: result.metadata.toolsCalled.map(t => ({
        name: t.name,
        input: t.input,
      })),
      ragUsed: result.metadata.ragUsed,
      ragDocumentsCount: result.metadata.ragDocumentsCount,
      ragQuality: result.metadata.ragQuality ? {
        confidence: result.metadata.ragQuality.confidence,
        methodsUsed: result.metadata.ragQuality.methodsUsed,
        topResultScore: result.metadata.ragQuality.topResultScore,
        hydeUsed: result.metadata.ragQuality.hydeUsed,
        crossEncoderUsed: result.metadata.ragQuality.crossEncoderUsed,
        timingMs: result.metadata.ragQuality.timing.total,
      } : undefined,
      processingTimeMs: result.metadata.processingTimeMs,
    };
  }

  res.json({
    success: true,
    data: responseData,
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
  visionUpload.array('images', 5),
  asyncHandler(async (req: Request, res: Response) => {
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
    const session = await getSession(id);
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
      session.context as 'personal' | 'work',
      includeMetadata
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
      data: responseData,
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
generalChatRouter.post('/sessions/:id/messages/stream', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { message } = req.body;
  const thinkingBudget = toIntBounded(req.query.thinking_budget as string, 10000, 1000, 50000);

  // Validate UUID format
  if (!isValidUUID(id)) {
    throw new ValidationError('Invalid session ID format. Must be a valid UUID.');
  }

  // Validate message
  if (!message || typeof message !== 'string') {
    throw new ValidationError('Message is required and must be a string');
  }

  const trimmedMessage = message.trim();
  if (trimmedMessage.length === 0 || trimmedMessage.length > CHAT.MAX_MESSAGE_LENGTH) {
    throw new ValidationError(`Invalid message length (1-${CHAT.MAX_MESSAGE_LENGTH} characters)`);
  }

  // Check session exists
  const session = await getSession(id);
  if (!session) {
    throw new NotFoundError('Chat session');
  }

  logger.info('Starting streaming chat', {
    sessionId: id,
    messageLength: trimmedMessage.length,
    thinkingBudget,
  });

  // Store user message first
  await addMessage(id, 'user', trimmedMessage);

  // Get conversation history
  const historyResult = await query(`
    SELECT role, content
    FROM general_chat_messages
    WHERE session_id = $1
    ORDER BY created_at ASC
    LIMIT 50
  `, [id]);

  // Build messages array
  const messages = historyResult.rows.map((row: { role: string; content: string }) => ({
    role: row.role as 'user' | 'assistant',
    content: row.content,
  }));

  // Detect mode for system prompt enhancement
  const modeResult = detectChatMode(trimmedMessage);

  // Build system prompt (reference the shared constant from general-chat service)
  let systemPrompt = `Du bist ein hilfreicher, intelligenter KI-Assistent.

Deine Eigenschaften:
- Du antwortest auf Deutsch, es sei denn der Benutzer schreibt in einer anderen Sprache
- Du bist freundlich, präzise und hilfreich
- Du gibst strukturierte, gut lesbare Antworten
- Du verwendest Markdown-Formatierung wenn sinnvoll
- Du bist ehrlich und sagst wenn du etwas nicht weißt

Du hilfst bei allen Arten von Fragen: Recherche, Erklärungen, Brainstorming, Problemlösung, Texte verfassen, Code, und vieles mehr.`;

  if (modeResult.mode === 'agent' || modeResult.mode === 'rag_enhanced') {
    systemPrompt += `\n\n[MODUS: ${modeResult.mode}]\nDiese Anfrage erfordert tieferes Nachdenken. Nutze Extended Thinking um deine Gedanken zu strukturieren.`;
  }

  // Setup SSE and stream response
  setupSSEHeaders(res);

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
          if (line.startsWith('event: ')) eventType = line.slice(7).trim();
          else if (line.startsWith('data: ')) dataStr = line.slice(6);
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

  try {
    // Stream the response
    await thinkingStream(
      res,
      messages,
      systemPrompt,
      thinkingBudget
    );

    // Store assistant response after stream completes
    if (fullResponse) {
      await addMessage(id, 'assistant', fullResponse);
      logger.info('Streaming chat complete', {
        sessionId: id,
        responseLength: fullResponse.length,
        hadThinking: thinkingContent.length > 0,
      });
    }
  } catch (error) {
    logger.error('Streaming chat failed', error instanceof Error ? error : undefined);

    // If headers already sent (SSE started), send error via SSE
    if (res.headersSent) {
      try {
        const errorEvent = `event: error\ndata: ${JSON.stringify({ error: 'Stream failed' })}\n\n`;
        originalWrite(errorEvent);
        res.end();
      } catch {
        // Stream already broken, nothing more we can do
      }
    } else {
      // Headers not sent yet, respond with JSON error
      const isProduction = process.env.NODE_ENV === 'production';
      res.status(500).json({
        success: false,
        error: isProduction
          ? 'An error occurred while processing your request'
          : (error instanceof Error ? error.message : 'Streaming failed'),
      });
    }
  } finally {
    // Restore original write to prevent leaks
    res.write = originalWrite;
  }
}));
