import { BUILT_IN_AGENTS, type AgentCategory } from '../../../../services/agents/built-in-agents';

describe('Built-In Agents', () => {
  it('exports exactly 8 agents', () => {
    expect(BUILT_IN_AGENTS).toHaveLength(8);
  });

  it('each agent has required fields', () => {
    for (const agent of BUILT_IN_AGENTS) {
      expect(agent.id).toBeTruthy();
      expect(agent.name).toBeTruthy();
      expect(agent.description).toBeTruthy();
      expect(agent.icon).toBeTruthy();
      expect(agent.category).toBeTruthy();
      expect(agent.tools.length).toBeGreaterThan(0);
      expect(agent.instructions).toBeTruthy();
      expect(agent.triggers.length).toBeGreaterThan(0);
      expect(agent.maxActionsPerDay).toBeGreaterThan(0);
      expect(agent.tokenBudgetDaily).toBeGreaterThan(0);
      expect(typeof agent.approvalRequired).toBe('boolean');
    }
  });

  it('agent IDs are unique', () => {
    const ids = BUILT_IN_AGENTS.map(a => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('expected agent IDs exist', () => {
    const ids = BUILT_IN_AGENTS.map(a => a.id);
    expect(ids).toContain('email_triage');
    expect(ids).toContain('meeting_prep');
    expect(ids).toContain('daily_digest');
    expect(ids).toContain('research_monitor');
    expect(ids).toContain('content_calendar');
    expect(ids).toContain('expense_tracker');
    expect(ids).toContain('task_prioritizer');
    expect(ids).toContain('knowledge_curator');
  });

  it('tools reference valid tool names', () => {
    const knownTools = [
      'search_ideas', 'create_idea', 'recall', 'remember', 'web_search',
      'fetch_url', 'search_documents', 'draft_email', 'ask_inbox',
      'inbox_summary', 'list_calendar_events', 'create_calendar_event',
      'create_meeting', 'conversation_search', 'github_list_issues',
      'memory_introspect', 'memory_update', 'core_memory_read',
      'core_memory_update', 'navigate_to', 'draft_social_post',
    ];
    for (const agent of BUILT_IN_AGENTS) {
      for (const tool of agent.tools) {
        expect(knownTools).toContain(tool);
      }
    }
  });

  it('categories are valid', () => {
    const validCategories: AgentCategory[] = [
      'productivity', 'communication', 'research', 'finance', 'knowledge',
    ];
    for (const agent of BUILT_IN_AGENTS) {
      expect(validCategories).toContain(agent.category);
    }
  });

  it('trigger types are valid', () => {
    const validTypes = [
      'email_received', 'task_due', 'calendar_soon', 'schedule',
      'idea_created', 'webhook', 'pattern_detected', 'manual',
    ];
    for (const agent of BUILT_IN_AGENTS) {
      for (const trigger of agent.triggers) {
        expect(validTypes).toContain(trigger.type);
      }
    }
  });

  it('configurable fields have correct shape', () => {
    for (const agent of BUILT_IN_AGENTS) {
      for (const field of agent.configurable) {
        expect(field.key).toBeTruthy();
        expect(field.label).toBeTruthy();
        expect(['string', 'number', 'boolean', 'select']).toContain(field.type);
      }
    }
  });

  it('select fields have options', () => {
    for (const agent of BUILT_IN_AGENTS) {
      for (const field of agent.configurable) {
        if (field.type === 'select') {
          expect(field.options).toBeDefined();
          expect(field.options!.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('default contexts are valid', () => {
    const validContexts = ['operations', 'finance', 'people', 'strategy'];
    for (const agent of BUILT_IN_AGENTS) {
      expect(validContexts).toContain(agent.defaultContext);
    }
  });

  it('token budgets are reasonable', () => {
    for (const agent of BUILT_IN_AGENTS) {
      expect(agent.tokenBudgetDaily).toBeGreaterThanOrEqual(10000);
      expect(agent.tokenBudgetDaily).toBeLessThanOrEqual(200000);
    }
  });
});
