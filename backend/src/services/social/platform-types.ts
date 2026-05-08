/**
 * Social Media Platform Types
 *
 * Shared types and interfaces for all social media platform clients.
 *
 * @module services/social/platform-types
 */

// ===========================================
// Platform Types
// ===========================================

export type SocialPlatform = 'twitter' | 'linkedin' | 'discord';

export type PostStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'scheduled'
  | 'published'
  | 'failed';

export type SourceType = 'blog' | 'changelog' | 'manual' | 'proactive';

// ===========================================
// Social Post
// ===========================================

export interface SocialPost {
  id: string;
  source_type: SourceType;
  source_id: string | null;
  platform: SocialPlatform;
  content: string;
  media_urls: string[];
  status: PostStatus;
  scheduled_at: Date | null;
  published_at: Date | null;
  platform_post_id: string | null;
  governance_id: string | null;
  engagement_metrics: EngagementMetrics | null;
  created_at: Date;
  updated_at: Date;
}

export interface EngagementMetrics {
  likes?: number;
  retweets?: number;
  replies?: number;
  impressions?: number;
  clicks?: number;
}

// ===========================================
// Social Account
// ===========================================

export interface SocialAccount {
  id: string;
  platform: SocialPlatform;
  account_name: string;
  is_active: boolean;
  token_expires_at: Date | null;
  created_at: Date;
}

// ===========================================
// Platform Client Interface
// ===========================================

export interface PlatformPublishResult {
  success: boolean;
  platformPostId?: string;
  error?: string;
  url?: string;
}

export interface PlatformClient {
  /** Platform identifier */
  platform: SocialPlatform;

  /** Publish a single post */
  publish(content: string, mediaUrls?: string[]): Promise<PlatformPublishResult>;

  /** Publish a thread (multiple connected posts) */
  publishThread?(posts: string[]): Promise<PlatformPublishResult>;

  /** Delete a published post */
  deletePost?(platformPostId: string): Promise<boolean>;

  /** Check if the client is properly configured */
  isConfigured(): boolean;
}

// ===========================================
// Draft Request
// ===========================================

export interface DraftRequest {
  sourceType: SourceType;
  sourceContent: string;
  platform: SocialPlatform;
  locale: 'en' | 'de';
  tone: 'technical' | 'operations' | 'professional';
  threadMode?: boolean;
}

export interface DraftResult {
  content: string;
  hashtags: string[];
  estimatedEngagement: 'low' | 'medium' | 'high';
  suggestedTime: Date;
  platform: SocialPlatform;
}

// ===========================================
// Platform Limits
// ===========================================

export const PLATFORM_LIMITS: Record<SocialPlatform, { maxChars: number; maxMedia: number; maxThreadPosts: number }> = {
  twitter: { maxChars: 280, maxMedia: 4, maxThreadPosts: 25 },
  linkedin: { maxChars: 3000, maxMedia: 9, maxThreadPosts: 1 },
  discord: { maxChars: 2000, maxMedia: 10, maxThreadPosts: 1 },
};
