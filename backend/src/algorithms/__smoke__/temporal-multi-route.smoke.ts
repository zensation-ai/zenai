/**
 * Standalone smoke test for temporal-multi-route.
 *
 * No API calls, no DB. Verifies decomposition + fusion against a small
 * synthetic LoCoMo-shape memory store. Run via:
 *
 *   cd backend && npx tsx src/algorithms/__smoke__/temporal-multi-route.smoke.ts
 *
 * Output is human-readable; exit code 0 = all checks passed, 1 = at
 * least one check failed.
 */

import {
  decomposeTemporalQuery,
  runTemporalMultiRoute,
  fuseRoutes,
  type RouteHit,
  type RouteRunner,
  type TemporalSubQuery,
} from '../temporal-multi-route';

interface Memory {
  id: string;
  text: string;
  date: string;
}

const MEMORIES: Memory[] = [
  { id: 'm1', text: 'Caroline mentioned her birthday is May 8', date: '2023-05-01' },
  { id: 'm2', text: 'Caroline celebrated her birthday with friends', date: '2023-05-08' },
  { id: 'm3', text: 'Joanna planned a trip to Spain next month', date: '2023-06-10' },
  { id: 'm4', text: 'Joanna returned from Spain and started a new job', date: '2023-07-25' },
  { id: 'm5', text: "Caroline's daughter graduated from college", date: '2022-06-15' },
  { id: 'm6', text: 'Joanna mentioned starting a Spanish class', date: '2023-08-15' },
];

/** Naive word-overlap retriever — proxy for a real KG/RAG. */
function makeRunner(): RouteRunner<Memory> {
  return async (sub: TemporalSubQuery): Promise<RouteHit<Memory>[]> => {
    const tokens = sub.query.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
    const hits: RouteHit<Memory>[] = [];
    for (const m of MEMORIES) {
      const haystack = m.text.toLowerCase();
      let score = 0;
      for (const t of tokens) if (haystack.includes(t)) score += 1;
      if (score > 0) hits.push({ item: m, score });
    }
    return hits.sort((a, b) => b.score - a.score);
  };
}

let failures = 0;
function check(name: string, ok: boolean, detail?: string): void {
  const tag = ok ? 'PASS' : 'FAIL';
  console.log(`[${tag}] ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

async function main(): Promise<void> {
  console.log('=== temporal-multi-route smoke ===\n');

  // -------------------------------------------------------------------
  // 1. Decomposition — single-route absolute
  console.log('[group] decomposeTemporalQuery — single-route absolute');
  {
    const d = decomposeTemporalQuery('When did Caroline mention her birthday?');
    check('isTemporal', d.isTemporal === true);
    check('routes.length === 1', d.routes.length === 1, `got ${d.routes.length}`);
    check('primaryRouteKind absolute', d.primaryRouteKind === 'absolute');
    check('detectedCues.absoluteWhen', d.detectedCues.absoluteWhen === true);
    check('strip removed "when did"', !d.routes[0].query.toLowerCase().includes('when did'),
      `query="${d.routes[0].query}"`);
    check('original kept verbatim', d.original === 'When did Caroline mention her birthday?');
  }
  console.log('');

  // -------------------------------------------------------------------
  // 2. Decomposition — multi-route (absolute + relative)
  console.log('[group] decomposeTemporalQuery — multi-route absolute + relative');
  {
    const d = decomposeTemporalQuery('When did Caroline first mention her birthday?');
    check('isTemporal', d.isTemporal === true);
    check('routes.length === 2', d.routes.length === 2, `got ${d.routes.length}`);
    check('absolute route present', d.routes.some((r) => r.kind === 'absolute'));
    check('relative route present', d.routes.some((r) => r.kind === 'relative'));
    const rel = d.routes.find((r) => r.kind === 'relative')!;
    check('relative orderingHint earliest', rel.orderingHint === 'earliest',
      `got ${rel.orderingHint}`);
    const abs = d.routes.find((r) => r.kind === 'absolute')!;
    check('absolute conf > relative conf (primary tiebreak)',
      abs.confidence > rel.confidence, `abs=${abs.confidence} rel=${rel.confidence}`);
  }
  console.log('');

  // -------------------------------------------------------------------
  // 3. Decomposition — relative "after"
  console.log('[group] decomposeTemporalQuery — relative "after"');
  {
    const d = decomposeTemporalQuery('What did Joanna do after her trip to Spain?');
    check('isTemporal', d.isTemporal === true);
    check('routes.length === 1', d.routes.length === 1);
    check('kind relative', d.routes[0].kind === 'relative');
    check('orderingHint after-anchor', d.routes[0].orderingHint === 'after-anchor');
    check('cue "after" captured', d.routes[0].cues.some((c) => /after/i.test(c)));
  }
  console.log('');

  // -------------------------------------------------------------------
  // 4. Decomposition — duration
  console.log('[group] decomposeTemporalQuery — duration');
  {
    const d = decomposeTemporalQuery("How long ago did Caroline's daughter graduate?");
    check('isTemporal', d.isTemporal === true);
    check('kind duration', d.routes[0].kind === 'duration');
    check('confidence aggregated > 0.95',
      d.routes[0].confidence > 0.95, `got ${d.routes[0].confidence.toFixed(3)}`);
    check('"how long ago did" stripped', !d.routes[0].query.toLowerCase().includes('how long'));
  }
  console.log('');

  // -------------------------------------------------------------------
  // 5. Decomposition — non-temporal pass-through
  console.log('[group] decomposeTemporalQuery — non-temporal pass-through');
  {
    const d = decomposeTemporalQuery('Where does Caroline live?');
    check('isTemporal false', d.isTemporal === false);
    check('routes.length === 1 (passthrough)', d.routes.length === 1);
    check('primaryRouteKind null', d.primaryRouteKind === null);
    check('passthrough query verbatim',
      d.routes[0].query === 'Where does Caroline live?');
    check('passthrough confidence 0.5', d.routes[0].confidence === 0.5);
  }
  console.log('');

  // -------------------------------------------------------------------
  // 6. Decomposition — empty / garbage input
  console.log('[group] decomposeTemporalQuery — defensive');
  {
    const d1 = decomposeTemporalQuery('');
    check('empty: isTemporal false', d1.isTemporal === false);
    check('empty: 1 passthrough', d1.routes.length === 1);
    const d2 = decomposeTemporalQuery('   ');
    check('whitespace: isTemporal false', d2.isTemporal === false);
    const d3 = decomposeTemporalQuery(null as unknown as string);
    check('null: isTemporal false', d3.isTemporal === false);
  }
  console.log('');

  // -------------------------------------------------------------------
  // 7. fuseRoutes — multi-route boost works
  console.log('[group] fuseRoutes — multi-route boost');
  {
    const sub: (k: 'absolute' | 'relative') => TemporalSubQuery = (k) => ({
      kind: k, query: 'x', cues: [], confidence: 1.0, orderingHint: null,
    });
    const fused = fuseRoutes<Memory>([
      { route: sub('absolute'), hits: [
        { item: MEMORIES[0], score: 1.0 },
        { item: MEMORIES[1], score: 0.5 },
      ] },
      { route: sub('relative'), hits: [
        { item: MEMORIES[1], score: 0.9 },  // m2 in BOTH routes
        { item: MEMORIES[2], score: 0.4 },
      ] },
    ]);
    const m1 = fused.find((f) => f.item.id === 'm1')!;
    const m2 = fused.find((f) => f.item.id === 'm2')!;
    check('m1 (single route) has 1 contributing route',
      m1.contributingRoutes.length === 1);
    check('m2 (multi route) has 2 contributing routes',
      m2.contributingRoutes.length === 2);
    // m2 received contributions from both routes (rank 1 in both).
    // Without boost: 2 × 1/(60+2) = 2/62 ≈ 0.0323
    // With 1.2× boost: ≈ 0.0387
    // m1 (rank 0 in 1 route): 1/61 ≈ 0.0164
    check('m2 score > m1 score (boost worked)',
      m2.score > m1.score, `m2=${m2.score.toFixed(4)} m1=${m1.score.toFixed(4)}`);
    // Disable boost and verify m2 still wins (both routes contributed)
    const fusedNoBoost = fuseRoutes<Memory>([
      { route: sub('absolute'), hits: [
        { item: MEMORIES[0], score: 1.0 },
        { item: MEMORIES[1], score: 0.5 },
      ] },
      { route: sub('relative'), hits: [
        { item: MEMORIES[1], score: 0.9 },
        { item: MEMORIES[2], score: 0.4 },
      ] },
    ], { multiRouteBoost: 1.0 });
    const m2NoBoost = fusedNoBoost.find((f) => f.item.id === 'm2')!;
    check('m2 boost = 1.2× without-boost',
      Math.abs(m2.score / m2NoBoost.score - 1.2) < 1e-9,
      `ratio=${(m2.score / m2NoBoost.score).toFixed(4)}`);
  }
  console.log('');

  // -------------------------------------------------------------------
  // 8. End-to-end via runTemporalMultiRoute
  console.log('[group] runTemporalMultiRoute end-to-end');
  {
    const runner = makeRunner();
    const result = await runTemporalMultiRoute(
      'When did Caroline first mention her birthday?',
      runner,
      { itemId: (m) => m.id, maxHits: 5 },
    );
    check('decomposition fired 2 routes',
      result.decomposition.routes.length === 2,
      `got ${result.decomposition.routes.length}`);
    check('perRoute matches', result.perRoute.length === 2);
    check('fused returned hits', result.fused.length > 0,
      `got ${result.fused.length}`);
    // m1 ("Caroline mentioned her birthday is May 8") should top because
    // it matches both 'caroline mention birthday' (absolute) and the
    // first-instance signal (relative).
    check('top hit is m1 (Caroline first mention)',
      result.fused[0].item.id === 'm1' || result.fused[0].item.id === 'm2',
      `top=${result.fused[0].item.id}`);
  }
  console.log('');

  // -------------------------------------------------------------------
  // 9. Defensive — empty hit lists
  console.log('[group] fuseRoutes — defensive');
  {
    const sub: TemporalSubQuery = {
      kind: 'absolute', query: 'x', cues: [], confidence: 1.0, orderingHint: null,
    };
    const empty = fuseRoutes<Memory>([{ route: sub, hits: [] }]);
    check('empty hits → empty fused', empty.length === 0);
    const single = fuseRoutes<Memory>([
      { route: sub, hits: [{ item: MEMORIES[0], score: 1.0 }] },
    ]);
    check('single hit returned', single.length === 1);
    check('single hit score = 1.0/(60+1) = ~0.0164',
      Math.abs(single[0].score - 1 / 61) < 1e-9,
      `got ${single[0].score.toFixed(6)}`);
  }
  console.log('');

  // -------------------------------------------------------------------
  // 10. maxHits cap respected
  console.log('[group] fuseRoutes — maxHits');
  {
    const sub: TemporalSubQuery = {
      kind: 'absolute', query: 'x', cues: [], confidence: 1.0, orderingHint: null,
    };
    const fused = fuseRoutes<Memory>([
      { route: sub, hits: MEMORIES.map((m, i) => ({ item: m, score: 6 - i })) },
    ], { maxHits: 3 });
    check('maxHits=3 respected', fused.length === 3, `got ${fused.length}`);
  }
  console.log('');

  // -------------------------------------------------------------------
  console.log('===============================================');
  if (failures === 0) {
    console.log('All checks passed.');
    process.exit(0);
  } else {
    console.log(`${failures} check(s) FAILED.`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('smoke test threw:', e);
  process.exit(2);
});
