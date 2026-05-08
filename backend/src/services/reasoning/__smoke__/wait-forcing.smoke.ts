/**
 * Smoke checks for s1 wait-forcing pure module (Phase H7.1).
 * Run via: npx tsx backend/src/services/reasoning/__smoke__/wait-forcing.smoke.ts
 *
 * No API access required. Each line either reports OK or throws.
 */

import {
  detectLoCoMoCategory,
  buildWaitForcingInstruction,
  applyWaitForcingToSystemPrompt,
  WAIT_FORCING_INSTRUCTION_TEMPLATE,
  WAIT_FORCING_LABEL_BY_CATEGORY,
  WAIT_FORCING_FOCUS_BY_CATEGORY,
  DEFAULT_TRIGGER_CATEGORIES,
} from '../wait-forcing';

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

console.log('\n=== detectLoCoMoCategory ===');
{
  const r = detectLoCoMoCategory('');
  check('empty → unknown', r.category === 'unknown' && r.confidence === 0);
}
{
  const r = detectLoCoMoCategory('How many people did Alice meet?');
  check('count question → multi_hop', r.category === 'multi_hop');
}
{
  const r = detectLoCoMoCategory('When did Bob graduate from Stanford?');
  check('"when did" → temporal', r.category === 'temporal');
}
{
  const r = detectLoCoMoCategory('What did Caroline say last year?');
  check('"last year" → temporal', r.category === 'temporal');
}
{
  const r = detectLoCoMoCategory('Where does Caroline work?');
  check('single-hop → single_hop', r.category === 'single_hop');
}
{
  const r = detectLoCoMoCategory('the system feels slow');
  check('no cues → open_domain', r.category === 'open_domain');
}
{
  const r = detectLoCoMoCategory('the user did not mention this at all');
  check('adversarial cue → adversarial', r.category === 'adversarial');
}

console.log('\n=== verbatim template constants ===');
check(
  'INSTRUCTION_TEMPLATE has both placeholders',
  WAIT_FORCING_INSTRUCTION_TEMPLATE.includes('{{category}}') &&
    WAIT_FORCING_INSTRUCTION_TEMPLATE.includes('{{focus}}'),
);
check(
  'INSTRUCTION_TEMPLATE has the literal Wait phrase',
  WAIT_FORCING_INSTRUCTION_TEMPLATE.includes('Wait, let me think more carefully'),
);
check(
  'LABEL covers all categories',
  Object.keys(WAIT_FORCING_LABEL_BY_CATEGORY).length === 6,
);
check(
  'FOCUS covers all categories',
  Object.keys(WAIT_FORCING_FOCUS_BY_CATEGORY).length === 6,
);
check(
  'DEFAULT_TRIGGER_CATEGORIES = [multi_hop, temporal]',
  [...DEFAULT_TRIGGER_CATEGORIES].sort().join(',') === 'multi_hop,temporal',
);

console.log('\n=== buildWaitForcingInstruction ===');
{
  const out = buildWaitForcingInstruction('multi_hop');
  check(
    'multi_hop snippet has Multi-Hop label',
    out.includes('Multi-Hop'),
  );
  check(
    'multi_hop snippet substituted focus',
    out.includes('every supporting hop'),
  );
  check('multi_hop snippet has no unsubstituted vars', !out.includes('{{'));
}
{
  const out = buildWaitForcingInstruction('temporal');
  check('temporal snippet has Temporal label', out.includes('Temporal'));
  check(
    'temporal snippet has dates focus',
    out.includes('dates precise'),
  );
}
{
  const out = buildWaitForcingInstruction('single_hop');
  check('single_hop NOT in default triggers → empty', out === '');
}
{
  const out = buildWaitForcingInstruction('multi_hop', {
    template: 'X-{{category}}-{{focus}}',
  });
  check(
    'custom template works',
    out ===
      'X-Multi-Hop-have I followed every supporting hop, or did I skip an intermediate step',
  );
}

console.log('\n=== applyWaitForcingToSystemPrompt ===');
{
  const r = applyWaitForcingToSystemPrompt('BASE', 'How many?', { enable: false });
  check('disable → identity', r.prompt === 'BASE' && !r.applied);
}
{
  const r = applyWaitForcingToSystemPrompt('BASE', 'How many?', { enable: true });
  check(
    'enable + multi_hop → augmented + applied flag',
    r.applied && r.prompt.startsWith('BASE') && r.prompt.length > 4,
  );
  check(
    'augmented prompt contains Wait phrase',
    r.prompt.includes('Wait, let me think more carefully'),
  );
}
{
  const r = applyWaitForcingToSystemPrompt('BASE', 'When did Bob graduate?', {
    enable: true,
  });
  check(
    'enable + temporal → applied=true + temporal label in prompt',
    r.applied && r.category === 'temporal' && r.prompt.includes('Temporal'),
  );
}
{
  const r = applyWaitForcingToSystemPrompt('BASE', 'Where does Bob work?', {
    enable: true,
  });
  check(
    'enable + single_hop → not applied (default triggers)',
    !r.applied && r.category === 'single_hop' && r.prompt === 'BASE',
  );
}
{
  const r = applyWaitForcingToSystemPrompt('BASE', '', { enable: true });
  check(
    'enable + empty query → unknown, not applied, identity',
    !r.applied && r.category === 'unknown' && r.prompt === 'BASE',
  );
}
{
  const r = applyWaitForcingToSystemPrompt('BASE', 'Where does Bob work?', {
    enable: true,
    triggerCategories: ['multi_hop', 'temporal', 'single_hop'],
  });
  check(
    'custom triggers include single_hop → applied',
    r.applied && r.prompt.includes('Single-Hop'),
  );
}

console.log('\n=== summary ===');
console.log(`  passed: ${passed}`);
console.log(`  failed: ${failed}`);
if (failed > 0) {
  console.log('\nFAILED');
  process.exit(1);
}
console.log('all checks passed');
