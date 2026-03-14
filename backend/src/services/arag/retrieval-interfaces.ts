/**
 * Phase 70: A-RAG Retrieval Interfaces
 *
 * Defines the 5 retrieval interface types and core data structures
 * for the Autonomous Retrieval Strategy system.
 *
 * @module services/arag/retrieval-interfaces
 */

// ===========================================
// Retrieval Interface Types
// ===========================================

/**
 * The 5 retrieval interfaces available to the strategy agent:
 * - keyword: PostgreSQL full-text search (BM25)
 * - semantic: Embedding-based vector similarity search
 * - chunk_read: Direct idea lookup by ID for deep content reading
 * - graph: Knowledge graph traversal (entity-based 2-hop)
 * - community: GraphRAG community summary search
 */
export type RetrievalInterface = 'keyword' | 'semantic' | 'chunk_read' | 'graph' | 'community';

// ===========================================
// Query Classification
// ===========================================

/**
 * Classification of query complexity for strategy planning.
 */
export type QueryClassification =
  | 'simple_lookup'
  | 'multi_hop'
  | 'comparison'
  | 'temporal'
  | 'analytical';

// ===========================================
// Retrieval Plan
// ===========================================

/**
 * A single step in a retrieval plan.
 */
export interface RetrievalStep {
  /** Which retrieval interface to use */
  interface: RetrievalInterface;
  /** Parameters for the retrieval call */
  params: Record<string, unknown>;
  /** Index of a previous step this step depends on (for sequential execution) */
  dependsOn?: number;
}

/**
 * A complete retrieval plan produced by the strategy agent.
 */
export interface RetrievalPlan {
  /** Ordered list of retrieval steps */
  steps: RetrievalStep[];
  /** Strategy agent's reasoning for this plan */
  reasoning: string;
  /** Expected confidence level (0-1) */
  expectedConfidence: number;
  /** Classified query type */
  queryType: QueryClassification;
}

// ===========================================
// Retrieval Results
// ===========================================

/**
 * A single retrieval result item.
 */
export interface RetrievalResultItem {
  id: string;
  content: string;
  score: number;
  source: string;
  title?: string;
}

/**
 * Aggregated result from executing a retrieval plan.
 */
export interface RetrievalResult {
  /** Retrieved items */
  results: RetrievalResultItem[];
  /** Confidence in result quality (0-1) */
  confidence: number;
  /** Completeness of the answer (0-1) */
  completeness: number;
}

// ===========================================
// Evaluation
// ===========================================

/**
 * Evaluation outcome from the strategy evaluator.
 */
export interface EvaluationOutcome {
  /** Overall confidence in retrieved results (0-1) */
  confidence: number;
  /** Completeness score (0-1) */
  completeness: number;
  /** Whether to retry with an expanded strategy */
  shouldRetry: boolean;
  /** Reason for the evaluation decision */
  reason: string;
}

// ===========================================
// A-RAG Execution Metadata
// ===========================================

/**
 * Timing and metadata from an A-RAG execution.
 */
export interface ARAGExecutionMetadata {
  /** Total execution time in ms */
  totalTimeMs: number;
  /** Number of retrieval iterations performed */
  iterations: number;
  /** Interfaces used across all iterations */
  interfacesUsed: RetrievalInterface[];
  /** Per-step timing breakdown */
  stepTimings: Array<{ interface: RetrievalInterface; durationMs: number }>;
  /** Whether the strategy agent was used (vs fallback) */
  usedStrategyAgent: boolean;
  /** Query classification */
  queryType: QueryClassification;
}
