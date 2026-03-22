/**
 * Phase 56: OAuth 2.1 Provider Integration with PKCE
 * Supports Google, Microsoft, and GitHub OAuth flows.
 * OAuth state is persisted in PostgreSQL (not in-memory).
 */

import crypto from 'crypto';
import axios from 'axios';
import { pool } from '../../utils/database';
import { logger } from '../../utils/logger';

// ===========================================
// Types
// ===========================================

export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface OAuthAuthorizationResult {
  url: string;
  state: string;
  codeVerifier: string;
}

export interface OAuthUserInfo {
  email: string;
  name: string | null;
  avatarUrl: string | null;
  providerId: string;
}

interface OAuthStateRecord {
  state: string;
  provider: string;
  redirect_uri: string | null;
  code_verifier: string;
  expires_at: string;
}

// ===========================================
// Provider Definitions
// ===========================================

const PROVIDER_URLS: Record<string, {
  authUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  scopes: string[];
}> = {
  google: {
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    userInfoUrl: 'https://www.googleapis.com/oauth2/v2/userinfo',
    scopes: ['openid', 'email', 'profile'],
  },
  microsoft: {
    authUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    userInfoUrl: 'https://graph.microsoft.com/v1.0/me',
    scopes: ['openid', 'email', 'profile', 'User.Read'],
  },
  github: {
    authUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    userInfoUrl: 'https://api.github.com/user',
    scopes: ['read:user', 'user:email'],
  },
};

// ===========================================
// OAuth Provider Manager
// ===========================================

class OAuthProviderManager {
  private configs: Map<string, OAuthConfig> = new Map();

  constructor() {
    this.initializeProviders();
  }

  private initializeProviders(): void {
    const apiUrl = process.env.API_URL || `http://localhost:${process.env.PORT || 3000}`;

    if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
      this.configs.set('google', {
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        redirectUri: process.env.GOOGLE_AUTH_REDIRECT_URI || `${apiUrl}/api/auth/callback/google`,
      });
    }

    if (process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET) {
      this.configs.set('microsoft', {
        clientId: process.env.MICROSOFT_CLIENT_ID,
        clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
        redirectUri: `${apiUrl}/api/auth/callback/microsoft`,
      });
    }

    if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
      this.configs.set('github', {
        clientId: process.env.GITHUB_CLIENT_ID,
        clientSecret: process.env.GITHUB_CLIENT_SECRET,
        redirectUri: `${apiUrl}/api/auth/callback/github`,
      });
    }
  }

  /**
   * Check if a provider is configured.
   */
  isProviderAvailable(provider: string): boolean {
    return this.configs.has(provider) && !!PROVIDER_URLS[provider];
  }

  /**
   * Get list of available providers.
   */
  getAvailableProviders(): string[] {
    return Array.from(this.configs.keys());
  }

  /**
   * Generate an OAuth authorization URL with PKCE.
   */
  async getAuthorizationUrl(provider: string, frontendRedirectUri?: string): Promise<OAuthAuthorizationResult> {
    const config = this.configs.get(provider);
    if (!config) {
      throw new OAuthError(`Provider '${provider}' is not configured`, 'PROVIDER_NOT_CONFIGURED');
    }

    const providerUrls = PROVIDER_URLS[provider];
    if (!providerUrls) {
      throw new OAuthError(`Provider '${provider}' is not supported`, 'PROVIDER_NOT_SUPPORTED');
    }

    // PKCE: Generate code_verifier and code_challenge
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto
      .createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');

    // Generate state
    const state = crypto.randomBytes(16).toString('hex');

    // Store state + code_verifier in DB (not in-memory!)
    await pool.query(
      `INSERT INTO public.oauth_states (state, provider, redirect_uri, code_verifier, expires_at)
       VALUES ($1, $2, $3, $4, NOW() + INTERVAL '10 minutes')`,
      [state, provider, frontendRedirectUri || null, codeVerifier]
    );

    // Build authorization URL
    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      response_type: 'code',
      scope: providerUrls.scopes.join(' '),
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    // GitHub doesn't support PKCE, so remove code_challenge params
    if (provider === 'github') {
      params.delete('code_challenge');
      params.delete('code_challenge_method');
    }

    const url = `${providerUrls.authUrl}?${params.toString()}`;

    return { url, state, codeVerifier };
  }

  /**
   * Handle OAuth callback: exchange code for tokens and fetch user info.
   */
  async handleCallback(provider: string, code: string, state: string): Promise<OAuthUserInfo> {
    // Verify state from DB
    const stateResult = await pool.query(
      'SELECT * FROM public.oauth_states WHERE state = $1 AND provider = $2',
      [state, provider]
    );

    if (stateResult.rows.length === 0) {
      throw new OAuthError('Invalid or expired OAuth state', 'INVALID_STATE');
    }

    const stateRecord = stateResult.rows[0] as OAuthStateRecord;

    // Check expiry
    if (new Date(stateRecord.expires_at) < new Date()) {
      // Cleanup expired state
      await pool.query('DELETE FROM public.oauth_states WHERE state = $1', [state]);
      throw new OAuthError('OAuth state expired', 'STATE_EXPIRED');
    }

    // Delete used state (one-time use)
    await pool.query('DELETE FROM public.oauth_states WHERE state = $1', [state]);

    const config = this.configs.get(provider);
    if (!config) {
      throw new Error(`OAuth provider ${provider} not configured`);
    }
    const providerUrls = PROVIDER_URLS[provider];

    // Exchange code for access token
    const accessToken = await this.exchangeCodeForToken(
      provider,
      code,
      config,
      providerUrls.tokenUrl,
      stateRecord.code_verifier
    );

    // Fetch user info
    const userInfo = await this.fetchUserInfo(provider, accessToken, providerUrls.userInfoUrl);

    logger.info('OAuth callback completed', {
      operation: 'oauth.callback',
      provider,
      email: userInfo.email,
    });

    return userInfo;
  }

  private async exchangeCodeForToken(
    provider: string,
    code: string,
    config: OAuthConfig,
    tokenUrl: string,
    codeVerifier: string
  ): Promise<string> {
    const params: Record<string, string> = {
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      redirect_uri: config.redirectUri,
      grant_type: 'authorization_code',
    };

    // Add PKCE verifier (not for GitHub)
    if (provider !== 'github') {
      params.code_verifier = codeVerifier;
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded',
    };

    // GitHub requires Accept: application/json
    if (provider === 'github') {
      headers['Accept'] = 'application/json';
    }

    const response = await axios.post(tokenUrl, new URLSearchParams(params).toString(), { headers });
    const data = response.data;

    return data.access_token;
  }

  private async fetchUserInfo(
    provider: string,
    accessToken: string,
    userInfoUrl: string
  ): Promise<OAuthUserInfo> {
    const response = await axios.get(userInfoUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const data = response.data;

    switch (provider) {
      case 'google':
        return {
          email: data.email,
          name: data.name || null,
          avatarUrl: data.picture || null,
          providerId: data.id,
        };

      case 'microsoft':
        return {
          email: data.mail || data.userPrincipalName,
          name: data.displayName || null,
          avatarUrl: null,
          providerId: data.id,
        };

      case 'github': {
        let email = data.email;
        // GitHub may not return email in profile, need to fetch separately
        if (!email) {
          const emailResponse = await axios.get('https://api.github.com/user/emails', {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          const primaryEmail = emailResponse.data.find((e: { primary: boolean }) => e.primary);
          email = primaryEmail?.email || emailResponse.data[0]?.email;
        }
        if (!email) {
          throw new OAuthError('No email found on GitHub account. Please add a verified email to your GitHub profile.', 'NO_EMAIL');
        }
        return {
          email,
          name: data.name || data.login || null,
          avatarUrl: data.avatar_url || null,
          providerId: String(data.id),
        };
      }

      default:
        throw new OAuthError(`Unknown provider: ${provider}`, 'UNKNOWN_PROVIDER');
    }
  }

  /**
   * Cleanup expired OAuth states (call periodically).
   */
  async cleanupExpiredStates(): Promise<void> {
    await pool.query('DELETE FROM public.oauth_states WHERE expires_at < NOW()');
  }
}

// ===========================================
// Singleton Export
// ===========================================

export const oauthManager = new OAuthProviderManager();

// ===========================================
// Error Class
// ===========================================

export class OAuthError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = 'OAuthError';
  }
}
