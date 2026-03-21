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

  const accessToken = jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
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
