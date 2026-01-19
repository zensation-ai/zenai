/**
 * Memory Coordinator (HiMeS Architecture)
 *
 * The central coordinator that bridges short-term and long-term memory,
 * inspired by hippocampus-neocortex interaction in biological memory systems.
 *
 * Features:
 * - Prepares optimal context for Claude calls
 * - Combines short-term (session) and long-term (persistent) memory
 * - Implements context editing (pruning irrelevant information)
 * - Manages memory lifecycle
 */

import { AIContext } from '../../utils/database-context';
import { logger } from '../../utils/logger';
import { generateEmbedding } from '../ai';
import { cosineSimilarity, semanticCache } from '../../utils/semantic-cache';
import {
  shortTermMemory,
  Interaction,
  EnrichedContext,
  PreRetrievedDocument,
} from './short-term-memory';
import {
  longTermMemory,
  PersonalizationFact,
  FrequentPattern,
  LongTermRetrievalResult,
} from './long-term-memory';

// ===========================================
// Types & Interfaces
// ===========================================

export interface ContextPart {
  type: 'summary' | 'fact' | 'pattern' | 'document' | 'interaction' | 'hint';
  content: string;
  relevance: number;
  source: 'short_term' | 'long_term' | 'pre_retrieved';
}

export interface PreparedContext {
  /** Session ID for tracking */
  sessionId: string;
  /** Combined system prompt enhancement */
  systemEnhancement: string;
  /** Relevant context parts sorted by relevance */
  parts: ContextPart[];
  /** Summary of conversation history */
  conversationSummary: string;
  /** Pre-loaded documents for potential reference */
  preloadedDocuments: PreRetrievedDocument[];
  /** Suggested follow-ups for the user */
  suggestedFollowUps: string[];
  /** Memory statistics */
  stats: {
    shortTermInteractions: number;
    longTermFacts: number;
    preRetrievedDocs: number;
    contextPartsUsed: number;
  };
}

export interface MemorySessionOptions {
  /** Include long-term memory */
  includeLongTerm?: boolean;
  /** Include pre-retrieved documents */
  includePreRetrieved?: boolean;
  /** Maximum context parts to include */
  maxContextParts?: number;
  /** Minimum relevance score for context parts */
  minRelevance?: number;
}

// ===========================================
// Configuration
// ===========================================

const CONFIG = {
  /** Maximum context parts to include */
  DEFAULT_MAX_CONTEXT_PARTS: 20,
  /** Minimum relevance score */
  DEFAULT_MIN_RELEVANCE: 0.3,
  /** Relevance percentile to keep (top 70%) */
  RELEVANCE_PERCENTILE: 0.7,
  /** Cache TTL for prepared contexts */
  CONTEXT_CACHE_TTL_MS: 5 * 60 * 1000, // 5 minutes
};

// ===========================================
// Memory Coordinator
// ===========================================

class MemoryCoordinator {
  // ===========================================
  // Session Management
  // ===========================================

  /**
   * Start a new memory session
   */
  async startSession(context: AIContext, metadata?: Record<string, any>): Promise<string> {
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    // Initialize short-term memory
    await shortTermMemory.getOrCreateMemory(sessionId, context);

    // Ensure long-term memory is loaded
    await longTermMemory.initialize(context);

    logger.info('Memory session started', { sessionId, context });

    return sessionId;
  }

  /**
   * Add an interaction to the session
   */
  async addInteraction(
    sessionId: string,
    role: 'user' | 'assistant',
    content: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    await shortTermMemory.addInteraction(sessionId, {
      role,
      content,
      metadata,
    });
  }

  /**
   * End a session and optionally trigger consolidation
   */
  async endSession(sessionId: string, shouldConsolidate: boolean = false): Promise<void> {
    const memory = shortTermMemory.getMemory(sessionId);

    if (memory && shouldConsolidate && memory.recentInteractions.length >= 5) {
      // Trigger long-term consolidation if significant session
      await longTermMemory.consolidate(memory.context);
    }

    shortTermMemory.clearMemory(sessionId);
    logger.info('Memory session ended', { sessionId, consolidated: shouldConsolidate });
  }

  // ===========================================
  // Context Preparation (Main Entry Point)
  // ===========================================

  /**
   * Prepare optimal context for a Claude call.
   * This is the main entry point for every Claude interaction.
   */
  async prepareContext(
    sessionId: string,
    userQuery: string,
    context: AIContext,
    options: MemorySessionOptions = {}
  ): Promise<PreparedContext> {
    const {
      includeLongTerm = true,
      includePreRetrieved = true,
      maxContextParts = CONFIG.DEFAULT_MAX_CONTEXT_PARTS,
      minRelevance = CONFIG.DEFAULT_MIN_RELEVANCE,
    } = options;

    // Check semantic cache first
    const cacheKey = `context:${sessionId}:${userQuery.substring(0, 100)}`;
    const cached = await semanticCache.get(cacheKey) as PreparedContext | null;
    if (cached) {
      logger.debug('Using cached prepared context', { sessionId });
      return cached;
    }

    try {
      // 1. Get short-term memory context
      const shortTerm = await shortTermMemory.getEnrichedContext(sessionId);

      // 2. Get long-term memory context if enabled
      let longTerm: LongTermRetrievalResult | null = null;
      if (includeLongTerm) {
        longTerm = await longTermMemory.retrieve(context, userQuery);
      }

      // 3. Combine into context parts
      const allParts = this.combineContextParts(shortTerm, longTerm, userQuery);

      // 4. Prune irrelevant parts (Context Editing)
      const prunedParts = await this.pruneContext(allParts, userQuery, minRelevance);

      // 5. Limit to max parts
      const finalParts = prunedParts.slice(0, maxContextParts);

      // 6. Build system enhancement prompt
      const systemEnhancement = this.buildSystemEnhancement(finalParts, shortTerm);

      // 7. Prepare result
      const prepared: PreparedContext = {
        sessionId,
        systemEnhancement,
        parts: finalParts,
        conversationSummary: shortTerm.conversationSummary,
        preloadedDocuments: includePreRetrieved ? shortTerm.preloadedIdeas : [],
        suggestedFollowUps: shortTerm.suggestedFollowUps,
        stats: {
          shortTermInteractions: shortTerm.recentMessages.length,
          longTermFacts: longTerm?.facts.length || 0,
          preRetrievedDocs: shortTerm.preloadedIdeas.length,
          contextPartsUsed: finalParts.length,
        },
      };

      // Cache the result
      await semanticCache.set(cacheKey, prepared);

      logger.debug('Context prepared', {
        sessionId,
        partsCount: finalParts.length,
        hasLongTerm: !!longTerm,
      });

      return prepared;
    } catch (error) {
      logger.error('Failed to prepare context', error instanceof Error ? error : undefined, {
        sessionId,
      });

      // Return minimal context on error
      return {
        sessionId,
        systemEnhancement: '',
        parts: [],
        conversationSummary: '',
        preloadedDocuments: [],
        suggestedFollowUps: [],
        stats: {
          shortTermInteractions: 0,
          longTermFacts: 0,
          preRetrievedDocs: 0,
          contextPartsUsed: 0,
        },
      };
    }
  }

  // ===========================================
  // Context Combination
  // ===========================================

  /**
   * Combine short-term and long-term context into parts
   */
  private combineContextParts(
    shortTerm: EnrichedContext,
    longTerm: LongTermRetrievalResult | null,
    query: string
  ): ContextPart[] {
    const parts: ContextPart[] = [];

    // Add conversation summary if available
    if (shortTerm.conversationSummary) {
      parts.push({
        type: 'summary',
        content: shortTerm.conversationSummary,
        relevance: 0.9, // High relevance for conversation history
        source: 'short_term',
      });
    }

    // Add contextual hints
    for (const hint of shortTerm.contextualHints) {
      parts.push({
        type: 'hint',
        content: hint,
        relevance: 0.7,
        source: 'short_term',
      });
    }

    // Add pre-retrieved documents
    for (const doc of shortTerm.preloadedIdeas) {
      parts.push({
        type: 'document',
        content: `[${doc.title}]: ${doc.summary}`,
        relevance: doc.relevanceScore,
        source: 'pre_retrieved',
      });
    }

    // Add long-term facts
    if (longTerm) {
      for (const fact of longTerm.facts) {
        parts.push({
          type: 'fact',
          content: fact.content,
          relevance: fact.confidence,
          source: 'long_term',
        });
      }

      // Add patterns
      for (const pattern of longTerm.patterns) {
        parts.push({
          type: 'pattern',
          content: pattern.pattern,
          relevance: pattern.confidence,
          source: 'long_term',
        });
      }

      // Add relevant interactions
      for (const interaction of longTerm.relevantInteractions) {
        parts.push({
          type: 'interaction',
          content: interaction.summary,
          relevance: interaction.significance,
          source: 'long_term',
        });
      }
    }

    return parts;
  }

  // ===========================================
  // Context Editing (Pruning with Relevance Decay)
  // ===========================================

  /**
   * Calculate time-based relevance decay
   * Older context becomes less relevant over time
   */
  private calculateDecay(timestamp: number | undefined, decayRate: number = 0.05): number {
    if (!timestamp) return 1.0;

    const ageMs = Date.now() - timestamp;
    const ageHours = ageMs / (1000 * 60 * 60);

    // Exponential decay: relevance decreases over time
    // After ~24 hours, relevance is ~30% of original
    return Math.exp(-decayRate * ageHours);
  }

  /**
   * Apply type-based relevance boost
   * Some context types are inherently more important
   */
  private getTypeBoost(type: ContextPart['type']): number {
    const boosts: Record<ContextPart['type'], number> = {
      'summary': 1.2,      // Conversation summaries are very important
      'fact': 1.1,         // Known facts about user
      'pattern': 1.0,      // Behavioral patterns
      'document': 0.95,    // Pre-retrieved documents
      'interaction': 0.9,  // Past interactions
      'hint': 0.85,        // Contextual hints
    };
    return boosts[type] || 1.0;
  }

  /**
   * Prune irrelevant context parts based on query relevance
   * Enhanced with time decay and type boosting
   */
  private async pruneContext(
    parts: ContextPart[],
    query: string,
    minRelevance: number
  ): Promise<ContextPart[]> {
    if (parts.length === 0) return [];

    try {
      // Generate query embedding
      const queryEmbedding = await generateEmbedding(query);

      if (queryEmbedding.length === 0) {
        // Fall back to basic filtering with decay
        return parts
          .map(p => ({
            ...p,
            relevance: p.relevance * this.getTypeBoost(p.type),
          }))
          .filter(p => p.relevance >= minRelevance)
          .sort((a, b) => b.relevance - a.relevance);
      }

      // Score each part based on semantic similarity, decay, and type
      const scoredParts = await Promise.all(
        parts.map(async part => {
          try {
            const partEmbedding = await generateEmbedding(part.content);
            const similarity = cosineSimilarity(queryEmbedding, partEmbedding);

            // Get type-based boost
            const typeBoost = this.getTypeBoost(part.type);

            // Calculate time decay (if timestamp available in metadata)
            const timestamp = (part as any).timestamp || Date.now();
            const decay = this.calculateDecay(timestamp);

            // Calculate position penalty for very long context
            // Later parts are slightly less important to avoid context overflow
            const positionPenalty = 1.0; // Could be based on part index if needed

            // Combined relevance calculation
            // Base relevance (40%) + Semantic similarity (40%) + Type boost (20%)
            // Then apply decay
            const baseScore = part.relevance * 0.35 + similarity * 0.45 + typeBoost * 0.2;
            const decayedScore = baseScore * decay * positionPenalty;

            return {
              ...part,
              relevance: decayedScore,
              metadata: {
                originalRelevance: part.relevance,
                semanticSimilarity: similarity,
                typeBoost,
                decay,
              }
            };
          } catch {
            return {
              ...part,
              relevance: part.relevance * this.getTypeBoost(part.type),
            };
          }
        })
      );

      // Calculate dynamic threshold based on distribution
      const relevances = scoredParts.map(p => p.relevance).sort((a, b) => b - a);

      // Use percentile-based threshold with floor
      const thresholdIndex = Math.floor(relevances.length * CONFIG.RELEVANCE_PERCENTILE);
      const percentileThreshold = relevances[thresholdIndex] || 0;

      // Calculate mean-based threshold for comparison
      const mean = relevances.reduce((a, b) => a + b, 0) / relevances.length;
      const stdDev = Math.sqrt(
        relevances.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / relevances.length
      );
      const statisticalThreshold = mean - 0.5 * stdDev;

      // Use the more generous threshold but ensure minimum
      const threshold = Math.max(
        Math.min(percentileThreshold, statisticalThreshold),
        minRelevance
      );

      // Filter, sort, and apply diversity (avoid too many of same type)
      const filtered = scoredParts
        .filter(p => p.relevance >= threshold)
        .sort((a, b) => b.relevance - a.relevance);

      // Apply diversity constraint - limit same-type entries
      const diversified = this.applyDiversity(filtered, 5);

      return diversified;
    } catch (error) {
      logger.debug('Context pruning failed, using basic filter', { error });
      return parts.filter(p => p.relevance >= minRelevance);
    }
  }

  /**
   * Apply diversity constraint to avoid too many entries of the same type
   */
  private applyDiversity(parts: ContextPart[], maxPerType: number): ContextPart[] {
    const typeCounts: Record<string, number> = {};
    const result: ContextPart[] = [];

    for (const part of parts) {
      const count = typeCounts[part.type] || 0;
      if (count < maxPerType) {
        result.push(part);
        typeCounts[part.type] = count + 1;
      }
    }

    return result;
  }

  // ===========================================
  // System Enhancement Building
  // ===========================================

  /**
   * Build system prompt enhancement from context parts
   */
  private buildSystemEnhancement(
    parts: ContextPart[],
    shortTerm: EnrichedContext
  ): string {
    if (parts.length === 0) return '';

    const sections: string[] = [];

    // Group parts by type
    const facts = parts.filter(p => p.type === 'fact');
    const patterns = parts.filter(p => p.type === 'pattern');
    const documents = parts.filter(p => p.type === 'document');
    const summaries = parts.filter(p => p.type === 'summary');
    const hints = parts.filter(p => p.type === 'hint');

    // Add conversation summary
    if (summaries.length > 0) {
      sections.push(`[KONVERSATIONS-HISTORIE]\n${summaries.map(s => s.content).join('\n')}`);
    }

    // Add known facts about user
    if (facts.length > 0) {
      sections.push(`[BEKANNTES ÜBER DEN NUTZER]\n${facts.map(f => `- ${f.content}`).join('\n')}`);
    }

    // Add behavioral patterns
    if (patterns.length > 0) {
      sections.push(`[ERKANNTE MUSTER]\n${patterns.map(p => `- ${p.content}`).join('\n')}`);
    }

    // Add relevant documents
    if (documents.length > 0) {
      sections.push(`[RELEVANTE IDEEN]\n${documents.map(d => d.content).join('\n')}`);
    }

    // Add contextual hints
    if (hints.length > 0) {
      sections.push(`[KONTEXT-HINWEISE]\n${hints.map(h => `- ${h.content}`).join('\n')}`);
    }

    if (sections.length === 0) return '';

    return `\n\n=== PERSÖNLICHER KONTEXT ===\n${sections.join('\n\n')}\n\nBerücksichtige diesen Kontext bei deiner Antwort, aber erwähne ihn nicht explizit.`;
  }

  // ===========================================
  // Utility Methods
  // ===========================================

  /**
   * Get memory statistics for a session
   */
  getSessionStats(sessionId: string): {
    shortTerm: ReturnType<typeof shortTermMemory.getStats>;
  } {
    return {
      shortTerm: shortTermMemory.getStats(),
    };
  }

  /**
   * Get long-term memory stats for a context
   */
  async getLongTermStats(context: AIContext) {
    return await longTermMemory.getStats(context);
  }

  /**
   * Force consolidation for a context
   */
  async forceConsolidation(context: AIContext) {
    return await longTermMemory.consolidate(context);
  }

  /**
   * Add a fact to long-term memory
   */
  async addFact(
    context: AIContext,
    factType: 'preference' | 'behavior' | 'knowledge' | 'goal' | 'context',
    content: string,
    confidence: number = 0.8
  ): Promise<void> {
    await longTermMemory.addFact(context, {
      factType,
      content,
      confidence,
      source: 'explicit',
    });
  }

  /**
   * Get all facts for a context
   */
  async getFacts(context: AIContext) {
    return await longTermMemory.getFacts(context);
  }

  /**
   * Get all patterns for a context
   */
  async getPatterns(context: AIContext) {
    return await longTermMemory.getPatterns(context);
  }
}

// ===========================================
// Singleton Export
// ===========================================

export const memoryCoordinator = new MemoryCoordinator();

// ===========================================
// Convenience Exports
// ===========================================

export { shortTermMemory } from './short-term-memory';
export { longTermMemory } from './long-term-memory';
