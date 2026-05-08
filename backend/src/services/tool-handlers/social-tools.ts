/**
 * Social Media Tool Handlers
 *
 * AI tools for drafting, scheduling, and listing social media posts.
 *
 * @module services/tool-handlers/social-tools
 */

import { AIContext } from '../../utils/database-context';
import { createPostDraft, listPosts } from '../social/social-publisher';
import { PLATFORM_LIMITS, SocialPlatform } from '../social/platform-types';

// ===========================================
// Tool Definitions
// ===========================================

export const socialToolDefinitions = [
  {
    name: 'draft_social_post',
    description:
      'Draft a social media post for Twitter, LinkedIn, or Discord. The post is saved as a draft and requires user approval before publishing.',
    input_schema: {
      type: 'object' as const,
      properties: {
        platform: {
          type: 'string',
          enum: ['twitter', 'linkedin', 'discord'],
          description: 'Target platform',
        },
        content: {
          type: 'string',
          description: 'Post content. For Twitter threads, separate posts with ---',
        },
        source_type: {
          type: 'string',
          enum: ['blog', 'changelog', 'manual', 'proactive'],
          description: 'Where this content originated',
        },
        source_id: {
          type: 'string',
          description: 'Optional reference to source (blog slug, phase number)',
        },
      },
      required: ['platform', 'content'],
    },
  },
  {
    name: 'list_social_posts',
    description: 'List social media posts filtered by status and/or platform.',
    input_schema: {
      type: 'object' as const,
      properties: {
        status: {
          type: 'string',
          enum: ['draft', 'pending_approval', 'approved', 'scheduled', 'published', 'failed'],
          description: 'Filter by post status',
        },
        platform: {
          type: 'string',
          enum: ['twitter', 'linkedin', 'discord'],
          description: 'Filter by platform',
        },
        limit: {
          type: 'number',
          description: 'Max posts to return (default 10)',
        },
      },
    },
  },
  {
    name: 'schedule_social_post',
    description:
      'Schedule a social media post for a specific date and time. The post must exist as a draft first.',
    input_schema: {
      type: 'object' as const,
      properties: {
        post_id: {
          type: 'string',
          description: 'ID of the post to schedule',
        },
        scheduled_at: {
          type: 'string',
          description: 'ISO 8601 datetime for when to publish',
        },
      },
      required: ['post_id', 'scheduled_at'],
    },
  },
];

// ===========================================
// Tool Handlers
// ===========================================

export async function handleSocialTool(
  toolName: string,
  input: Record<string, unknown>,
  context: AIContext
): Promise<string> {
  switch (toolName) {
    case 'draft_social_post':
      return handleDraftPost(input, context);
    case 'list_social_posts':
      return handleListPosts(input, context);
    case 'schedule_social_post':
      return handleSchedulePost(input, context);
    default:
      return `Unknown social tool: ${toolName}`;
  }
}

async function handleDraftPost(
  input: Record<string, unknown>,
  context: AIContext
): Promise<string> {
  const platform = input.platform as SocialPlatform;
  const content = input.content as string;
  const sourceType = (input.source_type as string) || 'manual';
  const sourceId = input.source_id as string | undefined;

  // Validate content length
  const limits = PLATFORM_LIMITS[platform];
  if (!limits) {
    return `Unknown platform: ${platform}`;
  }

  const isThread = content.includes('\n---\n');
  if (!isThread && content.length > limits.maxChars) {
    return `Content exceeds ${platform} limit of ${limits.maxChars} characters (got ${content.length}). Please shorten the post.`;
  }

  try {
    const post = await createPostDraft(context, {
      source_type: sourceType,
      source_id: sourceId,
      platform,
      content,
    });

    return `Draft created successfully. Post ID: ${post.id}. Platform: ${platform}. Status: draft. The user must approve this post before it can be published.`;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return `Failed to create draft: ${message}`;
  }
}

async function handleListPosts(
  input: Record<string, unknown>,
  context: AIContext
): Promise<string> {
  const status = input.status as string | undefined;
  const platform = input.platform as string | undefined;
  const limit = (input.limit as number) || 10;

  try {
    const posts = await listPosts(context, { status: status as never, platform: platform as never, limit });

    if (!posts.length) {
      return `No social posts found${status ? ` with status '${status}'` : ''}${platform ? ` for ${platform}` : ''}.`;
    }

    const summary = posts.map((p) => {
      const preview = p.content.substring(0, 80) + (p.content.length > 80 ? '...' : '');
      return `- [${p.platform}] ${p.status} | ${preview} (ID: ${p.id})`;
    });

    return `Found ${posts.length} posts:\n${summary.join('\n')}`;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return `Failed to list posts: ${message}`;
  }
}

async function handleSchedulePost(
  input: Record<string, unknown>,
  context: AIContext
): Promise<string> {
  const postId = input.post_id as string;
  const scheduledAt = input.scheduled_at as string;

  if (!postId || !scheduledAt) {
    return 'Both post_id and scheduled_at are required.';
  }

  try {
    const { queryContext: qc } = await import('../../utils/database-context');
    const result = await qc(context, `
      UPDATE social_posts
      SET status = 'scheduled', scheduled_at = $2, updated_at = NOW()
      WHERE id = $1 AND status IN ('draft', 'approved')
      RETURNING *
    `, [postId, new Date(scheduledAt)]);

    if (!result.rows.length) {
      return `Post ${postId} not found or not in draft/approved status.`;
    }

    return `Post ${postId} scheduled for ${scheduledAt}. It will be published automatically at that time.`;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return `Failed to schedule post: ${message}`;
  }
}
