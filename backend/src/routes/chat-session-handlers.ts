/**
 * Chat Session Handlers
 *
 * Session CRUD operations: create, list, get, delete.
 * Split from general-chat-handlers.ts (Phase 122) for maintainability.
 *
 * @module routes/chat-session-handlers
 */

import { Request, Response } from 'express';
import { ValidationError, NotFoundError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';
import {
  createSession,
  getSession,
  getSessions,
  deleteSession,
} from '../services/general-chat';
import { isValidUUID, toIntBounded } from '../utils/validation';
import { isValidContext } from '../utils/database-context';
import { getUserId } from '../utils/user-context';

// ===========================================
// Handler: Create Session
// ===========================================

export async function handleCreateSession(req: Request, res: Response): Promise<void> {
  const userId = getUserId(req);
  const { context, type } = req.body;
  const sessionType = type === 'assistant' ? 'assistant' as const : 'general' as const;

  const session = await createSession(context, sessionType, userId);

  logger.info('Chat session created via API', { sessionId: session.id, context, sessionType });

  res.status(201).json({
    success: true,
    session,
  });
}

// ===========================================
// Handler: List Sessions
// ===========================================

export async function handleListSessions(req: Request, res: Response): Promise<void> {
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
}

// ===========================================
// Handler: Get Session
// ===========================================

export async function handleGetSession(req: Request, res: Response): Promise<void> {
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
}

// ===========================================
// Handler: Delete Session
// ===========================================

export async function handleDeleteSession(req: Request, res: Response): Promise<void> {
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
}
