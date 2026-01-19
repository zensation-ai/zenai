/**
 * General Chat Routes
 *
 * Provides a ChatGPT-like chat interface for general questions and conversations.
 * Endpoints:
 * - POST /api/chat/sessions - Create new chat session
 * - GET /api/chat/sessions - List chat sessions
 * - GET /api/chat/sessions/:id - Get session with messages
 * - POST /api/chat/sessions/:id/messages - Send message and get response
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
} from '../services/general-chat';

export const generalChatRouter = Router();

// UUID validation regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
  if (!UUID_REGEX.test(id)) {
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
 */
generalChatRouter.post('/sessions/:id/messages', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { message } = req.body;

  // Validate UUID format
  if (!UUID_REGEX.test(id)) {
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
  });

  // Send message and get response
  const result = await sendMessage(id, trimmedMessage, session.context as 'personal' | 'work');

  res.json({
    success: true,
    data: {
      userMessage: result.userMessage,
      assistantMessage: result.assistantMessage,
    },
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
  if (!UUID_REGEX.test(id)) {
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
 */
generalChatRouter.post('/quick', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const { message, context = 'personal' } = req.body;

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
  });

  // Send message and get response
  const result = await sendMessage(session.id, trimmedMessage, context);

  res.json({
    success: true,
    data: {
      sessionId: session.id,
      userMessage: result.userMessage,
      assistantMessage: result.assistantMessage,
    },
  });
}));
