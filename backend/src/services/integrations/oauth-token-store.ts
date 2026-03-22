/**
 * OAuthTokenStore — Task 5 of the Integration Framework
 *
 * Persists and retrieves OAuth tokens for integration connectors.
 * Tokens are encrypted at rest and auto-refreshed when expiring.
 */

import { queryPublic } from '../../utils/database-context';
import { encrypt, decrypt, isEncryptionAvailable } from '../security/field-encryption';
import { oauthManager } from '../auth/oauth-providers';
import { logger } from '../../utils/logger';
import { OAuthTokens } from './types';

export interface ExpiringTokenInfo {
  userId: string;
  connectorId: string;
  provider: string;
}

/** Milliseconds before expiry at which we proactively refresh. */
const REFRESH_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

export class OAuthTokenStore {
  /**
   * Persist (or replace) tokens for a given user + connector.
   * access_token and refresh_token are encrypted before storage.
   */
  async storeTokens(
    userId: string,
    connectorId: string,
    provider: string,
    tokens: OAuthTokens,
  ): Promise<void> {
    const encryptedAccessToken = isEncryptionAvailable()
      ? encrypt(tokens.accessToken)
      : tokens.accessToken;

    const encryptedRefreshToken =
      tokens.refreshToken !== undefined
        ? isEncryptionAvailable()
          ? encrypt(tokens.refreshToken)
          : tokens.refreshToken
        : null;

    const expiresAt = tokens.expiresAt ?? null;
    const scopes = tokens.scopes;

    await queryPublic(
      `INSERT INTO public.integration_tokens
         (user_id, connector_id, provider, access_token, refresh_token, token_type, expires_at, scopes, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
       ON CONFLICT (user_id, connector_id)
       DO UPDATE SET
         provider     = EXCLUDED.provider,
         access_token = EXCLUDED.access_token,
         refresh_token = EXCLUDED.refresh_token,
         token_type   = EXCLUDED.token_type,
         expires_at   = EXCLUDED.expires_at,
         scopes       = EXCLUDED.scopes,
         updated_at   = NOW()`,
      [
        userId,
        connectorId,
        provider,
        encryptedAccessToken,
        encryptedRefreshToken,
        tokens.tokenType,
        expiresAt,
        scopes,
      ],
    );
  }

  /**
   * Retrieve valid tokens for a user + connector.
   * Returns null if no tokens are stored.
   * Auto-refreshes if the token expires within 5 minutes.
   */
  async getValidToken(userId: string, connectorId: string): Promise<OAuthTokens | null> {
    const result = await queryPublic(
      `SELECT access_token, refresh_token, token_type, expires_at, scopes, provider
         FROM public.integration_tokens
        WHERE user_id = $1
          AND connector_id = $2`,
      [userId, connectorId],
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0] as {
      access_token: string;
      refresh_token: string | null;
      token_type: string;
      expires_at: Date | null;
      scopes: string[];
      provider: string;
    };

    // Check if the token is expiring soon and we have a refresh token
    const expiresAt: Date | undefined = row.expires_at ?? undefined;
    const isExpiringSoon =
      expiresAt !== undefined &&
      expiresAt.getTime() - Date.now() < REFRESH_THRESHOLD_MS;

    if (isExpiringSoon && row.refresh_token) {
      const decryptedRefresh = isEncryptionAvailable()
        ? decrypt(row.refresh_token)
        : row.refresh_token;

      return this.refreshToken(userId, connectorId, row.provider, decryptedRefresh, row);
    }

    return this.decryptRow(row);
  }

  /**
   * Delete tokens for a user + connector (e.g. on disconnect).
   */
  async revokeTokens(userId: string, connectorId: string): Promise<void> {
    await queryPublic(
      `DELETE FROM public.integration_tokens
        WHERE user_id = $1
          AND connector_id = $2`,
      [userId, connectorId],
    );
  }

  /**
   * Returns true if tokens exist for the given user + connector.
   */
  async hasTokens(userId: string, connectorId: string): Promise<boolean> {
    const result = await queryPublic(
      `SELECT COUNT(*) AS count
         FROM public.integration_tokens
        WHERE user_id = $1
          AND connector_id = $2`,
      [userId, connectorId],
    );

    const count = parseInt((result.rows[0] as { count: string }).count, 10);
    return count > 0;
  }

  /**
   * Find all tokens that are expiring within the next N minutes but are not
   * already expired (i.e. still refreshable).
   */
  async findExpiringTokens(withinMinutes: number): Promise<ExpiringTokenInfo[]> {
    const result = await queryPublic(
      `SELECT user_id, connector_id, provider
         FROM public.integration_tokens
        WHERE expires_at > NOW()
          AND expires_at < NOW() + ($1 * INTERVAL '1 minute')`,
      [withinMinutes],
    );

    return (result.rows as Array<{ user_id: string; connector_id: string; provider: string }>).map(
      (row) => ({
        userId: row.user_id,
        connectorId: row.connector_id,
        provider: row.provider,
      }),
    );
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async refreshToken(
    userId: string,
    connectorId: string,
    provider: string,
    refreshToken: string,
    row: {
      token_type: string;
      scopes: string[];
    },
  ): Promise<OAuthTokens | null> {
    try {
      const refreshed = await oauthManager.refreshAccessToken(provider, refreshToken);

      const expiresAt = refreshed.expiresIn
        ? new Date(Date.now() + refreshed.expiresIn * 1000)
        : undefined;

      const newTokens: OAuthTokens = {
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken ?? refreshToken,
        tokenType: row.token_type,
        expiresAt,
        scopes: row.scopes,
      };

      await this.storeTokens(userId, connectorId, provider, newTokens);
      return newTokens;
    } catch (err) {
      logger.warn('OAuth token refresh failed', {
        operation: 'oauth-token-store',
        userId,
        connectorId,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  private decryptRow(row: {
    access_token: string;
    refresh_token: string | null;
    token_type: string;
    expires_at: Date | null;
    scopes: string[];
  }): OAuthTokens {
    const accessToken = isEncryptionAvailable()
      ? decrypt(row.access_token)
      : row.access_token;

    const refreshToken =
      row.refresh_token !== null
        ? isEncryptionAvailable()
          ? decrypt(row.refresh_token)
          : row.refresh_token
        : undefined;

    return {
      accessToken,
      refreshToken,
      tokenType: row.token_type,
      expiresAt: row.expires_at ?? undefined,
      scopes: row.scopes,
    };
  }
}
