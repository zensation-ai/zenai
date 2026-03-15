/**
 * Phase 56: Authentication Routes
 * Handles registration, login, OAuth callbacks, token refresh, MFA, and session management.
 */

import { Router, Request, Response } from 'express';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import { asyncHandler } from '../middleware/errorHandler';
import { requireJwt } from '../middleware/jwt-auth';
import { logger } from '../utils/logger';
import * as userService from '../services/auth/user-service';
import * as jwtService from '../services/auth/jwt-service';
import { oauthManager } from '../services/auth/oauth-providers';
import { sessionStore } from '../services/auth/session-store';
import { decrypt } from '../services/security/field-encryption';

export const authRouter = Router();

// ===========================================
// Rate limit config for auth endpoints
// ===========================================
// Note: Global rate limiter in main.ts handles /api/auth/* endpoints.
// Additional endpoint-specific limits should be added to ENDPOINT_LIMITS in auth.ts middleware.

// ===========================================
// Registration
// ===========================================

/**
 * POST /api/auth/register
 * Register a new user with email/password.
 */
authRouter.post('/register', asyncHandler(async (req: Request, res: Response) => {
  const { email, password, display_name } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      error: 'Email and password are required',
      code: 'VALIDATION_ERROR',
    });
  }

  try {
    const user = await userService.register({ email, password, display_name });
    const deviceInfo = extractDeviceInfo(req);
    const tokenPair = await jwtService.generateTokenPair(user, deviceInfo, req.ip || undefined);

    return res.status(201).json({
      success: true,
      data: {
        user: userService.toUserProfile(user),
        ...tokenPair,
      },
    });
  } catch (error) {
    if (error instanceof userService.UserServiceError) {
      return res.status(error.statusCode).json({
        success: false,
        error: error.message,
        code: error.code,
      });
    }
    throw error;
  }
}));

// ===========================================
// Login
// ===========================================

/**
 * POST /api/auth/login
 * Authenticate with email/password, returns token pair.
 */
authRouter.post('/login', asyncHandler(async (req: Request, res: Response) => {
  const { email, password, mfa_code } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      error: 'Email and password are required',
      code: 'VALIDATION_ERROR',
    });
  }

  try {
    const user = await userService.login(email, password);

    // Check MFA
    if (user.mfa_enabled && user.mfa_secret) {
      if (!mfa_code) {
        return res.status(200).json({
          success: true,
          data: { mfa_required: true },
        });
      }

      const isValid = authenticator.verify({
        token: mfa_code,
        secret: decrypt(user.mfa_secret),
      });

      if (!isValid) {
        return res.status(401).json({
          success: false,
          error: 'Invalid MFA code',
          code: 'INVALID_MFA',
        });
      }
    }

    const deviceInfo = extractDeviceInfo(req);
    const tokenPair = await jwtService.generateTokenPair(user, deviceInfo, req.ip || undefined);

    return res.json({
      success: true,
      data: {
        user: userService.toUserProfile(user),
        ...tokenPair,
      },
    });
  } catch (error) {
    if (error instanceof userService.UserServiceError) {
      return res.status(error.statusCode).json({
        success: false,
        error: error.message,
        code: error.code,
      });
    }
    throw error;
  }
}));

// ===========================================
// Token Refresh
// ===========================================

/**
 * POST /api/auth/refresh
 * Refresh token pair using a valid refresh token.
 */
authRouter.post('/refresh', asyncHandler(async (req: Request, res: Response) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(400).json({
      success: false,
      error: 'Refresh token is required',
      code: 'VALIDATION_ERROR',
    });
  }

  try {
    const deviceInfo = extractDeviceInfo(req);
    const tokenPair = await jwtService.refreshTokens(refreshToken, deviceInfo, req.ip || undefined);

    return res.json({
      success: true,
      data: tokenPair,
    });
  } catch (error) {
    if (error instanceof jwtService.JwtError) {
      return res.status(error.statusCode).json({
        success: false,
        error: error.message,
        code: error.code,
      });
    }
    throw error;
  }
}));

// ===========================================
// Logout
// ===========================================

/**
 * POST /api/auth/logout
 * Revoke the current session.
 */
authRouter.post('/logout', requireJwt, asyncHandler(async (req: Request, res: Response) => {
  const { refreshToken } = req.body;

  if (refreshToken) {
    // Revoke specific session by refresh token
    const crypto = await import('crypto');
    const hash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const session = await sessionStore.findByRefreshTokenHash(hash);
    if (session) {
      await sessionStore.revokeSession(session.id);
    }
  }

  return res.json({ success: true });
}));

// ===========================================
// User Profile
// ===========================================

/**
 * GET /api/auth/me
 * Get current authenticated user profile.
 */
authRouter.get('/me', requireJwt, asyncHandler(async (req: Request, res: Response) => {
  const userId = req.jwtUser!.id;
  const user = await userService.findById(userId);

  if (!user) {
    return res.status(404).json({
      success: false,
      error: 'User not found',
      code: 'NOT_FOUND',
    });
  }

  return res.json({
    success: true,
    data: userService.toUserProfile(user),
  });
}));

/**
 * PUT /api/auth/me
 * Update current user profile.
 */
authRouter.put('/me', requireJwt, asyncHandler(async (req: Request, res: Response) => {
  const userId = req.jwtUser!.id;
  const { display_name, avatar_url, preferences } = req.body;

  try {
    const user = await userService.updateProfile(userId, {
      display_name,
      avatar_url,
      preferences,
    });

    return res.json({
      success: true,
      data: userService.toUserProfile(user),
    });
  } catch (error) {
    if (error instanceof userService.UserServiceError) {
      return res.status(error.statusCode).json({
        success: false,
        error: error.message,
        code: error.code,
      });
    }
    throw error;
  }
}));

// ===========================================
// OAuth
// ===========================================

/**
 * GET /api/auth/providers
 * List available (configured) OAuth providers.
 */
authRouter.get('/providers', asyncHandler(async (_req: Request, res: Response) => {
  return res.json({
    success: true,
    data: oauthManager.getAvailableProviders(),
  });
}));

/**
 * GET /api/auth/providers/:provider
 * Get OAuth authorization URL for a provider.
 */
authRouter.get('/providers/:provider', asyncHandler(async (req: Request, res: Response) => {
  const { provider } = req.params;
  const { redirect_uri } = req.query;

  if (!oauthManager.isProviderAvailable(provider)) {
    return res.status(400).json({
      success: false,
      error: `OAuth provider '${provider}' is not configured`,
      code: 'PROVIDER_NOT_CONFIGURED',
      available: oauthManager.getAvailableProviders(),
    });
  }

  try {
    const result = await oauthManager.getAuthorizationUrl(provider, redirect_uri as string);

    return res.json({
      success: true,
      data: {
        url: result.url,
        state: result.state,
      },
    });
  } catch (error) {
    if (error instanceof Error && 'code' in error) {
      const oauthError = error as { code: string; statusCode?: number };
      return res.status(oauthError.statusCode || 400).json({
        success: false,
        error: error.message,
        code: oauthError.code,
      });
    }
    throw error;
  }
}));

/**
 * GET /api/auth/callback/:provider
 * Handle OAuth callback from provider.
 */
authRouter.get('/callback/:provider', asyncHandler(async (req: Request, res: Response) => {
  const { provider } = req.params;
  const { code, state, error: oauthError } = req.query;

  if (oauthError) {
    logger.warn('OAuth callback error', {
      operation: 'auth.oauthCallback',
      provider,
      error: oauthError,
    });
    return res.status(400).json({
      success: false,
      error: `OAuth error: ${oauthError}`,
      code: 'OAUTH_ERROR',
    });
  }

  if (!code || !state) {
    return res.status(400).json({
      success: false,
      error: 'Missing code or state parameter',
      code: 'VALIDATION_ERROR',
    });
  }

  try {
    const userInfo = await oauthManager.handleCallback(
      provider,
      code as string,
      state as string
    );

    // Find or create user
    const user = await userService.findOrCreateOAuthUser({
      email: userInfo.email,
      provider,
      providerId: userInfo.providerId,
      displayName: userInfo.name || undefined,
      avatarUrl: userInfo.avatarUrl || undefined,
    });

    const deviceInfo = extractDeviceInfo(req);
    const tokenPair = await jwtService.generateTokenPair(user, deviceInfo, req.ip || undefined);

    // For browser-based OAuth, redirect to frontend with tokens in URL fragment.
    // Fragments (#) are never sent to the server in subsequent requests, preventing
    // token leakage via server logs, Referer headers, or browser history.
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const params = new URLSearchParams({
      accessToken: tokenPair.accessToken,
      refreshToken: tokenPair.refreshToken,
      expiresIn: String(tokenPair.expiresIn),
    });

    return res.redirect(`${frontendUrl}/auth/callback#${params.toString()}`);
  } catch (error) {
    logger.error('OAuth callback failed', error instanceof Error ? error : undefined, {
      operation: 'auth.oauthCallback',
      provider,
    });

    if (error instanceof Error && 'code' in error) {
      const typedError = error as { code: string; statusCode?: number };
      return res.status(typedError.statusCode || 400).json({
        success: false,
        error: error.message,
        code: typedError.code,
      });
    }
    throw error;
  }
}));

// ===========================================
// MFA (TOTP)
// ===========================================

/**
 * POST /api/auth/mfa/setup
 * Generate TOTP secret and QR code for MFA setup.
 */
authRouter.post('/mfa/setup', requireJwt, asyncHandler(async (req: Request, res: Response) => {
  const userId = req.jwtUser!.id;
  const user = await userService.findById(userId);

  if (!user) {
    return res.status(404).json({ success: false, error: 'User not found', code: 'NOT_FOUND' });
  }

  if (user.mfa_enabled) {
    return res.status(400).json({
      success: false,
      error: 'MFA is already enabled',
      code: 'MFA_ALREADY_ENABLED',
    });
  }

  // Generate TOTP secret
  const secret = authenticator.generateSecret();

  // Store secret (not enabled yet — user must verify first)
  await userService.setMfaSecret(userId, secret);

  // Generate QR code
  const otpauthUrl = authenticator.keyuri(user.email, 'ZenAI', secret);
  const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);

  // Only return the QR code and otpauth URL — the secret is embedded in the URI.
  // Returning the raw secret in the response body would expose it to interception.
  return res.json({
    success: true,
    data: {
      qrCode: qrCodeDataUrl,
      otpauthUrl,
    },
  });
}));

/**
 * POST /api/auth/mfa/verify
 * Verify MFA setup or perform MFA verification.
 */
authRouter.post('/mfa/verify', requireJwt, asyncHandler(async (req: Request, res: Response) => {
  const userId = req.jwtUser!.id;
  const { code } = req.body;

  if (!code) {
    return res.status(400).json({
      success: false,
      error: 'MFA code is required',
      code: 'VALIDATION_ERROR',
    });
  }

  const user = await userService.findById(userId);
  if (!user || !user.mfa_secret) {
    return res.status(400).json({
      success: false,
      error: 'MFA not set up',
      code: 'MFA_NOT_SETUP',
    });
  }

  const isValid = authenticator.verify({
    token: code,
    secret: decrypt(user.mfa_secret),
  });

  if (!isValid) {
    return res.status(401).json({
      success: false,
      error: 'Invalid MFA code',
      code: 'INVALID_MFA',
    });
  }

  // Enable MFA if not already
  if (!user.mfa_enabled) {
    await userService.setMfaEnabled(userId, true);
  }

  return res.json({
    success: true,
    data: { mfa_enabled: true },
  });
}));

// ===========================================
// Change Password
// ===========================================

/**
 * POST /api/auth/change-password
 * Change the current user's password. Requires current password verification.
 * Revokes all other sessions after password change for security.
 */
authRouter.post('/change-password', requireJwt, asyncHandler(async (req: Request, res: Response) => {
  const userId = req.jwtUser!.id;
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({
      success: false,
      error: 'Current password and new password are required',
      code: 'VALIDATION_ERROR',
    });
  }

  if (newPassword.length < 8) {
    return res.status(400).json({
      success: false,
      error: 'New password must be at least 8 characters',
      code: 'VALIDATION_ERROR',
    });
  }

  try {
    await userService.changePassword(userId, currentPassword, newPassword);

    // Revoke all other sessions for security (user must re-login on other devices)
    await jwtService.revokeAllUserSessions(userId);

    // Generate fresh tokens for current session
    const user = await userService.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found', code: 'NOT_FOUND' });
    }
    const deviceInfo = extractDeviceInfo(req);
    const tokenPair = await jwtService.generateTokenPair(user, deviceInfo, req.ip || undefined);

    return res.json({
      success: true,
      data: {
        message: 'Password changed successfully. All other sessions have been revoked.',
        ...tokenPair,
      },
    });
  } catch (error) {
    if (error instanceof userService.UserServiceError) {
      return res.status(error.statusCode).json({
        success: false,
        error: error.message,
        code: error.code,
      });
    }
    throw error;
  }
}));

// ===========================================
// Logout All Sessions
// ===========================================

/**
 * POST /api/auth/logout-all
 * Revoke all sessions for the current user (log out from all devices).
 */
authRouter.post('/logout-all', requireJwt, asyncHandler(async (req: Request, res: Response) => {
  const userId = req.jwtUser!.id;

  await jwtService.revokeAllUserSessions(userId);

  return res.json({
    success: true,
    data: { message: 'All sessions have been revoked' },
  });
}));

// ===========================================
// Disable MFA
// ===========================================

/**
 * POST /api/auth/mfa/disable
 * Disable MFA for the current user. Requires current MFA code for verification.
 */
authRouter.post('/mfa/disable', requireJwt, asyncHandler(async (req: Request, res: Response) => {
  const userId = req.jwtUser!.id;
  const { code } = req.body;

  if (!code) {
    return res.status(400).json({
      success: false,
      error: 'Current MFA code is required to disable MFA',
      code: 'VALIDATION_ERROR',
    });
  }

  const user = await userService.findById(userId);
  if (!user || !user.mfa_enabled || !user.mfa_secret) {
    return res.status(400).json({
      success: false,
      error: 'MFA is not enabled',
      code: 'MFA_NOT_ENABLED',
    });
  }

  // Verify the MFA code before disabling
  const isValid = authenticator.verify({
    token: code,
    secret: decrypt(user.mfa_secret),
  });

  if (!isValid) {
    return res.status(401).json({
      success: false,
      error: 'Invalid MFA code',
      code: 'INVALID_MFA',
    });
  }

  await userService.setMfaEnabled(userId, false);
  await userService.setMfaSecret(userId, '');

  return res.json({
    success: true,
    data: { mfa_enabled: false, message: 'MFA has been disabled' },
  });
}));

// ===========================================
// Sessions Management
// ===========================================

/**
 * GET /api/auth/sessions
 * List active sessions for the current user.
 */
authRouter.get('/sessions', requireJwt, asyncHandler(async (req: Request, res: Response) => {
  const userId = req.jwtUser!.id;
  const sessions = await sessionStore.listActiveSessions(userId);

  return res.json({
    success: true,
    data: sessions.map(s => ({
      id: s.id,
      device_info: s.device_info,
      ip_address: s.ip_address,
      created_at: s.created_at,
      expires_at: s.expires_at,
    })),
  });
}));

/**
 * DELETE /api/auth/sessions/:id
 * Revoke a specific session.
 */
authRouter.delete('/sessions/:id', requireJwt, asyncHandler(async (req: Request, res: Response) => {
  const userId = req.jwtUser!.id;
  const { id } = req.params;

  // Verify session belongs to current user
  const session = await sessionStore.findById(id);
  if (!session || session.user_id !== userId) {
    return res.status(404).json({ success: false, error: 'Session not found' });
  }

  await sessionStore.revokeSession(id);

  return res.json({ success: true });
}));

// ===========================================
// Helpers
// ===========================================

function extractDeviceInfo(req: Request): Record<string, unknown> {
  return {
    userAgent: req.headers['user-agent'] || 'unknown',
    ip: req.ip || req.socket?.remoteAddress || 'unknown',
    timestamp: new Date().toISOString(),
  };
}
