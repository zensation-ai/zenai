/**
 * HyperAgent Sandbox Tests
 */

jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import { runSandboxTest, QualityEvaluator } from '../../../services/hyperagents/sandbox';

describe('HyperAgent Sandbox', () => {
  const currentConfig = { threshold: 0.5 };
  const proposedConfig = { threshold: 0.6 };

  describe('runSandboxTest', () => {
    it('requires minimum test queries', async () => {
      const evaluator: QualityEvaluator = jest.fn().mockResolvedValue(0.8);
      const queries = ['q1', 'q2']; // only 2, need 10

      const result = await runSandboxTest(currentConfig, proposedConfig, queries, evaluator);

      expect(result.passed).toBe(false);
      expect(result.testCount).toBe(2);
      expect(result.details).toEqual([]);
    });

    it('passes when improvement exceeds threshold', async () => {
      // Before: 0.5, After: 0.6 => 20% improvement (> 5% required)
      const evaluator: QualityEvaluator = jest.fn()
        .mockImplementation(async (config: Record<string, unknown>) => {
          return config.threshold === 0.6 ? 0.6 : 0.5;
        });

      const queries = Array.from({ length: 10 }, (_, i) => `query-${i}`);
      const result = await runSandboxTest(currentConfig, proposedConfig, queries, evaluator);

      expect(result.passed).toBe(true);
      expect(result.qualityDeltaPercent).toBeCloseTo(20);
      expect(result.testCount).toBe(10);
      expect(result.details.length).toBe(10);
    });

    it('fails when there is no improvement', async () => {
      // Same quality before and after
      const evaluator: QualityEvaluator = jest.fn().mockResolvedValue(0.5);
      const queries = Array.from({ length: 10 }, (_, i) => `query-${i}`);

      const result = await runSandboxTest(currentConfig, proposedConfig, queries, evaluator);

      expect(result.passed).toBe(false);
      expect(result.qualityDeltaPercent).toBeCloseTo(0);
    });

    it('fails when degradation exceeds limit', async () => {
      let callCount = 0;
      const evaluator: QualityEvaluator = jest.fn()
        .mockImplementation(async (config: Record<string, unknown>) => {
          callCount++;
          // Most queries improve, but one degrades badly
          if (callCount % 20 === 3 || callCount % 20 === 4) {
            // Query pair where after is much worse
            return config.threshold === 0.6 ? 0.3 : 0.5;
          }
          return config.threshold === 0.6 ? 0.6 : 0.5;
        });

      const queries = Array.from({ length: 10 }, (_, i) => `query-${i}`);
      const result = await runSandboxTest(currentConfig, proposedConfig, queries, evaluator);

      // The worst degradation (0.2 absolute on base 0.5 = 40%) exceeds 2%
      expect(result.passed).toBe(false);
    });

    it('handles evaluator errors gracefully', async () => {
      let callIdx = 0;
      const evaluator: QualityEvaluator = jest.fn()
        .mockImplementation(async () => {
          callIdx++;
          if (callIdx === 3) throw new Error('Evaluator failed');
          return 0.5;
        });

      const queries = Array.from({ length: 10 }, (_, i) => `query-${i}`);
      const result = await runSandboxTest(currentConfig, proposedConfig, queries, evaluator);

      // Should not throw, should still have details
      expect(result.testCount).toBe(10);
      expect(result.details.length).toBe(10);
      // The failed query should have 0s
      expect(result.details[1].qualityBefore).toBe(0); // callIdx 3 is the 2nd query's before (idx=1)
    });

    it('calculates worst degradation correctly', async () => {
      let callCount = 0;
      const evaluator: QualityEvaluator = jest.fn()
        .mockImplementation(async (config: Record<string, unknown>) => {
          callCount++;
          // First query degrades, rest improve
          if (callCount <= 2) {
            return config.threshold === 0.6 ? 0.48 : 0.5; // -0.02 degradation
          }
          return config.threshold === 0.6 ? 0.6 : 0.5; // +0.1 improvement
        });

      const queries = Array.from({ length: 10 }, (_, i) => `query-${i}`);
      const result = await runSandboxTest(currentConfig, proposedConfig, queries, evaluator);

      expect(result.worstDegradation).toBeCloseTo(0.02);
    });
  });
});
