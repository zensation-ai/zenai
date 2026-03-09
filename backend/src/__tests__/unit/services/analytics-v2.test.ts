/**
 * Phase 50: Analytics V2 Service Tests
 */

import {
  getOverview,
  getTrends,
  getProductivityInsights,
  getComparison,
} from '../../../services/analytics-v2';

// Mock database-context
var mockQueryContext = jest.fn();
jest.mock('../../../utils/database-context', () => ({
  queryContext: (...args: unknown[]) => mockQueryContext(...args),
  isValidContext: (ctx: string) => ['personal', 'work', 'learning', 'creative'].includes(ctx),
}));

jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('Analytics V2 Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryContext.mockReset();
  });

  // ===========================================
  // getOverview
  // ===========================================

  describe('getOverview', () => {
    it('should return overview with all metrics', async () => {
      // Current period: ideas, tasks, chats, docs
      mockQueryContext
        .mockResolvedValueOnce({ rows: [{ total: '50', created: '10', completed: '3' }] })
        .mockResolvedValueOnce({ rows: [{ total: '20', completed: '8', in_progress: '5' }] })
        .mockResolvedValueOnce({ rows: [{ total: '15', messages: '120', avg_duration: '12.5' }] })
        .mockResolvedValueOnce({ rows: [{ total: '30', uploaded: '7' }] })
        // Previous period
        .mockResolvedValueOnce({ rows: [{ created: '5' }] })
        .mockResolvedValueOnce({ rows: [{ completed: '4' }] })
        .mockResolvedValueOnce({ rows: [{ total: '10' }] })
        .mockResolvedValueOnce({ rows: [{ uploaded: '3' }] });

      const result = await getOverview('personal' as const, '2026-02-01', '2026-03-01');

      expect(result.ideas.total).toBe(50);
      expect(result.ideas.created).toBe(10);
      expect(result.ideas.trend).toBe(100); // 10 vs 5 = 100%
      expect(result.tasks.total).toBe(20);
      expect(result.tasks.completed).toBe(8);
      expect(result.tasks.inProgress).toBe(5);
      expect(result.tasks.trend).toBe(100); // 8 vs 4 = 100%
      expect(result.chats.total).toBe(15);
      expect(result.chats.messages).toBe(120);
      expect(result.chats.avgDuration).toBe(12.5);
      expect(result.chats.trend).toBe(50); // 15 vs 10 = 50%
      expect(result.documents.total).toBe(30);
      expect(result.documents.uploaded).toBe(7);
      expect(result.documents.trend).toBe(133); // 7 vs 3 = 133%
      expect(mockQueryContext).toHaveBeenCalledTimes(8);
    });

    it('should handle zero previous period gracefully', async () => {
      mockQueryContext
        .mockResolvedValueOnce({ rows: [{ total: '5', created: '5', completed: '0' }] })
        .mockResolvedValueOnce({ rows: [{ total: '2', completed: '1', in_progress: '1' }] })
        .mockResolvedValueOnce({ rows: [{ total: '3', messages: '10', avg_duration: '5' }] })
        .mockResolvedValueOnce({ rows: [{ total: '1', uploaded: '1' }] })
        .mockResolvedValueOnce({ rows: [{ created: '0' }] })
        .mockResolvedValueOnce({ rows: [{ completed: '0' }] })
        .mockResolvedValueOnce({ rows: [{ total: '0' }] })
        .mockResolvedValueOnce({ rows: [{ uploaded: '0' }] });

      const result = await getOverview('work' as const, '2026-01-01', '2026-01-31');

      expect(result.ideas.trend).toBe(100); // 5 vs 0 = 100%
      expect(result.tasks.trend).toBe(100);
      expect(result.chats.trend).toBe(100);
      expect(result.documents.trend).toBe(100);
    });

    it('should handle empty results', async () => {
      mockQueryContext.mockResolvedValue({ rows: [{}] });

      const result = await getOverview('learning' as const, '2026-01-01', '2026-01-31');

      expect(result.ideas.total).toBe(0);
      expect(result.ideas.created).toBe(0);
      expect(result.tasks.total).toBe(0);
      expect(result.chats.total).toBe(0);
      expect(result.documents.total).toBe(0);
    });

    it('should handle missing rows', async () => {
      mockQueryContext.mockResolvedValue({ rows: [] });

      const result = await getOverview('creative' as const, '2026-01-01', '2026-01-31');

      expect(result.ideas.total).toBe(0);
      expect(result.ideas.trend).toBe(0);
    });
  });

  // ===========================================
  // getTrends
  // ===========================================

  describe('getTrends', () => {
    it('should return daily trends', async () => {
      mockQueryContext
        .mockResolvedValueOnce({
          rows: [
            { date: '2026-03-01T00:00:00Z', value: '5' },
            { date: '2026-03-02T00:00:00Z', value: '3' },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            { date: '2026-03-01T00:00:00Z', value: '2' },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            { date: '2026-03-01T00:00:00Z', value: '4' },
            { date: '2026-03-03T00:00:00Z', value: '1' },
          ],
        });

      const result = await getTrends('personal' as const, '2026-03-01', '2026-03-07', 'day');

      expect(result.ideas).toHaveLength(2);
      expect(result.ideas[0].date).toBe('2026-03-01');
      expect(result.ideas[0].value).toBe(5);
      expect(result.tasks).toHaveLength(1);
      expect(result.chats).toHaveLength(2);
    });

    it('should return weekly trends', async () => {
      mockQueryContext
        .mockResolvedValueOnce({ rows: [{ date: '2026-02-24T00:00:00Z', value: '12' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await getTrends('work' as const, '2026-02-01', '2026-03-01', 'week');

      expect(result.ideas).toHaveLength(1);
      expect(result.ideas[0].value).toBe(12);
      expect(result.tasks).toHaveLength(0);
      expect(result.chats).toHaveLength(0);
    });

    it('should return monthly trends', async () => {
      mockQueryContext
        .mockResolvedValueOnce({ rows: [{ date: '2026-01-01T00:00:00Z', value: '30' }] })
        .mockResolvedValueOnce({ rows: [{ date: '2026-01-01T00:00:00Z', value: '15' }] })
        .mockResolvedValueOnce({ rows: [{ date: '2026-01-01T00:00:00Z', value: '20' }] });

      const result = await getTrends('personal' as const, '2026-01-01', '2026-03-01', 'month');

      expect(result.ideas[0].value).toBe(30);
      expect(result.tasks[0].value).toBe(15);
      expect(result.chats[0].value).toBe(20);
    });

    it('should handle empty date range', async () => {
      mockQueryContext.mockResolvedValue({ rows: [] });

      const result = await getTrends('personal' as const, '2026-03-01', '2026-03-01', 'day');

      expect(result.ideas).toHaveLength(0);
      expect(result.tasks).toHaveLength(0);
      expect(result.chats).toHaveLength(0);
    });
  });

  // ===========================================
  // getProductivityInsights
  // ===========================================

  describe('getProductivityInsights', () => {
    it('should return productivity metrics', async () => {
      mockQueryContext
        .mockResolvedValueOnce({ rows: [{ total: '20', completed: '15', avg_duration_hours: '4.5' }] })
        .mockResolvedValueOnce({ rows: [{ hour: '14', cnt: '25' }] })
        .mockResolvedValueOnce({ rows: [{ focus_minutes: '320' }] })
        .mockResolvedValueOnce({ rows: [{ avg_switches: '3.5' }] });

      const result = await getProductivityInsights('personal' as const, '2026-02-01', '2026-03-01');

      expect(result.taskCompletionRate).toBe(75);
      expect(result.avgTaskDuration).toBe(4.5);
      expect(result.mostProductiveHour).toBe(14);
      expect(result.focusTimeMinutes).toBe(320);
      expect(result.contextSwitches).toBe(3.5);
    });

    it('should handle no tasks', async () => {
      mockQueryContext
        .mockResolvedValueOnce({ rows: [{ total: '0', completed: '0', avg_duration_hours: '0' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ focus_minutes: '0' }] })
        .mockResolvedValueOnce({ rows: [{ avg_switches: '0' }] });

      const result = await getProductivityInsights('work' as const, '2026-03-01', '2026-03-07');

      expect(result.taskCompletionRate).toBe(0);
      expect(result.mostProductiveHour).toBe(9); // default
      expect(result.focusTimeMinutes).toBe(0);
    });

    it('should handle 100% completion rate', async () => {
      mockQueryContext
        .mockResolvedValueOnce({ rows: [{ total: '10', completed: '10', avg_duration_hours: '2.0' }] })
        .mockResolvedValueOnce({ rows: [{ hour: '10', cnt: '8' }] })
        .mockResolvedValueOnce({ rows: [{ focus_minutes: '150' }] })
        .mockResolvedValueOnce({ rows: [{ avg_switches: '1' }] });

      const result = await getProductivityInsights('learning' as const, '2026-01-01', '2026-03-01');

      expect(result.taskCompletionRate).toBe(100);
      expect(result.avgTaskDuration).toBe(2.0);
    });
  });

  // ===========================================
  // getComparison
  // ===========================================

  describe('getComparison', () => {
    it('should compare two periods', async () => {
      // getComparison runs two getOverview calls in parallel via Promise.all
      // Each getOverview makes 8 queries (4 current + 4 previous period)
      // Promise.all runs both periods concurrently, so mock consumption order is non-deterministic.
      // Use identical data for all 16 mocks to avoid order-dependency issues.
      const dataRow = { rows: [{ total: '50', created: '20', completed: '12', in_progress: '8', messages: '200', avg_duration: '10', uploaded: '10' }] };

      for (let i = 0; i < 16; i++) {
        mockQueryContext.mockResolvedValueOnce(dataRow);
      }

      const result = await getComparison(
        'personal' as const,
        { from: '2026-02-01', to: '2026-02-28' },
        { from: '2026-01-01', to: '2026-01-31' }
      );

      // Both periods get identical mock data
      expect(result.period1.ideas.created).toBe(20);
      expect(result.period2.ideas.created).toBe(20);
      expect(result.changes.ideas).toBe(0); // same data = 0% change
      expect(result.changes.tasks).toBe(0);
      expect(result.changes.chats).toBe(0);
      expect(result.changes.documents).toBe(0);
      expect(mockQueryContext).toHaveBeenCalledTimes(16);
    });

    it('should handle equal periods', async () => {
      const mockRow = { rows: [{ total: '10', created: '5', completed: '2', in_progress: '3', messages: '20', avg_duration: '5', uploaded: '3' }] };
      const mockPrevRow = { rows: [{ created: '5', completed: '2', total: '5', uploaded: '3' }] };
      mockQueryContext
        .mockResolvedValueOnce(mockRow)
        .mockResolvedValueOnce(mockRow)
        .mockResolvedValueOnce(mockRow)
        .mockResolvedValueOnce(mockRow)
        .mockResolvedValueOnce(mockPrevRow)
        .mockResolvedValueOnce(mockPrevRow)
        .mockResolvedValueOnce(mockPrevRow)
        .mockResolvedValueOnce(mockPrevRow)
        .mockResolvedValueOnce(mockRow)
        .mockResolvedValueOnce(mockRow)
        .mockResolvedValueOnce(mockRow)
        .mockResolvedValueOnce(mockRow)
        .mockResolvedValueOnce(mockPrevRow)
        .mockResolvedValueOnce(mockPrevRow)
        .mockResolvedValueOnce(mockPrevRow)
        .mockResolvedValueOnce(mockPrevRow);

      const result = await getComparison(
        'work' as const,
        { from: '2026-02-01', to: '2026-02-28' },
        { from: '2026-02-01', to: '2026-02-28' }
      );

      expect(result.changes.ideas).toBe(0);
      expect(result.changes.tasks).toBe(0);
    });
  });

  // ===========================================
  // Edge Cases
  // ===========================================

  describe('Edge Cases', () => {
    it('should handle no data at all', async () => {
      mockQueryContext.mockResolvedValue({ rows: [] });

      const overview = await getOverview('creative' as const, '2026-01-01', '2026-01-31');
      expect(overview.ideas.total).toBe(0);
      expect(overview.ideas.trend).toBe(0);

      const trends = await getTrends('creative' as const, '2026-01-01', '2026-01-31', 'day');
      expect(trends.ideas).toHaveLength(0);

      const productivity = await getProductivityInsights('creative' as const, '2026-01-01', '2026-01-31');
      expect(productivity.taskCompletionRate).toBe(0);
    });
  });
});
