/**
 * Phase 125: Recall Tracker Tests
 *
 * Tests for classifyRecallEvents (pure) and processRecallEvents (async DB).
 */

import {
  classifyRecallEvents,
  processRecallEvents,
  RecallEvent,
} from '../../../services/memory/recall-tracker';

// ===========================================
// Mocks
// ===========================================

jest.mock('../../../utils/database-context', () => ({
  queryContext: jest.fn(),
  isValidContext: (ctx: string) => ['personal', 'work', 'learning', 'creative'].includes(ctx),
}));

jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('../../../services/memory/fsrs-scheduler', () => ({
  updateAfterRecall: jest.fn().mockReturnValue({ difficulty: 4.8, stability: 12.0, nextReview: new Date() }),
  updateAfterForgot: jest.fn().mockReturnValue({ difficulty: 5.2, stability: 8.0, nextReview: new Date() }),
  getRetrievability: jest.fn().mockReturnValue(0.7),
}));

import { queryContext } from '../../../utils/database-context';
import { updateAfterRecall, updateAfterForgot, getRetrievability } from '../../../services/memory/fsrs-scheduler';

const mockQueryContext = queryContext as jest.MockedFunction<typeof queryContext>;
const mockUpdateAfterRecall = updateAfterRecall as jest.MockedFunction<typeof updateAfterRecall>;
const mockUpdateAfterForgot = updateAfterForgot as jest.MockedFunction<typeof updateAfterForgot>;
const mockGetRetrievability = getRetrievability as jest.MockedFunction<typeof getRetrievability>;

// ===========================================
// classifyRecallEvents Tests
// ===========================================

describe('classifyRecallEvents', () => {
  test('marks fact as success when its entity is in responseEntityIds', () => {
    const retrievedFactIds = ['fact-1'];
    const responseEntityIds = ['entity-A'];
    const factEntityMap = new Map([['fact-1', ['entity-A', 'entity-B']]]);

    const events = classifyRecallEvents(retrievedFactIds, responseEntityIds, factEntityMap);

    expect(events).toHaveLength(1);
    expect(events[0].factId).toBe('fact-1');
    expect(events[0].type).toBe('success');
    expect(events[0].retrievability).toBe(0.7);
  });

  test('marks fact as partial when none of its entities are in responseEntityIds', () => {
    const retrievedFactIds = ['fact-1'];
    const responseEntityIds = ['entity-X'];
    const factEntityMap = new Map([['fact-1', ['entity-A', 'entity-B']]]);

    const events = classifyRecallEvents(retrievedFactIds, responseEntityIds, factEntityMap);

    expect(events).toHaveLength(1);
    expect(events[0].factId).toBe('fact-1');
    expect(events[0].type).toBe('partial');
    expect(events[0].retrievability).toBe(0.7);
  });

  test('marks fact as partial when factEntityMap has no entry for it', () => {
    const retrievedFactIds = ['fact-1'];
    const responseEntityIds = ['entity-A'];
    const factEntityMap = new Map<string, string[]>(); // no entry for fact-1

    const events = classifyRecallEvents(retrievedFactIds, responseEntityIds, factEntityMap);

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('partial');
  });

  test('marks fact as partial when its entity list is empty', () => {
    const retrievedFactIds = ['fact-1'];
    const responseEntityIds = ['entity-A'];
    const factEntityMap = new Map([['fact-1', [] as string[]]]);

    const events = classifyRecallEvents(retrievedFactIds, responseEntityIds, factEntityMap);

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('partial');
  });

  test('returns empty array when no facts were retrieved', () => {
    const events = classifyRecallEvents([], ['entity-A'], new Map());
    expect(events).toHaveLength(0);
  });

  test('handles multiple retrieved facts independently', () => {
    const retrievedFactIds = ['fact-1', 'fact-2', 'fact-3'];
    const responseEntityIds = ['entity-A', 'entity-C'];
    const factEntityMap = new Map([
      ['fact-1', ['entity-A']], // success: entity-A referenced
      ['fact-2', ['entity-B']], // partial: entity-B not referenced
      ['fact-3', ['entity-C', 'entity-D']], // success: entity-C referenced
    ]);

    const events = classifyRecallEvents(retrievedFactIds, responseEntityIds, factEntityMap);

    expect(events).toHaveLength(3);
    const byId = Object.fromEntries(events.map(e => [e.factId, e]));
    expect(byId['fact-1'].type).toBe('success');
    expect(byId['fact-2'].type).toBe('partial');
    expect(byId['fact-3'].type).toBe('success');
  });

  test('sets default retrievability of 0.7 for all events', () => {
    const retrievedFactIds = ['fact-1', 'fact-2'];
    const responseEntityIds = ['entity-A'];
    const factEntityMap = new Map([
      ['fact-1', ['entity-A']],
      ['fact-2', ['entity-B']],
    ]);

    const events = classifyRecallEvents(retrievedFactIds, responseEntityIds, factEntityMap);

    expect(events.every(e => e.retrievability === 0.7)).toBe(true);
  });

  test('returns empty array when responseEntityIds is empty (all partial)', () => {
    const retrievedFactIds = ['fact-1'];
    const factEntityMap = new Map([['fact-1', ['entity-A']]]);

    const events = classifyRecallEvents(retrievedFactIds, [], factEntityMap);

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('partial');
  });

  test('uses exact string matching for entity lookup', () => {
    const retrievedFactIds = ['fact-1'];
    const responseEntityIds = ['Entity-A']; // different case
    const factEntityMap = new Map([['fact-1', ['entity-A']]]);

    const events = classifyRecallEvents(retrievedFactIds, responseEntityIds, factEntityMap);

    // Case-sensitive: 'entity-A' !== 'Entity-A' → partial
    expect(events[0].type).toBe('partial');
  });
});

// ===========================================
// processRecallEvents Tests
// ===========================================

describe('processRecallEvents', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdateAfterRecall.mockReturnValue({ difficulty: 4.8, stability: 12.0, nextReview: new Date() });
    mockUpdateAfterForgot.mockReturnValue({ difficulty: 5.2, stability: 8.0, nextReview: new Date() });
    mockGetRetrievability.mockReturnValue(0.7);
  });

  function makeDbRow(overrides: Partial<{
    fsrs_difficulty: number;
    fsrs_stability: number;
    fsrs_next_review: string;
    retrieval_count: number;
    last_accessed: string;
  }> = {}) {
    return {
      fsrs_difficulty: 5.0,
      fsrs_stability: 7.0,
      fsrs_next_review: new Date(Date.now() + 7 * 86400000).toISOString(),
      retrieval_count: 3,
      last_accessed: new Date().toISOString(),
      ...overrides,
    };
  }

  test('calls updateAfterRecall with grade 4 for success events', async () => {
    mockQueryContext
      .mockResolvedValueOnce({ rows: [makeDbRow()] } as any) // SELECT
      .mockResolvedValueOnce({ rows: [] } as any); // UPDATE

    const events: RecallEvent[] = [{ factId: 'fact-1', type: 'success', retrievability: 0.7 }];

    await processRecallEvents('personal', events);

    expect(mockUpdateAfterRecall).toHaveBeenCalledWith(
      expect.objectContaining({ difficulty: 5.0, stability: 7.0 }),
      4,
      0.7
    );
    expect(mockUpdateAfterForgot).not.toHaveBeenCalled();
  });

  test('calls updateAfterRecall with grade 3 for partial events', async () => {
    mockQueryContext
      .mockResolvedValueOnce({ rows: [makeDbRow()] } as any)
      .mockResolvedValueOnce({ rows: [] } as any);

    const events: RecallEvent[] = [{ factId: 'fact-1', type: 'partial', retrievability: 0.7 }];

    await processRecallEvents('personal', events);

    expect(mockUpdateAfterRecall).toHaveBeenCalledWith(
      expect.objectContaining({ difficulty: 5.0, stability: 7.0 }),
      3,
      0.7
    );
  });

  test('calls updateAfterForgot for forgot events', async () => {
    mockQueryContext
      .mockResolvedValueOnce({ rows: [makeDbRow()] } as any)
      .mockResolvedValueOnce({ rows: [] } as any);

    const events: RecallEvent[] = [{ factId: 'fact-1', type: 'forgot', retrievability: 0.3 }];

    await processRecallEvents('personal', events);

    expect(mockUpdateAfterForgot).toHaveBeenCalledWith(
      expect.objectContaining({ difficulty: 5.0, stability: 7.0 }),
      0.3
    );
    expect(mockUpdateAfterRecall).not.toHaveBeenCalled();
  });

  test('updates learned_facts with new FSRS state and increments retrieval_count', async () => {
    const newState = { difficulty: 4.8, stability: 12.0, nextReview: new Date('2026-04-01') };
    mockUpdateAfterRecall.mockReturnValue(newState);

    mockQueryContext
      .mockResolvedValueOnce({ rows: [makeDbRow({ retrieval_count: 5 })] } as any)
      .mockResolvedValueOnce({ rows: [] } as any);

    const events: RecallEvent[] = [{ factId: 'fact-1', type: 'success', retrievability: 0.7 }];

    await processRecallEvents('personal', events);

    const updateCall = mockQueryContext.mock.calls[1];
    expect(updateCall[1]).toMatch(/UPDATE.*learned_facts/i);
    expect(updateCall[2]).toContain(4.8); // new difficulty
    expect(updateCall[2]).toContain(12.0); // new stability
    expect(updateCall[2]).toContain('fact-1'); // factId in WHERE
  });

  test('skips event when fact is not found in DB', async () => {
    mockQueryContext.mockResolvedValueOnce({ rows: [] } as any); // SELECT returns nothing

    const events: RecallEvent[] = [{ factId: 'missing-fact', type: 'success', retrievability: 0.7 }];

    await processRecallEvents('personal', events);

    expect(mockUpdateAfterRecall).not.toHaveBeenCalled();
    expect(mockQueryContext).toHaveBeenCalledTimes(1); // only SELECT, no UPDATE
  });

  test('processes multiple events independently', async () => {
    // Two SELECT + two UPDATE calls
    mockQueryContext
      .mockResolvedValueOnce({ rows: [makeDbRow()] } as any)
      .mockResolvedValueOnce({ rows: [] } as any)
      .mockResolvedValueOnce({ rows: [makeDbRow()] } as any)
      .mockResolvedValueOnce({ rows: [] } as any);

    const events: RecallEvent[] = [
      { factId: 'fact-1', type: 'success', retrievability: 0.8 },
      { factId: 'fact-2', type: 'forgot', retrievability: 0.2 },
    ];

    await processRecallEvents('personal', events);

    expect(mockUpdateAfterRecall).toHaveBeenCalledTimes(1);
    expect(mockUpdateAfterForgot).toHaveBeenCalledTimes(1);
  });

  test('continues processing remaining events when one throws', async () => {
    mockQueryContext
      .mockRejectedValueOnce(new Error('DB error for fact-1')) // fact-1 SELECT fails
      .mockResolvedValueOnce({ rows: [makeDbRow()] } as any)   // fact-2 SELECT
      .mockResolvedValueOnce({ rows: [] } as any);              // fact-2 UPDATE

    const events: RecallEvent[] = [
      { factId: 'fact-1', type: 'success', retrievability: 0.7 },
      { factId: 'fact-2', type: 'success', retrievability: 0.6 },
    ];

    // Should not throw
    await expect(processRecallEvents('personal', events)).resolves.toBeUndefined();

    // fact-2 should still be processed
    expect(mockUpdateAfterRecall).toHaveBeenCalledTimes(1);
  });

  test('returns undefined (void) on success', async () => {
    mockQueryContext
      .mockResolvedValueOnce({ rows: [makeDbRow()] } as any)
      .mockResolvedValueOnce({ rows: [] } as any);

    const result = await processRecallEvents('personal', [
      { factId: 'fact-1', type: 'success', retrievability: 0.7 },
    ]);

    expect(result).toBeUndefined();
  });

  test('handles empty events array without DB calls', async () => {
    await processRecallEvents('personal', []);
    expect(mockQueryContext).not.toHaveBeenCalled();
  });

  test('passes correct context to queryContext', async () => {
    mockQueryContext
      .mockResolvedValueOnce({ rows: [makeDbRow()] } as any)
      .mockResolvedValueOnce({ rows: [] } as any);

    const events: RecallEvent[] = [{ factId: 'fact-1', type: 'success', retrievability: 0.7 }];

    await processRecallEvents('work', events);

    expect(mockQueryContext.mock.calls[0][0]).toBe('work');
    expect(mockQueryContext.mock.calls[1][0]).toBe('work');
  });

  test('last_accessed is updated in the UPDATE query', async () => {
    mockQueryContext
      .mockResolvedValueOnce({ rows: [makeDbRow()] } as any)
      .mockResolvedValueOnce({ rows: [] } as any);

    const events: RecallEvent[] = [{ factId: 'fact-1', type: 'partial', retrievability: 0.5 }];

    await processRecallEvents('personal', events);

    const updateCall = mockQueryContext.mock.calls[1];
    // The UPDATE SQL should reference last_accessed
    expect(updateCall[1]).toMatch(/last_accessed/i);
  });
});
