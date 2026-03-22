/**
 * MockConnector - Test connector for integration framework validation.
 */

import type {
  Connector,
  ConnectorDefinition,
  OAuthTokens,
  SyncOptions,
  SyncResult,
  HealthStatus,
  RawWebhookEvent,
  IntegrationEvent,
} from './types';

export class MockConnector implements Connector {
  definition: ConnectorDefinition = {
    id: 'mock',
    name: 'Mock Integration',
    provider: 'mock',
    category: 'dev',
    capabilities: ['test.read', 'test.write'],
    requiredScopes: ['mock.read'],
    webhookSupported: true,
    syncSupported: true,
    defaultContext: 'personal',
    description: 'A mock connector for testing the integration framework',
  };

  private connected = new Set<string>();

  async connect(userId: string): Promise<void> {
    this.connected.add(userId);
  }

  async disconnect(userId: string): Promise<void> {
    this.connected.delete(userId);
  }

  async sync(_userId: string, _options: SyncOptions): Promise<SyncResult> {
    return {
      itemsSynced: 5,
      errors: 0,
      nextSyncToken: 'mock-sync-token-1',
      duration: 150,
    };
  }

  async health(userId: string): Promise<HealthStatus> {
    return {
      connected: this.connected.has(userId),
      tokenValid: true,
      tokenExpiresAt: new Date(Date.now() + 3600_000),
    };
  }

  async handleWebhook(event: RawWebhookEvent): Promise<IntegrationEvent | null> {
    const body = Buffer.isBuffer(event.body)
      ? JSON.parse(event.body.toString())
      : event.body;
    if (!body.userId) return null;

    return {
      id: `mock-evt-${Date.now()}`,
      connectorId: 'mock',
      userId: body.userId as string,
      type: 'test.event',
      targetContext: 'personal',
      payload: body as Record<string, unknown>,
      timestamp: new Date(),
    };
  }
}
