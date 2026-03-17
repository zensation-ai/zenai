/**
 * Phase 88: Habit Engine Service — Dedicated Unit Tests
 */

import { queryContext } from '../../../utils/database-context';

jest.mock('../../../utils/database-context', () => ({
  queryContext: jest.fn(),
  isValidContext: jest.fn((ctx: string) =>
    ['personal', 'work', 'learning', 'creative'].includes(ctx),
  ),
}));

jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid-habit'),
}));

const mockQueryContext = queryContext as jest.MockedFunction<typeof queryContext>;

import {
  recordActivity,
  detectPatterns,
  generateSuggestions,
  getHabitStats,
  getStoredPatterns,
  type HabitPattern,
} from '../../../services/habit-engine';

// ─── Helper ───────────────────────────────────────────

function makePattern(overrides: Partial<HabitPattern> = {}): HabitPattern {
  return {
    id: 'p-1',
    pattern_type: 'routine',
    description: 'You frequently visit "/chat" around 9:00',
    detected_at: '2026-03-17T10:00:00.000Z',
    confidence: 0.7,
    data: { page: '/chat', hour: 9, count: 7 },
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════
// recordActivity
// ═══════════════════════════════════════════════════════

describe('recordActivity', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryContext.mockReset();
  });

  it('should insert activity and return ID', async () => {
    mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

    const result = await recordActivity('personal', 'user-1', 'page_visit', { page: '/dashboard' });

    expect(result.id).toBe('mock-uuid-habit');
    expect(mockQueryContext).toHaveBeenCalledWith(
      'personal',
      expect.stringContaining('INSERT INTO habit_activities'),
      expect.arrayContaining(['mock-uuid-habit', 'user-1', 'page_visit']),
    );
  });

  it('should extract page from metadata', async () => {
    mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

    await recordActivity('personal', 'user-1', 'page_visit', { page: '/chat' });

    const args = mockQueryContext.mock.calls[0][2] as unknown[];
    expect(args[3]).toBe('/chat'); // page parameter
  });

  it('should use empty string when page not in metadata', async () => {
    mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

    await recordActivity('personal', 'user-1', 'task_complete', {});

    const args = mockQueryContext.mock.calls[0][2] as unknown[];
    expect(args[3]).toBe(''); // page defaults to ''
  });

  it('should use empty metadata when not provided', async () => {
    mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

    await recordActivity('personal', 'user-1', 'break');

    const args = mockQueryContext.mock.calls[0][2] as unknown[];
    expect(args[4]).toBe('{}'); // JSON.stringify({})
  });

  it('should serialize metadata as JSON', async () => {
    mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

    await recordActivity('personal', 'user-1', 'page_visit', { page: '/chat', duration: 120 });

    const args = mockQueryContext.mock.calls[0][2] as unknown[];
    const parsed = JSON.parse(args[4] as string);
    expect(parsed.page).toBe('/chat');
    expect(parsed.duration).toBe(120);
  });

  it('should work with all valid contexts', async () => {
    for (const ctx of ['personal', 'work', 'learning', 'creative'] as const) {
      mockQueryContext.mockReset();
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      const result = await recordActivity(ctx, 'user-1', 'page_visit');
      expect(result.id).toBeDefined();
      expect(mockQueryContext).toHaveBeenCalledWith(ctx, expect.any(String), expect.any(Array));
    }
  });

  it('should propagate database errors', async () => {
    mockQueryContext.mockRejectedValueOnce(new Error('Insert failed'));

    await expect(recordActivity('personal', 'user-1', 'page_visit')).rejects.toThrow('Insert failed');
  });
});

// ═══════════════════════════════════════════════════════
// detectPatterns
// ═══════════════════════════════════════════════════════

describe('detectPatterns', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryContext.mockReset();
  });

  it('should detect routine patterns from recurring page visits', async () => {
    // Routine query
    mockQueryContext.mockResolvedValueOnce({
      rows: [{ page: '/chat', hour: 9, visit_count: 7 }],
    } as any);
    // Productivity query
    mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);
    // Break query
    mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);
    // Persist pattern (1 insert)
    mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

    const patterns = await detectPatterns('personal', 'user-1');

    expect(patterns).toHaveLength(1);
    expect(patterns[0].pattern_type).toBe('routine');
    expect(patterns[0].description).toContain('/chat');
    expect(patterns[0].description).toContain('9:00');
    expect(patterns[0].confidence).toBeCloseTo(0.7, 1);
  });

  it('should detect productivity patterns from task completion bursts', async () => {
    mockQueryContext.mockResolvedValueOnce({ rows: [] } as any); // routine
    mockQueryContext.mockResolvedValueOnce({
      rows: [{ day: '2026-03-17', activity_count: 5 }],
    } as any); // productivity
    mockQueryContext.mockResolvedValueOnce({ rows: [] } as any); // break
    mockQueryContext.mockResolvedValueOnce({ rows: [] } as any); // persist

    const patterns = await detectPatterns('personal', 'user-1');

    expect(patterns).toHaveLength(1);
    expect(patterns[0].pattern_type).toBe('productivity');
    expect(patterns[0].description).toContain('5 tasks');
  });

  it('should detect break patterns', async () => {
    mockQueryContext.mockResolvedValueOnce({ rows: [] } as any); // routine
    mockQueryContext.mockResolvedValueOnce({ rows: [] } as any); // productivity
    mockQueryContext.mockResolvedValueOnce({
      rows: [{ hour: 15, count: 4 }],
    } as any); // break
    mockQueryContext.mockResolvedValueOnce({ rows: [] } as any); // persist

    const patterns = await detectPatterns('personal', 'user-1');

    expect(patterns).toHaveLength(1);
    expect(patterns[0].pattern_type).toBe('break');
    expect(patterns[0].description).toContain('15:00');
  });

  it('should return empty array when no patterns found', async () => {
    mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);
    mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);
    mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

    const patterns = await detectPatterns('personal', 'user-1');
    expect(patterns).toEqual([]);
  });

  it('should detect multiple pattern types simultaneously', async () => {
    mockQueryContext.mockResolvedValueOnce({
      rows: [{ page: '/ideas', hour: 10, visit_count: 5 }],
    } as any);
    mockQueryContext.mockResolvedValueOnce({
      rows: [{ day: '2026-03-17', activity_count: 6 }],
    } as any);
    mockQueryContext.mockResolvedValueOnce({
      rows: [{ hour: 12, count: 3 }],
    } as any);
    // 3 persist calls
    mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);
    mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);
    mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

    const patterns = await detectPatterns('personal', 'user-1');

    expect(patterns).toHaveLength(3);
    const types = patterns.map(p => p.pattern_type);
    expect(types).toContain('routine');
    expect(types).toContain('productivity');
    expect(types).toContain('break');
  });

  it('should cap confidence at 1.0', async () => {
    mockQueryContext.mockResolvedValueOnce({
      rows: [{ page: '/chat', hour: 9, visit_count: 50 }], // 50/10 = 5, capped to 1
    } as any);
    mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);
    mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);
    mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

    const patterns = await detectPatterns('personal', 'user-1');
    expect(patterns[0].confidence).toBeLessThanOrEqual(1);
    expect(patterns[0].confidence).toBe(1);
  });

  it('should persist detected patterns to database', async () => {
    mockQueryContext.mockResolvedValueOnce({
      rows: [{ page: '/chat', hour: 9, visit_count: 7 }],
    } as any);
    mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);
    mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);
    mockQueryContext.mockResolvedValueOnce({ rows: [] } as any); // persist

    await detectPatterns('personal', 'user-1');

    // 3 detection queries + 1 persist
    expect(mockQueryContext).toHaveBeenCalledTimes(4);
    expect(mockQueryContext).toHaveBeenLastCalledWith(
      'personal',
      expect.stringContaining('INSERT INTO habit_patterns'),
      expect.any(Array),
    );
  });

  it('should handle database errors gracefully and return empty array', async () => {
    mockQueryContext.mockRejectedValueOnce(new Error('DB error'));

    const patterns = await detectPatterns('personal', 'user-1');
    expect(patterns).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════
// generateSuggestions
// ═══════════════════════════════════════════════════════

describe('generateSuggestions', () => {
  it('should return default suggestion when no patterns', () => {
    const suggestions = generateSuggestions('personal', 'user-1', []);

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].type).toBe('optimize');
    expect(suggestions[0].title).toContain('Start building');
    expect(suggestions[0].priority).toBe('low');
  });

  it('should create routine suggestion for high confidence pattern', () => {
    const suggestions = generateSuggestions('personal', 'user-1', [
      makePattern({ pattern_type: 'routine', confidence: 0.7 }),
    ]);

    expect(suggestions.length).toBeGreaterThanOrEqual(1);
    expect(suggestions[0].type).toBe('routine');
    expect(suggestions[0].title).toContain('Optimize your routine');
    expect(suggestions[0].priority).toBe('high');
  });

  it('should create medium priority routine for lower confidence', () => {
    const suggestions = generateSuggestions('personal', 'user-1', [
      makePattern({ pattern_type: 'routine', confidence: 0.5 }),
    ]);

    expect(suggestions[0].type).toBe('routine');
    expect(suggestions[0].priority).toBe('medium');
  });

  it('should skip routine suggestion when confidence below 0.4', () => {
    const suggestions = generateSuggestions('personal', 'user-1', [
      makePattern({ pattern_type: 'routine', confidence: 0.3 }),
    ]);

    // No routine suggestion, falls through to default
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].type).toBe('optimize');
  });

  it('should create focus suggestion from productivity pattern', () => {
    const suggestions = generateSuggestions('personal', 'user-1', [
      makePattern({ pattern_type: 'productivity' }),
    ]);

    expect(suggestions.some(s => s.type === 'focus')).toBe(true);
    const focusSuggestion = suggestions.find(s => s.type === 'focus')!;
    expect(focusSuggestion.title).toContain('Replicate');
    expect(focusSuggestion.priority).toBe('medium');
  });

  it('should create break suggestion from break pattern', () => {
    const suggestions = generateSuggestions('personal', 'user-1', [
      makePattern({ pattern_type: 'break' }),
    ]);

    expect(suggestions.some(s => s.type === 'break')).toBe(true);
    const breakSuggestion = suggestions.find(s => s.type === 'break')!;
    expect(breakSuggestion.title).toContain('break schedule');
    expect(breakSuggestion.priority).toBe('low');
  });

  it('should generate multiple suggestions from multiple patterns', () => {
    const suggestions = generateSuggestions('personal', 'user-1', [
      makePattern({ pattern_type: 'routine', confidence: 0.8 }),
      makePattern({ pattern_type: 'productivity', id: 'p-2' }),
      makePattern({ pattern_type: 'break', id: 'p-3' }),
    ]);

    expect(suggestions.length).toBe(3);
    const types = suggestions.map(s => s.type);
    expect(types).toContain('routine');
    expect(types).toContain('focus');
    expect(types).toContain('break');
  });

  it('should include pattern description in suggestion description', () => {
    const desc = 'You frequently visit "/chat" around 9:00';
    const suggestions = generateSuggestions('personal', 'user-1', [
      makePattern({ pattern_type: 'routine', description: desc, confidence: 0.5 }),
    ]);

    expect(suggestions[0].description).toContain(desc);
  });

  it('should not include default suggestion when patterns generate suggestions', () => {
    const suggestions = generateSuggestions('personal', 'user-1', [
      makePattern({ pattern_type: 'productivity' }),
    ]);

    expect(suggestions.every(s => s.type !== 'optimize')).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════
// getHabitStats
// ═══════════════════════════════════════════════════════

describe('getHabitStats', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryContext.mockReset();
  });

  it('should return aggregated stats from multiple queries', async () => {
    mockQueryContext
      .mockResolvedValueOnce({ rows: [{ cnt: 42 }] } as any)                      // activities
      .mockResolvedValueOnce({ rows: [{ completed: 10, total: 20 }] } as any)     // tasks
      .mockResolvedValueOnce({ rows: [{ total_minutes: 120 }] } as any)           // focus
      .mockResolvedValueOnce({ rows: [{ streak: 5 }] } as any)                    // streak
      .mockResolvedValueOnce({ rows: [{ page: '/chat', cnt: 15 }] } as any);      // pages

    const stats = await getHabitStats('personal', 'user-1');

    expect(stats.activitiesThisWeek).toBe(42);
    expect(stats.taskCompletionRate).toBe(0.5);
    expect(stats.deepWorkMinutes).toBe(120);
    expect(stats.currentStreak).toBe(5);
    expect(stats.topPages).toEqual([{ page: '/chat', count: 15 }]);
  });

  it('should handle zero total tasks (avoid division by zero)', async () => {
    mockQueryContext
      .mockResolvedValueOnce({ rows: [{ cnt: 0 }] } as any)
      .mockResolvedValueOnce({ rows: [{ completed: 0, total: 0 }] } as any)
      .mockResolvedValueOnce({ rows: [{ total_minutes: 0 }] } as any)
      .mockResolvedValueOnce({ rows: [{ streak: 0 }] } as any)
      .mockResolvedValueOnce({ rows: [] } as any);

    const stats = await getHabitStats('personal', 'user-1');

    expect(stats.taskCompletionRate).toBe(0);
    expect(stats.deepWorkMinutes).toBe(0);
    expect(stats.currentStreak).toBe(0);
    expect(stats.topPages).toEqual([]);
  });

  it('should handle null/missing values in query results', async () => {
    mockQueryContext
      .mockResolvedValueOnce({ rows: [{}] } as any)
      .mockResolvedValueOnce({ rows: [{}] } as any)
      .mockResolvedValueOnce({ rows: [{}] } as any)
      .mockResolvedValueOnce({ rows: [{}] } as any)
      .mockResolvedValueOnce({ rows: [] } as any);

    const stats = await getHabitStats('personal', 'user-1');

    expect(stats.activitiesThisWeek).toBe(0);
    expect(stats.taskCompletionRate).toBe(0);
    expect(stats.deepWorkMinutes).toBe(0);
    expect(stats.currentStreak).toBe(0);
  });

  it('should return default stats on database error', async () => {
    mockQueryContext.mockRejectedValue(new Error('DB connection failed'));

    const stats = await getHabitStats('personal', 'user-1');

    expect(stats).toEqual({
      deepWorkMinutes: 0,
      taskCompletionRate: 0,
      currentStreak: 0,
      activitiesThisWeek: 0,
      topPages: [],
    });
  });

  it('should return multiple top pages', async () => {
    mockQueryContext
      .mockResolvedValueOnce({ rows: [{ cnt: 10 }] } as any)
      .mockResolvedValueOnce({ rows: [{ completed: 5, total: 10 }] } as any)
      .mockResolvedValueOnce({ rows: [{ total_minutes: 60 }] } as any)
      .mockResolvedValueOnce({ rows: [{ streak: 3 }] } as any)
      .mockResolvedValueOnce({
        rows: [
          { page: '/chat', cnt: 20 },
          { page: '/ideas', cnt: 15 },
          { page: '/dashboard', cnt: 10 },
        ],
      } as any);

    const stats = await getHabitStats('personal', 'user-1');

    expect(stats.topPages).toHaveLength(3);
    expect(stats.topPages[0].page).toBe('/chat');
    expect(stats.topPages[0].count).toBe(20);
  });

  it('should make exactly 5 database queries', async () => {
    mockQueryContext
      .mockResolvedValueOnce({ rows: [{ cnt: 0 }] } as any)
      .mockResolvedValueOnce({ rows: [{ completed: 0, total: 0 }] } as any)
      .mockResolvedValueOnce({ rows: [{ total_minutes: 0 }] } as any)
      .mockResolvedValueOnce({ rows: [{ streak: 0 }] } as any)
      .mockResolvedValueOnce({ rows: [] } as any);

    await getHabitStats('work', 'user-1');

    expect(mockQueryContext).toHaveBeenCalledTimes(5);
    // All queries should use same context
    for (let i = 0; i < 5; i++) {
      expect(mockQueryContext.mock.calls[i][0]).toBe('work');
    }
  });

  it('should calculate completion rate correctly', async () => {
    mockQueryContext
      .mockResolvedValueOnce({ rows: [{ cnt: 10 }] } as any)
      .mockResolvedValueOnce({ rows: [{ completed: 7, total: 10 }] } as any)
      .mockResolvedValueOnce({ rows: [{ total_minutes: 0 }] } as any)
      .mockResolvedValueOnce({ rows: [{ streak: 0 }] } as any)
      .mockResolvedValueOnce({ rows: [] } as any);

    const stats = await getHabitStats('personal', 'user-1');
    expect(stats.taskCompletionRate).toBeCloseTo(0.7, 5);
  });
});

// ═══════════════════════════════════════════════════════
// getStoredPatterns
// ═══════════════════════════════════════════════════════

describe('getStoredPatterns', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryContext.mockReset();
  });

  it('should return stored patterns from database', async () => {
    mockQueryContext.mockResolvedValueOnce({
      rows: [{
        id: 'p-1',
        pattern_type: 'routine',
        description: 'You frequently visit "/chat" around 9:00',
        confidence: 0.7,
        data: { page: '/chat', hour: 9, count: 7 },
        detected_at: '2026-03-17T10:00:00.000Z',
      }],
    } as any);

    const patterns = await getStoredPatterns('personal', 'user-1');

    expect(patterns).toHaveLength(1);
    expect(patterns[0].id).toBe('p-1');
    expect(patterns[0].pattern_type).toBe('routine');
    expect(patterns[0].confidence).toBe(0.7);
    expect(patterns[0].data).toEqual({ page: '/chat', hour: 9, count: 7 });
  });

  it('should return empty array when no patterns stored', async () => {
    mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

    const patterns = await getStoredPatterns('personal', 'user-1');
    expect(patterns).toEqual([]);
  });

  it('should handle null data field', async () => {
    mockQueryContext.mockResolvedValueOnce({
      rows: [{
        id: 'p-1',
        pattern_type: 'routine',
        description: 'test',
        confidence: 0.5,
        data: null,
        detected_at: '2026-03-17T10:00:00.000Z',
      }],
    } as any);

    const patterns = await getStoredPatterns('personal', 'user-1');
    expect(patterns[0].data).toEqual({});
  });

  it('should query with correct SQL for active patterns', async () => {
    mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

    await getStoredPatterns('learning', 'user-42');

    expect(mockQueryContext).toHaveBeenCalledWith(
      'learning',
      expect.stringContaining("status = 'active'"),
      ['user-42'],
    );
  });

  it('should return multiple patterns with correct mapping', async () => {
    mockQueryContext.mockResolvedValueOnce({
      rows: [
        { id: 'p-1', pattern_type: 'routine', description: 'routine desc', confidence: 0.8, data: {}, detected_at: '2026-03-17T08:00:00Z' },
        { id: 'p-2', pattern_type: 'productivity', description: 'prod desc', confidence: 0.6, data: { count: 5 }, detected_at: '2026-03-17T09:00:00Z' },
        { id: 'p-3', pattern_type: 'break', description: 'break desc', confidence: 0.4, data: { hour: 15 }, detected_at: '2026-03-17T10:00:00Z' },
      ],
    } as any);

    const patterns = await getStoredPatterns('personal', 'user-1');

    expect(patterns).toHaveLength(3);
    expect(patterns[0].pattern_type).toBe('routine');
    expect(patterns[1].pattern_type).toBe('productivity');
    expect(patterns[2].pattern_type).toBe('break');
  });

  it('should propagate database errors', async () => {
    mockQueryContext.mockRejectedValueOnce(new Error('Connection refused'));

    await expect(getStoredPatterns('personal', 'user-1')).rejects.toThrow('Connection refused');
  });

  it('should work with all valid contexts', async () => {
    for (const ctx of ['personal', 'work', 'learning', 'creative'] as const) {
      mockQueryContext.mockReset();
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      await getStoredPatterns(ctx, 'user-1');
      expect(mockQueryContext).toHaveBeenCalledWith(ctx, expect.any(String), expect.any(Array));
    }
  });
});
