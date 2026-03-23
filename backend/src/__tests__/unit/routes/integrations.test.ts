/**
 * Integrations Route Tests
 *
 * Tests integration listing, provider details, and settings update.
 */

import express from 'express';
import request from 'supertest';
import { integrationsRouter } from '../../../routes/integrations';
import { errorHandler } from '../../../middleware/errorHandler';

jest.mock('../../../middleware/auth', () => ({
  apiKeyAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireScope: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const mockPoolQuery = jest.fn();

jest.mock('../../../utils/database', () => ({
  pool: {
    query: (...args: unknown[]) => mockPoolQuery(...args),
  },
}));

const mockIsMicrosoftConnected = jest.fn();

jest.mock('../../../services/microsoft', () => ({
  isMicrosoftConnected: () => mockIsMicrosoftConnected(),
  getAuthorizationUrl: jest.fn(),
  exchangeCodeForTokens: jest.fn(),
  getUserProfile: jest.fn(),
  storeTokens: jest.fn(),
  getValidAccessToken: jest.fn(),
  syncCalendarEvents: jest.fn(),
  getUpcomingEvents: jest.fn().mockResolvedValue([]),
  disconnectMicrosoft: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../../utils/validation', () => ({
  toInt: (val: string | undefined, def: number) => parseInt(val || '', 10) || def,
}));

describe('Integrations Routes', () => {
  let app: express.Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/integrations', integrationsRouter);
    app.use(errorHandler);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockPoolQuery.mockResolvedValue({ rows: [] });
    mockIsMicrosoftConnected.mockResolvedValue(false);
  });

  it('GET / — lists integrations with default status', async () => {
    const res = await request(app).get('/api/integrations');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.integrations).toHaveLength(2);
    expect(res.body.integrations[0].provider).toBe('microsoft');
    expect(res.body.integrations[1].provider).toBe('slack');
  });

  it('GET / — reflects connected status', async () => {
    mockIsMicrosoftConnected.mockResolvedValue(true);

    const res = await request(app).get('/api/integrations');

    expect(res.status).toBe(200);
    const ms = res.body.integrations.find((i: { provider: string }) => i.provider === 'microsoft');
    expect(ms.isConnected).toBe(true);
  });

  it('GET / — handles missing integrations table', async () => {
    mockPoolQuery.mockRejectedValueOnce(new Error('relation "integrations" does not exist'));

    const res = await request(app).get('/api/integrations');

    expect(res.status).toBe(200);
    expect(res.body.integrations).toHaveLength(2);
  });

  it('GET /:provider — returns single provider details', async () => {
    const res = await request(app).get('/api/integrations/microsoft');

    expect(res.status).toBe(200);
    expect(res.body.integration.provider).toBe('microsoft');
  });

  it('PATCH /:provider — updates integration settings', async () => {
    mockPoolQuery.mockResolvedValue({ rows: [] });

    const res = await request(app)
      .patch('/api/integrations/microsoft')
      .send({ isEnabled: true, syncSettings: { auto_sync: true } });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Integration settings updated');
  });

  it('GET /microsoft/events — returns upcoming events', async () => {
    const res = await request(app).get('/api/integrations/microsoft/events');

    expect(res.status).toBe(200);
    expect(res.body.events).toEqual([]);
  });

  it('DELETE /microsoft — disconnects Microsoft', async () => {
    const res = await request(app).delete('/api/integrations/microsoft');

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Microsoft disconnected');
  });

  // Slack-specific route tests removed — legacy routes superseded by Phase 5
});
