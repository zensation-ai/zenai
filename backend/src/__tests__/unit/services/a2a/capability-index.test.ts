const mockQueryPublic = jest.fn();
jest.mock('../../../../utils/database', () => ({
  queryPublic: (...args: unknown[]) => mockQueryPublic(...args),
}));
jest.mock('../../../../utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), debug: jest.fn(), warn: jest.fn() },
}));

const mockFetch = jest.fn();
global.fetch = mockFetch as any;

import { CapabilityIndex, capabilityIndex, IndexedAgent } from '../../../../services/a2a/capability-index';

const makeAgentRow = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: 'agent-1',
  url: 'https://agent.example.com',
  name: 'Test Agent',
  description: 'A test agent for research',
  skills: [{ name: 'research', description: 'Research topics online' }],
  success_rate: 0.95,
  avg_response_time_ms: 200,
  total_executions: 50,
  last_health_check: '2026-04-01T00:00:00Z',
  is_healthy: true,
  created_at: '2026-03-01T00:00:00Z',
  updated_at: '2026-04-01T00:00:00Z',
  ...overrides,
});

const makeAgentCard = (overrides: Record<string, unknown> = {}) => ({
  name: 'Test Agent',
  description: 'A test agent',
  skills: [{ name: 'research', description: 'Research topics' }],
  ...overrides,
});

describe('CapabilityIndex', () => {
  let index: CapabilityIndex;

  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryPublic.mockReset();
    mockFetch.mockReset();
    index = new CapabilityIndex();
  });

  describe('indexAgent', () => {
    it('fetches and indexes agent card', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(makeAgentCard()),
      });
      mockQueryPublic.mockResolvedValueOnce({ rows: [makeAgentRow()] });

      const agent = await index.indexAgent('https://agent.example.com');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://agent.example.com/.well-known/agent.json',
        expect.objectContaining({ agent: expect.any(Object) })
      );
      expect(agent.name).toBe('Test Agent');
      expect(agent.url).toBe('https://agent.example.com');
    });

    it('upserts on conflict', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(makeAgentCard()),
      });
      mockQueryPublic.mockResolvedValueOnce({ rows: [makeAgentRow()] });

      await index.indexAgent('https://agent.example.com');

      const sql = mockQueryPublic.mock.calls[0][0] as string;
      expect(sql).toContain('ON CONFLICT (url) DO UPDATE');
    });

    it('handles fetch failure gracefully', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });

      await expect(index.indexAgent('https://bad.example.com')).rejects.toThrow(
        'Failed to fetch agent card from https://bad.example.com: 404'
      );
    });

    it('handles network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(index.indexAgent('https://unreachable.example.com')).rejects.toThrow('Network error');
    });

    it('parses skills from agent card', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve(
            makeAgentCard({
              skills: [
                { name: 'research', description: 'Research topics', inputModes: ['text'], outputModes: ['text'] },
                { name: 'summarize', description: 'Summarize content' },
              ],
            })
          ),
      });
      const row = makeAgentRow({
        skills: [
          { name: 'research', description: 'Research topics', inputModes: ['text'], outputModes: ['text'] },
          { name: 'summarize', description: 'Summarize content' },
        ],
      });
      mockQueryPublic.mockResolvedValueOnce({ rows: [row] });

      const agent = await index.indexAgent('https://agent.example.com');

      expect(agent.skills).toHaveLength(2);
      expect(agent.skills[0].name).toBe('research');
      expect(agent.skills[1].name).toBe('summarize');
    });

    it('handles agent card with no skills', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ name: 'Bare Agent', description: 'No skills' }),
      });
      mockQueryPublic.mockResolvedValueOnce({
        rows: [makeAgentRow({ name: 'Bare Agent', skills: [] })],
      });

      const agent = await index.indexAgent('https://agent.example.com');

      expect(agent.skills).toHaveLength(0);
    });

    it('defaults name when agent card has no name', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ description: 'Nameless' }),
      });
      mockQueryPublic.mockResolvedValueOnce({
        rows: [makeAgentRow({ name: 'Unknown Agent' })],
      });

      await index.indexAgent('https://agent.example.com');

      const params = mockQueryPublic.mock.calls[0][1] as unknown[];
      expect(params[1]).toBe('Unknown Agent');
    });
  });

  describe('findAgentsForTask', () => {
    it('returns ranked matches by relevance', async () => {
      const agent1 = makeAgentRow({
        id: 'agent-1',
        name: 'Research Bot',
        skills: [{ name: 'research', description: 'Research topics online' }],
      });
      const agent2 = makeAgentRow({
        id: 'agent-2',
        name: 'Writer Bot',
        skills: [{ name: 'write', description: 'Write articles and research papers' }],
      });
      mockQueryPublic.mockResolvedValueOnce({ rows: [agent1, agent2] });

      const matches = await index.findAgentsForTask('research topics');

      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0].relevanceScore).toBeGreaterThanOrEqual(matches[matches.length - 1].relevanceScore);
    });

    it('handles no matching agents', async () => {
      const agent = makeAgentRow({
        skills: [{ name: 'cooking', description: 'Cook meals' }],
      });
      mockQueryPublic.mockResolvedValueOnce({ rows: [agent] });

      const matches = await index.findAgentsForTask('quantum physics');

      expect(matches).toHaveLength(0);
    });

    it('handles empty database', async () => {
      mockQueryPublic.mockResolvedValueOnce({ rows: [] });

      const matches = await index.findAgentsForTask('research topics');

      expect(matches).toHaveLength(0);
    });

    it('limits results to 10', async () => {
      const agents = Array.from({ length: 15 }, (_, i) =>
        makeAgentRow({
          id: `agent-${i}`,
          name: `Agent ${i}`,
          skills: [{ name: 'research', description: 'Research things' }],
        })
      );
      mockQueryPublic.mockResolvedValueOnce({ rows: agents });

      const matches = await index.findAgentsForTask('research');

      expect(matches.length).toBeLessThanOrEqual(10);
    });

    it('scores based on keyword overlap', async () => {
      const agent = makeAgentRow({
        skills: [{ name: 'research', description: 'Research topics online thoroughly' }],
      });
      mockQueryPublic.mockResolvedValueOnce({ rows: [agent] });

      const matches = await index.findAgentsForTask('research topics');

      expect(matches).toHaveLength(1);
      expect(matches[0].relevanceScore).toBeGreaterThan(0);
      expect(matches[0].matchedSkills).toContain('research');
    });

    it('returns empty for empty description', async () => {
      mockQueryPublic.mockResolvedValueOnce({ rows: [makeAgentRow()] });

      const matches = await index.findAgentsForTask('   ');

      expect(matches).toHaveLength(0);
    });
  });

  describe('findAgentsBySkill', () => {
    it('returns agents with matching skill', async () => {
      mockQueryPublic.mockResolvedValueOnce({ rows: [makeAgentRow()] });

      const agents = await index.findAgentsBySkill('research');

      expect(agents).toHaveLength(1);
      expect(agents[0].name).toBe('Test Agent');
    });

    it('returns empty for no matches', async () => {
      mockQueryPublic.mockResolvedValueOnce({ rows: [] });

      const agents = await index.findAgentsBySkill('nonexistent');

      expect(agents).toHaveLength(0);
    });

    it('passes skill name to ILIKE query', async () => {
      mockQueryPublic.mockResolvedValueOnce({ rows: [] });

      await index.findAgentsBySkill('research');

      const sql = mockQueryPublic.mock.calls[0][0] as string;
      expect(sql).toContain('ILIKE');
      const params = mockQueryPublic.mock.calls[0][1] as unknown[];
      expect(params[0]).toBe('research');
    });
  });

  describe('recordExecution', () => {
    it('updates success rate with EMA on success', async () => {
      mockQueryPublic.mockResolvedValueOnce({ rows: [] });

      await index.recordExecution('agent-1', true, 150);

      const params = mockQueryPublic.mock.calls[0][1] as unknown[];
      expect(params[0]).toBe('agent-1');
      expect(params[1]).toBe(1);
      expect(params[2]).toBe(150);
    });

    it('updates success rate with EMA on failure', async () => {
      mockQueryPublic.mockResolvedValueOnce({ rows: [] });

      await index.recordExecution('agent-1', false, 500);

      const params = mockQueryPublic.mock.calls[0][1] as unknown[];
      expect(params[0]).toBe('agent-1');
      expect(params[1]).toBe(0);
      expect(params[2]).toBe(500);
    });

    it('increments total_executions in SQL', async () => {
      mockQueryPublic.mockResolvedValueOnce({ rows: [] });

      await index.recordExecution('agent-1', true, 100);

      const sql = mockQueryPublic.mock.calls[0][0] as string;
      expect(sql).toContain('total_executions = total_executions + 1');
    });

    it('uses EMA formula for success_rate', async () => {
      mockQueryPublic.mockResolvedValueOnce({ rows: [] });

      await index.recordExecution('agent-1', true, 100);

      const sql = mockQueryPublic.mock.calls[0][0] as string;
      expect(sql).toContain('success_rate = success_rate * 0.9');
    });
  });

  describe('refreshAll', () => {
    it('returns healthy/unhealthy counts', async () => {
      mockQueryPublic
        .mockResolvedValueOnce({
          rows: [
            makeAgentRow({ id: 'agent-1', url: 'https://a.com' }),
            makeAgentRow({ id: 'agent-2', url: 'https://b.com' }),
          ],
        })
        .mockResolvedValue({ rows: [] });

      mockFetch
        .mockResolvedValueOnce({ ok: true })
        .mockResolvedValueOnce({ ok: false });

      const result = await index.refreshAll();

      expect(result.healthy).toBe(1);
      expect(result.unhealthy).toBe(1);
    });

    it('marks agents healthy on successful fetch', async () => {
      mockQueryPublic
        .mockResolvedValueOnce({ rows: [makeAgentRow({ id: 'agent-1', url: 'https://a.com' })] })
        .mockResolvedValue({ rows: [] });
      mockFetch.mockResolvedValueOnce({ ok: true });

      await index.refreshAll();

      const updateParams = mockQueryPublic.mock.calls[1][1] as unknown[];
      expect(updateParams[0]).toBe('agent-1');
      expect(updateParams[1]).toBe(true);
    });

    it('marks agents unhealthy on failed fetch', async () => {
      mockQueryPublic
        .mockResolvedValueOnce({ rows: [makeAgentRow({ id: 'agent-1', url: 'https://a.com' })] })
        .mockResolvedValue({ rows: [] });
      mockFetch.mockRejectedValueOnce(new Error('Connection refused'));

      await index.refreshAll();

      const updateParams = mockQueryPublic.mock.calls[1][1] as unknown[];
      expect(updateParams[0]).toBe('agent-1');
      expect(updateParams[1]).toBe(false);
    });

    it('uses timeout for fetch', async () => {
      mockQueryPublic
        .mockResolvedValueOnce({ rows: [makeAgentRow({ id: 'agent-1', url: 'https://a.com' })] })
        .mockResolvedValue({ rows: [] });
      mockFetch.mockResolvedValueOnce({ ok: true });

      await index.refreshAll();

      const fetchCall = mockFetch.mock.calls[0];
      expect(fetchCall[1]).toHaveProperty('signal');
    });

    it('handles empty agent list', async () => {
      mockQueryPublic.mockResolvedValueOnce({ rows: [] });

      const result = await index.refreshAll();

      expect(result.healthy).toBe(0);
      expect(result.unhealthy).toBe(0);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('getLeaderboard', () => {
    it('returns top agents by success rate', async () => {
      const rows = [
        makeAgentRow({ id: 'agent-1', success_rate: 0.99 }),
        makeAgentRow({ id: 'agent-2', success_rate: 0.85 }),
      ];
      mockQueryPublic.mockResolvedValueOnce({ rows });

      const leaderboard = await index.getLeaderboard();

      expect(leaderboard).toHaveLength(2);
      expect(leaderboard[0].successRate).toBe(0.99);
    });

    it('respects limit parameter', async () => {
      mockQueryPublic.mockResolvedValueOnce({ rows: [makeAgentRow()] });

      await index.getLeaderboard(5);

      const params = mockQueryPublic.mock.calls[0][1] as unknown[];
      expect(params[0]).toBe(5);
    });

    it('defaults limit to 10', async () => {
      mockQueryPublic.mockResolvedValueOnce({ rows: [] });

      await index.getLeaderboard();

      const params = mockQueryPublic.mock.calls[0][1] as unknown[];
      expect(params[0]).toBe(10);
    });

    it('only includes healthy agents', async () => {
      mockQueryPublic.mockResolvedValueOnce({ rows: [] });

      await index.getLeaderboard();

      const sql = mockQueryPublic.mock.calls[0][0] as string;
      expect(sql).toContain('is_healthy = true');
    });

    it('orders by success_rate then total_executions', async () => {
      mockQueryPublic.mockResolvedValueOnce({ rows: [] });

      await index.getLeaderboard();

      const sql = mockQueryPublic.mock.calls[0][0] as string;
      expect(sql).toContain('ORDER BY success_rate DESC, total_executions DESC');
    });
  });

  describe('singleton', () => {
    it('exports singleton instance', () => {
      expect(capabilityIndex).toBeInstanceOf(CapabilityIndex);
    });

    it('singleton is stable reference', async () => {
      const { capabilityIndex: ref1 } = await import('../../../../services/a2a/capability-index');
      const { capabilityIndex: ref2 } = await import('../../../../services/a2a/capability-index');
      expect(ref1).toBe(ref2);
    });
  });
});
