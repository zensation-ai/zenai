/**
 * HyDE (Hypothetical Document Embeddings) Service
 *
 * Implements the HyDE technique for improved retrieval on ambiguous queries.
 *
 * How it works:
 * 1. User asks: "How do I improve performance?"
 * 2. Claude generates a hypothetical ideal answer
 * 3. We embed that hypothetical answer
 * 4. Search using the hypothetical embedding (not query embedding)
 *
 * Why this works:
 * - Hypothetical answers are in "document space" not "query space"
 * - Better semantic alignment with actual documents
 * - Especially effective for vague or conceptual queries
 *
 * Research: https://arxiv.org/abs/2212.10496
 *
 * @module services/hyde-retrieval
 */

import { logger } from '../utils/logger';
import { generateClaudeResponse } from './claude';
import { generateEmbedding } from './ai';
import { AIContext, queryContext } from '../utils/database-context';

// ===========================================
// Types & Interfaces
// ===========================================

/**
 * HyDE generation result
 */
export interface HyDEResult {
  /** Original query */
  originalQuery: string;
  /** Generated hypothetical document */
  hypotheticalDocument: string;
  /** Embedding of the hypothetical document */
  embedding: number[];
  /** Time taken for generation in ms */
  generationTimeMs: number;
}

/**
 * Retrieved document with HyDE
 */
export interface HyDERetrievalResult {
  id: string;
  title: string;
  summary: string;
  content?: string;
  score: number;
  hydeScore: number;
}

/**
 * Configuration for HyDE
 */
export interface HyDEConfig {
  /** Maximum tokens for hypothetical document */
  maxTokens: number;
  /** Temperature for generation (lower = more focused) */
  temperature: number;
  /** Number of hypothetical documents to generate (for diversity) */
  numHypothetical: number;
  /** Domain context for better generation */
  domainContext?: string;
}

// ===========================================
// Configuration
// ===========================================

const DEFAULT_CONFIG: HyDEConfig = {
  maxTokens: 300,
  temperature: 0.5,
  numHypothetical: 1,
};

// ===========================================
// System Prompts
// ===========================================

const HYDE_SYSTEM_PROMPT = `Du generierst hypothetische Dokumente für Suchanfragen.

Deine Aufgabe: Schreibe eine kurze, informative Passage die eine perfekte Antwort auf die Suchanfrage wäre.

REGELN:
1. Schreibe als wäre es ein echtes Dokument/eine echte Notiz
2. Sei konkret und informativ
3. Verwende relevante Fachbegriffe
4. Halte es kurz (2-4 Sätze)
5. Schreibe auf Deutsch

Die Passage wird als Suchvektor verwendet - sie muss nicht wahr sein, aber thematisch passend.`;

const HYDE_DIVERSE_PROMPT = `Generiere {count} verschiedene hypothetische Dokumente für diese Suchanfrage.
Jedes Dokument sollte einen anderen Aspekt oder Blickwinkel behandeln.

Suchanfrage: {query}

Antworte mit einem JSON-Array:
["Dokument 1 Text...", "Dokument 2 Text..."]`;

// ===========================================
// HyDE Service Class
// ===========================================

class HyDEService {
  private config: HyDEConfig;

  constructor(config: Partial<HyDEConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Generate a hypothetical document for a query
   */
  async generateHypothetical(
    query: string,
    config?: Partial<HyDEConfig>
  ): Promise<HyDEResult> {
    const cfg = { ...this.config, ...config };
    const startTime = Date.now();

    logger.debug('Generating hypothetical document', {
      query: query.substring(0, 50),
    });

    let systemPrompt = HYDE_SYSTEM_PROMPT;
    if (cfg.domainContext) {
      systemPrompt += `\n\n[DOMÄNEN-KONTEXT]\n${cfg.domainContext}`;
    }

    const hypothetical = await generateClaudeResponse(
      systemPrompt,
      `Suchanfrage: ${query}\n\nGeneriere eine passende Passage:`,
      { maxTokens: cfg.maxTokens, temperature: cfg.temperature }
    );

    // Generate embedding for the hypothetical document
    const embedding = await generateEmbedding(hypothetical);

    const generationTimeMs = Date.now() - startTime;

    logger.debug('Hypothetical document generated', {
      query: query.substring(0, 50),
      hypotheticalLength: hypothetical.length,
      generationTimeMs,
    });

    return {
      originalQuery: query,
      hypotheticalDocument: hypothetical,
      embedding,
      generationTimeMs,
    };
  }

  /**
   * Generate multiple diverse hypothetical documents
   */
  async generateDiverseHypotheticals(
    query: string,
    count: number = 3,
    config?: Partial<HyDEConfig>
  ): Promise<HyDEResult[]> {
    const cfg = { ...this.config, ...config };

    logger.debug('Generating diverse hypotheticals', { query: query.substring(0, 50), count });

    const prompt = HYDE_DIVERSE_PROMPT
      .replace('{count}', count.toString())
      .replace('{query}', query);

    try {
      const response = await generateClaudeResponse(
        HYDE_SYSTEM_PROMPT,
        prompt,
        { maxTokens: cfg.maxTokens * count, temperature: cfg.temperature + 0.2 }
      );

      // Parse JSON array
      const match = response.match(/\[[\s\S]*\]/);
      if (!match) {
        throw new Error('Failed to parse hypothetical documents');
      }

      const documents: string[] = JSON.parse(match[0]);

      // Generate embeddings in parallel
      const results = await Promise.all(
        documents.map(async (doc, i) => {
          const embedding = await generateEmbedding(doc);
          return {
            originalQuery: query,
            hypotheticalDocument: doc,
            embedding,
            generationTimeMs: 0, // Not tracked individually
          };
        })
      );

      return results;
    } catch (error) {
      logger.warn('Diverse hypothetical generation failed, falling back to single', { error });
      return [await this.generateHypothetical(query, cfg)];
    }
  }

  /**
   * Retrieve documents using HyDE
   */
  async retrieve(
    query: string,
    context: AIContext,
    options: {
      maxResults?: number;
      useDiverse?: boolean;
      diverseCount?: number;
    } = {}
  ): Promise<HyDERetrievalResult[]> {
    const { maxResults = 10, useDiverse = false, diverseCount = 3 } = options;

    logger.info('HyDE retrieval starting', {
      query: query.substring(0, 50),
      context,
      useDiverse,
    });

    const startTime = Date.now();

    // Generate hypothetical document(s)
    let embeddings: number[][];

    if (useDiverse) {
      const hypotheticals = await this.generateDiverseHypotheticals(query, diverseCount);
      embeddings = hypotheticals.map(h => h.embedding);
    } else {
      const hypothetical = await this.generateHypothetical(query);
      embeddings = [hypothetical.embedding];
    }

    // Search with each embedding and combine results
    const allResults = new Map<string, HyDERetrievalResult>();

    for (const embedding of embeddings) {
      if (embedding.length === 0) {continue;}

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
        [context, `[${embedding.join(',')}]`, maxResults]
      );

      for (const row of result.rows) {
        const existing = allResults.get(row.id);
        const newScore = parseFloat(row.similarity) || 0;

        if (!existing || newScore > existing.hydeScore) {
          allResults.set(row.id, {
            id: row.id,
            title: row.title,
            summary: row.summary || '',
            content: row.raw_transcript,
            score: newScore,
            hydeScore: newScore,
          });
        } else if (existing) {
          // Boost score for appearing in multiple hypothetical searches
          existing.score = Math.min(existing.score * 1.1, 1.0);
        }
      }
    }

    // Sort by score and limit
    const sorted = Array.from(allResults.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults);

    logger.info('HyDE retrieval complete', {
      resultCount: sorted.length,
      timeMs: Date.now() - startTime,
    });

    return sorted;
  }

  /**
   * Hybrid retrieval: combine HyDE with standard semantic search
   */
  async hybridRetrieve(
    query: string,
    context: AIContext,
    options: {
      maxResults?: number;
      hydeWeight?: number;
    } = {}
  ): Promise<HyDERetrievalResult[]> {
    const { maxResults = 10, hydeWeight = 0.6 } = options;
    const directWeight = 1 - hydeWeight;

    logger.info('Hybrid HyDE retrieval', {
      query: query.substring(0, 50),
      hydeWeight,
    });

    // Run HyDE and direct search in parallel
    const [hydeResults, directResults] = await Promise.all([
      this.retrieve(query, context, { maxResults }),
      this.directRetrieve(query, context, maxResults),
    ]);

    // Combine scores
    const combined = new Map<string, HyDERetrievalResult>();

    for (const result of hydeResults) {
      combined.set(result.id, {
        ...result,
        score: result.score * hydeWeight,
      });
    }

    for (const result of directResults) {
      const existing = combined.get(result.id);
      if (existing) {
        existing.score += result.score * directWeight;
        // Boost for appearing in both
        existing.score = Math.min(existing.score * 1.1, 1.0);
      } else {
        combined.set(result.id, {
          ...result,
          score: result.score * directWeight,
          hydeScore: 0,
        });
      }
    }

    return Array.from(combined.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults);
  }

  /**
   * Direct semantic search (for comparison/hybrid)
   */
  private async directRetrieve(
    query: string,
    context: AIContext,
    maxResults: number
  ): Promise<HyDERetrievalResult[]> {
    const queryEmbedding = await generateEmbedding(query);
    if (queryEmbedding.length === 0) {return [];}

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

    return result.rows.map((row: any) => ({
      id: row.id,
      title: row.title,
      summary: row.summary || '',
      content: row.raw_transcript,
      score: parseFloat(row.similarity) || 0,
      hydeScore: 0,
    }));
  }

  /**
   * Update configuration
   */
  configure(config: Partial<HyDEConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

// ===========================================
// Query Analysis for HyDE Decision
// ===========================================

/**
 * Determine if HyDE should be used for a query
 * HyDE is most beneficial for:
 * - Conceptual/abstract queries
 * - Questions without specific keywords
 * - "How to" style queries
 */
export function shouldUseHyDE(query: string): boolean {
  const queryLower = query.toLowerCase();

  // Indicators that HyDE would help
  const hydeIndicators = [
    /^wie\s/i,           // "Wie..." questions
    /^was\s/i,           // "Was..." questions
    /^warum\s/i,         // "Warum..." questions
    /^erkläre/i,         // "Erkläre..."
    /konzept/i,          // conceptual
    /strategie/i,        // strategic
    /ansatz/i,           // approach
    /methode/i,          // method
    /verbessern/i,       // improve
    /optimieren/i,       // optimize
  ];

  // Indicators that direct search is better
  const directIndicators = [
    /["'].+["']/,        // Quoted terms
    /#\w+/,              // Hashtags
    /\b[A-Z]{2,}\b/,     // Acronyms
    /\d{4}/,             // Years/dates
    /^suche\s/i,         // Explicit search
    /^finde\s/i,         // Find
  ];

  const hydeScore = hydeIndicators.filter(r => r.test(queryLower)).length;
  const directScore = directIndicators.filter(r => r.test(query)).length;

  return hydeScore > directScore;
}

// ===========================================
// Singleton Export
// ===========================================

export const hydeService = new HyDEService();
