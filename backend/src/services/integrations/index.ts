/**
 * Integration Framework - Phase 1
 *
 * Generic connector infrastructure for external service integrations.
 */

export { OAuthTokenStore } from './oauth-token-store';
export { IntegrationRegistry, integrationRegistry } from './integration-registry';
export { WebhookRouter } from './webhook-router';
export { MockConnector } from './mock-connector';
export type {
  Connector,
  ConnectorDefinition,
  OAuthTokens,
  SyncOptions,
  SyncResult,
  HealthStatus,
  RawWebhookEvent,
  IntegrationEvent,
  IntegrationConfig,
  UserIntegration,
  IntegrationCategory,
  IntegrationStatus,
  AIContext,
} from './types';
export {
  SYNC_INTERVAL_MIN,
  SYNC_INTERVAL_MAX,
  SYNC_INTERVAL_DEFAULT,
} from './types';

// Slack connector (Phase 5)
export type {
  SlackConnectorTokens,
  SlackWorkspace,
  SlackChannel,
  SlackMessage,
  ProactiveConfig,
  SlackWorkflowTemplate,
  SlackSyncJobData,
} from './slack/types';
export { DEFAULT_PROACTIVE_CONFIG, DEFAULT_CHANNEL_CONTEXT_MAP, inferChannelContext } from './slack/types';
