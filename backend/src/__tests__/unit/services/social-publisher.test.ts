/**
 * Unit Tests for Social Publisher
 *
 * Tests the orchestration layer that publishes to multiple social platforms:
 * Twitter/X and Discord.
 */

jest.mock('../../../services/twitter-client');
jest.mock('../../../services/discord-client');
jest.mock('../../../utils/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

import {
  publishToTwitter,
  publishToDiscord,
  publishToAll,
  schedulePost,
  getScheduledPosts,
  cancelScheduledPost,
} from '../../../services/social-publisher';
import * as twitterClient from '../../../services/twitter-client';
import * as discordClient from '../../../services/discord-client';

const mockTweet = twitterClient.tweet as jest.MockedFunction<typeof twitterClient.tweet>;
const mockDiscordSend = discordClient.sendMessage as jest.MockedFunction<typeof discordClient.sendMessage>;
const mockIsTwitterAvailable = twitterClient.isTwitterAvailable as jest.MockedFunction<typeof twitterClient.isTwitterAvailable>;
const mockIsDiscordAvailable = discordClient.isDiscordAvailable as jest.MockedFunction<typeof discordClient.isDiscordAvailable>;

describe('Social Publisher', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsTwitterAvailable.mockReturnValue(true);
    mockIsDiscordAvailable.mockReturnValue(true);
  });

  describe('publishToTwitter', () => {
    it('should publish a post to Twitter and return result', async () => {
      mockTweet.mockResolvedValueOnce({
        id: 'tw-123',
        text: 'Hello from ZenBrain!',
        url: 'https://x.com/zensationai/status/tw-123',
        created_at: '2026-03-29T10:00:00Z',
      });

      const result = await publishToTwitter('Hello from ZenBrain!');

      expect(result.platform).toBe('twitter');
      expect(result.success).toBe(true);
      expect(result.post_id).toBe('tw-123');
      expect(result.url).toContain('tw-123');
    });

    it('should return failure result when Twitter is not configured', async () => {
      mockIsTwitterAvailable.mockReturnValue(false);

      const result = await publishToTwitter('Hello!');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not configured');
    });

    it('should return failure result when API call fails', async () => {
      mockTweet.mockRejectedValueOnce(new Error('Rate limit exceeded'));

      const result = await publishToTwitter('Hello!');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('publishToDiscord', () => {
    it('should publish a post to Discord and return result', async () => {
      mockDiscordSend.mockResolvedValueOnce({ success: true, message_id: 'dc-456' });

      const result = await publishToDiscord('New ZenBrain release!');

      expect(result.platform).toBe('discord');
      expect(result.success).toBe(true);
    });

    it('should return failure result when Discord is not configured', async () => {
      mockIsDiscordAvailable.mockReturnValue(false);

      const result = await publishToDiscord('Hello!');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not configured');
    });

    it('should pass options to Discord client', async () => {
      mockDiscordSend.mockResolvedValueOnce({ success: true, message_id: 'dc-789' });

      await publishToDiscord('Hello!', { channelId: 'ch-123' });

      expect(mockDiscordSend).toHaveBeenCalledWith('Hello!', { channelId: 'ch-123' });
    });
  });

  describe('publishToAll', () => {
    it('should publish to all configured platforms', async () => {
      mockTweet.mockResolvedValueOnce({
        id: 'tw-1',
        text: 'ZenBrain is live!',
        url: 'https://x.com/zensationai/status/tw-1',
        created_at: '2026-03-29T10:00:00Z',
      });
      mockDiscordSend.mockResolvedValueOnce({ success: true, message_id: 'dc-1' });

      const results = await publishToAll({
        content: 'ZenBrain is live!',
        platforms: ['twitter', 'discord'],
      });

      expect(results).toHaveLength(2);
      expect(results.find(r => r.platform === 'twitter')?.success).toBe(true);
      expect(results.find(r => r.platform === 'discord')?.success).toBe(true);
    });

    it('should only publish to specified platforms', async () => {
      mockTweet.mockResolvedValueOnce({
        id: 'tw-2',
        text: 'Twitter only',
        url: 'https://x.com/status/tw-2',
        created_at: '2026-03-29T10:00:00Z',
      });

      const results = await publishToAll({
        content: 'Twitter only',
        platforms: ['twitter'],
      });

      expect(results).toHaveLength(1);
      expect(results[0].platform).toBe('twitter');
      expect(mockDiscordSend).not.toHaveBeenCalled();
    });

    it('should continue publishing even if one platform fails', async () => {
      mockTweet.mockRejectedValueOnce(new Error('Twitter failed'));
      mockDiscordSend.mockResolvedValueOnce({ success: true, message_id: 'dc-2' });

      const results = await publishToAll({
        content: 'Cross-platform post',
        platforms: ['twitter', 'discord'],
      });

      expect(results).toHaveLength(2);
      expect(results.find(r => r.platform === 'twitter')?.success).toBe(false);
      expect(results.find(r => r.platform === 'discord')?.success).toBe(true);
    });

    it('should throw when no platforms are specified', async () => {
      await expect(publishToAll({ content: 'Hello!', platforms: [] }))
        .rejects.toThrow('At least one platform must be specified');
    });

    it('should throw when content is empty', async () => {
      await expect(publishToAll({ content: '', platforms: ['twitter'] }))
        .rejects.toThrow('Post content cannot be empty');
    });
  });

  describe('schedulePost', () => {
    it('should schedule a post for future publishing', async () => {
      const scheduledAt = new Date(Date.now() + 3600000); // 1 hour from now

      const scheduled = await schedulePost({
        content: 'Scheduled post',
        platforms: ['twitter'],
        scheduled_at: scheduledAt,
      });

      expect(scheduled.id).toBeDefined();
      expect(scheduled.content).toBe('Scheduled post');
      expect(scheduled.platforms).toEqual(['twitter']);
      expect(new Date(scheduled.scheduled_at)).toEqual(scheduledAt);
      expect(scheduled.status).toBe('scheduled');
    });

    it('should throw when scheduled time is in the past', async () => {
      const pastDate = new Date(Date.now() - 3600000);

      await expect(schedulePost({
        content: 'Past post',
        platforms: ['twitter'],
        scheduled_at: pastDate,
      })).rejects.toThrow('Scheduled time must be in the future');
    });
  });

  describe('getScheduledPosts', () => {
    it('should return all scheduled posts', async () => {
      // Schedule a post first
      const scheduledAt = new Date(Date.now() + 3600000);
      await schedulePost({
        content: 'Post 1',
        platforms: ['twitter'],
        scheduled_at: scheduledAt,
      });

      const posts = await getScheduledPosts();
      expect(Array.isArray(posts)).toBe(true);
      expect(posts.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('cancelScheduledPost', () => {
    it('should cancel a scheduled post', async () => {
      const scheduledAt = new Date(Date.now() + 3600000);
      const post = await schedulePost({
        content: 'To be cancelled',
        platforms: ['twitter'],
        scheduled_at: scheduledAt,
      });

      await expect(cancelScheduledPost(post.id)).resolves.toBeUndefined();

      const posts = await getScheduledPosts();
      expect(posts.find(p => p.id === post.id)).toBeUndefined();
    });

    it('should throw when post does not exist', async () => {
      await expect(cancelScheduledPost('nonexistent-id')).rejects.toThrow('Scheduled post not found');
    });
  });
});
