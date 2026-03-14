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
import { queryClaudeJSON } from '../claude';
import { generateEmbedding } from '../ai';

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

/**
 * Graduated Decay Class
 * Controls how fast a fact's confidence decays over time.
 * Based on 2026 State-of-the-Art memory architecture research.
 *
 * - permanent: Core identity facts (name, language) - near-zero decay
 * - slow_decay: Stable preferences (editor, communication style) - very slow
 * - normal_decay: General knowledge - standard decay
 * - fast_decay: Ephemeral observations (mood, one-time mentions) - rapid decay
 */
export type DecayClass = 'permanent' | 'slow_decay' | 'normal_decay' | 'fast_decay';

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
  /** How often this fact has been retrieved and used (for composite scoring) */
  retrievalCount: number;
  /** When this fact was last retrieved (for recency scoring) */
  lastRetrieved: Date | null;
  /** Graduated decay class controlling decay speed */
  decayClass: DecayClass;
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
  /** Minimum confidence before a fact is pruned */
  MIN_FACT_PRUNE_CONFIDENCE: 0.3,

  // === Composite Importance Scoring (Phase 42) ===
  // Weights for the three-factor composite score: recency × usage × confidence
  // Based on 2026 State-of-the-Art research (Stanford Generative Agents + Mem0)
  COMPOSITE_WEIGHTS: {
    recency: 0.3,    // How recently the fact was confirmed/retrieved
    usage: 0.4,      // How often the fact is actually used in conversations
    confidence: 0.3,  // How reliable the fact source is
  },

  // === Graduated Decay Rates (Phase 42) ===
  // Decay class rates override per-type rates when a decay class is set
  DECAY_CLASS_RATES: {
    permanent: 1.0,       // No decay at all (core identity)
    slow_decay: 0.9998,   // ~0.6% loss per month (stable preferences)
    normal_decay: 0.998,  // ~6% loss per month (general knowledge)
    fast_decay: 0.990,    // ~26% loss per month (ephemeral observations)
  } as Record<DecayClass, number>,

  /** Fact decay rates by type (used when no decay class is set) */
  FACT_DECAY_RATES: {
    goal: 0.9995,       // Goals persist nearly forever (~2% loss per year)
    preference: 0.999,  // Preferences are stable (~3% loss per month)
    knowledge: 0.998,   // Knowledge is durable (~6% loss per month)
    behavior: 0.995,    // Behaviors can change (~15% loss per month)
    context: 0.990,     // Context info ages fastest (~26% loss per month)
  } as Record<PersonalizationFact['factType'], number>,
};

// ===========================================
// Decay Class Inference
// ===========================================

/**
 * Infer the appropriate decay class for a fact based on its type and source.
 *
 * Rules:
 * - Explicit goal facts → permanent (core identity)
 * - Explicit preferences from user → slow_decay
 * - Inferred behaviors → fast_decay (may change quickly)
 * - Context facts → fast_decay (ephemeral by nature)
 * - Everything else → normal_decay
 */
function inferDecayClass(factType: string, source: string): DecayClass {
  // Explicit goals and core identity facts should persist
  if (factType === 'goal' && source === 'explicit') {return 'permanent';}

  // Explicit preferences are stable
  if (factType === 'preference' && source === 'explicit') {return 'slow_decay';}

  // Knowledge from user is durable
  if (factType === 'knowledge' && source === 'explicit') {return 'slow_decay';}

  // Consolidated facts have been verified
  if (source === 'consolidated') {return 'normal_decay';}

  // Behaviors and context change fast
  if (factType === 'behavior') {return 'normal_decay';}
  if (factType === 'context') {return 'fast_decay';}

  // Default for inferred knowledge
  return 'normal_decay';
}

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
   * Detect whether the personalization_facts table uses HiMeS schema (Phase 27+)
   * by checking for the 'is_active' column. Cached per context.
   */
  private hiMeSSchemaCache: Map<AIContext, boolean> = new Map();

  private async hasHiMeSSchema(context: AIContext): Promise<boolean> {
    const cached = this.hiMeSSchemaCache.get(context);
    if (cached !== undefined) {
      return cached;
    }

    try {
      const result = await queryContext(
        context,
        `SELECT column_name FROM information_schema.columns
         WHERE table_name = 'personalization_facts' AND column_name = 'is_active'
         LIMIT 1`
      );
      const hasSchema = result.rows.length > 0;
      this.hiMeSSchemaCache.set(context, hasSchema);
      return hasSchema;
    } catch {
      this.hiMeSSchemaCache.set(context, false);
      return false;
    }
  }

  /**
   * Load memory from database
   * Supports both HiMeS schema (Phase 27+) and legacy schema
   */
  private async loadFromDatabase(context: AIContext): Promise<LongTermMemory> {
    // Load personalization facts with schema detection
    let facts: PersonalizationFact[] = [];

    const useHiMeS = await this.hasHiMeSSchema(context);

    if (useHiMeS) {
      try {
        const factsResult = await queryContext(
          context,
          `SELECT id, fact_type, content, confidence, source, first_seen, last_confirmed, occurrences,
                  COALESCE(retrieval_count, 0) as retrieval_count, last_retrieved
           FROM personalization_facts
           WHERE context = $1 AND is_active = true
           ORDER BY confidence DESC, occurrences DESC
           LIMIT $2`,
          [context, CONFIG.MAX_FACTS]
        );

        facts = factsResult.rows.map((r: Record<string, unknown>) => ({
          id: r.id as string,
          factType: r.fact_type as PersonalizationFact['factType'],
          content: r.content as string,
          confidence: parseFloat(r.confidence as string),
          source: r.source as PersonalizationFact['source'],
          firstSeen: new Date(r.first_seen as string),
          lastConfirmed: new Date(r.last_confirmed as string),
          occurrences: r.occurrences as number,
          retrievalCount: (r.retrieval_count as number) || 0,
          lastRetrieved: r.last_retrieved ? new Date(r.last_retrieved as string) : null,
          decayClass: inferDecayClass(r.fact_type as string, r.source as string),
        }));
      } catch (hiMeSError) {
        logger.warn('HiMeS schema query failed, falling back to legacy', {
          context,
          error: hiMeSError instanceof Error ? hiMeSError.message : 'Unknown',
        });
        // Reset cache so next init retries
        this.hiMeSSchemaCache.delete(context);
      }
    }

    // Fall back to legacy schema if HiMeS not available or failed
    if (!useHiMeS || (useHiMeS && facts.length === 0)) {
      try {
        const legacyResult = await queryContext(
          context,
          `SELECT id, category, fact_key, fact_value, confidence, source, created_at, updated_at
           FROM personalization_facts
           LIMIT $1`,
          [CONFIG.MAX_FACTS]
        );

        if (legacyResult.rows.length > 0) {
          facts = legacyResult.rows.map((r: Record<string, unknown>) => {
            const factType = ((r.category as string) || 'knowledge') as PersonalizationFact['factType'];
            const source = ((r.source as string) || 'inferred') as PersonalizationFact['source'];
            return {
              id: r.id as string,
              factType,
              content: (r.fact_value as string) || (r.fact_key as string) || '',
              confidence: parseFloat(r.confidence as string) || 0.7,
              source,
              firstSeen: new Date((r.created_at as string) || Date.now()),
              lastConfirmed: new Date((r.updated_at as string) || Date.now()),
              occurrences: 1,
              retrievalCount: 0,
              lastRetrieved: null,
              decayClass: inferDecayClass(factType, source),
            };
          });

          logger.info('Loaded facts from legacy schema', {
            context,
            factCount: facts.length,
          });
        }
      } catch (legacyError) {
        // Table doesn't exist or other error - start with empty facts
        logger.debug('No personalization_facts table available', {
          context,
          error: legacyError instanceof Error ? legacyError.message : 'Unknown',
        });
      }
    }

    // Load frequent patterns from routine_patterns table
    let patterns: FrequentPattern[] = [];
    try {
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

      patterns = patternsResult.rows.map((r: Record<string, unknown>) => ({
        id: r.id as string,
        patternType: r.pattern_type === 'time_based' ? 'time' as const : r.pattern_type === 'context_based' ? 'topic' as const : 'action' as const,
        pattern: r.pattern as string,
        frequency: r.occurrences as number,
        lastUsed: r.last_triggered ? new Date(r.last_triggered as string) : new Date(),
        associatedTopics: safeJsonParse<string[]>(r.associated_topics as string, []),
        confidence: parseFloat(r.confidence as string),
      }));
    } catch (patternError) {
      logger.debug('routine_patterns table not available', {
        context,
        error: patternError instanceof Error ? patternError.message : 'Unknown',
      });
    }

    // Load significant interactions from conversation_sessions
    let interactions: SignificantInteraction[] = [];
    try {
      const interactionsResult = await queryContext(
        context,
        `SELECT id, compressed_summary as summary, metadata, last_activity
         FROM conversation_sessions
         WHERE context = $1 AND compressed_summary IS NOT NULL
         ORDER BY last_activity DESC
         LIMIT $2`,
        [context, CONFIG.MAX_INTERACTIONS]
      );

      interactions = interactionsResult.rows
        .filter((r: Record<string, unknown>) => r.summary)
        .map((r: Record<string, unknown>) => {
          const metadata = typeof r.metadata === 'string'
            ? safeJsonParse<Record<string, unknown>>(r.metadata, {})
            : (r.metadata as Record<string, unknown>) || {};
          return {
            id: r.id as string,
            summary: r.summary as string,
            topics: (metadata.tags as string[]) || [],
            outcome: (metadata.outcome as string) || '',
            timestamp: new Date(r.last_activity as string),
            significance: (metadata.significance as number) || 0.5,
          };
        });
    } catch (interactionError) {
      logger.debug('conversation_sessions table not available', {
        context,
        error: interactionError instanceof Error ? interactionError.message : 'Unknown',
      });
    }

    logger.info('Long-term memory loaded from database', {
      context,
      facts: facts.length,
      patterns: patterns.length,
      interactions: interactions.length,
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
    _context: AIContext
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
    _context: AIContext
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
        .map((f: ExtractedFact) => {
          const factType = (f.factType || 'knowledge') as PersonalizationFact['factType'];
          return {
            id: uuidv4(),
            factType,
            content: f.content,
            confidence: f.confidence || 0.5,
            source: 'inferred' as const,
            firstSeen: new Date(),
            lastConfirmed: new Date(),
            occurrences: 1,
            retrievalCount: 0,
            lastRetrieved: null,
            decayClass: inferDecayClass(factType, 'inferred'),
          };
        });
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
      // Phase 59: Entity Resolution for new facts (fire-and-forget)
      try {
        const { EntityResolver } = await import('./entity-resolver');
        const resolver = new EntityResolver();
        resolver.resolveFromFact(context, fact.content).catch(err => {
          logger.debug('Entity resolution skipped', { error: err instanceof Error ? err.message : String(err) });
        });
      } catch (err) {
        logger.debug('Entity resolution import skipped', { error: err instanceof Error ? err.message : String(err) });
      }
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
      const queryLower = query.toLowerCase();

      // Find relevant facts with composite importance scoring
      const scoredFacts = memory.facts
        .map(fact => {
          // Text match check
          const textMatch = fact.content.toLowerCase().includes(queryLower) ||
            queryLower.includes(fact.content.toLowerCase());
          const isRelevant = textMatch || fact.confidence >= 0.8;

          if (!isRelevant) {return null;}

          // Composite importance score (Phase 42)
          const compositeScore = this.computeCompositeImportance(fact);
          return { fact, compositeScore };
        })
        .filter((entry): entry is { fact: PersonalizationFact; compositeScore: number } => entry !== null)
        .sort((a, b) => b.compositeScore - a.compositeScore);

      // Track usage for retrieved facts (Phase 42: Usage Tracking)
      const now = new Date();
      const topFacts = scoredFacts.slice(0, 10);
      for (const { fact } of topFacts) {
        fact.retrievalCount++;
        fact.lastRetrieved = now;
      }

      // Persist usage tracking to DB (fire-and-forget)
      if (topFacts.length > 0) {
        const ids = topFacts.map(s => s.fact.id);
        queryContext(
          context,
          `UPDATE personalization_facts
           SET retrieval_count = COALESCE(retrieval_count, 0) + 1,
               last_retrieved = NOW()
           WHERE id = ANY($1::text[])`,
          [ids]
        ).catch(err => logger.debug('Failed to persist retrieval tracking', {
          error: err instanceof Error ? err.message : String(err),
        }));
      }

      const relevantFacts = scoredFacts.map(s => s.fact);

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
        relevantFacts.slice(0, 10),
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
   * Compute composite importance score for a fact.
   *
   * Three-factor scoring (based on 2026 State-of-the-Art research):
   * - Recency (0.3): How recently the fact was confirmed or retrieved
   * - Usage (0.4): How frequently the fact is retrieved and useful
   * - Confidence (0.3): How reliable the source and how often confirmed
   *
   * Returns a score between 0 and 1.
   */
  private computeCompositeImportance(fact: PersonalizationFact): number {
    const now = Date.now();
    const w = CONFIG.COMPOSITE_WEIGHTS;

    // 1. Recency score (exponential decay from last confirmation or retrieval)
    const lastActive = fact.lastRetrieved
      ? Math.max(fact.lastConfirmed.getTime(), fact.lastRetrieved.getTime())
      : fact.lastConfirmed.getTime();
    const daysSinceActive = (now - lastActive) / (1000 * 60 * 60 * 24);
    const recencyScore = Math.exp(-0.02 * daysSinceActive); // ~50% after 35 days

    // 2. Usage score (logarithmic, based on retrieval count + occurrences)
    const totalUsage = fact.retrievalCount + fact.occurrences;
    const usageScore = Math.min(1.0, Math.log(1 + totalUsage) / Math.log(20)); // Saturates at ~20 uses

    // 3. Confidence score (direct)
    const confidenceScore = fact.confidence;

    return (w.recency * recencyScore) + (w.usage * usageScore) + (w.confidence * confidenceScore);
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
  async addFact(context: AIContext, fact: Omit<PersonalizationFact, 'id' | 'firstSeen' | 'lastConfirmed' | 'occurrences' | 'retrievalCount' | 'lastRetrieved' | 'decayClass'> & { decayClass?: DecayClass }): Promise<void> {
    await this.initialize(context);
    const memory = this.memories.get(context);
    if (!memory) {return;}

    // Contradiction detection: check if new fact conflicts with existing ones
    const contradiction = this.detectContradiction(memory.facts, fact);
    if (contradiction) {
      logger.warn('Contradiction detected in long-term memory', {
        context,
        newFact: fact.content.substring(0, 100),
        existingFact: contradiction.existingFact.content.substring(0, 100),
        resolution: contradiction.resolution,
      });

      if (contradiction.resolution === 'replace') {
        // Lower confidence of existing contradicting fact
        contradiction.existingFact.confidence = Math.max(0.1,
          contradiction.existingFact.confidence * 0.5
        );
        // Persist the reduced confidence
        await this.persistFact(context, contradiction.existingFact);
      } else if (contradiction.resolution === 'skip') {
        // Existing fact is more reliable, skip the new one
        return;
      }
      // 'add_both': fall through and add both
    }

    const fullFact: PersonalizationFact = {
      id: uuidv4(),
      factType: fact.factType,
      content: fact.content,
      confidence: fact.confidence,
      source: fact.source || 'explicit',
      firstSeen: new Date(),
      lastConfirmed: new Date(),
      occurrences: 1,
      retrievalCount: 0,
      lastRetrieved: null,
      decayClass: fact.decayClass || inferDecayClass(fact.factType, fact.source || 'explicit'),
    };

    memory.facts.push(fullFact);
    await this.persistFact(context, fullFact);

    logger.info('Explicit fact added', { context, factType: fact.factType });

    // Emit system event for proactive engine
    import('../event-system').then(({ emitSystemEvent }) =>
      emitSystemEvent({ context, eventType: 'memory.fact_learned', eventSource: 'long_term_memory', payload: { factType: fact.factType, content: fact.content?.substring(0, 200) } })
    ).catch(err => { logger.warn('Failed to emit memory.fact_learned event', { error: err instanceof Error ? err.message : String(err) }); });
  }

  /**
   * Remove a fact from in-memory storage by ID.
   * Does NOT touch the database — the caller is responsible for DB operations.
   */
  removeFact(context: AIContext, factId: string): boolean {
    const memory = this.memories.get(context);
    if (!memory) {return false;}

    const index = memory.facts.findIndex(f => f.id === factId);
    if (index >= 0) {
      memory.facts.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Detect contradictions between a new fact and existing facts.
   *
   * Uses heuristic approach:
   * 1. Same fact type + high word overlap + negation patterns = contradiction
   * 2. Same fact type + very high word overlap + different values = update
   *
   * Returns null if no contradiction found.
   */
  private detectContradiction(
    existingFacts: PersonalizationFact[],
    newFact: Pick<PersonalizationFact, 'factType' | 'content' | 'confidence' | 'source'>
  ): { existingFact: PersonalizationFact; resolution: 'replace' | 'skip' | 'add_both' } | null {
    const NEGATION_PATTERNS = [
      /\bnicht\b/i, /\bkein[e]?\b/i, /\bnever\b/i, /\bnot\b/i,
      /\bno\b/i, /\bhasse?\b/i, /\bhate\b/i, /\bnie\b/i,
      /\bnichts\b/i, /\bablehne?\b/i, /\bdislike\b/i,
    ];

    const newWords = new Set(
      newFact.content.toLowerCase().split(/\s+/).filter(w => w.length > 3)
    );
    const newHasNegation = NEGATION_PATTERNS.some(p => p.test(newFact.content));

    for (const existing of existingFacts) {
      // Only compare same fact types
      if (existing.factType !== newFact.factType) {continue;}

      const existingWords = new Set(
        existing.content.toLowerCase().split(/\s+/).filter(w => w.length > 3)
      );

      // Calculate word overlap
      let overlap = 0;
      for (const word of newWords) {
        if (existingWords.has(word)) {overlap++;}
      }
      const overlapRatio = overlap / Math.max(1, Math.min(newWords.size, existingWords.size));

      // High overlap (>50%) with opposing negation = contradiction
      if (overlapRatio >= 0.5) {
        const existingHasNegation = NEGATION_PATTERNS.some(p => p.test(existing.content));

        if (newHasNegation !== existingHasNegation) {
          // Opposing negation: "mag Kaffee" vs "mag keinen Kaffee"
          // Resolution: newer fact wins if explicit, otherwise reduce both
          if (newFact.source === 'explicit') {
            return { existingFact: existing, resolution: 'replace' };
          } else if (existing.source === 'explicit' && existing.confidence > 0.7) {
            return { existingFact: existing, resolution: 'skip' };
          }
          return { existingFact: existing, resolution: 'replace' };
        }

        // Very high overlap (>80%) same direction = possible duplicate/update
        if (overlapRatio >= 0.8 && newHasNegation === existingHasNegation) {
          // Boost existing fact instead of adding duplicate
          existing.occurrences++;
          existing.lastConfirmed = new Date();
          existing.confidence = Math.min(1.0, existing.confidence + 0.05);
          return { existingFact: existing, resolution: 'skip' };
        }
      }
    }

    return null;
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

  /**
   * Apply importance-weighted decay to facts (monthly cron job)
   *
   * Different fact types decay at different rates:
   * - goal: near-permanent (0.9995/day) ~2% loss per year
   * - preference: very slow (0.999/day) ~3% loss per month
   * - knowledge: slow (0.998/day) ~6% loss per month
   * - behavior: moderate (0.995/day) ~15% loss per month
   * - context: fast (0.990/day) ~26% loss per month
   *
   * Facts with confidence below MIN_FACT_PRUNE_CONFIDENCE are pruned.
   * Explicit facts (from user) decay 50% slower than inferred ones.
   */
  async applyFactDecay(context: AIContext): Promise<{ decayed: number; pruned: number }> {
    await this.initialize(context);
    const memory = this.memories.get(context);
    if (!memory) { return { decayed: 0, pruned: 0 }; }

    const now = new Date();
    let decayed = 0;
    let pruned = 0;

    for (const fact of memory.facts) {
      const daysSinceConfirmed = (now.getTime() - fact.lastConfirmed.getTime()) / (1000 * 60 * 60 * 24);

      // Skip recently confirmed facts (within last 7 days)
      if (daysSinceConfirmed < 7) { continue; }

      // Phase 42: Use graduated decay class if available, otherwise fall back to type-based rate
      let baseDecayRate: number;
      if (fact.decayClass === 'permanent') {
        // Permanent facts never decay
        continue;
      } else if (fact.decayClass && CONFIG.DECAY_CLASS_RATES[fact.decayClass]) {
        baseDecayRate = CONFIG.DECAY_CLASS_RATES[fact.decayClass];
      } else {
        baseDecayRate = CONFIG.FACT_DECAY_RATES[fact.factType] || 0.995;
      }

      // Explicit facts from user decay 50% slower
      const sourceMultiplier = fact.source === 'explicit' ? 0.5 : 1.0;

      // High-occurrence facts decay slower (logarithmic dampening)
      const occurrenceDampening = 1.0 / (1.0 + Math.log(Math.max(1, fact.occurrences)));

      // Phase 42: Usage-based decay dampening (frequently retrieved facts decay slower)
      const usageDampening = fact.retrievalCount > 0
        ? 1.0 / (1.0 + Math.log(1 + fact.retrievalCount) * 0.5)
        : 1.0;

      // Effective decay: base^(days * sourceMultiplier * occurrenceDampening * usageDampening)
      const effectiveDays = daysSinceConfirmed * sourceMultiplier * occurrenceDampening * usageDampening;
      const decayFactor = Math.pow(baseDecayRate, effectiveDays);

      fact.confidence = fact.confidence * decayFactor;
      decayed++;
    }

    // Prune facts below minimum confidence threshold
    const beforeLength = memory.facts.length;
    memory.facts = memory.facts.filter(f => f.confidence >= CONFIG.MIN_FACT_PRUNE_CONFIDENCE);
    pruned = beforeLength - memory.facts.length;

    // Persist confidence changes to database
    if (decayed > 0) {
      try {
        await queryContext(
          context,
          `UPDATE personalization_facts
           SET confidence = GREATEST($1, confidence * (
             CASE fact_type
               WHEN 'goal' THEN $2
               WHEN 'preference' THEN $3
               WHEN 'knowledge' THEN $4
               WHEN 'behavior' THEN $5
               ELSE $6
             END
           ))
           WHERE context = $7
             AND is_active = true
             AND last_confirmed < NOW() - INTERVAL '7 days'`,
          [
            CONFIG.MIN_FACT_PRUNE_CONFIDENCE,
            CONFIG.FACT_DECAY_RATES.goal,
            CONFIG.FACT_DECAY_RATES.preference,
            CONFIG.FACT_DECAY_RATES.knowledge,
            CONFIG.FACT_DECAY_RATES.behavior,
            CONFIG.FACT_DECAY_RATES.context,
            context,
          ]
        );
      } catch (error) {
        logger.debug('Fact decay DB update failed, in-memory decay applied', { error });
      }
    }

    // Prune from database
    if (pruned > 0) {
      try {
        await queryContext(
          context,
          `UPDATE personalization_facts
           SET is_active = false
           WHERE context = $1
             AND confidence < $2`,
          [context, CONFIG.MIN_FACT_PRUNE_CONFIDENCE]
        );
      } catch (error) {
        logger.debug('Fact pruning DB update failed', { error });
      }
    }

    logger.info('Long-term fact decay applied', { context, decayed, pruned });
    return { decayed, pruned };
  }
}

// ===========================================
// Singleton Export
// ===========================================

export const longTermMemory = new LongTermMemoryService();
