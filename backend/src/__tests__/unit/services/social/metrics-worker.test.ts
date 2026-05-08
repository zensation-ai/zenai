const mockFetch = jest.fn();
global.fetch = mockFetch;

jest.mock('../../../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../../../utils/database-context', () => ({
  queryContext: jest.fn(),
}));

jest.mock('../../../../services/security/field-encryption', () => ({
  decrypt: jest.fn((s: string) => s),
  isEncryptionAvailable: jest.fn(() => false),
}));

import { fetchAndStoreMetrics } from '../../../../services/social/metrics-worker';
import { queryContext } from '../../../../utils/database-context';
import type { AIContext } from '../../../../utils/database-context';

const mockQueryContext = queryContext as jest.Mock;

describe('fetchAndStoreMetrics', () => {
  beforeEach(() => jest.clearAllMocks());

  it('skips when platform_post_id is missing', async () => {
    mockQueryContext.mockResolvedValueOnce({
      rows: [{ platform: 'twitter', platform_post_id: null, access_token_encrypted: 'tok' }],
    });

    await fetchAndStoreMetrics('post-1', 'finance' as AIContext);

    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockQueryContext).toHaveBeenCalledTimes(1); // only the SELECT
  });

  it('skips when platform_post_id is "unknown"', async () => {
    mockQueryContext.mockResolvedValueOnce({
      rows: [{ platform: 'twitter', platform_post_id: 'unknown', access_token_encrypted: 'tok' }],
    });

    await fetchAndStoreMetrics('post-1', 'finance' as AIContext);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('fetches Twitter metrics and updates DB', async () => {
    process.env.TWITTER_ACCESS_TOKEN = 'test-token';
    mockQueryContext
      .mockResolvedValueOnce({
        rows: [{ platform: 'twitter', platform_post_id: 'tweet123', access_token_encrypted: 'tok' }],
      })
      .mockResolvedValueOnce({ rows: [] }); // account token lookup
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          public_metrics: { impression_count: 100, like_count: 5, retweet_count: 2, reply_count: 1, quote_count: 0 }
        },
      }),
    });
    mockQueryContext.mockResolvedValueOnce({ rows: [] }); // UPDATE

    await fetchAndStoreMetrics('post-1', 'finance' as AIContext);

    delete process.env.TWITTER_ACCESS_TOKEN;

    const updateCall = mockQueryContext.mock.calls.find(c => c[1].includes('metrics'));
    expect(updateCall).toBeDefined();
  });

  it('skips when post not found', async () => {
    mockQueryContext.mockResolvedValueOnce({ rows: [] });
    await fetchAndStoreMetrics('nonexistent', 'finance' as AIContext);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('fetches LinkedIn metrics and updates DB', async () => {
    mockQueryContext
      .mockResolvedValueOnce({
        rows: [{ platform: 'linkedin', platform_post_id: 'li_post_456' }],
      })
      .mockResolvedValueOnce({
        rows: [{ access_token_encrypted: 'li_tok', metadata: { org_urn: 'urn:li:organization:12345' } }],
      });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        elements: [{
          totalShareStatistics: {
            impressionCount: 500, likeCount: 25, clickCount: 10, shareCount: 3,
          },
        }],
      }),
    });
    mockQueryContext.mockResolvedValueOnce({ rows: [] }); // UPDATE

    await fetchAndStoreMetrics('post-2', 'finance' as AIContext);

    const updateCall = mockQueryContext.mock.calls.find(c => c[1].includes('metrics'));
    expect(updateCall).toBeDefined();
    // Verify ugcPosts=List(...) was used, not shares=List(...)
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('ugcPosts=List('),
      expect.any(Object),
    );
    // Verify X-Restli-Protocol-Version header
    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ 'X-Restli-Protocol-Version': '2.0.0' }),
      }),
    );
  });
});
