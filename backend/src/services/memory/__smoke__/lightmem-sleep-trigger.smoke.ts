/**
 * Standalone smoke for lightmem-sleep-trigger (Phase H6.2).
 *
 * Sanity checks (no API, no DB, no Jest):
 *   - hard-idle path fires regardless of entropy
 *   - dual-signal path requires entropy AND idle ≥ thresholds
 *   - load + routine + tokens contributors move in documented direction
 *   - rpmSaturation knob scales the load contributor
 *   - selectTopKForReplay sorts utility desc with stable id tie-break
 *   - defensive inputs: NaN / negatives / out-of-range values
 *   - determinism: 10× repeat produces identical signal
 *
 * Run via:
 *   cd backend && npx tsx src/services/memory/__smoke__/lightmem-sleep-trigger.smoke.ts
 */

import {
  evaluateSleepGate,
  selectTopKForReplay,
  lightMemToIsIdle,
  type AttentionMetrics,
} from '../lightmem-sleep-trigger';

let failures = 0;
function check(name: string, ok: boolean, detail?: string): void {
  const tag = ok ? 'PASS' : 'FAIL';
  // eslint-disable-next-line no-console
  console.log(`[${tag}] ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

// eslint-disable-next-line no-console
console.log('=== lightmem-sleep-trigger smoke ===\n');

// ─────────────────────────────────────────────────────────────────────────
console.log('[group] hard-idle path');
{
  const heavyButIdle = evaluateSleepGate({
    idleSeconds: 90,
    requestsPerMinute: 60,
    cacheHitRate: 0,
    tokensPerRequest: 5000,
  });
  check('idle ≥ 60s fires regardless of entropy', heavyButIdle.shouldTrigger);
  check('reason mentions hard idle', heavyButIdle.reason.includes('hard idle'));

  const veryShortIdle = evaluateSleepGate({
    idleSeconds: 10,
    requestsPerMinute: 0,
    cacheHitRate: 1.0,
  });
  check(
    'idle < softIdle blocks even at high entropy',
    !veryShortIdle.shouldTrigger,
  );

  const disabled = evaluateSleepGate(
    { idleSeconds: 9999, requestsPerMinute: 60, cacheHitRate: 0 },
    { hardIdleSeconds: 0, entropyThreshold: 0.99 },
  );
  check('hardIdleSeconds=0 disables time-only path', !disabled.shouldTrigger);
}

// ─────────────────────────────────────────────────────────────────────────
console.log('\n[group] entropy + soft-idle dual signal');
{
  const dual = evaluateSleepGate({
    idleSeconds: 35,
    requestsPerMinute: 0,
    cacheHitRate: 0.9,
  });
  check('entropy + idle dual signal fires', dual.shouldTrigger);
  check(
    'entropy contributor is high (load + routine)',
    dual.entropy >= 0.7,
    `entropy=${dual.entropy.toFixed(3)}`,
  );

  const novel = evaluateSleepGate({
    idleSeconds: 45,
    requestsPerMinute: 8,
    cacheHitRate: 0.1,
    tokensPerRequest: 3000,
  });
  check('novel work blocks despite idle ≥ softIdle', !novel.shouldTrigger);
}

// ─────────────────────────────────────────────────────────────────────────
console.log('\n[group] entropy contributors move correctly');
{
  const idle = evaluateSleepGate({
    idleSeconds: 0,
    requestsPerMinute: 0,
    cacheHitRate: 0,
  });
  const busy = evaluateSleepGate({
    idleSeconds: 0,
    requestsPerMinute: 10,
    cacheHitRate: 0,
  });
  check('zero rpm → load contributor 1.0', idle.contributors.load === 1);
  check('saturated rpm → load contributor 0', busy.contributors.load === 0);

  const routine = evaluateSleepGate({
    idleSeconds: 0,
    requestsPerMinute: 5,
    cacheHitRate: 1.0,
  });
  const novel = evaluateSleepGate({
    idleSeconds: 0,
    requestsPerMinute: 5,
    cacheHitRate: 0.0,
  });
  check('cache hit 1.0 → routine 1.0', routine.contributors.routine === 1);
  check('cache hit 0.0 → routine 0', novel.contributors.routine === 0);

  const halfHit = evaluateSleepGate({
    idleSeconds: 0,
    requestsPerMinute: 5,
    cacheHitRate: 0.5,
  });
  check(
    'sqrt-spread: 0.5 hit-rate → routine ≈ 0.71',
    Math.abs(halfHit.contributors.routine - Math.sqrt(0.5)) < 1e-9,
  );

  const noTokens = evaluateSleepGate({
    idleSeconds: 0,
    requestsPerMinute: 0,
    cacheHitRate: 0,
  });
  check('omitted tokensPerRequest → tokens 1.0', noTokens.contributors.tokens === 1);

  const heavy = evaluateSleepGate({
    idleSeconds: 0,
    requestsPerMinute: 0,
    cacheHitRate: 0,
    tokensPerRequest: 10000,
  });
  check(
    'heavy tokens → tokens contributor < 0.05',
    heavy.contributors.tokens < 0.05,
    `got ${heavy.contributors.tokens.toFixed(4)}`,
  );
}

// ─────────────────────────────────────────────────────────────────────────
console.log('\n[group] rpmSaturation knob');
{
  const conservative = evaluateSleepGate(
    { idleSeconds: 0, requestsPerMinute: 5, cacheHitRate: 0 },
    { rpmSaturation: 5 },
  );
  check('rpmSat=5 + rpm=5 → load 0', conservative.contributors.load === 0);

  const aggressive = evaluateSleepGate(
    { idleSeconds: 0, requestsPerMinute: 5, cacheHitRate: 0 },
    { rpmSaturation: 50 },
  );
  check(
    'rpmSat=50 + rpm=5 → load 0.9',
    Math.abs(aggressive.contributors.load - 0.9) < 1e-9,
  );
}

// ─────────────────────────────────────────────────────────────────────────
console.log('\n[group] defensive inputs');
{
  const negIdle = evaluateSleepGate({
    idleSeconds: -10,
    requestsPerMinute: 0,
    cacheHitRate: 0,
  });
  check('negative idleSeconds clamps to 0', negIdle.idleSeconds === 0);

  const negRpm = evaluateSleepGate({
    idleSeconds: 0,
    requestsPerMinute: -5,
    cacheHitRate: 0,
  });
  check('negative rpm clamps to 0 (max load)', negRpm.contributors.load === 1);

  const overHit = evaluateSleepGate({
    idleSeconds: 0,
    requestsPerMinute: 0,
    cacheHitRate: 5,
  });
  check('cacheHitRate > 1 clamps to 1', overHit.contributors.routine === 1);

  const nanHit = evaluateSleepGate({
    idleSeconds: 0,
    requestsPerMinute: 0,
    cacheHitRate: NaN,
  });
  check('NaN cacheHitRate falls back to 0', nanHit.contributors.routine === 0);
}

// ─────────────────────────────────────────────────────────────────────────
console.log('\n[group] selectTopKForReplay');
{
  const mems = [
    { id: 'b', utility: 0.5 },
    { id: 'a', utility: 0.9 },
    { id: 'd', utility: 0.5 },
    { id: 'c', utility: 0.7 },
  ];
  const top2 = selectTopKForReplay(mems, 2);
  check(
    'top-2 utility desc',
    top2.map((m) => m.id).join(',') === 'a,c',
  );
  const top3 = selectTopKForReplay(mems, 3);
  check(
    'tie-break by id alphabetical (b before d at utility=0.5)',
    top3[2].id === 'b',
  );
  check('k=0 → empty', selectTopKForReplay(mems, 0).length === 0);
  check('empty input → empty', selectTopKForReplay([], 5).length === 0);

  const original = mems.slice();
  selectTopKForReplay(mems, 2);
  check(
    'no input mutation',
    mems.every((m, i) => m.id === original[i].id),
  );
}

// ─────────────────────────────────────────────────────────────────────────
console.log('\n[group] lightMemToIsIdle bridge');
{
  check(
    'trigger=true → isIdle=true',
    lightMemToIsIdle({
      shouldTrigger: true,
      entropy: 0.8,
      idleSeconds: 60,
      contributors: {},
      reason: '',
    }),
  );
  check(
    'trigger=false → isIdle=false',
    !lightMemToIsIdle({
      shouldTrigger: false,
      entropy: 0.3,
      idleSeconds: 5,
      contributors: {},
      reason: '',
    }),
  );
}

// ─────────────────────────────────────────────────────────────────────────
console.log('\n[group] determinism');
{
  const m: AttentionMetrics = {
    idleSeconds: 45,
    requestsPerMinute: 2,
    cacheHitRate: 0.8,
    tokensPerRequest: 100,
  };
  const first = evaluateSleepGate(m);
  let allMatch = true;
  for (let i = 0; i < 9; i++) {
    const sig = evaluateSleepGate(m);
    if (
      sig.shouldTrigger !== first.shouldTrigger ||
      sig.entropy !== first.entropy
    ) {
      allMatch = false;
      break;
    }
  }
  check('10× repeat produces identical signal', allMatch);
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
