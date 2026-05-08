/**
 * Standalone smoke for dopamine-routing.
 *
 * Sanity checks (no API, no DB, no Jest):
 *   - empty query → fast_cache, bypass note set
 *   - LoCoMo-shape queries land in expected difficulty bands
 *   - contributors stack additively (clamped to 1.0)
 *   - forceFullScan / externalDifficulty bypass paths dominate heuristic
 *   - hybridBand=0 produces only fast_cache or full_scan
 *   - routeToHybridOptions returns the documented flag bag per route
 *   - determinism: same input → same output (10× repeat)
 *
 * Run via:
 *   cd backend && npx tsx src/algorithms/__smoke__/dopamine-routing.smoke.ts
 */

import {
  routeRetrieval,
  routeToHybridOptions,
  type DifficultySignal,
} from '../dopamine-routing';

let failures = 0;
function check(name: string, ok: boolean, detail?: string): void {
  const tag = ok ? 'PASS' : 'FAIL';
  // eslint-disable-next-line no-console
  console.log(`[${tag}] ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

// eslint-disable-next-line no-console
console.log('=== dopamine-routing smoke ===\n');

// ─────────────────────────────────────────────────────────────────────────
console.log('[group] empty / degenerate inputs');
{
  const empty = routeRetrieval('');
  check('empty query → fast_cache', empty.route === 'fast_cache');
  check('empty query → difficulty 0', empty.difficulty === 0);
  check('empty query → bypass note set', empty.bypassReason.includes('empty'));

  const whitespace = routeRetrieval('     \t\n   ');
  check('whitespace-only → fast_cache', whitespace.route === 'fast_cache');
}

// ─────────────────────────────────────────────────────────────────────────
console.log('\n[group] LoCoMo-shape queries land in expected bands');
{
  const single = routeRetrieval('When did Caroline graduate?');
  check(
    'single-hop "When did Caroline graduate?" — difficulty < 0.5',
    single.difficulty < 0.5,
    `got ${single.difficulty.toFixed(3)} → ${single.route}`,
  );

  const multiHop = routeRetrieval(
    "Who taught both Alice and Bob in their math classes?",
  );
  check(
    'multi-hop with multi-entity > single-hop baseline',
    multiHop.difficulty > single.difficulty,
    `multi=${multiHop.difficulty.toFixed(3)} > single=${single.difficulty.toFixed(3)}`,
  );
  check(
    'multi-hop fires multi_clause contributor',
    multiHop.contributors.multi_clause > 0,
  );
  check(
    'multi-hop fires multi_entity contributor',
    multiHop.contributors.multi_entity > 0,
  );

  const stacked = routeRetrieval(
    "How many of Alice and Bob's compared homework problems were not solved?",
  );
  check(
    'stacked (count + comparison + negation) ≥ 0.5',
    stacked.difficulty >= 0.5,
    `got ${stacked.difficulty.toFixed(3)}`,
  );
  check(
    'stacked routes to hybrid or full_scan',
    stacked.route === 'hybrid' || stacked.route === 'full_scan',
  );

  const temporal = routeRetrieval('What did Caroline say last year?');
  check(
    'temporal anchor "last year" fires contributor',
    temporal.contributors.temporal === 0.10,
  );
}

// ─────────────────────────────────────────────────────────────────────────
console.log('\n[group] contributor invariants');
{
  const sig = routeRetrieval('How did Alice compared to Bob fare last year?');
  const sum = Object.values(sig.contributors).reduce((a, v) => a + v, 0);
  check(
    'difficulty equals min(sum, 1.0)',
    Math.abs(sig.difficulty - Math.min(sum, 1)) < 1e-9,
    `sum=${sum.toFixed(4)}, difficulty=${sig.difficulty.toFixed(4)}`,
  );
  check(
    'every contributor is in [0, 1]',
    Object.values(sig.contributors).every((v) => v >= 0 && v <= 1),
  );
}

// ─────────────────────────────────────────────────────────────────────────
console.log('\n[group] bypass paths');
{
  const force = routeRetrieval('trivial query', { forceFullScan: true });
  check('forceFullScan → full_scan route', force.route === 'full_scan');
  check('forceFullScan → difficulty 1.0', force.difficulty === 1.0);
  check('forceFullScan → bypass note set', force.bypassReason.length > 0);

  const ext = routeRetrieval('trivial', {}, { externalDifficulty: 0.95 });
  check('external 0.95 → full_scan', ext.route === 'full_scan');
  check('external bypass note set', ext.bypassReason.includes('external'));

  const extZero = routeRetrieval(
    "Who taught both Alice and Bob in their math classes?",
    {},
    { externalDifficulty: 0 },
  );
  check(
    'external 0 overrides high-heuristic query',
    extZero.route === 'fast_cache',
  );

  const extHigh = routeRetrieval('q', {}, { externalDifficulty: 5 });
  check('external clamped to 1', extHigh.difficulty === 1);
  const extLow = routeRetrieval('q', {}, { externalDifficulty: -3 });
  check('external clamped to 0', extLow.difficulty === 0);
}

// ─────────────────────────────────────────────────────────────────────────
console.log('\n[group] hybrid band behaviour');
{
  const queries = [
    'What is the capital of France?',
    'How many cookies?',
    'Compared to last year, how is the weather?',
    'Who are Alice and Bob?',
  ];
  let hybridCount = 0;
  for (const q of queries) {
    const sig = routeRetrieval(q, { hybridBand: 0 });
    if (sig.route === 'hybrid') hybridCount++;
  }
  check(
    'hybridBand=0 disables hybrid (no query routes there)',
    hybridCount === 0,
    `${hybridCount} hybrid out of ${queries.length}`,
  );

  const wide = routeRetrieval('How did Alice compared to Bob?', {
    surpriseThreshold: 0.4,
    hybridBand: 0.5, // Very wide band — almost everything lands in hybrid.
  });
  check(
    'wide hybridBand catches mid-difficulty queries',
    wide.route === 'hybrid' || wide.route === 'fast_cache',
    `route=${wide.route}, difficulty=${wide.difficulty.toFixed(3)}`,
  );
}

// ─────────────────────────────────────────────────────────────────────────
console.log('\n[group] routeToHybridOptions flag bag');
{
  const fast = routeToHybridOptions('fast_cache');
  check(
    'fast_cache: vector + BM25 only',
    fast.enableVector && fast.enableBM25 &&
      !fast.enableGraph && !fast.enableCommunity &&
      !fast.enableEventAware && !fast.enablePPR,
  );

  const hybrid = routeToHybridOptions('hybrid');
  check(
    'hybrid: graph + PPR on, community + event off',
    hybrid.enableGraph && hybrid.enablePPR &&
      !hybrid.enableCommunity && !hybrid.enableEventAware,
  );

  const full = routeToHybridOptions('full_scan');
  check(
    'full_scan: every strategy on',
    full.enableVector && full.enableGraph && full.enableCommunity &&
      full.enableBM25 && full.enableEventAware && full.enablePPR,
  );
}

// ─────────────────────────────────────────────────────────────────────────
console.log('\n[group] determinism');
{
  const q = 'How did Alice compared to Bob fare last year on the exam?';
  const first = routeRetrieval(q);
  let allMatch = true;
  for (let i = 0; i < 9; i++) {
    const sig: DifficultySignal = routeRetrieval(q);
    if (sig.difficulty !== first.difficulty || sig.route !== first.route) {
      allMatch = false;
      break;
    }
  }
  check('10× repeat produces identical signal', allMatch);
}

// ─────────────────────────────────────────────────────────────────────────
console.log('\n[group] recent-miss bonus');
{
  const sig0 = routeRetrieval('What is the capital?', {}, {});
  const sig1 = routeRetrieval('What is the capital?', {}, {
    recentMisses: ['previous miss'],
  });
  check(
    '1 miss bumps recent_miss to 0.05',
    Math.abs(sig1.contributors.recent_miss - 0.05) < 1e-9,
  );
  check(
    'difficulty rises by exactly the bonus',
    Math.abs((sig1.difficulty - sig0.difficulty) - 0.05) < 1e-6,
    `Δ=${(sig1.difficulty - sig0.difficulty).toFixed(4)}`,
  );

  const sig10 = routeRetrieval('q', {}, {
    recentMisses: Array.from({ length: 10 }, (_, i) => `m${i}`),
  });
  check('many misses cap at 0.10', sig10.contributors.recent_miss === 0.10);
}

// ─────────────────────────────────────────────────────────────────────────
console.log('\n=== summary ===');
if (failures === 0) {
  // eslint-disable-next-line no-console
  console.log('all checks passed');
} else {
  // eslint-disable-next-line no-console
  console.error(`${failures} checks failed`);
  process.exit(1);
}
