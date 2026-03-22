/**
 * PPTX Renderer — Phase 131
 *
 * Converts structured SlideData JSON into a PowerPoint (.pptx) buffer using
 * the pptxgenjs library.
 */

import PptxGenJS from 'pptxgenjs';
import { logger } from '../../utils/logger';
import type { SlideData, DocumentStyle, RenderResult } from './types';

const DEFAULT_PRIMARY = '#1a73e8';

/** Strip the leading '#' that pptxgenjs does not accept in color strings. */
function hexColor(color: string): string {
  return color.replace(/^#/, '');
}

export async function renderPptx(
  slides: SlideData[],
  style?: DocumentStyle,
): Promise<RenderResult> {
  logger.debug('renderPptx: starting', { slideCount: slides.length });

  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_16x9';

  const primary = hexColor(style?.primaryColor ?? DEFAULT_PRIMARY);

  for (const slideData of slides) {
    const slide = pptx.addSlide();

    switch (slideData.layout) {
      case 'title_slide': {
        slide.addText(slideData.title, {
          x: 0.5,
          y: 2,
          w: 9,
          h: 1.5,
          fontSize: 36,
          align: 'center',
          bold: true,
          color: primary,
        });
        if (slideData.subtitle) {
          slide.addText(slideData.subtitle, {
            x: 0.5,
            y: 3.5,
            w: 9,
            h: 1,
            fontSize: 18,
            align: 'center',
            color: '666666',
          });
        }
        break;
      }

      case 'two_column': {
        slide.addText(slideData.title, {
          x: 0.5,
          y: 0.3,
          w: 9,
          h: 0.8,
          fontSize: 24,
          bold: true,
          color: primary,
        });
        const bullets = slideData.bullets ?? [];
        const mid = Math.ceil(bullets.length / 2);
        const leftBullets = bullets.slice(0, mid);
        const rightBullets = bullets.slice(mid);

        if (leftBullets.length) {
          slide.addText(
            leftBullets.map((b) => ({ text: b, options: { bullet: true, fontSize: 16 } })),
            { x: 0.5, y: 1.3, w: 4.5, h: 4 },
          );
        }
        if (rightBullets.length) {
          slide.addText(
            rightBullets.map((b) => ({ text: b, options: { bullet: true, fontSize: 16 } })),
            { x: 5, y: 1.3, w: 4.5, h: 4 },
          );
        }
        break;
      }

      case 'image_slide': {
        slide.addText(slideData.title, {
          x: 0.5,
          y: 0.3,
          w: 9,
          h: 0.8,
          fontSize: 24,
          bold: true,
          color: primary,
        });
        // Placeholder rectangle where an image would be inserted
        slide.addShape(pptx.ShapeType.rect, {
          x: 1,
          y: 1.5,
          w: 8,
          h: 4,
          fill: { color: 'E8E8E8' },
          line: { color: 'CCCCCC', width: 1 },
        });
        slide.addText('[Image Placeholder]', {
          x: 1,
          y: 3,
          w: 8,
          h: 1,
          align: 'center',
          color: '999999',
          fontSize: 14,
        });
        break;
      }

      default: {
        // bullet_slide (and any unknown layout falls back here)
        slide.addText(slideData.title, {
          x: 0.5,
          y: 0.3,
          w: 9,
          h: 0.8,
          fontSize: 24,
          bold: true,
          color: primary,
        });
        if (slideData.bullets?.length) {
          const bulletText = slideData.bullets.map((b) => ({
            text: b,
            options: { bullet: true, fontSize: 16 },
          }));
          slide.addText(bulletText, { x: 0.5, y: 1.3, w: 9, h: 4 });
        }
        break;
      }
    }

    if (slideData.speakerNotes) {
      slide.addNotes(slideData.speakerNotes);
    }
  }

  const raw = await pptx.write({ outputType: 'nodebuffer' });
  const buffer = Buffer.from(raw as ArrayBuffer);

  logger.info('renderPptx: done', { slideCount: slides.length, bytes: buffer.length });

  return {
    buffer,
    mimeType:
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    extension: 'pptx',
    pageCount: slides.length,
  };
}
