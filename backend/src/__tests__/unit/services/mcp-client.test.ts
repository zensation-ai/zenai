/**
 * MCP Client SDK Tests - Phase 44
 */

import { MCPClient, createMCPClient } from '../../../services/mcp-client';

// Mock fetch globally
var mockFetch = jest.fn();
global.fetch = mockFetch;

describe('MCP Client SDK', () => {
  let client: MCPClient;

  beforeEach(() => {
    jest.clearAllMocks();
    client = createMCPClient({
      id: 'test-server',
      name: 'Test MCP Server',
      url: 'https://mcp.example.com',
      apiKey: 'test-key-123',
      timeout: 5000,
    });
  });

  describe('createMCPClient', () => {
    it('should create a client with config', () => {
      expect(client.id).toBe('test-server');
      expect(client.name).toBe('Test MCP Server');
      expect(client.url).toBe('https://mcp.example.com');
      expect(client.isHealthy).toBe(false);
    });
  });

  describe('listTools', () => {
    it('should fetch tools from remote server', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: {
            tools: [
              { name: 'test_tool', description: 'A test tool', inputSchema: { type: 'object', properties: {} } },
              { name: 'another_tool', description: 'Another tool', inputSchema: { type: 'object', properties: {} } },
            ],
          },
        }),
      });

      const tools = await client.listTools(false);
      expect(tools).toHaveLength(2);
      expect(tools[0].name).toBe('test_tool');
      expect(tools[1].name).toBe('another_tool');
    });

    it('should use cached tools on second call', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: { tools: [{ name: 'cached_tool', description: 'Cached', inputSchema: { type: 'object', properties: {} } }] },
        }),
      });

      await client.listTools(false);
      const tools = await client.listTools(true);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe('cached_tool');
    });

    it('should handle empty tools list', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: {} }),
      });

      const tools = await client.listTools(false);
      expect(tools).toEqual([]);
    });
  });

  describe('callTool', () => {
    it('should call a tool on the remote server', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: {
            content: [{ type: 'text', text: 'Tool result' }],
          },
        }),
      });

      const result = await client.callTool('test_tool', { query: 'hello' });
      expect(result.content).toHaveLength(1);
      expect(result.content[0].text).toBe('Tool result');
      expect(result.isError).toBeUndefined();
    });

    it('should handle tool errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: {
            content: [{ type: 'text', text: 'Something went wrong' }],
            isError: true,
          },
        }),
      });

      const result = await client.callTool('failing_tool', {});
      expect(result.isError).toBe(true);
    });

    it('should send correct JSON-RPC body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: { content: [{ type: 'text', text: 'OK' }] } }),
      });

      await client.callTool('my_tool', { key: 'value' });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://mcp.example.com/mcp',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'Authorization': 'Bearer test-key-123',
          }),
        })
      );

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.method).toBe('tools/call');
      expect(body.params.name).toBe('my_tool');
      expect(body.params.arguments).toEqual({ key: 'value' });
    });
  });

  describe('listResources', () => {
    it('should fetch resources from remote server', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: {
            resources: [
              { uri: 'zenai://data', name: 'Data', description: 'Some data', mimeType: 'application/json' },
            ],
          },
        }),
      });

      const resources = await client.listResources(false);
      expect(resources).toHaveLength(1);
      expect(resources[0].uri).toBe('zenai://data');
    });
  });

  describe('readResource', () => {
    it('should read a resource from remote server', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: {
            contents: [{ uri: 'zenai://data', mimeType: 'application/json', text: '{"hello":"world"}' }],
          },
        }),
      });

      const result = await client.readResource('zenai://data');
      expect(result.contents).toHaveLength(1);
      expect(result.contents[0].text).toBe('{"hello":"world"}');
    });
  });

  describe('healthCheck', () => {
    it('should return true when server is healthy', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: { tools: [{ name: 'tool1', description: '', inputSchema: { type: 'object', properties: {} } }] } }),
      });

      const healthy = await client.healthCheck();
      expect(healthy).toBe(true);
      expect(client.isHealthy).toBe(true);
    });

    it('should return false when server is unreachable', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const healthy = await client.healthCheck();
      expect(healthy).toBe(false);
      expect(client.isHealthy).toBe(false);
    });
  });

  describe('getInfo', () => {
    it('should return server info', () => {
      const info = client.getInfo();
      expect(info.name).toBe('Test MCP Server');
      expect(info.tools).toEqual([]);
      expect(info.resources).toEqual([]);
      expect(info.isHealthy).toBe(false);
    });
  });

  describe('clearCache', () => {
    it('should clear cached tools and resources', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: { tools: [{ name: 't', description: '', inputSchema: { type: 'object', properties: {} } }] } }),
      });
      await client.listTools(false);

      client.clearCache();

      // Should fetch again
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: { tools: [] } }),
      });
      const tools = await client.listTools(true);
      expect(tools).toEqual([]);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('error handling', () => {
    it('should throw on HTTP error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      await expect(client.callTool('test', {})).rejects.toThrow('MCP server responded with 500');
    });

    it('should throw on JSON-RPC error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          error: { message: 'Tool not found' },
        }),
      });

      await expect(client.callTool('nonexistent', {})).rejects.toThrow('MCP error: Tool not found');
    });

    it('should handle timeout', async () => {
      mockFetch.mockImplementationOnce(() => new Promise((_, reject) => {
        const error = new Error('timeout');
        error.name = 'AbortError';
        setTimeout(() => reject(error), 10);
      }));

      await expect(client.callTool('slow_tool', {})).rejects.toThrow('timed out');
    });
  });

  describe('without API key', () => {
    it('should not send Authorization header', async () => {
      const noAuthClient = createMCPClient({
        id: 'no-auth',
        name: 'No Auth',
        url: 'https://open.example.com',
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: { tools: [] } }),
      });

      await noAuthClient.listTools(false);

      const headers = mockFetch.mock.calls[0][1].headers;
      expect(headers.Authorization).toBeUndefined();
    });
  });
});
