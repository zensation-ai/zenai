/**
 * Phase 88: Focus Mode Service — Dedicated Unit Tests
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
  v4: jest.fn(() => 'mock-uuid-1234'),
}));

const mockQueryContext = queryContext as jest.MockedFunction<typeof queryContext>;

import {
  startFocusMode,
  endFocusMode,
  getFocusStatus,
  getFocusHistory,
} from '../../../services/focus-mode';

// ─── Helper ───────────────────────────────────────────

function makeFocusRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'session-1',
    user_id: 'user-1',
    started_at: '2026-03-17T10:00:00.000Z',
    ends_at: '2026-03-17T10:25:00.000Z',
    duration_minutes: 25,
    active_task_id: null,
    status: 'active',
    created_at: '2026-03-17T10:00:00.000Z',
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════
// startFocusMode
// ═══════════════════════════════════════════════════════

describe('startFocusMode', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryContext.mockReset();
  });

  it('should cancel existing sessions and create new one', async () => {
    mockQueryContext.mockResolvedValueOnce({ rows: [] } as any); // cancel
    mockQueryContext.mockResolvedValueOnce({
      rows: [makeFocusRow()],
    } as any); // insert

    const session = await startFocusMode('personal', 'user-1', 25);

    expect(session.id).toBe('session-1');
    expect(session.status).toBe('active');
    expect(session.duration_minutes).toBe(25);
    expect(mockQueryContext).toHaveBeenCalledTimes(2);
    expect(mockQueryContext).toHaveBeenNthCalledWith(
      1,
      'personal',
      expect.stringContaining('UPDATE focus_sessions'),
      ['user-1'],
    );
    expect(mockQueryContext).toHaveBeenNthCalledWith(
      2,
      'personal',
      expect.stringContaining('INSERT INTO focus_sessions'),
      expect.arrayContaining(['mock-uuid-1234', 'user-1']),
    );
  });

  it('should pass task ID when provided', async () => {
    mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);
    mockQueryContext.mockResolvedValueOnce({
      rows: [makeFocusRow({ active_task_id: 'task-99' })],
    } as any);

    const session = await startFocusMode('personal', 'user-1', 30, 'task-99');

    expect(session.active_task_id).toBe('task-99');
    expect(mockQueryContext).toHaveBeenNthCalledWith(
      2,
      'personal',
      expect.stringContaining('INSERT INTO focus_sessions'),
      expect.arrayContaining(['task-99']),
    );
  });

  it('should pass null task ID when not provided', async () => {
    mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);
    mockQueryContext.mockResolvedValueOnce({
      rows: [makeFocusRow()],
    } as any);

    await startFocusMode('personal', 'user-1', 25);

    const insertArgs = mockQueryContext.mock.calls[1][2] as unknown[];
    expect(insertArgs[insertArgs.length - 1]).toBeNull();
  });

  it('should work with all valid contexts', async () => {
    for (const ctx of ['personal', 'work', 'learning', 'creative'] as const) {
      mockQueryContext.mockReset();
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);
      mockQueryContext.mockResolvedValueOnce({ rows: [makeFocusRow()] } as any);

      const session = await startFocusMode(ctx, 'user-1', 25);
      expect(session.status).toBe('active');
      expect(mockQueryContext).toHaveBeenNthCalledWith(1, ctx, expect.any(String), expect.any(Array));
    }
  });

  it('should propagate database errors', async () => {
    mockQueryContext.mockRejectedValueOnce(new Error('DB connection failed'));

    await expect(startFocusMode('personal', 'user-1', 25)).rejects.toThrow('DB connection failed');
  });

  it('should map row fields correctly including null ends_at', async () => {
    mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);
    mockQueryContext.mockResolvedValueOnce({
      rows: [makeFocusRow({ ends_at: null })],
    } as any);

    const session = await startFocusMode('personal', 'user-1', 25);
    expect(session.ends_at).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════
// endFocusMode
// ═══════════════════════════════════════════════════════

describe('endFocusMode', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryContext.mockReset();
  });

  it('should return null when no active session exists', async () => {
    mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

    const result = await endFocusMode('personal', 'user-1');
    expect(result).toBeNull();
  });

  it('should return completed session when active session found', async () => {
    mockQueryContext.mockResolvedValueOnce({
      rows: [makeFocusRow({ status: 'completed' })],
    } as any);

    const result = await endFocusMode('personal', 'user-1');
    expect(result).not.toBeNull();
    expect(result!.status).toBe('completed');
    expect(result!.id).toBe('session-1');
  });

  it('should call UPDATE with correct user ID', async () => {
    mockQueryContext.mockResolvedValueOnce({
      rows: [makeFocusRow({ status: 'completed' })],
    } as any);

    await endFocusMode('work', 'user-42');

    expect(mockQueryContext).toHaveBeenCalledWith(
      'work',
      expect.stringContaining("SET status = 'completed'"),
      ['user-42'],
    );
  });

  it('should propagate database errors', async () => {
    mockQueryContext.mockRejectedValueOnce(new Error('Connection lost'));

    await expect(endFocusMode('personal', 'user-1')).rejects.toThrow('Connection lost');
  });
});

// ═══════════════════════════════════════════════════════
// getFocusStatus
// ═══════════════════════════════════════════════════════

describe('getFocusStatus', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryContext.mockReset();
  });

  it('should return inactive status when no active session', async () => {
    mockQueryContext.mockResolvedValueOnce({ rows: [] } as any); // auto-complete
    mockQueryContext.mockResolvedValueOnce({ rows: [] } as any); // select active

    const status = await getFocusStatus('personal', 'user-1');

    expect(status.active).toBe(false);
    expect(status.session).toBeNull();
    expect(status.remainingMinutes).toBe(0);
  });

  it('should auto-complete expired sessions first', async () => {
    mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);
    mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

    await getFocusStatus('personal', 'user-1');

    expect(mockQueryContext).toHaveBeenCalledTimes(2);
    expect(mockQueryContext).toHaveBeenNthCalledWith(
      1,
      'personal',
      expect.stringContaining('SET status'),
      ['user-1'],
    );
  });

  it('should return active session with remaining time', async () => {
    const futureTime = new Date(Date.now() + 15 * 60000).toISOString();

    mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);
    mockQueryContext.mockResolvedValueOnce({
      rows: [makeFocusRow({ ends_at: futureTime })],
    } as any);

    const status = await getFocusStatus('personal', 'user-1');

    expect(status.active).toBe(true);
    expect(status.session).not.toBeNull();
    expect(status.remainingMinutes).toBeGreaterThan(0);
    expect(status.remainingMinutes).toBeLessThanOrEqual(15);
  });

  it('should return 0 remaining minutes when ends_at is null', async () => {
    mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);
    mockQueryContext.mockResolvedValueOnce({
      rows: [makeFocusRow({ ends_at: null })],
    } as any);

    const status = await getFocusStatus('personal', 'user-1');

    expect(status.active).toBe(true);
    expect(status.remainingMinutes).toBe(0);
  });

  it('should return 0 remaining minutes when session already expired', async () => {
    const pastTime = new Date(Date.now() - 5 * 60000).toISOString();

    mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);
    mockQueryContext.mockResolvedValueOnce({
      rows: [makeFocusRow({ ends_at: pastTime })],
    } as any);

    const status = await getFocusStatus('personal', 'user-1');

    expect(status.remainingMinutes).toBe(0);
  });

  it('should propagate database errors', async () => {
    mockQueryContext.mockRejectedValueOnce(new Error('DB error'));

    await expect(getFocusStatus('personal', 'user-1')).rejects.toThrow('DB error');
  });
});

// ═══════════════════════════════════════════════════════
// getFocusHistory
// ═══════════════════════════════════════════════════════

describe('getFocusHistory', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryContext.mockReset();
  });

  it('should return empty array when no history', async () => {
    mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

    const result = await getFocusHistory('personal', 'user-1');
    expect(result).toEqual([]);
  });

  it('should return mapped sessions', async () => {
    mockQueryContext.mockResolvedValueOnce({
      rows: [
        makeFocusRow({ id: 's1', status: 'completed' }),
        makeFocusRow({ id: 's2', status: 'cancelled', ends_at: null, active_task_id: 'task-1' }),
      ],
    } as any);

    const sessions = await getFocusHistory('personal', 'user-1', 7);

    expect(sessions).toHaveLength(2);
    expect(sessions[0].id).toBe('s1');
    expect(sessions[0].status).toBe('completed');
    expect(sessions[1].id).toBe('s2');
    expect(sessions[1].ends_at).toBeNull();
    expect(sessions[1].active_task_id).toBe('task-1');
  });

  it('should use default days value of 7', async () => {
    mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

    await getFocusHistory('personal', 'user-1');

    expect(mockQueryContext).toHaveBeenCalledWith(
      'personal',
      expect.any(String),
      ['user-1', '7'],
    );
  });

  it('should pass custom days parameter', async () => {
    mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

    await getFocusHistory('personal', 'user-1', 30);

    expect(mockQueryContext).toHaveBeenCalledWith(
      'personal',
      expect.any(String),
      ['user-1', '30'],
    );
  });

  it('should work with all valid contexts', async () => {
    for (const ctx of ['personal', 'work', 'learning', 'creative'] as const) {
      mockQueryContext.mockReset();
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      await getFocusHistory(ctx, 'user-1');
      expect(mockQueryContext).toHaveBeenCalledWith(ctx, expect.any(String), expect.any(Array));
    }
  });

  it('should propagate database errors', async () => {
    mockQueryContext.mockRejectedValueOnce(new Error('Query timeout'));

    await expect(getFocusHistory('personal', 'user-1')).rejects.toThrow('Query timeout');
  });
});
