/**
 * Phase 4: Integrations Routes
 * Manage external integrations (Microsoft, etc.)
 * SECURITY: All endpoints require authentication (handles OAuth tokens!)
 *
 * Security Hardening (2026-01-30):
 * - OAuth state parameter validation to prevent CSRF attacks
 *
 * Note: Slack routes were removed in Phase 5 — see backend/src/routes/slack.ts
 */

import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../utils/database';
import * as microsoft from '../services/microsoft';
import { apiKeyAuth, requireScope } from '../middleware/auth';
import { logger } from '../utils/logger';
import { asyncHandler, ValidationError } from '../middleware/errorHandler';
import { toInt } from '../utils/validation';

// NOTE: This file uses pool.query() (public schema) instead of queryContext()
// because integrations and OAuth tokens are system-level resources stored in the
// public schema, not context-specific data. This is intentional.

// ===========================================
// Security: OAuth State Storage
// ===========================================

// In-memory state storage with expiration (5 minutes)
const oauthStateStore = new Map<string, { createdAt: number; provider: string }>();
const OAUTH_STATE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Store OAuth state for later validation
 */
function storeOAuthState(state: string, provider: string): void {
  // Clean up expired states first
  const now = Date.now();
  for (const [key, value] of oauthStateStore.entries()) {
    if (now - value.createdAt > OAUTH_STATE_EXPIRY_MS) {
      oauthStateStore.delete(key);
    }
  }
  oauthStateStore.set(state, { createdAt: now, provider });
}

/**
 * Validate and consume OAuth state (one-time use)
 */
function validateOAuthState(state: string, expectedProvider: string): boolean {
  const stored = oauthStateStore.get(state);
  if (!stored) {
    logger.warn('OAuth state not found', { state: state.substring(0, 8), provider: expectedProvider });
    return false;
  }

  // Delete immediately (one-time use)
  oauthStateStore.delete(state);

  // Check expiration
  if (Date.now() - stored.createdAt > OAUTH_STATE_EXPIRY_MS) {
    logger.warn('OAuth state expired', { provider: expectedProvider });
    return false;
  }

  // Check provider matches
  if (stored.provider !== expectedProvider) {
    logger.warn('OAuth state provider mismatch', {
      expected: expectedProvider,
      actual: stored.provider,
    });
    return false;
  }

  return true;
}

export const integrationsRouter = Router();

// Helper to get redirect URI with production safety check
function getRedirectUri(provider: 'microsoft'): string {
  const isProduction = process.env.NODE_ENV === 'production';
  const envKey = 'MICROSOFT_REDIRECT_URI';
  const uri = process.env[envKey];

  if (!uri && isProduction) {
    throw new ValidationError(
      `${envKey} environment variable is required in production`
    );
  }

  // Only use localhost fallback in non-production
  return uri || `http://localhost:3000/api/integrations/${provider}/callback`;
}

// ==========================================
// General Integration Management
// ==========================================

/**
 * GET /api/integrations
 * List all available integrations and their status
 */
integrationsRouter.get('/', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  let dbRows: { provider: string; is_enabled: boolean; config: unknown; sync_settings: unknown; last_sync_at: string | null; sync_status: string; error_message: string | null }[] = [];
  try {
    const result = await pool.query(
      `SELECT id, provider, name, is_enabled, config, sync_settings,
              last_sync_at, sync_status, error_message, created_at
       FROM integrations
       ORDER BY provider`
    );
    dbRows = result.rows;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '';
    if (!msg.includes('does not exist')) { throw err; }
    logger.warn('integrations table not found, returning defaults');
  }

  // Check connection status for each provider
  const microsoftConnected = await microsoft.isMicrosoftConnected();
  const slackConnected = false; // Legacy removed — Phase 5 SlackConnector will handle this

  // Default integrations if none exist
  const defaultIntegrations = [
    {
      id: 'microsoft',
      provider: 'microsoft',
      name: 'Microsoft 365',
      description: 'Sync Outlook calendar events and create ideas from meetings',
      isEnabled: false,
      isConnected: microsoftConnected,
      features: ['Calendar Sync', 'Meeting Import', 'Create Events']
    },
    {
      id: 'slack',
      provider: 'slack',
      name: 'Slack',
      description: 'Create ideas from Slack messages and get notifications',
      isEnabled: false,
      isConnected: slackConnected,
      features: ['Message to Idea', 'Slash Commands', 'Notifications']
    }
  ];

  // Merge database results with defaults
  const integrations = defaultIntegrations.map(def => {
    const dbRecord = dbRows.find(r => r.provider === def.provider);
    return {
      ...def,
      isEnabled: dbRecord?.is_enabled || false,
      config: dbRecord?.config || {},
      syncSettings: dbRecord?.sync_settings || { auto_sync: false, sync_interval_minutes: 60 },
      lastSyncAt: dbRecord?.last_sync_at,
      syncStatus: dbRecord?.sync_status || 'idle',
      errorMessage: dbRecord?.error_message
    };
  });

  res.json({
    success: true,
    integrations
  });
}));

/**
 * GET /api/integrations/:provider
 * Get specific integration details
 */
integrationsRouter.get('/:provider', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const { provider } = req.params;

  let row: Record<string, unknown> | undefined;
  try {
    const result = await pool.query(
      `SELECT id, provider, name, is_enabled, config, sync_settings,
              last_sync_at, sync_status, error_message, created_at
       FROM integrations
       WHERE provider = $1`,
      [provider]
    );
    row = result.rows[0];
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '';
    if (!msg.includes('does not exist')) { throw err; }
    logger.warn('integrations table not found');
  }

  let isConnected = false;
  if (provider === 'microsoft') {
    isConnected = await microsoft.isMicrosoftConnected();
  } else if (provider === 'slack') {
    isConnected = false; // Legacy removed — Phase 5 SlackConnector will handle this
  }

  res.json({
    success: true,
    integration: {
      id: row?.id || provider,
      provider,
      name: row?.name || provider.charAt(0).toUpperCase() + provider.slice(1),
      isEnabled: row?.is_enabled || false,
      isConnected,
      config: row?.config || {},
      syncSettings: row?.sync_settings || { auto_sync: false, sync_interval_minutes: 60 },
      lastSyncAt: row?.last_sync_at,
      syncStatus: row?.sync_status || 'idle',
      errorMessage: row?.error_message
    }
  });
}));

/**
 * PATCH /api/integrations/:provider
 * Update integration settings
 */
integrationsRouter.patch('/:provider', apiKeyAuth, requireScope('write'), asyncHandler(async (req: Request, res: Response) => {
  const { provider } = req.params;
  const { isEnabled, syncSettings, config } = req.body;

  // Upsert integration record
  await pool.query(
    `INSERT INTO integrations (id, provider, name, is_enabled, config, sync_settings)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (id) DO UPDATE SET
       is_enabled = COALESCE($4, integrations.is_enabled),
       config = COALESCE($5, integrations.config),
       sync_settings = COALESCE($6, integrations.sync_settings),
       updated_at = NOW()`,
    [
      provider,
      provider,
      provider.charAt(0).toUpperCase() + provider.slice(1),
      isEnabled,
      config ? JSON.stringify(config) : null,
      syncSettings ? JSON.stringify(syncSettings) : null
    ]
  );

  res.json({
    success: true,
    message: 'Integration settings updated'
  });
}));

// ==========================================
// Microsoft Integration
// ==========================================

/**
 * GET /api/integrations/microsoft/auth
 * Get Microsoft OAuth authorization URL
 */
integrationsRouter.get('/microsoft/auth', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const redirectUri = getRedirectUri('microsoft');

  if (!clientId) {
    throw new ValidationError('Microsoft not configured. Set MICROSOFT_CLIENT_ID environment variable');
  }

  const state = uuidv4();

  // Store state for CSRF validation on callback
  storeOAuthState(state, 'microsoft');

  const authUrl = microsoft.getAuthorizationUrl(clientId, redirectUri, state);

  logger.info('Microsoft OAuth flow initiated', { statePrefix: state.substring(0, 8) });

  res.json({
    success: true,
    authUrl,
    state
  });
}));

/**
 * GET /api/integrations/microsoft/callback
 * Handle Microsoft OAuth callback
 */
integrationsRouter.get('/microsoft/callback', asyncHandler(async (req: Request, res: Response) => {
  const { code, state, error: oauthError } = req.query;

  if (oauthError) {
    logger.warn('Microsoft OAuth error', { error: oauthError });
    return res.redirect(`/settings/integrations?error=${oauthError}`);
  }

  if (!code || !state) {
    logger.warn('Microsoft OAuth callback missing params', { hasCode: !!code, hasState: !!state });
    return res.redirect('/settings/integrations?error=missing_params');
  }

  // SECURITY: Validate OAuth state to prevent CSRF attacks
  if (!validateOAuthState(state as string, 'microsoft')) {
    logger.warn('Microsoft OAuth state validation failed', { statePrefix: (state as string).substring(0, 8) });
    return res.redirect('/settings/integrations?error=invalid_state');
  }

  const clientId = process.env.MICROSOFT_CLIENT_ID ?? '';
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET ?? '';
  if (!clientId || !clientSecret) {
    throw new ValidationError('Microsoft OAuth not configured. Missing client credentials.');
  }
  const redirectUri = getRedirectUri('microsoft');

  // Exchange code for tokens
  const tokens = await microsoft.exchangeCodeForTokens(
    code as string,
    clientId,
    clientSecret,
    redirectUri
  );

  // Get user profile
  const profile = await microsoft.getUserProfile(tokens.accessToken);

  // Store tokens
  await microsoft.storeTokens(tokens, 'default', {
    email: profile.email,
    displayName: profile.displayName
  });

  // Enable integration
  await pool.query(
    `INSERT INTO integrations (id, provider, name, is_enabled, config)
     VALUES ('microsoft', 'microsoft', 'Microsoft 365', true, $1)
     ON CONFLICT (id) DO UPDATE SET is_enabled = true, config = $1, updated_at = NOW()`,
    [JSON.stringify({ email: profile.email, displayName: profile.displayName })]
  );

  res.redirect('/settings/integrations?success=microsoft');
}));

/**
 * POST /api/integrations/microsoft/sync
 * Trigger calendar sync
 */
integrationsRouter.post('/microsoft/sync', apiKeyAuth, requireScope('write'), asyncHandler(async (req: Request, res: Response) => {
  const { startDate, endDate, createMeetings = true } = req.body;

  const clientId = process.env.MICROSOFT_CLIENT_ID ?? '';
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET ?? '';
  if (!clientId || !clientSecret) {
    throw new ValidationError('Microsoft OAuth not configured. Missing client credentials.');
  }

  const accessToken = await microsoft.getValidAccessToken(clientId, clientSecret);

  if (!accessToken) {
    throw new ValidationError('Microsoft account not connected. Please authenticate first.');
  }

  // Update sync status
  await pool.query(
    `UPDATE integrations SET sync_status = 'syncing' WHERE provider = 'microsoft'`
  );

  try {
    const result = await microsoft.syncCalendarEvents(accessToken, {
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      createMeetings
    });

    res.json({
      success: true,
      message: 'Calendar sync completed',
      result
    });
  } catch (error) {
    await pool.query(
      `UPDATE integrations
       SET sync_status = 'error', error_message = $1
       WHERE provider = 'microsoft'`,
      [error instanceof Error ? error.message : 'Unknown error']
    );
    throw error;
  }
}));

/**
 * GET /api/integrations/microsoft/events
 * Get upcoming synced calendar events
 */
integrationsRouter.get('/microsoft/events', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const hours = toInt(req.query.hours as string, 24);
  const limit = toInt(req.query.limit as string, 10);

  const events = await microsoft.getUpcomingEvents(hours, limit);

  res.json({
    success: true,
    count: events.length,
    events
  });
}));

/**
 * DELETE /api/integrations/microsoft
 * Disconnect Microsoft integration
 */
integrationsRouter.delete('/microsoft', apiKeyAuth, requireScope('write'), asyncHandler(async (req: Request, res: Response) => {
  await microsoft.disconnectMicrosoft();

  res.json({
    success: true,
    message: 'Microsoft disconnected'
  });
}));

// ==========================================
// Slack Integration — Legacy routes removed (Phase 5 supersedes)
// New Slack routes will be registered via backend/src/routes/slack.ts
// ==========================================
