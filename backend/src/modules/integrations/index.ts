/**
 * IntegrationsModule - Phase 1 Integration Framework
 *
 * Registers integration management routes and webhook ingestion.
 */

import type { Express } from 'express';
import type { Module } from '../../core/module';
import { IntegrationRegistry } from '../../services/integrations/integration-registry';
import { OAuthTokenStore } from '../../services/integrations/oauth-token-store';
import { WebhookRouter } from '../../services/integrations/webhook-router';
import { MockConnector } from '../../services/integrations/mock-connector';
import {
  createIntegrationFrameworkRouter,
  createWebhookIntegrationRouter,
} from '../../routes/integration-framework';
import { logger } from '../../utils/logger';

let registry: IntegrationRegistry;
let tokenStore: OAuthTokenStore;
let webhookRouter: WebhookRouter;

export function getIntegrationRegistry(): IntegrationRegistry {
  if (!registry) {
    registry = new IntegrationRegistry();
  }
  return registry;
}

export function getTokenStore(): OAuthTokenStore {
  if (!tokenStore) {
    tokenStore = new OAuthTokenStore();
  }
  return tokenStore;
}

export function getWebhookRouter(): WebhookRouter {
  if (!webhookRouter) {
    webhookRouter = new WebhookRouter();
  }
  return webhookRouter;
}

export class IntegrationsModule implements Module {
  name = 'integrations';

  registerRoutes(app: Express): void {
    const reg = getIntegrationRegistry();
    const store = getTokenStore();
    const wh = getWebhookRouter();

    // Register mock connector (for testing and as example)
    const mock = new MockConnector();
    reg.register(mock);
    wh.register('mock', mock);

    // Integration management API (JWT auth)
    app.use('/api/integrations', createIntegrationFrameworkRouter(reg, store));

    // Webhook ingestion (no auth — connectors verify signatures)
    app.use('/api/webhooks/integrations', createWebhookIntegrationRouter(wh));

    logger.info('Integration framework routes registered', {
      operation: 'module-init',
    });
  }
}
