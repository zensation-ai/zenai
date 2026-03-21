/**
 * Memory Coordinator (HiMeS Architecture - Enhanced 4-Layer)
 *
 * The central coordinator that bridges all four memory layers,
 * inspired by hippocampus-neocortex interaction in biological memory systems.
 *
 * Memory Layers:
 * 1. Working Memory - Active task focus (Prefrontal Cortex)
 * 2. Episodic Memory - Concrete experiences (Hippocampus)
 * 3. Short-Term Memory - Session context (Hippocampus)
 * 4. Long-Term Memory - Persistent knowledge (Neocortex)
 *
 * Features:
 * - Prepares optimal context for Claude calls
 * - Combines all four memory layers intelligently
 * - Implements context editing (pruning irrelevant information)
 * - Token budget management
 * - Manages memory lifecycle
 */

import { createHash } from 'crypto';
import { AIContext } from '../../utils/database-context';
import { logger } from '../../utils/logger';
import { generateEmbedding } from '../ai';
import { cosineSimilarity, semanticCache } from '../../utils/semantic-cache';
import {
  shortTermMemory,
  EnrichedContext,
  PreRetrievedDocument,
} from './short-term-memory';
import {
  longTermMemory,
  LongTermRetrievalResult,
} from './long-term-memory';
import {
  episodicMemory,
  Episode,
} from './episodic-memory';
import {
  workingMemory,
  WorkingMemorySlot,
  WorkingMemoryState,
} from './working-memory';
import {
  expandViaGraph,
  toContextParts as graphToContextParts,
} from './graph-memory-bridge';
import {
  processWithConcurrency,
  extractFromQuery,
  inferEmotionalContext,
} from './memory-query-router';
import {
  calculateDecay,
  getImportanceScore,
  getTypeBoost,
  applyDiversity,
  fitToTokenBudget,
} from './memory-stats';

// Re-export extracted modules for direct access
export { processWithConcurrency, extractFromQuery, inferEmotionalContext } from './memory-query-router';
export type { ExtractedQueryItem } from './memory-query-router';
export { calculateDecay, getImportanceScore, getTypeBoost, applyDiversity, fitToTokenBudget } from './memory-stats';

// ===========================================
// Types & Interfaces
// ===========================================

export interface ContextPart {
  type: 'summary' | 'fact' | 'pattern' | 'document' | 'interaction' | 'hint' | 'episode' | 'working';
  content: string;
  relevance: number;
  source: 'short_term' | 'long_term' | 'pre_retrieved' | 'episodic' | 'working' | 'knowledge_graph';
  timestamp?: number;
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
    episodesRetrieved: number;
    workingMemorySlots: number;
  };
}

/** Enhanced prepared context with all 4 memory layers */
export interface EnhancedPreparedContext extends PreparedContext {
  /** Working Memory state */
  workingMemory: {
    goal: string;
    subGoals: string[];
    activeSlots: WorkingMemorySlot[];
  };
  /** Episodic Memory state */
  episodicMemory: {
    relevantEpisodes: Episode[];
    emotionalTone: {
      avgValence: number;
      avgArousal: number;
      dominantMood: string;
    };
  };
  /** Estimated token count */
  estimatedTokens: number;
}

export interface MemorySessionOptions {
  /** Include long-term memory */
  includeLongTerm?: boolean;
  /** Include pre-retrieved documents */
  includePreRetrieved?: boolean;
  /** Include episodic memory */
  includeEpisodic?: boolean;
  /** Include working memory */
  includeWorking?: boolean;
  /** Maximum context parts to include */
  maxContextParts?: number;
  /** Minimum relevance score for context parts */
  minRelevance?: number;
  /** Maximum context tokens (for budget management) */
  maxContextTokens?: number;
  /** Emotional priming (filter episodes by emotional context) */
  emotionalPriming?: boolean;
  /** Include graph expansion for idea neighbors (default: true) */
  includeGraphExpansion?: boolean;
  /** Enable serendipity hints from 2-hop graph neighbors */
  enableSerendipity?: boolean;
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
  /** Default max context tokens */
  DEFAULT_MAX_CONTEXT_TOKENS: 8000,
  /** Approximate chars per token (for estimation) */
  CHARS_PER_TOKEN: 4,
  /** Max concurrent embedding API calls */
  MAX_EMBEDDING_CONCURRENCY: 5,
  /** Priority weights for different memory types */
  PRIORITY_WEIGHTS: {
    working: 1.0,      // Highest priority (current task)
    episodic: 0.7,     // Recent experiences
    short_term: 0.8,   // Session context
    long_term: 0.6,    // Persistent knowledge
    pre_retrieved: 0.5, // Related documents
  },
};

// processWithConcurrency moved to memory-query-router.ts

// ===========================================
// Memory Coordinator
// ===========================================

export class MemoryCoordinator {
  // ===========================================
  // Session Management
  // ===========================================

  /**
   * Start a new memory session
   */
  async startSession(context: AIContext, _metadata?: Record<string, unknown>): Promise<string> {
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
    metadata?: Record<string, unknown>
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

    // Check semantic cache first (use hash of full query to avoid collisions)
    const queryHash = createHash('sha256').update(userQuery).digest('hex').substring(0, 16);
    const cacheKey = `context:${sessionId}:${queryHash}`;
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
          episodesRetrieved: 0,
          workingMemorySlots: 0,
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
          episodesRetrieved: 0,
          workingMemorySlots: 0,
        },
      };
    }
  }

  // ===========================================
  // Enhanced Context Preparation (4-Layer)
  // ===========================================

  /**
   * Prepare enhanced context with all 4 memory layers.
   * This is the recommended method for complex interactions.
   */
  async prepareEnhancedContext(
    sessionId: string,
    userQuery: string,
    context: AIContext,
    options: MemorySessionOptions = {}
  ): Promise<EnhancedPreparedContext> {
    const {
      includeLongTerm = true,
      includePreRetrieved = true,
      includeEpisodic = true,
      includeWorking = true,
      maxContextParts: _maxContextParts = CONFIG.DEFAULT_MAX_CONTEXT_PARTS,
      minRelevance = CONFIG.DEFAULT_MIN_RELEVANCE,
      maxContextTokens = CONFIG.DEFAULT_MAX_CONTEXT_TOKENS,
      emotionalPriming = false,
      includeGraphExpansion = true,
      enableSerendipity = false,
    } = options;

    try {
      // 1. Initialize/get working memory
      let workingState: WorkingMemoryState | null = null;
      if (includeWorking) {
        workingState = workingMemory.getState(sessionId);
        if (!workingState) {
          // Initialize with user query as initial goal
          workingState = workingMemory.initialize(sessionId, userQuery, context);
        }

        // Extract constraints/facts from query and add to working memory
        const extracted = await this.extractFromQueryInternal(userQuery);
        for (const item of extracted) {
          await workingMemory.add(sessionId, item.type, item.content, item.priority);
        }
      }

      // 2. Parallel retrieval from all memory sources
      const [episodes, shortTerm, longTerm] = await Promise.all([
        includeEpisodic
          ? episodicMemory.retrieve(userQuery, context, {
              limit: 5,
              emotionalFilter: emotionalPriming
                ? await this.inferEmotionalContextInternal(userQuery)
                : undefined,
            })
          : Promise.resolve([]),

        shortTermMemory.getEnrichedContext(sessionId),

        includeLongTerm
          ? longTermMemory.retrieve(context, userQuery)
          : Promise.resolve(null),
      ]);

      // 2b. Graph expansion: enrich with knowledge graph neighbors
      let graphParts: ContextPart[] = [];
      if (includeGraphExpansion) {
        try {
          // Extract idea IDs from pre-retrieved documents
          const seedIdeaIds = shortTerm.preloadedIdeas.map((doc) => doc.ideaId).filter(Boolean);
          if (seedIdeaIds.length > 0) {
            const expansion = await expandViaGraph(seedIdeaIds, context, {
              enableSerendipity,
              minStrength: 0.5,
              maxNeighborsPerSeed: 3,
            });
            const rawParts = graphToContextParts(expansion);
            graphParts = rawParts.map((p) => ({
              type: p.type,
              content: p.content,
              relevance: p.relevance,
              source: p.source,
              timestamp: Date.now(),
            }));
          }
        } catch (error) {
          logger.debug('Graph expansion skipped (non-critical)', { error });
        }
      }

      // 3. Combine all sources into context parts
      const allParts = [
        ...this.combineAllContextParts({
          workingState,
          episodes,
          shortTerm,
          longTerm,
          includePreRetrieved,
        }),
        ...graphParts,
      ];

      // 4. Prune and prioritize
      const prunedParts = await this.pruneContext(allParts, userQuery, minRelevance);

      // 5. Fit to token budget
      const { parts: finalParts, estimatedTokens } = this.fitToTokenBudgetInternal(
        prunedParts,
        maxContextTokens
      );

      // 6. Build enhanced system prompt
      const systemEnhancement = this.buildEnhancedSystemPrompt({
        workingState,
        episodes,
        shortTerm,
        longTerm,
        finalParts,
      });

      // 7. Calculate emotional tone from episodes
      const emotionalTone = episodicMemory.calculateEmotionalTone(episodes);

      // 8. Build result
      const result: EnhancedPreparedContext = {
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
          episodesRetrieved: episodes.length,
          workingMemorySlots: workingState?.slots.length || 0,
        },
        workingMemory: {
          goal: workingState?.currentGoal || userQuery,
          subGoals: workingState?.subGoals || [],
          activeSlots: workingState?.slots || [],
        },
        episodicMemory: {
          relevantEpisodes: episodes,
          emotionalTone,
        },
        estimatedTokens,
      };

      logger.debug('Enhanced context prepared', {
        sessionId,
        partsCount: finalParts.length,
        graphPartsCount: graphParts.length,
        episodesCount: episodes.length,
        workingSlots: workingState?.slots.length || 0,
        estimatedTokens,
      });

      return result;
    } catch (error) {
      logger.error('Failed to prepare enhanced context', error instanceof Error ? error : undefined, {
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
          episodesRetrieved: 0,
          workingMemorySlots: 0,
        },
        workingMemory: {
          goal: userQuery,
          subGoals: [],
          activeSlots: [],
        },
        episodicMemory: {
          relevantEpisodes: [],
          emotionalTone: { avgValence: 0, avgArousal: 0.5, dominantMood: 'neutral' },
        },
        estimatedTokens: 0,
      };
    }
  }

  /**
   * Extract implicit constraints/facts from user query (delegates to memory-query-router).
   */
  private async extractFromQueryInternal(query: string) {
    return extractFromQuery(query);
  }

  /**
   * Infer emotional context from query (delegates to memory-query-router).
   */
  private async inferEmotionalContextInternal(query: string) {
    return inferEmotionalContext(query);
  }

  /**
   * Combine all context sources into parts with priorities
   */
  private combineAllContextParts(sources: {
    workingState: WorkingMemoryState | null;
    episodes: Episode[];
    shortTerm: EnrichedContext;
    longTerm: LongTermRetrievalResult | null;
    includePreRetrieved: boolean;
  }): ContextPart[] {
    const parts: ContextPart[] = [];
    const now = Date.now();

    // 1. Working Memory (highest priority)
    if (sources.workingState) {
      // Add goal
      parts.push({
        type: 'working',
        content: `[ZIEL] ${sources.workingState.currentGoal}`,
        relevance: 1.0 * CONFIG.PRIORITY_WEIGHTS.working,
        source: 'working',
        timestamp: now,
      });

      // Add sub-goals
      if (sources.workingState.subGoals.length > 0) {
        parts.push({
          type: 'working',
          content: `[TEILZIELE] ${sources.workingState.subGoals.join('; ')}`,
          relevance: 0.9 * CONFIG.PRIORITY_WEIGHTS.working,
          source: 'working',
          timestamp: now,
        });
      }

      // Add active slots
      for (const slot of sources.workingState.slots) {
        if (slot.type !== 'goal') {
          parts.push({
            type: 'working',
            content: `[${slot.type.toUpperCase()}] ${slot.content}`,
            relevance: slot.activation * slot.priority * CONFIG.PRIORITY_WEIGHTS.working,
            source: 'working',
            timestamp: slot.lastAccessed.getTime(),
          });
        }
      }
    }

    // 2. Episodic Memory
    for (const episode of sources.episodes) {
      parts.push({
        type: 'episode',
        content: `[Früher: ${episode.temporalContext.timeOfDay}] "${episode.trigger.substring(0, 80)}..." → "${episode.response.substring(0, 100)}..."`,
        relevance: episode.retrievalStrength * CONFIG.PRIORITY_WEIGHTS.episodic,
        source: 'episodic',
        timestamp: episode.timestamp.getTime(),
      });
    }

    // 3. Short-Term Memory
    if (sources.shortTerm.conversationSummary) {
      parts.push({
        type: 'summary',
        content: sources.shortTerm.conversationSummary,
        relevance: 0.9 * CONFIG.PRIORITY_WEIGHTS.short_term,
        source: 'short_term',
        timestamp: now,
      });
    }

    for (const hint of sources.shortTerm.contextualHints) {
      parts.push({
        type: 'hint',
        content: hint,
        relevance: 0.7 * CONFIG.PRIORITY_WEIGHTS.short_term,
        source: 'short_term',
        timestamp: now,
      });
    }

    // 4. Pre-retrieved documents
    if (sources.includePreRetrieved) {
      for (const doc of sources.shortTerm.preloadedIdeas) {
        parts.push({
          type: 'document',
          content: `[${doc.title}]: ${doc.summary}`,
          relevance: doc.relevanceScore * CONFIG.PRIORITY_WEIGHTS.pre_retrieved,
          source: 'pre_retrieved',
          timestamp: doc.preloadedAt.getTime(),
        });
      }
    }

    // 5. Long-Term Memory
    if (sources.longTerm) {
      for (const fact of sources.longTerm.facts) {
        parts.push({
          type: 'fact',
          content: fact.content,
          relevance: fact.confidence * CONFIG.PRIORITY_WEIGHTS.long_term,
          source: 'long_term',
          timestamp: fact.lastConfirmed.getTime(),
        });
      }

      for (const pattern of sources.longTerm.patterns) {
        parts.push({
          type: 'pattern',
          content: pattern.pattern,
          relevance: pattern.confidence * CONFIG.PRIORITY_WEIGHTS.long_term,
          source: 'long_term',
          timestamp: pattern.lastUsed.getTime(),
        });
      }

      for (const interaction of sources.longTerm.relevantInteractions) {
        parts.push({
          type: 'interaction',
          content: interaction.summary,
          relevance: interaction.significance * CONFIG.PRIORITY_WEIGHTS.long_term,
          source: 'long_term',
          timestamp: interaction.timestamp.getTime(),
        });
      }
    }

    return parts;
  }

  /**
   * Fit context parts to token budget (delegates to memory-stats).
   */
  private fitToTokenBudgetInternal(
    parts: ContextPart[],
    maxTokens: number
  ): { parts: ContextPart[]; estimatedTokens: number } {
    return fitToTokenBudget(parts, maxTokens);
  }

  /**
   * Build enhanced system prompt from all memory sources
   */
  private buildEnhancedSystemPrompt(sources: {
    workingState: WorkingMemoryState | null;
    episodes: Episode[];
    shortTerm: EnrichedContext;
    longTerm: LongTermRetrievalResult | null;
    finalParts: ContextPart[];
  }): string {
    const sections: string[] = [];

    // 1. Working Memory (current task focus)
    if (sources.workingState) {
      const wmContext = workingMemory.generateContextString(sources.workingState.sessionId);
      if (wmContext) {
        sections.push(wmContext);
      }
    }

    // 2. Episodic Memory (similar past experiences)
    if (sources.episodes.length > 0) {
      const episodeText = sources.episodes
        .slice(0, 3)
        .map(e => `- [${e.temporalContext.timeOfDay}] "${e.trigger.substring(0, 60)}..." → Antwort war hilfreich`)
        .join('\n');
      sections.push(`[ÄHNLICHE FRÜHERE GESPRÄCHE]\n${episodeText}`);
    }

    // 3. Group remaining parts by type
    const facts = sources.finalParts.filter(p => p.type === 'fact');
    const patterns = sources.finalParts.filter(p => p.type === 'pattern');
    const documents = sources.finalParts.filter(p => p.type === 'document');
    const summaries = sources.finalParts.filter(p => p.type === 'summary');

    if (summaries.length > 0) {
      sections.push(`[KONVERSATIONS-HISTORIE]\n${summaries.map(s => s.content).join('\n')}`);
    }

    if (facts.length > 0) {
      sections.push(`[BEKANNTES ÜBER DEN NUTZER]\n${facts.map(f => `- ${f.content}`).join('\n')}`);
    }

    if (patterns.length > 0) {
      sections.push(`[ERKANNTE MUSTER]\n${patterns.map(p => `- ${p.content}`).join('\n')}`);
    }

    if (documents.length > 0) {
      sections.push(`[RELEVANTE IDEEN]\n${documents.map(d => d.content).join('\n')}`);
    }

    if (sections.length === 0) {return '';}

    return `\n\n=== PERSÖNLICHER KONTEXT (4-Layer Memory) ===\n${sections.join('\n\n')}\n\nBerücksichtige diesen Kontext bei deiner Antwort.`;
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
    _query: string
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
   * Calculate time-based relevance decay (delegates to memory-stats).
   */
  private calculateDecayInternal(timestamp: number | undefined, decayRate: number = 0.05): number {
    return calculateDecay(timestamp, decayRate);
  }

  /**
   * Calculate importance score (delegates to memory-stats).
   */
  private getImportanceScoreInternal(part: ContextPart): number {
    return getImportanceScore(part);
  }

  /**
   * Apply type-based relevance boost (delegates to memory-stats).
   */
  private getTypeBoostInternal(type: ContextPart['type']): number {
    return getTypeBoost(type);
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
    if (parts.length === 0) {return [];}

    try {
      // Generate query embedding
      const queryEmbedding = await generateEmbedding(query);

      if (queryEmbedding.length === 0) {
        // Fall back to basic filtering with decay
        return parts
          .map(p => ({
            ...p,
            relevance: p.relevance * this.getTypeBoostInternal(p.type),
          }))
          .filter(p => p.relevance >= minRelevance)
          .sort((a, b) => b.relevance - a.relevance);
      }

      // Score each part based on semantic similarity, decay, and type
      // Use limited concurrency to avoid API rate limits
      const scoredParts = await processWithConcurrency(
        parts,
        async (part) => {
          try {
            const partEmbedding = await generateEmbedding(part.content);
            const similarity = cosineSimilarity(queryEmbedding, partEmbedding);

            // Get type-based boost
            const typeBoost = this.getTypeBoostInternal(part.type);

            // Calculate time decay (if timestamp available in metadata)
            const timestamp = (part as ContextPart & { timestamp?: number }).timestamp || Date.now();
            const decay = this.calculateDecayInternal(timestamp);

            // Three-Factor Retrieval Scoring (Stanford Generative Agents pattern)
            // Multiplicative: recency * importance * relevance
            // A single low factor properly suppresses the score
            const recency = decay; // Already exponential time-based decay
            const importance = this.getImportanceScoreInternal(part);
            const relevance = (similarity * 0.6 + part.relevance * 0.4); // Semantic-weighted relevance

            // Multiplicative three-factor score with type boost
            const threeFactorScore = recency * importance * relevance * typeBoost;

            return {
              ...part,
              relevance: threeFactorScore,
              metadata: {
                originalRelevance: part.relevance,
                semanticSimilarity: similarity,
                typeBoost,
                decay,
                importance,
                recency,
              }
            };
          } catch {
            return {
              ...part,
              relevance: part.relevance * this.getTypeBoostInternal(part.type),
            };
          }
        },
        CONFIG.MAX_EMBEDDING_CONCURRENCY
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
      const diversified = this.applyDiversityInternal(filtered, 5);

      return diversified;
    } catch (error) {
      logger.debug('Context pruning failed, using basic filter', { error });
      return parts.filter(p => p.relevance >= minRelevance);
    }
  }

  /**
   * Apply diversity constraint (delegates to memory-stats).
   */
  private applyDiversityInternal(parts: ContextPart[], maxPerType: number): ContextPart[] {
    return applyDiversity(parts, maxPerType);
  }

  // ===========================================
  // System Enhancement Building
  // ===========================================

  /**
   * Build system prompt enhancement from context parts
   */
  private buildSystemEnhancement(
    parts: ContextPart[],
    _shortTerm: EnrichedContext
  ): string {
    if (parts.length === 0) {return '';}

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

    if (sections.length === 0) {return '';}

    return `\n\n=== PERSÖNLICHER KONTEXT ===\n${sections.join('\n\n')}\n\nBerücksichtige diesen Kontext bei deiner Antwort, aber erwähne ihn nicht explizit.`;
  }

  // ===========================================
  // Utility Methods
  // ===========================================

  /**
   * Get memory statistics for a session
   */
  getSessionStats(_sessionId: string): {
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
