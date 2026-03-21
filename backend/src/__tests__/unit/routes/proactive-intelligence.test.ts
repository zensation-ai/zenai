/**
 * Proactive Intelligence Route Tests
 *
 * Tests interruptibility scoring, habit engine, and focus mode endpoints.
 */

import express from 'express';
import request from 'supertest';

jest.mock('../../../middleware/auth', () => ({
  apiKeyAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireScope: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

jest.mock('../../../utils/user-context', () => ({
  getUserId: jest.fn(() => '00000000-0000-0000-0000-000000000001'),
  SYSTEM_USER_ID: '00000000-0000-0000-0000-000000000001',
}));

jest.mock('../../../utils/logger', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('../../../utils/database-context', () => ({
  queryContext: jest.fn(),
  isValidContext: jest.fn((ctx: string) => ['personal', 'work', 'learning', 'creative'].includes(ctx)),
  AIContext: {},
}));

// We need this mock for the types import
jest.mock('../../../types', () => ({}));

const mockCalculateInterruptibility = jest.fn();

jest.mock('../../../services/interruptibility', () => ({
  calculateInterruptibility: (...args: unknown[]) => mockCalculateInterruptibility(...args),
}));

const mockRecordActivity = jest.fn();
const mockDetectPatterns = jest.fn();
const mockGenerateSuggestions = jest.fn();
const mockGetHabitStats = jest.fn();
const mockGetStoredPatterns = jest.fn();

jest.mock('../../../services/habit-engine', () => ({
  recordActivity: (...args: unknown[]) => mockRecordActivity(...args),
  detectPatterns: (...args: unknown[]) => mockDetectPatterns(...args),
  generateSuggestions: (...args: unknown[]) => mockGenerateSuggestions(...args),
  getHabitStats: (...args: unknown[]) => mockGetHabitStats(...args),
  getStoredPatterns: (...args: unknown[]) => mockGetStoredPatterns(...args),
}));

const mockStartFocusMode = jest.fn();
const mockEndFocusMode = jest.fn();
const mockGetFocusStatus = jest.fn();
const mockGetFocusHistory = jest.fn();

jest.mock('../../../services/focus-mode', () => ({
  startFocusMode: (...args: unknown[]) => mockStartFocusMode(...args),
  endFocusMode: (...args: unknown[]) => mockEndFocusMode(...args),
  getFocusStatus: (...args: unknown[]) => mockGetFocusStatus(...args),
  getFocusHistory: (...args: unknown[]) => mockGetFocusHistory(...args),
}));

import { proactiveIntelligenceRouter } from '../../../routes/proactive-intelligence';
import { errorHandler } from '../../../middleware/errorHandler';

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
  });

  describe('GET /api/:context/interruptibility', () => {
    it('should return interruptibility score', async () => {
      const result = { score: 0.7, level: 'medium', reason: 'Moderate activity' };
      mockCalculateInterruptibility.mockReturnValue(result);

      const res = await request(app)
        .get('/api/personal/interruptibility?typingRate=5&currentPage=ideas');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.score).toBe(0.7);
    });

    it('should reject invalid context', async () => {
      const res = await request(app).get('/api/invalid/interruptibility');
      expect(res.status).toBe(400);
    });

    it('should handle calculation error gracefully', async () => {
      mockCalculateInterruptibility.mockImplementation(() => { throw new Error('Calc failed'); });

      const res = await request(app).get('/api/personal/interruptibility');

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/:context/habits/activity', () => {
    it('should record a habit activity', async () => {
      mockRecordActivity.mockResolvedValue({ recorded: true });

      const res = await request(app)
        .post('/api/personal/habits/activity')
        .send({ activityType: 'idea_created', metadata: { source: 'chat' } });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should reject missing activityType', async () => {
      const res = await request(app)
        .post('/api/personal/habits/activity')
        .send({});

      expect(res.status).toBe(400);
    });

    it('should reject invalid context', async () => {
      const res = await request(app)
        .post('/api/bad/habits/activity')
        .send({ activityType: 'test' });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/:context/habits/patterns', () => {
    it('should return stored patterns', async () => {
      const patterns = [{ type: 'morning_routine', confidence: 0.85 }];
      mockGetStoredPatterns.mockResolvedValue(patterns);

      const res = await request(app).get('/api/work/habits/patterns');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
    });

    it('should refresh patterns when requested', async () => {
      mockDetectPatterns.mockResolvedValue([]);

      const res = await request(app).get('/api/work/habits/patterns?refresh=true');

      expect(res.status).toBe(200);
      expect(mockDetectPatterns).toHaveBeenCalled();
    });
  });

  describe('GET /api/:context/habits/suggestions', () => {
    it('should return habit suggestions', async () => {
      mockGetStoredPatterns.mockResolvedValue([{ type: 'morning' }]);
      mockGenerateSuggestions.mockReturnValue([{ text: 'Try morning journaling' }]);

      const res = await request(app).get('/api/personal/habits/suggestions');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('GET /api/:context/habits/stats', () => {
    it('should return habit statistics', async () => {
      const stats = { totalActivities: 150, streakDays: 7 };
      mockGetHabitStats.mockResolvedValue(stats);

      const res = await request(app).get('/api/personal/habits/stats');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(stats);
    });
  });

  describe('POST /api/:context/focus/start', () => {
    it('should start focus mode', async () => {
      const session = { id: 'f1', startedAt: '2026-03-21T10:00:00Z', durationMinutes: 25 };
      mockStartFocusMode.mockResolvedValue(session);

      const res = await request(app)
        .post('/api/personal/focus/start')
        .send({ durationMinutes: 25 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.durationMinutes).toBe(25);
    });

    it('should reject missing duration', async () => {
      const res = await request(app)
        .post('/api/personal/focus/start')
        .send({});

      expect(res.status).toBe(400);
    });

    it('should reject duration exceeding 480 minutes', async () => {
      const res = await request(app)
        .post('/api/personal/focus/start')
        .send({ durationMinutes: 500 });

      expect(res.status).toBe(400);
    });

    it('should reject non-positive duration', async () => {
      const res = await request(app)
        .post('/api/personal/focus/start')
        .send({ durationMinutes: 0 });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/:context/focus/end', () => {
    it('should end active focus session', async () => {
      const session = { id: 'f1', endedAt: '2026-03-21T10:25:00Z' };
      mockEndFocusMode.mockResolvedValue(session);

      const res = await request(app).post('/api/personal/focus/end');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should handle no active session', async () => {
      mockEndFocusMode.mockResolvedValue(null);

      const res = await request(app).post('/api/personal/focus/end');

      expect(res.status).toBe(200);
      expect(res.body.data).toBeNull();
      expect(res.body.message).toBe('No active focus session');
    });
  });
});
