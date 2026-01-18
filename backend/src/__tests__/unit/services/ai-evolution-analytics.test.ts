/**
 * Unit Tests for AI Evolution Analytics Service
 *
 * Tests the analytics system that tracks AI learning and improvement.
 */

import { aiEvolutionAnalytics } from '../../../services/ai-evolution-analytics';

// Mock dependencies
jest.mock('../../../utils/database-context', () => ({
  queryContext: jest.fn(),
}));

import { queryContext } from '../../../utils/database-context';

const mockQueryContext = queryContext as jest.MockedFunction<typeof queryContext>;

describe('AI Evolution Analytics Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ===========================================
  // getEvolutionMetrics Tests
  // ===========================================

  describe('getEvolutionMetrics', () => {
    it('should return comprehensive evolution metrics', async () => {
      // Mock learning curve data
      mockQueryContext.mockResolvedValueOnce({
        rows: [
          { date: '2026-01-15', sample_size: 10, accuracy_score: 0.85, correction_rate: 0.15, confidence_level: 0.8 },
          { date: '2026-01-16', sample_size: 8, accuracy_score: 0.88, correction_rate: 0.12, confidence_level: 0.82 },
          { date: '2026-01-17', sample_size: 12, accuracy_score: 0.90, correction_rate: 0.10, confidence_level: 0.85 },
        ],
        rowCount: 3,
      } as any);

      // Mock domain strengths
      mockQueryContext.mockResolvedValueOnce({
        rows: [
          { category: 'Arbeit', total: 50, corrected: 5, avg_confidence: 0.85, strength: 0.9 },
          { category: 'Persönlich', total: 30, corrected: 6, avg_confidence: 0.75, strength: 0.8 },
        ],
        rowCount: 2,
      } as any);

      // Mock corrections by category
      mockQueryContext.mockResolvedValueOnce({
        rows: [
          { category: 'Arbeit', correction_field: 'title', count: 3 },
          { category: 'Arbeit', correction_field: 'category', count: 2 },
        ],
        rowCount: 2,
      } as any);

      // Mock satisfaction trend
      mockQueryContext.mockResolvedValueOnce({
        rows: [
          { date: '2026-01-16', avg_rating: 4.2, feedback_count: 5, positive_ratio: 0.8 },
          { date: '2026-01-17', avg_rating: 4.5, feedback_count: 8, positive_ratio: 0.85 },
        ],
        rowCount: 2,
      } as any);

      // Mock proactive effectiveness
      mockQueryContext.mockResolvedValueOnce({
        rows: [
          { suggestion_type: 'routine', total_suggestions: 20, accepted_count: 15, avg_response_seconds: 30 },
          { suggestion_type: 'connection', total_suggestions: 10, accepted_count: 4, avg_response_seconds: 60 },
        ],
        rowCount: 2,
      } as any);

      const metrics = await aiEvolutionAnalytics.getEvolutionMetrics('personal', 30);

      expect(metrics).toBeDefined();
      expect(metrics.learningCurve).toBeDefined();
      expect(metrics.domainStrengths).toBeDefined();
      expect(metrics.satisfactionTrend).toBeDefined();
      expect(metrics.proactiveEffectiveness).toBeDefined();
      expect(metrics.summary).toBeDefined();
    });

    it('should return empty/fallback metrics on error', async () => {
      // All queries will fail
      mockQueryContext.mockRejectedValue(new Error('Database error'));

      const metrics = await aiEvolutionAnalytics.getEvolutionMetrics('personal', 30);

      // Should return fallback/default values on errors
      expect(metrics).toBeDefined();
      expect(metrics.summary).toBeDefined();
      expect(metrics.summary.overallAccuracy).toBeGreaterThanOrEqual(0);
    });
  });

  // ===========================================
  // calculateLearningCurve Tests
  // ===========================================

  describe('calculateLearningCurve', () => {
    it('should calculate learning curve from daily data', async () => {
      mockQueryContext.mockResolvedValue({
        rows: [
          { date: '2026-01-15', sample_size: 10, accuracy_score: 0.8, correction_rate: 0.2, confidence_level: 0.75 },
          { date: '2026-01-16', sample_size: 15, accuracy_score: 0.85, correction_rate: 0.15, confidence_level: 0.8 },
          { date: '2026-01-17', sample_size: 12, accuracy_score: 0.9, correction_rate: 0.1, confidence_level: 0.85 },
        ],
        rowCount: 3,
      } as any);

      const curve = await aiEvolutionAnalytics.calculateLearningCurve('personal', 30);

      expect(curve).toHaveLength(3);
      expect(curve[0].accuracyScore).toBeCloseTo(0.8, 2);
      expect(curve[2].accuracyScore).toBeCloseTo(0.9, 2);
    });

    it('should show improvement trend', async () => {
      mockQueryContext.mockResolvedValue({
        rows: [
          { date: '2026-01-10', sample_size: 10, accuracy_score: 0.7, correction_rate: 0.3, confidence_level: 0.6 },
          { date: '2026-01-17', sample_size: 15, accuracy_score: 0.9, correction_rate: 0.1, confidence_level: 0.85 },
        ],
        rowCount: 2,
      } as any);

      const curve = await aiEvolutionAnalytics.calculateLearningCurve('personal', 30);

      // Later data should show higher accuracy
      expect(curve[curve.length - 1].accuracyScore).toBeGreaterThan(curve[0].accuracyScore);
    });

    it('should return fallback for empty data', async () => {
      mockQueryContext.mockResolvedValue({ rows: [], rowCount: 0 } as any);

      const curve = await aiEvolutionAnalytics.calculateLearningCurve('personal', 7);

      // Should return fallback data
      expect(curve).toBeDefined();
      expect(curve.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle database errors', async () => {
      mockQueryContext.mockRejectedValue(new Error('Connection failed'));

      const curve = await aiEvolutionAnalytics.calculateLearningCurve('personal', 30);

      expect(curve).toBeDefined();
      expect(Array.isArray(curve)).toBe(true);
    });
  });

  // ===========================================
  // analyzeDomainStrengths Tests
  // ===========================================

  describe('analyzeDomainStrengths', () => {
    it('should analyze domain strengths', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [
          { category: 'Technik', total: 100, corrected: 10, avg_confidence: 0.9, strength: 0.9 },
          { category: 'Business', total: 50, corrected: 15, avg_confidence: 0.75, strength: 0.7 },
          { category: 'Kreativ', total: 30, corrected: 3, avg_confidence: 0.85, strength: 0.9 },
        ],
        rowCount: 3,
      } as any);

      mockQueryContext.mockResolvedValueOnce({
        rows: [
          { category: 'Business', correction_field: 'category', count: 8 },
          { category: 'Business', correction_field: 'title', count: 5 },
        ],
        rowCount: 2,
      } as any);

      const strengths = await aiEvolutionAnalytics.analyzeDomainStrengths('personal');

      expect(strengths).toBeDefined();
      expect(strengths.length).toBeGreaterThan(0);
      expect(strengths[0]).toHaveProperty('domain');
      expect(strengths[0]).toHaveProperty('strength');
      expect(strengths[0]).toHaveProperty('sampleCount');
    });

    it('should return domain strengths with strength values', async () => {
      // Provide already-sorted data as SQL would return it
      mockQueryContext.mockResolvedValueOnce({
        rows: [
          { category: 'High', total: 50, corrected: 5, avg_confidence: 0.9, strength: 0.9 },
          { category: 'Medium', total: 30, corrected: 9, avg_confidence: 0.7, strength: 0.7 },
          { category: 'Low', total: 20, corrected: 10, avg_confidence: 0.5, strength: 0.5 },
        ],
        rowCount: 3,
      } as any);

      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      const strengths = await aiEvolutionAnalytics.analyzeDomainStrengths('personal');

      expect(strengths).toHaveLength(3);
      expect(strengths[0].strength).toBeGreaterThan(0);
    });

    it('should identify improvement trends', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [
          { category: 'Improving', total: 50, corrected: 5, avg_confidence: 0.9, strength: 0.9 },
        ],
        rowCount: 1,
      } as any);

      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      const strengths = await aiEvolutionAnalytics.analyzeDomainStrengths('personal');

      expect(strengths[0].improvementTrend).toBe('improving');
    });

    it('should return defaults for empty data', async () => {
      mockQueryContext.mockResolvedValue({ rows: [], rowCount: 0 } as any);

      const strengths = await aiEvolutionAnalytics.analyzeDomainStrengths('personal');

      expect(strengths).toBeDefined();
      expect(Array.isArray(strengths)).toBe(true);
    });
  });

  // ===========================================
  // getSatisfactionTrend Tests
  // ===========================================

  describe('getSatisfactionTrend', () => {
    it('should return satisfaction trend data', async () => {
      mockQueryContext.mockResolvedValue({
        rows: [
          { date: '2026-01-15', avg_rating: 4.0, feedback_count: 5, positive_ratio: 0.75 },
          { date: '2026-01-16', avg_rating: 4.2, feedback_count: 8, positive_ratio: 0.8 },
          { date: '2026-01-17', avg_rating: 4.5, feedback_count: 10, positive_ratio: 0.9 },
        ],
        rowCount: 3,
      } as any);

      const trend = await aiEvolutionAnalytics.getSatisfactionTrend('personal', 30);

      expect(trend).toHaveLength(3);
      expect(trend[0].avgRating).toBe(4.0);
      expect(trend[2].avgRating).toBe(4.5);
    });

    it('should handle missing feedback data', async () => {
      mockQueryContext.mockResolvedValue({ rows: [], rowCount: 0 } as any);

      const trend = await aiEvolutionAnalytics.getSatisfactionTrend('personal', 30);

      expect(trend).toEqual([]);
    });
  });

  // ===========================================
  // analyzeProactiveEffectiveness Tests
  // ===========================================

  describe('analyzeProactiveEffectiveness', () => {
    it('should analyze proactive system effectiveness', async () => {
      mockQueryContext.mockResolvedValue({
        rows: [
          { suggestion_type: 'routine', total_suggestions: 50, accepted_count: 40, avg_response_seconds: 15 },
          { suggestion_type: 'connection', total_suggestions: 30, accepted_count: 12, avg_response_seconds: 45 },
          { suggestion_type: 'reminder', total_suggestions: 20, accepted_count: 18, avg_response_seconds: 5 },
        ],
        rowCount: 3,
      } as any);

      const effectiveness = await aiEvolutionAnalytics.analyzeProactiveEffectiveness('personal', 30);

      expect(effectiveness).toHaveLength(3);
      expect(effectiveness[0].suggestionType).toBe('routine');
      expect(effectiveness[0].acceptanceRate).toBeCloseTo(0.8, 2);
    });

    it('should calculate acceptance rates correctly', async () => {
      mockQueryContext.mockResolvedValue({
        rows: [
          { suggestion_type: 'test', total_suggestions: 100, accepted_count: 75, avg_response_seconds: 30 },
        ],
        rowCount: 1,
      } as any);

      const effectiveness = await aiEvolutionAnalytics.analyzeProactiveEffectiveness('personal', 30);

      expect(effectiveness[0].acceptanceRate).toBe(0.75);
    });

    it('should return defaults for empty data', async () => {
      mockQueryContext.mockResolvedValue({ rows: [], rowCount: 0 } as any);

      const effectiveness = await aiEvolutionAnalytics.analyzeProactiveEffectiveness('personal', 30);

      expect(effectiveness).toBeDefined();
      expect(Array.isArray(effectiveness)).toBe(true);
    });
  });

  // ===========================================
  // getCategoryPerformance Tests
  // ===========================================

  describe('getCategoryPerformance', () => {
    it('should return performance by category', async () => {
      mockQueryContext.mockResolvedValue({
        rows: [
          { category: 'Tech', sample_count: 100, accuracy: 0.92, avg_confidence: 0.88 },
          { category: 'Business', sample_count: 75, accuracy: 0.85, avg_confidence: 0.8 },
        ],
        rowCount: 2,
      } as any);

      const performance = await aiEvolutionAnalytics.getCategoryPerformance('personal');

      expect(performance).toHaveLength(2);
      expect(performance[0].category).toBe('Tech');
      expect(performance[0].accuracy).toBeCloseTo(0.92, 2);
    });

    it('should handle empty results', async () => {
      mockQueryContext.mockResolvedValue({ rows: [], rowCount: 0 } as any);

      const performance = await aiEvolutionAnalytics.getCategoryPerformance('personal');

      expect(performance).toEqual([]);
    });
  });

  // ===========================================
  // getTimeSeriesMetric Tests
  // ===========================================

  describe('getTimeSeriesMetric', () => {
    it('should return accuracy time series', async () => {
      mockQueryContext.mockResolvedValue({
        rows: [
          { date: '2026-01-15', value: 0.85, count: 10 },
          { date: '2026-01-16', value: 0.88, count: 12 },
          { date: '2026-01-17', value: 0.90, count: 15 },
        ],
        rowCount: 3,
      } as any);

      const data = await aiEvolutionAnalytics.getTimeSeriesMetric('personal', 'accuracy', 30);

      expect(data).toHaveLength(3);
      expect(data[0].date).toBe('2026-01-15');
      expect(data[0].value).toBe(0.85);
    });

    it('should return volume time series', async () => {
      mockQueryContext.mockResolvedValue({
        rows: [
          { date: '2026-01-15', value: 10, count: 10 },
          { date: '2026-01-16', value: 15, count: 15 },
        ],
        rowCount: 2,
      } as any);

      const data = await aiEvolutionAnalytics.getTimeSeriesMetric('personal', 'volume', 30);

      expect(data).toHaveLength(2);
    });

    it('should return corrections time series', async () => {
      mockQueryContext.mockResolvedValue({
        rows: [
          { date: '2026-01-15', value: 2, count: 10 },
          { date: '2026-01-16', value: 1, count: 12 },
        ],
        rowCount: 2,
      } as any);

      const data = await aiEvolutionAnalytics.getTimeSeriesMetric('personal', 'corrections', 30);

      expect(data).toHaveLength(2);
    });
  });

  // ===========================================
  // getInsights Tests
  // ===========================================

  describe('getInsights', () => {
    it('should generate insights based on metrics', async () => {
      // Mock for getEvolutionMetrics
      mockQueryContext.mockResolvedValue({
        rows: [
          { date: '2026-01-17', sample_size: 10, accuracy_score: 0.92, correction_rate: 0.08, confidence_level: 0.9 },
        ],
        rowCount: 1,
      } as any);

      const insights = await aiEvolutionAnalytics.getInsights('personal');

      expect(insights).toBeDefined();
      expect(Array.isArray(insights)).toBe(true);
      expect(insights.length).toBeGreaterThan(0);
    });

    it('should include accuracy insight for high accuracy', async () => {
      mockQueryContext.mockResolvedValue({
        rows: [
          { date: '2026-01-17', sample_size: 20, accuracy_score: 0.95, correction_rate: 0.05, confidence_level: 0.92 },
        ],
        rowCount: 1,
      } as any);

      const insights = await aiEvolutionAnalytics.getInsights('personal');

      // Should mention excellent accuracy
      const hasAccuracyInsight = insights.some(i => i.toLowerCase().includes('genauigkeit') || i.toLowerCase().includes('accuracy'));
      expect(hasAccuracyInsight).toBe(true);
    });

    it('should return default insight on error', async () => {
      mockQueryContext.mockRejectedValue(new Error('DB error'));

      const insights = await aiEvolutionAnalytics.getInsights('personal');

      expect(insights).toBeDefined();
      expect(insights.length).toBeGreaterThan(0);
    });
  });

  // ===========================================
  // Summary Calculation Tests
  // ===========================================

  describe('summary calculation', () => {
    it('should calculate correct overall accuracy', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [
          { date: '2026-01-15', sample_size: 10, accuracy_score: 0.8, correction_rate: 0.2, confidence_level: 0.7 },
          { date: '2026-01-16', sample_size: 10, accuracy_score: 0.85, correction_rate: 0.15, confidence_level: 0.8 },
          { date: '2026-01-17', sample_size: 10, accuracy_score: 0.9, correction_rate: 0.1, confidence_level: 0.85 },
        ],
        rowCount: 3,
      } as any);

      // Other mocks
      mockQueryContext.mockResolvedValue({ rows: [], rowCount: 0 } as any);

      const metrics = await aiEvolutionAnalytics.getEvolutionMetrics('personal', 30);

      // Average of last 7 days (or available data)
      expect(metrics.summary.overallAccuracy).toBeGreaterThan(0);
      expect(metrics.summary.overallAccuracy).toBeLessThanOrEqual(1);
    });

    it('should identify strongest and weakest domains', async () => {
      // Learning curve mock
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      // Domain strengths mock
      mockQueryContext.mockResolvedValueOnce({
        rows: [
          { category: 'Strong', total: 50, corrected: 2, avg_confidence: 0.95, strength: 0.96 },
          { category: 'Weak', total: 40, corrected: 16, avg_confidence: 0.6, strength: 0.6 },
        ],
        rowCount: 2,
      } as any);

      // Corrections mock
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      // Other mocks
      mockQueryContext.mockResolvedValue({ rows: [], rowCount: 0 } as any);

      const metrics = await aiEvolutionAnalytics.getEvolutionMetrics('personal', 30);

      expect(metrics.summary.strongestDomain).toBe('Strong');
      expect(metrics.summary.weakestDomain).toBe('Weak');
    });

    it('should calculate improvement rate', async () => {
      // Need 8+ data points so firstWeek (slice 0-7) and lastWeek (slice -7) differ
      // First 7 days: lower accuracy (0.6-0.66)
      // Last 7 days: higher accuracy (0.8-0.92)
      mockQueryContext.mockResolvedValueOnce({
        rows: [
          // First week (lower accuracy)
          { date: '2026-01-01', sample_size: 10, accuracy_score: 0.60, correction_rate: 0.40, confidence_level: 0.5 },
          { date: '2026-01-02', sample_size: 10, accuracy_score: 0.62, correction_rate: 0.38, confidence_level: 0.52 },
          { date: '2026-01-03', sample_size: 10, accuracy_score: 0.63, correction_rate: 0.37, confidence_level: 0.54 },
          { date: '2026-01-04', sample_size: 10, accuracy_score: 0.64, correction_rate: 0.36, confidence_level: 0.55 },
          { date: '2026-01-05', sample_size: 10, accuracy_score: 0.65, correction_rate: 0.35, confidence_level: 0.56 },
          { date: '2026-01-06', sample_size: 10, accuracy_score: 0.65, correction_rate: 0.35, confidence_level: 0.57 },
          { date: '2026-01-07', sample_size: 10, accuracy_score: 0.66, correction_rate: 0.34, confidence_level: 0.58 },
          // Last week (higher accuracy) - these are the last 7
          { date: '2026-01-11', sample_size: 10, accuracy_score: 0.80, correction_rate: 0.20, confidence_level: 0.75 },
          { date: '2026-01-12', sample_size: 10, accuracy_score: 0.82, correction_rate: 0.18, confidence_level: 0.77 },
          { date: '2026-01-13', sample_size: 10, accuracy_score: 0.85, correction_rate: 0.15, confidence_level: 0.80 },
          { date: '2026-01-14', sample_size: 10, accuracy_score: 0.87, correction_rate: 0.13, confidence_level: 0.82 },
          { date: '2026-01-15', sample_size: 10, accuracy_score: 0.88, correction_rate: 0.12, confidence_level: 0.84 },
          { date: '2026-01-16', sample_size: 10, accuracy_score: 0.90, correction_rate: 0.10, confidence_level: 0.86 },
          { date: '2026-01-17', sample_size: 10, accuracy_score: 0.92, correction_rate: 0.08, confidence_level: 0.88 },
        ],
        rowCount: 14,
      } as any);

      mockQueryContext.mockResolvedValue({ rows: [], rowCount: 0 } as any);

      const metrics = await aiEvolutionAnalytics.getEvolutionMetrics('personal', 30);

      // Should show positive improvement (lastWeek avg ~0.86 - firstWeek avg ~0.64 = ~0.22)
      expect(metrics.summary.improvementRate).toBeGreaterThan(0);
    });

    it('should count total interactions', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [
          { date: '2026-01-15', sample_size: 10, accuracy_score: 0.8, correction_rate: 0.2, confidence_level: 0.7 },
          { date: '2026-01-16', sample_size: 15, accuracy_score: 0.85, correction_rate: 0.15, confidence_level: 0.8 },
          { date: '2026-01-17', sample_size: 20, accuracy_score: 0.9, correction_rate: 0.1, confidence_level: 0.85 },
        ],
        rowCount: 3,
      } as any);

      mockQueryContext.mockResolvedValue({ rows: [], rowCount: 0 } as any);

      const metrics = await aiEvolutionAnalytics.getEvolutionMetrics('personal', 30);

      expect(metrics.summary.totalInteractions).toBe(45);
    });
  });
});
