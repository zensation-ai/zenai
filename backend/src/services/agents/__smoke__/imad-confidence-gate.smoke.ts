/**
 * Smoke checks for iMAD confidence-gate (Phase H7.2).
 * Run via: npx tsx backend/src/services/agents/__smoke__/imad-confidence-gate.smoke.ts
 */

import {
  evaluateIMADConfidenceGate,
  LOCOMO_IMAD_CONFIDENCE_THRESHOLD,
  type SelfCritique,
} from '../imad-debate';

let passed = 0;
let failed = 0;

function check(label: string, cond: boolean, detail?: string) {
  if (cond) {
    passed++;
    console.log('  ✓', label);
  } else {
    failed++;
    console.log('  ✗', label, detail ? `[${detail}]` : '');
  }
}

console.log('\n=== LOCOMO_IMAD_CONFIDENCE_THRESHOLD ===');
check(
  'matches spec § H7 task 2 = 0.65',
  LOCOMO_IMAD_CONFIDENCE_THRESHOLD === 0.65,
);

console.log('\n=== gate disabled (default off) ===');
{
  delete process.env.H7_IMAD_CONFIDENCE_GATE;
  const r = evaluateIMADConfidenceGate(0.1);
  check('disabled → shouldDebate=false', !r.shouldDebate);
  check('disabled → gateMode=disabled', r.gateMode === 'disabled');
}

console.log('\n=== confidence-only path (gate enabled) ===');
{
  const high = evaluateIMADConfidenceGate(0.85, { enable: true });
  check('confidence 0.85 → high_confidence', high.gateMode === 'high_confidence');
  check('confidence 0.85 → no debate', !high.shouldDebate);

  const at = evaluateIMADConfidenceGate(0.65, { enable: true });
  check('confidence 0.65 (=threshold) → high_confidence', at.gateMode === 'high_confidence');

  const low = evaluateIMADConfidenceGate(0.4, { enable: true });
  check('confidence 0.4 → low_confidence', low.gateMode === 'low_confidence');
  check('confidence 0.4 → debate', low.shouldDebate);
}

console.log('\n=== with self-critique (iMAD secondary gate) ===');
{
  const lowHes: SelfCritique = {
    initialReasoning: 'The answer is Alice based on the conversation in May 2024.',
    counterArgument: 'No counter-argument; evidence is clear.',
    initialConfidence: 0.9,
    counterConfidence: 0.95,
  };
  const highHes: SelfCritique = {
    initialReasoning: 'I think might be Alice but maybe Bob, possibly Caroline.',
    counterArgument:
      'However, on the other hand, this contradicts the earlier claim. Although uncertain, perhaps the answer is different.',
    initialConfidence: 0.4,
    counterConfidence: 0.6,
  };

  const a = evaluateIMADConfidenceGate(0.4, { enable: true, selfCritique: lowHes });
  check(
    'low conf + low hesitation → suppressed',
    a.gateMode === 'low_confidence_iMAD_suppressed' && !a.shouldDebate,
  );

  const b = evaluateIMADConfidenceGate(0.4, { enable: true, selfCritique: highHes });
  check(
    'low conf + high hesitation → debate',
    b.gateMode === 'low_confidence_iMAD' && b.shouldDebate,
  );

  const c = evaluateIMADConfidenceGate(0.85, { enable: true, selfCritique: highHes });
  check(
    'high conf overrides high hesitation',
    c.gateMode === 'high_confidence' && !c.shouldDebate,
  );

  const d = evaluateIMADConfidenceGate(null, { enable: true, selfCritique: highHes });
  check(
    'null conf + high hesitation → critique_only',
    d.gateMode === 'critique_only' && d.shouldDebate,
  );

  const e = evaluateIMADConfidenceGate(null, { enable: true, selfCritique: lowHes });
  check(
    'null conf + low hesitation → critique_suppressed',
    e.gateMode === 'critique_suppressed' && !e.shouldDebate,
  );
}

console.log('\n=== custom threshold + safe defaults ===');
{
  const tight = evaluateIMADConfidenceGate(0.7, { enable: true, threshold: 0.8 });
  check('custom threshold 0.8 + conf 0.7 → low_confidence', tight.gateMode === 'low_confidence');

  const nullConf = evaluateIMADConfidenceGate(null, { enable: true });
  check(
    'null conf + no critique → debate (safe default)',
    nullConf.shouldDebate && nullConf.gateMode === 'low_confidence',
  );

  const nan = evaluateIMADConfidenceGate(NaN, { enable: true });
  check('NaN treated as null', nan.gateMode === 'low_confidence');

  const inf = evaluateIMADConfidenceGate(Infinity, { enable: true });
  check('Infinity treated as null', inf.gateMode === 'low_confidence');
}

console.log('\n=== telemetry shape ===');
{
  const r = evaluateIMADConfidenceGate(0.5, { enable: true });
  check('decision has confidence field', r.confidence === 0.5);
  check('decision has thresholdUsed', r.thresholdUsed === LOCOMO_IMAD_CONFIDENCE_THRESHOLD);
  check('decision has reason string', typeof r.reason === 'string' && r.reason.length > 0);
}

console.log('\n=== summary ===');
console.log(`  passed: ${passed}`);
console.log(`  failed: ${failed}`);
if (failed > 0) {
  console.log('\nFAILED');
  process.exit(1);
}
console.log('all checks passed');
