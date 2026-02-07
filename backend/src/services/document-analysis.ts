/**
 * Document Analysis Service
 *
 * Analyzes documents (PDF, Excel, CSV) using Claude AI.
 * - PDFs: Native Claude document content block (no parsing library needed)
 * - Excel: Parsed via xlsx library, then sent as text to Claude
 * - CSV: Parsed natively, sent as text to Claude
 *
 * @module services/document-analysis
 */

import Anthropic from '@anthropic-ai/sdk';
import * as XLSX from 'xlsx';
import { logger } from '../utils/logger';
import { getClaudeClient, executeWithProtection, CLAUDE_MODEL } from './claude/client';

// ===========================================
// Types & Interfaces
// ===========================================

/** Supported document MIME types */
export type DocumentMediaType =
  | 'application/pdf'
  | 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  | 'application/vnd.ms-excel'
  | 'text/csv';

/** Analysis template types */
export type AnalysisTemplate =
  | 'general'
  | 'financial'
  | 'contract'
  | 'data'
  | 'summary';

/** Document analysis request options */
export interface DocumentAnalysisOptions {
  /** Analysis template to use */
  template?: AnalysisTemplate;
  /** Custom analysis prompt (overrides template) */
  customPrompt?: string;
  /** Language for response */
  language?: 'de' | 'en';
  /** Maximum tokens for response */
  maxTokens?: number;
  /** Additional context about the document */
  context?: string;
}

/** Structured section in analysis result */
export interface AnalysisSection {
  title: string;
  content: string;
  type: 'text' | 'table' | 'list' | 'kpi';
}

/** Document analysis result */
export interface DocumentAnalysisResult {
  success: boolean;
  /** Document filename */
  filename: string;
  /** Document type */
  documentType: string;
  /** Main analysis text (Markdown formatted) */
  analysis: string;
  /** Structured sections for Artifact output */
  sections: AnalysisSection[];
  /** Extracted key data points */
  keyFindings: string[];
  /** Processing metadata */
  metadata: {
    fileSize: number;
    mimeType: string;
    processingTimeMs: number;
    tokenUsage?: {
      input: number;
      output: number;
    };
    /** For Excel: sheet names and row counts */
    sheetInfo?: Array<{
      name: string;
      rows: number;
      columns: number;
    }>;
  };
}

// ===========================================
// Analysis Templates
// ===========================================

const ANALYSIS_TEMPLATES: Record<AnalysisTemplate, { system: string; instruction: string }> = {
  general: {
    system: `Du bist ein professioneller Dokumentanalytiker. Analysiere Dokumente gründlich und strukturiert.
Antworte in klar strukturiertem Markdown mit Überschriften, Listen und Tabellen wo passend.`,
    instruction: `Analysiere dieses Dokument umfassend:

1. **Zusammenfassung**: Worum geht es? (2-3 Sätze)
2. **Hauptinhalte**: Die wichtigsten Punkte und Informationen
3. **Schlüsseldaten**: Relevante Zahlen, Daten, Namen, Fakten
4. **Struktur**: Wie ist das Dokument aufgebaut?
5. **Auffälligkeiten**: Besonderheiten, Inkonsistenzen, fehlende Informationen

Formatiere deine Antwort in klarem Markdown.`,
  },

  financial: {
    system: `Du bist ein Finanzanalytiker. Analysiere Finanzdokumente und Tabellen mit Fokus auf KPIs, Trends und Auffälligkeiten.
Antworte strukturiert mit Markdown-Tabellen und klaren Kennzahlen.`,
    instruction: `Führe eine Finanzanalyse dieses Dokuments durch:

1. **Executive Summary**: Kernaussage in 2-3 Sätzen
2. **KPIs / Kennzahlen**: Alle relevanten Finanzkennzahlen als Tabelle
3. **Trends**: Erkennbare Entwicklungen und Veränderungen
4. **Vergleiche**: Periodenvergleiche, wenn Daten vorhanden
5. **Auffälligkeiten**: Ungewöhnliche Werte, Risiken, Chancen
6. **Empfehlungen**: Handlungsempfehlungen basierend auf den Daten

Nutze Markdown-Tabellen für Kennzahlen. Formatiere Währungsbeträge korrekt.`,
  },

  contract: {
    system: `Du bist ein Vertragsanalytiker. Analysiere Verträge und rechtliche Dokumente mit Fokus auf Schlüsselklauseln, Fristen und Risiken.
Antworte strukturiert und präzise.`,
    instruction: `Analysiere diesen Vertrag / dieses rechtliche Dokument:

1. **Übersicht**: Art des Dokuments, Vertragsparteien, Datum
2. **Kernvereinbarungen**: Hauptpflichten und Leistungen
3. **Fristen & Termine**: Alle relevanten Daten und Fristen
4. **Finanzielle Konditionen**: Beträge, Zahlungsbedingungen
5. **Schlüsselklauseln**: Wichtige vertragliche Regelungen
6. **Risiken & Hinweise**: Potenzielle Risiken, ungewöhnliche Klauseln
7. **Zusammenfassung**: Kernaussage in 2-3 Sätzen

Markiere besonders wichtige Punkte deutlich.`,
  },

  data: {
    system: `Du bist ein Datenanalytiker. Analysiere Datensätze und Tabellen mit statistischem Fokus.
Erstelle aussagekräftige Zusammenfassungen mit Kennzahlen und Mustern.`,
    instruction: `Analysiere diesen Datensatz:

1. **Datenübersicht**: Umfang, Spalten, Datentypen, Zeitraum
2. **Statistische Kennzahlen**: Min, Max, Durchschnitt, Median (als Tabelle)
3. **Verteilungen**: Wie sind die Daten verteilt?
4. **Muster & Trends**: Erkennbare Zusammenhänge und Entwicklungen
5. **Ausreißer**: Ungewöhnliche Datenpunkte
6. **Datenqualität**: Fehlende Werte, Inkonsistenzen
7. **Erkenntnisse**: Top 3-5 Insights aus den Daten

Nutze Markdown-Tabellen für statistische Kennzahlen.`,
  },

  summary: {
    system: `Du bist ein professioneller Zusammenfasser. Erstelle prägnante, informative Zusammenfassungen.`,
    instruction: `Erstelle eine strukturierte Zusammenfassung dieses Dokuments:

1. **Titel / Thema**: Worum geht es?
2. **Kernaussagen**: Die 3-5 wichtigsten Punkte
3. **Schlüsseldaten**: Relevante Zahlen und Fakten
4. **Fazit**: 2-3 Sätze Gesamtbewertung

Halte die Zusammenfassung prägnant und auf das Wesentliche fokussiert.`,
  },
};

// ===========================================
// Supported File Types
// ===========================================

const SUPPORTED_MIME_TYPES: DocumentMediaType[] = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
];

const MIME_TYPE_LABELS: Record<DocumentMediaType, string> = {
  'application/pdf': 'PDF',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Excel (XLSX)',
  'application/vnd.ms-excel': 'Excel (XLS)',
  'text/csv': 'CSV',
};

/** Magic number signatures for file type validation */
const MAGIC_SIGNATURES: Record<string, Buffer[]> = {
  'application/pdf': [Buffer.from([0x25, 0x50, 0x44, 0x46])], // %PDF
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': [
    Buffer.from([0x50, 0x4B, 0x03, 0x04]), // PK (ZIP)
  ],
  'application/vnd.ms-excel': [
    Buffer.from([0xD0, 0xCF, 0x11, 0xE0]), // OLE2
  ],
};

// ===========================================
// Document Analysis Service
// ===========================================

class DocumentAnalysisService {
  private _client: Anthropic | null = null;

  private get client(): Anthropic {
    if (!this._client) {
      this._client = getClaudeClient();
    }
    return this._client;
  }

  /**
   * Analyze a document (PDF, Excel, CSV)
   */
  async analyze(
    buffer: Buffer,
    filename: string,
    mimeType: DocumentMediaType,
    options: DocumentAnalysisOptions = {}
  ): Promise<DocumentAnalysisResult> {
    const startTime = Date.now();
    const {
      template = 'general',
      customPrompt,
      language = 'de',
      maxTokens = 4096,
      context,
    } = options;

    logger.info('Document analysis starting', {
      filename,
      mimeType,
      fileSize: buffer.length,
      template,
    });

    try {
      // Build the message content based on file type
      const { content, sheetInfo } = await this.buildMessageContent(
        buffer,
        filename,
        mimeType,
        template,
        customPrompt,
        context,
        language
      );

      // Call Claude API
      const response = await executeWithProtection(async () => {
        const templateConfig = ANALYSIS_TEMPLATES[template];
        let systemPrompt = templateConfig.system;
        if (language === 'en') {
          systemPrompt += '\n\nRespond in English.';
        }

        return this.client.messages.create({
          model: CLAUDE_MODEL,
          max_tokens: maxTokens,
          temperature: 0.2,
          system: systemPrompt,
          messages: [{ role: 'user', content }],
        });
      });

      // Extract response text
      const analysisText = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('\n\n');

      // Parse sections and key findings from the analysis
      const sections = this.parseSections(analysisText);
      const keyFindings = this.extractKeyFindings(analysisText);

      const processingTimeMs = Date.now() - startTime;

      logger.info('Document analysis complete', {
        filename,
        processingTimeMs,
        sectionsFound: sections.length,
        keyFindings: keyFindings.length,
      });

      return {
        success: true,
        filename,
        documentType: MIME_TYPE_LABELS[mimeType],
        analysis: analysisText,
        sections,
        keyFindings,
        metadata: {
          fileSize: buffer.length,
          mimeType,
          processingTimeMs,
          tokenUsage: {
            input: response.usage.input_tokens,
            output: response.usage.output_tokens,
          },
          sheetInfo,
        },
      };
    } catch (error) {
      const processingTimeMs = Date.now() - startTime;
      logger.error('Document analysis failed', error instanceof Error ? error : undefined, {
        filename,
        mimeType,
        processingTimeMs,
      });

      return {
        success: false,
        filename,
        documentType: MIME_TYPE_LABELS[mimeType],
        analysis: '',
        sections: [],
        keyFindings: [],
        metadata: {
          fileSize: buffer.length,
          mimeType,
          processingTimeMs,
        },
      };
    }
  }

  /**
   * Build message content based on file type
   */
  private async buildMessageContent(
    buffer: Buffer,
    filename: string,
    mimeType: DocumentMediaType,
    template: AnalysisTemplate,
    customPrompt?: string,
    context?: string,
    language?: string
  ): Promise<{
    content: Anthropic.MessageCreateParams['messages'][0]['content'];
    sheetInfo?: DocumentAnalysisResult['metadata']['sheetInfo'];
  }> {
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
      const parsed = this.parseExcel(buffer);
      documentText = parsed.text;
      sheetInfo = parsed.sheetInfo;
    } else {
      documentText = this.parseCsv(buffer);
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

  /**
   * Parse Excel file to structured text
   */
  private parseExcel(buffer: Buffer): {
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
  private parseCsv(buffer: Buffer): string {
    const text = buffer.toString('utf-8');
    const lines = text.split('\n').filter((line) => line.trim());

    if (lines.length === 0) return '(Leere CSV-Datei)';

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

  /**
   * Parse Markdown sections from analysis text
   */
  private parseSections(text: string): AnalysisSection[] {
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
            type: this.detectSectionType(content),
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
        type: this.detectSectionType(content),
      });
    }

    return sections;
  }

  /**
   * Detect section type based on content
   */
  private detectSectionType(content: string): AnalysisSection['type'] {
    if (content.includes('|') && content.includes('---')) return 'table';
    if (content.match(/^[\s]*[-*]\s/m)) return 'list';
    if (content.match(/\b\d+[.,]\d+\s*[€$%]/)) return 'kpi';
    return 'text';
  }

  /**
   * Extract key findings from analysis text
   */
  private extractKeyFindings(text: string): string[] {
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
   * Check if service is available
   */
  isAvailable(): boolean {
    try {
      getClaudeClient();
      return true;
    } catch {
      return false;
    }
  }
}

// ===========================================
// Validation Utilities
// ===========================================

/**
 * Check if MIME type is a supported document type
 */
export function isValidDocumentType(mimeType: string): mimeType is DocumentMediaType {
  return SUPPORTED_MIME_TYPES.includes(mimeType as DocumentMediaType);
}

/**
 * Validate file by checking magic number bytes
 */
export function validateFileMagicNumber(buffer: Buffer, mimeType: string): boolean {
  const signatures = MAGIC_SIGNATURES[mimeType];
  if (!signatures) {
    // CSV has no magic number - accept based on MIME type
    return mimeType === 'text/csv';
  }

  return signatures.some((sig) => {
    if (buffer.length < sig.length) return false;
    return sig.every((byte, i) => buffer[i] === byte);
  });
}

/**
 * Get human-readable label for document type
 */
export function getDocumentTypeLabel(mimeType: string): string {
  return MIME_TYPE_LABELS[mimeType as DocumentMediaType] || 'Unbekannt';
}

// ===========================================
// Singleton Export
// ===========================================

export const documentAnalysis = new DocumentAnalysisService();
