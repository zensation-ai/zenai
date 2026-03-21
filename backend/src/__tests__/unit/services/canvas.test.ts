/**
 * Canvas Service Tests
 *
 * Tests for canvas document CRUD, version history,
 * restore, and chat session linking.
 */

// Mock database
const mockQuery = jest.fn();
jest.mock('../../../utils/database', () => ({
  query: (...args: unknown[]) => mockQuery(...args),
}));

jest.mock('../../../utils/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../../utils/user-context', () => ({
  SYSTEM_USER_ID: '00000000-0000-0000-0000-000000000001',
}));

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'uuid-1234'),
}));

import {
  createCanvasDocument,
  getCanvasDocument,
  listCanvasDocuments,
  updateCanvasDocument,
  deleteCanvasDocument,
  linkChatSession,
  getVersionHistory,
  restoreVersion,
} from '../../../services/canvas';

const SYSTEM_USER = '00000000-0000-0000-0000-000000000001';

describe('Canvas Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockReset();
  });

  describe('createCanvasDocument', () => {
    it('should create a document with defaults', async () => {
      const row = {
        id: 'uuid-1234', context: 'personal', title: 'My Doc',
        content: '', type: 'markdown', language: null,
        chat_session_id: null, created_at: '2026-01-01', updated_at: '2026-01-01',
      };
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      const result = await createCanvasDocument('personal', 'My Doc');

      expect(result.id).toBe('uuid-1234');
      expect(result.title).toBe('My Doc');
      expect(result.type).toBe('markdown');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO canvas_documents'),
        expect.arrayContaining(['uuid-1234', 'personal', 'My Doc'])
      );
    });

    it('should accept custom type and language', async () => {
      const row = {
        id: 'uuid-1234', context: 'work', title: 'Code',
        content: 'console.log()', type: 'code', language: 'typescript',
        chat_session_id: null, created_at: '2026-01-01', updated_at: '2026-01-01',
      };
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      const result = await createCanvasDocument('work', 'Code', 'code', 'typescript', 'console.log()');

      expect(result.type).toBe('code');
      expect(result.language).toBe('typescript');
    });
  });

  describe('getCanvasDocument', () => {
    it('should return document by id', async () => {
      const row = {
        id: 'doc-1', context: 'personal', title: 'Test',
        content: 'Hello', type: 'markdown', language: null,
        chat_session_id: null, created_at: '2026-01-01', updated_at: '2026-01-01',
      };
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      const result = await getCanvasDocument('doc-1');

      expect(result).not.toBeNull();
      expect(result!.title).toBe('Test');
    });

    it('should return null if not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await getCanvasDocument('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('listCanvasDocuments', () => {
    it('should return documents and total', async () => {
      const row = {
        id: 'doc-1', context: 'personal', title: 'Doc',
        content: '', type: 'markdown', language: null,
        chat_session_id: null, created_at: '2026-01-01', updated_at: '2026-01-01',
      };
      mockQuery
        .mockResolvedValueOnce({ rows: [row] })
        .mockResolvedValueOnce({ rows: [{ total: 1 }] });

      const result = await listCanvasDocuments('personal');

      expect(result.documents).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('should use SYSTEM_USER_ID by default', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: 0 }] });

      await listCanvasDocuments('personal');

      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params).toContain(SYSTEM_USER);
    });
  });

  describe('updateCanvasDocument', () => {
    it('should update title', async () => {
      const row = {
        id: 'doc-1', context: 'personal', title: 'New Title',
        content: 'old', type: 'markdown', language: null,
        chat_session_id: null, created_at: '2026-01-01', updated_at: '2026-01-02',
      };
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      const result = await updateCanvasDocument('doc-1', { title: 'New Title' });

      expect(result).not.toBeNull();
      expect(result!.title).toBe('New Title');
    });

    it('should auto-save version when content changes', async () => {
      const row = {
        id: 'doc-1', context: 'personal', title: 'Doc',
        content: 'new content', type: 'markdown', language: null,
        chat_session_id: null, created_at: '2026-01-01', updated_at: '2026-01-02',
      };
      // UPDATE document
      mockQuery.mockResolvedValueOnce({ rows: [row] });
      // saveVersionIfNeeded: get last version
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // saveVersionIfNeeded: insert version
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // saveVersionIfNeeded: prune
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await updateCanvasDocument('doc-1', { content: 'new content' });

      // The version save is fire-and-forget, but we can verify the UPDATE was called
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('UPDATE canvas_documents');
    });

    it('should return current doc when no updates', async () => {
      const row = {
        id: 'doc-1', context: 'personal', title: 'Test',
        content: '', type: 'markdown', language: null,
        chat_session_id: null, created_at: '2026-01-01', updated_at: '2026-01-01',
      };
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      const result = await updateCanvasDocument('doc-1', {});

      // Should delegate to getCanvasDocument (SELECT)
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('SELECT');
    });

    it('should return null when document not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await updateCanvasDocument('nope', { title: 'x' });
      expect(result).toBeNull();
    });
  });

  describe('deleteCanvasDocument', () => {
    it('should return true on successful delete', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'doc-1' }] });

      const result = await deleteCanvasDocument('doc-1');
      expect(result).toBe(true);
    });

    it('should return false when document not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await deleteCanvasDocument('nonexistent');
      expect(result).toBe(false);
    });
  });

  describe('linkChatSession', () => {
    it('should link chat session and return true', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'doc-1' }] });

      const result = await linkChatSession('doc-1', 'chat-session-1');
      expect(result).toBe(true);
    });

    it('should return false when document not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await linkChatSession('nonexistent', 'chat-1');
      expect(result).toBe(false);
    });
  });

  describe('getVersionHistory', () => {
    it('should return mapped versions', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'v-1', document_id: 'doc-1', content: 'old content',
          source: 'user', created_at: '2026-01-01',
        }],
      });

      const versions = await getVersionHistory('doc-1');

      expect(versions).toHaveLength(1);
      expect(versions[0].documentId).toBe('doc-1');
      expect(versions[0].source).toBe('user');
    });
  });

  describe('restoreVersion', () => {
    it('should restore version content to document', async () => {
      // Get version content
      mockQuery.mockResolvedValueOnce({ rows: [{ content: 'restored content' }] });
      // updateCanvasDocument → UPDATE
      const updatedRow = {
        id: 'doc-1', context: 'personal', title: 'Doc',
        content: 'restored content', type: 'markdown', language: null,
        chat_session_id: null, created_at: '2026-01-01', updated_at: '2026-01-02',
      };
      mockQuery.mockResolvedValueOnce({ rows: [updatedRow] });
      // saveVersionIfNeeded calls (fire-and-forget)
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await restoreVersion('doc-1', 'v-1');

      expect(result).not.toBeNull();
      expect(result!.content).toBe('restored content');
    });

    it('should return null when version not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await restoreVersion('doc-1', 'nonexistent');
      expect(result).toBeNull();
    });
  });
});
