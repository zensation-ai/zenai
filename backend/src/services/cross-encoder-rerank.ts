/**
 * Cross-Encoder Re-Ranking Service
 *
 * Implements semantic re-ranking using Claude as a cross-encoder.
 * This significantly improves retrieval quality by:
 * - Jointly encoding query and document (not just embedding similarity)
 * - Understanding semantic nuances and context
 * - Providing relevance scores with explanations
 *
 * Cross-encoders are more accurate than bi-encoders (embedding similarity)
 * because they see query and document together, enabling better reasoning.
 *
 * @module services/cross-encoder-rerank
 */

import { logger } from '../utils/logger';
import { generateClaudeResponse, queryClaudeJSON } from './claude';
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
  /** Relevance score from cross-encoder (0-1) */
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
  /** Maximum results to re-rank (expensive operation) */
  maxResults: number;
  /** Minimum relevance score to keep */
  minRelevance: number;
  /** Include reasoning in results */
  includeReasoning: boolean;
  /** Batch size for parallel processing */
  batchSize: number;
}

/**
 * Individual document assessment
 */
interface DocumentAssessment {
  id: string;
  relevance: number;
  reason: string;
}

// ===========================================
// Configuration
// ===========================================

const DEFAULT_CONFIG: RerankConfig = {
  maxResults: 20,
  minRelevance: 0.3,
  includeReasoning: true,
  batchSize: 5,
};

// ===========================================
// System Prompts
// ===========================================

const RERANK_SYSTEM_PROMPT = `Du bist ein Relevanz-Bewerter für Suchergebnisse.

Deine Aufgabe: Bewerte wie relevant jedes Dokument für die gegebene Suchanfrage ist.

Bewertungskriterien:
1. DIREKTE RELEVANZ (0.4): Beantwortet das Dokument die Anfrage direkt?
2. THEMATISCHE ÜBEREINSTIMMUNG (0.3): Behandelt es das gleiche Thema?
3. INFORMATIONSWERT (0.2): Liefert es nützliche Informationen?
4. KONTEXTUELLE NÄHE (0.1): Passt es zum impliziten Kontext?

Score-Interpretation:
- 0.9-1.0: Perfekte Übereinstimmung, beantwortet die Anfrage vollständig
- 0.7-0.9: Sehr relevant, enthält wichtige Informationen
- 0.5-0.7: Relevant, aber nicht vollständig passend
- 0.3-0.5: Teilweise relevant, könnte hilfreich sein
- 0.0-0.3: Kaum oder nicht relevant

Antworte NUR mit JSON.`;

const BATCH_RERANK_PROMPT = `Bewerte die Relevanz dieser Dokumente für die Suchanfrage.

SUCHANFRAGE: "{query}"

DOKUMENTE:
{documents}

Antworte als JSON-Array:
[
  {{"id": "doc_id", "relevance": 0.0-1.0, "reason": "Kurze Begründung"}}
]`;

const SINGLE_RERANK_PROMPT = `Bewerte die Relevanz dieses Dokuments für die Suchanfrage.

SUCHANFRAGE: "{query}"

DOKUMENT:
Titel: {title}
Zusammenfassung: {summary}
{content}

Antworte als JSON:
{{"relevance": 0.0-1.0, "reason": "Begründung (1-2 Sätze)"}}`;

// ===========================================
// Cross-Encoder Re-Ranking Service
// ===========================================

class CrossEncoderReranker {
  private config: RerankConfig;

  constructor(config: Partial<RerankConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Re-rank results using cross-encoder
   *
   * @param query - The search query
   * @param results - Results to re-rank
   * @param config - Optional config override
   * @returns Re-ranked results
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

    // Limit results to re-rank
    const toRerank = results.slice(0, cfg.maxResults);

    logger.info('Cross-encoder re-ranking', {
      query: query.substring(0, 50),
      resultCount: toRerank.length,
      batchSize: cfg.batchSize,
    });

    const startTime = Date.now();
    let reranked: RerankedResult[];

    // Use batch processing for efficiency
    if (toRerank.length <= cfg.batchSize) {
      reranked = await this.rerankBatch(query, toRerank, cfg);
    } else {
      reranked = await this.rerankInBatches(query, toRerank, cfg);
    }

    // Filter by minimum relevance
    reranked = reranked.filter(r => r.relevanceScore >= cfg.minRelevance);

    // Sort by relevance score
    reranked.sort((a, b) => b.relevanceScore - a.relevanceScore);

    // Calculate movement
    reranked = this.calculateMovement(toRerank, reranked);

    logger.info('Cross-encoder re-ranking complete', {
      inputCount: toRerank.length,
      outputCount: reranked.length,
      timeMs: Date.now() - startTime,
    });

    return reranked;
  }

  /**
   * Re-rank a small batch at once
   */
  private async rerankBatch(
    query: string,
    results: RetrievalResult[],
    config: RerankConfig
  ): Promise<RerankedResult[]> {
    const documentsText = results
      .map((r, i) => `[${r.id}] Titel: ${r.title}\nZusammenfassung: ${r.summary || 'Keine'}`)
      .join('\n\n');

    const prompt = BATCH_RERANK_PROMPT
      .replace('{query}', query)
      .replace('{documents}', documentsText);

    try {
      const assessments = await queryClaudeJSON<DocumentAssessment[]>(
        RERANK_SYSTEM_PROMPT,
        prompt
      );

      // Map assessments to results
      const assessmentMap = new Map(assessments.map(a => [a.id, a]));

      return results.map(result => {
        const assessment = assessmentMap.get(result.id);
        return {
          ...result,
          originalScore: result.score,
          relevanceScore: assessment?.relevance ?? result.score * 0.7,
          relevanceReason: config.includeReasoning ? assessment?.reason : undefined,
          score: assessment?.relevance ?? result.score * 0.7,
          movement: 'unchanged' as const,
        };
      });
    } catch (error) {
      logger.warn('Batch re-ranking failed, using original scores', { error });
      return results.map(result => ({
        ...result,
        originalScore: result.score,
        relevanceScore: result.score,
        movement: 'unchanged' as const,
      }));
    }
  }

  /**
   * Re-rank in multiple batches
   */
  private async rerankInBatches(
    query: string,
    results: RetrievalResult[],
    config: RerankConfig
  ): Promise<RerankedResult[]> {
    const batches: RetrievalResult[][] = [];

    for (let i = 0; i < results.length; i += config.batchSize) {
      batches.push(results.slice(i, i + config.batchSize));
    }

    // Process batches in parallel (but not too many at once)
    const maxParallel = 3;
    const allResults: RerankedResult[] = [];

    for (let i = 0; i < batches.length; i += maxParallel) {
      const batchGroup = batches.slice(i, i + maxParallel);
      const batchResults = await Promise.all(
        batchGroup.map(batch => this.rerankBatch(query, batch, config))
      );
      allResults.push(...batchResults.flat());
    }

    return allResults;
  }

  /**
   * Re-rank a single document (for expensive, high-quality re-ranking)
   */
  async rerankSingle(
    query: string,
    result: RetrievalResult
  ): Promise<RerankedResult> {
    const prompt = SINGLE_RERANK_PROMPT
      .replace('{query}', query)
      .replace('{title}', result.title)
      .replace('{summary}', result.summary || 'Keine Zusammenfassung')
      .replace('{content}', result.content ? `\nInhalt: ${result.content.substring(0, 500)}` : '');

    try {
      const assessment = await queryClaudeJSON<{ relevance: number; reason: string }>(
        RERANK_SYSTEM_PROMPT,
        prompt
      );

      return {
        ...result,
        originalScore: result.score,
        relevanceScore: assessment.relevance,
        relevanceReason: assessment.reason,
        score: assessment.relevance,
        movement: 'unchanged',
      };
    } catch (error) {
      logger.debug('Single re-ranking failed', { id: result.id, error });
      return {
        ...result,
        originalScore: result.score,
        relevanceScore: result.score,
        movement: 'unchanged',
      };
    }
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
        if (newPos < oldPos - 1) movement = 'boosted';
        else if (newPos > oldPos + 1) movement = 'demoted';
      }

      return { ...result, movement };
    });
  }

  /**
   * Pointwise re-ranking with detailed analysis
   * More expensive but more accurate for top results
   */
  async rerankPointwise(
    query: string,
    results: RetrievalResult[],
    topK: number = 5
  ): Promise<RerankedResult[]> {
    const toRerank = results.slice(0, Math.min(topK, results.length));

    logger.info('Pointwise re-ranking', {
      query: query.substring(0, 50),
      count: toRerank.length,
    });

    const reranked = await Promise.all(
      toRerank.map(result => this.rerankSingle(query, result))
    );

    reranked.sort((a, b) => b.relevanceScore - a.relevanceScore);
    return this.calculateMovement(toRerank, reranked);
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
 * Combines fast heuristic re-ranking with cross-encoder for top results
 */
export async function hybridRerank(
  query: string,
  results: RetrievalResult[],
  options: {
    /** Number of top results to cross-encode */
    crossEncodeTop?: number;
    /** Minimum relevance threshold */
    minRelevance?: number;
  } = {}
): Promise<RerankedResult[]> {
  const { crossEncodeTop = 10, minRelevance = 0.3 } = options;

  if (results.length === 0) return [];

  // Step 1: Quick heuristic pre-filter
  const preFiltered = quickHeuristicFilter(query, results);

  // Step 2: Cross-encode top results
  const toEncode = preFiltered.slice(0, crossEncodeTop);
  const rest = preFiltered.slice(crossEncodeTop);

  const reranker = new CrossEncoderReranker({ minRelevance });
  const reranked = await reranker.rerank(query, toEncode);

  // Step 3: Combine with rest (scaled down)
  const combined: RerankedResult[] = [
    ...reranked,
    ...rest.map(r => ({
      ...r,
      originalScore: r.score,
      relevanceScore: r.score * 0.7, // Scale down non-cross-encoded
      movement: 'unchanged' as const,
    })),
  ];

  return combined.filter(r => r.relevanceScore >= minRelevance);
}

/**
 * Quick heuristic filter to reduce cross-encoder load
 */
function quickHeuristicFilter(
  query: string,
  results: RetrievalResult[]
): RetrievalResult[] {
  const queryTerms = new Set(
    query.toLowerCase().split(/\s+/).filter(t => t.length > 2)
  );

  return results
    .map(result => {
      let boost = 0;

      // Title match boost
      const titleLower = result.title.toLowerCase();
      for (const term of queryTerms) {
        if (titleLower.includes(term)) boost += 0.1;
      }

      // Exact phrase boost
      if (titleLower.includes(query.toLowerCase())) boost += 0.2;

      return {
        ...result,
        score: Math.min(result.score + boost, 1.0),
      };
    })
    .sort((a, b) => b.score - a.score);
}

// ===========================================
// Singleton Export
// ===========================================

export const crossEncoderReranker = new CrossEncoderReranker();
