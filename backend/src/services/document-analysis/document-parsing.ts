/**
 * Document Parsing & Content Extraction
 *
 * Standalone functions for parsing documents (PDF, Excel, CSV)
 * and extracting structured content from analysis text.
 */

import Anthropic from '@anthropic-ai/sdk';
import * as XLSX from 'xlsx';
import type {
  DocumentMediaType,
  AnalysisTemplate,
  AnalysisSection,
  DocumentAnalysisResult,
} from './types';
import { ANALYSIS_TEMPLATES } from './templates';

// ===========================================
// Document Content Building
// ===========================================

/**
 * Build message content based on file type
 */
export function buildMessageContent(
  buffer: Buffer,
  filename: string,
  mimeType: DocumentMediaType,
  template: AnalysisTemplate,
  customPrompt?: string,
  context?: string,
  language?: string
): {
  content: Anthropic.MessageCreateParams['messages'][0]['content'];
  sheetInfo?: DocumentAnalysisResult['metadata']['sheetInfo'];
} {
  const templateConfig = ANALYSIS_TEMPLATES[template];
  const instruction = customPrompt || templateConfig.instruction;
  const langNote = language === 'en' ? '\n\nRespond in English.' : '';

  let sheetInfo: DocumentAnalysisResult['metadata']['sheetInfo'];

  if (mimeType === 'application/pdf') {
    // PDF: Use native Claude document content block
    const content: Anthropic.MessageCreateParams['messages'][0]['content'] = [
      {
        type: 'document',
        source: {
          type: 'base64',
          media_type: 'application/pdf',
          data: buffer.toString('base64'),
        },
      } as Anthropic.DocumentBlockParam,
      {
        type: 'text',
        text: `[Dokument: ${filename}]${context ? `\n[Kontext: ${context}]` : ''}\n\n${instruction}${langNote}`,
      },
    ];

    return { content };
  }

  // Excel and CSV: Parse to text first
  let documentText: string;

  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    mimeType === 'application/vnd.ms-excel'
  ) {
    const parsed = parseExcel(buffer);
    documentText = parsed.text;
    sheetInfo = parsed.sheetInfo;
  } else {
    documentText = parseCsv(buffer);
  }

  // Truncate if extremely long (protect against token limit)
  const maxChars = 100000;
  const truncated = documentText.length > maxChars;
  const text = truncated
    ? documentText.substring(0, maxChars) + '\n\n[... Dokument gekürzt, weitere Daten verfügbar ...]'
    : documentText;

  const content: Anthropic.MessageCreateParams['messages'][0]['content'] = [
    {
      type: 'text',
      text: `[Dokument: ${filename}]${context ? `\n[Kontext: ${context}]` : ''}${truncated ? '\n[Hinweis: Dokument wurde aufgrund der Größe gekürzt]' : ''}\n\n--- DOKUMENT-INHALT ---\n${text}\n--- ENDE DOKUMENT ---\n\n${instruction}${langNote}`,
    },
  ];

  return { content, sheetInfo };
}

// ===========================================
// File Parsing
// ===========================================

/**
 * Parse Excel file to structured text
 */
export function parseExcel(buffer: Buffer): {
  text: string;
  sheetInfo: NonNullable<DocumentAnalysisResult['metadata']['sheetInfo']>;
} {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetInfo: NonNullable<DocumentAnalysisResult['metadata']['sheetInfo']> = [];
  const parts: string[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown as unknown[][];
    const rows = jsonData;

    // Track sheet info
    const colCount = rows.length > 0 ? Math.max(...rows.map((r) => (r as unknown[]).length)) : 0;
    sheetInfo.push({
      name: sheetName,
      rows: rows.length,
      columns: colCount,
    });

    parts.push(`## Sheet: ${sheetName}`);
    parts.push(`(${rows.length} Zeilen, ${colCount} Spalten)\n`);

    if (rows.length === 0) {
      parts.push('(Leer)\n');
      continue;
    }

    // Convert to Markdown table for better Claude comprehension
    const headers = (rows[0] as unknown[]).map((h) => String(h ?? ''));
    parts.push('| ' + headers.join(' | ') + ' |');
    parts.push('| ' + headers.map(() => '---').join(' | ') + ' |');

    // Limit rows for very large sheets (first 500 rows)
    const maxRows = 500;
    const dataRows = rows.slice(1, maxRows + 1);
    for (const row of dataRows) {
      const cells = (row as unknown[]).map((c) => String(c ?? ''));
      parts.push('| ' + cells.join(' | ') + ' |');
    }

    if (rows.length > maxRows + 1) {
      parts.push(`\n... (${rows.length - maxRows - 1} weitere Zeilen nicht angezeigt)`);
    }

    parts.push('');
  }

  return { text: parts.join('\n'), sheetInfo };
}

/**
 * Parse CSV buffer to text
 */
export function parseCsv(buffer: Buffer): string {
  const text = buffer.toString('utf-8');
  const lines = text.split('\n').filter((line) => line.trim());

  if (lines.length === 0) {return '(Leere CSV-Datei)';}

  // Detect separator (comma, semicolon, tab)
  const firstLine = lines[0];
  const separators = [',', ';', '\t'];
  const separator = separators.reduce((best, sep) => {
    return (firstLine.split(sep).length > firstLine.split(best).length) ? sep : best;
  }, ',');

  // Convert to Markdown table
  const parts: string[] = [];
  const headers = firstLine.split(separator).map((h) => h.trim().replace(/^"|"$/g, ''));
  parts.push('| ' + headers.join(' | ') + ' |');
  parts.push('| ' + headers.map(() => '---').join(' | ') + ' |');

  const maxRows = 500;
  const dataLines = lines.slice(1, maxRows + 1);
  for (const line of dataLines) {
    const cells = line.split(separator).map((c) => c.trim().replace(/^"|"$/g, ''));
    parts.push('| ' + cells.join(' | ') + ' |');
  }

  if (lines.length > maxRows + 1) {
    parts.push(`\n... (${lines.length - maxRows - 1} weitere Zeilen nicht angezeigt)`);
  }

  return parts.join('\n');
}

// ===========================================
// Content Extraction
// ===========================================

/**
 * Parse Markdown sections from analysis text
 */
export function parseSections(text: string): AnalysisSection[] {
  const sections: AnalysisSection[] = [];
  const lines = text.split('\n');
  let currentTitle = '';
  let currentContent: string[] = [];

  for (const line of lines) {
    const headerMatch = line.match(/^#{1,3}\s+(.+)/);
    if (headerMatch) {
      // Save previous section
      if (currentTitle && currentContent.length > 0) {
        const content = currentContent.join('\n').trim();
        sections.push({
          title: currentTitle,
          content,
          type: detectSectionType(content),
        });
      }
      currentTitle = headerMatch[1].replace(/\*\*/g, '').trim();
      currentContent = [];
    } else {
      currentContent.push(line);
    }
  }

  // Save last section
  if (currentTitle && currentContent.length > 0) {
    const content = currentContent.join('\n').trim();
    sections.push({
      title: currentTitle,
      content,
      type: detectSectionType(content),
    });
  }

  return sections;
}

/**
 * Detect section type based on content
 */
function detectSectionType(content: string): AnalysisSection['type'] {
  if (content.includes('|') && content.includes('---')) {return 'table';}
  if (content.match(/^[\s]*[-*]\s/m)) {return 'list';}
  if (content.match(/\b\d+[.,]\d+\s*[€$%]/)) {return 'kpi';}
  return 'text';
}

/**
 * Extract key findings from analysis text
 */
export function extractKeyFindings(text: string): string[] {
  const findings: string[] = [];

  // Look for bullet points with emphasis
  const emphasisPattern = /[-*]\s+\*\*([^*]+)\*\*/g;
  let match;
  while ((match = emphasisPattern.exec(text)) !== null) {
    findings.push(match[1].trim());
  }

  // If no emphasized bullets, take first few bullet points
  if (findings.length === 0) {
    const bulletPattern = /^[-*]\s+(.+)/gm;
    let bulletCount = 0;
    while ((match = bulletPattern.exec(text)) !== null && bulletCount < 5) {
      findings.push(match[1].trim());
      bulletCount++;
    }
  }

  return findings.slice(0, 10);
}

/**
 * Extract Mermaid diagram code blocks from analysis text.
 * Returns array of { title, content } for each mermaid block found.
 */
export function extractMermaidDiagrams(text: string): Array<{ title: string; content: string }> {
  const diagrams: Array<{ title: string; content: string }> = [];
  const mermaidPattern = /```mermaid\s*\n([\s\S]*?)```/g;
  let match;
  let index = 0;

  while ((match = mermaidPattern.exec(text)) !== null) {
    index++;
    const content = match[1].trim();
    // Try to detect diagram type for title
    let title = `Diagramm ${index}`;
    if (content.startsWith('pie')) {title = `Kreisdiagramm ${index}`;}
    else if (content.startsWith('graph') || content.startsWith('flowchart')) {title = `Flussdiagramm ${index}`;}
    else if (content.startsWith('sequenceDiagram')) {title = `Sequenzdiagramm ${index}`;}
    else if (content.startsWith('gantt')) {title = `Gantt-Diagramm ${index}`;}
    else if (content.startsWith('classDiagram')) {title = `Klassendiagramm ${index}`;}
    else if (content.startsWith('xychart-beta') || content.startsWith('bar')) {title = `Balkendiagramm ${index}`;}

    diagrams.push({ title, content });
  }

  return diagrams;
}
