/**
 * Phase 61: BullMQ Job Queue Service
 *
 * Manages multiple named queues for background job processing.
 * Queues: memory-consolidation, rag-indexing, email-processing, graph-indexing.
 * Graceful degradation: operates as no-op if REDIS_URL is not configured.
 */

import { logger } from '../../utils/logger';
import { recordQueueJob } from '../observability/metrics';

// BullMQ types (resolved at runtime via dynamic import)
interface BullQueue {
  add(name: string, data: unknown, opts?: Record<string, unknown>): Promise<{ id: string | undefined }>;
  getJobCounts(): Promise<Record<string, number>>;
  clean(grace: number, limit: number, type: string): Promise<string[]>;
  close(): Promise<void>;
}

export interface JobOptions {
  attempts?: number;
  backoff?: { type: string; delay: number };
  delay?: number;
  priority?: number;
  removeOnComplete?: boolean | number;
  removeOnFail?: boolean | number;
}

export interface QueueStats {
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}

const QUEUE_NAMES = [
  'memory-consolidation',
  'rag-indexing',
  'email-processing',
  'graph-indexing',
  'sleep-compute',
  'embedding-drift',
  'hebbian-decay',
  'persistent-agent',
  'integration-sync',
] as const;

export type QueueName = (typeof QUEUE_NAMES)[number];

const DEFAULT_JOB_OPTIONS: JobOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 1000 },
  removeOnComplete: 100,
  removeOnFail: 500,
};

class QueueService {
  private queues: Map<string, BullQueue> = new Map();
  private initialized = false;
  private available = false;

  /**
   * Initialize all queues. No-op if REDIS_URL is not set.
   */
  async initialize(): Promise<boolean> {
    if (this.initialized) {return this.available;}

    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      logger.warn('QueueService: REDIS_URL not set, job queues disabled', {
        operation: 'queue',
      });
      this.initialized = true;
      this.available = false;
      return false;
    }

    try {
       
      const { Queue } = require('bullmq');
      const connection = { url: redisUrl };

      for (const name of QUEUE_NAMES) {
        const queue = new Queue(name, {
          connection,
          defaultJobOptions: {
            attempts: DEFAULT_JOB_OPTIONS.attempts,
            backoff: DEFAULT_JOB_OPTIONS.backoff,
            removeOnComplete: DEFAULT_JOB_OPTIONS.removeOnComplete,
            removeOnFail: DEFAULT_JOB_OPTIONS.removeOnFail,
          },
        });
        this.queues.set(name, queue as BullQueue);
      }

      this.initialized = true;
      this.available = true;
      logger.info('QueueService initialized with BullMQ', {
        operation: 'queue',
        queues: QUEUE_NAMES.length,
      });
      return true;
    } catch (error) {
      logger.warn('QueueService: BullMQ not available', {
        operation: 'queue',
        error: error instanceof Error ? error.message : String(error),
      });
      this.initialized = true;
      this.available = false;
      return false;
    }
  }

  /**
   * Enqueue a job to a named queue.
   */
  async enqueue(
    queueName: QueueName,
    jobName: string,
    data: Record<string, unknown>,
    opts?: JobOptions,
  ): Promise<string | null> {
    if (!this.available) {
      logger.debug('QueueService: enqueue skipped (not available)', {
        operation: 'queue',
        queue: queueName,
        job: jobName,
      });
      return null;
    }

    const queue = this.queues.get(queueName);
    if (!queue) {
      logger.warn('QueueService: unknown queue', {
        operation: 'queue',
        queue: queueName,
      });
      return null;
    }

    try {
      const mergedOpts = { ...DEFAULT_JOB_OPTIONS, ...opts };
      const job = await queue.add(jobName, data, mergedOpts as Record<string, unknown>);
      const jobId = job.id || null;

      recordQueueJob(queueName, 'enqueued');

      logger.debug('Job enqueued', {
        operation: 'queue',
        queue: queueName,
        job: jobName,
        jobId,
      });

      return jobId;
    } catch (error) {
      logger.error('Failed to enqueue job', error instanceof Error ? error : undefined, {
        operation: 'queue',
        queue: queueName,
        job: jobName,
      });
      return null;
    }
  }

  /**
   * Get a raw queue reference by name.
   */
  getQueue(name: QueueName): BullQueue | null {
    return this.queues.get(name) || null;
  }

  /**
   * Get stats for a single queue.
   */
  async getQueueStats(name: QueueName): Promise<QueueStats | null> {
    if (!this.available) {
      return {
        name,
        waiting: 0,
        active: 0,
        completed: 0,
        failed: 0,
        delayed: 0,
      };
    }

    const queue = this.queues.get(name);
    if (!queue) {return null;}

    try {
      const counts = await queue.getJobCounts();
      return {
        name,
        waiting: counts.waiting || 0,
        active: counts.active || 0,
        completed: counts.completed || 0,
        failed: counts.failed || 0,
        delayed: counts.delayed || 0,
      };
    } catch (error) {
      logger.error('Failed to get queue stats', error instanceof Error ? error : undefined, {
        operation: 'queue',
        queue: name,
      });
      return null;
    }
  }

  /**
   * Get stats for all queues.
   */
  async getAllStats(): Promise<QueueStats[]> {
    const results: QueueStats[] = [];
    for (const name of QUEUE_NAMES) {
      const stats = await this.getQueueStats(name);
      if (stats) {results.push(stats);}
    }
    return results;
  }

  /**
   * Clean completed/failed jobs from a queue.
   */
  async cleanQueue(name: QueueName, status: 'completed' | 'failed' = 'completed', gracePeriodMs: number = 3600_000): Promise<number> {
    if (!this.available) {return 0;}

    const queue = this.queues.get(name);
    if (!queue) {return 0;}

    try {
      const cleaned = await queue.clean(gracePeriodMs, 1000, status);
      logger.info('Queue cleaned', {
        operation: 'queue',
        queue: name,
        status,
        removed: cleaned.length,
      });
      return cleaned.length;
    } catch (error) {
      logger.error('Failed to clean queue', error instanceof Error ? error : undefined, {
        operation: 'queue',
        queue: name,
      });
      return 0;
    }
  }

  /**
   * Check if queue service is available.
   */
  isAvailable(): boolean {
    return this.available;
  }

  /**
   * Get list of configured queue names.
   */
  getQueueNames(): readonly string[] {
    return QUEUE_NAMES;
  }

  /**
   * Gracefully shut down all queues.
   */
  async shutdown(): Promise<void> {
    if (!this.available) {return;}

    logger.info('QueueService shutting down...', { operation: 'queue' });

    const closePromises: Promise<void>[] = [];
    for (const [name, queue] of this.queues.entries()) {
      closePromises.push(
        queue.close().catch((err) => {
          logger.error(`Failed to close queue ${name}`, err instanceof Error ? err : undefined, {
            operation: 'queue',
          });
        }),
      );
    }

    await Promise.all(closePromises);
    this.queues.clear();
    this.available = false;
    logger.info('QueueService shut down complete', { operation: 'queue' });
  }
}

// Singleton instance
let queueServiceInstance: QueueService | null = null;

/**
 * Get the singleton QueueService instance.
 */
export function getQueueService(): QueueService {
  if (!queueServiceInstance) {
    queueServiceInstance = new QueueService();
  }
  return queueServiceInstance;
}

/**
 * Reset the singleton (for testing).
 */
export function resetQueueService(): void {
  queueServiceInstance = null;
}

export { QUEUE_NAMES };
