/**
 * Twitter/X API Client
 *
 * Handles posting, deleting, and reading tweets via the Twitter API v2.
 * Requires OAuth 1.0a credentials for write operations.
 */

import { checkedAxiosGet, checkedAxiosPost, checkedAxiosDelete } from '../utils/checked-http';
import { logger } from '../utils/logger';

// ===========================================
// Types
// ===========================================

export interface TweetResult {
  id: string;
  text: string;
  url: string;
  created_at: string;
}

export interface Tweet {
  id: string;
  text: string;
  created_at: string;
}

export interface TweetAnalytics {
  id: string;
  text: string;
  likes: number;
  retweets: number;
  replies: number;
  impressions: number;
}

// ===========================================
// Availability Check
// ===========================================

export function isTwitterAvailable(): boolean {
  return !!(
    process.env.TWITTER_API_KEY &&
    process.env.TWITTER_API_SECRET &&
    process.env.TWITTER_ACCESS_TOKEN &&
    process.env.TWITTER_ACCESS_TOKEN_SECRET
  );
}

// ===========================================
// OAuth 1.0a Header Generation
// ===========================================

function buildOAuthHeader(method: string, url: string, params: Record<string, string> = {}): string {
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: process.env.TWITTER_API_KEY!,
    oauth_nonce: Math.random().toString(36).substring(2),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: process.env.TWITTER_ACCESS_TOKEN!,
    oauth_version: '1.0',
  };

  const allParams = { ...params, ...oauthParams };
  const sortedKeys = Object.keys(allParams).sort();
  const paramStr = sortedKeys.map(k => `${encodeURIComponent(k)}=${encodeURIComponent(allParams[k])}`).join('&');
  const signatureBase = [method.toUpperCase(), encodeURIComponent(url), encodeURIComponent(paramStr)].join('&');

  // HMAC-SHA1 signature
  const crypto = require('crypto');
  const signingKey = `${encodeURIComponent(process.env.TWITTER_API_SECRET!)}&${encodeURIComponent(process.env.TWITTER_ACCESS_TOKEN_SECRET!)}`;
  const signature = crypto.createHmac('sha1', signingKey).update(signatureBase).digest('base64');

  oauthParams.oauth_signature = signature;

  const headerParts = Object.entries(oauthParams)
    .map(([k, v]) => `${encodeURIComponent(k)}="${encodeURIComponent(v)}"`)
    .join(', ');

  return `OAuth ${headerParts}`;
}

// ===========================================
// API Methods
// ===========================================

/**
 * Post a tweet
 */
export async function tweet(content: string): Promise<TweetResult> {
  if (!content || content.trim().length === 0) {
    throw new Error('Tweet content cannot be empty');
  }

  if (content.length > 280) {
    throw new Error('Tweet content exceeds 280 characters');
  }

  if (!isTwitterAvailable()) {
    throw new Error('Twitter is not configured');
  }

  const url = 'https://api.twitter.com/2/tweets';
  const oauthHeader = buildOAuthHeader('POST', url);

  logger.debug('Posting tweet', { length: content.length });

  const response = await checkedAxiosPost<{ data: { id: string; text: string; created_at?: string } }>(
    url,
    { text: content },
    {
      headers: {
        Authorization: oauthHeader,
        'Content-Type': 'application/json',
      },
    }
  );

  const tweetData = response.data.data;
  return {
    id: tweetData.id,
    text: tweetData.text,
    url: `https://x.com/i/status/${tweetData.id}`,
    created_at: tweetData.created_at || new Date().toISOString(),
  };
}

/**
 * Delete a tweet by ID
 */
export async function deleteTweet(id: string): Promise<void> {
  if (!id || id.trim().length === 0) {
    throw new Error('Tweet ID is required');
  }

  if (!isTwitterAvailable()) {
    throw new Error('Twitter is not configured');
  }

  const url = `https://api.twitter.com/2/tweets/${id}`;
  const oauthHeader = buildOAuthHeader('DELETE', url);

  logger.debug('Deleting tweet', { id });

  await checkedAxiosDelete(url, {
    headers: { Authorization: oauthHeader },
  });
}

/**
 * Get recent tweets for the authenticated user
 */
export async function getRecentTweets(count = 10): Promise<Tweet[]> {
  if (!isTwitterAvailable()) {
    throw new Error('Twitter is not configured');
  }

  const cappedCount = Math.min(count, 100);
  const bearerToken = process.env.TWITTER_BEARER_TOKEN;

  // Use TWITTER_USER_ID env var to skip the /users/me lookup when available
  let userId = process.env.TWITTER_USER_ID;

  if (!userId) {
    const meUrl = 'https://api.twitter.com/2/users/me';
    const oauthHeaderMe = buildOAuthHeader('GET', meUrl);
    try {
      const meResponse = await checkedAxiosGet<{ data: { id: string } }>(meUrl, {
        headers: { Authorization: bearerToken ? `Bearer ${bearerToken}` : oauthHeaderMe },
      });
      userId = meResponse.data.data.id;
    } catch {
      logger.warn('Could not retrieve authenticated Twitter user ID');
      return [];
    }
  }

  const tweetsUrl = `https://api.twitter.com/2/users/${userId}/tweets`;
  const response = await checkedAxiosGet<{ data?: Array<{ id: string; text: string; created_at: string }> }>(tweetsUrl, {
    params: {
      max_results: cappedCount,
      'tweet.fields': 'created_at,public_metrics',
    },
    headers: {
      Authorization: bearerToken ? `Bearer ${bearerToken}` : buildOAuthHeader('GET', tweetsUrl, { max_results: String(cappedCount) }),
    },
  });

  return (response.data.data || []).map((t) => ({
    id: t.id,
    text: t.text,
    created_at: t.created_at,
  }));
}

/**
 * Get analytics for a specific tweet
 */
export async function getTweetAnalytics(id: string): Promise<TweetAnalytics> {
  if (!id || id.trim().length === 0) {
    throw new Error('Tweet ID is required');
  }

  if (!isTwitterAvailable()) {
    throw new Error('Twitter is not configured');
  }

  const bearerToken = process.env.TWITTER_BEARER_TOKEN;
  const url = `https://api.twitter.com/2/tweets/${id}`;

  const response = await checkedAxiosGet<{
    data: {
      id: string;
      text: string;
      public_metrics?: {
        like_count?: number;
        retweet_count?: number;
        reply_count?: number;
        impression_count?: number;
      };
    };
  }>(url, {
    params: { 'tweet.fields': 'public_metrics,created_at' },
    headers: {
      Authorization: bearerToken
        ? `Bearer ${bearerToken}`
        : buildOAuthHeader('GET', url),
    },
  });

  const data = response.data.data;
  const metrics = data.public_metrics || {};

  return {
    id: data.id,
    text: data.text,
    likes: metrics.like_count || 0,
    retweets: metrics.retweet_count || 0,
    replies: metrics.reply_count || 0,
    impressions: metrics.impression_count || 0,
  };
}
