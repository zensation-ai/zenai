/**
 * Unified Inbox Route Tests
 *
 * Tests the REST API for aggregated inbox items.
 */

import express from 'express';
import request from 'supertest';
import { unifiedInboxRouter } from '../../../routes/unified-inbox';
import { errorHandler } from '../../../middleware/errorHandler';

// Mock auth middleware
jest.mock('../../../middleware/auth', () => ({
  apiKeyAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireScope: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

// Mock unified-inbox service
const mockGetUnifiedInbox = jest.fn();

jest.mock('../../../services/unified-inbox', () => ({
  getUnifiedInbox: (...args: unknown[]) => mockGetUnifiedInbox(...args),
}));

// Mock response utils
jest.mock('../../../utils/response', () => ({
  sendData: jest.fn((res: express.Response, data: unknown) =>
    res.json({ success: true, data })),
  sendSuccess: jest.fn((res: express.Response, opts: { fields: Record<string, unknown> }) =>
    res.json({ success: true, ...opts.fields })),
}));

// Mock database-context
jest.mock('../../../utils/database-context', () => ({
  isValidContext: jest.fn((ctx: string) => ['personal', 'work', 'learning', 'creative'].includes(ctx)),
}));

describe('Unified Inbox Routes', () => {
  let app: express.Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api', unifiedInboxRouter);
    app.use(errorHandler);
  });

  beforeEach(() => {
    jest.clearAllMocks();

    mockGetUnifiedInbox.mockResolvedValue({
      items: [
        { type: 'email', title: 'New email', timestamp: '2026-03-12' },
        { type: 'task_due', title: 'Fix bug', timestamp: '2026-03-12' },
      ],
      counts: { email: 1, task_due: 1 },
      total: 2,
    });
  });

  // ===========================================
  // GET /api/:context/inbox
  // ===========================================

  describe('GET /api/:context/inbox', () => {
    it('should return unified inbox items', async () => {
      const res = await request(app).get('/api/personal/inbox');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.items).toHaveLength(2);
      expect(res.body.data.total).toBe(2);
    });

    it('should reject invalid context', async () => {
      const { isValidContext } = require('../../../utils/database-context');
      isValidContext.mockReturnValueOnce(false);

      const res = await request(app).get('/api/invalid/inbox');
      expect(res.status).toBe(400);
    });

    it('should pass type filters to service', async () => {
      await request(app).get('/api/work/inbox?types=email,task_due');
      expect(mockGetUnifiedInbox).toHaveBeenCalledWith(
        'work',
        expect.objectContaining({
          types: ['email', 'task_due'],
        })
      );
    });

    it('should reject invalid inbox type', async () => {
      const res = await request(app).get('/api/personal/inbox?types=invalid_type');
      expect(res.status).toBe(400);
    });

    it('should respect limit parameter', async () => {
      await request(app).get('/api/personal/inbox?limit=10');
      expect(mockGetUnifiedInbox).toHaveBeenCalledWith(
        'personal',
        expect.objectContaining({ limit: 10 })
      );
    });

    it('should cap limit at 100', async () => {
      await request(app).get('/api/personal/inbox?limit=999');
      expect(mockGetUnifiedInbox).toHaveBeenCalledWith(
        'personal',
        expect.objectContaining({ limit: 100 })
      );
    });

    it('should default limit to 50', async () => {
      await request(app).get('/api/personal/inbox');
      expect(mockGetUnifiedInbox).toHaveBeenCalledWith(
        'personal',
        expect.objectContaining({ limit: 50 })
      );
    });
  });

  // ===========================================
  // GET /api/:context/inbox/counts
  // ===========================================

  describe('GET /api/:context/inbox/counts', () => {
    it('should return item counts per type', async () => {
      const res = await request(app).get('/api/personal/inbox/counts');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.counts).toHaveProperty('email');
      expect(res.body.total).toBe(2);
    });

    it('should reject invalid context', async () => {
      const { isValidContext } = require('../../../utils/database-context');
      isValidContext.mockReturnValueOnce(false);

      const res = await request(app).get('/api/invalid/inbox/counts');
      expect(res.status).toBe(400);
    });
  });
});
