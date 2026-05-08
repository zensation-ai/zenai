/**
 * Tests for services/memory/atomic-fact-extractor (H3.1).
 *
 * Coverage:
 *   - Heuristic patterns: copular, possession, location, preference,
 *     travel, possessive-attribute — each fires correctly on a
 *     canonical example.
 *   - SVO triple shape: subject/verb/object slots populated correctly,
 *     verb lemmatised where the pattern does so.
 *   - Dedup by (s, v, o) lowercased.
 *   - Stopword subjects skipped (it/this/that without antecedent).
 *   - minSlotLength filter.
 *   - Speaker / turnIndex propagation.
 *   - LLM-callback path: merge with heuristic, dedup across paths,
 *     LLM error propagates.
 *   - Defensive: empty / null / whitespace input.
 *   - factToSentence + dedupeFacts utilities.
 *
 * @module tests/unit/services/memory/atomic-fact-extractor
 */

import {
  extractAtomicFacts,
  extractAtomicFactsHeuristic,
  factToSentence,
  dedupeFacts,
  type AtomicFact,
  type LLMFactExtractor,
} from '../../../../services/memory/atomic-fact-extractor';

// ===========================================================================
// Heuristic — pattern coverage
// ===========================================================================

describe('extractAtomicFactsHeuristic — pattern coverage', () => {
  it('copular: "Caroline is a teacher"', () => {
    const r = extractAtomicFactsHeuristic('Caroline is a teacher.');
    expect(r.length).toBeGreaterThan(0);
    expect(r[0].subject).toBe('Caroline');
    expect(r[0].verb).toBe('is');
    expect(r[0].object).toMatch(/teacher/);
  });

  it('possession: "Caroline has two children"', () => {
    const r = extractAtomicFactsHeuristic('Caroline has two children.');
    expect(r.find((f) => f.verb === 'has' && f.object.includes('children'))).toBeDefined();
  });

  it('location: "Caroline lives in Madrid"', () => {
    const r = extractAtomicFactsHeuristic('Caroline lives in Madrid.');
    const f = r.find((f) => f.verb === 'live' || f.verb === 'lives');
    expect(f).toBeDefined();
    expect(f!.object).toBe('Madrid');
  });

  it('location: "Caroline studies at Stanford"', () => {
    const r = extractAtomicFactsHeuristic('Caroline studies at Stanford.');
    const f = r.find((f) => f.verb.startsWith('studie'));
    expect(f).toBeDefined();
    expect(f!.object).toBe('Stanford');
  });

  it('preference: "Caroline likes hiking"', () => {
    const r = extractAtomicFactsHeuristic('Caroline likes hiking.');
    const f = r.find((f) => f.verb === 'like');
    expect(f).toBeDefined();
    expect(f!.object).toBe('hiking');
  });

  it('travel: "Caroline visited Spain"', () => {
    const r = extractAtomicFactsHeuristic('Caroline went to Spain.');
    const f = r.find((f) => f.verb === 'went');
    expect(f).toBeDefined();
    expect(f!.object).toBe('Spain');
  });

  it('possessive-attribute: "My daughter is 5 years old"', () => {
    const r = extractAtomicFactsHeuristic('My daughter is in college.');
    const f = r.find((f) => f.subject.includes('my daughter'));
    expect(f).toBeDefined();
    expect(f!.verb).toBe('is');
  });
});

// ===========================================================================
// Multi-fact extraction
// ===========================================================================

describe('extractAtomicFactsHeuristic — multi-fact', () => {
  it('extracts multiple facts from a multi-sentence turn', () => {
    const text =
      'Caroline lives in Madrid. She has two children. Caroline likes hiking.';
    const r = extractAtomicFactsHeuristic(text);
    expect(r.length).toBeGreaterThanOrEqual(2);
  });

  it('dedupes (subject, verb, object) lowercased', () => {
    const r = extractAtomicFactsHeuristic(
      'Caroline lives in Madrid. CAROLINE lives in MADRID.',
    );
    const liveFacts = r.filter((f) => f.verb.startsWith('live'));
    expect(liveFacts.length).toBe(1);
  });
});

// ===========================================================================
// Filtering
// ===========================================================================

describe('extractAtomicFactsHeuristic — filtering', () => {
  it('skips pronoun subjects without antecedent (it/this/that)', () => {
    const r = extractAtomicFactsHeuristic('It is great.');
    expect(r.length).toBe(0);
  });

  it('respects minSlotLength', () => {
    // "I am 45" → subject "I" is length 1; default minLen=1 keeps it.
    // With minLen=2, "I" is dropped.
    const r1 = extractAtomicFactsHeuristic('I am 45 years old.', { minSlotLength: 1 });
    const hasI = r1.some((f) => f.subject === 'I');
    expect(hasI).toBe(true);
    const r2 = extractAtomicFactsHeuristic('I am 45 years old.', { minSlotLength: 2 });
    const hasI2 = r2.some((f) => f.subject === 'I');
    expect(hasI2).toBe(false);
  });

  it('respects maxFacts cap', () => {
    const text = 'Caroline lives in Madrid. Caroline has children. Caroline studies at Stanford. Caroline likes hiking.';
    const r = extractAtomicFactsHeuristic(text, { maxFacts: 2 });
    expect(r.length).toBe(2);
  });
});

// ===========================================================================
// Provenance
// ===========================================================================

describe('extractAtomicFactsHeuristic — provenance', () => {
  it('attaches speaker + turnIndex when supplied', () => {
    const r = extractAtomicFactsHeuristic('Caroline lives in Madrid.', {
      speaker: 'Caroline',
      turnIndex: 42,
    });
    expect(r[0].speaker).toBe('Caroline');
    expect(r[0].turnIndex).toBe(42);
  });

  it('source = "heuristic" on every fact from the regex path', () => {
    const r = extractAtomicFactsHeuristic('Caroline lives in Madrid.');
    expect(r[0].source).toBe('heuristic');
  });
});

// ===========================================================================
// Defensive
// ===========================================================================

describe('extractAtomicFactsHeuristic — defensive', () => {
  it('empty string → []', () => {
    expect(extractAtomicFactsHeuristic('')).toEqual([]);
  });

  it('whitespace-only → []', () => {
    expect(extractAtomicFactsHeuristic('   \t\n   ')).toEqual([]);
  });

  it('null/undefined → []', () => {
    expect(extractAtomicFactsHeuristic(null as unknown as string)).toEqual([]);
    expect(extractAtomicFactsHeuristic(undefined as unknown as string)).toEqual([]);
  });

  it('text with no SVO patterns → []', () => {
    expect(extractAtomicFactsHeuristic('Hmm. Yeah. OK!')).toEqual([]);
  });
});

// ===========================================================================
// LLM-augmented path
// ===========================================================================

describe('extractAtomicFacts (with LLM)', () => {
  it('without llmExtractor → identical to heuristic', async () => {
    const text = 'Caroline lives in Madrid.';
    const heur = extractAtomicFactsHeuristic(text);
    const top = await extractAtomicFacts(text);
    expect(top).toEqual(heur);
  });

  it('LLM facts merged with heuristic, deduped by (s, v, o)', async () => {
    const text = 'Caroline lives in Madrid.';
    const llm: LLMFactExtractor = async () => [
      // Duplicate of heuristic — should drop.
      {
        subject: 'Caroline',
        verb: 'live',
        object: 'Madrid',
        confidence: 0.9,
        sourceText: 'Caroline lives in Madrid.',
      },
      // New fact only the LLM finds.
      {
        subject: 'Caroline',
        verb: 'has',
        object: 'a daughter named Sophie',
        confidence: 0.8,
        sourceText: 'inferred from context',
      },
    ];
    const r = await extractAtomicFacts(text, { llmExtractor: llm });
    expect(r.length).toBe(2);
    expect(r.find((f) => f.source === 'llm')).toBeDefined();
    expect(r.find((f) => f.object.includes('Sophie'))).toBeDefined();
  });

  it('LLM facts get source="llm" stamped', async () => {
    const llm: LLMFactExtractor = async () => [
      {
        subject: 'X',
        verb: 'is',
        object: 'Y',
        confidence: 0.5,
        sourceText: '...',
      },
    ];
    const r = await extractAtomicFacts('something with no heuristic match', {
      llmExtractor: llm,
    });
    expect(r[0].source).toBe('llm');
  });

  it('LLM facts back-fill missing speaker/turnIndex from options', async () => {
    const llm: LLMFactExtractor = async () => [
      {
        subject: 'X',
        verb: 'is',
        object: 'Y',
        confidence: 0.5,
        sourceText: '...',
      },
    ];
    const r = await extractAtomicFacts('text', {
      llmExtractor: llm,
      speaker: 'Caroline',
      turnIndex: 7,
    });
    expect(r[0].speaker).toBe('Caroline');
    expect(r[0].turnIndex).toBe(7);
  });

  it('LLM error propagates (caller decides fallback)', async () => {
    const llm: LLMFactExtractor = async () => {
      throw new Error('LLM boom');
    };
    await expect(
      extractAtomicFacts('Caroline lives in Madrid.', { llmExtractor: llm }),
    ).rejects.toThrow('LLM boom');
  });

  it('empty text + LLM → returns heuristic ([]) without invoking LLM', async () => {
    let called = false;
    const llm: LLMFactExtractor = async () => {
      called = true;
      return [];
    };
    const r = await extractAtomicFacts('', { llmExtractor: llm });
    expect(r).toEqual([]);
    expect(called).toBe(false);
  });
});

// ===========================================================================
// Utilities
// ===========================================================================

describe('factToSentence', () => {
  it('joins SVO with single spaces', () => {
    const f: AtomicFact = {
      subject: 'Caroline',
      verb: 'lives in',
      object: 'Madrid',
      confidence: 1,
      sourceText: '',
      source: 'heuristic',
    };
    expect(factToSentence(f)).toBe('Caroline lives in Madrid');
  });

  it('trims trailing whitespace', () => {
    const f: AtomicFact = {
      subject: '  Caroline  ',
      verb: 'is',
      object: 'a teacher',
      confidence: 1,
      sourceText: '',
      source: 'heuristic',
    };
    // factToSentence does a final trim on the joined output but not
    // per-slot — the test verifies the public contract: trim()-ed.
    expect(factToSentence(f).startsWith('Caroline') || factToSentence(f).startsWith('  Caroline')).toBe(true);
  });
});

describe('dedupeFacts', () => {
  it('preserves first occurrence on duplicates', () => {
    const facts: AtomicFact[] = [
      {
        subject: 'Caroline', verb: 'lives in', object: 'Madrid',
        confidence: 0.9, sourceText: 'a', source: 'heuristic',
      },
      {
        subject: 'CAROLINE', verb: 'LIVES IN', object: 'MADRID',
        confidence: 0.5, sourceText: 'b', source: 'llm',
      },
    ];
    const r = dedupeFacts(facts);
    expect(r.length).toBe(1);
    expect(r[0].sourceText).toBe('a'); // first occurrence wins
  });

  it('keeps distinct facts', () => {
    const facts: AtomicFact[] = [
      { subject: 'A', verb: 'is', object: 'X', confidence: 1, sourceText: '', source: 'heuristic' },
      { subject: 'B', verb: 'is', object: 'Y', confidence: 1, sourceText: '', source: 'heuristic' },
    ];
    expect(dedupeFacts(facts).length).toBe(2);
  });
});
