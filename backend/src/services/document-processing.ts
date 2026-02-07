/**
 * Document Processing Service
 *
 * AI-powered document analysis pipeline for:
 * - Text extraction from PDF, DOCX, XLSX, images, and more
 * - AI-generated summaries
 * - Keyword extraction
 * - Language detection
 * - Document chunking for RAG
 * - Embedding generation
 *
 * @module services/document-processing
 */

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { logger } from '../utils/logger';
import { generateEmbedding } from './ai';
import { generateClaudeResponse } from './claude';
import { queryContext, AIContext } from '../utils/database-context';

// Lazy import for claudeVision to avoid initialization issues during tests
// The claudeVision singleton requires ANTHROPIC_API_KEY at load time
let _claudeVision: typeof import('./claude-vision').claudeVision | null = null;
async function getClaudeVision() {
  if (!_claudeVision) {
    const module = await import('./claude-vision');
    _claudeVision = module.claudeVision;
  }
  return _claudeVision;
}

// ===========================================
// Types
// ===========================================

export interface ExtractedText {
  text: string;
  pageCount?: number;
  metadata?: Record<string, unknown>;
  confidence?: number;
}

export interface DocumentChunk {
  index: number;
  content: string;
  pageNumber?: number;
  charStart: number;
  charEnd: number;
}

export interface ProcessingResult {
  success: boolean;
  documentId: string;
  title?: string;
  summary?: string;
  fullText?: string;
  keywords?: string[];
  language?: string;
  pageCount?: number;
  chunkCount?: number;
  ocrConfidence?: number;
  error?: string;
  processingTimeMs: number;
}

export interface ChunkOptions {
  maxChunkSize?: number;
  overlap?: number;
  preserveSentences?: boolean;
}

// ===========================================
// Configuration
// ===========================================

const CONFIG = {
  /** Maximum chunk size in characters */
  maxChunkSize: 1500,
  /** Overlap between chunks in characters */
  chunkOverlap: 200,
  /** Maximum text length for summary generation */
  maxSummaryInput: 15000,
  /** Maximum keywords to extract */
  maxKeywords: 15,
  /** Minimum word length for keywords */
  minKeywordLength: 3,
  /** Supported file extensions by category */
  extensions: {
    pdf: ['.pdf'],
    docx: ['.docx', '.doc', '.odt'],
    xlsx: ['.xlsx', '.xls', '.csv'],
    pptx: ['.pptx', '.ppt'],
    text: ['.txt', '.md', '.rtf'],
    code: ['.js', '.ts', '.py', '.java', '.go', '.rs', '.c', '.cpp', '.h', '.html', '.css', '.json', '.yaml', '.yml', '.xml', '.sql', '.sh', '.bash'],
    epub: ['.epub'],
    html: ['.html', '.htm', '.mhtml'],
    image: ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.heic'],
  },
} as const;

// Helper to check if extension is in array
function isExtensionInArray(ext: string, arr: readonly string[]): boolean {
  return arr.includes(ext);
}

// ===========================================
// Document Processing Service
// ===========================================

export class DocumentProcessingService {
  /**
   * Process a document completely: extract text, generate summary, keywords, embeddings
   */
  async processDocument(
    documentId: string,
    filePath: string,
    mimeType: string,
    context: AIContext
  ): Promise<ProcessingResult> {
    const startTime = Date.now();

    try {
      logger.info('Processing document', { documentId, mimeType });

      // 1. Extract text based on file type
      const extracted = await this.extractText(filePath, mimeType);

      if (!extracted.text || extracted.text.trim().length === 0) {
        return {
          success: false,
          documentId,
          error: 'No text content could be extracted',
          processingTimeMs: Date.now() - startTime,
        };
      }

      // 2. Generate AI summary
      const summary = await this.generateSummary(extracted.text, context);

      // 3. Extract title from content
      const title = await this.extractTitle(extracted.text, filePath);

      // 4. Extract keywords
      const keywords = await this.extractKeywords(extracted.text);

      // 5. Detect language
      const language = this.detectLanguage(extracted.text);

      // 6. Generate document embedding
      const embedding = await this.generateDocumentEmbedding(
        `${title} ${summary} ${keywords.join(' ')}`
      );

      // 7. Chunk document for RAG
      const chunks = this.chunkDocument(extracted.text);

      // 8. Update document in database
      await this.updateDocument(documentId, context, {
        title,
        summary,
        fullText: extracted.text,
        keywords,
        language,
        pageCount: extracted.pageCount,
        embedding,
        chunkCount: chunks.length,
        ocrConfidence: extracted.confidence,
      });

      // 9. Store chunks with embeddings
      await this.storeChunks(documentId, chunks, context);

      logger.info('Document processed successfully', {
        documentId,
        chunkCount: chunks.length,
        processingTimeMs: Date.now() - startTime,
      });

      return {
        success: true,
        documentId,
        title,
        summary,
        fullText: extracted.text,
        keywords,
        language,
        pageCount: extracted.pageCount,
        chunkCount: chunks.length,
        ocrConfidence: extracted.confidence,
        processingTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Document processing failed', error instanceof Error ? error : undefined, { documentId });

      // Update document with error status
      await queryContext(
        context,
        `UPDATE documents
         SET processing_status = 'failed', processing_error = $2, updated_at = NOW()
         WHERE id = $1`,
        [documentId, errorMessage]
      );

      return {
        success: false,
        documentId,
        error: errorMessage,
        processingTimeMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Extract text from document based on MIME type
   */
  async extractText(filePath: string, mimeType: string): Promise<ExtractedText> {
    const ext = path.extname(filePath).toLowerCase();

    // PDF
    if (isExtensionInArray(ext, CONFIG.extensions.pdf) || mimeType === 'application/pdf') {
      return this.extractPdfText(filePath);
    }

    // Word documents
    if (isExtensionInArray(ext, CONFIG.extensions.docx) || mimeType.includes('word')) {
      return this.extractDocxText(filePath);
    }

    // Excel/CSV
    if (isExtensionInArray(ext, CONFIG.extensions.xlsx) || mimeType.includes('spreadsheet') || mimeType.includes('excel')) {
      return this.extractXlsxText(filePath);
    }

    // Plain text, Markdown, Code
    if (isExtensionInArray(ext, CONFIG.extensions.text) || isExtensionInArray(ext, CONFIG.extensions.code) || mimeType.startsWith('text/')) {
      return this.extractPlainText(filePath);
    }

    // HTML
    if (isExtensionInArray(ext, CONFIG.extensions.html) || mimeType.includes('html')) {
      return this.extractHtmlText(filePath);
    }

    // Images (OCR)
    if (isExtensionInArray(ext, CONFIG.extensions.image) || mimeType.startsWith('image/')) {
      return this.extractImageText(filePath);
    }

    // ePub
    if (isExtensionInArray(ext, CONFIG.extensions.epub) || mimeType.includes('epub')) {
      return this.extractEpubText(filePath);
    }

    throw new Error(`Unsupported file type: ${mimeType} (${ext})`);
  }

  /**
   * Extract text from PDF using pdf-parse
   */
  private async extractPdfText(filePath: string): Promise<ExtractedText> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require('pdf-parse');
      const dataBuffer = await fs.readFile(filePath);
      const data = await pdfParse(dataBuffer);

      return {
        text: data.text,
        pageCount: data.numpages,
        metadata: data.info,
      };
    } catch (error) {
      logger.error('PDF extraction failed', undefined, { filePath });
      throw new Error('Failed to extract text from PDF');
    }
  }

  /**
   * Extract text from DOCX using mammoth
   */
  private async extractDocxText(filePath: string): Promise<ExtractedText> {
    try {
      const mammoth = await import('mammoth');
      const result = await mammoth.extractRawText({ path: filePath });

      return {
        text: result.value,
        metadata: { messages: result.messages },
      };
    } catch (error) {
      logger.error('DOCX extraction failed', undefined, { filePath });
      throw new Error('Failed to extract text from DOCX');
    }
  }

  /**
   * Extract text from Excel/CSV using xlsx
   */
  private async extractXlsxText(filePath: string): Promise<ExtractedText> {
    try {
      const ext = path.extname(filePath).toLowerCase();

      if (ext === '.csv') {
        const Papa = await import('papaparse');
        const content = await fs.readFile(filePath, 'utf-8');
        const parsed = Papa.parse(content, { header: true });
        const text = (parsed.data as Record<string, unknown>[])
          .map(row => Object.values(row).join(' | '))
          .join('\n');
        return { text };
      }

      const XLSX = await import('xlsx');
      const workbook = XLSX.readFile(filePath);
      const texts: string[] = [];

      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const csv = XLSX.utils.sheet_to_csv(sheet);
        texts.push(`--- ${sheetName} ---\n${csv}`);
      }

      return {
        text: texts.join('\n\n'),
        metadata: { sheets: workbook.SheetNames },
      };
    } catch (error) {
      logger.error('XLSX extraction failed', undefined, { filePath });
      throw new Error('Failed to extract text from spreadsheet');
    }
  }

  /**
   * Extract plain text from text files
   */
  private async extractPlainText(filePath: string): Promise<ExtractedText> {
    const text = await fs.readFile(filePath, 'utf-8');
    return { text };
  }

  /**
   * Extract text from HTML using cheerio
   */
  private async extractHtmlText(filePath: string): Promise<ExtractedText> {
    try {
      const cheerio = await import('cheerio');
      const html = await fs.readFile(filePath, 'utf-8');
      const $ = cheerio.load(html);

      // Remove script and style elements
      $('script, style, noscript').remove();

      // Get text content
      const text = $('body').text().replace(/\s+/g, ' ').trim();
      const title = $('title').text().trim();

      return {
        text,
        metadata: { title },
      };
    } catch (error) {
      logger.error('HTML extraction failed', undefined, { filePath });
      throw new Error('Failed to extract text from HTML');
    }
  }

  /**
   * Extract text from images using Claude Vision + OCR
   */
  private async extractImageText(filePath: string): Promise<ExtractedText> {
    try {
      const imageBuffer = await fs.readFile(filePath);
      const base64 = imageBuffer.toString('base64');
      const ext = path.extname(filePath).toLowerCase();

      // Map extension to media type
      const mediaTypeMap: Record<string, 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'> = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
      };

      const mediaType = mediaTypeMap[ext] || 'image/jpeg';

      const claudeVision = await getClaudeVision();
      const result = await claudeVision.analyze(
        [{ base64, mediaType }],
        'extract_text',
        { language: 'de' }
      );

      return {
        text: result.structured?.extractedText || result.text,
        confidence: result.structured?.confidence,
      };
    } catch (error) {
      logger.error('Image OCR failed', undefined, { filePath });
      throw new Error('Failed to extract text from image');
    }
  }

  /**
   * Extract text from ePub
   */
  private async extractEpubText(filePath: string): Promise<ExtractedText> {
    try {
      // Use adm-zip to read epub as zip
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const AdmZip = require('adm-zip');
      const cheerio = await import('cheerio');
      const zip = new AdmZip(filePath);
      const texts: string[] = [];

      for (const entry of zip.getEntries()) {
        if (entry.entryName.endsWith('.html') || entry.entryName.endsWith('.xhtml')) {
          const content = entry.getData().toString('utf-8');
          const $ = cheerio.load(content);
          $('script, style').remove();
          texts.push($('body').text().replace(/\s+/g, ' ').trim());
        }
      }

      return { text: texts.join('\n\n') };
    } catch (error) {
      logger.error('ePub extraction failed', undefined, { filePath });
      throw new Error('Failed to extract text from ePub');
    }
  }

  /**
   * Generate AI summary of document content
   */
  async generateSummary(text: string, context: AIContext): Promise<string> {
    try {
      const truncatedText = text.substring(0, CONFIG.maxSummaryInput);

      const systemPrompt = 'Du bist ein Experte für Dokumentenanalyse. Antworte präzise und fokussiert.';
      const userPrompt = `Erstelle eine prägnante Zusammenfassung (max. 3 Sätze) des folgenden Dokuments. Fokussiere auf die Kernaussagen:

${truncatedText}

Zusammenfassung:`;

      const response = await generateClaudeResponse(systemPrompt, userPrompt, {
        maxTokens: 500,
        temperature: 0.3,
      });

      return response.trim();
    } catch (error) {
      logger.warn('Summary generation failed, using fallback');
      // Fallback: First few sentences
      const sentences = text.split(/[.!?]+/).slice(0, 3);
      return sentences.join('. ').trim() + '.';
    }
  }

  /**
   * Extract title from document content
   */
  private async extractTitle(text: string, filePath: string): Promise<string> {
    try {
      // Try to extract from first line or use AI
      const firstLine = text.split('\n')[0]?.trim();

      if (firstLine && firstLine.length > 5 && firstLine.length < 100) {
        return firstLine;
      }

      // Use AI for title extraction
      const systemPrompt = 'Du extrahierst Titel aus Dokumenten. Antworte nur mit dem Titel, ohne Erklärungen.';
      const userPrompt = `Extrahiere einen kurzen, prägnanten Titel (max. 10 Wörter) aus diesem Text. Antworte NUR mit dem Titel, ohne Anführungszeichen:

${text.substring(0, 2000)}`;

      const response = await generateClaudeResponse(systemPrompt, userPrompt, {
        maxTokens: 50,
        temperature: 0.2,
      });

      const title = response.trim().replace(/^["']|["']$/g, '');
      return title || path.basename(filePath, path.extname(filePath));
    } catch (error) {
      // Fallback to filename
      return path.basename(filePath, path.extname(filePath));
    }
  }

  /**
   * Extract keywords using TF-IDF-like scoring
   */
  async extractKeywords(text: string): Promise<string[]> {
    const words = text
      .toLowerCase()
      .replace(/[^\wäöüß\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= CONFIG.minKeywordLength);

    // Count word frequency
    const wordFreq = new Map<string, number>();
    words.forEach(word => {
      wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
    });

    // German + English stop words
    const stopWords = new Set([
      'und', 'oder', 'aber', 'auch', 'eine', 'einen', 'einem', 'einer',
      'der', 'die', 'das', 'den', 'dem', 'des', 'dass', 'wenn', 'dann',
      'sein', 'haben', 'werden', 'kann', 'muss', 'will', 'soll', 'wird',
      'sind', 'ist', 'war', 'waren', 'wurde', 'wurden', 'nach', 'bei',
      'mit', 'von', 'für', 'auf', 'aus', 'über', 'unter', 'durch',
      'nicht', 'noch', 'schon', 'sehr', 'mehr', 'viel', 'alle', 'alles',
      'the', 'and', 'for', 'that', 'this', 'with', 'from', 'are', 'was',
      'has', 'have', 'been', 'will', 'can', 'could', 'should', 'would',
      'their', 'there', 'which', 'what', 'when', 'where', 'how', 'who',
    ]);

    // Score and sort keywords
    const keywords: Array<{ word: string; score: number }> = [];

    for (const [word, freq] of wordFreq.entries()) {
      if (stopWords.has(word)) continue;
      if (freq < 2) continue;

      const score = freq * Math.log(word.length);
      keywords.push({ word, score });
    }

    return keywords
      .sort((a, b) => b.score - a.score)
      .slice(0, CONFIG.maxKeywords)
      .map(k => k.word);
  }

  /**
   * Simple language detection based on word patterns
   */
  detectLanguage(text: string): string {
    const sample = text.substring(0, 1000).toLowerCase();

    // German indicators
    const germanPatterns = /\b(und|oder|der|die|das|ist|sind|haben|werden|nicht|auch|für|mit|von|auf|bei)\b/g;
    const germanCount = (sample.match(germanPatterns) || []).length;

    // English indicators
    const englishPatterns = /\b(the|and|or|is|are|have|has|been|will|not|also|for|with|from|at|by)\b/g;
    const englishCount = (sample.match(englishPatterns) || []).length;

    if (germanCount > englishCount * 1.5) return 'de';
    if (englishCount > germanCount * 1.5) return 'en';

    return germanCount >= englishCount ? 'de' : 'en';
  }

  /**
   * Chunk document into smaller pieces for RAG
   */
  chunkDocument(text: string, options?: ChunkOptions): DocumentChunk[] {
    const maxSize = options?.maxChunkSize || CONFIG.maxChunkSize;
    const overlap = options?.overlap || CONFIG.chunkOverlap;
    const preserveSentences = options?.preserveSentences ?? true;

    const chunks: DocumentChunk[] = [];
    let charStart = 0;

    while (charStart < text.length) {
      let charEnd = Math.min(charStart + maxSize, text.length);

      // If preserving sentences, find sentence boundary
      if (preserveSentences && charEnd < text.length) {
        const searchStart = Math.max(charEnd - 200, charStart);
        const searchText = text.substring(searchStart, charEnd);
        const lastSentenceEnd = searchText.search(/[.!?]\s+(?=[A-ZÄÖÜ])/);

        if (lastSentenceEnd !== -1) {
          charEnd = searchStart + lastSentenceEnd + 1;
        }
      }

      const content = text.substring(charStart, charEnd).trim();

      if (content.length > 0) {
        chunks.push({
          index: chunks.length,
          content,
          charStart,
          charEnd,
        });
      }

      // Move start with overlap
      charStart = charEnd - overlap;
      if (charStart >= text.length - overlap) break;
    }

    return chunks;
  }

  /**
   * Generate embedding for document
   */
  private async generateDocumentEmbedding(text: string): Promise<number[]> {
    try {
      return await generateEmbedding(text.substring(0, 8000));
    } catch (error) {
      logger.warn('Embedding generation failed');
      return [];
    }
  }

  /**
   * Update document in database
   */
  private async updateDocument(
    documentId: string,
    context: AIContext,
    data: {
      title?: string;
      summary?: string;
      fullText?: string;
      keywords?: string[];
      language?: string;
      pageCount?: number;
      embedding?: number[];
      chunkCount?: number;
      ocrConfidence?: number;
    }
  ): Promise<void> {
    const embeddingValue = data.embedding && data.embedding.length > 0
      ? `[${data.embedding.join(',')}]`
      : null;

    await queryContext(
      context,
      `UPDATE documents SET
        title = COALESCE($2, title),
        summary = COALESCE($3, summary),
        full_text = COALESCE($4, full_text),
        keywords = COALESCE($5, keywords),
        language = COALESCE($6, language),
        page_count = COALESCE($7, page_count),
        embedding = COALESCE($8::vector, embedding),
        chunk_count = COALESCE($9, chunk_count),
        ocr_confidence = COALESCE($10, ocr_confidence),
        processing_status = 'completed',
        processed_at = NOW(),
        updated_at = NOW()
      WHERE id = $1`,
      [
        documentId,
        data.title,
        data.summary,
        data.fullText,
        data.keywords,
        data.language,
        data.pageCount,
        embeddingValue,
        data.chunkCount,
        data.ocrConfidence,
      ]
    );
  }

  /**
   * Store document chunks with embeddings
   */
  private async storeChunks(
    documentId: string,
    chunks: DocumentChunk[],
    context: AIContext
  ): Promise<void> {
    // Delete existing chunks
    await queryContext(
      context,
      `DELETE FROM document_chunks WHERE document_id = $1`,
      [documentId]
    );

    // Insert new chunks with embeddings (batch of 5 at a time)
    for (let i = 0; i < chunks.length; i += 5) {
      const batch = chunks.slice(i, i + 5);

      await Promise.all(batch.map(async (chunk) => {
        const embedding = await this.generateDocumentEmbedding(chunk.content);
        const embeddingValue = embedding.length > 0 ? `[${embedding.join(',')}]` : null;

        await queryContext(
          context,
          `INSERT INTO document_chunks
           (document_id, chunk_index, content, embedding, char_start, char_end)
           VALUES ($1, $2, $3, $4::vector, $5, $6)`,
          [documentId, chunk.index, chunk.content, embeddingValue, chunk.charStart, chunk.charEnd]
        );
      }));
    }
  }

  /**
   * Calculate file hash for deduplication
   */
  async calculateFileHash(filePath: string): Promise<string> {
    const fileBuffer = await fs.readFile(filePath);
    return crypto.createHash('sha256').update(fileBuffer).digest('hex');
  }

  /**
   * Get supported file extensions
   */
  getSupportedExtensions(): string[] {
    return Object.values(CONFIG.extensions).flat();
  }

  /**
   * Check if file type is supported
   */
  isSupported(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return this.getSupportedExtensions().includes(ext);
  }
}

// Export singleton instance
export const documentProcessingService = new DocumentProcessingService();
