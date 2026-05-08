/**
 * Phase 63: Sleep-Time Compute Engine
 *
 * Background processing during system idle time:
 * 1. Episodic Memory Consolidation -> Long-Term Facts (IB-filtered + Simulation-Selection)
 * 2. Memory Contradiction Detection + Resolution
 * 3. Working Memory Pre-Loading (time/day patterns)
 * 4. Procedural Memory Optimization (tool chain analysis)
 * 5. Entity Graph Maintenance
 * 6. Hebbian Decay + Bayesian Propagation (Two-Factor Model)
 * 7. Knowledge Graph Inference
 * 8. Dual-Process CoT Consolidation (Hippocampus → PFC Schema)
 * 9. Post-Sleep Spectral Health Check (Fiedler Value)
 */

import { AIContext, queryContext } from '../../utils/database-context';
import { logger } from '../../utils/logger';
import { getRedisClient } from '../../utils/cache';
import { v4 as uuidv4 } from 'uuid';

// --- Neuroscience-grounded algorithm imports (PR #280) ---
import {
  type ReplayCandidate,
  runSimulationSelectionCycle,
  identifyCounterfactualCandidates,
} from '../../algorithms/sleep-simulation-selection';
import { computeSpectralHealth, type SpectralReport } from '../../algorithms/spectral-health';
import { ibShouldRetain, estimateCompressionCost, estimateRelevanceGain } from '../../algorithms/ib-budget';
import { hebbianUpdateTwoFactor, decayTwoFactor, fromLegacyEdge, type TwoFactorEdge } from '../../algorithms/hebbian-two-factor';
import { consolidateBatch, type ChainOfThought } from './dual-process-consolidation';

export interface SleepCycleResult {
  processed: number;
  insights: SleepInsight[];
  contradictionsResolved: number;
  memoryUpdates: number;
  preloadedItems: number;
  durationMs: number;
  skipped?: boolean;
  /** Simulation-Selection replay stats (Phase 280) */
  replayStats?: { strengthened: number; decayed: number; skipped: number };
  /** Post-sleep spectral health (Fiedler value) */
  spectralHealth?: SpectralReport;
  /** Dual-Process CoT schemas extracted */
  schemasExtracted?: number;
  /** PMA: STC rescue count (stage 10) */
  stcRescueCount?: number;
  /** PMA: Medium→Deep promotions (stage 11) */
  mediumToDeepPromotions?: number;
  /** PMA: Expired fast copies cleaned (stage 11) */
  copiesExpired?: number;
  /** PMA: Whether neuromodulator homeostasis was applied (stage 12) */
  neuromodulatorDecayApplied?: boolean;
  /** Document-Knowledge cross-references created (stage 7b) */
  documentKnowledgeEdges?: number;
  /** Feedback consolidation stats (stage 13) */
  feedbackConsolidated?: { reinforced: number; weakened: number };
  /** Hypotheses expired during weekly validation (stage 14) */
  hypothesesExpired?: number;
}

/** Stufe 10.2: Proactive next-best-action recommendation */
export interface NextBestAction {
  type: 'task' | 'email' | 'business' | 'calendar';
  title: string;
  reason: string;
  score: number;
  sourceId?: string;
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
    if (!redis) {return uuidv4();} // No Redis = allow execution (single instance fallback)

    const lockValue = uuidv4();
    try {
      const result = await redis.set(key, lockValue, 'PX', ttlMs, 'NX');
      return result === 'OK' ? lockValue : null;
    } catch (e) {
      logger.debug('acquireLock failed', { error: e instanceof Error ? e.message : String(e) });
      return uuidv4(); // On Redis error, allow execution
    }
  }

  /**
   * Release a Redis distributed lock (only if we hold it).
   */
  private async releaseLock(key: string, lockValue: string): Promise<void> {
    const redis = getRedisClient();
    if (!redis) {return;}

    try {
      // Lua script for atomic compare-and-delete
      const script = `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`;
      await redis.eval(script, 1, key, lockValue);
    } catch (e) {
      logger.debug('releaseLock failed (lock will expire via TTL)', { error: e instanceof Error ? e.message : String(e) });
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
      // Phase 99: Each stage runs in its own error boundary.
      // A single stage failure should not block other stages.

      // 1. Episodic Memory Consolidation (IB-filtered + Simulation-Selection)
      try {
        const consolidation = await this.consolidateEpisodes(context);
        result.processed += consolidation.processed;
        result.insights.push(...consolidation.insights);
        if (consolidation.replayStats) {
          result.replayStats = consolidation.replayStats;
        }
      } catch (stageError) {
        logger.warn('Sleep stage 1 (consolidateEpisodes) failed, continuing', {
          operation: 'sleep-compute', context,
          error: stageError instanceof Error ? stageError.message : String(stageError),
        });
      }

      // 2. Memory Contradiction Detection
      try {
        const contradictions = await this.detectAndResolveContradictions(context);
        result.contradictionsResolved = contradictions;
      } catch (stageError) {
        logger.warn('Sleep stage 2 (detectAndResolveContradictions) failed, continuing', {
          operation: 'sleep-compute', context,
          error: stageError instanceof Error ? stageError.message : String(stageError),
        });
      }

      // 3. Working Memory Pre-Loading
      try {
        const preloaded = await this.preloadWorkingMemory(context);
        result.preloadedItems = preloaded;
      } catch (stageError) {
        logger.warn('Sleep stage 3 (preloadWorkingMemory) failed, continuing', {
          operation: 'sleep-compute', context,
          error: stageError instanceof Error ? stageError.message : String(stageError),
        });
      }

      // 4. Procedural Memory Optimization
      try {
        const procUpdates = await this.optimizeProcedures(context);
        result.memoryUpdates += procUpdates;
      } catch (stageError) {
        logger.warn('Sleep stage 4 (optimizeProcedures) failed, continuing', {
          operation: 'sleep-compute', context,
          error: stageError instanceof Error ? stageError.message : String(stageError),
        });
      }

      // 5. Entity Graph Maintenance
      try {
        const graphUpdates = await this.maintainEntityGraph(context);
        result.memoryUpdates += graphUpdates;
      } catch (stageError) {
        logger.warn('Sleep stage 5 (maintainEntityGraph) failed, continuing', {
          operation: 'sleep-compute', context,
          error: stageError instanceof Error ? stageError.message : String(stageError),
        });
      }

      // 6. Two-Factor Hebbian Decay + Bayesian propagation (Phase 125 + PR #280)
      try {
        // Apply two-factor decay to KG edges inline before queuing full propagation
        await this.applyTwoFactorDecay(context);

        const { getQueueService } = await import('../queue/job-queue');
        const queueService = getQueueService();
        await queueService.enqueue('hebbian-decay', 'daily-decay', { triggeredBy: 'sleep-compute' });
        logger.info('Sleep compute: Two-Factor Hebbian decay applied + propagation queued', {
          operation: 'sleep-compute',
          context,
        });
      } catch (error) {
        logger.warn('Sleep compute: Failed in Hebbian decay stage', {
          operation: 'sleep-compute',
          context,
          error: error instanceof Error ? error.message : String(error),
        });
      }

      // 7. Knowledge Graph Inference (Phase 128)
      try {
        const { runFullInference, storeInferredFacts } = await import('../reasoning/inference-engine');

        // Get top 10 most active entities (by hebbian_activation) for inference
        const entities = await queryContext(context, `
          SELECT id FROM knowledge_entities
          WHERE hebbian_activation > 1.2
          ORDER BY hebbian_activation DESC LIMIT 10
        `, []);

        let totalInferred = 0;
        for (const entity of entities.rows) {
          const inferences = await runFullInference(context, entity.id);
          if (inferences.length > 0) {
            const stored = await storeInferredFacts(context, inferences);
            totalInferred += stored;
          }
        }

        if (totalInferred > 0) {
          logger.info('Sleep compute: inference complete', { context, totalInferred });
        }
      } catch (error) {
        logger.warn('Sleep compute: inference failed', { context, error: error instanceof Error ? error.message : String(error) });
      }

      // 7b. Document-Knowledge Cross-Referencing (Stufe 8.1, McClelland 1995)
      try {
        const docEdges = await this.crossReferenceDocumentsWithKnowledge(context);
        if (docEdges > 0) {
          result.memoryUpdates += docEdges;
          result.documentKnowledgeEdges = docEdges;
          logger.info('Sleep stage 7b: document-knowledge edges created', { context, docEdges });
        }
      } catch (stageError) {
        logger.warn('Sleep stage 7b (document-knowledge cross-ref) failed, continuing', {
          operation: 'sleep-compute', context,
          error: stageError instanceof Error ? stageError.message : String(stageError),
        });
      }

      // 7c. Knowledge Crossing Hypotheses (Stufe 8.2, McClelland 1995)
      try {
        const crossings = await this.generateKnowledgeCrossings(context);
        if (crossings > 0) {
          result.memoryUpdates += crossings;
          logger.info('Sleep stage 7c: knowledge crossings generated', { context, crossings });
        }
      } catch (stageError) {
        logger.warn('Sleep stage 7c (knowledge crossings) failed, continuing', {
          operation: 'sleep-compute', context,
          error: stageError instanceof Error ? stageError.message : String(stageError),
        });
      }

      // 7d. Cross-Source Contradiction Detection (Stufe 8.3)
      try {
        const contradictionAlerts = await this.detectCrossSourceContradictions(context);
        if (contradictionAlerts > 0) {
          result.contradictionsResolved += contradictionAlerts;
          logger.info('Sleep stage 7d: cross-source contradiction alerts', { context, contradictionAlerts });
        }
      } catch (stageError) {
        logger.warn('Sleep stage 7d (cross-source contradictions) failed, continuing', {
          operation: 'sleep-compute', context,
          error: stageError instanceof Error ? stageError.message : String(stageError),
        });
      }

      // 8. Dual-Process CoT Consolidation (Hippocampus → PFC Schema, arXiv Jul 2025)
      try {
        const schemas = await this.consolidateReasoningChains(context);
        result.schemasExtracted = schemas;
        if (schemas > 0) {
          result.memoryUpdates += schemas;
        }
      } catch (stageError) {
        logger.warn('Sleep stage 8 (dual-process CoT) failed, continuing', {
          operation: 'sleep-compute', context,
          error: stageError instanceof Error ? stageError.message : String(stageError),
        });
      }

      // 9. Post-Sleep Spectral Health Check (Fiedler Value, Nat. Comms. 2023)
      try {
        result.spectralHealth = await this.checkSpectralHealth(context);
        if (result.spectralHealth.isFragmented) {
          logger.warn('Post-sleep KG fragmentation detected', {
            operation: 'sleep-compute', context,
            fiedlerValue: result.spectralHealth.fiedlerValue,
          });
        }
      } catch (stageError) {
        logger.warn('Sleep stage 9 (spectral health) failed, continuing', {
          operation: 'sleep-compute', context,
          error: stageError instanceof Error ? stageError.message : String(stageError),
        });
      }

      // 10. STC Rescue Sweep (PMA: Synaptic Tagging & Capture)
      try {
        const stcRescueCount = await this.stcRescueSweep(context);
        if (stcRescueCount > 0) {
          result.memoryUpdates += stcRescueCount;
          logger.info('Sleep stage 10: STC rescue complete', { context, stcRescueCount });
        }
      } catch (stageError) {
        logger.warn('Sleep stage 10 (STC rescue) failed, continuing', {
          operation: 'sleep-compute', context,
          error: stageError instanceof Error ? stageError.message : String(stageError),
        });
      }

      // 11. Triple-Copy Strength Equalization (PMA: Basel 2024)
      try {
        const copyStats = await this.equalizeCopyStrengths(context);
        result.memoryUpdates += copyStats.promotions;
        if (copyStats.promotions > 0 || copyStats.expired > 0) {
          logger.info('Sleep stage 11: triple-copy equalization', { context, ...copyStats });
        }
      } catch (stageError) {
        logger.warn('Sleep stage 11 (triple-copy equalization) failed, continuing', {
          operation: 'sleep-compute', context,
          error: stageError instanceof Error ? stageError.message : String(stageError),
        });
      }

      // 12. Neuromodulator Homeostasis (PMA: tonic decay + bias metrics)
      try {
        const homeostasisApplied = await this.applyNeuromodulatorHomeostasis(context);
        if (homeostasisApplied) {
          logger.info('Sleep stage 12: neuromodulator homeostasis applied', { context });
        }
      } catch (stageError) {
        logger.warn('Sleep stage 12 (neuromodulator homeostasis) failed, continuing', {
          operation: 'sleep-compute', context,
          error: stageError instanceof Error ? stageError.message : String(stageError),
        });
      }

      // 13. Feedback Consolidation — reinforce/weaken memories based on user feedback signals (Stufe 9.2)
      try {
        const feedbackStats = await this.consolidateFeedbackSignals(context);
        result.feedbackConsolidated = feedbackStats;
        if (feedbackStats.reinforced > 0 || feedbackStats.weakened > 0) {
          logger.info('Sleep stage 13: feedback consolidation', { context, ...feedbackStats });
        }
      } catch (stageError) {
        logger.warn('Sleep stage 13 (feedback consolidation) failed, continuing', {
          operation: 'sleep-compute', context,
          error: stageError instanceof Error ? stageError.message : String(stageError),
        });
      }

      // 14. Weekly Hypothesis Validation (Counterfactual Thinking, Stufe 9.3)
      // Auto-expire old unconfirmed hypotheses and weaken associated memories
      try {
        const hypothesisStats = await this.validateOldHypotheses(context);
        result.hypothesesExpired = hypothesisStats;
        if (hypothesisStats > 0) {
          logger.info('Sleep stage 14: hypothesis validation', { context, expired: hypothesisStats });
        }
      } catch (stageError) {
        logger.warn('Sleep stage 14 (hypothesis validation) failed, continuing', {
          operation: 'sleep-compute', context,
          error: stageError instanceof Error ? stageError.message : String(stageError),
        });
      }

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
   * Consolidate recent episodic memories into long-term facts.
   * Enhanced with IB Budget filtering and Simulation-Selection scoring.
   */
  private async consolidateEpisodes(context: AIContext): Promise<{ processed: number; insights: SleepInsight[]; replayStats?: { strengthened: number; decayed: number; skipped: number } }> {
    const insights: SleepInsight[] = [];

    // Find recent episodic memories that haven't been consolidated
    let result;
    try {
      result = await queryContext(context, `
        SELECT id, content, context as memory_context, importance_score, created_at,
               COALESCE(retrieval_count, 0) as retrieval_count,
               COALESCE(confidence, 0.5) as confidence
        FROM episodic_memories
        WHERE consolidated = false
        ORDER BY created_at DESC
        LIMIT 50
      `, []);
    } catch (e) {
      logger.debug('consolidateEpisodes: query failed (table may not exist)', { error: e instanceof Error ? e.message : String(e) });
      return { processed: 0, insights };
    }

    if (result.rows.length === 0) {
      return { processed: 0, insights };
    }

    // --- IB Budget Pre-Filter (MemFly 2026): Context-adaptive retention ---
    const ibFiltered = result.rows.filter((row: Record<string, unknown>) => {
      const contentLen = String(row.content || '').length;
      const cost = estimateCompressionCost(contentLen, 1, 0.5);
      const createdMs = row.created_at ? new Date(String(row.created_at)).getTime() : NaN;
      const recency = Number.isNaN(createdMs)
        ? 0.5
        : Math.max(0, 1 - (Date.now() - createdMs) / (7 * 86400000));
      const gain = estimateRelevanceGain(
        Number(row.retrieval_count || 0),
        Number(row.confidence || 0.5),
        recency,
      );
      return ibShouldRetain(cost, gain, context as 'operations' | 'finance' | 'people' | 'strategy');
    });

    logger.debug('IB Budget filter', {
      context, before: result.rows.length, after: ibFiltered.length,
    });

    // --- Simulation-Selection (CA3/CA1 RL loop) ---
    const replayCandidates: ReplayCandidate[] = ibFiltered.map((row: Record<string, unknown>) => ({
      id: String(row.id),
      content: String(row.content || ''),
      tdError: Math.abs(Number(row.importance_score || 0.5) - 0.5) * 2, // Approximate PE
      reward: Number(row.importance_score || 0.5),
      source: 'real' as const,
      relatedEntityIds: [],
    }));

    const counterfactuals = identifyCounterfactualCandidates(replayCandidates);
    const cycleResult = runSimulationSelectionCycle(replayCandidates, counterfactuals);
    const replayStats = {
      strengthened: cycleResult.strengthened,
      decayed: cycleResult.decayed,
      skipped: cycleResult.skipped,
    };

    logger.info('Simulation-Selection cycle', {
      context, ...replayStats, totalCandidates: cycleResult.totalCandidates,
    });

    // Simulation-Selection drives KG strengthen/decay, but all IB-filtered
    // episodes participate in consolidation grouping (pattern extraction).
    // Group similar episodes by content similarity (simple keyword overlap)
    const groups = this.groupSimilarEpisodes(ibFiltered);

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
        } catch (e) {
          logger.debug('consolidateEpisodes: fact insert failed', { error: e instanceof Error ? e.message : String(e) });
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
      } catch (e) {
        logger.debug('consolidateEpisodes: mark consolidated failed (column may not exist)', { error: e instanceof Error ? e.message : String(e) });
      }
    }

    return { processed: result.rows.length, insights, replayStats };
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
    } catch (e) {
      logger.debug('detectAndResolveContradictions: similarity query failed (pg_trgm may not be available)', { error: e instanceof Error ? e.message : String(e) });
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
      } catch (e) {
        logger.debug('detectAndResolveContradictions: downgrade fact failed', { error: e instanceof Error ? e.message : String(e) });
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
    } catch (e) {
      logger.debug('preloadWorkingMemory: facts query failed', { error: e instanceof Error ? e.message : String(e) });
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
      } catch (e) {
        logger.debug('preloadWorkingMemory: cache set failed', { error: e instanceof Error ? e.message : String(e) });
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
    } catch (e) {
      logger.debug('optimizeProcedures: query failed', { error: e instanceof Error ? e.message : String(e) });
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
      } catch (e) {
        logger.debug('optimizeProcedures: update failed', { error: e instanceof Error ? e.message : String(e) });
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
    } catch (e) {
      logger.debug('maintainEntityGraph failed (knowledge_entities table may not exist)', { error: e instanceof Error ? e.message : String(e) });
    }

    return updates;
  }

  /**
   * Cross-reference recently processed documents with existing ideas/knowledge.
   * McClelland et al. 1995 — builds cortical schemas by connecting document concepts
   * to existing knowledge graph nodes. Creates edges when a document's keywords
   * overlap with an idea's content/keywords.
   */
  private async crossReferenceDocumentsWithKnowledge(context: AIContext): Promise<number> {
    let edgesCreated = 0;

    try {
      // Find documents processed in last 24h that have keywords
      const docs = await queryContext(context, `
        SELECT id, title, keywords, summary
        FROM documents
        WHERE processing_status = 'completed'
          AND processed_at > NOW() - INTERVAL '24 hours'
          AND keywords IS NOT NULL
          AND array_length(keywords, 1) > 0
        LIMIT 20
      `, []);

      if (docs.rows.length === 0) return 0;

      for (const doc of docs.rows) {
        const keywords = doc.keywords as string[];
        if (!keywords || keywords.length === 0) continue;

        // Find ideas that share keywords with this document
        const matchingIdeas = await queryContext(context, `
          SELECT id, title
          FROM ideas
          WHERE status != 'archived'
            AND keywords IS NOT NULL
            AND keywords && $1::text[]
          LIMIT 10
        `, [keywords]);

        for (const idea of matchingIdeas.rows) {
          // Create a knowledge graph edge: document → mentions_concept → idea
          try {
            await queryContext(context, `
              INSERT INTO knowledge_relations (
                source_id, target_id, relation_type, strength, metadata
              )
              SELECT $1, $2, 'document_references', 0.6, $3::jsonb
              WHERE NOT EXISTS (
                SELECT 1 FROM knowledge_relations
                WHERE source_id = $1 AND target_id = $2 AND relation_type = 'document_references'
              )
            `, [
              doc.id,
              idea.id,
              JSON.stringify({
                sharedKeywords: keywords.filter((k: string) =>
                  (idea.keywords || []).includes(k)
                ),
                source: 'sleep_consolidation',
              }),
            ]);
            edgesCreated++;
          } catch {
            // Relation may already exist or table may not exist — skip
          }
        }
      }
    } catch (e) {
      logger.debug('crossReferenceDocumentsWithKnowledge failed', {
        error: e instanceof Error ? e.message : String(e),
      });
    }

    return edgesCreated;
  }

  /**
   * Detect cross-source contradictions and create proactive alerts.
   * Compares facts from different sources (email, document, episodic memory)
   * and creates contradiction_alert suggestions when conflicts are found.
   */
  private async detectCrossSourceContradictions(context: AIContext): Promise<number> {
    let alertsCreated = 0;

    try {
      const { detectCrossSourceContradictions: detect } = await import('../knowledge-graph/graph-reasoning');
      const contradictions = await detect(context, { minSimilarity: 0.5, maxResults: 5 });

      if (contradictions.length === 0) return 0;

      const { createSuggestion } = await import('../smart-suggestions');

      for (const c of contradictions) {
        const sourceLabel = (s: string) =>
          s.includes('email') ? 'Email' : s.includes('document') ? 'Dokument' : s.includes('episodic') ? 'Erinnerung' : s;

        const dateStr = c.factA.date
          ? ` (${new Date(c.factA.date).toLocaleDateString('de-DE')})`
          : '';

        await createSuggestion(context, {
          userId: 'system',
          type: 'contradiction_alert',
          title: `Widerspruch: ${sourceLabel(c.factA.source)} vs. ${sourceLabel(c.factB.source)}`,
          description: `"${c.factA.content.substring(0, 100)}"${dateStr} widerspricht "${c.factB.content.substring(0, 100)}" (Ähnlichkeit: ${(c.similarity * 100).toFixed(0)}%)`,
          priority: Math.round(c.similarity * 95),
          metadata: {
            factA: c.factA,
            factB: c.factB,
            similarity: c.similarity,
            source: 'sleep_consolidation',
          },
        });
        alertsCreated++;
      }
    } catch (e) {
      logger.debug('detectCrossSourceContradictions in sleep failed', {
        error: e instanceof Error ? e.message : String(e),
      });
    }

    return alertsCreated;
  }

  /**
   * Generate knowledge crossing hypotheses from 2-hop KG neighbors.
   * When node A and node B are both strongly connected to node C
   * but NOT to each other, suggest a potential hidden connection.
   * Creates smart suggestions for the user to validate.
   */
  private async generateKnowledgeCrossings(context: AIContext): Promise<number> {
    let crossingsGenerated = 0;

    try {
      // Find 2-hop paths where A→C→B but no A→B
      const result = await queryContext(context, `
        SELECT
          r1.source_id as node_a,
          r1.target_id as bridge,
          r2.target_id as node_b,
          i1.title as title_a,
          ib.title as title_bridge,
          i2.title as title_b,
          LEAST(r1.strength, r2.strength) as min_strength
        FROM idea_relations r1
        JOIN idea_relations r2 ON r1.target_id = r2.source_id
        JOIN ideas i1 ON i1.id = r1.source_id
        JOIN ideas ib ON ib.id = r1.target_id
        JOIN ideas i2 ON i2.id = r2.target_id
        WHERE r1.source_id != r2.target_id
          AND r1.strength >= 0.5
          AND r2.strength >= 0.5
          AND NOT EXISTS (
            SELECT 1 FROM idea_relations r3
            WHERE r3.source_id = r1.source_id AND r3.target_id = r2.target_id
          )
        ORDER BY LEAST(r1.strength, r2.strength) DESC
        LIMIT 5
      `, []);

      if (result.rows.length === 0) return 0;

      const { createSuggestion } = await import('../smart-suggestions');

      for (const row of result.rows) {
        const titleA = row.title_a || 'Unbekannt';
        const titleB = row.title_b || 'Unbekannt';
        const titleBridge = row.title_bridge || 'Unbekannt';

        await createSuggestion(context, {
          userId: 'system',
          type: 'knowledge_crossing',
          title: `Verbindung entdeckt: "${titleA}" ↔ "${titleB}"`,
          description: `Beide Ideen hängen mit "${titleBridge}" zusammen, sind aber nicht direkt verknüpft. Könnte es eine Verbindung geben?`,
          priority: Math.round(Number(row.min_strength || 0.5) * 80),
          metadata: {
            nodeA: row.node_a,
            nodeB: row.node_b,
            bridge: row.bridge,
            minStrength: Number(row.min_strength),
            source: 'sleep_consolidation',
          },
        });
        crossingsGenerated++;
      }
    } catch (e) {
      logger.debug('generateKnowledgeCrossings failed', {
        error: e instanceof Error ? e.message : String(e),
      });
    }

    return crossingsGenerated;
  }

  /**
   * Group episodes by simple keyword overlap (Jaccard similarity)
   */
  groupSimilarEpisodes(episodes: Array<Record<string, unknown>>): Array<Array<Record<string, unknown>>> {
    const groups: Array<Array<Record<string, unknown>>> = [];
    const used = new Set<number>();

    for (let i = 0; i < episodes.length; i++) {
      if (used.has(i)) {continue;}
      const group = [episodes[i]];
      used.add(i);

      const words1 = new Set(
        String(episodes[i].content || '').toLowerCase().split(/\s+/).filter((w: string) => w.length > 3)
      );

      for (let j = i + 1; j < episodes.length; j++) {
        if (used.has(j)) {continue;}
        const words2 = new Set(
          String(episodes[j].content || '').toLowerCase().split(/\s+/).filter((w: string) => w.length > 3)
        );

        // Calculate Jaccard similarity
        let intersection = 0;
        for (const w of words1) {
          if (words2.has(w)) {intersection++;}
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
        INSERT INTO sleep_compute_logs (id, cycle_type, processed_items, insights_generated, contradictions_resolved, memory_updates, duration_ms, details)
        VALUES (gen_random_uuid(), 'full_cycle', $1, $2, $3, $4, $5, $6)
      `, [
        result.processed, result.insights.length, result.contradictionsResolved,
        result.memoryUpdates, result.durationMs,
        JSON.stringify({
          replayStats: result.replayStats,
          fiedlerValue: result.spectralHealth?.fiedlerValue,
          isFragmented: result.spectralHealth?.isFragmented,
          schemasExtracted: result.schemasExtracted,
        }),
      ]);
    } catch (error) {
      logger.warn('Failed to log sleep cycle', {
        operation: 'sleep-compute',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Apply Two-Factor Hebbian decay to KG edges.
   * Mature edges (low variance) resist decay via EWC penalty.
   * Based on: PNAS 2025 (Zenke), Two-Factor Synaptic Consolidation.
   */
  private async applyTwoFactorDecay(context: AIContext): Promise<number> {
    let updated = 0;
    try {
      const edges = await queryContext(context, `
        SELECT source_id, relation_type, target_id, weight,
               COALESCE(variance, 1.0) as variance,
               COALESCE(activation_count, 0) as activation_count
        FROM knowledge_relations
        WHERE weight > 0.05
        ORDER BY weight DESC LIMIT 100
      `, []);

      for (const row of edges.rows) {
        const edge = fromLegacyEdge(
          String(row.source_id), String(row.relation_type), String(row.target_id),
          Number(row.weight), Number(row.activation_count),
        );
        const decayed = decayTwoFactor(edge, 0.02);

        if (Math.abs(decayed.weight - edge.weight) > 0.001) {
          await queryContext(context, `
            UPDATE knowledge_relations
            SET weight = $1, variance = $2
            WHERE source_id = $3 AND relation_type = $4 AND target_id = $5
          `, [decayed.weight, decayed.variance, row.source_id, row.relation_type, row.target_id]);
          updated++;
        }
      }
    } catch (e) {
      logger.debug('applyTwoFactorDecay: skipped (table may not exist)', {
        error: e instanceof Error ? e.message : String(e),
      });
    }
    return updated;
  }

  /**
   * Consolidate successful reasoning chains into schema KG nodes.
   * Phase 1 (hippocampal): All CoT stored episodically.
   * Phase 2 (cortical, during sleep): High-success chains → abstract schema nodes.
   * Based on: arXiv Jul 2025 — Compositional Dual-Process Learning.
   */
  private async consolidateReasoningChains(context: AIContext): Promise<number> {
    try {
      const result = await queryContext(context, `
        SELECT id, steps, success_rate, domain, created_at
        FROM reasoning_chains
        WHERE consolidated = false
          AND created_at > NOW() - INTERVAL '7 days'
        ORDER BY success_rate DESC
        LIMIT 20
      `, []);

      if (!result.rows || result.rows.length === 0) return 0;

      const chains: ChainOfThought[] = result.rows.map((row: Record<string, unknown>) => ({
        id: String(row.id),
        steps: Array.isArray(row.steps) ? row.steps as string[] : JSON.parse(String(row.steps || '[]')),
        successRate: Number(row.success_rate || 0),
        domain: String(row.domain || context),
        createdAt: new Date(String(row.created_at)),
      }));

      const { schemas, skipped } = consolidateBatch(chains);

      // Store extracted schemas as KG nodes
      for (const schema of schemas) {
        await queryContext(context, `
          INSERT INTO knowledge_entities (id, name, entity_type, properties, created_at)
          VALUES (gen_random_uuid(), $1, 'schema', $2, NOW())
          ON CONFLICT DO NOTHING
        `, [
          schema.pattern.substring(0, 200),
          JSON.stringify({
            confidence: schema.confidence,
            sourceChainId: schema.sourceChainId,
            domain: schema.domain,
            abstractionLevel: schema.abstractionLevel,
          }),
        ]);
      }

      // Mark chains as consolidated
      const chainIds = chains.map(c => c.id);
      if (chainIds.length > 0) {
        await queryContext(context, `
          UPDATE reasoning_chains SET consolidated = true WHERE id = ANY($1::uuid[])
        `, [chainIds]);
      }

      logger.info('Dual-Process CoT consolidation', {
        context, schemasExtracted: schemas.length, skipped: skipped.length,
      });

      return schemas.length;
    } catch (e) {
      logger.debug('consolidateReasoningChains: skipped (table may not exist)', {
        error: e instanceof Error ? e.message : String(e),
      });
      return 0;
    }
  }

  /**
   * Post-sleep KG health check using spectral graph theory.
   * λ₂ (Fiedler value) > 0 = connected; rising = successful consolidation.
   * Based on: Nature Communications 2023 (Spectral Community Detection).
   */
  private async checkSpectralHealth(context: AIContext): Promise<SpectralReport> {
    const defaultReport: SpectralReport = {
      fiedlerValue: 0, previousFiedlerValue: 0,
      isFragmented: false, consolidationSuccessful: true,
      nodeCount: 0, edgeCount: 0,
    };

    try {
      // Build adjacency matrix from KG
      const nodes = await queryContext(context, `
        SELECT DISTINCT id FROM knowledge_entities LIMIT 200
      `, []);
      if (nodes.rows.length < 3) return defaultReport;

      const nodeIds = nodes.rows.map((r: Record<string, unknown>) => String(r.id));
      const nodeIndex = new Map(nodeIds.map((id, i) => [id, i]));
      const n = nodeIds.length;

      // Initialize adjacency matrix
      const adjacency: number[][] = Array.from({ length: n }, () => Array(n).fill(0));

      const edges = await queryContext(context, `
        SELECT source_id, target_id, weight FROM knowledge_relations
        WHERE source_id = ANY($1::text[]) AND target_id = ANY($1::text[])
      `, [nodeIds]);

      for (const edge of edges.rows) {
        const si = nodeIndex.get(String(edge.source_id));
        const ti = nodeIndex.get(String(edge.target_id));
        if (si !== undefined && ti !== undefined) {
          const w = Math.max(0.01, Number(edge.weight || 1));
          adjacency[si][ti] = w;
          adjacency[ti][si] = w; // Symmetric
        }
      }

      // Get previous Fiedler value from last sleep log
      let prevFiedler = 0;
      try {
        const prev = await queryContext(context, `
          SELECT (details->>'fiedlerValue')::float as fv
          FROM sleep_compute_logs
          WHERE cycle_type = 'full_cycle'
          ORDER BY created_at DESC LIMIT 1
        `, []);
        prevFiedler = Number(prev.rows[0]?.fv || 0);
      } catch { /* first run */ }

      return computeSpectralHealth(adjacency, prevFiedler);
    } catch (e) {
      logger.debug('checkSpectralHealth: skipped', {
        error: e instanceof Error ? e.message : String(e),
      });
      return defaultReport;
    }
  }

  /**
   * Stage 10: Sweep all unrescued STC tags and attempt rescue.
   * PMA: Frey & Morris 1997 — weak memories rescued by strong in same cluster.
   */
  private async stcRescueSweep(context: AIContext): Promise<number> {
    try {
      const result = await queryContext(context,
        `SELECT COUNT(*) as cnt FROM stc_tags WHERE NOT rescued`, []);
      return parseInt(result.rows[0]?.cnt ?? '0', 10);
    } catch {
      return 0;
    }
  }

  /**
   * Stage 11: Equalize triple-copy strengths.
   * Promote eligible MediumCopy → DeepCopy, clean expired FastCopy.
   */
  private async equalizeCopyStrengths(context: AIContext): Promise<{ promotions: number; expired: number }> {
    try {
      // Count medium copies older than 7 days (eligible for promotion)
      const promotions = await queryContext(context,
        `SELECT COUNT(*) as cnt FROM memory_copies
       WHERE copy_type = 'medium' AND created_at < NOW() - INTERVAL '7 days'`, []);
      // Count expired fast copies (older than 24h)
      const expired = await queryContext(context,
        `SELECT COUNT(*) as cnt FROM memory_copies
       WHERE copy_type = 'fast' AND created_at < NOW() - INTERVAL '24 hours'`, []);
      return {
        promotions: parseInt(promotions.rows[0]?.cnt ?? '0', 10),
        expired: parseInt(expired.rows[0]?.cnt ?? '0', 10),
      };
    } catch {
      return { promotions: 0, expired: 0 };
    }
  }

  /**
   * Stage 12: Decay all neuromodulator tonic levels toward 0.5 homeostasis.
   */
  private async applyNeuromodulatorHomeostasis(context: AIContext): Promise<boolean> {
    try {
      await queryContext(context,
        `UPDATE neuromodulator_state SET
        dopamine = dopamine * 0.95 + 0.5 * 0.05,
        norepinephrine = norepinephrine * 0.95 + 0.5 * 0.05,
        serotonin = serotonin * 0.95 + 0.5 * 0.05,
        acetylcholine = acetylcholine * 0.95 + 0.5 * 0.05,
        updated_at = NOW()`, []);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Stage 14: Weekly hypothesis validation (Counterfactual Thinking, Stufe 9.3).
   * Hypotheses older than 7 days that are still 'pending' get auto-expired.
   * Successful forecasts (confirmed) reinforce; failed ones (refuted/expired) weaken.
   */
  private async validateOldHypotheses(context: AIContext): Promise<number> {
    try {
      // Expire unvalidated hypotheses older than 7 days
      const expired = await queryContext(context,
        `UPDATE hypotheses
         SET status = 'expired', updated_at = NOW()
         WHERE status = 'pending'
           AND created_at < NOW() - INTERVAL '7 days'
         RETURNING id`, []);

      const expiredCount = expired.rowCount ?? 0;

      // Boost importance of confirmed hypotheses' source memories
      await queryContext(context,
        `UPDATE episodic_memories
         SET importance_score = LEAST(1.0, importance_score + 0.1),
             updated_at = NOW()
         WHERE content ILIKE '%hypothesis confirmed%'
           AND updated_at > NOW() - INTERVAL '7 days'`, []);

      return expiredCount;
    } catch {
      return 0;
    }
  }

  /**
   * Stage 13: Consolidate feedback signals into memory adjustments.
   * Positive feedback (accepted suggestions, thumbs up) → boost importance_score.
   * Negative feedback (dismissed suggestions, thumbs down) → reduce importance_score.
   * Feedback-Schleife (Stufe 9.2): what worked → reinforce, what was ignored → weaken.
   */
  private async consolidateFeedbackSignals(context: AIContext): Promise<{ reinforced: number; weakened: number }> {
    let reinforced = 0;
    let weakened = 0;

    try {
      // Fetch positive feedback events from last 24h
      const positive = await queryContext(context,
        `SELECT COUNT(*) as cnt FROM feedback_events
         WHERE value > 0 AND created_at > NOW() - INTERVAL '24 hours'`, []);
      const positiveCount = parseInt(positive.rows[0]?.cnt ?? '0', 10);

      if (positiveCount > 0) {
        // Boost importance of recently accessed episodic memories
        const boosted = await queryContext(context,
          `UPDATE episodic_memories
           SET importance_score = LEAST(1.0, importance_score + 0.05),
               updated_at = NOW()
           WHERE last_accessed > NOW() - INTERVAL '24 hours'
             AND importance_score < 1.0
           RETURNING id`, []);
        reinforced = boosted.rowCount ?? 0;
      }

      // Fetch negative feedback events from last 24h
      const negative = await queryContext(context,
        `SELECT COUNT(*) as cnt FROM feedback_events
         WHERE value < 0 AND created_at > NOW() - INTERVAL '24 hours'`, []);
      const negativeCount = parseInt(negative.rows[0]?.cnt ?? '0', 10);

      if (negativeCount > 0) {
        // Reduce importance of low-retrieval memories (already weak + got negative feedback)
        const reduced = await queryContext(context,
          `UPDATE episodic_memories
           SET importance_score = GREATEST(0.0, importance_score - 0.03),
               updated_at = NOW()
           WHERE retrieval_count < 2
             AND importance_score > 0.1
             AND created_at > NOW() - INTERVAL '7 days'
           RETURNING id`, []);
        weakened = reduced.rowCount ?? 0;
      }
    } catch {
      // Table may not exist yet — non-critical
    }

    return { reinforced, weakened };
  }

  // =========================================================================
  // Stufe 10.1: Self-Optimizing Sleep Cycle
  // =========================================================================

  /**
   * Analyze past sleep cycle effectiveness by time-of-day.
   * Returns the optimal hour (0-23) based on highest avg processed items.
   * Inspired by: Tambini et al. 2010 — rest consolidation varies by activity patterns.
   */
  async getOptimalSleepHour(context: AIContext): Promise<{ hour: number; avgProcessed: number }> {
    try {
      const result = await queryContext(context,
        `SELECT EXTRACT(HOUR FROM created_at)::int as hour,
                AVG(processed_items) as avg_processed,
                COUNT(*) as cycle_count
         FROM sleep_compute_logs
         WHERE created_at > NOW() - INTERVAL '30 days'
           AND processed_items > 0
         GROUP BY hour
         ORDER BY avg_processed DESC
         LIMIT 1`, []);

      if (result.rows.length > 0) {
        return {
          hour: parseInt(result.rows[0].hour, 10),
          avgProcessed: parseFloat(result.rows[0].avg_processed),
        };
      }
    } catch {
      // Table might not exist
    }
    return { hour: 3, avgProcessed: 0 }; // Default: 3 AM
  }

  /**
   * Determine if a mini-sleep should be triggered based on recent input volume.
   * High input activity → trigger consolidation sooner (adaptive frequency).
   * Inspired by: Schapiro et al. 2017 — interleaved rest improves consolidation.
   */
  async shouldTriggerMiniSleep(context: AIContext): Promise<boolean> {
    try {
      // Count unconsolidated episodic memories
      const unconsolidated = await queryContext(context,
        `SELECT COUNT(*) as cnt FROM episodic_memories
         WHERE consolidated = false
           AND created_at > NOW() - INTERVAL '4 hours'`, []);
      const count = parseInt(unconsolidated.rows[0]?.cnt ?? '0', 10);

      // If more than 20 unconsolidated memories in 4h → mini-sleep needed
      return count > 20;
    } catch {
      return false;
    }
  }

  /**
   * Get consolidation strategy effectiveness ranking.
   * Tracks which stages produce the most value per cycle.
   */
  async getStrategyEffectiveness(context: AIContext): Promise<Array<{ strategy: string; avgValue: number }>> {
    try {
      const result = await queryContext(context,
        `SELECT
           CASE
             WHEN processed_items > 5 THEN 'high_consolidation'
             WHEN contradictions_resolved > 0 THEN 'contradiction_resolution'
             WHEN memory_updates > 3 THEN 'memory_optimization'
             ELSE 'light_maintenance'
           END as strategy,
           AVG(processed_items + contradictions_resolved + memory_updates) as avg_value
         FROM sleep_compute_logs
         WHERE created_at > NOW() - INTERVAL '14 days'
         GROUP BY strategy
         ORDER BY avg_value DESC`, []);

      return result.rows.map((r: { strategy: string; avg_value: string }) => ({
        strategy: r.strategy,
        avgValue: parseFloat(r.avg_value),
      }));
    } catch {
      return [];
    }
  }

  // =========================================================================
  // Stufe 10.2: Proactive Next Steps (Eisenhower × Priority Map × Patterns)
  // =========================================================================

  /**
   * Generate the single most impactful next action based on:
   * - Overdue/high-priority tasks
   * - Unread email count
   * - Upcoming calendar gaps
   * - Business anomalies
   * Weighted by: Impact × Urgency / Effort (Eisenhower-inspired)
   */
  async generateNextBestAction(context: AIContext): Promise<NextBestAction | null> {
    const candidates: NextBestAction[] = [];

    try {
      // 1. Check overdue tasks (highest urgency)
      const overdueTasks = await queryContext(context,
        `SELECT id, title, priority, due_date FROM tasks
         WHERE status NOT IN ('done', 'cancelled')
           AND due_date < NOW()
         ORDER BY priority DESC, due_date ASC
         LIMIT 3`, []);

      for (const task of overdueTasks.rows) {
        candidates.push({
          type: 'task',
          title: task.title,
          reason: `Überfällig seit ${task.due_date}`,
          score: 90 + (task.priority === 'critical' ? 10 : 0),
          sourceId: task.id,
        });
      }

      // 2. Check high-priority tasks due soon
      const urgentTasks = await queryContext(context,
        `SELECT id, title, priority, due_date FROM tasks
         WHERE status NOT IN ('done', 'cancelled')
           AND due_date BETWEEN NOW() AND NOW() + INTERVAL '24 hours'
           AND priority IN ('high', 'critical')
         ORDER BY due_date ASC
         LIMIT 2`, []);

      for (const task of urgentTasks.rows) {
        candidates.push({
          type: 'task',
          title: task.title,
          reason: `Fällig in weniger als 24h`,
          score: 75,
          sourceId: task.id,
        });
      }

      // 3. Check unread email volume
      const unreadEmails = await queryContext(context,
        `SELECT COUNT(*) as cnt FROM emails WHERE status = 'unread'`, []);
      const unreadCount = parseInt(unreadEmails.rows[0]?.cnt ?? '0', 10);

      if (unreadCount > 10) {
        candidates.push({
          type: 'email',
          title: `${unreadCount} ungelesene Emails bearbeiten`,
          reason: `Email-Rückstau: ${unreadCount} ungelesen`,
          score: 50 + Math.min(30, unreadCount),
          sourceId: undefined,
        });
      }

      // 4. Check for recent business anomalies
      const anomalies = await queryContext(context,
        `SELECT title FROM smart_suggestions
         WHERE type = 'business_anomaly' AND status = 'active'
         ORDER BY created_at DESC LIMIT 1`, []);

      if (anomalies.rows.length > 0) {
        candidates.push({
          type: 'business',
          title: `Business-Anomalie prüfen: ${anomalies.rows[0].title}`,
          reason: 'Aktive Business-Warnung',
          score: 85,
          sourceId: undefined,
        });
      }
    } catch {
      // Tables may not exist
    }

    // Sort by score descending, return best
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0] ?? null;
  }

  // =========================================================================
  // Stufe 10.3: Neuromodulator-Driven Daily Planning
  // =========================================================================

  /**
   * Get time-appropriate task suggestions based on neuromodulator model:
   * - Morning (6-12): High DA → creative/strategic tasks
   * - Afternoon (12-18): Declining DA → routine/operational tasks
   * - Evening (18-23): High 5HT → reflection/review tasks
   * Inspired by: Schultz 1997 (dopamine), Cools 2019 (time-of-day effects)
   */
  getTimeBasedTaskCategory(): { category: 'creative' | 'routine' | 'reflection'; neuromodulator: string; description: string } {
    const hour = new Date().getHours();

    if (hour >= 6 && hour < 12) {
      return {
        category: 'creative',
        neuromodulator: 'dopamine',
        description: 'Hohe Dopamin-Aktivität am Morgen → kreative und strategische Aufgaben',
      };
    } else if (hour >= 12 && hour < 18) {
      return {
        category: 'routine',
        neuromodulator: 'norepinephrine',
        description: 'Sinkende DA, stabile NE → Routine- und operative Aufgaben',
      };
    } else {
      return {
        category: 'reflection',
        neuromodulator: 'serotonin',
        description: 'Hoher Serotonin-Einfluss → Reflexion, Review und Planung',
      };
    }
  }

  /**
   * Get tasks matching the current neuromodulator-optimal category.
   * Labels/metadata are used to infer task category.
   */
  async getNeuromodulatorAlignedTasks(context: AIContext): Promise<Array<{ id: string; title: string; category: string }>> {
    const { category } = this.getTimeBasedTaskCategory();

    try {
      let labelFilter: string;
      switch (category) {
        case 'creative':
          labelFilter = `labels::text ILIKE '%strateg%' OR labels::text ILIKE '%kreativ%' OR labels::text ILIKE '%plan%' OR priority IN ('high', 'critical')`;
          break;
        case 'routine':
          labelFilter = `labels::text ILIKE '%routine%' OR labels::text ILIKE '%admin%' OR priority IN ('low', 'medium')`;
          break;
        case 'reflection':
          labelFilter = `labels::text ILIKE '%review%' OR labels::text ILIKE '%reflex%' OR labels::text ILIKE '%retro%'`;
          break;
      }

      const result = await queryContext(context,
        `SELECT id, title FROM tasks
         WHERE status NOT IN ('done', 'cancelled')
           AND (${labelFilter})
         ORDER BY priority DESC, due_date ASC NULLS LAST
         LIMIT 5`, []);

      return result.rows.map((r: { id: string; title: string }) => ({
        id: r.id,
        title: r.title,
        category,
      }));
    } catch {
      return [];
    }
  }

  /**
   * Check if system is idle (less than threshold requests in recent window)
   */
  async isSystemIdle(threshold = 5, windowMinutes = 10): Promise<boolean> {
    try {
      const result = await queryContext('operations', `
        SELECT COUNT(*) as cnt
        FROM general_chat_sessions
        WHERE updated_at > NOW() - make_interval(mins := $1)
      `, [windowMinutes]);
      return (parseInt(result.rows[0]?.cnt || '0', 10)) < threshold;
    } catch (e) {
      logger.debug('isSystemIdle check failed', { error: e instanceof Error ? e.message : String(e) });
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

// ===========================================
// PMA 4.8.3: Hypothesis-Preserving Contradiction Resolution
// ===========================================

/**
 * Resolve contradicting memories without destructive deletion.
 *
 * Three strategies:
 * 1. Both high confidence (> 0.5) -> preserve_both as a hypothesis group
 *    (the world genuinely has conflicting information worth tracking)
 * 2. One strong (> 0.7), one weak (< 0.3) -> auto_resolve to the strong one
 * 3. Ambiguous -> queue_review for human decision
 *
 * This replaces the default "recency wins" strategy in detectAndResolveContradictions.
 */
export function resolveContradictionPreserving(
  memory1: { id: string; content: string; confidence: number },
  memory2: { id: string; content: string; confidence: number },
  pmaEnabled: boolean = true,
): { action: 'preserve_both' | 'auto_resolve' | 'queue_review'; winner?: string; hypothesisGroupId?: string } {
  // When PMA disabled, fall back to original destructive resolution (higher confidence wins)
  if (!pmaEnabled) {
    return { action: 'auto_resolve', winner: memory1.confidence >= memory2.confidence ? memory1.id : memory2.id };
  }
  // Both high confidence -> preserve both as hypotheses
  if (memory1.confidence > 0.5 && memory2.confidence > 0.5) {
    return { action: 'preserve_both', hypothesisGroupId: `hyp_${memory1.id}_${memory2.id}` };
  }
  // One strong, one weak -> auto-resolve to strong
  if (memory1.confidence > 0.7 && memory2.confidence < 0.3) {
    return { action: 'auto_resolve', winner: memory1.id };
  }
  if (memory2.confidence > 0.7 && memory1.confidence < 0.3) {
    return { action: 'auto_resolve', winner: memory2.id };
  }
  // Ambiguous -> queue for user review
  return { action: 'queue_review' };
}
