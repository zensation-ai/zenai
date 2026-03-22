/**
 * Integration Framework REST API Routes — Task 10
 *
 * Provides endpoints for listing, managing, and syncing user integrations.
 * A separate webhook router handles inbound events without authentication.
 */

import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { jwtAuth } from '../middleware/jwt-auth';
import { getUserId } from '../utils/user-context';
import { logger } from '../utils/logger';
import { IntegrationRegistry } from '../services/integrations/integration-registry';
import { OAuthTokenStore } from '../services/integrations/oauth-token-store';
import { WebhookRouter } from '../services/integrations/webhook-router';
import type { IntegrationCategory } from '../services/integrations/types';

/**
 * Create the main integration framework router.
 * All routes require JWT authentication.
 */
export function createIntegrationFrameworkRouter(
  registry: IntegrationRegistry,
  tokenStore: OAuthTokenStore,
): Router {
  const router = Router();

  /**
   * GET /available
   * List all registered connectors, optionally filtered by category or provider.
   */
  router.get(
    '/available',
    jwtAuth,
    asyncHandler(async (req, res) => {
      const filter: { category?: IntegrationCategory; provider?: string } = {};

      if (req.query['category']) {
        filter.category = req.query['category'] as IntegrationCategory;
      }

      if (req.query['provider']) {
        filter.provider = req.query['provider'] as string;
      }

      const connectors = registry.list(filter);

      const data = connectors.map((c) => c.definition);

      res.json({ success: true, data });
    }),
  );

  /**
   * GET /mine
   * Return the authenticated user's installed integrations.
   */
  router.get(
    '/mine',
    jwtAuth,
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      const integrations = await registry.getForUser(userId);

      res.json({ success: true, data: integrations });
    }),
  );

  /**
   * DELETE /:connectorId/disconnect
   * Revoke OAuth tokens and uninstall the integration for the user.
   */
  router.delete(
    '/:connectorId/disconnect',
    jwtAuth,
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      const { connectorId } = req.params;

      await tokenStore.revokeTokens(userId, connectorId);
      await registry.uninstall(userId, connectorId);

      logger.info(`Integration disconnected: ${connectorId} for user ${userId}`);

      res.json({ success: true });
    }),
  );

  /**
   * POST /:connectorId/sync
   * Trigger a manual sync for the given connector.
   */
  router.post(
    '/:connectorId/sync',
    jwtAuth,
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      const { connectorId } = req.params;

      const connector = registry.get(connectorId);
      if (!connector) {
        res.status(404).json({ success: false, error: `Connector '${connectorId}' not found` });
        return;
      }

      const result = await connector.sync(userId, { fullSync: false });

      logger.info(`Manual sync triggered: ${connectorId} for user ${userId}`, {
        itemsSynced: result.itemsSynced,
        errors: result.errors,
      });

      res.json({ success: true, data: result });
    }),
  );

  /**
   * GET /:connectorId/health
   * Check the health/connectivity status of a connector for the user.
   */
  router.get(
    '/:connectorId/health',
    jwtAuth,
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      const { connectorId } = req.params;

      const status = await registry.health(userId, connectorId);

      res.json({ success: true, data: status });
    }),
  );

  /**
   * PATCH /:connectorId/config
   * Update configuration (target context, sync settings) for a user's integration.
   */
  router.patch(
    '/:connectorId/config',
    jwtAuth,
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      const { connectorId } = req.params;

      const { targetContext, syncEnabled, syncIntervalMinutes } = req.body as {
        targetContext?: string;
        syncEnabled?: boolean;
        syncIntervalMinutes?: number;
      };

      if (targetContext === undefined || syncEnabled === undefined) {
        res.status(400).json({
          success: false,
          error: 'targetContext and syncEnabled are required',
        });
        return;
      }

      const config = {
        targetContext: targetContext as 'personal' | 'work' | 'learning' | 'creative',
        syncEnabled,
        syncIntervalMinutes,
      };

      await registry.updateConfig(userId, connectorId, config);

      res.json({ success: true });
    }),
  );

  return router;
}

/**
 * Create the webhook integration router (no auth — webhooks come from external services).
 * Mount at /api/webhooks/integrations.
 */
export function createWebhookIntegrationRouter(webhookRouter: WebhookRouter): Router {
  const router = Router();

  /**
   * POST /:connectorId
   * Receive an inbound webhook from an external provider.
   */
  router.post(
    '/:connectorId',
    asyncHandler(async (req, res) => {
      const { connectorId } = req.params;

      const rawEvent = {
        headers: req.headers as Record<string, string>,
        body: req.body as Record<string, unknown>,
      };

      const event = await webhookRouter.route(connectorId, rawEvent);

      res.json({ success: true, eventId: event?.id ?? null });
    }),
  );

  return router;
}
