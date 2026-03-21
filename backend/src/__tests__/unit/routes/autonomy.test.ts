/**
 * Autonomy Route Tests
 *
 * Tests the 4-level autonomy dial: suggest, ask, act, auto.
 */

import express from 'express';
import request from 'supertest';
import { autonomyRouter } from '../../../routes/autonomy';
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

const mockGetAllAutonomyLevels = jest.fn();
const mockGetAutonomyLevel = jest.fn();
const mockSetAutonomyLevel = jest.fn();

jest.mock('../../../services/autonomy-config', () => ({
  getAllAutonomyLevels: (...args: unknown[]) => mockGetAllAutonomyLevels(...args),
  getAutonomyLevel: (...args: unknown[]) => mockGetAutonomyLevel(...args),
  setAutonomyLevel: (...args: unknown[]) => mockSetAutonomyLevel(...args),
  isValidAutonomyLevel: (l: string) => ['suggest', 'ask', 'act', 'auto'].includes(l),
}));

const mockGetEventHistory = jest.fn();

jest.mock('../../../services/event-system', () => ({
  getEventHistory: (...args: unknown[]) => mockGetEventHistory(...args),
}));

jest.mock('../../../utils/database-context', () => ({
  isValidContext: (ctx: string) => ['personal', 'work', 'learning', 'creative'].includes(ctx),
  queryContext: jest.fn(),
}));

describe('Autonomy Routes', () => {
  let app: express.Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api', autonomyRouter);
    app.use(errorHandler);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('GET /:context/autonomy/levels — returns autonomy levels', async () => {
    mockGetAllAutonomyLevels.mockReturnValue({
      notify: 'suggest',
      take_action: 'ask',
    });

    const res = await request(app).get('/api/personal/autonomy/levels');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('notify');
  });

  it('GET /:context/autonomy/levels — rejects invalid context', async () => {
    const res = await request(app).get('/api/invalid/autonomy/levels');

    expect(res.status).toBe(400);
  });

  it('PUT /:context/autonomy/levels — updates autonomy level', async () => {
    mockSetAutonomyLevel.mockReturnValue(undefined);
    mockGetAutonomyLevel.mockReturnValue('act');

    const res = await request(app)
      .put('/api/personal/autonomy/levels')
      .send({ actionType: 'take_action', level: 'act' });

    expect(res.status).toBe(200);
    expect(res.body.data.level).toBe('act');
  });

  it('PUT /:context/autonomy/levels — rejects invalid actionType', async () => {
    const res = await request(app)
      .put('/api/personal/autonomy/levels')
      .send({ actionType: 'invalid_type', level: 'suggest' });

    expect(res.status).toBe(400);
  });

  it('PUT /:context/autonomy/levels — rejects invalid level', async () => {
    const res = await request(app)
      .put('/api/personal/autonomy/levels')
      .send({ actionType: 'notify', level: 'invalid' });

    expect(res.status).toBe(400);
  });

  it('PUT /:context/autonomy/levels — rejects missing actionType', async () => {
    const res = await request(app)
      .put('/api/personal/autonomy/levels')
      .send({ level: 'suggest' });

    expect(res.status).toBe(400);
  });

  it('GET /:context/autonomy/history — returns event history', async () => {
    mockGetEventHistory.mockResolvedValue({
      events: [
        { eventType: 'proactive.suggestion', decision: 'notify' },
        { eventType: 'user.login', decision: null },
      ],
    });

    const res = await request(app).get('/api/personal/autonomy/history');

    expect(res.status).toBe(200);
    // Filters to proactive events only when no eventType specified
    expect(res.body.data).toHaveLength(1);
  });

  it('GET /:context/autonomy/history — passes eventType filter', async () => {
    mockGetEventHistory.mockResolvedValue({
      events: [{ eventType: 'user.login' }],
    });

    const res = await request(app).get('/api/personal/autonomy/history?eventType=user.login');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });
});
