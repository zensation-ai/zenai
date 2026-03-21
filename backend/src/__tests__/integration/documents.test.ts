/**
 * Integration Tests for Documents API
 *
 * Tests document CRUD, search, folders, and batch operations.
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

jest.mock('../../utils/database-context', () => ({
  queryContext: jest.fn(),
  isValidContext: jest.fn((ctx: string) => ['personal', 'work', 'learning', 'creative'].includes(ctx)),
  isValidUUID: jest.fn((id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)),
  AIContext: {},
}));

const mockListDocuments = jest.fn();
const mockGetDocument = jest.fn();
const mockUploadDocument = jest.fn();
const mockDeleteDocument = jest.fn();
const mockUpdateDocument = jest.fn();
const mockSearchDocuments = jest.fn();
const mockGetFolders = jest.fn();
const mockCreateFolder = jest.fn();
const mockDeleteFolder = jest.fn();
const mockGetStats = jest.fn();
const mockMoveToFolder = jest.fn();
const mockAddTags = jest.fn();
const mockLinkToIdea = jest.fn();
const mockAutoAssignTopic = jest.fn();
const mockReprocessDocument = jest.fn();

jest.mock('../../services/document-service', () => ({
  documentService: {
    listDocuments: (...args: unknown[]) => mockListDocuments(...args),
    getDocument: (...args: unknown[]) => mockGetDocument(...args),
    uploadDocument: (...args: unknown[]) => mockUploadDocument(...args),
    deleteDocument: (...args: unknown[]) => mockDeleteDocument(...args),
    updateDocument: (...args: unknown[]) => mockUpdateDocument(...args),
    searchDocuments: (...args: unknown[]) => mockSearchDocuments(...args),
    getFolders: (...args: unknown[]) => mockGetFolders(...args),
    createFolder: (...args: unknown[]) => mockCreateFolder(...args),
    deleteFolder: (...args: unknown[]) => mockDeleteFolder(...args),
    getStats: (...args: unknown[]) => mockGetStats(...args),
    moveToFolder: (...args: unknown[]) => mockMoveToFolder(...args),
    addTags: (...args: unknown[]) => mockAddTags(...args),
    linkToIdea: (...args: unknown[]) => mockLinkToIdea(...args),
    autoAssignTopic: (...args: unknown[]) => mockAutoAssignTopic(...args),
    reprocessDocument: (...args: unknown[]) => mockReprocessDocument(...args),
  },
  Document: {},
  DocumentFilters: {},
}));

const mockFindSimilarDocuments = jest.fn();
jest.mock('../../services/document-rag', () => ({
  documentRAGService: {
    findSimilarDocuments: (...args: unknown[]) => mockFindSimilarDocuments(...args),
  },
}));

const mockProcessDocument = jest.fn();
const mockGetSupportedExtensions = jest.fn();
jest.mock('../../services/document-processing', () => ({
  documentProcessingService: {
    processDocument: (...args: unknown[]) => mockProcessDocument(...args),
    getSupportedExtensions: (...args: unknown[]) => mockGetSupportedExtensions(...args),
  },
}));

import documentsRouter from '../../routes/documents';
import { errorHandler } from '../../middleware/errorHandler';

describe('Documents API Integration Tests', () => {
  let app: Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api', documentsRouter);
    app.use(errorHandler);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockDoc = {
    id: VALID_UUID,
    title: 'Test Document',
    mimeType: 'application/pdf',
    filePath: '/uploads/documents/test.pdf',
    originalFilename: 'test.pdf',
    summary: 'A test doc',
    pageCount: 5,
    keywords: ['test'],
    primaryTopicId: null,
    context: 'personal' as const,
  };

  // ============================================================
  // GET /:context/documents
  // ============================================================

  describe('GET /:context/documents', () => {
    it('should list documents', async () => {
      mockListDocuments.mockResolvedValueOnce({
        data: [mockDoc],
        total: 1,
        limit: 50,
        offset: 0,
        hasMore: false,
      });

      const res = await request(app)
        .get('/api/personal/documents')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.pagination.total).toBe(1);
    });

    it('should reject invalid context', async () => {
      const res = await request(app)
        .get('/api/invalid/documents')
        .expect(400);

      expect(res.body.success).toBe(false);
    });
  });

  // ============================================================
  // GET /:context/documents/:id
  // ============================================================

  describe('GET /:context/documents/:id', () => {
    it('should return a single document', async () => {
      mockGetDocument.mockResolvedValueOnce(mockDoc);

      const res = await request(app)
        .get(`/api/personal/documents/${VALID_UUID}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.title).toBe('Test Document');
    });

    it('should return 404 for non-existent document', async () => {
      mockGetDocument.mockResolvedValueOnce(null);

      await request(app)
        .get(`/api/personal/documents/${VALID_UUID}`)
        .expect(404);
    });

    it('should reject invalid UUID', async () => {
      await request(app)
        .get('/api/personal/documents/not-a-uuid')
        .expect(400);
    });
  });

  // ============================================================
  // DELETE /:context/documents/:id
  // ============================================================

  describe('DELETE /:context/documents/:id', () => {
    it('should delete a document', async () => {
      mockDeleteDocument.mockResolvedValueOnce(true);

      const res = await request(app)
        .delete(`/api/personal/documents/${VALID_UUID}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('deleted');
    });

    it('should return 404 when document not found', async () => {
      mockDeleteDocument.mockResolvedValueOnce(false);

      await request(app)
        .delete(`/api/personal/documents/${VALID_UUID}`)
        .expect(404);
    });
  });

  // ============================================================
  // PUT /:context/documents/:id
  // ============================================================

  describe('PUT /:context/documents/:id', () => {
    it('should update document metadata', async () => {
      mockUpdateDocument.mockResolvedValueOnce({ ...mockDoc, title: 'Updated Title' });

      const res = await request(app)
        .put(`/api/personal/documents/${VALID_UUID}`)
        .send({ title: 'Updated Title' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.title).toBe('Updated Title');
    });

    it('should return 404 for non-existent document', async () => {
      mockUpdateDocument.mockResolvedValueOnce(null);

      await request(app)
        .put(`/api/personal/documents/${VALID_UUID}`)
        .send({ title: 'New Title' })
        .expect(404);
    });
  });

  // ============================================================
  // POST /:context/documents/search
  // ============================================================

  describe('POST /:context/documents/search', () => {
    it('should search documents', async () => {
      mockSearchDocuments.mockResolvedValueOnce([mockDoc]);

      const res = await request(app)
        .post('/api/personal/documents/search')
        .send({ query: 'test query' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.query).toBe('test query');
    });

    it('should reject empty query', async () => {
      const res = await request(app)
        .post('/api/personal/documents/search')
        .send({ query: '' })
        .expect(400);

      expect(res.body.success).toBe(false);
    });
  });

  // ============================================================
  // GET /:context/documents/stats
  // ============================================================

  describe('GET /:context/documents/stats', () => {
    it('should return document stats', async () => {
      mockGetStats.mockResolvedValueOnce({ total: 42, byType: { pdf: 20, docx: 22 } });

      const res = await request(app)
        .get('/api/personal/documents/stats')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.total).toBe(42);
    });
  });

  // ============================================================
  // GET /:context/documents/folders
  // ============================================================

  describe('GET /:context/documents/folders', () => {
    it('should return folder structure', async () => {
      mockGetFolders.mockResolvedValueOnce([{ path: '/inbox', count: 5 }]);

      const res = await request(app)
        .get('/api/personal/documents/folders')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
    });
  });

  // ============================================================
  // POST /:context/documents/folders
  // ============================================================

  describe('POST /:context/documents/folders', () => {
    it('should create a folder', async () => {
      mockCreateFolder.mockResolvedValueOnce({ path: '/projects', name: 'Projects' });

      const res = await request(app)
        .post('/api/personal/documents/folders')
        .send({ name: 'Projects' })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Projects');
    });

    it('should reject empty folder name', async () => {
      const res = await request(app)
        .post('/api/personal/documents/folders')
        .send({ name: '' })
        .expect(400);

      expect(res.body.success).toBe(false);
    });
  });
});
