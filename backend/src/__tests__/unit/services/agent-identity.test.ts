/**
 * Phase 64: Agent Identity + Graph + Workflow Store Tests
 */

import express from 'express';
import request from 'supertest';

// ===========================================
// Mocks - must be before imports
// ===========================================

const mockPoolQuery = jest.fn();

jest.mock('../../../utils/database-context', () => ({
  queryContext: jest.fn(),
  isValidContext: (ctx: string) =>
    ['personal', 'work', 'learning', 'creative'].includes(ctx),
  pool: { query: mockPoolQuery },
}));

jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-uuid-1234'),
}));

// ===========================================
// Imports (after mocks)
// ===========================================

import {
  getAgentIdentityService,
  resetAgentIdentityService,
  AgentIdentity,
  AgentPersona,
  AgentPermission,
} from '../../../services/agents/agent-identity';

import {
  AgentGraph,
  createResearchWriteReviewGraph,
  createCodeReviewGraph,
  createResearchCodeReviewGraph,
  WorkflowState,
  GraphProgressEvent,
} from '../../../services/agents/agent-graph';

import {
  getWorkflowStore,
  resetWorkflowStore,
} from '../../../services/agents/workflow-store';

// ===========================================
// Mock Data
// ===========================================

const mockIdentityRow = {
  id: 'agent-001',
  name: 'ResearchBot',
  role: 'researcher',
  persona: { tone: 'professional', expertise: ['typescript'], style: 'concise', language: 'de' },
  model: 'claude-sonnet-4-20250514',
  permissions: [{ resource: 'tools.*', actions: ['execute'], conditions: { maxCallsPerMinute: 10 } }],
  max_token_budget: 10000,
  max_execution_time_ms: 120000,
  trust_level: 'medium',
  governance_policy_id: null,
  memory_scope: 'research-ns',
  created_by: null,
  enabled: true,
  execution_count: 5,
  success_rate: 0.8,
  created_at: '2026-03-14T10:00:00Z',
  updated_at: '2026-03-14T10:00:00Z',
};

const mockWorkflowRow = {
  id: 'wf-001',
  name: 'test-workflow',
  description: 'A test workflow',
  graph_definition: { nodes: [], edges: [], startNodeId: null, name: 'test' },
  created_by: null,
  usage_count: 0,
  avg_duration_ms: 0,
  success_rate: 0,
  created_at: '2026-03-14T10:00:00Z',
  updated_at: '2026-03-14T10:00:00Z',
};

const mockRunRow = {
  id: 'run-001',
  workflow_id: 'wf-001',
  workflow_name: 'test-workflow',
  status: 'completed',
  state: {},
  node_history: [],
  started_at: '2026-03-14T10:00:00Z',
  completed_at: '2026-03-14T10:01:00Z',
  duration_ms: 60000,
  error: null,
};

// ===========================================
// AgentIdentityService Tests
// ===========================================

describe('AgentIdentityService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPoolQuery.mockReset();
    resetAgentIdentityService();
  });

  describe('createIdentity', () => {
    it('should create with default values', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [mockIdentityRow] });

      const service = getAgentIdentityService();
      const result = await service.createIdentity({ name: 'TestBot', role: 'researcher' });

      expect(result.name).toBe('ResearchBot');
      expect(result.role).toBe('researcher');
      expect(mockPoolQuery).toHaveBeenCalledTimes(1);
      const sql = mockPoolQuery.mock.calls[0][0];
      expect(sql).toContain('INSERT INTO public.agent_identities');
    });

    it('should create with custom persona', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [mockIdentityRow] });

      const service = getAgentIdentityService();
      await service.createIdentity({
        name: 'CustomBot',
        role: 'writer',
        persona: { tone: 'friendly', expertise: ['react', 'vue'], style: 'detailed', language: 'en' },
      });

      const params = mockPoolQuery.mock.calls[0][1];
      const persona = JSON.parse(params[3]);
      expect(persona.tone).toBe('friendly');
      expect(persona.expertise).toEqual(['react', 'vue']);
    });

    it('should create with all fields', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [mockIdentityRow] });

      const service = getAgentIdentityService();
      await service.createIdentity({
        name: 'FullBot',
        role: 'coder',
        model: 'claude-opus-4-20250514',
        permissions: [{ resource: 'tools.web_search', actions: ['execute'] }],
        maxTokenBudget: 5000,
        maxExecutionTimeMs: 60000,
        trustLevel: 'high',
        memoryScope: 'code-ns',
        createdBy: 'user-123',
      });

      const params = mockPoolQuery.mock.calls[0][1];
      expect(params[4]).toBe('claude-opus-4-20250514');
      expect(params[6]).toBe(5000);
      expect(params[7]).toBe(60000);
      expect(params[8]).toBe('high');
    });
  });

  describe('getIdentity', () => {
    it('should return identity when found', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [mockIdentityRow] });

      const service = getAgentIdentityService();
      const result = await service.getIdentity('agent-001');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('agent-001');
      expect(result!.persona.tone).toBe('professional');
    });

    it('should return null when not found', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      const service = getAgentIdentityService();
      const result = await service.getIdentity('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('listIdentities', () => {
    it('should list all identities', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [mockIdentityRow] });

      const service = getAgentIdentityService();
      const result = await service.listIdentities();

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('ResearchBot');
    });

    it('should filter by role', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [mockIdentityRow] });

      const service = getAgentIdentityService();
      await service.listIdentities({ role: 'researcher' });

      const sql = mockPoolQuery.mock.calls[0][0];
      expect(sql).toContain('AND role = $1');
      expect(mockPoolQuery.mock.calls[0][1]).toEqual(['researcher']);
    });

    it('should filter by enabled', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      const service = getAgentIdentityService();
      await service.listIdentities({ enabled: true });

      const sql = mockPoolQuery.mock.calls[0][0];
      expect(sql).toContain('AND enabled = $1');
    });
  });

  describe('updateIdentity', () => {
    it('should update partial fields', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ ...mockIdentityRow, name: 'UpdatedBot' }] });

      const service = getAgentIdentityService();
      const result = await service.updateIdentity('agent-001', { name: 'UpdatedBot' });

      expect(result).not.toBeNull();
      expect(result!.name).toBe('UpdatedBot');
      const sql = mockPoolQuery.mock.calls[0][0];
      expect(sql).toContain('UPDATE public.agent_identities');
    });

    it('should return null when not found', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      const service = getAgentIdentityService();
      const result = await service.updateIdentity('nonexistent', { name: 'X' });
      expect(result).toBeNull();
    });

    it('should handle enabled=false update', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ ...mockIdentityRow, enabled: false }] });

      const service = getAgentIdentityService();
      const result = await service.updateIdentity('agent-001', { enabled: false });
      expect(result).not.toBeNull();
    });
  });

  describe('deleteIdentity', () => {
    it('should return true on success', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rowCount: 1 });

      const service = getAgentIdentityService();
      const result = await service.deleteIdentity('agent-001');
      expect(result).toBe(true);
    });

    it('should return false when not found', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rowCount: 0 });

      const service = getAgentIdentityService();
      const result = await service.deleteIdentity('nonexistent');
      expect(result).toBe(false);
    });
  });

  describe('validateAction', () => {
    it('should allow when permissions match', async () => {
      // getIdentity query
      mockPoolQuery.mockResolvedValueOnce({ rows: [mockIdentityRow] });
      // rate limit query
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ cnt: '0' }] });
      // logAction query
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      const service = getAgentIdentityService();
      const result = await service.validateAction('agent-001', {
        type: 'tool_call',
        resource: 'tools.web_search',
        impactLevel: 'low',
      });

      expect(result.allowed).toBe(true);
    });

    it('should deny when agent not found', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      const service = getAgentIdentityService();
      const result = await service.validateAction('nonexistent', {
        type: 'tool_call',
        resource: 'tools.x',
        impactLevel: 'low',
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('agent_not_found');
    });

    it('should deny when agent is disabled', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ ...mockIdentityRow, enabled: false }] });

      const service = getAgentIdentityService();
      const result = await service.validateAction('agent-001', {
        type: 'tool_call',
        resource: 'tools.x',
        impactLevel: 'low',
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('agent_disabled');
    });

    it('should deny when no matching permission', async () => {
      const restrictedAgent = {
        ...mockIdentityRow,
        permissions: [{ resource: 'tools.web_search', actions: ['read'] }],
      };
      mockPoolQuery.mockResolvedValueOnce({ rows: [restrictedAgent] });
      // logAction
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      const service = getAgentIdentityService();
      const result = await service.validateAction('agent-001', {
        type: 'tool_call',
        resource: 'tools.execute_code',
        impactLevel: 'low',
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('insufficient_permissions');
    });

    it('should deny when rate limited', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [mockIdentityRow] });
      // rate limit count exceeds maxCallsPerMinute (10)
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ cnt: '15' }] });
      // logAction
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      const service = getAgentIdentityService();
      const result = await service.validateAction('agent-001', {
        type: 'tool_call',
        resource: 'tools.web_search',
        impactLevel: 'low',
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('rate_limited');
    });

    it('should deny low-trust agent for high-impact action', async () => {
      const lowTrustAgent = { ...mockIdentityRow, trust_level: 'low', permissions: [] };
      mockPoolQuery.mockResolvedValueOnce({ rows: [lowTrustAgent] });
      // rate limit
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ cnt: '0' }] });
      // logAction
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      const service = getAgentIdentityService();
      const result = await service.validateAction('agent-001', {
        type: 'delete_data',
        resource: 'data.emails',
        impactLevel: 'high',
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('requires_approval');
    });

    it('should allow when no permissions defined (backward compat)', async () => {
      const noPermsAgent = { ...mockIdentityRow, permissions: [] };
      mockPoolQuery.mockResolvedValueOnce({ rows: [noPermsAgent] });
      // rate limit
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ cnt: '0' }] });
      // logAction
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      const service = getAgentIdentityService();
      const result = await service.validateAction('agent-001', {
        type: 'tool_call',
        resource: 'tools.anything',
        impactLevel: 'low',
      });

      expect(result.allowed).toBe(true);
    });
  });

  describe('recordExecution', () => {
    it('should update stats on success', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      const service = getAgentIdentityService();
      await service.recordExecution('agent-001', true);

      expect(mockPoolQuery).toHaveBeenCalledTimes(1);
      const params = mockPoolQuery.mock.calls[0][1];
      expect(params[0]).toBe(1.0);
    });

    it('should update stats on failure', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      const service = getAgentIdentityService();
      await service.recordExecution('agent-001', false);

      const params = mockPoolQuery.mock.calls[0][1];
      expect(params[0]).toBe(0.0);
    });
  });

  describe('buildPersonaPrompt', () => {
    it('should build full persona prompt', () => {
      const service = getAgentIdentityService();
      const identity: AgentIdentity = {
        id: 'test',
        name: 'TestBot',
        role: 'researcher',
        persona: {
          tone: 'academic',
          expertise: ['AI', 'ML'],
          style: 'detailed',
          language: 'en',
          customInstructions: 'Always cite sources.',
        },
        model: 'claude-sonnet-4-20250514',
        permissions: [],
        maxTokenBudget: 10000,
        maxExecutionTimeMs: 120000,
        trustLevel: 'medium',
        governancePolicyId: null,
        memoryScope: null,
        createdBy: null,
        enabled: true,
        executionCount: 0,
        successRate: 0,
        createdAt: '',
        updatedAt: '',
      };

      const prompt = service.buildPersonaPrompt(identity);

      expect(prompt).toContain('You are TestBot, a researcher agent.');
      expect(prompt).toContain('Communication tone: academic');
      expect(prompt).toContain('Areas of expertise: AI, ML');
      expect(prompt).toContain('Response style: detailed');
      expect(prompt).toContain('Primary language: en');
      expect(prompt).toContain('Always cite sources.');
    });

    it('should build minimal persona prompt', () => {
      const service = getAgentIdentityService();
      const identity: AgentIdentity = {
        id: 'test',
        name: 'MinBot',
        role: 'writer',
        persona: { tone: '', expertise: [], style: '', language: '', },
        model: 'claude-sonnet-4-20250514',
        permissions: [],
        maxTokenBudget: 10000,
        maxExecutionTimeMs: 120000,
        trustLevel: 'medium',
        governancePolicyId: null,
        memoryScope: null,
        createdBy: null,
        enabled: true,
        executionCount: 0,
        successRate: 0,
        createdAt: '',
        updatedAt: '',
      };

      const prompt = service.buildPersonaPrompt(identity);
      expect(prompt).toContain('You are MinBot, a writer agent.');
      // Empty expertise should not add "Areas of expertise:"
      expect(prompt).not.toContain('Areas of expertise:');
    });
  });
});

// ===========================================
// AgentGraph Tests
// ===========================================

describe('AgentGraph', () => {
  describe('construction', () => {
    it('should add nodes', () => {
      const graph = new AgentGraph('test')
        .addNode({ id: 'n1', type: 'agent', config: { agentRole: 'researcher' } })
        .addNode({ id: 'n2', type: 'agent', config: { agentRole: 'writer' } });

      expect(graph.getNodes()).toHaveLength(2);
    });

    it('should add edges', () => {
      const graph = new AgentGraph('test')
        .addNode({ id: 'n1', type: 'agent', config: {} })
        .addNode({ id: 'n2', type: 'agent', config: {} })
        .addEdge({ from: 'n1', to: 'n2' });

      expect(graph.getEdges()).toHaveLength(1);
    });

    it('should set start node', () => {
      const graph = new AgentGraph('test')
        .addNode({ id: 'a', type: 'agent', config: {} })
        .addNode({ id: 'b', type: 'agent', config: {} })
        .setStart('b');

      // First non-condition node becomes start, but setStart overrides
      const serialized = graph.serialize();
      expect(serialized.startNodeId).toBe('b');
    });
  });

  describe('execute', () => {
    it('should execute linear workflow with 3 nodes', async () => {
      const graph = new AgentGraph('linear')
        .addNode({ id: 'r', type: 'agent', config: { agentRole: 'researcher' } })
        .addNode({ id: 'w', type: 'agent', config: { agentRole: 'writer' } })
        .addNode({ id: 'v', type: 'agent', config: { agentRole: 'reviewer' } })
        .addEdge({ from: 'r', to: 'w' })
        .addEdge({ from: 'w', to: 'v' })
        .setStart('r');

      const executor = jest.fn().mockImplementation((role: string) =>
        Promise.resolve(`${role} output`)
      );

      const result = await graph.execute('test task', 'personal', executor);

      expect(result.success).toBe(true);
      expect(result.nodeHistory).toHaveLength(3);
      expect(executor).toHaveBeenCalledTimes(3);
      expect(result.state.status).toBe('completed');
    });

    it('should handle conditional routing', async () => {
      const graph = new AgentGraph('conditional')
        .addNode({ id: 'start', type: 'agent', config: { agentRole: 'researcher' } })
        .addNode({
          id: 'gate', type: 'condition', config: {
            condition: (state: WorkflowState) => {
              return state.nodeResults['start']?.output.includes('good') ? 'done' : 'retry';
            },
          },
        })
        .addNode({ id: 'done', type: 'agent', config: { agentRole: 'writer' } })
        .addNode({ id: 'retry', type: 'agent', config: { agentRole: 'researcher' } })
        .addEdge({ from: 'start', to: 'gate' })
        .setStart('start');

      const executor = jest.fn()
        .mockResolvedValueOnce('good results')
        .mockResolvedValueOnce('final write');

      const result = await graph.execute('test', 'personal', executor);

      expect(result.success).toBe(true);
      expect(result.nodeHistory).toHaveLength(3); // start + condition + done
    });

    it('should pause on human_review node', async () => {
      const graph = new AgentGraph('review')
        .addNode({ id: 'work', type: 'agent', config: { agentRole: 'coder' } })
        .addNode({ id: 'review', type: 'human_review', config: { label: 'Human Review' } })
        .addNode({ id: 'publish', type: 'agent', config: { agentRole: 'writer' } })
        .addEdge({ from: 'work', to: 'review' })
        .addEdge({ from: 'review', to: 'publish' })
        .setStart('work');

      const result = await graph.execute('test', 'personal');

      expect(result.state.status).toBe('paused');
      expect(result.nodeHistory).toHaveLength(2); // work + review
      expect(result.nodeHistory[1].nodeType).toBe('human_review');
    });

    it('should fail on max iterations exceeded', async () => {
      const graph = new AgentGraph('loop')
        .addNode({ id: 'a', type: 'agent', config: { agentRole: 'researcher' } })
        .addNode({ id: 'b', type: 'agent', config: { agentRole: 'writer' } })
        .addEdge({ from: 'a', to: 'b' })
        .addEdge({ from: 'b', to: 'a' })
        .setStart('a');

      const result = await graph.execute('test', 'personal', undefined, undefined, 3);

      expect(result.success).toBe(false);
      expect(result.state.status).toBe('failed');
      expect(result.nodeHistory.length).toBeLessThanOrEqual(3);
    });

    it('should handle error in agent executor', async () => {
      const graph = new AgentGraph('error')
        .addNode({ id: 'fail', type: 'agent', config: { agentRole: 'researcher' } })
        .setStart('fail');

      const executor = jest.fn().mockRejectedValue(new Error('API error'));

      const result = await graph.execute('test', 'personal', executor);

      expect(result.success).toBe(false);
      expect(result.state.status).toBe('failed');
      expect(result.nodeHistory[0].success).toBe(false);
      expect(result.nodeHistory[0].output).toBe('API error');
    });

    it('should handle empty graph', async () => {
      const graph = new AgentGraph('empty');

      const result = await graph.execute('test', 'personal');

      expect(result.success).toBe(false);
      expect(result.finalOutput).toBe('No start node defined');
    });

    it('should use default output when no executor provided', async () => {
      const graph = new AgentGraph('default')
        .addNode({ id: 'n1', type: 'agent', config: { agentRole: 'writer' } })
        .setStart('n1');

      const result = await graph.execute('hello world', 'personal');

      expect(result.success).toBe(true);
      expect(result.finalOutput).toContain('[Agent writer output for:');
    });

    it('should call tool executor for tool nodes', async () => {
      const graph = new AgentGraph('tool')
        .addNode({ id: 't1', type: 'tool', config: { toolName: 'web_search' } })
        .setStart('t1');

      const toolExec = jest.fn().mockResolvedValue('search results');

      const result = await graph.execute('test', 'personal', undefined, toolExec);

      expect(result.success).toBe(true);
      expect(toolExec).toHaveBeenCalledWith('web_search', expect.any(Object));
    });

    it('should fail when condition routes to unknown node', async () => {
      const graph = new AgentGraph('bad-condition')
        .addNode({
          id: 'cond', type: 'condition', config: {
            condition: () => 'nonexistent',
          },
        })
        .setStart('cond');

      const result = await graph.execute('test', 'personal');

      expect(result.success).toBe(false);
      expect(result.nodeHistory[0].output).toContain('Condition routed to unknown node');
    });

    it('should fail when condition has no function', async () => {
      const graph = new AgentGraph('no-cond-fn')
        .addNode({ id: 'cond', type: 'condition', config: {} })
        .setStart('cond');

      const result = await graph.execute('test', 'personal');

      expect(result.success).toBe(false);
      expect(result.nodeHistory[0].output).toContain('has no condition function');
    });
  });

  describe('progress callbacks', () => {
    it('should emit node_start and node_complete events', async () => {
      const events: GraphProgressEvent[] = [];
      const graph = new AgentGraph('progress')
        .addNode({ id: 'n1', type: 'agent', config: { agentRole: 'researcher' } })
        .setStart('n1')
        .setProgressCallback((e) => events.push(e));

      await graph.execute('test', 'personal');

      const types = events.map(e => e.type);
      expect(types).toContain('node_start');
      expect(types).toContain('node_complete');
      expect(types).toContain('workflow_complete');
    });

    it('should emit workflow_paused for human_review', async () => {
      const events: GraphProgressEvent[] = [];
      const graph = new AgentGraph('pause')
        .addNode({ id: 'hr', type: 'human_review', config: {} })
        .setStart('hr')
        .setProgressCallback((e) => events.push(e));

      await graph.execute('test', 'personal');

      const types = events.map(e => e.type);
      expect(types).toContain('workflow_paused');
    });

    it('should emit node_error on failure', async () => {
      const events: GraphProgressEvent[] = [];
      const graph = new AgentGraph('err')
        .addNode({ id: 'n1', type: 'agent', config: {} })
        .setStart('n1')
        .setProgressCallback((e) => events.push(e));

      const badExec = jest.fn().mockRejectedValue(new Error('boom'));
      await graph.execute('test', 'personal', badExec);

      const types = events.map(e => e.type);
      expect(types).toContain('node_error');
    });

    it('should ignore errors in progress callback', async () => {
      const graph = new AgentGraph('err-cb')
        .addNode({ id: 'n1', type: 'agent', config: {} })
        .setStart('n1')
        .setProgressCallback(() => { throw new Error('cb error'); });

      // Should not throw
      const result = await graph.execute('test', 'personal');
      expect(result.success).toBe(true);
    });
  });

  describe('serialize', () => {
    it('should strip condition functions', () => {
      const graph = new AgentGraph('ser')
        .addNode({
          id: 'c', type: 'condition', config: {
            condition: () => 'next',
            label: 'Gate',
          },
        });

      const serialized = graph.serialize();
      expect(serialized.nodes[0].config.condition).toBeUndefined();
      expect(serialized.nodes[0].config.label).toBe('Gate');
    });

    it('should include name and startNodeId', () => {
      const graph = new AgentGraph('myname')
        .addNode({ id: 'n1', type: 'agent', config: {} })
        .setStart('n1');

      const serialized = graph.serialize();
      expect(serialized.name).toBe('myname');
      expect(serialized.startNodeId).toBe('n1');
    });
  });

  describe('pre-built templates', () => {
    it('createResearchWriteReviewGraph has 3 nodes and 2 edges', () => {
      const graph = createResearchWriteReviewGraph();
      expect(graph.getNodes()).toHaveLength(3);
      expect(graph.getEdges()).toHaveLength(2);
      expect(graph.getName()).toBe('research-write-review');
    });

    it('createCodeReviewGraph has 2 nodes and 1 edge', () => {
      const graph = createCodeReviewGraph();
      expect(graph.getNodes()).toHaveLength(2);
      expect(graph.getEdges()).toHaveLength(1);
      expect(graph.getName()).toBe('code-review');
    });

    it('createResearchCodeReviewGraph has 3 nodes and 2 edges', () => {
      const graph = createResearchCodeReviewGraph();
      expect(graph.getNodes()).toHaveLength(3);
      expect(graph.getEdges()).toHaveLength(2);
      expect(graph.getName()).toBe('research-code-review');
    });

    it('templates execute successfully', async () => {
      const graph = createResearchWriteReviewGraph();
      const executor = jest.fn().mockResolvedValue('output');
      const result = await graph.execute('task', 'personal', executor);
      expect(result.success).toBe(true);
      expect(executor).toHaveBeenCalledTimes(3);
    });
  });
});

// ===========================================
// WorkflowStore Tests
// ===========================================

describe('WorkflowStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPoolQuery.mockReset();
    resetWorkflowStore();
  });

  describe('saveWorkflow', () => {
    it('should save and return workflow', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [mockWorkflowRow] });

      const store = getWorkflowStore();
      const result = await store.saveWorkflow({
        name: 'test-workflow',
        graphDefinition: { nodes: [] },
      });

      expect(result.id).toBe('wf-001');
      expect(result.name).toBe('test-workflow');
    });
  });

  describe('getWorkflow', () => {
    it('should return workflow when found', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [mockWorkflowRow] });

      const store = getWorkflowStore();
      const result = await store.getWorkflow('wf-001');
      expect(result).not.toBeNull();
      expect(result!.name).toBe('test-workflow');
    });

    it('should return null when not found', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      const store = getWorkflowStore();
      const result = await store.getWorkflow('x');
      expect(result).toBeNull();
    });
  });

  describe('listWorkflows', () => {
    it('should list all workflows', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [mockWorkflowRow] });

      const store = getWorkflowStore();
      const result = await store.listWorkflows();
      expect(result).toHaveLength(1);
    });
  });

  describe('deleteWorkflow', () => {
    it('should return true on success', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rowCount: 1 });

      const store = getWorkflowStore();
      const result = await store.deleteWorkflow('wf-001');
      expect(result).toBe(true);
    });

    it('should return false when not found', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rowCount: 0 });

      const store = getWorkflowStore();
      const result = await store.deleteWorkflow('x');
      expect(result).toBe(false);
    });
  });

  describe('recordRun', () => {
    it('should record and update workflow stats', async () => {
      // recordRun insert
      mockPoolQuery.mockResolvedValueOnce({ rows: [mockRunRow] });
      // update workflow stats
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      const store = getWorkflowStore();
      const result = await store.recordRun({
        workflowId: 'wf-001',
        workflowName: 'test',
        status: 'completed',
        state: {},
        nodeHistory: [],
        durationMs: 1000,
      });

      expect(result.id).toBe('run-001');
      expect(mockPoolQuery).toHaveBeenCalledTimes(2);
    });

    it('should record without workflowId', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [mockRunRow] });

      const store = getWorkflowStore();
      const result = await store.recordRun({
        workflowName: 'ad-hoc',
        status: 'completed',
        state: {},
        nodeHistory: [],
      });

      expect(result.id).toBe('run-001');
      // Should not update workflow stats
      expect(mockPoolQuery).toHaveBeenCalledTimes(1);
    });
  });

  describe('listRuns', () => {
    it('should list runs with filters', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [mockRunRow] });

      const store = getWorkflowStore();
      const result = await store.listRuns({ status: 'completed', limit: 5 });

      expect(result).toHaveLength(1);
      const sql = mockPoolQuery.mock.calls[0][0];
      expect(sql).toContain('AND status = $1');
    });

    it('should list runs by workflowId', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      const store = getWorkflowStore();
      await store.listRuns({ workflowId: 'wf-001' });

      const sql = mockPoolQuery.mock.calls[0][0];
      expect(sql).toContain('AND workflow_id = $1');
    });
  });
});

// ===========================================
// Route Tests
// ===========================================

describe('Agent Identity Routes', () => {
  let app: express.Express;

  beforeAll(() => {
    // Reset singletons
    resetAgentIdentityService();
    resetWorkflowStore();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockPoolQuery.mockReset();

    app = express();
    app.use(express.json());
    // Import route
    const { agentIdentityRouter } = require('../../../routes/agent-identity');
    app.use('/api', agentIdentityRouter);
    const { errorHandler } = require('../../../middleware/errorHandler');
    app.use(errorHandler);
  });

  it('GET /api/agent-identities should list identities', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [mockIdentityRow] });

    const res = await request(app).get('/api/agent-identities');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
  });

  it('GET /api/agent-identities/:id should return identity', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [mockIdentityRow] });

    const res = await request(app).get('/api/agent-identities/agent-001');
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe('agent-001');
  });

  it('GET /api/agent-identities/:id returns 404', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get('/api/agent-identities/x');
    expect(res.status).toBe(404);
  });

  it('POST /api/agent-identities should create', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [mockIdentityRow] });

    const res = await request(app)
      .post('/api/agent-identities')
      .send({ name: 'NewBot', role: 'researcher' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  it('PUT /api/agent-identities/:id should update', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [mockIdentityRow] });

    const res = await request(app)
      .put('/api/agent-identities/agent-001')
      .send({ name: 'Updated' });

    expect(res.status).toBe(200);
  });

  it('DELETE /api/agent-identities/:id should delete', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rowCount: 1 });

    const res = await request(app).delete('/api/agent-identities/agent-001');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('POST /api/agent-identities/:id/validate should validate action', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ ...mockIdentityRow, permissions: [] }] });
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ cnt: '0' }] });
    mockPoolQuery.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post('/api/agent-identities/agent-001/validate')
      .send({ type: 'tool_call', resource: 'tools.x', impactLevel: 'low' });

    expect(res.status).toBe(200);
    expect(res.body.data.allowed).toBe(true);
  });

  it('GET /api/agent-workflows should list workflows', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [mockWorkflowRow] });

    const res = await request(app).get('/api/agent-workflows');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it('GET /api/agent-workflows/templates should return templates', async () => {
    const res = await request(app).get('/api/agent-workflows/templates');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(3);
    expect(res.body.data[0].name).toBe('research-write-review');
  });

  it('POST /api/agent-workflows should save workflow', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [mockWorkflowRow] });

    const res = await request(app)
      .post('/api/agent-workflows')
      .send({ name: 'test', graphDefinition: { nodes: [] } });

    expect(res.status).toBe(201);
  });

  it('GET /api/agent-workflow-runs should list runs', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [mockRunRow] });

    const res = await request(app).get('/api/agent-workflow-runs');
    expect(res.status).toBe(200);
  });
});
