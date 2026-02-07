/**
 * Document RAG Service
 *
 * Integration of documents into the Enhanced RAG pipeline:
 * - Semantic search across document chunks
 * - Combined retrieval with ideas
 * - Context building for chat
 * - Citation extraction
 *
 * @module services/document-rag
 */

import { logger } from '../utils/logger';
import { queryContext, AIContext } from '../utils/database-context';
import { generateEmbedding } from './ai';
import { cosineSimilarity } from '../utils/embedding';
import { documentService, DocumentSearchResult } from './document-service';

// ===========================================
// Types
// ===========================================

export interface DocumentChunkResult {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  content: string;
  pageNumber?: number;
  similarity: number;
  charStart: number;
  charEnd: number;
}

export interface CombinedRAGResult {
  type: 'idea' | 'document' | 'chunk';
  id: string;
  title: string;
  content: string;
  similarity: number;
  metadata: {
    documentId?: string;
    pageNumber?: number;
    mimeType?: string;
    ideaType?: string;
  };
}

export interface DocumentContext {
  relevantDocuments: Array<{
    id: string;
    title: string;
    summary: string;
    similarity: number;
  }>;
  relevantChunks: Array<{
    documentId: string;
    documentTitle: string;
    content: string;
    pageNumber?: number;
    similarity: number;
  }>;
  contextText: string;
  citations: string[];
}

export interface RAGOptions {
  maxDocuments?: number;
  maxChunks?: number;
  minSimilarity?: number;
  includeIdeas?: boolean;
  includeDocuments?: boolean;
}

// ===========================================
// Configuration
// ===========================================

const CONFIG = {
  defaultMaxDocuments: 5,
  defaultMaxChunks: 10,
  defaultMinSimilarity: 0.35,
  maxContextLength: 8000,
  chunkWeight: 0.7,
  documentWeight: 0.3,
} as const;

// ===========================================
// Document RAG Service
// ===========================================

export class DocumentRAGService {
  /**
   * Search document chunks for relevant content
   */
  async searchChunks(
    query: string,
    context: AIContext,
    options?: { limit?: number; minSimilarity?: number }
  ): Promise<DocumentChunkResult[]> {
    const limit = options?.limit || CONFIG.defaultMaxChunks;
    const minSimilarity = options?.minSimilarity || CONFIG.defaultMinSimilarity;

    // Generate query embedding
    const queryEmbedding = await generateEmbedding(query);
    if (!queryEmbedding || queryEmbedding.length === 0) {
      logger.warn('Failed to generate query embedding for chunk search');
      return [];
    }

    const embeddingStr = `[${queryEmbedding.join(',')}]`;

    const result = await queryContext(
      context,
      `SELECT
        c.id as chunk_id,
        c.document_id,
        c.content,
        c.page_number,
        c.char_start,
        c.char_end,
        d.title as document_title,
        1 - (c.embedding <=> $1::vector) as similarity
      FROM document_chunks c
      JOIN documents d ON c.document_id = d.id
      WHERE d.context = $2
        AND c.embedding IS NOT NULL
        AND d.is_archived = FALSE
        AND 1 - (c.embedding <=> $1::vector) >= $3
      ORDER BY c.embedding <=> $1::vector
      LIMIT $4`,
      [embeddingStr, context, minSimilarity, limit]
    );

    return result.rows.map(row => ({
      chunkId: row.chunk_id,
      documentId: row.document_id,
      documentTitle: row.document_title || 'Untitled',
      content: row.content,
      pageNumber: row.page_number,
      similarity: parseFloat(row.similarity),
      charStart: row.char_start,
      charEnd: row.char_end,
    }));
  }

  /**
   * Combined search across ideas and documents
   */
  async combinedSearch(
    query: string,
    context: AIContext,
    options?: RAGOptions
  ): Promise<CombinedRAGResult[]> {
    const results: CombinedRAGResult[] = [];

    // Search documents if enabled
    if (options?.includeDocuments !== false) {
      const docResults = await documentService.searchDocuments(query, context, {
        limit: options?.maxDocuments || CONFIG.defaultMaxDocuments,
        includeChunks: true,
      });

      for (const doc of docResults) {
        results.push({
          type: doc.matchedChunk ? 'chunk' : 'document',
          id: doc.id,
          title: doc.title,
          content: doc.matchedChunk || doc.summary,
          similarity: doc.similarity,
          metadata: {
            documentId: doc.id,
            pageNumber: doc.pageNumber,
            mimeType: doc.mimeType,
          },
        });
      }
    }

    // Search ideas if enabled
    if (options?.includeIdeas !== false) {
      const queryEmbedding = await generateEmbedding(query);
      if (queryEmbedding && queryEmbedding.length > 0) {
        const embeddingStr = `[${queryEmbedding.join(',')}]`;
        const minSimilarity = options?.minSimilarity || CONFIG.defaultMinSimilarity;

        const ideaResults = await queryContext(
          context,
          `SELECT
            id, title, summary, type,
            1 - (embedding <=> $1::vector) as similarity
          FROM ideas
          WHERE context = $2
            AND embedding IS NOT NULL
            AND is_archived = FALSE
            AND 1 - (embedding <=> $1::vector) >= $3
          ORDER BY embedding <=> $1::vector
          LIMIT $4`,
          [embeddingStr, context, minSimilarity, options?.maxDocuments || 5]
        );

        for (const row of ideaResults.rows) {
          results.push({
            type: 'idea',
            id: row.id,
            title: row.title,
            content: row.summary,
            similarity: parseFloat(row.similarity),
            metadata: {
              ideaType: row.type,
            },
          });
        }
      }
    }

    // Sort by similarity and return
    return results.sort((a, b) => b.similarity - a.similarity);
  }

  /**
   * Build document context for chat
   */
  async buildDocumentContext(
    query: string,
    context: AIContext,
    options?: { maxDocuments?: number; maxChunks?: number }
  ): Promise<DocumentContext> {
    const maxDocuments = options?.maxDocuments || CONFIG.defaultMaxDocuments;
    const maxChunks = options?.maxChunks || CONFIG.defaultMaxChunks;

    // Search for relevant documents
    const docResults = await documentService.searchDocuments(query, context, {
      limit: maxDocuments,
      includeChunks: true,
    });

    // Search for relevant chunks
    const chunkResults = await this.searchChunks(query, context, {
      limit: maxChunks,
    });

    // Build context text
    const contextParts: string[] = [];
    const citations: string[] = [];

    // Add document summaries
    if (docResults.length > 0) {
      contextParts.push('### Relevante Dokumente:');
      for (const doc of docResults) {
        contextParts.push(`\n**${doc.title}** (Relevanz: ${Math.round(doc.similarity * 100)}%)`);
        contextParts.push(doc.summary);
        citations.push(`[${doc.title}](doc:${doc.id})`);
      }
    }

    // Add relevant chunks
    if (chunkResults.length > 0) {
      contextParts.push('\n\n### Relevante Textstellen:');
      for (const chunk of chunkResults.slice(0, 5)) {
        const pageInfo = chunk.pageNumber ? ` (Seite ${chunk.pageNumber})` : '';
        contextParts.push(`\n**Aus "${chunk.documentTitle}"${pageInfo}:**`);
        contextParts.push(`> ${chunk.content.substring(0, 500)}...`);
      }
    }

    // Truncate if too long
    let contextText = contextParts.join('\n');
    if (contextText.length > CONFIG.maxContextLength) {
      contextText = contextText.substring(0, CONFIG.maxContextLength) + '\n\n[...gekürzt]';
    }

    return {
      relevantDocuments: docResults.map(d => ({
        id: d.id,
        title: d.title,
        summary: d.summary,
        similarity: d.similarity,
      })),
      relevantChunks: chunkResults.map(c => ({
        documentId: c.documentId,
        documentTitle: c.documentTitle,
        content: c.content,
        pageNumber: c.pageNumber,
        similarity: c.similarity,
      })),
      contextText,
      citations,
    };
  }

  /**
   * Get context for specific documents by ID
   */
  async getDocumentContextById(
    documentIds: string[],
    context: AIContext
  ): Promise<string> {
    if (documentIds.length === 0) {
      return '';
    }

    const result = await queryContext(
      context,
      `SELECT id, title, summary, full_text
       FROM documents
       WHERE id = ANY($1) AND context = $2`,
      [documentIds, context]
    );

    const contextParts: string[] = ['### Referenzierte Dokumente:'];

    for (const row of result.rows) {
      contextParts.push(`\n**${row.title || 'Untitled'}**`);
      if (row.summary) {
        contextParts.push(`Zusammenfassung: ${row.summary}`);
      }
      if (row.full_text) {
        // Include first 2000 chars of full text
        contextParts.push(`Inhalt: ${row.full_text.substring(0, 2000)}...`);
      }
    }

    return contextParts.join('\n');
  }

  /**
   * Find similar documents to a given document
   */
  async findSimilarDocuments(
    documentId: string,
    context: AIContext,
    limit: number = 5
  ): Promise<DocumentSearchResult[]> {
    // Get document embedding
    const docResult = await queryContext(
      context,
      `SELECT embedding, title FROM documents WHERE id = $1`,
      [documentId]
    );

    if (!docResult.rows[0]?.embedding) {
      return [];
    }

    const embedding = docResult.rows[0].embedding;

    // Find similar documents
    const result = await queryContext(
      context,
      `SELECT
        id, title, summary, mime_type, folder_path,
        1 - (embedding <=> $1::vector) as similarity
      FROM documents
      WHERE context = $2
        AND id != $3
        AND embedding IS NOT NULL
        AND is_archived = FALSE
      ORDER BY embedding <=> $1::vector
      LIMIT $4`,
      [embedding, context, documentId, limit]
    );

    return result.rows.map(row => ({
      id: row.id,
      title: row.title || 'Untitled',
      summary: row.summary || '',
      mimeType: row.mime_type,
      folderPath: row.folder_path,
      similarity: parseFloat(row.similarity),
    }));
  }

  /**
   * Extract citations from document chunks
   */
  extractCitations(chunks: DocumentChunkResult[]): string[] {
    const seen = new Set<string>();
    const citations: string[] = [];

    for (const chunk of chunks) {
      const key = chunk.documentId;
      if (!seen.has(key)) {
        seen.add(key);
        const pageInfo = chunk.pageNumber ? `, S. ${chunk.pageNumber}` : '';
        citations.push(`${chunk.documentTitle}${pageInfo}`);
      }
    }

    return citations;
  }

  /**
   * Score and rank combined results
   */
  rankResults(results: CombinedRAGResult[]): CombinedRAGResult[] {
    // Apply type-based weighting
    const weighted = results.map(r => {
      let weight = 1.0;

      // Chunks are often more precise
      if (r.type === 'chunk') {
        weight = CONFIG.chunkWeight;
      } else if (r.type === 'document') {
        weight = CONFIG.documentWeight;
      }

      return {
        ...r,
        similarity: r.similarity * weight,
      };
    });

    // Sort by weighted similarity
    return weighted.sort((a, b) => b.similarity - a.similarity);
  }

  /**
   * Format results for AI prompt inclusion
   */
  formatForPrompt(results: CombinedRAGResult[], maxLength: number = 4000): string {
    const parts: string[] = [];
    let currentLength = 0;

    for (const result of results) {
      const part = this.formatSingleResult(result);

      if (currentLength + part.length > maxLength) {
        break;
      }

      parts.push(part);
      currentLength += part.length;
    }

    return parts.join('\n\n');
  }

  private formatSingleResult(result: CombinedRAGResult): string {
    const typeLabel = result.type === 'idea' ? 'Idee' :
                     result.type === 'chunk' ? 'Dokument-Auszug' : 'Dokument';

    const relevance = Math.round(result.similarity * 100);

    let formatted = `**[${typeLabel}] ${result.title}** (${relevance}% Relevanz)`;

    if (result.metadata.pageNumber) {
      formatted += ` - Seite ${result.metadata.pageNumber}`;
    }

    formatted += `\n${result.content}`;

    return formatted;
  }
}

// Export singleton instance
export const documentRAGService = new DocumentRAGService();
