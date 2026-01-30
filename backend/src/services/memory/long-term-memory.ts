/**
 * Long-Term Memory Consolidation Service (HiMeS Architecture)
 *
 * Manages long-term memory consolidation inspired by neocortical storage.
 * Features:
 * - Consolidates short-term memories into persistent knowledge
 * - Extracts recurring patterns and facts about the user
 * - Maintains user profile embedding for personalization
 * - Supports efficient retrieval of relevant long-term memories
 */

import { v4 as uuidv4 } from 'uuid';
import { AIContext, queryContext } from '../../utils/database-context';
import { logger } from '../../utils/logger';
import { generateClaudeResponse, queryClaudeJSON } from '../claude';
import { generateEmbedding } from '../ai';
import { cosineSimilarity } from '../../utils/semantic-cache';

// ===========================================
// Utility Functions
// ===========================================

/**
 * Safely parse JSON with fallback value
 * Prevents crashes from corrupted database data
 */
function safeJsonParse<T>(json: string | null | undefined, fallback: T): T {
  if (!json || typeof json !== 'string') {
    return fallback;
  }
  try {
    return JSON.parse(json) as T;
  } catch (error) {
    logger.warn('Failed to parse JSON, using fallback', {
      jsonPreview: json.substring(0, 100),
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return fallback;
  }
}

// ===========================================
// Types & Interfaces
// ===========================================

export interface PersonalizationFact {
  id: string;
  factType: 'preference' | 'behavior' | 'knowledge' | 'goal' | 'context';
  content: string;
  confidence: number;
  source: 'explicit' | 'inferred' | 'consolidated';
  firstSeen: Date;
  lastConfirmed: Date;
  occurrences: number;
  embedding?: number[];
}

export interface FrequentPattern {
  id: string;
  patternType: 'topic' | 'action' | 'time' | 'style';
  pattern: string;
  frequency: number;
  lastUsed: Date;
  associatedTopics: string[];
  confidence: number;
}

export interface SignificantInteraction {
  id: string;
  summary: string;
  topics: string[];
  outcome: string;
  timestamp: Date;
  significance: number;
}

export interface LongTermMemory {
  context: AIContext;
  facts: PersonalizationFact[];
  frequentPatterns: FrequentPattern[];
  significantInteractions: SignificantInteraction[];
  profileEmbedding: number[];
  lastConsolidation: Date;
  consolidationCount: number;
}

export interface LongTermRetrievalResult {
  facts: PersonalizationFact[];
  patterns: FrequentPattern[];
  relevantInteractions: SignificantInteraction[];
  contextualMemory: string;
}

export interface ConsolidationResult {
  patternsAdded: number;
  factsAdded: number;
  factsUpdated: number;
  interactionsStored: number;
}

/** Conversation message structure for memory processing */
export interface ConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: string;
}

/** Session with messages for consolidation */
export interface SessionWithMessages {
  id: string;
  messages: ConversationMessage[];
  metadata: Record<string, unknown>;
  summary?: string;
}

/** AI-extracted pattern from conversations */
interface ExtractedPattern {
  patternType?: 'topic' | 'action' | 'style';
  pattern: string;
  confidence?: number;
  associatedTopics?: string[];
}

/** AI-extracted fact about the user */
interface ExtractedFact {
  factType?: 'preference' | 'behavior' | 'knowledge' | 'goal' | 'context';
  content: string;
  confidence?: number;
}

// ===========================================
// Configuration
// ===========================================

const CONFIG = {
  /** Minimum confidence for a fact to be stored */
  MIN_FACT_CONFIDENCE: 0.6,
  /** Minimum occurrences for a pattern to be significant */
  MIN_PATTERN_OCCURRENCES: 3,
  /** Maximum facts per context */
  MAX_FACTS: 200,
  /** Maximum patterns per context */
  MAX_PATTERNS: 100,
  /** Maximum significant interactions to store */
  MAX_INTERACTIONS: 50,
  /** Relevance threshold for retrieval */
  RETRIEVAL_THRESHOLD: 0.5,
};

// ===========================================
// Long-Term Memory Service
// ===========================================

class LongTermMemoryService {
  private memories: Map<AIContext, LongTermMemory> = new Map();
  private initialized: Map<AIContext, boolean> = new Map();

  // ===========================================
  // Initialization & Loading
  // ===========================================

  /**
   * Initialize long-term memory for a context
   */
  async initialize(context: AIContext): Promise<void> {
    if (this.initialized.get(context)) {
      return;
    }

    try {
      // Load existing memory from database
      const memory = await this.loadFromDatabase(context);
      this.memories.set(context, memory);
      this.initialized.set(context, true);

      logger.info('Long-term memory initialized', {
        context,
        facts: memory.facts.length,
        patterns: memory.frequentPatterns.length,
      });
    } catch (error) {
      logger.error('Failed to initialize long-term memory', error instanceof Error ? error : undefined, { context });

      // Create empty memory
      this.memories.set(context, this.createEmptyMemory(context));
      this.initialized.set(context, true);
    }
  }

  /**
   * Create an empty long-term memory
   */
  private createEmptyMemory(context: AIContext): LongTermMemory {
    return {
      context,
      facts: [],
      frequentPatterns: [],
      significantInteractions: [],
      profileEmbedding: [],
      lastConsolidation: new Date(),
      consolidationCount: 0,
    };
  }

  /**
   * Load memory from database
   */
  private async loadFromDatabase(context: AIContext): Promise<LongTermMemory> {
    // Load personalization facts
    const factsResult = await queryContext(
      context,
      `SELECT id, fact_type, content, confidence, source, first_seen, last_confirmed, occurrences
       FROM personalization_facts
       WHERE context = $1 AND is_active = true
       ORDER BY confidence DESC, occurrences DESC
       LIMIT $2`,
      [context, CONFIG.MAX_FACTS]
    );

    const facts: PersonalizationFact[] = factsResult.rows.map((r: any) => ({
      id: r.id,
      factType: r.fact_type,
      content: r.content,
      confidence: parseFloat(r.confidence),
      source: r.source,
      firstSeen: new Date(r.first_seen),
      lastConfirmed: new Date(r.last_confirmed),
      occurrences: r.occurrences,
    }));

    // Load frequent patterns from routine_patterns table
    const patternsResult = await queryContext(
      context,
      `SELECT id, pattern_type, action_type as pattern, confidence, occurrences, last_triggered,
              trigger_config->>'keywords' as associated_topics
       FROM routine_patterns
       WHERE context = $1 AND is_active = true
       ORDER BY confidence DESC, occurrences DESC
       LIMIT $2`,
      [context, CONFIG.MAX_PATTERNS]
    );

    const patterns: FrequentPattern[] = patternsResult.rows.map((r: any) => ({
      id: r.id,
      patternType: r.pattern_type === 'time_based' ? 'time' : r.pattern_type === 'context_based' ? 'topic' : 'action',
      pattern: r.pattern,
      frequency: r.occurrences,
      lastUsed: r.last_triggered ? new Date(r.last_triggered) : new Date(),
      associatedTopics: safeJsonParse<string[]>(r.associated_topics, []),
      confidence: parseFloat(r.confidence),
    }));

    // Load significant interactions from conversation_sessions
    const interactionsResult = await queryContext(
      context,
      `SELECT id, compressed_summary as summary, metadata, last_activity
       FROM conversation_sessions
       WHERE context = $1 AND compressed_summary IS NOT NULL
       ORDER BY last_activity DESC
       LIMIT $2`,
      [context, CONFIG.MAX_INTERACTIONS]
    );

    const interactions: SignificantInteraction[] = interactionsResult.rows
      .filter((r: any) => r.summary)
      .map((r: any) => {
        const metadata = typeof r.metadata === 'string'
          ? safeJsonParse<Record<string, unknown>>(r.metadata, {})
          : r.metadata || {};
        return {
          id: r.id,
          summary: r.summary,
          topics: (metadata.tags as string[]) || [],
          outcome: (metadata.outcome as string) || '',
          timestamp: new Date(r.last_activity),
          significance: (metadata.significance as number) || 0.5,
        };
      });

    return {
      context,
      facts,
      frequentPatterns: patterns,
      significantInteractions: interactions,
      profileEmbedding: [],
      lastConsolidation: new Date(),
      consolidationCount: 0,
    };
  }

  // ===========================================
  // Consolidation (Daily Cron Job)
  // ===========================================

  /**
   * Consolidate short-term memories into long-term storage
   * Should be called daily via cron job
   */
  async consolidate(context: AIContext): Promise<ConsolidationResult> {
    await this.initialize(context);

    const result: ConsolidationResult = {
      patternsAdded: 0,
      factsAdded: 0,
      factsUpdated: 0,
      interactionsStored: 0,
    };

    try {
      logger.info('Starting long-term memory consolidation', { context });

      // 1. Analyze recent sessions (last 24h)
      const recentSessions = await this.getRecentSessions(context, 24);

      if (recentSessions.length === 0) {
        logger.info('No recent sessions to consolidate', { context });
        return result;
      }

      // 2. Extract patterns from sessions
      const patterns = await this.extractPatterns(recentSessions, context);
      result.patternsAdded = await this.mergePatterns(context, patterns);

      // 3. Extract facts about the user
      const facts = await this.extractFacts(recentSessions, context);
      const factResults = await this.mergeFacts(context, facts);
      result.factsAdded = factResults.added;
      result.factsUpdated = factResults.updated;

      // 4. Store significant interactions
      result.interactionsStored = await this.storeSignificantInteractions(
        context,
        recentSessions
      );

      // 5. Update profile embedding
      await this.updateProfileEmbedding(context);

      // 6. Update consolidation metadata
      const memory = this.memories.get(context);
      if (memory) {
        memory.lastConsolidation = new Date();
        memory.consolidationCount++;
      }

      logger.info('Long-term memory consolidation complete', {
        context,
        ...result,
      });

      return result;
    } catch (error) {
      logger.error('Consolidation failed', error instanceof Error ? error : undefined, { context });
      return result;
    }
  }

  /**
   * Get recent conversation sessions
   */
  private async getRecentSessions(
    context: AIContext,
    hours: number
  ): Promise<SessionWithMessages[]> {
    const result = await queryContext(
      context,
      `SELECT id, messages, metadata, compressed_summary
       FROM conversation_sessions
       WHERE context = $1
         AND last_activity >= NOW() - ($2 || ' hours')::INTERVAL
       ORDER BY last_activity DESC`,
      [context, hours]
    );

    return result.rows.map((r: Record<string, unknown>) => ({
      id: r.id as string,
      messages: typeof r.messages === 'string'
        ? safeJsonParse<ConversationMessage[]>(r.messages, [])
        : (r.messages as ConversationMessage[]) || [],
      metadata: typeof r.metadata === 'string'
        ? safeJsonParse<Record<string, unknown>>(r.metadata, {})
        : (r.metadata as Record<string, unknown>) || {},
      summary: r.compressed_summary as string | undefined,
    }));
  }

  /**
   * Extract recurring patterns from sessions
   */
  private async extractPatterns(
    sessions: SessionWithMessages[],
    context: AIContext
  ): Promise<FrequentPattern[]> {
    // Combine all messages for analysis
    const allMessages = sessions.flatMap(s => s.messages);

    if (allMessages.length < 5) {
      return [];
    }

    // Extract user messages
    const userMessages = allMessages
      .filter((m: ConversationMessage) => m.role === 'user')
      .map((m: ConversationMessage) => m.content)
      .join('\n');

    try {
      const patternsPrompt = `Analysiere diese Nutzer-Nachrichten und identifiziere wiederkehrende Muster:

${userMessages.substring(0, 3000)}

Identifiziere:
1. Häufige Themen oder Interessen
2. Wiederkehrende Fragemuster
3. Bevorzugte Formulierungen oder Stile

Antworte als JSON:
{
  "patterns": [
    {
      "patternType": "topic|action|style",
      "pattern": "Beschreibung des Musters",
      "confidence": 0.7,
      "associatedTopics": ["topic1", "topic2"]
    }
  ]
}`;

      const result = await queryClaudeJSON<{ patterns: ExtractedPattern[] }>(
        'Du analysierst Konversationsmuster. Antworte nur mit JSON.',
        patternsPrompt
      );

      return (result.patterns || []).map((p: ExtractedPattern) => ({
        id: uuidv4(),
        patternType: p.patternType || 'topic',
        pattern: p.pattern,
        frequency: 1,
        lastUsed: new Date(),
        associatedTopics: p.associatedTopics || [],
        confidence: p.confidence || 0.5,
      }));
    } catch (error) {
      logger.debug('Pattern extraction failed', { error });
      return [];
    }
  }

  /**
   * Extract facts about the user from sessions
   */
  private async extractFacts(
    sessions: SessionWithMessages[],
    context: AIContext
  ): Promise<PersonalizationFact[]> {
    const allMessages = sessions.flatMap(s => s.messages);
    const userMessages = allMessages
      .filter((m: ConversationMessage) => m.role === 'user')
      .map((m: ConversationMessage) => m.content)
      .join('\n');

    if (userMessages.length < 100) {
      return [];
    }

    try {
      const factsPrompt = `Extrahiere Fakten über den Nutzer aus diesen Nachrichten:

${userMessages.substring(0, 3000)}

Extrahiere:
1. Präferenzen (was mag der Nutzer?)
2. Wissen/Expertise (was weiß der Nutzer?)
3. Ziele (was will der Nutzer erreichen?)
4. Kontext (Beruf, Umfeld, Situation)

Antworte als JSON:
{
  "facts": [
    {
      "factType": "preference|behavior|knowledge|goal|context",
      "content": "Kurze, präzise Beschreibung",
      "confidence": 0.8
    }
  ]
}`;

      const result = await queryClaudeJSON<{ facts: ExtractedFact[] }>(
        'Du extrahierst Fakten über Nutzer aus Konversationen. Antworte nur mit JSON.',
        factsPrompt
      );

      return (result.facts || [])
        .filter((f: ExtractedFact) => (f.confidence ?? 0) >= CONFIG.MIN_FACT_CONFIDENCE)
        .map((f: ExtractedFact) => ({
          id: uuidv4(),
          factType: f.factType || 'knowledge',
          content: f.content,
          confidence: f.confidence || 0.5,
          source: 'inferred' as const,
          firstSeen: new Date(),
          lastConfirmed: new Date(),
          occurrences: 1,
        }));
    } catch (error) {
      logger.debug('Fact extraction failed', { error });
      return [];
    }
  }

  /**
   * Merge new patterns with existing ones
   */
  private async mergePatterns(
    context: AIContext,
    newPatterns: FrequentPattern[]
  ): Promise<number> {
    const memory = this.memories.get(context);
    if (!memory) {return 0;}

    let added = 0;

    for (const newPattern of newPatterns) {
      // Check for similar existing pattern
      const existing = memory.frequentPatterns.find(
        p => p.pattern.toLowerCase() === newPattern.pattern.toLowerCase()
      );

      if (existing) {
        // Update existing pattern
        existing.frequency++;
        existing.lastUsed = new Date();
        existing.confidence = Math.min(existing.confidence + 0.05, 1.0);
      } else {
        // Add new pattern
        memory.frequentPatterns.push(newPattern);
        added++;
      }
    }

    // Prune if over limit
    if (memory.frequentPatterns.length > CONFIG.MAX_PATTERNS) {
      memory.frequentPatterns = memory.frequentPatterns
        .sort((a, b) => b.confidence * b.frequency - a.confidence * a.frequency)
        .slice(0, CONFIG.MAX_PATTERNS);
    }

    return added;
  }

  /**
   * Merge new facts with existing ones
   */
  private async mergeFacts(
    context: AIContext,
    newFacts: PersonalizationFact[]
  ): Promise<{ added: number; updated: number }> {
    const memory = this.memories.get(context);
    if (!memory) {return { added: 0, updated: 0 };}

    let added = 0;
    let updated = 0;

    for (const newFact of newFacts) {
      // Check for similar existing fact
      const existing = memory.facts.find(
        f => f.content.toLowerCase() === newFact.content.toLowerCase()
      );

      if (existing) {
        // Update existing fact
        existing.occurrences++;
        existing.lastConfirmed = new Date();
        existing.confidence = Math.min(existing.confidence + 0.05, 1.0);
        updated++;
      } else {
        // Add new fact
        memory.facts.push(newFact);

        // Persist to database
        await this.persistFact(context, newFact);
        added++;
      }
    }

    // Prune if over limit
    if (memory.facts.length > CONFIG.MAX_FACTS) {
      memory.facts = memory.facts
        .sort((a, b) => b.confidence * b.occurrences - a.confidence * a.occurrences)
        .slice(0, CONFIG.MAX_FACTS);
    }

    return { added, updated };
  }

  /**
   * Persist a fact to the database
   */
  private async persistFact(context: AIContext, fact: PersonalizationFact): Promise<void> {
    try {
      await queryContext(
        context,
        `INSERT INTO personalization_facts
         (id, context, fact_type, content, confidence, source, first_seen, last_confirmed, occurrences, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true)
         ON CONFLICT (id) DO UPDATE SET
           confidence = $5,
           last_confirmed = $8,
           occurrences = $9`,
        [
          fact.id,
          context,
          fact.factType,
          fact.content,
          fact.confidence,
          fact.source,
          fact.firstSeen,
          fact.lastConfirmed,
          fact.occurrences,
        ]
      );
    } catch (error) {
      logger.debug('Failed to persist fact', { error });
    }
  }

  /**
   * Store significant interactions
   */
  private async storeSignificantInteractions(
    context: AIContext,
    sessions: SessionWithMessages[]
  ): Promise<number> {
    const memory = this.memories.get(context);
    if (!memory) {return 0;}

    let stored = 0;

    for (const session of sessions) {
      if (session.summary && session.messages.length >= 4) {
        const metadata = session.metadata as { tags?: string[]; outcome?: string };
        const interaction: SignificantInteraction = {
          id: session.id,
          summary: session.summary,
          topics: metadata.tags || [],
          outcome: metadata.outcome || '',
          timestamp: new Date(),
          significance: session.messages.length >= 10 ? 0.8 : 0.5,
        };

        // Avoid duplicates
        if (!memory.significantInteractions.find(i => i.id === interaction.id)) {
          memory.significantInteractions.push(interaction);
          stored++;
        }
      }
    }

    // Prune if over limit
    if (memory.significantInteractions.length > CONFIG.MAX_INTERACTIONS) {
      memory.significantInteractions = memory.significantInteractions
        .sort((a, b) => b.significance - a.significance)
        .slice(0, CONFIG.MAX_INTERACTIONS);
    }

    return stored;
  }

  /**
   * Update the profile embedding based on all facts
   */
  private async updateProfileEmbedding(context: AIContext): Promise<void> {
    const memory = this.memories.get(context);
    if (!memory || memory.facts.length === 0) {return;}

    try {
      // Combine facts into a profile text
      const profileText = memory.facts
        .filter(f => f.confidence >= 0.7)
        .map(f => f.content)
        .join('. ');

      if (profileText.length < 50) {return;}

      const embedding = await generateEmbedding(profileText);
      memory.profileEmbedding = embedding;

      logger.debug('Profile embedding updated', {
        context,
        factsUsed: memory.facts.filter(f => f.confidence >= 0.7).length,
        embeddingDimensions: embedding.length,
      });
    } catch (error) {
      logger.debug('Failed to update profile embedding', { error });
    }
  }

  // ===========================================
  // Retrieval
  // ===========================================

  /**
   * Retrieve relevant long-term memories for a query
   */
  async retrieve(context: AIContext, query: string): Promise<LongTermRetrievalResult> {
    await this.initialize(context);

    const memory = this.memories.get(context);
    if (!memory) {
      return {
        facts: [],
        patterns: [],
        relevantInteractions: [],
        contextualMemory: '',
      };
    }

    try {
      const queryEmbedding = await generateEmbedding(query);
      const queryLower = query.toLowerCase();

      // Find relevant facts
      const relevantFacts = memory.facts.filter(fact => {
        // Check text match
        const textMatch = fact.content.toLowerCase().includes(queryLower) ||
          queryLower.includes(fact.content.toLowerCase());
        return textMatch || fact.confidence >= 0.8;
      });

      // Find relevant patterns
      const relevantPatterns = memory.frequentPatterns.filter(pattern => {
        const topicMatch = pattern.associatedTopics.some(t =>
          queryLower.includes(t.toLowerCase())
        );
        return topicMatch || pattern.pattern.toLowerCase().includes(queryLower);
      });

      // Find relevant interactions
      const relevantInteractions = memory.significantInteractions.filter(interaction => {
        return interaction.summary.toLowerCase().includes(queryLower) ||
          interaction.topics.some(t => queryLower.includes(t.toLowerCase()));
      });

      // Build contextual memory string
      const contextualMemory = this.buildContextualMemory(
        relevantFacts,
        relevantPatterns,
        relevantInteractions
      );

      return {
        facts: relevantFacts.slice(0, 10),
        patterns: relevantPatterns.slice(0, 5),
        relevantInteractions: relevantInteractions.slice(0, 5),
        contextualMemory,
      };
    } catch (error) {
      logger.debug('Long-term retrieval failed', { error });
      return {
        facts: memory.facts.slice(0, 5),
        patterns: memory.frequentPatterns.slice(0, 3),
        relevantInteractions: [],
        contextualMemory: '',
      };
    }
  }

  /**
   * Build a contextual memory string for Claude
   */
  private buildContextualMemory(
    facts: PersonalizationFact[],
    patterns: FrequentPattern[],
    interactions: SignificantInteraction[]
  ): string {
    const parts: string[] = [];

    if (facts.length > 0) {
      parts.push(`[Bekannte Fakten]\n${facts.map(f => `- ${f.content}`).join('\n')}`);
    }

    if (patterns.length > 0) {
      parts.push(`[Erkannte Muster]\n${patterns.map(p => `- ${p.pattern}`).join('\n')}`);
    }

    if (interactions.length > 0) {
      parts.push(`[Relevante frühere Gespräche]\n${interactions.map(i => `- ${i.summary}`).join('\n')}`);
    }

    return parts.join('\n\n');
  }

  // ===========================================
  // Public API
  // ===========================================

  /**
   * Get all facts for a context
   */
  async getFacts(context: AIContext): Promise<PersonalizationFact[]> {
    await this.initialize(context);
    return this.memories.get(context)?.facts || [];
  }

  /**
   * Get all patterns for a context
   */
  async getPatterns(context: AIContext): Promise<FrequentPattern[]> {
    await this.initialize(context);
    return this.memories.get(context)?.frequentPatterns || [];
  }

  /**
   * Add a fact explicitly
   */
  async addFact(context: AIContext, fact: Omit<PersonalizationFact, 'id' | 'firstSeen' | 'lastConfirmed' | 'occurrences'>): Promise<void> {
    await this.initialize(context);
    const memory = this.memories.get(context);
    if (!memory) {return;}

    const fullFact: PersonalizationFact = {
      id: uuidv4(),
      ...fact,
      source: 'explicit',
      firstSeen: new Date(),
      lastConfirmed: new Date(),
      occurrences: 1,
    };

    memory.facts.push(fullFact);
    await this.persistFact(context, fullFact);

    logger.info('Explicit fact added', { context, factType: fact.factType });
  }

  /**
   * Get statistics
   */
  async getStats(context: AIContext): Promise<{
    factCount: number;
    patternCount: number;
    interactionCount: number;
    lastConsolidation: Date | null;
    hasProfileEmbedding: boolean;
  }> {
    await this.initialize(context);
    const memory = this.memories.get(context);

    return {
      factCount: memory?.facts.length || 0,
      patternCount: memory?.frequentPatterns.length || 0,
      interactionCount: memory?.significantInteractions.length || 0,
      lastConsolidation: memory?.lastConsolidation || null,
      hasProfileEmbedding: (memory?.profileEmbedding?.length || 0) > 0,
    };
  }
}

// ===========================================
// Singleton Export
// ===========================================

export const longTermMemory = new LongTermMemoryService();
