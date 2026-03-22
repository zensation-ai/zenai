/**
 * Heuristic Re-Ranking Service
 *
 * Replaces the previous LLM-as-judge approach (which called Claude API
 * per batch of 5 documents) with a fast, multi-signal heuristic scorer.
 *
 * Scoring signals (weighted):
 * 1. TERM OVERLAP (0.35): BM25-style term frequency × inverse document frequency
 * 2. TITLE MATCH (0.25): Query terms in title, exact phrase match
 * 3. SUMMARY MATCH (0.20): Query terms in summary text
 * 4. BIGRAM OVERLAP (0.10): Consecutive term pairs shared between query and doc
 * 5. ORIGINAL SCORE (0.10): Preserve upstream embedding similarity signal
 *
 * Performance: ~0.1ms per document vs ~500ms+ per Claude API call
 * Cost: $0 vs ~$0.003 per batch of 5 documents
 *
 * @module services/cross-encoder-rerank
 */

import { logger } from '../utils/logger';
import { RetrievalResult } from './agentic-rag';

// ===========================================
// Types & Interfaces
// ===========================================

/**
 * Result after re-ranking
 */
export interface RerankedResult extends RetrievalResult {
  /** Original score before re-ranking */
  originalScore: number;
  /** Relevance score from re-ranker (0-1) */
  relevanceScore: number;
  /** Explanation for the score */
  relevanceReason?: string;
  /** Whether this result was boosted or demoted */
  movement: 'boosted' | 'demoted' | 'unchanged';
}

/**
 * Configuration for re-ranking
 */
export interface RerankConfig {
  /** Maximum results to re-rank */
  maxResults: number;
  /** Minimum relevance score to keep */
  minRelevance: number;
  /** Include reasoning in results */
  includeReasoning: boolean;
  /** Batch size (kept for interface compat, not used internally) */
  batchSize: number;
}

// ===========================================
// German + English Stop Words
// ===========================================

const STOP_WORDS = new Set([
  // German
  'der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'einer', 'einem', 'einen',
  'und', 'oder', 'aber', 'ist', 'sind', 'war', 'hat', 'haben', 'wird', 'wurde',
  'nicht', 'mit', 'von', 'auf', 'für', 'aus', 'bei', 'nach', 'über', 'vor',
  'wie', 'was', 'wer', 'als', 'auch', 'nur', 'noch', 'kann', 'mehr', 'sehr',
  'ich', 'du', 'er', 'sie', 'wir', 'ihr', 'mein', 'dein', 'sein', 'sich',
  'hier', 'dort', 'dann', 'wenn', 'weil', 'dass', 'damit', 'doch', 'schon',
  // English
  'the', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'was', 'has', 'have',
  'not', 'with', 'from', 'for', 'at', 'by', 'to', 'in', 'on', 'of',
  'how', 'what', 'who', 'as', 'also', 'only', 'can', 'more', 'very',
  'i', 'you', 'he', 'she', 'we', 'my', 'your', 'his', 'her', 'this', 'that',
  'it', 'do', 'does', 'did', 'be', 'been', 'will', 'would', 'should', 'could',
]);

// ===========================================
// Configuration
// ===========================================

const DEFAULT_CONFIG: RerankConfig = {
  maxResults: 20,
  minRelevance: 0.3,
  includeReasoning: true,
  batchSize: 5,
};

// Scoring weights
const WEIGHTS = {
  termOverlap: 0.35,
  titleMatch: 0.25,
  summaryMatch: 0.20,
  bigramOverlap: 0.10,
  originalScore: 0.10,
} as const;

// ===========================================
// Text Processing Helpers
// ===========================================

/**
 * Tokenize text into meaningful terms (remove stop words, short tokens)
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2 && !STOP_WORDS.has(t));
}

/**
 * Extract bigrams (consecutive term pairs) from tokens
 */
function getBigrams(tokens: string[]): Set<string> {
  const bigrams = new Set<string>();
  for (let i = 0; i < tokens.length - 1; i++) {
    bigrams.add(`${tokens[i]}|${tokens[i + 1]}`);
  }
  return bigrams;
}

/**
 * Calculate BM25-style term frequency score
 * Simplified BM25: tf * (k1 + 1) / (tf + k1 * (1 - b + b * dl/avgdl))
 */
function bm25TermScore(
  queryTerms: string[],
  docTokens: string[],
  avgDocLength: number
): number {
  const k1 = 1.2;
  const b = 0.75;
  const dl = docTokens.length;
  const avgdl = Math.max(avgDocLength, 1);

  // Build term frequency map
  const tf = new Map<string, number>();
  for (const token of docTokens) {
    tf.set(token, (tf.get(token) || 0) + 1);
  }

  let score = 0;
  let matchedTerms = 0;

  for (const term of queryTerms) {
    const termFreq = tf.get(term) || 0;
    if (termFreq > 0) {
      matchedTerms++;
      // BM25 term score (without IDF since we don't have corpus stats)
      const numerator = termFreq * (k1 + 1);
      const denominator = termFreq + k1 * (1 - b + b * dl / avgdl);
      score += numerator / denominator;
    }
  }

  // Normalize: coverage ratio × BM25 signal
  const coverage = queryTerms.length > 0 ? matchedTerms / queryTerms.length : 0;
  const normalizedBM25 = queryTerms.length > 0 ? Math.min(score / queryTerms.length, 1.0) : 0;

  return coverage * 0.6 + normalizedBM25 * 0.4;
}

/**
 * Score title match quality
 */
function scoreTitleMatch(query: string, title: string): number {
  const queryLower = query.toLowerCase();
  const titleLower = title.toLowerCase();
  const queryTerms = tokenize(query);

  let score = 0;

  // Exact phrase match in title (strongest signal)
  if (titleLower.includes(queryLower)) {
    score += 0.5;
  }

  // Term overlap in title
  if (queryTerms.length > 0) {
    const titleTerms = new Set(tokenize(title));
    let matchCount = 0;
    for (const term of queryTerms) {
      if (titleTerms.has(term)) {matchCount++;}
    }
    score += (matchCount / queryTerms.length) * 0.4;
  }

  // Substring match (partial term overlap)
  for (const term of queryTerms) {
    if (titleLower.includes(term) && !tokenize(title).includes(term)) {
      score += 0.02; // Small boost for substring matches
    }
  }

  return Math.min(score, 1.0);
}

/**
 * Score summary match quality
 */
function scoreSummaryMatch(query: string, summary: string | undefined): number {
  if (!summary) {return 0;}

  const queryTerms = tokenize(query);
  if (queryTerms.length === 0) {return 0;}

  const summaryTerms = new Set(tokenize(summary));
  let matchCount = 0;
  for (const term of queryTerms) {
    if (summaryTerms.has(term)) {matchCount++;}
  }

  const coverage = matchCount / queryTerms.length;

  // Bonus for phrase proximity in summary
  const summaryLower = summary.toLowerCase();
  const queryLower = query.toLowerCase();
  let proximityBoost = 0;
  if (summaryLower.includes(queryLower)) {
    proximityBoost = 0.3;
  }

  return Math.min(coverage * 0.7 + proximityBoost, 1.0);
}

/**
 * Score bigram overlap between query and document
 */
function scoreBigramOverlap(queryTokens: string[], docTokens: string[]): number {
  const queryBigrams = getBigrams(queryTokens);
  if (queryBigrams.size === 0) {return 0;}

  const docBigrams = getBigrams(docTokens);
  let matches = 0;
  for (const bigram of queryBigrams) {
    if (docBigrams.has(bigram)) {matches++;}
  }

  return matches / queryBigrams.size;
}

/**
 * Generate a human-readable relevance reason
 */
function generateReason(
  titleScore: number,
  termScore: number,
  summaryScore: number,
  bigramScore: number,
  finalScore: number
): string {
  const signals: string[] = [];

  if (titleScore > 0.5) {signals.push('Titel stimmt stark ueberein');}
  else if (titleScore > 0.2) {signals.push('Titel teilweise relevant');}

  if (termScore > 0.6) {signals.push('hohe Begriffsuebereinstimmung');}
  else if (termScore > 0.3) {signals.push('einige Begriffe gefunden');}

  if (summaryScore > 0.5) {signals.push('Zusammenfassung relevant');}

  if (bigramScore > 0.3) {signals.push('Phrasen-Uebereinstimmung');}

  if (signals.length === 0) {
    if (finalScore >= 0.3) {signals.push('Allgemeine thematische Naehe');}
    else {signals.push('Geringe Relevanz');}
  }

  return signals.join(', ');
}

// ===========================================
// Heuristic Re-Ranking Service
// ===========================================

class CrossEncoderReranker {
  private config: RerankConfig;

  constructor(config: Partial<RerankConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Re-rank results using multi-signal heuristic scoring
   */
  async rerank(
    query: string,
    results: RetrievalResult[],
    config?: Partial<RerankConfig>
  ): Promise<RerankedResult[]> {
    const cfg = { ...this.config, ...config };

    if (results.length === 0) {
      return [];
    }

    const toRerank = results.slice(0, cfg.maxResults);

    logger.info('Heuristic re-ranking', {
      query: query.substring(0, 50),
      resultCount: toRerank.length,
    });

    const startTime = Date.now();

    // Tokenize query once
    const queryTerms = tokenize(query);

    // Calculate average document length for BM25 normalization
    const allDocTokens = toRerank.map(r =>
      tokenize([r.title, r.summary || '', r.content || ''].join(' '))
    );
    const avgDocLength = allDocTokens.reduce((sum, t) => sum + t.length, 0) / Math.max(toRerank.length, 1);

    // Score each document
    let reranked: RerankedResult[] = toRerank.map((result, i) => {
      const docTokens = allDocTokens[i];

      const titleScore = scoreTitleMatch(query, result.title);
      const termScore = bm25TermScore(queryTerms, docTokens, avgDocLength);
      const summaryScore = scoreSummaryMatch(query, result.summary);
      const bigramScore = scoreBigramOverlap(queryTerms, docTokens);
      const originalScore = result.score;

      // Weighted combination
      const relevanceScore = Math.min(
        titleScore * WEIGHTS.titleMatch +
        termScore * WEIGHTS.termOverlap +
        summaryScore * WEIGHTS.summaryMatch +
        bigramScore * WEIGHTS.bigramOverlap +
        originalScore * WEIGHTS.originalScore,
        1.0
      );

      return {
        ...result,
        originalScore,
        relevanceScore,
        relevanceReason: cfg.includeReasoning
          ? generateReason(titleScore, termScore, summaryScore, bigramScore, relevanceScore)
          : undefined,
        score: relevanceScore,
        movement: 'unchanged' as const,
      };
    });

    // Filter by minimum relevance
    reranked = reranked.filter(r => r.relevanceScore >= cfg.minRelevance);

    // Sort by relevance score
    reranked.sort((a, b) => b.relevanceScore - a.relevanceScore);

    // Calculate movement
    reranked = this.calculateMovement(toRerank, reranked);

    logger.info('Heuristic re-ranking complete', {
      inputCount: toRerank.length,
      outputCount: reranked.length,
      timeMs: Date.now() - startTime,
    });

    return reranked;
  }

  /**
   * Calculate how much each result moved in ranking
   */
  private calculateMovement(
    original: RetrievalResult[],
    reranked: RerankedResult[]
  ): RerankedResult[] {
    const originalPositions = new Map(original.map((r, i) => [r.id, i]));
    const newPositions = new Map(reranked.map((r, i) => [r.id, i]));

    return reranked.map(result => {
      const oldPos = originalPositions.get(result.id) ?? -1;
      const newPos = newPositions.get(result.id) ?? -1;

      let movement: 'boosted' | 'demoted' | 'unchanged' = 'unchanged';
      if (oldPos >= 0 && newPos >= 0) {
        if (newPos < oldPos - 1) { movement = 'boosted'; }
        else if (newPos > oldPos + 1) { movement = 'demoted'; }
      }

      return { ...result, movement };
    });
  }

  /**
   * Update configuration
   */
  configure(config: Partial<RerankConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

// ===========================================
// Integration with Agentic RAG
// ===========================================

/**
 * Enhanced re-ranking function for Agentic RAG
 * Uses fast multi-signal heuristic scoring instead of LLM calls
 */
export async function hybridRerank(
  query: string,
  results: RetrievalResult[],
  options: {
    /** Number of top results to score in detail */
    crossEncodeTop?: number;
    /** Minimum relevance threshold */
    minRelevance?: number;
  } = {}
): Promise<RerankedResult[]> {
  const { crossEncodeTop = 10, minRelevance = 0.3 } = options;

  if (results.length === 0) { return []; }

  // Step 1: Quick heuristic pre-filter (title + basic term match)
  const preFiltered = quickHeuristicFilter(query, results);

  // Step 2: Full multi-signal scoring on top results
  const toScore = preFiltered.slice(0, crossEncodeTop);
  const rest = preFiltered.slice(crossEncodeTop);

  const reranker = new CrossEncoderReranker({ minRelevance });
  const reranked = await reranker.rerank(query, toScore);

  // Step 3: Combine with rest (scaled down)
  const combined: RerankedResult[] = [
    ...reranked,
    ...rest.map(r => ({
      ...r,
      originalScore: r.score,
      relevanceScore: r.score * 0.7,
      movement: 'unchanged' as const,
    })),
  ];

  return combined.filter(r => r.relevanceScore >= minRelevance);
}

/**
 * Quick heuristic filter to sort by basic relevance signals
 */
function quickHeuristicFilter(
  query: string,
  results: RetrievalResult[]
): RetrievalResult[] {
  const queryTerms = new Set(tokenize(query));

  return results
    .map(result => {
      let boost = 0;

      const titleLower = result.title.toLowerCase();
      const summaryLower = (result.summary || '').toLowerCase();

      // Title term matches
      for (const term of queryTerms) {
        if (titleLower.includes(term)) { boost += 0.08; }
        if (summaryLower.includes(term)) { boost += 0.03; }
      }

      // Exact phrase boost (title)
      if (titleLower.includes(query.toLowerCase())) { boost += 0.2; }

      // Exact phrase boost (summary)
      if (summaryLower.includes(query.toLowerCase())) { boost += 0.1; }

      return {
        ...result,
        score: Math.min(result.score + boost, 1.0),
      };
    })
    .sort((a, b) => b.score - a.score);
}

