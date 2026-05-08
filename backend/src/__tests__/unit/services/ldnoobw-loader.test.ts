/**
 * Sprint 1.10 — LDNOOBW loader tests
 *
 * Verifies:
 * 1. JSON snapshots load with the expected shape.
 * 2. Compiled regex blocks every historic seed term (Sprint 1.2 regression baseline).
 * 3. Word-boundary matching — does not block substrings of unrelated words.
 * 4. matchLDNOOBW returns block-severity hits ahead of soft hits across languages.
 */

import { matchLDNOOBW, ldnoobwStats } from '../../../services/moderation/ldnoobw-loader';

describe('ldnoobw-loader', () => {
  it('loads dictionaries with non-zero counts per language', () => {
    const stats = ldnoobwStats();
    expect(stats.de.block).toBeGreaterThan(0);
    expect(stats.en.block).toBeGreaterThan(0);
    // Soft lists are allowed to be empty but our current snapshot ships some.
    expect(stats.de.soft).toBeGreaterThanOrEqual(0);
    expect(stats.en.soft).toBeGreaterThanOrEqual(0);
  });

  describe('Sprint 1.2 regression baseline', () => {
    // Historic seed terms that Tier-1 MUST continue to block.
    const englishSeed = [
      'kill yourself',
      'child porn',
      'how to make a bomb',
      'suicide pact',
    ];
    const germanSeed = ['bring dich um', 'kinderpornografie'];

    it.each(englishSeed)('blocks EN seed term %p', (term) => {
      const hit = matchLDNOOBW(`Someone said: ${term} today.`);
      expect(hit).not.toBeNull();
      expect(hit?.severity).toBe('block');
      expect(hit?.language).toBe('en');
    });

    it.each(germanSeed)('blocks DE seed term %p', (term) => {
      const hit = matchLDNOOBW(`Jemand sagte: ${term} heute.`);
      expect(hit).not.toBeNull();
      expect(hit?.severity).toBe('block');
      expect(hit?.language).toBe('de');
    });

    it('blocks CP video|material alternation', () => {
      expect(matchLDNOOBW('he shared cp video files')?.severity).toBe('block');
      expect(matchLDNOOBW('found cp material online')?.severity).toBe('block');
    });

    it('blocks the German bomb/explosive alternation', () => {
      expect(matchLDNOOBW('eine anleitung bombe')?.severity).toBe('block');
      expect(matchLDNOOBW('anleitung sprengstoff')?.severity).toBe('block');
    });
  });

  describe('word-boundary correctness', () => {
    it('returns null for clean neutral content', () => {
      expect(matchLDNOOBW('Today the weather is fine.')).toBeNull();
      expect(matchLDNOOBW('Das Wetter ist heute schön.')).toBeNull();
    });

    it('does not false-positive on substring lookalikes', () => {
      // 'hang yourself' must not trigger on 'changes your self-view'
      expect(matchLDNOOBW('This book changes your self-view.')).toBeNull();
      // 'bombe' must not trigger on 'Bomber-jacke' (no word boundary match)
      expect(matchLDNOOBW('Er trägt eine Bomberjacke.')).toBeNull();
    });
  });

  describe('severity precedence', () => {
    it('prefers block hits over soft hits when both present', () => {
      const hit = matchLDNOOBW('kill yourself you wanker');
      expect(hit?.severity).toBe('block');
    });

    it('returns soft hit when only soft matches', () => {
      const hit = matchLDNOOBW('fuck you mate');
      expect(hit?.severity).toBe('soft');
    });
  });
});
