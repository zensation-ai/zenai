/**
 * Agent Evolution Route Tests
 *
 * Tests feedback, performance, tuning, and specialization profile endpoints.
 */

import express from 'express';
import request from 'supertest';
import { agentEvolutionRouter } from '../../../routes/agent-evolution';
import { errorHandler } from '../../../middleware/errorHandler';

// Mock auth
jest.mock('../../../middleware/auth', () => ({
  apiKeyAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireScope: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const mockRecordFeedback = jest.fn();
const mockRecordUserRating = jest.fn();
const mockGetStrategyPerformance = jest.fn();
const mockGetAgentPerformance = jest.fn();
const mockGetBestStrategy = jest.fn();

jest.mock('../../../services/agents/agent-feedback', () => ({
  recordFeedback: (...args: unknown[]) => mockRecordFeedback(...args),
  recordUserRating: (...args: unknown[]) => mockRecordUserRating(...args),
  getStrategyPerformance: (...args: unknown[]) => mockGetStrategyPerformance(...args),
  getAgentPerformance: (...args: unknown[]) => mockGetAgentPerformance(...args),
  getBestStrategy: (...args: unknown[]) => mockGetBestStrategy(...args),
}));

const mockGenerateRecommendations = jest.fn();
const mockApplyRecommendation = jest.fn();
const mockGetOptimizedConfig = jest.fn();

jest.mock('../../../services/agents/agent-auto-tuner', () => ({
  generateRecommendations: (...args: unknown[]) => mockGenerateRecommendations(...args),
  applyRecommendation: (...args: unknown[]) => mockApplyRecommendation(...args),
  getOptimizedConfig: (...args: unknown[]) => mockGetOptimizedConfig(...args),
}));

const mockGetProfile = jest.fn();
const mockListProfiles = jest.fn();

jest.mock('../../../services/agents/agent-specialization', () => ({
  getProfile: (...args: unknown[]) => mockGetProfile(...args),
  listProfiles: (...args: unknown[]) => mockListProfiles(...args),
}));

describe('Agent Evolution Routes', () => {
  let app: express.Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api', agentEvolutionRouter);
    app.use(errorHandler);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // --- Feedback ---

  it('POST /agents/feedback — records execution feedback', async () => {
    mockRecordFeedback.mockResolvedValue('fb-123');

    const res = await request(app)
      .post('/api/agents/feedback')
      .send({ execution_id: 'exec-1', strategy: 'research_only' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe('fb-123');
  });

  it('POST /agents/feedback — rejects missing fields', async () => {
    const res = await request(app)
      .post('/api/agents/feedback')
      .send({ execution_id: 'exec-1' });

    expect(res.status).toBe(400);
  });

  it('POST /agents/feedback/:executionId/rate — records user rating', async () => {
    mockRecordUserRating.mockResolvedValue(true);

    const res = await request(app)
      .post('/api/agents/feedback/exec-1/rate')
      .send({ rating: 4 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('POST /agents/feedback/:executionId/rate — rejects invalid rating', async () => {
    const res = await request(app)
      .post('/api/agents/feedback/exec-1/rate')
      .send({ rating: 10 });

    expect(res.status).toBe(400);
  });

  it('POST /agents/feedback/:executionId/rate — returns 404 if not found', async () => {
    mockRecordUserRating.mockResolvedValue(false);

    const res = await request(app)
      .post('/api/agents/feedback/exec-1/rate')
      .send({ rating: 3 });

    expect(res.status).toBe(404);
  });

  // --- Performance ---

  it('GET /agents/performance — returns strategy performance', async () => {
    mockGetStrategyPerformance.mockResolvedValue([{ strategy: 'research_only', avgScore: 0.8 }]);

    const res = await request(app).get('/api/agents/performance?days=7');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(mockGetStrategyPerformance).toHaveBeenCalledWith(7);
  });

  it('GET /agents/performance/:role — returns agent performance', async () => {
    mockGetAgentPerformance.mockResolvedValue({ role: 'researcher', avgScore: 0.9 });

    const res = await request(app).get('/api/agents/performance/researcher');

    expect(res.status).toBe(200);
    expect(res.body.data.role).toBe('researcher');
  });

  it('GET /agents/performance/:role — returns 404 when no data', async () => {
    mockGetAgentPerformance.mockResolvedValue(null);

    const res = await request(app).get('/api/agents/performance/unknown');

    expect(res.status).toBe(404);
  });

  it('GET /agents/best-strategy — returns best strategy', async () => {
    mockGetBestStrategy.mockResolvedValue('parallel_research');

    const res = await request(app).get('/api/agents/best-strategy?taskType=research');

    expect(res.status).toBe(200);
    expect(res.body.data.strategy).toBe('parallel_research');
  });

  it('GET /agents/best-strategy — rejects missing taskType', async () => {
    const res = await request(app).get('/api/agents/best-strategy');

    expect(res.status).toBe(400);
  });

  // --- Tuning ---

  it('GET /agents/tuning/recommendations — returns recommendations', async () => {
    mockGenerateRecommendations.mockResolvedValue([{ agent_role: 'coder', suggestion: 'increase temperature' }]);

    const res = await request(app).get('/api/agents/tuning/recommendations');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it('POST /agents/tuning/apply — applies recommendation', async () => {
    const rec = { agent_role: 'coder', suggestion: 'increase temperature' };
    mockGenerateRecommendations.mockResolvedValue([rec]);
    mockApplyRecommendation.mockResolvedValue(undefined);
    mockGetOptimizedConfig.mockResolvedValue({ temperature: 0.9 });

    const res = await request(app)
      .post('/api/agents/tuning/apply')
      .send({ agent_role: 'coder' });

    expect(res.status).toBe(200);
    expect(res.body.data.config.temperature).toBe(0.9);
  });

  it('POST /agents/tuning/apply — rejects missing agent_role', async () => {
    const res = await request(app)
      .post('/api/agents/tuning/apply')
      .send({});

    expect(res.status).toBe(400);
  });

  it('POST /agents/tuning/apply — returns 404 for unknown role', async () => {
    mockGenerateRecommendations.mockResolvedValue([]);

    const res = await request(app)
      .post('/api/agents/tuning/apply')
      .send({ agent_role: 'unknown' });

    expect(res.status).toBe(404);
  });

  // --- Profiles ---

  it('GET /agents/profiles — lists specialization profiles', async () => {
    mockListProfiles.mockResolvedValue([{ role: 'researcher' }, { role: 'coder' }]);

    const res = await request(app).get('/api/agents/profiles');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
  });

  it('GET /agents/profiles/:role — returns single profile', async () => {
    mockGetProfile.mockResolvedValue({ role: 'researcher', strengths: ['analysis'] });

    const res = await request(app).get('/api/agents/profiles/researcher');

    expect(res.status).toBe(200);
    expect(res.body.data.role).toBe('researcher');
  });
});
