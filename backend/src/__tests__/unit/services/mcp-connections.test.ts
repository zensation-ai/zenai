/**
 * MCP Connection Manager Tests - Phase 44
 */

import { mcpConnectionManager } from '../../../services/mcp-connections';

// Mock database
jest.mock('../../../utils/database-context', () => ({
  queryContext: jest.fn(),
  isValidContext: jest.fn().mockReturnValue(true),
}));

// Mock mcp-client
jest.mock('../../../services/mcp-client', () => ({
  createMCPClient: jest.fn().mockReturnValue({
    id: 'test-id',
    name: 'Test',
    url: 'https://test.com',
    isHealthy: true,
    listTools: jest.fn().mockResolvedValue([
      { name: 'tool1', description: 'Tool 1', inputSchema: { type: 'object', properties: {} } },
    ]),
    listResources: jest.fn().mockResolvedValue([]),
    healthCheck: jest.fn().mockResolvedValue(true),
    callTool: jest.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'Result' }],
      isError: false,
    }),
    readResource: jest.fn().mockResolvedValue({
      contents: [{ uri: 'test://res', mimeType: 'text/plain', text: 'data' }],
    }),
    clearCache: jest.fn(),
    getInfo: jest.fn().mockReturnValue({ name: 'Test', version: '1.0.0', tools: [], resources: [], lastHealthCheck: null, isHealthy: true }),
  }),
}));

const { queryContext } = require('../../../utils/database-context');

describe('MCP Connection Manager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('initialize', () => {
    it('should load enabled connections from DB', async () => {
      queryContext.mockResolvedValueOnce({
        rows: [{
          id: 'c1',
          name: 'Test Server',
          url: 'https://mcp.test.com',
          api_key: null,
          status: 'connected',
          tool_count: 3,
          resource_count: 0,
          last_health_check: null,
          error_message: null,
          context: 'personal',
          enabled: true,
          headers: null,
          created_at: '2026-03-09T00:00:00Z',
          updated_at: '2026-03-09T00:00:00Z',
        }],
      });

      // Health check update
      queryContext.mockResolvedValueOnce({ rows: [] });
      // Get connection after check
      queryContext.mockResolvedValueOnce({
        rows: [{
          id: 'c1',
          name: 'Test Server',
          url: 'https://mcp.test.com',
          api_key: null,
          status: 'connected',
          tool_count: 1,
          resource_count: 0,
          last_health_check: '2026-03-09T00:00:00Z',
          error_message: null,
          context: 'personal',
          enabled: true,
          headers: null,
          created_at: '2026-03-09T00:00:00Z',
          updated_at: '2026-03-09T00:00:00Z',
        }],
      });

      await mcpConnectionManager.initialize('personal');
      // Should not throw
    });

    it('should handle missing table gracefully', async () => {
      queryContext.mockRejectedValueOnce(new Error('relation "mcp_connections" does not exist'));
      await mcpConnectionManager.initialize('personal');
      // Should not throw
    });
  });

  describe('createConnection', () => {
    it('should create a new connection', async () => {
      const mockRow = {
        id: 'new-id',
        name: 'New Server',
        url: 'https://new.server.com',
        api_key: 'key123',
        status: 'pending',
        tool_count: 0,
        resource_count: 0,
        last_health_check: null,
        error_message: null,
        context: 'work',
        enabled: true,
        headers: null,
        created_at: '2026-03-09T00:00:00Z',
        updated_at: '2026-03-09T00:00:00Z',
      };

      queryContext.mockResolvedValueOnce({ rows: [mockRow] });
      // Health check mock
      queryContext.mockResolvedValueOnce({ rows: [] });
      queryContext.mockResolvedValueOnce({ rows: [{ ...mockRow, status: 'connected', tool_count: 1 }] });

      const conn = await mcpConnectionManager.createConnection('work', {
        name: 'New Server',
        url: 'https://new.server.com',
        apiKey: 'key123',
      });

      expect(conn.name).toBe('New Server');
      expect(conn.url).toBe('https://new.server.com');
      expect(queryContext).toHaveBeenCalledWith('work', expect.stringContaining('INSERT'), expect.any(Array));
    });
  });

  describe('listConnections', () => {
    it('should list all connections for a context', async () => {
      queryContext.mockResolvedValueOnce({
        rows: [
          {
            id: 'c1', name: 'Server 1', url: 'https://s1.com', api_key: null,
            status: 'connected', tool_count: 5, resource_count: 2,
            last_health_check: '2026-03-09T00:00:00Z', error_message: null,
            context: 'personal', enabled: true, headers: null,
            created_at: '2026-03-09T00:00:00Z', updated_at: '2026-03-09T00:00:00Z',
          },
          {
            id: 'c2', name: 'Server 2', url: 'https://s2.com', api_key: null,
            status: 'error', tool_count: 0, resource_count: 0,
            last_health_check: '2026-03-09T00:00:00Z', error_message: 'Connection refused',
            context: 'personal', enabled: true, headers: null,
            created_at: '2026-03-09T00:00:00Z', updated_at: '2026-03-09T00:00:00Z',
          },
        ],
      });

      const connections = await mcpConnectionManager.listConnections('personal');
      expect(connections).toHaveLength(2);
      expect(connections[0].name).toBe('Server 1');
      expect(connections[0].status).toBe('connected');
      expect(connections[1].errorMessage).toBe('Connection refused');
    });
  });

  describe('deleteConnection', () => {
    it('should delete a connection', async () => {
      queryContext.mockResolvedValueOnce({ rows: [{ id: 'c1' }] });

      const deleted = await mcpConnectionManager.deleteConnection('personal', 'c1');
      expect(deleted).toBe(true);
    });

    it('should return false if not found', async () => {
      queryContext.mockResolvedValueOnce({ rows: [] });

      const deleted = await mcpConnectionManager.deleteConnection('personal', 'nonexistent');
      expect(deleted).toBe(false);
    });
  });

  describe('callTool', () => {
    it('should throw for unknown connection', async () => {
      await expect(
        mcpConnectionManager.callTool('unknown-id', 'tool', {})
      ).rejects.toThrow('MCP connection not found');
    });
  });
});
