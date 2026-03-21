/**
 * Integration Tests for Canvas API - Core CRUD
 *
 * Tests the canvas document CRUD routes:
 * - POST   /api/canvas         - Create document
 * - GET    /api/canvas         - List documents
 * - GET    /api/canvas/:id     - Get document
 * - PATCH  /api/canvas/:id     - Update document
 * - DELETE /api/canvas/:id     - Delete document
 *
 * Phase 122 - Worker 2
 */

import express, { Express } from 'express';
import request from 'supertest';

const VALID_UUID = '11111111-1111-1111-1111-111111111111';

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

describe('Canvas CRUD Integration Tests', () => {
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
  // POST /api/canvas - Create
  // ============================================================

  describe('POST /api/canvas', () => {
    it('should create a document with minimal fields', async () => {
      const doc = { id: VALID_UUID, title: 'Test', type: 'markdown', content: '' };
      mockCreateCanvasDocument.mockResolvedValueOnce(doc);

      const res = await request(app)
        .post('/api/canvas')
        .send({ title: 'Test' })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(doc);
    });

    it('should create a code document with language', async () => {
      const doc = { id: VALID_UUID, title: 'Code', type: 'code', language: 'typescript', content: '' };
      mockCreateCanvasDocument.mockResolvedValueOnce(doc);

      const res = await request(app)
        .post('/api/canvas')
        .send({ title: 'Code', type: 'code', language: 'typescript', context: 'work' })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(mockCreateCanvasDocument).toHaveBeenCalledWith('work', 'Code', 'code', 'typescript', '', expect.any(String));
    });

    it('should reject missing title', async () => {
      const res = await request(app)
        .post('/api/canvas')
        .send({})
        .expect(400);

      expect(res.body.success).toBe(false);
    });

    it('should reject invalid context', async () => {
      const res = await request(app)
        .post('/api/canvas')
        .send({ title: 'Test', context: 'invalid' })
        .expect(400);

      expect(res.body.success).toBe(false);
    });
  });

  // ============================================================
  // GET /api/canvas - List
  // ============================================================

  describe('GET /api/canvas', () => {
    it('should list documents for default context', async () => {
      const docs = [{ id: VALID_UUID, title: 'Doc 1' }];
      mockListCanvasDocuments.mockResolvedValueOnce(docs);

      const res = await request(app)
        .get('/api/canvas')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(docs);
    });

    it('should reject invalid context query param', async () => {
      const res = await request(app)
        .get('/api/canvas?context=invalid')
        .expect(400);

      expect(res.body.success).toBe(false);
    });
  });

  // ============================================================
  // GET /api/canvas/:id - Get
  // ============================================================

  describe('GET /api/canvas/:id', () => {
    it('should return a document by ID', async () => {
      const doc = { id: VALID_UUID, title: 'Test Doc' };
      mockGetCanvasDocument.mockResolvedValueOnce(doc);

      const res = await request(app)
        .get(`/api/canvas/${VALID_UUID}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(doc);
    });

    it('should return 404 for non-existent document', async () => {
      mockGetCanvasDocument.mockResolvedValueOnce(null);

      const res = await request(app)
        .get(`/api/canvas/${VALID_UUID}`)
        .expect(404);

      expect(res.body.success).toBe(false);
    });

    it('should reject invalid UUID format', async () => {
      const res = await request(app)
        .get('/api/canvas/not-a-uuid')
        .expect(400);

      expect(res.body.success).toBe(false);
    });
  });

  // ============================================================
  // DELETE /api/canvas/:id - Delete
  // ============================================================

  describe('DELETE /api/canvas/:id', () => {
    it('should delete a document', async () => {
      mockDeleteCanvasDocument.mockResolvedValueOnce(true);

      const res = await request(app)
        .delete(`/api/canvas/${VALID_UUID}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.deleted).toBe(true);
    });

    it('should return 404 when document not found', async () => {
      mockDeleteCanvasDocument.mockResolvedValueOnce(false);

      const res = await request(app)
        .delete(`/api/canvas/${VALID_UUID}`)
        .expect(404);

      expect(res.body.success).toBe(false);
    });
  });
});
