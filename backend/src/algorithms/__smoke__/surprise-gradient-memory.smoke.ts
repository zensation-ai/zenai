/**
 * Standalone smoke for surprise-gradient-memory (Phase H6.3).
 *
 * Sanity checks (no API, no DB, no Jest):
 *   - computeVFEContribution: sign + magnitude follow inputs
 *   - updateVFEDelta: EMA math, clamps, defensive inputs
 *   - applyVFERetrievalBoost: ± delta moves score, clamps at 0
 *   - applyVFEIntervalShrink: |delta|-based, floor respected
 *   - integration: convergence on stable surprise stream
 *
 * Run via:
 *   cd backend && npx tsx src/algorithms/__smoke__/surprise-gradient-memory.smoke.ts
 */

import {
  computeVFEContribution,
  updateVFEDelta,
  batchUpdateVFEDeltas,
  applyVFERetrievalBoost,
  applyVFEIntervalShrink,
} from '../surprise-gradient-memory';

let failures = 0;
function check(name: string, ok: boolean, detail?: string): void {
  const tag = ok ? 'PASS' : 'FAIL';
  // eslint-disable-next-line no-console
  console.log(`[${tag}] ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

// eslint-disable-next-line no-console
console.log('=== surprise-gradient-memory smoke ===\n');

// ─────────────────────────────────────────────────────────────────────────
console.log('[group] computeVFEContribution');
{
  check('zero error → 0', computeVFEContribution({ predictionError: 0 }) === 0);
  check(
    '1.0 × 1.0 conf → 1.0',
    computeVFEContribution({ predictionError: 1.0, confidence: 1.0 }) === 1.0,
  );
  check(
    'default sign is +1',
    computeVFEContribution({ predictionError: 0.5 }) === 0.5,
  );
  check(
    'signHint=-1 negative',
    computeVFEContribution({ predictionError: 0.5, signHint: -1 }) === -0.5,
  );
  check(
    'signHint=0 zero',
    computeVFEContribution({ predictionError: 0.5, signHint: 0 }) === 0,
  );
  check(
    'over-error saturates at 1',
    computeVFEContribution({ predictionError: 5 }, { errorScale: 1 }) === 1,
  );
  check(
    'NaN error → 0',
    computeVFEContribution({ predictionError: NaN }) === 0,
  );
  check(
    'negative error clamps to 0',
    computeVFEContribution({ predictionError: -3 }) === 0,
  );
  check(
    'errorScale=0 throws',
    (() => {
      try {
        computeVFEContribution({ predictionError: 1 }, { errorScale: 0 });
        return false;
      } catch {
        return true;
      }
    })(),
  );
}

// ─────────────────────────────────────────────────────────────────────────
console.log('\n[group] updateVFEDelta — EMA math');
{
  // Default lr=0.10, current=0, obs=1.0 → contribution=1.0 → 0.10
  check(
    'lr=0.10 + zero current + obs 1.0 → 0.10',
    Math.abs(updateVFEDelta(0, { predictionError: 1.0 }) - 0.10) < 1e-9,
  );
  // Decay only: current=0.5, obs=0 → 0.5 × 0.9 = 0.45
  check(
    'pure decay 0.5 × 0.9 = 0.45',
    Math.abs(updateVFEDelta(0.5, { predictionError: 0 }) - 0.45) < 1e-9,
  );
  // lr=1.0 → fully overwrite
  check(
    'lr=1.0 fully overwrites',
    Math.abs(
      updateVFEDelta(0.9, { predictionError: 0.2 }, { learningRate: 1 }) - 0.2,
    ) < 1e-9,
  );

  // Clamp at maxMagnitude
  const high = updateVFEDelta(
    0.95,
    { predictionError: 5, signHint: 1 },
    { learningRate: 0.5, maxMagnitude: 1 },
  );
  check('high clamps at +maxMagnitude', high <= 1.0 && high >= 0.97);

  const low = updateVFEDelta(
    -0.95,
    { predictionError: 5, signHint: -1 },
    { learningRate: 0.5, maxMagnitude: 1 },
  );
  check('low clamps at -maxMagnitude', low >= -1.0 && low <= -0.97);

  // NaN current treated as 0
  const recovered = updateVFEDelta(NaN, { predictionError: 1 });
  check('NaN current → recovered to 0.10', Math.abs(recovered - 0.10) < 1e-9);

  // 50 zero observations → near 0
  let d = 0.9;
  for (let i = 0; i < 50; i++) d = updateVFEDelta(d, { predictionError: 0 });
  check('50 zero obs decay near 0', Math.abs(d) < 0.01, `d=${d.toFixed(5)}`);
}

// ─────────────────────────────────────────────────────────────────────────
console.log('\n[group] batchUpdateVFEDeltas');
{
  const next = batchUpdateVFEDeltas(
    [0, 0.5, -0.3],
    [
      { predictionError: 1.0 },
      { predictionError: 0 },
      { predictionError: 0.5, signHint: -1 },
    ],
  );
  check('order-preserving 3 outputs', next.length === 3);
  check('element 0: 0 + 0.10 = 0.10', Math.abs(next[0] - 0.10) < 1e-9);
  check('element 1: 0.5 × 0.9 = 0.45', Math.abs(next[1] - 0.45) < 1e-9);
  check('element 2: -0.3 × 0.9 + -0.05 = -0.32', Math.abs(next[2] - -0.32) < 1e-9);

  let threwOnMismatch = false;
  try {
    batchUpdateVFEDeltas([0, 0], [{ predictionError: 1 }]);
  } catch {
    threwOnMismatch = true;
  }
  check('length mismatch throws', threwOnMismatch);
  check('empty inputs → empty output', batchUpdateVFEDeltas([], []).length === 0);
}

// ─────────────────────────────────────────────────────────────────────────
console.log('\n[group] applyVFERetrievalBoost');
{
  check(
    '+1.0 delta lifts 0.5 → 0.55',
    Math.abs(applyVFERetrievalBoost(0.5, 1.0) - 0.55) < 1e-9,
  );
  check(
    '-1.0 delta cuts 0.5 → 0.45',
    Math.abs(applyVFERetrievalBoost(0.5, -1.0) - 0.45) < 1e-9,
  );
  check('zero delta is no-op', applyVFERetrievalBoost(0.5, 0) === 0.5);
  check(
    'custom alpha=0.5 + delta=1.0 → 1.5',
    Math.abs(applyVFERetrievalBoost(1.0, 1.0, { alpha: 0.5 }) - 1.5) < 1e-9,
  );
  check(
    'extreme alpha cannot push score below 0',
    applyVFERetrievalBoost(1.0, -1.0, { alpha: 10 }) === 0,
  );
  check('NaN delta is no-op', applyVFERetrievalBoost(0.5, NaN) === 0.5);
}

// ─────────────────────────────────────────────────────────────────────────
console.log('\n[group] applyVFEIntervalShrink');
{
  check('zero delta keeps interval', applyVFEIntervalShrink(10, 0) === 10);
  check(
    '|+1.0| shrinks by 20 % → 8.0',
    Math.abs(applyVFEIntervalShrink(10, 1.0) - 8.0) < 1e-9,
  );
  check(
    '|−1.0| shrinks by 20 % → 8.0 (sign-symmetric)',
    Math.abs(applyVFEIntervalShrink(10, -1.0) - 8.0) < 1e-9,
  );
  check(
    'beta=0.5 + |delta|=1 → 5.0',
    Math.abs(applyVFEIntervalShrink(10, 1.0, { beta: 0.5 }) - 5.0) < 1e-9,
  );
  check(
    'aggressive beta hits floor at 20 % default',
    Math.abs(applyVFEIntervalShrink(10, 1.0, { beta: 0.95 }) - 2.0) < 1e-9,
  );
  check(
    'custom floor 0.5 keeps 5.0 of 10.0 base',
    Math.abs(
      applyVFEIntervalShrink(10, 1.0, { beta: 1.0, intervalFloor: 0.5 }) - 5.0,
    ) < 1e-9,
  );
  check('zero base → 0', applyVFEIntervalShrink(0, 1) === 0);
  check('negative base → 0', applyVFEIntervalShrink(-5, 1) === 0);
  check('NaN delta is no-op', applyVFEIntervalShrink(10, NaN) === 10);
}

// ─────────────────────────────────────────────────────────────────────────
console.log('\n[group] convergence behaviour');
{
  let d = 0;
  for (let i = 0; i < 50; i++) {
    d = updateVFEDelta(d, { predictionError: 1.0, confidence: 1.0 });
  }
  check(
    'sustained +1 surprise stream converges near +1',
    d > 0.9 && d <= 1.0,
    `final d=${d.toFixed(4)}`,
  );

  let alt = 0;
  for (let i = 0; i < 100; i++) {
    alt = updateVFEDelta(alt, {
      predictionError: 1.0,
      signHint: i % 2 === 0 ? 1 : -1,
    });
  }
  check(
    'alternating ±1 surprise stays near 0',
    Math.abs(alt) < 0.2,
    `final |d|=${Math.abs(alt).toFixed(4)}`,
  );
}

// ─────────────────────────────────────────────────────────────────────────
console.log('\n[group] determinism');
{
  const obs = { predictionError: 0.5, confidence: 0.7, signHint: 1 as const };
  const ref = updateVFEDelta(0.3, obs);
  let allMatch = true;
  for (let i = 0; i < 9; i++) {
    if (updateVFEDelta(0.3, obs) !== ref) {
      allMatch = false;
      break;
    }
  }
  check('10× repeat produces identical output', allMatch);
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
