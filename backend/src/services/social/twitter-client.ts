/**
 * Twitter API v2 Client
 *
 * Publishes tweets and threads using Twitter API v2.
 * Uses OAuth 2.0 Bearer Token (app-level) or User Context (OAuth 2.0 PKCE).
 *
 * @module services/social/twitter-client
 */

import { logger } from '../../utils/logger';
import { checkedFetch } from '../../utils/checked-http';
import {
  PlatformClient,
  PlatformPublishResult,
  PLATFORM_LIMITS,
} from './platform-types';

const TWITTER_API_BASE = 'https://api.twitter.com/2';

export interface TwitterTokenInput {
  accessToken: string | undefined;
  refreshToken: string | null;
  expiresAt: Date | null;
  dbId: string | null;
}

export class TwitterClient implements PlatformClient {
  readonly platform = 'twitter' as const;
  private accessToken: string | undefined;
  private refreshToken: string | null;
  private expiresAt: Date | null;
  private dbId: string | null;

  constructor(input: TwitterTokenInput) {
    this.accessToken = input.accessToken || process.env.TWITTER_ACCESS_TOKEN;
    this.refreshToken = input.refreshToken;
    this.expiresAt = input.expiresAt;
    this.dbId = input.dbId;
  }

  isConfigured(): boolean {
    return !!this.accessToken;
  }

  needsRefresh(): boolean {
    if (!this.expiresAt || !this.refreshToken) return false;
    return this.expiresAt.getTime() - Date.now() < 5 * 60 * 1000;
  }

  async publish(content: string, _mediaUrls?: string[]): Promise<PlatformPublishResult> {
    if (!this.accessToken) {
      return { success: false, error: 'Twitter access token not configured' };
    }

    const maxChars = PLATFORM_LIMITS.twitter.maxChars;
    if (content.length > maxChars) {
      content = content.substring(0, maxChars - 3) + '...';
    }

    try {
      const res = await checkedFetch(`${TWITTER_API_BASE}/tweets`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: content }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        const truncated = errorText.substring(0, 200);
        logger.error(`[Twitter] Publish failed: ${res.status} ${truncated}`);
        return { success: false, error: `Twitter API error: ${res.status}` };
      }

      const data = await res.json() as { data: { id: string } };
      const tweetId = data.data.id;
      logger.info('[Twitter] Published successfully', { tweetId });

      return {
        success: true,
        platformPostId: tweetId,
        url: `https://twitter.com/i/status/${tweetId}`,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`[Twitter] Publish error: ${message}`);
      return { success: false, error: message };
    }
  }

  async publishThread(posts: string[]): Promise<PlatformPublishResult> {
    if (!this.accessToken) {
      return { success: false, error: 'Twitter access token not configured' };
    }

    const maxPosts = PLATFORM_LIMITS.twitter.maxThreadPosts;
    const threadPosts = posts.slice(0, maxPosts);
    let lastTweetId: string | undefined;
    let firstTweetId: string | undefined;

    try {
      for (const post of threadPosts) {
        let text = post;
        if (text.length > PLATFORM_LIMITS.twitter.maxChars) {
          text = text.substring(0, PLATFORM_LIMITS.twitter.maxChars - 3) + '...';
        }

        const body: Record<string, unknown> = { text };
        if (lastTweetId) {
          body.reply = { in_reply_to_tweet_id: lastTweetId };
        }

        const res = await checkedFetch(`${TWITTER_API_BASE}/tweets`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const errorText = await res.text();
          const truncated = errorText.substring(0, 200);
          logger.error(`[Twitter] Thread post failed: ${res.status} ${truncated}`);
          return {
            success: false,
            error: `Twitter thread failed at post ${threadPosts.indexOf(post) + 1}: ${res.status}`,
            platformPostId: firstTweetId,
          };
        }

        const data = await res.json() as { data: { id: string } };
        lastTweetId = data.data.id;
        if (!firstTweetId) firstTweetId = lastTweetId;
      }

      logger.info('[Twitter] Thread published successfully', {
        firstTweetId,
        postCount: threadPosts.length,
      });

      return {
        success: true,
        platformPostId: firstTweetId,
        url: `https://twitter.com/i/status/${firstTweetId}`,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`[Twitter] Thread error: ${message}`);
      return { success: false, error: message, platformPostId: firstTweetId };
    }
  }

  async deletePost(tweetId: string): Promise<boolean> {
    if (!this.accessToken) return false;

    try {
      const res = await checkedFetch(`${TWITTER_API_BASE}/tweets/${tweetId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
        },
      });

      return res.ok;
    } catch (error) {
      logger.error(`[Twitter] Delete error: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }
}

export function createTwitterClient(input?: TwitterTokenInput): TwitterClient {
  return new TwitterClient(input ?? {
    accessToken: process.env.TWITTER_ACCESS_TOKEN,
    refreshToken: null,
    expiresAt: null,
    dbId: null,
  });
}
