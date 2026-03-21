/**
 * Business Narrative Route Tests
 *
 * Tests daily digest, weekly report, anomalies, KPI CRUD, and trends.
 */

import express from 'express';
import request from 'supertest';
import { businessNarrativeRouter } from '../../../routes/business-narrative';
import { errorHandler } from '../../../middleware/errorHandler';

jest.mock('../../../middleware/auth', () => ({
  apiKeyAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireScope: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

jest.mock('../../../middleware/validate-params', () => ({
  requireUUID: () => (_req: unknown, _res: unknown, next: () => void) => next(),
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

const mockGenerateDailyDigest = jest.fn();
const mockGenerateWeeklyReport = jest.fn();
const mockDetectAllAnomalies = jest.fn();
const mockListKPIs = jest.fn();
const mockCreateKPI = jest.fn();
const mockUpdateKPI = jest.fn();
const mockDeleteKPI = jest.fn();
const mockGetTrends = jest.fn();

jest.mock('../../../services/business-narrative', () => ({
  generateDailyDigest: (...args: unknown[]) => mockGenerateDailyDigest(...args),
  generateWeeklyReport: (...args: unknown[]) => mockGenerateWeeklyReport(...args),
  detectAllAnomalies: (...args: unknown[]) => mockDetectAllAnomalies(...args),
  listKPIs: (...args: unknown[]) => mockListKPIs(...args),
  createKPI: (...args: unknown[]) => mockCreateKPI(...args),
  updateKPI: (...args: unknown[]) => mockUpdateKPI(...args),
  deleteKPI: (...args: unknown[]) => mockDeleteKPI(...args),
  getTrends: (...args: unknown[]) => mockGetTrends(...args),
}));

describe('Business Narrative Routes', () => {
  let app: express.Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api', businessNarrativeRouter);
    app.use(errorHandler);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('GET /:context/business-narrative/daily — returns daily digest', async () => {
    mockGenerateDailyDigest.mockResolvedValue({ summary: 'All good', highlights: [] });

    const res = await request(app).get('/api/work/business-narrative/daily');

    expect(res.status).toBe(200);
    expect(res.body.data.summary).toBe('All good');
  });

  it('GET /:context/business-narrative/daily — rejects invalid context', async () => {
    const res = await request(app).get('/api/invalid/business-narrative/daily');

    expect(res.status).toBe(400);
  });

  it('GET /:context/business-narrative/weekly — returns weekly report', async () => {
    mockGenerateWeeklyReport.mockResolvedValue({ sections: [] });

    const res = await request(app).get('/api/work/business-narrative/weekly');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('GET /:context/business-narrative/anomalies — returns anomalies', async () => {
    mockDetectAllAnomalies.mockResolvedValue([{ type: 'spike', metric: 'revenue' }]);

    const res = await request(app).get('/api/work/business-narrative/anomalies');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it('GET /:context/business-narrative/kpis — lists KPIs', async () => {
    mockListKPIs.mockResolvedValue([{ id: 'kpi-1', name: 'Revenue' }]);

    const res = await request(app).get('/api/work/business-narrative/kpis');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it('POST /:context/business-narrative/kpis — creates KPI', async () => {
    mockCreateKPI.mockResolvedValue({ id: 'kpi-new', name: 'Growth' });

    const res = await request(app)
      .post('/api/work/business-narrative/kpis')
      .send({
        name: 'Growth',
        formula: { sources: ['revenue'], aggregation: 'sum' },
      });

    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe('Growth');
  });

  it('POST /:context/business-narrative/kpis — rejects missing name', async () => {
    const res = await request(app)
      .post('/api/work/business-narrative/kpis')
      .send({ formula: { sources: ['x'], aggregation: 'sum' } });

    expect(res.status).toBe(400);
  });

  it('POST /:context/business-narrative/kpis — rejects invalid formula', async () => {
    const res = await request(app)
      .post('/api/work/business-narrative/kpis')
      .send({ name: 'Test', formula: {} });

    expect(res.status).toBe(400);
  });

  it('DELETE /:context/business-narrative/kpis/:id — deletes KPI', async () => {
    mockDeleteKPI.mockResolvedValue(true);

    const res = await request(app).delete('/api/work/business-narrative/kpis/kpi-1');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('GET /:context/business-narrative/trends — returns trends', async () => {
    mockGetTrends.mockResolvedValue({ daily: [] });

    const res = await request(app).get('/api/work/business-narrative/trends?days=14');

    expect(res.status).toBe(200);
    expect(mockGetTrends).toHaveBeenCalledWith('work', 'user-123', 14);
  });

  it('GET /:context/business-narrative/daily — handles service error gracefully', async () => {
    mockGenerateDailyDigest.mockRejectedValue(new Error('Service down'));

    const res = await request(app).get('/api/work/business-narrative/daily');

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});
