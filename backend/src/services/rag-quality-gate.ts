/**
 * CRAG Quality Gate (Phase 100)
 *
 * Evaluates retrieval quality after documents are fetched but before
 * they are assembled into context. Based on Corrective RAG (CRAG) paper.
 *
 * Tiers:
 * - CONFIDENT (combined > 0.75): Use docs directly
 * - AMBIGUOUS (0.45-0.75): Reformulate + retry once
 * - FAILED (<0.45): Return low confidence, let caller handle
 *
 * Combined score = avgScore * 0.7 + termCoverage * 0.3
 *
 * @module services/rag-quality-gate
 */

import { logger } from '../utils/logger';

// ===========================================
// Types
// ===========================================

export enum QualityTier {
  CONFIDENT = 'CONFIDENT',
  AMBIGUOUS = 'AMBIGUOUS',
  FAILED = 'FAILED',
}

export interface QualityEvaluation {
  tier: QualityTier;
  avgScore: number;
  termCoverage: number;
  combinedScore: number;
}

export interface RetrievalDocument {
  id: string;
  title: string;
  summary: string;
  score: number;
  content?: string;
}

// ===========================================
// Thresholds
// ===========================================

const CONFIDENT_THRESHOLD = 0.75;
const AMBIGUOUS_THRESHOLD = 0.45;

// ===========================================
// Core Evaluation
// ===========================================

/**
 * Evaluate the quality of retrieved documents for a given query.
 *
 * @param query - The original search query
 * @param documents - Retrieved documents with scores
 * @returns Quality evaluation with tier, scores, and term coverage
 */
export function evaluateRetrieval(
  query: string,
  documents: RetrievalDocument[]
): QualityEvaluation {
  if (documents.length === 0) {
    return {
      tier: QualityTier.FAILED,
      avgScore: 0,
      termCoverage: 0,
      combinedScore: 0,
    };
  }

  // Calculate average score
  const avgScore = documents.reduce((sum, d) => sum + d.score, 0) / documents.length;

  // Calculate term coverage: what fraction of query terms appear in results
  const queryTerms = query
    .toLowerCase()
    .split(/\s+/)
    .filter(t => t.length > 0)
    .map(t => t.replace(/[^a-z0-9äöüß]/gi, ''))
    .filter(t => t.length > 0);

  let termCoverage = 0;
  if (queryTerms.length > 0) {
    const allText = documents
      .map(d => `${d.title} ${d.summary} ${d.content || ''}`)
      .join(' ')
      .toLowerCase();

    const coveredTerms = queryTerms.filter(term => allText.includes(term));
    termCoverage = coveredTerms.length / queryTerms.length;
  }

  // Combined score: 70% retrieval score, 30% term coverage
  const combinedScore = avgScore * 0.7 + termCoverage * 0.3;

  // Determine tier
  let tier: QualityTier;
  if (combinedScore >= CONFIDENT_THRESHOLD) {
    tier = QualityTier.CONFIDENT;
  } else if (combinedScore >= AMBIGUOUS_THRESHOLD) {
    tier = QualityTier.AMBIGUOUS;
  } else {
    tier = QualityTier.FAILED;
  }

  logger.debug('CRAG quality evaluation', {
    query: query.substring(0, 50),
    docCount: documents.length,
    avgScore: avgScore.toFixed(3),
    termCoverage: termCoverage.toFixed(3),
    combinedScore: combinedScore.toFixed(3),
    tier,
  });

  return {
    tier,
    avgScore,
    termCoverage,
    combinedScore,
  };
}
