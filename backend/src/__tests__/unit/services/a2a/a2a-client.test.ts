/**
 * Tests for A2A Client
 */

jest.mock('../../../../utils/database-context', () => ({
  queryContext: jest.fn(),
  isValidContext: jest.fn((ctx: string) => ['personal', 'work', 'learning', 'creative'].includes(ctx)),
}));

jest.mock('../../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import { A2AClient } from '../../../../services/a2a/a2a-client';
import { queryContext } from '../../../../utils/database-context';

const mockQueryContext = queryContext as jest.MockedFunction<typeof queryContext>;

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch as any;

describe('A2AClient', () => {
  let client: A2AClient;

  const mockAgentCard = {
    name: 'Test Agent',
    description: 'A test agent',
    url: 'https://agent.example.com',
    version: '1.0.0',
    capabilities: { streaming: true, pushNotifications: false },
    authentication: { schemes: ['Bearer'] },
    skills: [{ id: 'test', name: 'Test', description: 'Test skill', inputModes: ['text'], outputModes: ['text'] }],
  };

  const mockAgentRow = {
    id: 'agent-123',
    name: 'Test Agent',
    description: 'A test agent',
    url: 'https://agent.example.com',
    agent_card: mockAgentCard,
    skills: mockAgentCard.skills,
    auth_type: 'bearer',
    auth_token: 'token-123',
    is_active: true,
    last_health_check: null,
    health_status: 'unknown',
    created_at: '2026-03-14T00:00:00Z',
    updated_at: '2026-03-14T00:00:00Z',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryContext.mockReset();
    mockFetch.mockReset();
    client = new A2AClient();
  });

  describe('discoverAgent', () => {
    it('should fetch and return agent card', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockAgentCard,
      });

      const card = await client.discoverAgent('https://agent.example.com');

      expect(card.name).toBe('Test Agent');
      expect(card.skills).toHaveLength(1);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://agent.example.com/.well-known/agent.json',
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('should throw on HTTP error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      await expect(client.discoverAgent('https://agent.example.com'))
        .rejects.toThrow('Agent discovery failed');
    });

    it('should throw on invalid agent card', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ description: 'missing name and skills' }),
      });

      await expect(client.discoverAgent('https://agent.example.com'))
        .rejects.toThrow('Invalid agent card');
    });

    it('should strip trailing slash from URL', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockAgentCard,
      });

      await client.discoverAgent('https://agent.example.com/');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://agent.example.com/.well-known/agent.json',
        expect.any(Object)
      );
    });
  });

  describe('sendTask', () => {
    it('should send a task to an external agent', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: { id: 'task-1' } }),
      });

      const result = await client.sendTask(
        'https://agent.example.com',
        'test',
        { role: 'user', parts: [{ type: 'text', text: 'Hello' }] },
        'auth-token'
      );

      expect(result).toHaveProperty('success', true);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://agent.example.com/api/a2a/tasks',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer auth-token',
          }),
        })
      );
    });

    it('should send without auth token when not provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      await client.sendTask('https://agent.example.com', 'test', { role: 'user', parts: [] });

      const headers = mockFetch.mock.calls[0][1].headers;
      expect(headers).not.toHaveProperty('Authorization');
    });

    it('should throw on HTTP error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Internal error',
      });

      await expect(
        client.sendTask('https://agent.example.com', 'test', {})
      ).rejects.toThrow('Task send failed');
    });
  });

  describe('getTaskStatus', () => {
    it('should fetch task status', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'completed' }),
      });

      const result = await client.getTaskStatus('https://agent.example.com', 'task-1', 'token');

      expect(result).toHaveProperty('status', 'completed');
    });

    it('should throw on HTTP error', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });

      await expect(
        client.getTaskStatus('https://agent.example.com', 'task-1')
      ).rejects.toThrow('Task status fetch failed');
    });
  });

  describe('cancelTask', () => {
    it('should cancel a remote task', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      await expect(
        client.cancelTask('https://agent.example.com', 'task-1', 'token')
      ).resolves.not.toThrow();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://agent.example.com/api/a2a/tasks/task-1',
        expect.objectContaining({ method: 'DELETE' })
      );
    });

    it('should throw on HTTP error', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

      await expect(
        client.cancelTask('https://agent.example.com', 'task-1')
      ).rejects.toThrow('Task cancel failed');
    });
  });

  describe('registerAgent', () => {
    it('should register an agent and discover its card', async () => {
      // discoverAgent fetch
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockAgentCard,
      });

      mockQueryContext.mockResolvedValueOnce({ rows: [mockAgentRow], rowCount: 1 } as any);

      const agent = await client.registerAgent('personal' as any, {
        name: 'Test Agent',
        url: 'https://agent.example.com',
      });

      expect(agent.name).toBe('Test Agent');
      expect(mockQueryContext).toHaveBeenCalledWith(
        'personal',
        expect.stringContaining('INSERT INTO a2a_external_agents'),
        expect.any(Array)
      );
    });

    it('should register even if discovery fails', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));
      mockQueryContext.mockResolvedValueOnce({ rows: [mockAgentRow], rowCount: 1 } as any);

      const agent = await client.registerAgent('personal' as any, {
        name: 'Offline Agent',
        url: 'https://offline.example.com',
      });

      expect(agent.name).toBe('Test Agent'); // from mock row
    });
  });

  describe('listAgents', () => {
    it('should return active agents', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [mockAgentRow], rowCount: 1 } as any);

      const agents = await client.listAgents('personal' as any);

      expect(agents).toHaveLength(1);
      expect(agents[0].name).toBe('Test Agent');
      expect(mockQueryContext).toHaveBeenCalledWith(
        'personal',
        expect.stringContaining('is_active = true')
      );
    });
  });

  describe('removeAgent', () => {
    it('should remove an agent', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [{ id: 'agent-123' }], rowCount: 1 } as any);

      await expect(client.removeAgent('personal' as any, 'agent-123')).resolves.not.toThrow();
    });

    it('should throw when agent not found', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      await expect(
        client.removeAgent('personal' as any, 'nonexistent')
      ).rejects.toThrow('not found');
    });
  });

  describe('healthCheck', () => {
    it('should return healthy status when agent responds', async () => {
      // Get agent from DB
      mockQueryContext.mockResolvedValueOnce({ rows: [mockAgentRow], rowCount: 1 } as any);
      // Discover agent
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockAgentCard,
      });
      // Update health status
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      const result = await client.healthCheck('personal' as any, 'agent-123');

      expect(result.status).toBe('healthy');
      expect(result.responseTimeMs).toBeGreaterThanOrEqual(0);
      expect(result.agentCard).toBeTruthy();
    });

    it('should return unhealthy status when agent fails', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [mockAgentRow], rowCount: 1 } as any);
      mockFetch.mockRejectedValueOnce(new Error('Connection refused'));
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      const result = await client.healthCheck('personal' as any, 'agent-123');

      expect(result.status).toBe('unhealthy');
      expect(result.error).toContain('Connection refused');
    });

    it('should throw when agent not found in DB', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      await expect(
        client.healthCheck('personal' as any, 'nonexistent')
      ).rejects.toThrow('not found');
    });
  });
});
