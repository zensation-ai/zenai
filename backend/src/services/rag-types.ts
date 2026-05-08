/**
 * RAG Types
 *
 * Shared types used by enhanced-rag.ts and rag-cache.ts.
 * Extracted to break circular dependency.
 *
 * @module services/rag-types
 */

import type { ARAGExecutionMetadata } from './arag/retrieval-interfaces';

/**
 * Enhanced retrieval result
 */
export interface EnhancedResult {
  id: string;
  title: string;
  summary: string;
  content?: string;
  /** Final combined score */
  score: number;
  /** Score breakdown */
  scores: {
    semantic?: number;
    hyde?: number;
    crossEncoder?: number;
    agentic?: number;
  };
  /** Which methods contributed */
  sources: ('semantic' | 'hyde' | 'cross_encoder' | 'agentic' | 'graphrag' | 'arag')[];
  /** Relevance explanation (from cross-encoder) */
  relevanceReason?: string;
}

/**
 * Full enhanced RAG result
 */
export interface EnhancedRAGResult {
  results: EnhancedResult[];
  /** Overall confidence */
  confidence: number;
  /** Methods used */
  methodsUsed: string[];
  /** Timing breakdown */
  timing: {
    total: number;
    hyde?: number;
    agentic?: number;
    crossEncoder?: number;
    /** Phase 67.1: Whether this result came from cache */
    cacheHit?: boolean;
    /** Phase 70: A-RAG execution metadata */
    arag?: ARAGExecutionMetadata;
  };
  /** Debug information */
  debug?: {
    hydeUsed: boolean;
    hydeReason?: string;
    queryReformulations?: string[];
    queryDecomposition?: { original: string; subQueries: Array<{ query: string; purpose: string }>; decompositionType: string };
  };
}
