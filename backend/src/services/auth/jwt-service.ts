/**
 * Phase 56: JWT Token Management Service
 * Handles access token generation/verification and refresh token rotation.
 * Uses HS256 with a shared JWT_SECRET for simplicity.
 */

import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { logger } from '../../utils/logger';
import type { User } from './user-service';
import { sessionStore } from './session-store';
import type { OrgPlan } from '../../types/multi-tenancy';

// ===========================================
// Types
// ===========================================

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;  // seconds until access token expiry
}

export interface AccessTokenPayload {
  sub: string;       // user ID
  email: string;
  role: string;
  iat: number;
  exp: number;
  // Multi-tenancy (all optional for backward compat)
  orgId?: string;
  workspaceId?: string;
  workspaceRole?: string;
  /**
   * Sprint 1.9: Org-Plan embedded in JWT so rate-limiter can tier without a
   * per-request DB lookup. Resolved from public.organization_members +
   * public.organizations.plan at token-issue time. Defaults to 'free' when the
   * user has no org membership.
   */
  plan?: OrgPlan;
}

// ===========================================
// Configuration
// ===========================================

const ACCESS_TOKEN_TTL = '15m';
const ACCESS_TOKEN_TTL_SECONDS = 900;
const REFRESH_TOKEN_TTL_DAYS = 7;

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    // In development/test, use a fallback (logged as warning)
    if (process.env.NODE_ENV === 'production') {
      throw new Error('JWT_SECRET environment variable is required in production');
    }
    logger.warn('JWT_SECRET not set, using fallback for development', { operation: 'jwt' });
    return 'zenai-dev-jwt-secret-not-for-production';
  }
  return secret;
}

// ===========================================
// JWT Service
// ===========================================

const VALID_PLANS: ReadonlySet<OrgPlan> = new Set<OrgPlan>([
  'free',
  'personal',
  'pro',
  'business',
  'enterprise',
]);

/**
 * Sprint 1.9: Look up the user's highest org plan for embedding into the JWT.
 *
 * Strategy: pick the "strongest" plan across all orgs where the user is a
 * member (an owner/admin on a free org who is also a member of a pro org
 * effectively gets pro-tier API limits). Falls back to 'free' when the user
 * has no org membership or the lookup fails.
 *
 * This runs ONCE at token-issue time (login/refresh/workspace-switch), not
 * per request — that is precisely the point of embedding plan in the JWT.
 */
export async function lookupUserOrgPlan(userId: string): Promise<OrgPlan> {
  try {
    const { queryPublic } = await import('../../utils/database-context');
    const result = await queryPublic(
      `SELECT o.plan
       FROM public.organization_members m
       JOIN public.organizations o ON o.id = m.org_id
       WHERE m.user_id = $1`,
      [userId]
    );
    let best: OrgPlan = 'free';
    const rank: Record<OrgPlan, number> = {
      free: 0,
      personal: 1,
      pro: 2,
      business: 3,
      enterprise: 4,
    };
    for (const row of result.rows as Array<{ plan: unknown }>) {
      const raw = row.plan;
      if (typeof raw === 'string' && VALID_PLANS.has(raw as OrgPlan)) {
        const candidate = raw as OrgPlan;
        if (rank[candidate] > rank[best]) {
          best = candidate;
        }
      }
    }
    return best;
  } catch (error) {
    logger.warn('Failed to look up user plan, defaulting to free', {
      operation: 'jwt.lookupUserOrgPlan',
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
    return 'free';
  }
}

/**
 * Generate an access + refresh token pair for a user.
 * The refresh token is a random hex string stored as a hash in the session store.
 */
export async function generateTokenPair(
  user: User,
  deviceInfo?: Record<string, unknown>,
  ipAddress?: string
): Promise<TokenPair> {
  const secret = getJwtSecret();

  const plan = await lookupUserOrgPlan(user.id);

  const accessToken = jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
      plan,
    },
    secret,
    {
      expiresIn: ACCESS_TOKEN_TTL,
      algorithm: 'HS256',
    }
  );

  // Generate a cryptographically secure refresh token
  const refreshToken = crypto.randomBytes(64).toString('hex');

  // Hash the refresh token before storing
  const refreshTokenHash = crypto
    .createHash('sha256')
    .update(refreshToken)
    .digest('hex');

  // Calculate expiry
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_TTL_DAYS);

  // Store session in DB
  await sessionStore.createSession({
    userId: user.id,
    refreshTokenHash,
    deviceInfo: deviceInfo || {},
    ipAddress: ipAddress || null,
    expiresAt,
  });

  logger.info('Token pair generated', {
    operation: 'jwt.generateTokenPair',
    userId: user.id,
  });

  return {
    accessToken,
    refreshToken,
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
  };
}

/**
 * Generate a new access token with workspace context.
 * Called on workspace switch — issues new token without new refresh token.
 *
 * Sprint 1.9: When an explicit `plan` is provided (e.g. from the org being
 * switched to), it is embedded. Otherwise, we fall back to the user's highest
 * plan across all orgs via {@link lookupUserOrgPlan}. This keeps
 * plan-aware rate-limiting correct across workspace switches.
 */
export async function generateWorkspaceToken(
  user: { id: string; email: string; role: string },
  workspace: { orgId: string; workspaceId: string; workspaceRole: string; plan?: OrgPlan }
): Promise<string> {
  const secret = getJwtSecret();
  const plan = workspace.plan ?? (await lookupUserOrgPlan(user.id));
  const payload: Omit<AccessTokenPayload, 'iat' | 'exp'> = {
    sub: user.id,
    email: user.email,
    role: user.role,
    orgId: workspace.orgId,
    workspaceId: workspace.workspaceId,
    workspaceRole: workspace.workspaceRole,
    plan,
  };
  return jwt.sign(payload, secret, { expiresIn: ACCESS_TOKEN_TTL });
}

/**
 * Verify an access token and return the decoded payload.
 * Throws if the token is invalid or expired.
 */
export function verifyAccessToken(token: string): AccessTokenPayload {
  const secret = getJwtSecret();

  try {
    const decoded = jwt.verify(token, secret, {
      algorithms: ['HS256'],
    }) as AccessTokenPayload;

    return decoded;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new JwtError('Access token expired', 'TOKEN_EXPIRED');
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw new JwtError('Invalid access token', 'INVALID_TOKEN');
    }
    throw new JwtError('Token verification failed', 'VERIFICATION_FAILED');
  }
}

/**
 * Refresh tokens using a valid refresh token.
 * Implements token rotation: the old refresh token is invalidated.
 */
export async function refreshTokens(
  refreshToken: string,
  deviceInfo?: Record<string, unknown>,
  ipAddress?: string
): Promise<TokenPair> {
  // Hash the incoming refresh token
  const refreshTokenHash = crypto
    .createHash('sha256')
    .update(refreshToken)
    .digest('hex');

  // Find session by hash
  const session = await sessionStore.findByRefreshTokenHash(refreshTokenHash);
  if (!session) {
    throw new JwtError('Invalid refresh token', 'INVALID_REFRESH_TOKEN');
  }

  // Check if session is revoked
  if (session.revoked) {
    // Possible token theft — revoke all sessions for this user
    logger.warn('Revoked refresh token reuse detected', {
      operation: 'jwt.refreshTokens',
      userId: session.user_id,
      sessionId: session.id,
    });
    await sessionStore.revokeAllUserSessions(session.user_id);
    throw new JwtError('Refresh token has been revoked', 'REVOKED_TOKEN');
  }

  // Check expiry
  if (new Date(session.expires_at) < new Date()) {
    throw new JwtError('Refresh token expired', 'EXPIRED_REFRESH_TOKEN');
  }

  // Revoke old session (rotation)
  await sessionStore.revokeSession(session.id);

  // Look up the user to generate a new token pair
  const { queryPublic } = await import('../../utils/database-context');
  const userResult = await queryPublic(
    'SELECT * FROM public.users WHERE id = $1',
    [session.user_id]
  );

  if (userResult.rows.length === 0) {
    throw new JwtError('User not found', 'USER_NOT_FOUND');
  }

  const user = userResult.rows[0] as User;

  // Generate new pair
  return generateTokenPair(user, deviceInfo || session.device_info, ipAddress);
}

/**
 * Revoke a specific session by ID.
 */
export async function revokeSession(sessionId: string): Promise<void> {
  await sessionStore.revokeSession(sessionId);
}

/**
 * Revoke all sessions for a user (e.g., password change, security event).
 */
export async function revokeAllUserSessions(userId: string): Promise<void> {
  await sessionStore.revokeAllUserSessions(userId);
}

// ===========================================
// Error Class
// ===========================================

export class JwtError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 401
  ) {
    super(message);
    this.name = 'JwtError';
  }
}
