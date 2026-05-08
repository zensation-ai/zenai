describe('Self-Improvement Worker', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('processes daily improvement cycle for all contexts', async () => {
    jest.mock('../../../../services/integration/self-improvement', () => ({
      identifyImprovements: jest.fn().mockReturnValue([
        { id: 'imp-1', type: 'knowledge_gap_research', description: 'Research gap', riskLevel: 'low', requiresApproval: false, estimatedImpact: 0.3, basis: [] },
      ]),
      checkBudget: jest.fn().mockResolvedValue({ maxActionsPerDay: 3, usedToday: 0, remainingToday: 3 }),
      executeWithHyperAgent: jest.fn().mockResolvedValue({ success: true }),
    }));

    const { processSelfImprovement } = await import('../../../../services/queue/workers/self-improvement-worker');

    const mockJob = {
      id: 'test-1',
      name: 'daily-improvement',
      data: {},
      attemptsMade: 0,
      updateProgress: jest.fn(),
    };

    const result = await processSelfImprovement(mockJob as any);
    expect(result).toHaveProperty('status', 'completed');
    expect(result).toHaveProperty('contextsProcessed', 4);
    expect(result).toHaveProperty('totalExecuted');
    expect(mockJob.updateProgress).toHaveBeenCalledTimes(4);
  });

  it('skips contexts with exhausted budgets', async () => {
    jest.mock('../../../../services/integration/self-improvement', () => ({
      identifyImprovements: jest.fn().mockReturnValue([]),
      checkBudget: jest.fn().mockResolvedValue({ maxActionsPerDay: 3, usedToday: 3, remainingToday: 0 }),
      executeWithHyperAgent: jest.fn(),
    }));

    const { processSelfImprovement } = await import('../../../../services/queue/workers/self-improvement-worker');

    const mockJob = { id: 'test-2', data: {}, updateProgress: jest.fn() };
    const result = await processSelfImprovement(mockJob as any);
    expect(result.totalExecuted).toBe(0);

    const { executeWithHyperAgent } = require('../../../../services/integration/self-improvement');
    expect(executeWithHyperAgent).not.toHaveBeenCalled();
  });

  it('skips improvements that require approval', async () => {
    jest.mock('../../../../services/integration/self-improvement', () => ({
      identifyImprovements: jest.fn().mockReturnValue([
        { id: 'imp-1', type: 'risky_change', requiresApproval: true, riskLevel: 'high', estimatedImpact: 0.8 },
      ]),
      checkBudget: jest.fn().mockResolvedValue({ maxActionsPerDay: 3, usedToday: 0, remainingToday: 3 }),
      executeWithHyperAgent: jest.fn(),
    }));

    const { processSelfImprovement } = await import('../../../../services/queue/workers/self-improvement-worker');

    const mockJob = { id: 'test-3', data: {}, updateProgress: jest.fn() };
    const result = await processSelfImprovement(mockJob as any);
    expect(result.totalExecuted).toBe(0);
  });

  it('handles execution errors gracefully', async () => {
    jest.mock('../../../../services/integration/self-improvement', () => ({
      identifyImprovements: jest.fn().mockReturnValue([
        { id: 'imp-1', type: 'test', requiresApproval: false, riskLevel: 'low', estimatedImpact: 0.2 },
      ]),
      checkBudget: jest.fn().mockResolvedValue({ maxActionsPerDay: 3, usedToday: 0, remainingToday: 3 }),
      executeWithHyperAgent: jest.fn().mockRejectedValue(new Error('Service unavailable')),
    }));

    const { processSelfImprovement } = await import('../../../../services/queue/workers/self-improvement-worker');

    const mockJob = { id: 'test-4', data: {}, updateProgress: jest.fn() };
    const result = await processSelfImprovement(mockJob as any);
    // Should still complete — errors are caught per-improvement
    expect(result.status).toBe('completed');
    expect(result.totalExecuted).toBe(0);
  });
});
