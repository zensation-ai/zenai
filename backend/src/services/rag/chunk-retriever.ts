/**
 * Chunk Retrieval Service
 *
 * Retrieves document chunks from the database using vector similarity search.
 * Supports parent-context expansion for parent-child chunking strategy.
 *
 * @module services/rag/chunk-retriever
 */

import { AIContext, queryContext } from '../../utils/database-context';
import { logger } from '../../utils/logger';
import { generateEmbedding } from '../ai';
import { DocumentChunk } from './semantic-chunker';

// ===========================================
// Types & Interfaces
// ===========================================

export interface ChunkRetrievalResult {
  chunk: DocumentChunk;
  parentChunk?: DocumentChunk;
  score: number;
  /** Parent content if available, otherwise chunk content */
  contextualContent: string;
}

export interface ChunkRetrievalOptions {
  /** Maximum number of chunks to return (default: 10) */
  maxResults?: number;
  /** Minimum similarity score (default: 0.3) */
  minScore?: number;
  /** Filter by document ID */
  documentId?: string;
  /** Filter by chunk strategy */
  strategy?: DocumentChunk['strategy'];
  /** Whether to include parent context for child chunks (default: true) */
  includeParentContext?: boolean;
}

// ===========================================
// Constants
// ===========================================

const DEFAULTS = {
  maxResults: 10,
  minScore: 0.3,
  /** Number of surrounding chunks to expand context */
  expandWindow: 2,
} as const;

// ===========================================
// Chunk Retriever
// ===========================================

/**
 * Retrieve chunks by vector similarity search.
 *
 * @param query - The search query
 * @param context - The AI context (personal, work, learning, creative)
 * @param options - Retrieval options
 * @returns Ranked chunk results
 */
export async function retrieveChunks(
  query: string,
  context: AIContext,
  options: ChunkRetrievalOptions = {}
): Promise<ChunkRetrievalResult[]> {
  const {
    maxResults = DEFAULTS.maxResults,
    minScore = DEFAULTS.minScore,
    documentId,
    strategy,
  } = options;

  const startTime = Date.now();

  logger.info('Retrieving chunks', {
    query: query.substring(0, 50),
    context,
    maxResults,
  });

  // Generate query embedding
  const queryEmbedding = await generateEmbedding(query);

  // Build SQL with optional filters
  const conditions: string[] = ['embedding IS NOT NULL'];
  const params: (string | number | string)[] = [`[${queryEmbedding.join(',')}]`];
  let paramIndex = 2;

  if (documentId) {
    conditions.push(`document_id = $${paramIndex++}`);
    params.push(documentId);
  }

  if (strategy) {
    conditions.push(`strategy = $${paramIndex++}`);
    params.push(strategy);
  }

  const whereClause = conditions.length > 0
    ? `WHERE ${conditions.join(' AND ')}`
    : '';

  params.push(maxResults);
  const limitParam = `$${params.length}`;

  const sql = `
    SELECT
      id, document_id, parent_chunk_id, content, strategy,
      position, token_count, metadata,
      1 - (embedding <=> $1::vector) AS similarity
    FROM document_chunks
    ${whereClause}
    ORDER BY embedding <=> $1::vector
    LIMIT ${limitParam}
  `;

  const result = await queryContext(context, sql, params);

  const chunks: ChunkRetrievalResult[] = result.rows
    .filter((row: Record<string, unknown>) => (row.similarity as number) >= minScore)
    .map((row: Record<string, unknown>) => ({
      chunk: {
        id: row.id as string,
        documentId: row.document_id as string,
        content: row.content as string,
        parentChunkId: row.parent_chunk_id as string | undefined,
        strategy: row.strategy as DocumentChunk['strategy'],
        position: row.position as number,
        tokenCount: row.token_count as number,
        metadata: (row.metadata as Record<string, unknown>) || {},
      },
      score: row.similarity as number,
      contextualContent: row.content as string,
    }));

  logger.info('Chunks retrieved', {
    resultCount: chunks.length,
    topScore: chunks.length > 0 ? chunks[0].score : 0,
    durationMs: Date.now() - startTime,
  });

  return chunks;
}

/**
 * Retrieve child chunks and return their parent chunks for richer context.
 *
 * Searches child chunks (fine-grained), but returns the parent chunk content
 * as contextualContent so the LLM sees the broader surrounding text.
 *
 * @param query - The search query
 * @param context - The AI context
 * @param options - Retrieval options
 * @returns Chunk results with parent context
 */
export async function retrieveWithParents(
  query: string,
  context: AIContext,
  options: ChunkRetrievalOptions = {}
): Promise<ChunkRetrievalResult[]> {
  const {
    maxResults = DEFAULTS.maxResults,
    minScore = DEFAULTS.minScore,
    documentId,
  } = options;

  const queryEmbedding = await generateEmbedding(query);

  // Search child chunks only (they have parent_chunk_id)
  const conditions: string[] = [
    'c.embedding IS NOT NULL',
    'c.parent_chunk_id IS NOT NULL',
  ];
  const params: (string | number | string)[] = [`[${queryEmbedding.join(',')}]`];
  let paramIndex = 2;

  if (documentId) {
    conditions.push(`c.document_id = $${paramIndex++}`);
    params.push(documentId);
  }

  const whereClause = conditions.join(' AND ');

  params.push(maxResults);
  const limitParam = `$${params.length}`;

  const sql = `
    SELECT
      c.id, c.document_id, c.parent_chunk_id, c.content, c.strategy,
      c.position, c.token_count, c.metadata,
      1 - (c.embedding <=> $1::vector) AS similarity,
      p.id AS parent_id, p.content AS parent_content,
      p.position AS parent_position, p.token_count AS parent_token_count,
      p.metadata AS parent_metadata
    FROM document_chunks c
    LEFT JOIN document_chunks p ON p.id = c.parent_chunk_id
    WHERE ${whereClause}
    ORDER BY c.embedding <=> $1::vector
    LIMIT ${limitParam}
  `;

  const result = await queryContext(context, sql, params);

  const chunks: ChunkRetrievalResult[] = result.rows
    .filter((row: Record<string, unknown>) => (row.similarity as number) >= minScore)
    .map((row: Record<string, unknown>) => {
      const parentChunk = row.parent_id ? {
        id: row.parent_id as string,
        documentId: row.document_id as string,
        content: row.parent_content as string,
        strategy: row.strategy as DocumentChunk['strategy'],
        position: row.parent_position as number,
        tokenCount: row.parent_token_count as number,
        metadata: (row.parent_metadata as Record<string, unknown>) || {},
      } : undefined;

      return {
        chunk: {
          id: row.id as string,
          documentId: row.document_id as string,
          content: row.content as string,
          parentChunkId: row.parent_chunk_id as string | undefined,
          strategy: row.strategy as DocumentChunk['strategy'],
          position: row.position as number,
          tokenCount: row.token_count as number,
          metadata: (row.metadata as Record<string, unknown>) || {},
        },
        parentChunk,
        score: row.similarity as number,
        // Use parent content for richer context, fall back to chunk content
        contextualContent: (row.parent_content as string) || (row.content as string),
      };
    });

  return chunks;
}

/**
 * Expand context around a specific chunk by fetching its neighbors.
 *
 * Retrieves surrounding chunks from the same document, ordered by position.
 *
 * @param chunkId - The chunk to expand around
 * @param context - The AI context
 * @param window - Number of chunks before and after to include (default: 2)
 * @returns The target chunk plus surrounding chunks, ordered by position
 */
export async function expandContext(
  chunkId: string,
  context: AIContext,
  window: number = DEFAULTS.expandWindow
): Promise<ChunkRetrievalResult[]> {
  // First, get the target chunk to find its document and position
  const targetResult = await queryContext(
    context,
    `SELECT id, document_id, position, strategy FROM document_chunks WHERE id = $1`,
    [chunkId]
  );

  if (targetResult.rows.length === 0) {
    logger.warn('Chunk not found for context expansion', { chunkId });
    return [];
  }

  const target = targetResult.rows[0] as {
    id: string;
    document_id: string;
    position: number;
    strategy: string;
  };

  // Fetch surrounding chunks from the same document and strategy level
  const sql = `
    SELECT
      id, document_id, parent_chunk_id, content, strategy,
      position, token_count, metadata
    FROM document_chunks
    WHERE document_id = $1
      AND strategy = $2
      AND position BETWEEN $3 AND $4
      AND parent_chunk_id IS NOT DISTINCT FROM (
        SELECT parent_chunk_id FROM document_chunks WHERE id = $5
      )
    ORDER BY position ASC
  `;

  const result = await queryContext(context, sql, [
    target.document_id,
    target.strategy,
    Math.max(0, target.position - window),
    target.position + window,
    chunkId,
  ]);

  return result.rows.map((row: Record<string, unknown>) => ({
    chunk: {
      id: row.id as string,
      documentId: row.document_id as string,
      content: row.content as string,
      parentChunkId: row.parent_chunk_id as string | undefined,
      strategy: row.strategy as DocumentChunk['strategy'],
      position: row.position as number,
      tokenCount: row.token_count as number,
      metadata: (row.metadata as Record<string, unknown>) || {},
    },
    score: row.id === chunkId ? 1.0 : 0.8, // target chunk gets full score
    contextualContent: row.content as string,
  }));
}
