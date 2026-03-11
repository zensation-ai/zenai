/**
 * Phase 49: Adaptive Retrieval Service
 *
 * Automatically selects the best retrieval strategy (dense/sparse/hybrid)
 * based on query characteristics. Uses heuristics to avoid LLM calls
 * for strategy selection.
 *
 * Strategies:
 * - Dense: pgvector embedding similarity (conceptual queries)
 * - Sparse: PostgreSQL full-text search with tsvector (keyword queries)
 * - Hybrid: Both + Reciprocal Rank Fusion (mixed queries)
 *
 * @module services/rag/adaptive-retrieval
 */

import { AIContext, queryContext } from '../../utils/database-context';
import { logger } from '../../utils/logger';
import { generateEmbedding } from '../ai';
import { RetrievalResult } from '../agentic-rag';

// ===========================================
// Types & Interfaces
// ===========================================

export type AdaptiveStrategy = 'dense' | 'sparse' | 'hybrid';

export interface StrategySelection {
  strategy: AdaptiveStrategy;
  confidence: number;
  reason: string;
}

export interface AdaptiveRetrievalOptions {
  /** Maximum results to return */
  maxResults?: number;
  /** Force a specific strategy (skip auto-detection) */
  forceStrategy?: AdaptiveStrategy;
  /** Minimum relevance score threshold */
  minScore?: number;
  /** RRF constant k (default 60) */
  rrfK?: number;
}

export interface AdaptiveRetrievalResult {
  results: RetrievalResult[];
  strategyUsed: StrategySelection;
  timing: {
    total: number;
    strategy_selection: number;
    retrieval: number;
  };
}

// ===========================================
// Constants
// ===========================================

const DEFAULT_MAX_RESULTS = 10;
const DEFAULT_MIN_SCORE = 0.1;
const DEFAULT_RRF_K = 60;

/** Words that indicate a conceptual/question-style query */
const QUESTION_INDICATORS = /^(was|wie|warum|wann|wo|wer|welche|can|how|what|why|when|where|who|which|explain|describe|tell me|show me)/i;

/** Pattern for quoted strings or hashtags indicating keyword search */
const KEYWORD_INDICATORS = /["']|#\w+|\b[A-Z]{2,}\b/;

/** Named entity patterns (proper nouns, abbreviations, file extensions) */
const ENTITY_PATTERNS = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b|\b\w+\.\w{2,4}\b|\b[A-Z]{2,}\b/;

// ===========================================
// Strategy Selection
// ===========================================

/**
 * Analyze a query and select the optimal retrieval strategy.
 *
 * Uses simple heuristics:
 * - Short queries with specific terms/names -> sparse
 * - Questions and abstract concepts -> dense
 * - Mixed or ambiguous -> hybrid
 */
export function selectStrategy(query: string): StrategySelection {
  const trimmed = query.trim();
  const words = trimmed.split(/\s+/).filter(w => w.length > 0);
  const wordCount = words.length;
  const hasQuestionMark = trimmed.includes('?');
  const hasQuestionWord = QUESTION_INDICATORS.test(trimmed);
  const hasKeywordIndicators = KEYWORD_INDICATORS.test(trimmed);
  const hasEntities = ENTITY_PATTERNS.test(trimmed);

  // Unique word ratio (low diversity = keyword-heavy)
  const uniqueWords = new Set(words.map(w => w.toLowerCase()));
  const diversityRatio = wordCount > 0 ? uniqueWords.size / wordCount : 0;

  // Score each strategy
  let sparseScore = 0;
  let denseScore = 0;

  // Short, specific queries favor sparse
  if (wordCount <= 3) sparseScore += 2;
  if (wordCount <= 2) sparseScore += 1;

  // Keyword indicators favor sparse
  if (hasKeywordIndicators) sparseScore += 3;
  if (hasEntities) sparseScore += 1;

  // Low word diversity suggests keyword search
  if (diversityRatio < 0.7 && wordCount > 2) sparseScore += 1;

  // Questions favor dense
  if (hasQuestionMark) denseScore += 2;
  if (hasQuestionWord) denseScore += 2;

  // Longer, more complex queries favor dense
  if (wordCount >= 6) denseScore += 1;
  if (wordCount >= 10) denseScore += 1;

  // High word diversity suggests conceptual query
  if (diversityRatio > 0.85 && wordCount > 3) denseScore += 1;

  // Determine strategy
  const diff = Math.abs(denseScore - sparseScore);

  if (diff <= 1) {
    // Scores are close -> hybrid
    return {
      strategy: 'hybrid',
      confidence: 0.6 + diff * 0.05,
      reason: `Mixed signals (dense=${denseScore}, sparse=${sparseScore}): combining both strategies`,
    };
  }

  if (denseScore > sparseScore) {
    return {
      strategy: 'dense',
      confidence: Math.min(0.5 + denseScore * 0.1, 0.95),
      reason: `Conceptual query detected (question=${hasQuestionWord}, length=${wordCount}): using embedding similarity`,
    };
  }

  return {
    strategy: 'sparse',
    confidence: Math.min(0.5 + sparseScore * 0.1, 0.95),
    reason: `Keyword-heavy query detected (keywords=${hasKeywordIndicators}, entities=${hasEntities}): using full-text search`,
  };
}

// ===========================================
// Retrieval Methods
// ===========================================

/**
 * Dense retrieval using pgvector embedding similarity.
 */
export async function denseRetrieve(
  query: string,
  context: AIContext,
  maxResults: number = DEFAULT_MAX_RESULTS
): Promise<RetrievalResult[]> {
  try {
    const queryEmbedding = await generateEmbedding(query);
    if (queryEmbedding.length === 0) return [];

    const result = await queryContext(
      context,
      `SELECT id, title, summary, raw_transcript,
              1 - (embedding <=> $2) as similarity
       FROM ideas
       WHERE context = $1
         AND is_archived = false
         AND embedding IS NOT NULL
       ORDER BY embedding <=> $2
       LIMIT $3`,
      [context, `[${queryEmbedding.join(',')}]`, maxResults]
    );

    return result.rows.map((r: { id: string; title: string; summary?: string; raw_transcript?: string; similarity: string }) => ({
      id: r.id,
      title: r.title,
      summary: r.summary || '',
      content: r.raw_transcript,
      score: parseFloat(r.similarity) || 0.5,
      strategy: 'semantic' as const,
    }));
  } catch (error) {
    logger.warn('Dense retrieval failed', { error });
    return [];
  }
}

/**
 * Sparse retrieval using PostgreSQL full-text search (tsvector/tsquery).
 */
export async function sparseRetrieve(
  query: string,
  context: AIContext,
  maxResults: number = DEFAULT_MAX_RESULTS
): Promise<RetrievalResult[]> {
  try {
    // Clean query for full-text search
    const searchTerms = query
      .replace(/[^\w\s\u00e4\u00f6\u00fc\u00df]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 2)
      .join(' & ');

    if (!searchTerms) return [];

    const result = await queryContext(
      context,
      `SELECT id, title, summary, raw_transcript,
              ts_rank(
                to_tsvector('german', COALESCE(title, '') || ' ' || COALESCE(summary, '') || ' ' || COALESCE(raw_transcript, '')),
                plainto_tsquery('german', $2)
              ) as rank
       FROM ideas
       WHERE context = $1
         AND is_archived = false
         AND to_tsvector('german', COALESCE(title, '') || ' ' || COALESCE(summary, '') || ' ' || COALESCE(raw_transcript, ''))
             @@ plainto_tsquery('german', $2)
       ORDER BY rank DESC
       LIMIT $3`,
      [context, searchTerms, maxResults]
    );

    return result.rows.map((r: { id: string; title: string; summary?: string; raw_transcript?: string; rank: string }) => ({
      id: r.id,
      title: r.title,
      summary: r.summary || '',
      content: r.raw_transcript,
      score: Math.min(parseFloat(r.rank) * 10, 1) || 0.3,
      strategy: 'keyword' as const,
    }));
  } catch (error) {
    logger.warn('Sparse retrieval failed', { error });
    return [];
  }
}

/**
 * Reciprocal Rank Fusion (RRF) to merge results from multiple lists.
 * RRF score = sum(1 / (k + rank_i)) for each result across all lists.
 */
export function rrfFusion(
  denseResults: RetrievalResult[],
  sparseResults: RetrievalResult[],
  k: number = DEFAULT_RRF_K
): RetrievalResult[] {
  const scoreMap = new Map<string, { result: RetrievalResult; rrfScore: number }>();

  // Score dense results
  denseResults.forEach((result, rank) => {
    const rrfScore = 1 / (k + rank + 1);
    scoreMap.set(result.id, { result, rrfScore });
  });

  // Add sparse results
  sparseResults.forEach((result, rank) => {
    const rrfScore = 1 / (k + rank + 1);
    const existing = scoreMap.get(result.id);

    if (existing) {
      // Merge scores - result appeared in both lists
      existing.rrfScore += rrfScore;
      // Keep the higher individual score
      if (result.score > existing.result.score) {
        existing.result = { ...result, strategy: 'hybrid' as const };
      } else {
        existing.result = { ...existing.result, strategy: 'hybrid' as const };
      }
    } else {
      scoreMap.set(result.id, { result, rrfScore });
    }
  });

  // Sort by RRF score and normalize
  const sorted = Array.from(scoreMap.values())
    .sort((a, b) => b.rrfScore - a.rrfScore);

  if (sorted.length === 0) return [];

  const maxRRF = sorted[0].rrfScore;

  return sorted.map(({ result, rrfScore }) => ({
    ...result,
    score: maxRRF > 0 ? rrfScore / maxRRF : 0,
    strategy: 'hybrid' as const,
  }));
}

/**
 * Hybrid retrieval combining dense + sparse with RRF fusion.
 */
export async function hybridRetrieve(
  query: string,
  context: AIContext,
  maxResults: number = DEFAULT_MAX_RESULTS,
  rrfK: number = DEFAULT_RRF_K
): Promise<RetrievalResult[]> {
  // Run both in parallel
  const [denseResults, sparseResults] = await Promise.all([
    denseRetrieve(query, context, maxResults),
    sparseRetrieve(query, context, maxResults),
  ]);

  const fused = rrfFusion(denseResults, sparseResults, rrfK);
  return fused.slice(0, maxResults);
}

// ===========================================
// Main Retrieve Function
// ===========================================

/**
 * Execute adaptive retrieval with automatic strategy selection.
 */
export async function retrieve(
  query: string,
  context: AIContext,
  options: AdaptiveRetrievalOptions = {}
): Promise<AdaptiveRetrievalResult> {
  const startTime = Date.now();
  const maxResults = options.maxResults ?? DEFAULT_MAX_RESULTS;
  const minScore = options.minScore ?? DEFAULT_MIN_SCORE;
  const rrfK = options.rrfK ?? DEFAULT_RRF_K;

  // 1. Select strategy
  const strategyStart = Date.now();
  const strategySelection = options.forceStrategy
    ? { strategy: options.forceStrategy, confidence: 1.0, reason: `Forced strategy: ${options.forceStrategy}` }
    : selectStrategy(query);
  const strategyTime = Date.now() - strategyStart;

  logger.info('Adaptive retrieval starting', {
    query: query.substring(0, 100),
    context,
    strategy: strategySelection.strategy,
    confidence: strategySelection.confidence,
  });

  // 2. Execute retrieval
  const retrievalStart = Date.now();
  let results: RetrievalResult[];

  try {
    switch (strategySelection.strategy) {
      case 'dense':
        results = await denseRetrieve(query, context, maxResults);
        break;
      case 'sparse':
        results = await sparseRetrieve(query, context, maxResults);
        break;
      case 'hybrid':
        results = await hybridRetrieve(query, context, maxResults, rrfK);
        break;
      default:
        results = await denseRetrieve(query, context, maxResults);
    }
  } catch (error) {
    logger.error('Adaptive retrieval failed, falling back to dense', error instanceof Error ? error : new Error(String(error)));
    // Fallback to dense on any error
    try {
      results = await denseRetrieve(query, context, maxResults);
      strategySelection.strategy = 'dense';
      strategySelection.reason = 'Fallback to dense after error';
      strategySelection.confidence = 0.3;
    } catch {
      results = [];
    }
  }

  const retrievalTime = Date.now() - retrievalStart;

  // 3. Filter by minimum score
  const filtered = results.filter(r => r.score >= minScore);

  logger.info('Adaptive retrieval complete', {
    strategy: strategySelection.strategy,
    totalResults: results.length,
    filteredResults: filtered.length,
    timing: { strategyTime, retrievalTime },
  });

  return {
    results: filtered,
    strategyUsed: strategySelection,
    timing: {
      total: Date.now() - startTime,
      strategy_selection: strategyTime,
      retrieval: retrievalTime,
    },
  };
}
