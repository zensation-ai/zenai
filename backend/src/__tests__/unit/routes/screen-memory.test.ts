/**
 * Screen Memory Route Tests
 *
 * Tests the REST API for querying and managing screen captures.
 */

import express from 'express';
import request from 'supertest';
import { screenMemoryRouter } from '../../../routes/screen-memory';
import { errorHandler } from '../../../middleware/errorHandler';

// Mock auth middleware
jest.mock('../../../middleware/auth', () => ({
  apiKeyAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireScope: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

// Mock screen-memory service
const mockGetCaptures = jest.fn();
const mockGetStats = jest.fn();
const mockGetCapture = jest.fn();
const mockStoreCapture = jest.fn();
const mockDeleteCapture = jest.fn();
const mockCleanupOldCaptures = jest.fn();

jest.mock('../../../services/screen-memory', () => ({
  getCaptures: (...args: unknown[]) => mockGetCaptures(...args),
  getStats: (...args: unknown[]) => mockGetStats(...args),
  getCapture: (...args: unknown[]) => mockGetCapture(...args),
  storeCapture: (...args: unknown[]) => mockStoreCapture(...args),
  deleteCapture: (...args: unknown[]) => mockDeleteCapture(...args),
  cleanupOldCaptures: (...args: unknown[]) => mockCleanupOldCaptures(...args),
}));

// Mock response utils
jest.mock('../../../utils/response', () => ({
  sendData: jest.fn((res: express.Response, data: unknown, status = 200) =>
    res.status(status).json({ success: true, data })),
  sendList: jest.fn((res: express.Response, data: unknown[], total: number) =>
    res.json({ success: true, data, total })),
  sendMessage: jest.fn((res: express.Response, msg: string, extra?: Record<string, unknown>) =>
    res.json({ success: true, message: msg, ...extra })),
  sendNotFound: jest.fn((res: express.Response, entity: string) =>
    res.status(404).json({ success: false, error: `${entity} not found` })),
  sendValidationError: jest.fn((res: express.Response, msg: string) =>
    res.status(400).json({ success: false, error: msg })),
  parsePagination: jest.fn(() => ({ limit: 50, offset: 0 })),
}));

describe('Screen Memory Routes', () => {
  let app: express.Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api', screenMemoryRouter);
    app.use(errorHandler);
  });

  beforeEach(() => {
    jest.clearAllMocks();

    // Default happy-path return values
    mockGetCaptures.mockResolvedValue({
      captures: [{ id: 'c1', app_name: 'VSCode', text_content: 'code...' }],
      total: 1,
    });
    mockGetStats.mockResolvedValue({ totalCaptures: 10, uniqueApps: 3 });
    mockGetCapture.mockResolvedValue({ id: 'c1', app_name: 'VSCode' });
    mockStoreCapture.mockResolvedValue({ id: 'c2', app_name: 'Chrome' });
    mockDeleteCapture.mockResolvedValue(true);
    mockCleanupOldCaptures.mockResolvedValue(5);
  });

  // ===========================================
  // List Captures
  // ===========================================

  describe('GET /api/:context/screen-memory', () => {
    it('should list screen captures', async () => {
      const res = await request(app).get('/api/personal/screen-memory');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.total).toBe(1);
    });

    it('should reject invalid context', async () => {
      const res = await request(app).get('/api/invalid/screen-memory');
      expect(res.status).toBe(400);
    });
  });

  // ===========================================
  // Stats
  // ===========================================

  describe('GET /api/:context/screen-memory/stats', () => {
    it('should return statistics', async () => {
      const res = await request(app).get('/api/personal/screen-memory/stats');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('totalCaptures');
    });
  });

  // ===========================================
  // Get Single Capture
  // ===========================================

  describe('GET /api/:context/screen-memory/:id', () => {
    it('should return a single capture', async () => {
      const res = await request(app).get('/api/personal/screen-memory/a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe('c1');
    });

    it('should return 400 for invalid UUID', async () => {
      const res = await request(app).get('/api/personal/screen-memory/not-a-uuid');
      expect(res.status).toBe(400);
    });

    it('should return 404 for non-existent capture', async () => {
      mockGetCapture.mockResolvedValueOnce(null);
      const res = await request(app).get('/api/personal/screen-memory/a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11');
      expect(res.status).toBe(404);
    });
  });

  // ===========================================
  // Store Capture
  // ===========================================

  describe('POST /api/:context/screen-memory', () => {
    it('should store a new capture', async () => {
      const res = await request(app)
        .post('/api/personal/screen-memory')
        .send({ app_name: 'Chrome', text_content: 'some text' });
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe('c2');
    });
  });

  // ===========================================
  // Delete Capture
  // ===========================================

  describe('DELETE /api/:context/screen-memory/:id', () => {
    it('should delete a capture', async () => {
      const res = await request(app).delete('/api/personal/screen-memory/a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 400 for invalid UUID', async () => {
      const res = await request(app).delete('/api/personal/screen-memory/bad-id');
      expect(res.status).toBe(400);
    });

    it('should return 404 for non-existent capture', async () => {
      mockDeleteCapture.mockResolvedValueOnce(false);
      const res = await request(app).delete('/api/personal/screen-memory/a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11');
      expect(res.status).toBe(404);
    });
  });

  // ===========================================
  // Cleanup
  // ===========================================

  describe('POST /api/:context/screen-memory/cleanup', () => {
    it('should cleanup old captures with default retention', async () => {
      const res = await request(app)
        .post('/api/personal/screen-memory/cleanup')
        .send({});
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.deleted).toBe(5);
      expect(mockCleanupOldCaptures).toHaveBeenCalledWith('personal', 30);
    });

    it('should cleanup with custom retention days', async () => {
      await request(app)
        .post('/api/personal/screen-memory/cleanup')
        .send({ retention_days: 7 });
      expect(mockCleanupOldCaptures).toHaveBeenCalledWith('personal', 7);
    });
  });
});
