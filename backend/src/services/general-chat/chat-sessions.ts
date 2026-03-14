/**
 * Chat Sessions - Session CRUD and types
 */

import { v4 as uuidv4 } from 'uuid';
import { query } from '../../utils/database';
import { logger } from '../../utils/logger';
import { memoryCoordinator } from '../memory';
import { SYSTEM_USER_ID } from '../../utils/user-context';

// ===========================================
// Types
// ===========================================

export interface ChatSession {
  id: string;
  context: 'personal' | 'work' | 'learning' | 'creative';
  title: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: Date;
}

export interface ChatSessionWithMessages extends ChatSession {
  messages: ChatMessage[];
}

/**
 * RAG quality details
 */
export interface RAGQualityMetrics {
  used: boolean;
  documentsCount: number;
  confidence: number;
  methodsUsed: string[];
  timing: {
    total: number;
    hyde?: number;
    agentic?: number;
    crossEncoder?: number;
  };
  topResultScore: number;
  hydeUsed: boolean;
  crossEncoderUsed: boolean;
}

/**
 * Response metadata from AI processing
 */
export interface ResponseMetadata {
  mode: import('../chat-modes').ChatMode;
  modeConfidence: number;
  modeReasoning: string;
  toolsCalled: Array<{ name: string; input: Record<string, unknown>; result: string }>;
  intentClassification?: {
    intent: string;
    confidence: number;
    tier: string;
    reasoning: string;
  };
  ragUsed: boolean;
  ragDocumentsCount: number;
  ragQuality?: RAGQualityMetrics;
  processingTimeMs: number;
  memoryStats: {
    longTermFacts: number;
    episodesRetrieved: number;
    workingMemorySlots: number;
  };
}

/**
 * Enhanced response with metadata
 */
export interface EnhancedResponse {
  content: string;
  metadata: ResponseMetadata;
}

/**
 * Result from sendMessage with optional metadata
 */
export interface SendMessageResult {
  userMessage: ChatMessage;
  assistantMessage: ChatMessage;
  metadata?: ResponseMetadata;
}

/**
 * Vision-enhanced response metadata
 */
export interface VisionResponseMetadata {
  mode: import('../chat-modes').ChatMode;
  modeConfidence: number;
  toolsCalled?: Array<{ name: string; input: Record<string, unknown>; result: string }>;
  visionTask: string;
  imageCount: number;
  processingTimeMs: number;
}

/**
 * Result from sendMessageWithVision
 */
export interface VisionMessageResult {
  userMessage: ChatMessage;
  assistantMessage: ChatMessage;
  metadata?: VisionResponseMetadata;
}

// ===========================================
// Session Management
// ===========================================

/**
 * Create a new chat session
 * Initializes both database session and HiMeS memory layers
 */
export async function createSession(context: 'personal' | 'work' | 'learning' | 'creative' = 'personal', sessionType: 'general' | 'assistant' = 'general', userId?: string): Promise<ChatSession> {
  const id = uuidv4();
  const uid = userId || SYSTEM_USER_ID;

  let result;
  try {
    result = await query(`
      INSERT INTO general_chat_sessions (id, context, session_type, user_id)
      VALUES ($1, $2, $3, $4)
      RETURNING id, context, title, created_at, updated_at
    `, [id, context, sessionType, uid]);
  } catch (err: unknown) {
    // Fallback if session_type column doesn't exist yet (migration not applied)
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('session_type')) {
      logger.warn('session_type column missing, falling back to basic insert');
      result = await query(`
        INSERT INTO general_chat_sessions (id, context, user_id)
        VALUES ($1, $2, $3)
        RETURNING id, context, title, created_at, updated_at
      `, [id, context, uid]);
    } else {
      throw err;
    }
  }

  const row = result.rows[0];

  // Initialize HiMeS memory session for enhanced context
  try {
    await memoryCoordinator.startSession(context, { chatSessionId: id });
    logger.debug('Memory session initialized', { sessionId: id, context });
  } catch (error) {
    // Non-critical: continue without memory enhancement
    logger.warn('Failed to initialize memory session', { sessionId: id, error });
  }

  logger.info('Chat session created', { sessionId: id, context });

  return {
    id: row.id,
    context: row.context,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Get a session by ID with all messages
 */
export async function getSession(sessionId: string, userId?: string): Promise<ChatSessionWithMessages | null> {
  const uid = userId || SYSTEM_USER_ID;
  // Get session
  const sessionResult = await query(`
    SELECT id, context, title, created_at, updated_at
    FROM general_chat_sessions
    WHERE id = $1 AND user_id = $2
  `, [sessionId, uid]);

  if (sessionResult.rows.length === 0) {
    return null;
  }

  const session = sessionResult.rows[0];

  // Get messages
  const messagesResult = await query(`
    SELECT id, session_id, role, content, created_at
    FROM general_chat_messages
    WHERE session_id = $1
    ORDER BY created_at ASC
  `, [sessionId]);

  const messages: ChatMessage[] = messagesResult.rows.map(row => ({
    id: row.id,
    sessionId: row.session_id,
    role: row.role,
    content: row.content,
    createdAt: row.created_at,
  }));

  return {
    id: session.id,
    context: session.context,
    title: session.title,
    createdAt: session.created_at,
    updatedAt: session.updated_at,
    messages,
  };
}

/**
 * Get all sessions for a context
 */
export async function getSessions(
  context: 'personal' | 'work' | 'learning' | 'creative' = 'personal',
  limit: number = 20,
  sessionType?: 'general' | 'assistant',
  userId?: string
): Promise<ChatSession[]> {
  const uid = userId || SYSTEM_USER_ID;
  const params: (string | number)[] = [context, limit, uid];
  let typeFilter = '';
  if (sessionType) {
    typeFilter = 'AND (session_type = $4 OR session_type IS NULL)';
    params.push(sessionType);
  }
  const result = await query(`
    SELECT id, context, title, created_at, updated_at
    FROM general_chat_sessions
    WHERE context = $1 AND user_id = $3 ${typeFilter}
    ORDER BY updated_at DESC
    LIMIT $2
  `, params);

  return result.rows.map(row => ({
    id: row.id,
    context: row.context,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

/**
 * Delete a session and all its messages
 * Ends the associated memory session and triggers consolidation
 */
export async function deleteSession(sessionId: string, userId?: string): Promise<boolean> {
  const uid = userId || SYSTEM_USER_ID;
  // Get session context before deletion for memory consolidation
  const sessionResult = await query(`
    SELECT context FROM general_chat_sessions WHERE id = $1 AND user_id = $2
  `, [sessionId, uid]);

  const rawContext = sessionResult.rows[0]?.context;
  const validContexts = ['personal', 'work', 'learning', 'creative'] as const;
  const context: 'personal' | 'work' | 'learning' | 'creative' | undefined =
    validContexts.includes(rawContext) ? rawContext : undefined;

  const result = await query(`
    DELETE FROM general_chat_sessions
    WHERE id = $1 AND user_id = $2
    RETURNING id
  `, [sessionId, uid]);

  if (result.rows.length > 0) {
    // End memory session and trigger consolidation (non-blocking)
    if (context) {
      memoryCoordinator.endSession(sessionId, true).catch(error => {
        logger.warn('Failed to end memory session - memory consolidation may be incomplete', { sessionId, error });
      });
    }

    logger.info('Chat session deleted', { sessionId });
    return true;
  }

  return false;
}

/**
 * Add a message to a session
 */
export async function addMessage(
  sessionId: string,
  role: 'user' | 'assistant',
  content: string,
  userId?: string
): Promise<ChatMessage> {
  const id = uuidv4();
  const uid = userId || SYSTEM_USER_ID;

  const result = await query(`
    INSERT INTO general_chat_messages (id, session_id, role, content, user_id)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING id, session_id, role, content, created_at
  `, [id, sessionId, role, content, uid]);

  // Update session's updated_at
  await query(`
    UPDATE general_chat_sessions
    SET updated_at = NOW()
    WHERE id = $1
  `, [sessionId]);

  const row = result.rows[0];

  return {
    id: row.id,
    sessionId: row.session_id,
    role: row.role,
    content: row.content,
    createdAt: row.created_at,
  };
}

/**
 * Helper to update session title (extracted for reuse)
 * Uses a single atomic UPDATE to avoid TOCTOU race conditions
 */
export async function updateSessionTitle(sessionId: string, userMessage: string): Promise<void> {
  // Generate a short title from the first message (max 50 chars)
  // Use Array.from to correctly handle multi-byte/emoji characters
  const chars = Array.from(userMessage);
  const title = chars.length > 50
    ? chars.slice(0, 47).join('') + '...'
    : userMessage;

  // Atomic: only sets title if it is currently NULL or empty
  const result = await query(`
    UPDATE general_chat_sessions
    SET title = $2, updated_at = NOW()
    WHERE id = $1 AND (title IS NULL OR title = '')
  `, [sessionId, title]);

  if (result.rowCount && result.rowCount > 0) {
    logger.debug('Session title set', { sessionId, title });
  }
}
