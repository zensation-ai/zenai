/**
 * Agent Runtime Tests - Phase 42
 */

import { agentRuntime, AgentEvent } from '../../../services/agents/agent-runtime';
import { AGENT_TEMPLATES } from '../../../services/agents/agent-templates';

// Mock dependencies
jest.mock('../../../utils/database-context', () => ({
  queryContext: jest.fn(),
  isValidContext: jest.fn((c: string) => ['personal', 'work', 'learning', 'creative'].includes(c)),
}));

jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('../../../services/agent-orchestrator', () => ({
  executeTeamTask: jest.fn().mockResolvedValue({
    teamId: 'test-team',
    success: true,
    finalOutput: 'Task completed successfully',
    agentResults: [{ role: 'researcher', success: true, toolsUsed: ['search_ideas'], content: 'done', tokensUsed: { input: 100, output: 50 }, executionTimeMs: 1000 }],
    executionTimeMs: 2000,
    strategy: 'research_only' as const,
    totalTokens: { input: 100, output: 50 },
    memoryStats: { totalEntries: 0, byAgent: {} },
  }),
}));

jest.mock('../../../services/push-notifications', () => ({
  sendNotification: jest.fn().mockResolvedValue({ success: true, sent: 0, failed: 0, results: [] }),
}));

var mockQueryContext = jest.requireMock('../../../utils/database-context').queryContext;

describe('Agent Runtime', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    agentRuntime.stop(); // Reset state
  });

  describe('start()', () => {
    it('should load active agents from all contexts', async () => {
      mockQueryContext.mockResolvedValue({ rows: [] });

      await agentRuntime.start();

      // Should query all 4 contexts
      expect(mockQueryContext).toHaveBeenCalledTimes(4);
      expect(mockQueryContext).toHaveBeenCalledWith('personal', expect.stringContaining('agent_definitions'), []);
      expect(mockQueryContext).toHaveBeenCalledWith('work', expect.stringContaining('agent_definitions'), []);
    });

    it('should handle missing tables gracefully', async () => {
      mockQueryContext.mockRejectedValue(new Error('relation does not exist'));

      await agentRuntime.start();

      // Should not throw, just log debug
      const running = agentRuntime.listRunning();
      expect(running).toHaveLength(0);
    });

    it('should register loaded agents', async () => {
      mockQueryContext.mockResolvedValue({
        rows: [{
          id: 'agent-1',
          name: 'Test Agent',
          description: 'A test',
          instructions: 'Do stuff',
          triggers: JSON.stringify([{ type: 'manual', config: {} }]),
          tools: ['search_ideas'],
          context: 'personal',
          status: 'active',
          approval_required: false,
          max_actions_per_day: 50,
          token_budget_daily: 100000,
          template_id: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }],
      });

      await agentRuntime.start();

      const running = agentRuntime.listRunning();
      // At least 1 agent loaded (from first context)
      expect(running.length).toBeGreaterThanOrEqual(1);
      expect(running[0].name).toBe('Test Agent');
    });
  });

  describe('processEvent()', () => {
    it('should match agents by trigger type and context', async () => {
      // Setup: register an agent
      mockQueryContext.mockResolvedValue({
        rows: [{
          id: 'agent-1',
          name: 'Email Agent',
          description: null,
          instructions: 'Handle emails',
          triggers: JSON.stringify([{ type: 'email_received', config: {} }]),
          tools: [],
          context: 'work',
          status: 'active',
          approval_required: false,
          max_actions_per_day: 50,
          token_budget_daily: 100000,
          template_id: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }],
      });

      await agentRuntime.start();

      // Reset mock for execution queries
      mockQueryContext.mockResolvedValue({ rows: [] });

      const event: AgentEvent = {
        type: 'email_received',
        context: 'work',
        data: { subject: 'Test email' },
      };

      const executions = await agentRuntime.processEvent(event);
      expect(executions.length).toBeGreaterThanOrEqual(1);
      expect(executions[0].triggerType).toBe('email_received');
    });

    it('should skip agents in wrong context', async () => {
      mockQueryContext.mockResolvedValue({
        rows: [{
          id: 'agent-1',
          name: 'Personal Agent',
          description: null,
          instructions: 'Handle stuff',
          triggers: JSON.stringify([{ type: 'manual', config: {} }]),
          tools: [],
          context: 'personal',
          status: 'active',
          approval_required: false,
          max_actions_per_day: 50,
          token_budget_daily: 100000,
          template_id: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }],
      });

      await agentRuntime.start();
      mockQueryContext.mockResolvedValue({ rows: [] });

      const event: AgentEvent = {
        type: 'manual',
        context: 'work', // Different context
        data: {},
      };

      const executions = await agentRuntime.processEvent(event);
      expect(executions).toHaveLength(0);
    });

    it('should respect daily action limits', async () => {
      mockQueryContext.mockResolvedValue({
        rows: [{
          id: 'agent-limited',
          name: 'Limited Agent',
          description: null,
          instructions: 'Do things',
          triggers: JSON.stringify([{ type: 'manual', config: {} }]),
          tools: [],
          context: 'personal',
          status: 'active',
          approval_required: false,
          max_actions_per_day: 1, // Only 1 action per day
          token_budget_daily: 100000,
          template_id: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }],
      });

      await agentRuntime.start();
      mockQueryContext.mockResolvedValue({ rows: [] });

      const event: AgentEvent = { type: 'manual', context: 'personal', data: {} };

      // First execution should work
      const first = await agentRuntime.processEvent(event);
      expect(first.length).toBeGreaterThanOrEqual(1);

      // Second should be rate-limited
      const second = await agentRuntime.processEvent(event);
      expect(second).toHaveLength(0);
    });
  });

  describe('CRUD operations', () => {
    it('should create and retrieve an agent', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [{
          id: 'new-agent',
          name: 'New Agent',
          description: 'Test',
          instructions: 'Do things',
          triggers: '[]',
          tools: ['search_ideas'],
          context: 'personal',
          status: 'active',
          approval_required: false,
          max_actions_per_day: 50,
          token_budget_daily: 100000,
          template_id: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }],
      });

      const agent = await agentRuntime.createAgent('personal' as const, {
        name: 'New Agent',
        description: 'Test',
        instructions: 'Do things',
        tools: ['search_ideas'],
        triggers: [],
      });

      expect(agent.name).toBe('New Agent');
      expect(agent.tools).toContain('search_ideas');

      // Should be registered in runtime
      const running = agentRuntime.listRunning();
      expect(running.some(r => r.id === 'new-agent')).toBe(true);
    });

    it('should delete an agent', async () => {
      // First create
      mockQueryContext.mockResolvedValueOnce({
        rows: [{
          id: 'del-agent',
          name: 'Delete Me',
          description: null,
          instructions: 'Test',
          triggers: '[]',
          tools: [],
          context: 'personal',
          status: 'active',
          approval_required: false,
          max_actions_per_day: 50,
          token_budget_daily: 100000,
          template_id: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }],
      });

      await agentRuntime.createAgent('personal' as const, {
        name: 'Delete Me',
        instructions: 'Test',
        triggers: [],
        tools: [],
      });

      // Then delete
      mockQueryContext.mockResolvedValueOnce({ rows: [{ id: 'del-agent' }] });
      const deleted = await agentRuntime.deleteAgent('personal' as const, 'del-agent');
      expect(deleted).toBe(true);

      // Should be removed from runtime
      const running = agentRuntime.listRunning();
      expect(running.some(r => r.id === 'del-agent')).toBe(false);
    });
  });

  describe('listRunning()', () => {
    it('should return empty when no agents', () => {
      const running = agentRuntime.listRunning();
      expect(running).toEqual([]);
    });
  });
});

describe('Agent Templates', () => {
  it('should have at least 5 templates', () => {
    expect(AGENT_TEMPLATES.length).toBeGreaterThanOrEqual(5);
  });

  it('should have required fields on all templates', () => {
    for (const template of AGENT_TEMPLATES) {
      expect(template.id).toBeTruthy();
      expect(template.name).toBeTruthy();
      expect(template.description).toBeTruthy();
      expect(template.instructions).toBeTruthy();
      expect(template.triggers.length).toBeGreaterThanOrEqual(1);
      expect(template.category).toBeTruthy();
    }
  });

  it('should have valid trigger types', () => {
    const validTypes = ['email_received', 'task_due', 'calendar_soon', 'schedule', 'idea_created', 'webhook', 'pattern_detected', 'manual'];
    for (const template of AGENT_TEMPLATES) {
      for (const trigger of template.triggers) {
        expect(validTypes).toContain(trigger.type);
      }
    }
  });

  it('should include email-triage template', () => {
    const emailTemplate = AGENT_TEMPLATES.find(t => t.id === 'email-triage');
    expect(emailTemplate).toBeDefined();
    expect(emailTemplate!.triggers[0].type).toBe('email_received');
  });

  it('should include daily-briefing with schedule trigger', () => {
    const briefing = AGENT_TEMPLATES.find(t => t.id === 'daily-briefing');
    expect(briefing).toBeDefined();
    expect(briefing!.triggers[0].type).toBe('schedule');
    expect(briefing!.triggers[0].config).toHaveProperty('cron');
  });
});
