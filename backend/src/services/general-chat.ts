/**
 * General Chat Service
 *
 * Provides a general-purpose chat interface using Claude AI.
 * Users can ask questions and get direct answers, similar to ChatGPT.
 */

import { v4 as uuidv4 } from 'uuid';
import { query } from '../utils/database';
import { logger } from '../utils/logger';
import { generateWithConversationHistory, ConversationMessage, isClaudeAvailable } from './claude';
import { getUnifiedContext } from './business-context';
import { memoryCoordinator, episodicMemory, workingMemory } from './memory';

// ===========================================
// Types
// ===========================================

export interface ChatSession {
  id: string;
  context: 'personal' | 'work';
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

// ===========================================
// Session Management
// ===========================================

/**
 * Create a new chat session
 * Initializes both database session and HiMeS memory layers
 */
export async function createSession(context: 'personal' | 'work' = 'personal'): Promise<ChatSession> {
  const id = uuidv4();

  const result = await query(`
    INSERT INTO general_chat_sessions (id, context)
    VALUES ($1, $2)
    RETURNING id, context, title, created_at, updated_at
  `, [id, context]);

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
export async function getSession(sessionId: string): Promise<ChatSessionWithMessages | null> {
  // Get session
  const sessionResult = await query(`
    SELECT id, context, title, created_at, updated_at
    FROM general_chat_sessions
    WHERE id = $1
  `, [sessionId]);

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
  context: 'personal' | 'work' = 'personal',
  limit: number = 20
): Promise<ChatSession[]> {
  const result = await query(`
    SELECT id, context, title, created_at, updated_at
    FROM general_chat_sessions
    WHERE context = $1
    ORDER BY updated_at DESC
    LIMIT $2
  `, [context, limit]);

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
export async function deleteSession(sessionId: string): Promise<boolean> {
  // Get session context before deletion for memory consolidation
  const sessionResult = await query(`
    SELECT context FROM general_chat_sessions WHERE id = $1
  `, [sessionId]);

  const context = sessionResult.rows[0]?.context as 'personal' | 'work' | undefined;

  const result = await query(`
    DELETE FROM general_chat_sessions
    WHERE id = $1
    RETURNING id
  `, [sessionId]);

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

// ===========================================
// Message Management
// ===========================================

/**
 * Add a message to a session
 */
export async function addMessage(
  sessionId: string,
  role: 'user' | 'assistant',
  content: string
): Promise<ChatMessage> {
  const id = uuidv4();

  const result = await query(`
    INSERT INTO general_chat_messages (id, session_id, role, content)
    VALUES ($1, $2, $3, $4)
    RETURNING id, session_id, role, content, created_at
  `, [id, sessionId, role, content]);

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
 * Update session title based on first message
 */
async function updateSessionTitle(sessionId: string, userMessage: string): Promise<void> {
  // Check if title is already set
  const sessionResult = await query(`
    SELECT title FROM general_chat_sessions WHERE id = $1
  `, [sessionId]);

  if (sessionResult.rows[0]?.title) {
    return; // Title already set
  }

  // Generate a short title from the first message (max 50 chars)
  const title = userMessage.length > 50
    ? userMessage.substring(0, 47) + '...'
    : userMessage;

  await query(`
    UPDATE general_chat_sessions
    SET title = $2
    WHERE id = $1
  `, [sessionId, title]);
}

// ===========================================
// AI Response Generation
// ===========================================

/**
 * System prompt for general chat
 */
const GENERAL_CHAT_SYSTEM_PROMPT = `Du bist ein hilfreicher, intelligenter KI-Assistent.

Deine Eigenschaften:
- Du antwortest auf Deutsch, es sei denn der Benutzer schreibt in einer anderen Sprache
- Du bist freundlich, präzise und hilfreich
- Du gibst strukturierte, gut lesbare Antworten
- Du verwendest Markdown-Formatierung wenn sinnvoll (Listen, Code-Blöcke, etc.)
- Du bist ehrlich und sagst wenn du etwas nicht weißt
- Du denkst mit und stellst Rückfragen wenn nötig

Du hilfst bei allen Arten von Fragen: Recherche, Erklärungen, Brainstorming, Problemlösung, Texte verfassen, Code, und vieles mehr.`;

/**
 * Generate AI response for a chat message
 * Uses HiMeS 4-layer memory architecture for enhanced context
 */
export async function generateResponse(
  sessionId: string,
  userMessage: string,
  contextType: 'personal' | 'work' = 'personal'
): Promise<string> {
  if (!isClaudeAvailable()) {
    throw new Error('Claude API ist nicht verfügbar');
  }

  // Get conversation history
  const messagesResult = await query(`
    SELECT role, content, created_at
    FROM general_chat_messages
    WHERE session_id = $1
    ORDER BY created_at ASC
    LIMIT 50
  `, [sessionId]);

  // Convert to ConversationMessage format
  const conversationHistory: ConversationMessage[] = messagesResult.rows.map(row => ({
    role: row.role as 'user' | 'assistant',
    content: row.content,
    timestamp: row.created_at,
  }));

  // Build enhanced system prompt with HiMeS memory context
  let systemPrompt = GENERAL_CHAT_SYSTEM_PROMPT;
  let memoryStats = { longTermFacts: 0, episodesRetrieved: 0, workingMemorySlots: 0 };

  try {
    // Use HiMeS memory coordinator for enhanced context
    const enhancedContext = await memoryCoordinator.prepareEnhancedContext(
      sessionId,
      userMessage,
      contextType,
      { maxContextTokens: 2000, includeEpisodic: true, includeLongTerm: true }
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

  logger.info('Generating chat response', {
    sessionId,
    historyLength: conversationHistory.length,
    messageLength: userMessage.length,
    memoryStats,
  });

  // Generate response using Claude with conversation history
  const response = await generateWithConversationHistory(
    systemPrompt,
    userMessage,
    conversationHistory,
    { maxTokens: 2000 }
  );

  return response;
}

/**
 * Send a message and get AI response (combined operation)
 * Records the conversation as an episodic memory for future context
 */
export async function sendMessage(
  sessionId: string,
  userMessage: string,
  contextType: 'personal' | 'work' = 'personal'
): Promise<{ userMessage: ChatMessage; assistantMessage: ChatMessage }> {
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

  // Generate AI response
  const aiResponse = await generateResponse(sessionId, userMessage, contextType);

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

  logger.info('Chat message exchange complete', {
    sessionId,
    userMessageId: storedUserMessage.id,
    assistantMessageId: storedAssistantMessage.id,
  });

  return {
    userMessage: storedUserMessage,
    assistantMessage: storedAssistantMessage,
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
  context: 'personal' | 'work'
): Promise<void> {
  try {
    await episodicMemory.store(trigger, response, sessionId, context);
    logger.debug('Episodic memory recorded', { sessionId, triggerLength: trigger.length });
  } catch (error) {
    // Non-critical: log and continue
    logger.warn('Failed to record episodic memory', { sessionId, error });
  }
}

