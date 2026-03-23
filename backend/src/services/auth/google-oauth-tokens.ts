/**
 * Phase 3A: Google OAuth Token Management
 *
 * CRUD for Google OAuth tokens stored in public.google_oauth_tokens.
 * Tokens are encrypted at rest using AES-256-GCM field encryption.
 */

import { pool } from '../../utils/database';
import { encrypt, decrypt, isEncryptionAvailable } from '../security/field-encryption';
import { logger } from '../../utils/logger';

// ===========================================
// Types
// ===========================================

export interface GoogleOAuthToken {
  id: string;
  user_id: string;
  google_email: string;
  access_token: string;
  refresh_token: string;
  scopes: string[];
  expires_at: string;
  created_at: string;
  updated_at: string;
}

export interface CreateGoogleTokenInput {
  userId: string;
  googleEmail: string;
  accessToken: string;
  refreshToken: string;
  scopes: string[];
  expiresAt: Date;
}

export interface UpdateGoogleTokenInput {
  accessToken: string;
  refreshToken?: string;
  expiresAt: Date;
}

// ===========================================
// Token Expiry Check
// ===========================================

const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000; // 5 minutes

export function isTokenExpired(expiresAt: Date): boolean {
  return expiresAt.getTime() - Date.now() < TOKEN_EXPIRY_BUFFER_MS;
}

// ===========================================
// Encryption Helpers
// ===========================================

function encryptToken(value: string): string {
  if (isEncryptionAvailable()) {
    return encrypt(value);
  }
  return value;
}

function decryptToken(value: string): string {
  if (isEncryptionAvailable() && value.startsWith('enc:')) {
    return decrypt(value);
  }
  return value;
}

function decryptRow(row: Record<string, unknown>): GoogleOAuthToken {
  return {
    ...row,
    access_token: decryptToken(row.access_token as string),
    refresh_token: decryptToken(row.refresh_token as string),
  } as GoogleOAuthToken;
}

// ===========================================
// CRUD Operations
// ===========================================

export async function createGoogleToken(input: CreateGoogleTokenInput): Promise<GoogleOAuthToken> {
  const { userId, googleEmail, accessToken, refreshToken, scopes, expiresAt } = input;

  const result = await pool.query(
    `INSERT INTO public.google_oauth_tokens
       (user_id, google_email, access_token, refresh_token, scopes, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (user_id, google_email) DO UPDATE SET
       access_token = EXCLUDED.access_token,
       refresh_token = EXCLUDED.refresh_token,
       scopes = EXCLUDED.scopes,
       expires_at = EXCLUDED.expires_at,
       updated_at = now()
     RETURNING *`,
    [userId, googleEmail, encryptToken(accessToken), encryptToken(refreshToken), scopes, expiresAt]
  );

  logger.info('Google OAuth token created/updated', {
    operation: 'createGoogleToken',
    userId,
    googleEmail,
    scopes,
  });

  return decryptRow(result.rows[0]);
}

export async function getGoogleToken(tokenId: string): Promise<GoogleOAuthToken | null> {
  const result = await pool.query(
    'SELECT * FROM public.google_oauth_tokens WHERE id = $1',
    [tokenId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return decryptRow(result.rows[0]);
}

export async function getGoogleTokenByEmail(userId: string, googleEmail: string): Promise<GoogleOAuthToken | null> {
  const result = await pool.query(
    'SELECT * FROM public.google_oauth_tokens WHERE user_id = $1 AND google_email = $2',
    [userId, googleEmail]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return decryptRow(result.rows[0]);
}

export async function getGoogleTokensForUser(userId: string): Promise<GoogleOAuthToken[]> {
  const result = await pool.query(
    'SELECT * FROM public.google_oauth_tokens WHERE user_id = $1 ORDER BY created_at DESC',
    [userId]
  );

  return result.rows.map(decryptRow);
}

export async function updateGoogleTokens(
  tokenId: string,
  input: UpdateGoogleTokenInput
): Promise<GoogleOAuthToken | null> {
  const { accessToken, refreshToken, expiresAt } = input;

  let sql: string;
  let params: unknown[];

  if (refreshToken) {
    sql = `UPDATE public.google_oauth_tokens
           SET access_token = $1, refresh_token = $2, expires_at = $3, updated_at = now()
           WHERE id = $4
           RETURNING *`;
    params = [encryptToken(accessToken), encryptToken(refreshToken), expiresAt, tokenId];
  } else {
    sql = `UPDATE public.google_oauth_tokens
           SET access_token = $1, expires_at = $2, updated_at = now()
           WHERE id = $3
           RETURNING *`;
    params = [encryptToken(accessToken), expiresAt, tokenId];
  }

  const result = await pool.query(sql, params);

  if (result.rows.length === 0) {
    return null;
  }

  return decryptRow(result.rows[0]);
}

export async function deleteGoogleToken(tokenId: string): Promise<void> {
  await pool.query(
    'DELETE FROM public.google_oauth_tokens WHERE id = $1',
    [tokenId]
  );

  logger.info('Google OAuth token deleted', {
    operation: 'deleteGoogleToken',
    tokenId,
  });
}
