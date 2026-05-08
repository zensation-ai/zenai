/**
 * LinkedIn API Client
 *
 * Publishes posts to LinkedIn via the Community Management API.
 * Uses OAuth 2.0 access token.
 *
 * @module services/social/linkedin-client
 */

import { logger } from '../../utils/logger';
import { checkedFetch } from '../../utils/checked-http';
import {
  PlatformClient,
  PlatformPublishResult,
  PLATFORM_LIMITS,
} from './platform-types';

const LINKEDIN_API_BASE = 'https://api.linkedin.com/v2';

export interface LinkedInTokenInput {
  accessToken: string | undefined;
  refreshToken: string | null;
  expiresAt: Date | null;
  dbId: string | null;
  metadata: Record<string, unknown>;
}

export class LinkedInClient implements PlatformClient {
  readonly platform = 'linkedin' as const;
  private accessToken: string | undefined;
  private orgUrn: string | undefined;
  private refreshToken: string | null;
  private expiresAt: Date | null;
  private dbId: string | null;
  private metadata: Record<string, unknown>;

  constructor(input: LinkedInTokenInput) {
    this.accessToken = input.accessToken || process.env.LINKEDIN_ACCESS_TOKEN;
    this.orgUrn = (input.metadata?.org_urn as string | undefined) || process.env.LINKEDIN_PERSON_URN;
    this.refreshToken = input.refreshToken;
    this.expiresAt = input.expiresAt;
    this.dbId = input.dbId;
    this.metadata = input.metadata;
  }

  isConfigured(): boolean {
    return !!(this.accessToken && this.orgUrn);
  }

  needsRefresh(): boolean {
    if (!this.expiresAt || !this.refreshToken) return false;
    return this.expiresAt.getTime() - Date.now() < 5 * 60 * 1000;
  }

  async publish(content: string, _mediaUrls?: string[]): Promise<PlatformPublishResult> {
    if (!this.accessToken || !this.orgUrn) {
      return { success: false, error: 'LinkedIn credentials not configured' };
    }

    const maxChars = PLATFORM_LIMITS.linkedin.maxChars;
    if (content.length > maxChars) {
      content = content.substring(0, maxChars - 3) + '...';
    }

    try {
      const res = await checkedFetch(`${LINKEDIN_API_BASE}/ugcPosts`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
          'X-Restli-Protocol-Version': '2.0.0',
        },
        body: JSON.stringify({
          author: this.orgUrn,
          lifecycleState: 'PUBLISHED',
          specificContent: {
            'com.linkedin.ugc.ShareContent': {
              shareCommentary: { text: content },
              shareMediaCategory: 'NONE',
            },
          },
          visibility: {
            'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
          },
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        const truncated = errorText.substring(0, 200);
        logger.error(`[LinkedIn] Publish failed: ${res.status} ${truncated}`);
        return { success: false, error: `LinkedIn API error: ${res.status}` };
      }

      const postId = res.headers.get('x-restli-id') || 'unknown';
      logger.info('[LinkedIn] Published successfully', { postId });

      return {
        success: true,
        platformPostId: postId,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`[LinkedIn] Publish error: ${message}`);
      return { success: false, error: message };
    }
  }

  async deletePost(postUrn: string): Promise<boolean> {
    if (!this.accessToken) return false;

    try {
      const res = await checkedFetch(`${LINKEDIN_API_BASE}/ugcPosts/${encodeURIComponent(postUrn)}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
        },
      });

      return res.ok;
    } catch (error) {
      logger.error(`[LinkedIn] Delete error: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }
}

export function createLinkedInClient(input?: LinkedInTokenInput): LinkedInClient {
  return new LinkedInClient(input ?? {
    accessToken: process.env.LINKEDIN_ACCESS_TOKEN,
    refreshToken: null,
    expiresAt: null,
    dbId: null,
    metadata: {},
  });
}
