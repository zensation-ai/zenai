/**
 * Phase 87: Metamemory Service
 *
 * Provides introspection into the memory system itself — statistics,
 * confidence distributions, knowledge gaps, and conflict detection.
 * "Knowing what you know" and "knowing what you don't know."
 *
 * @module services/memory/metamemory
 */

import { AIContext, queryContext } from '../../utils/database-context';
import { logger } from '../../utils/logger';

// ===========================================
// Types
// ===========================================

export interface MetamemoryStats {
  totalFacts: number;
  highConfidence: number;
  mediumConfidence: number;
  lowConfidence: number;
  topCategories: { category: string; count: number }[];
  knowledgeGaps: string[];
  averageConfidence: number;
}

export interface ConfidenceBucket {
  range: string;
  count: number;
}

export interface FactConflict {
  fact1Id: string;
  fact1Content: string;
  fact2Id: string;
  fact2Content: string;
  similarity: number;
}

// ===========================================
// Service Functions
// ===========================================

/**
 * Get aggregated metamemory statistics from learned_facts
 */
export async function getMetamemoryStats(
  context: AIContext,
  userId: string
): Promise<MetamemoryStats> {
  try {
    // Get confidence distribution counts
    const statsResult = await queryContext(
      context,
      `SELECT
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE COALESCE(confidence, 1.0) >= 0.8) AS high_confidence,
         COUNT(*) FILTER (WHERE COALESCE(confidence, 1.0) >= 0.5 AND COALESCE(confidence, 1.0) < 0.8) AS medium_confidence,
         COUNT(*) FILTER (WHERE COALESCE(confidence, 1.0) < 0.5) AS low_confidence,
         COALESCE(AVG(COALESCE(confidence, 1.0)), 0) AS avg_confidence
       FROM learned_facts
       WHERE user_id = $1`,
      [userId]
    );

    const stats = statsResult.rows[0];

    // Get top categories
    const categoriesResult = await queryContext(
      context,
      `SELECT COALESCE(category, 'uncategorized') AS category, COUNT(*) AS count
       FROM learned_facts
       WHERE user_id = $1
       GROUP BY category
       ORDER BY count DESC
       LIMIT 10`,
      [userId]
    );

    const topCategories = categoriesResult.rows.map((r: Record<string, unknown>) => ({
      category: r.category as string,
      count: Number(r.count),
    }));

    // Get knowledge gaps (categories with fewer than 5 facts)
    const gapsResult = await queryContext(
      context,
      `SELECT COALESCE(category, 'uncategorized') AS category, COUNT(*) AS count
       FROM learned_facts
       WHERE user_id = $1
       GROUP BY category
       HAVING COUNT(*) < 5
       ORDER BY count ASC`,
      [userId]
    );

    const knowledgeGaps = gapsResult.rows.map(
      (r: Record<string, unknown>) => r.category as string
    );

    return {
      totalFacts: Number(stats.total),
      highConfidence: Number(stats.high_confidence),
      mediumConfidence: Number(stats.medium_confidence),
      lowConfidence: Number(stats.low_confidence),
      topCategories,
      knowledgeGaps,
      averageConfidence: Number(Number(stats.avg_confidence).toFixed(3)),
    };
  } catch (error) {
    logger.error('Metamemory: Statistiken konnten nicht geladen werden', error instanceof Error ? error : new Error(String(error)), { context, userId });
    throw error;
  }
}

/**
 * Get categories with few facts (knowledge gaps)
 */
export async function getKnowledgeGaps(
  context: AIContext,
  userId: string
): Promise<{ category: string; count: number; suggestion: string }[]> {
  try {
    const result = await queryContext(
      context,
      `SELECT COALESCE(category, 'uncategorized') AS category, COUNT(*) AS count
       FROM learned_facts
       WHERE user_id = $1
       GROUP BY category
       HAVING COUNT(*) < 5
       ORDER BY count ASC
       LIMIT 20`,
      [userId]
    );

    return result.rows.map((r: Record<string, unknown>) => ({
      category: r.category as string,
      count: Number(r.count),
      suggestion: `Consider learning more about "${r.category}" (only ${r.count} facts stored)`,
    }));
  } catch (error) {
    logger.error('Metamemory: Wissensluecken konnten nicht ermittelt werden', error instanceof Error ? error : new Error(String(error)), { context, userId });
    throw error;
  }
}

/**
 * Get confidence score distribution as a histogram
 */
export async function getConfidenceDistribution(
  context: AIContext,
  userId: string
): Promise<ConfidenceBucket[]> {
  try {
    const result = await queryContext(
      context,
      `SELECT
         CASE
           WHEN COALESCE(confidence, 1.0) >= 0.9 THEN '0.9-1.0'
           WHEN COALESCE(confidence, 1.0) >= 0.8 THEN '0.8-0.9'
           WHEN COALESCE(confidence, 1.0) >= 0.7 THEN '0.7-0.8'
           WHEN COALESCE(confidence, 1.0) >= 0.6 THEN '0.6-0.7'
           WHEN COALESCE(confidence, 1.0) >= 0.5 THEN '0.5-0.6'
           WHEN COALESCE(confidence, 1.0) >= 0.4 THEN '0.4-0.5'
           WHEN COALESCE(confidence, 1.0) >= 0.3 THEN '0.3-0.4'
           WHEN COALESCE(confidence, 1.0) >= 0.2 THEN '0.2-0.3'
           WHEN COALESCE(confidence, 1.0) >= 0.1 THEN '0.1-0.2'
           ELSE '0.0-0.1'
         END AS range,
         COUNT(*) AS count
       FROM learned_facts
       WHERE user_id = $1
       GROUP BY range
       ORDER BY range DESC`,
      [userId]
    );

    return result.rows.map((r: Record<string, unknown>) => ({
      range: r.range as string,
      count: Number(r.count),
    }));
  } catch (error) {
    logger.error('Metamemory: Konfidenz-Verteilung konnte nicht geladen werden', error instanceof Error ? error : new Error(String(error)), { context, userId });
    throw error;
  }
}

/**
 * Find potentially conflicting facts using pg_trgm text similarity.
 * Looks for facts that are textually similar but may contain contradictions.
 */
export async function findConflicts(
  context: AIContext,
  userId: string,
  similarityThreshold: number = 0.4
): Promise<FactConflict[]> {
  try {
    const result = await queryContext(
      context,
      `SELECT
         a.id AS fact1_id,
         a.fact AS fact1_content,
         b.id AS fact2_id,
         b.fact AS fact2_content,
         similarity(a.fact, b.fact) AS sim
       FROM learned_facts a
       JOIN learned_facts b ON a.id < b.id
       WHERE a.user_id = $1
         AND b.user_id = $1
         AND similarity(a.fact, b.fact) > $2
         AND a.fact != b.fact
       ORDER BY sim DESC
       LIMIT 20`,
      [userId, similarityThreshold]
    );

    return result.rows.map((r: Record<string, unknown>) => ({
      fact1Id: r.fact1_id as string,
      fact1Content: r.fact1_content as string,
      fact2Id: r.fact2_id as string,
      fact2Content: r.fact2_content as string,
      similarity: Number(r.sim),
    }));
  } catch (err) {
    // pg_trgm extension may not be installed — graceful fallback
    logger.debug('Conflict detection failed (pg_trgm may not be available)', {
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}
