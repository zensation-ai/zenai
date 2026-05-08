const mockQueryPublic = jest.fn();
jest.mock('../../../../utils/database', () => ({
  queryPublic: (...args: unknown[]) => mockQueryPublic(...args),
}));
jest.mock('../../../../utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), debug: jest.fn(), warn: jest.fn() },
}));

import {
  SmartTriggerEngine,
  smartTriggerEngine,
  CompositeTrigger,
  TriggerEvent,
  ContextState,
} from '../../../../services/agents/smart-triggers';

describe('SmartTriggerEngine', () => {
  let engine: SmartTriggerEngine;

  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryPublic.mockReset();
    engine = new SmartTriggerEngine();
  });

  describe('matchCompositeTrigger', () => {
    const makeEvent = (type: string, offsetMs = 0): TriggerEvent => ({
      type,
      timestamp: new Date(Date.now() + offsetMs),
      data: {},
    });

    it('AND: matches when all conditions match event type', () => {
      const trigger: CompositeTrigger = {
        operator: 'AND',
        conditions: [
          { type: 'task_completed', config: {} },
          { type: 'task_completed', config: {} },
        ],
      };
      const event = makeEvent('task_completed');
      expect(engine.matchCompositeTrigger(trigger, event)).toBe(true);
    });

    it('AND: fails when one condition does not match', () => {
      const trigger: CompositeTrigger = {
        operator: 'AND',
        conditions: [
          { type: 'task_completed', config: {} },
          { type: 'email_received', config: {} },
        ],
      };
      const event = makeEvent('task_completed');
      expect(engine.matchCompositeTrigger(trigger, event)).toBe(false);
    });

    it('OR: matches when at least one condition matches', () => {
      const trigger: CompositeTrigger = {
        operator: 'OR',
        conditions: [
          { type: 'task_completed', config: {} },
          { type: 'email_received', config: {} },
        ],
      };
      const event = makeEvent('email_received');
      expect(engine.matchCompositeTrigger(trigger, event)).toBe(true);
    });

    it('OR: fails when no conditions match', () => {
      const trigger: CompositeTrigger = {
        operator: 'OR',
        conditions: [
          { type: 'task_completed', config: {} },
          { type: 'email_received', config: {} },
        ],
      };
      const event = makeEvent('calendar_event');
      expect(engine.matchCompositeTrigger(trigger, event)).toBe(false);
    });

    it('SEQUENCE: matches ordered events within time window', () => {
      const now = Date.now();
      const trigger: CompositeTrigger = {
        operator: 'SEQUENCE',
        conditions: [
          { type: 'file_uploaded', config: {} },
          { type: 'analysis_started', config: {} },
          { type: 'analysis_complete', config: {} },
        ],
        timeWindowMs: 60000,
      };
      const recentEvents: TriggerEvent[] = [
        { type: 'file_uploaded', timestamp: new Date(now), data: {} },
        { type: 'analysis_started', timestamp: new Date(now + 10000), data: {} },
      ];
      const event: TriggerEvent = {
        type: 'analysis_complete',
        timestamp: new Date(now + 20000),
        data: {},
      };

      expect(engine.matchCompositeTrigger(trigger, event, recentEvents)).toBe(true);
    });

    it('SEQUENCE: fails when events are out of order', () => {
      const now = Date.now();
      const trigger: CompositeTrigger = {
        operator: 'SEQUENCE',
        conditions: [
          { type: 'file_uploaded', config: {} },
          { type: 'analysis_started', config: {} },
          { type: 'analysis_complete', config: {} },
        ],
        timeWindowMs: 60000,
      };
      // Events in wrong order: analysis_started before file_uploaded
      const recentEvents: TriggerEvent[] = [
        { type: 'analysis_started', timestamp: new Date(now), data: {} },
        { type: 'file_uploaded', timestamp: new Date(now + 5000), data: {} },
      ];
      const event: TriggerEvent = {
        type: 'analysis_complete',
        timestamp: new Date(now + 10000),
        data: {},
      };

      expect(engine.matchCompositeTrigger(trigger, event, recentEvents)).toBe(false);
    });

    it('SEQUENCE: fails when events exceed time window', () => {
      const now = Date.now();
      const trigger: CompositeTrigger = {
        operator: 'SEQUENCE',
        conditions: [
          { type: 'file_uploaded', config: {} },
          { type: 'analysis_complete', config: {} },
        ],
        timeWindowMs: 5000,
      };
      const recentEvents: TriggerEvent[] = [
        { type: 'file_uploaded', timestamp: new Date(now), data: {} },
      ];
      const event: TriggerEvent = {
        type: 'analysis_complete',
        timestamp: new Date(now + 10000),
        data: {},
      };

      expect(engine.matchCompositeTrigger(trigger, event, recentEvents)).toBe(false);
    });

    it('single condition: simple type match', () => {
      const trigger: CompositeTrigger = {
        operator: 'AND',
        conditions: [{ type: 'webhook_received', config: {} }],
      };
      const event = makeEvent('webhook_received');
      expect(engine.matchCompositeTrigger(trigger, event)).toBe(true);
    });

    it('returns false for empty conditions', () => {
      const trigger: CompositeTrigger = {
        operator: 'AND',
        conditions: [],
      };
      const event = makeEvent('anything');
      expect(engine.matchCompositeTrigger(trigger, event)).toBe(false);
    });

    it('SEQUENCE: returns false when no recent events provided', () => {
      const trigger: CompositeTrigger = {
        operator: 'SEQUENCE',
        conditions: [
          { type: 'step_a', config: {} },
          { type: 'step_b', config: {} },
        ],
      };
      const event = makeEvent('step_b');
      expect(engine.matchCompositeTrigger(trigger, event)).toBe(false);
    });
  });

  describe('evaluateContextRules', () => {
    it('returns execute with no blocking context', () => {
      const state: ContextState = {
        busyCalendar: false,
        focusMode: false,
        currentContext: 'operations',
        timeOfDay: 14,
      };
      const result = engine.evaluateContextRules(state);
      expect(result.action).toBe('execute');
      expect(result.reason).toContain('No blocking');
    });

    it('returns skip when busyCalendar AND focusMode', () => {
      const state: ContextState = {
        busyCalendar: true,
        focusMode: true,
        currentContext: 'finance',
        timeOfDay: 10,
      };
      const result = engine.evaluateContextRules(state);
      expect(result.action).toBe('skip');
      expect(result.reason).toContain('focus mode');
    });

    it('returns delay 30min when focusMode only', () => {
      const state: ContextState = {
        busyCalendar: false,
        focusMode: true,
        currentContext: 'finance',
        timeOfDay: 9,
      };
      const result = engine.evaluateContextRules(state);
      expect(result.action).toBe('delay');
      expect(result.delayMs).toBe(30 * 60 * 1000);
    });

    it('returns delay 10min when busyCalendar only', () => {
      const state: ContextState = {
        busyCalendar: true,
        focusMode: false,
        currentContext: 'finance',
        timeOfDay: 11,
      };
      const result = engine.evaluateContextRules(state);
      expect(result.action).toBe('delay');
      expect(result.delayMs).toBe(10 * 60 * 1000);
    });
  });

  describe('processTriggerChains', () => {
    const makeChainRow = (overrides: Record<string, unknown> = {}) => ({
      id: 'chain-1',
      source_agent_id: 'agent-a',
      target_agent_id: 'agent-b',
      condition: 'on_success',
      delay_ms: 0,
      config: {},
      enabled: true,
      created_at: new Date().toISOString(),
      ...overrides,
    });

    it('returns matching chains for successful execution', async () => {
      mockQueryPublic.mockResolvedValueOnce({
        rows: [
          makeChainRow({ id: 'c1', condition: 'on_success' }),
          makeChainRow({ id: 'c2', condition: 'on_failure' }),
        ],
      });

      const chains = await engine.processTriggerChains('agent-a', { success: true });
      expect(chains).toHaveLength(1);
      expect(chains[0].id).toBe('c1');
    });

    it('returns on_failure chains for failed execution', async () => {
      mockQueryPublic.mockResolvedValueOnce({
        rows: [
          makeChainRow({ id: 'c1', condition: 'on_success' }),
          makeChainRow({ id: 'c2', condition: 'on_failure' }),
        ],
      });

      const chains = await engine.processTriggerChains('agent-a', { success: false });
      expect(chains).toHaveLength(1);
      expect(chains[0].id).toBe('c2');
    });

    it('returns always chains regardless of result', async () => {
      mockQueryPublic.mockResolvedValueOnce({
        rows: [
          makeChainRow({ id: 'c1', condition: 'always' }),
          makeChainRow({ id: 'c2', condition: 'on_success' }),
        ],
      });

      const chains = await engine.processTriggerChains('agent-a', { success: false });
      expect(chains).toHaveLength(1);
      expect(chains[0].id).toBe('c1');
    });

    it('filters out disabled chains (via DB query)', async () => {
      // The query itself filters enabled=true, so DB returns only enabled rows
      mockQueryPublic.mockResolvedValueOnce({ rows: [] });

      const chains = await engine.processTriggerChains('agent-a', { success: true });
      expect(chains).toHaveLength(0);
      expect(mockQueryPublic).toHaveBeenCalledWith(
        expect.stringContaining('enabled = true'),
        ['agent-a'],
      );
    });

    it('returns empty array when no chains exist', async () => {
      mockQueryPublic.mockResolvedValueOnce({ rows: [] });

      const chains = await engine.processTriggerChains('agent-x', { success: true });
      expect(chains).toEqual([]);
    });

    it('returns empty array on database error', async () => {
      mockQueryPublic.mockRejectedValueOnce(new Error('DB connection failed'));

      const chains = await engine.processTriggerChains('agent-a', { success: true });
      expect(chains).toEqual([]);
    });
  });

  describe('createChain', () => {
    it('creates and returns a chain', async () => {
      const row = {
        id: 'new-chain-id',
        source_agent_id: 'agent-a',
        target_agent_id: 'agent-b',
        condition: 'on_success',
        delay_ms: 5000,
        config: { retries: 3 },
        enabled: true,
        created_at: new Date().toISOString(),
      };
      mockQueryPublic.mockResolvedValueOnce({ rows: [row] });

      const chain = await engine.createChain({
        sourceAgentId: 'agent-a',
        targetAgentId: 'agent-b',
        condition: 'on_success',
        delayMs: 5000,
        config: { retries: 3 },
        enabled: true,
      });

      expect(chain.id).toBe('new-chain-id');
      expect(chain.sourceAgentId).toBe('agent-a');
      expect(chain.targetAgentId).toBe('agent-b');
      expect(chain.condition).toBe('on_success');
      expect(chain.delayMs).toBe(5000);
      expect(chain.enabled).toBe(true);
      expect(mockQueryPublic).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO agent_trigger_chains'),
        ['agent-a', 'agent-b', 'on_success', 5000, '{"retries":3}', true],
      );
    });
  });

  describe('deleteChain', () => {
    it('deletes chain by id', async () => {
      mockQueryPublic.mockResolvedValueOnce({ rows: [] });

      await engine.deleteChain('chain-to-delete');

      expect(mockQueryPublic).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM agent_trigger_chains'),
        ['chain-to-delete'],
      );
    });
  });

  describe('listChains', () => {
    it('lists all chains when no agentId provided', async () => {
      mockQueryPublic.mockResolvedValueOnce({
        rows: [
          {
            id: 'c1',
            source_agent_id: 'a1',
            target_agent_id: 'a2',
            condition: 'always',
            delay_ms: 0,
            config: {},
            enabled: true,
            created_at: new Date().toISOString(),
          },
          {
            id: 'c2',
            source_agent_id: 'a3',
            target_agent_id: 'a4',
            condition: 'on_success',
            delay_ms: 1000,
            config: {},
            enabled: true,
            created_at: new Date().toISOString(),
          },
        ],
      });

      const chains = await engine.listChains();
      expect(chains).toHaveLength(2);
      expect(mockQueryPublic).toHaveBeenCalledWith(
        expect.not.stringContaining('WHERE'),
        [],
      );
    });

    it('filters by agent id when provided', async () => {
      mockQueryPublic.mockResolvedValueOnce({
        rows: [
          {
            id: 'c1',
            source_agent_id: 'agent-x',
            target_agent_id: 'agent-y',
            condition: 'on_failure',
            delay_ms: 2000,
            config: {},
            enabled: true,
            created_at: new Date().toISOString(),
          },
        ],
      });

      const chains = await engine.listChains('agent-x');
      expect(chains).toHaveLength(1);
      expect(chains[0].sourceAgentId).toBe('agent-x');
      expect(mockQueryPublic).toHaveBeenCalledWith(
        expect.stringContaining('WHERE source_agent_id = $1'),
        ['agent-x'],
      );
    });
  });

  describe('singleton', () => {
    it('exports a singleton instance', () => {
      expect(smartTriggerEngine).toBeInstanceOf(SmartTriggerEngine);
    });
  });
});
