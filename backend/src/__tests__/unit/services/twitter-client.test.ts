/**
 * Unit Tests for Twitter/X Client
 *
 * Tests the Twitter API client: availability, tweeting, deletion,
 * recent tweets retrieval, and analytics.
 */

jest.mock('axios');
jest.mock('../../../utils/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

import axios from 'axios';
import {
  isTwitterAvailable,
  tweet,
  deleteTweet,
  getRecentTweets,
  getTweetAnalytics,
} from '../../../services/twitter-client';

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('Twitter Client', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    process.env.TWITTER_BEARER_TOKEN = 'test-bearer';
    process.env.TWITTER_API_KEY = 'test-key';
    process.env.TWITTER_API_SECRET = 'test-secret';
    process.env.TWITTER_ACCESS_TOKEN = 'test-access';
    process.env.TWITTER_ACCESS_TOKEN_SECRET = 'test-access-secret';
    // Set user ID to skip the /users/me lookup in getRecentTweets
    process.env.TWITTER_USER_ID = 'test-user-id';
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('isTwitterAvailable', () => {
    it('should return true when all credentials are set', () => {
      expect(isTwitterAvailable()).toBe(true);
    });

    it('should return false when API key is missing', () => {
      delete process.env.TWITTER_API_KEY;
      expect(isTwitterAvailable()).toBe(false);
    });

    it('should return false when access token is missing', () => {
      delete process.env.TWITTER_ACCESS_TOKEN;
      expect(isTwitterAvailable()).toBe(false);
    });

    it('should return false when nothing is configured', () => {
      delete process.env.TWITTER_BEARER_TOKEN;
      delete process.env.TWITTER_API_KEY;
      delete process.env.TWITTER_API_SECRET;
      delete process.env.TWITTER_ACCESS_TOKEN;
      delete process.env.TWITTER_ACCESS_TOKEN_SECRET;
      expect(isTwitterAvailable()).toBe(false);
    });
  });

  describe('tweet', () => {
    it('should post a tweet and return result', async () => {
      mockedAxios.post = jest.fn().mockResolvedValueOnce({
        data: {
          data: {
            id: '1234567890',
            text: 'Hello from ZenBrain!',
          },
        },
      });

      const result = await tweet('Hello from ZenBrain!');

      expect(result.id).toBe('1234567890');
      expect(result.text).toBe('Hello from ZenBrain!');
      expect(result.url).toContain('1234567890');
    });

    it('should throw when content is empty', async () => {
      await expect(tweet('')).rejects.toThrow('Tweet content cannot be empty');
    });

    it('should throw when content exceeds 280 characters', async () => {
      const longText = 'x'.repeat(281);
      await expect(tweet(longText)).rejects.toThrow('Tweet content exceeds 280 characters');
    });

    it('should throw when Twitter is not configured', async () => {
      delete process.env.TWITTER_API_KEY;
      await expect(tweet('Hello!')).rejects.toThrow('Twitter is not configured');
    });

    it('should handle API errors gracefully', async () => {
      mockedAxios.post = jest.fn().mockRejectedValueOnce(new Error('API rate limit exceeded'));
      await expect(tweet('Hello!')).rejects.toThrow();
    });
  });

  describe('deleteTweet', () => {
    it('should delete a tweet by ID', async () => {
      mockedAxios.delete = jest.fn().mockResolvedValueOnce({
        data: { data: { deleted: true } },
      });

      await expect(deleteTweet('1234567890')).resolves.toBeUndefined();
    });

    it('should throw for empty tweet ID', async () => {
      await expect(deleteTweet('')).rejects.toThrow('Tweet ID is required');
    });

    it('should handle not-found errors', async () => {
      const error = new Error('Request failed with status code 404');
      mockedAxios.delete = jest.fn().mockRejectedValueOnce(error);
      await expect(deleteTweet('nonexistent')).rejects.toThrow();
    });
  });

  describe('getRecentTweets', () => {
    it('should return recent tweets for the authenticated user', async () => {
      mockedAxios.get = jest.fn().mockResolvedValueOnce({
        data: {
          data: [
            { id: '1', text: 'Tweet 1', created_at: '2026-03-28T10:00:00Z' },
            { id: '2', text: 'Tweet 2', created_at: '2026-03-27T10:00:00Z' },
          ],
          meta: { result_count: 2 },
        },
      });

      const tweets = await getRecentTweets(5);

      expect(tweets).toHaveLength(2);
      expect(tweets[0].id).toBe('1');
      expect(tweets[0].text).toBe('Tweet 1');
    });

    it('should cap count at 100', async () => {
      mockedAxios.get = jest.fn().mockResolvedValueOnce({
        data: { data: [], meta: { result_count: 0 } },
      });

      await getRecentTweets(500);

      const callArgs = mockedAxios.get.mock.calls[0];
      expect(callArgs[1]?.params?.max_results).toBeLessThanOrEqual(100);
    });

    it('should return empty array when no tweets exist', async () => {
      mockedAxios.get = jest.fn().mockResolvedValueOnce({
        data: { meta: { result_count: 0 } },
      });

      const tweets = await getRecentTweets();
      expect(tweets).toEqual([]);
    });

    it('should throw when Twitter is not configured', async () => {
      delete process.env.TWITTER_BEARER_TOKEN;
      delete process.env.TWITTER_API_KEY;
      delete process.env.TWITTER_API_SECRET;
      delete process.env.TWITTER_ACCESS_TOKEN;
      delete process.env.TWITTER_ACCESS_TOKEN_SECRET;
      delete process.env.TWITTER_USER_ID;
      await expect(getRecentTweets()).rejects.toThrow('Twitter is not configured');
    });
  });

  describe('getTweetAnalytics', () => {
    it('should return analytics for a tweet', async () => {
      mockedAxios.get = jest.fn().mockResolvedValueOnce({
        data: {
          data: {
            id: '1234567890',
            text: 'Hello from ZenBrain!',
            public_metrics: {
              retweet_count: 5,
              like_count: 42,
              reply_count: 3,
              impression_count: 1200,
            },
          },
        },
      });

      const analytics = await getTweetAnalytics('1234567890');

      expect(analytics.id).toBe('1234567890');
      expect(analytics.likes).toBe(42);
      expect(analytics.retweets).toBe(5);
      expect(analytics.replies).toBe(3);
      expect(analytics.impressions).toBe(1200);
    });

    it('should throw for empty tweet ID', async () => {
      await expect(getTweetAnalytics('')).rejects.toThrow('Tweet ID is required');
    });
  });
});
