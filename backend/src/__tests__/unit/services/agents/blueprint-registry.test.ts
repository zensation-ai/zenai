import { BUILT_IN_AGENTS } from '../../../../services/agents/built-in-agents';

const mockQueryPublic = jest.fn();
const mockQueryContext = jest.fn();

jest.mock('../../../../utils/database', () => ({
  queryPublic: (...args: unknown[]) => mockQueryPublic(...args),
  queryContext: (...args: unknown[]) => mockQueryContext(...args),
}));

jest.mock('../../../../utils/logger', () => ({
  logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('uuid', () => ({ v4: () => 'test-uuid-1234' }));

import {
  BlueprintRegistry,
  blueprintRegistry,
  type AgentBlueprint,
} from '../../../../services/agents/blueprint-registry';

// ── Fixtures ─────────────────────────────────────────────────────────

const now = '2026-04-05T12:00:00.000Z';

function makeRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'bp-1',
    name: 'Test Agent',
    description: 'A test agent',
    icon: '🤖',
    category: 'productivity',
    tags: ['test'],
    type: 'triggered',
    triggers: [{ type: 'schedule', config: {} }],
    max_actions_per_day: 10,
    token_budget_daily: 20000,
    approval_required: false,
    strategy: null,
    pipeline: null,
    skip_review: false,
    tools: ['recall'],
    instructions: 'Do things.',
    default_context: 'operations',
    configurable: [],
    source: 'user',
    version: '1.0.0',
    author: null,
    rating: null,
    usage_count: 0,
    user_id: null,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────

describe('BlueprintRegistry', () => {
  let registry: BlueprintRegistry;

  beforeEach(() => {
    jest.clearAllMocks();
    registry = new BlueprintRegistry();
  });

  // ── listBlueprints ──────────────────────────────────────────────

  describe('listBlueprints', () => {
    it('returns all blueprints without filters', async () => {
      mockQueryPublic.mockResolvedValueOnce({ rows: [makeRow(), makeRow({ id: 'bp-2' })] });

      const result = await registry.listBlueprints();

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('bp-1');
      expect(result[1].id).toBe('bp-2');
      expect(mockQueryPublic).toHaveBeenCalledTimes(1);
      const sql = mockQueryPublic.mock.calls[0][0] as string;
      expect(sql).toContain('SELECT * FROM agent_blueprints');
      expect(sql).not.toContain('WHERE');
    });

    it('filters by category', async () => {
      mockQueryPublic.mockResolvedValueOnce({ rows: [makeRow({ category: 'finance' })] });

      const result = await registry.listBlueprints({ category: 'finance' });

      expect(result).toHaveLength(1);
      expect(result[0].category).toBe('finance');
      const sql = mockQueryPublic.mock.calls[0][0] as string;
      expect(sql).toContain('category = $1');
      expect(mockQueryPublic.mock.calls[0][1]).toContain('finance');
    });

    it('filters by source', async () => {
      mockQueryPublic.mockResolvedValueOnce({ rows: [makeRow({ source: 'built_in' })] });

      const result = await registry.listBlueprints({ source: 'built_in' });

      expect(result).toHaveLength(1);
      expect(result[0].source).toBe('built_in');
      const sql = mockQueryPublic.mock.calls[0][0] as string;
      expect(sql).toContain('source = $1');
    });

    it('supports search via ILIKE', async () => {
      mockQueryPublic.mockResolvedValueOnce({ rows: [makeRow({ name: 'Email Triage' })] });

      const result = await registry.listBlueprints({ search: 'email' });

      expect(result).toHaveLength(1);
      const params = mockQueryPublic.mock.calls[0][1] as unknown[];
      expect(params).toContain('%email%');
      const sql = mockQueryPublic.mock.calls[0][0] as string;
      expect(sql).toContain('ILIKE');
    });

    it('combines multiple filters', async () => {
      mockQueryPublic.mockResolvedValueOnce({ rows: [] });

      await registry.listBlueprints({
        category: 'productivity',
        source: 'user',
        search: 'task',
      });

      const sql = mockQueryPublic.mock.calls[0][0] as string;
      expect(sql).toContain('category = $1');
      expect(sql).toContain('source = $2');
      expect(sql).toContain('ILIKE $3');
      const params = mockQueryPublic.mock.calls[0][1] as unknown[];
      expect(params[0]).toBe('productivity');
      expect(params[1]).toBe('user');
      expect(params[2]).toBe('%task%');
    });
  });

  // ── getBlueprint ────────────────────────────────────────────────

  describe('getBlueprint', () => {
    it('returns a blueprint by ID', async () => {
      mockQueryPublic.mockResolvedValueOnce({ rows: [makeRow()] });

      const bp = await registry.getBlueprint('bp-1');

      expect(bp.id).toBe('bp-1');
      expect(bp.name).toBe('Test Agent');
      expect(bp.tools).toEqual(['recall']);
      expect(bp.createdAt).toBeInstanceOf(Date);
    });

    it('throws when not found', async () => {
      mockQueryPublic.mockResolvedValueOnce({ rows: [] });

      await expect(registry.getBlueprint('nonexistent'))
        .rejects.toThrow('Blueprint not found: nonexistent');
    });
  });

  // ── createBlueprint ─────────────────────────────────────────────

  describe('createBlueprint', () => {
    it('inserts and returns the new blueprint', async () => {
      mockQueryPublic.mockResolvedValueOnce({ rows: [makeRow({ id: 'test-uuid-1234' })] });

      const bp = await registry.createBlueprint({
        name: 'New Agent',
        category: 'research',
        instructions: 'Search things.',
        tools: ['web_search'],
        triggers: [{ type: 'schedule', config: { cron: '0 9 * * *' } }],
      });

      expect(bp.id).toBe('test-uuid-1234');
      expect(mockQueryPublic).toHaveBeenCalledTimes(1);
      const sql = mockQueryPublic.mock.calls[0][0] as string;
      expect(sql).toContain('INSERT INTO agent_blueprints');
      expect(sql).toContain('RETURNING *');

      // Verify JSONB fields are stringified
      const params = mockQueryPublic.mock.calls[0][1] as unknown[];
      const triggersParam = params[7]; // triggers at position 7
      expect(typeof triggersParam).toBe('string');
      expect(JSON.parse(triggersParam as string)).toEqual([
        { type: 'schedule', config: { cron: '0 9 * * *' } },
      ]);
    });

    it('applies defaults for optional fields', async () => {
      mockQueryPublic.mockResolvedValueOnce({ rows: [makeRow()] });

      await registry.createBlueprint({
        name: 'Minimal',
        category: 'custom',
        instructions: 'Do things.',
      });

      const params = mockQueryPublic.mock.calls[0][1] as unknown[];
      // icon defaults to robot
      expect(params[3]).toBe('🤖');
      // source defaults to user
      expect(params[18]).toBe('user');
      // version defaults to 1.0.0
      expect(params[19]).toBe('1.0.0');
    });
  });

  // ── updateBlueprint ─────────────────────────────────────────────

  describe('updateBlueprint', () => {
    it('updates and returns the blueprint', async () => {
      mockQueryPublic.mockResolvedValueOnce({
        rows: [makeRow({ name: 'Updated Name' })],
      });

      const bp = await registry.updateBlueprint('bp-1', { name: 'Updated Name' });

      expect(bp.name).toBe('Updated Name');
      const sql = mockQueryPublic.mock.calls[0][0] as string;
      expect(sql).toContain('UPDATE agent_blueprints');
      expect(sql).toContain('name = $1');
      expect(sql).toContain('updated_at');
    });

    it('JSON.stringifies triggers and configurable separately', async () => {
      mockQueryPublic.mockResolvedValueOnce({ rows: [makeRow()] });

      await registry.updateBlueprint('bp-1', {
        triggers: [{ type: 'manual', config: {} }],
        configurable: [{ key: 'k', label: 'l', type: 'string', defaultValue: '' }],
      });

      const params = mockQueryPublic.mock.calls[0][1] as unknown[];
      // Both JSONB params should be stringified
      const jsonParams = params.filter(p => typeof p === 'string' && p.startsWith('['));
      expect(jsonParams).toHaveLength(2);
    });

    it('returns existing blueprint when no fields provided', async () => {
      mockQueryPublic.mockResolvedValueOnce({ rows: [makeRow()] });

      const bp = await registry.updateBlueprint('bp-1', {});

      // Should call getBlueprint (SELECT) not UPDATE
      const sql = mockQueryPublic.mock.calls[0][0] as string;
      expect(sql).toContain('SELECT');
      expect(bp.id).toBe('bp-1');
    });

    it('throws when blueprint not found', async () => {
      mockQueryPublic.mockResolvedValueOnce({ rows: [] });

      await expect(registry.updateBlueprint('nonexistent', { name: 'x' }))
        .rejects.toThrow('Blueprint not found: nonexistent');
    });
  });

  // ── deleteBlueprint ─────────────────────────────────────────────

  describe('deleteBlueprint', () => {
    it('deletes user-created blueprints', async () => {
      mockQueryPublic
        .mockResolvedValueOnce({ rows: [makeRow({ source: 'user' })] }) // getBlueprint
        .mockResolvedValueOnce({ rows: [] }); // DELETE

      await registry.deleteBlueprint('bp-1');

      expect(mockQueryPublic).toHaveBeenCalledTimes(2);
      const deleteSql = mockQueryPublic.mock.calls[1][0] as string;
      expect(deleteSql).toContain('DELETE FROM agent_blueprints');
    });

    it('throws when trying to delete a built-in blueprint', async () => {
      mockQueryPublic.mockResolvedValueOnce({
        rows: [makeRow({ source: 'built_in' })],
      });

      await expect(registry.deleteBlueprint('email_triage'))
        .rejects.toThrow('Cannot delete built-in blueprints');
    });

    it('throws when blueprint not found', async () => {
      mockQueryPublic.mockResolvedValueOnce({ rows: [] });

      await expect(registry.deleteBlueprint('nonexistent'))
        .rejects.toThrow('Blueprint not found: nonexistent');
    });
  });

  // ── activateBlueprint ───────────────────────────────────────────

  describe('activateBlueprint', () => {
    it('creates a new agent definition when none exists', async () => {
      // getBlueprint
      mockQueryPublic.mockResolvedValueOnce({ rows: [makeRow()] });
      // Check for existing definition
      mockQueryContext.mockResolvedValueOnce({ rows: [] });
      // INSERT definition
      mockQueryContext.mockResolvedValueOnce({ rows: [] });
      // Increment usage_count
      mockQueryPublic.mockResolvedValueOnce({ rows: [] });

      const result = await registry.activateBlueprint('bp-1', 'finance');

      expect(result).toEqual({
        id: 'test-uuid-1234',
        name: 'Test Agent',
        status: 'active',
        blueprintId: 'bp-1',
      });

      // Verify INSERT into agent_definitions
      const insertSql = mockQueryContext.mock.calls[1][1] as string;
      expect(insertSql).toContain('INSERT INTO agent_definitions');
      // Verify usage_count increment
      const usageSql = mockQueryPublic.mock.calls[1][0] as string;
      expect(usageSql).toContain('usage_count = usage_count + 1');
    });

    it('re-activates existing stopped definition', async () => {
      // getBlueprint
      mockQueryPublic.mockResolvedValueOnce({ rows: [makeRow()] });
      // Existing definition found
      mockQueryContext.mockResolvedValueOnce({
        rows: [{ id: 'def-existing', status: 'stopped' }],
      });
      // UPDATE to active
      mockQueryContext.mockResolvedValueOnce({ rows: [] });

      const result = await registry.activateBlueprint('bp-1', 'operations');

      expect(result).toEqual({
        id: 'def-existing',
        name: 'Test Agent',
        status: 'active',
        blueprintId: 'bp-1',
      });

      // Should NOT increment usage_count on re-activation
      expect(mockQueryPublic).toHaveBeenCalledTimes(1); // only getBlueprint
      // Should UPDATE, not INSERT
      const updateSql = mockQueryContext.mock.calls[1][1] as string;
      expect(updateSql).toContain("status = 'active'");
    });

    it('passes config to the new definition', async () => {
      mockQueryPublic.mockResolvedValueOnce({ rows: [makeRow()] });
      mockQueryContext.mockResolvedValueOnce({ rows: [] });
      mockQueryContext.mockResolvedValueOnce({ rows: [] });
      mockQueryPublic.mockResolvedValueOnce({ rows: [] });

      await registry.activateBlueprint('bp-1', 'finance', { urgencyThreshold: 'critical' });

      const insertParams = mockQueryContext.mock.calls[1][2] as unknown[];
      const configParam = insertParams[12]; // config at position 12
      expect(JSON.parse(configParam as string)).toEqual({ urgencyThreshold: 'critical' });
    });
  });

  // ── deactivateBlueprint ─────────────────────────────────────────

  describe('deactivateBlueprint', () => {
    it('sets definition status to stopped', async () => {
      mockQueryContext
        .mockResolvedValueOnce({ rows: [{ id: 'def-1' }] }) // find
        .mockResolvedValueOnce({ rows: [] }); // update

      await registry.deactivateBlueprint('bp-1', 'finance');

      expect(mockQueryContext).toHaveBeenCalledTimes(2);
      const updateSql = mockQueryContext.mock.calls[1][1] as string;
      expect(updateSql).toContain("status = 'stopped'");
    });

    it('no-ops when no definition found', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] });

      await registry.deactivateBlueprint('bp-1', 'finance');

      // Only one query (the SELECT), no UPDATE
      expect(mockQueryContext).toHaveBeenCalledTimes(1);
    });
  });

  // ── registerBuiltIns ────────────────────────────────────────────

  describe('registerBuiltIns', () => {
    it('upserts all 8 built-in agents', async () => {
      mockQueryPublic.mockResolvedValue({ rows: [] });

      await registry.registerBuiltIns();

      expect(mockQueryPublic).toHaveBeenCalledTimes(8);
      for (let i = 0; i < 8; i++) {
        const sql = mockQueryPublic.mock.calls[i][0] as string;
        expect(sql).toContain('INSERT INTO agent_blueprints');
        expect(sql).toContain('ON CONFLICT (id) DO UPDATE');
      }
    });

    it('uses agent IDs from BUILT_IN_AGENTS', async () => {
      mockQueryPublic.mockResolvedValue({ rows: [] });

      await registry.registerBuiltIns();

      const insertedIds = Array.from({ length: 8 }, (_, i) => {
        const params = mockQueryPublic.mock.calls[i][1] as unknown[];
        return params[0]; // id is first param
      });

      for (const agent of BUILT_IN_AGENTS) {
        expect(insertedIds).toContain(agent.id);
      }
    });

    it('sets source to built_in for all agents', async () => {
      mockQueryPublic.mockResolvedValue({ rows: [] });

      await registry.registerBuiltIns();

      for (let i = 0; i < 8; i++) {
        const params = mockQueryPublic.mock.calls[i][1] as unknown[];
        expect(params[18]).toBe('built_in'); // source at index 18
      }
    });
  });

  // ── Singleton ───────────────────────────────────────────────────

  describe('singleton', () => {
    it('exports a singleton instance', () => {
      expect(blueprintRegistry).toBeInstanceOf(BlueprintRegistry);
    });
  });
});
