/**
 * Social Metrics Worker
 *
 * Fetches engagement metrics from Twitter/LinkedIn after publish.
 * Called by BullMQ jobs scheduled at 1h, 24h, 7d post-publish.
 *
 * @module services/social/metrics-worker
 */

import { queryContext, AIContext } from '../../utils/database-context';
import { logger } from '../../utils/logger';
import { checkedFetch } from '../../utils/checked-http';

const TWITTER_API_BASE = 'https://api.twitter.com/2';

export async function fetchAndStoreMetrics(postId: string, context: AIContext): Promise<void> {
  const postResult = await queryContext(context,
    `SELECT platform, platform_post_id FROM social_posts WHERE id = $1`,
    [postId],
  );
  if (!postResult.rows.length) {
    logger.warn('[MetricsWorker] Post not found', { postId });
    return;
  }

  const { platform, platform_post_id } = postResult.rows[0] as {
    platform: string; platform_post_id: string | null;
  };

  if (!platform_post_id || platform_post_id === 'unknown') {
    logger.warn('[MetricsWorker] Missing platform_post_id — skipping metrics fetch', { postId, platform });
    return;
  }

  if (platform === 'twitter') {
    await fetchTwitterMetrics(postId, platform_post_id, context);
  } else if (platform === 'linkedin') {
    await fetchLinkedInMetrics(postId, platform_post_id, context);
  }
  // Discord has no metrics API
}

async function fetchTwitterMetrics(postId: string, tweetId: string, context: AIContext): Promise<void> {
  const accountResult = await queryContext(context,
    `SELECT access_token_encrypted FROM social_accounts WHERE platform = 'twitter' AND is_active = true LIMIT 1`,
  );

  let accessToken = process.env.TWITTER_ACCESS_TOKEN;
  if (accountResult.rows.length) {
    const { decrypt, isEncryptionAvailable } = await import('../security/field-encryption');
    const enc = accountResult.rows[0].access_token_encrypted as string;
    accessToken = isEncryptionAvailable() ? decrypt(enc) : enc;
  }

  if (!accessToken) {
    logger.warn('[MetricsWorker] No Twitter token — cannot fetch metrics');
    return;
  }

  try {
    const res = await checkedFetch(
      `${TWITTER_API_BASE}/tweets/${tweetId}?tweet.fields=public_metrics`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );

    if (!res.ok) {
      logger.warn('[MetricsWorker] Twitter metrics fetch failed', { status: res.status, tweetId });
      return;
    }

    const data = await res.json() as {
      data: { public_metrics: {
        impression_count: number; like_count: number;
        retweet_count: number; reply_count: number; quote_count: number;
      }}
    };

    const m = data.data.public_metrics;
    const metrics = {
      fetched_at: new Date().toISOString(),
      impressions: m.impression_count,
      likes: m.like_count,
      retweets: m.retweet_count,
      replies: m.reply_count,
      quotes: m.quote_count,
    };

    await queryContext(context,
      `UPDATE social_posts SET metrics = $1, updated_at = NOW() WHERE id = $2`,
      [JSON.stringify(metrics), postId],
    );

    logger.info('[MetricsWorker] Twitter metrics stored', { postId, impressions: metrics.impressions });
  } catch (error) {
    logger.error('[MetricsWorker] Error fetching Twitter metrics',
      error instanceof Error ? error : undefined, { postId });
  }
}

async function fetchLinkedInMetrics(postId: string, shareUrn: string, context: AIContext): Promise<void> {
  const accountResult = await queryContext(context,
    `SELECT access_token_encrypted, metadata FROM social_accounts WHERE platform = 'linkedin' AND is_active = true LIMIT 1`,
  );
  if (!accountResult.rows.length) return;

  const row = accountResult.rows[0] as { access_token_encrypted: string; metadata: Record<string, unknown> };
  const { decrypt, isEncryptionAvailable } = await import('../security/field-encryption');
  const accessToken = isEncryptionAvailable()
    ? decrypt(row.access_token_encrypted)
    : row.access_token_encrypted;

  const orgUrn = row.metadata?.org_urn as string | undefined;
  if (!orgUrn) return; // no org URN — LinkedIn analytics not available

  try {
    const bareShareId = shareUrn.startsWith('urn:li:')
      ? shareUrn.split(':').pop()!
      : shareUrn;
    const encodedShareUrn = encodeURIComponent(`urn:li:ugcPost:${bareShareId}`);
    const encodedOrgUrn = encodeURIComponent(orgUrn);
    const url = `https://api.linkedin.com/v2/organizationalEntityShareStatistics?q=organizationalEntity&organizationalEntity=${encodedOrgUrn}&ugcPosts=List(${encodedShareUrn})`;

    const res = await checkedFetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'X-Restli-Protocol-Version': '2.0.0',
      },
    });

    if (!res.ok) {
      logger.warn('[MetricsWorker] LinkedIn metrics fetch failed', { status: res.status });
      return;
    }

    const data = await res.json() as {
      elements: Array<{
        totalShareStatistics: {
          impressionCount: number; likeCount: number;
          clickCount: number; shareCount: number;
        }
      }>
    };

    if (!data.elements?.length) return;
    const s = data.elements[0].totalShareStatistics;

    const metrics = {
      fetched_at: new Date().toISOString(),
      impressions: s.impressionCount,
      likes: s.likeCount,
      clicks: s.clickCount,
      shares: s.shareCount,
    };

    await queryContext(context,
      `UPDATE social_posts SET metrics = $1, updated_at = NOW() WHERE id = $2`,
      [JSON.stringify(metrics), postId],
    );

    logger.info('[MetricsWorker] LinkedIn metrics stored', { postId });
  } catch (error) {
    logger.error('[MetricsWorker] Error fetching LinkedIn metrics',
      error instanceof Error ? error : undefined, { postId });
  }
}

// ── BullMQ Worker Registration ─────────────────────────────────────────────────

let metricsWorkerStarted = false;

export function startMetricsWorker(): void {
  if (metricsWorkerStarted || !process.env.REDIS_URL) return;
  metricsWorkerStarted = true;

  const { Worker } = require('bullmq');
  const worker = new Worker(
    'social-metrics',
    async (job: { data: { postId: string; context: AIContext } }) => {
      await fetchAndStoreMetrics(job.data.postId, job.data.context);
    },
    { connection: { url: process.env.REDIS_URL } },
  );

  worker.on('failed', (job: unknown, err: Error) => {
    logger.error('[MetricsWorker] Job failed', err, { job });
  });

  logger.info('[MetricsWorker] Worker started');
}
