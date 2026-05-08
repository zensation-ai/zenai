/**
 * HyperAgent Meta-Improver Tests
 */

jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import {
  proposeImprovement,
  approveAndApply,
  rollbackImprovement,
  checkAutoRollback,
  getRuntimeConfig,
  setRuntimeConfig,
  getStatus,
  _resetForTesting,
  ImprovementProposal,
} from '../../../services/hyperagents/meta-improver';
import {
  _resetForTesting as resetTracker,
  recordImprovement,
  measureOutcome,
} from '../../../services/hyperagents/improvement-tracker';

describe('HyperAgent Meta-Improver', () => {
  beforeEach(() => {
    _resetForTesting();
    resetTracker();
  });

  const makeProposal = (overrides: Partial<ImprovementProposal> = {}): ImprovementProposal => ({
    level: 0,
    type: 'rag_threshold',
    description: 'Adjust RAG threshold',
    targetProperty: 'rag.threshold',
    currentValue: 0.5,
    proposedValue: 0.6,
    rationale: 'Improve retrieval quality',
    expectedImpact: 0.1,
    ...overrides,
  });

  describe('proposeImprovement', () => {
    it('rejects exceeding recursion depth', async () => {
      const result = await proposeImprovement(makeProposal({ level: 3 as any }));
      expect(result.applied).toBe(false);
      expect(result.reason).toContain('recursion depth');
    });

    it('rejects immutable properties', async () => {
      const result = await proposeImprovement(makeProposal({
        targetProperty: 'security.audit',
      }));
      expect(result.applied).toBe(false);
      expect(result.reason).toContain('immutable');
    });

    it('rejects governance.policies as immutable', async () => {
      const result = await proposeImprovement(makeProposal({
        targetProperty: 'governance.policies',
      }));
      expect(result.applied).toBe(false);
      expect(result.reason).toContain('immutable');
    });

    it('rejects when daily budget exceeded for level 0', async () => {
      // Use up the budget (3 for level 0)
      for (let i = 0; i < 3; i++) {
        await proposeImprovement(makeProposal({
          targetProperty: `rag.param${i}`,
          currentValue: 0.5,
          proposedValue: 0.55,
        }));
      }

      const result = await proposeImprovement(makeProposal({
        targetProperty: 'rag.param3',
      }));
      expect(result.applied).toBe(false);
      expect(result.reason).toContain('Daily budget exceeded');
    });

    it('rejects large adjustments (>25%)', async () => {
      const result = await proposeImprovement(makeProposal({
        currentValue: 100,
        proposedValue: 200, // 100% change
      }));
      expect(result.applied).toBe(false);
      expect(result.reason).toContain('25%');
    });

    it('auto-applies Level 0 improvements', async () => {
      const result = await proposeImprovement(makeProposal());
      expect(result.applied).toBe(true);
      expect(result.reason).toBe('Applied successfully');
      expect(result.governanceRequired).toBe(false);
      expect(result.id).toMatch(/^hyp-/);

      // Verify config was updated
      expect(getRuntimeConfig('rag.threshold')).toBe(0.6);
    });

    it('requires governance for Level 1', async () => {
      const result = await proposeImprovement(makeProposal({ level: 1 }));
      expect(result.applied).toBe(false);
      expect(result.governanceRequired).toBe(true);
      expect(result.reason).toContain('governance');
    });

    it('requires governance for Level 2', async () => {
      const result = await proposeImprovement(makeProposal({ level: 2 }));
      expect(result.applied).toBe(false);
      expect(result.governanceRequired).toBe(true);
    });

    it('allows string property values without bounds check', async () => {
      const result = await proposeImprovement(makeProposal({
        currentValue: 'strategy-a',
        proposedValue: 'strategy-b',
      }));
      expect(result.applied).toBe(true);
    });

    it('runs sandbox test when evaluator provided', async () => {
      const evaluator = jest.fn()
        .mockImplementation(async (config: Record<string, unknown>) => {
          return config['rag.threshold'] === 0.6 ? 0.8 : 0.5;
        });

      const queries = Array.from({ length: 10 }, (_, i) => `q${i}`);
      const result = await proposeImprovement(makeProposal(), evaluator, queries);

      // Should pass sandbox (60% improvement) and auto-apply for level 0
      expect(result.applied).toBe(true);
      expect(result.sandboxResult).toBeDefined();
      expect(result.sandboxResult!.passed).toBe(true);
    });

    it('rejects when sandbox test fails', async () => {
      setRuntimeConfig('rag.threshold', 0.5);
      const evaluator = jest.fn().mockResolvedValue(0.5); // no improvement

      const queries = Array.from({ length: 10 }, (_, i) => `q${i}`);
      const result = await proposeImprovement(makeProposal(), evaluator, queries);

      expect(result.applied).toBe(false);
      expect(result.reason).toContain('Sandbox test failed');
    });
  });

  describe('approveAndApply', () => {
    it('applies config change after governance approval', async () => {
      const result = await proposeImprovement(makeProposal({ level: 1 }));
      expect(result.applied).toBe(false);
      expect(result.governanceRequired).toBe(true);

      const success = approveAndApply(result.id);
      expect(success).toBe(true);
      expect(getRuntimeConfig('rag.threshold')).toBe(0.6);
    });

    it('returns false for non-existent id', () => {
      expect(approveAndApply('nonexistent')).toBe(false);
    });
  });

  describe('rollbackImprovement', () => {
    it('restores previous config', async () => {
      const result = await proposeImprovement(makeProposal());
      expect(getRuntimeConfig('rag.threshold')).toBe(0.6);

      const success = rollbackImprovement(result.id);
      expect(success).toBe(true);
      expect(getRuntimeConfig('rag.threshold')).toBe(0.5);
    });

    it('returns false for non-existent id', () => {
      expect(rollbackImprovement('nonexistent')).toBe(false);
    });
  });

  describe('checkAutoRollback', () => {
    it('returns empty when not enough data', () => {
      const rolledBack = checkAutoRollback();
      expect(rolledBack).toEqual([]);
    });

    it('triggers rollback on quality drop', () => {
      // Create 5+ improvements with negative quality deltas
      for (let i = 0; i < 6; i++) {
        const id = recordImprovement({
          level: 0,
          type: 'test',
          description: `Test ${i}`,
          appliedAt: new Date(),
          configBefore: { x: 0.5 },
          configAfter: { x: 0.4 },
          qualityBefore: 0.5,
        });
        measureOutcome(id, 0.3); // -0.2 delta each
      }

      const rolledBack = checkAutoRollback();
      expect(rolledBack.length).toBeGreaterThan(0);
    });

    it('does not trigger when quality is good', () => {
      for (let i = 0; i < 6; i++) {
        const id = recordImprovement({
          level: 0,
          type: 'test',
          description: `Test ${i}`,
          appliedAt: new Date(),
          configBefore: { x: 0.5 },
          configAfter: { x: 0.6 },
          qualityBefore: 0.5,
        });
        measureOutcome(id, 0.7); // +0.2 delta each
      }

      const rolledBack = checkAutoRollback();
      expect(rolledBack).toEqual([]);
    });
  });

  describe('getStatus', () => {
    it('returns current state', async () => {
      await proposeImprovement(makeProposal());

      const status = getStatus();
      expect(status.config['rag.threshold']).toBe(0.6);
      expect(status.actionsToday[0]).toBe(1);
      expect(status.actionsToday[1]).toBe(0);
      expect(status.actionsToday[2]).toBe(0);
      expect(status.metaMetrics).toBeDefined();
    });
  });

  describe('getRuntimeConfig / setRuntimeConfig', () => {
    it('gets and sets values', () => {
      setRuntimeConfig('test.key', 42);
      expect(getRuntimeConfig('test.key')).toBe(42);
    });

    it('returns undefined for unset keys', () => {
      expect(getRuntimeConfig('nonexistent')).toBeUndefined();
    });
  });
});
