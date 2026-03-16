/**
 * Phase 88: Interruptibility + Habit Engine + Focus Mode Tests
 */

import {
  calculateInterruptibility,
  shouldInterrupt,
} from '../../../services/interruptibility';
import type { InterruptibilitySignals } from '../../../services/interruptibility';

// Mock database-context for habit-engine and focus-mode tests
jest.mock('../../../utils/database-context', () => ({
  queryContext: jest.fn(),
  isValidContext: jest.fn((ctx: string) => ['personal', 'work', 'learning', 'creative'].includes(ctx)),
}));

jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

const mockQueryContext = jest.requireMock('../../../utils/database-context').queryContext;

// ─── Helper ───────────────────────────────────────────

function makeSignals(overrides: Partial<InterruptibilitySignals> = {}): InterruptibilitySignals {
  return {
    typingRate: 0,
    currentPage: 'dashboard',
    timeOfDay: 15,
    recentDismissals: 0,
    focusModeActive: false,
    sessionDuration: 5,
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════
// Interruptibility Score Calculation
// ═══════════════════════════════════════════════════════

describe('calculateInterruptibility', () => {
  test('base score is 0.8 with no signals', () => {
    const result = calculateInterruptibility(makeSignals());
    expect(result.score).toBe(0.8);
    expect(result.level).toBe('available');
  });

  test('focus mode always returns DND', () => {
    const result = calculateInterruptibility(makeSignals({ focusModeActive: true }));
    expect(result.score).toBe(0.0);
    expect(result.level).toBe('dnd');
    expect(result.allowedPriorities).toEqual(['critical']);
    expect(result.reason).toBe('Focus mode is active');
  });

  test('focus mode overrides all other signals', () => {
    const result = calculateInterruptibility(makeSignals({
      focusModeActive: true,
      typingRate: 0,      // idle
      timeOfDay: 12,      // lunch
      sessionDuration: 0, // just arrived
    }));
    expect(result.score).toBe(0.0);
    expect(result.level).toBe('dnd');
  });

  test('high typing rate reduces score by 0.4', () => {
    const result = calculateInterruptibility(makeSignals({ typingRate: 80 }));
    expect(result.score).toBeCloseTo(0.4, 1);
    expect(result.level).toBe('normal');
  });

  test('moderate typing rate (30-60) reduces score by 0.2', () => {
    const result = calculateInterruptibility(makeSignals({ typingRate: 45 }));
    expect(result.score).toBeCloseTo(0.6, 1);
  });

  test('long session (>30 min) reduces score by 0.2', () => {
    const result = calculateInterruptibility(makeSignals({ sessionDuration: 45 }));
    expect(result.score).toBeCloseTo(0.6, 1);
  });

  test('recent dismissals > 3 reduces score by 0.3', () => {
    const result = calculateInterruptibility(makeSignals({ recentDismissals: 5 }));
    expect(result.score).toBeCloseTo(0.5, 1);
  });

  test('1-3 dismissals reduces score by 0.15', () => {
    const result = calculateInterruptibility(makeSignals({ recentDismissals: 2 }));
    expect(result.score).toBeCloseTo(0.65, 1);
  });

  test('productive morning (9-12) reduces score by 0.1', () => {
    const result = calculateInterruptibility(makeSignals({ timeOfDay: 10 }));
    expect(result.score).toBeCloseTo(0.7, 1);
  });

  test('lunch break (12-13) increases score by 0.1', () => {
    const result = calculateInterruptibility(makeSignals({ timeOfDay: 12 }));
    expect(result.score).toBeCloseTo(0.9, 1);
  });

  test('late night reduces score by 0.15', () => {
    const result = calculateInterruptibility(makeSignals({ timeOfDay: 23 }));
    expect(result.score).toBeCloseTo(0.65, 1);
  });

  test('early morning reduces score by 0.15', () => {
    const result = calculateInterruptibility(makeSignals({ timeOfDay: 3 }));
    expect(result.score).toBeCloseTo(0.65, 1);
  });

  test('score clamps to 0 (never negative)', () => {
    const result = calculateInterruptibility(makeSignals({
      typingRate: 100,       // -0.4
      sessionDuration: 60,   // -0.2
      recentDismissals: 5,   // -0.3
      timeOfDay: 10,         // -0.1
    }));
    expect(result.score).toBe(0);
    expect(result.level).toBe('dnd');
  });

  test('score clamps to 1 (never above)', () => {
    const result = calculateInterruptibility(makeSignals({
      typingRate: 0,
      sessionDuration: 0,
      recentDismissals: 0,
      timeOfDay: 12, // +0.1
    }));
    expect(result.score).toBeCloseTo(0.9, 1);
    expect(result.score).toBeLessThanOrEqual(1);
  });

  test('combined signals reduce correctly', () => {
    const result = calculateInterruptibility(makeSignals({
      typingRate: 80,       // -0.4
      sessionDuration: 45,  // -0.2
    }));
    // 0.8 - 0.4 - 0.2 = 0.2
    expect(result.score).toBeCloseTo(0.2, 1);
    expect(result.level).toBe('low');
  });

  test('level boundaries: dnd <= 0.1', () => {
    const result = calculateInterruptibility(makeSignals({
      typingRate: 100,
      sessionDuration: 60,
    }));
    expect(result.score).toBeCloseTo(0.2, 1);
    // Still 'low' at 0.2, not dnd
    expect(result.level).toBe('low');
  });

  test('level boundaries: low = 0.11-0.35', () => {
    const result = calculateInterruptibility(makeSignals({
      typingRate: 80,
      sessionDuration: 45,
    }));
    expect(result.level).toBe('low');
  });

  test('level boundaries: normal = 0.36-0.65', () => {
    const result = calculateInterruptibility(makeSignals({
      typingRate: 80,
    }));
    expect(result.level).toBe('normal');
  });

  test('allowed priorities expand with higher score', () => {
    const available = calculateInterruptibility(makeSignals());
    const low = calculateInterruptibility(makeSignals({
      typingRate: 80,
      sessionDuration: 45,
    }));

    expect(available.allowedPriorities).toContain('low');
    expect(available.allowedPriorities).toContain('medium');
    expect(available.allowedPriorities).toContain('high');
    expect(available.allowedPriorities).toContain('critical');

    expect(low.allowedPriorities).toContain('critical');
    expect(low.allowedPriorities).toContain('high');
    expect(low.allowedPriorities).not.toContain('low');
  });

  test('reason lists all active signals', () => {
    const result = calculateInterruptibility(makeSignals({
      typingRate: 80,
      sessionDuration: 45,
    }));
    expect(result.reason).toContain('typing rate');
    expect(result.reason).toContain('session');
  });

  test('reason for no signals', () => {
    const result = calculateInterruptibility(makeSignals());
    expect(result.reason).toBe('No activity signals detected');
  });
});

// ═══════════════════════════════════════════════════════
// shouldInterrupt
// ═══════════════════════════════════════════════════════

describe('shouldInterrupt', () => {
  test('critical priority always interrupts (even at DND via focus off edge case)', () => {
    const result = shouldInterrupt(makeSignals({
      typingRate: 100,
      sessionDuration: 60,
      recentDismissals: 5,
      timeOfDay: 10,
    }), 'critical');
    expect(result).toBe(true);
  });

  test('low priority does not interrupt when score is low', () => {
    const result = shouldInterrupt(makeSignals({
      typingRate: 80,
      sessionDuration: 45,
    }), 'low');
    expect(result).toBe(false);
  });

  test('high priority interrupts at moderate score', () => {
    const result = shouldInterrupt(makeSignals({
      typingRate: 45,
    }), 'high');
    // score ~ 0.6, threshold = 0.2
    expect(result).toBe(true);
  });

  test('unknown priority uses 0.5 threshold', () => {
    const result = shouldInterrupt(makeSignals(), 'unknown_priority');
    // score = 0.8, threshold = 0.5 → true
    expect(result).toBe(true);
  });

  test('focus mode blocks all except critical', () => {
    expect(shouldInterrupt(makeSignals({ focusModeActive: true }), 'high')).toBe(false);
    expect(shouldInterrupt(makeSignals({ focusModeActive: true }), 'medium')).toBe(false);
    expect(shouldInterrupt(makeSignals({ focusModeActive: true }), 'low')).toBe(false);
    expect(shouldInterrupt(makeSignals({ focusModeActive: true }), 'critical')).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════
// Habit Engine
// ═══════════════════════════════════════════════════════

describe('Habit Engine', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryContext.mockReset();
  });

  test('recordActivity inserts into habit_activities', async () => {
    const { recordActivity } = await import('../../../services/habit-engine');
    mockQueryContext.mockResolvedValueOnce({ rows: [] });

    const result = await recordActivity('personal' as const, 'user-1', 'page_visit', { page: '/dashboard' });
    expect(result.id).toBeDefined();
    expect(mockQueryContext).toHaveBeenCalledWith(
      'personal',
      expect.stringContaining('INSERT INTO habit_activities'),
      expect.any(Array),
    );
  });

  test('generateSuggestions returns default when no patterns', async () => {
    const { generateSuggestions } = await import('../../../services/habit-engine');
    const suggestions = generateSuggestions('personal' as const, 'user-1', []);
    expect(suggestions.length).toBe(1);
    expect(suggestions[0].type).toBe('optimize');
    expect(suggestions[0].title).toContain('Start building');
  });

  test('generateSuggestions creates routine suggestion from pattern', async () => {
    const { generateSuggestions } = await import('../../../services/habit-engine');
    const suggestions = generateSuggestions('personal' as const, 'user-1', [{
      id: 'p1',
      pattern_type: 'routine' as const,
      description: 'You frequently visit "/chat" around 9:00',
      detected_at: new Date().toISOString(),
      confidence: 0.7,
      data: { page: '/chat', hour: 9, count: 7 },
    }]);
    expect(suggestions.length).toBeGreaterThanOrEqual(1);
    expect(suggestions[0].type).toBe('routine');
    expect(suggestions[0].priority).toBe('high');
  });

  test('generateSuggestions creates break suggestion', async () => {
    const { generateSuggestions } = await import('../../../services/habit-engine');
    const suggestions = generateSuggestions('personal' as const, 'user-1', [{
      id: 'p1',
      pattern_type: 'break' as const,
      description: 'You usually take breaks around 15:00',
      detected_at: new Date().toISOString(),
      confidence: 0.5,
      data: { hour: 15, count: 5 },
    }]);
    expect(suggestions.some(s => s.type === 'break')).toBe(true);
  });

  test('getHabitStats returns default on error', async () => {
    const { getHabitStats } = await import('../../../services/habit-engine');
    mockQueryContext.mockRejectedValue(new Error('DB error'));

    const stats = await getHabitStats('personal' as const, 'user-1');
    expect(stats.deepWorkMinutes).toBe(0);
    expect(stats.taskCompletionRate).toBe(0);
    expect(stats.currentStreak).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════
// Focus Mode
// ═══════════════════════════════════════════════════════

describe('Focus Mode', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryContext.mockReset();
  });

  test('startFocusMode cancels existing and creates new session', async () => {
    const { startFocusMode } = await import('../../../services/focus-mode');

    // First call: cancel existing
    mockQueryContext.mockResolvedValueOnce({ rows: [] });
    // Second call: insert new
    mockQueryContext.mockResolvedValueOnce({
      rows: [{
        id: 'session-1',
        user_id: 'user-1',
        started_at: new Date().toISOString(),
        ends_at: new Date(Date.now() + 25 * 60000).toISOString(),
        duration_minutes: 25,
        active_task_id: null,
        status: 'active',
        created_at: new Date().toISOString(),
      }],
    });

    const session = await startFocusMode('personal' as const, 'user-1', 25);
    expect(session.status).toBe('active');
    expect(session.duration_minutes).toBe(25);
    expect(mockQueryContext).toHaveBeenCalledTimes(2);
  });

  test('endFocusMode returns null when no active session', async () => {
    const { endFocusMode } = await import('../../../services/focus-mode');
    mockQueryContext.mockResolvedValueOnce({ rows: [] });

    const result = await endFocusMode('personal' as const, 'user-1');
    expect(result).toBeNull();
  });

  test('endFocusMode returns completed session', async () => {
    const { endFocusMode } = await import('../../../services/focus-mode');
    mockQueryContext.mockResolvedValueOnce({
      rows: [{
        id: 'session-1',
        user_id: 'user-1',
        started_at: new Date().toISOString(),
        ends_at: new Date().toISOString(),
        duration_minutes: 25,
        active_task_id: null,
        status: 'completed',
        created_at: new Date().toISOString(),
      }],
    });

    const result = await endFocusMode('personal' as const, 'user-1');
    expect(result).not.toBeNull();
    expect(result!.status).toBe('completed');
  });

  test('getFocusStatus auto-completes expired sessions', async () => {
    const { getFocusStatus } = await import('../../../services/focus-mode');
    // First: auto-complete expired
    mockQueryContext.mockResolvedValueOnce({ rows: [] });
    // Second: query active
    mockQueryContext.mockResolvedValueOnce({ rows: [] });

    const status = await getFocusStatus('personal' as const, 'user-1');
    expect(status.active).toBe(false);
    expect(status.session).toBeNull();
    expect(status.remainingMinutes).toBe(0);
    expect(mockQueryContext).toHaveBeenCalledTimes(2);
  });

  test('getFocusStatus returns active session with remaining time', async () => {
    const { getFocusStatus } = await import('../../../services/focus-mode');
    const futureTime = new Date(Date.now() + 15 * 60000).toISOString();

    // Auto-complete expired
    mockQueryContext.mockResolvedValueOnce({ rows: [] });
    // Active session
    mockQueryContext.mockResolvedValueOnce({
      rows: [{
        id: 'session-1',
        user_id: 'user-1',
        started_at: new Date().toISOString(),
        ends_at: futureTime,
        duration_minutes: 25,
        active_task_id: null,
        status: 'active',
        created_at: new Date().toISOString(),
      }],
    });

    const status = await getFocusStatus('personal' as const, 'user-1');
    expect(status.active).toBe(true);
    expect(status.session).not.toBeNull();
    expect(status.remainingMinutes).toBeGreaterThan(0);
    expect(status.remainingMinutes).toBeLessThanOrEqual(15);
  });

  test('getFocusHistory returns sessions from DB', async () => {
    const { getFocusHistory } = await import('../../../services/focus-mode');
    mockQueryContext.mockResolvedValueOnce({
      rows: [
        {
          id: 's1',
          user_id: 'user-1',
          started_at: new Date().toISOString(),
          ends_at: new Date().toISOString(),
          duration_minutes: 25,
          active_task_id: null,
          status: 'completed',
          created_at: new Date().toISOString(),
        },
        {
          id: 's2',
          user_id: 'user-1',
          started_at: new Date().toISOString(),
          ends_at: null,
          duration_minutes: 45,
          active_task_id: 'task-1',
          status: 'cancelled',
          created_at: new Date().toISOString(),
        },
      ],
    });

    const sessions = await getFocusHistory('personal' as const, 'user-1', 7);
    expect(sessions).toHaveLength(2);
    expect(sessions[0].id).toBe('s1');
    expect(sessions[1].active_task_id).toBe('task-1');
  });
});

// ═══════════════════════════════════════════════════════
// Route integration tests (via express)
// ═══════════════════════════════════════════════════════

import express from 'express';
import request from 'supertest';
import { proactiveIntelligenceRouter } from '../../../routes/proactive-intelligence';
import { errorHandler } from '../../../middleware/errorHandler';

jest.mock('../../../middleware/auth', () => ({
  apiKeyAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireScope: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

jest.mock('../../../utils/user-context', () => ({
  getUserId: () => 'test-user-id',
}));

describe('Proactive Intelligence Routes', () => {
  let app: express.Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api', proactiveIntelligenceRouter);
    app.use(errorHandler);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryContext.mockReset();
  });

  test('GET /api/:context/interruptibility returns score', async () => {
    const res = await request(app)
      .get('/api/personal/interruptibility?typingRate=0&sessionDuration=5')
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.score).toBeDefined();
    expect(res.body.data.level).toBeDefined();
  });

  test('GET /api/:context/interruptibility with focus mode', async () => {
    const res = await request(app)
      .get('/api/personal/interruptibility?focusModeActive=true')
      .expect(200);

    expect(res.body.data.level).toBe('dnd');
    expect(res.body.data.score).toBe(0);
  });

  test('POST /api/:context/habits/activity records activity', async () => {
    mockQueryContext.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post('/api/personal/habits/activity')
      .send({ activityType: 'page_visit', metadata: { page: '/chat' } })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBeDefined();
  });

  test('POST /api/:context/habits/activity rejects missing activityType', async () => {
    const res = await request(app)
      .post('/api/personal/habits/activity')
      .send({})
      .expect(400);

    expect(res.body.success).toBe(false);
  });

  test('GET /api/:context/habits/stats returns stats', async () => {
    mockQueryContext
      .mockResolvedValueOnce({ rows: [{ cnt: 42 }] })
      .mockResolvedValueOnce({ rows: [{ completed: 10, total: 15 }] })
      .mockResolvedValueOnce({ rows: [{ total_minutes: 120 }] })
      .mockResolvedValueOnce({ rows: [{ streak: 5 }] })
      .mockResolvedValueOnce({ rows: [{ page: '/chat', cnt: 20 }] });

    const res = await request(app)
      .get('/api/personal/habits/stats')
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.activitiesThisWeek).toBe(42);
  });

  test('POST /api/:context/focus/start creates session', async () => {
    // Cancel existing
    mockQueryContext.mockResolvedValueOnce({ rows: [] });
    // Insert new
    mockQueryContext.mockResolvedValueOnce({
      rows: [{
        id: 'focus-1',
        user_id: 'test-user-id',
        started_at: new Date().toISOString(),
        ends_at: new Date(Date.now() + 25 * 60000).toISOString(),
        duration_minutes: 25,
        active_task_id: null,
        status: 'active',
        created_at: new Date().toISOString(),
      }],
    });

    const res = await request(app)
      .post('/api/personal/focus/start')
      .send({ durationMinutes: 25 })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('active');
  });

  test('POST /api/:context/focus/start rejects invalid duration', async () => {
    await request(app)
      .post('/api/personal/focus/start')
      .send({ durationMinutes: 0 })
      .expect(400);

    await request(app)
      .post('/api/personal/focus/start')
      .send({ durationMinutes: 999 })
      .expect(400);
  });

  test('POST /api/:context/focus/end ends session', async () => {
    mockQueryContext.mockResolvedValueOnce({
      rows: [{
        id: 'focus-1',
        user_id: 'test-user-id',
        started_at: new Date().toISOString(),
        ends_at: new Date().toISOString(),
        duration_minutes: 25,
        active_task_id: null,
        status: 'completed',
        created_at: new Date().toISOString(),
      }],
    });

    const res = await request(app)
      .post('/api/personal/focus/end')
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('completed');
  });

  test('GET /api/:context/focus/status returns status', async () => {
    // Auto-complete expired
    mockQueryContext.mockResolvedValueOnce({ rows: [] });
    // No active
    mockQueryContext.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get('/api/personal/focus/status')
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.active).toBe(false);
  });

  test('GET /api/:context/focus/history returns sessions', async () => {
    mockQueryContext.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get('/api/personal/focus/history?days=14')
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  test('rejects invalid context', async () => {
    const res = await request(app)
      .get('/api/invalid_ctx/interruptibility')
      .expect(400);

    expect(res.body.success).toBe(false);
  });
});
