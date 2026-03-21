/**
 * Semantic Search Route Tests
 *
 * Tests the REST API for unified semantic search, suggestions, history, and facets.
 */

import express from 'express';
import request from 'supertest';
import { semanticSearchRouter } from '../../../routes/semantic-search';
import { errorHandler } from '../../../middleware/errorHandler';

jest.mock('../../../middleware/auth', () => ({
  apiKeyAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireScope: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

jest.mock('../../../utils/user-context', () => ({
  getUserId: () => '00000000-0000-0000-0000-000000000001',
}));

const mockUnifiedSearch = jest.fn();
const mockGetSearchSuggestions = jest.fn();
const mockGetSearchHistory = jest.fn();
const mockClearSearchHistory = jest.fn();
const mockRecordSearchHistory = jest.fn();
const mockGetSearchFacets = jest.fn();

jest.mock('../../../services/semantic-search', () => ({
  unifiedSearch: (...args: unknown[]) => mockUnifiedSearch(...args),
  getSearchSuggestions: (...args: unknown[]) => mockGetSearchSuggestions(...args),
  getSearchHistory: (...args: unknown[]) => mockGetSearchHistory(...args),
  clearSearchHistory: (...args: unknown[]) => mockClearSearchHistory(...args),
  recordSearchHistory: (...args: unknown[]) => mockRecordSearchHistory(...args),
  getSearchFacets: (...args: unknown[]) => mockGetSearchFacets(...args),
  ALL_ENTITY_TYPES: ['idea', 'document', 'fact', 'contact', 'email', 'task', 'event'],
}));

jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

describe('Semantic Search Routes', () => {
  let app: express.Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api', semanticSearchRouter);
    app.use(errorHandler);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockRecordSearchHistory.mockResolvedValue(undefined);
  });

  describe('POST /:context/search/unified', () => {
    it('should perform unified search', async () => {
      mockUnifiedSearch.mockResolvedValue({ totalResults: 3, results: [{}, {}, {}] });
      const res = await request(app).post('/api/personal/search/unified').send({ query: 'test query' });
      expect(res.status).toBe(200);
      expect(res.body.data.totalResults).toBe(3);
    });

    it('should reject empty query', async () => {
      const res = await request(app).post('/api/personal/search/unified').send({ query: '' });
      expect(res.status).toBe(400);
    });

    it('should reject missing query', async () => {
      const res = await request(app).post('/api/personal/search/unified').send({});
      expect(res.status).toBe(400);
    });

    it('should reject invalid context', async () => {
      const res = await request(app).post('/api/invalid/search/unified').send({ query: 'test' });
      expect(res.status).toBe(400);
    });

    it('should reject invalid type filter', async () => {
      const res = await request(app).post('/api/personal/search/unified').send({ query: 'test', types: ['invalid_type'] });
      expect(res.status).toBe(400);
    });

    it('should handle search failure gracefully', async () => {
      mockUnifiedSearch.mockRejectedValue(new Error('DB error'));
      const res = await request(app).post('/api/personal/search/unified').send({ query: 'failing query' });
      expect(res.status).toBe(500);
    });
  });

  describe('GET /:context/search/suggestions', () => {
    it('should return search suggestions', async () => {
      mockGetSearchSuggestions.mockResolvedValue(['suggestion 1', 'suggestion 2']);
      const res = await request(app).get('/api/personal/search/suggestions?q=test');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
    });

    it('should reject invalid context', async () => {
      const res = await request(app).get('/api/invalid/search/suggestions');
      expect(res.status).toBe(400);
    });
  });

  describe('GET /:context/search/history', () => {
    it('should return search history', async () => {
      mockGetSearchHistory.mockResolvedValue([{ query: 'old search', timestamp: '2026-01-01' }]);
      const res = await request(app).get('/api/personal/search/history');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
    });
  });

  describe('DELETE /:context/search/history', () => {
    it('should clear search history', async () => {
      mockClearSearchHistory.mockResolvedValue(undefined);
      const res = await request(app).delete('/api/personal/search/history');
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Search history cleared');
    });

    it('should reject invalid context', async () => {
      const res = await request(app).delete('/api/invalid/search/history');
      expect(res.status).toBe(400);
    });
  });

  describe('GET /:context/search/facets', () => {
    it('should return available facets', async () => {
      mockGetSearchFacets.mockResolvedValue({ types: { idea: 10, document: 5 } });
      const res = await request(app).get('/api/personal/search/facets');
      expect(res.status).toBe(200);
      expect(res.body.data.types).toHaveProperty('idea', 10);
    });
  });
});
