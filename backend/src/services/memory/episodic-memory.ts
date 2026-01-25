/**
 * Episodic Memory Service (HiMeS Architecture - Layer 3)
 *
 * Stores concrete experiences/interactions as discrete episodes.
 * Biological inspiration: Hippocampal episodic memory formation.
 *
 * Features:
 * - Emotional context tagging (valence + arousal)
 * - Temporal context awareness
 * - Retrieval with decay (spacing effect)
 * - Automatic linking to similar episodes
 * - Consolidation to semantic memory
 */

import { v4 as uuidv4 } from 'uuid';
import { AIContext, queryContext } from '../../utils/database-context';
import { logger } from '../../utils/logger';
import { generateEmbedding } from '../ai';
import { formatForPgVector, cosineSimilarity } from '../../utils/embedding';

// ===========================================
// Types & Interfaces
// ===========================================

export interface Episode {
  id: string;
  context: AIContext;
  sessionId: string;
  timestamp: Date;

  // What happened
  trigger: string;
  response: string;

  // Emotional context
  emotionalValence: number;  // -1 to +1
  emotionalArousal: number;  // 0 to 1

  // Temporal context
  temporalContext: {
    timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
    dayOfWeek: string;
    isWeekend: boolean;
  };

  // Linkages
  linkedEpisodes: string[];
  linkedFacts: string[];

  // Retrieval statistics
  retrievalCount: number;
  lastRetrieved: Date | null;
  retrievalStrength: number;

  // Embedding
  embedding?: number[];
}

export interface EpisodicRetrievalOptions {
  /** Maximum episodes to return */
  limit?: number;
  /** Minimum retrieval strength */
  minStrength?: number;
  /** Filter by emotional valence range */
  emotionalFilter?: {
    minValence?: number;
    maxValence?: number;
  };
  /** Filter by time of day */
  temporalFilter?: {
    timeOfDay?: 'morning' | 'afternoon' | 'evening' | 'night';
    isWeekend?: boolean;
  };
  /** Include decayed episodes (strength < 0.1) */
  includeDecayed?: boolean;
}

export interface EpisodicConsolidationResult {
  episodesProcessed: number;
  factsExtracted: number;
  strongEpisodes: number;
}

// ===========================================
// Configuration
// ===========================================

const CONFIG = {
  /** Minimum similarity for episode linking */
  MIN_LINK_SIMILARITY: 0.65,
  /** Maximum linked episodes per episode */
  MAX_LINKED_EPISODES: 5,
  /** Minimum strength for retrieval */
  DEFAULT_MIN_STRENGTH: 0.1,
  /** Default retrieval limit */
  DEFAULT_LIMIT: 5,
  /** Decay rate per day of inactivity */
  DECAY_RATE: 0.995,
  /** Minimum retrieval count for consolidation */
  MIN_RETRIEVAL_FOR_CONSOLIDATION: 3,
  /** Minimum strength for consolidation */
  MIN_STRENGTH_FOR_CONSOLIDATION: 0.5,
};

// ===========================================
// Episodic Memory Service
// ===========================================

class EpisodicMemoryService {
  // ===========================================
  // Episode Storage
  // ===========================================

  /**
   * Store a new episode
   */
  async store(
    trigger: string,
    response: string,
    sessionId: string,
    context: AIContext
  ): Promise<Episode> {
    try {
      // Generate embedding for the episode
      const combinedText = `${trigger} ${response}`;
      const embedding = await generateEmbedding(combinedText);

      // Analyze emotional content
      const emotional = await this.analyzeEmotionalContent(trigger, response);

      // Get temporal context
      const temporal = this.getTemporalContext();

      // Find similar episodes for linking
      const similarEpisodes = embedding.length > 0
        ? await this.findSimilarEpisodes(embedding, context, CONFIG.MAX_LINKED_EPISODES)
        : [];

      const linkedEpisodeIds = similarEpisodes
        .filter(e => e.similarity >= CONFIG.MIN_LINK_SIMILARITY)
        .map(e => e.id);

      // Insert into database
      const result = await queryContext(
        context,
        `INSERT INTO episodic_memories (
          context, session_id, trigger, response,
          emotional_valence, emotional_arousal,
          time_of_day, day_of_week, is_weekend,
          linked_episodes, embedding
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *`,
        [
          context,
          sessionId,
          trigger,
          response,
          emotional.valence,
          emotional.arousal,
          temporal.timeOfDay,
          temporal.dayOfWeek,
          temporal.isWeekend,
          linkedEpisodeIds,
          embedding.length > 0 ? formatForPgVector(embedding) : null,
        ]
      );

      const row = result.rows[0];

      logger.debug('Episode stored', {
        episodeId: row.id,
        sessionId,
        context,
        linkedCount: linkedEpisodeIds.length,
        emotionalValence: emotional.valence,
      });

      return this.rowToEpisode(row);
    } catch (error) {
      logger.error('Failed to store episode', error instanceof Error ? error : undefined, {
        sessionId,
        context,
      });
      throw error;
    }
  }

  /**
   * Analyze emotional content of an interaction
   * Uses heuristics for speed, can be enhanced with LLM
   */
  private async analyzeEmotionalContent(
    trigger: string,
    response: string
  ): Promise<{ valence: number; arousal: number }> {
    const text = `${trigger} ${response}`.toLowerCase();

    // Positive indicators
    const positiveWords = [
      'danke', 'super', 'toll', 'prima', 'perfekt', 'genial', 'wunderbar',
      'freue', 'begeistert', 'excellent', 'great', 'thanks', 'amazing',
      'love', 'happy', 'excited', 'fantastic', 'awesome', 'brilliant',
    ];

    // Negative indicators
    const negativeWords = [
      'problem', 'fehler', 'falsch', 'schlecht', 'schwierig', 'frustriert',
      'ärger', 'error', 'wrong', 'bad', 'difficult', 'frustrated', 'angry',
      'confused', 'stuck', 'broken', 'issue', 'bug', 'fail',
    ];

    // High arousal indicators
    const highArousalWords = [
      'dringend', 'wichtig', 'schnell', 'sofort', 'urgent', 'important',
      'immediately', 'asap', 'critical', 'deadline', 'emergency', '!',
    ];

    // Count occurrences
    let positiveCount = 0;
    let negativeCount = 0;
    let arousalCount = 0;

    for (const word of positiveWords) {
      if (text.includes(word)) positiveCount++;
    }
    for (const word of negativeWords) {
      if (text.includes(word)) negativeCount++;
    }
    for (const word of highArousalWords) {
      if (text.includes(word)) arousalCount++;
    }

    // Calculate valence (-1 to +1)
    const totalSentiment = positiveCount + negativeCount;
    const valence = totalSentiment === 0
      ? 0
      : (positiveCount - negativeCount) / Math.max(totalSentiment, 3);

    // Calculate arousal (0 to 1)
    const arousal = Math.min(0.3 + arousalCount * 0.15, 1.0);

    return {
      valence: Math.max(-1, Math.min(1, valence)),
      arousal: Math.max(0, Math.min(1, arousal)),
    };
  }

  /**
   * Get current temporal context
   */
  private getTemporalContext(): {
    timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
    dayOfWeek: string;
    isWeekend: boolean;
  } {
    const now = new Date();
    const hour = now.getHours();
    const day = now.getDay();

    let timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
    if (hour >= 5 && hour < 12) {
      timeOfDay = 'morning';
    } else if (hour >= 12 && hour < 17) {
      timeOfDay = 'afternoon';
    } else if (hour >= 17 && hour < 21) {
      timeOfDay = 'evening';
    } else {
      timeOfDay = 'night';
    }

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    return {
      timeOfDay,
      dayOfWeek: dayNames[day],
      isWeekend: day === 0 || day === 6,
    };
  }

  // ===========================================
  // Episode Retrieval
  // ===========================================

  /**
   * Retrieve relevant episodes for a query
   */
  async retrieve(
    query: string,
    context: AIContext,
    options: EpisodicRetrievalOptions = {}
  ): Promise<Episode[]> {
    const {
      limit = CONFIG.DEFAULT_LIMIT,
      minStrength = CONFIG.DEFAULT_MIN_STRENGTH,
      emotionalFilter,
      temporalFilter,
      includeDecayed = false,
    } = options;

    try {
      // Generate query embedding
      const queryEmbedding = await generateEmbedding(query);

      if (queryEmbedding.length === 0) {
        // Fallback to text search
        return this.textBasedRetrieval(query, context, limit);
      }

      // Build dynamic query
      let sql = `
        SELECT *,
               1 - (embedding <=> $2) as semantic_similarity,
               retrieval_strength *
                 POWER($5, EXTRACT(DAYS FROM NOW() - COALESCE(last_retrieved, created_at))) as decayed_strength
        FROM episodic_memories
        WHERE context = $1
          AND embedding IS NOT NULL
      `;

      const params: any[] = [
        context,
        formatForPgVector(queryEmbedding),
        limit,
        minStrength,
        CONFIG.DECAY_RATE,
      ];
      let paramIndex = 6;

      // Strength filter
      if (!includeDecayed) {
        sql += ` AND retrieval_strength >= $4`;
      }

      // Emotional filter
      if (emotionalFilter) {
        if (emotionalFilter.minValence !== undefined) {
          sql += ` AND emotional_valence >= $${paramIndex}`;
          params.push(emotionalFilter.minValence);
          paramIndex++;
        }
        if (emotionalFilter.maxValence !== undefined) {
          sql += ` AND emotional_valence <= $${paramIndex}`;
          params.push(emotionalFilter.maxValence);
          paramIndex++;
        }
      }

      // Temporal filter
      if (temporalFilter) {
        if (temporalFilter.timeOfDay) {
          sql += ` AND time_of_day = $${paramIndex}`;
          params.push(temporalFilter.timeOfDay);
          paramIndex++;
        }
        if (temporalFilter.isWeekend !== undefined) {
          sql += ` AND is_weekend = $${paramIndex}`;
          params.push(temporalFilter.isWeekend);
          paramIndex++;
        }
      }

      // Order by combined score (semantic similarity * decayed strength)
      sql += `
        ORDER BY (1 - (embedding <=> $2)) *
                 (retrieval_strength * POWER($5, EXTRACT(DAYS FROM NOW() - COALESCE(last_retrieved, created_at))))
                 DESC
        LIMIT $3
      `;

      const result = await queryContext(context, sql, params);

      // Update retrieval stats for retrieved episodes
      if (result.rows.length > 0) {
        const episodeIds = result.rows.map((r: any) => r.id);
        await this.updateRetrievalStats(episodeIds, context);
      }

      return result.rows.map((row: any) => this.rowToEpisode(row));
    } catch (error) {
      logger.error('Failed to retrieve episodes', error instanceof Error ? error : undefined, {
        context,
      });
      return [];
    }
  }

  /**
   * Text-based retrieval fallback
   */
  private async textBasedRetrieval(
    query: string,
    context: AIContext,
    limit: number
  ): Promise<Episode[]> {
    const result = await queryContext(
      context,
      `SELECT *
       FROM episodic_memories
       WHERE context = $1
         AND (trigger ILIKE $2 OR response ILIKE $2)
       ORDER BY created_at DESC
       LIMIT $3`,
      [context, `%${query}%`, limit]
    );

    return result.rows.map((row: any) => this.rowToEpisode(row));
  }

  /**
   * Find similar episodes for linking
   */
  private async findSimilarEpisodes(
    embedding: number[],
    context: AIContext,
    limit: number
  ): Promise<Array<{ id: string; similarity: number }>> {
    try {
      const result = await queryContext(
        context,
        `SELECT id, 1 - (embedding <=> $2) as similarity
         FROM episodic_memories
         WHERE context = $1
           AND embedding IS NOT NULL
         ORDER BY embedding <=> $2
         LIMIT $3`,
        [context, formatForPgVector(embedding), limit]
      );

      return result.rows.map((row: any) => ({
        id: row.id,
        similarity: parseFloat(row.similarity),
      }));
    } catch (error) {
      logger.debug('Failed to find similar episodes', { error });
      return [];
    }
  }

  /**
   * Update retrieval statistics (spacing effect)
   */
  private async updateRetrievalStats(
    episodeIds: string[],
    context: AIContext
  ): Promise<void> {
    try {
      // Use the database function for atomic update
      await queryContext(
        context,
        `SELECT update_episodic_retrieval_stats($1)`,
        [episodeIds]
      );
    } catch (error) {
      // Fallback to manual update if function doesn't exist
      await queryContext(
        context,
        `UPDATE episodic_memories
         SET retrieval_count = retrieval_count + 1,
             retrieval_strength = LEAST(1.0, retrieval_strength + 0.05),
             last_retrieved = NOW()
         WHERE id = ANY($1)`,
        [episodeIds]
      );
    }
  }

  // ===========================================
  // Consolidation (Episodic -> Semantic)
  // ===========================================

  /**
   * Consolidate strong episodes to long-term semantic memory
   * Should be called by daily cron job
   */
  async consolidate(context: AIContext): Promise<EpisodicConsolidationResult> {
    const result: EpisodicConsolidationResult = {
      episodesProcessed: 0,
      factsExtracted: 0,
      strongEpisodes: 0,
    };

    try {
      // Find strong, frequently retrieved episodes not yet consolidated
      const strongEpisodes = await queryContext(
        context,
        `SELECT * FROM episodic_memories
         WHERE context = $1
           AND retrieval_count >= $2
           AND retrieval_strength >= $3
           AND NOT EXISTS (
             SELECT 1 FROM personalization_facts f
             WHERE f.metadata->>'source_episode_id' = episodic_memories.id::text
           )
         ORDER BY retrieval_strength DESC
         LIMIT 20`,
        [context, CONFIG.MIN_RETRIEVAL_FOR_CONSOLIDATION, CONFIG.MIN_STRENGTH_FOR_CONSOLIDATION]
      );

      result.strongEpisodes = strongEpisodes.rows.length;

      if (strongEpisodes.rows.length === 0) {
        logger.debug('No episodes to consolidate', { context });
        return result;
      }

      // Extract facts from strong episodes
      // This could be enhanced with LLM-based extraction
      for (const row of strongEpisodes.rows) {
        const episode = this.rowToEpisode(row);
        result.episodesProcessed++;

        // Simple fact extraction: store the interaction summary as a fact
        const factContent = `Frühere Interaktion: "${episode.trigger.substring(0, 100)}..." -> ${episode.response.substring(0, 150)}...`;

        try {
          await queryContext(
            context,
            `INSERT INTO personalization_facts
             (id, context, fact_type, content, confidence, source, first_seen, last_confirmed, occurrences, is_active, metadata)
             VALUES ($1, $2, 'context', $3, $4, 'consolidated', $5, $5, 1, true, $6)
             ON CONFLICT (id) DO NOTHING`,
            [
              uuidv4(),
              context,
              factContent,
              episode.retrievalStrength,
              new Date(),
              JSON.stringify({ source_episode_id: episode.id }),
            ]
          );

          result.factsExtracted++;

          // Link fact to episode
          await queryContext(
            context,
            `UPDATE episodic_memories
             SET linked_facts = array_append(linked_facts, $2)
             WHERE id = $1`,
            [episode.id, episode.id] // Simplified: using episode ID as reference
          );
        } catch (factError) {
          logger.debug('Failed to extract fact from episode', {
            episodeId: episode.id,
            error: factError instanceof Error ? factError.message : 'Unknown',
          });
        }
      }

      logger.info('Episodic memory consolidation complete', {
        context,
        ...result,
      });

      return result;
    } catch (error) {
      logger.error('Episodic consolidation failed', error instanceof Error ? error : undefined, {
        context,
      });
      return result;
    }
  }

  /**
   * Apply decay to all episodes (daily cron job)
   */
  async applyDecay(context: AIContext): Promise<number> {
    try {
      const result = await queryContext(
        context,
        `SELECT apply_episodic_decay()`
      );

      const affectedCount = result.rows[0]?.apply_episodic_decay || 0;

      logger.debug('Applied episodic memory decay', {
        context,
        affectedCount,
      });

      return affectedCount;
    } catch (error) {
      // Fallback if function doesn't exist
      const result = await queryContext(
        context,
        `UPDATE episodic_memories
         SET retrieval_strength = GREATEST(0.05, retrieval_strength * $1)
         WHERE context = $2
           AND updated_at < NOW() - INTERVAL '1 day'
           AND retrieval_strength > 0.05`,
        [CONFIG.DECAY_RATE, context]
      );

      return result.rowCount || 0;
    }
  }

  // ===========================================
  // Utility Methods
  // ===========================================

  /**
   * Get episode by ID
   */
  async getById(id: string, context: AIContext): Promise<Episode | null> {
    const result = await queryContext(
      context,
      `SELECT * FROM episodic_memories WHERE id = $1 AND context = $2`,
      [id, context]
    );

    return result.rows.length > 0 ? this.rowToEpisode(result.rows[0]) : null;
  }

  /**
   * Get recent episodes for a session
   */
  async getBySession(
    sessionId: string,
    context: AIContext,
    limit: number = 10
  ): Promise<Episode[]> {
    const result = await queryContext(
      context,
      `SELECT * FROM episodic_memories
       WHERE session_id = $1 AND context = $2
       ORDER BY created_at DESC
       LIMIT $3`,
      [sessionId, context, limit]
    );

    return result.rows.map((row: any) => this.rowToEpisode(row));
  }

  /**
   * Calculate average emotional tone from retrieved episodes
   */
  calculateEmotionalTone(episodes: Episode[]): {
    avgValence: number;
    avgArousal: number;
    dominantMood: string;
  } {
    if (episodes.length === 0) {
      return { avgValence: 0, avgArousal: 0.5, dominantMood: 'neutral' };
    }

    const avgValence = episodes.reduce((sum, e) => sum + e.emotionalValence, 0) / episodes.length;
    const avgArousal = episodes.reduce((sum, e) => sum + e.emotionalArousal, 0) / episodes.length;

    // Determine dominant mood
    let dominantMood: string;
    if (avgValence > 0.3) {
      dominantMood = avgArousal > 0.6 ? 'excited' : 'positive';
    } else if (avgValence < -0.3) {
      dominantMood = avgArousal > 0.6 ? 'frustrated' : 'negative';
    } else {
      dominantMood = avgArousal > 0.6 ? 'focused' : 'neutral';
    }

    return { avgValence, avgArousal, dominantMood };
  }

  /**
   * Get statistics for episodic memory
   */
  async getStats(context: AIContext): Promise<{
    totalEpisodes: number;
    avgRetrievalStrength: number;
    strongEpisodes: number;
    recentEpisodes: number;
  }> {
    const result = await queryContext(
      context,
      `SELECT
         COUNT(*) as total,
         AVG(retrieval_strength) as avg_strength,
         COUNT(*) FILTER (WHERE retrieval_strength >= 0.5) as strong,
         COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') as recent
       FROM episodic_memories
       WHERE context = $1`,
      [context]
    );

    const row = result.rows[0];

    return {
      totalEpisodes: parseInt(row.total) || 0,
      avgRetrievalStrength: parseFloat(row.avg_strength) || 0,
      strongEpisodes: parseInt(row.strong) || 0,
      recentEpisodes: parseInt(row.recent) || 0,
    };
  }

  // ===========================================
  // Row Conversion
  // ===========================================

  /**
   * Convert database row to Episode interface
   */
  private rowToEpisode(row: any): Episode {
    return {
      id: row.id,
      context: row.context,
      sessionId: row.session_id,
      timestamp: new Date(row.created_at),
      trigger: row.trigger,
      response: row.response,
      emotionalValence: parseFloat(row.emotional_valence) || 0,
      emotionalArousal: parseFloat(row.emotional_arousal) || 0.5,
      temporalContext: {
        timeOfDay: row.time_of_day || 'afternoon',
        dayOfWeek: row.day_of_week || 'Unknown',
        isWeekend: row.is_weekend || false,
      },
      linkedEpisodes: row.linked_episodes || [],
      linkedFacts: row.linked_facts || [],
      retrievalCount: row.retrieval_count || 0,
      lastRetrieved: row.last_retrieved ? new Date(row.last_retrieved) : null,
      retrievalStrength: parseFloat(row.retrieval_strength) || 1.0,
      embedding: row.embedding ? this.parseEmbedding(row.embedding) : undefined,
    };
  }

  /**
   * Parse embedding from database format
   */
  private parseEmbedding(embedding: any): number[] {
    if (Array.isArray(embedding)) return embedding;
    if (typeof embedding === 'string') {
      const cleaned = embedding.replace(/[\[\]]/g, '');
      return cleaned.split(',').map(Number);
    }
    return [];
  }
}

// ===========================================
// Singleton Export
// ===========================================

export const episodicMemory = new EpisodicMemoryService();
