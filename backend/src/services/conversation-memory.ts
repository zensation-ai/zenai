/**
 * Conversation Memory Service
 *
 * Manages conversation sessions for multi-turn interactions with Claude.
 * Provides short-term memory within sessions and persistence to database.
 *
 * Features:
 * - In-memory session caching for fast access
 * - Automatic session cleanup after timeout
 * - Database persistence for important sessions
 * - Conversation summarization for long sessions
 */

import { v4 as uuidv4 } from 'uuid';
import { queryContext, AIContext } from '../utils/database-context';
import { logger } from '../utils/logger';
import { generateClaudeResponse, ConversationMessage } from './claude';

// ===========================================
// Types & Interfaces
// ===========================================

export interface ConversationSession {
  id: string;
  context: AIContext;
  messages: ConversationMessage[];
  createdAt: Date;
  lastActivity: Date;
  metadata: SessionMetadata;
  compressedSummary?: string;
  isPersistedToDb: boolean;
}

export interface SessionMetadata {
  userId?: string;
  sessionType?: 'personalization' | 'general' | 'draft' | 'analysis';
  relatedIdeaIds?: string[];
  tags?: string[];
}

export interface ConversationStats {
  totalMessages: number;
  userMessages: number;
  assistantMessages: number;
  sessionDurationMs: number;
  hasCompressedHistory: boolean;
}

// ===========================================
// Configuration
// ===========================================

const CONFIG = {
  /** Maximum messages before compression */
  MAX_MESSAGES_BEFORE_COMPRESSION: 10,
  /** Messages to keep after compression */
  MESSAGES_TO_KEEP_AFTER_COMPRESSION: 5,
  /** Session timeout in milliseconds (30 minutes) */
  SESSION_TIMEOUT_MS: 30 * 60 * 1000,
  /** Maximum sessions to keep in memory */
  MAX_SESSIONS_IN_MEMORY: 100,
  /** Cleanup interval in milliseconds (5 minutes) */
  CLEANUP_INTERVAL_MS: 5 * 60 * 1000,
};

// ===========================================
// Conversation Memory Service
// ===========================================

class ConversationMemoryService {
  private sessions: Map<string, ConversationSession> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.startCleanupInterval();
  }

  // ===========================================
  // Session Management
  // ===========================================

  /**
   * Create a new conversation session
   */
  async createSession(
    context: AIContext,
    metadata: SessionMetadata = {}
  ): Promise<string> {
    const sessionId = uuidv4();

    const session: ConversationSession = {
      id: sessionId,
      context,
      messages: [],
      createdAt: new Date(),
      lastActivity: new Date(),
      metadata,
      isPersistedToDb: false,
    };

    this.sessions.set(sessionId, session);

    logger.info('Conversation session created', {
      sessionId,
      context,
      sessionType: metadata.sessionType,
    });

    // Evict oldest sessions if we're over the limit
    if (this.sessions.size > CONFIG.MAX_SESSIONS_IN_MEMORY) {
      this.evictOldestSession();
    }

    return sessionId;
  }

  /**
   * Get or create a session
   */
  async getOrCreateSession(
    sessionId: string | undefined,
    context: AIContext,
    metadata: SessionMetadata = {}
  ): Promise<ConversationSession> {
    if (sessionId) {
      const existing = this.sessions.get(sessionId);
      if (existing) {
        return existing;
      }

      // Try to load from database
      const fromDb = await this.loadSessionFromDb(sessionId, context);
      if (fromDb) {
        this.sessions.set(sessionId, fromDb);
        return fromDb;
      }
    }

    // Create new session
    const newSessionId = await this.createSession(context, metadata);
    const session = this.sessions.get(newSessionId);
    if (!session) {
      throw new Error(`Session ${newSessionId} not found after creation`);
    }
    return session;
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: string): ConversationSession | null {
    const session = this.sessions.get(sessionId);
    if (!session) {return null;}

    // Check if session has timed out
    if (Date.now() - session.lastActivity.getTime() > CONFIG.SESSION_TIMEOUT_MS) {
      logger.info('Session timed out', { sessionId });
      this.sessions.delete(sessionId);
      return null;
    }

    return session;
  }

  // ===========================================
  // Message Management
  // ===========================================

  /**
   * Add a message to the conversation
   */
  async addMessage(
    sessionId: string,
    role: 'user' | 'assistant',
    content: string
  ): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      logger.warn('Attempted to add message to non-existent session', { sessionId });
      return;
    }

    const message: ConversationMessage = {
      role,
      content,
      timestamp: new Date(),
    };

    session.messages.push(message);
    session.lastActivity = new Date();

    logger.debug('Message added to session', {
      sessionId,
      role,
      messageCount: session.messages.length,
    });

    // Check if we need to compress
    if (session.messages.length >= CONFIG.MAX_MESSAGES_BEFORE_COMPRESSION) {
      await this.compressSession(session);
    }
  }

  /**
   * Get conversation history for a session
   */
  getHistory(sessionId: string): ConversationMessage[] {
    const session = this.sessions.get(sessionId);
    if (!session) {return [];}

    return [...session.messages];
  }

  /**
   * Get history with compressed summary prepended if available
   */
  getHistoryWithContext(sessionId: string): {
    summary: string | null;
    messages: ConversationMessage[];
  } {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return { summary: null, messages: [] };
    }

    return {
      summary: session.compressedSummary || null,
      messages: [...session.messages],
    };
  }

  // ===========================================
  // Compression
  // ===========================================

  /**
   * Compress conversation history to maintain manageable size
   */
  private async compressSession(session: ConversationSession): Promise<void> {
    if (session.messages.length < CONFIG.MAX_MESSAGES_BEFORE_COMPRESSION) {
      return;
    }

    logger.info('Compressing conversation session', {
      sessionId: session.id,
      messageCount: session.messages.length,
    });

    try {
      // Get messages to compress (all but the last N)
      const messagesToCompress = session.messages.slice(
        0,
        -CONFIG.MESSAGES_TO_KEEP_AFTER_COMPRESSION
      );

      // Build conversation text for summarization
      const conversationText = messagesToCompress
        .map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
        .join('\n\n');

      // Generate summary
      const summaryPrompt = `Fasse diese Konversation in 3-5 Sätzen zusammen.
Fokussiere auf:
- Hauptthemen und Erkenntnisse
- Wichtige Entscheidungen oder Vereinbarungen
- Offene Fragen oder nächste Schritte

Konversation:
${conversationText}`;

      const summary = await generateClaudeResponse(
        'Du bist ein hilfreicher Assistent, der Konversationen prägnant zusammenfasst.',
        summaryPrompt,
        { maxTokens: 300 }
      );

      // Update session
      if (session.compressedSummary) {
        // Merge with existing summary
        session.compressedSummary = `${session.compressedSummary}\n\n[Weitere Zusammenfassung]\n${summary}`;
      } else {
        session.compressedSummary = summary;
      }

      // Keep only recent messages
      session.messages = session.messages.slice(-CONFIG.MESSAGES_TO_KEEP_AFTER_COMPRESSION);

      logger.info('Session compression complete', {
        sessionId: session.id,
        newMessageCount: session.messages.length,
        summaryLength: session.compressedSummary.length,
      });
    } catch (error) {
      logger.error('Failed to compress session', error instanceof Error ? error : undefined, {
        sessionId: session.id,
      });
    }
  }

  // ===========================================
  // Database Persistence
  // ===========================================

  /**
   * Persist session to database
   */
  async persistSession(sessionId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      logger.warn('Cannot persist non-existent session', { sessionId });
      return false;
    }

    try {
      await queryContext(
        session.context,
        `INSERT INTO conversation_sessions (id, context, messages, metadata, compressed_summary, created_at, last_activity)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO UPDATE SET
           messages = $3,
           metadata = $4,
           compressed_summary = $5,
           last_activity = $7`,
        [
          session.id,
          session.context,
          JSON.stringify(session.messages),
          JSON.stringify(session.metadata),
          session.compressedSummary || null,
          session.createdAt,
          session.lastActivity,
        ]
      );

      session.isPersistedToDb = true;

      logger.info('Session persisted to database', { sessionId });
      return true;
    } catch (error) {
      logger.error('Failed to persist session', error instanceof Error ? error : undefined, {
        sessionId,
      });
      return false;
    }
  }

  /**
   * Load session from database
   */
  private async loadSessionFromDb(
    sessionId: string,
    context: AIContext
  ): Promise<ConversationSession | null> {
    try {
      const result = await queryContext(
        context,
        `SELECT id, context, messages, metadata, compressed_summary, created_at, last_activity
         FROM conversation_sessions
         WHERE id = $1 AND context = $2`,
        [sessionId, context]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];

      const session: ConversationSession = {
        id: row.id,
        context: row.context,
        messages: this.parseMessages(row.messages),
        metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata || {},
        compressedSummary: row.compressed_summary,
        createdAt: new Date(row.created_at),
        lastActivity: new Date(row.last_activity),
        isPersistedToDb: true,
      };

      logger.info('Session loaded from database', { sessionId });
      return session;
    } catch (error) {
      logger.error('Failed to load session from database', error instanceof Error ? error : undefined, {
        sessionId,
      });
      return null;
    }
  }

  /**
   * Parse messages from database JSONB
   */
  private parseMessages(messages: unknown): ConversationMessage[] {
    if (!messages) {return [];}
    let parsedMessages: unknown = messages;
    if (typeof parsedMessages === 'string') {
      try {
        parsedMessages = JSON.parse(parsedMessages);
      } catch {
        return [];
      }
    }
    if (!Array.isArray(parsedMessages)) {return [];}

    return parsedMessages.map((msg: { role?: string; content?: string; timestamp?: string }) => ({
      role: (msg.role || 'user') as 'user' | 'assistant',
      content: msg.content || '',
      timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date(),
    }));
  }

  // ===========================================
  // Session Cleanup
  // ===========================================

  /**
   * Clear a session
   */
  async clearSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session && session.isPersistedToDb) {
      // Keep in database but clear from memory
      await this.persistSession(sessionId);
    }
    this.sessions.delete(sessionId);
    logger.info('Session cleared', { sessionId });
  }

  /**
   * Evict the oldest session from memory
   */
  private evictOldestSession(): void {
    let oldestSessionId: string | null = null;
    let oldestTime = Infinity;

    for (const [id, session] of this.sessions) {
      if (session.lastActivity.getTime() < oldestTime) {
        oldestTime = session.lastActivity.getTime();
        oldestSessionId = id;
      }
    }

    if (oldestSessionId) {
      const session = this.sessions.get(oldestSessionId);
      // Persist before evicting if it has messages
      if (session && session.messages.length > 0) {
        this.persistSession(oldestSessionId).catch(err => logger.warn('Failed to persist oldest session', { sessionId: oldestSessionId, error: err instanceof Error ? err.message : String(err) }));
      }
      this.sessions.delete(oldestSessionId);
      logger.info('Evicted oldest session', { sessionId: oldestSessionId });
    }
  }

  /**
   * Start the cleanup interval (skip in test env to prevent Jest handle leaks)
   */
  private startCleanupInterval(): void {
    if (process.env.NODE_ENV === 'test') {return;}
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredSessions();
    }, CONFIG.CLEANUP_INTERVAL_MS);
  }

  /**
   * Cleanup expired sessions
   */
  private cleanupExpiredSessions(): void {
    const now = Date.now();
    const expiredIds: string[] = [];

    for (const [id, session] of this.sessions) {
      if (now - session.lastActivity.getTime() > CONFIG.SESSION_TIMEOUT_MS) {
        expiredIds.push(id);
      }
    }

    for (const id of expiredIds) {
      const session = this.sessions.get(id);
      // Persist before cleanup if it has messages
      if (session && session.messages.length > 0) {
        this.persistSession(id).catch(err => logger.warn('Failed to persist session on cleanup', { sessionId: id, error: err instanceof Error ? err.message : String(err) }));
      }
      this.sessions.delete(id);
    }

    if (expiredIds.length > 0) {
      logger.info('Cleaned up expired sessions', { count: expiredIds.length });
    }
  }

  /**
   * Stop the cleanup interval (for graceful shutdown)
   */
  stopCleanupInterval(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  // ===========================================
  // Statistics
  // ===========================================

  /**
   * Get statistics for a session
   */
  getSessionStats(sessionId: string): ConversationStats | null {
    const session = this.sessions.get(sessionId);
    if (!session) {return null;}

    const userMessages = session.messages.filter(m => m.role === 'user').length;
    const assistantMessages = session.messages.filter(m => m.role === 'assistant').length;

    return {
      totalMessages: session.messages.length,
      userMessages,
      assistantMessages,
      sessionDurationMs: Date.now() - session.createdAt.getTime(),
      hasCompressedHistory: !!session.compressedSummary,
    };
  }

  /**
   * Get all active session IDs
   */
  getActiveSessionIds(): string[] {
    return Array.from(this.sessions.keys());
  }

  /**
   * Get count of active sessions
   */
  getActiveSessionCount(): number {
    return this.sessions.size;
  }
}

// ===========================================
// Singleton Export
// ===========================================

export const conversationMemory = new ConversationMemoryService();

// Re-export types
export { ConversationMessage };
