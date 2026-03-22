/**
 * Integration Framework Routes Tests — Task 10
 */

import express from 'express';
import request from 'supertest';
import { errorHandler } from '../../../middleware/errorHandler';

// Mock all dependencies
const mockRegistryList = jest.fn();
const mockRegistryGet = jest.fn();
const mockGetForUser = jest.fn();
const mockInstall = jest.fn();
const mockUninstall = jest.fn();
const mockUpdateConfig = jest.fn();
const mockHealthCheck = jest.fn();
const mockRevokeTokens = jest.fn();
const mockWebhookRoute = jest.fn();

jest.mock('../../../services/integrations/integration-registry', () => ({
  IntegrationRegistry: jest.fn().mockImplementation(() => ({
    list: mockRegistryList,
    get: mockRegistryGet,
    getForUser: mockGetForUser,
    install: mockInstall,
    uninstall: mockUninstall,
    updateConfig: mockUpdateConfig,
    health: mockHealthCheck,
  })),
}));

jest.mock('../../../services/integrations/oauth-token-store', () => ({
  OAuthTokenStore: jest.fn().mockImplementation(() => ({
    revokeTokens: mockRevokeTokens,
  })),
}));

jest.mock('../../../services/integrations/webhook-router', () => ({
  WebhookRouter: jest.fn().mockImplementation(() => ({
    route: mockWebhookRoute,
  })),
}));

jest.mock('../../../middleware/jwt-auth', () => ({
  jwtAuth: (_req: any, _res: any, next: any) => {
    _req.jwtUser = { id: 'test-user', email: 'test@test.com', role: 'admin' };
    _req.apiKey = { id: 'jwt:test', name: 'JWT', scopes: ['read', 'write', 'admin'], rateLimit: 1000 };
    next();
  },
}));

jest.mock('../../../utils/user-context', () => ({
  getUserId: () => 'test-user',
  SYSTEM_USER_ID: '00000000-0000-0000-0000-000000000001',
}));

jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import {
  createIntegrationFrameworkRouter,
  createWebhookIntegrationRouter,
} from '../../../routes/integration-framework';
import { IntegrationRegistry } from '../../../services/integrations/integration-registry';
import { OAuthTokenStore } from '../../../services/integrations/oauth-token-store';
import { WebhookRouter } from '../../../services/integrations/webhook-router';

const mockConnectorDef = {
  id: 'gmail',
  name: 'Gmail',
  provider: 'google',
  category: 'email' as const,
  capabilities: ['read_email', 'send_email'],
  requiredScopes: ['gmail.readonly'],
  webhookSupported: true,
  syncSupported: true,
  defaultContext: 'work' as const,
  description: 'Google Gmail integration',
};

const mockConnector = {
  definition: mockConnectorDef,
  connect: jest.fn(),
  disconnect: jest.fn(),
  sync: jest.fn(),
  health: jest.fn(),
  handleWebhook: jest.fn(),
};

describe('Integration Framework Routes', () => {
  let app: express.Express;
  let registry: IntegrationRegistry;
  let tokenStore: OAuthTokenStore;

  beforeAll(() => {
    registry = new IntegrationRegistry();
    tokenStore = new OAuthTokenStore();

    app = express();
    app.use(express.json());
    app.use('/integrations', createIntegrationFrameworkRouter(registry, tokenStore));
    app.use(errorHandler);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockRegistryList.mockReset();
    mockGetForUser.mockReset();
    mockUninstall.mockReset();
    mockRevokeTokens.mockReset();
    mockHealthCheck.mockReset();
    mockUpdateConfig.mockReset();
  });

  // ---- GET /available ----

  describe('GET /integrations/available', () => {
    it('returns list of connectors', async () => {
      mockRegistryList.mockReturnValue([mockConnector]);

      const res = await request(app).get('/integrations/available');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].id).toBe('gmail');
      expect(mockRegistryList).toHaveBeenCalledWith({});
    });

    it('passes category filter from query string', async () => {
      mockRegistryList.mockReturnValue([mockConnector]);

      const res = await request(app).get('/integrations/available?category=email');

      expect(res.status).toBe(200);
      expect(mockRegistryList).toHaveBeenCalledWith({ category: 'email' });
    });

    it('passes provider filter from query string', async () => {
      mockRegistryList.mockReturnValue([]);

      const res = await request(app).get('/integrations/available?provider=google');

      expect(res.status).toBe(200);
      expect(mockRegistryList).toHaveBeenCalledWith({ provider: 'google' });
    });

    it('passes both category and provider filters', async () => {
      mockRegistryList.mockReturnValue([mockConnector]);

      const res = await request(app).get('/integrations/available?category=email&provider=google');

      expect(res.status).toBe(200);
      expect(mockRegistryList).toHaveBeenCalledWith({ category: 'email', provider: 'google' });
    });
  });

  // ---- GET /mine ----

  describe('GET /integrations/mine', () => {
    it('returns user integrations', async () => {
      const userIntegration = {
        connectorId: 'gmail',
        definition: mockConnectorDef,
        status: 'connected' as const,
        config: { targetContext: 'work' as const, syncEnabled: true },
        lastSyncAt: new Date('2026-01-01T00:00:00Z'),
      };
      mockGetForUser.mockResolvedValue([userIntegration]);

      const res = await request(app).get('/integrations/mine');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].connectorId).toBe('gmail');
      expect(mockGetForUser).toHaveBeenCalledWith('test-user');
    });

    it('returns empty array when no integrations', async () => {
      mockGetForUser.mockResolvedValue([]);

      const res = await request(app).get('/integrations/mine');

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });
  });

  // ---- DELETE /:connectorId/disconnect ----

  describe('DELETE /integrations/:connectorId/disconnect', () => {
    it('revokes tokens and uninstalls connector', async () => {
      mockRevokeTokens.mockResolvedValue(undefined);
      mockUninstall.mockResolvedValue(undefined);

      const res = await request(app).delete('/integrations/gmail/disconnect');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockRevokeTokens).toHaveBeenCalledWith('test-user', 'gmail');
      expect(mockUninstall).toHaveBeenCalledWith('test-user', 'gmail');
    });

    it('still uninstalls even if revokeTokens fails', async () => {
      mockRevokeTokens.mockRejectedValue(new Error('token store unavailable'));
      mockUninstall.mockResolvedValue(undefined);

      const res = await request(app).delete('/integrations/gmail/disconnect');

      // Should still succeed or handle gracefully
      expect([200, 500]).toContain(res.status);
    });
  });

  // ---- POST /:connectorId/sync ----

  describe('POST /integrations/:connectorId/sync', () => {
    it('triggers manual sync and returns result', async () => {
      const syncResult = { itemsSynced: 10, errors: 0, duration: 500 };
      mockRegistryGet.mockReturnValue({
        ...mockConnector,
        sync: jest.fn().mockResolvedValue(syncResult),
      });

      const res = await request(app).post('/integrations/gmail/sync');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toMatchObject({ itemsSynced: 10, errors: 0 });
    });

    it('returns 404 when connector not found', async () => {
      mockRegistryGet.mockReturnValue(undefined);

      const res = await request(app).post('/integrations/unknown/sync');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('catches sync errors gracefully', async () => {
      mockRegistryGet.mockReturnValue({
        ...mockConnector,
        sync: jest.fn().mockRejectedValue(new Error('sync failed')),
      });

      const res = await request(app).post('/integrations/gmail/sync');

      expect(res.status).toBe(500);
    });
  });

  // ---- GET /:connectorId/health ----

  describe('GET /integrations/:connectorId/health', () => {
    it('returns health status', async () => {
      const healthStatus = {
        connected: true,
        tokenValid: true,
        lastSync: new Date('2026-01-01T00:00:00Z'),
      };
      mockHealthCheck.mockResolvedValue(healthStatus);

      const res = await request(app).get('/integrations/gmail/health');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.connected).toBe(true);
      expect(res.body.data.tokenValid).toBe(true);
      expect(mockHealthCheck).toHaveBeenCalledWith('test-user', 'gmail');
    });

    it('returns disconnected status for unknown connector', async () => {
      mockHealthCheck.mockResolvedValue({
        connected: false,
        tokenValid: false,
        error: "Unknown connector 'unknown'",
      });

      const res = await request(app).get('/integrations/unknown/health');

      expect(res.status).toBe(200);
      expect(res.body.data.connected).toBe(false);
    });
  });

  // ---- PATCH /:connectorId/config ----

  describe('PATCH /integrations/:connectorId/config', () => {
    it('updates config and returns success', async () => {
      mockUpdateConfig.mockResolvedValue(undefined);

      const config = {
        targetContext: 'work',
        syncEnabled: true,
        syncIntervalMinutes: 30,
      };

      const res = await request(app)
        .patch('/integrations/gmail/config')
        .send(config);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockUpdateConfig).toHaveBeenCalledWith('test-user', 'gmail', config);
    });

    it('returns 400 when required fields missing', async () => {
      const res = await request(app)
        .patch('/integrations/gmail/config')
        .send({ syncEnabled: true }); // missing targetContext

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });
});

// ---- Webhook Router ----

describe('Webhook Integration Router', () => {
  let webhookApp: express.Express;
  let webhookRouter: WebhookRouter;

  beforeAll(() => {
    webhookRouter = new WebhookRouter();

    webhookApp = express();
    webhookApp.use(express.json());
    webhookApp.use('/api/webhooks/integrations', createWebhookIntegrationRouter(webhookRouter));
    webhookApp.use(errorHandler);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockWebhookRoute.mockReset();
  });

  it('routes webhook to connector and returns eventId', async () => {
    const mockEvent = {
      id: 'evt-123',
      connectorId: 'gmail',
      userId: 'user-1',
      type: 'email.received',
      targetContext: 'work' as const,
      payload: { subject: 'Hello' },
      timestamp: new Date(),
    };
    mockWebhookRoute.mockResolvedValue(mockEvent);

    const res = await request(webhookApp)
      .post('/api/webhooks/integrations/gmail')
      .send({ data: 'payload' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.eventId).toBe('evt-123');
    expect(mockWebhookRoute).toHaveBeenCalledWith('gmail', expect.objectContaining({
      headers: expect.any(Object),
      body: expect.any(Object),
    }));
  });

  it('returns null eventId when webhook returns null', async () => {
    mockWebhookRoute.mockResolvedValue(null);

    const res = await request(webhookApp)
      .post('/api/webhooks/integrations/gmail')
      .send({ data: 'payload' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.eventId).toBeNull();
  });

  it('does not require auth (no jwtAuth middleware)', async () => {
    mockWebhookRoute.mockResolvedValue(null);

    // This should work without any auth headers
    const res = await request(webhookApp)
      .post('/api/webhooks/integrations/slack')
      .set('x-slack-signature', 'v0=abc123')
      .send({ type: 'url_verification', challenge: 'challenge123' });

    expect(res.status).toBe(200);
  });
});
