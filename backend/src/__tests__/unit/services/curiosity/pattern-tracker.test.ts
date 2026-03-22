/**
 * Tests for Phase 134: Prediction Engine — Pattern Tracker
 *
 * TDD: Tests written before implementation.
 * Covers extractTemporalPatterns, extractSequentialPatterns,
 * getHourOfDay, getDayOfWeek, findDominantPattern,
 * recordActivity, and loadPatterns.
 */

jest.mock('../../../../utils/logger', () => ({
  logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('../../../../utils/database-context', () => ({
  queryContext: jest.fn(),
}));

import {
  extractTemporalPatterns,
  extractSequentialPatterns,
  getHourOfDay,
  getDayOfWeek,
  findDominantPattern,
  recordActivity,
  loadPatterns,
} from '../../../../services/curiosity/pattern-tracker';
import type {
  TemporalPattern,
  SequentialPattern,
  ActivityRecord,
} from '../../../../services/curiosity/pattern-tracker';
import { queryContext } from '../../../../utils/database-context';

const mockQueryContext = queryContext as jest.MockedFunction<typeof queryContext>;

beforeEach(() => {
  jest.clearAllMocks();
  mockQueryContext.mockReset();
});

// ---------------------------------------------------------------------------
// Helper to create activity records
// ---------------------------------------------------------------------------

function makeActivity(
  hour: number,
  day: number,
  domain: string,
  intent: string,
  entities?: string[],
): ActivityRecord {
  // day: 0=Sun, 1=Mon, ..., 6=Sat
  // Create a date that falls on the given day and hour
  // 2026-03-22 is a Sunday (day 0)
  const base = new Date(2026, 2, 22 + day, hour, 0, 0);
  return { timestamp: base, domain, intent, entities };
}

// ---------------------------------------------------------------------------
// getHourOfDay
// ---------------------------------------------------------------------------

describe('getHourOfDay', () => {
  it('returns 0 for midnight', () => {
    expect(getHourOfDay(new Date(2026, 0, 1, 0, 0, 0))).toBe(0);
  });

  it('returns 23 for 11pm', () => {
    expect(getHourOfDay(new Date(2026, 0, 1, 23, 59, 59))).toBe(23);
  });

  it('returns 14 for 2pm', () => {
    expect(getHourOfDay(new Date(2026, 0, 1, 14, 30, 0))).toBe(14);
  });
});

// ---------------------------------------------------------------------------
// getDayOfWeek
// ---------------------------------------------------------------------------

describe('getDayOfWeek', () => {
  it('returns 0 for Sunday', () => {
    // 2026-03-22 is a Sunday
    expect(getDayOfWeek(new Date(2026, 2, 22))).toBe(0);
  });

  it('returns 1 for Monday', () => {
    // 2026-03-23 is a Monday
    expect(getDayOfWeek(new Date(2026, 2, 23))).toBe(1);
  });

  it('returns 6 for Saturday', () => {
    // 2026-03-28 is a Saturday
    expect(getDayOfWeek(new Date(2026, 2, 28))).toBe(6);
  });
});

// ---------------------------------------------------------------------------
// extractTemporalPatterns
// ---------------------------------------------------------------------------

describe('extractTemporalPatterns', () => {
  it('returns empty array for empty input', () => {
    expect(extractTemporalPatterns([])).toEqual([]);
  });

  it('returns single pattern for single activity', () => {
    const activities = [makeActivity(9, 1, 'work', 'search')];
    const patterns = extractTemporalPatterns(activities);
    expect(patterns).toHaveLength(1);
    expect(patterns[0].timeOfDay).toBe(9);
    expect(patterns[0].dayOfWeek).toBe(1);
    expect(patterns[0].domain).toBe('work');
    expect(patterns[0].intent).toBe('search');
    expect(patterns[0].frequency).toBe(1);
  });

  it('groups multiple activities at same time/domain/intent', () => {
    const activities = [
      makeActivity(9, 1, 'work', 'search'),
      makeActivity(9, 1, 'work', 'search'),
      makeActivity(9, 1, 'work', 'search'),
    ];
    const patterns = extractTemporalPatterns(activities);
    expect(patterns).toHaveLength(1);
    expect(patterns[0].frequency).toBe(3);
  });

  it('creates separate patterns for different times', () => {
    const activities = [
      makeActivity(9, 1, 'work', 'search'),
      makeActivity(14, 1, 'work', 'search'),
    ];
    const patterns = extractTemporalPatterns(activities);
    expect(patterns).toHaveLength(2);
  });

  it('creates separate patterns for different domains', () => {
    const activities = [
      makeActivity(9, 1, 'work', 'search'),
      makeActivity(9, 1, 'personal', 'search'),
    ];
    const patterns = extractTemporalPatterns(activities);
    expect(patterns).toHaveLength(2);
  });

  it('creates separate patterns for different intents', () => {
    const activities = [
      makeActivity(9, 1, 'work', 'search'),
      makeActivity(9, 1, 'work', 'create'),
    ];
    const patterns = extractTemporalPatterns(activities);
    expect(patterns).toHaveLength(2);
  });

  it('sorts by frequency descending', () => {
    const activities = [
      makeActivity(14, 2, 'personal', 'browse'),
      makeActivity(9, 1, 'work', 'search'),
      makeActivity(9, 1, 'work', 'search'),
      makeActivity(9, 1, 'work', 'search'),
      makeActivity(14, 2, 'personal', 'browse'),
    ];
    const patterns = extractTemporalPatterns(activities);
    expect(patterns[0].frequency).toBe(3);
    expect(patterns[1].frequency).toBe(2);
  });

  it('creates separate patterns for different days of week', () => {
    const activities = [
      makeActivity(9, 1, 'work', 'search'),
      makeActivity(9, 3, 'work', 'search'),
    ];
    const patterns = extractTemporalPatterns(activities);
    expect(patterns).toHaveLength(2);
  });

  it('correctly counts frequency for mixed activities', () => {
    const activities = [
      makeActivity(9, 1, 'work', 'search'),
      makeActivity(9, 1, 'work', 'search'),
      makeActivity(9, 1, 'work', 'create'),
      makeActivity(14, 3, 'personal', 'browse'),
    ];
    const patterns = extractTemporalPatterns(activities);
    expect(patterns).toHaveLength(3);
    const searchPattern = patterns.find((p) => p.intent === 'search' && p.timeOfDay === 9);
    expect(searchPattern?.frequency).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// extractSequentialPatterns
// ---------------------------------------------------------------------------

describe('extractSequentialPatterns', () => {
  it('returns empty array for empty input', () => {
    expect(extractSequentialPatterns([])).toEqual([]);
  });

  it('returns empty array for single activity (no pair)', () => {
    const activities = [makeActivity(9, 1, 'work', 'search')];
    expect(extractSequentialPatterns(activities)).toEqual([]);
  });

  it('returns one pair for two consecutive activities', () => {
    const activities = [
      makeActivity(9, 1, 'work', 'search'),
      makeActivity(10, 1, 'work', 'create'),
    ];
    const patterns = extractSequentialPatterns(activities);
    expect(patterns).toHaveLength(1);
    expect(patterns[0].fromIntent).toBe('search');
    expect(patterns[0].toIntent).toBe('create');
    expect(patterns[0].count).toBe(1);
    expect(patterns[0].probability).toBe(1.0);
  });

  it('extracts chain of intents correctly', () => {
    const activities = [
      makeActivity(9, 1, 'work', 'search'),
      makeActivity(10, 1, 'work', 'read'),
      makeActivity(11, 1, 'work', 'create'),
    ];
    const patterns = extractSequentialPatterns(activities);
    expect(patterns).toHaveLength(2);
    expect(patterns.find((p) => p.fromIntent === 'search' && p.toIntent === 'read')).toBeDefined();
    expect(patterns.find((p) => p.fromIntent === 'read' && p.toIntent === 'create')).toBeDefined();
  });

  it('computes correct probability for repeated patterns', () => {
    const activities = [
      makeActivity(9, 1, 'work', 'search'),
      makeActivity(10, 1, 'work', 'read'),
      makeActivity(11, 1, 'work', 'search'),
      makeActivity(12, 1, 'work', 'read'),
    ];
    const patterns = extractSequentialPatterns(activities);
    const searchToRead = patterns.find((p) => p.fromIntent === 'search' && p.toIntent === 'read');
    expect(searchToRead).toBeDefined();
    expect(searchToRead!.count).toBe(2);
    // search appears as fromIntent 2 times, and both transition to read
    expect(searchToRead!.probability).toBe(1.0);
  });

  it('computes probability correctly when from-intent has multiple targets', () => {
    const activities = [
      makeActivity(9, 1, 'work', 'search'),
      makeActivity(10, 1, 'work', 'read'),
      makeActivity(11, 1, 'work', 'search'),
      makeActivity(12, 1, 'work', 'create'),
    ];
    const patterns = extractSequentialPatterns(activities);
    const searchToRead = patterns.find((p) => p.fromIntent === 'search' && p.toIntent === 'read');
    const searchToCreate = patterns.find((p) => p.fromIntent === 'search' && p.toIntent === 'create');
    expect(searchToRead).toBeDefined();
    expect(searchToCreate).toBeDefined();
    // search transitions: 2 total (1 to read, 1 to create)
    expect(searchToRead!.probability).toBeCloseTo(0.5);
    expect(searchToCreate!.probability).toBeCloseTo(0.5);
  });

  it('sorts by count descending', () => {
    const activities = [
      makeActivity(9, 1, 'work', 'search'),
      makeActivity(10, 1, 'work', 'read'),
      makeActivity(11, 1, 'work', 'search'),
      makeActivity(12, 1, 'work', 'read'),
      makeActivity(13, 1, 'work', 'create'),
      makeActivity(14, 1, 'work', 'done'),
    ];
    const patterns = extractSequentialPatterns(activities);
    for (let i = 0; i < patterns.length - 1; i++) {
      expect(patterns[i].count).toBeGreaterThanOrEqual(patterns[i + 1].count);
    }
  });

  it('handles same intent repeated consecutively', () => {
    const activities = [
      makeActivity(9, 1, 'work', 'search'),
      makeActivity(10, 1, 'work', 'search'),
      makeActivity(11, 1, 'work', 'search'),
    ];
    const patterns = extractSequentialPatterns(activities);
    expect(patterns).toHaveLength(1);
    expect(patterns[0].fromIntent).toBe('search');
    expect(patterns[0].toIntent).toBe('search');
    expect(patterns[0].count).toBe(2);
    expect(patterns[0].probability).toBe(1.0);
  });
});

// ---------------------------------------------------------------------------
// findDominantPattern
// ---------------------------------------------------------------------------

describe('findDominantPattern', () => {
  const patterns: TemporalPattern[] = [
    { timeOfDay: 9, dayOfWeek: 1, domain: 'work', intent: 'search', frequency: 10 },
    { timeOfDay: 9, dayOfWeek: 1, domain: 'work', intent: 'create', frequency: 5 },
    { timeOfDay: 14, dayOfWeek: 3, domain: 'personal', intent: 'browse', frequency: 8 },
    { timeOfDay: 20, dayOfWeek: 5, domain: 'learning', intent: 'study', frequency: 12 },
  ];

  it('returns null for empty patterns', () => {
    expect(findDominantPattern([], 9, 1)).toBeNull();
  });

  it('returns exact match with highest frequency', () => {
    const result = findDominantPattern(patterns, 9, 1);
    expect(result).not.toBeNull();
    expect(result!.intent).toBe('search');
    expect(result!.frequency).toBe(10);
  });

  it('returns closest hour match on same day', () => {
    const result = findDominantPattern(patterns, 10, 1);
    expect(result).not.toBeNull();
    expect(result!.timeOfDay).toBe(9);
    expect(result!.dayOfWeek).toBe(1);
  });

  it('returns null when no pattern is close enough', () => {
    const sparsePatterns: TemporalPattern[] = [
      { timeOfDay: 3, dayOfWeek: 6, domain: 'work', intent: 'search', frequency: 5 },
    ];
    const result = findDominantPattern(sparsePatterns, 15, 2);
    expect(result).toBeNull();
  });

  it('prefers higher frequency among exact matches', () => {
    const multiMatch: TemporalPattern[] = [
      { timeOfDay: 9, dayOfWeek: 1, domain: 'work', intent: 'search', frequency: 3 },
      { timeOfDay: 9, dayOfWeek: 1, domain: 'work', intent: 'create', frequency: 7 },
    ];
    const result = findDominantPattern(multiMatch, 9, 1);
    expect(result!.intent).toBe('create');
    expect(result!.frequency).toBe(7);
  });

  it('matches nearby hour within threshold on same day', () => {
    const result = findDominantPattern(patterns, 15, 3);
    expect(result).not.toBeNull();
    expect(result!.timeOfDay).toBe(14);
  });
});

// ---------------------------------------------------------------------------
// recordActivity
// ---------------------------------------------------------------------------

describe('recordActivity', () => {
  it('writes activity to database', async () => {
    mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

    const activity: ActivityRecord = {
      timestamp: new Date(2026, 2, 22, 9, 0, 0),
      domain: 'work',
      intent: 'search',
      entities: ['typescript'],
    };

    await recordActivity('personal', activity);
    expect(mockQueryContext).toHaveBeenCalledTimes(1);
    expect(mockQueryContext).toHaveBeenCalledWith(
      'personal',
      expect.stringContaining('INSERT INTO activity_patterns'),
      expect.arrayContaining(['work', 'search']),
    );
  });

  it('does not throw on DB error (fire-and-forget)', async () => {
    mockQueryContext.mockRejectedValueOnce(new Error('DB write failed'));

    const activity: ActivityRecord = {
      timestamp: new Date(),
      domain: 'work',
      intent: 'search',
    };

    await expect(recordActivity('personal', activity)).resolves.toBeUndefined();
  });

  it('serializes entities as JSON', async () => {
    mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

    const activity: ActivityRecord = {
      timestamp: new Date(),
      domain: 'work',
      intent: 'search',
      entities: ['typescript', 'react'],
    };

    await recordActivity('personal', activity);
    const callArgs = mockQueryContext.mock.calls[0][2] as any[];
    expect(callArgs[3]).toBe(JSON.stringify(['typescript', 'react']));
  });

  it('serializes empty entities when not provided', async () => {
    mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

    const activity: ActivityRecord = {
      timestamp: new Date(),
      domain: 'work',
      intent: 'search',
    };

    await recordActivity('personal', activity);
    const callArgs = mockQueryContext.mock.calls[0][2] as any[];
    expect(callArgs[3]).toBe('[]');
  });
});

// ---------------------------------------------------------------------------
// loadPatterns
// ---------------------------------------------------------------------------

describe('loadPatterns', () => {
  it('loads activities from DB and returns temporal patterns', async () => {
    mockQueryContext.mockResolvedValueOnce({
      rows: [
        { timestamp: '2026-03-22T09:00:00Z', domain: 'work', intent: 'search', entities: '[]' },
        { timestamp: '2026-03-22T09:30:00Z', domain: 'work', intent: 'search', entities: '[]' },
        { timestamp: '2026-03-22T14:00:00Z', domain: 'personal', intent: 'browse', entities: '[]' },
      ],
    } as any);

    const patterns = await loadPatterns('personal');
    expect(Array.isArray(patterns)).toBe(true);
    expect(patterns.length).toBeGreaterThan(0);
  });

  it('returns empty array when no records exist', async () => {
    mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

    const patterns = await loadPatterns('personal');
    expect(patterns).toEqual([]);
  });

  it('returns empty array on DB error', async () => {
    mockQueryContext.mockRejectedValueOnce(new Error('DB connection failed'));

    const patterns = await loadPatterns('personal');
    expect(patterns).toEqual([]);
  });

  it('passes userId when provided', async () => {
    mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

    await loadPatterns('personal', 'user-123');
    expect(mockQueryContext).toHaveBeenCalledWith(
      'personal',
      expect.stringContaining('user_id'),
      ['user-123'],
    );
  });

  it('does not include userId param when not provided', async () => {
    mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

    await loadPatterns('personal');
    expect(mockQueryContext).toHaveBeenCalledWith(
      'personal',
      expect.any(String),
      [],
    );
  });
});
