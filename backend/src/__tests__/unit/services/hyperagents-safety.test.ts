/**
 * HyperAgent Safety Bounds Tests
 */

import {
  isPropertyImmutable,
  isDailyBudgetExceeded,
  isAdjustmentWithinBounds,
  requiresGovernance,
  HYPERAGENT_BOUNDS,
} from '../../../services/hyperagents/safety-bounds';

describe('HyperAgent Safety Bounds', () => {
  describe('isPropertyImmutable', () => {
    it('returns true for security.audit (wildcard match)', () => {
      expect(isPropertyImmutable('security.audit')).toBe(true);
    });

    it('returns true for security.encryption', () => {
      expect(isPropertyImmutable('security.encryption')).toBe(true);
    });

    it('returns true for governance.policies (exact match)', () => {
      expect(isPropertyImmutable('governance.policies')).toBe(true);
    });

    it('returns true for auth.jwt (wildcard match)', () => {
      expect(isPropertyImmutable('auth.jwt')).toBe(true);
    });

    it('returns true for database.schema', () => {
      expect(isPropertyImmutable('database.schema')).toBe(true);
    });

    it('returns true for hyperagents.safety_bounds', () => {
      expect(isPropertyImmutable('hyperagents.safety_bounds')).toBe(true);
    });

    it('returns false for thinking.budget', () => {
      expect(isPropertyImmutable('thinking.budget')).toBe(false);
    });

    it('returns false for rag.temperature', () => {
      expect(isPropertyImmutable('rag.temperature')).toBe(false);
    });

    it('returns false for agent.strategy', () => {
      expect(isPropertyImmutable('agent.strategy')).toBe(false);
    });
  });

  describe('isDailyBudgetExceeded', () => {
    it('returns true when at limit for level 0', () => {
      expect(isDailyBudgetExceeded(0, 3)).toBe(true);
    });

    it('returns true when over limit for level 0', () => {
      expect(isDailyBudgetExceeded(0, 5)).toBe(true);
    });

    it('returns false when under limit for level 0', () => {
      expect(isDailyBudgetExceeded(0, 2)).toBe(false);
    });

    it('returns true when at limit for level 1', () => {
      expect(isDailyBudgetExceeded(1, 1)).toBe(true);
    });

    it('returns false when under limit for level 1', () => {
      expect(isDailyBudgetExceeded(1, 0)).toBe(false);
    });

    it('returns true when at limit for level 2', () => {
      expect(isDailyBudgetExceeded(2, 1)).toBe(true);
    });

    it('returns false when zero actions for level 2', () => {
      expect(isDailyBudgetExceeded(2, 0)).toBe(false);
    });
  });

  describe('isAdjustmentWithinBounds', () => {
    it('allows exactly 25% change', () => {
      expect(isAdjustmentWithinBounds(100, 125)).toBe(true);
    });

    it('allows 25% decrease', () => {
      expect(isAdjustmentWithinBounds(100, 75)).toBe(true);
    });

    it('allows small changes', () => {
      expect(isAdjustmentWithinBounds(0.5, 0.55)).toBe(true);
    });

    it('rejects 50% change', () => {
      expect(isAdjustmentWithinBounds(100, 150)).toBe(false);
    });

    it('rejects 50% decrease', () => {
      expect(isAdjustmentWithinBounds(100, 50)).toBe(false);
    });

    it('allows any change when current is 0', () => {
      expect(isAdjustmentWithinBounds(0, 100)).toBe(true);
    });

    it('rejects 26% change', () => {
      expect(isAdjustmentWithinBounds(100, 126)).toBe(false);
    });
  });

  describe('requiresGovernance', () => {
    it('returns false for level 0', () => {
      expect(requiresGovernance(0)).toBe(false);
    });

    it('returns true for level 1', () => {
      expect(requiresGovernance(1)).toBe(true);
    });

    it('returns true for level 2', () => {
      expect(requiresGovernance(2)).toBe(true);
    });
  });

  describe('HYPERAGENT_BOUNDS', () => {
    it('has maxRecursionDepth of 2', () => {
      expect(HYPERAGENT_BOUNDS.maxRecursionDepth).toBe(2);
    });

    it('has correct daily action limits', () => {
      expect(HYPERAGENT_BOUNDS.maxDailyActions[0]).toBe(3);
      expect(HYPERAGENT_BOUNDS.maxDailyActions[1]).toBe(1);
      expect(HYPERAGENT_BOUNDS.maxDailyActions[2]).toBe(1);
    });

    it('has rollback trigger config', () => {
      expect(HYPERAGENT_BOUNDS.rollbackTrigger.qualityDropThreshold).toBe(0.15);
      expect(HYPERAGENT_BOUNDS.rollbackTrigger.windowDays).toBe(3);
      expect(HYPERAGENT_BOUNDS.rollbackTrigger.minSamples).toBe(5);
    });

    it('has sandbox requirements', () => {
      expect(HYPERAGENT_BOUNDS.sandboxRequirements.minTestQueries).toBe(10);
      expect(HYPERAGENT_BOUNDS.sandboxRequirements.minImprovementPercent).toBe(5);
      expect(HYPERAGENT_BOUNDS.sandboxRequirements.maxDegradationPercent).toBe(2);
    });
  });
});
