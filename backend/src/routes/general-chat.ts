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
import { apiKeyAuth, requireScope } from '../middleware/auth';
import { asyncHandler, ValidationError, NotFoundError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';
import {
  createSession,
  getSession,
  getSessions,
  deleteSession,
  sendMessage,
  addMessage,
} from '../services/general-chat';
import { isValidUUID } from '../utils/validation';
import { setupSSEHeaders, thinkingStream } from '../services/claude/streaming';
import { detectChatMode } from '../services/chat-modes';
import { query } from '../utils/database';

export const generalChatRouter = Router();

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
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

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

  const MAX_MESSAGE_LENGTH = 10000;
  if (message.length > MAX_MESSAGE_LENGTH) {
    throw new ValidationError(`Message too long. Maximum ${MAX_MESSAGE_LENGTH} characters allowed.`);
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

  const MAX_MESSAGE_LENGTH = 10000;
  if (message.length > MAX_MESSAGE_LENGTH) {
    throw new ValidationError(`Message too long. Maximum ${MAX_MESSAGE_LENGTH} characters allowed.`);
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
generalChatRouter.post('/sessions/:id/messages/stream', apiKeyAuth, async (req: Request, res: Response) => {
  const { id } = req.params;
  const { message } = req.body;
  const enableThinking = req.query.enable_thinking !== 'false';
  const thinkingBudget = parseInt(req.query.thinking_budget as string) || 10000;

  try {
    // Validate UUID format
    if (!isValidUUID(id)) {
      res.status(400).json({ success: false, error: 'Invalid session ID format' });
      return;
    }

    // Validate message
    if (!message || typeof message !== 'string') {
      res.status(400).json({ success: false, error: 'Message is required' });
      return;
    }

    const trimmedMessage = message.trim();
    if (trimmedMessage.length === 0 || trimmedMessage.length > 10000) {
      res.status(400).json({ success: false, error: 'Invalid message length' });
      return;
    }

    // Check session exists
    const session = await getSession(id);
    if (!session) {
      res.status(404).json({ success: false, error: 'Chat session not found' });
      return;
    }

    logger.info('Starting streaming chat', {
      sessionId: id,
      messageLength: trimmedMessage.length,
      enableThinking,
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

    // Build system prompt
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

    // Collect response for storage
    let fullResponse = '';
    let thinkingContent = '';

    // Create custom event handler to collect content
    const originalWrite = res.write.bind(res);
    res.write = function(chunk: any, ...args: any[]): boolean {
      // Parse SSE event to collect content
      const chunkStr = chunk.toString();
      const eventMatch = chunkStr.match(/event: (\w+)\ndata: (.+)\n/);
      if (eventMatch) {
        const [, eventType, dataStr] = eventMatch;
        try {
          const data = JSON.parse(dataStr);
          if (eventType === 'content_delta' && data.content) {
            fullResponse += data.content;
          } else if (eventType === 'thinking_delta' && data.thinking) {
            thinkingContent += data.thinking;
          }
        } catch {
          // Ignore parse errors
        }
      }
      return originalWrite(chunk, ...args);
    };

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

    // If headers not sent, send error response
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Streaming failed',
      });
    } else {
      // Headers sent, try to send SSE error
      try {
        const errorEvent = `event: error\ndata: ${JSON.stringify({ error: 'Stream failed' })}\n\n`;
        res.write(errorEvent);
        res.end();
      } catch {
        // Ignore if we can't write
      }
    }
  }
});
