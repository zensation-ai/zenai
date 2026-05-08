/**
 * Social Publisher
 *
 * Orchestrates publishing social media posts to Twitter/X and Discord.
 * Supports immediate publishing and scheduling for later execution.
 */

import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import {
  isTwitterAvailable,
  tweet,
} from './twitter-client';
import {
  isDiscordAvailable,
  sendMessage,
} from './discord-client';

// ===========================================
// Types
// ===========================================

export type SocialPlatform = 'twitter' | 'discord';

export interface SocialPost {
  content: string;
  platforms: SocialPlatform[];
  discordChannelId?: string;
}

export interface PublishResult {
  platform: SocialPlatform;
  success: boolean;
  post_id?: string;
  url?: string;
  error?: string;
}

export type ScheduledPostStatus = 'scheduled' | 'published' | 'failed' | 'cancelled';

export interface SchedulePostInput {
  content: string;
  platforms: SocialPlatform[];
  scheduled_at: Date;
  discordChannelId?: string;
}

export interface ScheduledPost {
  id: string;
  content: string;
  platforms: SocialPlatform[];
  scheduled_at: string;
  status: ScheduledPostStatus;
  created_at: string;
  discordChannelId?: string;
}

export interface SocialAnalytics {
  twitter?: {
    total_posts: number;
    total_likes: number;
    total_retweets: number;
    total_impressions: number;
    engagement_rate: number;
  };
  discord?: {
    total_messages: number;
    total_reactions: number;
  };
}

// In-memory store for scheduled posts (replace with DB persistence when ready)
const scheduledPostsStore = new Map<string, ScheduledPost>();

// ===========================================
// Platform Publishers
// ===========================================

/**
 * Publish to Twitter/X
 */
export async function publishToTwitter(content: string): Promise<PublishResult> {
  if (!isTwitterAvailable()) {
    return { platform: 'twitter', success: false, error: 'Twitter is not configured' };
  }

  try {
    const result = await tweet(content);
    return {
      platform: 'twitter',
      success: true,
      post_id: result.id,
      url: result.url,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to publish to Twitter', undefined, { message });
    return { platform: 'twitter', success: false, error: message };
  }
}

/**
 * Publish to Discord
 */
export async function publishToDiscord(
  content: string,
  options: { channelId?: string } = {}
): Promise<PublishResult> {
  if (!isDiscordAvailable()) {
    return { platform: 'discord', success: false, error: 'Discord is not configured' };
  }

  try {
    await sendMessage(content, { channelId: options.channelId });
    return { platform: 'discord', success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to publish to Discord', undefined, { message });
    return { platform: 'discord', success: false, error: message };
  }
}

// ===========================================
// Multi-Platform Publishing
// ===========================================

/**
 * Publish a post to all specified platforms simultaneously
 */
export async function publishToAll(post: SocialPost): Promise<PublishResult[]> {
  if (!post.content || post.content.trim().length === 0) {
    throw new Error('Post content cannot be empty');
  }

  if (!post.platforms || post.platforms.length === 0) {
    throw new Error('At least one platform must be specified');
  }

  logger.info('Publishing to platforms', { platforms: post.platforms });

  const results = await Promise.all(
    post.platforms.map(platform => {
      switch (platform) {
        case 'twitter':
          return publishToTwitter(post.content);
        case 'discord':
          return publishToDiscord(post.content, { channelId: post.discordChannelId });
        default: {
          const p = platform as string;
          return Promise.resolve<PublishResult>({
            platform: p as SocialPlatform,
            success: false,
            error: `Unknown platform: ${p}`,
          });
        }
      }
    })
  );

  return results;
}

// ===========================================
// Scheduling
// ===========================================

/**
 * Schedule a post for future publishing
 */
export async function schedulePost(input: SchedulePostInput): Promise<ScheduledPost> {
  if (!input.content || input.content.trim().length === 0) {
    throw new Error('Post content cannot be empty');
  }

  if (!input.platforms || input.platforms.length === 0) {
    throw new Error('At least one platform must be specified');
  }

  const now = Date.now();
  const scheduledTime = input.scheduled_at instanceof Date
    ? input.scheduled_at.getTime()
    : new Date(input.scheduled_at).getTime();

  if (scheduledTime <= now) {
    throw new Error('Scheduled time must be in the future');
  }

  const post: ScheduledPost = {
    id: uuidv4(),
    content: input.content,
    platforms: input.platforms,
    scheduled_at: input.scheduled_at instanceof Date
      ? input.scheduled_at.toISOString()
      : new Date(input.scheduled_at).toISOString(),
    status: 'scheduled',
    created_at: new Date().toISOString(),
    discordChannelId: input.discordChannelId,
  };

  scheduledPostsStore.set(post.id, post);
  logger.info('Post scheduled', { id: post.id, scheduled_at: post.scheduled_at });

  return post;
}

/**
 * Get all scheduled (pending) posts
 */
export async function getScheduledPosts(): Promise<ScheduledPost[]> {
  return Array.from(scheduledPostsStore.values())
    .filter(p => p.status === 'scheduled')
    .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());
}

/**
 * Cancel a scheduled post
 */
export async function cancelScheduledPost(id: string): Promise<void> {
  const post = scheduledPostsStore.get(id);

  if (!post) {
    throw new Error('Scheduled post not found');
  }

  scheduledPostsStore.delete(id);
  logger.info('Scheduled post cancelled', { id });
}

// ===========================================
// Analytics
// ===========================================

/**
 * Get aggregated social media analytics
 *
 * Returns platform-specific stats. Falls back gracefully when
 * credentials are not configured.
 */
export async function getSocialAnalytics(): Promise<SocialAnalytics> {
  const analytics: SocialAnalytics = {};

  if (isTwitterAvailable()) {
    try {
      // Placeholder: in production this would call Twitter analytics API
      analytics.twitter = {
        total_posts: 0,
        total_likes: 0,
        total_retweets: 0,
        total_impressions: 0,
        engagement_rate: 0,
      };
    } catch (error) {
      logger.warn('Could not fetch Twitter analytics', { error });
    }
  }

  if (isDiscordAvailable()) {
    analytics.discord = {
      total_messages: 0,
      total_reactions: 0,
    };
  }

  return analytics;
}
