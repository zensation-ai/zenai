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
// Schema Detection Cache
// ===========================================

/**
 * Cached flags for column existence.
 * null = not yet checked, true/false = detected.
 * Avoids repeated failing queries when migration hasn't been applied.
 */
let _hasSessionUserId: boolean | null = null;
let _hasMessageUserId: boolean | null = null;
let _hasSessionType: boolean | null = null;

function isColumnMissingError(err: unknown, columnName: string): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (msg.includes(columnName) && msg.includes('does not exist')) || (msg.includes('column') && msg.includes('does not exist'));
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

  // Try with all columns, fall back progressively if columns are missing
  if (_hasSessionUserId !== false && _hasSessionType !== false) {
    try {
      result = await query(`
        INSERT INTO general_chat_sessions (id, context, session_type, user_id)
        VALUES ($1, $2, $3, $4)
        RETURNING id, context, title, created_at, updated_at
      `, [id, context, sessionType, uid]);
      _hasSessionUserId = true;
      _hasSessionType = true;
    } catch (err: unknown) {
      if (isColumnMissingError(err, 'user_id')) {
        _hasSessionUserId = false;
        logger.warn('user_id column missing on general_chat_sessions - run phase76 migration');
      } else if (isColumnMissingError(err, 'session_type')) {
        _hasSessionType = false;
        logger.warn('session_type column missing on general_chat_sessions');
      } else {
        throw err;
      }
    }
  }

  // Retry without user_id if needed
  if (!result && _hasSessionUserId === false && _hasSessionType !== false) {
    try {
      result = await query(`
        INSERT INTO general_chat_sessions (id, context, session_type)
        VALUES ($1, $2, $3)
        RETURNING id, context, title, created_at, updated_at
      `, [id, context, sessionType]);
      _hasSessionType = true;
    } catch (err: unknown) {
      if (isColumnMissingError(err, 'session_type')) {
        _hasSessionType = false;
      } else {
        throw err;
      }
    }
  }

  // Retry without session_type if needed
  if (!result && _hasSessionType === false && _hasSessionUserId !== false) {
    try {
      result = await query(`
        INSERT INTO general_chat_sessions (id, context, user_id)
        VALUES ($1, $2, $3)
        RETURNING id, context, title, created_at, updated_at
      `, [id, context, uid]);
      _hasSessionUserId = true;
    } catch (err: unknown) {
      if (isColumnMissingError(err, 'user_id')) {
        _hasSessionUserId = false;
      } else {
        throw err;
      }
    }
  }

  // Final fallback: bare minimum columns
  if (!result) {
    result = await query(`
      INSERT INTO general_chat_sessions (id, context)
      VALUES ($1, $2)
      RETURNING id, context, title, created_at, updated_at
    `, [id, context]);
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

  let sessionResult;
  if (_hasSessionUserId !== false) {
    try {
      sessionResult = await query(`
        SELECT id, context, title, created_at, updated_at
        FROM general_chat_sessions
        WHERE id = $1 AND user_id = $2
      `, [sessionId, uid]);
      _hasSessionUserId = true;
    } catch (err: unknown) {
      if (isColumnMissingError(err, 'user_id')) {
        _hasSessionUserId = false;
        logger.warn('user_id column missing on general_chat_sessions - run phase76 migration');
      } else {
        throw err;
      }
    }
  }

  // Fallback without user_id filter
  if (!sessionResult) {
    sessionResult = await query(`
      SELECT id, context, title, created_at, updated_at
      FROM general_chat_sessions
      WHERE id = $1
    `, [sessionId]);
  }

  if (sessionResult.rows.length === 0) {
    return null;
  }

  const session = sessionResult.rows[0];

  // Get messages with user_id filter (defense-in-depth, session ownership already verified)
  let messagesResult;
  if (_hasMessageUserId !== false) {
    try {
      messagesResult = await query(`
        SELECT id, session_id, role, content, created_at
        FROM general_chat_messages
        WHERE session_id = $1 AND user_id = $2
        ORDER BY created_at ASC
      `, [sessionId, uid]);
    } catch (err: unknown) {
      if (isColumnMissingError(err, 'user_id')) {
        _hasMessageUserId = false;
      } else {
        throw err;
      }
    }
  }
  if (!messagesResult) {
    messagesResult = await query(`
      SELECT id, session_id, role, content, created_at
      FROM general_chat_messages
      WHERE session_id = $1
      ORDER BY created_at ASC
    `, [sessionId]);
  }

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

  let result;
  if (_hasSessionUserId !== false) {
    try {
      const params: (string | number)[] = [context, limit, uid];
      let typeFilter = '';
      if (sessionType) {
        typeFilter = 'AND (session_type = $4 OR session_type IS NULL)';
        params.push(sessionType);
      }
      result = await query(`
        SELECT id, context, title, created_at, updated_at
        FROM general_chat_sessions
        WHERE context = $1 AND user_id = $3 ${typeFilter}
        ORDER BY updated_at DESC
        LIMIT $2
      `, params);
      _hasSessionUserId = true;
    } catch (err: unknown) {
      if (isColumnMissingError(err, 'user_id')) {
        _hasSessionUserId = false;
        logger.warn('user_id column missing on general_chat_sessions - run phase76 migration');
      } else {
        throw err;
      }
    }
  }

  // Fallback without user_id
  if (!result) {
    const params: (string | number)[] = [context, limit];
    let typeFilter = '';
    if (sessionType) {
      typeFilter = 'AND (session_type = $3 OR session_type IS NULL)';
      params.push(sessionType);
    }
    result = await query(`
      SELECT id, context, title, created_at, updated_at
      FROM general_chat_sessions
      WHERE context = $1 ${typeFilter}
      ORDER BY updated_at DESC
      LIMIT $2
    `, params);
  }

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

  let sessionResult;
  if (_hasSessionUserId !== false) {
    try {
      sessionResult = await query(`
        SELECT context FROM general_chat_sessions WHERE id = $1 AND user_id = $2
      `, [sessionId, uid]);
      _hasSessionUserId = true;
    } catch (err: unknown) {
      if (isColumnMissingError(err, 'user_id')) {
        _hasSessionUserId = false;
      } else {
        throw err;
      }
    }
  }
  if (!sessionResult) {
    sessionResult = await query(`
      SELECT context FROM general_chat_sessions WHERE id = $1
    `, [sessionId]);
  }

  const rawContext = sessionResult.rows[0]?.context;
  const validContexts = ['personal', 'work', 'learning', 'creative'] as const;
  const context: 'personal' | 'work' | 'learning' | 'creative' | undefined =
    validContexts.includes(rawContext) ? rawContext : undefined;

  let deleteResult;
  if (_hasSessionUserId !== false) {
    try {
      deleteResult = await query(`
        DELETE FROM general_chat_sessions
        WHERE id = $1 AND user_id = $2
        RETURNING id
      `, [sessionId, uid]);
    } catch (err: unknown) {
      if (isColumnMissingError(err, 'user_id')) {
        _hasSessionUserId = false;
      } else {
        throw err;
      }
    }
  }
  if (!deleteResult) {
    deleteResult = await query(`
      DELETE FROM general_chat_sessions
      WHERE id = $1
      RETURNING id
    `, [sessionId]);
  }

  if (deleteResult.rows.length > 0) {
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

  let result;
  if (_hasMessageUserId !== false) {
    try {
      result = await query(`
        INSERT INTO general_chat_messages (id, session_id, role, content, user_id)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, session_id, role, content, created_at
      `, [id, sessionId, role, content, uid]);
      _hasMessageUserId = true;
    } catch (err: unknown) {
      if (isColumnMissingError(err, 'user_id')) {
        _hasMessageUserId = false;
        logger.warn('user_id column missing on general_chat_messages - run phase76 migration');
      } else {
        throw err;
      }
    }
  }

  // Fallback without user_id
  if (!result) {
    result = await query(`
      INSERT INTO general_chat_messages (id, session_id, role, content)
      VALUES ($1, $2, $3, $4)
      RETURNING id, session_id, role, content, created_at
    `, [id, sessionId, role, content]);
  }

  // Update session's updated_at (best-effort user_id filter)
  await query(`
    UPDATE general_chat_sessions
    SET updated_at = NOW()
    WHERE id = $1
  `, [sessionId]).catch(() => {/* non-critical */});

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
