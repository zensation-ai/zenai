/**
 * Enhanced RAG Service
 *
 * State-of-the-art Retrieval-Augmented Generation combining:
 * - Agentic RAG (dynamic strategy selection)
 * - Cross-Encoder Re-Ranking (semantic relevance scoring)
 * - HyDE (Hypothetical Document Embeddings)
 *
 * This is the recommended RAG service for production use.
 *
 * @module services/enhanced-rag
 */

import { createHash } from 'crypto';
import { logger } from '../utils/logger';
import { AIContext } from '../utils/database-context';
import { agenticRAG, RetrievalResult, RAGAgentConfig } from './agentic-rag';
import { hybridRerank, RerankedResult } from './cross-encoder-rerank';
import { hydeService, shouldUseHyDE, HyDERetrievalResult } from './hyde-retrieval';
import { recordRAGQueryAnalytics } from './rag-feedback';
import { decomposeQuery } from './rag-query-decomposition';
// Phase 58: GraphRAG Hybrid Retrieval
import { hybridRetriever, HybridRetrievalResult } from './knowledge-graph/hybrid-retriever';
// Phase 67.1: RAG Result Caching
import { ragResultCache } from './rag-cache';
// Phase 70: A-RAG Autonomous Retrieval Strategy
import { planRetrieval } from './arag/strategy-agent';
import { executeRetrievalPlan } from './arag/iterative-retriever';
import type { RetrievalInterface, ARAGExecutionMetadata } from './arag/retrieval-interfaces';

// ===========================================
// Types & Interfaces
// ===========================================

/**
 * Enhanced RAG configuration
 */
export interface EnhancedRAGConfig {
  /** Use HyDE for conceptual queries */
  enableHyDE: boolean;
  /** Auto-detect when to use HyDE */
  autoDetectHyDE: boolean;
  /** Use cross-encoder re-ranking */
  enableCrossEncoder: boolean;
  /** Number of top results to cross-encode */
  crossEncodeTop: number;
  /** Minimum final relevance score */
  minRelevance: number;
  /** Maximum results to return */
  maxResults: number;
  /** Agentic RAG configuration */
  agenticConfig?: Partial<RAGAgentConfig>;
  /** Phase 58: Enable GraphRAG hybrid retrieval */
  enableGraphRAG: boolean;
  /** Phase 67.1: Skip cache lookup and force fresh retrieval */
  skipCache?: boolean;
  /** Phase 70: Enable A-RAG autonomous retrieval strategy (default true) */
  enableARAG: boolean;
}

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
  /** Phase 99: Retrieval confidence score (0.0-1.0) */
  retrievalConfidence?: number;
  /** Phase 99: Number of unique source types */
  sourceCount?: number;
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

// ===========================================
// Configuration
// ===========================================

/**
 * Default RAG configuration.
 *
 * Tuning rationale:
 * - `enableHyDE: true` — HyDE improves recall for conceptual/vague queries by
 *   generating a hypothetical answer first, then using its embedding for search.
 *   Disable for latency-critical paths (adds ~1 extra LLM call).
 * - `autoDetectHyDE: true` — Only triggers HyDE when the query looks conceptual
 *   (questions, abstract terms). Factual/keyword queries skip it for speed.
 * - `crossEncodeTop: 10` — Re-rank the top 10 candidates. Higher values improve
 *   recall but increase latency linearly. 10 is a good balance for <500ms total.
 * - `minRelevance: 0.3` — Permissive threshold: includes borderline results so the
 *   LLM can decide relevance. Raise to 0.5+ if responses include too much noise.
 * - `maxResults: 10` — Feed at most 10 context chunks to the LLM. Keeps prompt
 *   size manageable (~4k tokens of context). Increase for long-form synthesis.
 *
 * Scoring weights (in mergeAllResults):
 * - HYDE_WEIGHT = 0.4 — Conceptual/semantic similarity from hypothetical doc.
 * - AGENTIC_WEIGHT = 0.6 — Direct keyword + vector search (more precise).
 *   The 60/40 split favors precision over recall. Adjust toward 50/50 if users
 *   report missing relevant results on conceptual queries.
 */
const DEFAULT_CONFIG: EnhancedRAGConfig = {
  enableHyDE: true,
  autoDetectHyDE: true,
  enableCrossEncoder: true,
  crossEncodeTop: 10,
  minRelevance: 0.3,
  maxResults: 10,
  enableGraphRAG: true,
  enableARAG: true,
};

// ===========================================
// Contextual Chunk Enrichment (Anthropic technique)
// ===========================================

/**
 * Enrich a chunk with document-level context before embedding/re-ranking.
 *
 * Prepends 50-100 tokens of context (title, topic, context label) so that
 * ambiguous chunks like "Revenue grew 3%" become self-describing:
 * "[From: "Q3 Earnings Analysis" | Topic: Finance | Context: work] Revenue grew 3%"
 *
 * This is a lightweight, zero-API-call enrichment that improves retrieval
 * accuracy by 35-67% according to Anthropic's contextual retrieval research.
 */
export function enrichChunkWithContext(chunk: { content: string; title?: string; topic?: string; context?: string }): string {
  const parts: string[] = [];
  if (chunk.title) parts.push(`From: "${chunk.title}"`);
  if (chunk.topic) parts.push(`Topic: ${chunk.topic}`);
  if (chunk.context) parts.push(`Context: ${chunk.context}`);

  const prefix = parts.length > 0 ? `[${parts.join(' | ')}] ` : '';
  return prefix + chunk.content;
}

/**
 * Enrich a search query with available context information.
 * This helps the embedding model match the enriched chunks more accurately
 * by ensuring the query vector lives in the same semantic space.
 */
export function enrichQueryWithContext(query: string, context?: AIContext, topic?: string): string {
  const parts: string[] = [];
  if (topic) parts.push(`Topic: ${topic}`);
  if (context) parts.push(`Context: ${context}`);

  if (parts.length === 0) return query;
  return `[${parts.join(' | ')}] ${query}`;
}

// ===========================================
// Enhanced RAG Service
// ===========================================

// ===========================================
// Heuristic Fallback Re-ranker
// ===========================================

/**
 * Heuristic re-ranker used when the cross-encoder fails.
 * Scores by keyword overlap, recency (shorter content = more focused), and source diversity.
 */
function heuristicRerank(query: string, results: EnhancedResult[]): EnhancedResult[] {
  // Keep all terms (min length 1) — short terms like "AI", "ML", "UI" are valid search terms
  const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 0);

  return results.map(r => {
    const text = `${r.title} ${r.summary}`.toLowerCase();

    // Keyword overlap: fraction of query terms found in result text
    const matchingTerms = queryTerms.filter(term => text.includes(term));
    const keywordScore = queryTerms.length > 0 ? matchingTerms.length / queryTerms.length : 0;

    // Length bonus: prefer concise, focused results (normalized 0-1)
    const lengthScore = Math.max(0, 1 - (text.length / 2000));

    // Source diversity bonus: results from multiple retrieval sources are more reliable
    const diversityScore = Math.min(r.sources.length / 3, 1);

    // Combine: 50% keyword overlap, 30% original score, 10% length, 10% diversity
    const heuristicScore = keywordScore * 0.5 + r.score * 0.3 + lengthScore * 0.1 + diversityScore * 0.1;

    return {
      ...r,
      score: Math.min(heuristicScore, 1.0),
      relevanceReason: `Heuristic: ${matchingTerms.length}/${queryTerms.length} keyword matches`,
    };
  }).sort((a, b) => b.score - a.score);
}

// ===========================================
// Phase 99: Dynamic Weight Calculation
// ===========================================

/**
 * Calculate dynamic weights for HyDE and Agentic results based on result quality.
 * Higher top score gets more weight. Diversity bonus for multiple source types.
 * Weights are normalized to sum to 1.0.
 */
export function calculateDynamicWeights(
  hydeResults: Array<{ score: number }>,
  agenticResults: Array<{ score: number }>
): { hydeWeight: number; agenticWeight: number } {
  const hydeTopScore = hydeResults.length > 0
    ? Math.max(...hydeResults.map(r => r.score))
    : 0;
  const agenticTopScore = agenticResults.length > 0
    ? Math.max(...agenticResults.map(r => r.score))
    : 0;

  // Base weights proportional to top scores
  let hydeWeight = hydeTopScore;
  let agenticWeight = agenticTopScore;

  // Diversity bonus: if both sources have results, each gets 10% bonus
  if (hydeResults.length > 0 && agenticResults.length > 0) {
    hydeWeight *= 1.1;
    agenticWeight *= 1.1;
  }

  // Normalize to sum to 1.0
  const total = hydeWeight + agenticWeight;
  if (total === 0) {
    return { hydeWeight: 0.4, agenticWeight: 0.6 }; // Fallback to defaults
  }

  return {
    hydeWeight: hydeWeight / total,
    agenticWeight: agenticWeight / total,
  };
}

// ===========================================
// Phase 99: Retrieval Confidence Score
// ===========================================

/**
 * Calculate a 0.0-1.0 confidence score for retrieval results.
 *
 * Components:
 * - 40% topScore: best result score
 * - 30% avgScore: average result score
 * - 15% variance: lower variance = more consistent (better)
 * - 15% sourceTypes: more diverse sources = higher confidence
 */
export function calculateRetrievalConfidence(
  results: Array<{ score: number; sources: string[] }>
): number {
  if (results.length === 0) return 0;

  const scores = results.map(r => r.score);
  const topScore = Math.max(...scores);
  const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;

  // Variance component (lower variance = better)
  const variance = scores.reduce((sum, s) => sum + Math.pow(s - avgScore, 2), 0) / scores.length;
  const varianceComponent = Math.max(0, 1 - variance * 5);

  // Source diversity component
  const allSources = new Set(results.flatMap(r => r.sources));
  const sourceComponent = Math.min(allSources.size / 3, 1);

  const confidence = topScore * 0.4 + avgScore * 0.3 + varianceComponent * 0.15 + sourceComponent * 0.15;
  return Math.max(0, Math.min(1, confidence));
}

class EnhancedRAGService {
  private config: EnhancedRAGConfig;

  constructor(config: Partial<EnhancedRAGConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Main retrieval method - uses all available enhancements
   */
  async retrieve(
    query: string,
    context: AIContext,
    config?: Partial<EnhancedRAGConfig>,
    options?: { conversationContext?: string; isRetry?: boolean }
  ): Promise<EnhancedRAGResult> {
    const cfg = { ...this.config, ...config };
    const startTime = Date.now();

    // Phase 67.1: Check cache before retrieval
    if (!cfg.skipCache) {
      try {
        const cached = await ragResultCache.get(query, context);
        if (cached) {
          cached.timing = { ...cached.timing, total: Date.now() - startTime, cacheHit: true };
          return cached;
        }
      } catch {
        // Cache failure is non-critical, proceed with retrieval
      }
    }

    const methodsUsed: string[] = [];
    const timing: EnhancedRAGResult['timing'] = { total: 0 };

    // Phase 70: A-RAG autonomous retrieval (replaces fixed pipeline when enabled)
    if (cfg.enableARAG) {
      try {
        const aragResult = await this.retrieveWithARAG(query, context, cfg, startTime);
        if (aragResult) {
          // Phase 67.1: Cache the A-RAG result (async, non-blocking)
          if (!cfg.skipCache) {
            ragResultCache.set(query, context, aragResult).catch(() => {/* non-critical */});
          }
          return aragResult;
        }
        // If A-RAG returned null, fall through to fixed pipeline
        logger.info('A-RAG returned no results, falling back to fixed pipeline');
      } catch (error) {
        logger.warn('A-RAG failed, falling back to fixed pipeline', {
          error: error instanceof Error ? error.message : 'Unknown',
        });
        // Fall through to fixed pipeline
      }
    }

    // Phase 47: Query decomposition for complex queries
    const decomposition = decomposeQuery(query);

    logger.info('Enhanced RAG retrieval starting', {
      query: query.substring(0, 50),
      context,
      config: {
        enableHyDE: cfg.enableHyDE,
        enableCrossEncoder: cfg.enableCrossEncoder,
      },
    });

    // Determine if HyDE should be used
    const useHyDE = cfg.enableHyDE && (
      !cfg.autoDetectHyDE || shouldUseHyDE(query)
    );

    // Enrich the search query with context metadata for better embedding alignment
    const enrichedQuery = enrichQueryWithContext(query, context);

    let hydeResults: HyDERetrievalResult[] = [];
    let agenticResults: RetrievalResult[] = [];
    let graphRAGResults: HybridRetrievalResult[] = [];

    // Step 1: Run retrieval methods (parallel when possible)
    const retrievalPromises: Promise<void>[] = [];

    // HyDE retrieval (if enabled) — use enriched query for better hypothetical doc generation
    if (useHyDE) {
      const hydeStart = Date.now();
      retrievalPromises.push(
        hydeService.hybridRetrieve(enrichedQuery, context, { maxResults: cfg.maxResults })
          .then(results => {
            hydeResults = results;
            timing.hyde = Date.now() - hydeStart;
            methodsUsed.push('hyde');
          })
          .catch(error => {
            logger.warn('HyDE retrieval failed', { error });
            hydeResults = [];
          })
      );
    }

    // Agentic RAG retrieval (always) — use enriched query for context-aware search
    const agenticStart = Date.now();
    retrievalPromises.push(
      agenticRAG.retrieve(enrichedQuery, context, cfg.agenticConfig)
        .then(result => {
          agenticResults = result.results;
          timing.agentic = Date.now() - agenticStart;
          methodsUsed.push('agentic');
        })
        .catch(error => {
          logger.warn('Agentic RAG retrieval failed', { error });
          agenticResults = [];
        })
    );

    // Phase 58: GraphRAG hybrid retrieval (if enabled) — use enriched query
    if (cfg.enableGraphRAG) {
      retrievalPromises.push(
        hybridRetriever.retrieve(enrichedQuery, context, { maxResults: cfg.maxResults })
          .then(results => {
            graphRAGResults = results;
            methodsUsed.push('graphrag');
          })
          .catch(error => {
            logger.warn('GraphRAG retrieval failed', { error });
            graphRAGResults = [];
          })
      );
    }

    await Promise.all(retrievalPromises);

    // Step 2: Merge results from all sources
    const merged = this.mergeAllResults(hydeResults, agenticResults, graphRAGResults);

    // Step 3: Cross-encoder re-ranking (if enabled and have results)
    let finalResults: EnhancedResult[];

    if (cfg.enableCrossEncoder && merged.length > 0) {
      const crossStart = Date.now();
      try {
        const reranked = await hybridRerank(
          enrichedQuery,
          merged.map(r => ({
            id: r.id,
            title: r.title,
            summary: r.summary,
            content: r.content,
            score: r.score,
            strategy: 'hybrid' as const,
          })),
          { crossEncodeTop: cfg.crossEncodeTop, minRelevance: cfg.minRelevance }
        );

        finalResults = this.applyReranking(merged, reranked);
        timing.crossEncoder = Date.now() - crossStart;
        methodsUsed.push('cross_encoder');
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'Unknown error';
        logger.warn('Cross-encoder reranking failed, falling back to heuristic', {
          reason,
          resultCount: merged.length,
          error,
        });
        finalResults = heuristicRerank(enrichedQuery, merged);
        timing.crossEncoder = Date.now() - crossStart;
        methodsUsed.push('heuristic_rerank');
      }
    } else {
      finalResults = merged;
    }

    // Step 4: Filter and limit results
    finalResults = finalResults
      .filter(r => r.score >= cfg.minRelevance)
      .slice(0, cfg.maxResults);

    // Phase 99: Calculate retrieval confidence
    const retrievalConfidence = calculateRetrievalConfidence(finalResults);
    const allSources = new Set(finalResults.flatMap(r => r.sources));
    const sourceCount = allSources.size;

    // Phase 99: Self-RAG Critique — retry with reformulated query on low confidence
    if (
      retrievalConfidence < 0.5 &&
      !options?.isRetry &&
      options?.conversationContext
    ) {
      logger.info('Self-RAG critique: low confidence, retrying with conversation context', {
        retrievalConfidence,
        query: query.substring(0, 50),
      });

      const reformulatedQuery = query + ' ' + options.conversationContext.slice(0, 500);
      const retryResult = await this.retrieve(reformulatedQuery, context, config, { isRetry: true });

      // Merge both result sets
      const combinedResults = [...finalResults, ...retryResult.results];
      // Deduplicate by ID + content hash
      const seen = new Set<string>();
      const mergedFinal: EnhancedResult[] = [];
      for (const r of combinedResults.sort((a, b) => b.score - a.score)) {
        const snippet = (r.content ?? r.summary).slice(0, 500);
        const key = r.id + '_' + createHash('sha256').update(snippet).digest('hex').slice(0, 16);
        if (!seen.has(key)) {
          seen.add(key);
          mergedFinal.push(r);
        }
      }

      finalResults = mergedFinal.slice(0, cfg.maxResults);
    }

    // Calculate overall confidence
    const confidence = this.calculateConfidence(finalResults, methodsUsed);

    timing.total = Date.now() - startTime;

    logger.info('Enhanced RAG retrieval complete', {
      resultCount: finalResults.length,
      confidence,
      methodsUsed,
      timing,
    });

    // Phase 47: Record query analytics (async, non-blocking)
    recordRAGQueryAnalytics(context, {
      queryText: query,
      queryType: decomposition?.decompositionType,
      strategiesUsed: methodsUsed,
      strategySelected: methodsUsed[0] || undefined,
      resultCount: finalResults.length,
      topScore: finalResults.length > 0 ? finalResults[0].score : undefined,
      avgScore: finalResults.length > 0
        ? finalResults.reduce((sum, r) => sum + r.score, 0) / finalResults.length
        : undefined,
      confidence,
      responseTimeMs: timing.total,
      hydeUsed: useHyDE,
      crossEncoderUsed: cfg.enableCrossEncoder && finalResults.length > 0,
      reformulationCount: 0,
    }).catch(() => {/* non-critical */});

    const result: EnhancedRAGResult = {
      results: finalResults,
      confidence,
      retrievalConfidence,
      sourceCount,
      methodsUsed,
      timing: { ...timing, cacheHit: false },
      debug: {
        hydeUsed: useHyDE,
        hydeReason: useHyDE ? 'Query matches HyDE patterns' : 'Direct search preferred',
        queryDecomposition: decomposition?.isComplex ? decomposition : undefined,
      },
    };

    // Phase 67.1: Cache the result (async, non-blocking)
    if (!cfg.skipCache) {
      ragResultCache.set(query, context, result).catch(() => {/* non-critical */});
    }

    return result;
  }

  /**
   * Quick retrieval - faster but less accurate
   */
  async quickRetrieve(
    query: string,
    context: AIContext,
    maxResults: number = 5
  ): Promise<EnhancedResult[]> {
    const result = await this.retrieve(query, context, {
      enableHyDE: false,
      enableCrossEncoder: false,
      maxResults,
      agenticConfig: { maxIterations: 1 },
    });
    return result.results;
  }

  /**
   * Deep retrieval - slower but most accurate
   */
  async deepRetrieve(
    query: string,
    context: AIContext,
    maxResults: number = 10
  ): Promise<EnhancedRAGResult> {
    return this.retrieve(query, context, {
      enableHyDE: true,
      autoDetectHyDE: false, // Always use HyDE
      enableCrossEncoder: true,
      crossEncodeTop: 15,
      maxResults,
      agenticConfig: { maxIterations: 3, enableReformulation: true },
    });
  }

  /**
   * Contextual Chunk Enrichment (Anthropic pattern)
   *
   * Prepends 50-100 tokens of document-level context before the content/summary
   * to improve embedding quality and re-ranking accuracy. According to Anthropic's
   * research, this technique reduces retrieval failures by 35-67%.
   *
   * A chunk saying "Revenue grew 3%" gets prefixed with context like:
   * [From: "Q3 Earnings Analysis" | Topic: Finance | Context: work]
   *
   * The prefix is kept short (~50-100 tokens) to avoid diluting the chunk's
   * semantic signal while providing enough context for disambiguation.
   */
  private enrichWithContext(title: string, summary: string, content?: string, topic?: string, contextLabel?: string): { enrichedSummary: string; enrichedContent?: string } {
    const prefix = enrichChunkWithContext({ content: '', title, topic, context: contextLabel });
    return {
      enrichedSummary: `${prefix}${summary}`,
      enrichedContent: content ? `${prefix}${content}` : undefined,
    };
  }

  /**
   * Merge results from HyDE and Agentic RAG
   * Applies Contextual Chunk Enrichment for better re-ranking
   */
  private mergeAllResults(
    hydeResults: HyDERetrievalResult[],
    agenticResults: RetrievalResult[],
    graphRAGResults: HybridRetrievalResult[] = []
  ): EnhancedResult[] {
    const merged = new Map<string, EnhancedResult>();

    // Phase 99: Dynamic retrieval weights based on result quality
    const { hydeWeight: HYDE_WEIGHT, agenticWeight: AGENTIC_WEIGHT } =
      calculateDynamicWeights(hydeResults, agenticResults);

    // Add HyDE results with contextual enrichment
    for (const result of hydeResults) {
      const { enrichedSummary, enrichedContent } = this.enrichWithContext(
        result.title, result.summary, result.content
      );
      merged.set(result.id, {
        id: result.id,
        title: result.title,
        summary: enrichedSummary,
        content: enrichedContent,
        score: result.score * HYDE_WEIGHT,
        scores: {
          hyde: result.hydeScore,
          semantic: result.score,
        },
        sources: ['hyde'],
      });
    }

    // Add/merge Agentic results with contextual enrichment
    for (const result of agenticResults) {
      const existing = merged.get(result.id);
      if (existing) {
        // Boost for appearing in both
        existing.score += result.score * AGENTIC_WEIGHT;
        existing.score = Math.min(existing.score * 1.15, 1.0);
        existing.scores.agentic = result.score;
        existing.sources.push('agentic');
      } else {
        const { enrichedSummary, enrichedContent } = this.enrichWithContext(
          result.title, result.summary, result.content
        );
        merged.set(result.id, {
          id: result.id,
          title: result.title,
          summary: enrichedSummary,
          content: enrichedContent,
          score: result.score * AGENTIC_WEIGHT,
          scores: {
            agentic: result.score,
          },
          sources: ['agentic'],
        });
      }
    }

    // Phase 58: Add/merge GraphRAG results
    const GRAPHRAG_WEIGHT = 0.5;
    for (const result of graphRAGResults) {
      const existing = merged.get(result.id);
      if (existing) {
        existing.score += result.score * GRAPHRAG_WEIGHT;
        existing.score = Math.min(existing.score * 1.1, 1.0);
        existing.sources.push('graphrag');
      } else {
        const { enrichedSummary, enrichedContent } = this.enrichWithContext(
          result.title, result.content?.substring(0, 200) || '', result.content
        );
        merged.set(result.id, {
          id: result.id,
          title: result.title,
          summary: enrichedSummary,
          content: enrichedContent,
          score: result.score * GRAPHRAG_WEIGHT,
          scores: {},
          sources: ['graphrag'],
        });
      }
    }

    // Phase 99: Content-hash deduplication (removes near-duplicate content across sources)
    const deduped = new Map<string, EnhancedResult>();
    for (const result of merged.values()) {
      const contentSnippet = (result.content ?? result.summary).slice(0, 500);
      const contentHash = createHash('sha256').update(contentSnippet).digest('hex').slice(0, 16);
      const dedupKey = result.id + '_' + contentHash;

      const existing = deduped.get(dedupKey);
      if (!existing || result.score > existing.score) {
        deduped.set(dedupKey, result);
      }
    }

    // Sort by score
    return Array.from(deduped.values())
      .sort((a, b) => b.score - a.score);
  }

  /**
   * Apply cross-encoder reranking scores
   */
  private applyReranking(
    original: EnhancedResult[],
    reranked: RerankedResult[]
  ): EnhancedResult[] {
    const rerankedMap = new Map(reranked.map(r => [r.id, r]));

    return original.map(result => {
      const rerankedResult = rerankedMap.get(result.id);
      if (rerankedResult) {
        // Blend original retrieval score with cross-encoder score
        // (30% original + 70% cross-encoder) to stabilize ranking
        const blendedScore = result.score * 0.3 + rerankedResult.relevanceScore * 0.7;
        return {
          ...result,
          score: blendedScore,
          scores: {
            ...result.scores,
            crossEncoder: rerankedResult.relevanceScore,
          },
          sources: [...result.sources, 'cross_encoder'] as EnhancedResult['sources'],
          relevanceReason: rerankedResult.relevanceReason,
        };
      }
      return result;
    }).sort((a, b) => b.score - a.score);
  }

  /**
   * Calculate overall confidence
   */
  private calculateConfidence(
    results: EnhancedResult[],
    methodsUsed: string[]
  ): number {
    if (results.length === 0) {return 0;}

    // Base confidence from top score
    let confidence = results[0].score;

    // Boost for multiple methods agreeing
    const multiSourceResults = results.filter(r => r.sources.length > 1);
    if (multiSourceResults.length > 0) {
      confidence *= 1.1;
    }

    // Boost for using cross-encoder
    if (methodsUsed.includes('cross_encoder')) {
      confidence *= 1.05;
    }

    // Penalty for low result count
    if (results.length < 3) {
      confidence *= 0.9;
    }

    return Math.min(confidence, 1.0);
  }

  /**
   * Update configuration
   */
  configure(config: Partial<EnhancedRAGConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): EnhancedRAGConfig {
    return { ...this.config };
  }

  // ===========================================
  // Phase 70: A-RAG Autonomous Retrieval
  // ===========================================

  /**
   * Execute retrieval using the A-RAG autonomous strategy.
   * Returns null if A-RAG produces no usable results.
   */
  private async retrieveWithARAG(
    query: string,
    context: AIContext,
    cfg: EnhancedRAGConfig,
    startTime: number
  ): Promise<EnhancedRAGResult | null> {
    // Determine available interfaces based on config
    const availableInterfaces: RetrievalInterface[] = ['keyword', 'semantic', 'chunk_read'];
    if (cfg.enableGraphRAG) {
      availableInterfaces.push('graph', 'community');
    }

    // Step 1: Strategy agent creates a retrieval plan
    const plan = await planRetrieval(query, context, availableInterfaces);

    logger.info('A-RAG plan created', {
      queryType: plan.queryType,
      steps: plan.steps.map(s => s.interface),
      reasoning: plan.reasoning,
    });

    // Step 2: Execute the plan iteratively
    const { result: aragResult, metadata } = await executeRetrievalPlan(plan, context, query);

    // If no results, return null to fall back
    if (aragResult.results.length === 0) {
      return null;
    }

    // Step 3: Convert A-RAG results to EnhancedResult format
    const enhancedResults: EnhancedResult[] = aragResult.results
      .filter(r => r.score >= cfg.minRelevance)
      .slice(0, cfg.maxResults)
      .map(r => {
        const { enrichedSummary } = this.enrichWithContext(r.title || '', r.content);
        return {
          id: r.id,
          title: r.title || '',
          summary: enrichedSummary,
          content: r.content,
          score: r.score,
          scores: {},
          sources: ['arag' as const],
        };
      });

    if (enhancedResults.length === 0) {
      return null;
    }

    // Step 4: Optional cross-encoder re-ranking on A-RAG results
    let finalResults = enhancedResults;
    let crossEncoderTime: number | undefined;

    if (cfg.enableCrossEncoder && enhancedResults.length > 1) {
      const crossStart = Date.now();
      try {
        const reranked = await hybridRerank(
          query,
          enhancedResults.map(r => ({
            id: r.id,
            title: r.title,
            summary: r.summary,
            content: r.content,
            score: r.score,
            strategy: 'hybrid' as const,
          })),
          { crossEncodeTop: cfg.crossEncodeTop, minRelevance: cfg.minRelevance }
        );
        finalResults = this.applyReranking(enhancedResults, reranked);
        crossEncoderTime = Date.now() - crossStart;
      } catch {
        // Cross-encoder failure is non-critical for A-RAG
      }
    }

    const confidence = aragResult.confidence;
    const totalTime = Date.now() - startTime;
    const methodsUsed = ['arag', ...metadata.interfacesUsed];
    if (crossEncoderTime !== undefined) {
      methodsUsed.push('cross_encoder');
    }

    // Record analytics (async, non-blocking)
    recordRAGQueryAnalytics(context, {
      queryText: query,
      queryType: metadata.queryType,
      strategiesUsed: methodsUsed,
      strategySelected: 'arag',
      resultCount: finalResults.length,
      topScore: finalResults.length > 0 ? finalResults[0].score : undefined,
      avgScore: finalResults.length > 0
        ? finalResults.reduce((sum, r) => sum + r.score, 0) / finalResults.length
        : undefined,
      confidence,
      responseTimeMs: totalTime,
      hydeUsed: false,
      crossEncoderUsed: crossEncoderTime !== undefined,
      reformulationCount: metadata.iterations - 1,
    }).catch(() => {/* non-critical */});

    return {
      results: finalResults,
      confidence,
      methodsUsed,
      timing: {
        total: totalTime,
        crossEncoder: crossEncoderTime,
        cacheHit: false,
        arag: metadata,
      },
      debug: {
        hydeUsed: false,
        hydeReason: 'A-RAG autonomous retrieval used instead of HyDE',
      },
    };
  }
}

// ===========================================
// Singleton Export
// ===========================================

export const enhancedRAG = new EnhancedRAGService();

// ===========================================
// Convenience Functions
// ===========================================

/**
 * Quick search with enhanced RAG
 */
export async function search(
  query: string,
  context: AIContext,
  maxResults: number = 10
): Promise<EnhancedResult[]> {
  const result = await enhancedRAG.retrieve(query, context, { maxResults });
  return result.results;
}

/**
 * Deep search with all enhancements
 */
export async function deepSearch(
  query: string,
  context: AIContext
): Promise<EnhancedRAGResult> {
  return enhancedRAG.deepRetrieve(query, context);
}
