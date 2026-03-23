/**
 * Phase 3A: Google OAuth Connect Routes
 * Connects user's Google account for Gmail/Calendar with extended scopes.
 */

import { Router } from 'express';
import crypto from 'crypto';
import axios from 'axios';
import { asyncHandler } from '../middleware/errorHandler';
import { jwtAuth } from '../middleware/jwt-auth';
import { pool } from '../utils/database';
import { queryContext, isValidContext } from '../utils/database-context';
import type { AIContext } from '../utils/database-context';
import { getUserId } from '../utils/user-context';
import {
  createGoogleToken,
  getGoogleToken,
  getGoogleTokensForUser,
  deleteGoogleToken,
} from '../services/auth/google-oauth-tokens';
import { logger } from '../utils/logger';

export const googleOAuthRouter = Router();

const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/calendar',
  'openid',
  'email',
  'profile',
];

// POST /connect — Initiate Gmail OAuth flow (requires JWT)
googleOAuthRouter.post('/connect', jwtAuth, asyncHandler(async (req, res) => {
  const userId = getUserId(req);
  const { context } = req.body as { context?: string };

  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return res.status(503).json({ success: false, error: 'Google OAuth not configured' });
  }

  const apiUrl = process.env.API_URL || `http://localhost:${process.env.PORT || 3000}`;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${apiUrl}/api/auth/callback/google`;

  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
  const state = crypto.randomBytes(16).toString('hex');

  await pool.query(
    `INSERT INTO public.oauth_states (state, provider, redirect_uri, code_verifier, metadata, expires_at)
     VALUES ($1, 'google', $2, $3, $4, NOW() + INTERVAL '10 minutes')`,
    [state, redirectUri, codeVerifier, JSON.stringify({
      flow: 'connect',
      scopes: GMAIL_SCOPES,
      user_id: userId,
      context: context || 'personal',
    })]
  );

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: GMAIL_SCOPES.join(' '),
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    access_type: 'offline',
    prompt: 'consent',
  });

  const url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  return res.json({ success: true, data: { url, state } });
}));

// GET /callback — Handle OAuth callback for connect flow
googleOAuthRouter.get('/callback', asyncHandler(async (req, res) => {
  const { code, state, error } = req.query as { code?: string; state?: string; error?: string };
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

  if (error || !code || !state) {
    return res.redirect(`${frontendUrl}/settings/integrations?gmail=error&reason=${error || 'missing_params'}`);
  }

  const stateResult = await pool.query(
    'SELECT * FROM public.oauth_states WHERE state = $1 AND provider = $2',
    [state, 'google']
  );

  if (stateResult.rows.length === 0) {
    return res.redirect(`${frontendUrl}/settings/integrations?gmail=error&reason=invalid_state`);
  }

  const stateRecord = stateResult.rows[0];
  const metadata = stateRecord.metadata || {};

  await pool.query('DELETE FROM public.oauth_states WHERE state = $1', [state]);

  if (metadata.flow !== 'connect') {
    return res.redirect(`${frontendUrl}/settings/integrations?gmail=error&reason=wrong_flow`);
  }

  const apiUrl = process.env.API_URL || `http://localhost:${process.env.PORT || 3000}`;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${apiUrl}/api/auth/callback/google`;

  try {
    const tokenResponse = await axios.post('https://oauth2.googleapis.com/token', {
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      code_verifier: stateRecord.code_verifier,
    });

    const { access_token, refresh_token, expires_in } = tokenResponse.data;
    if (!access_token || !refresh_token) {
      return res.redirect(`${frontendUrl}/settings/integrations?gmail=error&reason=no_tokens`);
    }

    const userInfoResponse = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    const googleEmail = userInfoResponse.data.email;

    const token = await createGoogleToken({
      userId: metadata.user_id,
      googleEmail,
      accessToken: access_token,
      refreshToken: refresh_token,
      scopes: GMAIL_SCOPES,
      expiresAt: new Date(Date.now() + (expires_in || 3600) * 1000),
    });

    const context = (metadata.context || 'personal') as AIContext;
    if (isValidContext(context)) {
      await queryContext(context,
        `INSERT INTO email_accounts (id, email_address, display_name, provider, google_token_id, is_default, user_id)
         VALUES (gen_random_uuid(), $1, $2, 'gmail', $3, false, $4)
         ON CONFLICT DO NOTHING`,
        [googleEmail, googleEmail, token.id, metadata.user_id]
      );
    }

    logger.info('Gmail account connected', { operation: 'gmailConnect', userId: metadata.user_id, googleEmail, context });
    return res.redirect(`${frontendUrl}/settings/integrations?gmail=connected&email=${encodeURIComponent(googleEmail)}`);
  } catch (err) {
    logger.error('Gmail OAuth callback failed', err instanceof Error ? err : undefined, { operation: 'gmailCallback' });
    return res.redirect(`${frontendUrl}/settings/integrations?gmail=error&reason=token_exchange_failed`);
  }
}));

// GET /tokens — List user's Google tokens (requires JWT)
googleOAuthRouter.get('/tokens', jwtAuth, asyncHandler(async (req, res) => {
  const userId = getUserId(req);
  const tokens = await getGoogleTokensForUser(userId);

  const safeTokens = tokens.map(t => ({
    id: t.id,
    google_email: t.google_email,
    scopes: t.scopes,
    expires_at: t.expires_at,
    created_at: t.created_at,
  }));

  return res.json({ success: true, data: safeTokens });
}));

// DELETE /disconnect/:tokenId — Disconnect Google account (requires JWT)
googleOAuthRouter.delete('/disconnect/:tokenId', jwtAuth, asyncHandler(async (req, res) => {
  const { tokenId } = req.params;

  // Revoke at Google (best-effort)
  try {
    const token = await getGoogleToken(tokenId);
    if (token) {
      await axios.post(`https://oauth2.googleapis.com/revoke?token=${token.access_token}`).catch((revokeErr: unknown) => {
        logger.debug('Google token revocation failed (non-critical)', { tokenId, error: (revokeErr as Error).message });
      });
    }
  } catch (lookupErr) {
    logger.debug('Token lookup for revocation failed', { tokenId, error: (lookupErr as Error).message });
  }

  // Delete associated email accounts + archive emails
  for (const ctx of ['personal', 'work', 'learning', 'creative'] as const) {
    await queryContext(ctx,
      "UPDATE emails SET status = 'archived' WHERE account_id IN (SELECT id FROM email_accounts WHERE google_token_id = $1)",
      [tokenId]
    ).catch(() => { /* context may not have accounts */ });
    await queryContext(ctx,
      'DELETE FROM email_accounts WHERE google_token_id = $1',
      [tokenId]
    ).catch(() => { /* ignore */ });
  }

  await deleteGoogleToken(tokenId);
  return res.json({ success: true, message: 'Google account disconnected' });
}));
