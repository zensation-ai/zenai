/**
 * Social OAuth Routes
 *
 * Context-free OAuth 2.0 flows for Twitter (PKCE) and LinkedIn.
 * Context is threaded through the PKCE state store so the callback
 * knows which schema to write tokens into.
 *
 * @module routes/social-oauth
 */

import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { apiKeyAuth } from '../middleware/auth';
import { checkedFetch } from '../utils/checked-http';
import { createOAuthState, consumeOAuthState } from '../services/social/oauth-state';
import { queryContext, isValidContext } from '../utils/database-context';
import { encrypt, isEncryptionAvailable } from '../services/security/field-encryption';
import { logger } from '../utils/logger';
import type { AIContext } from '../utils/database-context';

const router = Router();

// Sprint 1.5 Item 4 — auth on OAuth-initiation routes only. The /callback
// endpoints are invoked by the OAuth provider (not the logged-in user) and
// must remain public; their security relies on the `state` PKCE token that is
// verified by `consumeOAuthState` inside the handler.

const FRONTEND_BASE = process.env.FRONTEND_URL || 'http://localhost:5173';
const BACKEND_BASE = process.env.BACKEND_URL || 'http://localhost:3000';

// ── Redirect helpers ────────────────────────────────────────────────────────────

function successRedirect(res: Response, platform: string): void {
  res.redirect(`${FRONTEND_BASE}/settings/integrations?social=connected&platform=${platform}`);
}

function errorRedirect(res: Response, reason: string): void {
  res.redirect(`${FRONTEND_BASE}/settings/integrations?social=error&reason=${encodeURIComponent(reason)}`);
}

// ── Encrypt helper ──────────────────────────────────────────────────────────────

function encryptToken(token: string): string {
  return isEncryptionAvailable() ? encrypt(token) : token;
}

// ── Twitter OAuth 2.0 PKCE ──────────────────────────────────────────────────────

const TWITTER_CLIENT_ID = process.env.TWITTER_CLIENT_ID || '';
const TWITTER_SCOPES = 'tweet.read tweet.write users.read offline.access';

router.get('/twitter/start', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const rawContext = (req.query.context as string) || 'finance';
  const context = isValidContext(rawContext) ? rawContext as AIContext : 'finance' as AIContext;

  const { state, codeChallenge } = createOAuthState(context);

  const callbackUrl = `${BACKEND_BASE}/api/social/oauth/twitter/callback`;
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: TWITTER_CLIENT_ID,
    redirect_uri: callbackUrl,
    scope: TWITTER_SCOPES,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });

  res.redirect(`https://twitter.com/i/oauth2/authorize?${params.toString()}`);
}));

router.get('/twitter/callback', asyncHandler(async (req: Request, res: Response) => {
  const { state, code, error } = req.query as Record<string, string>;

  // User clicked "Cancel" on the authorization page
  if (error) return errorRedirect(res, error === 'access_denied' ? 'access_denied' : 'oauth_error');

  const entry = consumeOAuthState(state);
  if (!entry) return errorRedirect(res, 'state_expired');
  if (!code) return errorRedirect(res, 'missing_code');

  const callbackUrl = `${BACKEND_BASE}/api/social/oauth/twitter/callback`;

  // Exchange code for tokens
  let tokenData: {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  };
  try {
    const tokenRes = await checkedFetch('https://api.twitter.com/2/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        grant_type: 'authorization_code',
        client_id: TWITTER_CLIENT_ID,
        redirect_uri: callbackUrl,
        code_verifier: entry.codeVerifier,
      }),
    });
    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      logger.error('[SocialOAuth] Twitter token exchange failed', undefined, { status: tokenRes.status, body: err });
      return errorRedirect(res, 'token_exchange_failed');
    }
    tokenData = await tokenRes.json() as typeof tokenData;
  } catch {
    return errorRedirect(res, 'network_error');
  }

  // Fetch Twitter username
  let accountName = 'twitter_user';
  try {
    const meRes = await checkedFetch('https://api.twitter.com/2/users/me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    if (meRes.ok) {
      const me = await meRes.json() as { data: { username: string } };
      accountName = `@${me.data.username}`;
    }
  } catch { /* non-critical */ }

  const expiresAt = tokenData.expires_in
    ? new Date(Date.now() + tokenData.expires_in * 1000)
    : null;

  // Upsert into social_accounts
  await queryContext(entry.context,
    `INSERT INTO social_accounts
       (platform, account_name, access_token_encrypted, refresh_token_encrypted,
        token_scopes, token_expires_at, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, true)
     ON CONFLICT (platform)
     DO UPDATE SET
       account_name = EXCLUDED.account_name,
       access_token_encrypted = EXCLUDED.access_token_encrypted,
       refresh_token_encrypted = EXCLUDED.refresh_token_encrypted,
       token_scopes = EXCLUDED.token_scopes,
       token_expires_at = EXCLUDED.token_expires_at,
       is_active = true,
       updated_at = NOW()`,
    [
      'twitter',
      accountName,
      encryptToken(tokenData.access_token),
      tokenData.refresh_token ? encryptToken(tokenData.refresh_token) : null,
      tokenData.scope ? tokenData.scope.split(' ') : [],
      expiresAt,
    ],
  );

  logger.info('[SocialOAuth] Twitter connected', { accountName, context: entry.context });
  successRedirect(res, 'twitter');
}));

// ── LinkedIn OAuth 2.0 ──────────────────────────────────────────────────────────

const LINKEDIN_CLIENT_ID = process.env.LINKEDIN_CLIENT_ID || '';
const LINKEDIN_CLIENT_SECRET = process.env.LINKEDIN_CLIENT_SECRET || '';
const LINKEDIN_SCOPES = 'openid profile w_member_social w_organization_social';

router.get('/linkedin/start', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const rawContext = (req.query.context as string) || 'finance';
  const context = isValidContext(rawContext) ? rawContext as AIContext : 'finance' as AIContext;

  // Store context in state (reuse PKCE state store; codeVerifier unused for LinkedIn)
  const { state } = createOAuthState(context);

  const callbackUrl = `${BACKEND_BASE}/api/social/oauth/linkedin/callback`;
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: LINKEDIN_CLIENT_ID,
    redirect_uri: callbackUrl,
    scope: LINKEDIN_SCOPES,
    state,
  });

  res.redirect(`https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`);
}));

router.get('/linkedin/callback', asyncHandler(async (req: Request, res: Response) => {
  const { state, code, error } = req.query as Record<string, string>;

  if (error) return errorRedirect(res, error === 'access_denied' ? 'access_denied' : 'oauth_error');

  const entry = consumeOAuthState(state);
  if (!entry) return errorRedirect(res, 'state_expired');
  if (!code) return errorRedirect(res, 'missing_code');

  const callbackUrl = `${BACKEND_BASE}/api/social/oauth/linkedin/callback`;

  // Exchange code for tokens
  let tokenData: {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  };
  try {
    const tokenRes = await checkedFetch('https://www.linkedin.com/oauth/v2/accessToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: callbackUrl,
        client_id: LINKEDIN_CLIENT_ID,
        client_secret: LINKEDIN_CLIENT_SECRET,
      }),
    });
    if (!tokenRes.ok) {
      logger.error('[SocialOAuth] LinkedIn token exchange failed');
      return errorRedirect(res, 'token_exchange_failed');
    }
    tokenData = await tokenRes.json() as typeof tokenData;
  } catch {
    return errorRedirect(res, 'network_error');
  }

  // Fetch LinkedIn profile (name)
  let accountName = 'linkedin_user';
  try {
    const profileRes = await checkedFetch('https://api.linkedin.com/v2/me', {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        'X-Restli-Protocol-Version': '2.0.0',
      },
    });
    if (profileRes.ok) {
      const profile = await profileRes.json() as {
        localizedFirstName: string; localizedLastName: string
      };
      accountName = `${profile.localizedFirstName} ${profile.localizedLastName}`.trim();
    }
  } catch { /* non-critical */ }

  // Fetch administered organizations (for company posting)
  const metadata: Record<string, unknown> = { org_posting_available: false };
  try {
    const orgRes = await checkedFetch(
      'https://api.linkedin.com/v2/organizationalEntityAcls?q=roleAssignee&role=ADMINISTRATOR',
      {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          'X-Restli-Protocol-Version': '2.0.0',
        },
      },
    );
    if (orgRes.ok) {
      const orgData = await orgRes.json() as { elements: Array<{ organizationalTarget: string }> };
      if (orgData.elements?.length > 0) {
        metadata.org_urn = orgData.elements[0].organizationalTarget;
        metadata.org_posting_available = true;
      }
    }
  } catch { /* non-critical — person posting still works */ }

  const expiresAt = tokenData.expires_in
    ? new Date(Date.now() + tokenData.expires_in * 1000)
    : null;

  await queryContext(entry.context,
    `INSERT INTO social_accounts
       (platform, account_name, access_token_encrypted, refresh_token_encrypted,
        token_scopes, token_expires_at, metadata, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, true)
     ON CONFLICT (platform)
     DO UPDATE SET
       account_name = EXCLUDED.account_name,
       access_token_encrypted = EXCLUDED.access_token_encrypted,
       refresh_token_encrypted = EXCLUDED.refresh_token_encrypted,
       token_scopes = EXCLUDED.token_scopes,
       token_expires_at = EXCLUDED.token_expires_at,
       metadata = EXCLUDED.metadata,
       is_active = true,
       updated_at = NOW()`,
    [
      'linkedin',
      accountName,
      encryptToken(tokenData.access_token),
      tokenData.refresh_token ? encryptToken(tokenData.refresh_token) : null,
      LINKEDIN_SCOPES.split(' '),
      expiresAt,
      JSON.stringify(metadata),
    ],
  );

  logger.info('[SocialOAuth] LinkedIn connected', { accountName, context: entry.context });
  successRedirect(res, 'linkedin');
}));

// ── Unknown platform guard ──────────────────────────────────────────────────────

router.get('/:platform/start', apiKeyAuth, (_req, res) => {
  res.status(400).json({ error: 'Unsupported OAuth platform' });
});

export default router;
