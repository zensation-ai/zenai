/**
 * s1 Wait-Forcing — pure-algo tests (Phase H7.1).
 *
 * Covers:
 *   - LoCoMo category detection on shape-representative queries
 *   - Verbatim instruction template substitution
 *   - applyWaitForcingToSystemPrompt gating (enable/disable, trigger
 *     categories, custom template/variables, observability fields)
 *   - Defensive paths (empty/null/whitespace, no cues at all)
 */

import {
  detectLoCoMoCategory,
  buildWaitForcingInstruction,
  applyWaitForcingToSystemPrompt,
  WAIT_FORCING_INSTRUCTION_TEMPLATE,
  WAIT_FORCING_FOCUS_BY_CATEGORY,
  WAIT_FORCING_LABEL_BY_CATEGORY,
  DEFAULT_TRIGGER_CATEGORIES,
  type LoCoMoCategory,
} from '../../../../services/reasoning/wait-forcing';

describe('detectLoCoMoCategory — heuristic LoCoMo classification', () => {
  it('empty query → unknown with confidence 0', () => {
    const r1 = detectLoCoMoCategory('');
    const r2 = detectLoCoMoCategory('   ');
    const r3 = detectLoCoMoCategory(null as unknown as string);
    expect(r1.category).toBe('unknown');
    expect(r1.confidence).toBe(0);
    expect(r2.category).toBe('unknown');
    expect(r3.category).toBe('unknown');
  });

  it('multi-hop count question → multi_hop', () => {
    const r = detectLoCoMoCategory('How many books did Caroline read about both AI and biology?');
    expect(r.category).toBe('multi_hop');
    expect(r.contributors.multi_hop_cues).toBeGreaterThanOrEqual(2);
    expect(r.confidence).toBeGreaterThan(0.3);
  });

  it('comparison question → multi_hop', () => {
    const r = detectLoCoMoCategory("What's the difference between Alice's plan and Bob's plan?");
    expect(r.category).toBe('multi_hop');
  });

  it('"each of" + "every" → multi_hop', () => {
    const r = detectLoCoMoCategory('List all of the projects Alice mentioned in every meeting.');
    expect(r.category).toBe('multi_hop');
  });

  it('temporal question with relative anchor → temporal', () => {
    const r = detectLoCoMoCategory('What did Caroline say last year about her wedding?');
    expect(r.category).toBe('temporal');
    expect(r.contributors.temporal_cues).toBeGreaterThanOrEqual(1);
  });

  it('temporal question with date → temporal', () => {
    const r = detectLoCoMoCategory('What was Alex doing in January 2024?');
    expect(r.category).toBe('temporal');
  });

  it('"when did" question → temporal', () => {
    const r = detectLoCoMoCategory('When did Bob graduate from Stanford?');
    expect(r.category).toBe('temporal');
  });

  it('"how long ago" question → temporal', () => {
    const r = detectLoCoMoCategory('How long ago did Caroline mention she was studying?');
    expect(r.category).toBe('temporal');
  });

  it('temporal + multi-hop combined query → trigger category (either is acceptable)', () => {
    // Query has BOTH temporal cues (before, May, 2024) AND multi-hop cue
    // (how many). Wait-forcing fires for either, so the production
    // contract is just "lands in a trigger category", not which one.
    const r = detectLoCoMoCategory(
      'How many of Alice and Bob compared homework problems were not solved before May 2024?',
    );
    expect(['multi_hop', 'temporal']).toContain(r.category);
    expect(r.contributors.multi_hop_cues).toBeGreaterThanOrEqual(1);
    expect(r.contributors.temporal_cues).toBeGreaterThanOrEqual(2);
  });

  it('explicit dominance: ≥2 of each → multi_hop wins', () => {
    // Use exact regex matches: "how many" + "every" + "compared to" +
    // "before" + "May" + "2024".
    const r = detectLoCoMoCategory(
      'How many of every meeting before May 2024 had Alice compared to Bob?',
    );
    expect(r.category).toBe('multi_hop');
    expect(r.contributors.multi_hop_cues).toBeGreaterThanOrEqual(2);
    expect(r.contributors.temporal_cues).toBeGreaterThanOrEqual(2);
  });

  it('single-hop with capitalised entity → single_hop', () => {
    const r = detectLoCoMoCategory('Where does Caroline work?');
    expect(r.category).toBe('single_hop');
  });

  it('open-domain catch-all → open_domain', () => {
    const r = detectLoCoMoCategory('the project status seems unclear');
    expect(r.category).toBe('open_domain');
  });

  it('adversarial cue without other signal → adversarial', () => {
    const r = detectLoCoMoCategory('the user did not mention the topic at all');
    expect(r.category).toBe('adversarial');
  });

  it('contributors object reflects all three cue counts', () => {
    const r = detectLoCoMoCategory('When did Alice and Bob compare?');
    expect(Object.keys(r.contributors)).toEqual(
      expect.arrayContaining(['multi_hop_cues', 'temporal_cues', 'adversarial_cues']),
    );
  });

  it('determinism: same input → same output', () => {
    const q = 'How many times did Caroline mention her sister between January and June 2024?';
    const r1 = detectLoCoMoCategory(q);
    const r2 = detectLoCoMoCategory(q);
    expect(r1.category).toBe(r2.category);
    expect(r1.confidence).toBe(r2.confidence);
    expect(r1.contributors).toEqual(r2.contributors);
  });
});

describe('verbatim template constants — byte-equal eval-harness contract', () => {
  it('WAIT_FORCING_INSTRUCTION_TEMPLATE contains placeholders', () => {
    expect(WAIT_FORCING_INSTRUCTION_TEMPLATE).toContain('{{category}}');
    expect(WAIT_FORCING_INSTRUCTION_TEMPLATE).toContain('{{focus}}');
    expect(WAIT_FORCING_INSTRUCTION_TEMPLATE).toContain('Wait, let me think more carefully');
  });

  it('WAIT_FORCING_LABEL_BY_CATEGORY covers every LoCoMoCategory value', () => {
    const allCats: LoCoMoCategory[] = [
      'multi_hop',
      'temporal',
      'open_domain',
      'single_hop',
      'adversarial',
      'unknown',
    ];
    for (const c of allCats) {
      expect(typeof WAIT_FORCING_LABEL_BY_CATEGORY[c]).toBe('string');
      expect(WAIT_FORCING_LABEL_BY_CATEGORY[c].length).toBeGreaterThan(0);
    }
  });

  it('WAIT_FORCING_FOCUS_BY_CATEGORY covers every LoCoMoCategory value', () => {
    const allCats: LoCoMoCategory[] = [
      'multi_hop',
      'temporal',
      'open_domain',
      'single_hop',
      'adversarial',
      'unknown',
    ];
    for (const c of allCats) {
      expect(typeof WAIT_FORCING_FOCUS_BY_CATEGORY[c]).toBe('string');
      expect(WAIT_FORCING_FOCUS_BY_CATEGORY[c].length).toBeGreaterThan(0);
    }
  });

  it('DEFAULT_TRIGGER_CATEGORIES is multi_hop + temporal per spec § H7 task 1', () => {
    expect([...DEFAULT_TRIGGER_CATEGORIES].sort()).toEqual(['multi_hop', 'temporal']);
  });
});

describe('buildWaitForcingInstruction — template substitution', () => {
  it('multi_hop builds with Multi-Hop label + hop focus', () => {
    const out = buildWaitForcingInstruction('multi_hop');
    expect(out).toContain('Multi-Hop');
    expect(out).toContain('every supporting hop');
    expect(out).toContain('Wait, let me think more carefully');
    expect(out).not.toContain('{{category}}');
    expect(out).not.toContain('{{focus}}');
  });

  it('temporal builds with Temporal label + dates focus', () => {
    const out = buildWaitForcingInstruction('temporal');
    expect(out).toContain('Temporal');
    expect(out).toContain('dates precise');
    expect(out).toContain('event ordering');
  });

  it('non-trigger category returns empty string', () => {
    expect(buildWaitForcingInstruction('single_hop')).toBe('');
    expect(buildWaitForcingInstruction('open_domain')).toBe('');
    expect(buildWaitForcingInstruction('unknown')).toBe('');
    expect(buildWaitForcingInstruction('adversarial')).toBe('');
  });

  it('custom triggerCategories include extra category', () => {
    const out = buildWaitForcingInstruction('single_hop', {
      triggerCategories: ['single_hop'],
    });
    expect(out).toContain('Single-Hop');
    expect(out.length).toBeGreaterThan(0);
  });

  it('custom template overrides default', () => {
    const out = buildWaitForcingInstruction('multi_hop', {
      template: 'WAIT[{{category}}/{{focus}}]',
    });
    expect(out).toBe(
      'WAIT[Multi-Hop/have I followed every supporting hop, or did I skip an intermediate step]',
    );
  });

  it('caller-supplied variables override per-category defaults', () => {
    const out = buildWaitForcingInstruction('multi_hop', {
      template: '[{{category}}|{{focus}}]',
      variables: { focus: 'CUSTOM_FOCUS' },
    });
    expect(out).toBe('[Multi-Hop|CUSTOM_FOCUS]');
  });
});

describe('applyWaitForcingToSystemPrompt — production wrapper', () => {
  const BASE = 'You are a helpful assistant.';

  it('enable=false → identity prompt, applied=false', () => {
    const r = applyWaitForcingToSystemPrompt(BASE, 'How many people did Alice meet?');
    expect(r.prompt).toBe(BASE);
    expect(r.applied).toBe(false);
    expect(r.category).toBe('multi_hop');
  });

  it('enable=true + multi_hop query → augmented prompt', () => {
    const r = applyWaitForcingToSystemPrompt(BASE, 'How many people did Alice meet?', {
      enable: true,
    });
    expect(r.prompt.length).toBeGreaterThan(BASE.length);
    expect(r.prompt).toContain('Multi-Hop');
    expect(r.prompt).toContain('Wait, let me think more carefully');
    expect(r.applied).toBe(true);
    expect(r.category).toBe('multi_hop');
    expect(r.confidence).toBeGreaterThan(0);
  });

  it('enable=true + temporal query → temporal-flavoured augmentation', () => {
    const r = applyWaitForcingToSystemPrompt(BASE, 'When did Bob graduate?', {
      enable: true,
    });
    expect(r.applied).toBe(true);
    expect(r.category).toBe('temporal');
    expect(r.prompt).toContain('Temporal');
    expect(r.prompt).toContain('dates precise');
  });

  it('enable=true + single_hop query → NOT augmented (not in default triggers)', () => {
    const r = applyWaitForcingToSystemPrompt(BASE, 'Where does Caroline work?', {
      enable: true,
    });
    expect(r.applied).toBe(false);
    expect(r.category).toBe('single_hop');
    expect(r.prompt).toBe(BASE);
  });

  it('custom triggerCategories include single_hop', () => {
    const r = applyWaitForcingToSystemPrompt(BASE, 'Where does Caroline work?', {
      enable: true,
      triggerCategories: ['multi_hop', 'temporal', 'single_hop'],
    });
    expect(r.applied).toBe(true);
    expect(r.prompt).toContain('Single-Hop');
  });

  it('empty query → unknown category, no augmentation', () => {
    const r = applyWaitForcingToSystemPrompt(BASE, '', { enable: true });
    expect(r.applied).toBe(false);
    expect(r.category).toBe('unknown');
    expect(r.prompt).toBe(BASE);
  });

  it('custom template with extra variables resolves all placeholders', () => {
    const r = applyWaitForcingToSystemPrompt(BASE, 'How many?', {
      enable: true,
      template: 'X-{{category}}-{{focus}}-{{custom}}',
      variables: { custom: 'EXTRA' },
    });
    expect(r.applied).toBe(true);
    expect(r.prompt.endsWith('X-Multi-Hop-have I followed every supporting hop, or did I skip an intermediate step-EXTRA')).toBe(true);
  });

  it('augmented prompt is base + snippet (concatenation contract)', () => {
    const r = applyWaitForcingToSystemPrompt(BASE, 'How many?', { enable: true });
    expect(r.prompt.startsWith(BASE)).toBe(true);
    // Augmentation begins with a leading double-newline.
    expect(r.prompt.slice(BASE.length).startsWith('\n\n')).toBe(true);
  });
});
