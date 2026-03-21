/**
 * Document Service Tests
 *
 * Tests for document CRUD, folder operations, search,
 * tag management, and statistics.
 */

// Mock all external dependencies
const mockQueryContext = jest.fn();
jest.mock('../../../utils/database-context', () => ({
  queryContext: (...args: unknown[]) => mockQueryContext(...args),
  isValidContext: (c: string) => ['personal', 'work', 'learning', 'creative'].includes(c),
}));

jest.mock('../../../utils/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../../services/document-processing', () => ({
  documentProcessingService: {
    processDocument: jest.fn().mockResolvedValue({ success: true }),
  },
}));

jest.mock('../../../services/ai', () => ({
  generateEmbedding: jest.fn().mockResolvedValue([0.1, 0.2, 0.3]),
}));

jest.mock('../../../utils/embedding', () => ({
  cosineSimilarity: jest.fn(() => 0.85),
}));

jest.mock('../../../utils/user-context', () => ({
  SYSTEM_USER_ID: '00000000-0000-0000-0000-000000000001',
}));

jest.mock('fs/promises', () => ({
  mkdir: jest.fn().mockResolvedValue(undefined),
  writeFile: jest.fn().mockResolvedValue(undefined),
  unlink: jest.fn().mockResolvedValue(undefined),
}));

import { DocumentService } from '../../../services/document-service';
import { generateEmbedding } from '../../../services/ai';
import fs from 'fs/promises';

// ===========================================
// Test Helpers
// ===========================================

const TEST_USER_ID = '11111111-1111-1111-1111-111111111111';

function makeDocRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'doc-001',
    filename: '1711000000-uuid.pdf',
    original_filename: 'report.pdf',
    file_path: '/uploads/documents/1711000000-uuid.pdf',
    storage_provider: 'local',
    file_hash: 'abc123hash',
    mime_type: 'application/pdf',
    file_size: 1024000,
    page_count: 10,
    title: 'Test Document',
    summary: 'A test document summary',
    full_text: 'Full text content of the document...',
    keywords: ['test', 'document'],
    language: 'de',
    context: 'personal',
    primary_topic_id: null,
    folder_path: '/inbox',
    tags: ['important'],
    processing_status: 'completed',
    processing_error: null,
    ocr_confidence: 0.95,
    linked_idea_id: null,
    source_url: null,
    view_count: 5,
    last_viewed_at: '2026-03-20T10:00:00Z',
    is_favorite: false,
    is_archived: false,
    created_at: '2026-03-18T08:00:00Z',
    updated_at: '2026-03-20T10:00:00Z',
    processed_at: '2026-03-18T08:05:00Z',
    ...overrides,
  };
}

// ===========================================
// Tests
// ===========================================

describe('DocumentService', () => {
  let service: DocumentService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryContext.mockReset();
    service = new DocumentService();
  });

  // -------------------------------------------
  // getDocument
  // -------------------------------------------
  describe('getDocument', () => {
    it('should return a document by id', async () => {
      // SELECT
      mockQueryContext.mockResolvedValueOnce({ rows: [makeDocRow()] } as any);
      // UPDATE view count
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);
      // Log access
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      const doc = await service.getDocument('doc-001', 'personal', TEST_USER_ID);
      expect(doc).not.toBeNull();
      expect(doc!.id).toBe('doc-001');
      expect(doc!.title).toBe('Test Document');
      expect(doc!.mimeType).toBe('application/pdf');
    });

    it('should return null for nonexistent document', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      const doc = await service.getDocument('nonexistent', 'personal', TEST_USER_ID);
      expect(doc).toBeNull();
    });

    it('should increment view count on access', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [makeDocRow()] } as any);
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      await service.getDocument('doc-001', 'personal', TEST_USER_ID);

      const updateSql = mockQueryContext.mock.calls[1][1] as string;
      expect(updateSql).toContain('view_count = view_count + 1');
    });

    it('should log document access', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [makeDocRow()] } as any);
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      await service.getDocument('doc-001', 'personal', TEST_USER_ID);

      const logSql = mockQueryContext.mock.calls[2][1] as string;
      expect(logSql).toContain('document_access_log');
    });
  });

  // -------------------------------------------
  // listDocuments
  // -------------------------------------------
  describe('listDocuments', () => {
    it('should list documents with default filters', async () => {
      mockQueryContext
        .mockResolvedValueOnce({ rows: [{ total: '3' }] } as any)
        .mockResolvedValueOnce({ rows: [makeDocRow(), makeDocRow({ id: 'doc-002' }), makeDocRow({ id: 'doc-003' })] } as any);

      const result = await service.listDocuments('personal', {}, TEST_USER_ID);
      expect(result.total).toBe(3);
      expect(result.data).toHaveLength(3);
      expect(result.hasMore).toBe(false);
    });

    it('should filter by folder path', async () => {
      mockQueryContext
        .mockResolvedValueOnce({ rows: [{ total: '1' }] } as any)
        .mockResolvedValueOnce({ rows: [makeDocRow({ folder_path: '/projects' })] } as any);

      await service.listDocuments('personal', { folderPath: '/projects' }, TEST_USER_ID);

      const countSql = mockQueryContext.mock.calls[0][1] as string;
      expect(countSql).toContain('folder_path');
    });

    it('should filter by mime types', async () => {
      mockQueryContext
        .mockResolvedValueOnce({ rows: [{ total: '2' }] } as any)
        .mockResolvedValueOnce({ rows: [makeDocRow(), makeDocRow({ id: 'doc-002' })] } as any);

      await service.listDocuments('personal', { mimeTypes: ['application/pdf'] }, TEST_USER_ID);

      const countSql = mockQueryContext.mock.calls[0][1] as string;
      expect(countSql).toContain('mime_type = ANY');
    });

    it('should filter by tags', async () => {
      mockQueryContext
        .mockResolvedValueOnce({ rows: [{ total: '1' }] } as any)
        .mockResolvedValueOnce({ rows: [makeDocRow()] } as any);

      await service.listDocuments('personal', { tags: ['important'] }, TEST_USER_ID);

      const countSql = mockQueryContext.mock.calls[0][1] as string;
      expect(countSql).toContain('tags &&');
    });

    it('should filter by search term (ILIKE)', async () => {
      mockQueryContext
        .mockResolvedValueOnce({ rows: [{ total: '1' }] } as any)
        .mockResolvedValueOnce({ rows: [makeDocRow()] } as any);

      await service.listDocuments('personal', { search: 'report' }, TEST_USER_ID);

      const countSql = mockQueryContext.mock.calls[0][1] as string;
      expect(countSql).toContain('ILIKE');
    });

    it('should filter by favorites', async () => {
      mockQueryContext
        .mockResolvedValueOnce({ rows: [{ total: '2' }] } as any)
        .mockResolvedValueOnce({ rows: [makeDocRow({ is_favorite: true })] } as any);

      await service.listDocuments('personal', { isFavorite: true }, TEST_USER_ID);

      const countSql = mockQueryContext.mock.calls[0][1] as string;
      expect(countSql).toContain('is_favorite');
    });

    it('should cap limit to 100', async () => {
      mockQueryContext
        .mockResolvedValueOnce({ rows: [{ total: '500' }] } as any)
        .mockResolvedValueOnce({ rows: [] } as any);

      const result = await service.listDocuments('personal', { limit: 999 }, TEST_USER_ID);
      expect(result.limit).toBe(100);
    });

    it('should calculate hasMore correctly', async () => {
      mockQueryContext
        .mockResolvedValueOnce({ rows: [{ total: '50' }] } as any)
        .mockResolvedValueOnce({ rows: Array(10).fill(makeDocRow()) } as any);

      const result = await service.listDocuments('personal', { limit: 10, offset: 0 }, TEST_USER_ID);
      expect(result.hasMore).toBe(true);
    });

    it('should use valid sort fields only', async () => {
      mockQueryContext
        .mockResolvedValueOnce({ rows: [{ total: '1' }] } as any)
        .mockResolvedValueOnce({ rows: [makeDocRow()] } as any);

      await service.listDocuments('personal', { sortBy: 'title', sortOrder: 'asc' }, TEST_USER_ID);

      const listSql = mockQueryContext.mock.calls[1][1] as string;
      expect(listSql).toContain('"title" asc');
    });
  });

  // -------------------------------------------
  // searchDocuments
  // -------------------------------------------
  describe('searchDocuments', () => {
    it('should perform semantic search with embeddings', async () => {
      mockQueryContext
        .mockResolvedValueOnce({
          rows: [
            { id: 'doc-001', title: 'Test', summary: 'Summary', mime_type: 'application/pdf', folder_path: '/inbox', similarity: '0.85' },
          ],
        } as any)
        // logAccess calls
        .mockResolvedValueOnce({ rows: [] } as any);

      const results = await service.searchDocuments('test query', 'personal', {}, TEST_USER_ID);
      expect(results).toHaveLength(1);
      expect(results[0].similarity).toBeCloseTo(0.85);
    });

    it('should fall back to text search when embedding fails', async () => {
      (generateEmbedding as jest.Mock).mockResolvedValueOnce([]);

      mockQueryContext.mockResolvedValueOnce({
        rows: [{ id: 'doc-001', title: 'Test', summary: 'Summary', mime_type: 'application/pdf', folder_path: '/inbox', rank: '5.0' }],
      } as any);

      const results = await service.searchDocuments('test', 'personal', {}, TEST_USER_ID);
      expect(results).toHaveLength(1);
      expect(results[0].similarity).toBeLessThanOrEqual(1);
    });

    it('should fall back to text search when embedding returns null', async () => {
      (generateEmbedding as jest.Mock).mockResolvedValueOnce(null);

      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      const results = await service.searchDocuments('test', 'personal', {}, TEST_USER_ID);
      expect(results).toHaveLength(0);
    });
  });

  // -------------------------------------------
  // updateDocument
  // -------------------------------------------
  describe('updateDocument', () => {
    it('should update title', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [makeDocRow({ title: 'New Title' })],
      } as any);

      const doc = await service.updateDocument('doc-001', 'personal', { title: 'New Title' }, TEST_USER_ID);
      expect(doc).not.toBeNull();
      const sql = mockQueryContext.mock.calls[0][1] as string;
      expect(sql).toContain('title =');
    });

    it('should update multiple fields at once', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [makeDocRow({ title: 'New', is_favorite: true, tags: ['a', 'b'] })],
      } as any);

      await service.updateDocument('doc-001', 'personal', {
        title: 'New',
        isFavorite: true,
        tags: ['a', 'b'],
      }, TEST_USER_ID);

      const sql = mockQueryContext.mock.calls[0][1] as string;
      expect(sql).toContain('title =');
      expect(sql).toContain('is_favorite =');
      expect(sql).toContain('tags =');
    });

    it('should return null if document not found', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      const doc = await service.updateDocument('nonexistent', 'personal', { title: 'X' }, TEST_USER_ID);
      expect(doc).toBeNull();
    });

    it('should return existing document if no updates provided', async () => {
      // getDocument call (no setClauses)
      mockQueryContext.mockResolvedValueOnce({ rows: [makeDocRow()] } as any);
      // view count update
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);
      // log access
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      const doc = await service.updateDocument('doc-001', 'personal', {}, TEST_USER_ID);
      expect(doc).not.toBeNull();
    });
  });

  // -------------------------------------------
  // deleteDocument
  // -------------------------------------------
  describe('deleteDocument', () => {
    it('should delete document and file', async () => {
      // getDocument
      mockQueryContext.mockResolvedValueOnce({ rows: [makeDocRow()] } as any);
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any); // view count
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any); // log access
      // DELETE
      mockQueryContext.mockResolvedValueOnce({ rowCount: 1 } as any);

      const result = await service.deleteDocument('doc-001', 'personal', TEST_USER_ID);
      expect(result).toBe(true);
      expect(fs.unlink).toHaveBeenCalled();
    });

    it('should return false if document not found', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      const result = await service.deleteDocument('nonexistent', 'personal', TEST_USER_ID);
      expect(result).toBe(false);
      expect(fs.unlink).not.toHaveBeenCalled();
    });

    it('should handle file deletion failure gracefully', async () => {
      // getDocument
      mockQueryContext.mockResolvedValueOnce({ rows: [makeDocRow()] } as any);
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);
      // DELETE
      mockQueryContext.mockResolvedValueOnce({ rowCount: 1 } as any);

      (fs.unlink as jest.Mock).mockRejectedValueOnce(new Error('ENOENT'));

      const result = await service.deleteDocument('doc-001', 'personal', TEST_USER_ID);
      expect(result).toBe(true); // Still returns true — DB record is removed
    });
  });

  // -------------------------------------------
  // moveToFolder
  // -------------------------------------------
  describe('moveToFolder', () => {
    it('should move document to new folder', async () => {
      mockQueryContext.mockResolvedValueOnce({ rowCount: 1 } as any);

      const result = await service.moveToFolder('doc-001', '/projects', 'personal', TEST_USER_ID);
      expect(result).toBe(true);
    });

    it('should return false if document not found', async () => {
      mockQueryContext.mockResolvedValueOnce({ rowCount: 0 } as any);

      const result = await service.moveToFolder('nonexistent', '/projects', 'personal', TEST_USER_ID);
      expect(result).toBe(false);
    });
  });

  // -------------------------------------------
  // addTags / removeTags
  // -------------------------------------------
  describe('addTags', () => {
    it('should add tags to document', async () => {
      mockQueryContext.mockResolvedValueOnce({ rowCount: 1 } as any);

      const result = await service.addTags('doc-001', ['new-tag'], 'personal', TEST_USER_ID);
      expect(result).toBe(true);
      const sql = mockQueryContext.mock.calls[0][1] as string;
      expect(sql).toContain('array_cat');
    });
  });

  describe('removeTags', () => {
    it('should remove tags from document', async () => {
      mockQueryContext.mockResolvedValueOnce({ rowCount: 1 } as any);

      const result = await service.removeTags('doc-001', ['old-tag'], 'personal', TEST_USER_ID);
      expect(result).toBe(true);
      const sql = mockQueryContext.mock.calls[0][1] as string;
      expect(sql).toContain('array_remove_all');
    });
  });

  // -------------------------------------------
  // linkToIdea
  // -------------------------------------------
  describe('linkToIdea', () => {
    it('should link document to an idea', async () => {
      mockQueryContext.mockResolvedValueOnce({ rowCount: 1 } as any);

      const result = await service.linkToIdea('doc-001', 'idea-001', 'personal', TEST_USER_ID);
      expect(result).toBe(true);
      const sql = mockQueryContext.mock.calls[0][1] as string;
      expect(sql).toContain('linked_idea_id');
    });
  });

  // -------------------------------------------
  // Folder Operations
  // -------------------------------------------
  describe('getFolders', () => {
    it('should list folders', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [
          { id: 'f1', path: '/inbox', name: 'inbox', parent_path: '/', color: null, icon: null, document_count: 5 },
          { id: 'f2', path: '/projects', name: 'projects', parent_path: '/', color: '#0000ff', icon: '📁', document_count: 3 },
        ],
      } as any);

      const folders = await service.getFolders('personal', TEST_USER_ID);
      expect(folders).toHaveLength(2);
      expect(folders[0].path).toBe('/inbox');
      expect(folders[1].documentCount).toBe(3);
    });
  });

  describe('createFolder', () => {
    it('should create a new folder at root', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [{ id: 'f-new', path: '/reports', name: 'reports', parent_path: '/', color: null, icon: null }],
      } as any);

      const folder = await service.createFolder('personal', 'reports', '/', {}, TEST_USER_ID);
      expect(folder.path).toBe('/reports');
      expect(folder.name).toBe('reports');
    });

    it('should create nested folder', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [{ id: 'f-nested', path: '/projects/alpha', name: 'alpha', parent_path: '/projects', color: null, icon: null }],
      } as any);

      const folder = await service.createFolder('personal', 'alpha', '/projects', {}, TEST_USER_ID);
      expect(folder.parentPath).toBe('/projects');
    });

    it('should throw if no row returned', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      await expect(service.createFolder('personal', 'fail', '/', {}, TEST_USER_ID))
        .rejects.toThrow('Failed to create folder');
    });
  });

  describe('deleteFolder', () => {
    it('should delete folder and move documents to parent', async () => {
      // Get folder info
      mockQueryContext.mockResolvedValueOnce({ rows: [{ parent_path: '/' }] } as any);
      // Move documents to parent
      mockQueryContext.mockResolvedValueOnce({ rowCount: 2 } as any);
      // Delete folder
      mockQueryContext.mockResolvedValueOnce({ rowCount: 1 } as any);

      const result = await service.deleteFolder('/old-folder', 'personal', TEST_USER_ID);
      expect(result).toBe(true);
      expect(mockQueryContext).toHaveBeenCalledTimes(3);
    });

    it('should return false if folder not found', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      const result = await service.deleteFolder('/nonexistent', 'personal', TEST_USER_ID);
      expect(result).toBe(false);
    });
  });

  // -------------------------------------------
  // getStats
  // -------------------------------------------
  describe('getStats', () => {
    it('should return document processing statistics', async () => {
      mockQueryContext
        .mockResolvedValueOnce({
          rows: [{ total: '100', pending: '5', processing: '2', completed: '90', failed: '3', total_size: '102400000' }],
        } as any)
        .mockResolvedValueOnce({
          rows: [
            { mime_type: 'application/pdf', count: '60' },
            { mime_type: 'image/png', count: '30' },
            { mime_type: 'text/plain', count: '10' },
          ],
        } as any);

      const stats = await service.getStats('personal', TEST_USER_ID);
      expect(stats.total).toBe(100);
      expect(stats.pending).toBe(5);
      expect(stats.completed).toBe(90);
      expect(stats.failed).toBe(3);
      expect(stats.totalSize).toBe(102400000);
      expect(stats.byMimeType['application/pdf']).toBe(60);
      expect(stats.byMimeType['image/png']).toBe(30);
    });

    it('should handle zero documents', async () => {
      mockQueryContext
        .mockResolvedValueOnce({
          rows: [{ total: '0', pending: '0', processing: '0', completed: '0', failed: '0', total_size: '0' }],
        } as any)
        .mockResolvedValueOnce({ rows: [] } as any);

      const stats = await service.getStats('personal', TEST_USER_ID);
      expect(stats.total).toBe(0);
      expect(stats.totalSize).toBe(0);
      expect(Object.keys(stats.byMimeType)).toHaveLength(0);
    });
  });

  // -------------------------------------------
  // uploadDocument (deduplication)
  // -------------------------------------------
  describe('uploadDocument', () => {
    it('should return existing document if hash matches (dedup)', async () => {
      // findByHash returns an existing doc
      mockQueryContext.mockResolvedValueOnce({ rows: [makeDocRow()] } as any);

      const file = {
        originalname: 'report.pdf',
        mimetype: 'application/pdf',
        size: 1024,
        buffer: Buffer.from('test content'),
      } as Express.Multer.File;

      const doc = await service.uploadDocument(file, 'personal', {}, TEST_USER_ID);
      expect(doc.id).toBe('doc-001');
      // Should NOT have inserted a new row
      expect(mockQueryContext).toHaveBeenCalledTimes(1);
    });
  });
});
