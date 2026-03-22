/**
 * Backend Bridge Tests (Phase 132)
 *
 * TDD tests for the bridge between CLI agent and ZenAI backend.
 * Covers tool forwarding, health checks, core memory fetching,
 * and error handling for network/auth failures.
 */

// ─── Mocks ──────────────────────────────────────────────────────────────────

jest.mock('../logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

// ─── Imports ────────────────────────────────────────────────────────────────

import type {
  AgentConfig,
  BackendToolCall,
  BackendToolResult,
  ToolDefinition,
} from '../types';

import {
  BackendBridge,
  getBackendTools,
  executeBackendTool,
} from '../backend-bridge';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeConfig(overrides: Partial<AgentConfig> = {}): AgentConfig {
  return {
    model: 'claude-sonnet-4-20250514',
    maxTokens: 4096,
    maxIterations: 10,
    apiKey: 'sk-ant-test',
    backendUrl: 'https://api.zenai.test',
    backendApiKey: 'test-backend-key',
    ...overrides,
  };
}

function jsonResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: jest.fn().mockResolvedValue(data),
    text: jest.fn().mockResolvedValue(JSON.stringify(data)),
    headers: new Headers(),
  } as unknown as Response;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('BackendBridge', () => {
  let bridge: BackendBridge;

  beforeEach(() => {
    jest.clearAllMocks();
    bridge = new BackendBridge(makeConfig());
  });

  describe('constructor', () => {
    it('should store config values', () => {
      const config = makeConfig({ backendUrl: 'https://custom.api' });
      const b = new BackendBridge(config);
      // Internal state verification via isAvailable call
      expect(b).toBeInstanceOf(BackendBridge);
    });

    it('should handle missing backendUrl gracefully', () => {
      const config = makeConfig({ backendUrl: undefined });
      const b = new BackendBridge(config);
      expect(b).toBeInstanceOf(BackendBridge);
    });

    it('should handle missing backendApiKey gracefully', () => {
      const config = makeConfig({ backendApiKey: undefined });
      const b = new BackendBridge(config);
      expect(b).toBeInstanceOf(BackendBridge);
    });
  });

  describe('isAvailable', () => {
    it('should return true when backend health endpoint responds 200', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ status: 'ok', services: { database: 'connected' } }),
      );

      const result = await bridge.isAvailable();
      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/health'),
        expect.anything(),
      );
    });

    it('should return false when backend is unreachable', async () => {
      mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      const result = await bridge.isAvailable();
      expect(result).toBe(false);
    });

    it('should return false when backend returns 500', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ error: 'Internal' }, 500));

      const result = await bridge.isAvailable();
      expect(result).toBe(false);
    });

    it('should return false when backendUrl is not configured', async () => {
      const b = new BackendBridge(makeConfig({ backendUrl: undefined }));
      const result = await b.isAvailable();
      expect(result).toBe(false);
    });
  });

  describe('callTool', () => {
    it('should make POST request with correct headers', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ success: true, data: { result: 'stored' } }),
      );

      await bridge.callTool('remember', { content: 'test fact' }, 'personal');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        }),
      );
    });

    it('should include auth headers', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ success: true, data: {} }),
      );

      await bridge.callTool('recall', { query: 'test' }, 'personal');

      const callArgs = mockFetch.mock.calls[0][1];
      const headers = callArgs.headers;
      // Should include API key or Authorization header
      expect(
        headers['x-api-key'] || headers['Authorization'] || headers['authorization'],
      ).toBeTruthy();
    });

    it('should handle network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await bridge.callTool('remember', { content: 'test' }, 'personal');
      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
    });

    it('should handle 401 unauthorized', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ error: 'Unauthorized' }, 401),
      );

      const result = await bridge.callTool('recall', { query: 'test' }, 'personal');
      expect(result.success).toBe(false);
      expect(result.error?.toLowerCase()).toMatch(/auth|unauthorized|401/);
    });

    it('should handle 500 server error', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ error: 'Internal Server Error' }, 500),
      );

      const result = await bridge.callTool('web_search', { query: 'test' }, 'personal');
      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
    });

    it('should handle timeout', async () => {
      mockFetch.mockImplementationOnce(
        () => new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 50)),
      );

      const result = await bridge.callTool('recall', { query: 'slow' }, 'personal');
      expect(result.success).toBe(false);
    });
  });

  describe('callTool for specific tools', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue(
        jsonResponse({ success: true, data: { result: 'ok' } }),
      );
    });

    it('should call remember tool', async () => {
      const result = await bridge.callTool(
        'remember',
        { content: 'User prefers dark mode', importance: 0.8 },
        'personal',
      );
      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('personal'),
        expect.objectContaining({
          body: expect.stringContaining('dark mode'),
        }),
      );
    });

    it('should call recall tool', async () => {
      const result = await bridge.callTool(
        'recall',
        { query: 'user preferences' },
        'personal',
      );
      expect(result.success).toBe(true);
    });

    it('should call web_search tool', async () => {
      const result = await bridge.callTool(
        'web_search',
        { query: 'TypeScript best practices' },
        'work',
      );
      expect(result.success).toBe(true);
    });

    it('should call search_ideas tool', async () => {
      const result = await bridge.callTool(
        'search_ideas',
        { query: 'project architecture' },
        'work',
      );
      expect(result.success).toBe(true);
    });

    it('should pass context in URL or body', async () => {
      await bridge.callTool('recall', { query: 'test' }, 'learning');

      const url = mockFetch.mock.calls[0][0] as string;
      const body = mockFetch.mock.calls[0][1]?.body as string;

      // Context should appear in either URL path or request body
      const hasContextInUrl = url.includes('learning');
      const hasContextInBody = body && body.includes('learning');
      expect(hasContextInUrl || hasContextInBody).toBe(true);
    });
  });

  describe('getCoreMemory', () => {
    it('should fetch core memory blocks', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          success: true,
          data: {
            blocks: [
              { key: 'user_preferences', value: 'Prefers TypeScript' },
              { key: 'project_context', value: 'ZenAI CLI Agent' },
            ],
          },
        }),
      );

      const blocks = await bridge.getCoreMemory();
      expect(Array.isArray(blocks)).toBe(true);
      expect(blocks.length).toBeGreaterThan(0);
      expect(blocks[0]).toContain('TypeScript');
    });

    it('should return empty array on error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const blocks = await bridge.getCoreMemory();
      expect(blocks).toEqual([]);
    });

    it('should return empty array when backend is not configured', async () => {
      const b = new BackendBridge(makeConfig({ backendUrl: undefined }));
      const blocks = await b.getCoreMemory();
      expect(blocks).toEqual([]);
    });
  });
});

describe('getBackendTools', () => {
  it('should return an array of ToolDefinition objects', () => {
    const tools = getBackendTools();
    expect(Array.isArray(tools)).toBe(true);
    expect(tools.length).toBeGreaterThan(0);
  });

  it('should include memory tools (remember, recall)', () => {
    const tools = getBackendTools();
    const names = tools.map((t) => t.name);
    expect(names).toContain('remember');
    expect(names).toContain('recall');
  });

  it('should include web_search tool', () => {
    const tools = getBackendTools();
    expect(tools.find((t) => t.name === 'web_search')).toBeDefined();
  });

  it('should include search_ideas tool', () => {
    const tools = getBackendTools();
    expect(tools.find((t) => t.name === 'search_ideas')).toBeDefined();
  });

  it('should have valid schemas for all tools', () => {
    const tools = getBackendTools();
    for (const tool of tools) {
      expect(tool.name).toBeTruthy();
      expect(tool.description).toBeTruthy();
      expect(tool.input_schema.type).toBe('object');
      expect(typeof tool.input_schema.properties).toBe('object');
    }
  });

  it('should have required fields defined for tools that need them', () => {
    const tools = getBackendTools();
    const remember = tools.find((t) => t.name === 'remember');
    expect(remember?.input_schema.required).toBeDefined();
    expect(remember?.input_schema.required?.length).toBeGreaterThan(0);
  });
});

describe('executeBackendTool', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockResolvedValue(
      jsonResponse({ success: true, data: { result: 'executed' } }),
    );
  });

  it('should dispatch remember tool via backend bridge', async () => {
    const config = makeConfig();
    const result = await executeBackendTool(
      'remember',
      { content: 'test fact' },
      config,
      'personal',
    );
    expect(result).toBeTruthy();
    expect(mockFetch).toHaveBeenCalled();
  });

  it('should dispatch recall tool via backend bridge', async () => {
    const config = makeConfig();
    const result = await executeBackendTool(
      'recall',
      { query: 'preferences' },
      config,
      'personal',
    );
    expect(result).toBeTruthy();
  });

  it('should return error string for unknown backend tool', async () => {
    const config = makeConfig();
    const result = await executeBackendTool(
      'nonexistent_tool',
      {},
      config,
      'personal',
    );
    expect(result.toLowerCase()).toMatch(/unknown|not found|unsupported/);
  });

  it('should return error when backend is not configured', async () => {
    const config = makeConfig({ backendUrl: undefined, backendApiKey: undefined });
    const result = await executeBackendTool(
      'remember',
      { content: 'test' },
      config,
      'personal',
    );
    expect(result.toLowerCase()).toMatch(/not configured|unavailable|not available/);
  });
});
