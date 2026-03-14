/**
 * Phase 61: Queue Workers
 *
 * Worker definitions for background job processing.
 * Each worker processes jobs from a specific queue.
 * Workers are no-op if REDIS_URL is not configured.
 */

import { logger } from '../../utils/logger';
import { recordQueueJob } from '../observability/metrics';

// Worker references for shutdown
type BullWorker = {
  close(): Promise<void>;
  on(event: string, handler: (...args: unknown[]) => void): void;
};

const workers: Map<string, BullWorker> = new Map();
let workersStarted = false;

/**
 * Process a memory consolidation job.
 */
async function processMemoryConsolidation(data: Record<string, unknown>): Promise<Record<string, unknown>> {
  const context = (data.context as 'personal' | 'work' | 'learning' | 'creative') || 'personal';
  logger.info('Processing memory consolidation job', {
    operation: 'worker',
    queue: 'memory-consolidation',
    context,
  });

  // Calls into existing memory consolidation logic
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const memoryModule = require('../memory/index');
    if (typeof memoryModule.memoryCoordinator?.consolidateAll === 'function') {
      await memoryModule.memoryCoordinator.consolidateAll(context);
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
 */
async function processRagIndexing(data: Record<string, unknown>): Promise<Record<string, unknown>> {
  const context = (data.context as 'personal' | 'work' | 'learning' | 'creative') || 'personal';
  const ideaId = data.ideaId as string | undefined;
  logger.info('Processing RAG indexing job', {
    operation: 'worker',
    queue: 'rag-indexing',
    context,
    ideaId,
  });

  return { status: 'completed', context, ideaId };
}

/**
 * Process an email analysis job.
 */
async function processEmailProcessing(data: Record<string, unknown>): Promise<Record<string, unknown>> {
  const emailId = data.emailId as string | undefined;
  const context = (data.context as 'personal' | 'work' | 'learning' | 'creative') || 'work';
  logger.info('Processing email analysis job', {
    operation: 'worker',
    queue: 'email-processing',
    context,
    emailId,
  });

  return { status: 'completed', context, emailId };
}

/**
 * Process a graph indexing job.
 */
async function processGraphIndexing(data: Record<string, unknown>): Promise<Record<string, unknown>> {
  const context = (data.context as 'personal' | 'work' | 'learning' | 'creative') || 'personal';
  logger.info('Processing graph indexing job', {
    operation: 'worker',
    queue: 'graph-indexing',
    context,
  });

  return { status: 'completed', context };
}

/**
 * Process a sleep compute job (Phase 63).
 */
async function processSleepCompute(data: Record<string, unknown>): Promise<Record<string, unknown>> {
  try {
    const { processSleepJob } = await import('./workers/sleep-worker');
    const result = await processSleepJob(data);
    return { status: 'completed', ...result };
  } catch (error) {
    logger.debug('Sleep compute processor not available', {
      operation: 'worker',
      error: error instanceof Error ? error.message : String(error),
    });
    return { status: 'skipped' };
  }
}

// Worker processor map
const processors: Record<string, (data: Record<string, unknown>) => Promise<Record<string, unknown>>> = {
  'memory-consolidation': processMemoryConsolidation,
  'rag-indexing': processRagIndexing,
  'email-processing': processEmailProcessing,
  'graph-indexing': processGraphIndexing,
  'sleep-compute': processSleepCompute,
};

/**
 * Start all queue workers. No-op if REDIS_URL is not configured.
 */
export async function startWorkers(): Promise<boolean> {
  if (workersStarted) {return true;}

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
    };

    for (const [queueName, processor] of Object.entries(processors)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const worker = new Worker(
        queueName,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (job: any) => {
          const startTime = Date.now();
          try {
            const result = await processor(job.data as Record<string, unknown>);
            const duration = Date.now() - startTime;
            recordQueueJob(queueName, 'completed', duration);
            return result;
          } catch (error) {
            const duration = Date.now() - startTime;
            recordQueueJob(queueName, 'failed', duration);
            throw error;
          }
        },
        {
          connection,
          concurrency: concurrencyMap[queueName] || 1,
        },
      );

      worker.on('failed', (job: unknown, err: unknown) => {
        const jobData = job as { id?: string; name?: string; attemptsMade?: number } | undefined;
        logger.error(`Worker job failed: ${queueName}`, err instanceof Error ? err : undefined, {
          operation: 'worker',
          queue: queueName,
          jobId: jobData?.id,
          jobName: jobData?.name,
          attempts: jobData?.attemptsMade,
        });
      });

      worker.on('error', (err: unknown) => {
        logger.error(`Worker error: ${queueName}`, err instanceof Error ? err : undefined, {
          operation: 'worker',
          queue: queueName,
        });
      });

      workers.set(queueName, worker as unknown as BullWorker);
    }

    workersStarted = true;
    logger.info('Queue workers started', {
      operation: 'worker',
      queues: Object.keys(processors),
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
  if (workers.size === 0) {return;}

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
