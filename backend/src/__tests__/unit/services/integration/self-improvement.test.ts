/**
 * Tests for Phase 139-140: Self-Improvement Engine
 *
 * TDD: Tests for identifyImprovements, assignRiskLevel, requiresApproval,
 * checkBudget, canExecute, recordImprovementAction, getImprovementHistory.
 */

jest.mock('../../../../utils/logger', () => ({
  logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('../../../../utils/database-context', () => ({
  queryContext: jest.fn(),
}));

import {
  identifyImprovements,
  assignRiskLevel,
  requiresApproval,
  checkBudget,
  canExecute,
  recordImprovementAction,
  getImprovementHistory,
} from '../../../../services/integration/self-improvement';
import type {
  ImprovementAction,
  ImprovementBudget,
} from '../../../../services/integration/self-improvement';
import { queryContext } from '../../../../utils/database-context';

const mockQueryContext = queryContext as jest.MockedFunction<typeof queryContext>;

beforeEach(() => {
  jest.clearAllMocks();
  mockQueryContext.mockReset();
});

// ===========================================================================
// assignRiskLevel
// ===========================================================================

describe('assignRiskLevel', () => {
  it('returns medium for knowledge_gap_research', () => {
    expect(assignRiskLevel('knowledge_gap_research')).toBe('medium');
  });

  it('returns low for procedural_optimization', () => {
    expect(assignRiskLevel('procedural_optimization')).toBe('low');
  });

  it('returns low for team_learning', () => {
    expect(assignRiskLevel('team_learning')).toBe('low');
  });

  it('returns low for calibration_fix', () => {
    expect(assignRiskLevel('calibration_fix')).toBe('low');
  });
});

// ===========================================================================
// requiresApproval
// ===========================================================================

describe('requiresApproval', () => {
  it('returns true for medium risk', () => {
    expect(requiresApproval('medium')).toBe(true);
  });

  it('returns true for high risk', () => {
    expect(requiresApproval('high')).toBe(true);
  });

  it('returns false for low risk', () => {
    expect(requiresApproval('low')).toBe(false);
  });
});

// ===========================================================================
// identifyImprovements
// ===========================================================================

describe('identifyImprovements', () => {
  describe('knowledge gaps', () => {
    it('creates action for gap with high gapScore (>=0.5)', () => {
      const actions = identifyImprovements({
        gaps: [{ topic: 'quantum computing', gapScore: 0.8 }],
      });
      expect(actions).toHaveLength(1);
      expect(actions[0].type).toBe('knowledge_gap_research');
      expect(actions[0].description).toContain('quantum computing');
      expect(actions[0].riskLevel).toBe('medium');
      expect(actions[0].requiresApproval).toBe(true);
    });

    it('skips gap with low gapScore (<0.5)', () => {
      const actions = identifyImprovements({
        gaps: [{ topic: 'basic math', gapScore: 0.3 }],
      });
      expect(actions).toHaveLength(0);
    });

    it('handles multiple gaps', () => {
      const actions = identifyImprovements({
        gaps: [
          { topic: 'a', gapScore: 0.9 },
          { topic: 'b', gapScore: 0.1 },
          { topic: 'c', gapScore: 0.6 },
        ],
      });
      expect(actions).toHaveLength(2);
    });
  });

  describe('procedures', () => {
    it('creates action for procedure with low success rate (<0.5)', () => {
      const actions = identifyImprovements({
        procedures: [{ name: 'deploy-pipeline', successRate: 0.3 }],
      });
      expect(actions).toHaveLength(1);
      expect(actions[0].type).toBe('procedural_optimization');
      expect(actions[0].riskLevel).toBe('low');
      expect(actions[0].requiresApproval).toBe(false);
    });

    it('skips procedure with adequate success rate', () => {
      const actions = identifyImprovements({
        procedures: [{ name: 'good-proc', successRate: 0.8 }],
      });
      expect(actions).toHaveLength(0);
    });
  });

  describe('team strategies', () => {
    it('creates action for strategy with poor avgScore (<0.4)', () => {
      const actions = identifyImprovements({
        teamStats: [{ strategy: 'parallel_research', avgScore: 0.2 }],
      });
      expect(actions).toHaveLength(1);
      expect(actions[0].type).toBe('team_learning');
      expect(actions[0].riskLevel).toBe('low');
    });

    it('skips strategy with good avgScore', () => {
      const actions = identifyImprovements({
        teamStats: [{ strategy: 'good', avgScore: 0.7 }],
      });
      expect(actions).toHaveLength(0);
    });
  });

  describe('calibration', () => {
    it('creates action when ECE > 0.15', () => {
      const actions = identifyImprovements({
        calibration: { ece: 0.25 },
      });
      expect(actions).toHaveLength(1);
      expect(actions[0].type).toBe('calibration_fix');
      expect(actions[0].description).toContain('0.250');
    });

    it('skips when ECE <= 0.15', () => {
      const actions = identifyImprovements({
        calibration: { ece: 0.1 },
      });
      expect(actions).toHaveLength(0);
    });
  });

  describe('combined inputs', () => {
    it('returns actions from all sources', () => {
      const actions = identifyImprovements({
        gaps: [{ topic: 'x', gapScore: 0.9 }],
        procedures: [{ name: 'y', successRate: 0.1 }],
        teamStats: [{ strategy: 'z', avgScore: 0.1 }],
        calibration: { ece: 0.3 },
      });
      expect(actions).toHaveLength(4);
      const types = actions.map((a) => a.type);
      expect(types).toContain('knowledge_gap_research');
      expect(types).toContain('procedural_optimization');
      expect(types).toContain('team_learning');
      expect(types).toContain('calibration_fix');
    });

    it('returns empty array when nothing triggers', () => {
      const actions = identifyImprovements({
        gaps: [{ topic: 'ok', gapScore: 0.1 }],
        procedures: [{ name: 'fine', successRate: 0.9 }],
        teamStats: [{ strategy: 'good', avgScore: 0.8 }],
        calibration: { ece: 0.05 },
      });
      expect(actions).toHaveLength(0);
    });
  });

  it('returns empty array for empty params', () => {
    const actions = identifyImprovements({});
    expect(actions).toHaveLength(0);
  });

  it('each action has a unique id', () => {
    const actions = identifyImprovements({
      gaps: [
        { topic: 'a', gapScore: 0.9 },
        { topic: 'b', gapScore: 0.8 },
      ],
    });
    expect(actions[0].id).not.toBe(actions[1].id);
  });

  it('estimated impact is capped at 1', () => {
    const actions = identifyImprovements({
      gaps: [{ topic: 'x', gapScore: 1.5 }],
    });
    expect(actions[0].estimatedImpact).toBeLessThanOrEqual(1);
  });
});

// ===========================================================================
// checkBudget
// ===========================================================================

describe('checkBudget', () => {
  it('returns full budget on fresh day (0 used)', async () => {
    mockQueryContext.mockResolvedValueOnce({ rows: [{ cnt: 0 }] } as any);
    const budget = await checkBudget('personal');
    expect(budget).toEqual({ maxActionsPerDay: 3, usedToday: 0, remainingToday: 3 });
  });

  it('reflects used actions', async () => {
    mockQueryContext.mockResolvedValueOnce({ rows: [{ cnt: 2 }] } as any);
    const budget = await checkBudget('work');
    expect(budget).toEqual({ maxActionsPerDay: 3, usedToday: 2, remainingToday: 1 });
  });

  it('returns 0 remaining when at limit', async () => {
    mockQueryContext.mockResolvedValueOnce({ rows: [{ cnt: 3 }] } as any);
    const budget = await checkBudget('personal');
    expect(budget.remainingToday).toBe(0);
  });

  it('respects custom maxPerDay', async () => {
    mockQueryContext.mockResolvedValueOnce({ rows: [{ cnt: 1 }] } as any);
    const budget = await checkBudget('personal', 5);
    expect(budget).toEqual({ maxActionsPerDay: 5, usedToday: 1, remainingToday: 4 });
  });

  it('falls back to full budget on DB error', async () => {
    mockQueryContext.mockRejectedValueOnce(new Error('DB down'));
    const budget = await checkBudget('personal');
    expect(budget).toEqual({ maxActionsPerDay: 3, usedToday: 0, remainingToday: 3 });
  });

  it('clamps remaining to 0 when over limit', async () => {
    mockQueryContext.mockResolvedValueOnce({ rows: [{ cnt: 10 }] } as any);
    const budget = await checkBudget('personal');
    expect(budget.remainingToday).toBe(0);
  });
});

// ===========================================================================
// canExecute
// ===========================================================================

describe('canExecute', () => {
  it('returns true when remaining > 0', () => {
    const budget: ImprovementBudget = { maxActionsPerDay: 3, usedToday: 1, remainingToday: 2 };
    expect(canExecute(budget)).toBe(true);
  });

  it('returns false when remaining is 0', () => {
    const budget: ImprovementBudget = { maxActionsPerDay: 3, usedToday: 3, remainingToday: 0 };
    expect(canExecute(budget)).toBe(false);
  });
});

// ===========================================================================
// recordImprovementAction
// ===========================================================================

describe('recordImprovementAction', () => {
  const action: ImprovementAction = {
    id: 'test-id',
    type: 'calibration_fix',
    description: 'Fix drift',
    riskLevel: 'low',
    requiresApproval: false,
    estimatedImpact: 0.5,
    basis: ['ece=0.2'],
  };

  it('calls queryContext with correct params', async () => {
    mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);
    await recordImprovementAction('personal', action);
    expect(mockQueryContext).toHaveBeenCalledTimes(1);
    const [ctx, sql, params] = mockQueryContext.mock.calls[0];
    expect(ctx).toBe('personal');
    expect(sql).toContain('INSERT INTO improvement_actions');
    expect(params).toContain('test-id');
    expect(params).toContain('calibration_fix');
  });

  it('does not throw on DB error (fire-and-forget)', async () => {
    mockQueryContext.mockRejectedValueOnce(new Error('DB fail'));
    await expect(recordImprovementAction('personal', action)).resolves.toBeUndefined();
  });
});

// ===========================================================================
// getImprovementHistory
// ===========================================================================

describe('getImprovementHistory', () => {
  it('returns mapped actions from DB', async () => {
    mockQueryContext.mockResolvedValueOnce({
      rows: [
        {
          id: 'abc',
          type: 'team_learning',
          description: 'desc',
          risk_level: 'low',
          requires_approval: false,
          estimated_impact: 0.3,
          basis: JSON.stringify(['x']),
        },
      ],
    } as any);
    const history = await getImprovementHistory('work', 10);
    expect(history).toHaveLength(1);
    expect(history[0].id).toBe('abc');
    expect(history[0].type).toBe('team_learning');
    expect(history[0].basis).toEqual(['x']);
  });

  it('returns empty array on DB error', async () => {
    mockQueryContext.mockRejectedValueOnce(new Error('DB fail'));
    const history = await getImprovementHistory('personal');
    expect(history).toEqual([]);
  });

  it('uses default limit of 20', async () => {
    mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);
    await getImprovementHistory('personal');
    const params = mockQueryContext.mock.calls[0][2];
    expect(params).toContain(20);
  });

  it('respects custom limit', async () => {
    mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);
    await getImprovementHistory('personal', 5);
    const params = mockQueryContext.mock.calls[0][2];
    expect(params).toContain(5);
  });
});
