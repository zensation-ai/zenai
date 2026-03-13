/**
 * Unit Tests for MCP Client Manager (Phase 55)
 *
 * Tests MCPClientInstance and MCPClientManager for external MCP server connections.
 */

import { MCPClientInstance, MCPClientManager, mcpClientManager } from '../../../services/mcp/mcp-client';
import type { MCPServerConfig, MCPServerStatus } from '../../../services/mcp/mcp-client';

// Mock transport
jest.mock('../../../services/mcp/mcp-transport', () => {
  const mockTransport = {
    request: jest.fn(),
    close: jest.fn(),
    isConnected: jest.fn().mockReturnValue(false),
  };
  return {
    createTransport: jest.fn().mockReturnValue(mockTransport),
    __mockTransport: mockTransport,
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

const { __mockTransport: mockTransport } = jest.requireMock('../../../services/mcp/mcp-transport');

describe('MCP Client', () => {
  const testConfig: MCPServerConfig = {
    id: 'test-server-1',
    name: 'Test Server',
    transport: {
      type: 'streamable-http',
      url: 'https://example.com/mcp',
    },
    enabled: true,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockTransport.isConnected.mockReturnValue(false);
    mockTransport.request.mockReset();
    mockTransport.close.mockReset();
  });

  // ===========================================
  // MCPClientInstance
  // ===========================================

  describe('MCPClientInstance', () => {
    let client: MCPClientInstance;

    beforeEach(() => {
      client = new MCPClientInstance(testConfig);
    });

    it('should have correct id and name', () => {
      expect(client.id).toBe('test-server-1');
      expect(client.name).toBe('Test Server');
    });

    it('should start as not healthy and not connected', () => {
      expect(client.isHealthy).toBe(false);
      expect(client.isConnected).toBe(false);
    });

    it('should connect successfully', async () => {
      mockTransport.request.mockResolvedValueOnce({ protocolVersion: '2024-11-05' });
      await client.connect();
      expect(client.isHealthy).toBe(true);
      expect(mockTransport.request).toHaveBeenCalledWith('initialize', expect.any(Object));
    });

    it('should handle connect failure', async () => {
      mockTransport.request.mockRejectedValueOnce(new Error('Connection refused'));
      await expect(client.connect()).rejects.toThrow('Connection refused');
      expect(client.isHealthy).toBe(false);
    });

    it('should disconnect', async () => {
      await client.disconnect();
      expect(mockTransport.close).toHaveBeenCalled();
      expect(client.isHealthy).toBe(false);
    });

    it('should list tools', async () => {
      const mockTools = [
        { name: 'search', description: 'Search tool' },
        { name: 'create', description: 'Create tool' },
      ];
      mockTransport.request.mockResolvedValueOnce({ tools: mockTools });

      const tools = await client.listTools(false);
      expect(tools).toEqual(mockTools);
      expect(mockTransport.request).toHaveBeenCalledWith('tools/list');
    });

    it('should cache tools by default', async () => {
      const mockTools = [{ name: 'search', description: 'Search' }];
      mockTransport.request.mockResolvedValueOnce({ tools: mockTools });

      await client.listTools(false); // first call - no cache
      const cached = await client.listTools(true); // second call - use cache
      expect(cached).toEqual(mockTools);
      expect(mockTransport.request).toHaveBeenCalledTimes(1); // Only 1 call
    });

    it('should call a tool', async () => {
      const mockResult = { content: [{ type: 'text', text: 'result' }] };
      mockTransport.request.mockResolvedValueOnce(mockResult);

      const result = await client.callTool('search', { query: 'test' });
      expect(result.content).toEqual([{ type: 'text', text: 'result' }]);
      expect(mockTransport.request).toHaveBeenCalledWith('tools/call', {
        name: 'search',
        arguments: { query: 'test' },
      });
    });

    it('should list resources', async () => {
      const mockResources = [{ uri: 'test://resource', name: 'Test', mimeType: 'text/plain' }];
      mockTransport.request.mockResolvedValueOnce({ resources: mockResources });

      const resources = await client.listResources(false);
      expect(resources).toEqual(mockResources);
    });

    it('should read a resource', async () => {
      const mockContents = { contents: [{ uri: 'test://r', mimeType: 'text/plain', text: 'data' }] };
      mockTransport.request.mockResolvedValueOnce(mockContents);

      const result = await client.readResource('test://r');
      expect(result.contents).toHaveLength(1);
    });

    it('should perform health check successfully', async () => {
      mockTransport.request.mockResolvedValueOnce({ tools: [] });
      const healthy = await client.healthCheck();
      expect(healthy).toBe(true);
      expect(client.isHealthy).toBe(true);
    });

    it('should report unhealthy on health check failure', async () => {
      mockTransport.request.mockRejectedValueOnce(new Error('timeout'));
      const healthy = await client.healthCheck();
      expect(healthy).toBe(false);
      expect(client.isHealthy).toBe(false);
    });

    it('should return correct status', () => {
      const status = client.getStatus();
      expect(status).toEqual({
        id: 'test-server-1',
        name: 'Test Server',
        connected: false,
        healthy: false,
        toolCount: 0,
        resourceCount: 0,
        lastHealthCheck: null,
        error: null,
      });
    });

    it('should clear cache', async () => {
      mockTransport.request.mockResolvedValueOnce({ tools: [{ name: 'a' }] });
      await client.listTools(false);

      client.clearCache();

      mockTransport.request.mockResolvedValueOnce({ tools: [{ name: 'b' }] });
      const tools = await client.listTools(true);
      expect(tools).toEqual([{ name: 'b' }]);
      expect(mockTransport.request).toHaveBeenCalledTimes(2);
    });

    it('should list prompts', async () => {
      const mockPrompts = [{ name: 'summarize', description: 'Summarize content' }];
      mockTransport.request.mockResolvedValueOnce({ prompts: mockPrompts });

      const prompts = await client.listPrompts();
      expect(prompts).toEqual(mockPrompts);
    });
  });

  // ===========================================
  // MCPClientManager
  // ===========================================

  describe('MCPClientManager', () => {
    let manager: MCPClientManager;

    beforeEach(async () => {
      manager = new MCPClientManager();
    });

    afterEach(async () => {
      await manager.disconnectAll();
    });

    it('should start with no connections', () => {
      expect(manager.connectedCount).toBe(0);
      expect(manager.getAllStatuses()).toEqual([]);
    });

    it('should connect to a server', async () => {
      mockTransport.request.mockResolvedValueOnce({ protocolVersion: '2024-11-05' });
      const status = await manager.connect(testConfig);
      expect(status.id).toBe('test-server-1');
      expect(manager.connectedCount).toBe(1);
    });

    it('should get a client by ID', async () => {
      mockTransport.request.mockResolvedValueOnce({ protocolVersion: '2024-11-05' });
      await manager.connect(testConfig);
      const client = manager.getClient('test-server-1');
      expect(client).toBeDefined();
      expect(client?.id).toBe('test-server-1');
    });

    it('should return undefined for unknown client', () => {
      expect(manager.getClient('unknown-id')).toBeUndefined();
    });

    it('should disconnect a server', async () => {
      mockTransport.request.mockResolvedValueOnce({ protocolVersion: '2024-11-05' });
      await manager.connect(testConfig);
      expect(manager.connectedCount).toBe(1);

      await manager.disconnect('test-server-1');
      expect(manager.connectedCount).toBe(0);
    });

    it('should handle disconnect of non-existent server', async () => {
      await expect(manager.disconnect('non-existent')).resolves.not.toThrow();
    });

    it('should list tools from a connected server', async () => {
      mockTransport.request.mockResolvedValueOnce({ protocolVersion: '2024-11-05' });
      await manager.connect(testConfig);

      mockTransport.request.mockResolvedValueOnce({ tools: [{ name: 'test-tool' }] });
      const tools = await manager.listTools('test-server-1');
      expect(tools).toHaveLength(1);
    });

    it('should throw when listing tools of disconnected server', async () => {
      await expect(manager.listTools('unknown')).rejects.toThrow('not connected');
    });

    it('should call a tool on a connected server', async () => {
      mockTransport.request.mockResolvedValueOnce({ protocolVersion: '2024-11-05' });
      await manager.connect(testConfig);

      mockTransport.request.mockResolvedValueOnce({ content: [{ type: 'text', text: 'ok' }] });
      const result = await manager.callTool('test-server-1', 'test-tool', { arg: 'val' });
      expect(result.content[0].text).toBe('ok');
    });

    it('should get status for a specific server', async () => {
      mockTransport.request.mockResolvedValueOnce({ protocolVersion: '2024-11-05' });
      await manager.connect(testConfig);

      const status = manager.getStatus('test-server-1');
      expect(status).not.toBeNull();
      expect(status?.id).toBe('test-server-1');
    });

    it('should return null status for unknown server', () => {
      expect(manager.getStatus('unknown')).toBeNull();
    });

    it('should health check return false for unknown server', async () => {
      const healthy = await manager.healthCheck('unknown');
      expect(healthy).toBe(false);
    });

    it('should disconnect all servers', async () => {
      mockTransport.request.mockResolvedValueOnce({ protocolVersion: '2024-11-05' });
      await manager.connect(testConfig);

      mockTransport.request.mockResolvedValueOnce({ protocolVersion: '2024-11-05' });
      await manager.connect({ ...testConfig, id: 'server-2', name: 'Server 2' });

      expect(manager.connectedCount).toBe(2);
      await manager.disconnectAll();
      expect(manager.connectedCount).toBe(0);
    });

    it('should reconnect by replacing existing connection', async () => {
      mockTransport.request.mockResolvedValueOnce({ protocolVersion: '2024-11-05' });
      await manager.connect(testConfig);

      mockTransport.request.mockResolvedValueOnce({ protocolVersion: '2024-11-05' });
      await manager.connect(testConfig);
      expect(manager.connectedCount).toBe(1);
    });
  });

  // ===========================================
  // Singleton
  // ===========================================

  describe('Singleton', () => {
    it('should export a singleton instance', () => {
      expect(mcpClientManager).toBeInstanceOf(MCPClientManager);
    });
  });
});
