/**
 * Agentic RAG Service
 *
 * Implements an agent-based Retrieval-Augmented Generation system
 * that dynamically selects retrieval strategies based on query analysis.
 *
 * Features:
 * - Dynamic strategy selection (semantic, keyword, graph, temporal, hybrid)
 * - Self-reflection and evaluation of results
 * - Query reformulation when confidence is low
 * - Multi-iteration retrieval for complex queries
 */

import { v4 as uuidv4 } from 'uuid';
import { AIContext, queryContext } from '../utils/database-context';
import { logger } from '../utils/logger';
import { generateClaudeResponse, queryClaudeJSON } from './claude';
import { generateEmbedding } from './ai';
import { cosineSimilarity } from '../utils/semantic-cache';

// ===========================================
// Types & Interfaces
// ===========================================

export type RetrievalStrategy = 'semantic' | 'keyword' | 'graph' | 'temporal' | 'hybrid';

export interface RetrievalResult {
  id: string;
  title: string;
  summary: string;
  content?: string;
  score: number;
  strategy: RetrievalStrategy;
  metadata?: Record<string, any>;
}

export interface EvaluationResult {
  confidence: number;
  answersQuery: boolean;
  missingAspects: string[];
  feedback: string;
}

export interface RAGResult {
  results: RetrievalResult[];
  confidence: number;
  iterations: number;
  strategiesUsed: RetrievalStrategy[];
  evaluation: EvaluationResult;
  queryHistory: string[];
}

export interface RAGAgentConfig {
  /** Maximum retrieval iterations */
  maxIterations: number;
  /** Minimum confidence to stop */
  minConfidence: number;
  /** Available strategies */
  strategies: RetrievalStrategy[];
  /** Maximum results per strategy */
  maxResultsPerStrategy: number;
  /** Enable query reformulation */
  enableReformulation: boolean;
}

// ===========================================
// Configuration
// ===========================================

const DEFAULT_CONFIG: RAGAgentConfig = {
  maxIterations: 3,
  minConfidence: 0.7,
  strategies: ['semantic', 'keyword', 'graph', 'temporal'],
  maxResultsPerStrategy: 10,
  enableReformulation: true,
};

// ===========================================
// Strategy Selection Prompts
// ===========================================

const STRATEGY_SYSTEM_PROMPT = `Du bist ein Retrieval-Experte. Wähle die beste Strategie basierend auf der Query.

Verfügbare Strategien:
- semantic: Embedding-basierte Ähnlichkeitssuche (konzeptuelle Fragen, Themen)
- keyword: Keyword-Matching (spezifische Begriffe, Namen, Codes)
- graph: Knowledge Graph Traversal (Beziehungen zwischen Ideen)
- temporal: Zeitbasierte Suche ("letzte", "kürzlich", "vor X Tagen")
- hybrid: Kombination (komplexe Fragen mit mehreren Aspekten)

Antworte NUR mit dem Strategie-Namen in Kleinbuchstaben.`;

const EVALUATION_SYSTEM_PROMPT = `Du bewertest Suchergebnisse. Antworte auf Deutsch und im JSON-Format.`;

// ===========================================
// Agentic RAG Service
// ===========================================

class AgenticRAGService {
  /**
   * Main retrieval method with agent-based strategy selection
   */
  async retrieve(
    query: string,
    context: AIContext,
    config: Partial<RAGAgentConfig> = {}
  ): Promise<RAGResult> {
    const cfg: RAGAgentConfig = { ...DEFAULT_CONFIG, ...config };

    let iteration = 0;
    let results: RetrievalResult[] = [];
    let confidence = 0;
    const strategiesUsed: RetrievalStrategy[] = [];
    const queryHistory: string[] = [query];
    let currentQuery = query;
    let evaluation: EvaluationResult = {
      confidence: 0,
      answersQuery: false,
      missingAspects: [],
      feedback: '',
    };

    logger.info('Starting Agentic RAG retrieval', {
      query: query.substring(0, 100),
      context,
      maxIterations: cfg.maxIterations,
    });

    while (iteration < cfg.maxIterations && confidence < cfg.minConfidence) {
      iteration++;

      // 1. Select best strategy
      const strategy = await this.selectStrategy(
        currentQuery,
        results,
        cfg.strategies,
        strategiesUsed
      );

      if (!strategiesUsed.includes(strategy)) {
        strategiesUsed.push(strategy);
      }

      logger.debug('Strategy selected', { iteration, strategy, query: currentQuery.substring(0, 50) });

      // 2. Execute retrieval with selected strategy
      const newResults = await this.executeStrategy(
        strategy,
        currentQuery,
        context,
        cfg.maxResultsPerStrategy
      );

      // 3. Merge and deduplicate results
      results = this.mergeResults(results, newResults);

      // 4. Evaluate results (self-reflection)
      evaluation = await this.evaluateResults(query, results);
      confidence = evaluation.confidence;

      logger.debug('Evaluation complete', {
        iteration,
        confidence,
        answersQuery: evaluation.answersQuery,
        resultCount: results.length,
      });

      // 5. Reformulate query if needed and enabled
      if (
        cfg.enableReformulation &&
        confidence < cfg.minConfidence &&
        iteration < cfg.maxIterations
      ) {
        currentQuery = await this.reformulateQuery(
          query,
          currentQuery,
          results,
          evaluation
        );
        queryHistory.push(currentQuery);

        logger.debug('Query reformulated', {
          iteration,
          newQuery: currentQuery.substring(0, 50),
        });
      }
    }

    logger.info('Agentic RAG retrieval complete', {
      confidence,
      iterations: iteration,
      strategiesUsed,
      resultCount: results.length,
    });

    return {
      results,
      confidence,
      iterations: iteration,
      strategiesUsed,
      evaluation,
      queryHistory,
    };
  }

  // ===========================================
  // Strategy Selection
  // ===========================================

  /**
   * Select the best retrieval strategy using Claude
   */
  private async selectStrategy(
    query: string,
    currentResults: RetrievalResult[],
    availableStrategies: RetrievalStrategy[],
    usedStrategies: RetrievalStrategy[]
  ): Promise<RetrievalStrategy> {
    // Quick heuristic checks first
    const queryLower = query.toLowerCase();

    // Temporal indicators
    if (/\b(letzte|kürzlich|vor \d|gestern|heute|diese woche|letzten|recent|last)\b/i.test(query)) {
      if (!usedStrategies.includes('temporal')) return 'temporal';
    }

    // Relationship indicators
    if (/\b(verbind|bezieh|zusammen|ähnlich|related|connection|link)\b/i.test(query)) {
      if (!usedStrategies.includes('graph')) return 'graph';
    }

    // Specific term indicators
    if (/["']|#\w+|\b[A-Z]{2,}\b/.test(query)) {
      if (!usedStrategies.includes('keyword')) return 'keyword';
    }

    // If we have results but low confidence, try a different strategy
    if (currentResults.length > 0 && usedStrategies.length < availableStrategies.length) {
      const unused = availableStrategies.filter(s => !usedStrategies.includes(s));
      if (unused.length > 0) {
        // Prefer hybrid for complex queries after initial attempts
        if (unused.includes('hybrid')) return 'hybrid';
        return unused[0];
      }
    }

    // Use Claude for complex decisions
    try {
      const prompt = `Query: "${query}"

Bisherige Ergebnisse: ${currentResults.length} gefunden
${currentResults.length > 0 ? `Themen: ${currentResults.slice(0, 3).map(r => r.title).join(', ')}` : 'Noch keine Ergebnisse'}

Bereits verwendete Strategien: ${usedStrategies.join(', ') || 'keine'}

Wähle die beste Strategie aus: ${availableStrategies.join(', ')}`;

      const response = await generateClaudeResponse(
        STRATEGY_SYSTEM_PROMPT,
        prompt,
        { maxTokens: 50 }
      );

      const strategy = response.trim().toLowerCase() as RetrievalStrategy;
      if (availableStrategies.includes(strategy)) {
        return strategy;
      }
    } catch (error) {
      logger.debug('Claude strategy selection failed, using default', { error });
    }

    // Default to semantic if nothing else works
    return 'semantic';
  }

  // ===========================================
  // Strategy Execution
  // ===========================================

  /**
   * Execute a retrieval strategy
   */
  private async executeStrategy(
    strategy: RetrievalStrategy,
    query: string,
    context: AIContext,
    maxResults: number
  ): Promise<RetrievalResult[]> {
    switch (strategy) {
      case 'semantic':
        return await this.semanticRetrieval(query, context, maxResults);
      case 'keyword':
        return await this.keywordRetrieval(query, context, maxResults);
      case 'graph':
        return await this.graphRetrieval(query, context, maxResults);
      case 'temporal':
        return await this.temporalRetrieval(query, context, maxResults);
      case 'hybrid':
        return await this.hybridRetrieval(query, context, maxResults);
      default:
        return await this.semanticRetrieval(query, context, maxResults);
    }
  }

  /**
   * Semantic (embedding-based) retrieval
   */
  private async semanticRetrieval(
    query: string,
    context: AIContext,
    maxResults: number
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

      return result.rows.map((r: any) => ({
        id: r.id,
        title: r.title,
        summary: r.summary || '',
        content: r.raw_transcript,
        score: parseFloat(r.similarity) || 0.5,
        strategy: 'semantic' as RetrievalStrategy,
      }));
    } catch (error) {
      logger.debug('Semantic retrieval failed', { error });
      return [];
    }
  }

  /**
   * Keyword-based retrieval using PostgreSQL full-text search
   */
  private async keywordRetrieval(
    query: string,
    context: AIContext,
    maxResults: number
  ): Promise<RetrievalResult[]> {
    try {
      // Clean query for full-text search
      const searchTerms = query
        .replace(/[^\w\säöüß]/g, ' ')
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
        [context, query, maxResults]
      );

      return result.rows.map((r: any) => ({
        id: r.id,
        title: r.title,
        summary: r.summary || '',
        content: r.raw_transcript,
        score: Math.min(parseFloat(r.rank) * 10, 1) || 0.3,
        strategy: 'keyword' as RetrievalStrategy,
      }));
    } catch (error) {
      logger.debug('Keyword retrieval failed', { error });
      return [];
    }
  }

  /**
   * Graph-based retrieval using knowledge graph connections
   */
  private async graphRetrieval(
    query: string,
    context: AIContext,
    maxResults: number
  ): Promise<RetrievalResult[]> {
    try {
      // First, find seed ideas using semantic search
      const seedResults = await this.semanticRetrieval(query, context, 3);
      if (seedResults.length === 0) return [];

      const seedIds = seedResults.map(r => r.id);

      // Expand via graph connections
      const result = await queryContext(
        context,
        `WITH seed_ideas AS (
           SELECT unnest($2::uuid[]) as id
         ),
         connected AS (
           SELECT DISTINCT
             CASE WHEN kc.source_idea_id = s.id THEN kc.target_idea_id
                  ELSE kc.source_idea_id END as connected_id,
             kc.strength
           FROM knowledge_connections kc
           JOIN seed_ideas s ON kc.source_idea_id = s.id OR kc.target_idea_id = s.id
           WHERE kc.strength >= 0.5
         )
         SELECT i.id, i.title, i.summary, i.raw_transcript, c.strength as score
         FROM ideas i
         JOIN connected c ON i.id = c.connected_id
         WHERE i.context = $1
           AND i.is_archived = false
           AND i.id != ALL($2::uuid[])
         ORDER BY c.strength DESC
         LIMIT $3`,
        [context, seedIds, maxResults]
      );

      return result.rows.map((r: any) => ({
        id: r.id,
        title: r.title,
        summary: r.summary || '',
        content: r.raw_transcript,
        score: parseFloat(r.score) || 0.5,
        strategy: 'graph' as RetrievalStrategy,
        metadata: { graphExpanded: true },
      }));
    } catch (error) {
      logger.debug('Graph retrieval failed', { error });
      return [];
    }
  }

  /**
   * Temporal (time-based) retrieval
   */
  private async temporalRetrieval(
    query: string,
    context: AIContext,
    maxResults: number
  ): Promise<RetrievalResult[]> {
    try {
      // Parse temporal references
      let interval = '7 days';
      if (/heute|today/i.test(query)) interval = '1 day';
      else if (/gestern|yesterday/i.test(query)) interval = '2 days';
      else if (/diese woche|this week/i.test(query)) interval = '7 days';
      else if (/letzten? monat|last month/i.test(query)) interval = '30 days';
      else if (/vor (\d+) tag/i.test(query)) {
        const match = query.match(/vor (\d+) tag/i);
        if (match) interval = `${match[1]} days`;
      }

      const result = await queryContext(
        context,
        `SELECT id, title, summary, raw_transcript, created_at,
                1.0 - (EXTRACT(EPOCH FROM (NOW() - created_at)) / (86400 * 30)) as recency_score
         FROM ideas
         WHERE context = $1
           AND is_archived = false
           AND created_at >= NOW() - ($2)::INTERVAL
         ORDER BY created_at DESC
         LIMIT $3`,
        [context, interval, maxResults]
      );

      return result.rows.map((r: any) => ({
        id: r.id,
        title: r.title,
        summary: r.summary || '',
        content: r.raw_transcript,
        score: Math.max(parseFloat(r.recency_score) || 0.5, 0.3),
        strategy: 'temporal' as RetrievalStrategy,
        metadata: { createdAt: r.created_at },
      }));
    } catch (error) {
      logger.debug('Temporal retrieval failed', { error });
      return [];
    }
  }

  /**
   * Hybrid retrieval combining multiple strategies
   */
  private async hybridRetrieval(
    query: string,
    context: AIContext,
    maxResults: number
  ): Promise<RetrievalResult[]> {
    try {
      const halfMax = Math.ceil(maxResults / 2);

      // Run semantic and keyword in parallel
      const [semanticResults, keywordResults] = await Promise.all([
        this.semanticRetrieval(query, context, halfMax),
        this.keywordRetrieval(query, context, halfMax),
      ]);

      // Merge with boosted scores for items found by both
      const merged = this.mergeResults(semanticResults, keywordResults);

      // Boost items found by multiple strategies
      const idCounts = new Map<string, number>();
      for (const r of [...semanticResults, ...keywordResults]) {
        idCounts.set(r.id, (idCounts.get(r.id) || 0) + 1);
      }

      for (const result of merged) {
        const count = idCounts.get(result.id) || 1;
        if (count > 1) {
          result.score = Math.min(result.score * 1.2, 1.0);
          result.strategy = 'hybrid';
        }
      }

      return merged.slice(0, maxResults);
    } catch (error) {
      logger.debug('Hybrid retrieval failed', { error });
      return [];
    }
  }

  // ===========================================
  // Result Processing
  // ===========================================

  /**
   * Merge and deduplicate results
   */
  private mergeResults(
    existing: RetrievalResult[],
    newResults: RetrievalResult[]
  ): RetrievalResult[] {
    const merged = new Map<string, RetrievalResult>();

    // Add existing results
    for (const result of existing) {
      merged.set(result.id, result);
    }

    // Add or update with new results (keep higher score)
    for (const result of newResults) {
      const current = merged.get(result.id);
      if (!current || result.score > current.score) {
        merged.set(result.id, result);
      }
    }

    // Sort by score and return
    return Array.from(merged.values()).sort((a, b) => b.score - a.score);
  }

  // ===========================================
  // Self-Reflection (Evaluation)
  // ===========================================

  /**
   * Evaluate if results answer the query
   */
  private async evaluateResults(
    query: string,
    results: RetrievalResult[]
  ): Promise<EvaluationResult> {
    if (results.length === 0) {
      return {
        confidence: 0,
        answersQuery: false,
        missingAspects: ['Keine Ergebnisse gefunden'],
        feedback: 'Die Suche hat keine Ergebnisse geliefert.',
      };
    }

    // Calculate base confidence from result scores
    const avgScore = results.reduce((sum, r) => sum + r.score, 0) / results.length;
    const topScore = results[0]?.score || 0;

    // Simple heuristic evaluation
    const baseConfidence = (avgScore * 0.4 + topScore * 0.6);

    // If results look good, return early
    if (baseConfidence > 0.8 && results.length >= 3) {
      return {
        confidence: baseConfidence,
        answersQuery: true,
        missingAspects: [],
        feedback: 'Gute Ergebnisse mit hoher Relevanz gefunden.',
      };
    }

    // Use Claude for deeper evaluation on uncertain cases
    try {
      const prompt = `Bewerte ob diese Ergebnisse die Query beantworten:

Query: "${query}"

Ergebnisse (Top 5):
${results.slice(0, 5).map((r, i) => `${i + 1}. ${r.title}: ${r.summary || 'Keine Zusammenfassung'}`).join('\n')}

Antworte als JSON:
{
  "confidence": 0.0-1.0,
  "answersQuery": true/false,
  "missingAspects": ["fehlender Aspekt 1"],
  "feedback": "Kurze Erklärung"
}`;

      const evaluation = await queryClaudeJSON<EvaluationResult>(
        EVALUATION_SYSTEM_PROMPT,
        prompt
      );

      return {
        confidence: evaluation.confidence ?? baseConfidence,
        answersQuery: evaluation.answersQuery ?? baseConfidence > 0.6,
        missingAspects: evaluation.missingAspects ?? [],
        feedback: evaluation.feedback ?? '',
      };
    } catch (error) {
      logger.debug('Claude evaluation failed, using heuristic', { error });

      return {
        confidence: baseConfidence,
        answersQuery: baseConfidence > 0.6,
        missingAspects: baseConfidence < 0.5 ? ['Möglicherweise unvollständige Ergebnisse'] : [],
        feedback: `Heuristische Bewertung: ${Math.round(baseConfidence * 100)}% Konfidenz`,
      };
    }
  }

  // ===========================================
  // Query Reformulation
  // ===========================================

  /**
   * Reformulate query based on evaluation feedback
   */
  private async reformulateQuery(
    originalQuery: string,
    currentQuery: string,
    results: RetrievalResult[],
    evaluation: EvaluationResult
  ): Promise<string> {
    // Simple reformulation strategies
    if (evaluation.missingAspects.length > 0) {
      // Add missing aspects to query
      const additions = evaluation.missingAspects.slice(0, 2).join(' ');
      return `${currentQuery} ${additions}`;
    }

    // If we have results but low confidence, try synonyms/related terms
    if (results.length > 0 && evaluation.confidence < 0.5) {
      // Extract keywords from top results to expand query
      const topKeywords = results
        .slice(0, 3)
        .flatMap(r => (r.title + ' ' + r.summary).split(/\s+/))
        .filter(w => w.length > 4)
        .slice(0, 3);

      if (topKeywords.length > 0) {
        return `${originalQuery} ${topKeywords.join(' ')}`;
      }
    }

    // Default: return original query
    return originalQuery;
  }

  // ===========================================
  // Convenience Methods
  // ===========================================

  /**
   * Simple retrieval with a single strategy
   */
  async simpleRetrieve(
    query: string,
    context: AIContext,
    strategy: RetrievalStrategy = 'semantic',
    maxResults: number = 10
  ): Promise<RetrievalResult[]> {
    return await this.executeStrategy(strategy, query, context, maxResults);
  }

  /**
   * Get available strategies
   */
  getAvailableStrategies(): RetrievalStrategy[] {
    return ['semantic', 'keyword', 'graph', 'temporal', 'hybrid'];
  }
}

// ===========================================
// Singleton Export
// ===========================================

export const agenticRAG = new AgenticRAGService();
