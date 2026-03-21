/**
 * Evolution Analytics Route Tests
 *
 * Tests the evolution dashboard endpoints including snapshots,
 * timeline, events, milestones, and accuracy trends.
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

jest.mock('../../../utils/validation', () => ({
  toIntBounded: jest.fn((val: string | undefined, def: number) => {
    const parsed = parseInt(val ?? '', 10);
    return isNaN(parsed) ? def : parsed;
  }),
}));

const mockGetEvolutionDashboard = jest.fn();
const mockCreateDailySnapshot = jest.fn();
const mockGetSnapshots = jest.fn();
const mockGetLatestSnapshot = jest.fn();
const mockGetLearningTimeline = jest.fn();
const mockGetEventsByType = jest.fn();
const mockRecordLearningEvent = jest.fn();
const mockGetAccuracyTrends = jest.fn();
const mockGetMilestones = jest.fn();
const mockUpdateMilestoneProgress = jest.fn();

jest.mock('../../../services/evolution-analytics', () => ({
  getEvolutionDashboard: (...args: unknown[]) => mockGetEvolutionDashboard(...args),
  createDailySnapshot: (...args: unknown[]) => mockCreateDailySnapshot(...args),
  getSnapshots: (...args: unknown[]) => mockGetSnapshots(...args),
  getLatestSnapshot: (...args: unknown[]) => mockGetLatestSnapshot(...args),
  getLearningTimeline: (...args: unknown[]) => mockGetLearningTimeline(...args),
  getEventsByType: (...args: unknown[]) => mockGetEventsByType(...args),
  recordLearningEvent: (...args: unknown[]) => mockRecordLearningEvent(...args),
  getAccuracyTrends: (...args: unknown[]) => mockGetAccuracyTrends(...args),
  getMilestones: (...args: unknown[]) => mockGetMilestones(...args),
  updateMilestoneProgress: (...args: unknown[]) => mockUpdateMilestoneProgress(...args),
  LearningEventType: {},
}));

import { evolutionRouter } from '../../../routes/analytics-evolution';
import { errorHandler } from '../../../middleware/errorHandler';

describe('Evolution Analytics Routes', () => {
  let app: express.Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api', evolutionRouter);
    app.use(errorHandler);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/:context/evolution', () => {
    it('should return full evolution dashboard', async () => {
      const dashboard = { score: 85, facts: 120 };
      mockGetEvolutionDashboard.mockResolvedValue(dashboard);

      const res = await request(app).get('/api/personal/evolution');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.dashboard).toEqual(dashboard);
    });

    it('should reject invalid context', async () => {
      const res = await request(app).get('/api/invalid/evolution');

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/:context/evolution/summary', () => {
    it('should return summary with latest snapshot and milestones', async () => {
      mockGetLatestSnapshot.mockResolvedValue({
        context_depth_score: 85,
        ai_accuracy_score: 92,
        active_days_streak: 7,
        total_ideas: 150,
      });
      mockGetMilestones.mockResolvedValue({
        achieved: [{ id: '1', title: 'First 100 ideas' }],
        upcoming: [{ id: '2', title: '200 ideas' }],
      });

      const res = await request(app).get('/api/personal/evolution/summary');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.summary.context_depth_score).toBe(85);
      expect(res.body.summary.milestones_achieved).toBe(1);
    });

    it('should handle missing snapshot gracefully', async () => {
      mockGetLatestSnapshot.mockResolvedValue(null);
      mockGetMilestones.mockResolvedValue({ achieved: [], upcoming: [] });

      const res = await request(app).get('/api/work/evolution/summary');

      expect(res.status).toBe(200);
      expect(res.body.summary.context_depth_score).toBe(0);
    });
  });

  describe('GET /api/:context/evolution/snapshots', () => {
    it('should return snapshots with default days', async () => {
      mockGetSnapshots.mockResolvedValue([{ date: '2026-01-01', score: 80 }]);

      const res = await request(app).get('/api/personal/evolution/snapshots');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.snapshots).toHaveLength(1);
    });

    it('should accept custom days parameter', async () => {
      mockGetSnapshots.mockResolvedValue([]);

      const res = await request(app).get('/api/personal/evolution/snapshots?days=7');

      expect(res.status).toBe(200);
      expect(mockGetSnapshots).toHaveBeenCalledWith('personal', 7);
    });
  });

  describe('POST /api/:context/evolution/snapshots', () => {
    it('should create a daily snapshot', async () => {
      const snapshot = { id: 'snap-1', date: '2026-03-21' };
      mockCreateDailySnapshot.mockResolvedValue(snapshot);

      const res = await request(app)
        .post('/api/personal/evolution/snapshots');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.snapshot).toEqual(snapshot);
    });
  });

  describe('GET /api/:context/evolution/timeline', () => {
    it('should return learning timeline events', async () => {
      const events = [{ id: '1', title: 'Learned pattern', type: 'pattern_learned' }];
      mockGetLearningTimeline.mockResolvedValue(events);

      const res = await request(app).get('/api/personal/evolution/timeline');

      expect(res.status).toBe(200);
      expect(res.body.events).toHaveLength(1);
    });

    it('should filter by event type', async () => {
      mockGetEventsByType.mockResolvedValue([]);

      const res = await request(app).get('/api/personal/evolution/timeline?event_type=pattern_learned');

      expect(res.status).toBe(200);
      expect(mockGetEventsByType).toHaveBeenCalled();
    });
  });

  describe('POST /api/:context/evolution/events', () => {
    it('should record a valid learning event', async () => {
      mockRecordLearningEvent.mockResolvedValue('evt-123');

      const res = await request(app)
        .post('/api/personal/evolution/events')
        .send({ event_type: 'pattern_learned', title: 'Discovered email pattern' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.event_id).toBe('evt-123');
    });

    it('should reject missing required fields', async () => {
      const res = await request(app)
        .post('/api/personal/evolution/events')
        .send({ event_type: 'pattern_learned' });

      expect(res.status).toBe(400);
    });

    it('should reject invalid event type', async () => {
      const res = await request(app)
        .post('/api/personal/evolution/events')
        .send({ event_type: 'invalid_type', title: 'Test' });

      expect(res.status).toBe(400);
    });
  });
});
