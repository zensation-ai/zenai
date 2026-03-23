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
import { SlackConnector } from '../../services/integrations/slack/slack-connector';
import {
  createIntegrationFrameworkRouter,
  createWebhookIntegrationRouter,
} from '../../routes/integration-framework';
import { createSlackRouter } from '../../routes/slack';
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

    // Register Slack connector
    const slack = new SlackConnector();
    reg.register(slack);
    wh.register('slack', slack);

    // Integration management API (JWT auth)
    app.use('/api/integrations', createIntegrationFrameworkRouter(reg, store));

    // Webhook ingestion (no auth — connectors verify signatures)
    app.use('/api/webhooks/integrations', createWebhookIntegrationRouter(wh));

    // Slack-specific management routes
    app.use('/api/slack', createSlackRouter());

    logger.info('Integration framework routes registered (mock + slack)', {
      operation: 'module-init',
    });
  }
}
