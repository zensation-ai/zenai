/**
 * Unified Assistant Route Tests
 *
 * Tests the unified assistant overlay endpoints:
 * query processing, suggestions, action execution, and history.
 */

import express from 'express';
import request from 'supertest';

jest.mock('../../../middleware/auth', () => ({
  apiKeyAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireScope: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

jest.mock('../../../utils/user-context', () => ({
  getUserId: jest.fn(() => '00000000-0000-0000-0000-000000000001'),
  SYSTEM_USER_ID: '00000000-0000-0000-0000-000000000001',
}));

jest.mock('../../../utils/logger', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('../../../utils/database-context', () => ({
  queryContext: jest.fn(),
  isValidContext: jest.fn((ctx: string) => ['personal', 'work', 'learning', 'creative'].includes(ctx)),
  AIContext: {},
}));

const mockProcessQuery = jest.fn();
const mockGetSuggestionsForPage = jest.fn();
const mockRecordInteraction = jest.fn();
const mockGetInteractionHistory = jest.fn();

jest.mock('../../../services/unified-assistant', () => ({
  processQuery: (...args: unknown[]) => mockProcessQuery(...args),
  getSuggestionsForPage: (...args: unknown[]) => mockGetSuggestionsForPage(...args),
  recordInteraction: (...args: unknown[]) => mockRecordInteraction(...args),
  getInteractionHistory: (...args: unknown[]) => mockGetInteractionHistory(...args),
}));

import { unifiedAssistantRouter } from '../../../routes/unified-assistant';
import { errorHandler } from '../../../middleware/errorHandler';

describe('Unified Assistant Routes', () => {
  let app: express.Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api', unifiedAssistantRouter);
    app.use(errorHandler);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockRecordInteraction.mockResolvedValue(undefined);
  });

  describe('POST /api/:context/assistant/query', () => {
    it('should process a valid query', async () => {
      const result = { intent: 'search', actions: [{ type: 'navigate' }], confidence: 0.9 };
      mockProcessQuery.mockReturnValue(result);

      const res = await request(app)
        .post('/api/personal/assistant/query')
        .send({ query: 'Find my recent ideas' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.intent).toBe('search');
      expect(res.body.data.responseTimeMs).toBeDefined();
    });

    it('should reject empty query', async () => {
      const res = await request(app)
        .post('/api/personal/assistant/query')
        .send({ query: '' });

      expect(res.status).toBe(400);
    });

    it('should reject missing query', async () => {
      const res = await request(app)
        .post('/api/personal/assistant/query')
        .send({});

      expect(res.status).toBe(400);
    });

    it('should reject invalid context', async () => {
      const res = await request(app)
        .post('/api/invalid/assistant/query')
        .send({ query: 'test' });

      expect(res.status).toBe(400);
    });

    it('should handle processQuery throwing error gracefully', async () => {
      mockProcessQuery.mockImplementation(() => { throw new Error('Processing failed'); });

      const res = await request(app)
        .post('/api/personal/assistant/query')
        .send({ query: 'test query' });

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });

    it('should fire-and-forget record interaction', async () => {
      const result = { intent: 'help', actions: [], confidence: 0.7 };
      mockProcessQuery.mockReturnValue(result);

      await request(app)
        .post('/api/personal/assistant/query')
        .send({ query: 'help me', pageContext: 'ideas' });

      expect(mockRecordInteraction).toHaveBeenCalled();
    });
  });

  describe('GET /api/:context/assistant/suggestions', () => {
    it('should return suggestions for a page', async () => {
      const suggestions = [{ text: 'Create new idea', action: 'create' }];
      mockGetSuggestionsForPage.mockReturnValue(suggestions);

      const res = await request(app)
        .get('/api/personal/assistant/suggestions?page=ideas');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(suggestions);
    });

    it('should use dashboard as default page', async () => {
      mockGetSuggestionsForPage.mockReturnValue([]);

      await request(app).get('/api/personal/assistant/suggestions');

      expect(mockGetSuggestionsForPage).toHaveBeenCalledWith('dashboard');
    });

    it('should reject invalid context', async () => {
      const res = await request(app).get('/api/bad/assistant/suggestions');
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/:context/assistant/execute', () => {
    it('should delegate action to frontend', async () => {
      const res = await request(app)
        .post('/api/personal/assistant/execute')
        .send({ actionId: 'create_idea', params: { title: 'Test' } });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.actionId).toBe('create_idea');
      expect(res.body.data.status).toBe('delegated');
    });

    it('should reject missing actionId', async () => {
      const res = await request(app)
        .post('/api/personal/assistant/execute')
        .send({});

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/:context/assistant/history', () => {
    it('should return interaction history', async () => {
      const history = [{ id: '1', query: 'test', createdAt: '2026-01-01' }];
      mockGetInteractionHistory.mockResolvedValue(history);

      const res = await request(app).get('/api/personal/assistant/history');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(history);
    });

    it('should respect limit parameter', async () => {
      mockGetInteractionHistory.mockResolvedValue([]);

      await request(app).get('/api/personal/assistant/history?limit=10');

      expect(mockGetInteractionHistory).toHaveBeenCalledWith('personal', '00000000-0000-0000-0000-000000000001', 10);
    });
  });
});
