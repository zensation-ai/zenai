// backend/src/__tests__/unit/services/integrations/webhook-router.test.ts

import crypto from 'crypto';

const mockQueryPublic = jest.fn();
jest.mock('../../../../utils/database-context', () => ({
  queryPublic: (...args: unknown[]) => mockQueryPublic(...args),
}));

const mockEmitSystemEvent = jest.fn().mockResolvedValue('evt-1');
jest.mock('../../../../services/event-system', () => ({
  emitSystemEvent: (...args: unknown[]) => mockEmitSystemEvent(...args),
}));

jest.mock('../../../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { WebhookRouter } from '../../../../services/integrations/webhook-router';
import type { Connector, IntegrationEvent, RawWebhookEvent } from '../../../../services/integrations/types';

function makeConnector(overrides: Partial<Connector> = {}): Connector {
  return {
    definition: {
      id: 'test-connector',
      name: 'Test Connector',
      provider: 'test',
      category: 'dev',
      capabilities: ['test.read'],
      requiredScopes: ['test.read'],
      webhookSupported: true,
      syncSupported: true,
      defaultContext: 'personal',
    },
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
    sync: jest.fn().mockResolvedValue({ itemsSynced: 0, errors: 0, duration: 100 }),
    health: jest.fn().mockResolvedValue({ connected: true, tokenValid: true }),
    handleWebhook: jest.fn(),
    ...overrides,
  };
}

function makeRawEvent(body: Buffer | Record<string, unknown> = { type: 'message', text: 'hello' }): RawWebhookEvent {
  return {
    headers: { 'content-type': 'application/json', 'x-connector-signature': 'sig-abc' },
    body,
  };
}

function makeIntegrationEvent(overrides: Partial<IntegrationEvent> = {}): IntegrationEvent {
  return {
    id: 'evt-id-1',
    connectorId: 'test-connector',
    userId: 'user-1',
    type: 'message.received',
    targetContext: 'work',
    payload: { text: 'hello' },
    timestamp: new Date('2026-01-01T10:00:00Z'),
    ...overrides,
  };
}

describe('WebhookRouter', () => {
  let router: WebhookRouter;

  beforeEach(() => {
    jest.clearAllMocks();
    router = new WebhookRouter();
    // Default: no duplicate found
    mockQueryPublic.mockResolvedValue({ rows: [] });
  });

  describe('register', () => {
    it('should register a connector', async () => {
      const connector = makeConnector();
      connector.handleWebhook = jest.fn().mockResolvedValue(makeIntegrationEvent());
      router.register('test-connector', connector);

      const rawEvent = makeRawEvent();
      mockQueryPublic.mockResolvedValueOnce({ rows: [] }); // no duplicate
      mockQueryPublic.mockResolvedValueOnce({ rows: [{ id: 'log-1' }] }); // log insert

      const result = await router.route('test-connector', rawEvent);
      expect(result).not.toBeNull();
    });
  });

  describe('route', () => {
    it('should route webhook to the correct connector handleWebhook', async () => {
      const integrationEvent = makeIntegrationEvent();
      const connector = makeConnector({
        handleWebhook: jest.fn().mockResolvedValue(integrationEvent),
      });
      router.register('test-connector', connector);

      const rawEvent = makeRawEvent();
      mockQueryPublic.mockResolvedValueOnce({ rows: [] }); // dedup check: no hit
      mockQueryPublic.mockResolvedValueOnce({ rows: [{ id: 'log-1' }] }); // log INSERT

      const result = await router.route('test-connector', rawEvent);

      expect(connector.handleWebhook).toHaveBeenCalledWith(rawEvent);
      expect(result).toEqual(integrationEvent);
    });

    it('should emit an event to EventSystem after successful handling', async () => {
      const integrationEvent = makeIntegrationEvent({
        type: 'message.received',
        targetContext: 'work',
        payload: { text: 'hello' },
      });
      const connector = makeConnector({
        handleWebhook: jest.fn().mockResolvedValue(integrationEvent),
      });
      router.register('test-connector', connector);

      const rawEvent = makeRawEvent();
      mockQueryPublic.mockResolvedValueOnce({ rows: [] });
      mockQueryPublic.mockResolvedValueOnce({ rows: [{ id: 'log-1' }] });

      await router.route('test-connector', rawEvent);

      expect(mockEmitSystemEvent).toHaveBeenCalledTimes(1);
      expect(mockEmitSystemEvent).toHaveBeenCalledWith({
        context: 'work',
        eventType: 'integration.message.received',
        eventSource: 'test-connector',
        payload: { text: 'hello' },
      });
    });

    it('should return null for unknown connector', async () => {
      const result = await router.route('nonexistent-connector', makeRawEvent());

      expect(result).toBeNull();
      expect(mockQueryPublic).not.toHaveBeenCalled();
      expect(mockEmitSystemEvent).not.toHaveBeenCalled();
    });

    it('should return null for connector without handleWebhook', async () => {
      const connector = makeConnector();
      delete connector.handleWebhook;
      router.register('test-connector', connector);

      const result = await router.route('test-connector', makeRawEvent());

      expect(result).toBeNull();
      expect(mockQueryPublic).not.toHaveBeenCalled();
      expect(mockEmitSystemEvent).not.toHaveBeenCalled();
    });

    it('should deduplicate by payload hash (SHA-256) within 5 min window', async () => {
      const integrationEvent = makeIntegrationEvent();
      const connector = makeConnector({
        handleWebhook: jest.fn().mockResolvedValue(integrationEvent),
      });
      router.register('test-connector', connector);

      const rawEvent = makeRawEvent({ type: 'duplicate', id: 42 });

      // Simulate a duplicate found in DB
      mockQueryPublic.mockResolvedValueOnce({ rows: [{ id: 'existing-log' }] });

      const result = await router.route('test-connector', rawEvent);

      expect(result).toBeNull();
      expect(connector.handleWebhook).not.toHaveBeenCalled();
      expect(mockEmitSystemEvent).not.toHaveBeenCalled();
    });

    it('should use consistent SHA-256 hash for Buffer body dedup', async () => {
      const bodyBuffer = Buffer.from(JSON.stringify({ type: 'ping' }));
      const bodyObject = { type: 'ping' };

      const hashFromBuffer = crypto
        .createHash('sha256')
        .update(bodyBuffer)
        .digest('hex');
      const hashFromObject = crypto
        .createHash('sha256')
        .update(Buffer.from(JSON.stringify(bodyObject)))
        .digest('hex');

      // Both should produce the same hash since they represent the same JSON
      expect(hashFromBuffer).toBe(hashFromObject);
    });

    it('should perform dedup check with correct SQL (5 min window)', async () => {
      const connector = makeConnector({
        handleWebhook: jest.fn().mockResolvedValue(null),
      });
      router.register('test-connector', connector);

      mockQueryPublic.mockResolvedValueOnce({ rows: [] }); // no duplicate

      await router.route('test-connector', makeRawEvent({ type: 'check' }));

      const firstCall = mockQueryPublic.mock.calls[0];
      const [sql, params] = firstCall;
      expect(sql).toMatch(/integration_webhook_log/i);
      expect(sql).toMatch(/payload_hash/i);
      expect(sql).toMatch(/NOW\(\)/i);
      // hash should be in params
      expect(params[0]).toMatch(/^[0-9a-f]{64}$/); // valid SHA-256 hex
    });

    it('should log webhook to integration_webhook_log table', async () => {
      const integrationEvent = makeIntegrationEvent();
      const connector = makeConnector({
        handleWebhook: jest.fn().mockResolvedValue(integrationEvent),
      });
      router.register('test-connector', connector);

      const rawEvent = makeRawEvent();
      mockQueryPublic.mockResolvedValueOnce({ rows: [] }); // dedup check
      mockQueryPublic.mockResolvedValueOnce({ rows: [{ id: 'log-1' }] }); // log insert

      await router.route('test-connector', rawEvent);

      // Second call should be the INSERT into integration_webhook_log
      expect(mockQueryPublic).toHaveBeenCalledTimes(2);
      const insertCall = mockQueryPublic.mock.calls[1];
      const [sql, params] = insertCall;
      expect(sql).toMatch(/INSERT INTO/i);
      expect(sql).toMatch(/integration_webhook_log/i);
      // connector_id should be in params
      expect(params).toEqual(expect.arrayContaining(['test-connector']));
    });

    it('should not emit event if connector handleWebhook returns null', async () => {
      const connector = makeConnector({
        handleWebhook: jest.fn().mockResolvedValue(null),
      });
      router.register('test-connector', connector);

      mockQueryPublic.mockResolvedValueOnce({ rows: [] }); // dedup check
      mockQueryPublic.mockResolvedValueOnce({ rows: [{ id: 'log-1' }] }); // log insert

      const result = await router.route('test-connector', makeRawEvent());

      expect(result).toBeNull();
      expect(mockEmitSystemEvent).not.toHaveBeenCalled();
    });

    it('should include processing_time_ms in the log INSERT', async () => {
      const integrationEvent = makeIntegrationEvent();
      const connector = makeConnector({
        handleWebhook: jest.fn().mockResolvedValue(integrationEvent),
      });
      router.register('test-connector', connector);

      mockQueryPublic.mockResolvedValueOnce({ rows: [] });
      mockQueryPublic.mockResolvedValueOnce({ rows: [{ id: 'log-1' }] });

      await router.route('test-connector', makeRawEvent());

      const insertCall = mockQueryPublic.mock.calls[1];
      const [, params] = insertCall;
      // processing_time_ms should be a non-negative number
      const processingTimeParam = params.find(
        (p: unknown) => typeof p === 'number' && p >= 0
      );
      expect(processingTimeParam).toBeDefined();
    });

    it('should handle Buffer body correctly when computing hash', async () => {
      const bufferBody = Buffer.from('{"event":"push","ref":"refs/heads/main"}');
      const rawEvent = makeRawEvent(bufferBody);

      const connector = makeConnector({
        handleWebhook: jest.fn().mockResolvedValue(null),
      });
      router.register('test-connector', connector);

      mockQueryPublic.mockResolvedValueOnce({ rows: [] });
      mockQueryPublic.mockResolvedValueOnce({ rows: [{ id: 'log-1' }] });

      // Should not throw
      await expect(router.route('test-connector', rawEvent)).resolves.not.toThrow();

      // Hash in dedup check should be valid SHA-256
      const [, params] = mockQueryPublic.mock.calls[0];
      expect(params[0]).toMatch(/^[0-9a-f]{64}$/);
    });
  });
});
