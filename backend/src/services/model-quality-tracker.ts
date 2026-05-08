/**
 * Model Quality Tracker
 *
 * Tracks quality metrics per (model, taskType) pair to inform routing decisions.
 * Stores data in-memory with periodic persistence to database.
 *
 * Routing score formula (weighted composite):
 * - Quality: 50% (avg response quality 0-1)
 * - Cost: 20% (lower cost = higher score)
 * - Latency: 15% (sub-10s = good)
 * - Reliability: 15% (1 - error rate)
 *
 * @module services/model-quality-tracker
 */

import { logger } from '../utils/logger';

// ===========================================
// Types
// ===========================================

interface QualityMetric {
  totalRequests: number;
  totalQuality: number;
  totalLatencyMs: number;
  errorCount: number;
  lastUpdated: number;
}

// ===========================================
// In-Memory Store
// ===========================================

const metrics: Map<string, QualityMetric> = new Map();

function getKey(modelId: string, taskType: string): string {
  return `${modelId}:${taskType}`;
}

// ===========================================
// Recording
// ===========================================

/**
 * Record a model's performance for a specific task
 */
export function recordModelPerformance(
  modelId: string,
  taskType: string,
  quality: number, // 0-1
  latencyMs: number,
  success: boolean
): void {
  const key = getKey(modelId, taskType);
  const current = metrics.get(key) || {
    totalRequests: 0,
    totalQuality: 0,
    totalLatencyMs: 0,
    errorCount: 0,
    lastUpdated: 0,
  };

  current.totalRequests += 1;
  current.totalQuality += quality;
  current.totalLatencyMs += latencyMs;
  if (!success) current.errorCount += 1;
  current.lastUpdated = Date.now();

  metrics.set(key, current);

  logger.debug('Model performance recorded', {
    modelId,
    taskType,
    quality,
    latencyMs,
    success,
  });
}

// ===========================================
// Querying
// ===========================================

/**
 * Get averaged quality metrics for a model + task type
 */
export function getModelScore(modelId: string, taskType: string): {
  avgQuality: number;
  avgLatencyMs: number;
  errorRate: number;
  sampleSize: number;
} | null {
  const key = getKey(modelId, taskType);
  const metric = metrics.get(key);
  if (!metric || metric.totalRequests === 0) return null;

  return {
    avgQuality: metric.totalQuality / metric.totalRequests,
    avgLatencyMs: metric.totalLatencyMs / metric.totalRequests,
    errorRate: metric.errorCount / metric.totalRequests,
    sampleSize: metric.totalRequests,
  };
}

/**
 * Compute a composite routing score for model selection
 * Returns 0.5 (neutral) for untested models with <3 samples
 */
export function computeRoutingScore(
  modelId: string,
  taskType: string,
  costPer1K: number,
  maxCostPer1K: number
): number {
  const score = getModelScore(modelId, taskType);
  if (!score || score.sampleSize < 3) return 0.5; // neutral score for untested models

  const qualityScore = score.avgQuality; // 0-1
  const costScore = 1 - (costPer1K / maxCostPer1K); // 0-1, lower cost = higher
  const latencyScore = Math.max(0, 1 - score.avgLatencyMs / 10000); // 0-1, <10s = good
  const reliabilityScore = 1 - score.errorRate;

  return qualityScore * 0.5 + costScore * 0.2 + latencyScore * 0.15 + reliabilityScore * 0.15;
}

// ===========================================
// Bulk Operations
// ===========================================

/**
 * Get all tracked metrics across all models and task types
 */
export function getAllMetrics(): Array<{
  modelId: string;
  taskType: string;
  avgQuality: number;
  avgLatencyMs: number;
  errorRate: number;
  sampleSize: number;
}> {
  const result: Array<{
    modelId: string;
    taskType: string;
    avgQuality: number;
    avgLatencyMs: number;
    errorRate: number;
    sampleSize: number;
  }> = [];

  for (const [key, metric] of metrics.entries()) {
    const separatorIndex = key.indexOf(':');
    const modelId = key.substring(0, separatorIndex);
    const taskType = key.substring(separatorIndex + 1);
    if (metric.totalRequests > 0) {
      result.push({
        modelId,
        taskType,
        avgQuality: metric.totalQuality / metric.totalRequests,
        avgLatencyMs: metric.totalLatencyMs / metric.totalRequests,
        errorRate: metric.errorCount / metric.totalRequests,
        sampleSize: metric.totalRequests,
      });
    }
  }
  return result;
}

/**
 * Reset all tracked metrics (for testing)
 */
export function resetMetrics(): void {
  metrics.clear();
}
