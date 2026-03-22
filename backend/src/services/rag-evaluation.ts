/**
 * Phase 101 B1: RAG Evaluation Metrics
 *
 * Formal IR evaluation metrics for measuring RAG retrieval quality.
 * Metrics: Precision@k, MRR (Mean Reciprocal Rank), NDCG
 *
 * Relevance signal:
 * - Primary: user feedback from rag_feedback table (Phase 47)
 * - Secondary: cross-encoder score > 0.6 as proxy
 * - NOT circular: CRAG scores are NOT used as ground truth
 */

import { AIContext, queryContext } from '../utils/database-context';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

// ===========================================
// Types
// ===========================================

export interface RAGEvaluationRecord {
  queryText: string;
  precisionAtK: number;
  mrr: number;
  ndcg: number;
  k: number;
  threshold: number;
  strategyUsed?: string;
  resultCount?: number;
  sessionId?: string;
}

export interface RAGEvaluationStats {
  strategyUsed: string | null;
  totalEvaluations: number;
  avgPrecision: number;
  avgMRR: number;
  avgNDCG: number;
}

// ===========================================
// Precision@k
// ===========================================

/**
 * Calculate Precision@k: fraction of top-k documents that are relevant.
 *
 * A document is considered relevant if its score >= threshold.
 * Only the first k documents are evaluated.
 *
 * @param scores - Array of relevance scores (0-1), ordered by rank
 * @param k - Number of top documents to evaluate
 * @param threshold - Minimum score to consider a document relevant
 * @returns Precision@k value in [0, 1]
 */
export function calculatePrecisionAtK(scores: number[], k: number, threshold: number): number {
  if (scores.length === 0 || k <= 0) {return 0.0;}

  const topK = scores.slice(0, k);
  const relevantCount = topK.filter(score => score >= threshold).length;
  return relevantCount / topK.length;
}

// ===========================================
// MRR (Mean Reciprocal Rank)
// ===========================================

/**
 * Calculate MRR: reciprocal of the rank of the first relevant document.
 *
 * MRR = 1/rank_of_first_relevant_doc
 * If no relevant document is found, returns 0.
 *
 * @param scores - Array of relevance scores (0-1), ordered by rank
 * @param threshold - Minimum score to consider a document relevant
 * @returns MRR value in [0, 1]
 */
export function calculateMRR(scores: number[], threshold: number): number {
  if (scores.length === 0) {return 0.0;}

  for (let i = 0; i < scores.length; i++) {
    if (scores[i] >= threshold) {
      return 1 / (i + 1);
    }
  }

  return 0.0;
}

// ===========================================
// NDCG (Normalized Discounted Cumulative Gain)
// ===========================================

/**
 * Calculate NDCG: normalized measure of ranking quality.
 *
 * Uses binary relevance (1 if score >= threshold, 0 otherwise).
 * DCG = sum of (rel_i / log2(i+1)) for i=1..n
 * IDCG = DCG for perfect ranking (all relevant docs first)
 * NDCG = DCG / IDCG
 *
 * @param scores - Array of relevance scores (0-1), ordered by rank
 * @param threshold - Minimum score to consider a document relevant
 * @returns NDCG value in [0, 1]
 */
export function calculateNDCG(scores: number[], threshold: number): number {
  if (scores.length === 0) {return 0.0;}

  const relevance: number[] = scores.map(s => (s >= threshold ? 1 : 0));

  // DCG: actual ranked order
  const dcg = relevance.reduce((sum, rel, i) => {
    if (rel === 0) {return sum;}
    return sum + rel / Math.log2(i + 2); // i+2 because log2(1) = 0, use log2(rank+1) with rank starting at 1
  }, 0);

  // IDCG: ideal order (all relevant docs first)
  const sortedRelevance = [...relevance].sort((a, b) => b - a);
  const idcg = sortedRelevance.reduce((sum, rel, i) => {
    if (rel === 0) {return sum;}
    return sum + rel / Math.log2(i + 2);
  }, 0);

  if (idcg === 0) {return 0.0;}
  return Math.min(dcg / idcg, 1.0);
}

// ===========================================
// DB Recording
// ===========================================

/**
 * Store a RAG evaluation record in the database.
 *
 * @param context - AI context (personal, work, learning, creative)
 * @param record - Evaluation metrics to store
 * @returns The ID of the created record, or empty string on error
 */
export async function recordRAGEvaluation(
  context: AIContext,
  record: RAGEvaluationRecord
): Promise<string> {
  try {
    const id = uuidv4();
    const result = await queryContext(
      context,
      `INSERT INTO rag_evaluation_metrics (
        id, query_text, precision_at_k, mrr, ndcg,
        k, threshold, strategy_used, result_count, session_id, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
      RETURNING id`,
      [
        id,
        record.queryText,
        record.precisionAtK,
        record.mrr,
        record.ndcg,
        record.k,
        record.threshold,
        record.strategyUsed ?? null,
        record.resultCount ?? null,
        record.sessionId ?? null,
      ]
    );

    return result.rows[0]?.id ?? id;
  } catch (error) {
    logger.error('Failed to record RAG evaluation', error instanceof Error ? error : undefined);
    return '';
  }
}

/**
 * Get aggregated RAG evaluation stats per strategy.
 *
 * @param context - AI context
 * @param days - Number of days to look back
 * @returns Array of strategy stats
 */
export async function getRAGEvaluationStats(
  context: AIContext,
  days: number
): Promise<RAGEvaluationStats[]> {
  try {
    const result = await queryContext(
      context,
      `SELECT
        strategy_used,
        COUNT(*) AS total_evaluations,
        AVG(precision_at_k) AS avg_precision,
        AVG(mrr) AS avg_mrr,
        AVG(ndcg) AS avg_ndcg
      FROM rag_evaluation_metrics
      WHERE created_at >= NOW() - INTERVAL '1 day' * $1
      GROUP BY strategy_used
      ORDER BY total_evaluations DESC`,
      [days]
    );

    return result.rows.map(row => ({
      strategyUsed: row.strategy_used ?? null,
      totalEvaluations: parseInt(row.total_evaluations, 10) || 0,
      avgPrecision: parseFloat(row.avg_precision) || 0,
      avgMRR: parseFloat(row.avg_mrr) || 0,
      avgNDCG: parseFloat(row.avg_ndcg) || 0,
    }));
  } catch (error) {
    logger.error('Failed to get RAG evaluation stats', error instanceof Error ? error : undefined);
    return [];
  }
}
