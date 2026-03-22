/**
 * Tests for Document Generator Service (Phase 131)
 *
 * Uses mocked renderers since they are being built in parallel (Task 1).
 */

import { v4 as uuidv4 } from 'uuid';

jest.mock('../../../../utils/logger', () => ({
  logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

// Mock all 4 renderers
jest.mock('../../../../services/documents/pptx-renderer', () => ({
  renderPptx: jest.fn().mockResolvedValue({
    buffer: Buffer.from('pptx'),
    mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    extension: 'pptx',
    pageCount: 2,
  }),
}));
jest.mock('../../../../services/documents/xlsx-renderer', () => ({
  renderXlsx: jest.fn().mockResolvedValue({
    buffer: Buffer.from('xlsx'),
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    extension: 'xlsx',
    pageCount: 1,
  }),
}));
jest.mock('../../../../services/documents/pdf-renderer', () => ({
  renderPdf: jest.fn().mockResolvedValue({
    buffer: Buffer.from('pdf'),
    mimeType: 'application/pdf',
    extension: 'pdf',
    pageCount: 3,
  }),
}));
jest.mock('../../../../services/documents/docx-renderer', () => ({
  renderDocx: jest.fn().mockResolvedValue({
    buffer: Buffer.from('docx'),
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    extension: 'docx',
    pageCount: 2,
  }),
}));

import {
  generateDocument,
  getTemplate,
  listTemplates,
  generateFromTemplate,
  type DocumentRequest,
} from '../../../../services/documents/document-generator';
import { handleCreateDocument } from '../../../../services/tool-handlers/generate-document-tools';

// Access mocked renderer functions for call verification
const { renderPptx } = jest.requireMock('../../../../services/documents/pptx-renderer');
const { renderXlsx } = jest.requireMock('../../../../services/documents/xlsx-renderer');
const { renderPdf } = jest.requireMock('../../../../services/documents/pdf-renderer');
const { renderDocx } = jest.requireMock('../../../../services/documents/docx-renderer');

describe('generateDocument', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('routes pptx type to renderPptx', async () => {
    const request: DocumentRequest = {
      type: 'pptx',
      title: 'Test Presentation',
      content: [{ title: 'Slide 1', layout: 'title_slide' }],
    };
    const result = await generateDocument(request);
    expect(renderPptx).toHaveBeenCalledTimes(1);
    expect(renderXlsx).not.toHaveBeenCalled();
    expect(renderPdf).not.toHaveBeenCalled();
    expect(renderDocx).not.toHaveBeenCalled();
    expect(result.type).toBe('pptx');
  });

  it('routes xlsx type to renderXlsx', async () => {
    const request: DocumentRequest = {
      type: 'xlsx',
      title: 'Test Spreadsheet',
      content: [{ name: 'Sheet1', headers: ['A', 'B'], rows: [] }],
    };
    const result = await generateDocument(request);
    expect(renderXlsx).toHaveBeenCalledTimes(1);
    expect(renderPptx).not.toHaveBeenCalled();
    expect(result.type).toBe('xlsx');
  });

  it('routes pdf type to renderPdf', async () => {
    const request: DocumentRequest = {
      type: 'pdf',
      title: 'Test PDF',
      content: [{ title: 'Page 1', content: 'Hello world' }],
    };
    const result = await generateDocument(request);
    expect(renderPdf).toHaveBeenCalledTimes(1);
    expect(renderPptx).not.toHaveBeenCalled();
    expect(result.type).toBe('pdf');
  });

  it('routes docx type to renderDocx', async () => {
    const request: DocumentRequest = {
      type: 'docx',
      title: 'Test Document',
      content: [{ title: 'Section 1', content: 'Content here' }],
    };
    const result = await generateDocument(request);
    expect(renderDocx).toHaveBeenCalledTimes(1);
    expect(renderPptx).not.toHaveBeenCalled();
    expect(result.type).toBe('docx');
  });

  it('returns DocumentResult with all required fields for pptx', async () => {
    const request: DocumentRequest = {
      type: 'pptx',
      title: 'My Presentation',
      content: [],
    };
    const result = await generateDocument(request);

    expect(result).toHaveProperty('id');
    expect(result.id).toMatch(/^[0-9a-f-]{36}$/); // UUID format
    expect(result.type).toBe('pptx');
    expect(result.title).toBe('My Presentation');
    expect(result.buffer).toBeInstanceOf(Buffer);
    expect(result.mimeType).toBe('application/vnd.openxmlformats-officedocument.presentationml.presentation');
    expect(result.extension).toBe('pptx');
    expect(result.pageCount).toBe(2);
    expect(result.fileSize).toBe(result.buffer.length);
    expect(result.createdAt).toBeInstanceOf(Date);
  });

  it('returns DocumentResult with all required fields for xlsx', async () => {
    const request: DocumentRequest = { type: 'xlsx', title: 'Budget', content: [] };
    const result = await generateDocument(request);
    expect(result.mimeType).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(result.extension).toBe('xlsx');
    expect(result.pageCount).toBe(1);
    expect(result.fileSize).toBe(result.buffer.length);
  });

  it('returns DocumentResult with all required fields for pdf', async () => {
    const request: DocumentRequest = { type: 'pdf', title: 'Report', content: [] };
    const result = await generateDocument(request);
    expect(result.mimeType).toBe('application/pdf');
    expect(result.extension).toBe('pdf');
    expect(result.pageCount).toBe(3);
  });

  it('returns DocumentResult with all required fields for docx', async () => {
    const request: DocumentRequest = { type: 'docx', title: 'Contract', content: [] };
    const result = await generateDocument(request);
    expect(result.mimeType).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    expect(result.extension).toBe('docx');
    expect(result.pageCount).toBe(2);
  });

  it('passes style to renderer when provided', async () => {
    const request: DocumentRequest = {
      type: 'pptx',
      title: 'Styled Deck',
      content: [],
      style: { primaryColor: '#FF0000', fontFamily: 'Arial', fontSize: 16 },
    };
    await generateDocument(request);
    expect(renderPptx).toHaveBeenCalledWith(
      expect.objectContaining({ style: { primaryColor: '#FF0000', fontFamily: 'Arial', fontSize: 16 } })
    );
  });

  it('throws meaningful error for unknown document type', async () => {
    const request = { type: 'unknown' as never, title: 'Test', content: [] };
    await expect(generateDocument(request)).rejects.toThrow(/unknown|unsupported|type/i);
  });

  it('handles renderer failure gracefully with meaningful error', async () => {
    renderPptx.mockRejectedValueOnce(new Error('PptxGenJS render failed'));
    const request: DocumentRequest = { type: 'pptx', title: 'Failing Deck', content: [] };
    await expect(generateDocument(request)).rejects.toThrow(/render|generate|document/i);
  });

  it('generates unique IDs for each document', async () => {
    const request: DocumentRequest = { type: 'pdf', title: 'Doc', content: [] };
    const result1 = await generateDocument(request);
    const result2 = await generateDocument(request);
    expect(result1.id).not.toBe(result2.id);
  });

  it('sets createdAt to current time', async () => {
    const before = new Date();
    const request: DocumentRequest = { type: 'docx', title: 'Timed Doc', content: [] };
    const result = await generateDocument(request);
    const after = new Date();
    expect(result.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(result.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it('sets fileSize equal to buffer.length', async () => {
    const request: DocumentRequest = { type: 'pdf', title: 'Size Check', content: [] };
    const result = await generateDocument(request);
    expect(result.fileSize).toBe(result.buffer.length);
  });
});

describe('getTemplate', () => {
  it('returns template for valid id "business-report"', () => {
    const template = getTemplate('business-report');
    expect(template).not.toBeNull();
    expect(template!.id).toBe('business-report');
    expect(template!.type).toBe('pptx');
    expect(template!.name).toBe('Geschäftsbericht');
  });

  it('returns template for valid id "meeting-minutes"', () => {
    const template = getTemplate('meeting-minutes');
    expect(template).not.toBeNull();
    expect(template!.type).toBe('docx');
  });

  it('returns template for valid id "financial-summary"', () => {
    const template = getTemplate('financial-summary');
    expect(template).not.toBeNull();
    expect(template!.type).toBe('xlsx');
  });

  it('returns template for valid id "project-proposal"', () => {
    const template = getTemplate('project-proposal');
    expect(template).not.toBeNull();
    expect(template!.type).toBe('pdf');
  });

  it('returns template for valid id "learning-summary"', () => {
    const template = getTemplate('learning-summary');
    expect(template).not.toBeNull();
    expect(template!.type).toBe('pdf');
  });

  it('returns null for unknown template id', () => {
    expect(getTemplate('does-not-exist')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(getTemplate('')).toBeNull();
  });

  it('each template has all required fields', () => {
    const ids = ['business-report', 'meeting-minutes', 'financial-summary', 'project-proposal', 'learning-summary'];
    for (const id of ids) {
      const t = getTemplate(id)!;
      expect(t.id).toBeTruthy();
      expect(t.name).toBeTruthy();
      expect(t.type).toMatch(/^(pptx|xlsx|pdf|docx)$/);
      expect(t.description).toBeTruthy();
      expect(t.defaultContent).toBeDefined();
    }
  });
});

describe('listTemplates', () => {
  it('returns exactly 5 templates', () => {
    const templates = listTemplates();
    expect(templates).toHaveLength(5);
  });

  it('includes all expected template ids', () => {
    const ids = listTemplates().map((t) => t.id);
    expect(ids).toContain('business-report');
    expect(ids).toContain('meeting-minutes');
    expect(ids).toContain('financial-summary');
    expect(ids).toContain('project-proposal');
    expect(ids).toContain('learning-summary');
  });

  it('returns templates covering all document types', () => {
    const types = listTemplates().map((t) => t.type);
    expect(types).toContain('pptx');
    expect(types).toContain('docx');
    expect(types).toContain('xlsx');
    expect(types).toContain('pdf');
  });
});

describe('generateFromTemplate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('generates a document using template defaults', async () => {
    const result = await generateFromTemplate('business-report');
    expect(result.type).toBe('pptx');
    expect(renderPptx).toHaveBeenCalledTimes(1);
  });

  it('applies title override', async () => {
    const result = await generateFromTemplate('business-report', { title: 'Q4 2026 Report' });
    expect(result.title).toBe('Q4 2026 Report');
  });

  it('applies style override', async () => {
    await generateFromTemplate('meeting-minutes', { style: { primaryColor: '#003366' } });
    expect(renderDocx).toHaveBeenCalledWith(
      expect.objectContaining({ style: expect.objectContaining({ primaryColor: '#003366' }) })
    );
  });

  it('uses template default content when no content override given', async () => {
    const template = getTemplate('financial-summary')!;
    await generateFromTemplate('financial-summary');
    expect(renderXlsx).toHaveBeenCalledWith(
      expect.objectContaining({ content: template.defaultContent })
    );
  });

  it('applies content override when provided', async () => {
    const customContent = [{ name: 'Custom', headers: ['X'], rows: [] }];
    await generateFromTemplate('financial-summary', { content: customContent });
    expect(renderXlsx).toHaveBeenCalledWith(
      expect.objectContaining({ content: customContent })
    );
  });

  it('throws error for unknown template id', async () => {
    await expect(generateFromTemplate('no-such-template')).rejects.toThrow(/template|not found/i);
  });

  it('returns DocumentResult with id and createdAt', async () => {
    const result = await generateFromTemplate('project-proposal');
    expect(result.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.createdAt).toBeInstanceOf(Date);
  });
});

describe('handleCreateDocument', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns success string with file info for valid pptx request', async () => {
    const result = await handleCreateDocument({
      type: 'pptx',
      title: 'My Deck',
      content: [{ title: 'Slide 1', layout: 'title_slide' }],
    });
    expect(typeof result).toBe('string');
    expect(result).toMatch(/pptx|presentation/i);
    expect(result).toMatch(/My Deck/);
  });

  it('returns success string with file info for valid pdf request', async () => {
    const result = await handleCreateDocument({
      type: 'pdf',
      title: 'Annual Report',
      content: [{ title: 'Intro', content: 'Text here' }],
    });
    expect(typeof result).toBe('string');
    expect(result).toMatch(/pdf/i);
  });

  it('does not include raw buffer data in response', async () => {
    const result = await handleCreateDocument({
      type: 'docx',
      title: 'Contract',
      content: [],
    });
    // Should be a human-readable string, not binary data
    expect(result).not.toContain('\x00');
    expect(result.length).toBeLessThan(1000);
  });

  it('returns error message when type is missing', async () => {
    const result = await handleCreateDocument({ title: 'No Type', content: [] });
    expect(typeof result).toBe('string');
    expect(result).toMatch(/type|fehler|error|required/i);
  });

  it('returns error message when title is missing', async () => {
    const result = await handleCreateDocument({ type: 'pdf', content: [] });
    expect(typeof result).toBe('string');
    expect(result).toMatch(/title|fehler|error|required/i);
  });

  it('returns error message for invalid document type', async () => {
    const result = await handleCreateDocument({ type: 'invalid', title: 'Test', content: [] });
    expect(typeof result).toBe('string');
    expect(result).toMatch(/type|invalid|ungültig|fehler/i);
  });

  it('returns error message gracefully when renderer fails', async () => {
    renderPptx.mockRejectedValueOnce(new Error('Render crash'));
    const result = await handleCreateDocument({ type: 'pptx', title: 'Broken', content: [] });
    expect(typeof result).toBe('string');
    expect(result).toMatch(/fehler|error/i);
  });

  it('includes file size or page count in success response', async () => {
    const result = await handleCreateDocument({
      type: 'xlsx',
      title: 'Budget Sheet',
      content: [],
    });
    // Should mention something quantitative about the file
    expect(result).toMatch(/\d+/);
  });
});
