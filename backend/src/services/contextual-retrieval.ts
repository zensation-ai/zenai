/**
 * Phase 99/100: Contextual Retrieval Service
 *
 * Enriches document chunks with document-level context before embedding.
 * According to Anthropic's research, this technique reduces retrieval
 * failures by 35-67% by making ambiguous chunks self-describing.
 *
 * Phase 100 upgrade: Uses Claude Haiku for real context generation
 * instead of simple template strings.
 *
 * @module services/contextual-retrieval
 */

import { logger } from '../utils/logger';
import { generateClaudeResponse } from './claude/core';
import { queryContext, AIContext } from '../utils/database-context';

// ===========================================
// Types
// ===========================================

export interface ChunkContext {
  documentTitle?: string;
  sectionHeader?: string;
  chunkContent: string;
}

export interface LLMChunkContext {
  documentTitle?: string;
  sectionHeader?: string;
  chunkContent: string;
  fullDocument?: string;
}

export interface EnrichedChunk {
  content: string;
  contextPrefix: string;
  enrichedContent: string;
}

// ===========================================
// Template-Based Context Prefix (Fast Fallback)
// ===========================================

/**
 * Generate a short context prefix from document metadata.
 * Uses a simple template (no API call) for speed.
 * This is the fallback when Claude Haiku is unavailable.
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
// LLM-Based Context Prefix (Claude Haiku)
// ===========================================

const MAX_DOC_CHARS = 8000;

/**
 * Generate a 1-2 sentence context explaining WHERE the chunk appears
 * and WHAT it's about, using Claude Haiku.
 *
 * Falls back to template on error.
 *
 * @param ctx - Chunk context with optional full document text
 * @returns Context prefix string (1-2 sentences)
 */
export async function generateContextPrefixLLM(ctx: LLMChunkContext): Promise<string> {
  try {
    // Truncate document to ~8000 chars
    const docText = ctx.fullDocument
      ? ctx.fullDocument.substring(0, MAX_DOC_CHARS)
      : '';

    const systemPrompt = `You are a document context assistant. Given a document and a chunk from it, write a concise 1-2 sentence context prefix explaining WHERE in the document this chunk appears and WHAT it discusses. Output ONLY the context sentence(s), nothing else. Use the same language as the document.`;

    const userPrompt = `Document title: ${ctx.documentTitle || 'Untitled'}
${ctx.sectionHeader ? `Section: ${ctx.sectionHeader}` : ''}

Document (truncated):
${docText}

---
Chunk to contextualize:
${ctx.chunkContent}

Context prefix:`;

    const response = await generateClaudeResponse(systemPrompt, userPrompt, {
      maxTokens: 100,
      temperature: 0.2,
    });

    if (!response || response.trim().length === 0) {
      // Fall back to template
      return generateContextPrefix({
        documentTitle: ctx.documentTitle,
        sectionHeader: ctx.sectionHeader,
        chunkContent: ctx.chunkContent,
      });
    }

    return response.trim() + ' ';
  } catch (error) {
    logger.warn('Claude Haiku context prefix generation failed, using template fallback', {
      error: error instanceof Error ? error.message : String(error),
      title: ctx.documentTitle,
    });

    // Fall back to template
    return generateContextPrefix({
      documentTitle: ctx.documentTitle,
      sectionHeader: ctx.sectionHeader,
      chunkContent: ctx.chunkContent,
    });
  }
}

// ===========================================
// Chunk Enrichment
// ===========================================

/**
 * Enrich a chunk by prepending its context prefix.
 */
export function enrichChunk(content: string, contextPrefix: string): string {
  if (!contextPrefix) {
    return content;
  }
  return contextPrefix + content;
}

/**
 * Full enrichment pipeline: generate prefix + enrich chunk.
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
// Backfill Function
// ===========================================

/**
 * Find old template-based enriched content records that could be
 * upgraded with LLM-generated context.
 *
 * Template records match the pattern: "This chunk from '...' discusses ..."
 */
export async function backfillTemplateContent(
  context: AIContext | string,
  limit: number = 50
): Promise<Array<{ id: string; enriched_content: string }>> {
  try {
    const result = await queryContext(
      context as AIContext,
      `SELECT id, enriched_content FROM ideas
       WHERE enriched_content IS NOT NULL
         AND enriched_content LIKE 'This chunk from%'
       LIMIT $1`,
      [limit]
    );

    return result.rows;
  } catch (error) {
    logger.warn('Failed to find template-based records for backfill', {
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
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
