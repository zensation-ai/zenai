/**
 * RAG Analytics Route Tests - Phase 47
 *
 * Tests RAG feedback recording, analytics, strategy performance, and query history.
 */

import express from 'express';
import request from 'supertest';
import { errorHandler } from '../../../middleware/errorHandler';

// Mock auth
jest.mock('../../../middleware/auth', () => ({
  apiKeyAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireScope: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

// Mock validation
jest.mock('../../../utils/validation', () => ({
  validateContextParam: jest.fn((ctx: string) => ctx),
}));

// Mock database-context
jest.mock('../../../utils/database-context', () => ({
  isValidContext: jest.fn().mockReturnValue(true),
}));

// Mock rag-feedback service
const mockRecordFeedback = jest.fn();
const mockGetAnalytics = jest.fn();
const mockGetStrategyPerformance = jest.fn();
const mockGetQueryHistory = jest.fn();

jest.mock('../../../services/rag-feedback', () => ({
  recordRAGFeedback: (...args: unknown[]) => mockRecordFeedback(...args),
  getRAGAnalytics: (...args: unknown[]) => mockGetAnalytics(...args),
  getRAGStrategyPerformance: (...args: unknown[]) => mockGetStrategyPerformance(...args),
  getRAGQueryHistory: (...args: unknown[]) => mockGetQueryHistory(...args),
}));

// Mock logger
jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

describe('RAG Analytics Routes', () => {
  let app: express.Express;

  beforeAll(async () => {
    const { ragAnalyticsRouter } = await import('../../../routes/rag-analytics');
    app = express();
    app.use(express.json());
    app.use('/api', ragAnalyticsRouter);
    app.use(errorHandler);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockRecordFeedback.mockResolvedValue('fb-123');
    mockGetAnalytics.mockResolvedValue({ totalQueries: 100, avgConfidence: 0.85 });
    mockGetStrategyPerformance.mockResolvedValue([
      { strategy: 'semantic', avgConfidence: 0.9, count: 50 },
    ]);
    mockGetQueryHistory.mockResolvedValue([
      { id: 'q1', queryText: 'test query', confidence: 0.9 },
    ]);
  });

  // ===========================================
  // Feedback
  // ===========================================
  describe('POST /api/:context/rag/feedback', () => {
    it('should record RAG feedback', async () => {
      const res = await request(app)
        .post('/api/personal/rag/feedback')
        .send({ queryText: 'How does HiMeS work?', wasHelpful: true, relevanceRating: 4 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe('fb-123');
      expect(mockRecordFeedback).toHaveBeenCalledWith('personal', expect.objectContaining({
        queryText: 'How does HiMeS work?',
        wasHelpful: true,
        relevanceRating: 4,
      }));
    });

    it('should return 400 without queryText', async () => {
      const res = await request(app)
        .post('/api/personal/rag/feedback')
        .send({ wasHelpful: true });

      expect(res.status).toBe(400);
    });

    it('should return 400 without wasHelpful', async () => {
      const res = await request(app)
        .post('/api/personal/rag/feedback')
        .send({ queryText: 'test' });

      expect(res.status).toBe(400);
    });

    it('should return 400 with non-boolean wasHelpful', async () => {
      const res = await request(app)
        .post('/api/personal/rag/feedback')
        .send({ queryText: 'test', wasHelpful: 'yes' });

      expect(res.status).toBe(400);
    });

    it('should reject invalid context', async () => {
      const { isValidContext } = require('../../../utils/database-context');
      isValidContext.mockReturnValueOnce(false);

      const res = await request(app)
        .post('/api/invalid/rag/feedback')
        .send({ queryText: 'test', wasHelpful: true });
      expect(res.status).toBe(400);
    });
  });

  // ===========================================
  // Analytics
  // ===========================================
  describe('GET /api/:context/rag/analytics', () => {
    it('should return RAG analytics with default days', async () => {
      const res = await request(app).get('/api/personal/rag/analytics');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.totalQueries).toBe(100);
      expect(mockGetAnalytics).toHaveBeenCalledWith('personal', 30);
    });

    it('should accept days parameter', async () => {
      const res = await request(app).get('/api/personal/rag/analytics?days=7');
      expect(res.status).toBe(200);
      expect(mockGetAnalytics).toHaveBeenCalledWith('personal', 7);
    });
  });

  // ===========================================
  // Strategies
  // ===========================================
  describe('GET /api/:context/rag/strategies', () => {
    it('should return strategy performance', async () => {
      const res = await request(app).get('/api/personal/rag/strategies');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].strategy).toBe('semantic');
    });

    it('should accept days parameter', async () => {
      const res = await request(app).get('/api/personal/rag/strategies?days=14');
      expect(res.status).toBe(200);
      expect(mockGetStrategyPerformance).toHaveBeenCalledWith('personal', 14);
    });
  });

  // ===========================================
  // History
  // ===========================================
  describe('GET /api/:context/rag/history', () => {
    it('should return query history with default limit', async () => {
      const res = await request(app).get('/api/personal/rag/history');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(mockGetQueryHistory).toHaveBeenCalledWith('personal', 50);
    });

    it('should accept limit parameter', async () => {
      const res = await request(app).get('/api/personal/rag/history?limit=10');
      expect(res.status).toBe(200);
      expect(mockGetQueryHistory).toHaveBeenCalledWith('personal', 10);
    });
  });
});
