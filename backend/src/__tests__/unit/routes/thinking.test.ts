/**
 * Thinking Routes Tests - Phase 46
 *
 * Tests extended thinking chain management, feedback, and statistics.
 */

import express from 'express';
import request from 'supertest';
import { errorHandler } from '../../../middleware/errorHandler';

// Mock auth
jest.mock('../../../middleware/auth', () => ({
  apiKeyAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireScope: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

// Mock validate-params
jest.mock('../../../middleware/validate-params', () => ({
  requireUUID: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

// Mock database-context
jest.mock('../../../utils/database-context', () => ({
  isValidContext: jest.fn().mockReturnValue(true),
  queryContext: jest.fn(),
}));

// Mock validation
jest.mock('../../../utils/validation', () => ({
  validateContextParam: jest.fn((ctx: string) => ctx),
}));

// Mock thinking-budget service
const mockRecordFeedback = jest.fn().mockResolvedValue(undefined);
const mockGetStats = jest.fn().mockResolvedValue({
  totalChains: 10,
  avgQuality: 4.2,
  byTaskType: {},
});
jest.mock('../../../services/claude/thinking-budget', () => ({
  recordThinkingFeedback: (...args: unknown[]) => mockRecordFeedback(...args),
  getThinkingStats: (...args: unknown[]) => mockGetStats(...args),
}));

// Mock thinking-management service
const mockGetStrategyHistory = jest.fn().mockResolvedValue([
  { taskType: 'analysis', avgBudget: 8000, avgQuality: 4.1, count: 5 },
]);
const mockPersistStrategies = jest.fn().mockResolvedValue(undefined);
const mockGetChainById = jest.fn().mockResolvedValue({
  id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  taskType: 'analysis',
  budgetTokens: 8000,
  usedTokens: 6500,
  qualityRating: 4,
});
const mockDeleteChain = jest.fn().mockResolvedValue(undefined);

jest.mock('../../../services/thinking-management', () => ({
  getStrategyHistory: (...args: unknown[]) => mockGetStrategyHistory(...args),
  persistStrategies: (...args: unknown[]) => mockPersistStrategies(...args),
  getThinkingChainById: (...args: unknown[]) => mockGetChainById(...args),
  deleteThinkingChain: (...args: unknown[]) => mockDeleteChain(...args),
}));

describe('Thinking Routes', () => {
  let app: express.Express;

  beforeAll(async () => {
    // Import after mocks are set up
    const { thinkingRouter } = await import('../../../routes/thinking');
    app = express();
    app.use(express.json());
    app.use('/api', thinkingRouter);
    app.use(errorHandler);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ===========================================
  // Feedback
  // ===========================================
  describe('POST /api/:context/thinking/feedback', () => {
    it('should record thinking feedback', async () => {
      const res = await request(app)
        .post('/api/personal/thinking/feedback')
        .send({ chainId: 'chain-1', wasHelpful: true, qualityRating: 4, feedbackText: 'Good' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockRecordFeedback).toHaveBeenCalledWith('chain-1', 'personal', expect.objectContaining({
        wasHelpful: true,
        qualityRating: 4,
      }));
    });

    it('should return 400 without chainId', async () => {
      const res = await request(app)
        .post('/api/personal/thinking/feedback')
        .send({ qualityRating: 3 });
      expect(res.status).toBe(400);
    });

    it('should return 400 with invalid qualityRating', async () => {
      const res = await request(app)
        .post('/api/personal/thinking/feedback')
        .send({ chainId: 'chain-1', qualityRating: 0 });
      expect(res.status).toBe(400);
    });

    it('should return 400 with qualityRating > 5', async () => {
      const res = await request(app)
        .post('/api/personal/thinking/feedback')
        .send({ chainId: 'chain-1', qualityRating: 6 });
      expect(res.status).toBe(400);
    });

    it('should reject invalid context', async () => {
      const { isValidContext } = require('../../../utils/database-context');
      isValidContext.mockReturnValueOnce(false);

      const res = await request(app)
        .post('/api/invalid/thinking/feedback')
        .send({ chainId: 'c1', qualityRating: 3 });
      expect(res.status).toBe(400);
    });
  });

  // ===========================================
  // Statistics
  // ===========================================
  describe('GET /api/:context/thinking/stats', () => {
    it('should return thinking statistics', async () => {
      const res = await request(app).get('/api/personal/thinking/stats');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.totalChains).toBe(10);
    });
  });

  // ===========================================
  // Strategies
  // ===========================================
  describe('GET /api/:context/thinking/strategies', () => {
    it('should return strategy performance', async () => {
      const res = await request(app).get('/api/personal/thinking/strategies');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
    });
  });

  describe('POST /api/:context/thinking/strategies/persist', () => {
    it('should persist strategies', async () => {
      const res = await request(app).post('/api/personal/thinking/strategies/persist');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockPersistStrategies).toHaveBeenCalledWith('personal');
    });
  });

  // ===========================================
  // Thinking Chains
  // ===========================================
  describe('GET /api/:context/thinking/chains/:id', () => {
    it('should return a thinking chain', async () => {
      const res = await request(app).get('/api/personal/thinking/chains/a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.taskType).toBe('analysis');
    });

    it('should return 404 for non-existent chain', async () => {
      mockGetChainById.mockResolvedValueOnce(null);
      const res = await request(app).get('/api/personal/thinking/chains/00000000-0000-4000-8000-000000000000');
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/:context/thinking/chains/:id', () => {
    it('should delete a thinking chain', async () => {
      const res = await request(app).delete('/api/personal/thinking/chains/a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockDeleteChain).toHaveBeenCalledWith('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'personal');
    });
  });
});
