/**
 * Tests for services/memory/persona-block-builder (H3.6).
 *
 * Coverage:
 *   - clusterFactsBySpeaker: groups by speaker, preserves first-appearance
 *     order, dedupes within cluster, empty-speaker bucket.
 *   - renderPersonaBlock: header substitution, bullet formatting,
 *     maxFacts truncation, empty-cluster handling, custom header/bullet.
 *   - renderAllPersonaBlocks: skips empty-speaker bucket and zero-fact
 *     clusters; joins with double newline.
 *   - assemblePersonaAwareContext: both populated / only persona / only
 *     evidence / both empty paths; custom titles + separator.
 *   - buildPersonaAwareContext: full pipeline + focusSpeaker filter.
 *
 * @module tests/unit/services/memory/persona-block-builder
 */

import {
  clusterFactsBySpeaker,
  renderPersonaBlock,
  renderAllPersonaBlocks,
  assemblePersonaAwareContext,
  buildPersonaAwareContext,
  PERSONA_BLOCK_HEADER_TEMPLATE,
  type SpeakerCluster,
} from '../../../../services/memory/persona-block-builder';
import type { AtomicFact } from '../../../../services/memory/atomic-fact-extractor';

// ===========================================================================
// Fixtures
// ===========================================================================

function fact(
  subject: string,
  verb: string,
  object: string,
  speaker?: string,
): AtomicFact {
  return {
    subject,
    verb,
    object,
    confidence: 0.9,
    sourceText: `${subject} ${verb} ${object}`,
    source: 'heuristic',
    speaker,
  };
}

const FACTS: AtomicFact[] = [
  fact('Caroline', 'lives in', 'Madrid', 'Caroline'),
  fact('Caroline', 'studies at', 'Stanford', 'Caroline'),
  fact('Joanna', 'visited', 'Spain', 'Joanna'),
  fact('Joanna', 'paints', 'sunrises', 'Joanna'),
  fact('It', 'is', 'great'), // no speaker
];

// ===========================================================================
// clusterFactsBySpeaker
// ===========================================================================

describe('clusterFactsBySpeaker', () => {
  it('groups facts by speaker', () => {
    const clusters = clusterFactsBySpeaker(FACTS);
    expect(clusters.length).toBe(3); // Caroline, Joanna, '' (empty speaker)
    const caroline = clusters.find((c) => c.speaker === 'Caroline');
    expect(caroline?.facts.length).toBe(2);
    const joanna = clusters.find((c) => c.speaker === 'Joanna');
    expect(joanna?.facts.length).toBe(2);
  });

  it('preserves first-appearance order', () => {
    const clusters = clusterFactsBySpeaker(FACTS);
    expect(clusters.map((c) => c.speaker)).toEqual(['Caroline', 'Joanna', '']);
  });

  it('dedupes (s, v, o) within a cluster', () => {
    const dups = [
      fact('Caroline', 'lives in', 'Madrid', 'Caroline'),
      fact('Caroline', 'LIVES IN', 'MADRID', 'Caroline'), // case-insensitive dup
      fact('Caroline', 'studies at', 'Stanford', 'Caroline'),
    ];
    const clusters = clusterFactsBySpeaker(dups);
    expect(clusters[0].facts.length).toBe(2);
  });

  it('puts no-speaker facts in empty-string bucket', () => {
    const clusters = clusterFactsBySpeaker([fact('It', 'is', 'great')]);
    expect(clusters[0].speaker).toBe('');
  });

  it('handles empty input', () => {
    expect(clusterFactsBySpeaker([])).toEqual([]);
  });

  it('handles null entries gracefully', () => {
    const clusters = clusterFactsBySpeaker([
      null as unknown as AtomicFact,
      ...FACTS,
    ]);
    expect(clusters.find((c) => c.speaker === 'Caroline')?.facts.length).toBe(2);
  });

  it('trims speaker whitespace before grouping', () => {
    const clusters = clusterFactsBySpeaker([
      fact('A', 'is', 'X', '  Caroline  '),
      fact('B', 'is', 'Y', 'Caroline'),
    ]);
    expect(clusters.length).toBe(1);
    expect(clusters[0].speaker).toBe('Caroline');
    expect(clusters[0].facts.length).toBe(2);
  });
});

// ===========================================================================
// renderPersonaBlock
// ===========================================================================

describe('renderPersonaBlock', () => {
  it('renders header + bulleted facts', () => {
    const cluster: SpeakerCluster = {
      speaker: 'Caroline',
      facts: FACTS.filter((f) => f.speaker === 'Caroline'),
    };
    const out = renderPersonaBlock(cluster);
    expect(out).toContain('About Caroline:');
    expect(out).toContain('- Caroline lives in Madrid');
    expect(out).toContain('- Caroline studies at Stanford');
  });

  it('substitutes speaker into the header template', () => {
    const cluster: SpeakerCluster = { speaker: 'Joanna', facts: [] };
    expect(renderPersonaBlock(cluster).startsWith('About Joanna:')).toBe(true);
  });

  it('respects maxFacts (drops from the right)', () => {
    const cluster: SpeakerCluster = {
      speaker: 'X',
      facts: [
        fact('X', 'is', '1'),
        fact('X', 'is', '2'),
        fact('X', 'is', '3'),
      ],
    };
    const out = renderPersonaBlock(cluster, { maxFacts: 2 });
    expect(out).toContain('1');
    expect(out).toContain('2');
    expect(out).not.toContain('3');
  });

  it('respects custom header', () => {
    const cluster: SpeakerCluster = { speaker: 'X', facts: [fact('X', 'is', 'Y')] };
    const out = renderPersonaBlock(cluster, { header: 'About {{speaker}} (persona):' });
    expect(out.startsWith('About X (persona):')).toBe(true);
  });

  it('respects custom bullet', () => {
    const cluster: SpeakerCluster = { speaker: 'X', facts: [fact('X', 'is', 'Y')] };
    const out = renderPersonaBlock(cluster, { bullet: '* ' });
    expect(out).toContain('* X is Y');
  });

  it('empty-speaker + empty-facts → empty string', () => {
    expect(renderPersonaBlock({ speaker: '', facts: [] })).toBe('');
  });

  it('renders header only when no facts but speaker present', () => {
    const out = renderPersonaBlock({ speaker: 'Caroline', facts: [] });
    expect(out).toBe('About Caroline:');
  });

  it('handles missing speaker via "(unknown speaker)" fallback', () => {
    const out = renderPersonaBlock({ speaker: '', facts: [fact('X', 'is', 'Y')] });
    expect(out).toContain('(unknown speaker)');
  });

  it('PERSONA_BLOCK_HEADER_TEMPLATE is byte-equal anchor', () => {
    expect(PERSONA_BLOCK_HEADER_TEMPLATE).toBe('About {{speaker}}:');
  });
});

// ===========================================================================
// renderAllPersonaBlocks
// ===========================================================================

describe('renderAllPersonaBlocks', () => {
  it('renders all clusters joined by double newline', () => {
    const clusters = clusterFactsBySpeaker(FACTS);
    const out = renderAllPersonaBlocks(clusters);
    expect(out).toContain('About Caroline:');
    expect(out).toContain('About Joanna:');
    expect(out.split('\n\n').length).toBeGreaterThanOrEqual(2);
  });

  it('skips empty-speaker bucket', () => {
    const clusters = clusterFactsBySpeaker(FACTS);
    const out = renderAllPersonaBlocks(clusters);
    expect(out).not.toContain('(unknown speaker)');
  });

  it('skips zero-fact clusters', () => {
    const clusters: SpeakerCluster[] = [
      { speaker: 'X', facts: [] },
      { speaker: 'Y', facts: [fact('Y', 'is', 'Z')] },
    ];
    const out = renderAllPersonaBlocks(clusters);
    expect(out).not.toContain('About X');
    expect(out).toContain('About Y');
  });

  it('returns empty string for all-empty clusters', () => {
    expect(renderAllPersonaBlocks([])).toBe('');
    expect(renderAllPersonaBlocks([{ speaker: '', facts: [] }])).toBe('');
  });
});

// ===========================================================================
// assemblePersonaAwareContext
// ===========================================================================

describe('assemblePersonaAwareContext', () => {
  it('renders both sections with default titles', () => {
    const out = assemblePersonaAwareContext({
      personaBlocks: ['About Caroline:\n- Caroline lives in Madrid'],
      evidence: ['Evidence chunk 1', 'Evidence chunk 2'],
    });
    expect(out).toContain('PERSONA CONTEXT');
    expect(out).toContain('About Caroline:');
    expect(out).toContain('EVIDENCE');
    expect(out).toContain('Evidence chunk 1');
  });

  it('only persona → no EVIDENCE header', () => {
    const out = assemblePersonaAwareContext({
      personaBlocks: ['About X:\n- A'],
      evidence: [],
    });
    expect(out).toContain('PERSONA CONTEXT');
    expect(out).not.toContain('EVIDENCE');
  });

  it('only evidence → no PERSONA header', () => {
    const out = assemblePersonaAwareContext({
      personaBlocks: [],
      evidence: ['chunk'],
    });
    expect(out).toContain('EVIDENCE');
    expect(out).not.toContain('PERSONA CONTEXT');
  });

  it('both empty → empty string', () => {
    expect(assemblePersonaAwareContext({ personaBlocks: [], evidence: [] })).toBe('');
  });

  it('respects custom section titles', () => {
    const out = assemblePersonaAwareContext(
      { personaBlocks: ['About X:\n- A'], evidence: ['chunk'] },
      { personaSectionTitle: 'BACKGROUND', evidenceSectionTitle: 'FACTS' },
    );
    expect(out).toContain('BACKGROUND');
    expect(out).toContain('FACTS');
  });

  it('respects custom section separator', () => {
    const out = assemblePersonaAwareContext(
      { personaBlocks: ['p'], evidence: ['e'] },
      { sectionSeparator: '\n---\n' },
    );
    expect(out).toContain('\n---\n');
  });

  it('filters empty/whitespace blocks before rendering', () => {
    const out = assemblePersonaAwareContext({
      personaBlocks: ['', '   ', 'real persona'],
      evidence: ['', 'real evidence'],
    });
    expect(out).toContain('real persona');
    expect(out).toContain('real evidence');
  });
});

// ===========================================================================
// buildPersonaAwareContext (one-shot)
// ===========================================================================

describe('buildPersonaAwareContext', () => {
  it('end-to-end: facts + evidence → formatted context', () => {
    const out = buildPersonaAwareContext({
      facts: FACTS,
      evidence: ['Caroline went hiking last weekend.'],
    });
    expect(out).toContain('PERSONA CONTEXT');
    expect(out).toContain('About Caroline:');
    expect(out).toContain('About Joanna:');
    expect(out).toContain('EVIDENCE');
    expect(out).toContain('Caroline went hiking');
  });

  it('focusSpeaker filters to matching speaker only', () => {
    const out = buildPersonaAwareContext({
      facts: FACTS,
      evidence: [],
      focusSpeaker: 'Caroline',
    });
    expect(out).toContain('About Caroline:');
    expect(out).not.toContain('About Joanna:');
  });

  it('focusSpeaker is case-insensitive', () => {
    const out = buildPersonaAwareContext({
      facts: FACTS,
      evidence: [],
      focusSpeaker: 'CAROLINE',
    });
    expect(out).toContain('About Caroline:');
  });

  it('focusSpeaker with no match → empty result if also no evidence', () => {
    const out = buildPersonaAwareContext({
      facts: FACTS,
      evidence: [],
      focusSpeaker: 'Unknown',
    });
    expect(out).toBe('');
  });

  it('respects maxFacts option from PersonaBlockOptions', () => {
    const lots: AtomicFact[] = [];
    for (let i = 0; i < 12; i++) lots.push(fact('Caroline', 'has', `item${i}`, 'Caroline'));
    const out = buildPersonaAwareContext(
      { facts: lots, evidence: [] },
      { maxFacts: 3 },
    );
    expect(out.match(/- Caroline has item\d/g)?.length).toBe(3);
  });
});
