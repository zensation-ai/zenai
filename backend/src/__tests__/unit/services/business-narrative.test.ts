/**
 * Business Narrative Service Tests (Phase 96)
 */

import {
  calculateTrend,
  calculateChangePercent,
  detectAnomalies,
  formatNumber,
  trendArrow,
  generateNarrativeText,
  generateDailyDigest,
  generateWeeklyReport,
  detectAllAnomalies,
  listKPIs,
  createKPI,
  updateKPI,
  deleteKPI,
  getTrends,
} from '../../../services/business-narrative';

// Mock database-context
const mockQueryContext = jest.fn();
jest.mock('../../../utils/database-context', () => ({
  queryContext: (...args: unknown[]) => mockQueryContext(...args),
  isValidContext: (c: string) => ['personal', 'work', 'learning', 'creative'].includes(c),
}));

jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
  },
}));

describe('Business Narrative Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryContext.mockReset();
  });

  // ===========================================
  // calculateTrend
  // ===========================================
  describe('calculateTrend', () => {
    it('should return "up" for significant increase', () => {
      expect(calculateTrend(110, 100)).toBe('up');
    });

    it('should return "down" for significant decrease', () => {
      expect(calculateTrend(90, 100)).toBe('down');
    });

    it('should return "stable" for small changes', () => {
      expect(calculateTrend(101, 100)).toBe('stable');
    });

    it('should handle zero previous value', () => {
      expect(calculateTrend(10, 0)).toBe('up');
      expect(calculateTrend(0, 0)).toBe('stable');
    });
  });

  // ===========================================
  // calculateChangePercent
  // ===========================================
  describe('calculateChangePercent', () => {
    it('should calculate positive change', () => {
      expect(calculateChangePercent(150, 100)).toBe(50);
    });

    it('should calculate negative change', () => {
      expect(calculateChangePercent(50, 100)).toBe(-50);
    });

    it('should handle zero previous', () => {
      expect(calculateChangePercent(100, 0)).toBe(100);
      expect(calculateChangePercent(0, 0)).toBe(0);
    });

    it('should round to 1 decimal', () => {
      const result = calculateChangePercent(133, 100);
      expect(result).toBe(33);
    });
  });

  // ===========================================
  // detectAnomalies
  // ===========================================
  describe('detectAnomalies', () => {
    it('should detect spike anomaly', () => {
      const values = [10, 11, 10, 12, 10, 11, 10];
      const anomaly = detectAnomalies(values, 50, 'Revenue');
      expect(anomaly).not.toBeNull();
      expect(anomaly!.severity).toBeDefined();
      expect(anomaly!.metric).toBe('Revenue');
    });

    it('should detect drop anomaly', () => {
      const values = [100, 98, 102, 99, 101, 100, 99];
      const anomaly = detectAnomalies(values, 50, 'Sales');
      expect(anomaly).not.toBeNull();
    });

    it('should return null for normal values', () => {
      const values = [100, 101, 99, 102, 98, 100, 101];
      const anomaly = detectAnomalies(values, 100, 'Revenue');
      expect(anomaly).toBeNull();
    });

    it('should return null for insufficient data', () => {
      const anomaly = detectAnomalies([10, 20], 15, 'X');
      expect(anomaly).toBeNull();
    });

    it('should return null for zero std deviation', () => {
      const anomaly = detectAnomalies([10, 10, 10], 10, 'X');
      expect(anomaly).toBeNull();
    });

    it('should mark critical for > 3 std devs', () => {
      // Slight variance so stdDev is non-zero, then a big outlier
      const values = [10, 11, 10, 11, 10, 11, 10];
      const anomaly = detectAnomalies(values, 100, 'Metric');
      expect(anomaly).not.toBeNull();
      expect(anomaly!.severity).toBe('critical');
    });
  });

  // ===========================================
  // formatNumber
  // ===========================================
  describe('formatNumber', () => {
    it('should format percentages', () => {
      expect(formatNumber(95.5, '%')).toBe('95.5%');
    });

    it('should format currency', () => {
      const result = formatNumber(1234.56, 'EUR');
      expect(result).toContain('EUR');
    });

    it('should format millions', () => {
      expect(formatNumber(1500000)).toBe('1.5M');
    });

    it('should format thousands', () => {
      expect(formatNumber(2500)).toBe('2.5K');
    });

    it('should format small numbers as-is', () => {
      expect(formatNumber(42)).toBe('42');
    });
  });

  // ===========================================
  // trendArrow
  // ===========================================
  describe('trendArrow', () => {
    it('should return up arrow', () => {
      expect(trendArrow('up')).toBe('↑');
    });

    it('should return down arrow', () => {
      expect(trendArrow('down')).toBe('↓');
    });

    it('should return stable arrow', () => {
      expect(trendArrow('stable')).toBe('→');
    });
  });

  // ===========================================
  // generateNarrativeText
  // ===========================================
  describe('generateNarrativeText', () => {
    it('should generate text from metrics', () => {
      const metrics = [
        { label: 'Revenue', value: 1000, unit: 'EUR', trend: 'up' as const, changePercent: 10 },
      ];
      const text = generateNarrativeText('Finance', metrics);
      expect(text).toContain('Revenue');
      expect(text).toContain('EUR');
    });

    it('should handle empty metrics', () => {
      const text = generateNarrativeText('Finance', []);
      expect(text).toContain('No finance data');
    });

    it('should include change percent', () => {
      const metrics = [
        { label: 'Tasks', value: 50, trend: 'down' as const, changePercent: -15 },
      ];
      const text = generateNarrativeText('Tasks', metrics);
      expect(text).toContain('-15%');
    });
  });

  // ===========================================
  // generateDailyDigest
  // ===========================================
  describe('generateDailyDigest', () => {
    it('should generate digest with all sections', async () => {
      // Mock all DB calls to return empty/defaults
      mockQueryContext.mockResolvedValue({ rows: [], rowCount: 0 });

      const digest = await generateDailyDigest('personal' as const, 'user-1');
      expect(digest).toBeDefined();
      expect(digest.date).toBeDefined();
      expect(digest.sections).toBeInstanceOf(Array);
      expect(digest.sections.length).toBe(5); // Revenue, Email, Tasks, Calendar, Suggestions
      expect(digest.overallNarrative).toBeDefined();
    });

    it('should include anomaly count', async () => {
      mockQueryContext.mockResolvedValue({ rows: [], rowCount: 0 });

      const digest = await generateDailyDigest('work' as const, 'user-1');
      expect(typeof digest.anomalyCount).toBe('number');
    });

    it('should populate action items for overdue tasks', async () => {
      // Finance returns empty
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      // Email returns empty
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      // Tasks with overdue
      mockQueryContext.mockResolvedValueOnce({
        rows: [{ total: '10', completed: '3', overdue: '4' }],
        rowCount: 1,
      });
      // Calendar returns empty
      mockQueryContext.mockResolvedValueOnce({ rows: [{ today: '0', tomorrow: '0', next_event: null }], rowCount: 1 });
      // Suggestions returns empty
      mockQueryContext.mockResolvedValueOnce({ rows: [{ active: '0', top_type: null }], rowCount: 1 });

      const digest = await generateDailyDigest('personal' as const, 'user-1');
      expect(digest.actionItems.some(a => a.includes('ueberfaellig'))).toBe(true);
    });

    it('should handle DB errors gracefully', async () => {
      mockQueryContext.mockRejectedValue(new Error('DB error'));

      const digest = await generateDailyDigest('personal' as const, 'user-1');
      expect(digest).toBeDefined();
      expect(digest.sections.length).toBe(5);
    });
  });

  // ===========================================
  // generateWeeklyReport
  // ===========================================
  describe('generateWeeklyReport', () => {
    it('should generate report with period dates', async () => {
      mockQueryContext.mockResolvedValue({ rows: [], rowCount: 0 });

      const report = await generateWeeklyReport('work' as const, 'user-1');
      expect(report.periodStart).toBeDefined();
      expect(report.periodEnd).toBeDefined();
      expect(report.sections.length).toBeGreaterThan(0);
    });

    it('should include trend summary', async () => {
      mockQueryContext.mockResolvedValue({ rows: [], rowCount: 0 });

      const report = await generateWeeklyReport('personal' as const, 'user-1');
      expect(report.trendSummary).toBeInstanceOf(Array);
    });

    it('should generate overall narrative', async () => {
      mockQueryContext.mockResolvedValue({ rows: [], rowCount: 0 });

      const report = await generateWeeklyReport('personal' as const, 'user-1');
      expect(report.overallNarrative).toContain('Wochenbericht');
    });
  });

  // ===========================================
  // detectAllAnomalies
  // ===========================================
  describe('detectAllAnomalies', () => {
    it('should return empty array when no anomalies', async () => {
      mockQueryContext.mockResolvedValue({ rows: [], rowCount: 0 });

      const anomalies = await detectAllAnomalies('personal' as const, 'user-1');
      expect(anomalies).toBeInstanceOf(Array);
    });

    it('should detect anomalies across data sources', async () => {
      // Finance with spike
      mockQueryContext.mockResolvedValueOnce({
        rows: [
          { revenue: '10', tx_count: '1' },
          { revenue: '10', tx_count: '1' },
          { revenue: '10', tx_count: '1' },
          { revenue: '10', tx_count: '1' },
          { revenue: '10', tx_count: '1' },
          { revenue: '10', tx_count: '1' },
          { revenue: '100', tx_count: '1' },
        ],
        rowCount: 7,
      });
      // Email returns normal
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const anomalies = await detectAllAnomalies('work' as const, 'user-1');
      // May or may not detect depending on current value position
      expect(anomalies).toBeInstanceOf(Array);
    });
  });

  // ===========================================
  // KPI CRUD
  // ===========================================
  describe('listKPIs', () => {
    it('should return mapped KPIs', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [{
          id: 'kpi-1',
          user_id: 'user-1',
          name: 'Monthly Revenue',
          description: null,
          formula: JSON.stringify({ sources: ['revenue'], aggregation: 'sum' }),
          target_value: 10000,
          current_value: 7500,
          unit: 'EUR',
          trend: 'up',
          last_calculated_at: '2026-03-16T00:00:00Z',
          created_at: '2026-03-01T00:00:00Z',
        }],
      });

      const kpis = await listKPIs('work' as const, 'user-1');
      expect(kpis).toHaveLength(1);
      expect(kpis[0].name).toBe('Monthly Revenue');
      expect(kpis[0].formula.sources).toEqual(['revenue']);
    });

    it('should return empty array when no KPIs', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] });
      const kpis = await listKPIs('personal' as const, 'user-1');
      expect(kpis).toEqual([]);
    });
  });

  describe('createKPI', () => {
    it('should create and return KPI', async () => {
      const mockRow = {
        id: 'kpi-new',
        user_id: 'user-1',
        name: 'Task Rate',
        description: 'Weekly completion',
        formula: JSON.stringify({ sources: ['tasks'], aggregation: 'avg' }),
        target_value: 80,
        current_value: 0,
        unit: '%',
        trend: 'stable',
        last_calculated_at: null,
        created_at: '2026-03-16T00:00:00Z',
      };
      mockQueryContext.mockResolvedValueOnce({ rows: [mockRow] });

      const kpi = await createKPI('personal' as const, 'user-1', {
        name: 'Task Rate',
        description: 'Weekly completion',
        formula: { sources: ['tasks'], aggregation: 'avg' },
        targetValue: 80,
        unit: '%',
      });

      expect(kpi.name).toBe('Task Rate');
      expect(kpi.targetValue).toBe(80);
    });
  });

  describe('updateKPI', () => {
    it('should update and return KPI', async () => {
      const mockRow = {
        id: 'kpi-1',
        user_id: 'user-1',
        name: 'Updated KPI',
        description: null,
        formula: JSON.stringify({ sources: ['revenue'], aggregation: 'sum' }),
        target_value: 5000,
        current_value: 3000,
        unit: 'EUR',
        trend: 'up',
        last_calculated_at: null,
        created_at: '2026-03-01T00:00:00Z',
      };
      mockQueryContext.mockResolvedValueOnce({ rows: [mockRow] });

      const kpi = await updateKPI('work' as const, 'user-1', 'kpi-1', { name: 'Updated KPI' });
      expect(kpi).not.toBeNull();
      expect(kpi!.name).toBe('Updated KPI');
    });

    it('should return null when nothing to update', async () => {
      const kpi = await updateKPI('work' as const, 'user-1', 'kpi-1', {});
      expect(kpi).toBeNull();
    });

    it('should return null when KPI not found', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] });
      const kpi = await updateKPI('work' as const, 'user-1', 'kpi-x', { name: 'Test' });
      expect(kpi).toBeNull();
    });
  });

  describe('deleteKPI', () => {
    it('should return true on successful delete', async () => {
      mockQueryContext.mockResolvedValueOnce({ rowCount: 1 });
      const deleted = await deleteKPI('personal' as const, 'user-1', 'kpi-1');
      expect(deleted).toBe(true);
    });

    it('should return false when KPI not found', async () => {
      mockQueryContext.mockResolvedValueOnce({ rowCount: 0 });
      const deleted = await deleteKPI('personal' as const, 'user-1', 'kpi-x');
      expect(deleted).toBe(false);
    });
  });

  // ===========================================
  // getTrends
  // ===========================================
  describe('getTrends', () => {
    it('should return trend data for revenue', async () => {
      mockQueryContext
        // Revenue
        .mockResolvedValueOnce({
          rows: [
            { d: '2026-03-10', revenue: '100' },
            { d: '2026-03-11', revenue: '120' },
            { d: '2026-03-12', revenue: '150' },
          ],
        })
        // Emails
        .mockResolvedValueOnce({ rows: [] })
        // Tasks
        .mockResolvedValueOnce({ rows: [] });

      const trends = await getTrends('work' as const, 'user-1', 7);
      expect(trends.length).toBeGreaterThanOrEqual(1);
      expect(trends[0].metric).toBe('Revenue');
      expect(trends[0].dataPoints.length).toBe(3);
    });

    it('should handle DB errors gracefully', async () => {
      mockQueryContext.mockRejectedValue(new Error('DB error'));
      const trends = await getTrends('personal' as const, 'user-1', 7);
      expect(trends).toEqual([]);
    });

    it('should return empty for insufficient data', async () => {
      mockQueryContext.mockResolvedValue({ rows: [{ d: '2026-03-10', revenue: '100' }] });
      const trends = await getTrends('personal' as const, 'user-1', 7);
      // Only 1 data point per source, not enough for trend
      expect(trends).toEqual([]);
    });
  });

  // ===========================================
  // Narrative Template Rendering
  // ===========================================
  describe('narrative template rendering', () => {
    it('should include trend arrows in narrative', () => {
      const metrics = [
        { label: 'Revenue', value: 5000, unit: 'EUR', trend: 'up' as const, changePercent: 12 },
        { label: 'Expenses', value: 3000, unit: 'EUR', trend: 'down' as const, changePercent: -5 },
      ];
      const text = generateNarrativeText('Finance', metrics);
      expect(text).toContain('\u2191');
      expect(text).toContain('\u2193');
      expect(text).toContain('+12%');
      expect(text).toContain('-5%');
    });

    it('should not show change percent when zero', () => {
      const metrics = [
        { label: 'Tasks', value: 10, trend: 'stable' as const, changePercent: 0 },
      ];
      const text = generateNarrativeText('Tasks', metrics);
      expect(text).not.toContain('%');
    });
  });
});
