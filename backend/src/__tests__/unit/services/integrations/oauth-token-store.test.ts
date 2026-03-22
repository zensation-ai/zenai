// backend/src/__tests__/unit/services/integrations/oauth-token-store.test.ts

const mockQueryPublic = jest.fn();
jest.mock('../../../../utils/database-context', () => ({
  queryPublic: (...args: unknown[]) => mockQueryPublic(...args),
}));

jest.mock('../../../../services/security/field-encryption', () => ({
  encrypt: (val: string) => `enc:${val}`,
  decrypt: (val: string) => val.replace('enc:', ''),
  isEncryptionAvailable: () => true,
}));

const mockRefreshAccessToken = jest.fn();
jest.mock('../../../../services/auth/oauth-providers', () => ({
  oauthManager: {
    refreshAccessToken: (...args: unknown[]) => mockRefreshAccessToken(...args),
  },
}));

import { OAuthTokenStore } from '../../../../services/integrations/oauth-token-store';

describe('OAuthTokenStore', () => {
  let store: OAuthTokenStore;

  beforeEach(() => {
    jest.clearAllMocks();
    store = new OAuthTokenStore();
  });

  describe('storeTokens', () => {
    it('should encrypt and store tokens', async () => {
      mockQueryPublic.mockResolvedValueOnce({ rows: [] });

      await store.storeTokens('user-1', 'gmail', 'google', {
        accessToken: 'access-123',
        refreshToken: 'refresh-456',
        tokenType: 'Bearer',
        expiresAt: new Date('2026-12-31T00:00:00Z'),
        scopes: ['email', 'calendar'],
      });

      expect(mockQueryPublic).toHaveBeenCalledTimes(1);
      const [sql, params] = mockQueryPublic.mock.calls[0];
      expect(sql).toMatch(/INSERT INTO public\.integration_tokens/i);
      // Verify access_token and refresh_token are encrypted (enc: prefix from mock)
      expect(params).toEqual(
        expect.arrayContaining([
          'user-1',
          'gmail',
          'google',
          'enc:access-123',
          'enc:refresh-456',
        ]),
      );
    });

    it('should store tokens without refresh token', async () => {
      mockQueryPublic.mockResolvedValueOnce({ rows: [] });

      await store.storeTokens('user-1', 'slack', 'slack', {
        accessToken: 'access-abc',
        tokenType: 'Bearer',
        scopes: ['channels:read'],
      });

      expect(mockQueryPublic).toHaveBeenCalledTimes(1);
      const [sql, params] = mockQueryPublic.mock.calls[0];
      expect(sql).toMatch(/INSERT INTO public\.integration_tokens/i);
      expect(params).toEqual(expect.arrayContaining(['enc:access-abc']));
    });
  });

  describe('getValidToken', () => {
    it('should return decrypted tokens when not expired', async () => {
      const futureDate = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now
      mockQueryPublic.mockResolvedValueOnce({
        rows: [
          {
            access_token: 'enc:access-123',
            refresh_token: 'enc:refresh-456',
            token_type: 'Bearer',
            expires_at: futureDate,
            scopes: ['email'],
            provider: 'google',
          },
        ],
      });

      const result = await store.getValidToken('user-1', 'gmail');

      expect(result).not.toBeNull();
      expect(result?.accessToken).toBe('access-123');
      expect(result?.refreshToken).toBe('refresh-456');
      expect(result?.scopes).toEqual(['email']);
    });

    it('should auto-refresh when expiring within 5 minutes', async () => {
      const soonExpiry = new Date(Date.now() + 2 * 60 * 1000); // 2 min from now
      mockQueryPublic
        .mockResolvedValueOnce({
          rows: [
            {
              access_token: 'enc:old-access',
              refresh_token: 'enc:old-refresh',
              token_type: 'Bearer',
              expires_at: soonExpiry,
              scopes: ['email'],
              provider: 'google',
            },
          ],
        })
        // Second call for storeTokens after refresh
        .mockResolvedValueOnce({ rows: [] });

      mockRefreshAccessToken.mockResolvedValueOnce({
        accessToken: 'new-access',
        refreshToken: 'new-refresh',
        expiresIn: 3600,
      });

      const result = await store.getValidToken('user-1', 'gmail');

      expect(mockRefreshAccessToken).toHaveBeenCalledWith('google', 'old-refresh');
      expect(result?.accessToken).toBe('new-access');
    });

    it('should return null when no tokens exist', async () => {
      mockQueryPublic.mockResolvedValueOnce({ rows: [] });

      const result = await store.getValidToken('user-1', 'gmail');

      expect(result).toBeNull();
    });
  });

  describe('revokeTokens', () => {
    it('should delete tokens from database', async () => {
      mockQueryPublic.mockResolvedValueOnce({ rows: [] });

      await store.revokeTokens('user-1', 'gmail');

      expect(mockQueryPublic).toHaveBeenCalledTimes(1);
      const [sql, params] = mockQueryPublic.mock.calls[0];
      expect(sql).toMatch(/DELETE FROM public\.integration_tokens/i);
      expect(params).toEqual(expect.arrayContaining(['user-1', 'gmail']));
    });
  });

  describe('hasTokens', () => {
    it('should return true when tokens exist', async () => {
      mockQueryPublic.mockResolvedValueOnce({ rows: [{ count: '1' }] });

      const result = await store.hasTokens('user-1', 'gmail');

      expect(result).toBe(true);
    });

    it('should return false when no tokens', async () => {
      mockQueryPublic.mockResolvedValueOnce({ rows: [{ count: '0' }] });

      const result = await store.hasTokens('user-1', 'gmail');

      expect(result).toBe(false);
    });
  });

  describe('findExpiringTokens', () => {
    it('should find tokens expiring within N minutes', async () => {
      mockQueryPublic.mockResolvedValueOnce({
        rows: [
          { user_id: 'user-1', connector_id: 'gmail', provider: 'google' },
          { user_id: 'user-2', connector_id: 'calendar', provider: 'google' },
        ],
      });

      const result = await store.findExpiringTokens(30);

      expect(mockQueryPublic).toHaveBeenCalledTimes(1);
      const [sql, params] = mockQueryPublic.mock.calls[0];
      expect(sql).toMatch(/SELECT[\s\S]+FROM public\.integration_tokens/i);
      expect(params).toEqual(expect.arrayContaining([30]));
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ userId: 'user-1', connectorId: 'gmail', provider: 'google' });
      expect(result[1]).toEqual({ userId: 'user-2', connectorId: 'calendar', provider: 'google' });
    });

    it('should return empty array when no tokens expiring', async () => {
      mockQueryPublic.mockResolvedValueOnce({ rows: [] });

      const result = await store.findExpiringTokens(15);

      expect(result).toEqual([]);
    });
  });
});
