/**
 * Topic Enhancement Route Tests
 */

import express from 'express';
import request from 'supertest';

jest.mock('../../../middleware/auth', () => ({
  apiKeyAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireScope: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

jest.mock('../../../utils/logger', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('../../../utils/database-context', () => ({
  queryContext: jest.fn(),
  isValidContext: jest.fn((ctx: string) => ['personal', 'work', 'learning', 'creative'].includes(ctx)),
  AIContext: {},
}));

jest.mock('../../../utils/validation', () => ({
  isValidUUID: jest.fn((id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)),
  toFloatBounded: jest.fn((_val: unknown, def: number) => def),
  toIntBounded: jest.fn((_val: unknown, def: number) => def),
}));

const mockGetTopicsWithKeywords = jest.fn();
const mockGetAllTopicQualityMetrics = jest.fn();
const mockCalculateTopicQuality = jest.fn();
const mockFindSimilarTopics = jest.fn();
const mockFindBestTopicForIdea = jest.fn();
const mockAutoAssignTopicToIdea = jest.fn();
const mockGetTopicContextForChat = jest.fn();
const mockFormatTopicContextForPrompt = jest.fn();

jest.mock('../../../services/topic-enhancement', () => ({
  getTopicsWithKeywords: (...args: unknown[]) => mockGetTopicsWithKeywords(...args),
  calculateTopicQuality: (...args: unknown[]) => mockCalculateTopicQuality(...args),
  getAllTopicQualityMetrics: (...args: unknown[]) => mockGetAllTopicQualityMetrics(...args),
  findBestTopicForIdea: (...args: unknown[]) => mockFindBestTopicForIdea(...args),
  autoAssignTopicToIdea: (...args: unknown[]) => mockAutoAssignTopicToIdea(...args),
  findSimilarTopics: (...args: unknown[]) => mockFindSimilarTopics(...args),
  getTopicContextForChat: (...args: unknown[]) => mockGetTopicContextForChat(...args),
  formatTopicContextForPrompt: (...args: unknown[]) => mockFormatTopicContextForPrompt(...args),
}));

import { topicEnhancementRouter } from '../../../routes/topic-enhancement';
import { errorHandler } from '../../../middleware/errorHandler';

describe('Topic Enhancement Routes', () => {
  let app: express.Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api', topicEnhancementRouter);
    app.use(errorHandler);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ---- Enhanced Topics ----

  describe('GET /api/topics/enhanced', () => {
    it('should return enhanced topics for a valid context', async () => {
      mockGetTopicsWithKeywords.mockResolvedValueOnce([
        { id: 't1', name: 'Tech', keywords: ['ai', 'ml'], idea_count: 5 },
      ]);

      const res = await request(app).get('/api/topics/enhanced?context=personal');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.topics).toHaveLength(1);
      expect(res.body.data.count).toBe(1);
    });

    it('should return 400 for invalid context', async () => {
      const res = await request(app).get('/api/topics/enhanced?context=invalid');

      expect(res.status).toBe(400);
    });

    it('should return empty array when no topics exist', async () => {
      mockGetTopicsWithKeywords.mockResolvedValueOnce([]);

      const res = await request(app).get('/api/topics/enhanced?context=work');

      expect(res.status).toBe(200);
      expect(res.body.data.topics).toHaveLength(0);
      expect(res.body.data.count).toBe(0);
    });
  });

  // ---- Quality Metrics ----

  describe('GET /api/topics/quality', () => {
    it('should return quality metrics with summary', async () => {
      mockGetAllTopicQualityMetrics.mockResolvedValueOnce([
        { topicId: 't1', overallQuality: 0.8, coherence: 0.9, separation: 0.7, density: 0.6, stability: 0.8 },
        { topicId: 't2', overallQuality: 0.3, coherence: 0.2, separation: 0.4, density: 0.3, stability: 0.3 },
      ]);

      const res = await request(app).get('/api/topics/quality?context=personal');

      expect(res.status).toBe(200);
      expect(res.body.data.summary.topicCount).toBe(2);
      expect(res.body.data.summary.highQualityTopics).toBe(1);
      expect(res.body.data.summary.lowQualityTopics).toBe(1);
    });

    it('should return 400 for missing context', async () => {
      const res = await request(app).get('/api/topics/quality');

      expect(res.status).toBe(400);
    });
  });

  // ---- Single Topic Quality ----

  describe('GET /api/topics/:id/quality', () => {
    it('should return quality for a specific topic', async () => {
      mockCalculateTopicQuality.mockResolvedValueOnce({
        overallQuality: 0.85,
        coherence: 0.9,
        separation: 0.8,
        density: 0.7,
        stability: 0.9,
      });

      const res = await request(app)
        .get('/api/topics/550e8400-e29b-41d4-a716-446655440000/quality?context=personal');

      expect(res.status).toBe(200);
      expect(res.body.data.qualityLevel).toBe('excellent');
      expect(res.body.data.recommendations).toBeDefined();
    });

    it('should return 404 for non-existent topic', async () => {
      mockCalculateTopicQuality.mockResolvedValueOnce(null);

      const res = await request(app)
        .get('/api/topics/550e8400-e29b-41d4-a716-446655440000/quality?context=personal');

      expect(res.status).toBe(404);
    });

    it('should return 400 for invalid topic ID', async () => {
      const res = await request(app).get('/api/topics/not-uuid/quality?context=personal');

      expect(res.status).toBe(400);
    });
  });

  // ---- Similar Topics ----

  describe('GET /api/topics/similar', () => {
    it('should return similar topics', async () => {
      mockFindSimilarTopics.mockResolvedValueOnce([
        { topic1: 't1', topic2: 't2', similarity: 0.85, suggestMerge: true },
      ]);

      const res = await request(app).get('/api/topics/similar?context=personal');

      expect(res.status).toBe(200);
      expect(res.body.data.mergeSuggestionCount).toBe(1);
    });
  });

  // ---- Assign Topic ----

  describe('POST /api/topics/assign/:ideaId', () => {
    it('should assign a topic to an idea', async () => {
      mockFindBestTopicForIdea.mockResolvedValueOnce({
        topicId: 't1',
        topicName: 'Tech',
        confidence: 0.9,
      });

      const res = await request(app)
        .post('/api/topics/assign/550e8400-e29b-41d4-a716-446655440000')
        .send({ context: 'personal' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.assignment).toBeDefined();
      expect(res.body.data.assignment.topicId).toBe('t1');
    });

    it('should return assigned=false when no suitable topic found', async () => {
      mockFindBestTopicForIdea.mockResolvedValueOnce(null);

      const res = await request(app)
        .post('/api/topics/assign/550e8400-e29b-41d4-a716-446655440000')
        .send({ context: 'personal' });

      expect(res.status).toBe(200);
      expect(res.body.data.assigned).toBe(false);
    });

    it('should return 400 for invalid idea ID', async () => {
      const res = await request(app)
        .post('/api/topics/assign/not-uuid')
        .send({ context: 'personal' });

      expect(res.status).toBe(400);
    });
  });
});
