/**
 * Unit Tests for Social Media Tool Handlers
 *
 * Tests socialToolDefinitions (3 tool definitions) and handleSocialTool dispatch.
 *
 * @module __tests__/unit/services/social-tools
 */

import { socialToolDefinitions, handleSocialTool } from '../../../services/tool-handlers/social-tools';

// Mock social-publisher
jest.mock('../../../services/social/social-publisher', () => ({
  createPostDraft: jest.fn(),
  listPosts: jest.fn(),
}));

// Mock database-context
jest.mock('../../../utils/database-context', () => ({
  queryContext: jest.fn(),
}));

// Mock platform-types
jest.mock('../../../services/social/platform-types', () => ({
  PLATFORM_LIMITS: {
    twitter: { maxChars: 280 },
    linkedin: { maxChars: 3000 },
    discord: { maxChars: 2000 },
  },
  SocialPlatform: {},
}));

// Mock logger
jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { createPostDraft, listPosts } from '../../../services/social/social-publisher';
import { queryContext } from '../../../utils/database-context';

const mockCreatePostDraft = createPostDraft as jest.MockedFunction<typeof createPostDraft>;
const mockListPosts = listPosts as jest.MockedFunction<typeof listPosts>;
const mockQueryContext = queryContext as jest.MockedFunction<typeof queryContext>;

const CONTEXT = 'finance' as const;

const mockPost = {
  id: 'post-1',
  context: 'finance' as const,
  platform: 'twitter' as const,
  content: 'Hello from ZenAI!',
  status: 'draft' as const,
  source_type: 'manual' as const,
  source_id: null,
  media_urls: null,
  scheduled_at: null,
  published_at: null,
  external_id: null,
  error_message: null,
  created_at: '2026-03-29T10:00:00Z',
  updated_at: '2026-03-29T10:00:00Z',
};

// ===========================================
// socialToolDefinitions
// ===========================================

describe('socialToolDefinitions', () => {
  it('should export an array of 3 tool definitions', () => {
    expect(Array.isArray(socialToolDefinitions)).toBe(true);
    expect(socialToolDefinitions).toHaveLength(3);
  });

  it('should define draft_social_post', () => {
    const def = socialToolDefinitions.find(d => d.name === 'draft_social_post');
    expect(def).toBeDefined();
    expect(def!.input_schema.required).toContain('platform');
    expect(def!.input_schema.required).toContain('content');
    expect(def!.input_schema.properties.platform.enum).toContain('twitter');
  });

  it('should define list_social_posts', () => {
    const def = socialToolDefinitions.find(d => d.name === 'list_social_posts');
    expect(def).toBeDefined();
    expect(def!.input_schema.properties.status).toBeDefined();
    expect(def!.input_schema.properties.platform).toBeDefined();
  });

  it('should define schedule_social_post', () => {
    const def = socialToolDefinitions.find(d => d.name === 'schedule_social_post');
    expect(def).toBeDefined();
    expect(def!.input_schema.required).toContain('post_id');
    expect(def!.input_schema.required).toContain('scheduled_at');
  });
});

// ===========================================
// handleSocialTool — draft_social_post
// ===========================================

describe('handleSocialTool — draft_social_post', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should create a draft and return post ID', async () => {
    mockCreatePostDraft.mockResolvedValueOnce(mockPost);

    const result = await handleSocialTool(
      'draft_social_post',
      { platform: 'twitter', content: 'Hello from ZenAI!' },
      CONTEXT
    );

    expect(result).toContain('post-1');
    expect(result).toContain('draft');
    expect(mockCreatePostDraft).toHaveBeenCalledWith(CONTEXT, expect.objectContaining({
      platform: 'twitter',
      content: 'Hello from ZenAI!',
    }));
  });

  it('should reject unknown platform', async () => {
    const result = await handleSocialTool(
      'draft_social_post',
      { platform: 'tiktok', content: 'Hello!' },
      CONTEXT
    );

    expect(result.toLowerCase()).toMatch(/unknown|platform/i);
    expect(mockCreatePostDraft).not.toHaveBeenCalled();
  });

  it('should reject content exceeding character limit', async () => {
    const longContent = 'a'.repeat(300);

    const result = await handleSocialTool(
      'draft_social_post',
      { platform: 'twitter', content: longContent },
      CONTEXT
    );

    expect(result).toContain('280');
    expect(mockCreatePostDraft).not.toHaveBeenCalled();
  });

  it('should allow long content for twitter threads (separated by ---)', async () => {
    mockCreatePostDraft.mockResolvedValueOnce(mockPost);
    const threadContent = 'Part 1\n---\nPart 2\n---\nPart 3';

    const result = await handleSocialTool(
      'draft_social_post',
      { platform: 'twitter', content: threadContent },
      CONTEXT
    );

    expect(mockCreatePostDraft).toHaveBeenCalled();
    expect(result).toContain('post-1');
  });

  it('should pass source_type and source_id', async () => {
    mockCreatePostDraft.mockResolvedValueOnce(mockPost);

    await handleSocialTool(
      'draft_social_post',
      { platform: 'twitter', content: 'Phase 142!', source_type: 'changelog', source_id: 'phase-142' },
      CONTEXT
    );

    expect(mockCreatePostDraft).toHaveBeenCalledWith(CONTEXT, expect.objectContaining({
      source_type: 'changelog',
      source_id: 'phase-142',
    }));
  });

  it('should handle createPostDraft error gracefully', async () => {
    mockCreatePostDraft.mockRejectedValueOnce(new Error('DB connection failed'));

    const result = await handleSocialTool(
      'draft_social_post',
      { platform: 'twitter', content: 'Hello!' },
      CONTEXT
    );

    expect(result).toContain('DB connection failed');
  });
});

// ===========================================
// handleSocialTool — list_social_posts
// ===========================================

describe('handleSocialTool — list_social_posts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return formatted list when posts exist', async () => {
    mockListPosts.mockResolvedValueOnce([mockPost]);

    const result = await handleSocialTool('list_social_posts', {}, CONTEXT);

    expect(result).toContain('1');
    expect(result).toContain('twitter');
    expect(result).toContain('post-1');
  });

  it('should return empty message when no posts', async () => {
    mockListPosts.mockResolvedValueOnce([]);

    const result = await handleSocialTool('list_social_posts', {}, CONTEXT);

    expect(result.length).toBeGreaterThan(0);
    expect(mockListPosts).toHaveBeenCalled();
  });

  it('should filter by status', async () => {
    mockListPosts.mockResolvedValueOnce([]);

    await handleSocialTool('list_social_posts', { status: 'draft' }, CONTEXT);

    expect(mockListPosts).toHaveBeenCalledWith(CONTEXT, expect.objectContaining({ status: 'draft' }));
  });

  it('should filter by platform', async () => {
    mockListPosts.mockResolvedValueOnce([]);

    await handleSocialTool('list_social_posts', { platform: 'twitter' }, CONTEXT);

    expect(mockListPosts).toHaveBeenCalledWith(CONTEXT, expect.objectContaining({ platform: 'twitter' }));
  });

  it('should handle listPosts error gracefully', async () => {
    mockListPosts.mockRejectedValueOnce(new Error('Timeout'));

    const result = await handleSocialTool('list_social_posts', {}, CONTEXT);

    expect(result).toContain('Timeout');
  });
});

// ===========================================
// handleSocialTool — schedule_social_post
// ===========================================

describe('handleSocialTool — schedule_social_post', () => {
  const futureDate = new Date(Date.now() + 86400000).toISOString();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should schedule a post successfully', async () => {
    const scheduled = { ...mockPost, status: 'scheduled', scheduled_at: futureDate };
    mockQueryContext.mockResolvedValueOnce({ rows: [scheduled] } as any);

    const result = await handleSocialTool(
      'schedule_social_post',
      { post_id: 'post-1', scheduled_at: futureDate },
      CONTEXT
    );

    expect(result).toContain('post-1');
    expect(result).toContain(futureDate);
  });

  it('should return error when post not found', async () => {
    mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

    const result = await handleSocialTool(
      'schedule_social_post',
      { post_id: 'nonexistent', scheduled_at: futureDate },
      CONTEXT
    );

    expect(result).toContain('nonexistent');
  });

  it('should return error when post_id is missing', async () => {
    const result = await handleSocialTool(
      'schedule_social_post',
      { scheduled_at: futureDate },
      CONTEXT
    );

    expect(result).toMatch(/required|post_id/i);
    expect(mockQueryContext).not.toHaveBeenCalled();
  });

  it('should return error when scheduled_at is missing', async () => {
    const result = await handleSocialTool(
      'schedule_social_post',
      { post_id: 'post-1' },
      CONTEXT
    );

    expect(result).toMatch(/required|scheduled_at/i);
    expect(mockQueryContext).not.toHaveBeenCalled();
  });

  it('should handle DB error gracefully', async () => {
    mockQueryContext.mockRejectedValueOnce(new Error('DB error'));

    const result = await handleSocialTool(
      'schedule_social_post',
      { post_id: 'post-1', scheduled_at: futureDate },
      CONTEXT
    );

    expect(result).toContain('DB error');
  });
});

// ===========================================
// handleSocialTool — unknown tool
// ===========================================

describe('handleSocialTool — unknown tool', () => {
  it('should return error for unknown tool name', async () => {
    const result = await handleSocialTool('unknown_social_tool', {}, CONTEXT);
    expect(result).toContain('unknown_social_tool');
  });
});
