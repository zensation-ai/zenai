/**
 * Global Search Route Tests
 *
 * Tests the REST API for unified cross-feature search.
 */

import express from 'express';
import request from 'supertest';
import { globalSearchRouter } from '../../../routes/global-search';
import { errorHandler } from '../../../middleware/errorHandler';

jest.mock('../../../middleware/auth', () => ({
  apiKeyAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireScope: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const mockSearch = jest.fn();

jest.mock('../../../services/global-search', () => ({
  globalSearch: {
    search: (...args: unknown[]) => mockSearch(...args),
  },
}));

describe('Global Search Routes', () => {
  let app: express.Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/search', globalSearchRouter);
    app.use(errorHandler);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /global', () => {
    it('should perform a global search', async () => {
      mockSearch.mockResolvedValue({
        query: 'test',
        totalResults: 2,
        results: [{ type: 'idea', title: 'Test idea' }, { type: 'document', title: 'Test doc' }],
      });
      const res = await request(app).post('/api/search/global').send({ query: 'test' });
      expect(res.status).toBe(200);
      expect(res.body.data.totalResults).toBe(2);
    });

    it('should reject query shorter than 2 characters', async () => {
      const res = await request(app).post('/api/search/global').send({ query: 'a' });
      expect(res.status).toBe(400);
    });

    it('should reject empty query', async () => {
      const res = await request(app).post('/api/search/global').send({});
      expect(res.status).toBe(400);
    });

    it('should accept context filter', async () => {
      mockSearch.mockResolvedValue({ query: 'test', totalResults: 0, results: [] });
      const res = await request(app).post('/api/search/global').send({ query: 'test', contexts: ['personal', 'work'] });
      expect(res.status).toBe(200);
      expect(mockSearch).toHaveBeenCalledWith(
        expect.objectContaining({ contexts: ['personal', 'work'] })
      );
    });

    it('should reject invalid context in filter', async () => {
      const res = await request(app).post('/api/search/global').send({ query: 'test', contexts: ['invalid'] });
      expect(res.status).toBe(400);
    });

    it('should reject invalid type in filter', async () => {
      const res = await request(app).post('/api/search/global').send({ query: 'test', types: ['nonexistent'] });
      expect(res.status).toBe(400);
    });

    it('should clamp limit to max 50', async () => {
      mockSearch.mockResolvedValue({ query: 'test', totalResults: 0, results: [] });
      await request(app).post('/api/search/global').send({ query: 'test', limit: 100 });
      expect(mockSearch).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 50 })
      );
    });
  });

  describe('GET /quick', () => {
    it('should perform quick search', async () => {
      mockSearch.mockResolvedValue({ query: 'hello', totalResults: 1, results: [{ type: 'idea' }] });
      const res = await request(app).get('/api/search/quick?q=hello');
      expect(res.status).toBe(200);
      expect(res.body.data.totalResults).toBe(1);
    });

    it('should return empty results for short query', async () => {
      const res = await request(app).get('/api/search/quick?q=a');
      expect(res.status).toBe(200);
      expect(res.body.data.totalResults).toBe(0);
    });

    it('should return empty results for missing query', async () => {
      const res = await request(app).get('/api/search/quick');
      expect(res.status).toBe(200);
      expect(res.body.data.results).toEqual([]);
    });
  });
});
