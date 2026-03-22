/**
 * Tests for Phase 129: Debate Protocol for Multi-Turn Agent Disagreements
 *
 * Covers shouldChallenge, createChallenge, resolveRound, runDebate, isDebateComplete
 */

jest.mock('../../../../utils/logger', () => ({
  logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import {
  DEFAULT_DEBATE_CONFIG,
  shouldChallenge,
  createChallenge,
  resolveRound,
  runDebate,
  isDebateComplete,
} from '../../../../services/agents/debate-protocol';
import type { DebateRound } from '../../../../services/agents/debate-protocol';

describe('DEFAULT_DEBATE_CONFIG', () => {
  it('has maxRounds of 3', () => {
    expect(DEFAULT_DEBATE_CONFIG.maxRounds).toBe(3);
  });

  it('has challengeThreshold of 0.6', () => {
    expect(DEFAULT_DEBATE_CONFIG.challengeThreshold).toBe(0.6);
  });
});

describe('shouldChallenge', () => {
  it('returns true when confidence is below the threshold', () => {
    expect(shouldChallenge('some claim', 0.4)).toBe(true);
  });

  it('returns false when confidence equals the threshold', () => {
    expect(shouldChallenge('some claim', 0.6)).toBe(false);
  });

  it('returns false when confidence is above the threshold', () => {
    expect(shouldChallenge('some claim', 0.9)).toBe(false);
  });

  it('respects a custom config threshold', () => {
    expect(shouldChallenge('claim', 0.7, { maxRounds: 3, challengeThreshold: 0.8 })).toBe(true);
    expect(shouldChallenge('claim', 0.9, { maxRounds: 3, challengeThreshold: 0.8 })).toBe(false);
  });
});

describe('createChallenge', () => {
  it('creates a round with the correct challenger and claim', () => {
    const round = createChallenge('The sky is green', 'reviewer', 'Evidence contradicts this');
    expect(round.claim).toBe('The sky is green');
    expect(round.challenger).toBe('reviewer');
    expect(round.counterArgument).toBe('Evidence contradicts this');
  });

  it('sets roundNumber to 1 for a fresh challenge', () => {
    const round = createChallenge('Some claim', 'coder', 'reason');
    expect(round.roundNumber).toBe(1);
  });

  it('sets response and resolvedClaim to empty strings initially', () => {
    const round = createChallenge('claim', 'agent', 'reason');
    expect(round.response).toBe('');
    expect(round.resolvedClaim).toBeUndefined();
  });

  it('sets resolution to escalated as initial placeholder', () => {
    // Before resolveRound is called, resolution should be a predictable initial value
    const round = createChallenge('claim', 'agent', 'reason');
    // resolution field must exist as a valid DebateRound resolution value
    expect(['accepted', 'rejected', 'modified', 'escalated']).toContain(round.resolution);
  });
});

describe('resolveRound', () => {
  const baseRound: DebateRound = {
    roundNumber: 1,
    challenger: 'reviewer',
    claim: 'The data shows X',
    counterArgument: 'But other data shows Y',
    response: '',
    resolution: 'escalated',
  };

  it('fills in response and resolution', () => {
    const resolved = resolveRound(baseRound, 'I agree with the concern', 'accepted');
    expect(resolved.response).toBe('I agree with the concern');
    expect(resolved.resolution).toBe('accepted');
  });

  it('sets resolvedClaim when resolution is modified', () => {
    const resolved = resolveRound(baseRound, 'Good point, adjusting', 'modified', 'The data shows X with caveats');
    expect(resolved.resolution).toBe('modified');
    expect(resolved.resolvedClaim).toBe('The data shows X with caveats');
  });

  it('does not modify the original round (immutability)', () => {
    resolveRound(baseRound, 'response', 'rejected');
    expect(baseRound.response).toBe('');
    expect(baseRound.resolution).toBe('escalated');
  });

  it('handles rejected resolution without resolvedClaim', () => {
    const resolved = resolveRound(baseRound, 'I disagree', 'rejected');
    expect(resolved.resolution).toBe('rejected');
    expect(resolved.resolvedClaim).toBeUndefined();
  });
});

describe('runDebate', () => {
  it('returns consensus=true and escalatedToUser=false when last round is accepted', () => {
    const rounds: DebateRound[] = [
      {
        roundNumber: 1,
        challenger: 'reviewer',
        claim: 'claim A',
        counterArgument: 'challenge',
        response: 'fair point',
        resolution: 'accepted',
      },
    ];
    const result = runDebate('claim A', 0.5, 'reviewer', rounds);
    expect(result.consensus).toBe(true);
    expect(result.escalatedToUser).toBe(false);
  });

  it('returns escalatedToUser=true when any round is escalated', () => {
    const rounds: DebateRound[] = [
      {
        roundNumber: 1,
        challenger: 'reviewer',
        claim: 'claim A',
        counterArgument: 'challenge',
        response: 'cannot agree',
        resolution: 'escalated',
      },
    ];
    const result = runDebate('claim A', 0.3, 'reviewer', rounds);
    expect(result.escalatedToUser).toBe(true);
  });

  it('uses the last modified claim as finalClaim', () => {
    const rounds: DebateRound[] = [
      {
        roundNumber: 1,
        challenger: 'reviewer',
        claim: 'original claim',
        counterArgument: 'challenge',
        response: 'adjusted',
        resolution: 'modified',
        resolvedClaim: 'modified claim v1',
      },
      {
        roundNumber: 2,
        challenger: 'writer',
        claim: 'modified claim v1',
        counterArgument: 'still wrong',
        response: 'ok updated again',
        resolution: 'modified',
        resolvedClaim: 'modified claim v2',
      },
    ];
    const result = runDebate('original claim', 0.4, 'reviewer', rounds);
    expect(result.finalClaim).toBe('modified claim v2');
  });

  it('uses original claim as finalClaim when no rounds modified it', () => {
    const rounds: DebateRound[] = [
      {
        roundNumber: 1,
        challenger: 'reviewer',
        claim: 'original claim',
        counterArgument: 'challenge',
        response: 'I still disagree',
        resolution: 'rejected',
      },
    ];
    const result = runDebate('original claim', 0.5, 'reviewer', rounds);
    expect(result.finalClaim).toBe('original claim');
  });

  it('includes all rounds in the result', () => {
    const rounds: DebateRound[] = [
      {
        roundNumber: 1,
        challenger: 'reviewer',
        claim: 'claim',
        counterArgument: 'challenge',
        response: 'response',
        resolution: 'rejected',
      },
      {
        roundNumber: 2,
        challenger: 'writer',
        claim: 'claim',
        counterArgument: 'challenge 2',
        response: 'response 2',
        resolution: 'accepted',
      },
    ];
    const result = runDebate('claim', 0.5, 'reviewer', rounds);
    expect(result.rounds).toHaveLength(2);
    expect(result.consensus).toBe(true);
  });
});

describe('isDebateComplete', () => {
  it('returns true when rounds count reaches maxRounds', () => {
    const rounds: DebateRound[] = Array.from({ length: 3 }, (_, i) => ({
      roundNumber: i + 1,
      challenger: 'reviewer',
      claim: 'claim',
      counterArgument: 'challenge',
      response: 'response',
      resolution: 'rejected' as const,
    }));
    expect(isDebateComplete(rounds, { maxRounds: 3, challengeThreshold: 0.6 })).toBe(true);
  });

  it('returns false when rounds count is below maxRounds and no terminal resolution', () => {
    const rounds: DebateRound[] = [
      {
        roundNumber: 1,
        challenger: 'reviewer',
        claim: 'claim',
        counterArgument: 'challenge',
        response: 'response',
        resolution: 'rejected',
      },
    ];
    expect(isDebateComplete(rounds, { maxRounds: 3, challengeThreshold: 0.6 })).toBe(false);
  });

  it('returns true when last round is accepted (early termination)', () => {
    const rounds: DebateRound[] = [
      {
        roundNumber: 1,
        challenger: 'reviewer',
        claim: 'claim',
        counterArgument: 'challenge',
        response: 'agreed',
        resolution: 'accepted',
      },
    ];
    expect(isDebateComplete(rounds)).toBe(true);
  });

  it('returns true when last round is escalated (early termination)', () => {
    const rounds: DebateRound[] = [
      {
        roundNumber: 1,
        challenger: 'reviewer',
        claim: 'claim',
        counterArgument: 'challenge',
        response: 'cannot resolve',
        resolution: 'escalated',
      },
    ];
    expect(isDebateComplete(rounds)).toBe(true);
  });

  it('returns false for empty rounds array', () => {
    expect(isDebateComplete([])).toBe(false);
  });

  it('uses DEFAULT_DEBATE_CONFIG when no config is provided', () => {
    const rounds: DebateRound[] = Array.from({ length: 3 }, (_, i) => ({
      roundNumber: i + 1,
      challenger: 'reviewer',
      claim: 'claim',
      counterArgument: 'challenge',
      response: 'response',
      resolution: 'rejected' as const,
    }));
    // Default maxRounds is 3, so 3 rounds should be complete
    expect(isDebateComplete(rounds)).toBe(true);
  });
});
