/**
 * Phase 56: User Management Service
 * Handles user CRUD, registration, login, and profile management.
 */

import bcrypt from 'bcrypt';
import { queryPublic } from '../../utils/database-context';
import { logger } from '../../utils/logger';
import { FEATURES } from '../../config/feature-flags';
import { createOrganization } from '../organization-service';

const BCRYPT_SALT_ROUNDS = 12;

// ===========================================
// Types
// ===========================================

export interface User {
  id: string;
  email: string;
  email_verified: boolean;
  display_name: string | null;
  avatar_url: string | null;
  auth_provider: string;
  auth_provider_id: string | null;
  mfa_enabled: boolean;
  mfa_secret: string | null;
  role: 'user' | 'admin' | 'owner';
  preferences: Record<string, unknown>;
  last_login: string | null;
  login_count: number;
  onboarding_completed_at: string | null;
  consent_banner_shown_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Safe user profile (no password_hash, no mfa_secret) */
export interface UserProfile {
  id: string;
  email: string;
  email_verified: boolean;
  display_name: string | null;
  avatar_url: string | null;
  auth_provider: string;
  mfa_enabled: boolean;
  role: string;
  preferences: Record<string, unknown>;
  last_login: string | null;
  login_count: number;
  onboarding_completed_at: string | null;
  consent_banner_shown_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface RegisterInput {
  email: string;
  password: string;
  display_name?: string;
}

export interface UpdateProfileInput {
  display_name?: string;
  avatar_url?: string;
  preferences?: Record<string, unknown>;
}

// ===========================================
// Validation Helpers
// ===========================================

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateEmail(email: string): boolean {
  return EMAIL_REGEX.test(email) && email.length <= 255;
}

function validatePassword(password: string): { valid: boolean; message?: string } {
  if (password.length < 8) {
    return { valid: false, message: 'Password must be at least 8 characters' };
  }
  if (password.length > 128) {
    return { valid: false, message: 'Password must be at most 128 characters' };
  }
  return { valid: true };
}

// ===========================================
// User Service
// ===========================================

/**
 * Strip sensitive fields from a user row.
 */
export function toUserProfile(user: User): UserProfile {
  return {
    id: user.id,
    email: user.email,
    email_verified: user.email_verified,
    display_name: user.display_name,
    avatar_url: user.avatar_url,
    auth_provider: user.auth_provider,
    mfa_enabled: user.mfa_enabled,
    role: user.role,
    preferences: user.preferences,
    last_login: user.last_login,
    login_count: user.login_count,
    onboarding_completed_at: user.onboarding_completed_at ?? null,
    consent_banner_shown_at: user.consent_banner_shown_at ?? null,
    created_at: user.created_at,
    updated_at: user.updated_at,
  };
}

/**
 * Mark the user's welcome-wizard as completed. Idempotent: if already set,
 * returns the previously stored timestamp without overwriting it so we don't
 * reset the true onboarding date.
 */
export async function markOnboardingComplete(userId: string): Promise<string> {
  const result = await queryPublic(
    `UPDATE public.users
        SET onboarding_completed_at = COALESCE(onboarding_completed_at, NOW()),
            updated_at = NOW()
      WHERE id = $1
      RETURNING onboarding_completed_at`,
    [userId],
  );
  if (result.rows.length === 0) {
    throw new UserServiceError('User not found', 'NOT_FOUND', 404);
  }
  const row = result.rows[0] as { onboarding_completed_at: string };
  return row.onboarding_completed_at;
}

/**
 * Mark that the user has acknowledged the DSGVO consent banner. Idempotent:
 * if already set, returns the previously stored timestamp unchanged so we
 * preserve the original acknowledgement time for audit purposes.
 */
export async function markConsentBannerShown(userId: string): Promise<string> {
  const result = await queryPublic(
    `UPDATE public.users
        SET consent_banner_shown_at = COALESCE(consent_banner_shown_at, NOW()),
            updated_at = NOW()
      WHERE id = $1
      RETURNING consent_banner_shown_at`,
    [userId],
  );
  if (result.rows.length === 0) {
    throw new UserServiceError('User not found', 'NOT_FOUND', 404);
  }
  const row = result.rows[0] as { consent_banner_shown_at: string };
  return row.consent_banner_shown_at;
}

/**
 * Register a new user with email/password.
 */
export async function register(input: RegisterInput): Promise<User> {
  const { email, password, display_name } = input;

  // Validate email
  if (!validateEmail(email)) {
    throw new UserServiceError('Invalid email address', 'INVALID_EMAIL');
  }

  // Validate password
  const pwValidation = validatePassword(password);
  if (!pwValidation.valid) {
    throw new UserServiceError(pwValidation.message ?? 'Password too weak', 'WEAK_PASSWORD');
  }

  // Check for existing user
  const existing = await queryPublic(
    'SELECT id FROM public.users WHERE email = $1',
    [email.toLowerCase()]
  );
  if (existing.rows.length > 0) {
    throw new UserServiceError('Email already registered', 'EMAIL_EXISTS');
  }

  // Hash password
  const password_hash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

  // Insert user
  const result = await queryPublic(
    `INSERT INTO public.users (email, password_hash, display_name, auth_provider)
     VALUES ($1, $2, $3, 'local')
     RETURNING *`,
    [email.toLowerCase(), password_hash, display_name || null]
  );

  const user = result.rows[0] as User;

  // Grant access to all 4 contexts by default
  const contexts = ['operations', 'finance', 'people', 'strategy'] as const;
  for (const ctx of contexts) {
    await queryPublic(
      `INSERT INTO public.user_contexts (user_id, context, role) VALUES ($1, $2, 'owner')
       ON CONFLICT DO NOTHING`,
      [user.id, ctx]
    );
  }

  // Multi-tenancy: auto-create organization for new users (behind feature flag)
  if (FEATURES.MULTI_TENANCY_ENABLED) {
    try {
      await createOrganization({
        name: user.display_name || user.email.split('@')[0] + "'s Space",
        ownerId: user.id,
      });
    } catch (err) {
      // Non-fatal: user exists even if org creation fails
      console.error('Auto-org creation failed:', err);
    }
  }

  logger.info('User registered', {
    operation: 'user.register',
    userId: user.id,
    email: user.email,
  });

  return user;
}

/**
 * Authenticate user with email/password. Returns user on success.
 */
export async function login(email: string, password: string): Promise<User> {
  const result = await queryPublic(
    'SELECT * FROM public.users WHERE email = $1',
    [email.toLowerCase()]
  );

  if (result.rows.length === 0) {
    throw new UserServiceError('Invalid email or password', 'INVALID_CREDENTIALS');
  }

  const user = result.rows[0] as User & { password_hash: string | null };

  if (!user.password_hash) {
    throw new UserServiceError(
      'This account uses social login. Please sign in with your OAuth provider.',
      'OAUTH_ONLY'
    );
  }

  const passwordValid = await bcrypt.compare(password, user.password_hash);
  if (!passwordValid) {
    throw new UserServiceError('Invalid email or password', 'INVALID_CREDENTIALS');
  }

  // Update login metadata
  await queryPublic(
    `UPDATE public.users SET last_login = NOW(), login_count = login_count + 1, updated_at = NOW()
     WHERE id = $1`,
    [user.id]
  );

  logger.info('User logged in', {
    operation: 'user.login',
    userId: user.id,
  });

  return user;
}

/**
 * Find user by email.
 */
export async function findByEmail(email: string): Promise<User | null> {
  const result = await queryPublic(
    'SELECT * FROM public.users WHERE email = $1',
    [email.toLowerCase()]
  );
  return result.rows.length > 0 ? (result.rows[0] as User) : null;
}

/**
 * Find user by ID.
 */
export async function findById(id: string): Promise<User | null> {
  const result = await queryPublic(
    'SELECT * FROM public.users WHERE id = $1',
    [id]
  );
  return result.rows.length > 0 ? (result.rows[0] as User) : null;
}

/**
 * Find or create user from OAuth provider data.
 */
export async function findOrCreateOAuthUser(params: {
  email: string;
  provider: string;
  providerId: string;
  displayName?: string;
  avatarUrl?: string;
}): Promise<User> {
  const { email, provider, providerId, displayName, avatarUrl } = params;

  // Check if user exists by provider ID
  let result = await queryPublic(
    'SELECT * FROM public.users WHERE auth_provider = $1 AND auth_provider_id = $2',
    [provider, providerId]
  );

  if (result.rows.length > 0) {
    const user = result.rows[0] as User;
    // Update login metadata
    await queryPublic(
      `UPDATE public.users SET last_login = NOW(), login_count = login_count + 1, updated_at = NOW()
       WHERE id = $1`,
      [user.id]
    );
    return user;
  }

  // Check if user exists by email (link accounts)
  result = await queryPublic(
    'SELECT * FROM public.users WHERE email = $1',
    [email.toLowerCase()]
  );

  if (result.rows.length > 0) {
    const user = result.rows[0] as User;
    // Link OAuth provider to existing account
    await queryPublic(
      `UPDATE public.users SET auth_provider = $1, auth_provider_id = $2,
       email_verified = true, last_login = NOW(), login_count = login_count + 1, updated_at = NOW()
       WHERE id = $3`,
      [provider, providerId, user.id]
    );
    return { ...user, auth_provider: provider, auth_provider_id: providerId, email_verified: true };
  }

  // Create new OAuth user
  result = await queryPublic(
    `INSERT INTO public.users (email, email_verified, display_name, avatar_url, auth_provider, auth_provider_id, last_login, login_count)
     VALUES ($1, true, $2, $3, $4, $5, NOW(), 1)
     RETURNING *`,
    [email.toLowerCase(), displayName || null, avatarUrl || null, provider, providerId]
  );

  const newUser = result.rows[0] as User;

  // Grant access to all 4 contexts
  const contexts = ['operations', 'finance', 'people', 'strategy'] as const;
  for (const ctx of contexts) {
    await queryPublic(
      `INSERT INTO public.user_contexts (user_id, context, role) VALUES ($1, $2, 'owner')
       ON CONFLICT DO NOTHING`,
      [newUser.id, ctx]
    );
  }

  logger.info('OAuth user created', {
    operation: 'user.oauthCreate',
    userId: newUser.id,
    provider,
  });

  return newUser;
}

/**
 * Update user profile.
 */
export async function updateProfile(userId: string, input: UpdateProfileInput): Promise<User> {
  const setClauses: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (input.display_name !== undefined) {
    setClauses.push(`display_name = $${paramIndex++}`);
    values.push(input.display_name);
  }
  if (input.avatar_url !== undefined) {
    setClauses.push(`avatar_url = $${paramIndex++}`);
    values.push(input.avatar_url);
  }
  if (input.preferences !== undefined) {
    setClauses.push(`preferences = $${paramIndex++}`);
    values.push(JSON.stringify(input.preferences));
  }

  if (setClauses.length === 0) {
    const user = await findById(userId);
    if (!user) {throw new UserServiceError('User not found', 'NOT_FOUND');}
    return user;
  }

  setClauses.push(`updated_at = NOW()`);
  values.push(userId);

  const result = await queryPublic(
    `UPDATE public.users SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
    values as (string | number | boolean | null)[]
  );

  if (result.rows.length === 0) {
    throw new UserServiceError('User not found', 'NOT_FOUND');
  }

  return result.rows[0] as User;
}

/**
 * Set MFA secret for a user.
 * Phase 66: Encrypts the secret before storing.
 */
export async function setMfaSecret(userId: string, secret: string | null): Promise<void> {
  // eslint-disable-next-line security/detect-possible-timing-attacks -- null check, not a secret comparison
  if (secret === null) {
    await queryPublic(
      'UPDATE public.users SET mfa_secret = NULL, updated_at = NOW() WHERE id = $1',
      [userId]
    );
    return;
  }
  const { encrypt } = await import('../security/field-encryption');
  const encryptedSecret = encrypt(secret);
  await queryPublic(
    'UPDATE public.users SET mfa_secret = $1, updated_at = NOW() WHERE id = $2',
    [encryptedSecret, userId]
  );
}

/**
 * Enable/disable MFA for a user.
 */
export async function setMfaEnabled(userId: string, enabled: boolean): Promise<void> {
  await queryPublic(
    'UPDATE public.users SET mfa_enabled = $1, updated_at = NOW() WHERE id = $2',
    [enabled, userId]
  );
}

/**
 * Change user password. Verifies current password before updating.
 */
export async function changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
  const result = await queryPublic(
    'SELECT password_hash FROM public.users WHERE id = $1',
    [userId]
  );

  if (result.rows.length === 0) {
    throw new UserServiceError('User not found', 'NOT_FOUND', 404);
  }

  const { password_hash } = result.rows[0];
  if (!password_hash) {
    throw new UserServiceError('Password login not available for OAuth users', 'NO_PASSWORD', 400);
  }

  const passwordValid = await bcrypt.compare(currentPassword, password_hash);
  if (!passwordValid) {
    throw new UserServiceError('Current password is incorrect', 'INVALID_PASSWORD', 401);
  }

  const newHash = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS);
  await queryPublic(
    'UPDATE public.users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
    [newHash, userId]
  );

  logger.info('Password changed', { operation: 'changePassword', userId });
}

/**
 * Verify a user's password (for sensitive operations like ownership transfer).
 */
export async function verifyPassword(userId: string, password: string): Promise<boolean> {
  const result = await queryPublic(
    'SELECT password_hash FROM public.users WHERE id = $1',
    [userId],
  );
  const row = result.rows[0];
  if (!row?.password_hash) return false;
  return bcrypt.compare(password, row.password_hash);
}

/**
 * Create a password reset token (random, hashed in DB, 1 hour expiry).
 * Returns the raw token for inclusion in the email link.
 */
export async function createPasswordResetToken(email: string): Promise<string | null> {
  const result = await queryPublic(
    'SELECT id FROM public.users WHERE email = $1 AND auth_provider = $2',
    [email.toLowerCase(), 'local']
  );

  if (result.rows.length === 0) {
    // Don't reveal whether email exists — return null silently
    return null;
  }

  const userId = result.rows[0].id;
  const crypto = await import('crypto');
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  // Invalidate any existing reset tokens for this user
  await queryPublic(
    `DELETE FROM public.password_reset_tokens WHERE user_id = $1`,
    [userId]
  );

  await queryPublic(
    `INSERT INTO public.password_reset_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [userId, tokenHash, expiresAt]
  );

  logger.info('Password reset token created', { operation: 'user.resetToken', userId });
  return rawToken;
}

/**
 * Reset password using a valid reset token.
 */
export async function resetPasswordWithToken(token: string, newPassword: string): Promise<void> {
  const pwValidation = validatePassword(newPassword);
  if (!pwValidation.valid) {
    throw new UserServiceError(pwValidation.message ?? 'Password too weak', 'WEAK_PASSWORD');
  }

  const crypto = await import('crypto');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  const result = await queryPublic(
    `SELECT user_id FROM public.password_reset_tokens
     WHERE token_hash = $1 AND expires_at > NOW()`,
    [tokenHash]
  );

  if (result.rows.length === 0) {
    throw new UserServiceError('Reset-Link ist abgelaufen oder ungueltig.', 'INVALID_TOKEN');
  }

  const userId = result.rows[0].user_id;
  const newHash = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS);

  await queryPublic(
    'UPDATE public.users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
    [newHash, userId]
  );

  // Delete used token
  await queryPublic('DELETE FROM public.password_reset_tokens WHERE user_id = $1', [userId]);

  logger.info('Password reset completed', { operation: 'user.resetPassword', userId });
}

// ===========================================
// Account Deletion (DSGVO Art. 17 — Right to be forgotten)
// ===========================================

/**
 * Sprint 1.1 (2026-04-16):
 * Permanently delete a user and ALL associated data across the platform.
 *
 * Cascade scope:
 *   1. All 4 context schemas (operations, finance, people, strategy) — every table
 *      with a `user_id` column is deleted via dynamic information_schema lookup.
 *      pgvector embedding rows are removed alongside their parent rows.
 *   2. public.users (FK-cascades remove subscriptions, sessions, MFA, OAuth links,
 *      org memberships, audit-log foreign-keys → audit rows are anonymized to NULL).
 *   3. Redis: revoke all sessions, purge per-user cache keys (best-effort).
 *   4. Sentry: clear user context so subsequent events carry no PII for this id.
 *
 * Properties:
 *   - **Idempotent**: returning early if the user does not exist (no error).
 *   - **Transactional per schema** for SQL deletes; Redis/Sentry are best-effort.
 *   - **Returns a tally** of affected rows for audit/observability.
 *
 * Notes for the caller:
 *   - The route layer must verify the requester is the user themselves (or admin)
 *     and revoke their JWT/session BEFORE calling this. We also revoke here.
 *   - We do not anonymize-in-place — DSGVO Art. 17 requires deletion, not pseudonymization.
 */
export interface DeleteCascadeResult {
  userId: string;
  existed: boolean;
  rowsDeletedByContext: Record<string, number>;
  rowsDeletedPublic: number;
  sessionsRevoked: number;
  cachePurged: boolean;
}

export async function deleteUserCascade(userId: string): Promise<DeleteCascadeResult> {
  const result: DeleteCascadeResult = {
    userId,
    existed: false,
    rowsDeletedByContext: { operations: 0, finance: 0, people: 0, strategy: 0 },
    rowsDeletedPublic: 0,
    sessionsRevoked: 0,
    cachePurged: false,
  };

  // Idempotency check
  const existing = await queryPublic('SELECT id FROM public.users WHERE id = $1', [userId]);
  if (existing.rows.length === 0) {
    logger.info('deleteUserCascade: user not found, no-op', { userId });
    return result;
  }
  result.existed = true;

  // 1. Schema-isolated deletes — dynamic lookup so future tables with `user_id` are caught.
  const { queryContext, withTransaction } = await import('../../utils/database-context');
  const contexts = ['operations', 'finance', 'people', 'strategy'] as const;

  for (const ctx of contexts) {
    try {
      const tablesRes = await queryContext(
        ctx,
        `SELECT table_name FROM information_schema.columns
         WHERE table_schema = $1 AND column_name = 'user_id'`,
        [ctx],
      );
      const tables = (tablesRes.rows as Array<{ table_name: string }>).map(r => r.table_name);

      if (tables.length === 0) continue;

      await withTransaction(ctx, async (q) => {
        for (const tbl of tables) {
          // Identifier comes from information_schema (PostgreSQL system catalog),
          // not from user input — safe to interpolate.
          // eslint-disable-next-line security/detect-non-literal-fs-filename
          const del = await q(`DELETE FROM "${tbl}" WHERE user_id = $1`, [userId]);
          result.rowsDeletedByContext[ctx] += del.rowCount ?? 0;
        }
      });
    } catch (err) {
      logger.error(`deleteUserCascade: context ${ctx} failed`,
        err instanceof Error ? err : undefined,
        { userId, ctx });
      // Do not abort the cascade — other contexts and public-schema cleanup must still run.
    }
  }

  // 2. Public-schema cleanup. The users row itself is deleted last; FK ON DELETE CASCADE
  //    or ON DELETE SET NULL handles subscriptions, sessions, oauth_accounts, etc.
  //    For tables without explicit cascade, we delete defensively.
  const publicTables = [
    'user_credits',
    'user_contexts',
    'password_reset_tokens',
    'user_sessions',
    'oauth_accounts',
    'subscriptions',
    'organization_members',
    'workspace_members',
    'workspace_invitations',
    'organization_invitations',
  ];
  for (const tbl of publicTables) {
    try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      const del = await queryPublic(`DELETE FROM public."${tbl}" WHERE user_id = $1`, [userId]);
      result.rowsDeletedPublic += del.rowCount ?? 0;
    } catch (err) {
      // Table may not exist in this deployment; log and continue.
      logger.debug(`deleteUserCascade: skip public.${tbl}`, {
        userId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // 3. Final delete of the user row itself (FK-cascades trigger).
  const userDel = await queryPublic('DELETE FROM public.users WHERE id = $1', [userId]);
  result.rowsDeletedPublic += userDel.rowCount ?? 0;

  // 4. Redis cleanup (best-effort).
  try {
    const { sessionStore } = await import('./session-store');
    await sessionStore.revokeAllUserSessions(userId);
    result.sessionsRevoked = 1; // boolean-ish: we revoked the user's sessions
  } catch (err) {
    logger.warn('deleteUserCascade: session revoke failed', {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
  try {
    const { cache } = await import('../../utils/cache');
    if (cache.isAvailable()) {
      // Purge any per-user cache namespaces. Pattern is intentionally broad to catch
      // legacy keys; SCAN-based delPattern is non-blocking.
      await cache.delPattern(`*:${userId}:*`);
      await cache.delPattern(`*:${userId}`);
      result.cachePurged = true;
    }
  } catch (err) {
    logger.warn('deleteUserCascade: cache purge failed', {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // 5. Sentry: clear user context so subsequent events for this request don't carry PII.
  try {
    const { setUser } = await import('../observability/sentry');
    setUser(null);
  } catch {
    // Sentry not initialized — ignore.
  }

  logger.info('deleteUserCascade completed', {
    operation: 'user.deleteCascade',
    userId,
    rowsDeletedByContext: result.rowsDeletedByContext,
    rowsDeletedPublic: result.rowsDeletedPublic,
  });

  return result;
}

// ===========================================
// Error Class
// ===========================================

export class UserServiceError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = 'UserServiceError';
  }
}
