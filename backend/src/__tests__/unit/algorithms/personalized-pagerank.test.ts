/**
 * Tests for algorithms/personalized-pagerank.
 *
 * Coverage:
 *   - Math invariants: probability-sum, seed-dominance, monotonicity in α.
 *   - Topology invariants: 1-hop > 2-hop, edge-weight scaling, symmetric
 *     graphs produce symmetric scores.
 *   - Personalised vs uniform PageRank (allowEmptySeeds).
 *   - Dangling-node mass redistributes to seeds (personalised variant).
 *   - Defensive: empty seeds, ghost seeds, invalid α, drop edges with
 *     non-positive / non-finite weight, drop edges referencing unknown nodes.
 *   - topKByPageRank: cap, exclude-seeds, deterministic tie-break.
 *   - undirectedToDirected: doubles the edge list.
 *
 * No mocks — pure algorithm.
 *
 * @module tests/unit/algorithms/personalized-pagerank
 */

import {
  personalizedPageRank,
  topKByPageRank,
  undirectedToDirected,
  type PPRGraph,
  type WeightedEdge,
} from '../../../algorithms/personalized-pagerank';

function sumScores(scores: ReadonlyMap<string, number>): number {
  let s = 0;
  for (const v of scores.values()) s += v;
  return s;
}

describe('personalizedPageRank', () => {
  describe('math invariants', () => {
    it('score distribution sums to 1', () => {
      const g: PPRGraph = {
        nodes: ['a', 'b', 'c', 'd'],
        edges: undirectedToDirected([
          ['a', 'b', 1], ['b', 'c', 1], ['c', 'd', 1], ['d', 'a', 1],
        ]),
      };
      const r = personalizedPageRank(g, ['a']);
      expect(sumScores(r.scores)).toBeCloseTo(1, 6);
    });

    it('seed nodes have the highest score on a uniform graph', () => {
      const g: PPRGraph = {
        nodes: ['a', 'b', 'c', 'd'],
        edges: undirectedToDirected([
          ['a', 'b', 1], ['b', 'c', 1], ['c', 'd', 1], ['d', 'a', 1],
        ]),
      };
      const r = personalizedPageRank(g, ['a']);
      const sa = r.scores.get('a')!;
      for (const n of ['b', 'c', 'd']) expect(sa).toBeGreaterThan(r.scores.get(n)!);
    });

    it('higher α concentrates mass on seeds', () => {
      const g: PPRGraph = {
        nodes: ['a', 'b', 'c', 'd'],
        edges: undirectedToDirected([
          ['a', 'b', 1], ['b', 'c', 1], ['c', 'd', 1], ['d', 'a', 1],
        ]),
      };
      const lo = personalizedPageRank(g, ['a'], { alpha: 0.05 });
      const hi = personalizedPageRank(g, ['a'], { alpha: 0.5 });
      expect(hi.scores.get('a')!).toBeGreaterThan(lo.scores.get('a')!);
    });

    it('1-hop neighbours rank higher than 2-hop neighbours', () => {
      const g: PPRGraph = {
        nodes: ['a', 'b', 'c'],
        edges: undirectedToDirected([['a', 'b', 1], ['b', 'c', 1]]),
      };
      const r = personalizedPageRank(g, ['a']);
      expect(r.scores.get('b')!).toBeGreaterThan(r.scores.get('c')!);
    });
  });

  describe('topology invariants', () => {
    it('symmetric structure produces symmetric scores', () => {
      const g: PPRGraph = {
        nodes: ['a', 'b', 'd'],
        edges: undirectedToDirected([['a', 'b', 1], ['a', 'd', 1]]),
      };
      const r = personalizedPageRank(g, ['a']);
      expect(r.scores.get('b')!).toBeCloseTo(r.scores.get('d')!, 9);
    });

    it('edge weights scale neighbour scores proportionally (when both are dangling)', () => {
      const g: PPRGraph = {
        nodes: ['a', 'b', 'c'],
        edges: [['a', 'b', 1], ['a', 'c', 9]],
      };
      const r = personalizedPageRank(g, ['a']);
      const ratio = r.scores.get('c')! / r.scores.get('b')!;
      expect(ratio).toBeGreaterThan(6);
      expect(ratio).toBeLessThan(12);
    });

    it('isolated seed receives all mass', () => {
      const g: PPRGraph = { nodes: ['only'], edges: [] };
      const r = personalizedPageRank(g, ['only']);
      expect(r.scores.get('only')!).toBeCloseTo(1, 6);
    });

    it('disconnected components remain disconnected', () => {
      const g: PPRGraph = {
        nodes: ['a', 'b', 'c', 'd'],
        edges: undirectedToDirected([['a', 'b', 1], ['c', 'd', 1]]),
      };
      const r = personalizedPageRank(g, ['a']);
      expect(r.scores.get('c')!).toBeLessThan(1e-3);
      expect(r.scores.get('d')!).toBeLessThan(1e-3);
    });

    it('two seeds in symmetric components share mass equally', () => {
      const g: PPRGraph = {
        nodes: ['a', 'b', 'c', 'd'],
        edges: undirectedToDirected([['a', 'b', 1], ['c', 'd', 1]]),
      };
      const r = personalizedPageRank(g, ['a', 'c']);
      expect(r.scores.get('a')!).toBeCloseTo(r.scores.get('c')!, 9);
      expect(r.scores.get('b')!).toBeCloseTo(r.scores.get('d')!, 9);
    });
  });

  describe('dangling nodes (personalised variant)', () => {
    it('redistributes dangling mass back to the seed set', () => {
      // a → b (b is dangling — no out-edges)
      const g: PPRGraph = { nodes: ['a', 'b'], edges: [['a', 'b', 1]] };
      const r = personalizedPageRank(g, ['a']);
      // Seed gets restart + dangling-back mass → still dominant.
      expect(r.scores.get('a')!).toBeGreaterThan(r.scores.get('b')!);
      expect(sumScores(r.scores)).toBeCloseTo(1, 6);
    });
  });

  describe('regular PageRank fallback', () => {
    it('allowEmptySeeds=true treats all nodes as uniform seeds', () => {
      const g: PPRGraph = {
        nodes: ['a', 'b', 'c'],
        edges: undirectedToDirected([['a', 'b', 1], ['b', 'c', 1]]),
      };
      const r = personalizedPageRank(g, [], { allowEmptySeeds: true });
      // 'b' is the bridge, should have highest centrality.
      expect(r.scores.get('b')!).toBeGreaterThan(r.scores.get('a')!);
      expect(r.scores.get('b')!).toBeGreaterThan(r.scores.get('c')!);
      // a and c are symmetric.
      expect(r.scores.get('a')!).toBeCloseTo(r.scores.get('c')!, 9);
    });
  });

  describe('defensive', () => {
    const g: PPRGraph = { nodes: ['a', 'b'], edges: [['a', 'b', 1]] };

    it('throws on empty seeds when allowEmptySeeds is false', () => {
      expect(() => personalizedPageRank(g, [])).toThrow(/seed nodes/);
    });

    it('throws when no seeds are present in the graph', () => {
      expect(() => personalizedPageRank(g, ['ghost'])).toThrow(/seed nodes/);
    });

    it('throws on alpha = 0', () => {
      expect(() => personalizedPageRank(g, ['a'], { alpha: 0 })).toThrow(/alpha/);
    });

    it('throws on alpha = 1', () => {
      expect(() => personalizedPageRank(g, ['a'], { alpha: 1 })).toThrow(/alpha/);
    });

    it('throws on alpha < 0', () => {
      expect(() => personalizedPageRank(g, ['a'], { alpha: -0.1 })).toThrow(/alpha/);
    });

    it('throws on maxIterations < 1', () => {
      expect(() => personalizedPageRank(g, ['a'], { maxIterations: 0 })).toThrow(/maxIterations/);
    });

    it('drops edges with non-positive weight', () => {
      const dropG: PPRGraph = {
        nodes: ['a', 'b', 'c'],
        edges: [['a', 'b', 1], ['a', 'c', 0], ['a', 'c', -5]],
      };
      const r = personalizedPageRank(dropG, ['a']);
      // c has no positive in-edge → near-zero score.
      expect(r.scores.get('c')!).toBeLessThan(0.05);
    });

    it('drops edges with NaN / Infinity weight', () => {
      const badG: PPRGraph = {
        nodes: ['a', 'b'],
        edges: [['a', 'b', NaN], ['a', 'b', Infinity]],
      };
      const r = personalizedPageRank(badG, ['a']);
      // No real edges → b gets only restart-fallback, which is near zero
      // because a is dangling (its only "edges" had bad weights → dropped).
      expect(r.scores.get('a')!).toBeGreaterThan(0.5);
    });

    it('drops edges referencing nodes not in graph.nodes', () => {
      const ghostG: PPRGraph = {
        nodes: ['a', 'b'],
        edges: [['a', 'b', 1], ['a', 'ghost', 1], ['ghost', 'b', 1]],
      };
      const r = personalizedPageRank(ghostG, ['a']);
      expect(r.scores.has('ghost')).toBe(false);
      expect(sumScores(r.scores)).toBeCloseTo(1, 6);
    });

    it('handles empty graph with allowEmptySeeds', () => {
      const empty: PPRGraph = { nodes: [], edges: [] };
      const r = personalizedPageRank(empty, [], { allowEmptySeeds: true });
      expect(r.scores.size).toBe(0);
      expect(r.converged).toBe(true);
    });

    it('deduplicates duplicate node IDs in input', () => {
      const dupe: PPRGraph = {
        nodes: ['a', 'a', 'b'],
        edges: [['a', 'b', 1]],
      };
      const r = personalizedPageRank(dupe, ['a']);
      expect(r.scores.size).toBe(2);
    });
  });

  describe('convergence', () => {
    it('converges on a small graph in fewer than 100 iterations', () => {
      const g: PPRGraph = {
        nodes: ['a', 'b', 'c', 'd'],
        edges: undirectedToDirected([
          ['a', 'b', 1], ['b', 'c', 1], ['c', 'd', 1], ['d', 'a', 1],
        ]),
      };
      const r = personalizedPageRank(g, ['a']);
      expect(r.converged).toBe(true);
      expect(r.iterations).toBeLessThan(100);
    });

    it('reports converged=false when maxIterations is too low', () => {
      const g: PPRGraph = {
        nodes: ['a', 'b', 'c', 'd'],
        edges: undirectedToDirected([
          ['a', 'b', 1], ['b', 'c', 1], ['c', 'd', 1], ['d', 'a', 1],
        ]),
      };
      const r = personalizedPageRank(g, ['a'], { maxIterations: 2, convergenceTol: 1e-12 });
      expect(r.iterations).toBe(2);
      expect(r.converged).toBe(false);
    });

    it('handles a 1000-node sparse graph in under 500 ms', () => {
      const N = 1000;
      const nodes: string[] = [];
      for (let i = 0; i < N; i++) nodes.push(`n${i}`);
      const edges: WeightedEdge[] = [];
      for (let i = 0; i < N; i++) {
        edges.push([`n${i}`, `n${(i + 1) % N}`, 1]);
        edges.push([`n${i}`, `n${(i + 17) % N}`, 0.5]);
        edges.push([`n${i}`, `n${(i + 53) % N}`, 0.3]);
      }
      const g: PPRGraph = { nodes, edges };
      const t0 = Date.now();
      const r = personalizedPageRank(g, ['n0']);
      const ms = Date.now() - t0;
      expect(r.converged).toBe(true);
      expect(ms).toBeLessThan(500);
    });
  });
});

describe('topKByPageRank', () => {
  it('returns top-K sorted descending by score', () => {
    // Star topology — seed 'a' is the central hub, dominates by construction.
    const g: PPRGraph = {
      nodes: ['a', 'b', 'c', 'd'],
      edges: undirectedToDirected([
        ['a', 'b', 1], ['a', 'c', 1], ['a', 'd', 1],
      ]),
    };
    const r = personalizedPageRank(g, ['a']);
    const top = topKByPageRank(r, 4);
    expect(top.length).toBe(4);
    for (let i = 1; i < top.length; i++) {
      expect(top[i - 1].score).toBeGreaterThanOrEqual(top[i].score);
    }
    expect(top[0].nodeId).toBe('a');
  });

  it('caps at k', () => {
    const g: PPRGraph = {
      nodes: ['a', 'b', 'c', 'd'],
      edges: undirectedToDirected([['a', 'b', 1], ['b', 'c', 1], ['c', 'd', 1]]),
    };
    const r = personalizedPageRank(g, ['a']);
    expect(topKByPageRank(r, 2).length).toBe(2);
    expect(topKByPageRank(r, 0).length).toBe(0);
  });

  it('excludes seeds when requested', () => {
    const g: PPRGraph = {
      nodes: ['a', 'b', 'c'],
      edges: undirectedToDirected([['a', 'b', 1], ['b', 'c', 1]]),
    };
    const r = personalizedPageRank(g, ['a']);
    const top = topKByPageRank(r, 5, { excludeSeeds: true, seeds: ['a'] });
    expect(top.find((t) => t.nodeId === 'a')).toBeUndefined();
    expect(top.length).toBe(2);
  });

  it('breaks ties alphabetically (deterministic)', () => {
    const g: PPRGraph = { nodes: ['z', 'a', 'b'], edges: [] };
    const r = personalizedPageRank(g, ['z', 'a', 'b']);
    const top = topKByPageRank(r, 3);
    // All scores equal (1/3) — alphabetical order on ties.
    expect(top.map((t) => t.nodeId)).toEqual(['a', 'b', 'z']);
  });
});

describe('undirectedToDirected', () => {
  it('doubles the edge list with reciprocal directions', () => {
    const out = undirectedToDirected([['a', 'b', 0.5], ['c', 'd', 1]]);
    expect(out.length).toBe(4);
    expect(out).toContainEqual(['a', 'b', 0.5]);
    expect(out).toContainEqual(['b', 'a', 0.5]);
    expect(out).toContainEqual(['c', 'd', 1]);
    expect(out).toContainEqual(['d', 'c', 1]);
  });

  it('preserves weights symmetrically', () => {
    const out = undirectedToDirected([['x', 'y', 7]]);
    expect(out[0][2]).toBe(7);
    expect(out[1][2]).toBe(7);
  });
});
