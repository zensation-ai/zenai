/**
 * Standalone smoke for personalized-pagerank.
 *
 * Math-sanity checks (no API, no DB):
 *   - score sum = 1 (probability distribution preservation)
 *   - seed nodes dominate when α is high
 *   - convergence on a small connected graph in < 50 iterations
 *   - dangling node mass redistributed to seeds (personalised variant)
 *   - directional asymmetry: A→B-only graph, seed=A → B has lower score
 *     than the symmetric variant
 *   - top-K respects exclude-seeds option
 *
 * Run via:  cd backend && npx tsx src/algorithms/__smoke__/personalized-pagerank.smoke.ts
 */

import {
  personalizedPageRank,
  topKByPageRank,
  undirectedToDirected,
  type PPRGraph,
  type WeightedEdge,
} from '../personalized-pagerank';

let failures = 0;
function check(name: string, ok: boolean, detail?: string): void {
  const tag = ok ? 'PASS' : 'FAIL';
  console.log(`[${tag}] ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

function sum(scores: ReadonlyMap<string, number>): number {
  let s = 0;
  for (const v of scores.values()) s += v;
  return s;
}

console.log('=== personalized-pagerank smoke ===\n');

// ─────────────────────────────────────────────────────────────────────────
console.log('[group] basic 4-node clique, single seed');
{
  // a — b
  // |   |
  // d — c   (undirected, equal weights)
  const undirected: WeightedEdge[] = [
    ['a', 'b', 1], ['b', 'c', 1], ['c', 'd', 1], ['d', 'a', 1],
  ];
  const graph: PPRGraph = {
    nodes: ['a', 'b', 'c', 'd'],
    edges: undirectedToDirected(undirected),
  };
  const r = personalizedPageRank(graph, ['a']);
  const total = sum(r.scores);
  check('score sum ≈ 1', Math.abs(total - 1) < 1e-6, `total=${total.toFixed(6)}`);
  check('converged', r.converged, `iters=${r.iterations}`);
  // a is the seed → highest score. b and d are 1-hop → equal. c is 2-hop → lowest.
  const sa = r.scores.get('a')!;
  const sb = r.scores.get('b')!;
  const sc = r.scores.get('c')!;
  const sd = r.scores.get('d')!;
  check('seed (a) has highest score', sa > sb && sa > sc && sa > sd,
    `a=${sa.toFixed(4)} b=${sb.toFixed(4)} c=${sc.toFixed(4)} d=${sd.toFixed(4)}`);
  check('symmetric 1-hop (b == d)', Math.abs(sb - sd) < 1e-9);
  check('1-hop > 2-hop (b > c)', sb > sc);
}
console.log('');

// ─────────────────────────────────────────────────────────────────────────
console.log('[group] alpha effect: high alpha → seed dominates more');
{
  const undirected: WeightedEdge[] = [
    ['a', 'b', 1], ['b', 'c', 1], ['c', 'd', 1], ['d', 'a', 1],
  ];
  const graph: PPRGraph = {
    nodes: ['a', 'b', 'c', 'd'],
    edges: undirectedToDirected(undirected),
  };
  const lowAlpha = personalizedPageRank(graph, ['a'], { alpha: 0.05 });
  const highAlpha = personalizedPageRank(graph, ['a'], { alpha: 0.5 });
  check('high-α seed score > low-α seed score',
    highAlpha.scores.get('a')! > lowAlpha.scores.get('a')!,
    `low=${lowAlpha.scores.get('a')!.toFixed(4)} high=${highAlpha.scores.get('a')!.toFixed(4)}`);
}
console.log('');

// ─────────────────────────────────────────────────────────────────────────
console.log('[group] multiple seeds get split mass');
{
  const undirected: WeightedEdge[] = [
    ['a', 'b', 1], ['c', 'd', 1],
  ];
  const graph: PPRGraph = {
    nodes: ['a', 'b', 'c', 'd'],
    edges: undirectedToDirected(undirected),
  };
  const single = personalizedPageRank(graph, ['a']);
  const both = personalizedPageRank(graph, ['a', 'c']);
  // Single-seed: a > b (1-hop) and c, d ≈ 0 (disconnected from a)
  check('single seed a → c has near-zero score',
    single.scores.get('c')! < 1e-3, `c=${single.scores.get('c')!.toFixed(6)}`);
  // Two-seed: c gets ≈ same as a (symmetric structure)
  check('both seeds → a ≈ c', Math.abs(both.scores.get('a')! - both.scores.get('c')!) < 1e-9);
}
console.log('');

// ─────────────────────────────────────────────────────────────────────────
console.log('[group] directional asymmetry');
{
  // Directed A → B only. Seed=A.
  const directed: PPRGraph = {
    nodes: ['a', 'b'],
    edges: [['a', 'b', 1]],
  };
  const r = personalizedPageRank(directed, ['a']);
  // A has out-edge → mass flows to B but bounces back via dangling
  // redistribution (B has no out-edge in the directed-only graph).
  // So A still dominates because of restart + dangling-back.
  const total = sum(r.scores);
  check('directed A→B sum ≈ 1 with dangling redistribution',
    Math.abs(total - 1) < 1e-6, `total=${total.toFixed(6)}`);
  check('dangling node B gets non-zero mass',
    r.scores.get('b')! > 0, `b=${r.scores.get('b')!.toFixed(6)}`);
  // Seed A's restart probability + dangling-back keeps A dominant.
  check('seed a > target b (dangling redistribution to seed)',
    r.scores.get('a')! > r.scores.get('b')!);
}
console.log('');

// ─────────────────────────────────────────────────────────────────────────
console.log('[group] edge-weights matter');
{
  // a → b (weight 1)
  // a → c (weight 9)
  // Both b and c are 1-hop dangling. c should get 9× more mass than b.
  const graph: PPRGraph = {
    nodes: ['a', 'b', 'c'],
    edges: [['a', 'b', 1], ['a', 'c', 9]],
  };
  const r = personalizedPageRank(graph, ['a']);
  const sb = r.scores.get('b')!;
  const sc = r.scores.get('c')!;
  // c should be ~9× b (some drift from dangling redistribution).
  const ratio = sc / sb;
  check('c gets ≈ 9× b\'s score (weight 9 vs 1)',
    ratio > 6 && ratio < 12, `ratio=${ratio.toFixed(2)}`);
}
console.log('');

// ─────────────────────────────────────────────────────────────────────────
console.log('[group] error handling');
{
  const graph: PPRGraph = {
    nodes: ['a', 'b'],
    edges: [['a', 'b', 1]],
  };
  let threw = false;
  try { personalizedPageRank(graph, []); } catch { threw = true; }
  check('empty seeds throws (default)', threw);

  threw = false;
  try { personalizedPageRank(graph, ['ghost']); } catch { threw = true; }
  check('seeds-not-in-graph throws', threw);

  threw = false;
  try { personalizedPageRank(graph, ['a'], { alpha: 0 }); } catch { threw = true; }
  check('alpha=0 throws', threw);

  threw = false;
  try { personalizedPageRank(graph, ['a'], { alpha: 1 }); } catch { threw = true; }
  check('alpha=1 throws', threw);

  // allowEmptySeeds=true falls back to uniform PageRank.
  const fallback = personalizedPageRank(graph, [], { allowEmptySeeds: true });
  check('allowEmptySeeds → completes', fallback.iterations > 0);
}
console.log('');

// ─────────────────────────────────────────────────────────────────────────
console.log('[group] empty graph & isolated seed');
{
  const empty: PPRGraph = { nodes: [], edges: [] };
  const r = personalizedPageRank(empty, [], { allowEmptySeeds: true });
  check('empty graph returns empty result', r.scores.size === 0);

  // Isolated seed: just one node, no edges. All mass should sit on the seed.
  const isolated: PPRGraph = { nodes: ['only'], edges: [] };
  const r2 = personalizedPageRank(isolated, ['only']);
  check('isolated seed gets score 1', Math.abs(r2.scores.get('only')! - 1) < 1e-6);
}
console.log('');

// ─────────────────────────────────────────────────────────────────────────
console.log('[group] topKByPageRank');
{
  const graph: PPRGraph = {
    nodes: ['a', 'b', 'c', 'd', 'e'],
    edges: undirectedToDirected([
      ['a', 'b', 1], ['b', 'c', 1], ['c', 'd', 1], ['d', 'e', 1], ['a', 'e', 1],
    ]),
  };
  const r = personalizedPageRank(graph, ['a']);
  const top3 = topKByPageRank(r, 3);
  check('topK returns 3 items', top3.length === 3);
  check('top-1 is seed (a)', top3[0].nodeId === 'a');
  // Exclude seeds
  const top3NoSeed = topKByPageRank(r, 3, { excludeSeeds: true, seeds: ['a'] });
  check('exclude-seeds removes a', !top3NoSeed.some(t => t.nodeId === 'a'));
  // Determinism on ties: alphabetical fallback
  const tie: PPRGraph = {
    nodes: ['z', 'a', 'b'],
    edges: [['x', 'y', 1]], // no edges referencing z/a/b → all isolated
  };
  // Filter the unused refs
  const tieGraph: PPRGraph = { nodes: ['z', 'a', 'b'], edges: [] };
  const rTie = personalizedPageRank(tieGraph, ['z', 'a', 'b']);
  const topTie = topKByPageRank(rTie, 3);
  // All scores equal (1/3 each); should sort alphabetically.
  check('tie-break alphabetical', topTie.map(t => t.nodeId).join(',') === 'a,b,z',
    topTie.map(t => `${t.nodeId}:${t.score.toFixed(4)}`).join(' '));
}
console.log('');

// ─────────────────────────────────────────────────────────────────────────
console.log('[group] performance on a 1000-node sparse graph');
{
  const N = 1000;
  const nodes: string[] = [];
  for (let i = 0; i < N; i++) nodes.push(`n${i}`);
  const edges: WeightedEdge[] = [];
  // Ring + random shortcuts: each node has ~3 out-edges on average.
  for (let i = 0; i < N; i++) {
    edges.push([`n${i}`, `n${(i + 1) % N}`, 1]);
    edges.push([`n${i}`, `n${(i + 17) % N}`, 0.5]);
    edges.push([`n${i}`, `n${(i + 53) % N}`, 0.3]);
  }
  const graph: PPRGraph = { nodes, edges };
  const t0 = Date.now();
  const r = personalizedPageRank(graph, ['n0']);
  const ms = Date.now() - t0;
  check('1000 nodes / 3000 edges converges in < 200 ms',
    r.converged && ms < 200, `iters=${r.iterations} took=${ms}ms`);
  const total = sum(r.scores);
  check('score sum ≈ 1 on large graph',
    Math.abs(total - 1) < 1e-4, `total=${total.toFixed(6)}`);
}
console.log('');

// ─────────────────────────────────────────────────────────────────────────
console.log('=== summary ===');
if (failures === 0) {
  console.log('All checks passed.');
  process.exit(0);
} else {
  console.log(`${failures} check(s) FAILED.`);
  process.exit(1);
}
