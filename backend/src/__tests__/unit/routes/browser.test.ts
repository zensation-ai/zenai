/**
 * Browser Route Tests
 *
 * Tests the REST API for browsing history and bookmarks.
 */

import express from 'express';
import request from 'supertest';
import { browserRouter } from '../../../routes/browser';
import { errorHandler } from '../../../middleware/errorHandler';

// Mock auth middleware
jest.mock('../../../middleware/auth', () => ({
  apiKeyAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireScope: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

// Mock browsing-memory service
const mockGetHistory = jest.fn();
const mockGetDomainStats = jest.fn();
const mockGetHistoryEntry = jest.fn();
const mockAddHistoryEntry = jest.fn();
const mockDeleteHistoryEntry = jest.fn();
const mockClearHistory = jest.fn();
const mockGetBookmarks = jest.fn();
const mockGetBookmarkFolders = jest.fn();
const mockGetBookmark = jest.fn();
const mockCreateBookmark = jest.fn();
const mockUpdateBookmark = jest.fn();
const mockDeleteBookmark = jest.fn();

jest.mock('../../../services/browsing-memory', () => ({
  getHistory: (...args: unknown[]) => mockGetHistory(...args),
  getDomainStats: (...args: unknown[]) => mockGetDomainStats(...args),
  getHistoryEntry: (...args: unknown[]) => mockGetHistoryEntry(...args),
  addHistoryEntry: (...args: unknown[]) => mockAddHistoryEntry(...args),
  deleteHistoryEntry: (...args: unknown[]) => mockDeleteHistoryEntry(...args),
  clearHistory: (...args: unknown[]) => mockClearHistory(...args),
  getBookmarks: (...args: unknown[]) => mockGetBookmarks(...args),
  getBookmarkFolders: (...args: unknown[]) => mockGetBookmarkFolders(...args),
  getBookmark: (...args: unknown[]) => mockGetBookmark(...args),
  createBookmark: (...args: unknown[]) => mockCreateBookmark(...args),
  updateBookmark: (...args: unknown[]) => mockUpdateBookmark(...args),
  deleteBookmark: (...args: unknown[]) => mockDeleteBookmark(...args),
}));

// Mock page-analyzer
const mockAnalyzePage = jest.fn();
jest.mock('../../../services/page-analyzer', () => ({
  analyzePage: (...args: unknown[]) => mockAnalyzePage(...args),
}));

describe('Browser Routes', () => {
  let app: express.Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api', browserRouter);
    app.use(errorHandler);
  });

  beforeEach(() => {
    jest.clearAllMocks();

    // Default happy-path return values
    mockGetHistory.mockResolvedValue({ entries: [{ id: 'h1', url: 'https://example.com' }], total: 1 });
    mockGetDomainStats.mockResolvedValue([{ domain: 'example.com', visits: 5 }]);
    mockGetHistoryEntry.mockResolvedValue({ id: 'h1', url: 'https://example.com' });
    mockAddHistoryEntry.mockResolvedValue({ id: 'h2', url: 'https://new.com' });
    mockDeleteHistoryEntry.mockResolvedValue(true);
    mockClearHistory.mockResolvedValue(3);
    mockGetBookmarks.mockResolvedValue({ bookmarks: [{ id: 'b1', url: 'https://bookmark.com' }], total: 1 });
    mockGetBookmarkFolders.mockResolvedValue([{ name: 'Dev', count: 5 }]);
    mockGetBookmark.mockResolvedValue({ id: 'b1', url: 'https://bookmark.com' });
    mockCreateBookmark.mockResolvedValue({ id: 'b2', url: 'https://new-bookmark.com' });
    mockUpdateBookmark.mockResolvedValue({ id: 'b1', url: 'https://updated.com' });
    mockDeleteBookmark.mockResolvedValue(true);
    mockAnalyzePage.mockResolvedValue({ summary: 'A page about testing', keywords: ['test'], category: 'tech' });
  });

  // ===========================================
  // Browsing History
  // ===========================================

  describe('GET /api/:context/browser/history', () => {
    it('should list browsing history', async () => {
      const res = await request(app).get('/api/personal/browser/history');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.total).toBe(1);
    });

    it('should pass filter params to service', async () => {
      await request(app).get('/api/work/browser/history?domain=example.com&limit=10');
      expect(mockGetHistory).toHaveBeenCalledWith('work', expect.objectContaining({
        domain: 'example.com',
        limit: 10,
      }));
    });

    it('should reject invalid context', async () => {
      const res = await request(app).get('/api/invalid/browser/history');
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/:context/browser/history/domains', () => {
    it('should return domain stats', async () => {
      const res = await request(app).get('/api/personal/browser/history/domains');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
    });
  });

  describe('GET /api/:context/browser/history/:id', () => {
    it('should return a single history entry', async () => {
      const res = await request(app).get('/api/personal/browser/history/a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe('h1');
    });

    it('should return 400 for invalid UUID', async () => {
      const res = await request(app).get('/api/personal/browser/history/not-a-uuid');
      expect(res.status).toBe(400);
    });

    it('should return 404 for non-existent entry', async () => {
      mockGetHistoryEntry.mockResolvedValueOnce(null);
      const res = await request(app).get('/api/personal/browser/history/a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11');
      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/:context/browser/history', () => {
    it('should create a history entry', async () => {
      const res = await request(app)
        .post('/api/personal/browser/history')
        .send({ url: 'https://new.com', domain: 'new.com', title: 'New Page' });
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
    });

    it('should return 400 when url is missing', async () => {
      const res = await request(app)
        .post('/api/personal/browser/history')
        .send({ domain: 'example.com' });
      expect(res.status).toBe(400);
    });

    it('should return 400 when domain is missing', async () => {
      const res = await request(app)
        .post('/api/personal/browser/history')
        .send({ url: 'https://example.com' });
      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /api/:context/browser/history/:id', () => {
    it('should delete a history entry', async () => {
      const res = await request(app).delete('/api/personal/browser/history/a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 404 for non-existent entry', async () => {
      mockDeleteHistoryEntry.mockResolvedValueOnce(false);
      const res = await request(app).delete('/api/personal/browser/history/a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11');
      expect(res.status).toBe(404);
    });

    it('should return 400 for invalid UUID', async () => {
      const res = await request(app).delete('/api/personal/browser/history/bad-id');
      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /api/:context/browser/history (clear)', () => {
    it('should clear browsing history', async () => {
      const res = await request(app).delete('/api/personal/browser/history');
      expect(res.status).toBe(200);
      expect(res.body.count).toBe(3);
    });
  });

  // ===========================================
  // Bookmarks
  // ===========================================

  describe('GET /api/:context/browser/bookmarks', () => {
    it('should list bookmarks', async () => {
      const res = await request(app).get('/api/personal/browser/bookmarks');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
    });
  });

  describe('GET /api/:context/browser/bookmarks/folders', () => {
    it('should return folder structure', async () => {
      const res = await request(app).get('/api/personal/browser/bookmarks/folders');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
    });
  });

  describe('GET /api/:context/browser/bookmarks/:id', () => {
    it('should return a single bookmark', async () => {
      const res = await request(app).get('/api/personal/browser/bookmarks/a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11');
      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe('b1');
    });

    it('should return 404 for non-existent bookmark', async () => {
      mockGetBookmark.mockResolvedValueOnce(null);
      const res = await request(app).get('/api/personal/browser/bookmarks/a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11');
      expect(res.status).toBe(404);
    });

    it('should return 400 for invalid UUID', async () => {
      const res = await request(app).get('/api/personal/browser/bookmarks/bad-id');
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/:context/browser/bookmarks', () => {
    it('should create a bookmark', async () => {
      const res = await request(app)
        .post('/api/personal/browser/bookmarks')
        .send({ url: 'https://new-bookmark.com', title: 'New' });
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
    });

    it('should return 400 when url is missing', async () => {
      const res = await request(app)
        .post('/api/personal/browser/bookmarks')
        .send({ title: 'No URL' });
      expect(res.status).toBe(400);
    });
  });

  describe('PUT /api/:context/browser/bookmarks/:id', () => {
    it('should update a bookmark', async () => {
      const res = await request(app)
        .put('/api/personal/browser/bookmarks/a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11')
        .send({ title: 'Updated' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 404 for non-existent bookmark', async () => {
      mockUpdateBookmark.mockResolvedValueOnce(null);
      const res = await request(app)
        .put('/api/personal/browser/bookmarks/a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11')
        .send({ title: 'X' });
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/:context/browser/bookmarks/:id', () => {
    it('should delete a bookmark', async () => {
      const res = await request(app).delete('/api/personal/browser/bookmarks/a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 404 for non-existent bookmark', async () => {
      mockDeleteBookmark.mockResolvedValueOnce(false);
      const res = await request(app).delete('/api/personal/browser/bookmarks/a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11');
      expect(res.status).toBe(404);
    });
  });

  // ===========================================
  // AI Analysis
  // ===========================================

  describe('POST /api/:context/browser/analyze', () => {
    it('should analyze page content', async () => {
      const res = await request(app)
        .post('/api/personal/browser/analyze')
        .send({ url: 'https://example.com', text: 'Some content to analyze' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('summary');
    });

    it('should return 400 when url is missing', async () => {
      const res = await request(app)
        .post('/api/personal/browser/analyze')
        .send({ text: 'Some content' });
      expect(res.status).toBe(400);
    });

    it('should return 400 when text is missing', async () => {
      const res = await request(app)
        .post('/api/personal/browser/analyze')
        .send({ url: 'https://example.com' });
      expect(res.status).toBe(400);
    });

    it('should return 503 when analysis service is unavailable', async () => {
      mockAnalyzePage.mockResolvedValueOnce(null);
      const res = await request(app)
        .post('/api/personal/browser/analyze')
        .send({ url: 'https://example.com', text: 'content' });
      expect(res.status).toBe(503);
    });
  });
});
