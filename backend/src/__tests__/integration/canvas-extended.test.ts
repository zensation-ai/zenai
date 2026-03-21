/**
 * Integration Tests for Canvas API - Extended Endpoints
 *
 * Supplements the existing canvas.test.ts with tests for:
 * - POST /api/canvas/:id/link-chat        - Link chat session
 * - GET  /api/canvas/:id/versions         - Version history
 * - POST /api/canvas/:id/restore/:verId   - Restore version
 * - Edge cases for UUID validation and error handling
 *
 * Phase 120 - Worker 3
 */

import express, { Express } from 'express';
import request from 'supertest';

const VALID_UUID = '11111111-1111-1111-1111-111111111111';
const VALID_UUID_2 = '22222222-2222-2222-2222-222222222222';

// Mock dependencies BEFORE imports
jest.mock('../../middleware/auth', () => ({
  apiKeyAuth: jest.fn((_req: unknown, _res: unknown, next: () => void) => next()),
  requireScope: jest.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}));

jest.mock('../../utils/user-context', () => ({
  getUserId: jest.fn(() => '00000000-0000-0000-0000-000000000001'),
  SYSTEM_USER_ID: '00000000-0000-0000-0000-000000000001',
}));

jest.mock('../../utils/logger', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const mockCreateCanvasDocument = jest.fn();
const mockGetCanvasDocument = jest.fn();
const mockListCanvasDocuments = jest.fn();
const mockUpdateCanvasDocument = jest.fn();
const mockDeleteCanvasDocument = jest.fn();
const mockLinkChatSession = jest.fn();
const mockGetVersionHistory = jest.fn();
const mockRestoreVersion = jest.fn();

jest.mock('../../services/canvas', () => ({
  createCanvasDocument: (...args: unknown[]) => mockCreateCanvasDocument(...args),
  getCanvasDocument: (...args: unknown[]) => mockGetCanvasDocument(...args),
  listCanvasDocuments: (...args: unknown[]) => mockListCanvasDocuments(...args),
  updateCanvasDocument: (...args: unknown[]) => mockUpdateCanvasDocument(...args),
  deleteCanvasDocument: (...args: unknown[]) => mockDeleteCanvasDocument(...args),
  linkChatSession: (...args: unknown[]) => mockLinkChatSession(...args),
  getVersionHistory: (...args: unknown[]) => mockGetVersionHistory(...args),
  restoreVersion: (...args: unknown[]) => mockRestoreVersion(...args),
}));

import { canvasRouter } from '../../routes/canvas';
import { errorHandler } from '../../middleware/errorHandler';

describe('Canvas Extended API Integration Tests', () => {
  let app: Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/canvas', canvasRouter);
    app.use(errorHandler);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ============================================================
  // POST /api/canvas/:id/link-chat
  // ============================================================

  describe('POST /api/canvas/:id/link-chat', () => {
    it('should link a chat session to a document', async () => {
      mockLinkChatSession.mockResolvedValueOnce(true);

      const response = await request(app)
        .post(`/api/canvas/${VALID_UUID}/link-chat`)
        .send({ chatSessionId: VALID_UUID_2 })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.linked).toBe(true);
    });

    it('should return 404 if document not found', async () => {
      mockLinkChatSession.mockResolvedValueOnce(false);

      const response = await request(app)
        .post(`/api/canvas/${VALID_UUID}/link-chat`)
        .send({ chatSessionId: VALID_UUID_2 })
        .expect(404);

      expect(response.body.success).toBe(false);
    });

    it('should reject invalid document UUID', async () => {
      const response = await request(app)
        .post('/api/canvas/bad-id/link-chat')
        .send({ chatSessionId: VALID_UUID_2 })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should reject missing chatSessionId', async () => {
      const response = await request(app)
        .post(`/api/canvas/${VALID_UUID}/link-chat`)
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should reject invalid chatSessionId format', async () => {
      const response = await request(app)
        .post(`/api/canvas/${VALID_UUID}/link-chat`)
        .send({ chatSessionId: 'not-a-uuid' })
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  // ============================================================
  // GET /api/canvas/:id/versions
  // ============================================================

  describe('GET /api/canvas/:id/versions', () => {
    it('should return version history', async () => {
      const doc = { id: VALID_UUID, title: 'Test', content: '# Hello' };
      const versions = [
        { id: 'v1', content: '# Old', created_at: '2026-01-01T00:00:00Z' },
        { id: 'v2', content: '# New', created_at: '2026-01-02T00:00:00Z' },
      ];
      mockGetCanvasDocument.mockResolvedValueOnce(doc);
      mockGetVersionHistory.mockResolvedValueOnce(versions);

      const response = await request(app)
        .get(`/api/canvas/${VALID_UUID}/versions`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.versions).toHaveLength(2);
    });

    it('should return 404 if document not found', async () => {
      mockGetCanvasDocument.mockResolvedValueOnce(null);

      const response = await request(app)
        .get(`/api/canvas/${VALID_UUID}/versions`)
        .expect(404);

      expect(response.body.success).toBe(false);
    });

    it('should reject invalid UUID', async () => {
      const response = await request(app)
        .get('/api/canvas/bad-id/versions')
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should respect limit parameter', async () => {
      const doc = { id: VALID_UUID, title: 'Test' };
      mockGetCanvasDocument.mockResolvedValueOnce(doc);
      mockGetVersionHistory.mockResolvedValueOnce([]);

      await request(app)
        .get(`/api/canvas/${VALID_UUID}/versions?limit=5`)
        .expect(200);

      expect(mockGetVersionHistory).toHaveBeenCalledWith(VALID_UUID, 5, expect.any(String));
    });
  });

  // ============================================================
  // POST /api/canvas/:id/restore/:versionId
  // ============================================================

  describe('POST /api/canvas/:id/restore/:versionId', () => {
    it('should restore a document version', async () => {
      const restoredDoc = { id: VALID_UUID, content: '# Restored', title: 'Test' };
      mockRestoreVersion.mockResolvedValueOnce(restoredDoc);

      const response = await request(app)
        .post(`/api/canvas/${VALID_UUID}/restore/${VALID_UUID_2}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('content', '# Restored');
    });

    it('should return 404 if document or version not found', async () => {
      mockRestoreVersion.mockResolvedValueOnce(null);

      const response = await request(app)
        .post(`/api/canvas/${VALID_UUID}/restore/${VALID_UUID_2}`)
        .expect(404);

      expect(response.body.success).toBe(false);
    });

    it('should reject invalid document UUID', async () => {
      const response = await request(app)
        .post(`/api/canvas/bad-id/restore/${VALID_UUID_2}`)
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should reject invalid version UUID', async () => {
      const response = await request(app)
        .post(`/api/canvas/${VALID_UUID}/restore/bad-id`)
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });
});
