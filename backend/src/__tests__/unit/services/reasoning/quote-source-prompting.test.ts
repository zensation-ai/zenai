/**
 * H3.5 — Quote-the-Source Prompting tests.
 */

import {
  applyQuoteSourcePrompt,
  answerContainsVerbatimQuote,
  QUOTE_SOURCE_INSTRUCTION_TEMPLATE,
  QUOTE_SOURCE_PREFIX_SENTINEL,
} from '../../../../services/reasoning/quote-source-prompting';

describe('verbatim constants', () => {
  it('QUOTE_SOURCE_INSTRUCTION_TEMPLATE has expected anchor phrases', () => {
    expect(QUOTE_SOURCE_INSTRUCTION_TEMPLATE).toContain('VERBATIM');
    expect(QUOTE_SOURCE_INSTRUCTION_TEMPLATE).toContain('QUOTE-THE-SOURCE DISCIPLINE');
    expect(QUOTE_SOURCE_INSTRUCTION_TEMPLATE).toContain('According to the conversation:');
  });
  it('QUOTE_SOURCE_PREFIX_SENTINEL value', () => {
    expect(QUOTE_SOURCE_PREFIX_SENTINEL).toBe('According to the conversation:');
  });
});

describe('applyQuoteSourcePrompt — gate behaviour', () => {
  beforeEach(() => {
    delete process.env.H3_QUOTE_SOURCE;
  });

  it('default off: enable unset → identity, applied=false', () => {
    const r = applyQuoteSourcePrompt('BASE');
    expect(r.applied).toBe(false);
    expect(r.prompt).toBe('BASE');
    expect(r.reason).toContain('disabled');
  });

  it('per-call enable=true → directive appended', () => {
    const r = applyQuoteSourcePrompt('BASE', { enable: true });
    expect(r.applied).toBe(true);
    expect(r.prompt.startsWith('BASE')).toBe(true);
    expect(r.prompt).toContain('VERBATIM');
    expect(r.prompt.length).toBeGreaterThan('BASE'.length);
  });

  it('skipWhenNoEvidence=true + hasEvidence=false → skip', () => {
    const r = applyQuoteSourcePrompt('BASE', {
      enable: true,
      skipWhenNoEvidence: true,
      hasEvidence: false,
    });
    expect(r.applied).toBe(false);
    expect(r.reason).toContain('no evidence');
  });

  it('skipWhenNoEvidence=true + hasEvidence=true → applied', () => {
    const r = applyQuoteSourcePrompt('BASE', {
      enable: true,
      skipWhenNoEvidence: true,
      hasEvidence: true,
    });
    expect(r.applied).toBe(true);
  });

  it('skipWhenNoEvidence=false → ignores hasEvidence flag', () => {
    const r = applyQuoteSourcePrompt('BASE', {
      enable: true,
      skipWhenNoEvidence: false,
      hasEvidence: false,
    });
    expect(r.applied).toBe(true);
  });

  it('default skipWhenNoEvidence is true (gates on evidence presence)', () => {
    const r = applyQuoteSourcePrompt('BASE', {
      enable: true,
      hasEvidence: false,
    });
    expect(r.applied).toBe(false);
  });

  it('hasEvidence undefined + skip default true → applies (no signal to skip)', () => {
    const r = applyQuoteSourcePrompt('BASE', { enable: true });
    expect(r.applied).toBe(true);
  });

  it('custom template overrides default', () => {
    const r = applyQuoteSourcePrompt('BASE', {
      enable: true,
      template: '\n\nCUSTOM_INSTRUCTION',
    });
    expect(r.prompt).toBe('BASE\n\nCUSTOM_INSTRUCTION');
  });

  it('concatenation contract: prompt = base + template', () => {
    const r = applyQuoteSourcePrompt('BASE', { enable: true });
    expect(r.prompt.startsWith('BASE')).toBe(true);
    expect(r.prompt.slice('BASE'.length)).toBe(QUOTE_SOURCE_INSTRUCTION_TEMPLATE);
  });
});

describe('applyQuoteSourcePrompt — env-flag default', () => {
  it('H3_QUOTE_SOURCE=true at module load enables without per-call', async () => {
    const prev = process.env.H3_QUOTE_SOURCE;
    process.env.H3_QUOTE_SOURCE = 'true';
    jest.resetModules();
    const mod = await import('../../../../services/reasoning/quote-source-prompting');
    const r = mod.applyQuoteSourcePrompt('BASE');
    expect(r.applied).toBe(true);

    if (prev === undefined) delete process.env.H3_QUOTE_SOURCE;
    else process.env.H3_QUOTE_SOURCE = prev;
    jest.resetModules();
  });

  it('per-call enable=false beats env=true', async () => {
    const prev = process.env.H3_QUOTE_SOURCE;
    process.env.H3_QUOTE_SOURCE = 'true';
    jest.resetModules();
    const mod = await import('../../../../services/reasoning/quote-source-prompting');
    const r = mod.applyQuoteSourcePrompt('BASE', { enable: false });
    expect(r.applied).toBe(false);

    if (prev === undefined) delete process.env.H3_QUOTE_SOURCE;
    else process.env.H3_QUOTE_SOURCE = prev;
    jest.resetModules();
  });

  it('env truthy parser exact-match contract', () => {
    const parse = (raw: string) =>
      raw === 'true' || raw === '1' || raw.toLowerCase() === 'yes';
    expect(parse('true')).toBe(true);
    expect(parse('1')).toBe(true);
    expect(parse('yes')).toBe(true);
    expect(parse('YES')).toBe(true);
    expect(parse('TRUE')).toBe(false); // exact match
    expect(parse('false')).toBe(false);
    expect(parse('')).toBe(false);
  });
});

describe('answerContainsVerbatimQuote', () => {
  it('detects sentinel prefix', () => {
    expect(
      answerContainsVerbatimQuote(
        'According to the conversation: "Caroline graduated in May 2018."',
      ),
    ).toBe(true);
  });

  it('returns false when sentinel absent', () => {
    expect(answerContainsVerbatimQuote('She graduated in May 2018.')).toBe(false);
  });

  it('case-sensitive (sentinel is fixed casing)', () => {
    expect(
      answerContainsVerbatimQuote(
        'according to the conversation: "x"',
      ),
    ).toBe(false);
  });

  it('defensive empty / null', () => {
    expect(answerContainsVerbatimQuote('')).toBe(false);
    expect(answerContainsVerbatimQuote(null as unknown as string)).toBe(false);
    expect(answerContainsVerbatimQuote(undefined as unknown as string)).toBe(false);
  });
});
