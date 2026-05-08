const mockQueryPublic = jest.fn();
jest.mock('../../../../utils/database', () => ({
  queryPublic: (...args: unknown[]) => mockQueryPublic(...args),
}));
jest.mock('../../../../utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), debug: jest.fn(), warn: jest.fn() },
}));

import { agentAnalytics } from '../../../../services/agents/agent-analytics';
import type {
  SystemOverview,
  AgentPerformance,
  OptimizationSuggestion,
  UsageTrend,
} from '../../../../services/agents/agent-analytics';

describe('AgentAnalyticsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryPublic.mockReset();
  });

  describe('getSystemOverview', () => {
    it('returns complete overview with all fields', async () => {
      // total agents
      mockQueryPublic.mockResolvedValueOnce({ rows: [{ count: 12 }] });
      // active agents
      mockQueryPublic.mockResolvedValueOnce({ rows: [{ count: 8 }] });
      // today stats
      mockQueryPublic.mockResolvedValueOnce({
        rows: [{ total_executions: 45, total_tokens: '120000', success_rate: 0.85 }],
      });
      // top performing
      mockQueryPublic.mockResolvedValueOnce({
        rows: [{ id: 'agent-1', name: 'Researcher', success_rate: '0.95' }],
      });
      // most used
      mockQueryPublic.mockResolvedValueOnce({
        rows: [{ id: 'agent-2', name: 'Writer', execution_count: '150' }],
      });
      // budget
      mockQueryPublic.mockResolvedValueOnce({
        rows: [{ total_budget: '200000' }],
      });

      const overview: SystemOverview = await agentAnalytics.getSystemOverview();

      expect(overview.totalAgents).toBe(12);
      expect(overview.activeAgents).toBe(8);
      expect(overview.totalExecutionsToday).toBe(45);
      expect(overview.totalTokensToday).toBe(120000);
      expect(overview.overallSuccessRate).toBe(0.85);
      expect(overview.topPerformingAgent).toEqual({
        id: 'agent-1',
        name: 'Researcher',
        successRate: 0.95,
      });
      expect(overview.mostUsedAgent).toEqual({
        id: 'agent-2',
        name: 'Writer',
        executionCount: 150,
      });
      expect(overview.tokenBudgetUtilization).toBeCloseTo(0.6);
      expect(mockQueryPublic).toHaveBeenCalledTimes(6);
    });

    it('handles zero executions gracefully', async () => {
      mockQueryPublic.mockResolvedValueOnce({ rows: [{ count: 3 }] });
      mockQueryPublic.mockResolvedValueOnce({ rows: [{ count: 0 }] });
      mockQueryPublic.mockResolvedValueOnce({
        rows: [{ total_executions: 0, total_tokens: '0', success_rate: 0 }],
      });
      mockQueryPublic.mockResolvedValueOnce({ rows: [] });
      mockQueryPublic.mockResolvedValueOnce({ rows: [] });
      mockQueryPublic.mockResolvedValueOnce({ rows: [{ total_budget: '0' }] });

      const overview = await agentAnalytics.getSystemOverview();

      expect(overview.totalAgents).toBe(3);
      expect(overview.activeAgents).toBe(0);
      expect(overview.totalExecutionsToday).toBe(0);
      expect(overview.totalTokensToday).toBe(0);
      expect(overview.overallSuccessRate).toBe(0);
      expect(overview.topPerformingAgent).toBeNull();
      expect(overview.mostUsedAgent).toBeNull();
      expect(overview.tokenBudgetUtilization).toBe(0);
    });

    it('identifies top performing agent', async () => {
      mockQueryPublic.mockResolvedValueOnce({ rows: [{ count: 5 }] });
      mockQueryPublic.mockResolvedValueOnce({ rows: [{ count: 3 }] });
      mockQueryPublic.mockResolvedValueOnce({
        rows: [{ total_executions: 20, total_tokens: '50000', success_rate: 0.7 }],
      });
      mockQueryPublic.mockResolvedValueOnce({
        rows: [{ id: 'top-agent', name: 'TopBot', success_rate: '0.98' }],
      });
      mockQueryPublic.mockResolvedValueOnce({
        rows: [{ id: 'used-agent', name: 'BusyBot', execution_count: '200' }],
      });
      mockQueryPublic.mockResolvedValueOnce({ rows: [{ total_budget: '100000' }] });

      const overview = await agentAnalytics.getSystemOverview();

      expect(overview.topPerformingAgent).toEqual({
        id: 'top-agent',
        name: 'TopBot',
        successRate: 0.98,
      });
    });

    it('identifies most used agent', async () => {
      mockQueryPublic.mockResolvedValueOnce({ rows: [{ count: 5 }] });
      mockQueryPublic.mockResolvedValueOnce({ rows: [{ count: 2 }] });
      mockQueryPublic.mockResolvedValueOnce({
        rows: [{ total_executions: 10, total_tokens: '30000', success_rate: 0.9 }],
      });
      mockQueryPublic.mockResolvedValueOnce({ rows: [] });
      mockQueryPublic.mockResolvedValueOnce({
        rows: [{ id: 'busy-1', name: 'WorkerBot', execution_count: '500' }],
      });
      mockQueryPublic.mockResolvedValueOnce({ rows: [{ total_budget: '50000' }] });

      const overview = await agentAnalytics.getSystemOverview();

      expect(overview.mostUsedAgent).toEqual({
        id: 'busy-1',
        name: 'WorkerBot',
        executionCount: 500,
      });
    });

    it('calculates token budget utilization', async () => {
      mockQueryPublic.mockResolvedValueOnce({ rows: [{ count: 2 }] });
      mockQueryPublic.mockResolvedValueOnce({ rows: [{ count: 2 }] });
      mockQueryPublic.mockResolvedValueOnce({
        rows: [{ total_executions: 5, total_tokens: '75000', success_rate: 1 }],
      });
      mockQueryPublic.mockResolvedValueOnce({ rows: [] });
      mockQueryPublic.mockResolvedValueOnce({ rows: [] });
      mockQueryPublic.mockResolvedValueOnce({ rows: [{ total_budget: '100000' }] });

      const overview = await agentAnalytics.getSystemOverview();

      expect(overview.tokenBudgetUtilization).toBeCloseTo(0.75);
    });
  });

  describe('getAgentPerformance', () => {
    it('returns performance for specific agent', async () => {
      // blueprint name
      mockQueryPublic.mockResolvedValueOnce({ rows: [{ name: 'Coder' }] });
      // execution stats
      mockQueryPublic.mockResolvedValueOnce({
        rows: [
          {
            total: 50,
            successful: 42,
            failed: 8,
            avg_duration: 1234.5,
            total_tokens: '80000',
            last_executed: '2026-04-01T12:00:00Z',
          },
        ],
      });

      const perf: AgentPerformance = await agentAnalytics.getAgentPerformance('agent-x');

      expect(perf.agentId).toBe('agent-x');
      expect(perf.agentName).toBe('Coder');
      expect(perf.totalExecutions).toBe(50);
      expect(perf.successfulExecutions).toBe(42);
      expect(perf.failedExecutions).toBe(8);
      expect(perf.successRate).toBeCloseTo(0.84);
      expect(perf.avgExecutionTimeMs).toBe(1234.5);
      expect(perf.totalTokensUsed).toBe(80000);
      expect(perf.avgTokensPerExecution).toBe(1600);
      expect(perf.lastExecutedAt).toBeInstanceOf(Date);
    });

    it('calculates success rate correctly', async () => {
      mockQueryPublic.mockResolvedValueOnce({ rows: [{ name: 'TestAgent' }] });
      mockQueryPublic.mockResolvedValueOnce({
        rows: [
          {
            total: 20,
            successful: 15,
            failed: 5,
            avg_duration: 500,
            total_tokens: '10000',
            last_executed: '2026-04-02T08:00:00Z',
          },
        ],
      });

      const perf = await agentAnalytics.getAgentPerformance('agent-y');

      expect(perf.successRate).toBeCloseTo(0.75);
      expect(perf.avgTokensPerExecution).toBe(500);
    });

    it('handles agent with no executions', async () => {
      mockQueryPublic.mockResolvedValueOnce({ rows: [{ name: 'IdleAgent' }] });
      mockQueryPublic.mockResolvedValueOnce({
        rows: [
          {
            total: 0,
            successful: 0,
            failed: 0,
            avg_duration: 0,
            total_tokens: '0',
            last_executed: null,
          },
        ],
      });

      const perf = await agentAnalytics.getAgentPerformance('idle-agent');

      expect(perf.agentName).toBe('IdleAgent');
      expect(perf.totalExecutions).toBe(0);
      expect(perf.successRate).toBe(0);
      expect(perf.avgTokensPerExecution).toBe(0);
      expect(perf.lastExecutedAt).toBeNull();
    });

    it('respects period parameter', async () => {
      mockQueryPublic.mockResolvedValueOnce({ rows: [{ name: 'PeriodAgent' }] });
      mockQueryPublic.mockResolvedValueOnce({
        rows: [
          {
            total: 10,
            successful: 9,
            failed: 1,
            avg_duration: 300,
            total_tokens: '5000',
            last_executed: '2026-04-03T10:00:00Z',
          },
        ],
      });

      await agentAnalytics.getAgentPerformance('period-agent', 14);

      // Second call is the stats query with the period parameter
      expect(mockQueryPublic).toHaveBeenCalledTimes(2);
      const statsCall = mockQueryPublic.mock.calls[1];
      expect(statsCall[1]).toEqual(['period-agent', 14]);
    });
  });

  describe('getOptimizationSuggestions', () => {
    it('returns underused suggestion for zero-usage agents', async () => {
      // underused
      mockQueryPublic.mockResolvedValueOnce({
        rows: [{ id: 'lazy-1', name: 'LazyBot' }],
      });
      // high failure
      mockQueryPublic.mockResolvedValueOnce({ rows: [] });
      // over budget
      mockQueryPublic.mockResolvedValueOnce({ rows: [] });

      const suggestions: OptimizationSuggestion[] =
        await agentAnalytics.getOptimizationSuggestions();

      expect(suggestions).toHaveLength(1);
      expect(suggestions[0].type).toBe('underused');
      expect(suggestions[0].agentId).toBe('lazy-1');
      expect(suggestions[0].agentName).toBe('LazyBot');
      expect(suggestions[0].severity).toBe('info');
      expect(suggestions[0].message).toContain('never been used');
    });

    it('returns high_failure suggestion for low success rate', async () => {
      mockQueryPublic.mockResolvedValueOnce({ rows: [] });
      // high failure
      mockQueryPublic.mockResolvedValueOnce({
        rows: [
          { id: 'fail-1', name: 'FailBot', total: 20, success_rate: '0.3' },
        ],
      });
      mockQueryPublic.mockResolvedValueOnce({ rows: [] });

      const suggestions = await agentAnalytics.getOptimizationSuggestions();

      expect(suggestions).toHaveLength(1);
      expect(suggestions[0].type).toBe('high_failure');
      expect(suggestions[0].severity).toBe('critical');
      expect(suggestions[0].message).toContain('30%');
      expect(suggestions[0].message).toContain('20 executions');
    });

    it('returns over_budget suggestion', async () => {
      mockQueryPublic.mockResolvedValueOnce({ rows: [] });
      mockQueryPublic.mockResolvedValueOnce({ rows: [] });
      // over budget
      mockQueryPublic.mockResolvedValueOnce({
        rows: [
          {
            id: 'spendy-1',
            name: 'SpendyBot',
            token_budget_daily: '10000',
            tokens_today: '9500',
          },
        ],
      });

      const suggestions = await agentAnalytics.getOptimizationSuggestions();

      expect(suggestions).toHaveLength(1);
      expect(suggestions[0].type).toBe('over_budget');
      expect(suggestions[0].severity).toBe('warning');
      expect(suggestions[0].message).toContain('95%');
    });

    it('returns empty array when all agents are healthy', async () => {
      mockQueryPublic.mockResolvedValueOnce({ rows: [] });
      mockQueryPublic.mockResolvedValueOnce({ rows: [] });
      mockQueryPublic.mockResolvedValueOnce({ rows: [] });

      const suggestions = await agentAnalytics.getOptimizationSuggestions();

      expect(suggestions).toHaveLength(0);
    });

    it('sorts by severity (critical first)', async () => {
      // underused (info)
      mockQueryPublic.mockResolvedValueOnce({
        rows: [{ id: 'u1', name: 'Unused1' }],
      });
      // high failure (critical)
      mockQueryPublic.mockResolvedValueOnce({
        rows: [{ id: 'f1', name: 'Failer1', total: 15, success_rate: '0.2' }],
      });
      // over budget (warning)
      mockQueryPublic.mockResolvedValueOnce({
        rows: [
          {
            id: 'b1',
            name: 'Budgeter1',
            token_budget_daily: '5000',
            tokens_today: '4800',
          },
        ],
      });

      const suggestions = await agentAnalytics.getOptimizationSuggestions();

      expect(suggestions).toHaveLength(3);
      expect(suggestions[0].severity).toBe('critical');
      expect(suggestions[1].severity).toBe('warning');
      expect(suggestions[2].severity).toBe('info');
    });
  });

  describe('getUsageTrends', () => {
    it('returns daily trends for period', async () => {
      mockQueryPublic.mockResolvedValueOnce({
        rows: [
          { date: '2026-04-01', executions: 10, tokens_used: '5000', success_rate: 0.9 },
          { date: '2026-04-02', executions: 15, tokens_used: '8000', success_rate: 0.8 },
          { date: '2026-04-03', executions: 12, tokens_used: '6000', success_rate: 1.0 },
        ],
      });

      const trends: UsageTrend[] = await agentAnalytics.getUsageTrends(7);

      expect(trends).toHaveLength(3);
      expect(trends[0]).toEqual({
        date: '2026-04-01',
        executions: 10,
        tokensUsed: 5000,
        successRate: 0.9,
      });
      expect(trends[1]).toEqual({
        date: '2026-04-02',
        executions: 15,
        tokensUsed: 8000,
        successRate: 0.8,
      });
      expect(trends[2]).toEqual({
        date: '2026-04-03',
        executions: 12,
        tokensUsed: 6000,
        successRate: 1.0,
      });
      expect(mockQueryPublic).toHaveBeenCalledTimes(1);
      expect(mockQueryPublic.mock.calls[0][1]).toEqual([7]);
    });

    it('handles empty period', async () => {
      mockQueryPublic.mockResolvedValueOnce({ rows: [] });

      const trends = await agentAnalytics.getUsageTrends(3);

      expect(trends).toHaveLength(0);
    });

    it('calculates daily success rate', async () => {
      mockQueryPublic.mockResolvedValueOnce({
        rows: [
          { date: '2026-04-05', executions: 20, tokens_used: '15000', success_rate: 0.65 },
        ],
      });

      const trends = await agentAnalytics.getUsageTrends();

      expect(trends).toHaveLength(1);
      expect(trends[0].successRate).toBeCloseTo(0.65);
      expect(trends[0].tokensUsed).toBe(15000);
    });
  });

  describe('singleton', () => {
    it('exports singleton instance', () => {
      expect(agentAnalytics).toBeDefined();
      expect(typeof agentAnalytics.getSystemOverview).toBe('function');
      expect(typeof agentAnalytics.getAgentPerformance).toBe('function');
      expect(typeof agentAnalytics.getOptimizationSuggestions).toBe('function');
      expect(typeof agentAnalytics.getUsageTrends).toBe('function');
    });
  });
});
