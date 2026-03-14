/**
 * Phase 63: Sleep-Time Compute BullMQ Worker
 *
 * Processes sleep compute jobs from the memory-consolidation queue.
 * Supports repeatable jobs for scheduled execution.
 */

import { logger } from '../../../utils/logger';
import { AIContext } from '../../../utils/database-context';
import { getSleepComputeEngine, SleepCycleResult } from '../../memory/sleep-compute';
import { getContextEngineV2 } from '../../context-engine-v2';

const VALID_CONTEXTS: AIContext[] = ['personal', 'work', 'learning', 'creative'];

export interface SleepJobData {
  context: AIContext;
  cycleType?: 'full' | 'consolidation_only' | 'preload_only' | 'cache_cleanup';
}

/**
 * Process a sleep compute job.
 */
export async function processSleepJob(data: Record<string, unknown>): Promise<SleepCycleResult | { cleaned: number }> {
  const jobData = data as unknown as SleepJobData;
  const context = jobData.context || 'personal';
  const cycleType = jobData.cycleType || 'full';

  if (!VALID_CONTEXTS.includes(context)) {
    logger.warn('Invalid context for sleep job', { operation: 'sleep-worker', context });
    return { processed: 0, insights: [], contradictionsResolved: 0, memoryUpdates: 0, preloadedItems: 0, durationMs: 0 };
  }

  logger.info('Processing sleep compute job', {
    operation: 'sleep-worker',
    context,
    cycleType,
  });

  if (cycleType === 'cache_cleanup') {
    const engine = getContextEngineV2();
    const cleaned = await engine.cleanExpiredCache(context);
    return { cleaned };
  }

  const engine = getSleepComputeEngine();
  return engine.runSleepCycle(context);
}

/**
 * Schedule repeatable sleep jobs via BullMQ.
 * Called during server startup.
 */
export async function scheduleSleepJobs(): Promise<void> {
  try {
    // Dynamic import to avoid issues when BullMQ is not available
    const { getQueueService } = await import('../job-queue');
    const queueService = getQueueService();

    if (!queueService.isAvailable()) {
      logger.info('Sleep jobs not scheduled: queue service not available', {
        operation: 'sleep-worker',
      });
      return;
    }

    // Schedule sleep cycles for each context (first run after 30 minutes)
    for (const context of VALID_CONTEXTS) {
      await queueService.enqueue('memory-consolidation', `sleep-cycle:${context}`, {
        context,
        cycleType: 'full',
      }, {
        delay: 60000 * 30, // First run after 30 minutes
      });
    }

    // Schedule cache cleanup (first run after 1 hour)
    for (const context of VALID_CONTEXTS) {
      await queueService.enqueue('memory-consolidation', `cache-cleanup:${context}`, {
        context,
        cycleType: 'cache_cleanup',
      }, {
        delay: 60000 * 60, // First run after 1 hour
      });
    }

    logger.info('Sleep jobs scheduled', { operation: 'sleep-worker' });
  } catch (error) {
    logger.warn('Failed to schedule sleep jobs', {
      operation: 'sleep-worker',
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
