/**
 * Phase 70: A-RAG Strategy Evaluator
 *
 * Heuristic-based self-evaluation of retrieval results.
 * NOT Claude-based for speed -- uses statistical analysis of result
 * distributions to determine confidence, completeness, and whether
 * to retry with an expanded strategy.
 *
 * @module services/arag/strategy-evaluator
 */

import type { RetrievalResultItem, EvaluationOutcome } from './retrieval-interfaces';

// ===========================================
// Configuration
// ===========================================

/** Confidence threshold above which no retry is needed */
const HIGH_CONFIDENCE_THRESHOLD = 0.9;

/** Confidence threshold below which retry is recommended */
const LOW_CONFIDENCE_THRESHOLD = 0.6;

/** Minimum number of results for good completeness */
const MIN_RESULT_COUNT = 3;

/** Minimum score for a result to count as "relevant" */
const RELEVANCE_THRESHOLD = 0.3;

// ===========================================
// Evaluator
// ===========================================

/**
 * Evaluate retrieval results using heuristics.
 *
 * Scoring factors:
 * 1. Result count (more results = more complete)
 * 2. Score distribution (high average = more confident)
 * 3. Top score (strong top result = good signal)
 * 4. Score variance (low variance = consistent quality)
 * 5. Content diversity (unique sources = broader coverage)
 */
export function evaluateResults(
  query: string,
  results: RetrievalResultItem[]
): EvaluationOutcome {
  // No results at all
  if (results.length === 0) {
    return {
      confidence: 0,
      completeness: 0,
      shouldRetry: true,
      reason: 'No results retrieved',
    };
  }

  const relevantResults = results.filter(r => r.score >= RELEVANCE_THRESHOLD);

  // Factor 1: Result count score
  const countScore = Math.min(relevantResults.length / MIN_RESULT_COUNT, 1.0);

  // Factor 2: Average score of relevant results
  const avgScore = relevantResults.length > 0
    ? relevantResults.reduce((sum, r) => sum + r.score, 0) / relevantResults.length
    : 0;

  // Factor 3: Top result score
  const topScore = results[0].score;

  // Factor 4: Score variance (lower = more consistent = better)
  const variance = computeVariance(relevantResults.map(r => r.score));
  const consistencyScore = Math.max(0, 1 - variance * 2); // Penalize high variance

  // Factor 5: Source diversity
  const uniqueSources = new Set(relevantResults.map(r => r.source));
  const diversityScore = Math.min(uniqueSources.size / 2, 1.0);

  // Factor 6: Content coverage (check if results have substantial content)
  const contentLengths = relevantResults.map(r => r.content.length);
  const avgContentLength = contentLengths.length > 0
    ? contentLengths.reduce((a, b) => a + b, 0) / contentLengths.length
    : 0;
  const contentScore = Math.min(avgContentLength / 100, 1.0);

  // Factor 7: Query term coverage in results
  const queryTermCoverage = computeQueryTermCoverage(query, relevantResults);

  // Weighted confidence calculation
  const confidence = clamp(
    topScore * 0.25 +
    avgScore * 0.20 +
    countScore * 0.15 +
    consistencyScore * 0.10 +
    diversityScore * 0.10 +
    contentScore * 0.10 +
    queryTermCoverage * 0.10,
    0, 1
  );

  // Completeness is based on count and diversity
  const completeness = clamp(
    countScore * 0.5 +
    diversityScore * 0.3 +
    queryTermCoverage * 0.2,
    0, 1
  );

  // Determine if retry is needed
  const shouldRetry = confidence < LOW_CONFIDENCE_THRESHOLD;

  // Build reason
  let reason: string;
  if (confidence >= HIGH_CONFIDENCE_THRESHOLD) {
    reason = 'High confidence results with good coverage';
  } else if (confidence >= LOW_CONFIDENCE_THRESHOLD) {
    reason = `Acceptable results (confidence: ${(confidence * 100).toFixed(0)}%)`;
  } else {
    const issues: string[] = [];
    if (relevantResults.length < MIN_RESULT_COUNT) issues.push('few relevant results');
    if (avgScore < 0.4) issues.push('low average relevance');
    if (topScore < 0.5) issues.push('weak top result');
    if (queryTermCoverage < 0.3) issues.push('poor query term coverage');
    reason = `Low confidence: ${issues.join(', ')}`;
  }

  return { confidence, completeness, shouldRetry, reason };
}

// ===========================================
// Helpers
// ===========================================

/**
 * Compute variance of a number array.
 */
function computeVariance(values: number[]): number {
  if (values.length <= 1) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
}

/**
 * Compute what fraction of query terms appear in results.
 */
function computeQueryTermCoverage(query: string, results: RetrievalResultItem[]): number {
  const queryTerms = query
    .toLowerCase()
    .split(/\s+/)
    .filter(t => t.length > 2);

  if (queryTerms.length === 0) return 1.0;

  const allContent = results
    .map(r => `${r.title || ''} ${r.content}`)
    .join(' ')
    .toLowerCase();

  const coveredTerms = queryTerms.filter(term => allContent.includes(term));
  return coveredTerms.length / queryTerms.length;
}

/**
 * Clamp a value between min and max.
 */
function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
