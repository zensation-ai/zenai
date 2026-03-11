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
  // Query analytics summary
  const summaryResult = await queryContext(
    context,
    `SELECT
       COUNT(*) as total_queries,
       AVG(confidence) as avg_confidence,
       AVG(response_time_ms) as avg_response_time
     FROM rag_query_analytics
     WHERE created_at > NOW() - INTERVAL '1 day' * $1`,
    [days]
  );

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
