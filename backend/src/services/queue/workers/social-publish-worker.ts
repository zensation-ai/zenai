/**
 * Social Publish Worker
 *
 * Processes delayed BullMQ jobs from the 'social-publish' queue.
 * Each job carries { postId, context } and triggers publishPost()
 * from the social-publisher service.
 *
 * @module services/queue/workers/social-publish-worker
 */

import { Worker } from 'bullmq';
import { logger } from '../../../utils/logger';
import { AIContext } from '../../../utils/database-context';
import { publishPost } from '../../social/social-publisher';
import { queryContext } from '../../../utils/database-context';

export interface SocialPublishJobData {
  postId: string;
  context: AIContext;
}

// BullMQ Job shape (minimal typing to avoid hard dependency)
interface BullJob {
  id?: string;
  name?: string;
  data: SocialPublishJobData;
  updateProgress(progress: number | Record<string, unknown>): Promise<void>;
}

/**
 * Process a single social-publish job.
 */
export async function processSocialPublishJob(job: BullJob): Promise<Record<string, unknown>> {
  const { postId, context } = job.data;

  logger.info(`[SocialPublish] Processing job for post ${postId} in context ${context}`, {
    operation: 'social-publish-worker',
    postId,
    context,
  });

  await job.updateProgress(10);

  let result;
  try {
    result = await publishPost(context, postId);
  } catch (error) {
    // Mark post as failed in DB, then rethrow so BullMQ retries/DLQ works
    logger.error(`[SocialPublish] publishPost threw for post ${postId}`, error instanceof Error ? error : undefined, {
      operation: 'social-publish-worker',
      postId,
      context,
    });

    try {
      await queryContext(context, `
        UPDATE social_posts SET status = 'failed', updated_at = NOW() WHERE id = $1
      `, [postId]);
    } catch (dbErr) {
      logger.error('[SocialPublish] Failed to update post status to failed in DB', dbErr instanceof Error ? dbErr : undefined, {
        operation: 'social-publish-worker',
        postId,
      });
    }

    throw error;
  }

  await job.updateProgress(100);

  if (result.success) {
    logger.info(`[SocialPublish] Published post ${postId} on ${result.platformPostId ?? 'unknown platform'}`, {
      operation: 'social-publish-worker',
      postId,
      context,
    });
    return { status: 'published', postId, context };
  } else {
    logger.error(`[SocialPublish] Failed to publish post ${postId}: ${result.error}`, undefined, {
      operation: 'social-publish-worker',
      postId,
      context,
    });
    throw new Error(`Publish failed for post ${postId}: ${result.error ?? 'unknown error'}`);
  }
}

/**
 * Create and start the social-publish BullMQ worker.
 * Returns the Worker instance for lifecycle management.
 */
export function createSocialPublishWorker(connection: { url: string }): Worker | null {
  try {

    const { Worker } = require('bullmq');

    const worker = new Worker(
      'social-publish',
      async (job: BullJob) => processSocialPublishJob(job),
      {
        connection,
        concurrency: 2,
      }
    );

    worker.on('completed', (job: unknown) => {
      const j = job as BullJob | undefined;
      logger.debug('[SocialPublish] Job completed', {
        operation: 'social-publish-worker',
        jobId: j?.id,
      });
    });

    worker.on('failed', (job: unknown, err: unknown) => {
      const j = job as BullJob | undefined;
      logger.error('[SocialPublish] Job failed', err instanceof Error ? err : undefined, {
        operation: 'social-publish-worker',
        jobId: j?.id,
        postId: j?.data?.postId,
        error: err instanceof Error ? err.message : String(err),
      });
    });

    worker.on('error', (err: unknown) => {
      logger.error('[SocialPublish] Worker error', err instanceof Error ? err : undefined, {
        operation: 'social-publish-worker',
      });
    });

    logger.info('[SocialPublish] Worker started (concurrency=2)', { operation: 'social-publish-worker' });

    return worker as Worker;
  } catch (error) {
    logger.warn('[SocialPublish] Worker could not start (BullMQ unavailable?)', {
      operation: 'social-publish-worker',
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
