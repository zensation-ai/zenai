/**
 * Phase 129: Debate Protocol for Multi-Turn Agent Disagreements
 *
 * When agents disagree about a claim (confidence below threshold), this protocol
 * orchestrates structured rounds of challenge → response → resolution, ending in
 * consensus or user escalation.
 */

import { logger } from '../../utils/logger';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DebateRound {
  roundNumber: number;
  challenger: string;        // Agent role that challenges
  claim: string;             // The disputed claim
  counterArgument: string;   // The challenge
  response: string;          // Defender's response
  resolution: 'accepted' | 'rejected' | 'modified' | 'escalated';
  resolvedClaim?: string;    // Modified claim if resolution='modified'
}

export interface DebateResult {
  rounds: DebateRound[];
  finalClaim: string;
  consensus: boolean;        // Did agents agree?
  escalatedToUser: boolean;
}

export interface DebateConfig {
  maxRounds: number;          // Default: 3
  challengeThreshold: number; // Confidence below this triggers challenge: 0.6
}

export const DEFAULT_DEBATE_CONFIG: DebateConfig = {
  maxRounds: 3,
  challengeThreshold: 0.6,
};

// ─── Pure Functions ────────────────────────────────────────────────────────────

/**
 * Returns true if confidence is strictly below the challenge threshold,
 * meaning the claim should be challenged.
 */
export function shouldChallenge(
  _claim: string,
  confidence: number,
  config: DebateConfig = DEFAULT_DEBATE_CONFIG,
): boolean {
  return confidence < config.challengeThreshold;
}

/**
 * Creates a new DebateRound with the challenger's counter-argument filled in.
 * Response and resolution are left as initial/placeholder values to be filled
 * by resolveRound().
 */
export function createChallenge(
  claim: string,
  challengerRole: string,
  reason: string,
): DebateRound {
  logger.debug(`Debate challenge created by '${challengerRole}' for claim: "${claim.slice(0, 80)}"`);

  return {
    roundNumber: 1,
    challenger: challengerRole,
    claim,
    counterArgument: reason,
    response: '',
    resolution: 'escalated', // Placeholder — will be resolved via resolveRound()
  };
}

/**
 * Fills in a round's response and resolution. Returns a new round object
 * (does not mutate the input).
 */
export function resolveRound(
  round: DebateRound,
  response: string,
  resolution: 'accepted' | 'rejected' | 'modified' | 'escalated',
  modifiedClaim?: string,
): DebateRound {
  const resolved: DebateRound = {
    ...round,
    response,
    resolution,
  };

  if (resolution === 'modified' && modifiedClaim !== undefined) {
    resolved.resolvedClaim = modifiedClaim;
  }

  logger.debug(`Debate round ${round.roundNumber} resolved as '${resolution}'`);
  return resolved;
}

/**
 * Analyzes completed debate rounds and produces a final DebateResult.
 *
 * Rules:
 * - escalatedToUser = true if ANY round has resolution 'escalated'
 * - consensus = true if the last round is 'accepted' OR all rounds are resolved
 *   (no pending escalation)
 * - finalClaim = the last resolvedClaim from a 'modified' round,
 *   or the original claim if no modifications were made
 */
export function runDebate(
  claim: string,
  _initialConfidence: number,
  _challengerRole: string,
  rounds: DebateRound[],
  _config: DebateConfig = DEFAULT_DEBATE_CONFIG,
): DebateResult {
  const escalatedToUser = rounds.some((r) => r.resolution === 'escalated');

  const lastRound = rounds[rounds.length - 1];
  const consensus = !escalatedToUser && lastRound !== undefined && lastRound.resolution === 'accepted';

  // Find the last modified claim, falling back to the original claim
  let finalClaim = claim;
  for (const round of rounds) {
    if (round.resolution === 'modified' && round.resolvedClaim !== undefined) {
      finalClaim = round.resolvedClaim;
    }
  }

  logger.info(
    `Debate completed: consensus=${consensus}, escalated=${escalatedToUser}, ` +
    `rounds=${rounds.length}, finalClaim="${finalClaim.slice(0, 80)}"`,
  );

  return {
    rounds: [...rounds],
    finalClaim,
    consensus,
    escalatedToUser,
  };
}

/**
 * Returns true if the debate has reached a terminal state:
 * - maxRounds limit reached, OR
 * - Last round was 'accepted' (early consensus), OR
 * - Last round was 'escalated' (early user escalation)
 */
export function isDebateComplete(
  rounds: DebateRound[],
  config: DebateConfig = DEFAULT_DEBATE_CONFIG,
): boolean {
  if (rounds.length === 0) return false;
  if (rounds.length >= config.maxRounds) return true;

  const lastResolution = rounds[rounds.length - 1].resolution;
  return lastResolution === 'accepted' || lastResolution === 'escalated';
}
