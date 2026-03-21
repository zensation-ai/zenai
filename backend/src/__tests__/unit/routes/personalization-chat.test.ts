/**
 * Personalization Chat Route Tests
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

const mockQueryContext = jest.fn();
jest.mock('../../../utils/database-context', () => ({
  queryContext: (...args: unknown[]) => mockQueryContext(...args),
}));

jest.mock('../../../services/openai', () => ({
  generateOpenAIResponse: jest.fn().mockResolvedValue('AI response text'),
  isOpenAIAvailable: jest.fn(() => false),
}));

jest.mock('axios', () => ({
  default: { post: jest.fn().mockRejectedValue(new Error('Ollama not available')) },
  post: jest.fn().mockRejectedValue(new Error('Ollama not available')),
}));

jest.mock('../../../services/evolution-analytics', () => ({
  recordLearningEvent: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../../services/personal-facts-bridge', () => ({
  invalidatePersonalFactsCache: jest.fn(),
}));

jest.mock('uuid', () => ({
  v4: jest.fn(() => '22222222-2222-2222-2222-222222222222'),
}));

import { personalizationChatRouter } from '../../../routes/personalization-chat';
import { errorHandler } from '../../../middleware/errorHandler';

describe('Personalization Chat Routes', () => {
  let app: express.Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/personalization', personalizationChatRouter);
    app.use(errorHandler);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryContext.mockReset();
  });

  describe('POST /api/personalization/chat', () => {
    it('should accept a message and return response', async () => {
      // Store user message
      mockQueryContext.mockResolvedValueOnce({ rows: [] });
      // Get history
      mockQueryContext.mockResolvedValueOnce({ rows: [{ role: 'user', message: 'Hello' }] });
      // Get existing facts
      mockQueryContext.mockResolvedValueOnce({ rows: [] });
      // Generate AI response - topic query
      mockQueryContext.mockResolvedValueOnce({ rows: [{ topic: 'basic_info', completion_level: 0.2 }] });
      // getNextQuestion - asked messages
      mockQueryContext.mockResolvedValueOnce({ rows: [] });
      // Update topic stats
      mockQueryContext.mockResolvedValueOnce({ rows: [] });
      // Store AI response
      mockQueryContext.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .post('/api/personalization/chat')
        .send({ message: 'Ich bin Alexander' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('sessionId');
      expect(res.body.data).toHaveProperty('response');
    });

    it('should reject missing message', async () => {
      const res = await request(app)
        .post('/api/personalization/chat')
        .send({});

      expect(res.status).toBe(400);
    });

    it('should reject message that is too long', async () => {
      const longMessage = 'a'.repeat(10001);
      const res = await request(app)
        .post('/api/personalization/chat')
        .send({ message: longMessage });

      expect(res.status).toBe(400);
    });

    it('should reject invalid session ID format', async () => {
      const res = await request(app)
        .post('/api/personalization/chat')
        .send({ message: 'test', sessionId: 'not-a-uuid' });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/personalization/start', () => {
    it('should return initial question with session ID', async () => {
      // Get least explored topic
      mockQueryContext.mockResolvedValueOnce({ rows: [{ topic: 'basic_info' }] });
      // Get asked messages for getNextQuestion
      mockQueryContext.mockResolvedValueOnce({ rows: [] });
      // Store greeting
      mockQueryContext.mockResolvedValueOnce({ rows: [] });
      // Update topic stats
      mockQueryContext.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).get('/api/personalization/start');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('sessionId');
      expect(res.body.data).toHaveProperty('message');
      expect(res.body.data).toHaveProperty('currentTopic');
    });
  });

  describe('GET /api/personalization/facts', () => {
    it('should return grouped facts', async () => {
      mockQueryContext.mockResolvedValue({
        rows: [
          { id: '1', category: 'basic_info', fact_key: 'name', fact_value: 'Alex', confidence: '0.9', source: 'chat', created_at: new Date() },
        ],
      });

      const res = await request(app).get('/api/personalization/facts');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.totalFacts).toBe(1);
      expect(res.body.data.factsByCategory).toHaveProperty('basic_info');
    });

    it('should filter by category', async () => {
      mockQueryContext.mockResolvedValue({ rows: [] });

      const res = await request(app).get('/api/personalization/facts?category=personality');

      expect(res.status).toBe(200);
      expect(mockQueryContext).toHaveBeenCalledWith(
        'personal',
        expect.stringContaining('WHERE category = $1'),
        ['personality']
      );
    });
  });

  describe('GET /api/personalization/progress', () => {
    it('should return learning progress', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [{ topic: 'basic_info', questions_asked: 3, completion_level: '0.5', last_asked_at: null }],
      });
      mockQueryContext.mockResolvedValueOnce({
        rows: [{ category: 'basic_info', count: '3' }],
      });

      const res = await request(app).get('/api/personalization/progress');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('overallProgress');
      expect(res.body.data).toHaveProperty('totalFactsLearned');
    });
  });

  describe('DELETE /api/personalization/facts/:id', () => {
    it('should delete a fact', async () => {
      mockQueryContext.mockResolvedValue({ rows: [{ id: '11111111-1111-4111-a111-111111111111' }] });

      const res = await request(app)
        .delete('/api/personalization/facts/11111111-1111-4111-a111-111111111111');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should reject invalid UUID', async () => {
      const res = await request(app).delete('/api/personalization/facts/bad-id');
      expect(res.status).toBe(400);
    });

    it('should return 404 for non-existent fact', async () => {
      mockQueryContext.mockResolvedValue({ rows: [] });

      const res = await request(app)
        .delete('/api/personalization/facts/11111111-1111-4111-a111-111111111111');

      expect(res.status).toBe(404);
    });
  });
});
