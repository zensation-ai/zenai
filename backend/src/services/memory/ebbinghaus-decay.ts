/**
 * Phase 72: Ebbinghaus Forgetting Curve + SM-2 Spaced Repetition
 *
 * DEPRECATED (Phase 125): Core functions now delegate to fsrs-scheduler.ts.
 * calculateRetention() and updateStability() forward to FSRS-variant algorithm.
 * This file is retained for backward compatibility and will be removed in Phase 126.
 *
 * Original implementation based on:
 * - Ebbinghaus (1885): R = e^(-t/S) exponential forgetting curve
 * - SM-2 Algorithm (Wozniak, 1990): stability update on retrieval
 */

import { logger } from '../../utils/logger';
import {
  getRetentionProbabilityCompat,
  updateStabilityCompat,
} from './fsrs-scheduler';

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

  // Phase 125: Delegate to FSRS for retention calculation
  const retention = getRetentionProbabilityCompat(lastAccess, stability, emotionalMultiplier);

  // Apply emotional multiplier to stability for metadata
  const effectiveStability = Math.max(
    CONFIG.MIN_STABILITY,
    stability * Math.min(emotionalMultiplier, CONFIG.MAX_EMOTIONAL_MULTIPLIER)
  );

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
  // Phase 125: Delegate to FSRS scheduler
  const fsrsResult = updateStabilityCompat(currentStability, retrievalSuccess);

  // Clamp to original range for backward compatibility
  const clamped = Math.max(CONFIG.MIN_STABILITY, Math.min(CONFIG.MAX_STABILITY, fsrsResult));

  logger.debug('Stability updated (FSRS)', {
    previousStability: currentStability,
    newStability: clamped,
    retrievalSuccess,
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

// ===========================================
// Phase 112: User-Specific Decay Curves
// ===========================================

/**
 * A user's personalized decay profile, learned from their access patterns.
 *
 * Inspired by individual differences in memory retention (Rubin & Wenzel, 1996):
 * some users naturally retain information longer than others.
 */
export interface UserDecayProfile {
  /** The user this profile belongs to */
  userId: string;
  /** Average interval between accesses (in days) */
  avgAccessInterval: number;
  /** Fraction of reviews where the fact was successfully recalled (0-1) */
  retentionAtReview: number;
  /** Personalized multiplier applied to stability (0.5-3.0) */
  personalStabilityMultiplier: number;
}

/**
 * A single access event in a user's history.
 */
export interface AccessEvent {
  /** When the access occurred */
  accessedAt: Date;
  /** Whether the user successfully recalled the information */
  wasRecalled: boolean;
}

/**
 * Learn a user's personalized decay profile from their access history.
 *
 * Analyzes access intervals and recall success rates to compute a
 * personalized stability multiplier that adjusts the Ebbinghaus curve
 * to match the individual's retention characteristics.
 *
 * @param accessHistory - Chronologically ordered access events
 * @returns A UserDecayProfile, or null if insufficient data
 */
export function learnDecayProfile(accessHistory: AccessEvent[]): UserDecayProfile | null {
  if (accessHistory.length < 2) {
    return null;
  }

  // Sort by time (oldest first)
  const sorted = [...accessHistory].sort(
    (a, b) => a.accessedAt.getTime() - b.accessedAt.getTime()
  );

  // Compute average access interval
  let totalInterval = 0;
  let intervalCount = 0;
  for (let i = 1; i < sorted.length; i++) {
    const intervalDays = (sorted[i].accessedAt.getTime() - sorted[i - 1].accessedAt.getTime())
      / (1000 * 60 * 60 * 24);
    if (intervalDays > 0) {
      totalInterval += intervalDays;
      intervalCount++;
    }
  }

  const avgAccessInterval = intervalCount > 0 ? totalInterval / intervalCount : 1.0;

  // Compute recall success rate
  const recalledCount = sorted.filter(e => e.wasRecalled).length;
  const retentionAtReview = recalledCount / sorted.length;

  // Compute personalized stability multiplier
  // High recall rate + long intervals = strong memory → higher multiplier
  // Low recall rate + short intervals = weak memory → lower multiplier
  let multiplier = 1.0;

  // Factor 1: Recall success rate (0-1 → 0.6-1.8)
  multiplier *= 0.6 + retentionAtReview * 1.2;

  // Factor 2: Access interval length (longer intervals with good recall = stronger memory)
  // Normalize around 7 days as "typical"
  if (retentionAtReview > 0.5) {
    const intervalFactor = Math.min(avgAccessInterval / 7.0, 2.0);
    multiplier *= 0.8 + intervalFactor * 0.2;
  }

  // Clamp to valid range
  const personalStabilityMultiplier = Math.max(0.5, Math.min(3.0, multiplier));

  return {
    userId: '', // To be filled by caller
    avgAccessInterval,
    retentionAtReview,
    personalStabilityMultiplier: Math.round(personalStabilityMultiplier * 1000) / 1000,
  };
}

/**
 * Calculate retention using a user's personalized decay profile.
 *
 * Same Ebbinghaus formula R = e^(-t/S), but with the user's personal
 * stability multiplier applied. Falls back to default behavior if no profile.
 *
 * @param lastAccess - When the fact was last accessed
 * @param stability - Base stability value (in days)
 * @param profile - Optional user decay profile (null = use defaults)
 * @returns RetentionResult with personalized decay
 */
export function calculatePersonalizedRetention(
  lastAccess: Date,
  stability: number,
  profile: UserDecayProfile | null
): RetentionResult {
  if (!profile) {
    // No profile: fall back to standard calculation
    return calculateRetention(lastAccess, stability);
  }

  const now = new Date();
  const daysSinceAccess = Math.max(0, (now.getTime() - lastAccess.getTime()) / (1000 * 60 * 60 * 24));

  // Apply personalized multiplier to stability
  const effectiveStability = Math.max(
    CONFIG.MIN_STABILITY,
    Math.min(CONFIG.MAX_STABILITY, stability * profile.personalStabilityMultiplier)
  );

  // Ebbinghaus formula with personalized stability
  const retention = Math.exp(-daysSinceAccess / effectiveStability);

  return {
    retention: Math.max(0, Math.min(1, retention)),
    daysSinceAccess,
    stability: effectiveStability,
    needsReview: retention <= CONFIG.REVIEW_THRESHOLD && retention > CONFIG.ARCHIVE_THRESHOLD,
    shouldArchive: retention <= CONFIG.ARCHIVE_THRESHOLD,
  };
}

// Export config for testing
export const EBBINGHAUS_CONFIG = CONFIG;
