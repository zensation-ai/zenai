/**
 * Tests for services/reasoning/list-completion-agent.
 *
 * Coverage:
 *   - detectListQuery: explicit cues (list/name/enumerate),
 *     "all the X", plural cues ("which cities", "what books"),
 *     non-list pass-through.
 *   - buildListCompletionPrompt: appends instruction iff list-style,
 *     idempotent (no double-append).
 *   - normalizeListAnswer: handles many input shapes (commas, semicolons,
 *     "and", numbered lists, bulleted, prefix sentences), dedup,
 *     case-options, sort, separator override.
 *   - parseListAnswer: round-trip with normalizer.
 *   - listAnswerF1: standard F1, edge cases (both empty, one empty,
 *     duplicates handled, case-insensitive matching).
 *
 * @module tests/unit/services/list-completion-agent
 */

import {
  detectListQuery,
  buildListCompletionPrompt,
  normalizeListAnswer,
  parseListAnswer,
  listAnswerF1,
  LIST_COMPLETION_INSTRUCTION,
  COLLECT_MORE_INSTRUCTION,
  buildCollectMorePrompt,
  CoverageAwareCollector,
} from '../../../services/reasoning/list-completion-agent';

// ===========================================================================
// detectListQuery
// ===========================================================================

describe('detectListQuery', () => {
  describe('explicit list cues', () => {
    it.each([
      'List all the cities Joanna visited',
      'List the people who attended',
      'list everything Caroline mentioned',
      'Name all the books Caroline recommended',
      'Name the subjects Caroline studied',
      'Enumerate the topics from the meeting',
      'Give me a list of restaurants Joanna mentioned',
    ])('detects "%s" as list-query', (q) => {
      const r = detectListQuery(q);
      expect(r.isListQuery).toBe(true);
      expect(r.confidence).toBeGreaterThan(0.5);
    });
  });

  describe('"all" cues', () => {
    it('detects "what are all the cities"', () => {
      const r = detectListQuery('what are all the cities Joanna visited');
      expect(r.isListQuery).toBe(true);
    });

    it('detects "every place"', () => {
      const r = detectListQuery('every place Caroline mentioned');
      expect(r.isListQuery).toBe(true);
    });
  });

  describe('plural cues', () => {
    it.each([
      'Which cities did Joanna visit?',
      'Which subjects did Caroline study?',
      'What books did Caroline recommend?',
      'What movies did they watch?',
    ])('detects plural cue in "%s"', (q) => {
      const r = detectListQuery(q);
      expect(r.isListQuery).toBe(true);
      expect(r.hasPluralCue).toBe(true);
    });
  });

  describe('non-list queries', () => {
    it.each([
      'When did Caroline mention her birthday?',
      'Where does Joanna live?',
      'What is the capital of Spain?',
      'How does this work?',
      'Who is Caroline?',
    ])('marks "%s" as non-list', (q) => {
      const r = detectListQuery(q);
      expect(r.isListQuery).toBe(false);
      expect(r.confidence).toBe(0);
    });
  });

  describe('defensive', () => {
    it('handles empty string', () => {
      const r = detectListQuery('');
      expect(r.isListQuery).toBe(false);
    });

    it('handles whitespace-only', () => {
      const r = detectListQuery('   \t   ');
      expect(r.isListQuery).toBe(false);
    });

    it('handles null/undefined coerced', () => {
      expect(detectListQuery(null as unknown as string).isListQuery).toBe(false);
      expect(detectListQuery(undefined as unknown as string).isListQuery).toBe(false);
    });
  });

  describe('confidence aggregation', () => {
    it('multiple cues aggregate confidence (saturating)', () => {
      const r = detectListQuery('List all the cities');
      // "list" (0.95) + "all the" (0.7) → 1 - (1-0.95)(1-0.7) = 0.985
      expect(r.confidence).toBeGreaterThan(0.95);
      expect(r.confidence).toBeLessThanOrEqual(1.0);
    });
  });
});

// ===========================================================================
// buildListCompletionPrompt
// ===========================================================================

describe('buildListCompletionPrompt', () => {
  const baseSystem = 'You are a helpful assistant.';

  it('appends instruction for list-style queries', () => {
    const out = buildListCompletionPrompt(baseSystem, 'List all the cities Joanna visited');
    expect(out).toContain(baseSystem);
    expect(out).toContain(LIST_COMPLETION_INSTRUCTION);
    expect(out.length).toBeGreaterThan(baseSystem.length);
  });

  it('returns prompt unchanged for non-list queries', () => {
    const out = buildListCompletionPrompt(baseSystem, 'When did Caroline mention her birthday?');
    expect(out).toBe(baseSystem);
  });

  it('idempotent — no double-append when instruction already present', () => {
    const once = buildListCompletionPrompt(baseSystem, 'List all the things');
    const twice = buildListCompletionPrompt(once, 'List all the things');
    expect(twice).toBe(once);
  });

  it('handles trailing newline in original prompt', () => {
    const withNewline = `${baseSystem}\n`;
    const out = buildListCompletionPrompt(withNewline, 'List the cities');
    expect(out).toContain(LIST_COMPLETION_INSTRUCTION);
    // No double-newline before instruction.
    expect(out).not.toMatch(/\n\n\n/);
  });
});

// ===========================================================================
// normalizeListAnswer
// ===========================================================================

describe('normalizeListAnswer', () => {
  it('passes through already-normalised input', () => {
    expect(normalizeListAnswer('Madrid, Barcelona, Seville'))
      .toBe('Madrid, Barcelona, Seville');
  });

  it('handles "and" separator', () => {
    expect(normalizeListAnswer('Madrid and Barcelona and Seville'))
      .toBe('Madrid, Barcelona, Seville');
  });

  it('handles "&" separator', () => {
    expect(normalizeListAnswer('Madrid & Barcelona & Seville'))
      .toBe('Madrid, Barcelona, Seville');
  });

  it('handles semicolon separator', () => {
    expect(normalizeListAnswer('Madrid; Barcelona; Seville'))
      .toBe('Madrid, Barcelona, Seville');
  });

  it('handles numbered lists', () => {
    expect(normalizeListAnswer('1. Madrid 2. Barcelona 3. Seville'))
      .toBe('Madrid, Barcelona, Seville');
  });

  it('handles bullet lists', () => {
    expect(normalizeListAnswer('- Madrid\n- Barcelona\n- Seville'))
      .toBe('Madrid, Barcelona, Seville');
  });

  it('handles asterisk bullets', () => {
    expect(normalizeListAnswer('* Madrid * Barcelona * Seville'))
      .toBe('Madrid, Barcelona, Seville');
  });

  it('strips leading sentence prefix', () => {
    expect(normalizeListAnswer('The cities Joanna visited were Madrid, Barcelona, and Seville'))
      .toBe('Madrid, Barcelona, Seville');
  });

  it('strips "Here are" prefix', () => {
    expect(normalizeListAnswer('Here are the cities: Madrid, Barcelona, Seville'))
      .toBe('Madrid, Barcelona, Seville');
  });

  it('strips trailing period', () => {
    expect(normalizeListAnswer('Madrid, Barcelona, Seville.'))
      .toBe('Madrid, Barcelona, Seville');
  });

  it('deduplicates by default', () => {
    expect(normalizeListAnswer('Madrid, Barcelona, Madrid'))
      .toBe('Madrid, Barcelona');
  });

  it('case-insensitive dedup', () => {
    expect(normalizeListAnswer('Madrid, MADRID, madrid'))
      .toBe('Madrid');
  });

  it('keeps duplicates when dedup=false', () => {
    expect(normalizeListAnswer('Madrid, Barcelona, Madrid', { dedup: false }))
      .toBe('Madrid, Barcelona, Madrid');
  });

  it('lowercases when option set', () => {
    expect(normalizeListAnswer('Madrid, Barcelona', { lowercase: true }))
      .toBe('madrid, barcelona');
  });

  it('sorts alphabetically when option set', () => {
    expect(normalizeListAnswer('Seville, Madrid, Barcelona', { sort: true }))
      .toBe('Barcelona, Madrid, Seville');
  });

  it('respects custom separator', () => {
    expect(normalizeListAnswer('Madrid, Barcelona', { separator: ' | ' }))
      .toBe('Madrid | Barcelona');
  });

  it('drops empty items', () => {
    expect(normalizeListAnswer('Madrid, , Barcelona'))
      .toBe('Madrid, Barcelona');
  });

  it('respects minItemLength', () => {
    expect(normalizeListAnswer('Madrid, BC, Seville', { minItemLength: 3 }))
      .toBe('Madrid, Seville');
  });

  it('handles empty input', () => {
    expect(normalizeListAnswer('')).toBe('');
    expect(normalizeListAnswer(null as unknown as string)).toBe('');
  });

  it('handles single-item input', () => {
    expect(normalizeListAnswer('Madrid')).toBe('Madrid');
  });

  it('handles enclosing brackets', () => {
    expect(normalizeListAnswer('[Madrid, Barcelona]'))
      .toBe('Madrid, Barcelona');
  });

  it('strips per-item trailing dots', () => {
    expect(normalizeListAnswer('Madrid., Barcelona., Seville.'))
      .toBe('Madrid, Barcelona, Seville');
  });
});

// ===========================================================================
// parseListAnswer
// ===========================================================================

describe('parseListAnswer', () => {
  it('round-trips with normalize', () => {
    const norm = normalizeListAnswer('Madrid, Barcelona, Seville');
    expect(parseListAnswer(norm)).toEqual(['Madrid', 'Barcelona', 'Seville']);
  });

  it('handles empty input', () => {
    expect(parseListAnswer('')).toEqual([]);
  });

  it('handles single item', () => {
    expect(parseListAnswer('Madrid')).toEqual(['Madrid']);
  });

  it('handles custom separator', () => {
    expect(parseListAnswer('Madrid | Barcelona', '|')).toEqual(['Madrid', 'Barcelona']);
  });
});

// ===========================================================================
// listAnswerF1
// ===========================================================================

describe('listAnswerF1', () => {
  it('perfect match → F1 = 1', () => {
    const r = listAnswerF1('Madrid, Barcelona, Seville', 'Madrid, Barcelona, Seville');
    expect(r.f1).toBe(1);
    expect(r.precision).toBe(1);
    expect(r.recall).toBe(1);
  });

  it('partial recall (missed items)', () => {
    const r = listAnswerF1('Madrid', 'Madrid, Barcelona, Seville');
    expect(r.precision).toBe(1);
    expect(r.recall).toBeCloseTo(1 / 3, 6);
    expect(r.f1).toBeCloseTo(0.5, 6);
    expect(r.falseNegatives.sort()).toEqual(['barcelona', 'seville']);
  });

  it('partial precision (extra items)', () => {
    const r = listAnswerF1('Madrid, Barcelona, Seville, Lisbon', 'Madrid, Barcelona, Seville');
    expect(r.precision).toBeCloseTo(3 / 4, 6);
    expect(r.recall).toBe(1);
    expect(r.falsePositives).toEqual(['lisbon']);
  });

  it('case-insensitive matching', () => {
    const r = listAnswerF1('madrid, BARCELONA', 'Madrid, Barcelona');
    expect(r.f1).toBe(1);
  });

  it('both empty → F1 = 1 (vacuously matched)', () => {
    const r = listAnswerF1('', '');
    expect(r.f1).toBe(1);
  });

  it('one empty → F1 = 0', () => {
    const r1 = listAnswerF1('Madrid', '');
    expect(r1.f1).toBe(0);
    const r2 = listAnswerF1('', 'Madrid');
    expect(r2.f1).toBe(0);
  });

  it('handles duplicates within input (dedups before scoring)', () => {
    const r = listAnswerF1('Madrid, Madrid, Madrid', 'Madrid, Barcelona');
    // After dedup, predicted = {Madrid}, gold = {Madrid, Barcelona}
    expect(r.precision).toBe(1);
    expect(r.recall).toBe(0.5);
  });

  it('accepts arrays directly', () => {
    const r = listAnswerF1(['Madrid', 'Barcelona'], ['Madrid', 'Barcelona', 'Seville']);
    expect(r.precision).toBe(1);
    expect(r.recall).toBeCloseTo(2 / 3, 6);
  });

  it('zero overlap → F1 = 0', () => {
    const r = listAnswerF1('Lisbon, Porto', 'Madrid, Barcelona');
    expect(r.f1).toBe(0);
    expect(r.precision).toBe(0);
    expect(r.recall).toBe(0);
  });

  it('reports tp/fp/fn arrays correctly', () => {
    const r = listAnswerF1('Madrid, Barcelona, Lisbon', 'Madrid, Barcelona, Seville');
    expect(r.truePositives.sort()).toEqual(['barcelona', 'madrid']);
    expect(r.falsePositives).toEqual(['lisbon']);
    expect(r.falseNegatives).toEqual(['seville']);
  });
});

// ===========================================================================
// H2.7: buildCollectMorePrompt + CoverageAwareCollector
// ===========================================================================

describe('buildCollectMorePrompt', () => {
  it('substitutes the previous answer into the template', () => {
    const out = buildCollectMorePrompt('Madrid, Barcelona');
    expect(out).toContain('Madrid, Barcelona');
    expect(out).not.toContain('{{previous_answer}}');
  });

  it('handles empty previous answer (substitutes empty string)', () => {
    const out = buildCollectMorePrompt('');
    expect(out).not.toContain('{{previous_answer}}');
  });

  it('preserves the rest of the template (instruction text intact)', () => {
    const out = buildCollectMorePrompt('Madrid');
    expect(out).toContain('OTHER items');
    expect(out).toContain('comma-separated list');
  });

  it('COLLECT_MORE_INSTRUCTION is stable (snapshot-style anchor)', () => {
    expect(COLLECT_MORE_INSTRUCTION.length).toBeGreaterThan(100);
    expect(COLLECT_MORE_INSTRUCTION).toContain('{{previous_answer}}');
  });
});

describe('CoverageAwareCollector', () => {
  describe('constructor', () => {
    it('rejects negative maxRounds', () => {
      expect(() => new CoverageAwareCollector({ maxRounds: -1 })).toThrow(/maxRounds/);
    });

    it('accepts maxRounds=0 (no follow-ups allowed)', () => {
      const c = new CoverageAwareCollector({ maxRounds: 0 });
      c.start('Madrid');
      expect(c.shouldContinue()).toBe(false);
    });
  });

  describe('start / addRound', () => {
    it('start() seeds initial items', () => {
      const c = new CoverageAwareCollector();
      c.start('Madrid, Barcelona');
      expect(c.getState().items).toEqual(['Madrid', 'Barcelona']);
    });

    it('start() can only be called once', () => {
      const c = new CoverageAwareCollector();
      c.start('Madrid');
      expect(() => c.start('Barcelona')).toThrow(/start\(\) called twice/);
    });

    it('addRound() before start() throws', () => {
      const c = new CoverageAwareCollector();
      expect(() => c.addRound('Madrid')).toThrow(/before start/);
    });

    it('addRound() merges new items, dedups duplicates', () => {
      const c = new CoverageAwareCollector();
      c.start('Madrid');
      c.addRound('Madrid, Barcelona, Seville');
      expect(c.getState().items).toEqual(['Madrid', 'Barcelona', 'Seville']);
      expect(c.getState().newPerRound).toEqual([2]);
    });

    it('case-insensitive dedup by default', () => {
      const c = new CoverageAwareCollector();
      c.start('Madrid');
      c.addRound('madrid, MADRID, Barcelona');
      expect(c.getState().items).toEqual(['Madrid', 'Barcelona']);
    });

    it('case-sensitive when option set (collector dedup level)', () => {
      // Note: normalizeListAnswer (called inside addRound) deduplicates
      // case-insensitively by default and would collapse "madrid, MADRID"
      // to a single "madrid" before reaching the collector. So the
      // collector-level caseInsensitive flag governs only the final
      // merge between rounds — here, "Madrid" (seed) vs "madrid" (round).
      const insensitive = new CoverageAwareCollector({ caseInsensitive: true });
      insensitive.start('Madrid');
      insensitive.addRound('madrid, Barcelona');
      // Insensitive: madrid is a dup of seed "Madrid"; only Barcelona is new.
      expect(insensitive.getState().items.length).toBe(2);

      const sensitive = new CoverageAwareCollector({ caseInsensitive: false });
      sensitive.start('Madrid');
      sensitive.addRound('madrid, Barcelona');
      // Sensitive: madrid != Madrid, so we keep both plus Barcelona.
      expect(sensitive.getState().items.length).toBe(3);
    });
  });

  describe('shouldContinue / closeReason', () => {
    it('continues while new items keep arriving + below maxRounds', () => {
      const c = new CoverageAwareCollector({ maxRounds: 3 });
      c.start('Madrid');
      expect(c.shouldContinue()).toBe(true);
      c.addRound('Madrid, Barcelona'); // +1 new
      expect(c.shouldContinue()).toBe(true);
      c.addRound('Madrid, Barcelona, Seville'); // +1 new
      expect(c.shouldContinue()).toBe(true);
      c.addRound('Madrid, Barcelona, Seville, Lisbon'); // +1 new — but now rounds=3=max
      expect(c.shouldContinue()).toBe(false);
      expect(c.getState().closeReason).toBe('max_rounds');
    });

    it('closes when a round adds zero new items', () => {
      const c = new CoverageAwareCollector({ maxRounds: 5 });
      c.start('Madrid, Barcelona');
      c.addRound('Madrid, Barcelona'); // 0 new
      expect(c.shouldContinue()).toBe(false);
      expect(c.getState().closeReason).toBe('no_new_items');
    });

    it('closes when expectedCount is reached', () => {
      const c = new CoverageAwareCollector({ expectedCount: 3 });
      c.start('Madrid');
      c.addRound('Madrid, Barcelona, Seville');
      expect(c.shouldContinue()).toBe(false);
      expect(c.getState().closeReason).toBe('expected_count_reached');
    });

    it('closeReason set only once (idempotent addRound after close)', () => {
      const c = new CoverageAwareCollector();
      c.start('Madrid, Barcelona');
      c.addRound('Madrid'); // 0 new → closes
      expect(c.getState().closeReason).toBe('no_new_items');
      c.addRound('Madrid, Barcelona, Seville'); // ignored
      expect(c.getState().items.length).toBe(2);
      expect(c.getState().rounds).toBe(1);
    });
  });

  describe('format', () => {
    it('returns comma-separated string of collected items in order', () => {
      const c = new CoverageAwareCollector();
      c.start('Madrid, Barcelona');
      c.addRound('Madrid, Seville');
      expect(c.format()).toBe('Madrid, Barcelona, Seville');
    });

    it('preserves original case (display value)', () => {
      const c = new CoverageAwareCollector();
      c.start('MADRID');
      expect(c.format()).toBe('MADRID');
    });
  });

  describe('end-to-end scenarios', () => {
    it('"productive then saturated" — 2 rounds add new, 3rd adds nothing → close', () => {
      const c = new CoverageAwareCollector({ maxRounds: 5 });
      c.start('Madrid');
      c.addRound('Madrid, Barcelona');
      c.addRound('Madrid, Barcelona, Seville');
      c.addRound('Madrid, Barcelona, Seville'); // 0 new
      const s = c.getState();
      expect(s.items.length).toBe(3);
      expect(s.rounds).toBe(3);
      expect(s.newPerRound).toEqual([1, 1, 0]);
      expect(s.closed).toBe(true);
      expect(s.closeReason).toBe('no_new_items');
    });

    it('"hit expectedCount early" — stop on count even if more rounds available', () => {
      const c = new CoverageAwareCollector({ maxRounds: 5, expectedCount: 2 });
      c.start('Madrid');
      c.addRound('Madrid, Barcelona');
      expect(c.shouldContinue()).toBe(false);
      expect(c.getState().closeReason).toBe('expected_count_reached');
    });
  });
});
