/**
 * Unit Tests for MCP Server
 *
 * Tests the Model Context Protocol server implementation.
 */

import { KIABMCPServer, createMCPServer } from '../../../mcp/server';

// Mock dependencies
jest.mock('../../../utils/database-context', () => ({
  queryContext: jest.fn(),
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

jest.mock('../../../services/claude', () => ({
  structureWithClaudePersonalized: jest.fn(),
  generateClaudeResponse: jest.fn(),
}));

jest.mock('../../../services/proactive-suggestions', () => ({
  proactiveSuggestionEngine: {
    getSuggestions: jest.fn(),
  },
}));

jest.mock('../../../services/knowledge-graph', () => ({
  getSuggestedConnections: jest.fn(),
  multiHopSearch: jest.fn(),
}));

import { queryContext } from '../../../utils/database-context';
import { structureWithClaudePersonalized, generateClaudeResponse } from '../../../services/claude';
import { proactiveSuggestionEngine } from '../../../services/proactive-suggestions';
import { getSuggestedConnections, multiHopSearch } from '../../../services/knowledge-graph';

const mockQueryContext = queryContext as jest.MockedFunction<typeof queryContext>;
const mockStructureWithClaude = structureWithClaudePersonalized as jest.MockedFunction<typeof structureWithClaudePersonalized>;
const mockGenerateClaudeResponse = generateClaudeResponse as jest.MockedFunction<typeof generateClaudeResponse>;
const mockGetSuggestions = proactiveSuggestionEngine.getSuggestions as jest.MockedFunction<typeof proactiveSuggestionEngine.getSuggestions>;
const mockGetSuggestedConnections = getSuggestedConnections as jest.MockedFunction<typeof getSuggestedConnections>;
const mockMultiHopSearch = multiHopSearch as jest.MockedFunction<typeof multiHopSearch>;

describe('MCP Server', () => {
  let server: KIABMCPServer;

  beforeEach(() => {
    jest.useFakeTimers();
    server = new KIABMCPServer();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ===========================================
  // Server Creation Tests
  // ===========================================

  describe('server creation', () => {
    it('should create server with default config', () => {
      const config = server.getConfig();

      expect(config.name).toBe('zenai-brain');
      expect(config.version).toBe('1.0.0');
      expect(config.defaultContext).toBe('personal');
    });

    it('should create server with custom config', () => {
      const customServer = new KIABMCPServer({
        name: 'custom-server',
        version: '2.0.0',
        defaultContext: 'work',
      });

      const config = customServer.getConfig();

      expect(config.name).toBe('custom-server');
      expect(config.version).toBe('2.0.0');
      expect(config.defaultContext).toBe('work');
    });

    it('should expose createMCPServer factory', () => {
      const factoryServer = createMCPServer({ name: 'factory-test' });

      expect(factoryServer).toBeInstanceOf(KIABMCPServer);
      expect(factoryServer.getConfig().name).toBe('factory-test');
    });
  });

  // ===========================================
  // Tools List Tests
  // ===========================================

  describe('tools/list', () => {
    it('should return list of available tools', async () => {
      const response = await server.handleRequest({ method: 'tools/list' });

      expect(response.tools).toBeDefined();
      expect(Array.isArray(response.tools)).toBe(true);
      expect(response.tools!.length).toBeGreaterThan(0);
    });

    it('should include create_idea tool', async () => {
      const response = await server.handleRequest({ method: 'tools/list' });

      const createIdeaTool = response.tools!.find(t => t.name === 'create_idea');
      expect(createIdeaTool).toBeDefined();
      expect(createIdeaTool!.inputSchema.properties.transcript).toBeDefined();
    });

    it('should include search_ideas tool', async () => {
      const response = await server.handleRequest({ method: 'tools/list' });

      const searchTool = response.tools!.find(t => t.name === 'search_ideas');
      expect(searchTool).toBeDefined();
      expect(searchTool!.inputSchema.properties.query).toBeDefined();
    });

    it('should include all expected tools', async () => {
      const response = await server.handleRequest({ method: 'tools/list' });

      const toolNames = response.tools!.map(t => t.name);
      expect(toolNames).toContain('create_idea');
      expect(toolNames).toContain('search_ideas');
      expect(toolNames).toContain('get_suggestions');
      expect(toolNames).toContain('chat');
      expect(toolNames).toContain('get_related_ideas');
      expect(toolNames).toContain('get_stats');
    });
  });

  // ===========================================
  // Tool Call Tests
  // ===========================================

  describe('tools/call - create_idea', () => {
    it('should create an idea from transcript', async () => {
      mockStructureWithClaude.mockResolvedValue({
        type: 'idea',
        category: 'personal',
        title: 'Test Idea',
        summary: 'Test summary',
        priority: 'medium',
        keywords: ['test'],
        next_steps: [],
        context_needed: [],
      });

      mockQueryContext.mockResolvedValue({
        rows: [{
          id: 'new-id',
          type: 'idea',
          category: 'personal',
          title: 'Test Idea',
          summary: 'Test summary',
          priority: 'medium',
          created_at: new Date(),
        }],
        rowCount: 1,
      } as any);

      const response = await server.handleRequest({
        method: 'tools/call',
        params: {
          name: 'create_idea',
          arguments: {
            transcript: 'This is a test idea about something important',
          },
        },
      });

      expect(response.content).toBeDefined();
      expect(response.isError).toBeFalsy();

      const result = JSON.parse(response.content![0].text);
      expect(result.success).toBe(true);
      expect(result.idea.title).toBe('Test Idea');
    });

    it('should error when transcript is missing', async () => {
      const response = await server.handleRequest({
        method: 'tools/call',
        params: {
          name: 'create_idea',
          arguments: {},
        },
      });

      expect(response.isError).toBe(true);
      expect(response.content![0].text).toContain('Transkript');
    });

    it('should use custom context when provided', async () => {
      mockStructureWithClaude.mockResolvedValue({
        type: 'task',
        category: 'business',
        title: 'Work Task',
        summary: 'Work summary',
        priority: 'high',
        keywords: [],
        next_steps: [],
        context_needed: [],
      });

      mockQueryContext.mockResolvedValue({ rows: [{ id: 'id' }], rowCount: 1 } as any);

      await server.handleRequest({
        method: 'tools/call',
        params: {
          name: 'create_idea',
          arguments: {
            transcript: 'Work related task',
            context: 'work',
          },
        },
      });

      expect(mockStructureWithClaude).toHaveBeenCalledWith('Work related task', 'work');
    });
  });

  describe('tools/call - search_ideas', () => {
    it('should search for ideas', async () => {
      mockQueryContext.mockResolvedValue({
        rows: [
          { id: '1', title: 'Result 1', summary: 'Summary 1', relevance: 0.9 },
          { id: '2', title: 'Result 2', summary: 'Summary 2', relevance: 0.7 },
        ],
        rowCount: 2,
      } as any);

      const response = await server.handleRequest({
        method: 'tools/call',
        params: {
          name: 'search_ideas',
          arguments: { query: 'test search' },
        },
      });

      expect(response.content).toBeDefined();

      const result = JSON.parse(response.content![0].text);
      expect(result.results).toHaveLength(2);
      expect(result.count).toBe(2);
    });

    it('should error when query is missing', async () => {
      const response = await server.handleRequest({
        method: 'tools/call',
        params: {
          name: 'search_ideas',
          arguments: {},
        },
      });

      expect(response.isError).toBe(true);
    });

    it('should respect limit parameter', async () => {
      mockQueryContext.mockResolvedValue({ rows: [], rowCount: 0 } as any);

      await server.handleRequest({
        method: 'tools/call',
        params: {
          name: 'search_ideas',
          arguments: { query: 'test', limit: 5 },
        },
      });

      const call = mockQueryContext.mock.calls[0];
      expect(call[1]).toContain('LIMIT');
    });
  });

  describe('tools/call - get_suggestions', () => {
    it('should return suggestions', async () => {
      mockGetSuggestions.mockResolvedValue([
        {
          id: 'sug-1',
          type: 'routine',
          title: 'Morning Review',
          description: 'Review your tasks',
          confidence: 0.8,
          relevanceScore: 0.9,
          action: { actionType: 'start_task', params: {}, quickActionLabel: 'Start' },
          expiresAt: new Date(),
          metadata: {},
          source: 'routine_detection',
          priority: 'medium',
          createdAt: new Date(),
        },
      ]);

      const response = await server.handleRequest({
        method: 'tools/call',
        params: {
          name: 'get_suggestions',
          arguments: {},
        },
      });

      const result = JSON.parse(response.content![0].text);
      expect(result.suggestions).toHaveLength(1);
    });
  });

  describe('tools/call - chat', () => {
    it('should handle chat messages', async () => {
      mockQueryContext.mockResolvedValue({ rows: [], rowCount: 0 } as any);
      mockGenerateClaudeResponse.mockResolvedValue('Hello! How can I help you today?');

      const response = await server.handleRequest({
        method: 'tools/call',
        params: {
          name: 'chat',
          arguments: { message: 'Hello' },
        },
      });

      const result = JSON.parse(response.content![0].text);
      expect(result.response).toBe('Hello! How can I help you today?');
    });

    it('should error when message is missing', async () => {
      const response = await server.handleRequest({
        method: 'tools/call',
        params: {
          name: 'chat',
          arguments: {},
        },
      });

      expect(response.isError).toBe(true);
    });
  });

  describe('tools/call - get_related_ideas', () => {
    it('should find related ideas', async () => {
      mockGetSuggestedConnections.mockResolvedValue([
        { id: 'rel-1', title: 'Related 1', similarity: 0.8, summary: 'Test summary', keywords: ['test'] },
      ]);

      mockQueryContext.mockResolvedValue({
        rows: [{ title: 'Original Idea' }],
        rowCount: 1,
      } as any);

      mockMultiHopSearch.mockResolvedValue([
        { path: ['a', 'b'], ideas: [{ id: 'deep-1', title: 'Deep Connection' }] },
      ]);

      const response = await server.handleRequest({
        method: 'tools/call',
        params: {
          name: 'get_related_ideas',
          arguments: { ideaId: 'test-id' },
        },
      });

      const result = JSON.parse(response.content![0].text);
      expect(result.ideaId).toBe('test-id');
      expect(result.directConnections).toBeDefined();
    });

    it('should error when ideaId is missing', async () => {
      const response = await server.handleRequest({
        method: 'tools/call',
        params: {
          name: 'get_related_ideas',
          arguments: {},
        },
      });

      expect(response.isError).toBe(true);
    });
  });

  describe('tools/call - get_stats', () => {
    it('should return statistics', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [{
          total_ideas: '100',
          categories: '10',
          new_ideas: '15',
          high_priority: '20',
          this_week: '25',
        }],
        rowCount: 1,
      } as any);

      mockQueryContext.mockResolvedValueOnce({
        rows: [
          { type: 'idea', count: '60' },
          { type: 'task', count: '30' },
          { type: 'note', count: '10' },
        ],
        rowCount: 3,
      } as any);

      const response = await server.handleRequest({
        method: 'tools/call',
        params: {
          name: 'get_stats',
          arguments: {},
        },
      });

      const result = JSON.parse(response.content![0].text);
      expect(result.stats).toBeDefined();
      expect(result.typeDistribution).toBeDefined();
    });
  });

  describe('tools/call - unknown tool', () => {
    it('should error for unknown tool', async () => {
      const response = await server.handleRequest({
        method: 'tools/call',
        params: {
          name: 'unknown_tool',
          arguments: {},
        },
      });

      expect(response.isError).toBe(true);
      expect(response.content![0].text).toContain('Unbekanntes Tool');
    });
  });

  // ===========================================
  // Resources Tests
  // ===========================================

  describe('resources/list', () => {
    it('should return list of resources', async () => {
      mockQueryContext.mockResolvedValue({
        rows: [
          { id: 'idea-1', title: 'Idea 1', type: 'idea' },
          { id: 'idea-2', title: 'Idea 2', type: 'task' },
        ],
        rowCount: 2,
      } as any);

      const response = await server.handleRequest({ method: 'resources/list' });

      expect(response.resources).toBeDefined();
      expect(Array.isArray(response.resources)).toBe(true);
    });

    it('should include ideas resource', async () => {
      mockQueryContext.mockResolvedValue({ rows: [], rowCount: 0 } as any);

      const response = await server.handleRequest({ method: 'resources/list' });

      const ideasResource = response.resources!.find(r => r.uri === 'zenai://ideas');
      expect(ideasResource).toBeDefined();
    });

    it('should include stats resource', async () => {
      mockQueryContext.mockResolvedValue({ rows: [], rowCount: 0 } as any);

      const response = await server.handleRequest({ method: 'resources/list' });

      const statsResource = response.resources!.find(r => r.uri === 'zenai://stats');
      expect(statsResource).toBeDefined();
    });
  });

  describe('resources/read', () => {
    it('should read ideas list', async () => {
      mockQueryContext.mockResolvedValue({
        rows: [
          { id: '1', title: 'Idea 1', summary: 'Summary 1' },
          { id: '2', title: 'Idea 2', summary: 'Summary 2' },
        ],
        rowCount: 2,
      } as any);

      const response = await server.handleRequest({
        method: 'resources/read',
        params: { uri: 'zenai://ideas' },
      });

      expect(response.contents).toBeDefined();
      expect(response.contents![0].uri).toBe('zenai://ideas');

      const content = JSON.parse(response.contents![0].text);
      expect(content.ideas).toHaveLength(2);
    });

    it('should read individual idea', async () => {
      // Use UUID format to match the regex pattern
      const testId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

      mockQueryContext.mockResolvedValue({
        rows: [{
          id: testId,
          title: 'Test Idea',
          summary: 'Test Summary',
          type: 'idea',
        }],
        rowCount: 1,
      } as any);

      const response = await server.handleRequest({
        method: 'resources/read',
        params: { uri: `zenai://ideas/${testId}` },
      });

      // Implementation returns content, not contents
      expect(response.content || response.contents).toBeDefined();

      const contentArray = response.content || response.contents;
      const content = JSON.parse(contentArray![0].text);
      expect(content.title).toBe('Test Idea');
    });

    it('should return error for non-existent idea', async () => {
      mockQueryContext.mockResolvedValue({ rows: [], rowCount: 0 } as any);

      const response = await server.handleRequest({
        method: 'resources/read',
        params: { uri: 'zenai://ideas/non-existent-id' },
      });

      // Implementation returns isError: true instead of throwing
      expect(response.isError).toBe(true);
    });

    it('should return error for unknown resource', async () => {
      const response = await server.handleRequest({
        method: 'resources/read',
        params: { uri: 'zenai://unknown/resource' },
      });

      // Implementation returns isError: true instead of throwing
      expect(response.isError).toBe(true);
    });
  });

  // ===========================================
  // Error Handling Tests
  // ===========================================

  describe('error handling', () => {
    it('should handle unknown methods', async () => {
      const response = await server.handleRequest({ method: 'unknown/method' });

      expect(response.isError).toBe(true);
      expect(response.content![0].text).toContain('Unbekannte Methode');
    });

    it('should handle database errors gracefully', async () => {
      mockQueryContext.mockRejectedValue(new Error('Database connection failed'));

      const response = await server.handleRequest({
        method: 'tools/call',
        params: {
          name: 'search_ideas',
          arguments: { query: 'test' },
        },
      });

      expect(response.isError).toBe(true);
      expect(response.content![0].text).toContain('Fehler');
    });
  });

  // ===========================================
  // getTools Tests
  // ===========================================

  describe('getTools', () => {
    it('should return copy of tools array', () => {
      const tools = server.getTools();

      expect(tools).toBeDefined();
      expect(Array.isArray(tools)).toBe(true);
      expect(tools.length).toBeGreaterThan(0);
    });

    it('should not allow modification of internal tools', () => {
      const tools = server.getTools();
      const originalLength = tools.length;

      tools.push({ name: 'fake', description: 'fake', inputSchema: { type: 'object', properties: {} } });

      expect(server.getTools().length).toBe(originalLength);
    });
  });
});
