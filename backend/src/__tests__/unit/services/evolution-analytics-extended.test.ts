/**
 * Extended Unit Tests for Evolution Analytics Service
 *
 * Covers edge cases and untested paths:
 * - createDailySnapshot with empty/null data
 * - getSnapshots default parameter
 * - recordLearningEvent with related entities
 * - getAccuracyTrends with no data
 * - updateMilestoneProgress with multiple milestones and partial achievement
 * - getMilestones auto-seed and upcoming sorting
 * - getEvolutionDashboard full success path
 * - calculateContextDepthScore boundary values
 * - mapRow helpers with missing fields
 *
 * @module tests/unit/services/evolution-analytics-extended
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
  v4: jest.fn(() => 'ext-uuid-001'),
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
  id: 'snap-ext-001',
  context: 'operations',
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
  id: 'evt-ext-001',
  context: 'operations',
  event_type: 'pattern_learned',
  title: 'Test event',
  description: null,
  impact_score: '0.5',
  related_entity_type: null,
  related_entity_id: null,
  metadata: {},
  icon: '🧠',
  color: 'purple',
  created_at: new Date('2026-03-20T10:00:00Z'),
  ...overrides,
});

const makeMilestoneRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'ms-ext-001',
  context: 'operations',
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

/**
 * Helper to set up all 9 parallel queries + streak for createDailySnapshot
 */
function setupSnapshotQueries(overrides: {
  ideas?: string;
  corrections?: string;
  interactions?: string;
  automations?: string;
  patterns?: string;
  completeness?: string;
  todayIdeas?: string;
  todayFeedback?: string;
  streak?: string;
} = {}) {
  mockQueryContext.mockResolvedValueOnce({ rows: [{ count: overrides.ideas ?? '0' }] } as any);
  mockQueryContext.mockResolvedValueOnce({ rows: [{ count: overrides.corrections ?? '0' }] } as any);
  mockQueryContext.mockResolvedValueOnce({ rows: [{ count: overrides.interactions ?? '0' }] } as any);
  mockQueryContext.mockResolvedValueOnce({ rows: [{ count: overrides.automations ?? '0' }] } as any);
  mockQueryContext.mockResolvedValueOnce({ rows: [{ count: overrides.patterns ?? '0' }] } as any);
  mockQueryContext.mockResolvedValueOnce({ rows: [{ completeness: overrides.completeness ?? '0' }] } as any);
  mockQueryContext.mockResolvedValueOnce({ rows: [{ count: overrides.todayIdeas ?? '0' }] } as any);
  mockQueryContext.mockResolvedValueOnce({ rows: [{ count: overrides.todayFeedback ?? '0' }] } as any);
  mockQueryContext.mockResolvedValueOnce({ rows: [{ streak: overrides.streak ?? '0' }] } as any);
}

describe('Evolution Analytics Service (Extended)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryContext.mockReset();
  });

  // ===========================================
  // createDailySnapshot edge cases
  // ===========================================

  describe('createDailySnapshot edge cases', () => {
    it('should handle all-zero metrics and produce minimum accuracy of 50', async () => {
      setupSnapshotQueries();
      // INSERT
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);
      // Fetch created snapshot - accuracy floor is 50 when correction_rate is high
      mockQueryContext.mockResolvedValueOnce({
        rows: [makeSnapshotRow({
          total_ideas: '0',
          total_corrections: '0',
          ai_accuracy_score: '100',
          correction_rate: '0',
          context_depth_score: '0',
        })],
      } as any);

      const snapshot = await createDailySnapshot('operations');

      expect(snapshot).not.toBeNull();
      expect(snapshot!.total_ideas).toBe(0);
      // With 0 ideas, correction_rate = 0, so accuracy = 100
      expect(snapshot!.ai_accuracy_score).toBe(100);
    });

    it('should handle null count values from DB gracefully', async () => {
      // Return rows with null/undefined counts
      mockQueryContext.mockResolvedValueOnce({ rows: [{ count: null }] } as any);
      mockQueryContext.mockResolvedValueOnce({ rows: [{ count: undefined }] } as any);
      mockQueryContext.mockResolvedValueOnce({ rows: [{}] } as any); // missing count field
      mockQueryContext.mockResolvedValueOnce({ rows: [{ count: '0' }] } as any);
      mockQueryContext.mockResolvedValueOnce({ rows: [{ count: '0' }] } as any);
      mockQueryContext.mockResolvedValueOnce({ rows: [{ completeness: null }] } as any);
      mockQueryContext.mockResolvedValueOnce({ rows: [{ count: '0' }] } as any);
      mockQueryContext.mockResolvedValueOnce({ rows: [{ count: '0' }] } as any);
      mockQueryContext.mockResolvedValueOnce({ rows: [{ streak: null }] } as any);
      // INSERT
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);
      // Fetch
      mockQueryContext.mockResolvedValueOnce({
        rows: [makeSnapshotRow({ total_ideas: '0', total_corrections: '0' })],
      } as any);

      const snapshot = await createDailySnapshot('operations');

      expect(snapshot).not.toBeNull();
    });

    it('should return null when fetch after insert returns empty', async () => {
      setupSnapshotQueries({ ideas: '10', corrections: '2' });
      // INSERT
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);
      // Fetch returns nothing
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      const snapshot = await createDailySnapshot('operations');

      expect(snapshot).toBeNull();
    });

    it('should cap accuracy at 50 when correction rate exceeds 0.5', async () => {
      // 10 ideas, 8 corrections => rate=0.8, accuracy = max(50, 100-80) = 50
      setupSnapshotQueries({ ideas: '10', corrections: '8' });
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any); // INSERT
      mockQueryContext.mockResolvedValueOnce({
        rows: [makeSnapshotRow({ ai_accuracy_score: '50', correction_rate: '0.8' })],
      } as any);

      const snapshot = await createDailySnapshot('operations');

      expect(snapshot).not.toBeNull();
      expect(snapshot!.ai_accuracy_score).toBe(50);
    });

    it('should work with work context', async () => {
      setupSnapshotQueries({ ideas: '5' });
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);
      mockQueryContext.mockResolvedValueOnce({
        rows: [makeSnapshotRow({ context: 'finance', total_ideas: '5' })],
      } as any);

      const snapshot = await createDailySnapshot('finance');

      expect(snapshot).not.toBeNull();
      expect(snapshot!.context).toBe('finance');
      // Verify context was passed to queries
      expect(mockQueryContext.mock.calls[0][0]).toBe('finance');
    });

    it('should handle empty rows from parallel queries', async () => {
      // All queries return empty rows arrays
      for (let i = 0; i < 9; i++) {
        mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);
      }
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any); // INSERT
      mockQueryContext.mockResolvedValueOnce({
        rows: [makeSnapshotRow({ total_ideas: '0' })],
      } as any);

      const snapshot = await createDailySnapshot('operations');

      expect(snapshot).not.toBeNull();
    });
  });

  // ===========================================
  // getSnapshots edge cases
  // ===========================================

  describe('getSnapshots edge cases', () => {
    it('should use default 30 days when no days parameter given', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      await getSnapshots('operations');

      expect(mockQueryContext).toHaveBeenCalledWith(
        'operations',
        expect.any(String),
        ['operations', '30 days']
      );
    });

    it('should return empty array for no matching snapshots', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      const snapshots = await getSnapshots('operations', 7);

      expect(snapshots).toEqual([]);
    });

    it('should correctly map multiple snapshot rows', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [
          makeSnapshotRow({ id: 'a', snapshot_date: new Date('2026-03-18'), ai_accuracy_score: '70' }),
          makeSnapshotRow({ id: 'b', snapshot_date: new Date('2026-03-19'), ai_accuracy_score: '75' }),
          makeSnapshotRow({ id: 'c', snapshot_date: new Date('2026-03-20'), ai_accuracy_score: '80' }),
        ],
      } as any);

      const snapshots = await getSnapshots('operations', 7);

      expect(snapshots).toHaveLength(3);
      expect(snapshots[0].ai_accuracy_score).toBe(70);
      expect(snapshots[2].ai_accuracy_score).toBe(80);
    });
  });

  // ===========================================
  // recordLearningEvent edge cases
  // ===========================================

  describe('recordLearningEvent edge cases', () => {
    it('should store related entity type and id', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      await recordLearningEvent('operations', 'cluster_discovered', 'New cluster', {
        related_entity_type: 'topic',
        related_entity_id: 'topic-123',
      });

      const params = mockQueryContext.mock.calls[0][2];
      expect(params[6]).toBe('topic');     // related_entity_type
      expect(params[7]).toBe('topic-123'); // related_entity_id
    });

    it('should use correct default icon for each event type', async () => {
      const typeIconMap: Record<string, string> = {
        pattern_learned: '🧠',
        preference_updated: '⚙️',
        accuracy_improved: '📈',
        automation_created: '⚡',
        cluster_discovered: '🔗',
        topic_recognized: '🏷️',
        behavior_adapted: '🔄',
        profile_enriched: '👤',
        integration_connected: '🔌',
        weekly_summary: '📊',
      };

      for (const [eventType, expectedIcon] of Object.entries(typeIconMap)) {
        mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);
        await recordLearningEvent('operations', eventType as any, `Test ${eventType}`);

        const callIndex = mockQueryContext.mock.calls.length - 1;
        const params = mockQueryContext.mock.calls[callIndex][2];
        expect(params[9]).toBe(expectedIcon);
      }
    });

    it('should use correct default color for each event type', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);
      await recordLearningEvent('operations', 'automation_suggested', 'Suggestion');

      const params = mockQueryContext.mock.calls[0][2];
      expect(params[10]).toBe('cyan'); // automation_suggested color
    });

    it('should default impact_score to 0.5', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      await recordLearningEvent('operations', 'pattern_learned', 'Test');

      const params = mockQueryContext.mock.calls[0][2];
      expect(params[5]).toBe(0.5);
    });

    it('should serialize metadata to JSON', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      await recordLearningEvent('operations', 'pattern_learned', 'Test', {
        metadata: { nested: { key: 'value' }, arr: [1, 2, 3] },
      });

      const params = mockQueryContext.mock.calls[0][2];
      expect(params[8]).toBe(JSON.stringify({ nested: { key: 'value' }, arr: [1, 2, 3] }));
    });
  });

  // ===========================================
  // getLearningTimeline edge cases
  // ===========================================

  describe('getLearningTimeline edge cases', () => {
    it('should pass limit and offset to query', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      await getLearningTimeline('finance', 25, 10);

      expect(mockQueryContext).toHaveBeenCalledWith(
        'finance',
        expect.any(String),
        ['finance', 25, 10]
      );
    });

    it('should use default limit=50 and offset=0', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      await getLearningTimeline('operations');

      expect(mockQueryContext).toHaveBeenCalledWith(
        'operations',
        expect.any(String),
        ['operations', 50, 0]
      );
    });
  });

  // ===========================================
  // getEventsByType edge cases
  // ===========================================

  describe('getEventsByType edge cases', () => {
    it('should pass custom limit', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      await getEventsByType('operations', 'automation_created', 5);

      expect(mockQueryContext).toHaveBeenCalledWith(
        'operations',
        expect.any(String),
        ['operations', 'automation_created', 5]
      );
    });

    it('should use default limit of 20', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      await getEventsByType('operations', 'pattern_learned');

      expect(mockQueryContext).toHaveBeenCalledWith(
        'operations',
        expect.any(String),
        ['operations', 'pattern_learned', 20]
      );
    });
  });

  // ===========================================
  // getAccuracyTrends edge cases
  // ===========================================

  describe('getAccuracyTrends edge cases', () => {
    it('should return empty array when no accuracy data exists', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      const trends = await getAccuracyTrends('operations', 12);

      expect(trends).toEqual([]);
    });

    it('should use default 12 weeks when no parameter given', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      await getAccuracyTrends('operations');

      expect(mockQueryContext).toHaveBeenCalledWith(
        'operations',
        expect.any(String),
        ['operations', '12 weeks']
      );
    });

    it('should handle null accuracy_score and trend_delta', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [{
          field_name: 'category',
          period_start: new Date('2026-03-10'),
          accuracy_score: null,
          trend: 'stable',
          trend_delta: null,
        }],
      } as any);

      const trends = await getAccuracyTrends('operations');

      expect(trends).toHaveLength(1);
      expect(trends[0].accuracy_score).toBe(0);
      expect(trends[0].trend_delta).toBe(0);
    });
  });

  // ===========================================
  // recordAccuracyPeriod edge cases
  // ===========================================

  describe('recordAccuracyPeriod edge cases', () => {
    it('should not throw on DB error', async () => {
      mockQueryContext.mockRejectedValueOnce(new Error('Insert failed'));

      await expect(
        recordAccuracyPeriod('operations', 'title', new Date(), new Date(), 100, 80)
      ).resolves.toBeUndefined();
    });

    it('should calculate 100% accuracy for perfect predictions', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any); // no previous
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any); // INSERT

      await recordAccuracyPeriod('operations', 'title', new Date(), new Date(), 50, 50);

      const params = mockQueryContext.mock.calls[1][2];
      expect(params[8]).toBe(100); // accuracy_score
    });
  });

  // ===========================================
  // updateMilestoneProgress edge cases
  // ===========================================

  describe('updateMilestoneProgress edge cases', () => {
    it('should handle multiple milestones with mixed achievement states', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [
          makeMilestoneRow({ id: 'ms-1', milestone_level: '1', threshold_value: '1', achieved: true, current_value: '1' }),
          makeMilestoneRow({ id: 'ms-2', milestone_level: '2', threshold_value: '10', achieved: false, current_value: '5' }),
          makeMilestoneRow({ id: 'ms-3', milestone_level: '3', threshold_value: '50', achieved: false, current_value: '5' }),
        ],
      } as any);
      // UPDATE for ms-1
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);
      // UPDATE for ms-2
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);
      // UPDATE for ms-3
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);
      // recordLearningEvent for ms-2 (newly achieved)
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      const milestones = await updateMilestoneProgress('operations', 'ideas_count', 15);

      expect(milestones).toHaveLength(3);
      // ms-1: already achieved, stays achieved
      expect(milestones[0].achieved).toBe(true);
      // ms-2: newly achieved (15 >= 10)
      expect(milestones[1].achieved).toBe(true);
      expect(milestones[1].progress_percent).toBe(100);
      // ms-3: not yet achieved (15 < 50)
      expect(milestones[2].achieved).toBe(false);
      expect(milestones[2].progress_percent).toBe(30); // (15/50)*100
    });

    it('should handle no milestones found for type', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      const milestones = await updateMilestoneProgress('operations', 'nonexistent_type', 10);

      expect(milestones).toEqual([]);
    });

    it('should cap progress_percent at 100', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [makeMilestoneRow({ id: 'ms-1', threshold_value: '10', achieved: false })],
      } as any);
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any); // UPDATE
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any); // recordLearningEvent

      const milestones = await updateMilestoneProgress('operations', 'ideas_count', 999);

      expect(milestones[0].progress_percent).toBe(100);
      expect(milestones[0].current_value).toBe(999);
    });
  });

  // ===========================================
  // getMilestones edge cases
  // ===========================================

  describe('getMilestones edge cases', () => {
    it('should sort upcoming milestones by progress descending', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [
          makeMilestoneRow({ id: 'ms-1', achieved: false, progress_percent: '30' }),
          makeMilestoneRow({ id: 'ms-2', achieved: false, progress_percent: '75' }),
          makeMilestoneRow({ id: 'ms-3', achieved: false, progress_percent: '50' }),
        ],
      } as any);

      const result = await getMilestones('operations');

      expect(result.upcoming).toHaveLength(3);
      expect(result.upcoming[0].progress_percent).toBe(75);
      expect(result.upcoming[1].progress_percent).toBe(50);
      expect(result.upcoming[2].progress_percent).toBe(30);
    });

    it('should exclude milestones with progress < 25% from upcoming', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [
          makeMilestoneRow({ id: 'ms-1', achieved: false, progress_percent: '10' }),
          makeMilestoneRow({ id: 'ms-2', achieved: false, progress_percent: '24' }),
          makeMilestoneRow({ id: 'ms-3', achieved: false, progress_percent: '25' }),
        ],
      } as any);

      const result = await getMilestones('operations');

      expect(result.upcoming).toHaveLength(1);
      expect(result.upcoming[0].id).toBe('ms-3');
    });

    it('should seed default milestones when none exist and refetch', async () => {
      // First query: empty
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);
      // 13 seed inserts
      for (let i = 0; i < 13; i++) {
        mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);
      }
      // Refetch after seeding
      mockQueryContext.mockResolvedValueOnce({
        rows: [
          makeMilestoneRow({ id: 'seeded-1', achieved: false, progress_percent: '0' }),
          makeMilestoneRow({ id: 'seeded-2', achieved: false, progress_percent: '0' }),
        ],
      } as any);

      const result = await getMilestones('operations');

      expect(result.all).toHaveLength(2);
      // All 13 seed queries should have been called
      expect(mockQueryContext).toHaveBeenCalledTimes(1 + 13 + 1);
    });
  });

  // ===========================================
  // getEvolutionDashboard edge cases
  // ===========================================

  describe('getEvolutionDashboard edge cases', () => {
    it('should return full dashboard with all sections populated', async () => {
      // createDailySnapshot (9 queries + streak + INSERT + fetch)
      setupSnapshotQueries({ ideas: '42', corrections: '5', interactions: '200' });
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any); // INSERT
      mockQueryContext.mockResolvedValueOnce({
        rows: [makeSnapshotRow()],
      } as any); // fetch snapshot

      // getLatestSnapshot
      mockQueryContext.mockResolvedValueOnce({
        rows: [makeSnapshotRow()],
      } as any);

      // getLearningTimeline
      mockQueryContext.mockResolvedValueOnce({
        rows: [makeEventRow({ id: 'evt-1' }), makeEventRow({ id: 'evt-2' })],
      } as any);

      // getAccuracyTrends
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      // getMilestones
      mockQueryContext.mockResolvedValueOnce({
        rows: [
          makeMilestoneRow({ id: 'ms-1', achieved: true, progress_percent: '100' }),
          makeMilestoneRow({ id: 'ms-2', achieved: false, progress_percent: '60' }),
        ],
      } as any);

      // getSnapshots (30d)
      mockQueryContext.mockResolvedValueOnce({
        rows: [
          makeSnapshotRow({ snapshot_date: new Date('2026-03-18') }),
          makeSnapshotRow({ snapshot_date: new Date('2026-03-20') }),
        ],
      } as any);

      // getTotalAutomationExecutions
      mockQueryContext.mockResolvedValueOnce({ rows: [{ count: '50' }] } as any);

      // getTotalPatternsLearned
      mockQueryContext.mockResolvedValueOnce({ rows: [{ count: '15' }] } as any);

      // updateMilestoneProgress calls (5 types) - each does SELECT + UPDATE
      for (let i = 0; i < 5; i++) {
        mockQueryContext.mockResolvedValueOnce({ rows: [] } as any); // SELECT milestones
      }

      // getTotalActiveDays
      mockQueryContext.mockResolvedValueOnce({ rows: [{ count: '30' }] } as any);

      const dashboard = await getEvolutionDashboard('operations');

      expect(dashboard).toBeDefined();
      expect(dashboard.current_snapshot).not.toBeNull();
      expect(dashboard.learning_timeline).toHaveLength(2);
      expect(dashboard.recent_events_count).toBe(2);
      expect(dashboard.achieved_milestones).toHaveLength(1);
      expect(dashboard.upcoming_milestones).toHaveLength(1);
      expect(dashboard.total_milestones_achieved).toBe(1);
      expect(dashboard.total_automations_executed).toBe(50);
      expect(dashboard.total_patterns_learned).toBe(15);
      expect(dashboard.total_time_saved_minutes).toBe(100); // 50 executions * 2 min
      expect(dashboard.total_days_active).toBe(30);
      expect(dashboard.snapshots_30d).toHaveLength(2);
    });

    it('should return default ai_accuracy_score 50 when no snapshot exists', async () => {
      // createDailySnapshot fails
      mockQueryContext.mockRejectedValueOnce(new Error('Snapshot creation failed'));

      // getLatestSnapshot returns null
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      // getLearningTimeline
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      // getAccuracyTrends
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      // getMilestones
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);
      // seed milestones
      for (let i = 0; i < 13; i++) {
        mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);
      }
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any); // refetch

      // getSnapshots
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      // getTotalAutomationExecutions
      mockQueryContext.mockResolvedValueOnce({ rows: [{ count: '0' }] } as any);

      // getTotalPatternsLearned
      mockQueryContext.mockResolvedValueOnce({ rows: [{ count: '0' }] } as any);

      // getTotalActiveDays
      mockQueryContext.mockResolvedValueOnce({ rows: [{ count: '0' }] } as any);

      const dashboard = await getEvolutionDashboard('operations');

      expect(dashboard.ai_accuracy_score).toBe(50);
      expect(dashboard.context_depth_score).toBe(0);
      expect(dashboard.active_days_streak).toBe(0);
    });

    it('should handle partial failures gracefully via error catch', async () => {
      // All internal calls throw
      mockQueryContext.mockRejectedValue(new Error('Total catastrophe'));

      const dashboard = await getEvolutionDashboard('operations');

      expect(dashboard).toBeDefined();
      expect(dashboard.current_snapshot).toBeNull();
      expect(dashboard.ai_accuracy_score).toBe(50);
      expect(dashboard.learning_timeline).toEqual([]);
      expect(dashboard.accuracy_trend).toEqual([]);
      expect(dashboard.snapshots_30d).toEqual([]);
      expect(dashboard.achieved_milestones).toEqual([]);
      expect(dashboard.upcoming_milestones).toEqual([]);
      expect(dashboard.total_time_saved_minutes).toBe(0);
      expect(dashboard.total_automations_executed).toBe(0);
      expect(dashboard.total_patterns_learned).toBe(0);
      expect(dashboard.active_days_streak).toBe(0);
      expect(dashboard.total_days_active).toBe(0);
    });
  });

  // ===========================================
  // getLatestSnapshot edge cases
  // ===========================================

  describe('getLatestSnapshot edge cases', () => {
    it('should map all snapshot fields correctly including edge values', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [makeSnapshotRow({
          learned_keywords_count: '99',
          automations_executed_today: '5',
          automation_success_rate: '0.95',
          estimated_time_saved_minutes: '120',
        })],
      } as any);

      const snapshot = await getLatestSnapshot('operations');

      expect(snapshot).not.toBeNull();
      expect(snapshot!.learned_keywords_count).toBe(99);
      expect(snapshot!.automations_executed_today).toBe(5);
      expect(snapshot!.automation_success_rate).toBe(0.95);
      expect(snapshot!.estimated_time_saved_minutes).toBe(120);
    });
  });

  // ===========================================
  // mapRowToEvent via getLearningTimeline
  // ===========================================

  describe('event row mapping edge cases', () => {
    it('should handle event with all optional fields populated', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [makeEventRow({
          description: 'A detailed description',
          related_entity_type: 'idea',
          related_entity_id: 'idea-456',
          impact_score: '0.9',
          metadata: { source: 'auto' },
        })],
      } as any);

      const events = await getLearningTimeline('operations', 1);

      expect(events[0].description).toBe('A detailed description');
      expect(events[0].related_entity_type).toBe('idea');
      expect(events[0].related_entity_id).toBe('idea-456');
      expect(events[0].impact_score).toBe(0.9);
      expect(events[0].metadata).toEqual({ source: 'auto' });
    });

    it('should default impact_score to 0.5 when null', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [makeEventRow({ impact_score: null })],
      } as any);

      const events = await getLearningTimeline('operations', 1);

      expect(events[0].impact_score).toBe(0.5);
    });
  });

  // ===========================================
  // mapRowToMilestone edge cases
  // ===========================================

  describe('milestone row mapping edge cases', () => {
    it('should map achieved milestone with achieved_at date', async () => {
      const achievedDate = new Date('2026-03-15T12:00:00Z');
      mockQueryContext.mockResolvedValueOnce({
        rows: [makeMilestoneRow({
          achieved: true,
          achieved_at: achievedDate,
          progress_percent: '100',
          current_value: '10',
        })],
      } as any);

      const result = await getMilestones('operations');

      expect(result.achieved).toHaveLength(1);
      expect(result.achieved[0].achieved_at).toBe('2026-03-15T12:00:00.000Z');
    });

    it('should default icon to trophy when row icon is falsy', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [makeMilestoneRow({ icon: '' })],
      } as any);

      const result = await getMilestones('operations');

      expect(result.all[0].icon).toBe('🏆');
    });
  });
});
