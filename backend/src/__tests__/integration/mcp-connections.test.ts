/**
 * Integration Tests for MCP Connections V2 API (Phase 55)
 *
 * Tests the REST API for MCP server connection management.
 */

import express from 'express';
import request from 'supertest';
import { errorHandler } from '../../middleware/errorHandler';

// Mock all dependencies
const mockQueryContext = jest.fn();
const mockIsValidContext = jest.fn().mockReturnValue(true);
const mockValidateContextParam = jest.fn().mockReturnValue('personal');

jest.mock('../../utils/database-context', () => ({
  queryContext: (...args: any[]) => mockQueryContext(...args),
  isValidContext: (...args: any[]) => mockIsValidContext(...args),
  AIContext: 'personal',
}));

jest.mock('../../utils/validation', () => ({
  validateContextParam: (...args: any[]) => mockValidateContextParam(...args),
}));

jest.mock('../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('../../middleware/auth', () => ({
  apiKeyAuth: jest.fn((_req: any, _res: any, next: any) => next()),
  requireScope: () => jest.fn((_req: any, _res: any, next: any) => next()),
}));

jest.mock('../../middleware/validate-params', () => ({
  requireUUID: () => jest.fn((_req: any, _res: any, next: any) => next()),
}));

// Mock MCP services — use inline mocks to avoid jest.mock hoisting issues
jest.mock('../../services/mcp/mcp-registry', () => ({
  mcpServerRegistry: {
    list: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    getById: jest.fn(),
    updateHealthStatus: jest.fn(),
    syncTools: jest.fn(),
    getTools: jest.fn(),
  },
}));

jest.mock('../../services/mcp/mcp-client', () => ({
  mcpClientManager: {
    getStatus: jest.fn(),
    connect: jest.fn(),
    disconnect: jest.fn(),
    getClient: jest.fn(),
    listTools: jest.fn(),
    healthCheck: jest.fn(),
  },
  MCPClientManager: jest.fn(),
}));

jest.mock('../../services/mcp/mcp-tool-bridge', () => ({
  MCPToolBridge: jest.fn(),
  createToolBridge: jest.fn().mockReturnValue({
    syncServerTools: jest.fn(),
    removeBridgedTools: jest.fn(),
    hasTool: jest.fn(),
    executeTool: jest.fn(),
  }),
}));

jest.mock('../../services/mcp/mcp-transport', () => ({
  validateTransportConfig: jest.fn().mockReturnValue(null),
  MCPTransportType: {},
}));

// Get references to mocked objects after mock setup
import { mcpServerRegistry } from '../../services/mcp/mcp-registry';
import { mcpClientManager } from '../../services/mcp/mcp-client';
const mockMcpServerRegistry = mcpServerRegistry as jest.Mocked<typeof mcpServerRegistry>;
const mockMcpClientManager = mcpClientManager as jest.Mocked<typeof mcpClientManager>;
import { createToolBridge } from '../../services/mcp/mcp-tool-bridge';
const mockToolBridge = (createToolBridge as jest.Mock)() as any;

import { mcpConnectionsV2Router } from '../../routes/mcp-connections';

describe('MCP Connections V2 API', () => {
  let app: express.Application;

  const mockServerRecord = {
    id: 'server-1',
    name: 'Test Server',
    transport: 'streamable-http' as const,
    url: 'https://example.com/mcp',
    command: null,
    args: [],
    envVars: {},
    authType: null,
    authConfig: {},
    enabled: true,
    healthStatus: 'unknown' as const,
    lastHealthCheck: null,
    toolCount: 0,
    resourceCount: 0,
    errorMessage: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  };

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api', mcpConnectionsV2Router);
    app.use(errorHandler);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockMcpClientManager.getStatus.mockReturnValue(null);
  });

  // ===========================================
  // GET /api/:context/mcp/servers
  // ===========================================

  describe('GET /api/:context/mcp/servers', () => {
    it('should list servers', async () => {
      mockMcpServerRegistry.list.mockResolvedValueOnce([mockServerRecord]);
      mockMcpClientManager.getStatus.mockReturnValue(null);

      const res = await request(app).get('/api/personal/mcp/servers');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].name).toBe('Test Server');
    });

    it('should enrich with connection status', async () => {
      mockMcpServerRegistry.list.mockResolvedValueOnce([mockServerRecord]);
      mockMcpClientManager.getStatus.mockReturnValue({ connected: true, healthy: true });

      const res = await request(app).get('/api/personal/mcp/servers');
      expect(res.body.data[0].connected).toBe(true);
      expect(res.body.data[0].liveHealthy).toBe(true);
    });

    it('should return empty array when no servers', async () => {
      mockMcpServerRegistry.list.mockResolvedValueOnce([]);

      const res = await request(app).get('/api/personal/mcp/servers');
      expect(res.body.data).toEqual([]);
    });
  });

  // ===========================================
  // POST /api/:context/mcp/servers
  // ===========================================

  describe('POST /api/:context/mcp/servers', () => {
    it('should create a new server', async () => {
      mockMcpServerRegistry.create.mockResolvedValueOnce(mockServerRecord);

      const res = await request(app)
        .post('/api/personal/mcp/servers')
        .send({ name: 'Test Server', transport: 'streamable-http', url: 'https://example.com/mcp' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Test Server');
    });

    it('should reject without name', async () => {
      const res = await request(app)
        .post('/api/personal/mcp/servers')
        .send({ transport: 'streamable-http', url: 'https://example.com/mcp' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should reject without transport', async () => {
      const res = await request(app)
        .post('/api/personal/mcp/servers')
        .send({ name: 'Test' });

      expect(res.status).toBe(400);
    });
  });

  // ===========================================
  // PUT /api/:context/mcp/servers/:id
  // ===========================================

  describe('PUT /api/:context/mcp/servers/:id', () => {
    it('should update a server', async () => {
      mockMcpServerRegistry.update.mockResolvedValueOnce({ ...mockServerRecord, name: 'Updated' });

      const res = await request(app)
        .put('/api/personal/mcp/servers/server-1')
        .send({ name: 'Updated' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 404 if not found', async () => {
      mockMcpServerRegistry.update.mockResolvedValueOnce(null);

      const res = await request(app)
        .put('/api/personal/mcp/servers/non-existent')
        .send({ name: 'Updated' });

      expect(res.status).toBe(404);
    });
  });

  // ===========================================
  // DELETE /api/:context/mcp/servers/:id
  // ===========================================

  describe('DELETE /api/:context/mcp/servers/:id', () => {
    it('should delete a server', async () => {
      mockMcpServerRegistry.delete.mockResolvedValueOnce(true);

      const res = await request(app).delete('/api/personal/mcp/servers/server-1');
      expect(res.status).toBe(200);
      expect(mockMcpClientManager.disconnect).toHaveBeenCalledWith('server-1');
      expect(mockToolBridge.removeBridgedTools).toHaveBeenCalledWith('server-1');
    });

    it('should return 404 if not found', async () => {
      mockMcpServerRegistry.delete.mockResolvedValueOnce(false);

      const res = await request(app).delete('/api/personal/mcp/servers/non-existent');
      expect(res.status).toBe(404);
    });
  });

  // ===========================================
  // POST /api/:context/mcp/servers/:id/connect
  // ===========================================

  describe('POST /api/:context/mcp/servers/:id/connect', () => {
    it('should connect to a server', async () => {
      mockMcpServerRegistry.getById.mockResolvedValueOnce(mockServerRecord);
      mockMcpClientManager.connect.mockResolvedValueOnce({
        id: 'server-1', connected: true, healthy: true, toolCount: 3, resourceCount: 1, error: null,
      });
      mockToolBridge.syncServerTools.mockResolvedValueOnce([]);
      mockMcpClientManager.listTools.mockResolvedValueOnce([]);

      const res = await request(app).post('/api/personal/mcp/servers/server-1/connect');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 404 if server not found', async () => {
      mockMcpServerRegistry.getById.mockResolvedValueOnce(null);

      const res = await request(app).post('/api/personal/mcp/servers/non-existent/connect');
      expect(res.status).toBe(404);
    });
  });

  // ===========================================
  // POST /api/:context/mcp/servers/:id/disconnect
  // ===========================================

  describe('POST /api/:context/mcp/servers/:id/disconnect', () => {
    it('should disconnect from a server', async () => {
      const res = await request(app).post('/api/personal/mcp/servers/server-1/disconnect');
      expect(res.status).toBe(200);
      expect(mockMcpClientManager.disconnect).toHaveBeenCalledWith('server-1');
      expect(mockToolBridge.removeBridgedTools).toHaveBeenCalledWith('server-1');
    });
  });

  // ===========================================
  // GET /api/:context/mcp/servers/:id/tools
  // ===========================================

  describe('GET /api/:context/mcp/servers/:id/tools', () => {
    it('should return live tools from connected client', async () => {
      const mockClient = {
        isConnected: true,
        listTools: jest.fn().mockResolvedValueOnce([{ name: 'search', description: 'Search tool' }]),
      };
      mockMcpClientManager.getClient.mockReturnValueOnce(mockClient);

      const res = await request(app).get('/api/personal/mcp/servers/server-1/tools');
      expect(res.status).toBe(200);
      expect(res.body.data.source).toBe('live');
      expect(res.body.data.tools).toHaveLength(1);
    });

    it('should fallback to cached tools if not connected', async () => {
      mockMcpClientManager.getClient.mockReturnValueOnce(null);
      mockMcpServerRegistry.getTools.mockResolvedValueOnce([]);

      const res = await request(app).get('/api/personal/mcp/servers/server-1/tools');
      expect(res.status).toBe(200);
      expect(res.body.data.source).toBe('cached');
    });
  });

  // ===========================================
  // GET /api/:context/mcp/servers/:id/health
  // ===========================================

  describe('GET /api/:context/mcp/servers/:id/health', () => {
    it('should return health status', async () => {
      mockMcpClientManager.healthCheck.mockResolvedValueOnce(true);
      mockMcpClientManager.getStatus.mockReturnValueOnce({
        connected: true, healthy: true, toolCount: 5, resourceCount: 2, error: null,
      });

      const res = await request(app).get('/api/personal/mcp/servers/server-1/health');
      expect(res.status).toBe(200);
      expect(res.body.data.healthy).toBe(true);
    });
  });

  // ===========================================
  // POST /api/:context/mcp/tools/:toolId/execute
  // ===========================================

  describe('POST /api/:context/mcp/tools/:toolId/execute', () => {
    it('should execute a bridged tool', async () => {
      mockToolBridge.hasTool.mockReturnValueOnce(true);
      mockToolBridge.executeTool.mockResolvedValueOnce({
        success: true,
        content: 'tool result',
        latencyMs: 120,
        isError: false,
      });

      const res = await request(app)
        .post('/api/personal/mcp/tools/mcp_abc_search/execute')
        .send({ arguments: { query: 'test' } });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.content).toBe('tool result');
    });

    it('should return 404 for unknown tool', async () => {
      mockToolBridge.hasTool.mockReturnValueOnce(false);

      const res = await request(app)
        .post('/api/personal/mcp/tools/unknown_tool/execute')
        .send({ arguments: {} });

      expect(res.status).toBe(404);
    });
  });
});
