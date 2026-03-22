/**
 * Document Renderers — TDD Test Suite (Phase 131, Task 1)
 *
 * Tests for all four document renderers:
 *   - pptx-renderer (PowerPoint via pptxgenjs)
 *   - xlsx-renderer (Excel via exceljs)
 *   - pdf-renderer  (PDF via pdfmake)
 *   - docx-renderer (Word via docx)
 */

jest.mock('../../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

/**
 * pptxgenjs uses dynamic `import('node:fs')` internally which is incompatible
 * with Jest's CJS transform (requires --experimental-vm-modules).  We mock the
 * entire library so tests exercise our renderer logic without invoking the
 * problematic dynamic imports.  The mock returns a minimal valid ZIP buffer
 * (PPTX is a ZIP archive) so buffer-length assertions work.
 *
 * NOTE: jest.mock() is hoisted before variable declarations, so the fake buffer
 * must be constructed inside the factory closure.
 */
jest.mock('pptxgenjs', () => {
  // Minimal ZIP end-of-central-directory — enough to be a non-empty buffer.
  const fakeBuf = Buffer.from([
    0x50, 0x4b, 0x05, 0x06,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00,
  ]);
  const mockSlide = {
    addText: jest.fn(),
    addShape: jest.fn(),
    addNotes: jest.fn(),
  };
  const mockPptx = {
    layout: 'LAYOUT_16x9',
    ShapeType: { rect: 'rect' },
    addSlide: jest.fn(() => mockSlide),
    write: jest.fn().mockResolvedValue(fakeBuf),
  };
  return jest.fn(() => mockPptx);
});

import { renderPptx } from '../../../../services/documents/pptx-renderer';
import { renderXlsx } from '../../../../services/documents/xlsx-renderer';
import { renderPdf } from '../../../../services/documents/pdf-renderer';
import { renderDocx } from '../../../../services/documents/docx-renderer';
import type { SlideData, SheetData, PageData, DocumentStyle } from '../../../../services/documents/types';

// ─── Shared fixtures ────────────────────────────────────────────────────────

const STYLE: DocumentStyle = {
  primaryColor: '#ff5722',
  fontFamily: 'Helvetica',
  fontSize: 12,
};

const TITLE_SLIDE: SlideData = {
  title: 'ZenAI Overview',
  subtitle: 'Enterprise AI Platform',
  layout: 'title_slide',
  speakerNotes: 'Welcome to ZenAI',
};

const BULLET_SLIDE: SlideData = {
  title: 'Key Features',
  bullets: ['HiMeS Memory', 'GraphRAG', 'Multi-Agent'],
  layout: 'bullet_slide',
};

const TWO_COL_SLIDE: SlideData = {
  title: 'Comparison',
  bullets: ['Left item', 'Right item'],
  layout: 'two_column',
};

const IMAGE_SLIDE: SlideData = {
  title: 'Architecture Diagram',
  layout: 'image_slide',
};

const SHEET: SheetData = {
  name: 'Revenue',
  headers: ['Month', 'Revenue', 'Users'],
  rows: [
    ['Jan', 10000, 500],
    ['Feb', 12000, 620],
  ],
};

const SHEET_WITH_CHART: SheetData = {
  name: 'Trends',
  headers: ['Q', 'Value'],
  rows: [['Q1', 100], ['Q2', 200]],
  chartType: 'bar',
  chartTitle: 'Quarterly Trend',
};

const PAGE: PageData = {
  title: 'Introduction',
  content: 'First paragraph.\n\nSecond paragraph.',
};

const PAGE_WITH_BREAK: PageData = {
  title: 'Section 2',
  content: 'Content here.',
  pageBreakAfter: true,
};

// ─── PPTX ───────────────────────────────────────────────────────────────────

describe('renderPptx', () => {
  it('returns a RenderResult with correct mimeType and extension', async () => {
    const result = await renderPptx([TITLE_SLIDE]);
    expect(result.mimeType).toBe(
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    );
    expect(result.extension).toBe('pptx');
  });

  it('returns a non-empty Buffer', async () => {
    const result = await renderPptx([TITLE_SLIDE]);
    expect(Buffer.isBuffer(result.buffer)).toBe(true);
    expect(result.buffer.length).toBeGreaterThan(0);
  });

  it('sets pageCount equal to the number of slides', async () => {
    const result = await renderPptx([TITLE_SLIDE, BULLET_SLIDE]);
    expect(result.pageCount).toBe(2);
  });

  it('handles empty slides array', async () => {
    const result = await renderPptx([]);
    expect(Buffer.isBuffer(result.buffer)).toBe(true);
    expect(result.pageCount).toBe(0);
  });

  it('renders a single title_slide without error', async () => {
    await expect(renderPptx([TITLE_SLIDE])).resolves.toBeDefined();
  });

  it('renders bullet_slide with bullets', async () => {
    const result = await renderPptx([BULLET_SLIDE]);
    expect(result.pageCount).toBe(1);
    expect(result.buffer.length).toBeGreaterThan(0);
  });

  it('renders two_column layout without error', async () => {
    await expect(renderPptx([TWO_COL_SLIDE])).resolves.toBeDefined();
  });

  it('renders image_slide layout without error', async () => {
    await expect(renderPptx([IMAGE_SLIDE])).resolves.toBeDefined();
  });

  it('respects custom style (primaryColor)', async () => {
    const result = await renderPptx([TITLE_SLIDE], STYLE);
    expect(result.buffer.length).toBeGreaterThan(0);
  });

  it('renders slide with speaker notes', async () => {
    const result = await renderPptx([{ ...TITLE_SLIDE, speakerNotes: 'Speak loudly' }]);
    expect(result.buffer.length).toBeGreaterThan(0);
  });

  it('renders multiple slides of mixed layouts', async () => {
    const slides = [TITLE_SLIDE, BULLET_SLIDE, TWO_COL_SLIDE, IMAGE_SLIDE];
    const result = await renderPptx(slides);
    expect(result.pageCount).toBe(4);
    expect(result.buffer.length).toBeGreaterThan(0);
  });

  it('handles slide with no bullets gracefully', async () => {
    const slide: SlideData = { title: 'Empty', layout: 'bullet_slide' };
    await expect(renderPptx([slide])).resolves.toBeDefined();
  });
});

// ─── XLSX ───────────────────────────────────────────────────────────────────

describe('renderXlsx', () => {
  it('returns correct mimeType and extension', async () => {
    const result = await renderXlsx([SHEET]);
    expect(result.mimeType).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(result.extension).toBe('xlsx');
  });

  it('returns a non-empty Buffer', async () => {
    const result = await renderXlsx([SHEET]);
    expect(Buffer.isBuffer(result.buffer)).toBe(true);
    expect(result.buffer.length).toBeGreaterThan(0);
  });

  it('sets pageCount equal to number of sheets', async () => {
    const result = await renderXlsx([SHEET, SHEET_WITH_CHART]);
    expect(result.pageCount).toBe(2);
  });

  it('handles empty sheets array', async () => {
    const result = await renderXlsx([]);
    expect(Buffer.isBuffer(result.buffer)).toBe(true);
    expect(result.pageCount).toBe(0);
  });

  it('renders a single sheet without error', async () => {
    await expect(renderXlsx([SHEET])).resolves.toBeDefined();
  });

  it('handles sheet with chartType specified', async () => {
    const result = await renderXlsx([SHEET_WITH_CHART]);
    expect(result.buffer.length).toBeGreaterThan(0);
  });

  it('respects custom style parameter', async () => {
    const result = await renderXlsx([SHEET], STYLE);
    expect(result.buffer.length).toBeGreaterThan(0);
  });

  it('renders sheet with empty rows', async () => {
    const emptySheet: SheetData = { name: 'Empty', headers: ['A', 'B'], rows: [] };
    const result = await renderXlsx([emptySheet]);
    expect(result.buffer.length).toBeGreaterThan(0);
  });

  it('renders sheet with mixed string/number cell values', async () => {
    const mixedSheet: SheetData = {
      name: 'Mixed',
      headers: ['Label', 'Value'],
      rows: [['alpha', 1], ['beta', 2.5]],
    };
    const result = await renderXlsx([mixedSheet]);
    expect(result.buffer.length).toBeGreaterThan(0);
  });
});

// ─── PDF ────────────────────────────────────────────────────────────────────

describe('renderPdf', () => {
  it('returns correct mimeType and extension', async () => {
    const result = await renderPdf([PAGE], 'Test Doc');
    expect(result.mimeType).toBe('application/pdf');
    expect(result.extension).toBe('pdf');
  });

  it('returns a non-empty Buffer', async () => {
    const result = await renderPdf([PAGE], 'Test Doc');
    expect(Buffer.isBuffer(result.buffer)).toBe(true);
    expect(result.buffer.length).toBeGreaterThan(0);
  });

  it('sets pageCount equal to number of pages', async () => {
    const result = await renderPdf([PAGE, PAGE_WITH_BREAK], 'Doc');
    expect(result.pageCount).toBe(2);
  });

  it('handles empty pages array', async () => {
    const result = await renderPdf([], 'Empty Doc');
    expect(Buffer.isBuffer(result.buffer)).toBe(true);
    expect(result.pageCount).toBe(0);
  });

  it('renders single page without error', async () => {
    await expect(renderPdf([PAGE], 'Single')).resolves.toBeDefined();
  });

  it('handles pageBreakAfter flag', async () => {
    const result = await renderPdf([PAGE_WITH_BREAK], 'Break Test');
    expect(result.buffer.length).toBeGreaterThan(0);
  });

  it('respects custom style parameter', async () => {
    const result = await renderPdf([PAGE], 'Styled', STYLE);
    expect(result.buffer.length).toBeGreaterThan(0);
  });

  it('renders page without a title', async () => {
    const noTitle: PageData = { content: 'Just text here.' };
    const result = await renderPdf([noTitle], 'Doc');
    expect(result.buffer.length).toBeGreaterThan(0);
  });

  it('buffer starts with PDF magic bytes (%PDF)', async () => {
    const result = await renderPdf([PAGE], 'Magic Test');
    const header = result.buffer.slice(0, 4).toString('ascii');
    expect(header).toBe('%PDF');
  });
}, 30000);

// ─── DOCX ───────────────────────────────────────────────────────────────────

describe('renderDocx', () => {
  it('returns correct mimeType and extension', async () => {
    const result = await renderDocx([PAGE], 'Test Doc');
    expect(result.mimeType).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    expect(result.extension).toBe('docx');
  });

  it('returns a non-empty Buffer', async () => {
    const result = await renderDocx([PAGE], 'Test Doc');
    expect(Buffer.isBuffer(result.buffer)).toBe(true);
    expect(result.buffer.length).toBeGreaterThan(0);
  });

  it('sets pageCount equal to number of pages', async () => {
    const result = await renderDocx([PAGE, PAGE_WITH_BREAK], 'Doc');
    expect(result.pageCount).toBe(2);
  });

  it('handles empty pages array', async () => {
    const result = await renderDocx([], 'Empty Doc');
    expect(Buffer.isBuffer(result.buffer)).toBe(true);
    expect(result.pageCount).toBe(0);
  });

  it('renders single page without error', async () => {
    await expect(renderDocx([PAGE], 'Single')).resolves.toBeDefined();
  });

  it('handles pageBreakAfter flag', async () => {
    const result = await renderDocx([PAGE_WITH_BREAK], 'Break Test');
    expect(result.buffer.length).toBeGreaterThan(0);
  });

  it('respects custom style parameter', async () => {
    const result = await renderDocx([PAGE], 'Styled', STYLE);
    expect(result.buffer.length).toBeGreaterThan(0);
  });

  it('renders page without a title', async () => {
    const noTitle: PageData = { content: 'Just text here.' };
    const result = await renderDocx([noTitle], 'Doc');
    expect(result.buffer.length).toBeGreaterThan(0);
  });

  it('renders multi-paragraph content correctly', async () => {
    const multiPara: PageData = {
      content: 'Para one.\n\nPara two.\n\nPara three.',
    };
    const result = await renderDocx([multiPara], 'Multi');
    expect(result.buffer.length).toBeGreaterThan(0);
  });

  it('buffer starts with DOCX/ZIP magic bytes (PK)', async () => {
    const result = await renderDocx([PAGE], 'Magic Test');
    // DOCX is a ZIP file; starts with PK (0x50 0x4B)
    expect(result.buffer[0]).toBe(0x50);
    expect(result.buffer[1]).toBe(0x4b);
  });
});
