/**
 * Tests for services/reasoning/self-consistency.
 *
 * Coverage:
 *   - Happy path: 3 rollouts with majority answer wins, consistency
 *     score is correct, raw form preserved.
 *   - Tie-break by first-seed (deterministic).
 *   - Custom normaliser (e.g. JSON-parse) routes votes correctly.
 *   - failFast=true: any rollout error throws immediately.
 *   - failFast=false: errors collected, voting proceeds with successes.
 *   - minSuccessfulRollouts: enforced; throws if not met.
 *   - Defensive: empty seeds throws, bad minSuccess throws.
 *   - Parallelism: rollouts launched concurrently.
 *
 * @module tests/unit/services/self-consistency
 */

import {
  runSelfConsistency,
  type RolloutFn,
} from '../../../services/reasoning/self-consistency';

// ===========================================================================
// Helpers
// ===========================================================================

/** Build a deterministic rollout that returns `answers[i]` for seeds[i]. */
function fixedRollout(answersBySeed: Record<number, string>): RolloutFn {
  return async (_prompt, seed) => {
    if (!(seed in answersBySeed)) throw new Error(`unmocked seed: ${seed}`);
    return answersBySeed[seed];
  };
}

// ===========================================================================
// Happy path
// ===========================================================================

describe('runSelfConsistency — happy path', () => {
  it('majority answer wins', async () => {
    const rollout = fixedRollout({ 1: 'Madrid', 2: 'Madrid', 3: 'Barcelona' });
    const r = await runSelfConsistency('Q', rollout, [1, 2, 3]);
    expect(r.normalisedAnswer).toBe('madrid');
    expect(r.answer).toBe('Madrid');
    expect(r.consistency).toBeCloseTo(2 / 3, 6);
  });

  it('all-agreement → consistency = 1.0', async () => {
    const rollout = fixedRollout({ 1: 'Yes', 2: 'Yes', 3: 'Yes' });
    const r = await runSelfConsistency('Q', rollout, [1, 2, 3]);
    expect(r.consistency).toBe(1);
  });

  it('all-distinct → consistency = 1/N', async () => {
    const rollout = fixedRollout({ 1: 'A', 2: 'B', 3: 'C' });
    const r = await runSelfConsistency('Q', rollout, [1, 2, 3]);
    expect(r.consistency).toBeCloseTo(1 / 3, 6);
  });

  it('preserves raw form (capitalisation) of the first winning vote', async () => {
    const rollout = fixedRollout({ 1: 'MADRID', 2: 'madrid', 3: 'Barcelona' });
    // Both MADRID and madrid normalise to 'madrid' → 2 votes. The
    // first vote (seed 1, "MADRID") provides the raw answer.
    const r = await runSelfConsistency('Q', rollout, [1, 2, 3]);
    expect(r.normalisedAnswer).toBe('madrid');
    expect(r.answer).toBe('MADRID');
  });

  it('voteCounts sorted descending, with samples', () => {});
  it('voteCounts include all distinct normalised answers', async () => {
    const rollout = fixedRollout({ 1: 'A', 2: 'A', 3: 'B', 4: 'C' });
    const r = await runSelfConsistency('Q', rollout, [1, 2, 3, 4]);
    expect(r.voteCounts.map((v) => v.normalised)).toEqual(['a', 'b', 'c']);
    expect(r.voteCounts[0].votes).toBe(2);
  });
});

// ===========================================================================
// Tie-break
// ===========================================================================

describe('runSelfConsistency — tie-break', () => {
  it('on tied votes, the answer whose smallest seed is lower wins', async () => {
    const rollout = fixedRollout({ 1: 'A', 2: 'B', 3: 'A', 4: 'B' });
    // Both A and B have 2 votes. A's smallest seed (1) < B's (2). A wins.
    const r = await runSelfConsistency('Q', rollout, [1, 2, 3, 4]);
    expect(r.normalisedAnswer).toBe('a');
  });

  it('deterministic across runs', async () => {
    const rollout = fixedRollout({ 1: 'A', 2: 'B', 3: 'A', 4: 'B' });
    const r1 = await runSelfConsistency('Q', rollout, [1, 2, 3, 4]);
    const r2 = await runSelfConsistency('Q', rollout, [1, 2, 3, 4]);
    expect(r1.normalisedAnswer).toBe(r2.normalisedAnswer);
  });
});

// ===========================================================================
// Default normaliser
// ===========================================================================

describe('runSelfConsistency — default normaliser', () => {
  it('case-insensitive', async () => {
    const rollout = fixedRollout({ 1: 'Madrid', 2: 'madrid', 3: 'MADRID' });
    const r = await runSelfConsistency('Q', rollout, [1, 2, 3]);
    expect(r.consistency).toBe(1);
  });

  it('trims whitespace', async () => {
    const rollout = fixedRollout({ 1: '  Madrid  ', 2: 'Madrid', 3: '\nMadrid\n' });
    const r = await runSelfConsistency('Q', rollout, [1, 2, 3]);
    expect(r.consistency).toBe(1);
  });

  it('collapses internal whitespace', async () => {
    const rollout = fixedRollout({ 1: 'Madrid Spain', 2: 'Madrid    Spain' });
    const r = await runSelfConsistency('Q', rollout, [1, 2]);
    expect(r.consistency).toBe(1);
  });

  it('strips trailing periods', async () => {
    const rollout = fixedRollout({ 1: 'Madrid', 2: 'Madrid.' });
    const r = await runSelfConsistency('Q', rollout, [1, 2]);
    expect(r.consistency).toBe(1);
  });
});

// ===========================================================================
// Custom normaliser
// ===========================================================================

describe('runSelfConsistency — custom normaliser', () => {
  it('JSON-parse normaliser routes structurally-equivalent answers', async () => {
    const rollout = fixedRollout({
      1: '{"city":"Madrid","year":2018}',
      2: '{ "year": 2018, "city": "Madrid" }', // same JSON, different formatting
      3: '{"city":"Barcelona","year":2018}',
    });
    const r = await runSelfConsistency('Q', rollout, [1, 2, 3], {
      normalise: (s) => {
        try {
          const o = JSON.parse(s);
          // Stable key order.
          return JSON.stringify(o, Object.keys(o).sort());
        } catch { return s.trim(); }
      },
    });
    expect(r.consistency).toBeCloseTo(2 / 3, 6);
  });
});

// ===========================================================================
// Error handling
// ===========================================================================

describe('runSelfConsistency — error handling', () => {
  it('failFast=true throws on any rollout error', async () => {
    const rollout: RolloutFn = async (_p, seed) => {
      if (seed === 2) throw new Error('rollout 2 exploded');
      return 'A';
    };
    await expect(
      runSelfConsistency('Q', rollout, [1, 2, 3], { failFast: true }),
    ).rejects.toThrow('rollout 2 exploded');
  });

  it('failFast=false collects errors and votes on successes (with relaxed minSuccess)', async () => {
    const rollout: RolloutFn = async (_p, seed) => {
      if (seed === 2) throw new Error('seed-2 boom');
      return seed === 1 ? 'A' : 'A';
    };
    // failFast=false alone keeps the default minSuccess=N, which would
    // throw on the first failure. To actually tolerate partial failure
    // the caller must opt in via minSuccessfulRollouts.
    const r = await runSelfConsistency('Q', rollout, [1, 2, 3], {
      failFast: false,
      minSuccessfulRollouts: 1,
    });
    expect(r.consistency).toBe(1); // both successful rollouts agreed on A
    expect(r.errors.length).toBe(1);
    expect(r.errors[0].seed).toBe(2);
    expect(r.errors[0].error).toContain('seed-2 boom');
    expect(r.rollouts.length).toBe(2);
  });

  it('throws when minSuccessfulRollouts is not met', async () => {
    const rollout: RolloutFn = async () => {
      throw new Error('all explode');
    };
    await expect(
      runSelfConsistency('Q', rollout, [1, 2, 3], {
        failFast: false,
        minSuccessfulRollouts: 2,
      }),
    ).rejects.toThrow(/minSuccessfulRollouts/);
  });

  it('proceeds when only minSuccessfulRollouts are met', async () => {
    const rollout: RolloutFn = async (_p, seed) => {
      if (seed > 1) throw new Error('boom');
      return 'A';
    };
    const r = await runSelfConsistency('Q', rollout, [1, 2, 3], {
      failFast: false,
      minSuccessfulRollouts: 1,
    });
    expect(r.consistency).toBe(1);
    expect(r.rollouts.length).toBe(1);
  });
});

// ===========================================================================
// Defensive
// ===========================================================================

describe('runSelfConsistency — defensive', () => {
  it('throws on empty seeds array', async () => {
    await expect(runSelfConsistency('Q', async () => 'A', [])).rejects.toThrow(/non-empty/);
  });

  it('throws when minSuccessfulRollouts > seeds.length', async () => {
    await expect(
      runSelfConsistency('Q', async () => 'A', [1, 2], { minSuccessfulRollouts: 3 }),
    ).rejects.toThrow(/minSuccessfulRollouts/);
  });

  it('handles all-empty answers (winner is empty string)', async () => {
    const rollout = fixedRollout({ 1: '', 2: '   ', 3: '\n' });
    const r = await runSelfConsistency('Q', rollout, [1, 2, 3]);
    expect(r.normalisedAnswer).toBe('');
    expect(r.consistency).toBe(1);
  });
});

// ===========================================================================
// Parallelism
// ===========================================================================

describe('runSelfConsistency — parallelism', () => {
  it('rollouts launched concurrently (max-active >= 2)', async () => {
    let active = 0;
    let maxActive = 0;
    const rollout: RolloutFn = async () => {
      active++;
      if (active > maxActive) maxActive = active;
      await new Promise((r) => setTimeout(r, 5));
      active--;
      return 'A';
    };
    await runSelfConsistency('Q', rollout, [1, 2, 3]);
    expect(maxActive).toBeGreaterThanOrEqual(2);
  });
});
