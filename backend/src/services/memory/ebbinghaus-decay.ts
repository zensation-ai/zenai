/**
 * Phase 72: Ebbinghaus Forgetting Curve + SM-2 Spaced Repetition
 *
 * Implements scientifically-accurate memory decay based on:
 * - Ebbinghaus (1885): R = e^(-t/S) exponential forgetting curve
 * - SM-2 Algorithm (Wozniak, 1990): stability update on retrieval
 *
 * Key concepts:
 * - Retention (R): probability of recall at time t since last access
 * - Stability (S): how resistant a memory is to forgetting (in days)
 * - Each successful retrieval increases stability (spacing effect)
 * - Each failed retrieval decreases stability
 *
 * This replaces the linear decay model with a biologically-accurate
 * exponential decay curve.
 */

import { logger } from '../../utils/logger';

// ===========================================
// Types
// ===========================================

export interface RetentionResult {
  /** Current retention probability: 0 (forgotten) to 1 (perfect recall) */
  retention: number;
  /** Days since last access */
  daysSinceAccess: number;
  /** Current stability value in days */
  stability: number;
  /** Whether this fact is a candidate for spaced repetition review */
  needsReview: boolean;
  /** Whether this fact should be archived (retention below threshold) */
  shouldArchive: boolean;
}

export interface RepetitionCandidate {
  /** Fact identifier */
  factId: string;
  /** Content for display */
  content: string;
  /** Current retention probability */
  retention: number;
  /** How urgently this needs review (lower retention = more urgent) */
  urgency: number;
  /** Predicted optimal review time (hours from now) */
  optimalReviewIn: number;
}

// ===========================================
// Configuration
// ===========================================

const CONFIG = {
  /** Default stability for new facts (in days) */
  DEFAULT_STABILITY: 1.0,
  /** Minimum stability (prevents instant forgetting) */
  MIN_STABILITY: 0.1,
  /** Maximum stability (cap for extremely well-known facts) */
  MAX_STABILITY: 365.0,
  /** SM-2 success multiplier: stability *= this on successful retrieval */
  SUCCESS_MULTIPLIER: 2.5,
  /** SM-2 failure multiplier: stability *= this on failed retrieval */
  FAILURE_MULTIPLIER: 0.5,
  /** Retention threshold below which facts need review */
  REVIEW_THRESHOLD: 0.3,
  /** Retention threshold below which facts should be archived */
  ARCHIVE_THRESHOLD: 0.1,
  /** Emotional decay multiplier cap (from emotional-tagger) */
  MAX_EMOTIONAL_MULTIPLIER: 3.0,
};

// ===========================================
// Core Ebbinghaus Functions
// ===========================================

/**
 * Calculate current retention probability using Ebbinghaus forgetting curve.
 *
 * Formula: R = e^(-t/S)
 * Where:
 *   R = retention (probability of recall)
 *   t = time since last access (in days)
 *   S = stability (memory strength, in days)
 *
 * @param lastAccess - When the fact was last accessed/reviewed
 * @param stability - Current stability value (in days). Higher = slower forgetting.
 * @param emotionalMultiplier - Optional multiplier from emotional tagging (1.0-3.0)
 * @returns RetentionResult with current retention and metadata
 */
export function calculateRetention(
  lastAccess: Date,
  stability: number,
  emotionalMultiplier = 1.0
): RetentionResult {
  const now = new Date();
  const daysSinceAccess = Math.max(0, (now.getTime() - lastAccess.getTime()) / (1000 * 60 * 60 * 24));

  // Apply emotional multiplier to stability (emotional memories decay slower)
  const effectiveStability = Math.max(
    CONFIG.MIN_STABILITY,
    stability * Math.min(emotionalMultiplier, CONFIG.MAX_EMOTIONAL_MULTIPLIER)
  );

  // Ebbinghaus formula: R = e^(-t/S)
  const retention = Math.exp(-daysSinceAccess / effectiveStability);

  return {
    retention: Math.max(0, Math.min(1, retention)),
    daysSinceAccess,
    stability: effectiveStability,
    needsReview: retention <= CONFIG.REVIEW_THRESHOLD && retention > CONFIG.ARCHIVE_THRESHOLD,
    shouldArchive: retention <= CONFIG.ARCHIVE_THRESHOLD,
  };
}

/**
 * Update stability after a retrieval attempt using SM-2 algorithm.
 *
 * SM-2 core rule:
 * - Successful retrieval: stability *= 2.5 (memory strengthened)
 * - Failed retrieval: stability *= 0.5 (memory weakened, needs more review)
 *
 * The spacing effect: each successful review at the right time
 * approximately doubles the interval before the next review is needed.
 *
 * @param currentStability - Current stability value in days
 * @param retrievalSuccess - Whether the retrieval was successful
 * @returns Updated stability value
 */
export function updateStability(
  currentStability: number,
  retrievalSuccess: boolean
): number {
  const multiplier = retrievalSuccess
    ? CONFIG.SUCCESS_MULTIPLIER
    : CONFIG.FAILURE_MULTIPLIER;

  const newStability = currentStability * multiplier;

  // Clamp to valid range
  const clamped = Math.max(CONFIG.MIN_STABILITY, Math.min(CONFIG.MAX_STABILITY, newStability));

  logger.debug('Stability updated', {
    previousStability: currentStability,
    newStability: clamped,
    retrievalSuccess,
    multiplier,
  });

  return clamped;
}

/**
 * Get facts that are approaching the review threshold and should be
 * pre-loaded into working memory for spaced repetition.
 *
 * This implements the "desirable difficulty" principle:
 * review just before forgetting for optimal long-term retention.
 *
 * @param facts - Array of facts with lastAccess and stability
 * @param threshold - Retention threshold for review candidates (default: 0.3)
 * @returns Sorted list of facts needing review, most urgent first
 */
export function getRepetitionCandidates(
  facts: Array<{
    id: string;
    content: string;
    lastAccess: Date;
    stability: number;
    emotionalMultiplier?: number;
  }>,
  threshold = CONFIG.REVIEW_THRESHOLD
): RepetitionCandidate[] {
  const candidates: RepetitionCandidate[] = [];

  for (const fact of facts) {
    const result = calculateRetention(
      fact.lastAccess,
      fact.stability,
      fact.emotionalMultiplier
    );

    // Include facts approaching or below the threshold
    // Also include facts slightly above threshold (within 20% buffer) for proactive review
    const bufferThreshold = threshold * 1.2;

    if (result.retention <= bufferThreshold) {
      // Calculate optimal review time: when retention will hit exactly the threshold
      // From R = e^(-t/S): t = -S * ln(R_target)
      const effectiveStability = result.stability;
      const optimalDays = -effectiveStability * Math.log(threshold);
      const daysUntilOptimal = Math.max(0, optimalDays - result.daysSinceAccess);
      const hoursUntilOptimal = daysUntilOptimal * 24;

      candidates.push({
        factId: fact.id,
        content: fact.content,
        retention: result.retention,
        urgency: 1.0 - result.retention, // Higher urgency = lower retention
        optimalReviewIn: Math.max(0, hoursUntilOptimal),
      });
    }
  }

  // Sort by urgency (most urgent first)
  candidates.sort((a, b) => b.urgency - a.urgency);

  return candidates;
}

/**
 * Determine whether a fact should be archived (effectively forgotten).
 *
 * A fact is archived when its retention drops below the archive threshold (0.1),
 * meaning there's less than 10% chance of recall.
 *
 * @param retention - Current retention probability
 * @returns true if the fact should be archived
 */
export function shouldArchive(retention: number): boolean {
  return retention <= CONFIG.ARCHIVE_THRESHOLD;
}

/**
 * Calculate the optimal review interval for a fact.
 *
 * Given a target retention at review time, compute when the next review
 * should happen. This implements the core of spaced repetition scheduling.
 *
 * From R = e^(-t/S): t = -S * ln(R_target)
 *
 * @param stability - Current stability in days
 * @param targetRetention - Desired retention at review time (default: 0.85)
 * @returns Optimal interval in days until next review
 */
export function calculateOptimalInterval(
  stability: number,
  targetRetention = 0.85
): number {
  // t = -S * ln(R)
  const intervalDays = -stability * Math.log(targetRetention);
  return Math.max(0.1, intervalDays); // Minimum 2.4 hours
}

/**
 * Batch calculate retention for multiple facts.
 * More efficient than calling calculateRetention individually.
 */
export function batchCalculateRetention(
  facts: Array<{
    id: string;
    lastAccess: Date;
    stability: number;
    emotionalMultiplier?: number;
  }>
): Map<string, RetentionResult> {
  const results = new Map<string, RetentionResult>();
  const now = Date.now();

  for (const fact of facts) {
    const daysSinceAccess = Math.max(0, (now - fact.lastAccess.getTime()) / (1000 * 60 * 60 * 24));
    const effectiveStability = Math.max(
      CONFIG.MIN_STABILITY,
      fact.stability * Math.min(fact.emotionalMultiplier ?? 1.0, CONFIG.MAX_EMOTIONAL_MULTIPLIER)
    );
    const retention = Math.exp(-daysSinceAccess / effectiveStability);

    results.set(fact.id, {
      retention: Math.max(0, Math.min(1, retention)),
      daysSinceAccess,
      stability: effectiveStability,
      needsReview: retention <= CONFIG.REVIEW_THRESHOLD && retention > CONFIG.ARCHIVE_THRESHOLD,
      shouldArchive: retention <= CONFIG.ARCHIVE_THRESHOLD,
    });
  }

  return results;
}

// Export config for testing
export const EBBINGHAUS_CONFIG = CONFIG;
