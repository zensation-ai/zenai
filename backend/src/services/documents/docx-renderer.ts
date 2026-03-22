/**
 * DOCX Renderer — Phase 131
 *
 * Converts structured PageData JSON into a Word (.docx) buffer using the
 * `docx` npm package.
 */

import { Document, Paragraph, TextRun, HeadingLevel, Packer, PageBreak } from 'docx';
import { logger } from '../../utils/logger';
import type { PageData, DocumentStyle, RenderResult } from './types';

export async function renderDocx(
  pages: PageData[],
  title: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _style?: DocumentStyle,
): Promise<RenderResult> {
  logger.debug('renderDocx: starting', { pageCount: pages.length, title });

  const children: Paragraph[] = [];

  // Document-level title
  if (title) {
    children.push(
      new Paragraph({
        text: title,
        heading: HeadingLevel.HEADING_1,
      }),
    );
  }

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];

    if (page.title) {
      children.push(
        new Paragraph({
          text: page.title,
          heading: HeadingLevel.HEADING_2,
        }),
      );
    }

    // Split on double newline → separate paragraphs
    const paragraphs = page.content.split(/\n\n+/).filter((p) => p.trim());
    for (const para of paragraphs) {
      children.push(
        new Paragraph({
          children: [new TextRun(para.trim())],
        }),
      );
    }

    if (page.pageBreakAfter && i < pages.length - 1) {
      children.push(
        new Paragraph({
          children: [new PageBreak()],
        }),
      );
    }
  }

  const doc = new Document({
    sections: [{ children }],
  });

  const buffer = await Packer.toBuffer(doc);

  logger.info('renderDocx: done', { pageCount: pages.length, bytes: buffer.length });

  return {
    buffer,
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    extension: 'docx',
    pageCount: pages.length,
  };
}
