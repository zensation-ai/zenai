/**
 * Phase 99: Contextual Retrieval Service
 *
 * Enriches document chunks with document-level context before embedding.
 * According to Anthropic's research, this technique reduces retrieval
 * failures by 35-67% by making ambiguous chunks self-describing.
 *
 * This module provides:
 * - `generateContextPrefix()`: Creates a short context prefix from document metadata
 * - `enrichChunk()`: Prepends context prefix to chunk content
 * - `getEnrichedEmbeddingColumn()`: Returns the correct embedding column for queries
 *
 * @module services/contextual-retrieval
 */

import { logger } from '../utils/logger';

// ===========================================
// Types
// ===========================================

export interface ChunkContext {
  documentTitle?: string;
  sectionHeader?: string;
  chunkContent: string;
}

export interface EnrichedChunk {
  content: string;
  contextPrefix: string;
  enrichedContent: string;
}

// ===========================================
// Context Prefix Generation
// ===========================================

/**
 * Generate a short context prefix from document metadata.
 * Uses a simple template (no API call) for speed.
 *
 * Template: "This chunk from '{title}' discusses {section}. "
 *
 * @param ctx - Document context metadata
 * @returns Short context prefix string (typically 50-100 tokens)
 */
export function generateContextPrefix(ctx: ChunkContext): string {
  const parts: string[] = [];

  if (ctx.documentTitle) {
    parts.push(`This chunk from '${ctx.documentTitle}'`);
  }

  if (ctx.sectionHeader) {
    if (parts.length > 0) {
      parts[0] += ` discusses ${ctx.sectionHeader}`;
    } else {
      parts.push(`This chunk discusses ${ctx.sectionHeader}`);
    }
  }

  if (parts.length === 0) {
    return '';
  }

  return parts.join('') + '. ';
}

// ===========================================
// Chunk Enrichment
// ===========================================

/**
 * Enrich a chunk by prepending its context prefix.
 *
 * @param content - Original chunk content
 * @param contextPrefix - Pre-generated context prefix
 * @returns Enriched content string
 */
export function enrichChunk(content: string, contextPrefix: string): string {
  if (!contextPrefix) {
    return content;
  }
  return contextPrefix + content;
}

/**
 * Full enrichment pipeline: generate prefix + enrich chunk.
 *
 * @param ctx - Document context metadata with chunk content
 * @returns EnrichedChunk with original content, prefix, and enriched content
 */
export function enrichChunkFull(ctx: ChunkContext): EnrichedChunk {
  const contextPrefix = generateContextPrefix(ctx);
  const enrichedContent = enrichChunk(ctx.chunkContent, contextPrefix);

  logger.debug('Chunk enriched with context', {
    hasTitle: !!ctx.documentTitle,
    hasSection: !!ctx.sectionHeader,
    prefixLength: contextPrefix.length,
    originalLength: ctx.chunkContent.length,
    enrichedLength: enrichedContent.length,
  });

  return {
    content: ctx.chunkContent,
    contextPrefix,
    enrichedContent,
  };
}

// ===========================================
// Query Helpers
// ===========================================

/**
 * Returns the SQL column name for the best available embedding.
 * Prefers enriched_embedding when available, falls back to embedding.
 */
export function getEnrichedEmbeddingColumn(): string {
  return 'COALESCE(enriched_embedding, embedding)';
}
