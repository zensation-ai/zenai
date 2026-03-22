/**
 * PDF Renderer — Phase 131
 *
 * Converts structured PageData JSON into a PDF buffer using pdfmake.
 */

// pdfmake ships its own bundled build + virtual file system (VFS) for fonts.
// The vfs_fonts module exposes font data at top-level keys (not under .pdfMake).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pdfMake: any = require('pdfmake/build/pdfmake');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pdfFonts: any = require('pdfmake/build/vfs_fonts');

// Mount the VFS fonts. The object shape can vary across pdfmake versions.
if (pdfFonts?.pdfMake?.vfs) {
  pdfMake.vfs = pdfFonts.pdfMake.vfs;
} else if (pdfFonts?.vfs) {
  pdfMake.vfs = pdfFonts.vfs;
} else {
  // Fonts stored directly at top level (pdfmake ≥ 0.2.x)
  pdfMake.vfs = pdfFonts;
}

import { logger } from '../../utils/logger';
import type { PageData, DocumentStyle, RenderResult } from './types';

const DEFAULT_PRIMARY = '#1a73e8';
const DEFAULT_FONT = 'Roboto';
const DEFAULT_FONT_SIZE = 12;

/** Call pdfmake's createPdf().getBuffer() which returns a Promise in modern versions. */
async function buildPdf(docDefinition: object): Promise<Buffer> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfDoc = pdfMake.createPdf(docDefinition as any);
  // Modern pdfmake (≥0.2): getBuffer() returns Promise<Buffer>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = await (pdfDoc as any).getBuffer();
  return Buffer.from(raw);
}

export async function renderPdf(
  pages: PageData[],
  title: string,
  style?: DocumentStyle,
): Promise<RenderResult> {
  logger.debug('renderPdf: starting', { pageCount: pages.length, title });

  const primaryColor = style?.primaryColor ?? DEFAULT_PRIMARY;
  const fontSize = style?.fontSize ?? DEFAULT_FONT_SIZE;

  // Build pdfmake content array
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const content: any[] = [];

  // Document title
  if (title) {
    content.push({
      text: title,
      style: 'docTitle',
      marginBottom: 16,
    });
  }

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];

    if (page.title) {
      content.push({
        text: page.title,
        style: 'pageTitle',
        marginBottom: 8,
      });
    }

    // Split on double newline → paragraphs
    const paragraphs = page.content.split(/\n\n+/).filter((p) => p.trim());
    for (const para of paragraphs) {
      content.push({ text: para.trim(), marginBottom: 6 });
    }

    if (page.pageBreakAfter && i < pages.length - 1) {
      content.push({ text: '', pageBreak: 'after' });
    }
  }

  // Ensure we always have at least a placeholder so pdfmake doesn't crash
  if (content.length === 0) {
    content.push({ text: '' });
  }

  const docDefinition = {
    content,
    styles: {
      docTitle: {
        fontSize: fontSize + 10,
        bold: true,
        color: primaryColor,
      },
      pageTitle: {
        fontSize: fontSize + 4,
        bold: true,
        color: primaryColor,
      },
    },
    defaultStyle: {
      font: DEFAULT_FONT,
      fontSize,
    },
  };

  const buffer = await buildPdf(docDefinition);

  logger.info('renderPdf: done', { pageCount: pages.length, bytes: buffer.length });

  return {
    buffer,
    mimeType: 'application/pdf',
    extension: 'pdf',
    pageCount: pages.length,
  };
}
