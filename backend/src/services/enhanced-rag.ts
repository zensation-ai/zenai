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

import { logger } from '../utils/logger';
import { AIContext } from '../utils/database-context';
import { agenticRAG, RetrievalResult, RAGAgentConfig } from './agentic-rag';
import { hybridRerank, RerankedResult } from './cross-encoder-rerank';
import { hydeService, shouldUseHyDE, HyDERetrievalResult } from './hyde-retrieval';

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
  sources: ('semantic' | 'hyde' | 'cross_encoder' | 'agentic')[];
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
  };
  /** Debug information */
  debug?: {
    hydeUsed: boolean;
    hydeReason?: string;
    queryReformulations?: string[];
  };
}

// ===========================================
// Configuration
// ===========================================

const DEFAULT_CONFIG: EnhancedRAGConfig = {
  enableHyDE: true,
  autoDetectHyDE: true,
  enableCrossEncoder: true,
  crossEncodeTop: 10,
  minRelevance: 0.3,
  maxResults: 10,
};

// ===========================================
// Enhanced RAG Service
// ===========================================

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
    config?: Partial<EnhancedRAGConfig>
  ): Promise<EnhancedRAGResult> {
    const cfg = { ...this.config, ...config };
    const startTime = Date.now();
    const methodsUsed: string[] = [];
    const timing: EnhancedRAGResult['timing'] = { total: 0 };

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

    let hydeResults: HyDERetrievalResult[] = [];
    let agenticResults: RetrievalResult[] = [];

    // Step 1: Run retrieval methods (parallel when possible)
    const retrievalPromises: Promise<void>[] = [];

    // HyDE retrieval (if enabled)
    if (useHyDE) {
      const hydeStart = Date.now();
      retrievalPromises.push(
        hydeService.hybridRetrieve(query, context, { maxResults: cfg.maxResults })
          .then(results => {
            hydeResults = results;
            timing.hyde = Date.now() - hydeStart;
            methodsUsed.push('hyde');
          })
          .catch(error => {
            logger.warn('HyDE retrieval failed', { error });
          })
      );
    }

    // Agentic RAG retrieval (always)
    const agenticStart = Date.now();
    retrievalPromises.push(
      agenticRAG.retrieve(query, context, cfg.agenticConfig)
        .then(result => {
          agenticResults = result.results;
          timing.agentic = Date.now() - agenticStart;
          methodsUsed.push('agentic');
        })
        .catch(error => {
          logger.warn('Agentic RAG retrieval failed', { error });
        })
    );

    await Promise.all(retrievalPromises);

    // Step 2: Merge results from all sources
    const merged = this.mergeAllResults(hydeResults, agenticResults, cfg);

    // Step 3: Cross-encoder re-ranking (if enabled and have results)
    let finalResults: EnhancedResult[];

    if (cfg.enableCrossEncoder && merged.length > 0) {
      const crossStart = Date.now();
      try {
        const reranked = await hybridRerank(
          query,
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
        logger.warn('Cross-encoder re-ranking failed, using merged results', { error });
        finalResults = merged;
      }
    } else {
      finalResults = merged;
    }

    // Step 4: Filter and limit results
    finalResults = finalResults
      .filter(r => r.score >= cfg.minRelevance)
      .slice(0, cfg.maxResults);

    // Calculate overall confidence
    const confidence = this.calculateConfidence(finalResults, methodsUsed);

    timing.total = Date.now() - startTime;

    logger.info('Enhanced RAG retrieval complete', {
      resultCount: finalResults.length,
      confidence,
      methodsUsed,
      timing,
    });

    return {
      results: finalResults,
      confidence,
      methodsUsed,
      timing,
      debug: {
        hydeUsed: useHyDE,
        hydeReason: useHyDE ? 'Query matches HyDE patterns' : 'Direct search preferred',
      },
    };
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
   * Prepends document context before the content/summary to improve
   * re-ranking accuracy. This reduces retrieval failures by ~49%
   * according to Anthropic's research.
   *
   * Pattern: "[Document: {title}] {summary_or_content}"
   */
  private enrichWithContext(title: string, summary: string, content?: string): { enrichedSummary: string; enrichedContent?: string } {
    const contextPrefix = title ? `[Document: ${title}] ` : '';
    return {
      enrichedSummary: `${contextPrefix}${summary}`,
      enrichedContent: content ? `${contextPrefix}${content}` : undefined,
    };
  }

  /**
   * Merge results from HyDE and Agentic RAG
   * Applies Contextual Chunk Enrichment for better re-ranking
   */
  private mergeAllResults(
    hydeResults: HyDERetrievalResult[],
    agenticResults: RetrievalResult[],
    _config: EnhancedRAGConfig
  ): EnhancedResult[] {
    const merged = new Map<string, EnhancedResult>();

    // Weight factors
    const HYDE_WEIGHT = 0.4;
    const AGENTIC_WEIGHT = 0.6;

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

    // Sort by score
    return Array.from(merged.values())
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
        return {
          ...result,
          score: rerankedResult.relevanceScore,
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
