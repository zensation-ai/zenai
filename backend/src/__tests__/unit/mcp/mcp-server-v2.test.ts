/**
 * Unit Tests for MCP Server V2 (Phase 55 Upgrade)
 *
 * Tests the enhanced MCP server with Resources and Prompts support.
 */

const mockQueryContext = jest.fn();
const mockToolRegistryHas = jest.fn();
const mockToolRegistryExecute = jest.fn();

jest.mock('../../../utils/database-context', () => ({
  queryContext: (...args: any[]) => mockQueryContext(...args),
  AIContext: 'personal',
}));

jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('../../../services/claude/tool-use', () => ({
  toolRegistry: {
    has: (...args: any[]) => mockToolRegistryHas(...args),
    execute: (...args: any[]) => mockToolRegistryExecute(...args),
  },
  ToolExecutionContext: {},
}));

import { handleMCPRequest, getExposedTools } from '../../../services/mcp-server';

describe('MCP Server V2 (Phase 55)', () => {
  const context = 'personal' as any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryContext.mockReset();
    mockToolRegistryHas.mockReset();
    mockToolRegistryExecute.mockReset();
  });

  // ===========================================
  // initialize
  // ===========================================

  describe('initialize', () => {
    it('should return server info and capabilities', async () => {
      const response = await handleMCPRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
      }, context);

      expect(response.result).toHaveProperty('protocolVersion');
      expect(response.result).toHaveProperty('capabilities');
      expect(response.result).toHaveProperty('serverInfo');

      const result = response.result as any;
      expect(result.serverInfo.name).toBe('zenai');
      expect(result.capabilities.tools).toBeDefined();
      expect(result.capabilities.resources).toBeDefined();
      expect(result.capabilities.prompts).toBeDefined();
    });
  });

  // ===========================================
  // tools/list
  // ===========================================

  describe('tools/list', () => {
    it('should return list of exposed tools', async () => {
      const response = await handleMCPRequest({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
      }, context);

      expect(response.error).toBeUndefined();
      const result = response.result as any;
      expect(result.tools).toBeInstanceOf(Array);
      expect(result.tools.length).toBeGreaterThanOrEqual(10);

      const toolNames = result.tools.map((t: any) => t.name);
      expect(toolNames).toContain('search_ideas');
      expect(toolNames).toContain('create_idea');
      expect(toolNames).toContain('remember');
      expect(toolNames).toContain('recall');
      expect(toolNames).toContain('web_search');
    });
  });

  // ===========================================
  // tools/call
  // ===========================================

  describe('tools/call', () => {
    it('should call an exposed tool', async () => {
      mockToolRegistryHas.mockReturnValue(true);
      mockToolRegistryExecute.mockResolvedValueOnce('search results here');

      const response = await handleMCPRequest({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: { name: 'search_ideas', arguments: { query: 'test' } },
      }, context);

      expect(response.error).toBeUndefined();
      const result = response.result as any;
      expect(result.content[0].text).toBe('search results here');
    });

    it('should reject calls to non-exposed tools', async () => {
      const response = await handleMCPRequest({
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: { name: 'delete_everything', arguments: {} },
      }, context);

      expect(response.error).toBeDefined();
      expect(response.error?.code).toBe(-32602);
    });

    it('should return error for missing tool name', async () => {
      const response = await handleMCPRequest({
        jsonrpc: '2.0',
        id: 5,
        method: 'tools/call',
        params: {},
      }, context);

      expect(response.error).toBeDefined();
    });
  });

  // ===========================================
  // resources/list (Phase 55)
  // ===========================================

  describe('resources/list', () => {
    it('should return list of exposed resources', async () => {
      const response = await handleMCPRequest({
        jsonrpc: '2.0',
        id: 10,
        method: 'resources/list',
      }, context);

      expect(response.error).toBeUndefined();
      const result = response.result as any;
      expect(result.resources).toBeInstanceOf(Array);
      expect(result.resources.length).toBe(7); // 4 original + 3 Phase 59 memory resources

      const uris = result.resources.map((r: any) => r.uri);
      expect(uris).toContain('zenai://ideas/recent');
      expect(uris).toContain('zenai://calendar/today');
      expect(uris).toContain('zenai://memory/facts');
      expect(uris).toContain('zenai://emails/unread');
      // Phase 59: Memory Excellence resources
      expect(uris).toContain('zenai://memory/working');
      expect(uris).toContain('zenai://memory/procedures');
      expect(uris).toContain('zenai://memory/entities');
    });
  });

  // ===========================================
  // resources/read (Phase 55)
  // ===========================================

  describe('resources/read', () => {
    it('should read zenai://ideas/recent', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [{ id: '1', title: 'Test Idea', type: 'idea' }],
      });

      const response = await handleMCPRequest({
        jsonrpc: '2.0',
        id: 11,
        method: 'resources/read',
        params: { uri: 'zenai://ideas/recent' },
      }, context);

      expect(response.error).toBeUndefined();
      const result = response.result as any;
      expect(result.contents).toHaveLength(1);
      expect(result.contents[0].uri).toBe('zenai://ideas/recent');
      expect(result.contents[0].mimeType).toBe('application/json');
    });

    it('should read zenai://calendar/today', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [{ id: '1', title: 'Meeting', start_time: new Date().toISOString() }],
      });

      const response = await handleMCPRequest({
        jsonrpc: '2.0',
        id: 12,
        method: 'resources/read',
        params: { uri: 'zenai://calendar/today' },
      }, context);

      expect(response.error).toBeUndefined();
      const result = response.result as any;
      expect(result.contents[0].uri).toBe('zenai://calendar/today');
    });

    it('should read zenai://memory/facts', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [{ id: '1', content: 'User prefers dark mode', fact_type: 'preference' }],
      });

      const response = await handleMCPRequest({
        jsonrpc: '2.0',
        id: 13,
        method: 'resources/read',
        params: { uri: 'zenai://memory/facts' },
      }, context);

      expect(response.error).toBeUndefined();
    });

    it('should read zenai://emails/unread', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [],
      });

      const response = await handleMCPRequest({
        jsonrpc: '2.0',
        id: 14,
        method: 'resources/read',
        params: { uri: 'zenai://emails/unread' },
      }, context);

      expect(response.error).toBeUndefined();
    });

    it('should return empty for unknown resource', async () => {
      const response = await handleMCPRequest({
        jsonrpc: '2.0',
        id: 15,
        method: 'resources/read',
        params: { uri: 'zenai://unknown/resource' },
      }, context);

      // Should return empty contents due to error handling
      expect(response.error).toBeUndefined();
      const result = response.result as any;
      expect(result.contents[0].text).toBe('[]');
    });

    it('should return error for missing URI', async () => {
      const response = await handleMCPRequest({
        jsonrpc: '2.0',
        id: 16,
        method: 'resources/read',
        params: {},
      }, context);

      expect(response.error).toBeDefined();
    });

    it('should handle DB errors gracefully', async () => {
      mockQueryContext.mockRejectedValueOnce(new Error('Table does not exist'));

      const response = await handleMCPRequest({
        jsonrpc: '2.0',
        id: 17,
        method: 'resources/read',
        params: { uri: 'zenai://ideas/recent' },
      }, context);

      // Should return empty array instead of error
      expect(response.error).toBeUndefined();
      const result = response.result as any;
      expect(result.contents[0].text).toBe('[]');
    });
  });

  // ===========================================
  // prompts/list (Phase 55)
  // ===========================================

  describe('prompts/list', () => {
    it('should return list of prompts', async () => {
      const response = await handleMCPRequest({
        jsonrpc: '2.0',
        id: 20,
        method: 'prompts/list',
      }, context);

      expect(response.error).toBeUndefined();
      const result = response.result as any;
      expect(result.prompts).toBeInstanceOf(Array);
      expect(result.prompts.length).toBe(3);

      const names = result.prompts.map((p: any) => p.name);
      expect(names).toContain('summarize');
      expect(names).toContain('translate');
      expect(names).toContain('analyze-sentiment');
    });
  });

  // ===========================================
  // prompts/get (Phase 55)
  // ===========================================

  describe('prompts/get', () => {
    it('should get summarize prompt messages', async () => {
      const response = await handleMCPRequest({
        jsonrpc: '2.0',
        id: 21,
        method: 'prompts/get',
        params: { name: 'summarize', arguments: { content: 'Test content here' } },
      }, context);

      expect(response.error).toBeUndefined();
      const result = response.result as any;
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].role).toBe('user');
      expect(result.messages[0].content.text).toContain('Summarize');
    });

    it('should get translate prompt messages', async () => {
      const response = await handleMCPRequest({
        jsonrpc: '2.0',
        id: 22,
        method: 'prompts/get',
        params: { name: 'translate', arguments: { text: 'Hello', target_lang: 'de' } },
      }, context);

      expect(response.error).toBeUndefined();
      const result = response.result as any;
      expect(result.messages[0].content.text).toContain('Translate');
      expect(result.messages[0].content.text).toContain('de');
    });

    it('should get analyze-sentiment prompt messages', async () => {
      const response = await handleMCPRequest({
        jsonrpc: '2.0',
        id: 23,
        method: 'prompts/get',
        params: { name: 'analyze-sentiment', arguments: { text: 'I love this!' } },
      }, context);

      expect(response.error).toBeUndefined();
    });

    it('should return error for unknown prompt', async () => {
      const response = await handleMCPRequest({
        jsonrpc: '2.0',
        id: 24,
        method: 'prompts/get',
        params: { name: 'non-existent', arguments: {} },
      }, context);

      expect(response.error).toBeDefined();
    });

    it('should return error for missing prompt name', async () => {
      const response = await handleMCPRequest({
        jsonrpc: '2.0',
        id: 25,
        method: 'prompts/get',
        params: {},
      }, context);

      expect(response.error).toBeDefined();
    });
  });

  // ===========================================
  // ping
  // ===========================================

  describe('ping', () => {
    it('should respond to ping', async () => {
      const response = await handleMCPRequest({
        jsonrpc: '2.0',
        id: 30,
        method: 'ping',
      }, context);

      expect(response.error).toBeUndefined();
      expect(response.result).toEqual({});
    });
  });

  // ===========================================
  // Unknown method
  // ===========================================

  describe('unknown method', () => {
    it('should return method not found', async () => {
      const response = await handleMCPRequest({
        jsonrpc: '2.0',
        id: 31,
        method: 'unknown/method',
      }, context);

      expect(response.error).toBeDefined();
      expect(response.error?.code).toBe(-32601);
    });
  });

  // ===========================================
  // getExposedTools
  // ===========================================

  describe('getExposedTools', () => {
    it('should return array of tool definitions', () => {
      const tools = getExposedTools();
      expect(tools).toBeInstanceOf(Array);
      expect(tools.length).toBeGreaterThanOrEqual(10);
      tools.forEach(tool => {
        expect(tool).toHaveProperty('name');
        expect(tool).toHaveProperty('description');
        expect(tool).toHaveProperty('inputSchema');
      });
    });
  });
});
