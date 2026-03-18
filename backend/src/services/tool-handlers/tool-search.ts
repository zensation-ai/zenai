/**
 * Phase 100 B4: Semantic Tool Search
 *
 * On-demand tool discovery using both keyword and embedding-based search.
 * - Keyword matching: tool name words + description words
 * - Semantic matching: cosine similarity between query and tool description embeddings
 * - Results are merged and deduplicated
 * - Falls back to keyword-only if embedding generation fails
 *
 * @module services/tool-handlers/tool-search
 */

import { logger } from '../../utils/logger';
import { toolRegistry } from '../claude/tool-use';

// ===========================================
// Types
// ===========================================

export interface ToolSearchResult {
  name: string;
  description: string;
  score: number;
  matchSource: 'keyword' | 'semantic' | 'both';
}

interface ToolEmbeddingEntry {
  name: string;
  description: string;
  embedding: number[];
}

// ===========================================
// Cosine Similarity
// ===========================================

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dotProduct / denominator;
}

// ===========================================
// Tool Search Service
// ===========================================

export class ToolSearchService {
  private toolEmbeddings: Map<string, ToolEmbeddingEntry> = new Map();
  private embeddingsReady = false;

  /**
   * Initialize embeddings for all registered tools.
   * Call once at startup or lazily on first semantic search.
   */
  async initEmbeddings(): Promise<void> {
    try {
      const { generateEmbedding } = await import('../ai');
      const defs = toolRegistry.getDefinitions();

      for (const def of defs) {
        try {
          const embedding = await generateEmbedding(def.description);
          this.toolEmbeddings.set(def.name, {
            name: def.name,
            description: def.description,
            embedding,
          });
        } catch {
          // Skip individual tool if embedding fails
          logger.debug('Failed to generate embedding for tool', { tool: def.name });
        }
      }

      this.embeddingsReady = this.toolEmbeddings.size > 0;
      logger.info('Tool search embeddings initialized', {
        toolCount: this.toolEmbeddings.size,
        total: defs.length,
      });
    } catch (error) {
      logger.warn('Failed to initialize tool embeddings', {
        error: error instanceof Error ? error.message : String(error),
      });
      this.embeddingsReady = false;
    }
  }

  /**
   * Search for tools matching a query using keyword + semantic matching.
   *
   * @param query - Natural language search query
   * @param limit - Maximum results (default 10)
   * @returns Ranked list of matching tools
   */
  async search(query: string, limit = 10): Promise<ToolSearchResult[]> {
    const defs = toolRegistry.getDefinitions();
    const resultMap = new Map<string, ToolSearchResult>();

    // 1. Keyword matching
    const keywordResults = this.keywordSearch(query, defs);
    for (const result of keywordResults) {
      resultMap.set(result.name, result);
    }

    // 2. Semantic matching (if embeddings are available)
    if (this.embeddingsReady) {
      try {
        const semanticResults = await this.semanticSearch(query);
        for (const result of semanticResults) {
          const existing = resultMap.get(result.name);
          if (existing) {
            // Merge: take best score, mark as 'both'
            existing.score = Math.max(existing.score, result.score);
            existing.matchSource = 'both';
          } else {
            resultMap.set(result.name, result);
          }
        }
      } catch {
        // Fall back to keyword-only on semantic failure
        logger.debug('Semantic search failed, using keyword results only');
      }
    }

    // Sort by score descending and limit
    return Array.from(resultMap.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /**
   * Keyword-based search: matches query terms against tool names and descriptions.
   */
  private keywordSearch(
    query: string,
    defs: Array<{ name: string; description: string }>
  ): ToolSearchResult[] {
    const queryLower = query.toLowerCase();
    const queryTerms = queryLower.split(/\s+/).filter(t => t.length >= 2);
    const results: ToolSearchResult[] = [];

    for (const def of defs) {
      const nameLower = def.name.toLowerCase();
      const nameWords = nameLower.split('_');
      const descLower = def.description.toLowerCase();

      let score = 0;

      // Exact name match
      if (queryLower.includes(nameLower) || nameLower.includes(queryLower.replace(/\s+/g, '_'))) {
        score = 1.0;
      } else {
        // Term matching
        let matchedTerms = 0;
        for (const term of queryTerms) {
          if (nameWords.some(w => w.includes(term) || term.includes(w))) {
            matchedTerms += 2; // Name matches are weighted higher
          } else if (descLower.includes(term)) {
            matchedTerms += 1;
          }
        }
        if (matchedTerms > 0 && queryTerms.length > 0) {
          score = Math.min(matchedTerms / (queryTerms.length * 2), 0.95);
        }
      }

      if (score > 0.1) {
        results.push({
          name: def.name,
          description: def.description,
          score,
          matchSource: 'keyword',
        });
      }
    }

    return results;
  }

  /**
   * Embedding-based semantic search: computes cosine similarity between query and tool embeddings.
   */
  private async semanticSearch(query: string): Promise<ToolSearchResult[]> {
    const { generateEmbedding } = await import('../ai');
    const queryEmbedding = await generateEmbedding(query);

    if (!queryEmbedding || queryEmbedding.length === 0) {
      return [];
    }

    const results: ToolSearchResult[] = [];

    for (const [, entry] of this.toolEmbeddings) {
      const similarity = cosineSimilarity(queryEmbedding, entry.embedding);
      if (similarity > 0.3) {
        results.push({
          name: entry.name,
          description: entry.description,
          score: similarity,
          matchSource: 'semantic',
        });
      }
    }

    // Sort by similarity descending
    return results.sort((a, b) => b.score - a.score);
  }
}
