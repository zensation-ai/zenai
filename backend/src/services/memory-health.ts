/**
 * Phase 50: Memory Health Service
 *
 * Monitors health of the 4-layer memory system:
 * - Working Memory (active task focus)
 * - Episodic Memory (concrete experiences)
 * - Short-Term Memory (session context)
 * - Long-Term Memory (persistent knowledge)
 *
 * Provides health scores, counts, and consolidation status.
 */

import { queryContext, AIContext } from '../utils/database-context';
import { logger } from '../utils/logger';

// ===========================================
// Types
// ===========================================

export interface WorkingMemoryStats {
  count: number;
  activeCount: number;
  avgAge: number;
}

export interface EpisodicMemoryStats {
  count: number;
  recentCount: number;
  avgImportance: number;
}

export interface ShortTermMemoryStats {
  count: number;
  expiringCount: number;
  avgRelevance: number;
}

export interface LongTermMemoryStats {
  count: number;
  avgStrength: number;
  consolidatedCount: number;
}

export interface MemoryHealthResult {
  working: WorkingMemoryStats;
  episodic: EpisodicMemoryStats;
  shortTerm: ShortTermMemoryStats;
  longTerm: LongTermMemoryStats;
  overall: {
    totalMemories: number;
    healthScore: number; // 0-100
    lastConsolidation: string | null;
    lastDecay: string | null;
  };
}

// ===========================================
// Default values for error cases
// ===========================================

const DEFAULT_WORKING: WorkingMemoryStats = { count: 0, activeCount: 0, avgAge: 0 };
const DEFAULT_EPISODIC: EpisodicMemoryStats = { count: 0, recentCount: 0, avgImportance: 0 };
const DEFAULT_SHORT_TERM: ShortTermMemoryStats = { count: 0, expiringCount: 0, avgRelevance: 0 };
const DEFAULT_LONG_TERM: LongTermMemoryStats = { count: 0, avgStrength: 0, consolidatedCount: 0 };

// ===========================================
// Layer Stats Queries
// ===========================================

/**
 * Query working_memory table for active task focus stats.
 */
async function getWorkingMemoryStats(context: AIContext): Promise<WorkingMemoryStats> {
  try {
    const result = await queryContext(
      context,
      `SELECT
        COUNT(*)::integer AS count,
        COUNT(*) FILTER (WHERE status = 'active')::integer AS active_count,
        COALESCE(EXTRACT(EPOCH FROM AVG(NOW() - created_at)) / 3600, 0)::real AS avg_age
       FROM working_memory`
    );
    const row = result.rows[0];
    return {
      count: Number(row?.count || 0),
      activeCount: Number(row?.active_count || 0),
      avgAge: Number(row?.avg_age || 0),
    };
  } catch (error) {
    logger.warn('Failed to query working_memory stats', {
      error: error instanceof Error ? error.message : String(error),
      context,
      operation: 'getWorkingMemoryStats',
    });
    return DEFAULT_WORKING;
  }
}

/**
 * Query episodic_memories table for experience stats.
 */
async function getEpisodicMemoryStats(context: AIContext): Promise<EpisodicMemoryStats> {
  try {
    const result = await queryContext(
      context,
      `SELECT
        COUNT(*)::integer AS count,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days')::integer AS recent_count,
        COALESCE(AVG(importance), 0)::real AS avg_importance
       FROM episodic_memories`
    );
    const row = result.rows[0];
    return {
      count: Number(row?.count || 0),
      recentCount: Number(row?.recent_count || 0),
      avgImportance: Number(row?.avg_importance || 0),
    };
  } catch (error) {
    logger.warn('Failed to query episodic_memories stats', {
      error: error instanceof Error ? error.message : String(error),
      context,
      operation: 'getEpisodicMemoryStats',
    });
    return DEFAULT_EPISODIC;
  }
}

/**
 * Query memory table (short-term memory) for session context stats.
 */
async function getShortTermMemoryStats(context: AIContext): Promise<ShortTermMemoryStats> {
  try {
    const result = await queryContext(
      context,
      `SELECT
        COUNT(*)::integer AS count,
        COUNT(*) FILTER (WHERE expires_at IS NOT NULL AND expires_at < NOW() + INTERVAL '24 hours')::integer AS expiring_count,
        COALESCE(AVG(relevance_score), 0)::real AS avg_relevance
       FROM memory`
    );
    const row = result.rows[0];
    return {
      count: Number(row?.count || 0),
      expiringCount: Number(row?.expiring_count || 0),
      avgRelevance: Number(row?.avg_relevance || 0),
    };
  } catch (error) {
    logger.warn('Failed to query memory (short-term) stats', {
      error: error instanceof Error ? error.message : String(error),
      context,
      operation: 'getShortTermMemoryStats',
    });
    return DEFAULT_SHORT_TERM;
  }
}

/**
 * Query long_term_memory table for persistent knowledge stats.
 */
async function getLongTermMemoryStats(context: AIContext): Promise<LongTermMemoryStats> {
  try {
    const result = await queryContext(
      context,
      `SELECT
        COUNT(*)::integer AS count,
        COALESCE(AVG(strength), 0)::real AS avg_strength,
        COUNT(*) FILTER (WHERE source = 'consolidation')::integer AS consolidated_count
       FROM long_term_memory`
    );
    const row = result.rows[0];
    return {
      count: Number(row?.count || 0),
      avgStrength: Number(row?.avg_strength || 0),
      consolidatedCount: Number(row?.consolidated_count || 0),
    };
  } catch (error) {
    logger.warn('Failed to query long_term_memory stats', {
      error: error instanceof Error ? error.message : String(error),
      context,
      operation: 'getLongTermMemoryStats',
    });
    return DEFAULT_LONG_TERM;
  }
}

// ===========================================
// Main Health Check
// ===========================================

/**
 * Get comprehensive memory health for a given context.
 * Queries all 4 memory layers in parallel and calculates a health score.
 */
export async function getMemoryHealth(context: AIContext): Promise<MemoryHealthResult> {
  const [working, episodic, shortTerm, longTerm] = await Promise.all([
    getWorkingMemoryStats(context),
    getEpisodicMemoryStats(context),
    getShortTermMemoryStats(context),
    getLongTermMemoryStats(context),
  ]);

  const totalMemories = working.count + episodic.count + shortTerm.count + longTerm.count;

  // Calculate health score:
  // 25 points for each layer that has at least one memory
  let healthScore = 0;
  if (working.count > 0) healthScore += 25;
  if (episodic.count > 0) healthScore += 25;
  if (shortTerm.count > 0) healthScore += 25;
  if (longTerm.count > 0) healthScore += 25;

  return {
    working,
    episodic,
    shortTerm,
    longTerm,
    overall: {
      totalMemories,
      healthScore,
      lastConsolidation: null, // Would come from scheduler logs
      lastDecay: null,
    },
  };
}
