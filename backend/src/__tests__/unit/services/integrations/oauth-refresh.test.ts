// backend/src/__tests__/unit/services/integrations/oauth-refresh.test.ts
const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

import { oauthManager } from '../../../../services/auth/oauth-providers';

describe('OAuthProviderManager.refreshAccessToken', () => {
  beforeAll(() => {
    // Seed the google config into the singleton so refreshAccessToken can find it
    (oauthManager as unknown as { configs: Map<string, unknown> }).configs.set('google', {
      clientId: 'test-client-id',
      clientSecret: 'test-client-secret',
      redirectUri: 'https://example.com/callback',
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should refresh a Google access token', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        access_token: 'new-access-token',
        expires_in: 3600,
        token_type: 'Bearer',
      }),
    });

    const result = await oauthManager.refreshAccessToken('google', 'old-refresh-token');

    expect(result.accessToken).toBe('new-access-token');
    expect(result.expiresIn).toBe(3600);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://oauth2.googleapis.com/token',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }),
    );
  });

  it('should throw OAuthError on refresh failure', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: 'invalid_grant' }),
    });

    await expect(
      oauthManager.refreshAccessToken('google', 'expired-refresh-token'),
    ).rejects.toThrow('Token refresh failed');
  });

  it('should throw for unknown provider', async () => {
    await expect(
      oauthManager.refreshAccessToken('unknown-provider', 'token'),
    ).rejects.toThrow('Unknown provider');
  });

  it('should handle rotated refresh tokens', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        access_token: 'new-access',
        refresh_token: 'new-refresh',
        expires_in: 3600,
      }),
    });

    const result = await oauthManager.refreshAccessToken('google', 'old-refresh');

    expect(result.accessToken).toBe('new-access');
    expect(result.refreshToken).toBe('new-refresh');
  });
});
