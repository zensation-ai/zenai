/**
 * Document Analysis Service
 *
 * Analyzes documents (PDF, Excel, CSV) using Claude AI.
 *
 * Sub-modules:
 * - types: All type definitions
 * - templates: Analysis templates & constants
 * - document-parsing: Standalone parsing & extraction functions
 *
 * @module services/document-analysis
 */

import Anthropic from '@anthropic-ai/sdk';
import crypto from 'crypto';
import { Response } from 'express';
import { logger } from '../../utils/logger';
import { query } from '../../utils/database';
import { getClaudeClient, executeWithProtection, CLAUDE_MODEL } from '../claude/client';
import { setupSSEHeaders } from '../claude/streaming';

// Re-export types
export type {
  DocumentMediaType,
  AnalysisTemplate,
  CustomAnalysisTemplate,
  DocumentAnalysisOptions,
  AnalysisSection,
  DocumentAnalysisResult,
  AnalysisHistoryEntry,
  DocumentStreamEvent,
} from './types';

import type {
  DocumentMediaType,
  CustomAnalysisTemplate,
  DocumentAnalysisOptions,
  AnalysisSection,
  DocumentAnalysisResult,
  AnalysisHistoryEntry,
  CachedDocument,
  DocumentStreamEvent,
} from './types';

// Re-export templates
export { ANALYSIS_TEMPLATES } from './templates';

import {
  ANALYSIS_TEMPLATES,
  SUPPORTED_MIME_TYPES,
  MIME_TYPE_LABELS,
  MAGIC_SIGNATURES,
  CACHE_TTL_MS,
  MAX_CACHE_SIZE,
} from './templates';

// Import parsing functions
import {
  buildMessageContent,
  parseSections,
  extractKeyFindings,
  extractMermaidDiagrams,
} from './document-parsing';

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
      const { content, sheetInfo } = await buildMessageContent(
        buffer, filename, mimeType, template, customPrompt, context, language
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
      const { content, sheetInfo } = await buildMessageContent(
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
    if (!cached) {return false;}
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
        const { content, sheetInfo } = await buildMessageContent(
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
  // Parsing Delegates (maintain class API)
  // ===========================================

  parseSections(text: string): AnalysisSection[] {
    return parseSections(text);
  }

  extractKeyFindings(text: string): string[] {
    return extractKeyFindings(text);
  }

  extractMermaidDiagrams(text: string): Array<{ title: string; content: string }> {
    return extractMermaidDiagrams(text);
  }

  async buildMessageContent(
    buffer: Buffer,
    filename: string,
    mimeType: DocumentMediaType,
    template: import('./types').AnalysisTemplate,
    customPrompt?: string,
    context?: string,
    language?: string
  ) {
    return buildMessageContent(buffer, filename, mimeType, template, customPrompt, context, language);
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

      if (fields.length === 0) {return this.getCustomTemplateById(id);}

      fields.push(`updated_at = NOW()`);
      values.push(id);

      const res = await query(
        `UPDATE custom_analysis_templates
         SET ${fields.join(', ')}
         WHERE id = $${paramIndex}
         RETURNING id, name, system_prompt, instruction, icon, context, created_at, updated_at`,
        values
      );

      if (res.rows.length === 0) {return null;}
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
      if (oldestKey) {this.documentCache.delete(oldestKey);}
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
    if (buffer.length < sig.length) {return false;}
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
