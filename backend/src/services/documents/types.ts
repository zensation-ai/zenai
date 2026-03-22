/**
 * Shared types for ZenAI document renderers (Phase 131).
 *
 * The two-step pipeline: Claude produces structured JSON conforming to these
 * types → a renderer converts that JSON to a binary file buffer.
 */

export interface SlideData {
  title: string;
  subtitle?: string;
  bullets?: string[];
  layout: 'title_slide' | 'bullet_slide' | 'two_column' | 'image_slide';
  speakerNotes?: string;
}

export interface SheetData {
  name: string;
  headers: string[];
  rows: (string | number)[][];
  chartType?: 'bar' | 'line' | 'pie';
  chartTitle?: string;
}

export interface PageData {
  title?: string;
  /** Markdown-ish content; double newline (\n\n) separates paragraphs. */
  content: string;
  pageBreakAfter?: boolean;
}

export interface DocumentStyle {
  /** Hex colour string, e.g. '#1a73e8'. Default: '#1a73e8'. */
  primaryColor?: string;
  /** Font family name. Default: 'Helvetica'. */
  fontFamily?: string;
  /** Base font size in points. Default: 12. */
  fontSize?: number;
}

export interface RenderResult {
  buffer: Buffer;
  mimeType: string;
  extension: string;
  /** Number of slides / sheets / pages in the output. */
  pageCount: number;
}
