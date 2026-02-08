/**
 * Productivity Analytics Service - Unit Tests
 */

import {
  getTimeSavedMetrics,
  getActivityHeatmap,
  getKnowledgeGrowth,
  getStreakInfo,
  getWeeklyReport,
  getProductivityDashboard,
} from '../../../services/productivity-analytics';

// Mock database-context
const mockQueryContext = jest.fn();
jest.mock('../../../utils/database-context', () => ({
  queryContext: (...args: unknown[]) => mockQueryContext(...args),
}));

jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

/** Format a Date as YYYY-MM-DD in local time (timezone-safe) */
function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

describe('Productivity Analytics Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryContext.mockReset();
  });

  // ========================================
  // getTimeSavedMetrics
  // ========================================
  describe('getTimeSavedMetrics', () => {
    it('should calculate time saved from all activity types', async () => {
      mockQueryContext
        .mockResolvedValueOnce({ rows: [{ weekly_drafts: '5', monthly_drafts: '20' }] })   // drafts
        .mockResolvedValueOnce({ rows: [{ weekly_searches: '30', monthly_searches: '100' }] }) // searches
        .mockResolvedValueOnce({ rows: [{ weekly_auto: '10', monthly_auto: '40' }] })       // auto-categories
        .mockResolvedValueOnce({ rows: [{ weekly_voice: '3', monthly_voice: '10' }] });     // voice memos

      const result = await getTimeSavedMetrics('personal');

      expect(result.weeklyHoursSaved).toBeGreaterThan(0);
      expect(result.monthlyHoursSaved).toBeGreaterThan(result.weeklyHoursSaved);
      expect(result.breakdown.draftsAccepted.count).toBe(5);
      expect(result.breakdown.aiSearches.count).toBe(30);
      expect(result.breakdown.autoCategories.count).toBe(10);
      expect(result.breakdown.voiceMemos.count).toBe(3);
    });

    it('should calculate correct time estimates', async () => {
      // 2 drafts * 15min = 30min = 0.5h
      // 10 searches * 3min = 30min = 0.5h
      // 0 auto + 0 voice = 0
      // Total = 1.0h
      mockQueryContext
        .mockResolvedValueOnce({ rows: [{ weekly_drafts: '2', monthly_drafts: '2' }] })
        .mockResolvedValueOnce({ rows: [{ weekly_searches: '10', monthly_searches: '10' }] })
        .mockResolvedValueOnce({ rows: [{ weekly_auto: '0', monthly_auto: '0' }] })
        .mockResolvedValueOnce({ rows: [{ weekly_voice: '0', monthly_voice: '0' }] });

      const result = await getTimeSavedMetrics('personal');

      expect(result.weeklyHoursSaved).toBe(1);
      expect(result.breakdown.draftsAccepted.hoursSaved).toBe(0.5);
      expect(result.breakdown.aiSearches.hoursSaved).toBe(0.5);
    });

    it('should handle zero activity gracefully', async () => {
      mockQueryContext
        .mockResolvedValueOnce({ rows: [{ weekly_drafts: '0', monthly_drafts: '0' }] })
        .mockResolvedValueOnce({ rows: [{ weekly_searches: '0', monthly_searches: '0' }] })
        .mockResolvedValueOnce({ rows: [{ weekly_auto: '0', monthly_auto: '0' }] })
        .mockResolvedValueOnce({ rows: [{ weekly_voice: '0', monthly_voice: '0' }] });

      const result = await getTimeSavedMetrics('personal');

      expect(result.weeklyHoursSaved).toBe(0);
      expect(result.monthlyHoursSaved).toBe(0);
    });

    it('should return defaults on database error', async () => {
      mockQueryContext.mockRejectedValue(new Error('DB error'));

      const result = await getTimeSavedMetrics('personal');

      expect(result.weeklyHoursSaved).toBe(0);
      expect(result.monthlyHoursSaved).toBe(0);
      expect(result.breakdown.draftsAccepted.count).toBe(0);
    });
  });

  // ========================================
  // getActivityHeatmap
  // ========================================
  describe('getActivityHeatmap', () => {
    it('should build 7x24 grid from query results', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [
          { day_of_week: '1', hour_of_day: '9', count: '5' },  // Monday 9am
          { day_of_week: '1', hour_of_day: '14', count: '3' }, // Monday 2pm
          { day_of_week: '3', hour_of_day: '10', count: '8' }, // Wednesday 10am
        ],
      });

      const result = await getActivityHeatmap('personal');

      expect(result.grid).toHaveLength(7);
      expect(result.grid[0]).toHaveLength(24);
      expect(result.grid[1][9]).toBe(5);
      expect(result.grid[1][14]).toBe(3);
      expect(result.grid[3][10]).toBe(8);
      expect(result.totalDataPoints).toBe(16);
    });

    it('should identify peak activity', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [
          { day_of_week: '2', hour_of_day: '10', count: '12' },
          { day_of_week: '4', hour_of_day: '15', count: '3' },
        ],
      });

      const result = await getActivityHeatmap('personal');

      expect(result.peak.day).toBe(2);
      expect(result.peak.hour).toBe(10);
      expect(result.peak.count).toBe(12);
    });

    it('should return empty grid on error', async () => {
      mockQueryContext.mockRejectedValue(new Error('DB error'));

      const result = await getActivityHeatmap('work');

      expect(result.grid).toHaveLength(7);
      expect(result.totalDataPoints).toBe(0);
      expect(result.peak.count).toBe(0);
    });

    it('should include German day labels', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] });

      const result = await getActivityHeatmap('personal');

      expect(result.dayLabels).toEqual(['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']);
    });
  });

  // ========================================
  // getKnowledgeGrowth
  // ========================================
  describe('getKnowledgeGrowth', () => {
    it('should aggregate all knowledge metrics', async () => {
      mockQueryContext
        .mockResolvedValueOnce({ rows: [{ total: '150' }] })       // ideas
        .mockResolvedValueOnce({ rows: [{ total: '45' }] })        // connections
        .mockResolvedValueOnce({ rows: [{ total: '12' }] })        // topics
        .mockResolvedValueOnce({ rows: [{ ideas_30d: '30', ideas_7d: '8' }] }) // recent
        .mockResolvedValueOnce({ rows: [{ total: '15' }] });       // recent connections

      const result = await getKnowledgeGrowth('personal');

      expect(result.totalIdeas).toBe(150);
      expect(result.totalConnections).toBe(45);
      expect(result.totalTopics).toBe(12);
      expect(result.ideasLast30Days).toBe(30);
      expect(result.connectionsLast30Days).toBe(15);
      expect(result.weeklyGrowthRate).toBe(8);
    });

    it('should handle missing connections column gracefully', async () => {
      mockQueryContext
        .mockResolvedValueOnce({ rows: [{ total: '50' }] })
        .mockResolvedValueOnce({ rows: [{ total: '10' }] })
        .mockResolvedValueOnce({ rows: [{ total: '5' }] })
        .mockResolvedValueOnce({ rows: [{ ideas_30d: '10', ideas_7d: '3' }] })
        .mockRejectedValueOnce(new Error('column not found')); // connections query fails

      const result = await getKnowledgeGrowth('personal');

      expect(result.totalIdeas).toBe(50);
      expect(result.connectionsLast30Days).toBe(0); // Graceful fallback
    });

    it('should return zeros on complete failure', async () => {
      mockQueryContext.mockRejectedValue(new Error('DB error'));

      const result = await getKnowledgeGrowth('work');

      expect(result.totalIdeas).toBe(0);
      expect(result.totalConnections).toBe(0);
      expect(result.totalTopics).toBe(0);
    });
  });

  // ========================================
  // getStreakInfo
  // ========================================
  describe('getStreakInfo', () => {
    it('should calculate current streak correctly', async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const dates = [];
      for (let i = 0; i < 5; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        dates.push({ active_date: localDateStr(d) });
      }

      mockQueryContext.mockResolvedValueOnce({ rows: dates });

      const result = await getStreakInfo('personal');

      expect(result.currentStreak).toBe(5);
      expect(result.activeToday).toBe(true);
    });

    it('should detect active today', async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      mockQueryContext.mockResolvedValueOnce({
        rows: [{ active_date: localDateStr(today) }],
      });

      const result = await getStreakInfo('personal');

      expect(result.activeToday).toBe(true);
      expect(result.currentStreak).toBe(1);
    });

    it('should handle no activity', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] });

      const result = await getStreakInfo('personal');

      expect(result.currentStreak).toBe(0);
      expect(result.longestStreak).toBe(0);
      expect(result.lastActiveDate).toBeNull();
      expect(result.activeToday).toBe(false);
    });

    it('should calculate longest streak independently of current', async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Helper to get date N days ago
      const daysAgo = (n: number) => {
        const d = new Date(today);
        d.setDate(d.getDate() - n);
        return { active_date: localDateStr(d) };
      };

      // Current: 2 days (today + yesterday)
      // Gap: 2 days ago missing
      // Previous: 4 days in a row (3-6 days ago)
      const rows = [daysAgo(0), daysAgo(1), /* gap */ daysAgo(3), daysAgo(4), daysAgo(5), daysAgo(6)];

      mockQueryContext.mockResolvedValueOnce({ rows });

      const result = await getStreakInfo('personal');

      expect(result.currentStreak).toBe(2);
      expect(result.longestStreak).toBe(4);
    });

    it('should return defaults on error', async () => {
      mockQueryContext.mockRejectedValue(new Error('DB error'));

      const result = await getStreakInfo('personal');

      expect(result.currentStreak).toBe(0);
      expect(result.activeToday).toBe(false);
    });
  });

  // ========================================
  // getWeeklyReport
  // ========================================
  describe('getWeeklyReport', () => {
    it('should generate a report with trends', async () => {
      mockQueryContext
        .mockResolvedValueOnce({ rows: [{ this_week: '10', last_week: '5' }] })  // ideas
        .mockResolvedValueOnce({ rows: [{ count: '25' }] })                       // chat
        .mockResolvedValueOnce({ rows: [{ name: 'KI' }, { name: 'Marketing' }] }); // topics

      const result = await getWeeklyReport('personal');

      expect(result.ideasCreated).toBe(10);
      expect(result.chatMessages).toBe(25);
      expect(result.trend).toBe('improving');
      expect(result.trendPercentage).toBe(100); // 100% increase
      expect(result.topTopics).toEqual(['KI', 'Marketing']);
      expect(result.insight).toContain('100%');
    });

    it('should detect declining trend', async () => {
      mockQueryContext
        .mockResolvedValueOnce({ rows: [{ this_week: '3', last_week: '10' }] })
        .mockResolvedValueOnce({ rows: [{ count: '5' }] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await getWeeklyReport('personal');

      expect(result.trend).toBe('declining');
      expect(result.trendPercentage).toBe(-70);
    });

    it('should detect stable trend', async () => {
      mockQueryContext
        .mockResolvedValueOnce({ rows: [{ this_week: '10', last_week: '10' }] })
        .mockResolvedValueOnce({ rows: [{ count: '20' }] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await getWeeklyReport('personal');

      expect(result.trend).toBe('stable');
      expect(result.trendPercentage).toBe(0);
    });

    it('should handle zero last week (new user)', async () => {
      mockQueryContext
        .mockResolvedValueOnce({ rows: [{ this_week: '5', last_week: '0' }] })
        .mockResolvedValueOnce({ rows: [{ count: '10' }] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await getWeeklyReport('personal');

      expect(result.trend).toBe('improving');
      expect(result.trendPercentage).toBe(100);
    });

    it('should have valid period dates', async () => {
      mockQueryContext
        .mockResolvedValueOnce({ rows: [{ this_week: '0', last_week: '0' }] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await getWeeklyReport('personal');

      expect(result.period.start).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(result.period.end).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('should return defaults on error', async () => {
      mockQueryContext.mockRejectedValue(new Error('DB error'));

      const result = await getWeeklyReport('work');

      expect(result.ideasCreated).toBe(0);
      expect(result.trend).toBe('stable');
      expect(result.insight).toBe('Report konnte nicht erstellt werden.');
    });
  });

  // ========================================
  // getProductivityDashboard
  // ========================================
  describe('getProductivityDashboard', () => {
    it('should return all 5 metric sections', async () => {
      // Promise.all runs 5 functions in parallel, so mock ordering is unpredictable.
      // Use a generic default that returns empty/zero rows for all queries.
      mockQueryContext.mockResolvedValue({ rows: [{
        total: '0', count: '0',
        weekly_drafts: '0', monthly_drafts: '0',
        weekly_searches: '0', monthly_searches: '0',
        weekly_auto: '0', monthly_auto: '0',
        weekly_voice: '0', monthly_voice: '0',
        ideas_30d: '0', ideas_7d: '0',
        this_week: '0', last_week: '0',
        name: 'test',
      }] });

      const result = await getProductivityDashboard('personal');

      expect(result).toHaveProperty('timeSaved');
      expect(result).toHaveProperty('heatmap');
      expect(result).toHaveProperty('knowledgeGrowth');
      expect(result).toHaveProperty('streak');
      expect(result).toHaveProperty('weeklyReport');
      expect(result.timeSaved).toHaveProperty('weeklyHoursSaved');
      expect(result.heatmap).toHaveProperty('grid');
      expect(result.streak).toHaveProperty('currentStreak');
      expect(result.weeklyReport).toHaveProperty('trend');
    });
  });
});
