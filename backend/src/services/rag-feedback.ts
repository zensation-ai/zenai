/**
 * Phase 47: RAG Feedback & Analytics Service
 *
 * Tracks RAG retrieval quality, collects user feedback, and provides
 * analytics for strategy optimization.
 */

import { AIContext, queryContext } from '../utils/database-context';
import { logger } from '../utils/logger';

// ===========================================
// Types
// ===========================================

export interface RAGFeedbackInput {
  queryId?: string;
  queryText: string;
  sessionId?: string;
  resultId?: string;
  wasHelpful: boolean;
  relevanceRating?: number;
  feedbackText?: string;
  strategiesUsed?: string[];
  confidence?: number;
  responseTimeMs?: number;
}

export interface RAGQueryAnalyticsInput {
  queryText: string;
  queryType?: string;
  strategiesUsed: string[];
  strategySelected?: string;
  resultCount: number;
  topScore?: number;
  avgScore?: number;
  confidence?: number;
  responseTimeMs?: number;
  hydeUsed?: boolean;
  crossEncoderUsed?: boolean;
  reformulationCount?: number;
}

// ===========================================
// Feedback Recording
// ===========================================

/**
 * Record user feedback on RAG retrieval quality
 */
export async function recordRAGFeedback(
  context: AIContext,
  input: RAGFeedbackInput
): Promise<string> {
  try {
    const result = await queryContext(
      context,
      `INSERT INTO rag_feedback (
        query_id, query_text, session_id, result_id,
        was_helpful, relevance_rating, feedback_text,
        strategies_used, confidence, response_time_ms
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id`,
      [
        input.queryId || null,
        input.queryText,
        input.sessionId || null,
        input.resultId || null,
        input.wasHelpful,
        input.relevanceRating || null,
        input.feedbackText || null,
        input.strategiesUsed || [],
        input.confidence || null,
        input.responseTimeMs || null,
      ]
    );

    const id = result.rows[0]?.id;
    logger.debug('RAG feedback recorded', { id, wasHelpful: input.wasHelpful });
    return id;
  } catch (error) {
    logger.error('Failed to record RAG feedback', error instanceof Error ? error : undefined);
    throw error;
  }
}

/**
 * Record RAG query analytics (called automatically during retrieval)
 */
export async function recordRAGQueryAnalytics(
  context: AIContext,
  input: RAGQueryAnalyticsInput
): Promise<void> {
  try {
    await queryContext(
      context,
      `INSERT INTO rag_query_analytics (
        query_text, query_type, strategies_used, strategy_selected,
        result_count, top_score, avg_score, confidence,
        response_time_ms, hyde_used, cross_encoder_used, reformulation_count
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        input.queryText.substring(0, 2000),
        input.queryType || null,
        input.strategiesUsed,
        input.strategySelected || null,
        input.resultCount,
        input.topScore || null,
        input.avgScore || null,
        input.confidence || null,
        input.responseTimeMs || null,
        input.hydeUsed || false,
        input.crossEncoderUsed || false,
        input.reformulationCount || 0,
      ]
    );
  } catch (error) {
    logger.debug('Failed to record RAG analytics (non-critical)', {
      error: error instanceof Error ? error.message : 'Unknown',
    });
  }
}

// ===========================================
// Analytics Queries
// ===========================================

/**
 * Get comprehensive RAG analytics
 */
export async function getRAGAnalytics(
  context: AIContext,
  days: number = 30
): Promise<{
  totalQueries: number;
  avgConfidence: number;
  avgResponseTime: number;
  feedbackStats: { total: number; helpful: number; helpfulRate: number; avgRating: number };
  strategyUsage: Record<string, number>;
  dailyTrend: Array<{ date: string; queries: number; avgConfidence: number }>;
}> {
  // Graceful fallback when rag_query_analytics table doesn't exist yet
  let summaryResult: { rows: Array<Record<string, string>> };
  try {
    summaryResult = await queryContext(
      context,
      `SELECT
         COUNT(*) as total_queries,
         AVG(confidence) as avg_confidence,
         AVG(response_time_ms) as avg_response_time
       FROM rag_query_analytics
       WHERE created_at > NOW() - INTERVAL '1 day' * $1`,
      [days]
    );
  } catch (err) {
    const pgCode = (err as { code?: string }).code;
    if (pgCode === '42P01') {
      // Table doesn't exist — return empty analytics
      return {
        totalQueries: 0, avgConfidence: 0, avgResponseTime: 0,
        feedbackStats: { total: 0, helpful: 0, helpfulRate: 0, avgRating: 0 },
        strategyUsage: {}, dailyTrend: [],
      };
    }
    throw err;
  }

  // Feedback stats
  const feedbackResult = await queryContext(
    context,
    `SELECT
       COUNT(*) as total,
       COUNT(*) FILTER (WHERE was_helpful = true) as helpful,
       AVG(relevance_rating) FILTER (WHERE relevance_rating IS NOT NULL) as avg_rating
     FROM rag_feedback
     WHERE created_at > NOW() - INTERVAL '1 day' * $1`,
    [days]
  );

  // Strategy usage
  const strategyResult = await queryContext(
    context,
    `SELECT strategy_selected, COUNT(*) as count
     FROM rag_query_analytics
     WHERE created_at > NOW() - INTERVAL '1 day' * $1
       AND strategy_selected IS NOT NULL
     GROUP BY strategy_selected
     ORDER BY count DESC`,
    [days]
  );

  // Daily trend
  const trendResult = await queryContext(
    context,
    `SELECT
       DATE(created_at) as date,
       COUNT(*) as queries,
       AVG(confidence) as avg_confidence
     FROM rag_query_analytics
     WHERE created_at > NOW() - INTERVAL '1 day' * $1
     GROUP BY DATE(created_at)
     ORDER BY date DESC
     LIMIT 30`,
    [days]
  );

  const summary = summaryResult.rows[0] || {};
  const feedback = feedbackResult.rows[0] || {};
  const totalFeedback = parseInt(feedback.total, 10) || 0;
  const helpfulFeedback = parseInt(feedback.helpful, 10) || 0;

  return {
    totalQueries: parseInt(summary.total_queries, 10) || 0,
    avgConfidence: parseFloat(summary.avg_confidence) || 0,
    avgResponseTime: Math.round(parseFloat(summary.avg_response_time) || 0),
    feedbackStats: {
      total: totalFeedback,
      helpful: helpfulFeedback,
      helpfulRate: totalFeedback > 0 ? helpfulFeedback / totalFeedback : 0,
      avgRating: parseFloat(feedback.avg_rating) || 0,
    },
    strategyUsage: strategyResult.rows.reduce((acc: Record<string, number>, r: { strategy_selected: string; count: string }) => {
      acc[r.strategy_selected] = parseInt(r.count, 10);
      return acc;
    }, {}),
    dailyTrend: trendResult.rows.map((r: { date: string; queries: string; avg_confidence: string }) => ({
      date: r.date,
      queries: parseInt(r.queries, 10),
      avgConfidence: parseFloat(r.avg_confidence) || 0,
    })),
  };
}

/**
 * Get strategy-level performance metrics
 */
export async function getRAGStrategyPerformance(
  context: AIContext,
  days: number = 30
): Promise<Array<{
  strategy: string;
  queryCount: number;
  avgConfidence: number;
  avgResponseTime: number;
  avgResultCount: number;
  hydeRate: number;
  crossEncoderRate: number;
}>> {
  const result = await queryContext(
    context,
    `SELECT
       strategy_selected as strategy,
       COUNT(*) as query_count,
       AVG(confidence) as avg_confidence,
       AVG(response_time_ms) as avg_response_time,
       AVG(result_count) as avg_result_count,
       AVG(CASE WHEN hyde_used THEN 1.0 ELSE 0.0 END) as hyde_rate,
       AVG(CASE WHEN cross_encoder_used THEN 1.0 ELSE 0.0 END) as cross_encoder_rate
     FROM rag_query_analytics
     WHERE created_at > NOW() - INTERVAL '1 day' * $1
       AND strategy_selected IS NOT NULL
     GROUP BY strategy_selected
     ORDER BY query_count DESC`,
    [days]
  );

  return result.rows.map((r: Record<string, string>) => ({
    strategy: r.strategy,
    queryCount: parseInt(r.query_count, 10) || 0,
    avgConfidence: parseFloat(r.avg_confidence) || 0,
    avgResponseTime: Math.round(parseFloat(r.avg_response_time) || 0),
    avgResultCount: parseFloat(r.avg_result_count) || 0,
    hydeRate: parseFloat(r.hyde_rate) || 0,
    crossEncoderRate: parseFloat(r.cross_encoder_rate) || 0,
  }));
}

// ===========================================
// Active Learning: Micro-Questions (Phase 113)
// ===========================================

export interface MicroQuestion {
  question: string;
  reason: string;
  missingTerm: string;
}

export interface MicroQuestionsResult {
  query: string;
  microQuestions: MicroQuestion[];
  coveredTerms: string[];
  missingTerms: string[];
  generatedAt: string;
}

/**
 * Generate micro-questions to fill knowledge gaps in retrieval results.
 *
 * Given a query and retrieved results, this function identifies query terms
 * that were not covered by the results and generates 1-3 short clarifying
 * questions. These questions can be used to guide follow-up retrieval or
 * improve future queries via active learning.
 *
 * This is a heuristic approach (no LLM needed): it analyzes term coverage
 * and generates structured questions based on the missing concepts.
 *
 * @param query - The original user query
 * @param results - Retrieved result items (title + content)
 * @returns Micro-questions targeting knowledge gaps, plus coverage analysis
 */
export function generateMicroQuestions(
  query: string,
  results: Array<{ title?: string; content: string; score?: number }>
): MicroQuestionsResult {
  const generatedAt = new Date().toISOString();

  // Tokenize query into meaningful terms (skip stop words and very short words)
  const STOP_WORDS = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'shall', 'can', 'need', 'dare', 'ought',
    'and', 'or', 'but', 'so', 'yet', 'for', 'nor', 'with', 'at', 'by',
    'from', 'to', 'in', 'on', 'of', 'as', 'into', 'through', 'during',
    'what', 'how', 'why', 'when', 'where', 'who', 'which', 'that', 'this',
    'about', 'like', 'after', 'before', 'over', 'under', 'again', 'then',
    'was', 'tell', 'me', 'show', 'give', 'find', 'get', 'more', 'than',
    'ich', 'die', 'der', 'das', 'und', 'ist', 'ein', 'eine', 'von', 'zu',
    'mit', 'auf', 'für', 'nicht', 'bei', 'nach', 'aus', 'sie', 'er', 'es',
  ]);

  const queryTerms = query
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 3 && !STOP_WORDS.has(t));

  if (queryTerms.length === 0) {
    return {
      query,
      microQuestions: [],
      coveredTerms: [],
      missingTerms: [],
      generatedAt,
    };
  }

  // Build combined content string from results
  const allContent = results
    .map(r => `${r.title || ''} ${r.content}`)
    .join(' ')
    .toLowerCase();

  // Identify covered vs missing terms
  const coveredTerms: string[] = [];
  const missingTerms: string[] = [];

  for (const term of queryTerms) {
    if (allContent.includes(term)) {
      coveredTerms.push(term);
    } else {
      missingTerms.push(term);
    }
  }

  // Generate micro-questions for missing terms (up to 3)
  const microQuestions: MicroQuestion[] = missingTerms.slice(0, 3).map(term => {
    const question = buildMicroQuestion(term, query);
    return {
      question,
      reason: `No results contained the term "${term}"`,
      missingTerm: term,
    };
  });

  logger.debug('Generated micro-questions for knowledge gaps', {
    query,
    totalTerms: queryTerms.length,
    coveredCount: coveredTerms.length,
    missingCount: missingTerms.length,
    microQuestionCount: microQuestions.length,
  });

  return {
    query,
    microQuestions,
    coveredTerms,
    missingTerms,
    generatedAt,
  };
}

/**
 * Build a short clarifying micro-question for a missing term.
 * Uses pattern matching to generate contextually appropriate questions.
 */
function buildMicroQuestion(missingTerm: string, originalQuery: string): string {
  const q = originalQuery.toLowerCase();

  // Detect question type from the original query context
  if (/\b(how|wie)\b/i.test(q)) {
    return `How does "${missingTerm}" work in this context?`;
  }
  if (/\b(why|warum)\b/i.test(q)) {
    return `Why is "${missingTerm}" relevant here?`;
  }
  if (/\b(when|wann)\b/i.test(q)) {
    return `When does "${missingTerm}" apply?`;
  }
  if (/\b(where|wo)\b/i.test(q)) {
    return `Where can "${missingTerm}" be found?`;
  }
  if (/\b(who|wer)\b/i.test(q)) {
    return `Who is involved with "${missingTerm}"?`;
  }
  if (/\b(compare|vergleich|vs|versus|difference|unterschied)\b/i.test(q)) {
    return `How does "${missingTerm}" compare to related concepts?`;
  }
  if (/\b(list|zeige|show|alle|all)\b/i.test(q)) {
    return `What are the key aspects of "${missingTerm}"?`;
  }

  // Default: definition-style question
  return `What is "${missingTerm}" and how does it relate to the query?`;
}

/**
 * Get recent RAG query history
 */
export async function getRAGQueryHistory(
  context: AIContext,
  limit: number = 50
): Promise<Array<{
  id: string;
  queryText: string;
  queryType: string | null;
  strategiesUsed: string[];
  resultCount: number;
  confidence: number | null;
  responseTimeMs: number | null;
  createdAt: string;
}>> {
  const result = await queryContext(
    context,
    `SELECT id, query_text, query_type, strategies_used,
            result_count, confidence, response_time_ms, created_at
     FROM rag_query_analytics
     ORDER BY created_at DESC
     LIMIT $1`,
    [limit]
  );

  return result.rows.map((r: Record<string, unknown>) => ({
    id: r.id as string,
    queryText: (r.query_text as string).substring(0, 200),
    queryType: r.query_type as string | null,
    strategiesUsed: (r.strategies_used as string[]) || [],
    resultCount: parseInt(r.result_count as string, 10) || 0,
    confidence: r.confidence ? parseFloat(r.confidence as string) : null,
    responseTimeMs: r.response_time_ms ? parseInt(r.response_time_ms as string, 10) : null,
    createdAt: r.created_at as string,
  }));
}
