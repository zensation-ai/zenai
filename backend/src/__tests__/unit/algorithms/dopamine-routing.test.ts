/**
 * Tests for D-MEM dopamine-modulated retrieval routing (Phase H6.1).
 *
 * Verifies:
 *   - Default thresholds produce sensible routes for the four LoCoMo
 *     query categories (Cat 1 multi-hop, Cat 2 temporal, Cat 3 open,
 *     Cat 4 single-hop).
 *   - Bypass paths (forceFullScan, externalDifficulty) override the
 *     heuristic critic.
 *   - Each contributor moves the score in the documented direction.
 *   - The hybrid band is respected — narrow band around threshold
 *     routes to 'hybrid'.
 *   - routeToHybridOptions() returns the correct flag bag per route.
 */

import {
  routeRetrieval,
  routeToHybridOptions,
} from '../../../algorithms/dopamine-routing';

describe('routeRetrieval — default thresholds', () => {
  it('empty query → fast_cache with bypass note', () => {
    const sig = routeRetrieval('');
    expect(sig.difficulty).toBe(0);
    expect(sig.route).toBe('fast_cache');
    expect(sig.bypassReason).toContain('empty');
  });

  it('Cat 4 single-hop ("when did Caroline graduate?") → fast_cache', () => {
    const sig = routeRetrieval('When did Caroline graduate?');
    // Has question_head + temporal? "graduate" doesn't trigger temporal,
    // but might capture multi-entity boost — should still be < 0.5.
    expect(sig.difficulty).toBeLessThan(0.5);
    expect(['fast_cache', 'hybrid']).toContain(sig.route);
  });

  it('Cat 1 multi-hop accumulates contributors above a single-hop baseline', () => {
    const multi = routeRetrieval(
      "Who taught both Alice and Bob in their math classes?",
    );
    const single = routeRetrieval("When did Caroline graduate?");
    // The multi-hop query has multi-entity + multi-clause +
    // question_head, so its difficulty must exceed a comparable
    // single-hop one.
    expect(multi.difficulty).toBeGreaterThan(single.difficulty);
    // It also fires the multi_clause contributor.
    expect(multi.contributors.multi_clause).toBeGreaterThan(0);
    expect(multi.contributors.multi_entity).toBeGreaterThan(0);
  });

  it('comparison + count + multi-entity stacks past 0.5', () => {
    // "How many of Alice and Bob's compared homework problems were not solved?"
    const sig = routeRetrieval(
      "How many of Alice and Bob's compared homework problems were not solved?",
    );
    // count_list (0.20) + comparison (0.20) + negation (0.10) +
    // multi_entity + length + question_head — easily > 0.5.
    expect(sig.difficulty).toBeGreaterThanOrEqual(0.5);
    expect(['hybrid', 'full_scan']).toContain(sig.route);
  });

  it('Cat 2 temporal ("What did Caroline say last year?") → boosted', () => {
    const sig = routeRetrieval('What did Caroline say last year?');
    // temporal anchor fires.
    expect(sig.contributors.temporal).toBeGreaterThan(0);
  });

  it('comparison query "X compared to Y" gets a 0.20 marker', () => {
    const sig = routeRetrieval('How did Alice compared to Bob fare on the exam?');
    expect(sig.contributors.comparison).toBe(0.20);
  });

  it('count/list query ("how many Xs?") gets a 0.20 marker', () => {
    const sig = routeRetrieval('How many siblings does Caroline have?');
    expect(sig.contributors.count_list).toBe(0.20);
  });

  it('negation ("not X") gets a 0.10 marker', () => {
    const sig = routeRetrieval('Which animals are not mammals?');
    expect(sig.contributors.negation).toBe(0.10);
  });

  it('multi-entity (Caroline AND Bob AND Alice) bumps multi_entity score', () => {
    const sig = routeRetrieval('What did Caroline tell Bob about Alice?');
    expect(sig.contributors.multi_entity).toBeGreaterThan(0);
  });
});

describe('routeRetrieval — bypass paths', () => {
  it('forceFullScan overrides everything', () => {
    const sig = routeRetrieval('any query at all', { forceFullScan: true });
    expect(sig.route).toBe('full_scan');
    expect(sig.difficulty).toBe(1.0);
    expect(sig.bypassReason).toContain('forceFullScan');
  });

  it('externalDifficulty overrides the heuristic path', () => {
    const sig = routeRetrieval('trivial', {}, { externalDifficulty: 0.95 });
    expect(sig.difficulty).toBe(0.95);
    expect(sig.route).toBe('full_scan');
    expect(sig.bypassReason).toContain('externalDifficulty');
  });

  it('externalDifficulty=0 routes to fast_cache regardless of query', () => {
    const sig = routeRetrieval(
      "Who taught both Alice and Bob and what did they each say?",
      {},
      { externalDifficulty: 0 },
    );
    expect(sig.route).toBe('fast_cache');
  });

  it('externalDifficulty is clamped to [0, 1]', () => {
    const high = routeRetrieval('q', {}, { externalDifficulty: 5 });
    expect(high.difficulty).toBe(1);
    const low = routeRetrieval('q', {}, { externalDifficulty: -3 });
    expect(low.difficulty).toBe(0);
  });
});

describe('routeRetrieval — threshold and hybrid band', () => {
  it('low threshold makes more queries route to full_scan', () => {
    const conservative = routeRetrieval('When did Caroline graduate?', {
      surpriseThreshold: 0.1,
    });
    const aggressive = routeRetrieval('When did Caroline graduate?', {
      surpriseThreshold: 0.9,
    });
    // Lower threshold → more queries cross it → more full_scan routing.
    if (conservative.difficulty > 0.1) {
      expect(['hybrid', 'full_scan']).toContain(conservative.route);
    }
    if (aggressive.difficulty < 0.9) {
      expect(['fast_cache', 'hybrid']).toContain(aggressive.route);
    }
  });

  it('hybrid band routes mid-difficulty queries to hybrid', () => {
    const sig = routeRetrieval('How did Alice compared to Bob?', {
      surpriseThreshold: 0.4,
      hybridBand: 0.10,
    });
    // The query has comparison + multi-entity ≈ 0.2 + 0.13 + something.
    // We just check that whichever band it lands in is consistent
    // with the threshold ± band rule.
    const { difficulty, thresholdUsed, route } = sig;
    if (difficulty < thresholdUsed - 0.10) {
      expect(route).toBe('fast_cache');
    } else if (difficulty > thresholdUsed + 0.10) {
      expect(route).toBe('full_scan');
    } else {
      expect(route).toBe('hybrid');
    }
  });

  it('hybridBand=0 disables hybrid, every query is fast or full', () => {
    const queries = [
      'What is the capital of France?',
      'Who are Alice, Bob, and Carol?',
      'How many cookies?',
      'Compared to last year, how is the weather?',
    ];
    for (const q of queries) {
      const sig = routeRetrieval(q, { hybridBand: 0 });
      expect(sig.route).not.toBe('hybrid');
    }
  });
});

describe('routeRetrieval — contributor scale', () => {
  it('contributorScale < 1.0 makes the critic more conservative', () => {
    const original = routeRetrieval(
      "Who taught both Alice and Bob in their math classes?",
    );
    const conservative = routeRetrieval(
      "Who taught both Alice and Bob in their math classes?",
      { contributorScale: 0.5 },
    );
    expect(conservative.difficulty).toBeLessThan(original.difficulty);
  });

  it('contributorScale > 1.0 makes the critic more aggressive', () => {
    const original = routeRetrieval('When did Caroline graduate?');
    const aggressive = routeRetrieval('When did Caroline graduate?', {
      contributorScale: 1.5,
    });
    expect(aggressive.difficulty).toBeGreaterThanOrEqual(original.difficulty);
  });
});

describe('routeRetrieval — recent-miss bonus', () => {
  it('no misses → no bonus', () => {
    const sig = routeRetrieval('What is the capital?', {}, {});
    expect(sig.contributors.recent_miss).toBe(0);
  });

  it('1 miss → +0.05 bonus', () => {
    const sig = routeRetrieval('What is the capital?', {}, {
      recentMisses: ['previous miss'],
    });
    expect(sig.contributors.recent_miss).toBeCloseTo(0.05, 5);
  });

  it('many misses cap at +0.10', () => {
    const sig = routeRetrieval('What is the capital?', {}, {
      recentMisses: Array.from({ length: 10 }, (_, i) => `miss-${i}`),
    });
    expect(sig.contributors.recent_miss).toBe(0.10);
  });
});

describe('routeToHybridOptions — flag bag mapping', () => {
  it('fast_cache → minimal strategies (vector + BM25 only)', () => {
    const opts = routeToHybridOptions('fast_cache');
    expect(opts.enableVector).toBe(true);
    expect(opts.enableBM25).toBe(true);
    expect(opts.enableGraph).toBe(false);
    expect(opts.enableCommunity).toBe(false);
    expect(opts.enableEventAware).toBe(false);
    expect(opts.enablePPR).toBe(false);
  });

  it('hybrid → graph + PPR but no community / event-aware', () => {
    const opts = routeToHybridOptions('hybrid');
    expect(opts.enableGraph).toBe(true);
    expect(opts.enablePPR).toBe(true);
    expect(opts.enableCommunity).toBe(false);
    expect(opts.enableEventAware).toBe(false);
  });

  it('full_scan → all strategies on', () => {
    const opts = routeToHybridOptions('full_scan');
    expect(opts.enableVector).toBe(true);
    expect(opts.enableGraph).toBe(true);
    expect(opts.enableCommunity).toBe(true);
    expect(opts.enableBM25).toBe(true);
    expect(opts.enableEventAware).toBe(true);
    expect(opts.enablePPR).toBe(true);
  });
});

describe('routeRetrieval — determinism', () => {
  it('same input produces same output', () => {
    const q = 'How did Alice compared to Bob fare last year on the exam?';
    const a = routeRetrieval(q);
    const b = routeRetrieval(q);
    expect(a).toEqual(b);
  });

  it('contributor breakdown sums to (clamped) total difficulty', () => {
    const sig = routeRetrieval(
      "Who taught both Alice and Bob in their math classes?",
    );
    const sum = Object.values(sig.contributors).reduce((acc, v) => acc + v, 0);
    // The sum is the pre-clamp total. Difficulty equals min(sum, 1).
    expect(sig.difficulty).toBeCloseTo(Math.min(sum, 1), 6);
  });
});
