jest.mock('../../../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const mockFetch = jest.fn();
global.fetch = mockFetch;

import { TwitterClient, createTwitterClient } from '../../../../services/social/twitter-client';

describe('TwitterClient', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('isConfigured()', () => {
    it('returns true when access token provided', () => {
      const client = new TwitterClient({ accessToken: 'tok', refreshToken: null, expiresAt: null, dbId: null });
      expect(client.isConfigured()).toBe(true);
    });

    it('returns false when no token', () => {
      const client = new TwitterClient({ accessToken: undefined, refreshToken: null, expiresAt: null, dbId: null });
      expect(client.isConfigured()).toBe(false);
    });
  });

  describe('needsRefresh()', () => {
    it('returns true when expires within 5 minutes', () => {
      const soon = new Date(Date.now() + 3 * 60 * 1000);
      const client = new TwitterClient({ accessToken: 'tok', refreshToken: 'rt', expiresAt: soon, dbId: null });
      expect(client.needsRefresh()).toBe(true);
    });

    it('returns false when expires in more than 5 minutes', () => {
      const later = new Date(Date.now() + 10 * 60 * 1000);
      const client = new TwitterClient({ accessToken: 'tok', refreshToken: 'rt', expiresAt: later, dbId: null });
      expect(client.needsRefresh()).toBe(false);
    });

    it('returns false when expiresAt is null', () => {
      const client = new TwitterClient({ accessToken: 'tok', refreshToken: null, expiresAt: null, dbId: null });
      expect(client.needsRefresh()).toBe(false);
    });
  });

  describe('publish()', () => {
    it('posts tweet and returns platformPostId', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { id: 'tweet123' } }),
      });

      const client = new TwitterClient({ accessToken: 'tok', refreshToken: null, expiresAt: null, dbId: null });
      const result = await client.publish('Hello world');

      expect(result.success).toBe(true);
      expect(result.platformPostId).toBe('tweet123');
      expect(result.url).toContain('tweet123');
    });

    it('returns error on API failure', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 401, text: async () => 'Unauthorized' });

      const client = new TwitterClient({ accessToken: 'tok', refreshToken: null, expiresAt: null, dbId: null });
      const result = await client.publish('Hello');

      expect(result.success).toBe(false);
      expect(result.error).toContain('401');
    });
  });
});

describe('createTwitterClient()', () => {
  it('falls back to TWITTER_ACCESS_TOKEN env var when no input provided', () => {
    const original = process.env.TWITTER_ACCESS_TOKEN;
    process.env.TWITTER_ACCESS_TOKEN = 'env-tok';
    const client = createTwitterClient();
    expect(client.isConfigured()).toBe(true);
    process.env.TWITTER_ACCESS_TOKEN = original;
  });
});

describe('TwitterClient publishThread()', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns partial failure with firstTweetId when second post fails', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { id: 'first-tweet' } }) })
      .mockResolvedValueOnce({ ok: false, text: async () => 'Rate limited' });

    const client = new TwitterClient({ accessToken: 'tok', refreshToken: null, expiresAt: null, dbId: null });
    const result = await client.publishThread(['Post 1', 'Post 2']);

    expect(result.success).toBe(false);
    expect(result.platformPostId).toBe('first-tweet');
  });
});
