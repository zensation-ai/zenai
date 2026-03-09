/**
 * MCP Tool Handlers Tests - Phase 44
 */

import { handleMCPCallTool, handleMCPListTools } from '../../../services/tool-handlers/mcp-tools';
import { ToolExecutionContext } from '../../../services/claude/tool-use';

// Mock mcp-connections module
jest.mock('../../../services/mcp-connections', () => ({
  mcpConnectionManager: {
    callTool: jest.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'External tool result' }],
      isError: false,
    }),
    getAllTools: jest.fn().mockResolvedValue([
      {
        qualifiedName: 'conn1:slack_message',
        originalName: 'slack_message',
        connectionId: 'conn1',
        connectionName: 'Slack MCP',
        tool: { name: 'slack_message', description: 'Send a Slack message', inputSchema: { type: 'object', properties: {} } },
      },
      {
        qualifiedName: 'conn1:slack_search',
        originalName: 'slack_search',
        connectionId: 'conn1',
        connectionName: 'Slack MCP',
        tool: { name: 'slack_search', description: 'Search Slack messages', inputSchema: { type: 'object', properties: {} } },
      },
      {
        qualifiedName: 'conn2:github_pr',
        originalName: 'github_pr',
        connectionId: 'conn2',
        connectionName: 'GitHub MCP',
        tool: { name: 'github_pr', description: 'List pull requests', inputSchema: { type: 'object', properties: {} } },
      },
    ]),
  },
}));

describe('MCP Tool Handlers', () => {
  const execContext: ToolExecutionContext = {
    aiContext: 'work',
    sessionId: 'test-session',
  };

  describe('handleMCPCallTool', () => {
    it('should return error when connection_id missing', async () => {
      const result = await handleMCPCallTool({ tool_name: 'test' }, execContext);
      expect(result).toContain('Fehler');
    });

    it('should return error when tool_name missing', async () => {
      const result = await handleMCPCallTool({ connection_id: 'conn1' }, execContext);
      expect(result).toContain('Fehler');
    });

    it('should call tool on external server', async () => {
      const result = await handleMCPCallTool(
        { connection_id: 'conn1', tool_name: 'slack_message', arguments: { channel: '#general', text: 'Hello' } },
        execContext
      );
      expect(result).toBe('External tool result');
    });

    it('should handle tool errors from external server', async () => {
      const { mcpConnectionManager } = require('../../../services/mcp-connections');
      mcpConnectionManager.callTool.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'Something failed' }],
        isError: true,
      });

      const result = await handleMCPCallTool(
        { connection_id: 'conn1', tool_name: 'failing_tool' },
        execContext
      );
      expect(result).toContain('MCP Tool-Fehler');
      expect(result).toContain('Something failed');
    });

    it('should handle connection errors', async () => {
      const { mcpConnectionManager } = require('../../../services/mcp-connections');
      mcpConnectionManager.callTool.mockRejectedValueOnce(new Error('Connection refused'));

      const result = await handleMCPCallTool(
        { connection_id: 'bad-conn', tool_name: 'test' },
        execContext
      );
      expect(result).toContain('Fehler beim MCP Tool-Aufruf');
      expect(result).toContain('Connection refused');
    });
  });

  describe('handleMCPListTools', () => {
    it('should list all tools grouped by connection', async () => {
      const result = await handleMCPListTools({}, execContext);
      expect(result).toContain('3 MCP-Tools');
      expect(result).toContain('Slack MCP');
      expect(result).toContain('GitHub MCP');
      expect(result).toContain('slack_message');
      expect(result).toContain('slack_search');
      expect(result).toContain('github_pr');
    });

    it('should handle empty tool list', async () => {
      const { mcpConnectionManager } = require('../../../services/mcp-connections');
      mcpConnectionManager.getAllTools.mockResolvedValueOnce([]);

      const result = await handleMCPListTools({}, execContext);
      expect(result).toContain('Keine externen MCP-Tools');
    });
  });
});
