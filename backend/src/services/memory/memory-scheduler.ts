/**
 * Memory Scheduler Service (HiMeS Architecture)
 *
 * Automated scheduling for memory maintenance tasks:
 * - Long-Term Memory Consolidation (daily at 2:00 AM)
 * - Episodic Memory Decay (daily at 3:00 AM)
 * - Memory Statistics Logging (hourly)
 *
 * Uses node-cron for reliable scheduling with timezone support.
 */

import { AIContext, queryContext } from '../../utils/database-context';
import { logger } from '../../utils/logger';
import { longTermMemory, ConsolidationResult } from './long-term-memory';
import { episodicMemory, EpisodicConsolidationResult } from './episodic-memory';
import { crossContextSharing } from './cross-context-sharing';
import { proactiveDigest } from '../proactive-digest';
import { memoryGovernance } from './memory-governance';
import { getAllDomainFocus } from '../domain-focus';
import { researchFocusTopic, shouldResearchNow } from '../proactive-intelligence';

// ===========================================
// Types & Interfaces
// ===========================================

export interface ScheduledTask {
  name: string;
  schedule: string; // Cron expression
  enabled: boolean;
  lastRun: Date | null;
  lastResult: TaskResult | null;
  nextRun: Date | null;
}

export interface TaskResult {
  success: boolean;
  duration: number;
  details?: Record<string, unknown>;
  error?: string;
}

export interface SchedulerStats {
  isRunning: boolean;
  tasks: ScheduledTask[];
  totalRuns: number;
  lastError: string | null;
}

export interface ConsolidationStats {
  longTerm: ConsolidationResult;
  episodic: EpisodicConsolidationResult;
  duration: number;
}

// ===========================================
// Configuration
// ===========================================

const CONFIG = {
  /** Timezone for cron jobs */
  TIMEZONE: process.env.CRON_TIMEZONE || 'Europe/Berlin',

  /** Long-Term Memory Consolidation schedule (default: 2:00 AM daily) */
  CONSOLIDATION_SCHEDULE: process.env.CONSOLIDATION_SCHEDULE || '0 2 * * *',

  /** Episodic Memory Decay schedule (default: 3:00 AM daily) */
  DECAY_SCHEDULE: process.env.DECAY_SCHEDULE || '0 3 * * *',

  /** Memory Stats logging schedule (default: every hour) */
  STATS_SCHEDULE: process.env.STATS_SCHEDULE || '0 * * * *',

  /** Focus Topic Research schedule (default: Sundays at 4:00 AM) */
  FOCUS_RESEARCH_SCHEDULE: process.env.FOCUS_RESEARCH_SCHEDULE || '0 4 * * 0',

  /** Enable/disable individual tasks via environment */
  ENABLE_CONSOLIDATION: process.env.ENABLE_MEMORY_CONSOLIDATION !== 'false',
  ENABLE_DECAY: process.env.ENABLE_MEMORY_DECAY !== 'false',
  ENABLE_STATS_LOGGING: process.env.ENABLE_MEMORY_STATS !== 'false',
  ENABLE_FOCUS_RESEARCH: process.env.ENABLE_FOCUS_RESEARCH !== 'false',

  /** Contexts to process (all by default) */
  CONTEXTS: ['personal', 'work', 'learning', 'creative'] as AIContext[],
};

// ===========================================
// Cron-like Scheduler (No external dependency)
// ===========================================

type CronCallback = () => void | Promise<void> | Promise<unknown>;

interface CronJob {
  name: string;
  schedule: string;
  callback: CronCallback;
  enabled: boolean;
  timeout: NodeJS.Timeout | null;
  lastRun: Date | null;
  nextRun: Date | null;
}

/**
 * Parse a cron expression and calculate next run time
 * Supports: minute hour day-of-month month day-of-week
 */
function parseCronExpression(expression: string): {
  minute: number | '*';
  hour: number | '*';
  dayOfMonth: number | '*';
  month: number | '*';
  dayOfWeek: number | '*';
} {
  const parts = expression.split(' ');
  if (parts.length !== 5) {
    throw new Error(`Invalid cron expression: ${expression}`);
  }

  const parse = (value: string): number | '*' => {
    if (value === '*') {return '*';}
    const num = parseInt(value, 10);
    if (isNaN(num)) {throw new Error(`Invalid cron value: ${value}`);}
    return num;
  };

  return {
    minute: parse(parts[0]),
    hour: parse(parts[1]),
    dayOfMonth: parse(parts[2]),
    month: parse(parts[3]),
    dayOfWeek: parse(parts[4]),
  };
}

/**
 * Calculate the next run time for a cron expression
 */
function getNextRunTime(expression: string, from: Date = new Date()): Date {
  const parsed = parseCronExpression(expression);
  const next = new Date(from);

  // Start from next minute
  next.setSeconds(0);
  next.setMilliseconds(0);
  next.setMinutes(next.getMinutes() + 1);

  // Find next matching time (max 366 days ahead)
  const maxIterations = 366 * 24 * 60;
  for (let i = 0; i < maxIterations; i++) {
    const matches =
      (parsed.minute === '*' || next.getMinutes() === parsed.minute) &&
      (parsed.hour === '*' || next.getHours() === parsed.hour) &&
      (parsed.dayOfMonth === '*' || next.getDate() === parsed.dayOfMonth) &&
      (parsed.month === '*' || next.getMonth() + 1 === parsed.month) &&
      (parsed.dayOfWeek === '*' || next.getDay() === parsed.dayOfWeek);

    if (matches) {
      return next;
    }

    next.setMinutes(next.getMinutes() + 1);
  }

  throw new Error(`Could not find next run time for: ${expression}`);
}

/**
 * Simple cron-like scheduler using setTimeout
 */
class SimpleCronScheduler {
  private jobs: Map<string, CronJob> = new Map();
  private running = false;

  /**
   * Schedule a new job
   */
  schedule(name: string, cronExpression: string, callback: CronCallback): void {
    if (this.jobs.has(name)) {
      this.stop(name);
    }

    const job: CronJob = {
      name,
      schedule: cronExpression,
      callback,
      enabled: true,
      timeout: null,
      lastRun: null,
      nextRun: null,
    };

    this.jobs.set(name, job);

    if (this.running) {
      this.scheduleNextRun(job);
    }
  }

  /**
   * Schedule the next run for a job
   */
  private scheduleNextRun(job: CronJob): void {
    if (!job.enabled) {return;}

    try {
      const nextRun = getNextRunTime(job.schedule);
      job.nextRun = nextRun;

      const delay = nextRun.getTime() - Date.now();

      job.timeout = setTimeout(async () => {
        job.lastRun = new Date();
        try {
          await job.callback();
        } catch (error) {
          logger.error(`Cron job "${job.name}" failed`, error instanceof Error ? error : undefined, {
            job: job.name,
            operation: 'cronJobError',
          });
        }

        // Schedule next run
        if (job.enabled && this.running) {
          this.scheduleNextRun(job);
        }
      }, delay);

      logger.debug(`Scheduled "${job.name}" for ${nextRun.toISOString()}`, {
        job: job.name,
        delayMs: delay,
        operation: 'cronSchedule',
      });
    } catch (error) {
      logger.error(`Failed to schedule job "${job.name}"`, error instanceof Error ? error : undefined, {
        job: job.name,
        schedule: job.schedule,
        operation: 'cronScheduleError',
      });
    }
  }

  /**
   * Start the scheduler
   */
  start(): void {
    if (this.running) {return;}

    this.running = true;

    for (const job of this.jobs.values()) {
      if (job.enabled) {
        this.scheduleNextRun(job);
      }
    }

    logger.info('Cron scheduler started', {
      jobs: Array.from(this.jobs.keys()),
      operation: 'cronStart',
    });
  }

  /**
   * Stop a specific job
   */
  stop(name: string): void {
    const job = this.jobs.get(name);
    if (job) {
      if (job.timeout) {
        clearTimeout(job.timeout);
        job.timeout = null;
      }
      job.enabled = false;
    }
  }

  /**
   * Stop all jobs
   */
  stopAll(): void {
    this.running = false;

    for (const job of this.jobs.values()) {
      if (job.timeout) {
        clearTimeout(job.timeout);
        job.timeout = null;
      }
      job.enabled = false;
    }

    logger.info('Cron scheduler stopped', { operation: 'cronStop' });
  }

  /**
   * Get job status
   */
  getJobs(): ScheduledTask[] {
    return Array.from(this.jobs.values()).map(job => ({
      name: job.name,
      schedule: job.schedule,
      enabled: job.enabled,
      lastRun: job.lastRun,
      lastResult: null, // Simplified - could track results
      nextRun: job.nextRun,
    }));
  }

  /**
   * Check if running
   */
  isRunning(): boolean {
    return this.running;
  }
}

// ===========================================
// Memory Scheduler Service
// ===========================================

class MemorySchedulerService {
  private scheduler = new SimpleCronScheduler();
  private stats = {
    totalRuns: 0,
    lastError: null as string | null,
  };

  /**
   * Initialize and start the memory scheduler
   */
  async start(): Promise<void> {
    logger.info('Starting Memory Scheduler Service', {
      timezone: CONFIG.TIMEZONE,
      consolidationEnabled: CONFIG.ENABLE_CONSOLIDATION,
      decayEnabled: CONFIG.ENABLE_DECAY,
      operation: 'memorySchedulerStart',
    });

    // Schedule Long-Term Memory Consolidation
    if (CONFIG.ENABLE_CONSOLIDATION) {
      this.scheduler.schedule(
        'long-term-consolidation',
        CONFIG.CONSOLIDATION_SCHEDULE,
        () => this.runConsolidation()
      );
    }

    // Schedule Episodic Memory Decay
    if (CONFIG.ENABLE_DECAY) {
      this.scheduler.schedule(
        'episodic-decay',
        CONFIG.DECAY_SCHEDULE,
        () => this.runDecay()
      );
    }

    // Schedule Stats Logging
    if (CONFIG.ENABLE_STATS_LOGGING) {
      this.scheduler.schedule(
        'memory-stats',
        CONFIG.STATS_SCHEDULE,
        () => this.logMemoryStats()
      );
    }

    // Schedule Focus Topic Research
    if (CONFIG.ENABLE_FOCUS_RESEARCH) {
      this.scheduler.schedule(
        'focus-topic-research',
        CONFIG.FOCUS_RESEARCH_SCHEDULE,
        () => this.runFocusResearch()
      );
    }

    // Start the scheduler
    this.scheduler.start();

    logger.info('Memory Scheduler Service started', {
      tasks: this.scheduler.getJobs().map(j => j.name),
      operation: 'memorySchedulerStarted',
    });
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    this.scheduler.stopAll();
    logger.info('Memory Scheduler Service stopped', {
      operation: 'memorySchedulerStop',
    });
  }

  /**
   * Run Long-Term Memory Consolidation for all contexts
   */
  async runConsolidation(): Promise<ConsolidationStats> {
    const start = Date.now();
    this.stats.totalRuns++;

    logger.info('Starting scheduled memory consolidation', {
      contexts: CONFIG.CONTEXTS,
      operation: 'consolidationStart',
    });

    const results: ConsolidationStats = {
      longTerm: { patternsAdded: 0, factsAdded: 0, factsUpdated: 0, interactionsStored: 0 },
      episodic: { episodesProcessed: 0, factsExtracted: 0, strongEpisodes: 0 },
      duration: 0,
    };

    for (const context of CONFIG.CONTEXTS) {
      // Small delay between contexts to prevent connection pool exhaustion
      if (context !== CONFIG.CONTEXTS[0]) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // Long-Term Memory Consolidation (separate try-catch for isolation)
      let ltResult = { patternsAdded: 0, factsAdded: 0, factsUpdated: 0, interactionsStored: 0 };
      try {
        ltResult = await longTermMemory.consolidate(context);
        results.longTerm.patternsAdded += ltResult.patternsAdded;
        results.longTerm.factsAdded += ltResult.factsAdded;
        results.longTerm.factsUpdated += ltResult.factsUpdated;
        results.longTerm.interactionsStored += ltResult.interactionsStored;
      } catch (error) {
        const pgError = error as { code?: string; detail?: string; table?: string };
        logger.error(`Long-term consolidation failed for context: ${context}`, error instanceof Error ? error : undefined, {
          context,
          operation: 'longTermConsolidationError',
          pgCode: pgError.code,
          pgDetail: pgError.detail,
          pgTable: pgError.table,
        });
        this.stats.lastError = error instanceof Error ? error.message : String(error);
        // Continue with episodic consolidation even if long-term fails
      }

      // Episodic Memory Consolidation (separate try-catch for isolation)
      let epResult = { episodesProcessed: 0, factsExtracted: 0, strongEpisodes: 0 };
      try {
        epResult = await episodicMemory.consolidate(context);
        results.episodic.episodesProcessed += epResult.episodesProcessed;
        results.episodic.factsExtracted += epResult.factsExtracted;
        results.episodic.strongEpisodes += epResult.strongEpisodes;
      } catch (error) {
        const pgError = error as { code?: string; detail?: string; table?: string };
        logger.error(`Episodic consolidation failed for context: ${context}`, error instanceof Error ? error : undefined, {
          context,
          operation: 'episodicConsolidationError',
          pgCode: pgError.code,
          pgDetail: pgError.detail,
          pgTable: pgError.table,
        });
        this.stats.lastError = error instanceof Error ? error.message : String(error);
        // Continue with next context even if this one fails
      }

      // Temporal Hierarchy Merge (weekly/monthly episode merging)
      try {
        const mergeResult = await episodicMemory.temporalMerge(context);
        if (mergeResult.episodesRemoved > 0) {
          logger.info(`Temporal merge for context: ${context}`, {
            context,
            ...mergeResult,
            operation: 'temporalMerge',
          });
        }
      } catch (error) {
        logger.debug(`Temporal merge failed for context: ${context}`, { error });
      }

      logger.info(`Consolidation complete for context: ${context}`, {
        context,
        longTerm: ltResult,
        episodic: epResult,
        operation: 'consolidationContext',
      });
    }

    // Cross-context insight sharing (after all contexts are consolidated)
    try {
      const sharingResult = await crossContextSharing.shareAll();
      logger.info('Cross-context sharing during consolidation', {
        ...sharingResult,
        operation: 'crossContextSharing',
      });
    } catch (error) {
      logger.debug('Cross-context sharing failed during consolidation', { error });
    }

    // Activity log learning: extract behavioral patterns from activity logs
    try {
      const activityResult = await this.learnFromActivityLogs();
      if (activityResult.patternsDetected > 0) {
        logger.info('Activity log learning during consolidation', {
          ...activityResult,
          operation: 'activityLogLearning',
        });
      }
    } catch (error) {
      logger.debug('Activity log learning failed during consolidation', { error });
    }

    // Cleanup old reflection insights (keep max 200 per context)
    try {
      for (const context of CONFIG.CONTEXTS) {
        await this.pruneOldReflections(context);
      }
    } catch (error) {
      logger.debug('Reflection insight cleanup failed', { error });
    }

    // Generate daily digests for all contexts
    try {
      for (const context of CONFIG.CONTEXTS) {
        const digest = await proactiveDigest.generateDailyDigest(context);
        if (digest) {
          logger.info('Daily digest generated during consolidation', {
            context,
            digestId: digest.id,
            sections: digest.sections.length,
            operation: 'dailyDigest',
          });
        }
      }
    } catch (error) {
      logger.debug('Daily digest generation failed', { error });
    }

    // Generate weekly digests on Sundays
    if (new Date().getDay() === 0) {
      try {
        for (const context of CONFIG.CONTEXTS) {
          const digest = await proactiveDigest.generateWeeklyDigest(context);
          if (digest) {
            logger.info('Weekly digest generated during consolidation', {
              context,
              digestId: digest.id,
              sections: digest.sections.length,
              operation: 'weeklyDigest',
            });
          }
        }
      } catch (error) {
        logger.debug('Weekly digest generation failed', { error });
      }
    }

    results.duration = Date.now() - start;

    logger.info('Scheduled memory consolidation complete', {
      ...results,
      operation: 'consolidationComplete',
    });

    return results;
  }

  /**
   * Run Memory Decay for all contexts (episodic + long-term facts)
   */
  async runDecay(): Promise<{ totalAffected: number; factsDecayed: number; factsPruned: number; duration: number }> {
    const start = Date.now();
    this.stats.totalRuns++;

    logger.info('Starting scheduled memory decay (episodic + fact decay)', {
      contexts: CONFIG.CONTEXTS,
      operation: 'decayStart',
    });

    let totalAffected = 0;
    let factsDecayed = 0;
    let factsPruned = 0;

    for (const context of CONFIG.CONTEXTS) {
      // Episodic decay
      try {
        const affected = await episodicMemory.applyDecay(context);
        totalAffected += affected;

        logger.info(`Episodic decay applied for context: ${context}`, {
          context,
          affectedEpisodes: affected,
          operation: 'decayContext',
        });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        this.stats.lastError = errorMsg;

        logger.error(`Episodic decay failed for context: ${context}`, error instanceof Error ? error : undefined, {
          context,
          operation: 'decayError',
        });
      }

      // Long-term fact decay (importance-weighted)
      try {
        const factResult = await longTermMemory.applyFactDecay(context);
        factsDecayed += factResult.decayed;
        factsPruned += factResult.pruned;

        if (factResult.decayed > 0 || factResult.pruned > 0) {
          logger.info(`Fact decay applied for context: ${context}`, {
            context,
            factsDecayed: factResult.decayed,
            factsPruned: factResult.pruned,
            operation: 'factDecayContext',
          });
        }
      } catch (error) {
        logger.error(`Fact decay failed for context: ${context}`, error instanceof Error ? error : undefined, {
          context,
          operation: 'factDecayError',
        });
      }
    }

    // Apply GDPR retention policies
    for (const context of CONFIG.CONTEXTS) {
      try {
        const retentionDeleted = await memoryGovernance.applyRetention(context);
        if (retentionDeleted > 0) {
          totalAffected += retentionDeleted;
          logger.info(`Retention policy applied for ${context}`, {
            context,
            deleted: retentionDeleted,
            operation: 'retentionPolicy',
          });
        }
      } catch (error) {
        logger.debug(`Retention policy failed for ${context}`, { error });
      }
    }

    const duration = Date.now() - start;

    logger.info('Scheduled memory decay complete', {
      totalAffected,
      factsDecayed,
      factsPruned,
      duration,
      operation: 'decayComplete',
    });

    return { totalAffected, factsDecayed, factsPruned, duration };
  }

  /**
   * Log current memory statistics
   */
  async logMemoryStats(): Promise<void> {
    for (const context of CONFIG.CONTEXTS) {
      try {
        const [ltStats, epStats] = await Promise.all([
          longTermMemory.getStats(context),
          episodicMemory.getStats(context),
        ]);

        logger.info(`Memory stats for ${context}`, {
          context,
          longTerm: ltStats,
          episodic: epStats,
          operation: 'memoryStats',
        });
      } catch (error) {
        logger.debug(`Failed to get memory stats for ${context}`, {
          context,
          error: error instanceof Error ? error.message : String(error),
          operation: 'memoryStatsError',
        });
      }
    }
  }

  /**
   * Run Focus Topic Research for all contexts
   */
  async runFocusResearch(): Promise<{ topicsResearched: number; duration: number }> {
    const start = Date.now();
    this.stats.totalRuns++;
    let topicsResearched = 0;

    logger.info('Starting scheduled focus topic research', {
      contexts: CONFIG.CONTEXTS,
      operation: 'focusResearchStart',
    });

    for (const context of CONFIG.CONTEXTS) {
      try {
        const activeFocusTopics = await getAllDomainFocus(context, true);

        for (const focus of activeFocusTopics) {
          if (shouldResearchNow(focus)) {
            await researchFocusTopic(focus, context);
            topicsResearched++;
            // Rate-Limit: 5 Sekunden Pause zwischen Topics
            await new Promise(resolve => setTimeout(resolve, 5000));
          }
        }
      } catch (error) {
        logger.error(`Focus research failed for context: ${context}`, error instanceof Error ? error : undefined, {
          context,
          operation: 'focusResearchError',
        });
        this.stats.lastError = error instanceof Error ? error.message : String(error);
      }
    }

    const duration = Date.now() - start;

    logger.info('Scheduled focus topic research complete', {
      topicsResearched,
      duration,
      operation: 'focusResearchComplete',
    });

    return { topicsResearched, duration };
  }

  /**
   * Manually trigger focus research (for testing or admin API)
   */
  async triggerFocusResearch(context?: AIContext): Promise<{ topicsResearched: number; duration: number }> {
    const contexts = context ? [context] : CONFIG.CONTEXTS;
    const originalContexts = CONFIG.CONTEXTS;

    (CONFIG as { CONTEXTS: AIContext[] }).CONTEXTS = contexts;

    try {
      return await this.runFocusResearch();
    } finally {
      (CONFIG as { CONTEXTS: AIContext[] }).CONTEXTS = originalContexts;
    }
  }

  /**
   * Manually trigger consolidation (for testing or admin API)
   */
  async triggerConsolidation(context?: AIContext): Promise<ConsolidationStats> {
    const contexts = context ? [context] : CONFIG.CONTEXTS;
    const originalContexts = CONFIG.CONTEXTS;

    // Temporarily override contexts
    (CONFIG as { CONTEXTS: AIContext[] }).CONTEXTS = contexts;

    try {
      return await this.runConsolidation();
    } finally {
      // Restore original contexts
      (CONFIG as { CONTEXTS: AIContext[] }).CONTEXTS = originalContexts;
    }
  }

  /**
   * Manually trigger decay (for testing or admin API)
   */
  async triggerDecay(context?: AIContext): Promise<{ totalAffected: number; duration: number }> {
    const contexts = context ? [context] : CONFIG.CONTEXTS;
    const originalContexts = CONFIG.CONTEXTS;

    // Temporarily override contexts
    (CONFIG as { CONTEXTS: AIContext[] }).CONTEXTS = contexts;

    try {
      return await this.runDecay();
    } finally {
      // Restore original contexts
      (CONFIG as { CONTEXTS: AIContext[] }).CONTEXTS = originalContexts;
    }
  }

  /**
   * Get scheduler status
   */
  getStatus(): SchedulerStats {
    return {
      isRunning: this.scheduler.isRunning(),
      tasks: this.scheduler.getJobs(),
      totalRuns: this.stats.totalRuns,
      lastError: this.stats.lastError,
    };
  }

  /**
   * Prune old reflection insights per context (keep max 200)
   */
  private async pruneOldReflections(context: AIContext): Promise<void> {
    try {
      // Count current insights
      const countResult = await queryContext(
        context,
        `SELECT COUNT(*) as cnt FROM reflection_insights WHERE context = $1`,
        [context]
      );
      const count = Number(countResult.rows[0]?.cnt || 0);

      if (count > 200) {
        // Delete oldest beyond 200, but never delete unapplied action items
        await queryContext(
          context,
          `DELETE FROM reflection_insights
           WHERE id IN (
             SELECT id FROM reflection_insights
             WHERE context = $1 AND (applied = true OR action_item IS NULL)
             ORDER BY created_at ASC
             LIMIT $2
           )`,
          [context, count - 200]
        );
        logger.debug(`Pruned ${count - 200} old reflection insights for ${context}`);
      }
    } catch (error) {
      // Table might not exist yet - that's fine
      if (error instanceof Error && error.message.includes('does not exist')) {return;}
      logger.debug(`Failed to prune reflection insights for ${context}`, {
        error: error instanceof Error ? error.message : 'Unknown',
      });
    }
  }

  /**
   * Learn behavioral patterns from AI activity logs.
   *
   * Analyzes recent activity to detect:
   * - Time-of-day patterns (user is most active in the morning)
   * - Feature usage patterns (user frequently creates ideas)
   * - Topic clustering (user focuses on X topics)
   */
  private async learnFromActivityLogs(): Promise<{ patternsDetected: number }> {
    let patternsDetected = 0;

    for (const context of CONFIG.CONTEXTS) {
      try {
        // Get activity counts by type from last 7 days
        const activityStats = await queryContext(
          context,
          `SELECT activity_type, COUNT(*) as count,
                  EXTRACT(HOUR FROM created_at) as hour
           FROM ai_activity_log
           WHERE created_at > NOW() - INTERVAL '7 days'
           GROUP BY activity_type, EXTRACT(HOUR FROM created_at)
           ORDER BY count DESC
           LIMIT 50`,
          []
        );

        if (activityStats.rows.length === 0) {continue;}

        // Detect time-of-day patterns
        const hourCounts = new Map<number, number>();
        for (const row of activityStats.rows) {
          const hour = Number(row.hour);
          hourCounts.set(hour, (hourCounts.get(hour) || 0) + Number(row.count));
        }

        // Find peak activity hours
        let peakHour = 0;
        let peakCount = 0;
        for (const [hour, count] of hourCounts) {
          if (count > peakCount) {
            peakCount = count;
            peakHour = hour;
          }
        }

        if (peakCount >= 5) {
          const timeLabel = peakHour < 12 ? 'morgens' : peakHour < 17 ? 'nachmittags' : 'abends';
          await longTermMemory.addFact(context, {
            factType: 'behavior',
            content: `Nutzer ist am aktivsten ${timeLabel} (Peak: ${peakHour}:00 Uhr)`,
            confidence: Math.min(0.8, peakCount / 20),
            source: 'inferred' as const,
          });
          patternsDetected++;
        }

        // Detect most-used features
        const featureCounts = new Map<string, number>();
        for (const row of activityStats.rows) {
          const type = row.activity_type as string;
          featureCounts.set(type, (featureCounts.get(type) || 0) + Number(row.count));
        }

        // Top 2 most used features
        const sortedFeatures = [...featureCounts.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 2);

        for (const [feature, count] of sortedFeatures) {
          if (count >= 3) {
            const featureLabels: Record<string, string> = {
              idea_created: 'Ideen erstellen',
              search_performed: 'Suchen',
              draft_generated: 'Entwuerfe generieren',
              pattern_detected: 'Muster-Erkennung',
              suggestion_made: 'Vorschlaege',
              idea_structured: 'Ideen strukturieren',
            };
            const label = featureLabels[feature] || feature;
            await longTermMemory.addFact(context, {
              factType: 'behavior',
              content: `Nutzer nutzt haeufig: ${label} (${count}x in 7 Tagen)`,
              confidence: Math.min(0.75, count / 15),
              source: 'inferred' as const,
            });
            patternsDetected++;
          }
        }
      } catch (error) {
        logger.debug(`Activity log learning failed for context: ${context}`, {
          error: error instanceof Error ? error.message : 'Unknown',
        });
      }
    }

    return { patternsDetected };
  }

  /**
   * Get configuration
   */
  getConfig(): typeof CONFIG {
    return { ...CONFIG };
  }
}

// ===========================================
// Singleton Export
// ===========================================

export const memoryScheduler = new MemorySchedulerService();

// ===========================================
// Convenience Functions
// ===========================================

/**
 * Start the memory scheduler (call from main.ts)
 */
export async function startMemoryScheduler(): Promise<void> {
  await memoryScheduler.start();
}

/**
 * Stop the memory scheduler (call on shutdown)
 */
export function stopMemoryScheduler(): void {
  memoryScheduler.stop();
}
