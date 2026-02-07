/**
 * Document Analysis Service
 *
 * Analyzes documents (PDF, Excel, CSV) using Claude AI.
 * - PDFs: Native Claude document content block (no parsing library needed)
 * - Excel: Parsed via xlsx library, then sent as text to Claude
 * - CSV: Parsed natively, sent as text to Claude
 *
 * Phase 2 additions:
 * - Analysis history persistence (Supabase)
 * - Prompt caching for follow-up questions (~80% token savings)
 * - Multi-document comparison (2-3 documents)
 * - SSE streaming support for real-time progress
 *
 * @module services/document-analysis
 */

import Anthropic from '@anthropic-ai/sdk';
import * as XLSX from 'xlsx';
import crypto from 'crypto';
import { Response } from 'express';
import { logger } from '../utils/logger';
import { query } from '../utils/database';
import { getClaudeClient, executeWithProtection, CLAUDE_MODEL } from './claude/client';
import { setupSSEHeaders } from './claude/streaming';

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

/** Custom analysis template stored in database */
export interface CustomAnalysisTemplate {
  id: string;
  name: string;
  system_prompt: string;
  instruction: string;
  icon: string;
  context: string;
  created_at: string;
  updated_at: string;
}

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
  /** Analysis ID (when saved to DB) */
  id?: string;
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

/** History entry from database */
export interface AnalysisHistoryEntry {
  id: string;
  filename: string;
  file_type: string;
  file_size: number;
  analysis_type: string;
  analysis_result: DocumentAnalysisResult;
  token_usage: { input: number; output: number } | null;
  context: string;
  created_at: string;
}

/** Cached document content for follow-up questions */
interface CachedDocument {
  content: Anthropic.MessageCreateParams['messages'][0]['content'];
  filename: string;
  mimeType: DocumentMediaType;
  systemPrompt: string;
  previousMessages: Anthropic.MessageParam[];
  createdAt: number;
}

/** SSE event for streaming document analysis */
export interface DocumentStreamEvent {
  type: 'progress' | 'content_delta' | 'section' | 'done' | 'error';
  data: {
    stage?: string;
    progress?: number;
    content?: string;
    section?: AnalysisSection;
    result?: DocumentAnalysisResult;
    error?: string;
    metadata?: Record<string, unknown>;
  };
}

// ===========================================
// Analysis Templates
// ===========================================

export const ANALYSIS_TEMPLATES: Record<AnalysisTemplate, { system: string; instruction: string }> = {
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
// Prompt Cache Configuration
// ===========================================

/** Cache TTL: 5 minutes (matches Claude API prompt caching TTL) */
const CACHE_TTL_MS = 5 * 60 * 1000;
/** Maximum cached documents */
const MAX_CACHE_SIZE = 20;

// ===========================================
// Document Analysis Service
// ===========================================

class DocumentAnalysisService {
  private _client: Anthropic | null = null;
  private documentCache: Map<string, CachedDocument> = new Map();

  private get client(): Anthropic {
    if (!this._client) {
      this._client = getClaudeClient();
    }
    return this._client;
  }

  // ===========================================
  // Core Analysis
  // ===========================================

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

      const templateConfig = ANALYSIS_TEMPLATES[template];
      // Support custom system prompt from custom templates
      const customSystemPrompt = (options as DocumentAnalysisOptions & { _customSystemPrompt?: string })._customSystemPrompt;
      let systemPrompt = customSystemPrompt || templateConfig.system;
      if (language === 'en') {
        systemPrompt += '\n\nRespond in English.';
      }

      // For financial and data templates, add Mermaid visualization instruction
      if ((template === 'financial' || template === 'data') && !customSystemPrompt) {
        systemPrompt += `\n\nWenn die Daten es erlauben, erstelle am Ende der Analyse passende Mermaid-Diagramme zur Visualisierung.
Nutze \`\`\`mermaid Code-Blöcke. Beispiele:
- pie title Verteilung für Anteile
- xychart-beta für Zeitreihen/Balken
- flowchart für Prozesse
Erstelle nur Diagramme wenn die Daten sinnvolle Visualisierungen ermöglichen.`;
      }

      // Call Claude API
      const response = await executeWithProtection(async () => {
        return this.client.messages.create({
          model: CLAUDE_MODEL,
          max_tokens: maxTokens,
          temperature: 0.2,
          system: systemPrompt,
          messages: [{ role: 'user', content }],
        });
      });

      // Cache document content for follow-up questions
      const cacheKey = this.computeCacheKey(buffer);
      this.cacheDocument(cacheKey, {
        content,
        filename,
        mimeType,
        systemPrompt,
        previousMessages: [
          { role: 'user', content },
          {
            role: 'assistant',
            content: response.content
              .filter((block): block is Anthropic.TextBlock => block.type === 'text')
              .map((block) => block.text)
              .join('\n\n'),
          },
        ],
        createdAt: Date.now(),
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
        cacheKey,
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

  // ===========================================
  // SSE Streaming Analysis
  // ===========================================

  /**
   * Analyze a document with SSE streaming for real-time progress
   */
  async analyzeStream(
    res: Response,
    buffer: Buffer,
    filename: string,
    mimeType: DocumentMediaType,
    options: DocumentAnalysisOptions = {}
  ): Promise<void> {
    const startTime = Date.now();
    const {
      template = 'general',
      customPrompt,
      language = 'de',
      maxTokens = 4096,
      context,
    } = options;

    setupSSEHeaders(res);

    const sendEvent = (event: DocumentStreamEvent) => {
      res.write(`event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`);
    };

    try {
      // Progress: Starting
      sendEvent({
        type: 'progress',
        data: { stage: 'parsing', progress: 10, content: 'Dokument wird gelesen...' },
      });

      // Build the message content
      const { content, sheetInfo } = await this.buildMessageContent(
        buffer, filename, mimeType, template, customPrompt, context, language
      );

      sendEvent({
        type: 'progress',
        data: { stage: 'analyzing', progress: 25, content: 'Claude analysiert das Dokument...' },
      });

      const templateConfig = ANALYSIS_TEMPLATES[template];
      let systemPrompt = templateConfig.system;
      if (language === 'en') {
        systemPrompt += '\n\nRespond in English.';
      }

      // Create streaming response
      const stream = this.client.messages.stream({
        model: CLAUDE_MODEL,
        max_tokens: maxTokens,
        temperature: 0.2,
        system: systemPrompt,
        messages: [{ role: 'user', content }],
      });

      let responseContent = '';
      let chunkCount = 0;

      // Stream text deltas to client
      stream.on('text', (text: string) => {
        responseContent += text;
        chunkCount++;
        sendEvent({
          type: 'content_delta',
          data: {
            content: text,
            progress: Math.min(25 + Math.floor((chunkCount / 100) * 65), 90),
          },
        });
      });

      // Wait for completion
      const finalMessage = await stream.finalMessage();

      // Cache for follow-up
      const cacheKey = this.computeCacheKey(buffer);
      this.cacheDocument(cacheKey, {
        content,
        filename,
        mimeType,
        systemPrompt,
        previousMessages: [
          { role: 'user', content },
          { role: 'assistant', content: responseContent },
        ],
        createdAt: Date.now(),
      });

      // Parse sections and key findings
      const sections = this.parseSections(responseContent);
      const keyFindings = this.extractKeyFindings(responseContent);
      const processingTimeMs = Date.now() - startTime;

      const result: DocumentAnalysisResult = {
        success: true,
        filename,
        documentType: MIME_TYPE_LABELS[mimeType],
        analysis: responseContent,
        sections,
        keyFindings,
        metadata: {
          fileSize: buffer.length,
          mimeType,
          processingTimeMs,
          tokenUsage: {
            input: finalMessage.usage.input_tokens,
            output: finalMessage.usage.output_tokens,
          },
          sheetInfo,
        },
      };

      sendEvent({
        type: 'done',
        data: { result, progress: 100 },
      });

      logger.info('Document streaming analysis complete', {
        filename, processingTimeMs, cacheKey,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Analyse fehlgeschlagen';
      logger.error('Document streaming analysis failed', error instanceof Error ? error : undefined);
      sendEvent({ type: 'error', data: { error: errorMessage } });
    } finally {
      res.end();
    }
  }

  // ===========================================
  // Follow-up Questions (Prompt Caching)
  // ===========================================

  /**
   * Ask a follow-up question about a previously analyzed document.
   * Uses cached document content to avoid resending the full document (~80% token savings).
   */
  async followUp(
    analysisId: string,
    question: string,
    options: { language?: 'de' | 'en'; maxTokens?: number } = {}
  ): Promise<{ success: boolean; answer: string; tokenUsage?: { input: number; output: number }; cached: boolean }> {
    const { language = 'de', maxTokens = 4096 } = options;

    // Try to find cached document
    const cached = this.documentCache.get(analysisId);
    if (!cached) {
      return { success: false, answer: 'Dokument nicht mehr im Cache. Bitte erneut hochladen.', cached: false };
    }

    // Check TTL
    if (Date.now() - cached.createdAt > CACHE_TTL_MS) {
      this.documentCache.delete(analysisId);
      return { success: false, answer: 'Cache abgelaufen. Bitte Dokument erneut hochladen.', cached: false };
    }

    logger.info('Follow-up question on cached document', {
      analysisId,
      filename: cached.filename,
      questionLength: question.length,
    });

    try {
      const langNote = language === 'en' ? ' Respond in English.' : '';

      // Build conversation with cached previous messages + new question
      const messages: Anthropic.MessageParam[] = [
        ...cached.previousMessages,
        { role: 'user', content: `Folge-Frage zum Dokument "${cached.filename}":${langNote}\n\n${question}` },
      ];

      const response = await executeWithProtection(async () => {
        return this.client.messages.create({
          model: CLAUDE_MODEL,
          max_tokens: maxTokens,
          temperature: 0.3,
          system: cached.systemPrompt,
          messages,
        });
      });

      const answer = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('\n\n');

      // Update cache with new conversation turn
      cached.previousMessages.push(
        { role: 'user', content: question },
        { role: 'assistant', content: answer }
      );
      cached.createdAt = Date.now(); // Refresh TTL

      return {
        success: true,
        answer,
        tokenUsage: {
          input: response.usage.input_tokens,
          output: response.usage.output_tokens,
        },
        cached: true,
      };
    } catch (error) {
      logger.error('Follow-up question failed', error instanceof Error ? error : undefined);
      return { success: false, answer: 'Folge-Frage fehlgeschlagen.', cached: true };
    }
  }

  /**
   * Get cache key for a document based on content hash
   */
  computeCacheKey(buffer: Buffer): string {
    return crypto.createHash('sha256').update(buffer).digest('hex').substring(0, 16);
  }

  /**
   * Check if a document is cached (by cache key)
   */
  isCached(cacheKey: string): boolean {
    const cached = this.documentCache.get(cacheKey);
    if (!cached) return false;
    if (Date.now() - cached.createdAt > CACHE_TTL_MS) {
      this.documentCache.delete(cacheKey);
      return false;
    }
    return true;
  }

  // ===========================================
  // Multi-Document Comparison
  // ===========================================

  /**
   * Compare 2-3 documents simultaneously
   */
  async compareDocuments(
    documents: Array<{ buffer: Buffer; filename: string; mimeType: DocumentMediaType }>,
    options: DocumentAnalysisOptions = {}
  ): Promise<DocumentAnalysisResult> {
    const startTime = Date.now();
    const { customPrompt, language = 'de', maxTokens = 8192 } = options;

    if (documents.length < 2 || documents.length > 3) {
      return {
        success: false,
        filename: documents.map((d) => d.filename).join(', '),
        documentType: 'Multi-Dokument',
        analysis: '',
        sections: [],
        keyFindings: [],
        metadata: { fileSize: 0, mimeType: 'multi', processingTimeMs: 0 },
      };
    }

    logger.info('Multi-document comparison starting', {
      documentCount: documents.length,
      filenames: documents.map((d) => d.filename),
    });

    try {
      // Build content blocks for all documents
      const contentBlocks: Anthropic.MessageCreateParams['messages'][0]['content'] = [];
      let totalSize = 0;
      const allSheetInfo: DocumentAnalysisResult['metadata']['sheetInfo'] = [];

      for (let i = 0; i < documents.length; i++) {
        const doc = documents[i];
        const { content, sheetInfo } = await this.buildMessageContent(
          doc.buffer, doc.filename, doc.mimeType,
          'general', undefined, undefined, language
        );

        // Add document label
        if (Array.isArray(content)) {
          contentBlocks.push({
            type: 'text',
            text: `\n--- DOKUMENT ${i + 1}: ${doc.filename} ---\n`,
          });
          for (const block of content) {
            contentBlocks.push(block);
          }
        }

        if (sheetInfo) {
          allSheetInfo.push(...sheetInfo);
        }
        totalSize += doc.buffer.length;
      }

      // Add comparison instruction
      const defaultInstruction = `Vergleiche die oben genannten ${documents.length} Dokumente:

1. **Gemeinsamkeiten**: Was haben die Dokumente gemeinsam?
2. **Unterschiede**: Wesentliche Unterschiede zwischen den Dokumenten
3. **Schlüssel-Vergleichspunkte**: Vergleichstabelle der wichtigsten Datenpunkte
4. **Auffälligkeiten**: Inkonsistenzen oder bemerkenswerte Abweichungen
5. **Zusammenfassung**: Gesamtbewertung des Vergleichs

Nutze Markdown-Tabellen für den Vergleich. Benenne die Dokumente klar mit ihren Dateinamen.`;

      const langNote = language === 'en' ? '\n\nRespond in English.' : '';
      contentBlocks.push({
        type: 'text',
        text: `\n\n${customPrompt || defaultInstruction}${langNote}`,
      });

      const systemPrompt = `Du bist ein professioneller Dokumentanalytiker, spezialisiert auf Dokumentvergleiche.
Analysiere und vergleiche mehrere Dokumente strukturiert und übersichtlich.
Antworte in klarem Markdown mit Tabellen, Listen und Überschriften.${language === 'en' ? '\n\nRespond in English.' : ''}`;

      // Call Claude API
      const response = await executeWithProtection(async () => {
        return this.client.messages.create({
          model: CLAUDE_MODEL,
          max_tokens: maxTokens,
          temperature: 0.2,
          system: systemPrompt,
          messages: [{ role: 'user', content: contentBlocks }],
        });
      });

      const analysisText = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('\n\n');

      const sections = this.parseSections(analysisText);
      const keyFindings = this.extractKeyFindings(analysisText);
      const processingTimeMs = Date.now() - startTime;

      logger.info('Multi-document comparison complete', {
        documentCount: documents.length,
        processingTimeMs,
      });

      return {
        success: true,
        filename: documents.map((d) => d.filename).join(' vs. '),
        documentType: 'Vergleich',
        analysis: analysisText,
        sections,
        keyFindings,
        metadata: {
          fileSize: totalSize,
          mimeType: 'multi',
          processingTimeMs,
          tokenUsage: {
            input: response.usage.input_tokens,
            output: response.usage.output_tokens,
          },
          sheetInfo: allSheetInfo.length > 0 ? allSheetInfo : undefined,
        },
      };
    } catch (error) {
      const processingTimeMs = Date.now() - startTime;
      logger.error('Multi-document comparison failed', error instanceof Error ? error : undefined);

      return {
        success: false,
        filename: documents.map((d) => d.filename).join(', '),
        documentType: 'Vergleich',
        analysis: '',
        sections: [],
        keyFindings: [],
        metadata: {
          fileSize: documents.reduce((sum, d) => sum + d.buffer.length, 0),
          mimeType: 'multi',
          processingTimeMs,
        },
      };
    }
  }

  // ===========================================
  // Analysis History (Database)
  // ===========================================

  /**
   * Save an analysis result to database
   */
  async saveToHistory(
    result: DocumentAnalysisResult,
    analysisType: string,
    context: string = 'work'
  ): Promise<string | null> {
    try {
      const res = await query(
        `INSERT INTO document_analyses (filename, file_type, file_size, analysis_type, analysis_result, token_usage, context)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [
          result.filename,
          result.metadata.mimeType,
          result.metadata.fileSize,
          analysisType,
          JSON.stringify(result),
          result.metadata.tokenUsage ? JSON.stringify(result.metadata.tokenUsage) : null,
          context,
        ]
      );

      const id = res.rows[0]?.id;
      logger.info('Analysis saved to history', { id, filename: result.filename });
      return id;
    } catch (error) {
      logger.error('Failed to save analysis to history', error instanceof Error ? error : undefined);
      return null;
    }
  }

  /**
   * Get analysis history
   */
  async getHistory(
    context: string = 'work',
    limit: number = 20,
    offset: number = 0
  ): Promise<{ entries: AnalysisHistoryEntry[]; total: number }> {
    try {
      const [dataResult, countResult] = await Promise.all([
        query(
          `SELECT id, filename, file_type, file_size, analysis_type, analysis_result, token_usage, context, created_at
           FROM document_analyses
           WHERE context = $1
           ORDER BY created_at DESC
           LIMIT $2 OFFSET $3`,
          [context, limit, offset]
        ),
        query(
          `SELECT COUNT(*) as total FROM document_analyses WHERE context = $1`,
          [context]
        ),
      ]);

      return {
        entries: dataResult.rows,
        total: parseInt(countResult.rows[0]?.total || '0', 10),
      };
    } catch (error) {
      logger.error('Failed to get analysis history', error instanceof Error ? error : undefined);
      return { entries: [], total: 0 };
    }
  }

  /**
   * Get a single analysis by ID
   */
  async getAnalysisById(id: string): Promise<AnalysisHistoryEntry | null> {
    try {
      const res = await query(
        `SELECT id, filename, file_type, file_size, analysis_type, analysis_result, token_usage, context, created_at
         FROM document_analyses WHERE id = $1`,
        [id]
      );
      return res.rows[0] || null;
    } catch (error) {
      logger.error('Failed to get analysis by ID', error instanceof Error ? error : undefined);
      return null;
    }
  }

  /**
   * Delete an analysis from history
   */
  async deleteFromHistory(id: string): Promise<boolean> {
    try {
      const res = await query('DELETE FROM document_analyses WHERE id = $1', [id]);
      return (res.rowCount ?? 0) > 0;
    } catch (error) {
      logger.error('Failed to delete analysis', error instanceof Error ? error : undefined);
      return false;
    }
  }

  // ===========================================
  // Internal: Document Parsing & Content Building
  // ===========================================

  /**
   * Build message content based on file type
   */
  async buildMessageContent(
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
  parseSections(text: string): AnalysisSection[] {
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
  extractKeyFindings(text: string): string[] {
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

  // ===========================================
  // Custom Analysis Templates (CRUD)
  // ===========================================

  /**
   * Get all custom templates for a context
   */
  async getCustomTemplates(context: string = 'work'): Promise<CustomAnalysisTemplate[]> {
    try {
      const res = await query(
        `SELECT id, name, system_prompt, instruction, icon, context, created_at, updated_at
         FROM custom_analysis_templates
         WHERE context = $1
         ORDER BY created_at DESC`,
        [context]
      );
      return res.rows;
    } catch (error) {
      logger.error('Failed to get custom templates', error instanceof Error ? error : undefined);
      return [];
    }
  }

  /**
   * Get a single custom template by ID
   */
  async getCustomTemplateById(id: string): Promise<CustomAnalysisTemplate | null> {
    try {
      const res = await query(
        `SELECT id, name, system_prompt, instruction, icon, context, created_at, updated_at
         FROM custom_analysis_templates WHERE id = $1`,
        [id]
      );
      return res.rows[0] || null;
    } catch (error) {
      logger.error('Failed to get custom template', error instanceof Error ? error : undefined);
      return null;
    }
  }

  /**
   * Create a new custom template
   */
  async createCustomTemplate(template: {
    name: string;
    system_prompt: string;
    instruction: string;
    icon?: string;
    context?: string;
  }): Promise<CustomAnalysisTemplate | null> {
    try {
      const res = await query(
        `INSERT INTO custom_analysis_templates (name, system_prompt, instruction, icon, context)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, name, system_prompt, instruction, icon, context, created_at, updated_at`,
        [
          template.name,
          template.system_prompt,
          template.instruction,
          template.icon || 'file-text',
          template.context || 'work',
        ]
      );
      logger.info('Custom template created', { id: res.rows[0]?.id, name: template.name });
      return res.rows[0] || null;
    } catch (error) {
      logger.error('Failed to create custom template', error instanceof Error ? error : undefined);
      return null;
    }
  }

  /**
   * Update an existing custom template
   */
  async updateCustomTemplate(
    id: string,
    updates: {
      name?: string;
      system_prompt?: string;
      instruction?: string;
      icon?: string;
    }
  ): Promise<CustomAnalysisTemplate | null> {
    try {
      const fields: string[] = [];
      const values: (string | number | boolean | Date | null | undefined | Buffer | object)[] = [];
      let paramIndex = 1;

      if (updates.name !== undefined) {
        fields.push(`name = $${paramIndex++}`);
        values.push(updates.name);
      }
      if (updates.system_prompt !== undefined) {
        fields.push(`system_prompt = $${paramIndex++}`);
        values.push(updates.system_prompt);
      }
      if (updates.instruction !== undefined) {
        fields.push(`instruction = $${paramIndex++}`);
        values.push(updates.instruction);
      }
      if (updates.icon !== undefined) {
        fields.push(`icon = $${paramIndex++}`);
        values.push(updates.icon);
      }

      if (fields.length === 0) return this.getCustomTemplateById(id);

      fields.push(`updated_at = NOW()`);
      values.push(id);

      const res = await query(
        `UPDATE custom_analysis_templates
         SET ${fields.join(', ')}
         WHERE id = $${paramIndex}
         RETURNING id, name, system_prompt, instruction, icon, context, created_at, updated_at`,
        values
      );

      if (res.rows.length === 0) return null;
      logger.info('Custom template updated', { id });
      return res.rows[0];
    } catch (error) {
      logger.error('Failed to update custom template', error instanceof Error ? error : undefined);
      return null;
    }
  }

  /**
   * Delete a custom template
   */
  async deleteCustomTemplate(id: string): Promise<boolean> {
    try {
      const res = await query('DELETE FROM custom_analysis_templates WHERE id = $1', [id]);
      return (res.rowCount ?? 0) > 0;
    } catch (error) {
      logger.error('Failed to delete custom template', error instanceof Error ? error : undefined);
      return false;
    }
  }

  /**
   * Run analysis using a custom template (by template ID)
   */
  async analyzeWithCustomTemplate(
    buffer: Buffer,
    filename: string,
    mimeType: DocumentMediaType,
    templateId: string,
    options: { customPrompt?: string; language?: 'de' | 'en'; maxTokens?: number; context?: string } = {}
  ): Promise<DocumentAnalysisResult> {
    const template = await this.getCustomTemplateById(templateId);
    if (!template) {
      return {
        success: false,
        filename,
        documentType: MIME_TYPE_LABELS[mimeType],
        analysis: '',
        sections: [],
        keyFindings: [],
        metadata: { fileSize: buffer.length, mimeType, processingTimeMs: 0 },
      };
    }

    // Override the template used in buildMessageContent by using customPrompt
    return this.analyze(buffer, filename, mimeType, {
      template: 'general', // base template - system prompt overridden below
      customPrompt: options.customPrompt || template.instruction,
      language: options.language,
      maxTokens: options.maxTokens,
      context: options.context,
      _customSystemPrompt: template.system_prompt,
    } as DocumentAnalysisOptions & { _customSystemPrompt?: string });
  }

  // ===========================================
  // Mermaid Diagram Extraction
  // ===========================================

  /**
   * Extract Mermaid diagram code blocks from analysis text.
   * Returns array of { title, content } for each mermaid block found.
   */
  extractMermaidDiagrams(text: string): Array<{ title: string; content: string }> {
    const diagrams: Array<{ title: string; content: string }> = [];
    const mermaidPattern = /```mermaid\s*\n([\s\S]*?)```/g;
    let match;
    let index = 0;

    while ((match = mermaidPattern.exec(text)) !== null) {
      index++;
      const content = match[1].trim();
      // Try to detect diagram type for title
      let title = `Diagramm ${index}`;
      if (content.startsWith('pie')) title = `Kreisdiagramm ${index}`;
      else if (content.startsWith('graph') || content.startsWith('flowchart')) title = `Flussdiagramm ${index}`;
      else if (content.startsWith('sequenceDiagram')) title = `Sequenzdiagramm ${index}`;
      else if (content.startsWith('gantt')) title = `Gantt-Diagramm ${index}`;
      else if (content.startsWith('classDiagram')) title = `Klassendiagramm ${index}`;
      else if (content.startsWith('xychart-beta') || content.startsWith('bar')) title = `Balkendiagramm ${index}`;

      diagrams.push({ title, content });
    }

    return diagrams;
  }

  // ===========================================
  // Cache Management
  // ===========================================

  private cacheDocument(key: string, doc: CachedDocument): void {
    // Evict oldest entries if cache is full
    if (this.documentCache.size >= MAX_CACHE_SIZE) {
      let oldestKey = '';
      let oldestTime = Infinity;
      for (const [k, v] of this.documentCache) {
        if (v.createdAt < oldestTime) {
          oldestTime = v.createdAt;
          oldestKey = k;
        }
      }
      if (oldestKey) this.documentCache.delete(oldestKey);
    }

    this.documentCache.set(key, doc);
  }

  /**
   * Clean expired entries from cache
   */
  cleanCache(): number {
    const now = Date.now();
    let cleaned = 0;
    for (const [key, value] of this.documentCache) {
      if (now - value.createdAt > CACHE_TTL_MS) {
        this.documentCache.delete(key);
        cleaned++;
      }
    }
    return cleaned;
  }

  /**
   * Get current cache size
   */
  getCacheSize(): number {
    return this.documentCache.size;
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
