/**
 * Unit Tests for Evolution Analytics Service
 *
 * Tests snapshot management, learning events, accuracy tracking,
 * milestones, and the full dashboard aggregation.
 *
 * @module tests/unit/services/evolution-analytics
 */

const mockQueryContext = jest.fn();
jest.mock('../../../utils/database-context', () => ({
  queryContext: (...args: unknown[]) => mockQueryContext(...args),
}));

jest.mock('../../../utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-uuid-001'),
}));

import {
  createDailySnapshot,
  getSnapshots,
  getLatestSnapshot,
  recordLearningEvent,
  getLearningTimeline,
  getEventsByType,
  recordAccuracyPeriod,
  getAccuracyTrends,
  updateMilestoneProgress,
  getMilestones,
  getEvolutionDashboard,
} from '../../../services/evolution-analytics';

// ===========================================
// Test Helpers
// ===========================================

const makeSnapshotRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'snap-001',
  context: 'personal',
  snapshot_date: new Date('2026-03-20'),
  total_ideas: '42',
  total_corrections: '5',
  total_interactions: '200',
  total_automations: '3',
  correction_rate: '0.12',
  ai_accuracy_score: '88',
  context_depth_score: '65',
  profile_completeness: '80',
  learned_patterns_count: '15',
  learned_keywords_count: '0',
  automations_active: '3',
  automations_executed_today: '0',
  automation_success_rate: '0',
  estimated_time_saved_minutes: '0',
  active_days_streak: '7',
  ideas_created_today: '2',
  feedback_given_today: '1',
  created_at: new Date('2026-03-20T10:00:00Z'),
  ...overrides,
});

const makeEventRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'evt-001',
  context: 'personal',
  event_type: 'pattern_learned',
  title: 'Learned a new pattern',
  description: 'Description of event',
  impact_score: '0.7',
  related_entity_type: null,
  related_entity_id: null,
  metadata: {},
  icon: '🧠',
  color: 'purple',
  created_at: new Date('2026-03-20T10:00:00Z'),
  ...overrides,
});

const makeMilestoneRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'ms-001',
  context: 'personal',
  milestone_type: 'ideas_count',
  milestone_level: '1',
  title: 'Erster Gedanke',
  description: null,
  icon: '💡',
  threshold_value: '1',
  achieved: false,
  achieved_at: null,
  current_value: '0',
  progress_percent: '0',
  ...overrides,
});

describe('Evolution Analytics Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryContext.mockReset();
  });

  // ===========================================
  // createDailySnapshot
  // ===========================================

  describe('createDailySnapshot', () => {
    it('should gather metrics and create a snapshot', async () => {
      // 9 parallel queries + 1 insert + 1 fetch
      const countsRow = { count: '42' };
      const zeroRow = { count: '0' };
      const profileRow = { completeness: '80' };

      // Ideas, corrections, interactions, automations, patterns, profile, todayIdeas, todayFeedback
      mockQueryContext.mockResolvedValueOnce({ rows: [countsRow] } as any); // ideas
      mockQueryContext.mockResolvedValueOnce({ rows: [{ count: '5' }] } as any); // corrections
      mockQueryContext.mockResolvedValueOnce({ rows: [{ count: '200' }] } as any); // interactions
      mockQueryContext.mockResolvedValueOnce({ rows: [{ count: '3' }] } as any); // automations
      mockQueryContext.mockResolvedValueOnce({ rows: [{ count: '15' }] } as any); // patterns
      mockQueryContext.mockResolvedValueOnce({ rows: [profileRow] } as any); // profile
      mockQueryContext.mockResolvedValueOnce({ rows: [{ count: '2' }] } as any); // todayIdeas
      mockQueryContext.mockResolvedValueOnce({ rows: [zeroRow] } as any); // todayFeedback
      // calculateStreak
      mockQueryContext.mockResolvedValueOnce({ rows: [{ streak: '7' }] } as any);
      // INSERT
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);
      // Fetch created snapshot
      mockQueryContext.mockResolvedValueOnce({ rows: [makeSnapshotRow()] } as any);

      const snapshot = await createDailySnapshot('personal');

      expect(snapshot).not.toBeNull();
      expect(snapshot?.total_ideas).toBe(42);
      expect(snapshot?.ai_accuracy_score).toBe(88);
      expect(snapshot?.active_days_streak).toBe(7);
    });

    it('should return null on error', async () => {
      mockQueryContext.mockRejectedValue(new Error('DB error'));

      const snapshot = await createDailySnapshot('personal');

      expect(snapshot).toBeNull();
    });
  });

  // ===========================================
  // getSnapshots
  // ===========================================

  describe('getSnapshots', () => {
    it('should return snapshots for date range', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [
          makeSnapshotRow({ id: 's1', snapshot_date: new Date('2026-03-18') }),
          makeSnapshotRow({ id: 's2', snapshot_date: new Date('2026-03-19') }),
        ],
      } as any);

      const snapshots = await getSnapshots('personal', 7);

      expect(snapshots).toHaveLength(2);
      expect(snapshots[0].id).toBe('s1');
    });

    it('should return empty array on error', async () => {
      mockQueryContext.mockRejectedValueOnce(new Error('Query failed'));

      const snapshots = await getSnapshots('personal');

      expect(snapshots).toEqual([]);
    });
  });

  // ===========================================
  // getLatestSnapshot
  // ===========================================

  describe('getLatestSnapshot', () => {
    it('should return the most recent snapshot', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [makeSnapshotRow()],
      } as any);

      const snapshot = await getLatestSnapshot('personal');

      expect(snapshot).not.toBeNull();
      expect(snapshot?.id).toBe('snap-001');
    });

    it('should return null when no snapshots exist', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      const snapshot = await getLatestSnapshot('personal');

      expect(snapshot).toBeNull();
    });

    it('should return null on error', async () => {
      mockQueryContext.mockRejectedValueOnce(new Error('Connection lost'));

      const snapshot = await getLatestSnapshot('personal');

      expect(snapshot).toBeNull();
    });
  });

  // ===========================================
  // recordLearningEvent
  // ===========================================

  describe('recordLearningEvent', () => {
    it('should record event and return ID', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      const id = await recordLearningEvent('personal', 'pattern_learned', 'New pattern found');

      expect(id).toBe('test-uuid-001');
      expect(mockQueryContext).toHaveBeenCalledWith(
        'personal',
        expect.stringContaining('INSERT INTO learning_events'),
        expect.arrayContaining(['test-uuid-001', 'personal', 'pattern_learned', 'New pattern found'])
      );
    });

    it('should use default icon and color based on event type', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      await recordLearningEvent('personal', 'milestone_reached', 'Milestone!');

      const params = mockQueryContext.mock.calls[0][2];
      expect(params[9]).toBe('🏆'); // icon
      expect(params[10]).toBe('gold'); // color
    });

    it('should accept custom options', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      await recordLearningEvent('personal', 'pattern_learned', 'Custom event', {
        description: 'Custom desc',
        impact_score: 0.9,
        icon: '⭐',
        color: 'red',
        metadata: { key: 'value' },
      });

      const params = mockQueryContext.mock.calls[0][2];
      expect(params[4]).toBe('Custom desc');
      expect(params[5]).toBe(0.9);
      expect(params[9]).toBe('⭐');
      expect(params[10]).toBe('red');
    });

    it('should return empty string on error', async () => {
      mockQueryContext.mockRejectedValueOnce(new Error('Insert failed'));

      const id = await recordLearningEvent('personal', 'pattern_learned', 'Test');

      expect(id).toBe('');
    });
  });

  // ===========================================
  // getLearningTimeline
  // ===========================================

  describe('getLearningTimeline', () => {
    it('should return learning events sorted by date', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [
          makeEventRow({ id: 'e1' }),
          makeEventRow({ id: 'e2', event_type: 'accuracy_improved' }),
        ],
      } as any);

      const timeline = await getLearningTimeline('personal', 10, 0);

      expect(timeline).toHaveLength(2);
      expect(timeline[0].id).toBe('e1');
      expect(timeline[1].event_type).toBe('accuracy_improved');
    });

    it('should return empty array on error', async () => {
      mockQueryContext.mockRejectedValueOnce(new Error('Query failed'));

      const timeline = await getLearningTimeline('personal');

      expect(timeline).toEqual([]);
    });
  });

  // ===========================================
  // getEventsByType
  // ===========================================

  describe('getEventsByType', () => {
    it('should filter events by type', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [makeEventRow({ event_type: 'milestone_reached' })],
      } as any);

      const events = await getEventsByType('personal', 'milestone_reached');

      expect(events).toHaveLength(1);
      expect(events[0].event_type).toBe('milestone_reached');
    });

    it('should return empty array on error', async () => {
      mockQueryContext.mockRejectedValueOnce(new Error('DB error'));

      const events = await getEventsByType('personal', 'pattern_learned');

      expect(events).toEqual([]);
    });
  });

  // ===========================================
  // recordAccuracyPeriod
  // ===========================================

  describe('recordAccuracyPeriod', () => {
    it('should calculate accuracy score and detect improving trend', async () => {
      // Previous period
      mockQueryContext.mockResolvedValueOnce({
        rows: [{ accuracy_score: '70' }],
      } as any);
      // INSERT
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      await recordAccuracyPeriod(
        'personal',
        'category',
        new Date('2026-03-10'),
        new Date('2026-03-17'),
        100,
        85
      );

      const params = mockQueryContext.mock.calls[1][2];
      expect(params[8]).toBe(85); // accuracy_score = 85/100 * 100
      expect(params[9]).toBe('improving'); // 85 - 70 = 15 > 2
    });

    it('should detect declining trend', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [{ accuracy_score: '90' }],
      } as any);
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      await recordAccuracyPeriod('personal', 'title', new Date('2026-03-10'), new Date('2026-03-17'), 100, 80);

      const params = mockQueryContext.mock.calls[1][2];
      expect(params[9]).toBe('declining'); // 80 - 90 = -10 < -2
    });

    it('should detect stable trend', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [{ accuracy_score: '84' }],
      } as any);
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      await recordAccuracyPeriod('personal', 'title', new Date('2026-03-10'), new Date('2026-03-17'), 100, 85);

      const params = mockQueryContext.mock.calls[1][2];
      expect(params[9]).toBe('stable'); // 85 - 84 = 1 (between -2 and 2)
    });

    it('should handle zero predictions', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      await recordAccuracyPeriod('personal', 'title', new Date(), new Date(), 0, 0);

      const params = mockQueryContext.mock.calls[1][2];
      expect(params[8]).toBe(0); // accuracy_score
    });

    it('should handle no previous period (stable default)', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any); // no previous
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      await recordAccuracyPeriod('personal', 'title', new Date(), new Date(), 100, 80);

      const params = mockQueryContext.mock.calls[1][2];
      expect(params[9]).toBe('stable');
      expect(params[10]).toBe(0); // trendDelta
    });
  });

  // ===========================================
  // getAccuracyTrends
  // ===========================================

  describe('getAccuracyTrends', () => {
    it('should return accuracy trends', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [{
          field_name: 'category',
          period_start: new Date('2026-03-10'),
          accuracy_score: '85.5',
          trend: 'improving',
          trend_delta: '3.2',
        }],
      } as any);

      const trends = await getAccuracyTrends('personal', 12);

      expect(trends).toHaveLength(1);
      expect(trends[0].field_name).toBe('category');
      expect(trends[0].accuracy_score).toBeCloseTo(85.5);
      expect(trends[0].trend).toBe('improving');
    });

    it('should return empty array on error', async () => {
      mockQueryContext.mockRejectedValueOnce(new Error('DB error'));

      const trends = await getAccuracyTrends('personal');

      expect(trends).toEqual([]);
    });
  });

  // ===========================================
  // updateMilestoneProgress
  // ===========================================

  describe('updateMilestoneProgress', () => {
    it('should update milestone and detect newly achieved', async () => {
      // Get milestones
      mockQueryContext.mockResolvedValueOnce({
        rows: [makeMilestoneRow({ id: 'ms-1', threshold_value: '10', achieved: false, current_value: '5' })],
      } as any);
      // UPDATE milestone
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);
      // recordLearningEvent (for newly achieved)
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      const milestones = await updateMilestoneProgress('personal', 'ideas_count', 15);

      expect(milestones).toHaveLength(1);
      expect(milestones[0].achieved).toBe(true);
      expect(milestones[0].current_value).toBe(15);
      expect(milestones[0].progress_percent).toBe(100);
    });

    it('should not record event for already achieved milestone', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [makeMilestoneRow({ id: 'ms-1', threshold_value: '10', achieved: true, current_value: '12' })],
      } as any);
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any); // UPDATE

      const milestones = await updateMilestoneProgress('personal', 'ideas_count', 15);

      expect(milestones[0].achieved).toBe(true);
      // recordLearningEvent should NOT be called
      expect(mockQueryContext).toHaveBeenCalledTimes(2); // only GET + UPDATE
    });

    it('should return empty array on error', async () => {
      mockQueryContext.mockRejectedValueOnce(new Error('DB error'));

      const milestones = await updateMilestoneProgress('personal', 'ideas_count', 10);

      expect(milestones).toEqual([]);
    });
  });

  // ===========================================
  // getMilestones
  // ===========================================

  describe('getMilestones', () => {
    it('should return achieved and upcoming milestones', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [
          makeMilestoneRow({ id: 'ms-1', achieved: true, progress_percent: '100' }),
          makeMilestoneRow({ id: 'ms-2', achieved: false, progress_percent: '50' }),
          makeMilestoneRow({ id: 'ms-3', achieved: false, progress_percent: '10' }),
        ],
      } as any);

      const result = await getMilestones('personal');

      expect(result.achieved).toHaveLength(1);
      expect(result.upcoming).toHaveLength(1); // only ms-2 (>= 25%)
      expect(result.all).toHaveLength(3);
    });

    it('should auto-seed milestones when none exist', async () => {
      // First query: no milestones
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);
      // Seed queries (13 default milestones)
      for (let i = 0; i < 13; i++) {
        mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);
      }
      // Re-fetch after seed
      mockQueryContext.mockResolvedValueOnce({
        rows: [makeMilestoneRow()],
      } as any);

      const result = await getMilestones('personal');

      expect(result.all.length).toBeGreaterThanOrEqual(1);
    });

    it('should return empty on error', async () => {
      mockQueryContext.mockRejectedValueOnce(new Error('DB error'));

      const result = await getMilestones('personal');

      expect(result.achieved).toEqual([]);
      expect(result.upcoming).toEqual([]);
      expect(result.all).toEqual([]);
    });
  });

  // ===========================================
  // getEvolutionDashboard
  // ===========================================

  describe('getEvolutionDashboard', () => {
    it('should return empty dashboard on total failure', async () => {
      mockQueryContext.mockRejectedValue(new Error('Total failure'));

      const dashboard = await getEvolutionDashboard('personal');

      expect(dashboard).toBeDefined();
      expect(dashboard.current_snapshot).toBeNull();
      expect(dashboard.ai_accuracy_score).toBe(50);
      expect(dashboard.learning_timeline).toEqual([]);
      expect(dashboard.achieved_milestones).toEqual([]);
      expect(dashboard.total_time_saved_minutes).toBe(0);
    });
  });
});
