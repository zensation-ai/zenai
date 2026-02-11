/**
 * Business Connectors Routes
 *
 * Manage data source connections (add, remove, test, OAuth callbacks).
 */

import crypto from 'crypto';
import { Router, Request, Response } from 'express';
import { apiKeyAuth } from '../../middleware/auth';
import { asyncHandler, ValidationError, NotFoundError } from '../../middleware/errorHandler';
import { pool } from '../../utils/database';
import {
  stripeConnector,
  gscConnector,
  ga4Connector,
  uptimeConnector,
  lighthouseConnector,
  getConnectorStatuses,
  dataAggregator,
} from '../../services/business';
import type { BusinessSourceType } from '../../types/business';

export const connectorsRouter = Router();

const VALID_SOURCE_TYPES: BusinessSourceType[] = ['stripe', 'gsc', 'ga4', 'uptime', 'lighthouse', 'email'];

/**
 * GET /api/business/connectors
 * List all configured data sources
 */
connectorsRouter.get('/', apiKeyAuth, asyncHandler(async (_req: Request, res: Response) => {
  const result = await pool.query(`
    SELECT id, source_type, display_name, status, last_sync, last_error, created_at
    FROM business_data_sources
    ORDER BY created_at DESC
  `);

  const statuses = getConnectorStatuses();

  res.json({
    success: true,
    connectors: result.rows,
    available: statuses,
    count: result.rows.length,
  });
}));

/**
 * POST /api/business/connectors
 * Add a new data source
 */
connectorsRouter.post('/', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const { source_type, display_name, config } = req.body;

  if (!source_type || !VALID_SOURCE_TYPES.includes(source_type)) {
    throw new ValidationError(`Invalid source_type. Must be one of: ${VALID_SOURCE_TYPES.join(', ')}`);
  }
  if (!display_name) {
    throw new ValidationError('display_name is required');
  }

  const result = await pool.query(`
    INSERT INTO business_data_sources (source_type, display_name, credentials, config)
    VALUES ($1, $2, $3, $4)
    RETURNING id, source_type, display_name, status, created_at
  `, [source_type, display_name, JSON.stringify({}), JSON.stringify(config ?? {})]);

  res.json({ success: true, connector: result.rows[0] });
}));

/**
 * DELETE /api/business/connectors/:id
 * Remove a data source
 */
connectorsRouter.delete('/:id', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const result = await pool.query(`
    DELETE FROM business_data_sources WHERE id = $1 RETURNING id
  `, [id]);

  if (result.rows.length === 0) {
    throw new NotFoundError('Connector not found');
  }

  res.json({ success: true, message: 'Connector removed' });
}));

/**
 * POST /api/business/connectors/:type/test
 * Test a connector's connection
 */
connectorsRouter.post('/:type/test', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const { type } = req.params;

  const connectorMap: Record<string, { testConnection(): Promise<{ success: boolean; message: string }> }> = {
    stripe: stripeConnector,
    gsc: gscConnector,
    ga4: ga4Connector,
    uptime: uptimeConnector,
    lighthouse: lighthouseConnector,
  };

  const connector = connectorMap[type];
  if (!connector) {
    throw new ValidationError(`Unknown connector type: ${type}`);
  }

  const result = await connector.testConnection();
  res.json({ success: true, test: result });
}));

/**
 * POST /api/business/connectors/collect
 * Trigger manual data collection
 */
connectorsRouter.post('/collect', apiKeyAuth, asyncHandler(async (_req: Request, res: Response) => {
  const result = await dataAggregator.triggerCollection();
  res.json({ success: true, ...result });
}));

/**
 * GET /api/business/connectors/google/authorize
 * Start Google OAuth flow (for GSC + GA4)
 */
connectorsRouter.get('/google/authorize', apiKeyAuth, asyncHandler(async (_req: Request, res: Response) => {
  const state = crypto.randomBytes(16).toString('hex');
  // Store state for validation in callback (expires in 10 minutes)
  await pool.query(`
    INSERT INTO business_data_sources (source_type, display_name, credentials, config, status)
    VALUES ('oauth_state', 'OAuth State', $1, '{}', 'pending')
    ON CONFLICT (source_type) WHERE source_type = 'oauth_state' DO UPDATE SET
      credentials = $1, updated_at = NOW()
  `, [JSON.stringify({ state, expires: Date.now() + 10 * 60 * 1000 })]);

  const url = gscConnector.getAuthorizeUrl(state);
  res.json({ success: true, authorizeUrl: url });
}));

/**
 * GET /api/business/connectors/google/callback
 * Google OAuth callback
 */
connectorsRouter.get('/google/callback', asyncHandler(async (req: Request, res: Response) => {
  const code = req.query.code as string;
  const state = req.query.state as string;

  if (!code) {
    throw new ValidationError('Missing authorization code');
  }
  if (!state) {
    throw new ValidationError('Missing OAuth state parameter');
  }

  // Validate state to prevent CSRF
  const stateResult = await pool.query(`
    SELECT credentials FROM business_data_sources
    WHERE source_type = 'oauth_state' AND status = 'pending'
    LIMIT 1
  `);
  const storedState = stateResult.rows[0]?.credentials;
  if (!storedState || storedState.state !== state || Date.now() > storedState.expires) {
    // Clean up expired state
    await pool.query(`DELETE FROM business_data_sources WHERE source_type = 'oauth_state'`);
    throw new ValidationError('Invalid or expired OAuth state');
  }

  // Clean up used state
  await pool.query(`DELETE FROM business_data_sources WHERE source_type = 'oauth_state'`);

  await gscConnector.exchangeCode(code);

  // Redirect to frontend settings
  res.redirect('/business?tab=connectors&connected=google');
}));
