/**
 * Phase 100 B1: Parallel Agent Execution Tests
 */

import { AgentGraph, WorkflowState } from '../../../services/agents/agent-graph';

describe('Parallel Agent Execution', () => {
  // ===========================================
  // Parallel Node Type Tests
  // ===========================================

  describe('parallel node type', () => {
    it('should execute all branches concurrently with merge_strategy=all', async () => {
      const executionOrder: string[] = [];

      const graph = new AgentGraph('test-parallel');
      graph.addNode({
        id: 'parallel-step',
        type: 'parallel',
        config: {
          label: 'Parallel Research',
          parallel: {
            branches: [
              [{ from: 'parallel-step', to: 'branch-a' }],
              [{ from: 'parallel-step', to: 'branch-b' }],
            ],
            merge_strategy: 'all',
            timeout_ms: 5000,
          },
        },
      });
      graph.addNode({ id: 'branch-a', type: 'agent', config: { agentRole: 'researcher', label: 'A' } });
      graph.addNode({ id: 'branch-b', type: 'agent', config: { agentRole: 'coder', label: 'B' } });
      graph.addNode({ id: 'final', type: 'agent', config: { agentRole: 'reviewer', label: 'Final' } });
      graph.addEdge({ from: 'parallel-step', to: 'final' });
      graph.setStart('parallel-step');

      const agentExecutor = async (role: string, task: string, state: WorkflowState): Promise<string> => {
        executionOrder.push(`start-${role}`);
        // Simulate async work
        await new Promise(r => setTimeout(r, 10));
        executionOrder.push(`end-${role}`);
        return `Result from ${role}`;
      };

      const result = await graph.execute('test task', 'personal', agentExecutor);

      expect(result.success).toBe(true);
      // Both branches should have started before either ended (concurrent)
      const startA = executionOrder.indexOf('start-researcher');
      const startB = executionOrder.indexOf('start-coder');
      const endA = executionOrder.indexOf('end-researcher');
      const endB = executionOrder.indexOf('end-coder');
      expect(startA).toBeLessThan(endA);
      expect(startB).toBeLessThan(endB);
      // Both should start before both end (parallel)
      expect(Math.max(startA, startB)).toBeLessThan(Math.min(endA, endB));

      // Merged results should be in state variables
      expect(result.state.variables['parallel_results']).toBeDefined();
      const parallelResults = result.state.variables['parallel_results'] as string[];
      expect(parallelResults).toHaveLength(2);
      expect(parallelResults).toContain('Result from researcher');
      expect(parallelResults).toContain('Result from coder');
    });

    it('should use first result with merge_strategy=first', async () => {
      const graph = new AgentGraph('test-race');
      graph.addNode({
        id: 'race',
        type: 'parallel',
        config: {
          label: 'Race',
          parallel: {
            branches: [
              [{ from: 'race', to: 'slow' }],
              [{ from: 'race', to: 'fast' }],
            ],
            merge_strategy: 'first',
            timeout_ms: 5000,
          },
        },
      });
      graph.addNode({ id: 'slow', type: 'agent', config: { agentRole: 'researcher', label: 'Slow' } });
      graph.addNode({ id: 'fast', type: 'agent', config: { agentRole: 'coder', label: 'Fast' } });
      graph.setStart('race');

      const agentExecutor = async (role: string): Promise<string> => {
        if (role === 'researcher') {
          await new Promise(r => setTimeout(r, 200));
          return 'Slow result';
        }
        return 'Fast result';
      };

      const result = await graph.execute('test', 'personal', agentExecutor);
      expect(result.success).toBe(true);
      // The first result (fast) should win
      expect(result.finalOutput).toBe('Fast result');
    });

    it('should handle timeout with available results', async () => {
      const graph = new AgentGraph('test-timeout');
      graph.addNode({
        id: 'parallel',
        type: 'parallel',
        config: {
          label: 'Timeout test',
          parallel: {
            branches: [
              [{ from: 'parallel', to: 'quick' }],
              [{ from: 'parallel', to: 'stuck' }],
            ],
            merge_strategy: 'all',
            timeout_ms: 100,
          },
        },
      });
      graph.addNode({ id: 'quick', type: 'agent', config: { agentRole: 'researcher', label: 'Quick' } });
      graph.addNode({ id: 'stuck', type: 'agent', config: { agentRole: 'coder', label: 'Stuck' } });
      graph.setStart('parallel');

      const agentExecutor = async (role: string): Promise<string> => {
        if (role === 'coder') {
          await new Promise(r => setTimeout(r, 5000));
          return 'Never reached';
        }
        return 'Quick result';
      };

      const result = await graph.execute('test', 'personal', agentExecutor);
      // Should complete with partial results rather than failing
      expect(result.success).toBe(true);
      const parallelResults = result.state.variables['parallel_results'] as string[];
      expect(parallelResults).toContain('Quick result');
    });

    it('should emit progress events for parallel nodes', async () => {
      const events: string[] = [];
      const graph = new AgentGraph('test-progress');

      graph.addNode({
        id: 'par',
        type: 'parallel',
        config: {
          label: 'Par',
          parallel: {
            branches: [
              [{ from: 'par', to: 'a' }],
            ],
            merge_strategy: 'all',
            timeout_ms: 5000,
          },
        },
      });
      graph.addNode({ id: 'a', type: 'agent', config: { agentRole: 'researcher', label: 'A' } });
      graph.setStart('par');
      graph.setProgressCallback((e) => events.push(e.type));

      await graph.execute('test', 'personal', async () => 'ok');

      expect(events).toContain('node_start');
      expect(events).toContain('node_complete');
    });
  });

  // ===========================================
  // New Orchestrator Strategy Tests
  // ===========================================

  describe('new parallel strategies', () => {
    // We test the strategy pipeline definitions
    it('should define parallel_research pipeline', () => {
      // Import at test time to avoid circular dependency issues
      const { getAgentPipeline } = require('../../../services/agent-orchestrator');
      const pipeline = getAgentPipeline('parallel_research');
      expect(pipeline).toEqual(['researcher', 'researcher', 'writer', 'reviewer']);
    });

    it('should define parallel_code_review pipeline', () => {
      const { getAgentPipeline } = require('../../../services/agent-orchestrator');
      const pipeline = getAgentPipeline('parallel_code_review');
      expect(pipeline).toEqual(['coder', 'researcher', 'reviewer']);
    });

    it('should define full_parallel pipeline', () => {
      const { getAgentPipeline } = require('../../../services/agent-orchestrator');
      const pipeline = getAgentPipeline('full_parallel');
      expect(pipeline).toEqual(['researcher', 'coder', 'writer', 'reviewer']);
    });

    it('should classify parallel strategies from keywords', () => {
      const { classifyTeamStrategy } = require('../../../services/agent-orchestrator');
      expect(classifyTeamStrategy('recherchiere parallel aus verschiedenen Quellen und schreibe einen Bericht')).toBe('parallel_research');
      expect(classifyTeamStrategy('implementiere und recherchiere gleichzeitig, dann review')).toBe('parallel_code_review');
    });
  });
});
