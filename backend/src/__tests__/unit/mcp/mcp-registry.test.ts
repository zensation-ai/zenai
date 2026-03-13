/**
 * Unit Tests for MCP Server Registry (Phase 55)
 *
 * Tests database CRUD operations for MCP server configurations.
 */

const mockQueryContext = jest.fn();

jest.mock('../../../utils/database-context', () => {
  return {
    queryContext: (...args: any[]) => mockQueryContext(...args),
    AIContext: 'personal',
    isValidContext: jest.fn().mockReturnValue(true),
  };
});

jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

import { mcpServerRegistry } from '../../../services/mcp/mcp-registry';
import type { MCPServerCreate } from '../../../services/mcp/mcp-registry';

describe('MCP Server Registry', () => {
  const mockServerRow = {
    id: 'server-1',
    name: 'Test Server',
    transport: 'streamable-http',
    url: 'https://example.com/mcp',
    command: null,
    args: '[]',
    env_vars: '{}',
    auth_type: null,
    auth_config: '{}',
    enabled: true,
    health_status: 'unknown',
    last_health_check: null,
    tool_count: 0,
    resource_count: 0,
    error_message: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryContext.mockReset();
  });

  // ===========================================
  // create
  // ===========================================

  describe('create', () => {
    it('should create a new server record', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [mockServerRow] } as any);

      const data: MCPServerCreate = {
        name: 'Test Server',
        transport: 'streamable-http',
        url: 'https://example.com/mcp',
      };

      const result = await mcpServerRegistry.create('personal' as any, data);
      expect(result.id).toBe('server-1');
      expect(result.name).toBe('Test Server');
      expect(result.transport).toBe('streamable-http');
      expect(mockQueryContext).toHaveBeenCalledTimes(1);
    });

    it('should default enabled to true', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [mockServerRow] } as any);

      await mcpServerRegistry.create('personal' as any, {
        name: 'Test',
        transport: 'streamable-http',
        url: 'https://example.com',
      });

      const params = mockQueryContext.mock.calls[0][2];
      expect(params[8]).toBe(true); // enabled param
    });

    it('should serialize args and envVars as JSON', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [mockServerRow] } as any);

      await mcpServerRegistry.create('personal' as any, {
        name: 'Stdio Server',
        transport: 'stdio',
        command: 'npx',
        args: ['--port', '3001'],
        envVars: { API_KEY: 'test' },
      });

      const params = mockQueryContext.mock.calls[0][2];
      expect(params[4]).toBe(JSON.stringify(['--port', '3001']));
      expect(params[5]).toBe(JSON.stringify({ API_KEY: 'test' }));
    });
  });

  // ===========================================
  // getById
  // ===========================================

  describe('getById', () => {
    it('should return a server by ID', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [mockServerRow] } as any);

      const result = await mcpServerRegistry.getById('personal' as any, 'server-1');
      expect(result).not.toBeNull();
      expect(result?.id).toBe('server-1');
    });

    it('should return null if not found', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      const result = await mcpServerRegistry.getById('personal' as any, 'non-existent');
      expect(result).toBeNull();
    });
  });

  // ===========================================
  // list
  // ===========================================

  describe('list', () => {
    it('should list all servers', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [mockServerRow, { ...mockServerRow, id: 'server-2' }] } as any);

      const result = await mcpServerRegistry.list('personal' as any);
      expect(result).toHaveLength(2);
    });

    it('should filter enabled only', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [mockServerRow] } as any);

      await mcpServerRegistry.list('personal' as any, true);
      const sql = mockQueryContext.mock.calls[0][1] as string;
      expect(sql).toContain('enabled = true');
    });
  });

  // ===========================================
  // update
  // ===========================================

  describe('update', () => {
    it('should update specified fields', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [{ ...mockServerRow, name: 'Updated Name' }] } as any);

      const result = await mcpServerRegistry.update('personal' as any, 'server-1', { name: 'Updated Name' });
      expect(result).not.toBeNull();
      expect(result?.name).toBe('Updated Name');
    });

    it('should return existing record if no fields to update', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [mockServerRow] } as any);

      const result = await mcpServerRegistry.update('personal' as any, 'server-1', {});
      expect(result).not.toBeNull();
    });

    it('should return null if server not found', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      const result = await mcpServerRegistry.update('personal' as any, 'non-existent', { name: 'New' });
      expect(result).toBeNull();
    });
  });

  // ===========================================
  // delete
  // ===========================================

  describe('delete', () => {
    it('should delete a server and return true', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [{ id: 'server-1' }] } as any);

      const result = await mcpServerRegistry.delete('personal' as any, 'server-1');
      expect(result).toBe(true);
    });

    it('should return false if server not found', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      const result = await mcpServerRegistry.delete('personal' as any, 'non-existent');
      expect(result).toBe(false);
    });
  });

  // ===========================================
  // updateHealthStatus
  // ===========================================

  describe('updateHealthStatus', () => {
    it('should update health status fields', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      await mcpServerRegistry.updateHealthStatus(
        'personal' as any,
        'server-1',
        'healthy',
        5,
        2,
        null
      );

      expect(mockQueryContext).toHaveBeenCalledTimes(1);
      const params = mockQueryContext.mock.calls[0][2];
      expect(params[0]).toBe('healthy');
      expect(params[1]).toBe(5);
      expect(params[2]).toBe(2);
      expect(params[3]).toBeNull();
    });
  });

  // ===========================================
  // syncTools
  // ===========================================

  describe('syncTools', () => {
    it('should delete existing and insert new tools', async () => {
      // 1: DELETE, 2: INSERT tool1, 3: INSERT tool2, 4: UPDATE count
      mockQueryContext
        .mockResolvedValueOnce({ rows: [] } as any)
        .mockResolvedValueOnce({ rows: [] } as any)
        .mockResolvedValueOnce({ rows: [] } as any)
        .mockResolvedValueOnce({ rows: [] } as any);

      await mcpServerRegistry.syncTools('personal' as any, 'server-1', [
        { name: 'tool1', description: 'First tool' },
        { name: 'tool2', description: 'Second tool' },
      ]);

      expect(mockQueryContext).toHaveBeenCalledTimes(4);
    });
  });

  // ===========================================
  // getTools
  // ===========================================

  describe('getTools', () => {
    it('should return tool records for a server', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [{
          id: 'tool-1',
          server_id: 'server-1',
          tool_name: 'search',
          description: 'Search tool',
          input_schema: null,
          usage_count: 5,
          avg_latency_ms: 120,
          last_used: '2026-01-01T00:00:00Z',
          created_at: '2026-01-01T00:00:00Z',
        }],
      } as any);

      const tools = await mcpServerRegistry.getTools('personal' as any, 'server-1');
      expect(tools).toHaveLength(1);
      expect(tools[0].toolName).toBe('search');
      expect(tools[0].usageCount).toBe(5);
    });
  });

  // ===========================================
  // recordToolUsage
  // ===========================================

  describe('recordToolUsage', () => {
    it('should update usage count and latency', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      await mcpServerRegistry.recordToolUsage('personal' as any, 'server-1', 'search', 150);
      expect(mockQueryContext).toHaveBeenCalledTimes(1);
      const params = mockQueryContext.mock.calls[0][2];
      expect(params[0]).toBe(150); // latency
      expect(params[1]).toBe('server-1');
      expect(params[2]).toBe('search');
    });
  });
});
