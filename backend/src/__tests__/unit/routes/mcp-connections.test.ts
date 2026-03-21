/**
 * MCP Connections Route Tests
 *
 * Tests the REST API for MCP server connections management.
 */

import express from 'express';
import request from 'supertest';
import { errorHandler } from '../../../middleware/errorHandler';

jest.mock('../../../middleware/auth', () => ({
  apiKeyAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireScope: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

jest.mock('../../../utils/user-context', () => ({
  getUserId: () => '00000000-0000-0000-0000-000000000001',
}));

jest.mock('../../../middleware/validate-params', () => ({
  requireUUID: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const mockList = jest.fn();
const mockGetById = jest.fn();
const mockCreate = jest.fn();
const mockUpdate = jest.fn();
const mockMcpDelete = jest.fn();
const mockGetTools = jest.fn();
const mockUpdateHealthStatus = jest.fn();

jest.mock('../../../services/mcp/mcp-registry', () => ({
  mcpServerRegistry: {
    list: (...args: unknown[]) => mockList(...args),
    getById: (...args: unknown[]) => mockGetById(...args),
    create: (...args: unknown[]) => mockCreate(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
    delete: (...args: unknown[]) => mockMcpDelete(...args),
    getTools: (...args: unknown[]) => mockGetTools(...args),
    updateHealthStatus: (...args: unknown[]) => mockUpdateHealthStatus(...args),
  },
}));

jest.mock('../../../services/mcp/mcp-client', () => ({
  mcpClientManager: {
    connect: jest.fn(),
    disconnect: jest.fn().mockResolvedValue(undefined),
    healthCheck: jest.fn(),
    getClient: jest.fn().mockReturnValue(null),
    getStatus: jest.fn().mockReturnValue(null),
  },
  MCPServerConfig: {},
}));

jest.mock('../../../services/mcp/mcp-tool-bridge', () => ({
  createToolBridge: () => ({
    executeTool: jest.fn(),
    listAllTools: jest.fn().mockResolvedValue([]),
    removeBridgedTools: jest.fn(),
  }),
  MCPToolBridge: jest.fn(),
}));

jest.mock('../../../services/mcp/mcp-transport', () => ({
  validateTransportConfig: jest.fn().mockReturnValue(true),
}));

jest.mock('../../../services/mcp/mcp-discovery', () => ({
  mcpDiscoveryService: {
    search: jest.fn().mockResolvedValue([]),
    getTemplate: jest.fn(),
    getByName: jest.fn().mockReturnValue(null),
  },
}));

jest.mock('../../../services/mcp/mcp-auto-config', () => ({
  mcpAutoConfigService: {
    getSetupTemplate: jest.fn(),
    listTemplates: jest.fn().mockReturnValue([]),
  },
}));

jest.mock('../../../utils/validation', () => ({
  validateContextParam: (ctx: string) => ctx,
}));

jest.mock('../../../utils/database-context', () => ({
  isValidContext: (ctx: string) => ['personal', 'work', 'learning', 'creative'].includes(ctx),
}));

jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

describe('MCP Connections Routes', () => {
  let app: express.Express;

  beforeAll(async () => {
    const mod = await import('../../../routes/mcp-connections');
    const router = mod.mcpConnectionsV2Router;
    app = express();
    app.use(express.json());
    app.use('/api', router);
    app.use(errorHandler);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /:context/mcp/servers', () => {
    it('should return list of MCP servers', async () => {
      mockList.mockResolvedValue([{ id: '1', name: 'GitHub MCP' }]);
      const res = await request(app).get('/api/personal/mcp/servers');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
    });

    it('should reject invalid context', async () => {
      const res = await request(app).get('/api/invalid/mcp/servers');
      expect(res.status).toBe(400);
    });
  });

  describe('PUT /:context/mcp/servers/:id', () => {
    it('should update a server', async () => {
      mockUpdate.mockResolvedValue({ id: '1', name: 'Updated' });
      const res = await request(app).put('/api/personal/mcp/servers/1').send({ name: 'Updated' });
      expect(res.status).toBe(200);
    });

    it('should return 404 for non-existent server', async () => {
      mockUpdate.mockResolvedValue(null);
      const res = await request(app).put('/api/personal/mcp/servers/nonexistent').send({ name: 'X' });
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /:context/mcp/servers/:id', () => {
    it('should delete a server connection', async () => {
      mockMcpDelete.mockResolvedValue(true);
      const res = await request(app).delete('/api/personal/mcp/servers/1');
      expect(res.status).toBe(200);
    });

    it('should return 404 for non-existent server', async () => {
      mockMcpDelete.mockResolvedValue(false);
      const res = await request(app).delete('/api/personal/mcp/servers/nonexistent');
      expect(res.status).toBe(404);
    });
  });

  describe('GET /:context/mcp/servers/:id/tools', () => {
    it('should return cached tools when no live client', async () => {
      mockGetTools.mockResolvedValue([{ name: 'search', description: 'Search repos' }]);
      const res = await request(app).get('/api/personal/mcp/servers/1/tools');
      expect(res.status).toBe(200);
      expect(res.body.data.source).toBe('cached');
    });
  });
});
