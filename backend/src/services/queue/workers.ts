/**
 * Phase 61+: Queue Workers
 *
 * Worker definitions for background job processing.
 * Each worker processes jobs from a specific queue.
 * Workers are no-op if REDIS_URL is not configured.
 *
 * Enhancements:
 * - Enhanced error handling with failed event context + DLQ pattern
 * - Job progress reporting for long-running jobs
 * - getWorkerHealth() for monitoring active/completed/failed counts
 * - Stalled job detection with configurable interval
 * - Dead letter queue: final-attempt failures logged with full context
 */

import { logger } from '../../utils/logger';
import { recordQueueJob } from '../observability/metrics';

// Worker references for shutdown
type BullWorker = {
  close(): Promise<void>;
  on(event: string, handler: (...args: unknown[]) => void): void;
};

// BullMQ Job shape (minimal typing to avoid hard dependency)
interface BullJob {
  id?: string;
  name?: string;
  data: Record<string, unknown>;
  attemptsMade?: number;
  opts?: { attempts?: number };
  updateProgress(progress: number | Record<string, unknown>): Promise<void>;
}

const workers: Map<string, BullWorker> = new Map();
let workersStarted = false;

// --- Per-worker health counters ---

interface WorkerHealthCounters {
  completed: number;
  failed: number;
  active: number;
  stalled: number;
  dlq: number;
  lastCompletedAt: string | null;
  lastFailedAt: string | null;
}

const healthCounters: Map<string, WorkerHealthCounters> = new Map();

function getOrCreateCounters(queueName: string): WorkerHealthCounters {
  let c = healthCounters.get(queueName);
  if (!c) {
    c = { completed: 0, failed: 0, active: 0, stalled: 0, dlq: 0, lastCompletedAt: null, lastFailedAt: null };
    healthCounters.set(queueName, c);
  }
  return c;
}

// --- Worker Health API ---

export interface WorkerHealthStatus {
  queue: string;
  active: number;
  completed: number;
  failed: number;
  stalled: number;
  dlq: number;
  lastCompletedAt: string | null;
  lastFailedAt: string | null;
}

export interface WorkerHealthReport {
  workersRunning: boolean;
  workers: WorkerHealthStatus[];
}

/**
 * Get health status for all workers (active jobs, completed count, failed count, DLQ count).
 */
export function getWorkerHealth(): WorkerHealthReport {
  if (!workersStarted || workers.size === 0) {
    return { workersRunning: false, workers: [] };
  }

  const statuses: WorkerHealthStatus[] = [];
  for (const queueName of workers.keys()) {
    const c = getOrCreateCounters(queueName);
    statuses.push({
      queue: queueName,
      active: c.active,
      completed: c.completed,
      failed: c.failed,
      stalled: c.stalled,
      dlq: c.dlq,
      lastCompletedAt: c.lastCompletedAt,
      lastFailedAt: c.lastFailedAt,
    });
  }

  return { workersRunning: true, workers: statuses };
}

// --- Job processors ---

/**
 * Process a memory consolidation job.
 */
async function processMemoryConsolidation(job: BullJob): Promise<Record<string, unknown>> {
  const data = job.data;
  const context = (data.context as 'personal' | 'work' | 'learning' | 'creative' | 'demo') || 'personal';
  logger.info('Processing memory consolidation job', {
    operation: 'worker',
    queue: 'memory-consolidation',
    context,
  });

  await job.updateProgress(10);

  // Calls into existing memory consolidation logic
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const memoryModule = require('../memory/index');
    if (typeof memoryModule.memoryCoordinator?.consolidateAll === 'function') {
      await job.updateProgress(30);
      await memoryModule.memoryCoordinator.consolidateAll(context);
      await job.updateProgress(100);
    }
  } catch (error) {
    logger.debug('Memory consolidation function not available', {
      operation: 'worker',
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return { status: 'completed', context };
}

/**
 * Process a RAG indexing job.
 * Delegates to graphIndexer for entity/relation extraction from ideas.
 */
async function processRagIndexing(job: BullJob): Promise<Record<string, unknown>> {
  const data = job.data;
  const context = (data.context as 'personal' | 'work' | 'learning' | 'creative' | 'demo') || 'personal';
  const ideaId = data.ideaId as string | undefined;
  logger.info('Processing RAG indexing job', {
    operation: 'worker',
    queue: 'rag-indexing',
    context,
    ideaId,
  });

  await job.updateProgress(10);

  try {
    const { graphIndexer } = await import('../knowledge-graph/graph-indexer');

    await job.updateProgress(50);

    if (ideaId) {
      const result = await graphIndexer.indexIdea(ideaId, context);
      await job.updateProgress(100);
      return {
        status: 'completed',
        context,
        ideaId,
        entitiesCreated: result.entityCount,
        relationsCreated: result.relationCount,
      };
    } else {
      const result = await graphIndexer.indexBatch(context, { limit: 50 });
      await job.updateProgress(100);
      return {
        status: 'completed',
        context,
        processedCount: result.processedCount,
        entitiesCreated: result.entitiesCreated,
        relationsCreated: result.relationsCreated,
        errors: result.errors.length,
        duration_ms: result.duration_ms,
      };
    }
  } catch (error) {
    logger.warn('RAG indexing service not available', {
      operation: 'worker',
      queue: 'rag-indexing',
      error: error instanceof Error ? error.message : String(error),
    });
    return { status: 'skipped', context, ideaId };
  }
}

/**
 * Process an email analysis job.
 * Delegates to processEmailWithAI for AI-powered email categorization and summarization.
 */
async function processEmailProcessing(job: BullJob): Promise<Record<string, unknown>> {
  const data = job.data;
  const emailId = data.emailId as string | undefined;
  const context = (data.context as 'personal' | 'work' | 'learning' | 'creative' | 'demo') || 'work';
  logger.info('Processing email analysis job', {
    operation: 'worker',
    queue: 'email-processing',
    context,
    emailId,
  });

  await job.updateProgress(10);

  if (!emailId) {
    logger.warn('Email processing job missing emailId', {
      operation: 'worker',
      queue: 'email-processing',
    });
    return { status: 'skipped', context, reason: 'missing emailId' };
  }

  try {
    const { processEmailWithAI } = await import('../email-ai');

    await job.updateProgress(50);

    await processEmailWithAI(context, emailId);

    await job.updateProgress(100);
    return { status: 'completed', context, emailId, processedAt: new Date().toISOString() };
  } catch (error) {
    logger.warn('Email AI processing service not available', {
      operation: 'worker',
      queue: 'email-processing',
      error: error instanceof Error ? error.message : String(error),
    });
    return { status: 'skipped', context, emailId };
  }
}

/**
 * Process a graph indexing job.
 * Delegates to graphIndexer for batch knowledge graph indexing with status tracking.
 */
async function processGraphIndexing(job: BullJob): Promise<Record<string, unknown>> {
  const data = job.data;
  const context = (data.context as 'personal' | 'work' | 'learning' | 'creative' | 'demo') || 'personal';
  logger.info('Processing graph indexing job', {
    operation: 'worker',
    queue: 'graph-indexing',
    context,
  });

  await job.updateProgress(10);

  try {
    const { graphIndexer } = await import('../knowledge-graph/graph-indexer');

    const status = await graphIndexer.getIndexingStatus(context);

    await job.updateProgress(50);

    const result = await graphIndexer.indexBatch(context, { limit: 100 });

    await job.updateProgress(100);
    return {
      status: 'completed',
      context,
      totalIdeas: status.totalIdeas,
      indexedIdeas: status.indexedIdeas,
      processedCount: result.processedCount,
      entitiesCreated: result.entitiesCreated,
      relationsCreated: result.relationsCreated,
      errors: result.errors.length,
      duration_ms: result.duration_ms,
    };
  } catch (error) {
    logger.warn('Graph indexing service not available', {
      operation: 'worker',
      queue: 'graph-indexing',
      error: error instanceof Error ? error.message : String(error),
    });
    return { status: 'skipped', context };
  }
}

/**
 * Process a sleep compute job (Phase 63).
 */
async function processSleepCompute(job: BullJob): Promise<Record<string, unknown>> {
  try {
    await job.updateProgress(10);
    const { processSleepJob } = await import('./workers/sleep-worker');
    await job.updateProgress(30);
    const result = await processSleepJob(job.data);
    await job.updateProgress(100);
    return { status: 'completed', ...result };
  } catch (error) {
    logger.debug('Sleep compute processor not available', {
      operation: 'worker',
      error: error instanceof Error ? error.message : String(error),
    });
    return { status: 'skipped' };
  }
}

/**
 * Process an embedding drift check job (Phase 99).
 * Runs weekly to detect degradation in embedding quality.
 */
async function processEmbeddingDrift(job: BullJob): Promise<Record<string, unknown>> {
  try {
    await job.updateProgress(10);
    const { runDriftCheck } = await import('../embedding-drift');
    const contexts = ['personal', 'work', 'learning', 'creative'] as const;
    const results = [];

    for (let i = 0; i < contexts.length; i++) {
      await job.updateProgress(10 + (i + 1) * 20);
      const result = await runDriftCheck(contexts[i]);
      results.push(result);
    }

    await job.updateProgress(100);
    return {
      status: 'completed',
      results,
      driftDetected: results.some(r => r.driftDetected),
    };
  } catch (error) {
    logger.debug('Embedding drift check not available', {
      operation: 'worker',
      error: error instanceof Error ? error.message : String(error),
    });
    return { status: 'skipped' };
  }
}

/**
 * Process a hebbian decay + Bayesian confidence propagation job (Phase 125).
 * Runs across all 4 contexts to strengthen/weaken entity relationships
 * and propagate updated confidence scores through the knowledge graph.
 */
async function processHebbianDecay(job: BullJob): Promise<Record<string, unknown>> {
  const contexts = ['personal', 'work', 'learning', 'creative'] as const;
  const results: Record<string, unknown> = {};

  try {
    const { applyHebbianDecayBatch } = await import('../knowledge-graph/hebbian-dynamics');
    const { propagateBatch } = await import('../knowledge-graph/confidence-propagation');

    for (const ctx of contexts) {
      await job.updateProgress(contexts.indexOf(ctx) * 25);
      try {
        const hebbianResult = await applyHebbianDecayBatch(ctx);
        results[`${ctx}_hebbian`] = hebbianResult;
      } catch (err) {
        logger.warn(`Hebbian decay failed for context ${ctx}`, {
          operation: 'worker',
          queue: 'hebbian-decay',
          error: err instanceof Error ? err.message : String(err),
        });
        results[`${ctx}_hebbian`] = { status: 'skipped', error: err instanceof Error ? err.message : String(err) };
      }
      try {
        const bayesianResult = await propagateBatch(ctx);
        results[`${ctx}_bayesian`] = bayesianResult;
      } catch (err) {
        logger.warn(`Bayesian propagation failed for context ${ctx}`, {
          operation: 'worker',
          queue: 'hebbian-decay',
          error: err instanceof Error ? err.message : String(err),
        });
        results[`${ctx}_bayesian`] = { status: 'skipped', error: err instanceof Error ? err.message : String(err) };
      }
    }

    await job.updateProgress(100);
    return { status: 'completed', ...results };
  } catch (error) {
    logger.warn('Hebbian decay worker: services not available', {
      operation: 'worker',
      queue: 'hebbian-decay',
      error: error instanceof Error ? error.message : String(error),
    });
    return { status: 'skipped' };
  }
}

// Worker processor map — now receives the full BullJob for progress reporting
const processors: Record<string, (job: BullJob) => Promise<Record<string, unknown>>> = {
  'memory-consolidation': processMemoryConsolidation,
  'rag-indexing': processRagIndexing,
  'email-processing': processEmailProcessing,
  'graph-indexing': processGraphIndexing,
  'sleep-compute': processSleepCompute,
  'embedding-drift': processEmbeddingDrift,
  'hebbian-decay': processHebbianDecay,
};

// --- Dead Letter Queue helper ---

/**
 * Log a job to the dead letter queue.
 * In this implementation we log with full context for alerting/debugging.
 * A dedicated DLQ queue could be added in the future if needed.
 */
function handleDeadLetter(queueName: string, job: BullJob | null, err: Error | unknown): void {
  const counters = getOrCreateCounters(queueName);
  counters.dlq++;

  logger.error(`[DLQ] Job exhausted all retries: ${queueName}`, err instanceof Error ? err : undefined, {
    operation: 'worker-dlq',
    queue: queueName,
    jobId: job?.id,
    jobName: job?.name,
    attemptsMade: job?.attemptsMade,
    maxAttempts: job?.opts?.attempts,
    data: job?.data ? JSON.stringify(job.data).slice(0, 500) : undefined,
  });
}

// --- Stalled job config ---

const STALLED_CHECK_INTERVAL_MS = 30_000; // check every 30s
const MAX_STALLED_COUNT = 2; // mark as failed after 2 stall detections

/**
 * Start all queue workers. No-op if REDIS_URL is not configured.
 */
export async function startWorkers(): Promise<boolean> {
  if (workersStarted) return true;

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    logger.warn('Queue workers not started: REDIS_URL not configured', {
      operation: 'worker',
    });
    workersStarted = true;
    return false;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Worker } = require('bullmq');
    const connection = { url: redisUrl };

    const concurrencyMap: Record<string, number> = {
      'memory-consolidation': 1,
      'rag-indexing': 2,
      'email-processing': 2,
      'graph-indexing': 1,
      'sleep-compute': 1,
      'embedding-drift': 1,
      'hebbian-decay': 1,
    };

    for (const [queueName, processor] of Object.entries(processors)) {
      const counters = getOrCreateCounters(queueName);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const worker = new Worker(
        queueName,
        async (job: BullJob) => {
          counters.active++;
          const startTime = Date.now();
          try {
            const result = await processor(job);
            const duration = Date.now() - startTime;
            recordQueueJob(queueName, 'completed', duration);
            counters.completed++;
            counters.lastCompletedAt = new Date().toISOString();
            return result;
          } catch (error) {
            const duration = Date.now() - startTime;
            recordQueueJob(queueName, 'failed', duration);
            counters.failed++;
            counters.lastFailedAt = new Date().toISOString();
            throw error;
          } finally {
            counters.active = Math.max(0, counters.active - 1);
          }
        },
        {
          connection,
          concurrency: concurrencyMap[queueName] || 1,
          stalledInterval: STALLED_CHECK_INTERVAL_MS,
          maxStalledCount: MAX_STALLED_COUNT,
        },
      );

      // --- Event handlers ---

      worker.on('completed', (job: unknown) => {
        const j = job as BullJob | undefined;
        logger.debug(`Worker job completed: ${queueName}`, {
          operation: 'worker',
          queue: queueName,
          jobId: j?.id,
          jobName: j?.name,
        });
      });

      worker.on('failed', (job: unknown, err: unknown) => {
        const j = job as BullJob | undefined;
        const maxAttempts = j?.opts?.attempts ?? 3;
        const attemptsMade = j?.attemptsMade ?? 0;
        const isFinalAttempt = attemptsMade >= maxAttempts;

        logger.error(`Worker job failed: ${queueName}`, err instanceof Error ? err : undefined, {
          operation: 'worker',
          queue: queueName,
          jobId: j?.id,
          jobName: j?.name,
          attemptsMade,
          maxAttempts,
          isFinalAttempt,
          errorMessage: err instanceof Error ? err.message : String(err),
        });

        // Dead letter queue: log exhausted jobs with full context
        if (isFinalAttempt) {
          handleDeadLetter(queueName, j ?? null, err);
        }
      });

      worker.on('error', (err: unknown) => {
        logger.error(`Worker error: ${queueName}`, err instanceof Error ? err : undefined, {
          operation: 'worker',
          queue: queueName,
        });
      });

      worker.on('stalled', (jobId: unknown) => {
        counters.stalled++;
        logger.warn(`Worker job stalled: ${queueName}`, {
          operation: 'worker',
          queue: queueName,
          jobId: String(jobId),
          stalledCount: counters.stalled,
        });
      });

      workers.set(queueName, worker as unknown as BullWorker);
    }

    workersStarted = true;
    logger.info('Queue workers started', {
      operation: 'worker',
      queues: Object.keys(processors),
      stalledCheckIntervalMs: STALLED_CHECK_INTERVAL_MS,
      maxStalledCount: MAX_STALLED_COUNT,
    });
    return true;
  } catch (error) {
    logger.warn('Queue workers not available (BullMQ may not be installed)', {
      operation: 'worker',
      error: error instanceof Error ? error.message : String(error),
    });
    workersStarted = true;
    return false;
  }
}

/**
 * Stop all queue workers gracefully.
 */
export async function stopWorkers(): Promise<void> {
  if (workers.size === 0) return;

  logger.info('Stopping queue workers...', { operation: 'worker' });

  const closePromises: Promise<void>[] = [];
  for (const [name, worker] of workers.entries()) {
    closePromises.push(
      worker.close().catch((err) => {
        logger.error(`Failed to close worker ${name}`, err instanceof Error ? err : undefined, {
          operation: 'worker',
        });
      }),
    );
  }

  await Promise.all(closePromises);
  workers.clear();
  workersStarted = false;
  logger.info('Queue workers stopped', { operation: 'worker' });
}
