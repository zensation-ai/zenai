/**
 * Integration Tests for Canvas API Endpoints
 *
 * Tests the Canvas CRUD routes:
 * - POST   /api/canvas           - Create document
 * - GET    /api/canvas            - List documents
 * - GET    /api/canvas/:id        - Get document
 * - PATCH  /api/canvas/:id        - Update document
 * - DELETE /api/canvas/:id        - Delete document
 * - POST   /api/canvas/:id/link-chat       - Link chat session
 * - GET    /api/canvas/:id/versions        - Version history
 * - POST   /api/canvas/:id/restore/:verId  - Restore version
 *
 * Phase 33 Sprint 4 - Feature 10
 */

import express, { Express } from 'express';
import request from 'supertest';

// Mock dependencies BEFORE imports
jest.mock('../middleware/auth', () => ({
  apiKeyAuth: jest.fn((_req: unknown, _res: unknown, next: () => void) => next()),
  requireScope: jest.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}));

const mockQuery = jest.fn();
jest.mock('../utils/database', () => ({
  query: (...args: unknown[]) => mockQuery(...args),
}));

jest.mock('../utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock uuid for predictable IDs
jest.mock('uuid', () => ({
  v4: jest.fn(() => '11111111-1111-1111-1111-111111111111'),
}));

import { canvasRouter } from '../routes/canvas';
import { errorHandler } from '../middleware/errorHandler';

const VALID_UUID = '11111111-1111-1111-1111-111111111111';
const VALID_UUID_2 = '22222222-2222-2222-2222-222222222222';

const mockDocument = {
  id: VALID_UUID,
  context: 'personal',
  title: 'Test Document',
  content: '# Hello World',
  type: 'markdown',
  language: null,
  chat_session_id: null,
  created_at: '2026-02-08T10:00:00.000Z',
  updated_at: '2026-02-08T10:00:00.000Z',
};

describe('Canvas API Tests', () => {
  let app: Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/canvas', canvasRouter);
    app.use(errorHandler);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockReset();
  });

  // ============================================================
  // POST /api/canvas - Create Document
  // ============================================================

  describe('POST /api/canvas', () => {
    it('should create a new document with default values', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [mockDocument],
      });

      const response = await request(app)
        .post('/api/canvas')
        .send({ title: 'Test Document' })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('title', 'Test Document');
      expect(response.body).toHaveProperty('type', 'markdown');
      expect(response.body).toHaveProperty('context', 'personal');
    });

    it('should create a code document with language', async () => {
      const codeDoc = { ...mockDocument, type: 'code', language: 'typescript' };
      mockQuery.mockResolvedValueOnce({ rows: [codeDoc] });

      const response = await request(app)
        .post('/api/canvas')
        .send({
          title: 'Code File',
          type: 'code',
          language: 'typescript',
          content: 'const x = 1;',
          context: 'work',
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.type).toBe('code');
      expect(response.body.language).toBe('typescript');
    });

    it('should reject missing title', async () => {
      const response = await request(app)
        .post('/api/canvas')
        .send({ type: 'markdown' })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should reject empty title', async () => {
      const response = await request(app)
        .post('/api/canvas')
        .send({ title: '' })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should reject title over 500 characters', async () => {
      const response = await request(app)
        .post('/api/canvas')
        .send({ title: 'a'.repeat(501) })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should reject invalid type', async () => {
      const response = await request(app)
        .post('/api/canvas')
        .send({ title: 'Test', type: 'invalid' })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should reject invalid context', async () => {
      const response = await request(app)
        .post('/api/canvas')
        .send({ title: 'Test', context: 'invalid' })
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  // ============================================================
  // GET /api/canvas - List Documents
  // ============================================================

  describe('GET /api/canvas', () => {
    it('should list documents for default context', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [mockDocument] })
        .mockResolvedValueOnce({ rows: [{ total: 1 }] });

      const response = await request(app)
        .get('/api/canvas?context=personal')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body).toHaveProperty('documents');
      expect(response.body).toHaveProperty('total', 1);
      expect(response.body.documents).toHaveLength(1);
    });

    it('should list documents for work context', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: 0 }] });

      const response = await request(app)
        .get('/api/canvas?context=work')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.documents).toHaveLength(0);
      expect(response.body.total).toBe(0);
    });

    it('should reject invalid context', async () => {
      const response = await request(app)
        .get('/api/canvas?context=invalid')
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should respect limit and offset', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: 50 }] });

      await request(app)
        .get('/api/canvas?context=personal&limit=10&offset=20')
        .expect(200);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT'),
        expect.arrayContaining(['personal', 10, 20])
      );
    });
  });

  // ============================================================
  // GET /api/canvas/:id - Get Document
  // ============================================================

  describe('GET /api/canvas/:id', () => {
    it('should return a document by ID', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [mockDocument] });

      const response = await request(app)
        .get(`/api/canvas/${VALID_UUID}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body).toHaveProperty('id', VALID_UUID);
      expect(response.body).toHaveProperty('title', 'Test Document');
      expect(response.body).toHaveProperty('content', '# Hello World');
    });

    it('should return 404 for non-existent document', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .get(`/api/canvas/${VALID_UUID}`)
        .expect(404);

      expect(response.body.success).toBe(false);
    });

    it('should reject invalid UUID format', async () => {
      const response = await request(app)
        .get('/api/canvas/not-a-uuid')
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  // ============================================================
  // PATCH /api/canvas/:id - Update Document
  // ============================================================

  describe('PATCH /api/canvas/:id', () => {
    it('should update document title', async () => {
      const updatedDoc = { ...mockDocument, title: 'Updated Title' };
      mockQuery.mockResolvedValueOnce({ rows: [updatedDoc] });

      const response = await request(app)
        .patch(`/api/canvas/${VALID_UUID}`)
        .send({ title: 'Updated Title' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.title).toBe('Updated Title');
    });

    it('should update document content and trigger version save', async () => {
      const updatedDoc = { ...mockDocument, content: '# Updated Content' };
      mockQuery
        .mockResolvedValueOnce({ rows: [updatedDoc] })  // UPDATE
        .mockResolvedValueOnce({ rows: [] })              // Version check (last version)
        .mockResolvedValueOnce({ rows: [] })              // Version insert
        .mockResolvedValueOnce({ rows: [] });             // Version prune

      const response = await request(app)
        .patch(`/api/canvas/${VALID_UUID}`)
        .send({ content: '# Updated Content' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.content).toBe('# Updated Content');
    });

    it('should update document type', async () => {
      const updatedDoc = { ...mockDocument, type: 'code' };
      mockQuery.mockResolvedValueOnce({ rows: [updatedDoc] });

      const response = await request(app)
        .patch(`/api/canvas/${VALID_UUID}`)
        .send({ type: 'code' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.type).toBe('code');
    });

    it('should return 404 for non-existent document', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .patch(`/api/canvas/${VALID_UUID}`)
        .send({ title: 'Updated Title' })
        .expect(404);

      expect(response.body.success).toBe(false);
    });

    it('should reject empty update body', async () => {
      const response = await request(app)
        .patch(`/api/canvas/${VALID_UUID}`)
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should reject invalid UUID', async () => {
      const response = await request(app)
        .patch('/api/canvas/bad-id')
        .send({ title: 'Test' })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should reject invalid type value', async () => {
      const response = await request(app)
        .patch(`/api/canvas/${VALID_UUID}`)
        .send({ type: 'pdf' })
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  // ============================================================
  // DELETE /api/canvas/:id - Delete Document
  // ============================================================

  describe('DELETE /api/canvas/:id', () => {
    it('should delete a document', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: VALID_UUID }] });

      const response = await request(app)
        .delete(`/api/canvas/${VALID_UUID}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body).toHaveProperty('deleted', true);
    });

    it('should return 404 for non-existent document', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .delete(`/api/canvas/${VALID_UUID}`)
        .expect(404);

      expect(response.body.success).toBe(false);
    });

    it('should reject invalid UUID', async () => {
      const response = await request(app)
        .delete('/api/canvas/invalid')
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  // ============================================================
  // POST /api/canvas/:id/link-chat - Link Chat Session
  // ============================================================

  describe('POST /api/canvas/:id/link-chat', () => {
    it('should link a chat session to a document', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: VALID_UUID }] });

      const response = await request(app)
        .post(`/api/canvas/${VALID_UUID}/link-chat`)
        .send({ chatSessionId: VALID_UUID_2 })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body).toHaveProperty('linked', true);
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
        .send({ chatSessionId: 'not-uuid' })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should return 404 for non-existent document', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .post(`/api/canvas/${VALID_UUID}/link-chat`)
        .send({ chatSessionId: VALID_UUID_2 })
        .expect(404);

      expect(response.body.success).toBe(false);
    });
  });

  // ============================================================
  // GET /api/canvas/:id/versions - Version History
  // ============================================================

  describe('GET /api/canvas/:id/versions', () => {
    it('should return version history for a document', async () => {
      const mockVersions = [
        {
          id: VALID_UUID_2,
          document_id: VALID_UUID,
          content: '# Version 2',
          source: 'user',
          created_at: '2026-02-08T11:00:00.000Z',
        },
        {
          id: '33333333-3333-3333-3333-333333333333',
          document_id: VALID_UUID,
          content: '# Version 1',
          source: 'user',
          created_at: '2026-02-08T10:00:00.000Z',
        },
      ];

      // First: getCanvasDocument check
      mockQuery.mockResolvedValueOnce({ rows: [mockDocument] });
      // Then: getVersionHistory
      mockQuery.mockResolvedValueOnce({ rows: mockVersions });

      const response = await request(app)
        .get(`/api/canvas/${VALID_UUID}/versions`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.versions).toHaveLength(2);
      expect(response.body.versions[0]).toHaveProperty('documentId', VALID_UUID);
      expect(response.body.versions[0]).toHaveProperty('source', 'user');
    });

    it('should return 404 for non-existent document', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .get(`/api/canvas/${VALID_UUID}/versions`)
        .expect(404);

      expect(response.body.success).toBe(false);
    });

    it('should reject invalid UUID', async () => {
      const response = await request(app)
        .get('/api/canvas/bad/versions')
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  // ============================================================
  // POST /api/canvas/:id/restore/:versionId - Restore Version
  // ============================================================

  describe('POST /api/canvas/:id/restore/:versionId', () => {
    it('should restore a specific version', async () => {
      const restoredDoc = { ...mockDocument, content: '# Restored Content' };

      // restoreVersion: get version content
      mockQuery.mockResolvedValueOnce({
        rows: [{ content: '# Restored Content' }],
      });
      // updateCanvasDocument: UPDATE
      mockQuery.mockResolvedValueOnce({ rows: [restoredDoc] });
      // version auto-save (check last)
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // version insert
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // version prune
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .post(`/api/canvas/${VALID_UUID}/restore/${VALID_UUID_2}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.content).toBe('# Restored Content');
    });

    it('should return 404 for non-existent version', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

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
