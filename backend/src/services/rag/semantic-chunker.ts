/**
 * Semantic Chunking Service
 *
 * Provides intelligent document chunking strategies for RAG:
 * - Fixed: Simple token-based splitting (backward-compatible)
 * - Semantic: Paragraph-boundary splitting with similarity-based merging
 * - Parent-Child: Hierarchical chunks for context-rich retrieval
 *
 * @module services/rag/semantic-chunker
 */

import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../utils/logger';
import { generateEmbedding } from '../ai';

// ===========================================
// Types & Interfaces
// ===========================================

export interface ChunkStrategy {
  type: 'fixed' | 'semantic' | 'parent_child';
  /** Parent chunk size in tokens (default: 1500) */
  parentSize?: number;
  /** Child chunk size in tokens (default: 300) */
  childSize?: number;
  /** Overlap between chunks in tokens (default: 50) */
  overlapTokens?: number;
}

export interface DocumentChunk {
  id: string;
  documentId: string;
  content: string;
  parentChunkId?: string;
  strategy: ChunkStrategy['type'];
  position: number;
  tokenCount: number;
  embedding?: number[];
  metadata: Record<string, unknown>;
}

// ===========================================
// Constants
// ===========================================

/** Default chunk sizes in tokens */
const DEFAULTS = {
  fixedSize: 500,
  parentSize: 1500,
  childSize: 300,
  overlapTokens: 50,
  /** Cosine similarity threshold for merging adjacent paragraphs */
  mergeSimilarityThreshold: 0.8,
  /** Maximum merged paragraph size in tokens before forcing a split */
  maxMergedSize: 800,
} as const;

// ===========================================
// Token Estimation
// ===========================================

/**
 * Estimate token count using word/4 heuristic.
 * This is a fast approximation — no tiktoken dependency needed.
 */
export function estimateTokens(text: string): number {
  if (!text) {return 0;}
  // Split on whitespace, count words, multiply by ~1.3 for sub-word tokens
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  return Math.ceil(wordCount * 1.3);
}

// ===========================================
// Text Splitting Utilities
// ===========================================

/**
 * Split text into paragraphs by double newline boundaries.
 * Single newlines within a paragraph are preserved.
 */
function splitIntoParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map(p => p.trim())
    .filter(p => p.length > 0);
}

/**
 * Split text into token-sized chunks with overlap.
 */
function splitByTokens(
  text: string,
  maxTokens: number,
  overlapTokens: number
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  // Convert token counts to approximate word counts
  const maxWords = Math.floor(maxTokens / 1.3);
  const overlapWords = Math.floor(overlapTokens / 1.3);

  if (words.length <= maxWords) {
    return [text];
  }

  const chunks: string[] = [];
  let start = 0;

  while (start < words.length) {
    const end = Math.min(start + maxWords, words.length);
    chunks.push(words.slice(start, end).join(' '));
    start = end - overlapWords;
    // Prevent infinite loop if overlap >= maxWords
    if (start >= end) {break;}
  }

  return chunks;
}

/**
 * Compute cosine similarity between two embedding vectors.
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) {return 0;}

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) {return 0;}

  return dotProduct / denominator;
}

// ===========================================
// Chunking Strategies
// ===========================================

/**
 * Fixed-size chunking: simple token-based splitting with overlap.
 * This is the backward-compatible default behavior.
 */
export function fixedChunk(
  text: string,
  documentId: string,
  chunkSize: number = DEFAULTS.fixedSize,
  overlapTokens: number = DEFAULTS.overlapTokens
): DocumentChunk[] {
  if (!text || text.trim().length === 0) {
    return [];
  }

  const segments = splitByTokens(text, chunkSize, overlapTokens);

  return segments.map((content, index) => ({
    id: uuidv4(),
    documentId,
    content,
    strategy: 'fixed' as const,
    position: index,
    tokenCount: estimateTokens(content),
    metadata: {},
  }));
}

/**
 * Semantic chunking: split by paragraph boundaries, then merge
 * adjacent paragraphs that are semantically similar (embedding cosine > threshold).
 *
 * This produces chunks that respect natural topic boundaries.
 */
export async function semanticChunk(
  text: string,
  documentId: string,
  similarityThreshold: number = DEFAULTS.mergeSimilarityThreshold
): Promise<DocumentChunk[]> {
  if (!text || text.trim().length === 0) {
    return [];
  }

  const paragraphs = splitIntoParagraphs(text);

  if (paragraphs.length === 0) {
    return [];
  }

  // Single paragraph — return as-is
  if (paragraphs.length === 1) {
    return [{
      id: uuidv4(),
      documentId,
      content: paragraphs[0],
      strategy: 'semantic' as const,
      position: 0,
      tokenCount: estimateTokens(paragraphs[0]),
      metadata: {},
    }];
  }

  // Generate embeddings for all paragraphs
  let embeddings: number[][];
  try {
    embeddings = await Promise.all(
      paragraphs.map(p => generateEmbedding(p))
    );
  } catch (error) {
    // If embedding generation fails, fall back to paragraph-per-chunk
    logger.warn('Embedding generation failed for semantic chunking, falling back to paragraph split', { error });
    return paragraphs.map((content, index) => ({
      id: uuidv4(),
      documentId,
      content,
      strategy: 'semantic' as const,
      position: index,
      tokenCount: estimateTokens(content),
      metadata: {},
    }));
  }

  // Merge adjacent paragraphs with high similarity
  const mergedChunks: string[] = [];
  let currentGroup = paragraphs[0];

  for (let i = 1; i < paragraphs.length; i++) {
    const similarity = cosineSimilarity(embeddings[i - 1], embeddings[i]);
    const mergedTokens = estimateTokens(currentGroup + '\n\n' + paragraphs[i]);

    if (similarity >= similarityThreshold && mergedTokens <= DEFAULTS.maxMergedSize) {
      // Merge with current group
      currentGroup += '\n\n' + paragraphs[i];
    } else {
      // Start new group
      mergedChunks.push(currentGroup);
      currentGroup = paragraphs[i];
    }
  }
  // Push the last group
  mergedChunks.push(currentGroup);

  return mergedChunks.map((content, index) => ({
    id: uuidv4(),
    documentId,
    content,
    strategy: 'semantic' as const,
    position: index,
    tokenCount: estimateTokens(content),
    metadata: { mergedParagraphs: true },
  }));
}

/**
 * Parent-child chunking: create large parent chunks and smaller child chunks.
 *
 * Child chunks are used for fine-grained retrieval, while parent chunks
 * provide surrounding context for the LLM. This is the recommended
 * strategy for long documents.
 */
export function parentChildChunk(
  text: string,
  documentId: string,
  parentSize: number = DEFAULTS.parentSize,
  childSize: number = DEFAULTS.childSize,
  overlapTokens: number = DEFAULTS.overlapTokens
): DocumentChunk[] {
  if (!text || text.trim().length === 0) {
    return [];
  }

  const chunks: DocumentChunk[] = [];

  // Step 1: Create parent chunks
  const parentSegments = splitByTokens(text, parentSize, overlapTokens);
  const parentChunks: DocumentChunk[] = parentSegments.map((content, index) => ({
    id: uuidv4(),
    documentId,
    content,
    strategy: 'parent_child' as const,
    position: index,
    tokenCount: estimateTokens(content),
    metadata: { level: 'parent' },
  }));

  // Step 2: For each parent, create child chunks
  for (const parent of parentChunks) {
    chunks.push(parent);

    const childSegments = splitByTokens(parent.content, childSize, overlapTokens);
    childSegments.forEach((content, childIndex) => {
      chunks.push({
        id: uuidv4(),
        documentId,
        content,
        parentChunkId: parent.id,
        strategy: 'parent_child' as const,
        position: childIndex,
        tokenCount: estimateTokens(content),
        metadata: { level: 'child', parentPosition: parent.position },
      });
    });
  }

  return chunks;
}

// ===========================================
// Main Entry Point
// ===========================================

/**
 * Chunk a document using the specified strategy.
 *
 * @param text - The full document text
 * @param documentId - The source document ID
 * @param strategy - Chunking strategy configuration
 * @returns Array of document chunks
 */
export async function chunkDocument(
  text: string,
  documentId: string,
  strategy: ChunkStrategy
): Promise<DocumentChunk[]> {
  const startTime = Date.now();

  logger.info('Chunking document', {
    documentId,
    strategy: strategy.type,
    textLength: text?.length || 0,
  });

  let chunks: DocumentChunk[];

  switch (strategy.type) {
    case 'semantic':
      chunks = await semanticChunk(text, documentId);
      break;

    case 'parent_child':
      chunks = parentChildChunk(
        text,
        documentId,
        strategy.parentSize || DEFAULTS.parentSize,
        strategy.childSize || DEFAULTS.childSize,
        strategy.overlapTokens || DEFAULTS.overlapTokens
      );
      break;

    case 'fixed':
    default:
      chunks = fixedChunk(
        text,
        documentId,
        strategy.childSize || DEFAULTS.fixedSize,
        strategy.overlapTokens || DEFAULTS.overlapTokens
      );
      break;
  }

  logger.info('Document chunked', {
    documentId,
    strategy: strategy.type,
    chunkCount: chunks.length,
    durationMs: Date.now() - startTime,
  });

  return chunks;
}
