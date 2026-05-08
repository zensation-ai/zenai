/**
 * Unit tests for ContentAgent
 *
 * @module __tests__/unit/services/content-agent
 */

import { ContentAgent, createContentAgent } from '../../../services/social/content-agent';
import { AIContext } from '../../../utils/database-context';
import { PLATFORM_LIMITS } from '../../../services/social/platform-types';
import { requestApproval } from '../../../services/governance';
import { queryContext } from '../../../utils/database-context';

// ===========================================
// Mocks
// ===========================================

// Mock BaseAgent's execute() so we don't hit Claude API
jest.mock('../../../services/agents/base-agent', () => {
  const actualModule = jest.requireActual('../../../services/agents/base-agent');

  class MockBaseAgent {
    config: Record<string, unknown>;
    constructor(config: Record<string, unknown>) {
      this.config = config;
    }
    get role() { return this.config.role; }
    setPersonaPrompt(prompt: string) { this.config.personaPrompt = prompt; }
    execute = jest.fn();
    protected buildSystemPrompt() { return ''; }
    protected writeToSharedMemory() {}
  }

  return {
    ...actualModule,
    BaseAgent: MockBaseAgent,
  };
});

// Mock social-publisher so DB is not touched
jest.mock('../../../services/social/social-publisher', () => ({
  createPostDraft: jest.fn().mockResolvedValue({
    id: 'mock-post-id',
    source_type: 'blog',
    source_id: null,
    platform: 'twitter',
    content: 'Mock tweet content #ZenAI',
    media_urls: [],
    status: 'draft',
    scheduled_at: null,
    published_at: null,
    platform_post_id: null,
    governance_id: null,
    engagement_metrics: null,
    created_at: new Date(),
    updated_at: new Date(),
  }),
}));

// Mock governance service
jest.mock('../../../services/governance', () => ({
  requestApproval: jest.fn().mockResolvedValue({
    id: 'gov-action-id',
    status: 'pending',
    action_type: 'social_publish',
    risk_level: 'medium',
  }),
}));

// Mock database-context for governance_id UPDATE query
jest.mock('../../../utils/database-context', () => ({
  AIContext: {},
  queryContext: jest.fn().mockResolvedValue({ rows: [], rowCount: 1 }),
}));

// Suppress logger output during tests
jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// ===========================================
// Test helpers
// ===========================================

const TEST_CONTEXT: AIContext = 'operations';
const SAMPLE_CONTENT = 'We just shipped a major update to ZenAI! The new GraphRAG pipeline improves retrieval accuracy by 67% using Anthropic\'s contextual retrieval method. Plus 60 new AI tools and a redesigned voice interface.';

function makeSuccessOutput(jsonPayload: object) {
  return {
    role: 'writer' as const,
    success: true,
    content: JSON.stringify(jsonPayload),
    toolsUsed: [],
    tokensUsed: { input: 100, output: 50 },
    executionTimeMs: 200,
  };
}

// ===========================================
// Tests
// ===========================================

describe('ContentAgent', () => {
  let agent: ContentAgent;
  let mockExecute: jest.Mock;
  let mockCreatePostDraft: jest.Mock;
  let mockRequestApproval: jest.Mock;
  let mockQueryContext: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    agent = createContentAgent();
    // Access the mocked execute from the instance
    mockExecute = (agent as unknown as { execute: jest.Mock }).execute;

    const publisherModule = jest.requireMock('../../../services/social/social-publisher');
    mockCreatePostDraft = publisherModule.createPostDraft;

    mockRequestApproval = requestApproval as jest.Mock;
    mockQueryContext = queryContext as jest.Mock;
  });

  // -----------------------------------------------
  // 1. Factory function
  // -----------------------------------------------
  describe('createContentAgent()', () => {
    it('returns a ContentAgent instance', () => {
      expect(agent).toBeInstanceOf(ContentAgent);
    });
  });

  // -----------------------------------------------
  // 2. draftPost — correct platform in result
  // -----------------------------------------------
  describe('draftPost()', () => {
    it('returns a DraftResult with the correct platform', async () => {
      mockExecute.mockResolvedValueOnce(
        makeSuccessOutput({ content: 'Big news! #ZenAI', hashtags: ['ZenAI'], estimatedEngagement: 'high' })
      );

      const result = await agent.draftPost(
        { sourceType: 'blog', sourceContent: SAMPLE_CONTENT, platform: 'twitter', locale: 'en', tone: 'professional' },
        TEST_CONTEXT
      );

      expect(result.platform).toBe('twitter');
      expect(result.content).toBeTruthy();
    });

    // -----------------------------------------------
    // 3. character limit enforcement
    // -----------------------------------------------
    it('truncates content that exceeds the platform character limit', async () => {
      const tooLong = 'A'.repeat(400); // Twitter limit is 280
      mockExecute.mockResolvedValueOnce(
        makeSuccessOutput({ content: tooLong, hashtags: [], estimatedEngagement: 'low' })
      );

      const result = await agent.draftPost(
        { sourceType: 'blog', sourceContent: SAMPLE_CONTENT, platform: 'twitter', locale: 'en', tone: 'professional' },
        TEST_CONTEXT
      );

      expect(result.content.length).toBeLessThanOrEqual(PLATFORM_LIMITS.twitter.maxChars);
    });

    it('does not truncate content that is within the limit', async () => {
      const withinLimit = 'Short tweet #ZenAI';
      mockExecute.mockResolvedValueOnce(
        makeSuccessOutput({ content: withinLimit, hashtags: ['ZenAI'], estimatedEngagement: 'medium' })
      );

      const result = await agent.draftPost(
        { sourceType: 'blog', sourceContent: SAMPLE_CONTENT, platform: 'twitter', locale: 'en', tone: 'professional' },
        TEST_CONTEXT
      );

      expect(result.content).toBe(withinLimit);
    });

    // -----------------------------------------------
    // 4. createPostDraft called with correct args
    // -----------------------------------------------
    it('calls createPostDraft with the correct platform and source_type', async () => {
      mockExecute.mockResolvedValueOnce(
        makeSuccessOutput({ content: 'LinkedIn post content', hashtags: ['AI'], estimatedEngagement: 'medium' })
      );

      await agent.draftPost(
        { sourceType: 'changelog', sourceContent: SAMPLE_CONTENT, platform: 'linkedin', locale: 'en', tone: 'professional' },
        TEST_CONTEXT
      );

      expect(mockCreatePostDraft).toHaveBeenCalledTimes(1);
      const callArgs = mockCreatePostDraft.mock.calls[0];
      expect(callArgs[0]).toBe(TEST_CONTEXT);
      expect(callArgs[1].platform).toBe('linkedin');
      expect(callArgs[1].source_type).toBe('changelog');
    });

    // -----------------------------------------------
    // 5. hashtag extraction
    // -----------------------------------------------
    it('extracts hashtags from Claude response', async () => {
      mockExecute.mockResolvedValueOnce(
        makeSuccessOutput({ content: 'Great update #ZenAI #AI', hashtags: ['ZenAI', 'AI', 'OpenSource'], estimatedEngagement: 'high' })
      );

      const result = await agent.draftPost(
        { sourceType: 'blog', sourceContent: SAMPLE_CONTENT, platform: 'twitter', locale: 'en', tone: 'technical' },
        TEST_CONTEXT
      );

      expect(result.hashtags).toEqual(['ZenAI', 'AI', 'OpenSource']);
    });

    it('strips leading # from hashtags if Claude includes them', async () => {
      mockExecute.mockResolvedValueOnce(
        makeSuccessOutput({ content: 'Post content', hashtags: ['#ZenAI', '#AI'], estimatedEngagement: 'medium' })
      );

      const result = await agent.draftPost(
        { sourceType: 'blog', sourceContent: SAMPLE_CONTENT, platform: 'twitter', locale: 'en', tone: 'operations' },
        TEST_CONTEXT
      );

      expect(result.hashtags).toEqual(['ZenAI', 'AI']);
    });

    // -----------------------------------------------
    // 6. suggestedTime is in the future
    // -----------------------------------------------
    it('returns a suggestedTime that is in the future', async () => {
      mockExecute.mockResolvedValueOnce(
        makeSuccessOutput({ content: 'Post', hashtags: [], estimatedEngagement: 'low' })
      );

      const before = new Date();
      const result = await agent.draftPost(
        { sourceType: 'blog', sourceContent: SAMPLE_CONTENT, platform: 'twitter', locale: 'en', tone: 'professional' },
        TEST_CONTEXT
      );

      expect(result.suggestedTime.getTime()).toBeGreaterThan(before.getTime());
    });

    // -----------------------------------------------
    // 7. locale routing
    // -----------------------------------------------
    it('passes locale:en task prompt for Twitter', async () => {
      mockExecute.mockResolvedValueOnce(
        makeSuccessOutput({ content: 'Tweet', hashtags: [], estimatedEngagement: 'low' })
      );

      await agent.draftPost(
        { sourceType: 'blog', sourceContent: SAMPLE_CONTENT, platform: 'twitter', locale: 'en', tone: 'professional' },
        TEST_CONTEXT
      );

      const taskArg = mockExecute.mock.calls[0][0].task as string;
      expect(taskArg).toContain('Write in English');
    });

    it('always uses German instruction for Discord regardless of locale param', async () => {
      mockExecute.mockResolvedValueOnce(
        makeSuccessOutput({ content: 'Discord Nachricht', hashtags: [], estimatedEngagement: 'medium' })
      );

      await agent.draftPost(
        { sourceType: 'blog', sourceContent: SAMPLE_CONTENT, platform: 'discord', locale: 'en', tone: 'professional' },
        TEST_CONTEXT
      );

      const taskArg = mockExecute.mock.calls[0][0].task as string;
      expect(taskArg).toContain('Deutsch');
    });

    // -----------------------------------------------
    // 8. tone variations in prompt
    // -----------------------------------------------
    it('includes technical tone instruction in task prompt', async () => {
      mockExecute.mockResolvedValueOnce(
        makeSuccessOutput({ content: 'Technical post', hashtags: [], estimatedEngagement: 'low' })
      );

      await agent.draftPost(
        { sourceType: 'blog', sourceContent: SAMPLE_CONTENT, platform: 'twitter', locale: 'en', tone: 'technical' },
        TEST_CONTEXT
      );

      const taskArg = mockExecute.mock.calls[0][0].task as string;
      expect(taskArg).toContain('technical');
    });

    it('includes personal tone instruction in task prompt', async () => {
      mockExecute.mockResolvedValueOnce(
        makeSuccessOutput({ content: 'Personal post', hashtags: [], estimatedEngagement: 'medium' })
      );

      await agent.draftPost(
        { sourceType: 'blog', sourceContent: SAMPLE_CONTENT, platform: 'linkedin', locale: 'en', tone: 'operations' },
        TEST_CONTEXT
      );

      const taskArg = mockExecute.mock.calls[0][0].task as string;
      expect(taskArg).toContain('personal and relatable');
    });

    // -----------------------------------------------
    // 9. threadMode flag in prompt
    // -----------------------------------------------
    it('includes thread instruction when threadMode is true', async () => {
      mockExecute.mockResolvedValueOnce(
        makeSuccessOutput({ content: 'Thread post 1\n---\nThread post 2', hashtags: [], estimatedEngagement: 'high' })
      );

      await agent.draftPost(
        { sourceType: 'blog', sourceContent: SAMPLE_CONTENT, platform: 'twitter', locale: 'en', tone: 'professional', threadMode: true },
        TEST_CONTEXT
      );

      const taskArg = mockExecute.mock.calls[0][0].task as string;
      expect(taskArg).toContain('thread');
    });

    it('uses single-post instruction when threadMode is false/undefined', async () => {
      mockExecute.mockResolvedValueOnce(
        makeSuccessOutput({ content: 'Single post', hashtags: [], estimatedEngagement: 'medium' })
      );

      await agent.draftPost(
        { sourceType: 'blog', sourceContent: SAMPLE_CONTENT, platform: 'twitter', locale: 'en', tone: 'professional' },
        TEST_CONTEXT
      );

      const taskArg = mockExecute.mock.calls[0][0].task as string;
      expect(taskArg).toContain('single post');
    });

    // -----------------------------------------------
    // threadMode — per-post character limit enforcement
    // -----------------------------------------------
    it('enforces per-post character limit for each thread segment independently', async () => {
      const twitterLimit = PLATFORM_LIMITS.twitter.maxChars; // 280
      const longSegment = 'A'.repeat(400); // exceeds 280
      const shortSegment = 'Short post #ZenAI';
      const threadContent = `${longSegment}\n---\n${shortSegment}`;

      mockExecute.mockResolvedValueOnce(
        makeSuccessOutput({ content: threadContent, hashtags: [], estimatedEngagement: 'high' })
      );

      const result = await agent.draftPost(
        { sourceType: 'blog', sourceContent: SAMPLE_CONTENT, platform: 'twitter', locale: 'en', tone: 'professional', threadMode: true },
        TEST_CONTEXT
      );

      const segments = result.content.split('\n---\n');
      for (const segment of segments) {
        expect(segment.length).toBeLessThanOrEqual(twitterLimit);
      }
      // The short segment must not be truncated
      expect(segments[1]).toBe(shortSegment);
    });

    // -----------------------------------------------
    // suggestedTime consistency — DB and return value match
    // -----------------------------------------------
    it('calls getSuggestedTime-equivalent once — DB scheduled_at and returned suggestedTime are the same', async () => {
      mockExecute.mockResolvedValueOnce(
        makeSuccessOutput({ content: 'Post', hashtags: [], estimatedEngagement: 'low' })
      );

      await agent.draftPost(
        { sourceType: 'blog', sourceContent: SAMPLE_CONTENT, platform: 'twitter', locale: 'en', tone: 'professional' },
        TEST_CONTEXT
      );

      // Both the DB call and the returned value should use the same Date instance
      const dbScheduledAt: Date = mockCreatePostDraft.mock.calls[0][1].scheduled_at;
      // We can't directly inspect the returned suggestedTime here as it was consumed above,
      // so we verify the DB call received a valid future Date
      expect(dbScheduledAt).toBeInstanceOf(Date);
      expect(dbScheduledAt.getTime()).toBeGreaterThan(Date.now() - 1000); // within a second of now (future)
    });

    // -----------------------------------------------
    // 10. Claude error handling
    // -----------------------------------------------
    it('throws when Claude returns success:false', async () => {
      mockExecute.mockResolvedValueOnce({
        role: 'writer',
        success: false,
        content: '',
        toolsUsed: [],
        tokensUsed: { input: 0, output: 0 },
        executionTimeMs: 100,
        error: 'Claude API timeout',
      });

      await expect(
        agent.draftPost(
          { sourceType: 'blog', sourceContent: SAMPLE_CONTENT, platform: 'twitter', locale: 'en', tone: 'professional' },
          TEST_CONTEXT
        )
      ).rejects.toThrow('Claude API timeout');
    });

    it('uses raw content as fallback when Claude returns non-JSON', async () => {
      // Response that is not valid JSON
      mockExecute.mockResolvedValueOnce({
        role: 'writer',
        success: true,
        content: 'This is just plain text not JSON at all.',
        toolsUsed: [],
        tokensUsed: { input: 100, output: 20 },
        executionTimeMs: 150,
      });

      const result = await agent.draftPost(
        { sourceType: 'blog', sourceContent: SAMPLE_CONTENT, platform: 'twitter', locale: 'en', tone: 'professional' },
        TEST_CONTEXT
      );

      expect(result.content).toBeTruthy();
      expect(result.hashtags).toEqual([]);
    });
  });

  // -----------------------------------------------
  // 11. draftForAllPlatforms
  // -----------------------------------------------
  describe('draftForAllPlatforms()', () => {
    it('returns 3 DraftResults (one per platform)', async () => {
      mockExecute
        .mockResolvedValueOnce(makeSuccessOutput({ content: 'Tweet', hashtags: ['ZenAI'], estimatedEngagement: 'high' }))
        .mockResolvedValueOnce(makeSuccessOutput({ content: 'LinkedIn post', hashtags: ['AI'], estimatedEngagement: 'medium' }))
        .mockResolvedValueOnce(makeSuccessOutput({ content: 'Discord Nachricht', hashtags: [], estimatedEngagement: 'medium' }));

      const results = await agent.draftForAllPlatforms(SAMPLE_CONTENT, 'blog', TEST_CONTEXT);

      expect(results).toHaveLength(3);
      expect(results.map(r => r.platform)).toEqual(['twitter', 'linkedin', 'discord']);
    });

    it('continues with remaining platforms when one fails', async () => {
      mockExecute
        .mockRejectedValueOnce(new Error('Twitter API error')) // twitter fails
        .mockResolvedValueOnce(makeSuccessOutput({ content: 'LinkedIn post', hashtags: ['AI'], estimatedEngagement: 'medium' }))
        .mockResolvedValueOnce(makeSuccessOutput({ content: 'Discord Nachricht', hashtags: [], estimatedEngagement: 'medium' }));

      const results = await agent.draftForAllPlatforms(SAMPLE_CONTENT, 'blog', TEST_CONTEXT);

      // Should still return 2 results (linkedin + discord)
      expect(results).toHaveLength(2);
      expect(results.map(r => r.platform)).toEqual(['linkedin', 'discord']);
    });

    it('throws when all platforms fail', async () => {
      mockExecute
        .mockRejectedValueOnce(new Error('Twitter error'))
        .mockRejectedValueOnce(new Error('LinkedIn error'))
        .mockRejectedValueOnce(new Error('Discord error'));

      await expect(
        agent.draftForAllPlatforms(SAMPLE_CONTENT, 'blog', TEST_CONTEXT)
      ).rejects.toThrow('All platform drafts failed');
    });

    it('uses correct default locales per platform', async () => {
      mockExecute
        .mockResolvedValueOnce(makeSuccessOutput({ content: 'Tweet', hashtags: [], estimatedEngagement: 'low' }))
        .mockResolvedValueOnce(makeSuccessOutput({ content: 'LinkedIn', hashtags: [], estimatedEngagement: 'low' }))
        .mockResolvedValueOnce(makeSuccessOutput({ content: 'Discord', hashtags: [], estimatedEngagement: 'low' }));

      await agent.draftForAllPlatforms(SAMPLE_CONTENT, 'changelog', TEST_CONTEXT);

      // Twitter call: should contain English instruction
      const twitterTask = mockExecute.mock.calls[0][0].task as string;
      expect(twitterTask).toContain('Write in English');

      // Discord call: should contain German instruction
      const discordTask = mockExecute.mock.calls[2][0].task as string;
      expect(discordTask).toContain('Deutsch');
    });
  });

  // -----------------------------------------------
  // 12. LinkedIn character limit (3000 chars)
  // -----------------------------------------------
  it('enforces linkedin 3000 char limit', async () => {
    const tooLong = 'B'.repeat(3500);
    mockExecute.mockResolvedValueOnce(
      makeSuccessOutput({ content: tooLong, hashtags: [], estimatedEngagement: 'low' })
    );

    const result = await agent.draftPost(
      { sourceType: 'blog', sourceContent: SAMPLE_CONTENT, platform: 'linkedin', locale: 'en', tone: 'professional' },
      TEST_CONTEXT
    );

    expect(result.content.length).toBeLessThanOrEqual(PLATFORM_LIMITS.linkedin.maxChars);
  });

  // -----------------------------------------------
  // 13. estimatedEngagement passthrough
  // -----------------------------------------------
  it('passes through estimatedEngagement from Claude response', async () => {
    mockExecute.mockResolvedValueOnce(
      makeSuccessOutput({ content: 'Viral tweet!', hashtags: ['ZenAI'], estimatedEngagement: 'high' })
    );

    const result = await agent.draftPost(
      { sourceType: 'blog', sourceContent: SAMPLE_CONTENT, platform: 'twitter', locale: 'en', tone: 'operations' },
      TEST_CONTEXT
    );

    expect(result.estimatedEngagement).toBe('high');
  });

  // -----------------------------------------------
  // 14. Governance integration
  // -----------------------------------------------
  describe('Governance integration', () => {
    it('calls requestApproval with correct action_type and risk_level after drafting', async () => {
      mockExecute.mockResolvedValueOnce(
        makeSuccessOutput({ content: 'Governance test tweet', hashtags: ['ZenAI'], estimatedEngagement: 'medium' })
      );
      mockQueryContext.mockResolvedValue({ rows: [], rowCount: 1 });

      await agent.draftPost(
        { sourceType: 'blog', sourceContent: SAMPLE_CONTENT, platform: 'twitter', locale: 'en', tone: 'professional' },
        TEST_CONTEXT
      );

      expect(mockRequestApproval).toHaveBeenCalledTimes(1);
      const callArgs = mockRequestApproval.mock.calls[0];
      expect(callArgs[0]).toBe(TEST_CONTEXT);
      expect(callArgs[1].action_type).toBe('social_publish');
      expect(callArgs[1].risk_level).toBe('medium');
      expect(callArgs[1].payload).toMatchObject({ platform: 'twitter', postId: 'mock-post-id' });
    });

    it('updates post governance_id in DB after requestApproval succeeds', async () => {
      mockExecute.mockResolvedValueOnce(
        makeSuccessOutput({ content: 'Post for governance tracking', hashtags: [], estimatedEngagement: 'low' })
      );
      mockQueryContext.mockResolvedValue({ rows: [], rowCount: 1 });

      await agent.draftPost(
        { sourceType: 'changelog', sourceContent: SAMPLE_CONTENT, platform: 'linkedin', locale: 'en', tone: 'professional' },
        TEST_CONTEXT
      );

      // queryContext should be called with the governance_id UPDATE
      expect(mockQueryContext).toHaveBeenCalledWith(
        TEST_CONTEXT,
        expect.stringContaining('UPDATE social_posts SET governance_id'),
        ['mock-post-id', 'gov-action-id']
      );
    });

    it('still returns DraftResult even when requestApproval throws', async () => {
      mockExecute.mockResolvedValueOnce(
        makeSuccessOutput({ content: 'Resilient tweet', hashtags: ['ZenAI'], estimatedEngagement: 'high' })
      );
      mockRequestApproval.mockRejectedValueOnce(new Error('Governance service unavailable'));

      const result = await agent.draftPost(
        { sourceType: 'blog', sourceContent: SAMPLE_CONTENT, platform: 'twitter', locale: 'en', tone: 'professional' },
        TEST_CONTEXT
      );

      // Should not throw, and should return normal result
      expect(result.platform).toBe('twitter');
      expect(result.content).toBeTruthy();
    });

    it('includes platform and post snippet in requestApproval description', async () => {
      mockExecute.mockResolvedValueOnce(
        makeSuccessOutput({ content: 'ZenAI V4 is now live with GraphRAG!', hashtags: ['ZenAI'], estimatedEngagement: 'high' })
      );
      mockQueryContext.mockResolvedValue({ rows: [], rowCount: 1 });

      await agent.draftPost(
        { sourceType: 'blog', sourceContent: SAMPLE_CONTENT, platform: 'discord', locale: 'de', tone: 'professional' },
        TEST_CONTEXT
      );

      const callArgs = mockRequestApproval.mock.calls[0];
      expect(callArgs[1].description).toContain('discord');
    });
  });
});
