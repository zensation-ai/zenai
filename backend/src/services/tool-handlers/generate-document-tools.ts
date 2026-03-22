/**
 * Document Generation Tool Handler (Phase 131)
 *
 * Implements the Claude Tool Use handler for the `create_document` tool.
 * Claude calls this to generate PPTX, XLSX, PDF, or DOCX files on behalf
 * of the user.
 *
 * Registration note: To register this tool with Claude, add the tool
 * definition to `backend/src/services/claude/tool-definitions.ts` and
 * wire the handler in `backend/src/services/claude/tool-execution.ts`.
 *
 * Tool definition (add to tool-definitions.ts):
 * ```typescript
 * {
 *   name: 'create_document',
 *   description: 'Erstellt ein Dokument (Präsentation, Tabelle, PDF oder Word-Dokument) für den Nutzer.',
 *   input_schema: {
 *     type: 'object',
 *     properties: {
 *       type: {
 *         type: 'string',
 *         enum: ['pptx', 'xlsx', 'pdf', 'docx'],
 *         description: 'Dokumenttyp',
 *       },
 *       title: { type: 'string', description: 'Dokumenttitel' },
 *       content: { description: 'Inhaltsstruktur (abhängig vom Typ)' },
 *       style: {
 *         type: 'object',
 *         description: 'Optionale Gestaltungshinweise',
 *         properties: {
 *           primaryColor: { type: 'string' },
 *           fontFamily: { type: 'string' },
 *           fontSize: { type: 'number' },
 *         },
 *       },
 *     },
 *     required: ['type', 'title', 'content'],
 *   },
 * }
 * ```
 *
 * @module services/tool-handlers/generate-document-tools
 */

import { logger } from '../../utils/logger';
import { generateDocument, type DocumentType } from '../documents/document-generator';

const VALID_TYPES: DocumentType[] = ['pptx', 'xlsx', 'pdf', 'docx'];

const TYPE_LABELS: Record<DocumentType, string> = {
  pptx: 'Präsentation',
  xlsx: 'Tabelle',
  pdf: 'PDF',
  docx: 'Word-Dokument',
};

/**
 * Handle `create_document` Claude tool call.
 *
 * Validates arguments, calls generateDocument, and returns a human-readable
 * success message with file metadata. The buffer is intentionally NOT
 * returned here — the caller should persist the DocumentResult separately.
 */
export async function handleCreateDocument(
  args: Record<string, unknown>
): Promise<string> {
  const { type, title, content, style } = args;

  // Validate required: type
  if (!type) {
    return 'Fehler: Der Parameter "type" ist erforderlich (pptx, xlsx, pdf, docx).';
  }

  // Validate type value
  if (!VALID_TYPES.includes(type as DocumentType)) {
    return `Fehler: Ungültiger Dokumenttyp "${String(type)}". Erlaubte Werte: ${VALID_TYPES.join(', ')}.`;
  }

  // Validate required: title
  if (!title || (typeof title === 'string' && title.trim().length === 0)) {
    return 'Fehler: Der Parameter "title" ist erforderlich.';
  }

  logger.debug('Tool: create_document', { type, title: String(title) });

  try {
    const result = await generateDocument({
      type: type as DocumentType,
      title: String(title),
      content: content ?? [],
      style: style as { primaryColor?: string; fontFamily?: string; fontSize?: number } | undefined,
    });

    const typeLabel = TYPE_LABELS[result.type];
    const kb = (result.fileSize / 1024).toFixed(1);

    return [
      `Dokument erstellt: **${result.title}**`,
      `Typ: ${typeLabel} (.${result.extension})`,
      `Seiten: ${result.pageCount}`,
      `Größe: ${kb} KB`,
      `ID: ${result.id}`,
    ].join('\n');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('Tool create_document failed', err instanceof Error ? err : undefined);
    return `Fehler beim Erstellen des Dokuments: ${message}`;
  }
}
