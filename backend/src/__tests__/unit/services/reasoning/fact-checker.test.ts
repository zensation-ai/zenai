/**
 * Fact Checker Service — Unit Tests (Phase 127, Task 4)
 *
 * TDD: tests written first, then implementation.
 *
 * Covers:
 * - extractStatements: sentence splitting, filtering, ordering, limits
 * - extractKeywords: stop word removal, lowercase, short-word filtering
 * - checkFactContradictions: negation patterns, numerical disagreements, limit, no-match
 * - identifyNewFactCandidates: novel-statement detection, 5-item limit
 * - runFactCheck: integration, error handling, duration measurement
 * - Edge cases: empty response, code-only response, very short response
 */

import {
  extractStatements,
  extractKeywords,
  checkFactContradictions,
  identifyNewFactCandidates,
  runFactCheck,
  type FactCheckResult,
  type Contradiction,
} from '../../../../services/reasoning/fact-checker';

// ──────────────────────────────────────────────────────────────
// Mocks
// ──────────────────────────────────────────────────────────────

const mockQueryContext = jest.fn();

jest.mock('../../../../utils/database-context', () => ({
  queryContext: (...args: unknown[]) => mockQueryContext(...args),
  isValidContext: (ctx: string) =>
    ['personal', 'work', 'learning', 'creative'].includes(ctx),
}));

jest.mock('../../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────

function makeRows(rows: object[]) {
  return { rows, rowCount: rows.length };
}

// ──────────────────────────────────────────────────────────────
// extractStatements
// ──────────────────────────────────────────────────────────────

describe('extractStatements', () => {
  beforeEach(() => jest.clearAllMocks());

  it('splits a response into individual sentences', () => {
    // Each sentence must have more than 5 words to pass the length filter
    const text =
      'The sky appears blue because of light scattering. Water is wet because of hydrogen bonding. Fire burns hot because of rapid oxidation.';
    const result = extractStatements(text);
    expect(result.length).toBe(3);
  });

  it('filters out sentences with 5 or fewer words', () => {
    const text = 'Hi there. The capital of Germany is Berlin and it has a rich history.';
    const result = extractStatements(text);
    expect(result).not.toContain('Hi there.');
    expect(result.some((s) => s.includes('Germany'))).toBe(true);
  });

  it('removes question sentences', () => {
    const text =
      'What is the weather today? The sun is a star at the center of our solar system.';
    const result = extractStatements(text);
    expect(result.every((s) => !s.endsWith('?'))).toBe(true);
    expect(result.some((s) => s.includes('sun'))).toBe(true);
  });

  it('removes greeting / meta-statements starting with "Hier ist"', () => {
    const text =
      'Hier ist die Antwort auf Ihre Frage. The Eiffel Tower is located in Paris, France.';
    const result = extractStatements(text);
    expect(result.every((s) => !s.startsWith('Hier ist'))).toBe(true);
  });

  it('removes meta-statements starting with "Ich kann"', () => {
    const text =
      'Ich kann Ihnen dabei helfen, das Problem zu lösen. Paris is the capital of France.';
    const result = extractStatements(text);
    expect(result.every((s) => !s.startsWith('Ich kann'))).toBe(true);
  });

  it('removes code blocks (``` ... ```)', () => {
    const text =
      'Here is an example. ```const x = 1; console.log(x);``` The code runs on Node.js version 20.';
    const result = extractStatements(text);
    expect(result.every((s) => !s.includes('```'))).toBe(true);
    expect(result.every((s) => !s.includes('const x'))).toBe(true);
  });

  it('returns at most 10 statements', () => {
    const sentences = Array.from(
      { length: 15 },
      (_, i) => `Statement number ${i + 1} has enough words to pass the filter.`,
    );
    const text = sentences.join(' ');
    const result = extractStatements(text);
    expect(result.length).toBeLessThanOrEqual(10);
  });

  it('orders by information density (longer sentences first)', () => {
    const short = 'Dogs are mammals with four legs.';
    const long =
      'The African elephant is the largest land animal on Earth and lives in sub-Saharan Africa.';
    const result = extractStatements(`${short} ${long}`);
    // Long sentence should appear before short sentence
    expect(result.indexOf(long)).toBeLessThan(result.indexOf(short));
  });

  it('handles empty input gracefully', () => {
    expect(extractStatements('')).toEqual([]);
  });

  it('handles input containing only code blocks', () => {
    const text = '```\nconst a = 1;\nconst b = 2;\n```';
    expect(extractStatements(text)).toEqual([]);
  });

  it('handles very short input (under word threshold)', () => {
    expect(extractStatements('Hi. Ok. Yes.')).toEqual([]);
  });

  it('splits on exclamation marks as well as periods', () => {
    const text =
      'Water freezes at zero degrees Celsius under standard atmospheric pressure! Fire requires oxygen to sustain combustion above a certain threshold.';
    const result = extractStatements(text);
    expect(result.length).toBe(2);
  });
});

// ──────────────────────────────────────────────────────────────
// extractKeywords
// ──────────────────────────────────────────────────────────────

describe('extractKeywords', () => {
  beforeEach(() => jest.clearAllMocks());

  it('lowercases all keywords', () => {
    const keywords = extractKeywords('Berlin IS the Capital of Germany');
    expect(keywords.every((k) => k === k.toLowerCase())).toBe(true);
  });

  it('removes English stop words', () => {
    const keywords = extractKeywords('the cat is on the mat and was happy');
    expect(keywords).not.toContain('the');
    expect(keywords).not.toContain('is');
    expect(keywords).not.toContain('and');
    expect(keywords).not.toContain('was');
  });

  it('removes German stop words', () => {
    const keywords = extractKeywords('der Hund ist ein treues Tier und läuft');
    expect(keywords).not.toContain('der');
    expect(keywords).not.toContain('ist');
    expect(keywords).not.toContain('ein');
    expect(keywords).not.toContain('und');
  });

  it('removes words shorter than 3 characters', () => {
    const keywords = extractKeywords('an ox is in it at up to');
    expect(keywords.every((k) => k.length >= 3)).toBe(true);
  });

  it('returns unique keywords', () => {
    const keywords = extractKeywords('paris paris paris is the capital capital of france');
    const uniqueCount = new Set(keywords).size;
    expect(keywords.length).toBe(uniqueCount);
  });

  it('handles empty string', () => {
    expect(extractKeywords('')).toEqual([]);
  });

  it('strips punctuation from words', () => {
    const keywords = extractKeywords('Berlin, Germany. France! Italy?');
    expect(keywords).not.toContain('berlin,');
    expect(keywords).toContain('berlin');
  });
});

// ──────────────────────────────────────────────────────────────
// checkFactContradictions
// ──────────────────────────────────────────────────────────────

describe('checkFactContradictions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryContext.mockReset();
  });

  it('detects a negation-pattern contradiction (fact negates statement)', async () => {
    // Statement says X is true; known fact says X is not true
    const statements = ['The project deadline is next Friday.'];
    mockQueryContext.mockResolvedValue(
      makeRows([
        {
          id: 'fact-1',
          content: 'The project deadline is not next Friday.',
          confidence: 0.9,
        },
      ]),
    );

    const result = await checkFactContradictions('personal', statements);
    expect(result.length).toBeGreaterThanOrEqual(1);
    const c = result[0];
    expect(c.factId).toBe('fact-1');
    expect(c.confidence).toBeGreaterThan(0);
    expect(c.confidence).toBeLessThanOrEqual(0.7);
  });

  it('detects a numerical disagreement (different numbers for same entity)', async () => {
    const statements = ['The team has 5 engineers working on the project.'];
    mockQueryContext.mockResolvedValue(
      makeRows([
        {
          id: 'fact-2',
          content: 'The team has 12 engineers working on the project.',
          confidence: 0.85,
        },
      ]),
    );

    const result = await checkFactContradictions('personal', statements);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].factId).toBe('fact-2');
  });

  it('returns empty array when no contradicting facts are found', async () => {
    const statements = ['The sky is blue on a clear day.'];
    mockQueryContext.mockResolvedValue(makeRows([]));

    const result = await checkFactContradictions('personal', statements);
    expect(result).toEqual([]);
  });

  it('respects the limit parameter', async () => {
    // Statement has keyword overlap with multiple facts
    const statements = ['Paris is the capital city of France.'];
    const manyFacts = Array.from({ length: 10 }, (_, i) => ({
      id: `fact-${i}`,
      content: `Paris city capital France info ${i}.`,
      confidence: 0.5,
    }));
    // limit = 3 means we check at most 3 facts per statement
    mockQueryContext.mockResolvedValue(makeRows(manyFacts.slice(0, 3)));

    const result = await checkFactContradictions('personal', statements, 3);
    // DB was called with limit 3
    const callArgs = mockQueryContext.mock.calls[0];
    expect(callArgs).toBeDefined();
    // The SQL or params should include the limit value
    const params = callArgs[2] as unknown[];
    expect(params).toContain(3);
  });

  it('does not flag facts with same assertion (no contradiction)', async () => {
    const statements = ['The project deadline is next Friday.'];
    mockQueryContext.mockResolvedValue(
      makeRows([
        {
          id: 'fact-3',
          content: 'The project deadline is next Friday.',
          confidence: 0.9,
        },
      ]),
    );

    const result = await checkFactContradictions('personal', statements);
    // Exact same content is not a contradiction
    expect(result.length).toBe(0);
  });

  it('handles multiple statements and aggregates contradictions', async () => {
    const statements = [
      'Alice is the team lead for the backend.',
      'The release is scheduled for January.',
    ];
    mockQueryContext
      .mockResolvedValueOnce(
        makeRows([
          { id: 'fact-4', content: 'Alice is not the team lead for the backend.', confidence: 0.8 },
        ]),
      )
      .mockResolvedValueOnce(makeRows([]));

    const result = await checkFactContradictions('personal', statements);
    expect(result.length).toBe(1);
    expect(result[0].factId).toBe('fact-4');
  });
});

// ──────────────────────────────────────────────────────────────
// identifyNewFactCandidates
// ──────────────────────────────────────────────────────────────

describe('identifyNewFactCandidates', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryContext.mockReset();
  });

  it('identifies statements with no matching facts as new candidates', async () => {
    const statements = ['Alexander invented a new sorting algorithm called ZenSort.'];
    mockQueryContext.mockResolvedValue(makeRows([]));

    const result = await identifyNewFactCandidates('personal', statements);
    expect(result).toContain(statements[0]);
  });

  it('does not include statements that already have matching facts', async () => {
    const statements = ['Paris is the capital of France.'];
    mockQueryContext.mockResolvedValue(
      makeRows([{ id: 'fact-5', content: 'Paris capital France europe.', confidence: 0.9 }]),
    );

    const result = await identifyNewFactCandidates('personal', statements);
    expect(result).not.toContain(statements[0]);
  });

  it('returns at most 5 new fact candidates', async () => {
    const statements = Array.from(
      { length: 8 },
      (_, i) => `Completely novel statement number ${i + 1} with unique information here.`,
    );
    mockQueryContext.mockResolvedValue(makeRows([]));

    const result = await identifyNewFactCandidates('personal', statements);
    expect(result.length).toBeLessThanOrEqual(5);
  });

  it('handles empty statements array', async () => {
    const result = await identifyNewFactCandidates('personal', []);
    expect(result).toEqual([]);
    expect(mockQueryContext).not.toHaveBeenCalled();
  });

  it('mixes known and novel statements correctly', async () => {
    const known = 'Paris is the capital of France.';
    const novel = 'ZenAI launched a new reasoning module in 2026.';
    mockQueryContext
      .mockResolvedValueOnce(
        makeRows([{ id: 'f1', content: 'Paris France capital.', confidence: 0.9 }]),
      )
      .mockResolvedValueOnce(makeRows([]));

    const result = await identifyNewFactCandidates('personal', [known, novel]);
    expect(result).not.toContain(known);
    expect(result).toContain(novel);
  });
});

// ──────────────────────────────────────────────────────────────
// runFactCheck (integration)
// ──────────────────────────────────────────────────────────────

describe('runFactCheck', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryContext.mockReset();
  });

  it('returns a FactCheckResult with the correct shape', async () => {
    mockQueryContext.mockResolvedValue(makeRows([]));
    const result = await runFactCheck(
      'personal',
      'The Eiffel Tower is located in Paris, France, and was built in 1889.',
    );

    expect(result).toHaveProperty('hasContradictions');
    expect(result).toHaveProperty('contradictions');
    expect(result).toHaveProperty('newFactCandidates');
    expect(result).toHaveProperty('checkDuration');
    expect(Array.isArray(result.contradictions)).toBe(true);
    expect(Array.isArray(result.newFactCandidates)).toBe(true);
    expect(typeof result.checkDuration).toBe('number');
  });

  it('reports hasContradictions = true when contradictions are found', async () => {
    // Statement must pass the > 5-word filter
    const responseText =
      'The engineering project currently employs exactly 5 dedicated developers on backend.';

    // All DB calls return the contradicting fact — both checkFact and identifyNew
    // will query for the same statement; contradiction detection still fires.
    mockQueryContext.mockResolvedValue(
      makeRows([
        {
          id: 'fact-10',
          content: 'The engineering project does not have 5 developers working on backend.',
          confidence: 0.8,
        },
      ]),
    );

    const result = await runFactCheck('personal', responseText);
    expect(result.hasContradictions).toBe(true);
    expect(result.contradictions.length).toBeGreaterThanOrEqual(1);
  });

  it('reports hasContradictions = false when no contradictions are found', async () => {
    mockQueryContext.mockResolvedValue(makeRows([]));
    const result = await runFactCheck(
      'personal',
      'Quantum computing uses qubits to perform computations exponentially faster than classical computers.',
    );
    expect(result.hasContradictions).toBe(false);
  });

  it('measures checkDuration in milliseconds', async () => {
    mockQueryContext.mockResolvedValue(makeRows([]));
    const result = await runFactCheck('personal', 'Test statement about something meaningful.');
    expect(result.checkDuration).toBeGreaterThanOrEqual(0);
  });

  it('returns empty result gracefully when a DB error occurs', async () => {
    mockQueryContext.mockRejectedValue(new Error('DB connection failed'));
    const result = await runFactCheck('personal', 'The server is down due to maintenance.');

    expect(result.hasContradictions).toBe(false);
    expect(result.contradictions).toEqual([]);
    expect(result.newFactCandidates).toEqual([]);
    expect(result.checkDuration).toBeGreaterThanOrEqual(0);
  });

  it('returns empty result for empty responseText', async () => {
    mockQueryContext.mockResolvedValue(makeRows([]));
    const result = await runFactCheck('personal', '');

    expect(result.hasContradictions).toBe(false);
    expect(result.contradictions).toEqual([]);
  });

  it('handles response containing only code blocks', async () => {
    mockQueryContext.mockResolvedValue(makeRows([]));
    const result = await runFactCheck(
      'personal',
      '```\nconst x = 1;\nconst y = 2;\nconsole.log(x + y);\n```',
    );

    expect(result.hasContradictions).toBe(false);
    expect(result.contradictions).toEqual([]);
  });
});
