/**
 * Hindsight Cross-Network Router (Phase H4.5) tests.
 *
 * Covers:
 *   - Category-driven routing: each LoCoMo category produces the
 *     expected primary network
 *   - Belief-cue detection boosts evolving_beliefs weight
 *   - Weight normalisation to 1.0 with stable sort
 *   - Custom weightTable override
 *   - topKNetworks slice
 *   - Defensive empty / unknown query
 */

import {
  routeToHindsightNetworks,
  topKNetworks,
  ALL_HINDSIGHT_NETWORKS,
  type HindsightNetworkId,
} from '../../../../services/memory/hindsight-networks/cross-network-router';
import { WORLD_FACT_NETWORK } from '../../../../services/memory/hindsight-networks/world-facts';
import { AGENT_EXPERIENCE_NETWORK } from '../../../../services/memory/hindsight-networks/agent-experiences';
import { ENTITY_SUMMARY_NETWORK } from '../../../../services/memory/hindsight-networks/entity-summaries';
import { EVOLVING_BELIEF_NETWORK } from '../../../../services/memory/hindsight-networks/evolving-beliefs';

describe('ALL_HINDSIGHT_NETWORKS — completeness check', () => {
  it('lists all four networks', () => {
    expect(ALL_HINDSIGHT_NETWORKS).toEqual(
      expect.arrayContaining([
        WORLD_FACT_NETWORK,
        AGENT_EXPERIENCE_NETWORK,
        ENTITY_SUMMARY_NETWORK,
        EVOLVING_BELIEF_NETWORK,
      ]),
    );
    expect(ALL_HINDSIGHT_NETWORKS.length).toBe(4);
  });
});

describe('routeToHindsightNetworks — category-driven routing', () => {
  it('multi-hop query → entity_summaries primary', () => {
    const r = routeToHindsightNetworks('How many books did Alice and Bob read?');
    expect(r.category).toBe('multi_hop');
    expect(r.networks[0].network).toBe(ENTITY_SUMMARY_NETWORK);
  });

  it('temporal query → agent_experiences primary', () => {
    const r = routeToHindsightNetworks('When did Bob graduate from Stanford?');
    expect(r.category).toBe('temporal');
    expect(r.networks[0].network).toBe(AGENT_EXPERIENCE_NETWORK);
  });

  it('open-domain catch-all → world_facts primary', () => {
    const r = routeToHindsightNetworks('the project status seems unclear');
    expect(r.category).toBe('open_domain');
    expect(r.networks[0].network).toBe(WORLD_FACT_NETWORK);
  });

  it('single-hop with entity → entity_summaries primary', () => {
    const r = routeToHindsightNetworks('Where does Caroline work?');
    expect(r.category).toBe('single_hop');
    expect(r.networks[0].network).toBe(ENTITY_SUMMARY_NETWORK);
  });

  it('all four networks always returned (just re-ranked by category)', () => {
    const queries = [
      'How many?',
      'When did Bob?',
      'project status',
      'Where does Alice work?',
      'the user did not say anything',
    ];
    for (const q of queries) {
      const r = routeToHindsightNetworks(q);
      const ids = r.networks.map((n) => n.network).sort();
      expect(ids).toEqual([...ALL_HINDSIGHT_NETWORKS].sort());
    }
  });

  it('weights sum to 1.0 (normalised)', () => {
    const queries = ['How many?', 'When did Bob?', 'project status', 'Where does Alice work?'];
    for (const q of queries) {
      const r = routeToHindsightNetworks(q);
      const sum = r.networks.reduce((acc, n) => acc + n.weight, 0);
      expect(sum).toBeCloseTo(1.0, 5);
    }
  });

  it('weights sorted DESC', () => {
    const r = routeToHindsightNetworks('How many people did Alice meet?');
    for (let i = 1; i < r.networks.length; i++) {
      expect(r.networks[i - 1].weight).toBeGreaterThanOrEqual(r.networks[i].weight);
    }
  });
});

describe('routeToHindsightNetworks — belief-cue boost', () => {
  it('"likes" cue → belief boost fires', () => {
    const r = routeToHindsightNetworks('What does Caroline like?');
    expect(r.beliefBoost).toBe(true);
  });

  it('"prefers" cue → belief boost fires', () => {
    const r = routeToHindsightNetworks('What does Bob prefer for breakfast?');
    expect(r.beliefBoost).toBe(true);
  });

  it('"thinks" cue → belief boost fires', () => {
    const r = routeToHindsightNetworks('What does Caroline think about Stanford?');
    expect(r.beliefBoost).toBe(true);
  });

  it('"favorite" cue → belief boost fires', () => {
    const r = routeToHindsightNetworks("What is Bob's favorite city?");
    expect(r.beliefBoost).toBe(true);
  });

  it('no belief cue → boost stays off', () => {
    const r = routeToHindsightNetworks('When did Caroline graduate?');
    expect(r.beliefBoost).toBe(false);
  });

  it('belief boost increases evolving_beliefs weight relative to no-boost baseline', () => {
    const baseline = routeToHindsightNetworks('When did Caroline graduate?');
    const boosted = routeToHindsightNetworks('What does Caroline think about Stanford?');
    const baselineBeliefs = baseline.networks.find((n) => n.network === EVOLVING_BELIEF_NETWORK)!.weight;
    const boostedBeliefs = boosted.networks.find((n) => n.network === EVOLVING_BELIEF_NETWORK)!.weight;
    expect(boostedBeliefs).toBeGreaterThan(baselineBeliefs);
  });

  it('custom beliefBoostFactor changes boost magnitude', () => {
    const small = routeToHindsightNetworks('What does X like?', { beliefBoostFactor: 1.1 });
    const large = routeToHindsightNetworks('What does X like?', { beliefBoostFactor: 5.0 });
    const smallBeliefs = small.networks.find((n) => n.network === EVOLVING_BELIEF_NETWORK)!.weight;
    const largeBeliefs = large.networks.find((n) => n.network === EVOLVING_BELIEF_NETWORK)!.weight;
    expect(largeBeliefs).toBeGreaterThan(smallBeliefs);
  });

  it('belief boost still produces sum=1.0 after re-normalisation', () => {
    const r = routeToHindsightNetworks('What does Caroline prefer?', { beliefBoostFactor: 3.0 });
    const sum = r.networks.reduce((acc, n) => acc + n.weight, 0);
    expect(sum).toBeCloseTo(1.0, 5);
  });
});

describe('routeToHindsightNetworks — observability + edge cases', () => {
  it('contributor breakdown includes belief_cues count', () => {
    // Note: belief_cues counts PATTERNS that fired, not all individual
    // cue tokens — "like" and "prefer" share the same preference-pattern,
    // so this counts as 1 (the pattern matched once). A query that hits
    // multiple distinct patterns ("likes" + "thinks") fires 2.
    const r1 = routeToHindsightNetworks('What does Bob like and prefer?');
    expect(r1.contributors.belief_cues).toBeGreaterThanOrEqual(1);
    const r2 = routeToHindsightNetworks('What does Bob like and think?');
    expect(r2.contributors.belief_cues).toBeGreaterThanOrEqual(2);
  });

  it('reason string carries category + boost flag', () => {
    const r1 = routeToHindsightNetworks('What does X like?');
    const r2 = routeToHindsightNetworks('When did X happen?');
    expect(r1.reason).toContain('belief boost');
    expect(r2.reason).not.toContain('belief boost');
  });

  it('empty query → empty networks array', () => {
    const r = routeToHindsightNetworks('');
    expect(r.networks).toEqual([]);
    expect(r.category).toBe('unknown');
  });

  it('whitespace-only query → empty', () => {
    const r = routeToHindsightNetworks('   ');
    expect(r.networks).toEqual([]);
  });

  it('determinism: same query → same routing', () => {
    const a = routeToHindsightNetworks('How many people did Alice meet?');
    const b = routeToHindsightNetworks('How many people did Alice meet?');
    expect(a.networks).toEqual(b.networks);
    expect(a.category).toBe(b.category);
  });
});

describe('routeToHindsightNetworks — custom weight table', () => {
  it('custom table for a category overrides default', () => {
    const customTable = {
      multi_hop: [
        { network: WORLD_FACT_NETWORK as HindsightNetworkId, weight: 0.95 },
        { network: ENTITY_SUMMARY_NETWORK as HindsightNetworkId, weight: 0.05 },
      ],
    };
    const r = routeToHindsightNetworks('How many?', { weightTable: customTable });
    expect(r.networks[0].network).toBe(WORLD_FACT_NETWORK);
    // Only 2 networks in custom table → only 2 in output.
    expect(r.networks.length).toBe(2);
  });

  it('partial custom table falls back to default for other categories', () => {
    const customTable = {
      multi_hop: [{ network: WORLD_FACT_NETWORK as HindsightNetworkId, weight: 1.0 }],
    };
    const r = routeToHindsightNetworks('When did Bob graduate?', { weightTable: customTable });
    // Falls back to default temporal weights.
    expect(r.category).toBe('temporal');
    expect(r.networks.length).toBe(4);
  });
});

describe('topKNetworks', () => {
  it('returns first K networks', () => {
    const r = routeToHindsightNetworks('How many people did Alice meet?');
    const top2 = topKNetworks(r, 2);
    expect(top2.length).toBe(2);
    expect(top2[0].network).toBe(r.networks[0].network);
    expect(top2[1].network).toBe(r.networks[1].network);
  });

  it('K=1 returns just the primary', () => {
    const r = routeToHindsightNetworks('How many?');
    const top1 = topKNetworks(r, 1);
    expect(top1.length).toBe(1);
  });

  it('K > available → returns all available', () => {
    const r = routeToHindsightNetworks('How many?');
    const top10 = topKNetworks(r, 10);
    expect(top10.length).toBe(r.networks.length);
  });

  it('K <= 0 → returns at least 1 (defensive)', () => {
    const r = routeToHindsightNetworks('How many?');
    const top0 = topKNetworks(r, 0);
    expect(top0.length).toBe(1);
  });
});
