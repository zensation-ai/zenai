/**
 * Short-Term Memory Service (HiMeS Architecture)
 *
 * Manages short-term conversational memory inspired by hippocampal processing.
 * Features:
 * - Recent interaction tracking
 * - Automatic compression when threshold exceeded
 * - Pre-retrieval of relevant documents
 * - Session-based memory isolation
 */

import { v4 as uuidv4 } from 'uuid';
import { AIContext, queryContext } from '../../utils/database-context';
import { logger } from '../../utils/logger';
import { generateClaudeResponse } from '../claude';
import { generateEmbedding } from '../ai';
import { cosineSimilarity } from '../../utils/semantic-cache';

// ===========================================
// Types & Interfaces
// ===========================================

export interface Interaction {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export interface PreRetrievedDocument {
  ideaId: string;
  title: string;
  summary: string;
  relevanceScore: number;
  reason: 'topic_match' | 'recent' | 'related' | 'graph_connected';
  preloadedAt: Date;
}

export interface ShortTermMemory {
  sessionId: string;
  context: AIContext;
  recentInteractions: Interaction[];
  compressedSummary: string;
  preRetrievedDocs: PreRetrievedDocument[];
  currentTopics: string[];
  lastUpdated: Date;
  createdAt: Date;
}

export interface EnrichedContext {
  conversationSummary: string;
  recentMessages: Interaction[];
  preloadedIdeas: PreRetrievedDocument[];
  contextualHints: string[];
  suggestedFollowUps: string[];
}

// ===========================================
// Configuration
// ===========================================

const CONFIG = {
  /** Maximum interactions before compression */
  MAX_INTERACTIONS: 20,
  /** Interactions to keep after compression */
  KEEP_AFTER_COMPRESSION: 5,
  /** Maximum pre-retrieved documents */
  MAX_PRE_RETRIEVED: 10,
  /** Memory session timeout (30 minutes) */
  SESSION_TIMEOUT_MS: 30 * 60 * 1000,
  /** Maximum sessions in memory */
  MAX_SESSIONS: 100,
  /** Minimum relevance score for pre-retrieval */
  MIN_RELEVANCE_SCORE: 0.3,
  /** Maximum length for compressed summary (prevent unbounded growth) */
  MAX_SUMMARY_LENGTH: 10000,
};

// ===========================================
// Short-Term Memory Service
// ===========================================

export class ShortTermMemoryService {
  private memories: Map<string, ShortTermMemory> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.startCleanupInterval();
  }

  // ===========================================
  // Memory Management
  // ===========================================

  /**
   * Get or create a short-term memory for a session
   */
  async getOrCreateMemory(
    sessionId: string,
    context: AIContext
  ): Promise<ShortTermMemory> {
    let memory = this.memories.get(sessionId);

    if (!memory) {
      memory = {
        sessionId,
        context,
        recentInteractions: [],
        compressedSummary: '',
        preRetrievedDocs: [],
        currentTopics: [],
        lastUpdated: new Date(),
        createdAt: new Date(),
      };
      this.memories.set(sessionId, memory);

      logger.info('Short-term memory created', { sessionId, context });

      // Evict oldest if over limit
      if (this.memories.size > CONFIG.MAX_SESSIONS) {
        this.evictOldestMemory();
      }
    }

    return memory;
  }

  /**
   * Get memory by session ID
   */
  getMemory(sessionId: string): ShortTermMemory | null {
    const memory = this.memories.get(sessionId);
    if (!memory) {return null;}

    // Check if expired
    if (Date.now() - memory.lastUpdated.getTime() > CONFIG.SESSION_TIMEOUT_MS) {
      this.memories.delete(sessionId);
      return null;
    }

    return memory;
  }

  // ===========================================
  // Interaction Management
  // ===========================================

  /**
   * Add a new interaction to the memory
   */
  async addInteraction(
    sessionId: string,
    interaction: Omit<Interaction, 'id' | 'timestamp'>
  ): Promise<void> {
    const memory = this.memories.get(sessionId);
    if (!memory) {
      logger.warn('Attempted to add interaction to non-existent memory', { sessionId });
      return;
    }

    const fullInteraction: Interaction = {
      id: uuidv4(),
      ...interaction,
      timestamp: new Date(),
    };

    memory.recentInteractions.push(fullInteraction);
    memory.lastUpdated = new Date();

    logger.debug('Interaction added to short-term memory', {
      sessionId,
      role: interaction.role,
      interactionCount: memory.recentInteractions.length,
    });

    // Check if compression needed
    if (memory.recentInteractions.length >= CONFIG.MAX_INTERACTIONS) {
      await this.compressMemory(memory);
    }

    // Extract topics and pre-retrieve relevant documents
    if (interaction.role === 'user') {
      await this.updateTopicsAndPreRetrieve(memory, interaction.content);
    }
  }

  /**
   * Get recent interactions for a session
   */
  getRecentInteractions(sessionId: string, limit?: number): Interaction[] {
    const memory = this.memories.get(sessionId);
    if (!memory) {return [];}

    const interactions = memory.recentInteractions;
    return limit ? interactions.slice(-limit) : interactions;
  }

  // ===========================================
  // Compression
  // ===========================================

  /**
   * Compress interactions into a summary
   */
  private async compressMemory(memory: ShortTermMemory): Promise<void> {
    if (memory.recentInteractions.length < CONFIG.MAX_INTERACTIONS) {
      return;
    }

    logger.info('Compressing short-term memory', {
      sessionId: memory.sessionId,
      interactionCount: memory.recentInteractions.length,
    });

    try {
      // Get interactions to compress
      const toCompress = memory.recentInteractions.slice(
        0,
        -CONFIG.KEEP_AFTER_COMPRESSION
      );

      // Build conversation text
      const conversationText = toCompress
        .map(i => `${i.role === 'user' ? 'User' : i.role === 'assistant' ? 'Assistant' : 'System'}: ${i.content}`)
        .join('\n\n');

      // Generate summary
      const summary = await this.generateSummary(conversationText);

      // Update memory with bounded summary length
      if (memory.compressedSummary) {
        const newSummary = `${memory.compressedSummary}\n\n[Weitere Zusammenfassung]\n${summary}`;
        // PERFORMANCE FIX: Prevent unbounded growth of compressed summary
        if (newSummary.length > CONFIG.MAX_SUMMARY_LENGTH) {
          // Keep only the most recent half when limit exceeded
          const halfLength = Math.floor(CONFIG.MAX_SUMMARY_LENGTH / 2);
          memory.compressedSummary = `[Ältere Zusammenfassungen gekürzt...]\n\n${newSummary.slice(-halfLength)}`;
          logger.info('Compressed summary truncated to prevent memory growth', {
            sessionId: memory.sessionId,
            originalLength: newSummary.length,
            newLength: memory.compressedSummary.length,
          });
        } else {
          memory.compressedSummary = newSummary;
        }
      } else {
        memory.compressedSummary = summary;
      }

      // Keep only recent interactions
      memory.recentInteractions = memory.recentInteractions.slice(
        -CONFIG.KEEP_AFTER_COMPRESSION
      );

      logger.info('Short-term memory compressed', {
        sessionId: memory.sessionId,
        newInteractionCount: memory.recentInteractions.length,
        summaryLength: memory.compressedSummary.length,
      });
    } catch (error) {
      logger.error('Failed to compress memory', error instanceof Error ? error : undefined, {
        sessionId: memory.sessionId,
      });
    }
  }

  /**
   * Generate a summary of conversations
   */
  private async generateSummary(conversationText: string): Promise<string> {
    const prompt = `Fasse diese Konversation in 3-5 Sätzen zusammen. Fokussiere auf:
- Hauptthemen und Erkenntnisse
- Wichtige Entscheidungen oder Vereinbarungen
- Offene Fragen oder nächste Schritte
- Wichtige Fakten über den Nutzer

Konversation:
${conversationText}

Zusammenfassung:`;

    return await generateClaudeResponse(
      'Du bist ein hilfreicher Assistent, der Konversationen prägnant zusammenfasst. Antworte auf Deutsch.',
      prompt,
      { maxTokens: 400 }
    );
  }

  // ===========================================
  // Topic Extraction & Pre-Retrieval
  // ===========================================

  /**
   * Extract topics and pre-retrieve relevant documents
   */
  private async updateTopicsAndPreRetrieve(
    memory: ShortTermMemory,
    userMessage: string
  ): Promise<void> {
    try {
      // Extract topics from recent messages
      const topics = await this.extractTopics(memory, userMessage);
      memory.currentTopics = topics;

      // Pre-retrieve relevant documents
      await this.preRetrieveRelevantDocs(memory, userMessage, topics);
    } catch (error) {
      logger.debug('Failed to update topics and pre-retrieve', {
        sessionId: memory.sessionId,
        error: error instanceof Error ? error.message : 'Unknown',
      });
    }
  }

  /**
   * Extract topics from conversation
   */
  private async extractTopics(
    memory: ShortTermMemory,
    latestMessage: string
  ): Promise<string[]> {
    // Combine recent messages for topic extraction
    const recentText = memory.recentInteractions
      .slice(-3)
      .map(i => i.content)
      .join(' ');

    const combinedText = `${recentText} ${latestMessage}`.toLowerCase();

    // Simple keyword extraction (can be enhanced with NLP)
    const stopWords = new Set([
      'der', 'die', 'das', 'ein', 'eine', 'und', 'oder', 'aber', 'wenn', 'dann',
      'ist', 'sind', 'war', 'waren', 'hat', 'haben', 'wird', 'werden', 'kann',
      'könnte', 'muss', 'soll', 'ich', 'du', 'er', 'sie', 'es', 'wir', 'ihr',
      'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
      'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
      'should', 'may', 'might', 'can', 'to', 'of', 'in', 'for', 'on', 'with',
    ]);

    const words = combinedText
      .replace(/[^\w\säöüß]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 3 && !stopWords.has(w));

    // Count word frequency
    const wordCount = new Map<string, number>();
    for (const word of words) {
      wordCount.set(word, (wordCount.get(word) || 0) + 1);
    }

    // Get top topics
    return Array.from(wordCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([word]) => word);
  }

  /**
   * Pre-retrieve relevant documents based on current conversation
   */
  private async preRetrieveRelevantDocs(
    memory: ShortTermMemory,
    userMessage: string,
    _topics: string[]
  ): Promise<void> {
    try {
      // Generate embedding for current query
      const queryEmbedding = await generateEmbedding(userMessage);

      if (queryEmbedding.length === 0) {
        return;
      }

      // Find relevant ideas using semantic search
      const result = await queryContext(
        memory.context,
        `SELECT
          i.id,
          i.title,
          i.summary,
          i.embedding,
          i.created_at
         FROM ideas i
         WHERE i.context = $1
           AND i.is_archived = false
           AND i.embedding IS NOT NULL
         ORDER BY i.embedding <=> $2
         LIMIT 15`,
        [memory.context, `[${queryEmbedding.join(',')}]`]
      );

      // Calculate relevance scores and filter
      const preRetrieved: PreRetrievedDocument[] = [];

      for (const row of result.rows) {
        if (!row.embedding) {continue;}

        const embedding = typeof row.embedding === 'string'
          ? row.embedding.replace(/^\[/, '').replace(/\]$/, '').split(',').map(Number)
          : row.embedding;

        const similarity = cosineSimilarity(queryEmbedding, embedding);

        if (similarity >= CONFIG.MIN_RELEVANCE_SCORE) {
          preRetrieved.push({
            ideaId: row.id,
            title: row.title,
            summary: row.summary || '',
            relevanceScore: similarity,
            reason: similarity > 0.7 ? 'topic_match' : 'related',
            preloadedAt: new Date(),
          });
        }
      }

      // Sort by relevance and limit
      memory.preRetrievedDocs = preRetrieved
        .sort((a, b) => b.relevanceScore - a.relevanceScore)
        .slice(0, CONFIG.MAX_PRE_RETRIEVED);

      logger.debug('Pre-retrieved documents for short-term memory', {
        sessionId: memory.sessionId,
        documentCount: memory.preRetrievedDocs.length,
        topRelevance: memory.preRetrievedDocs[0]?.relevanceScore,
      });
    } catch (error) {
      logger.debug('Pre-retrieval failed', {
        error: error instanceof Error ? error.message : 'Unknown',
      });
    }
  }

  // ===========================================
  // Context Enrichment
  // ===========================================

  /**
   * Get enriched context for Claude calls
   */
  async getEnrichedContext(sessionId: string): Promise<EnrichedContext> {
    const memory = this.memories.get(sessionId);

    if (!memory) {
      return {
        conversationSummary: '',
        recentMessages: [],
        preloadedIdeas: [],
        contextualHints: [],
        suggestedFollowUps: [],
      };
    }

    // Generate contextual hints based on current state
    const contextualHints = this.generateContextualHints(memory);

    // Generate follow-up suggestions
    const suggestedFollowUps = await this.generateFollowUpSuggestions(memory);

    return {
      conversationSummary: memory.compressedSummary,
      recentMessages: memory.recentInteractions.slice(-5),
      preloadedIdeas: memory.preRetrievedDocs,
      contextualHints,
      suggestedFollowUps,
    };
  }

  /**
   * Generate contextual hints based on memory state
   */
  private generateContextualHints(memory: ShortTermMemory): string[] {
    const hints: string[] = [];

    // Add topic hints
    if (memory.currentTopics.length > 0) {
      hints.push(`Aktuelle Themen: ${memory.currentTopics.join(', ')}`);
    }

    // Add pre-retrieved document hints
    if (memory.preRetrievedDocs.length > 0) {
      const topDocs = memory.preRetrievedDocs.slice(0, 3);
      hints.push(`Relevante Ideen: ${topDocs.map(d => d.title).join(', ')}`);
    }

    // Add conversation length hint
    const totalInteractions = memory.recentInteractions.length;
    if (memory.compressedSummary) {
      hints.push('Längere Konversation mit komprimierter Historie');
    } else if (totalInteractions > 5) {
      hints.push(`${totalInteractions} Nachrichten in dieser Sitzung`);
    }

    return hints;
  }

  /**
   * Generate follow-up suggestions based on conversation
   */
  private async generateFollowUpSuggestions(memory: ShortTermMemory): Promise<string[]> {
    // Simple heuristic-based suggestions
    const suggestions: string[] = [];

    // If there are pre-retrieved docs, suggest exploring them
    if (memory.preRetrievedDocs.length > 0) {
      const topDoc = memory.preRetrievedDocs[0];
      suggestions.push(`Möchtest du mehr über "${topDoc.title}" erfahren?`);
    }

    // If topics are present, suggest related exploration
    if (memory.currentTopics.length > 0) {
      suggestions.push(`Soll ich nach weiteren Ideen zu "${memory.currentTopics[0]}" suchen?`);
    }

    return suggestions.slice(0, 3);
  }

  // ===========================================
  // Cleanup
  // ===========================================

  /**
   * Evict the oldest memory
   */
  private evictOldestMemory(): void {
    let oldestId: string | null = null;
    let oldestTime = Infinity;

    for (const [id, memory] of this.memories) {
      if (memory.lastUpdated.getTime() < oldestTime) {
        oldestTime = memory.lastUpdated.getTime();
        oldestId = id;
      }
    }

    if (oldestId) {
      this.memories.delete(oldestId);
      logger.info('Evicted oldest short-term memory', { sessionId: oldestId });
    }
  }

  /**
   * Start cleanup interval (skip in test env to prevent Jest handle leaks)
   */
  private startCleanupInterval(): void {
    if (process.env.NODE_ENV === 'test') {return;}
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredMemories();
    }, 5 * 60 * 1000); // Every 5 minutes
  }

  /**
   * Cleanup expired memories
   */
  private cleanupExpiredMemories(): void {
    const now = Date.now();
    const expiredIds: string[] = [];

    for (const [id, memory] of this.memories) {
      if (now - memory.lastUpdated.getTime() > CONFIG.SESSION_TIMEOUT_MS) {
        expiredIds.push(id);
      }
    }

    for (const id of expiredIds) {
      this.memories.delete(id);
    }

    if (expiredIds.length > 0) {
      logger.info('Cleaned up expired short-term memories', { count: expiredIds.length });
    }
  }

  /**
   * Clear a specific memory
   */
  clearMemory(sessionId: string): void {
    this.memories.delete(sessionId);
    logger.info('Short-term memory cleared', { sessionId });
  }

  /**
   * Stop cleanup interval (for graceful shutdown)
   */
  stopCleanupInterval(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Get statistics
   */
  getStats(): {
    activeMemories: number;
    totalInteractions: number;
    avgInteractionsPerMemory: number;
  } {
    let totalInteractions = 0;
    for (const memory of this.memories.values()) {
      totalInteractions += memory.recentInteractions.length;
    }

    return {
      activeMemories: this.memories.size,
      totalInteractions,
      avgInteractionsPerMemory: this.memories.size > 0
        ? Math.round(totalInteractions / this.memories.size)
        : 0,
    };
  }
}

// ===========================================
// Singleton Export
// ===========================================

export const shortTermMemory = new ShortTermMemoryService();
