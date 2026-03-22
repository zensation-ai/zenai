/**
 * Phase 136: Capability Model
 *
 * Tracks what the system is good at and where it struggles.
 * Builds a per-domain profile of query success rates, confidence,
 * and fact coverage. Used to decide when to warn users about
 * uncertainty and to guide self-improvement.
 */

import { logger } from '../../utils/logger';
import { queryContext } from '../../utils/database-context';
import type { AIContext } from '../../types/context';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DomainCapability {
  domain: string;
  factCount: number;
  avgConfidence: number;
  querySuccessRate: number;
  totalQueries: number;
  positiveQueries: number;
}

export interface CapabilityProfile {
  domains: Record<string, DomainCapability>;
  avgResponseQuality: number;
  totalInteractions: number;
  improvementTrend: number;
  strengths: string[];
  weaknesses: string[];
}

// ---------------------------------------------------------------------------
// computeDomainCapability
// ---------------------------------------------------------------------------

export function computeDomainCapability(
  domain: string,
  stats: {
    factCount: number;
    totalQueries: number;
    positiveQueries: number;
    avgConfidence: number;
  },
): DomainCapability {
  const querySuccessRate =
    stats.totalQueries > 0 ? stats.positiveQueries / stats.totalQueries : 0;

  return {
    domain,
    factCount: stats.factCount,
    avgConfidence: stats.avgConfidence,
    querySuccessRate,
    totalQueries: stats.totalQueries,
    positiveQueries: stats.positiveQueries,
  };
}

// ---------------------------------------------------------------------------
// identifyStrengths
// ---------------------------------------------------------------------------

export function identifyStrengths(
  domains: Record<string, DomainCapability>,
  threshold: number = 0.7,
): string[] {
  return Object.values(domains)
    .filter((d) => d.querySuccessRate > threshold)
    .map((d) => d.domain);
}

// ---------------------------------------------------------------------------
// identifyWeaknesses
// ---------------------------------------------------------------------------

export function identifyWeaknesses(
  domains: Record<string, DomainCapability>,
  threshold: number = 0.4,
): string[] {
  return Object.values(domains)
    .filter((d) => d.querySuccessRate < threshold)
    .map((d) => d.domain);
}

// ---------------------------------------------------------------------------
// computeImprovementTrend
// ---------------------------------------------------------------------------

export function computeImprovementTrend(
  recentScores: number[],
  olderScores: number[],
): number {
  if (recentScores.length === 0 || olderScores.length === 0) {return 0;}

  const avgRecent =
    recentScores.reduce((sum, s) => sum + s, 0) / recentScores.length;
  const avgOlder =
    olderScores.reduce((sum, s) => sum + s, 0) / olderScores.length;

  const diff = avgRecent - avgOlder;
  return Math.max(-1, Math.min(1, diff));
}

// ---------------------------------------------------------------------------
// buildCapabilityProfile
// ---------------------------------------------------------------------------

export function buildCapabilityProfile(
  domains: Record<string, DomainCapability>,
  totalInteractions: number,
  recentScores: number[],
  olderScores: number[],
): CapabilityProfile {
  const allScores = [...recentScores, ...olderScores];
  const avgResponseQuality =
    allScores.length > 0
      ? allScores.reduce((sum, s) => sum + s, 0) / allScores.length
      : 0;

  return {
    domains,
    avgResponseQuality: Math.max(0, Math.min(5, avgResponseQuality)),
    totalInteractions,
    improvementTrend: computeImprovementTrend(recentScores, olderScores),
    strengths: identifyStrengths(domains),
    weaknesses: identifyWeaknesses(domains),
  };
}

// ---------------------------------------------------------------------------
// recordInteraction
// ---------------------------------------------------------------------------

export async function recordInteraction(
  context: string,
  domain: string,
  wasPositive: boolean,
  quality?: number,
): Promise<void> {
  try {
    await queryContext(
      context as AIContext,
      `INSERT INTO capability_interactions (domain, was_positive, quality, created_at)
       VALUES ($1, $2, $3, NOW())`,
      [domain, wasPositive, quality ?? null],
    );
  } catch (err) {
    logger.error('Failed to record capability interaction', err instanceof Error ? err : new Error(String(err)), { domain });
  }
}

// ---------------------------------------------------------------------------
// loadCapabilityProfile
// ---------------------------------------------------------------------------

const DEFAULT_PROFILE: CapabilityProfile = {
  domains: {},
  avgResponseQuality: 0,
  totalInteractions: 0,
  improvementTrend: 0,
  strengths: [],
  weaknesses: [],
};

export async function loadCapabilityProfile(
  context: string,
  _userId?: string,
): Promise<CapabilityProfile> {
  try {
    // 1. Domain stats
    const domainResult = await queryContext(
      context as AIContext,
      `SELECT
         domain,
         COUNT(*) FILTER (WHERE was_positive) AS positive_queries,
         COUNT(*) AS total_queries,
         COALESCE(AVG(quality), 0) AS avg_confidence,
         COUNT(DISTINCT domain) AS fact_count
       FROM capability_interactions
       GROUP BY domain`,
      [],
    );

    const domains: Record<string, DomainCapability> = {};
    for (const row of domainResult.rows) {
      const domain = row.domain as string;
      domains[domain] = computeDomainCapability(domain, {
        factCount: parseInt(row.fact_count as string, 10) || 0,
        totalQueries: parseInt(row.total_queries as string, 10) || 0,
        positiveQueries: parseInt(row.positive_queries as string, 10) || 0,
        avgConfidence: parseFloat(row.avg_confidence as string) || 0,
      });
    }

    // 2. Total interactions
    const totalResult = await queryContext(
      context as AIContext,
      `SELECT COUNT(*) AS total FROM capability_interactions`,
      [],
    );
    const totalInteractions =
      parseInt(totalResult.rows[0]?.total as string, 10) || 0;

    // 3. Recent quality scores (last 7 days)
    const recentResult = await queryContext(
      context as AIContext,
      `SELECT quality FROM capability_interactions
       WHERE quality IS NOT NULL AND created_at > NOW() - INTERVAL '7 days'
       ORDER BY created_at DESC LIMIT 50`,
      [],
    );
    const recentScores = recentResult.rows.map((r) =>
      parseFloat(r.quality as string),
    );

    // 4. Older quality scores (8-30 days ago)
    const olderResult = await queryContext(
      context as AIContext,
      `SELECT quality FROM capability_interactions
       WHERE quality IS NOT NULL
         AND created_at > NOW() - INTERVAL '30 days'
         AND created_at <= NOW() - INTERVAL '7 days'
       ORDER BY created_at DESC LIMIT 50`,
      [],
    );
    const olderScores = olderResult.rows.map((r) =>
      parseFloat(r.quality as string),
    );

    return buildCapabilityProfile(
      domains,
      totalInteractions,
      recentScores,
      olderScores,
    );
  } catch (err) {
    logger.error('Failed to load capability profile', err instanceof Error ? err : new Error(String(err)));
    return { ...DEFAULT_PROFILE };
  }
}

// ---------------------------------------------------------------------------
// evaluateResponse
// ---------------------------------------------------------------------------

export async function evaluateResponse(
  context: string,
  params: {
    domain: string;
    confidence: number;
    hadConflicts: boolean;
    coverageRatio: number;
  },
): Promise<{ shouldWarn: boolean; message?: string }> {
  // Low coverage always triggers a warning
  if (params.coverageRatio < 0.5) {
    return {
      shouldWarn: true,
      message: `Low knowledge coverage (${(params.coverageRatio * 100).toFixed(0)}%) — response may be incomplete.`,
    };
  }

  // Check if the domain is a known weakness
  const profile = await loadCapabilityProfile(context);
  const isWeakDomain = profile.weaknesses.includes(params.domain);

  if (isWeakDomain && params.confidence < 0.5) {
    return {
      shouldWarn: true,
      message: `Domain "${params.domain}" has low historical accuracy and current confidence is low.`,
    };
  }

  return { shouldWarn: false };
}
