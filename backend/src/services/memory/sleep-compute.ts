/**
 * Phase 63: Sleep-Time Compute Engine
 *
 * Background processing during system idle time:
 * 1. Episodic Memory Consolidation -> Long-Term Facts
 * 2. Memory Contradiction Detection + Resolution
 * 3. Working Memory Pre-Loading (time/day patterns)
 * 4. Procedural Memory Optimization (tool chain analysis)
 * 5. Entity Graph Maintenance
 */

import { AIContext, queryContext } from '../../utils/database-context';
import { logger } from '../../utils/logger';
import { getRedisClient } from '../../utils/cache';
import { v4 as uuidv4 } from 'uuid';

export interface SleepCycleResult {
  processed: number;
  insights: SleepInsight[];
  contradictionsResolved: number;
  memoryUpdates: number;
  preloadedItems: number;
  durationMs: number;
  skipped?: boolean;
}

export interface SleepInsight {
  content: string;
  confidence: number;
  source: string;
}

class SleepComputeEngine {
  /** Lock TTL for sleep cycle distributed lock (2 minutes) */
  private static readonly LOCK_TTL_MS = 120_000;

  /**
   * Acquire a Redis distributed lock using SET NX EX.
   * Returns the lock value on success, null if lock already held.
   */
  private async acquireLock(key: string, ttlMs: number): Promise<string | null> {
    const redis = getRedisClient();
    if (!redis) return uuidv4(); // No Redis = allow execution (single instance fallback)

    const lockValue = uuidv4();
    try {
      const result = await redis.set(key, lockValue, 'PX', ttlMs, 'NX');
      return result === 'OK' ? lockValue : null;
    } catch {
      return uuidv4(); // On Redis error, allow execution
    }
  }

  /**
   * Release a Redis distributed lock (only if we hold it).
   */
  private async releaseLock(key: string, lockValue: string): Promise<void> {
    const redis = getRedisClient();
    if (!redis) return;

    try {
      // Lua script for atomic compare-and-delete
      const script = `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`;
      await redis.eval(script, 1, key, lockValue);
    } catch {
      // Non-critical: lock will expire via TTL
    }
  }

  /**
   * Run a full sleep cycle for a context.
   * Called by BullMQ worker when system is idle.
   * Uses distributed lock to prevent concurrent cycles.
   */
  async runSleepCycle(context: AIContext): Promise<SleepCycleResult> {
    const lockKey = `sleep-cycle:${context}`;
    const lockValue = await this.acquireLock(lockKey, SleepComputeEngine.LOCK_TTL_MS);

    if (!lockValue) {
      logger.info(`Sleep cycle already running for ${context}, skipping`, {
        operation: 'sleep-compute',
        context,
      });
      return {
        processed: 0,
        insights: [],
        contradictionsResolved: 0,
        memoryUpdates: 0,
        preloadedItems: 0,
        durationMs: 0,
        skipped: true,
      };
    }

    const startTime = Date.now();
    const result: SleepCycleResult = {
      processed: 0,
      insights: [],
      contradictionsResolved: 0,
      memoryUpdates: 0,
      preloadedItems: 0,
      durationMs: 0,
    };

    try {
      // 1. Episodic Memory Consolidation
      const consolidation = await this.consolidateEpisodes(context);
      result.processed += consolidation.processed;
      result.insights.push(...consolidation.insights);

      // 2. Memory Contradiction Detection
      const contradictions = await this.detectAndResolveContradictions(context);
      result.contradictionsResolved = contradictions;

      // 3. Working Memory Pre-Loading
      const preloaded = await this.preloadWorkingMemory(context);
      result.preloadedItems = preloaded;

      // 4. Procedural Memory Optimization
      const procUpdates = await this.optimizeProcedures(context);
      result.memoryUpdates += procUpdates;

      // 5. Entity Graph Maintenance
      const graphUpdates = await this.maintainEntityGraph(context);
      result.memoryUpdates += graphUpdates;

      result.durationMs = Date.now() - startTime;

      // Log the cycle
      await this.logSleepCycle(context, result);

      logger.info('Sleep cycle completed', {
        operation: 'sleep-compute',
        context,
        processed: result.processed,
        insights: result.insights.length,
        contradictionsResolved: result.contradictionsResolved,
        memoryUpdates: result.memoryUpdates,
        preloadedItems: result.preloadedItems,
        durationMs: result.durationMs,
      });

      return result;
    } catch (error) {
      result.durationMs = Date.now() - startTime;
      logger.error('Sleep cycle failed', error instanceof Error ? error : undefined, {
        operation: 'sleep-compute',
        context,
      });
      return result;
    } finally {
      await this.releaseLock(lockKey, lockValue);
    }
  }

  /**
   * Consolidate recent episodic memories into long-term facts
   */
  private async consolidateEpisodes(context: AIContext): Promise<{ processed: number; insights: SleepInsight[] }> {
    const insights: SleepInsight[] = [];

    // Find recent episodic memories that haven't been consolidated
    let result;
    try {
      result = await queryContext(context, `
        SELECT id, content, context as memory_context, importance_score, created_at
        FROM episodic_memories
        WHERE consolidated = false
        ORDER BY created_at DESC
        LIMIT 50
      `, []);
    } catch {
      // Table may not exist or column missing
      return { processed: 0, insights };
    }

    if (result.rows.length === 0) {
      return { processed: 0, insights };
    }

    // Group similar episodes by content similarity (simple keyword overlap)
    const groups = this.groupSimilarEpisodes(result.rows);

    for (const group of groups) {
      if (group.length >= 2) {
        // Multiple similar episodes -> extract pattern as insight
        const insight: SleepInsight = {
          content: `Recurring pattern: ${String(group[0].content || '').substring(0, 200)}`,
          confidence: Math.min(group.length / 5, 1.0),
          source: 'episodic_consolidation',
        };
        insights.push(insight);

        // Store as long-term fact
        try {
          await queryContext(context, `
            INSERT INTO learned_facts (id, fact_type, content, confidence, source, decay_class)
            VALUES (gen_random_uuid(), 'behavior', $1, $2, 'sleep_compute',
              CASE WHEN $2 > 0.8 THEN 'slow_decay' ELSE 'normal_decay' END)
            ON CONFLICT DO NOTHING
          `, [insight.content, insight.confidence]);
        } catch {
          // Ignore duplicate facts
        }
      }
    }

    // Mark episodes as consolidated
    const ids = result.rows.map((r: Record<string, unknown>) => r.id);
    if (ids.length > 0) {
      try {
        await queryContext(context, `
          UPDATE episodic_memories SET consolidated = true WHERE id = ANY($1::uuid[])
        `, [ids]);
      } catch {
        // Column may not exist
      }
    }

    return { processed: result.rows.length, insights };
  }

  /**
   * Detect contradictory facts and resolve by recency
   */
  private async detectAndResolveContradictions(context: AIContext): Promise<number> {
    let resolved = 0;

    let result;
    try {
      result = await queryContext(context, `
        SELECT f1.id as id1, f2.id as id2,
               f1.content as content1, f2.content as content2,
               f1.confidence as conf1, f2.confidence as conf2,
               f1.last_confirmed as last1, f2.last_confirmed as last2
        FROM learned_facts f1
        JOIN learned_facts f2 ON f1.id < f2.id
        WHERE f1.confidence > 0.3 AND f2.confidence > 0.3
          AND f1.fact_type = f2.fact_type
          AND similarity(f1.content, f2.content) > 0.6
        LIMIT 20
      `, []);
    } catch {
      // similarity() requires pg_trgm; table may not exist
      return 0;
    }

    for (const row of result.rows) {
      // More recent fact wins - downgrade older fact's confidence
      const older = (row.last1 || '') < (row.last2 || '') ? 'id1' : 'id2';
      const olderId = row[older];

      try {
        await queryContext(context, `
          UPDATE learned_facts
          SET confidence = confidence * 0.5,
              decay_class = 'fast_decay'
          WHERE id = $1
        `, [olderId]);
        resolved++;
      } catch {
        // Ignore update errors
      }
    }

    return resolved;
  }

  /**
   * Pre-load working memory based on time/day patterns
   */
  private async preloadWorkingMemory(context: AIContext): Promise<number> {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const hour = now.getHours();

    let result;
    try {
      // Find facts commonly accessed
      result = await queryContext(context, `
        SELECT content, retrieval_count, last_retrieved
        FROM learned_facts
        WHERE confidence > 0.5
          AND retrieval_count > 2
        ORDER BY retrieval_count DESC, confidence DESC
        LIMIT 10
      `, []);
    } catch {
      return 0;
    }

    // Pre-compute and cache context for likely queries
    let preloaded = 0;
    for (const row of result.rows) {
      try {
        await queryContext(context, `
          INSERT INTO context_cache (id, cache_key, domain, content, token_count, expires_at)
          VALUES (gen_random_uuid(), $1, 'general', $2, $3, NOW() + INTERVAL '2 hours')
          ON CONFLICT (cache_key) DO UPDATE SET
            content = EXCLUDED.content,
            hit_count = context_cache.hit_count,
            updated_at = NOW(),
            expires_at = NOW() + INTERVAL '2 hours'
        `, [
          `preload:${context}:${dayOfWeek}:${Math.floor(hour / 4)}:fact:${row.id || preloaded}`,
          JSON.stringify({ facts: [row.content] }),
          Math.ceil(String(row.content || '').length / 4),
        ]);
        preloaded++;
      } catch {
        // Ignore cache errors
      }
    }

    return preloaded;
  }

  /**
   * Optimize procedural memories based on success patterns
   */
  private async optimizeProcedures(context: AIContext): Promise<number> {
    let updates = 0;

    let result;
    try {
      // Find procedures with low success rates
      result = await queryContext(context, `
        SELECT id, trigger_pattern, success_rate, execution_count
        FROM procedural_memories
        WHERE execution_count >= 3 AND success_rate < 0.5
        ORDER BY execution_count DESC
        LIMIT 10
      `, []);
    } catch {
      return 0;
    }

    for (const row of result.rows) {
      try {
        await queryContext(context, `
          UPDATE procedural_memories
          SET success_rate = success_rate * 0.9,
              updated_at = NOW()
          WHERE id = $1
        `, [row.id]);
        updates++;
      } catch {
        // Ignore update errors
      }
    }

    return updates;
  }

  /**
   * Maintain entity graph by identifying unindexed content
   */
  private async maintainEntityGraph(context: AIContext): Promise<number> {
    let updates = 0;

    try {
      const result = await queryContext(context, `
        SELECT i.id, i.title, i.content
        FROM ideas i
        LEFT JOIN knowledge_entities ke ON ke.source_id = i.id::text
        WHERE ke.id IS NULL
          AND i.created_at > NOW() - INTERVAL '24 hours'
          AND i.content IS NOT NULL
          AND length(i.content) > 50
        LIMIT 10
      `, []);

      updates = result.rows.length;
      // Actual entity extraction would be done by the graph indexer queue
      // Here we just count unprocessed items
    } catch {
      // knowledge_entities table may not exist yet
    }

    return updates;
  }

  /**
   * Group episodes by simple keyword overlap (Jaccard similarity)
   */
  groupSimilarEpisodes(episodes: Array<Record<string, unknown>>): Array<Array<Record<string, unknown>>> {
    const groups: Array<Array<Record<string, unknown>>> = [];
    const used = new Set<number>();

    for (let i = 0; i < episodes.length; i++) {
      if (used.has(i)) continue;
      const group = [episodes[i]];
      used.add(i);

      const words1 = new Set(
        String(episodes[i].content || '').toLowerCase().split(/\s+/).filter((w: string) => w.length > 3)
      );

      for (let j = i + 1; j < episodes.length; j++) {
        if (used.has(j)) continue;
        const words2 = new Set(
          String(episodes[j].content || '').toLowerCase().split(/\s+/).filter((w: string) => w.length > 3)
        );

        // Calculate Jaccard similarity
        let intersection = 0;
        for (const w of words1) {
          if (words2.has(w)) intersection++;
        }
        const union = words1.size + words2.size - intersection;
        const similarity = union > 0 ? intersection / union : 0;

        if (similarity > 0.3) {
          group.push(episodes[j]);
          used.add(j);
        }
      }

      groups.push(group);
    }

    return groups;
  }

  /**
   * Log sleep cycle results to DB
   */
  private async logSleepCycle(context: AIContext, result: SleepCycleResult): Promise<void> {
    try {
      await queryContext(context, `
        INSERT INTO sleep_compute_logs (id, cycle_type, processed_items, insights_generated, contradictions_resolved, memory_updates, duration_ms)
        VALUES (gen_random_uuid(), 'full_cycle', $1, $2, $3, $4, $5)
      `, [result.processed, result.insights.length, result.contradictionsResolved, result.memoryUpdates, result.durationMs]);
    } catch (error) {
      logger.warn('Failed to log sleep cycle', {
        operation: 'sleep-compute',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Check if system is idle (less than threshold requests in recent window)
   */
  async isSystemIdle(threshold = 5, windowMinutes = 10): Promise<boolean> {
    try {
      const result = await queryContext('personal', `
        SELECT COUNT(*) as cnt
        FROM general_chat_sessions
        WHERE updated_at > NOW() - make_interval(mins := $1)
      `, [windowMinutes]);
      return (parseInt(result.rows[0]?.cnt || '0', 10)) < threshold;
    } catch {
      return true; // Assume idle if we can't check
    }
  }
}

// Singleton
let instance: SleepComputeEngine | null = null;

export function getSleepComputeEngine(): SleepComputeEngine {
  if (!instance) {
    instance = new SleepComputeEngine();
  }
  return instance;
}

export function resetSleepComputeEngine(): void {
  instance = null;
}
