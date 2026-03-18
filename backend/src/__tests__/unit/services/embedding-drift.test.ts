/**
 * Phase 99: Embedding Drift Detection Tests
 */

const mockQueryContext = jest.fn();
jest.mock('../../../utils/database-context', () => ({
  queryContext: (...args: unknown[]) => mockQueryContext(...args),
}));

import { calculateDrift, runDriftCheck } from '../../../services/embedding-drift';

describe('Embedding Drift Detection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryContext.mockReset();
  });

  describe('calculateDrift', () => {
    it('detects drift when average drops > 10%', () => {
      const baseline = [0.9, 0.85, 0.88, 0.92, 0.87];
      const current = [0.7, 0.65, 0.72, 0.68, 0.71];

      const result = calculateDrift(baseline, current);
      expect(result.driftDetected).toBe(true);
      expect(result.driftPercentage).toBeGreaterThan(10);
    });

    it('does not detect drift when scores are stable', () => {
      const baseline = [0.85, 0.82, 0.88, 0.84, 0.86];
      const current = [0.83, 0.81, 0.87, 0.82, 0.85];

      const result = calculateDrift(baseline, current);
      expect(result.driftDetected).toBe(false);
      expect(result.driftPercentage).toBeLessThan(10);
    });

    it('does not detect drift when scores improve', () => {
      const baseline = [0.7, 0.72, 0.68];
      const current = [0.85, 0.88, 0.82];

      const result = calculateDrift(baseline, current);
      expect(result.driftDetected).toBe(false);
      expect(result.driftPercentage).toBeLessThan(0);
    });

    it('returns no drift for empty arrays', () => {
      expect(calculateDrift([], [0.8])).toEqual({ driftDetected: false, driftPercentage: 0 });
      expect(calculateDrift([0.8], [])).toEqual({ driftDetected: false, driftPercentage: 0 });
      expect(calculateDrift([], [])).toEqual({ driftDetected: false, driftPercentage: 0 });
    });

    it('returns no drift when baseline average is zero', () => {
      const result = calculateDrift([0, 0, 0], [0.5, 0.6]);
      expect(result.driftDetected).toBe(false);
      expect(result.driftPercentage).toBe(0);
    });

    it('returns exact drift percentage', () => {
      // baseline avg = 1.0, current avg = 0.8 => 20% drift
      const result = calculateDrift([1.0], [0.8]);
      expect(result.driftDetected).toBe(true);
      expect(result.driftPercentage).toBe(20);
    });
  });

  describe('runDriftCheck', () => {
    it('returns no drift when insufficient history', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [{ query_text: 'test', top_score: 0.8, avg_score: 0.7 }],
      });

      const result = await runDriftCheck('personal');
      expect(result.driftDetected).toBe(false);
      expect(result.sampledQueries).toBe(1);
    });

    it('detects drift from query history', async () => {
      const rows = Array.from({ length: 10 }, (_, i) => ({
        query_text: `query-${i}`,
        top_score: 0.9, // baseline: high scores
        avg_score: 0.5, // current: much lower
      }));

      mockQueryContext.mockResolvedValueOnce({ rows });

      const result = await runDriftCheck('personal');
      expect(result.driftDetected).toBe(true);
      expect(result.sampledQueries).toBe(10);
      expect(result.driftPercentage).toBeGreaterThan(10);
    });

    it('handles DB error gracefully', async () => {
      mockQueryContext.mockRejectedValueOnce(new Error('Table not found'));

      const result = await runDriftCheck('personal');
      expect(result.driftDetected).toBe(false);
      expect(result.sampledQueries).toBe(0);
    });

    it('passes no drift when scores are consistent', async () => {
      const rows = Array.from({ length: 10 }, (_, i) => ({
        query_text: `query-${i}`,
        top_score: 0.85,
        avg_score: 0.80,
      }));

      mockQueryContext.mockResolvedValueOnce({ rows });

      const result = await runDriftCheck('work');
      expect(result.driftDetected).toBe(false);
      expect(result.context).toBe('work');
    });
  });
});
