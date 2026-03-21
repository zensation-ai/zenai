/**
 * On-Device AI Route Tests
 *
 * Tests status, vocab sync, and config endpoints.
 */

import express from 'express';
import request from 'supertest';
import { onDeviceAIRouter } from '../../../routes/on-device-ai';
import { errorHandler } from '../../../middleware/errorHandler';

jest.mock('../../../middleware/auth', () => ({
  apiKeyAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireScope: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

jest.mock('../../../utils/user-context', () => ({
  getUserId: () => 'user-123',
}));

jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

describe('On-Device AI Routes', () => {
  let app: express.Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api', onDeviceAIRouter);
    app.use(errorHandler);
  });

  it('GET /:context/on-device-ai/status — returns cloud status', async () => {
    const res = await request(app).get('/api/personal/on-device-ai/status');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.cloudAvailable).toBe(true);
    expect(res.body.data.recommendOnDevice).toBeInstanceOf(Array);
    expect(res.body.data.requiresCloud).toBeInstanceOf(Array);
  });

  it('GET /:context/on-device-ai/status — works for all contexts', async () => {
    for (const ctx of ['personal', 'work', 'learning', 'creative']) {
      const res = await request(app).get(`/api/${ctx}/on-device-ai/status`);
      expect(res.status).toBe(200);
    }
  });

  it('POST /:context/on-device-ai/sync-vocab — syncs vocabulary', async () => {
    const res = await request(app)
      .post('/api/personal/on-device-ai/sync-vocab')
      .send({ vocabulary: [{ term: 'test', df: 1, idf: 0.5 }] });

    expect(res.status).toBe(200);
    expect(res.body.data.termsReceived).toBe(1);
    expect(res.body.data.syncedAt).toBeDefined();
  });

  it('POST /:context/on-device-ai/sync-vocab — rejects non-array vocabulary', async () => {
    const res = await request(app)
      .post('/api/personal/on-device-ai/sync-vocab')
      .send({ vocabulary: 'not-an-array' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('POST /:context/on-device-ai/sync-vocab — handles empty array', async () => {
    const res = await request(app)
      .post('/api/personal/on-device-ai/sync-vocab')
      .send({ vocabulary: [] });

    expect(res.status).toBe(200);
    expect(res.body.data.termsReceived).toBe(0);
  });

  it('GET /:context/on-device-ai/config — returns recommended config', async () => {
    const res = await request(app).get('/api/personal/on-device-ai/config');

    expect(res.status).toBe(200);
    expect(res.body.data.recommendedComplexityThreshold).toBe(0.5);
    expect(res.body.data.enabledProviders).toBeInstanceOf(Array);
    expect(res.body.data.plannedProviders).toBeInstanceOf(Array);
  });

  it('GET /:context/on-device-ai/config — includes cache TTL', async () => {
    const res = await request(app).get('/api/work/on-device-ai/config');

    expect(res.status).toBe(200);
    expect(res.body.data.cacheTTLMs).toBe(30 * 60 * 1000);
  });
});
