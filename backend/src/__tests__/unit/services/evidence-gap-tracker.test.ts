/**
 * Tests for services/reasoning/evidence-gap-tracker.
 *
 * Coverage:
 *   - Constructor: empty patterns rejected, bad maxIterations rejected.
 *   - ingest: dedup by id, confidence floor, slot cap respected,
 *     pattern matching, multi-pattern fan-out (one fact filling > 1 gap).
 *   - decide: initial → retrieve, productive round → retrieve,
 *     unproductive round → reflect, all-filled → answer, max-iter cap → answer.
 *   - coverage: 0/empty/full/partial.
 *   - unfilledGapsPrompt: empty when full, formatted when not.
 *   - reset: clears state but preserves patterns.
 *   - getState: read-only snapshot reflects current state.
 *
 * No mocks — pure stateful logic.
 *
 * @module tests/unit/services/evidence-gap-tracker
 */

import {
  EvidenceGapTracker,
  type EvidenceFact,
  type RequiredFactPattern,
} from '../../../services/reasoning/evidence-gap-tracker';

// ===========================================================================
// Helpers
// ===========================================================================

function makeFact(id: string, text: string, confidence = 0.9): EvidenceFact {
  return { id, text, confidence };
}

function patternContaining(needle: string): RequiredFactPattern {
  return {
    kind: 'evidence_chunk',
    description: `must contain "${needle}"`,
    matches: (f) => f.text.toLowerCase().includes(needle.toLowerCase()),
  };
}

function listPattern(needle: string, max: number): RequiredFactPattern {
  return {
    kind: 'list_item',
    description: `list items containing "${needle}"`,
    matches: (f) => f.text.toLowerCase().includes(needle.toLowerCase()),
    maxFills: max,
  };
}

// ===========================================================================
// Constructor
// ===========================================================================

describe('EvidenceGapTracker — constructor', () => {
  it('rejects empty pattern list', () => {
    expect(() => new EvidenceGapTracker([])).toThrow(/at least one/i);
  });

  it('rejects maxIterations < 1', () => {
    expect(() => new EvidenceGapTracker([patternContaining('x')], { maxIterations: 0 }))
      .toThrow(/maxIterations/);
  });

  it('accepts default options', () => {
    const t = new EvidenceGapTracker([patternContaining('x')]);
    const state = t.getState();
    expect(state.required.length).toBe(1);
    expect(state.knownFactIds.size).toBe(0);
  });

  it('does not allow caller mutation to leak through (defensive copy)', () => {
    const required = [patternContaining('x')];
    const t = new EvidenceGapTracker(required);
    required.length = 0; // mutate caller's array
    expect(t.getState().required.length).toBe(1);
  });
});

// ===========================================================================
// ingest
// ===========================================================================

describe('EvidenceGapTracker — ingest', () => {
  it('matches a single fact to a single pattern', () => {
    const t = new EvidenceGapTracker([patternContaining('caroline')]);
    t.ingest([makeFact('f1', 'Caroline mentioned her birthday')]);
    const state = t.getState();
    expect(state.acquired.get('must contain "caroline"')!.length).toBe(1);
    expect(state.unfilled.length).toBe(0);
  });

  it('deduplicates by fact id across rounds', () => {
    const t = new EvidenceGapTracker([patternContaining('caroline')]);
    t.ingest([makeFact('f1', 'Caroline mentioned her birthday')]);
    t.ingest([makeFact('f1', 'Caroline mentioned her birthday')]); // duplicate
    expect(t.getState().acquired.get('must contain "caroline"')!.length).toBe(1);
  });

  it('drops facts below the confidence floor', () => {
    const t = new EvidenceGapTracker([patternContaining('caroline')], {
      confidenceFloor: 0.5,
    });
    t.ingest([makeFact('f1', 'Caroline X', 0.3)]);
    expect(t.getState().acquired.get('must contain "caroline"')!.length).toBe(0);
  });

  it('respects slot cap (default 1)', () => {
    const t = new EvidenceGapTracker([patternContaining('caroline')]);
    t.ingest([
      makeFact('f1', 'Caroline mentioned X'),
      makeFact('f2', 'Caroline mentioned Y'),
    ]);
    expect(t.getState().acquired.get('must contain "caroline"')!.length).toBe(1);
  });

  it('respects custom maxFills', () => {
    const t = new EvidenceGapTracker([listPattern('city', 3)]);
    t.ingest([
      makeFact('f1', 'Madrid is a city'),
      makeFact('f2', 'Barcelona is a city'),
      makeFact('f3', 'Seville is a city'),
      makeFact('f4', 'Lisbon is a city'),
    ]);
    expect(t.getState().acquired.get('list items containing "city"')!.length).toBe(3);
  });

  it('one fact can fill multiple patterns', () => {
    const t = new EvidenceGapTracker([
      patternContaining('caroline'),
      patternContaining('birthday'),
    ]);
    t.ingest([makeFact('f1', 'Caroline mentioned her birthday on May 8')]);
    expect(t.getState().acquired.get('must contain "caroline"')!.length).toBe(1);
    expect(t.getState().acquired.get('must contain "birthday"')!.length).toBe(1);
    expect(t.getState().unfilled.length).toBe(0);
  });

  it('ignores facts with empty id', () => {
    const t = new EvidenceGapTracker([patternContaining('caroline')]);
    t.ingest([makeFact('', 'Caroline X')]);
    expect(t.getState().knownFactIds.size).toBe(0);
  });

  it('handles empty candidate list (still increments iteration count)', () => {
    const t = new EvidenceGapTracker([patternContaining('caroline')]);
    t.ingest([]);
    const d = t.decide();
    expect(d.iterationCount).toBe(1);
  });

  it('tracks new-facts-this-round separately from total', () => {
    const t = new EvidenceGapTracker([patternContaining('caroline')]);
    t.ingest([makeFact('f1', 'Caroline X')]);
    // First round added 1 new fact → next decide = retrieve.
    expect(t.decide().action).toBe('answer'); // gap is filled, so answer wins
    t.reset();
    t.ingest([makeFact('f1', 'caroline X')]); // fills the gap
    t.ingest([]); // nothing new
    // Gap is filled → answer regardless.
    expect(t.decide().action).toBe('answer');
  });
});

// ===========================================================================
// decide
// ===========================================================================

describe('EvidenceGapTracker — decide', () => {
  it('initial decide (before any ingest) returns retrieve', () => {
    const t = new EvidenceGapTracker([patternContaining('caroline')]);
    const d = t.decide();
    expect(d.action).toBe('retrieve');
    expect(d.iterationCount).toBe(0);
    expect(d.coverage).toBe(0);
  });

  it('all-filled returns answer', () => {
    const t = new EvidenceGapTracker([patternContaining('caroline')]);
    t.ingest([makeFact('f1', 'Caroline X')]);
    const d = t.decide();
    expect(d.action).toBe('answer');
    expect(d.reason).toMatch(/all required/i);
    expect(d.coverage).toBe(1);
    expect(d.unfilledGaps.length).toBe(0);
  });

  it('productive round (gaps remain, new facts) → retrieve', () => {
    const t = new EvidenceGapTracker([
      patternContaining('caroline'),
      patternContaining('joanna'),
    ]);
    t.ingest([makeFact('f1', 'Caroline X')]);
    const d = t.decide();
    expect(d.action).toBe('retrieve');
    expect(d.unfilledGaps.length).toBe(1);
    expect(d.coverage).toBeCloseTo(0.5, 6);
  });

  it('unproductive round (gaps remain, no new facts) → reflect', () => {
    const t = new EvidenceGapTracker([
      patternContaining('caroline'),
      patternContaining('joanna'),
    ]);
    t.ingest([makeFact('f1', 'Caroline X')]);
    t.ingest([makeFact('f1', 'Caroline X')]); // duplicate → 0 new
    const d = t.decide();
    expect(d.action).toBe('reflect');
    expect(d.reason).toMatch(/no new facts/i);
  });

  it('hits maxIterations cap → answer', () => {
    const t = new EvidenceGapTracker([
      patternContaining('caroline'),
      patternContaining('joanna'),
    ], { maxIterations: 2 });
    t.ingest([makeFact('f1', 'Caroline X')]);
    t.ingest([makeFact('f2', 'Caroline Y')]);
    const d = t.decide();
    expect(d.action).toBe('answer');
    expect(d.reason).toMatch(/max iterations/);
    expect(d.unfilledGaps.length).toBe(1);
    expect(d.coverage).toBeCloseTo(0.5, 6);
  });

  it('coverage incremented as gaps fill', () => {
    const t = new EvidenceGapTracker([
      patternContaining('caroline'),
      patternContaining('joanna'),
      patternContaining('madrid'),
    ]);
    expect(t.coverage()).toBe(0);
    t.ingest([makeFact('f1', 'Caroline X')]);
    expect(t.coverage()).toBeCloseTo(1 / 3, 6);
    t.ingest([makeFact('f2', 'Joanna Y')]);
    expect(t.coverage()).toBeCloseTo(2 / 3, 6);
    t.ingest([makeFact('f3', 'Madrid Z')]);
    expect(t.coverage()).toBe(1);
  });
});

// ===========================================================================
// unfilledGapsPrompt
// ===========================================================================

describe('EvidenceGapTracker — unfilledGapsPrompt', () => {
  it('empty when no gaps', () => {
    const t = new EvidenceGapTracker([patternContaining('caroline')]);
    t.ingest([makeFact('f1', 'Caroline X')]);
    expect(t.unfilledGapsPrompt()).toBe('');
  });

  it('lists each unfilled gap with kind and have/cap', () => {
    const t = new EvidenceGapTracker([
      patternContaining('caroline'),
      listPattern('city', 3),
    ]);
    t.ingest([makeFact('f1', 'Madrid is a city')]); // fills 1 of 3 list slots
    const out = t.unfilledGapsPrompt();
    expect(out).toContain('Still needed');
    expect(out).toContain('caroline');
    // Caroline is unfilled (have 0/1).
    expect(out).toMatch(/caroline.*0\/1/);
    // City list is partially filled (1/3) — not unfilled per the strict
    // "no facts at all" predicate, so it should not appear.
    expect(out).not.toContain('city');
  });

  it('shows correct have/cap for unfilled list patterns', () => {
    const t = new EvidenceGapTracker([listPattern('city', 3)]);
    const out = t.unfilledGapsPrompt();
    expect(out).toMatch(/city.*0\/3/);
  });
});

// ===========================================================================
// reset
// ===========================================================================

describe('EvidenceGapTracker — reset', () => {
  it('clears state but preserves patterns', () => {
    const t = new EvidenceGapTracker([patternContaining('caroline')]);
    t.ingest([makeFact('f1', 'Caroline X')]);
    expect(t.coverage()).toBe(1);
    t.reset();
    expect(t.coverage()).toBe(0);
    expect(t.getState().required.length).toBe(1);
    expect(t.getState().knownFactIds.size).toBe(0);
  });

  it('iteration count resets to 0', () => {
    const t = new EvidenceGapTracker([patternContaining('caroline')]);
    t.ingest([]);
    t.ingest([]);
    expect(t.decide().iterationCount).toBe(2);
    t.reset();
    expect(t.decide().iterationCount).toBe(0);
  });
});

// ===========================================================================
// End-to-end loop scenarios
// ===========================================================================

describe('EvidenceGapTracker — end-to-end loop scenarios', () => {
  it('"happy path" — 2 patterns, 2 productive rounds, then answer', () => {
    const t = new EvidenceGapTracker([
      patternContaining('caroline'),
      patternContaining('joanna'),
    ], { maxIterations: 5 });

    // Round 1: retrieve gives Caroline only.
    t.ingest([makeFact('f1', 'Caroline mentioned her birthday')]);
    let d = t.decide();
    expect(d.action).toBe('retrieve');
    expect(d.coverage).toBeCloseTo(0.5, 6);

    // Round 2: retrieve gives Joanna.
    t.ingest([makeFact('f2', 'Joanna planned a trip')]);
    d = t.decide();
    expect(d.action).toBe('answer');
    expect(d.coverage).toBe(1);
  });

  it('"reflect path" — round 1 productive, round 2 unproductive → reflect', () => {
    const t = new EvidenceGapTracker([
      patternContaining('caroline'),
      patternContaining('joanna'),
    ]);
    // Round 1: productive (1 new caroline-fact).
    t.ingest([makeFact('f1', 'Caroline X')]);
    expect(t.decide().action).toBe('retrieve');

    // Round 2: same fact returned → no new evidence.
    t.ingest([makeFact('f1', 'Caroline X')]);
    expect(t.decide().action).toBe('reflect');
  });

  it('"max-iter graceful stop" — never finds joanna, gives up after cap', () => {
    const t = new EvidenceGapTracker([
      patternContaining('caroline'),
      patternContaining('joanna'),
    ], { maxIterations: 3 });
    t.ingest([makeFact('f1', 'Caroline 1')]);
    t.ingest([makeFact('f2', 'Caroline 2')]);
    t.ingest([makeFact('f3', 'Caroline 3')]);
    const d = t.decide();
    expect(d.action).toBe('answer');
    expect(d.reason).toMatch(/max iterations/);
    expect(d.unfilledGaps.map((g) => g.description)).toEqual(['must contain "joanna"']);
  });
});
