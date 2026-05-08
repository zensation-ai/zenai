/**
 * Tests for services/rag/contextual-retrieval-prefix (H3.2).
 *
 * Coverage:
 *   - All four template variants (full conversation / no-session /
 *     document / date-only / speaker-only / empty).
 *   - prefixChunk: prefix + separator + body, no-prefix pass-through,
 *     empty body, separator override.
 *   - maxPrefixLength truncation with `…` trailer.
 *   - stripContextualPrefix inverse for each template.
 *   - Defensive: null/undefined inputs.
 *
 * @module tests/unit/services/rag/contextual-retrieval-prefix
 */

import {
  buildContextualPrefix,
  prefixChunk,
  stripContextualPrefix,
  CONTEXTUAL_PREFIX_TEMPLATE_CONVERSATION,
  CONTEXTUAL_PREFIX_TEMPLATE_DOCUMENT,
  CONTEXTUAL_PREFIX_TEMPLATE_DATE_ONLY,
} from '../../../../services/rag/contextual-retrieval-prefix';

// ===========================================================================
// Templates
// ===========================================================================

describe('contextual prefix templates', () => {
  it('CONTEXTUAL_PREFIX_TEMPLATE_CONVERSATION has the three placeholders', () => {
    expect(CONTEXTUAL_PREFIX_TEMPLATE_CONVERSATION).toContain('{{session}}');
    expect(CONTEXTUAL_PREFIX_TEMPLATE_CONVERSATION).toContain('{{isoDate}}');
    expect(CONTEXTUAL_PREFIX_TEMPLATE_CONVERSATION).toContain('{{speaker}}');
  });

  it('CONTEXTUAL_PREFIX_TEMPLATE_DOCUMENT has the title placeholder', () => {
    expect(CONTEXTUAL_PREFIX_TEMPLATE_DOCUMENT).toContain('{{documentTitle}}');
  });

  it('CONTEXTUAL_PREFIX_TEMPLATE_DATE_ONLY has the date placeholder', () => {
    expect(CONTEXTUAL_PREFIX_TEMPLATE_DATE_ONLY).toContain('{{isoDate}}');
  });
});

// ===========================================================================
// buildContextualPrefix — variant selection
// ===========================================================================

describe('buildContextualPrefix — variant selection', () => {
  it('full conversation context (session + isoDate + speaker)', () => {
    const out = buildContextualPrefix({
      session: 4,
      isoDate: '2023-05-08',
      speaker: 'Caroline',
    });
    expect(out).toBe('From session 4 on 2023-05-08, Caroline said:');
  });

  it('no session — falls back to "On X, Y said:"', () => {
    const out = buildContextualPrefix({
      isoDate: '2023-05-08',
      speaker: 'Caroline',
    });
    expect(out).toBe('On 2023-05-08, Caroline said:');
  });

  it('document title only', () => {
    const out = buildContextualPrefix({
      documentTitle: 'Q3 Strategy Memo',
    });
    expect(out).toBe('From "Q3 Strategy Memo":');
  });

  it('date only', () => {
    const out = buildContextualPrefix({ isoDate: '2023-05-08' });
    expect(out).toBe('From 2023-05-08:');
  });

  it('speaker only', () => {
    const out = buildContextualPrefix({ speaker: 'Caroline' });
    expect(out).toBe('Caroline said:');
  });

  it('empty context → empty string', () => {
    expect(buildContextualPrefix({})).toBe('');
  });
});

// ===========================================================================
// maxPrefixLength
// ===========================================================================

describe('buildContextualPrefix — maxPrefixLength', () => {
  it('truncates with … when prefix exceeds maxPrefixLength', () => {
    const longTitle = 'A '.repeat(120) + 'long title';
    const out = buildContextualPrefix(
      { documentTitle: longTitle },
      { maxPrefixLength: 50 },
    );
    expect(out.length).toBe(50);
    expect(out.endsWith('…')).toBe(true);
  });

  it('default 200 char cap', () => {
    const veryLong = 'x'.repeat(500);
    const out = buildContextualPrefix({ documentTitle: veryLong });
    expect(out.length).toBeLessThanOrEqual(200);
  });

  it('does not truncate when under cap', () => {
    const out = buildContextualPrefix({
      session: 1,
      isoDate: '2023-05-08',
      speaker: 'Caroline',
    });
    expect(out).not.toContain('…');
  });
});

// ===========================================================================
// prefixChunk
// ===========================================================================

describe('prefixChunk', () => {
  it('joins prefix + separator + body', () => {
    const out = prefixChunk('Hello world.', {
      session: 4,
      isoDate: '2023-05-08',
      speaker: 'Caroline',
    });
    expect(out).toBe('From session 4 on 2023-05-08, Caroline said: — Hello world.');
  });

  it('respects custom separator', () => {
    const out = prefixChunk(
      'Hello.',
      { speaker: 'Caroline' },
      { separator: ' :: ' },
    );
    expect(out).toBe('Caroline said: :: Hello.');
  });

  it('empty context → returns chunk verbatim', () => {
    expect(prefixChunk('Hello.', {})).toBe('Hello.');
  });

  it('empty body + non-empty prefix → returns prefix only', () => {
    const out = prefixChunk('', { speaker: 'Caroline' });
    expect(out).toBe('Caroline said:');
  });

  it('null/undefined chunk → handled', () => {
    expect(prefixChunk(null as unknown as string, {})).toBe('');
    expect(prefixChunk(undefined as unknown as string, { speaker: 'X' })).toBe('X said:');
  });

  it('trims whitespace on body before joining', () => {
    const out = prefixChunk('  hello  ', { speaker: 'X' });
    expect(out).toBe('X said: — hello');
  });
});

// ===========================================================================
// stripContextualPrefix — inverse
// ===========================================================================

describe('stripContextualPrefix', () => {
  it('strips full conversation prefix', () => {
    const text = prefixChunk('Hello.', {
      session: 4,
      isoDate: '2023-05-08',
      speaker: 'Caroline',
    });
    const r = stripContextualPrefix(text);
    expect(r.body).toBe('Hello.');
    expect(r.prefix).toContain('Caroline said:');
  });

  it('strips no-session prefix', () => {
    const text = prefixChunk('Hello.', {
      isoDate: '2023-05-08',
      speaker: 'Caroline',
    });
    const r = stripContextualPrefix(text);
    expect(r.body).toBe('Hello.');
  });

  it('strips document prefix', () => {
    const text = prefixChunk('Body text.', { documentTitle: 'Memo' });
    const r = stripContextualPrefix(text);
    expect(r.body).toBe('Body text.');
  });

  it('strips date-only prefix', () => {
    const text = prefixChunk('Body text.', { isoDate: '2023-05-08' });
    const r = stripContextualPrefix(text);
    expect(r.body).toBe('Body text.');
  });

  it('strips speaker-only prefix', () => {
    const text = prefixChunk('Body text.', { speaker: 'Caroline' });
    const r = stripContextualPrefix(text);
    expect(r.body).toBe('Body text.');
  });

  it('returns body unchanged when no prefix matches', () => {
    const r = stripContextualPrefix('Just plain text.');
    expect(r.body).toBe('Just plain text.');
    expect(r.prefix).toBeNull();
  });

  it('handles null/empty input', () => {
    expect(stripContextualPrefix('').body).toBe('');
    expect(stripContextualPrefix(null as unknown as string).body).toBe('');
  });

  it('respects custom separator', () => {
    const text = prefixChunk('Hello.', { speaker: 'X' }, { separator: ' :: ' });
    const r = stripContextualPrefix(text, ' :: ');
    expect(r.body).toBe('Hello.');
  });
});

// ===========================================================================
// Round-trip
// ===========================================================================

describe('prefix round-trip', () => {
  it('prefixChunk → stripContextualPrefix recovers the body verbatim', () => {
    const inputs = [
      { ctx: { session: 4, isoDate: '2023-05-08', speaker: 'Caroline' }, body: 'Hello world.' },
      { ctx: { isoDate: '2023-05-08', speaker: 'X' }, body: 'Body 2.' },
      { ctx: { documentTitle: 'Memo' }, body: 'Body 3.' },
      { ctx: { isoDate: '2023-05-08' }, body: 'Body 4.' },
      { ctx: { speaker: 'X' }, body: 'Body 5.' },
    ];
    for (const { ctx, body } of inputs) {
      const prefixed = prefixChunk(body, ctx);
      const { body: recovered } = stripContextualPrefix(prefixed);
      expect(recovered).toBe(body);
    }
  });
});
