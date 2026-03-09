/**
 * AI Usage Tracker Service (Phase 50)
 *
 * Tracks AI API usage including tokens, costs, and response times.
 * Data stored in public.ai_usage_log (cross-context).
 *
 * Features:
 * - Fire-and-forget recording (non-blocking)
 * - Aggregated statistics by model, feature, and date
 * - Cost calculation with per-model pricing
 * - Daily usage breakdown
 */

import { queryPublic } from '../utils/database-context';
import { logger } from '../utils/logger';

// ===========================================
// Types & Interfaces
// ===========================================

export type AIFeature = 'chat' | 'rag' | 'vision' | 'code_execution' | 'agent' | 'other';

export interface AIUsageEntry {
  model: string;
  inputTokens: number;
  outputTokens: number;
  thinkingTokens: number;
  costUsd: number;
  feature: AIFeature;
  context: string;
  responseTimeMs: number;
}

export interface AIUsageStats {
  totalTokens: number;
  totalCost: number;
  byModel: Record<string, { tokens: number; cost: number; count: number }>;
  byFeature: Record<string, { tokens: number; cost: number; count: number }>;
  dailyUsage: Array<{ date: string; tokens: number; cost: number }>;
}

export interface DailyUsage {
  date: string;
  tokens: number;
  cost: number;
  inputTokens: number;
  outputTokens: number;
  thinkingTokens: number;
  requestCount: number;
}

// ===========================================
// Cost Calculation
// ===========================================

/**
 * Simplified pricing per 1M tokens (USD).
 * Based on Anthropic published pricing as of 2026.
 */
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'claude-sonnet-4-20250514': { input: 3, output: 15 },
  'claude-opus-4-20250514': { input: 15, output: 75 },
  'claude-haiku-3-20250307': { input: 0.25, output: 1.25 },
};

/** Fallback pricing for unknown models */
const DEFAULT_PRICING = { input: 3, output: 15 };

/**
 * Calculate cost for a given usage entry.
 * Thinking tokens are billed at the output rate.
 */
export function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  thinkingTokens: number = 0
): number {
  const pricing = MODEL_PRICING[model] || DEFAULT_PRICING;
  const inputCost = (inputTokens / 1_000_000) * pricing.input;
  const outputCost = ((outputTokens + thinkingTokens) / 1_000_000) * pricing.output;
  return Math.round((inputCost + outputCost) * 1_000_000) / 1_000_000; // 6 decimal precision
}

// ===========================================
// Recording
// ===========================================

/**
 * Record an AI usage entry (fire-and-forget).
 * Does not block the caller; errors are logged but not thrown.
 */
export function recordUsage(entry: AIUsageEntry): void {
  const cost = entry.costUsd > 0
    ? entry.costUsd
    : calculateCost(entry.model, entry.inputTokens, entry.outputTokens, entry.thinkingTokens);

  // Fire-and-forget insert
  queryPublic(
    `INSERT INTO ai_usage_log (model, input_tokens, output_tokens, thinking_tokens, cost_usd, feature, context, response_time_ms)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      entry.model,
      entry.inputTokens,
      entry.outputTokens,
      entry.thinkingTokens,
      cost,
      entry.feature,
      entry.context,
      entry.responseTimeMs,
    ]
  ).catch((error) => {
    logger.warn('Failed to record AI usage (non-blocking)', {
      error: error instanceof Error ? error.message : String(error),
      model: entry.model,
      feature: entry.feature,
      operation: 'recordUsage',
    });
  });
}

// ===========================================
// Statistics
// ===========================================

/**
 * Get aggregated usage statistics for a date range.
 * @param from - ISO date string (inclusive)
 * @param to - ISO date string (inclusive)
 */
export async function getUsageStats(from: string, to: string): Promise<AIUsageStats> {
  // Run all three queries in parallel
  const [totalsResult, byModelResult, byFeatureResult, dailyResult] = await Promise.all([
    // Total aggregation
    queryPublic(
      `SELECT
        COALESCE(SUM(input_tokens + output_tokens + thinking_tokens), 0)::bigint AS total_tokens,
        COALESCE(SUM(cost_usd), 0)::real AS total_cost
       FROM ai_usage_log
       WHERE created_at >= $1::date AND created_at < ($2::date + interval '1 day')`,
      [from, to]
    ),
    // By model
    queryPublic(
      `SELECT
        model,
        SUM(input_tokens + output_tokens + thinking_tokens)::bigint AS tokens,
        SUM(cost_usd)::real AS cost,
        COUNT(*)::integer AS count
       FROM ai_usage_log
       WHERE created_at >= $1::date AND created_at < ($2::date + interval '1 day')
       GROUP BY model
       ORDER BY cost DESC`,
      [from, to]
    ),
    // By feature
    queryPublic(
      `SELECT
        feature,
        SUM(input_tokens + output_tokens + thinking_tokens)::bigint AS tokens,
        SUM(cost_usd)::real AS cost,
        COUNT(*)::integer AS count
       FROM ai_usage_log
       WHERE created_at >= $1::date AND created_at < ($2::date + interval '1 day')
       GROUP BY feature
       ORDER BY cost DESC`,
      [from, to]
    ),
    // Daily breakdown
    queryPublic(
      `SELECT
        created_at::date AS date,
        SUM(input_tokens + output_tokens + thinking_tokens)::bigint AS tokens,
        SUM(cost_usd)::real AS cost
       FROM ai_usage_log
       WHERE created_at >= $1::date AND created_at < ($2::date + interval '1 day')
       GROUP BY created_at::date
       ORDER BY date ASC`,
      [from, to]
    ),
  ]);

  // Build byModel map
  const byModel: Record<string, { tokens: number; cost: number; count: number }> = {};
  for (const row of byModelResult.rows) {
    byModel[row.model] = {
      tokens: Number(row.tokens),
      cost: Number(row.cost),
      count: Number(row.count),
    };
  }

  // Build byFeature map
  const byFeature: Record<string, { tokens: number; cost: number; count: number }> = {};
  for (const row of byFeatureResult.rows) {
    byFeature[row.feature] = {
      tokens: Number(row.tokens),
      cost: Number(row.cost),
      count: Number(row.count),
    };
  }

  // Build dailyUsage array
  const dailyUsage = dailyResult.rows.map((row: { date: string; tokens: string; cost: string }) => ({
    date: typeof row.date === 'string' ? row.date : new Date(row.date).toISOString().split('T')[0],
    tokens: Number(row.tokens),
    cost: Number(row.cost),
  }));

  const totals = totalsResult.rows[0] || { total_tokens: 0, total_cost: 0 };

  return {
    totalTokens: Number(totals.total_tokens),
    totalCost: Number(totals.total_cost),
    byModel,
    byFeature,
    dailyUsage,
  };
}

/**
 * Get daily usage breakdown for a date range.
 */
export async function getDailyUsage(from: string, to: string): Promise<DailyUsage[]> {
  const result = await queryPublic(
    `SELECT
      created_at::date AS date,
      SUM(input_tokens + output_tokens + thinking_tokens)::bigint AS tokens,
      SUM(cost_usd)::real AS cost,
      SUM(input_tokens)::bigint AS input_tokens,
      SUM(output_tokens)::bigint AS output_tokens,
      SUM(thinking_tokens)::bigint AS thinking_tokens,
      COUNT(*)::integer AS request_count
     FROM ai_usage_log
     WHERE created_at >= $1::date AND created_at < ($2::date + interval '1 day')
     GROUP BY created_at::date
     ORDER BY date ASC`,
    [from, to]
  );

  return result.rows.map((row: Record<string, unknown>) => ({
    date: typeof row.date === 'string' ? row.date : new Date(row.date as string).toISOString().split('T')[0],
    tokens: Number(row.tokens),
    cost: Number(row.cost),
    inputTokens: Number(row.input_tokens),
    outputTokens: Number(row.output_tokens),
    thinkingTokens: Number(row.thinking_tokens),
    requestCount: Number(row.request_count),
  }));
}
