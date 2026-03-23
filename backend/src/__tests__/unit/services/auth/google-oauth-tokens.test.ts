import {
  createGoogleToken,
  getGoogleToken,
  getGoogleTokenByEmail,
  updateGoogleTokens,
  deleteGoogleToken,
  isTokenExpired,
  getGoogleTokensForUser,
} from '../../../../services/auth/google-oauth-tokens';

jest.mock('../../../../utils/database', () => ({
  pool: {
    query: jest.fn(),
  },
}));

jest.mock('../../../../services/security/field-encryption', () => ({
  encrypt: jest.fn((val: string) => `enc:v1:${val}`),
  decrypt: jest.fn((val: string) => val.replace('enc:v1:', '')),
  isEncryptionAvailable: jest.fn(() => true),
}));

import { pool } from '../../../../utils/database';

const mockQuery = pool.query as jest.Mock;

describe('GoogleOAuthTokenService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createGoogleToken', () => {
    it('should insert token with encrypted access_token and refresh_token', async () => {
      const tokenId = 'test-uuid';
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: tokenId,
          user_id: 'user-1',
          google_email: 'user@gmail.com',
          access_token: 'enc:v1:access-123',
          refresh_token: 'enc:v1:refresh-456',
          scopes: ['gmail.modify'],
          expires_at: '2026-03-22T12:00:00Z',
          created_at: '2026-03-22T11:00:00Z',
          updated_at: '2026-03-22T11:00:00Z',
        }],
      });

      const result = await createGoogleToken({
        userId: 'user-1',
        googleEmail: 'user@gmail.com',
        accessToken: 'access-123',
        refreshToken: 'refresh-456',
        scopes: ['gmail.modify'],
        expiresAt: new Date('2026-03-22T12:00:00Z'),
      });

      expect(result.id).toBe(tokenId);
      expect(result.google_email).toBe('user@gmail.com');
      const insertCall = mockQuery.mock.calls[0];
      expect(insertCall[1]).toContain('enc:v1:access-123');
      expect(insertCall[1]).toContain('enc:v1:refresh-456');
    });
  });

  describe('getGoogleToken', () => {
    it('should return token with decrypted values', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'token-1',
          user_id: 'user-1',
          google_email: 'user@gmail.com',
          access_token: 'enc:v1:access-123',
          refresh_token: 'enc:v1:refresh-456',
          scopes: ['gmail.modify'],
          expires_at: '2026-03-22T12:00:00Z',
        }],
      });

      const result = await getGoogleToken('token-1');
      expect(result).not.toBeNull();
      expect(result!.access_token).toBe('access-123');
      expect(result!.refresh_token).toBe('refresh-456');
    });

    it('should return null for non-existent token', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const result = await getGoogleToken('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('getGoogleTokenByEmail', () => {
    it('should find token by user_id and google_email', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'token-1',
          user_id: 'user-1',
          google_email: 'user@gmail.com',
          access_token: 'enc:v1:access-123',
          refresh_token: 'enc:v1:refresh-456',
          scopes: ['gmail.modify'],
          expires_at: '2026-03-22T12:00:00Z',
        }],
      });

      const result = await getGoogleTokenByEmail('user-1', 'user@gmail.com');
      expect(result).not.toBeNull();
      expect(result!.google_email).toBe('user@gmail.com');
    });
  });

  describe('updateGoogleTokens', () => {
    it('should update access_token and expires_at with encryption', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'token-1',
          access_token: 'enc:v1:new-access',
          refresh_token: 'enc:v1:old-refresh',
          expires_at: '2026-03-22T13:00:00Z',
          updated_at: '2026-03-22T12:00:00Z',
        }],
      });

      const result = await updateGoogleTokens('token-1', {
        accessToken: 'new-access',
        expiresAt: new Date('2026-03-22T13:00:00Z'),
      });

      expect(result).not.toBeNull();
      const updateCall = mockQuery.mock.calls[0];
      expect(updateCall[1]).toContain('enc:v1:new-access');
    });

    it('should also update refresh_token if provided', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'token-1',
          access_token: 'enc:v1:new-access',
          refresh_token: 'enc:v1:new-refresh',
          expires_at: '2026-03-22T13:00:00Z',
          updated_at: '2026-03-22T12:00:00Z',
        }],
      });

      await updateGoogleTokens('token-1', {
        accessToken: 'new-access',
        refreshToken: 'new-refresh',
        expiresAt: new Date('2026-03-22T13:00:00Z'),
      });

      const updateCall = mockQuery.mock.calls[0];
      expect(updateCall[1]).toContain('enc:v1:new-refresh');
    });
  });

  describe('deleteGoogleToken', () => {
    it('should delete token by id', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });
      await deleteGoogleToken('token-1');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM public.google_oauth_tokens'),
        ['token-1']
      );
    });
  });

  describe('isTokenExpired', () => {
    it('should return true if token expires within 5 minutes', () => {
      const expiresAt = new Date(Date.now() + 3 * 60 * 1000);
      expect(isTokenExpired(expiresAt)).toBe(true);
    });

    it('should return false if token expires in more than 5 minutes', () => {
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
      expect(isTokenExpired(expiresAt)).toBe(false);
    });

    it('should return true if token already expired', () => {
      const expiresAt = new Date(Date.now() - 60 * 1000);
      expect(isTokenExpired(expiresAt)).toBe(true);
    });
  });

  describe('getGoogleTokensForUser', () => {
    it('should return all tokens for a user', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: 't1', google_email: 'a@gmail.com', access_token: 'enc:v1:a', refresh_token: 'enc:v1:r1', scopes: ['gmail.modify'], expires_at: '2026-03-22T12:00:00Z' },
          { id: 't2', google_email: 'b@gmail.com', access_token: 'enc:v1:b', refresh_token: 'enc:v1:r2', scopes: ['gmail.modify'], expires_at: '2026-03-22T12:00:00Z' },
        ],
      });

      const tokens = await getGoogleTokensForUser('user-1');
      expect(tokens).toHaveLength(2);
      expect(tokens[0].access_token).toBe('a');
      expect(tokens[1].access_token).toBe('b');
    });
  });
});
