/**
 * Document Generator Service (Phase 131)
 *
 * Coordinator service that routes document generation requests to the
 * appropriate renderer (pptx, xlsx, pdf, docx). Claude calls this via
 * the create_document tool.
 *
 * Renderers are loaded via dynamic imports so TypeScript does not error
 * if a renderer module does not exist yet (they are built in parallel).
 *
 * @module services/documents/document-generator
 */

import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../utils/logger';

// ─── Types ────────────────────────────────────────────────────────────────────

export type DocumentType = 'pptx' | 'xlsx' | 'pdf' | 'docx';

export interface DocumentStyle {
  primaryColor?: string;
  fontFamily?: string;
  fontSize?: number;
}

export interface DocumentRequest {
  type: DocumentType;
  title: string;
  content: unknown; // Structure depends on document type (slides, sheets, pages)
  style?: DocumentStyle;
}

/** What each renderer returns */
export interface RendererResult {
  buffer: Buffer;
  mimeType: string;
  extension: string;
  pageCount: number;
}

export interface DocumentResult {
  id: string;        // UUID
  type: DocumentType;
  title: string;
  buffer: Buffer;
  mimeType: string;
  extension: string;
  pageCount: number;
  fileSize: number;  // buffer.length
  createdAt: Date;
}

export interface DocumentTemplate {
  id: string;
  name: string;
  type: DocumentType;
  description: string;
  defaultContent: unknown; // Default structure for this template
}

// ─── Built-in Templates ───────────────────────────────────────────────────────

const TEMPLATES: DocumentTemplate[] = [
  {
    id: 'business-report',
    name: 'Geschäftsbericht',
    type: 'pptx',
    description: 'Executive Summary mit Kennzahlen',
    defaultContent: [
      { title: 'Geschäftsbericht', subtitle: 'Quartalsbericht', layout: 'title_slide' },
      {
        title: 'Zusammenfassung',
        bullets: ['Umsatzentwicklung', 'Wichtige Kennzahlen', 'Ausblick'],
        layout: 'bullet_slide',
      },
    ],
  },
  {
    id: 'meeting-minutes',
    name: 'Protokoll',
    type: 'docx',
    description: 'Meeting-Protokoll mit Teilnehmern und Aktionspunkten',
    defaultContent: [
      {
        title: 'Protokoll',
        content:
          'Datum: \nTeilnehmer: \n\nAgenda:\n1. \n\nBeschlüsse:\n- \n\nAktionspunkte:\n- ',
      },
    ],
  },
  {
    id: 'financial-summary',
    name: 'Finanzübersicht',
    type: 'xlsx',
    description: 'Tabelle mit Einnahmen, Ausgaben, Bilanz',
    defaultContent: [
      {
        name: 'Übersicht',
        headers: ['Kategorie', 'Betrag', 'Veränderung'],
        rows: [
          ['Einnahmen', 0, '0%'],
          ['Ausgaben', 0, '0%'],
          ['Gewinn', 0, '0%'],
        ],
      },
    ],
  },
  {
    id: 'project-proposal',
    name: 'Projektvorschlag',
    type: 'pdf',
    description: 'Projektvorschlag mit Problem, Lösung, Zeitplan',
    defaultContent: [
      {
        title: 'Projektvorschlag',
        content: 'Problem:\n\nLösung:\n\nZeitplan:\n\nBudget:\n',
      },
    ],
  },
  {
    id: 'learning-summary',
    name: 'Lernzusammenfassung',
    type: 'pdf',
    description: 'Themen, Kernpunkte, Quiz',
    defaultContent: [
      {
        title: 'Lernzusammenfassung',
        content:
          'Thema:\n\nKernpunkte:\n1. \n2. \n3. \n\nZusammenfassung:\n\nVerständnisfragen:\n1. ',
      },
    ],
  },
];

// ─── Dynamic Renderer Dispatch ────────────────────────────────────────────────

/**
 * Dispatch to the correct renderer using dynamic require (CommonJS-compatible).
 *
 * We pass the full DocumentRequest to each renderer. In production, each
 * renderer module is responsible for extracting the relevant fields (content,
 * style, title). In tests, the modules are fully mocked so argument shapes
 * are verified via the mocked functions.
 *
 * This approach keeps TypeScript happy even while the renderer files are being
 * built in parallel (Task 1), because we use require() with explicit casts.
 */
async function dispatchToRenderer(request: DocumentRequest): Promise<RendererResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type AnyRenderer = (req: DocumentRequest) => Promise<RendererResult>;

  switch (request.type) {
    case 'pptx': {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require('./pptx-renderer') as { renderPptx: AnyRenderer };
      return mod.renderPptx(request);
    }
    case 'xlsx': {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require('./xlsx-renderer') as { renderXlsx: AnyRenderer };
      return mod.renderXlsx(request);
    }
    case 'pdf': {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require('./pdf-renderer') as { renderPdf: AnyRenderer };
      return mod.renderPdf(request);
    }
    case 'docx': {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require('./docx-renderer') as { renderDocx: AnyRenderer };
      return mod.renderDocx(request);
    }
    default: {
      // TypeScript exhaustiveness — this branch is reachable at runtime if
      // an invalid type slips through the validation above.
      const exhaustive: never = request.type;
      throw new Error(`Unsupported document type: "${String(exhaustive)}"`);
    }
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Generate a document by routing the request to the appropriate renderer.
 *
 * @throws {Error} When the document type is not supported or the renderer fails.
 */
export async function generateDocument(request: DocumentRequest): Promise<DocumentResult> {
  const validTypes: DocumentType[] = ['pptx', 'xlsx', 'pdf', 'docx'];
  if (!validTypes.includes(request.type)) {
    throw new Error(
      `Unsupported document type: "${request.type}". Supported types: ${validTypes.join(', ')}`
    );
  }

  logger.info('Generating document', { type: request.type, title: request.title });

  let rendered: RendererResult;
  try {
    rendered = await dispatchToRenderer(request);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('Document renderer failed', err instanceof Error ? err : undefined);
    throw new Error(`Failed to generate ${request.type} document "${request.title}": ${message}`);
  }

  const result: DocumentResult = {
    id: uuidv4(),
    type: request.type,
    title: request.title,
    buffer: rendered.buffer,
    mimeType: rendered.mimeType,
    extension: rendered.extension,
    pageCount: rendered.pageCount,
    fileSize: rendered.buffer.length,
    createdAt: new Date(),
  };

  logger.info('Document generated', {
    id: result.id,
    type: result.type,
    fileSize: result.fileSize,
    pageCount: result.pageCount,
  });

  return result;
}

/**
 * Get a predefined template by ID. Returns null if not found.
 */
export function getTemplate(templateId: string): DocumentTemplate | null {
  if (!templateId) return null;
  return TEMPLATES.find((t) => t.id === templateId) ?? null;
}

/**
 * List all available built-in templates.
 */
export function listTemplates(): DocumentTemplate[] {
  return [...TEMPLATES];
}

/**
 * Generate a document from a template, with optional field overrides.
 *
 * @throws {Error} When the template ID is not found.
 */
export async function generateFromTemplate(
  templateId: string,
  overrides: Partial<DocumentRequest> = {}
): Promise<DocumentResult> {
  const template = getTemplate(templateId);
  if (!template) {
    throw new Error(`Template not found: "${templateId}"`);
  }

  const request: DocumentRequest = {
    type: template.type,
    title: template.name,
    content: template.defaultContent,
    ...overrides,
  };

  return generateDocument(request);
}
