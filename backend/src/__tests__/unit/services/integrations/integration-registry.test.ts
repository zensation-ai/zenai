// backend/src/__tests__/unit/services/integrations/integration-registry.test.ts

const mockQueryPublic = jest.fn();
jest.mock('../../../../utils/database-context', () => ({
  queryPublic: (...args: unknown[]) => mockQueryPublic(...args),
}));

jest.mock('../../../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { IntegrationRegistry } from '../../../../services/integrations/integration-registry';
import type { Connector, ConnectorDefinition } from '../../../../services/integrations/types';

function createMockConnector(overrides: Partial<ConnectorDefinition> = {}): Connector {
  return {
    definition: {
      id: 'mock',
      name: 'Mock',
      provider: 'mock',
      category: 'dev',
      capabilities: ['test.read'],
      requiredScopes: ['mock.read'],
      webhookSupported: false,
      syncSupported: true,
      defaultContext: 'personal',
      ...overrides,
    },
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
    sync: jest.fn().mockResolvedValue({ itemsSynced: 0, errors: 0, duration: 100 }),
    health: jest.fn().mockResolvedValue({ connected: true, tokenValid: true }),
  };
}

describe('IntegrationRegistry', () => {
  let registry: IntegrationRegistry;

  beforeEach(() => {
    jest.clearAllMocks();
    registry = new IntegrationRegistry();
  });

  describe('register / get', () => {
    it('should register a connector and retrieve it by ID', () => {
      const connector = createMockConnector({ id: 'gmail', name: 'Gmail', provider: 'google', category: 'email' });

      registry.register(connector);
      const result = registry.get('gmail');

      expect(result).toBe(connector);
    });
  });

  describe('list', () => {
    it('should list all registered connectors', () => {
      const connector1 = createMockConnector({ id: 'gmail', category: 'email' });
      const connector2 = createMockConnector({ id: 'slack', category: 'messaging' });

      registry.register(connector1);
      registry.register(connector2);

      const result = registry.list();

      expect(result).toHaveLength(2);
      expect(result).toContain(connector1);
      expect(result).toContain(connector2);
    });

    it('should filter by category', () => {
      const emailConnector = createMockConnector({ id: 'gmail', category: 'email' });
      const messagingConnector = createMockConnector({ id: 'slack', category: 'messaging' });

      registry.register(emailConnector);
      registry.register(messagingConnector);

      const result = registry.list({ category: 'email' });

      expect(result).toHaveLength(1);
      expect(result[0]).toBe(emailConnector);
    });

    it('should filter by provider', () => {
      const gmailConnector = createMockConnector({ id: 'gmail', provider: 'google', category: 'email' });
      const calendarConnector = createMockConnector({ id: 'google-calendar', provider: 'google', category: 'calendar' });
      const slackConnector = createMockConnector({ id: 'slack', provider: 'slack', category: 'messaging' });

      registry.register(gmailConnector);
      registry.register(calendarConnector);
      registry.register(slackConnector);

      const result = registry.list({ provider: 'google' });

      expect(result).toHaveLength(2);
      expect(result).toContain(gmailConnector);
      expect(result).toContain(calendarConnector);
    });
  });

  describe('get', () => {
    it('should return undefined for unknown connector', () => {
      const result = registry.get('nonexistent');

      expect(result).toBeUndefined();
    });
  });

  describe('install', () => {
    it('should INSERT into user_integrations with correct SQL', async () => {
      const connector = createMockConnector({ id: 'gmail', category: 'email' });
      registry.register(connector);

      mockQueryPublic.mockResolvedValueOnce({ rows: [] });

      await registry.install('user-1', 'gmail', {
        targetContext: 'work',
        syncEnabled: true,
        syncIntervalMinutes: 30,
      });

      expect(mockQueryPublic).toHaveBeenCalledTimes(1);
      const [sql, params] = mockQueryPublic.mock.calls[0];
      expect(sql).toMatch(/INSERT INTO public\.user_integrations/i);
      expect(params).toEqual(expect.arrayContaining(['user-1', 'gmail', 'work']));
    });

    it('should throw for unknown connector', async () => {
      await expect(
        registry.install('user-1', 'nonexistent', { targetContext: 'personal', syncEnabled: false }),
      ).rejects.toThrow(/nonexistent/);

      expect(mockQueryPublic).not.toHaveBeenCalled();
    });
  });

  describe('uninstall', () => {
    it('should call connector.disconnect and DELETE from user_integrations', async () => {
      const connector = createMockConnector({ id: 'gmail' });
      registry.register(connector);

      mockQueryPublic.mockResolvedValueOnce({ rows: [] });

      await registry.uninstall('user-1', 'gmail');

      expect(connector.disconnect).toHaveBeenCalledWith('user-1');
      expect(mockQueryPublic).toHaveBeenCalledTimes(1);
      const [sql, params] = mockQueryPublic.mock.calls[0];
      expect(sql).toMatch(/DELETE FROM public\.user_integrations/i);
      expect(params).toEqual(expect.arrayContaining(['user-1', 'gmail']));
    });
  });

  describe('getForUser', () => {
    it('should return user integrations with definitions attached', async () => {
      const connector = createMockConnector({ id: 'gmail', name: 'Gmail', category: 'email' });
      registry.register(connector);

      mockQueryPublic.mockResolvedValueOnce({
        rows: [
          {
            connector_id: 'gmail',
            status: 'connected',
            target_context: 'work',
            sync_enabled: true,
            sync_interval_minutes: 15,
            last_sync_at: null,
            error: null,
          },
        ],
      });

      const result = await registry.getForUser('user-1');

      expect(result).toHaveLength(1);
      expect(result[0].connectorId).toBe('gmail');
      expect(result[0].definition).toBe(connector.definition);
      expect(result[0].status).toBe('connected');
      expect(result[0].config.targetContext).toBe('work');
      expect(result[0].config.syncEnabled).toBe(true);
    });

    it('should skip rows for unknown connectors', async () => {
      mockQueryPublic.mockResolvedValueOnce({
        rows: [
          {
            connector_id: 'unknown-connector',
            status: 'connected',
            target_context: 'personal',
            sync_enabled: false,
            sync_interval_minutes: 15,
            last_sync_at: null,
            error: null,
          },
        ],
      });

      const result = await registry.getForUser('user-1');

      expect(result).toHaveLength(0);
    });
  });

  describe('updateConfig', () => {
    it('should update target_context and config via SQL', async () => {
      const connector = createMockConnector({ id: 'gmail' });
      registry.register(connector);

      mockQueryPublic.mockResolvedValueOnce({ rows: [] });

      await registry.updateConfig('user-1', 'gmail', {
        targetContext: 'creative',
        syncEnabled: false,
        syncIntervalMinutes: 60,
      });

      expect(mockQueryPublic).toHaveBeenCalledTimes(1);
      const [sql, params] = mockQueryPublic.mock.calls[0];
      expect(sql).toMatch(/UPDATE public\.user_integrations/i);
      expect(params).toEqual(expect.arrayContaining(['user-1', 'gmail', 'creative']));
    });

    it('should clamp syncIntervalMinutes to [5, 1440]', async () => {
      const connector = createMockConnector({ id: 'gmail' });
      registry.register(connector);

      mockQueryPublic.mockResolvedValueOnce({ rows: [] });

      await registry.updateConfig('user-1', 'gmail', {
        targetContext: 'personal',
        syncEnabled: true,
        syncIntervalMinutes: 1, // below minimum of 5
      });

      const [, params] = mockQueryPublic.mock.calls[0];
      // syncIntervalMinutes should be clamped to 5
      expect(params).toEqual(expect.arrayContaining([5]));
      expect(params).not.toEqual(expect.arrayContaining([1]));
    });

    it('should clamp syncIntervalMinutes above maximum to 1440', async () => {
      const connector = createMockConnector({ id: 'gmail' });
      registry.register(connector);

      mockQueryPublic.mockResolvedValueOnce({ rows: [] });

      await registry.updateConfig('user-1', 'gmail', {
        targetContext: 'personal',
        syncEnabled: true,
        syncIntervalMinutes: 9999, // above maximum of 1440
      });

      const [, params] = mockQueryPublic.mock.calls[0];
      expect(params).toEqual(expect.arrayContaining([1440]));
      expect(params).not.toEqual(expect.arrayContaining([9999]));
    });
  });
});
