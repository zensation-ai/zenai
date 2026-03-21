/**
 * Document Analysis Service Tests
 *
 * Tests for document analysis pipeline, caching, follow-up questions,
 * history CRUD, custom templates, validation utilities, and error handling.
 */

// Mock logger
jest.mock('../../../utils/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

// Mock database
const mockQuery = jest.fn();
jest.mock('../../../utils/database', () => ({
  query: (...args: unknown[]) => mockQuery(...args),
}));

// Mock Claude client
const mockCreate = jest.fn();
const mockStream = jest.fn();
jest.mock('../../../services/claude/client', () => ({
  getClaudeClient: () => ({
    messages: {
      create: (...args: unknown[]) => mockCreate(...args),
      stream: (...args: unknown[]) => mockStream(...args),
    },
  }),
  executeWithProtection: async (fn: () => Promise<unknown>) => fn(),
  CLAUDE_MODEL: 'claude-sonnet-4-20250514',
}));

jest.mock('../../../services/claude/streaming', () => ({
  setupSSEHeaders: jest.fn(),
}));

// Mock document-parsing module
const mockBuildMessageContent = jest.fn();
const mockParseSections = jest.fn();
const mockExtractKeyFindings = jest.fn();
const mockExtractMermaidDiagrams = jest.fn();
jest.mock('../../../services/document-analysis/document-parsing', () => ({
  buildMessageContent: (...args: unknown[]) => mockBuildMessageContent(...args),
  parseSections: (...args: unknown[]) => mockParseSections(...args),
  extractKeyFindings: (...args: unknown[]) => mockExtractKeyFindings(...args),
  extractMermaidDiagrams: (...args: unknown[]) => mockExtractMermaidDiagrams(...args),
}));

import {
  documentAnalysis,
  isValidDocumentType,
  validateFileMagicNumber,
  getDocumentTypeLabel,
} from '../../../services/document-analysis/index';

// ===========================================
// Helpers
// ===========================================

function makeMockClaudeResponse(text: string) {
  return {
    content: [{ type: 'text', text }],
    usage: { input_tokens: 100, output_tokens: 200 },
  };
}

// ===========================================
// Tests
// ===========================================

describe('DocumentAnalysisService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockBuildMessageContent.mockResolvedValue({
      content: [{ type: 'text', text: 'Document content here' }],
      sheetInfo: undefined,
    });
    mockParseSections.mockReturnValue([
      { title: 'Summary', content: 'Test summary', type: 'text' },
    ]);
    mockExtractKeyFindings.mockReturnValue(['Finding 1', 'Finding 2']);
    mockExtractMermaidDiagrams.mockReturnValue([]);
    mockCreate.mockResolvedValue(makeMockClaudeResponse('Analysis result text'));
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
  });

  // -------------------------------------------
  // Core Analysis
  // -------------------------------------------

  describe('analyze', () => {
    const buffer = Buffer.from('test pdf content');
    const filename = 'test.pdf';
    const mimeType = 'application/pdf' as const;

    it('should analyze a document and return result', async () => {
      const result = await documentAnalysis.analyze(buffer, filename, mimeType);

      expect(result.success).toBe(true);
      expect(result.filename).toBe('test.pdf');
      expect(result.documentType).toBe('PDF');
      expect(result.analysis).toBe('Analysis result text');
      expect(result.sections).toHaveLength(1);
      expect(result.keyFindings).toHaveLength(2);
      expect(result.metadata.fileSize).toBe(buffer.length);
      expect(result.metadata.mimeType).toBe('application/pdf');
      expect(result.metadata.processingTimeMs).toBeGreaterThanOrEqual(0);
      expect(result.metadata.tokenUsage).toEqual({ input: 100, output: 200 });
    });

    it('should use default template "general"', async () => {
      await documentAnalysis.analyze(buffer, filename, mimeType);
      expect(mockBuildMessageContent).toHaveBeenCalledWith(
        buffer, filename, mimeType, 'general', undefined, undefined, 'de'
      );
    });

    it('should pass custom prompt and language', async () => {
      await documentAnalysis.analyze(buffer, filename, mimeType, {
        customPrompt: 'Analyze this',
        language: 'en',
        template: 'financial',
        context: 'business',
      });
      expect(mockBuildMessageContent).toHaveBeenCalledWith(
        buffer, filename, mimeType, 'financial', 'Analyze this', 'business', 'en'
      );
    });

    it('should return failure result on Claude API error', async () => {
      mockCreate.mockRejectedValue(new Error('API rate limited'));

      const result = await documentAnalysis.analyze(buffer, filename, mimeType);
      expect(result.success).toBe(false);
      expect(result.analysis).toBe('');
      expect(result.sections).toHaveLength(0);
      expect(result.keyFindings).toHaveLength(0);
    });

    it('should cache document after analysis', async () => {
      const cacheKey = documentAnalysis.computeCacheKey(buffer);
      await documentAnalysis.analyze(buffer, filename, mimeType);
      expect(documentAnalysis.isCached(cacheKey)).toBe(true);
    });
  });

  // -------------------------------------------
  // Follow-up Questions
  // -------------------------------------------

  describe('followUp', () => {
    it('should answer follow-up using cached document', async () => {
      const buffer = Buffer.from('cached document');
      const cacheKey = documentAnalysis.computeCacheKey(buffer);

      // First analyze to populate cache
      await documentAnalysis.analyze(buffer, 'doc.pdf', 'application/pdf');

      // Now follow-up
      mockCreate.mockResolvedValue(makeMockClaudeResponse('Follow-up answer'));
      const result = await documentAnalysis.followUp(cacheKey, 'What about X?');

      expect(result.success).toBe(true);
      expect(result.answer).toBe('Follow-up answer');
      expect(result.cached).toBe(true);
      expect(result.tokenUsage).toEqual({ input: 100, output: 200 });
    });

    it('should return error if document not in cache', async () => {
      const result = await documentAnalysis.followUp('nonexistent-key', 'Question?');

      expect(result.success).toBe(false);
      expect(result.answer).toContain('nicht mehr im Cache');
      expect(result.cached).toBe(false);
    });

    it('should handle follow-up API errors gracefully', async () => {
      const buffer = Buffer.from('cached doc for error test');
      const cacheKey = documentAnalysis.computeCacheKey(buffer);
      await documentAnalysis.analyze(buffer, 'doc.pdf', 'application/pdf');

      mockCreate.mockRejectedValue(new Error('API error'));
      const result = await documentAnalysis.followUp(cacheKey, 'Question?');

      expect(result.success).toBe(false);
      expect(result.cached).toBe(true);
    });
  });

  // -------------------------------------------
  // Multi-Document Comparison
  // -------------------------------------------

  describe('compareDocuments', () => {
    it('should compare 2 documents', async () => {
      const docs = [
        { buffer: Buffer.from('doc1'), filename: 'a.pdf', mimeType: 'application/pdf' as const },
        { buffer: Buffer.from('doc2'), filename: 'b.pdf', mimeType: 'application/pdf' as const },
      ];

      const result = await documentAnalysis.compareDocuments(docs);
      expect(result.success).toBe(true);
      expect(result.filename).toContain('vs.');
      expect(result.documentType).toBe('Vergleich');
    });

    it('should reject less than 2 documents', async () => {
      const docs = [
        { buffer: Buffer.from('doc1'), filename: 'a.pdf', mimeType: 'application/pdf' as const },
      ];

      const result = await documentAnalysis.compareDocuments(docs);
      expect(result.success).toBe(false);
    });

    it('should reject more than 3 documents', async () => {
      const docs = Array(4).fill(null).map((_, i) => ({
        buffer: Buffer.from(`doc${i}`),
        filename: `${i}.pdf`,
        mimeType: 'application/pdf' as const,
      }));

      const result = await documentAnalysis.compareDocuments(docs);
      expect(result.success).toBe(false);
    });

    it('should handle comparison API error', async () => {
      mockCreate.mockRejectedValue(new Error('Comparison failed'));
      const docs = [
        { buffer: Buffer.from('doc1'), filename: 'a.pdf', mimeType: 'application/pdf' as const },
        { buffer: Buffer.from('doc2'), filename: 'b.pdf', mimeType: 'application/pdf' as const },
      ];

      const result = await documentAnalysis.compareDocuments(docs);
      expect(result.success).toBe(false);
    });
  });

  // -------------------------------------------
  // Analysis History (Database)
  // -------------------------------------------

  describe('saveToHistory', () => {
    it('should save analysis result to database', async () => {
      mockQuery.mockResolvedValue({ rows: [{ id: 'analysis-123' }] });

      const result = {
        success: true,
        filename: 'test.pdf',
        documentType: 'PDF',
        analysis: 'Analysis text',
        sections: [],
        keyFindings: [],
        metadata: { fileSize: 1000, mimeType: 'application/pdf', processingTimeMs: 500 },
      };

      const id = await documentAnalysis.saveToHistory(result, 'general', 'work');
      expect(id).toBe('analysis-123');
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it('should return null on database error', async () => {
      mockQuery.mockRejectedValue(new Error('DB error'));

      const result = {
        success: true, filename: 'test.pdf', documentType: 'PDF',
        analysis: '', sections: [], keyFindings: [],
        metadata: { fileSize: 0, mimeType: 'application/pdf', processingTimeMs: 0 },
      };

      const id = await documentAnalysis.saveToHistory(result, 'general');
      expect(id).toBeNull();
    });
  });

  describe('getHistory', () => {
    it('should return history entries with total count', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: '1', filename: 'a.pdf' }] })
        .mockResolvedValueOnce({ rows: [{ total: '5' }] });

      const history = await documentAnalysis.getHistory('work', 20, 0);
      expect(history.entries).toHaveLength(1);
      expect(history.total).toBe(5);
    });

    it('should return empty on database error', async () => {
      mockQuery.mockRejectedValue(new Error('DB error'));
      const history = await documentAnalysis.getHistory();
      expect(history.entries).toHaveLength(0);
      expect(history.total).toBe(0);
    });
  });

  describe('getAnalysisById', () => {
    it('should return analysis by ID', async () => {
      mockQuery.mockResolvedValue({ rows: [{ id: '1', filename: 'test.pdf' }] });
      const result = await documentAnalysis.getAnalysisById('1');
      expect(result).toBeDefined();
      expect(result?.filename).toBe('test.pdf');
    });

    it('should return null if not found', async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      const result = await documentAnalysis.getAnalysisById('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('deleteFromHistory', () => {
    it('should return true on successful delete', async () => {
      mockQuery.mockResolvedValue({ rowCount: 1 });
      const result = await documentAnalysis.deleteFromHistory('1');
      expect(result).toBe(true);
    });

    it('should return false if not found', async () => {
      mockQuery.mockResolvedValue({ rowCount: 0 });
      const result = await documentAnalysis.deleteFromHistory('nonexistent');
      expect(result).toBe(false);
    });
  });

  // -------------------------------------------
  // Custom Templates CRUD
  // -------------------------------------------

  describe('Custom templates', () => {
    it('should list custom templates', async () => {
      mockQuery.mockResolvedValue({ rows: [{ id: '1', name: 'My Template' }] });
      const templates = await documentAnalysis.getCustomTemplates('work');
      expect(templates).toHaveLength(1);
    });

    it('should create a custom template', async () => {
      const newTemplate = { id: '1', name: 'Test', system_prompt: 'sys', instruction: 'inst' };
      mockQuery.mockResolvedValue({ rows: [newTemplate] });

      const result = await documentAnalysis.createCustomTemplate({
        name: 'Test',
        system_prompt: 'sys',
        instruction: 'inst',
      });
      expect(result?.name).toBe('Test');
    });

    it('should update a custom template', async () => {
      mockQuery.mockResolvedValue({ rows: [{ id: '1', name: 'Updated' }] });
      const result = await documentAnalysis.updateCustomTemplate('1', { name: 'Updated' });
      expect(result?.name).toBe('Updated');
    });

    it('should return existing template if no updates provided', async () => {
      mockQuery.mockResolvedValue({ rows: [{ id: '1', name: 'Existing' }] });
      const result = await documentAnalysis.updateCustomTemplate('1', {});
      expect(result).toBeDefined();
    });

    it('should delete a custom template', async () => {
      mockQuery.mockResolvedValue({ rowCount: 1 });
      const result = await documentAnalysis.deleteCustomTemplate('1');
      expect(result).toBe(true);
    });
  });

  // -------------------------------------------
  // Cache Management
  // -------------------------------------------

  describe('Cache management', () => {
    it('should compute cache key as sha256 hex substring', () => {
      const buffer = Buffer.from('test content');
      const key = documentAnalysis.computeCacheKey(buffer);
      expect(key).toHaveLength(16);
      expect(/^[a-f0-9]+$/.test(key)).toBe(true);
    });

    it('should report cache not found for unknown keys', () => {
      expect(documentAnalysis.isCached('unknown-key')).toBe(false);
    });

    it('should clean expired cache entries', async () => {
      // Analyze to populate cache
      const buffer = Buffer.from('cache-test');
      await documentAnalysis.analyze(buffer, 'test.pdf', 'application/pdf');

      // Cache should be populated
      expect(documentAnalysis.getCacheSize()).toBeGreaterThan(0);

      // Clean - nothing should be expired yet (within TTL)
      const cleaned = documentAnalysis.cleanCache();
      expect(cleaned).toBe(0);
    });

    it('should return current cache size', () => {
      const size = documentAnalysis.getCacheSize();
      expect(typeof size).toBe('number');
    });
  });

  // -------------------------------------------
  // Validation Utilities
  // -------------------------------------------

  describe('isValidDocumentType', () => {
    it('should accept PDF', () => {
      expect(isValidDocumentType('application/pdf')).toBe(true);
    });

    it('should accept XLSX', () => {
      expect(isValidDocumentType('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).toBe(true);
    });

    it('should accept CSV', () => {
      expect(isValidDocumentType('text/csv')).toBe(true);
    });

    it('should reject unsupported types', () => {
      expect(isValidDocumentType('image/png')).toBe(false);
      expect(isValidDocumentType('text/plain')).toBe(false);
      expect(isValidDocumentType('application/json')).toBe(false);
    });
  });

  describe('validateFileMagicNumber', () => {
    it('should validate PDF magic number', () => {
      const pdfBuffer = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2D]);
      expect(validateFileMagicNumber(pdfBuffer, 'application/pdf')).toBe(true);
    });

    it('should reject invalid PDF magic number', () => {
      const notPdf = Buffer.from([0x00, 0x01, 0x02, 0x03]);
      expect(validateFileMagicNumber(notPdf, 'application/pdf')).toBe(false);
    });

    it('should validate XLSX magic number (PK ZIP)', () => {
      const xlsxBuffer = Buffer.from([0x50, 0x4B, 0x03, 0x04, 0x14]);
      expect(validateFileMagicNumber(xlsxBuffer, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).toBe(true);
    });

    it('should accept CSV without magic number check', () => {
      const csvBuffer = Buffer.from('name,value\na,1');
      expect(validateFileMagicNumber(csvBuffer, 'text/csv')).toBe(true);
    });

    it('should reject too-short buffers', () => {
      const shortBuffer = Buffer.from([0x25]);
      expect(validateFileMagicNumber(shortBuffer, 'application/pdf')).toBe(false);
    });

    it('should reject unknown MIME types without CSV exception', () => {
      const buffer = Buffer.from('random');
      expect(validateFileMagicNumber(buffer, 'application/json')).toBe(false);
    });
  });

  describe('getDocumentTypeLabel', () => {
    it('should return PDF for pdf mime type', () => {
      expect(getDocumentTypeLabel('application/pdf')).toBe('PDF');
    });

    it('should return Excel for xlsx', () => {
      expect(getDocumentTypeLabel('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).toBe('Excel (XLSX)');
    });

    it('should return CSV for csv', () => {
      expect(getDocumentTypeLabel('text/csv')).toBe('CSV');
    });

    it('should return Unbekannt for unknown types', () => {
      expect(getDocumentTypeLabel('application/unknown')).toBe('Unbekannt');
    });
  });

  // -------------------------------------------
  // Service Availability
  // -------------------------------------------

  describe('isAvailable', () => {
    it('should return true when Claude client is available', () => {
      expect(documentAnalysis.isAvailable()).toBe(true);
    });
  });
});
