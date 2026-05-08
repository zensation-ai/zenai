/**
 * Social Publisher Service
 *
 * Orchestrates publishing across platforms. Selects the right client,
 * handles retries, and records results.
 *
 * @module services/social/social-publisher
 */

import { queryContext, AIContext } from '../../utils/database-context';
import { logger } from '../../utils/logger';
import { createTwitterClient } from './twitter-client';
import { createLinkedInClient } from './linkedin-client';
import { createDiscordClient } from './discord-client';
import {
  SocialPlatform,
  PlatformClient,
  PlatformPublishResult,
  SocialPost,
  PostStatus,
} from './platform-types';

// ===========================================
// Queue singleton (module-level)
// ===========================================

let socialPublishQueue: import('bullmq').Queue | null = null;

function getSocialPublishQueue(): import('bullmq').Queue | null {
  if (!process.env.REDIS_URL) return null;
  if (!socialPublishQueue) {
    const { Queue } = require('bullmq');
    socialPublishQueue = new Queue('social-publish', {
      connection: { url: process.env.REDIS_URL },
    });
  }
  return socialPublishQueue;
}

// ===========================================
// Schedule Post (BullMQ integration)
// ===========================================

/**
 * Schedule a post for future publishing.
 * Updates the post's status to 'scheduled' in the DB and enqueues a
 * delayed BullMQ job so the social-publish worker fires at the right time.
 * Gracefully degrades if Redis / BullMQ is not available.
 */
export async function schedulePost(
  context: AIContext,
  postId: string,
  scheduledAt: Date
): Promise<void> {
  // 1. Update status + scheduled_at in DB
  await queryContext(context, `
    UPDATE social_posts
    SET status = 'scheduled', scheduled_at = $2, updated_at = NOW()
    WHERE id = $1
  `, [postId, scheduledAt]);

  logger.info(`[SocialPublisher] Post ${postId} marked as scheduled for ${scheduledAt.toISOString()}`, {
    operation: 'schedule-post',
    postId,
    context,
  });

  // 2. Enqueue delayed BullMQ job (degrade gracefully if Redis unavailable)
  const queue = getSocialPublishQueue();
  if (!queue) {
    logger.warn('[SocialPublisher] REDIS_URL not set — skipping BullMQ job for scheduled post', {
      operation: 'schedule-post',
      postId,
    });
    return;
  }

  const delay = Math.max(0, scheduledAt.getTime() - Date.now());

  try {
    await queue.add(
      `publish:${postId}`,
      { postId, context } satisfies { postId: string; context: AIContext },
      {
        delay,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 100,
        removeOnFail: 500,
      }
    );

    logger.info(`[SocialPublisher] BullMQ job enqueued for post ${postId} with delay ${delay}ms`, {
      operation: 'schedule-post',
      postId,
      delay,
    });
  } catch (error) {
    logger.warn('[SocialPublisher] Failed to enqueue BullMQ job — post is still marked scheduled in DB', {
      operation: 'schedule-post',
      postId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// ===========================================
// Metrics Jobs Enqueueing
// ===========================================

async function enqueueMetricsJobs(postId: string, context: AIContext): Promise<void> {
  if (!process.env.REDIS_URL) return;
  const { Queue } = require('bullmq');
  const queue = new Queue('social-metrics', { connection: { url: process.env.REDIS_URL } });
  const delays = [60 * 60 * 1000, 24 * 60 * 60 * 1000, 7 * 24 * 60 * 60 * 1000]; // 1h, 24h, 7d
  try {
    for (const delay of delays) {
      await queue.add(`metrics:${postId}:${delay}`, { postId, context }, {
        delay,
        removeOnComplete: 50,
        removeOnFail: 100,
      });
    }
  } finally {
    await queue.close();
  }
}

// ===========================================
// DB Token Loaders
// ===========================================

async function loadTwitterTokenFromDb(context: AIContext): Promise<import('./twitter-client').TwitterTokenInput> {
  try {
    const result = await queryContext(context,
      `SELECT id, access_token_encrypted, refresh_token_encrypted, token_expires_at
       FROM social_accounts WHERE platform = 'twitter' AND is_active = true LIMIT 1`,
    );
    if (!result.rows.length) {
      return { accessToken: process.env.TWITTER_ACCESS_TOKEN, refreshToken: null, expiresAt: null, dbId: null };
    }
    const row = result.rows[0];
    const { decrypt, isEncryptionAvailable } = await import('../security/field-encryption');
    const dec = (s: string | null) => s ? (isEncryptionAvailable() ? decrypt(s) : s) : null;
    return {
      accessToken: dec(row.access_token_encrypted) ?? undefined,
      refreshToken: dec(row.refresh_token_encrypted),
      expiresAt: row.token_expires_at ? new Date(row.token_expires_at) : null,
      dbId: row.id,
    };
  } catch {
    return { accessToken: process.env.TWITTER_ACCESS_TOKEN, refreshToken: null, expiresAt: null, dbId: null };
  }
}

async function loadLinkedInTokenFromDb(context: AIContext): Promise<import('./linkedin-client').LinkedInTokenInput> {
  try {
    const result = await queryContext(context,
      `SELECT id, access_token_encrypted, refresh_token_encrypted, token_expires_at, metadata
       FROM social_accounts WHERE platform = 'linkedin' AND is_active = true LIMIT 1`,
    );
    if (!result.rows.length) {
      return { accessToken: process.env.LINKEDIN_ACCESS_TOKEN, refreshToken: null, expiresAt: null, dbId: null, metadata: {} };
    }
    const row = result.rows[0];
    const { decrypt, isEncryptionAvailable } = await import('../security/field-encryption');
    const dec = (s: string | null) => s ? (isEncryptionAvailable() ? decrypt(s) : s) : null;
    return {
      accessToken: dec(row.access_token_encrypted) ?? undefined,
      refreshToken: dec(row.refresh_token_encrypted),
      expiresAt: row.token_expires_at ? new Date(row.token_expires_at) : null,
      dbId: row.id,
      metadata: row.metadata ?? {},
    };
  } catch {
    return { accessToken: process.env.LINKEDIN_ACCESS_TOKEN, refreshToken: null, expiresAt: null, dbId: null, metadata: {} };
  }
}

// ===========================================
// Platform Client Registry
// ===========================================

async function getClient(platform: SocialPlatform, context: AIContext): Promise<PlatformClient> {
  switch (platform) {
    case 'twitter':
      return createTwitterClient(await loadTwitterTokenFromDb(context));
    case 'linkedin':
      return createLinkedInClient(await loadLinkedInTokenFromDb(context));
    case 'discord':
      return createDiscordClient();
    default:
      throw new Error(`Unknown platform: ${platform}`);
  }
}

// ===========================================
// Publisher Service
// ===========================================

/**
 * Publish a social post to its target platform.
 */
export async function publishPost(
  context: AIContext,
  postId: string
): Promise<PlatformPublishResult> {
  // Fetch post from DB
  const result = await queryContext(context, `
    SELECT * FROM social_posts WHERE id = $1
  `, [postId]);

  if (!result.rows.length) {
    return { success: false, error: 'Post not found' };
  }

  const post = result.rows[0] as SocialPost;

  if (post.status !== 'approved' && post.status !== 'scheduled') {
    return { success: false, error: `Post status is '${post.status}', expected 'approved' or 'scheduled'` };
  }

  const client = await getClient(post.platform, context);

  if (!client.isConfigured()) {
    await updatePostStatus(context, postId, 'failed');
    return { success: false, error: `${post.platform} client not configured` };
  }

  // Check for thread mode (content separated by ---)
  const isThread = post.content.includes('\n---\n');
  let publishResult: PlatformPublishResult;

  if (isThread && client.publishThread) {
    const threadPosts = post.content.split('\n---\n').map((p) => p.trim()).filter(Boolean);
    publishResult = await client.publishThread(threadPosts);
  } else {
    publishResult = await client.publish(post.content, post.media_urls);
  }

  // Update post status
  if (publishResult.success) {
    await queryContext(context, `
      UPDATE social_posts
      SET status = 'published',
          published_at = NOW(),
          platform_post_id = $2,
          updated_at = NOW()
      WHERE id = $1
    `, [postId, publishResult.platformPostId || null]);

    logger.info(`[SocialPublisher] Post published: ${postId} on ${post.platform}`);

    if (publishResult.platformPostId) {
      enqueueMetricsJobs(postId, context).catch((err) => {
        logger.warn('[SocialPublisher] Failed to enqueue metrics jobs', {
          postId, error: err instanceof Error ? err.message : String(err),
        });
      });
    }
  } else {
    await updatePostStatus(context, postId, 'failed');
    logger.error(`[SocialPublisher] Post failed: ${postId} on ${post.platform} - ${publishResult.error}`);
  }

  return publishResult;
}

/**
 * Get publishing status for all configured platforms.
 */
export function getPlatformStatus(): Record<SocialPlatform, boolean> {
  return {
    twitter: createTwitterClient().isConfigured(),
    linkedin: createLinkedInClient().isConfigured(),
    discord: createDiscordClient().isConfigured(),
  };
}

// ===========================================
// Database Helpers
// ===========================================

async function updatePostStatus(
  context: AIContext,
  postId: string,
  status: PostStatus
): Promise<void> {
  await queryContext(context, `
    UPDATE social_posts SET status = $2, updated_at = NOW() WHERE id = $1
  `, [postId, status]);
}

/**
 * Create a new social post draft.
 */
export async function createPostDraft(
  context: AIContext,
  data: {
    source_type: string;
    source_id?: string;
    platform: SocialPlatform;
    content: string;
    media_urls?: string[];
    scheduled_at?: Date;
  }
): Promise<SocialPost> {
  const result = await queryContext(context, `
    INSERT INTO social_posts (source_type, source_id, platform, content, media_urls, status, scheduled_at)
    VALUES ($1, $2, $3, $4, $5, 'draft', $6)
    RETURNING *
  `, [
    data.source_type,
    data.source_id || null,
    data.platform,
    data.content,
    data.media_urls || [],
    data.scheduled_at || null,
  ]);

  return result.rows[0] as SocialPost;
}

/**
 * List social posts with optional filters.
 */
export async function listPosts(
  context: AIContext,
  filters?: {
    status?: PostStatus;
    platform?: SocialPlatform;
    limit?: number;
  }
): Promise<SocialPost[]> {
  const conditions: string[] = [];
  const params: (string | number | boolean | Date | null)[] = [];
  let paramIdx = 1;

  if (filters?.status) {
    conditions.push(`status = $${paramIdx++}`);
    params.push(filters.status);
  }
  if (filters?.platform) {
    conditions.push(`platform = $${paramIdx++}`);
    params.push(filters.platform);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = Math.min(Math.max(1, Math.floor(filters?.limit || 50)), 200);
  params.push(limit);

  const result = await queryContext(context, `
    SELECT * FROM social_posts ${where}
    ORDER BY created_at DESC
    LIMIT $${paramIdx}
  `, params);

  return result.rows as SocialPost[];
}

/**
 * Get a single post by ID.
 */
export async function getPost(
  context: AIContext,
  postId: string
): Promise<SocialPost | null> {
  const result = await queryContext(context, `
    SELECT * FROM social_posts WHERE id = $1
  `, [postId]);

  return result.rows[0] as SocialPost || null;
}

/**
 * Update a post draft.
 */
export async function updatePost(
  context: AIContext,
  postId: string,
  data: { content?: string; scheduled_at?: Date; platform?: SocialPlatform }
): Promise<SocialPost | null> {
  const sets: string[] = ['updated_at = NOW()'];
  const params: (string | number | boolean | Date | null)[] = [];
  let paramIdx = 1;

  if (data.content !== undefined) {
    sets.push(`content = $${paramIdx++}`);
    params.push(data.content);
  }
  if (data.scheduled_at !== undefined) {
    sets.push(`scheduled_at = $${paramIdx++}`);
    params.push(data.scheduled_at);
  }
  if (data.platform !== undefined) {
    sets.push(`platform = $${paramIdx++}`);
    params.push(data.platform);
  }

  params.push(postId);

  const result = await queryContext(context, `
    UPDATE social_posts SET ${sets.join(', ')} WHERE id = $${paramIdx} AND status = 'draft'
    RETURNING *
  `, params);

  return result.rows[0] as SocialPost || null;
}

/**
 * Delete a draft post.
 */
export async function deletePost(
  context: AIContext,
  postId: string
): Promise<boolean> {
  const result = await queryContext(context, `
    DELETE FROM social_posts WHERE id = $1 AND status = 'draft'
  `, [postId]);

  return (result.rowCount ?? 0) > 0;
}
