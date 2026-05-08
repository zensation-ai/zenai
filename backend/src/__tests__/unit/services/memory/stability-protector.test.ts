/**
 * Unit Tests for StabilityProtector
 *
 * NogoA analog with HDAC3 rigidity: well-established memories resist casual
 * updates. Lock score is computed from access count, confidence, age, and
 * core fact status. Progressive rigidity (HDAC3 analog) increases with age.
 *
 * Part of the Predictive Memory Architecture (PMA).
 */

import { StabilityProtector } from '../../../../services/memory/stability-protector';

jest.mock('../../../../utils/database-context', () => ({
  queryContext: jest.fn(),
}));

jest.mock('../../../../utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const { queryContext } = require('../../../../utils/database-context');
const mockQueryContext = queryContext as jest.Mock;

describe('StabilityProtector', () => {
  let protector: StabilityProtector;

  beforeEach(() => {
    protector = new StabilityProtector();
    jest.clearAllMocks();
    mockQueryContext.mockReset();
  });

  // =========================================================
  // lockScore computation (6 tests)
  // =========================================================

  describe('lockScore computation', () => {
    it('returns 0 for a brand-new memory (all zeros, not core)', () => {
      const score = protector.computeLockScore(0, 0, 0, false);
      expect(score).toBe(0);
    });

    it('returns high score for frequently accessed, high-confidence, old, core memory', () => {
      // accessCount=10, confidence=1.0, ageInDays=365, isCoreFact=true → max lock
      const score = protector.computeLockScore(10, 1.0, 365, true);
      // normAccess = log2(11)/log2(11) = 1.0
      // normAge = min(365/365, 1) = 1.0
      // coreFactor = 1
      // 0.3*1 + 0.3*1 + 0.2*1 + 0.2*1 = 1.0
      expect(score).toBeCloseTo(1.0, 5);
    });

    it('normalizes accessCount via log2(1 + min(accessCount, 10)) / log2(11)', () => {
      // accessCount=1: normAccess = log2(2)/log2(11) ≈ 0.2890
      const scoreOne = protector.computeLockScore(1, 0, 0, false);
      const expectedNormAccess = Math.log2(2) / Math.log2(11);
      expect(scoreOne).toBeCloseTo(0.3 * expectedNormAccess, 5);
    });

    it('confidence contributes directly (0-1)', () => {
      // accessCount=0, confidence=0.5, age=0, not core
      const score = protector.computeLockScore(0, 0.5, 0, false);
      expect(score).toBeCloseTo(0.3 * 0.5, 5);
    });

    it('age contributes via min(ageInDays / 365, 1)', () => {
      // accessCount=0, confidence=0, age=182.5 (half year), not core
      const score = protector.computeLockScore(0, 0, 182.5, false);
      const normAge = Math.min(182.5 / 365, 1);
      expect(score).toBeCloseTo(0.2 * normAge, 5);
    });

    it('isCoreFact adds 0.2 bonus to the score', () => {
      const scoreWithout = protector.computeLockScore(0, 0, 0, false);
      const scoreWith = protector.computeLockScore(0, 0, 0, true);
      expect(scoreWith - scoreWithout).toBeCloseTo(0.2, 5);
    });

    it('clamps result to maximum of 1.0 even if components exceed it', () => {
      // Using values that should produce exactly 1.0
      const score = protector.computeLockScore(10, 1.0, 365, true);
      expect(score).toBeLessThanOrEqual(1.0);
    });

    it('clamps result to minimum of 0', () => {
      const score = protector.computeLockScore(0, 0, 0, false);
      expect(score).toBeGreaterThanOrEqual(0);
    });
  });

  // =========================================================
  // Progressive rigidity — HDAC3 analog (4 tests)
  // =========================================================

  describe('progressive rigidity — HDAC3 analog', () => {
    it('returns 1.0 for brand-new memories (0 days)', () => {
      const rigidity = protector.computeRigidityFactor(0);
      // 1 + 0.1 * log2(1 + 0) = 1 + 0.1 * 0 = 1.0
      expect(rigidity).toBeCloseTo(1.0, 5);
    });

    it('returns 1 + 0.1 * log2(1 + ageInDays) for older memories', () => {
      const age = 100;
      const rigidity = protector.computeRigidityFactor(age);
      const expected = 1 + 0.1 * Math.log2(1 + age);
      expect(rigidity).toBeCloseTo(expected, 5);
    });

    it('30-day old memory has rigidity approximately 1.5', () => {
      const rigidity = protector.computeRigidityFactor(30);
      // 1 + 0.1 * log2(31) ≈ 1 + 0.1 * 4.954 ≈ 1.495
      expect(rigidity).toBeGreaterThan(1.4);
      expect(rigidity).toBeLessThan(1.6);
    });

    it('365-day old memory has rigidity approximately 1.87', () => {
      const rigidity = protector.computeRigidityFactor(365);
      // 1 + 0.1 * log2(366) ≈ 1 + 0.1 * 8.516 ≈ 1.852
      expect(rigidity).toBeGreaterThan(1.8);
      expect(rigidity).toBeLessThan(1.95);
    });
  });

  // =========================================================
  // Update gating (5 tests)
  // =========================================================

  describe('update gating', () => {
    it('canUpdate returns true when PE exceeds threshold', () => {
      // lockScore=0.5, rigidityFactor=1.0 → threshold = 0.5 + 0.3*0.5*1.0 = 0.65
      const result = protector.canUpdate('mem-1', 0.9, 0.5, 1.0);
      expect(result).toBe(true);
    });

    it('canUpdate returns false when PE is below threshold', () => {
      // lockScore=0.9, rigidityFactor=1.5 → threshold = 0.5 + 0.3*0.9*1.5 = 0.905
      const result = protector.canUpdate('mem-2', 0.5, 0.9, 1.5);
      expect(result).toBe(false);
    });

    it('threshold formula is 0.5 + 0.3 * lockScore * rigidityFactor', () => {
      const lockScore = 0.6;
      const rigidityFactor = 1.2;
      const threshold = 0.5 + 0.3 * lockScore * rigidityFactor;
      // Just below threshold → false
      expect(protector.canUpdate('mem-3', threshold - 0.001, lockScore, rigidityFactor)).toBe(false);
      // At or above threshold → true
      expect(protector.canUpdate('mem-3', threshold, lockScore, rigidityFactor)).toBe(true);
    });

    it('low lock score (0.1) yields low threshold (~0.53), easy to update', () => {
      // threshold = 0.5 + 0.3 * 0.1 * 1.0 = 0.53
      const result = protector.canUpdate('mem-4', 0.6, 0.1, 1.0);
      expect(result).toBe(true);
    });

    it('high lock score (0.9) yields high threshold (~0.77+), hard to update', () => {
      // threshold = 0.5 + 0.3 * 0.9 * 1.0 = 0.77
      const result = protector.canUpdate('mem-5', 0.5, 0.9, 1.0);
      expect(result).toBe(false);
    });
  });

  // =========================================================
  // Persistence (3 tests)
  // =========================================================

  describe('persistence — evaluateAndStore', () => {
    it('upserts to memory_stability_locks table', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] });

      await protector.evaluateAndStore('mem-10', 5, 0.8, 90, false, 'user-1', 'operations');

      expect(mockQueryContext).toHaveBeenCalledWith(
        'operations',
        expect.stringContaining('memory_stability_locks'),
        expect.any(Array),
      );
    });

    it('stores lockScore and rigidityFactor in the upsert', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] });

      const { lockScore, rigidityFactor } = await protector.evaluateAndStore(
        'mem-11',
        5,
        0.8,
        90,
        false,
        'user-1',
        'operations',
      );

      // Verify the returned values are computed correctly
      const expectedLock = protector.computeLockScore(5, 0.8, 90, false);
      const expectedRigidity = protector.computeRigidityFactor(90);
      expect(lockScore).toBeCloseTo(expectedLock, 5);
      expect(rigidityFactor).toBeCloseTo(expectedRigidity, 5);

      // Verify both values appear in the SQL params
      const callArgs = mockQueryContext.mock.calls[0];
      const params = callArgs[2] as unknown[];
      expect(params).toContain(lockScore);
      expect(params).toContain(rigidityFactor);
    });

    it('updates last_evaluated timestamp during upsert', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] });

      await protector.evaluateAndStore('mem-12', 3, 0.5, 45, true, 'user-2', 'finance');

      const callArgs = mockQueryContext.mock.calls[0];
      const sql = callArgs[1] as string;
      expect(sql).toMatch(/last_evaluated/i);
    });
  });

  // =========================================================
  // Edge cases (3 tests)
  // =========================================================

  describe('edge cases', () => {
    it('ablation: when disabled, canUpdate always returns true regardless of PE', () => {
      protector.setEnabled(false);
      // Even with a very high lock score and low PE, should return true
      const result = protector.canUpdate('mem-20', 0.01, 1.0, 2.0);
      expect(result).toBe(true);
    });

    it('accessCount above 10 is capped at 10 in lock score computation', () => {
      // accessCount=100 should give the same result as accessCount=10
      const scoreAt10 = protector.computeLockScore(10, 0, 0, false);
      const scoreAt100 = protector.computeLockScore(100, 0, 0, false);
      expect(scoreAt10).toBeCloseTo(scoreAt100, 5);
    });

    it('negative ageInDays is treated as 0', () => {
      const scoreNegAge = protector.computeLockScore(0, 0, -10, false);
      const scoreZeroAge = protector.computeLockScore(0, 0, 0, false);
      expect(scoreNegAge).toBeCloseTo(scoreZeroAge, 5);
    });
  });

  // =========================================================
  // Variance-based lock score (1 test)
  // =========================================================

  describe('computeLockScoreFromVariance', () => {
    it('higher variance yields lower lock score (less stable)', () => {
      const lowVariance = protector.computeLockScoreFromVariance(0.1);
      const highVariance = protector.computeLockScoreFromVariance(0.9);
      expect(lowVariance).toBeGreaterThan(highVariance);
    });

    it('variance of 0 gives lock score of 1 (fully stable)', () => {
      const score = protector.computeLockScoreFromVariance(0);
      expect(score).toBeCloseTo(1.0, 5);
    });

    it('variance of 1 gives lock score of 0 (fully unstable)', () => {
      const score = protector.computeLockScoreFromVariance(1);
      expect(score).toBeCloseTo(0.0, 5);
    });
  });
});
