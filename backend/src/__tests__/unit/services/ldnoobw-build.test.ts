/**
 * Sprint 1.10 — build-ldnoobw determinism test
 *
 * Guards: running the build twice against unchanged sources must yield
 * byte-identical JSON. Diffs in checked-in snapshots must always be
 * traceable to a source-file edit, not to ordering or hashing noise.
 */

import { parseSource } from '../../../../../scripts/moderation/build-ldnoobw';

describe('build-ldnoobw', () => {
  it('parseSource is deterministic (same input → same output)', () => {
    const sample = [
      '# header comment',
      '',
      'Hang Yourself|block',
      'fuck you|soft',
      '  bring dich um | block  ',
      'kinderpornografie|block',
    ].join('\n');

    const first = parseSource(sample);
    const second = parseSource(sample);
    expect(second).toEqual(first);
    expect(first.map((e) => e.pattern)).toEqual(
      [...first.map((e) => e.pattern)].sort((a, b) => a.localeCompare(b, 'en'))
    );
  });

  it('lowercases patterns and respects severity', () => {
    const sample = ['Kill Yourself|BLOCK', 'WANKER|soft'].join('\n');
    const out = parseSource(sample);
    expect(out).toEqual([
      { pattern: 'kill yourself', severity: 'block' },
      { pattern: 'wanker', severity: 'soft' },
    ]);
  });

  it('dedupes: duplicate pattern keeps the stricter severity', () => {
    const sample = ['fuck|soft', 'fuck|block', 'fuck|soft'].join('\n');
    const out = parseSource(sample);
    expect(out).toEqual([{ pattern: 'fuck', severity: 'block' }]);
  });

  it('skips single-character entries as noise', () => {
    const sample = ['a|block', 'valid term|block'].join('\n');
    const out = parseSource(sample);
    expect(out).toEqual([{ pattern: 'valid term', severity: 'block' }]);
  });

  it('throws on malformed line without separator', () => {
    expect(() => parseSource('no-severity-here\n')).toThrow(/no '\|' separator/);
  });

  it('throws on invalid severity value', () => {
    expect(() => parseSource('term|danger\n')).toThrow(/Invalid severity/);
  });

  it('throws on empty pattern', () => {
    expect(() => parseSource('|block\n')).toThrow(/Empty pattern/);
  });
});
