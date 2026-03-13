/**
 * Unit Tests for MCP Tool Bridge (Phase 55)
 *
 * Tests bridging external MCP tools into ZenAI's tool registry.
 */

const mockCallTool = jest.fn();
const mockListTools = jest.fn();

jest.mock('../../../services/mcp/mcp-client', () => ({
  MCPClientManager: jest.fn(),
  mcpClientManager: {
    callTool: mockCallTool,
    listTools: mockListTools,
  },
}));

jest.mock('../../../services/mcp/mcp-registry', () => ({
  mcpServerRegistry: {
    recordToolUsage: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

import { MCPToolBridge, createToolBridge } from '../../../services/mcp/mcp-tool-bridge';

describe('MCP Tool Bridge', () => {
  let bridge: MCPToolBridge;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCallTool.mockReset();
    mockListTools.mockReset();

    // Create bridge with the mocked client manager
    const { mcpClientManager } = require('../../../services/mcp/mcp-client');
    bridge = new MCPToolBridge(mcpClientManager);
  });

  // ===========================================
  // syncServerTools
  // ===========================================

  describe('syncServerTools', () => {
    it('should sync tools from a server', async () => {
      mockListTools.mockResolvedValueOnce([
        { name: 'search', description: 'Search things', inputSchema: { type: 'object', properties: {} } },
        { name: 'create', description: 'Create things' },
      ]);

      const bridged = await bridge.syncServerTools('abcd-1234-efgh-5678', 'TestServer');
      expect(bridged).toHaveLength(2);
      expect(bridged[0].originalName).toBe('search');
      expect(bridged[0].serverId).toBe('abcd-1234-efgh-5678');
      expect(bridged[0].serverName).toBe('TestServer');
      expect(bridged[0].qualifiedName).toContain('mcp_');
    });

    it('should generate namespaced qualified names', async () => {
      mockListTools.mockResolvedValueOnce([
        { name: 'my_tool', description: 'A tool' },
      ]);

      const bridged = await bridge.syncServerTools('abcd-1234-efgh-5678', 'Server');
      expect(bridged[0].qualifiedName).toMatch(/^mcp_abcd_123_my_tool$/);
    });

    it('should replace existing tools for same server', async () => {
      mockListTools.mockResolvedValueOnce([{ name: 'tool1' }]);
      await bridge.syncServerTools('server-1', 'S1');
      expect(bridge.toolCount).toBe(1);

      mockListTools.mockResolvedValueOnce([{ name: 'tool2' }, { name: 'tool3' }]);
      await bridge.syncServerTools('server-1', 'S1');
      expect(bridge.toolCount).toBe(2);
    });
  });

  // ===========================================
  // executeTool
  // ===========================================

  describe('executeTool', () => {
    beforeEach(async () => {
      mockListTools.mockResolvedValueOnce([
        { name: 'search', description: 'Search', inputSchema: { type: 'object' } },
      ]);
      await bridge.syncServerTools('server-1', 'TestServer');
    });

    it('should execute a bridged tool', async () => {
      mockCallTool.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'result data' }],
        isError: false,
      });

      const tools = bridge.getAllBridgedTools();
      const qualifiedName = tools[0].qualifiedName;

      const result = await bridge.executeTool(qualifiedName, { query: 'test' });
      expect(result.success).toBe(true);
      expect(result.content).toBe('result data');
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
      expect(result.isError).toBe(false);
    });

    it('should return error for unknown tool', async () => {
      const result = await bridge.executeTool('non_existent_tool', {});
      expect(result.success).toBe(false);
      expect(result.isError).toBe(true);
      expect(result.content).toContain('not found');
    });

    it('should handle execution failure', async () => {
      mockCallTool.mockRejectedValueOnce(new Error('Network error'));

      const tools = bridge.getAllBridgedTools();
      const result = await bridge.executeTool(tools[0].qualifiedName, {});
      expect(result.success).toBe(false);
      expect(result.isError).toBe(true);
      expect(result.content).toContain('Network error');
    });

    it('should handle isError flag from remote', async () => {
      mockCallTool.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'error message' }],
        isError: true,
      });

      const tools = bridge.getAllBridgedTools();
      const result = await bridge.executeTool(tools[0].qualifiedName, {});
      expect(result.success).toBe(false);
      expect(result.isError).toBe(true);
    });

    it('should record usage on success', async () => {
      mockCallTool.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'ok' }],
        isError: false,
      });

      const { mcpServerRegistry } = require('../../../services/mcp/mcp-registry');
      const tools = bridge.getAllBridgedTools();
      await bridge.executeTool(tools[0].qualifiedName, {}, 'personal' as any);

      expect(mcpServerRegistry.recordToolUsage).toHaveBeenCalledWith(
        'personal',
        'server-1',
        'search',
        expect.any(Number)
      );
    });
  });

  // ===========================================
  // Tool queries
  // ===========================================

  describe('hasTool', () => {
    it('should return true for existing tool', async () => {
      mockListTools.mockResolvedValueOnce([{ name: 'tool1' }]);
      const bridged = await bridge.syncServerTools('server-1', 'S');
      expect(bridge.hasTool(bridged[0].qualifiedName)).toBe(true);
    });

    it('should return false for non-existing tool', () => {
      expect(bridge.hasTool('non_existent')).toBe(false);
    });
  });

  describe('getAllBridgedTools', () => {
    it('should return all bridged tools', async () => {
      mockListTools.mockResolvedValueOnce([{ name: 'a' }, { name: 'b' }]);
      await bridge.syncServerTools('server-1', 'S1');

      mockListTools.mockResolvedValueOnce([{ name: 'c' }]);
      await bridge.syncServerTools('server-2', 'S2');

      expect(bridge.getAllBridgedTools()).toHaveLength(3);
    });
  });

  describe('getServerTools', () => {
    it('should return tools for a specific server', async () => {
      mockListTools.mockResolvedValueOnce([{ name: 'a' }, { name: 'b' }]);
      await bridge.syncServerTools('server-1', 'S1');

      mockListTools.mockResolvedValueOnce([{ name: 'c' }]);
      await bridge.syncServerTools('server-2', 'S2');

      expect(bridge.getServerTools('server-1')).toHaveLength(2);
      expect(bridge.getServerTools('server-2')).toHaveLength(1);
    });
  });

  describe('removeBridgedTools', () => {
    it('should remove tools for a specific server', async () => {
      mockListTools.mockResolvedValueOnce([{ name: 'a' }]);
      await bridge.syncServerTools('server-1', 'S1');

      mockListTools.mockResolvedValueOnce([{ name: 'b' }]);
      await bridge.syncServerTools('server-2', 'S2');

      expect(bridge.toolCount).toBe(2);
      bridge.removeBridgedTools('server-1');
      expect(bridge.toolCount).toBe(1);
      expect(bridge.getServerTools('server-1')).toHaveLength(0);
    });
  });

  describe('clear', () => {
    it('should clear all bridged tools', async () => {
      mockListTools.mockResolvedValueOnce([{ name: 'a' }]);
      await bridge.syncServerTools('server-1', 'S1');
      expect(bridge.toolCount).toBe(1);

      bridge.clear();
      expect(bridge.toolCount).toBe(0);
    });
  });

  // ===========================================
  // Factory
  // ===========================================

  describe('createToolBridge', () => {
    it('should create a new MCPToolBridge instance', () => {
      const { mcpClientManager } = require('../../../services/mcp/mcp-client');
      const newBridge = createToolBridge(mcpClientManager);
      expect(newBridge).toBeInstanceOf(MCPToolBridge);
    });
  });
});
