/**
 * Digital Twin Route Tests
 *
 * Tests profile CRUD, radar scores, evolution, correction, export, refresh.
 */

import express from 'express';
import request from 'supertest';
import { digitalTwinRouter } from '../../../routes/digital-twin';
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

jest.mock('../../../utils/database-context', () => ({
  isValidContext: (ctx: string) => ['personal', 'work', 'learning', 'creative'].includes(ctx),
}));

const mockGetProfile = jest.fn();
const mockUpsertProfileSection = jest.fn();
const mockGetRadarScores = jest.fn();
const mockGetEvolution = jest.fn();
const mockCreateSnapshot = jest.fn();
const mockSubmitCorrection = jest.fn();
const mockAggregateProfile = jest.fn();
const mockExportProfile = jest.fn();

jest.mock('../../../services/digital-twin', () => ({
  getProfile: (...args: unknown[]) => mockGetProfile(...args),
  upsertProfileSection: (...args: unknown[]) => mockUpsertProfileSection(...args),
  getRadarScores: (...args: unknown[]) => mockGetRadarScores(...args),
  getEvolution: (...args: unknown[]) => mockGetEvolution(...args),
  createSnapshot: (...args: unknown[]) => mockCreateSnapshot(...args),
  submitCorrection: (...args: unknown[]) => mockSubmitCorrection(...args),
  aggregateProfile: (...args: unknown[]) => mockAggregateProfile(...args),
  exportProfile: (...args: unknown[]) => mockExportProfile(...args),
  isValidSection: (s: string) =>
    ['personality', 'expertise', 'work_patterns', 'interests', 'goals', 'preferences'].includes(s),
  ProfileSection: {},
}));

describe('Digital Twin Routes', () => {
  let app: express.Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api', digitalTwinRouter);
    app.use(errorHandler);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('GET /:context/digital-twin/profile — returns profile', async () => {
    mockGetProfile.mockResolvedValue({ sections: { personality: {} } });

    const res = await request(app).get('/api/personal/digital-twin/profile');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('sections');
  });

  it('GET /:context/digital-twin/profile — rejects invalid context', async () => {
    const res = await request(app).get('/api/invalid/digital-twin/profile');

    expect(res.status).toBe(400);
  });

  it('PUT /:context/digital-twin/profile — upserts profile section', async () => {
    mockUpsertProfileSection.mockResolvedValue({ section: 'personality', data: { trait: 'curious' } });

    const res = await request(app)
      .put('/api/personal/digital-twin/profile')
      .send({ section: 'personality', data: { trait: 'curious' } });

    expect(res.status).toBe(200);
    expect(res.body.data.section).toBe('personality');
  });

  it('PUT /:context/digital-twin/profile — rejects invalid section', async () => {
    const res = await request(app)
      .put('/api/personal/digital-twin/profile')
      .send({ section: 'invalid_section', data: { x: 1 } });

    expect(res.status).toBe(400);
  });

  it('PUT /:context/digital-twin/profile — rejects non-object data', async () => {
    const res = await request(app)
      .put('/api/personal/digital-twin/profile')
      .send({ section: 'personality', data: 'not-an-object' });

    expect(res.status).toBe(400);
  });

  it('GET /:context/digital-twin/radar — returns radar scores', async () => {
    mockGetRadarScores.mockResolvedValue({ creativity: 8, focus: 7 });

    const res = await request(app).get('/api/personal/digital-twin/radar');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('creativity');
  });

  it('GET /:context/digital-twin/evolution — returns evolution snapshots', async () => {
    mockGetEvolution.mockResolvedValue([{ week: 1, score: 75 }]);

    const res = await request(app).get('/api/personal/digital-twin/evolution?limit=5');

    expect(res.status).toBe(200);
    expect(mockGetEvolution).toHaveBeenCalledWith('personal', 'user-123', 5);
  });

  it('POST /:context/digital-twin/correction — submits correction', async () => {
    mockSubmitCorrection.mockResolvedValue({ id: 'corr-1' });

    const res = await request(app)
      .post('/api/personal/digital-twin/correction')
      .send({ section: 'expertise', corrected_value: { skill: 'TypeScript' }, reason: 'outdated' });

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe('corr-1');
  });

  it('POST /:context/digital-twin/correction — rejects missing section', async () => {
    const res = await request(app)
      .post('/api/personal/digital-twin/correction')
      .send({ corrected_value: { x: 1 } });

    expect(res.status).toBe(400);
  });

  it('GET /:context/digital-twin/export — exports profile', async () => {
    mockExportProfile.mockResolvedValue({ format: 'json', data: {} });

    const res = await request(app).get('/api/personal/digital-twin/export');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('format');
  });

  it('POST /:context/digital-twin/refresh — refreshes profile', async () => {
    mockAggregateProfile.mockResolvedValue(['personality', 'expertise']);
    mockCreateSnapshot.mockResolvedValue({ id: 'snap-1' });

    const res = await request(app).post('/api/personal/digital-twin/refresh');

    expect(res.status).toBe(200);
    expect(res.body.data.sections_updated).toBe(2);
    expect(res.body.data.snapshot_id).toBe('snap-1');
  });
});
