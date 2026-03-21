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
 *
 * Handler implementations are in general-chat-handlers.ts (Phase 121 decomposition).
 */

import { Router, Request } from 'express';
import multer from 'multer';
import { apiKeyAuth, requireScope } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { validateBody } from '../utils/schemas';
import { CreateChatSessionSchema, ChatMessageSchema } from '../utils/schemas';
import { isValidImageFormat } from '../services/claude-vision';
import { inputScreeningMiddleware } from '../middleware/input-screening';
import { advancedRateLimiter } from '../services/security/rate-limit-advanced';
import {
  handleCreateSession,
  handleListSessions,
  handleGetSession,
  handleSendMessage,
  handleDeleteSession,
  handleQuickChat,
  handleVisionMessage,
  handleGetThinkingModes,
  handleGetMessageVersions,
  handleEditMessage,
  handleRegenerateMessage,
  handleStreamMessage,
} from './general-chat-handlers';

// Re-export buildMetadataResponse for any external consumers
export { buildMetadataResponse } from './general-chat-handlers';

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
// Route Definitions
// ===========================================

// POST /api/chat/sessions - Create new session
generalChatRouter.post('/sessions', apiKeyAuth, requireScope('write'), validateBody(CreateChatSessionSchema), asyncHandler(handleCreateSession));

// GET /api/chat/sessions - List sessions
generalChatRouter.get('/sessions', apiKeyAuth, asyncHandler(handleListSessions));

// GET /api/chat/sessions/:id - Get session with messages
generalChatRouter.get('/sessions/:id', apiKeyAuth, asyncHandler(handleGetSession));

// POST /api/chat/sessions/:id/messages - Send message
generalChatRouter.post('/sessions/:id/messages', apiKeyAuth, requireScope('write'), inputScreeningMiddleware, validateBody(ChatMessageSchema), asyncHandler(handleSendMessage));

// DELETE /api/chat/sessions/:id - Delete session
generalChatRouter.delete('/sessions/:id', apiKeyAuth, requireScope('write'), asyncHandler(handleDeleteSession));

// POST /api/chat/quick - Quick chat (no session required)
generalChatRouter.post('/quick', apiKeyAuth, requireScope('write'), inputScreeningMiddleware, asyncHandler(handleQuickChat));

// POST /api/chat/sessions/:id/messages/vision - Vision message
generalChatRouter.post(
  '/sessions/:id/messages/vision',
  apiKeyAuth,
  requireScope('write'),
  visionUpload.array('images', 5),
  asyncHandler(handleVisionMessage)
);

// GET /api/chat/thinking-modes - Available thinking modes
generalChatRouter.get('/thinking-modes', apiKeyAuth, asyncHandler(handleGetThinkingModes));

// GET /api/chat/sessions/:sessionId/messages/:messageId/versions - Message versions
generalChatRouter.get('/sessions/:sessionId/messages/:messageId/versions', apiKeyAuth, asyncHandler(handleGetMessageVersions));

// PUT /api/chat/sessions/:sessionId/messages/:messageId/edit - Edit message
generalChatRouter.put('/sessions/:sessionId/messages/:messageId/edit', apiKeyAuth, requireScope('write'), asyncHandler(handleEditMessage));

// POST /api/chat/sessions/:sessionId/messages/:messageId/regenerate - Regenerate message
generalChatRouter.post('/sessions/:sessionId/messages/:messageId/regenerate', apiKeyAuth, requireScope('write'), asyncHandler(handleRegenerateMessage));

// POST /api/chat/sessions/:id/messages/stream - Streaming message (SSE)
generalChatRouter.post('/sessions/:id/messages/stream', apiKeyAuth, requireScope('write'), advancedRateLimiter.ai, inputScreeningMiddleware, validateBody(ChatMessageSchema), asyncHandler(handleStreamMessage));
