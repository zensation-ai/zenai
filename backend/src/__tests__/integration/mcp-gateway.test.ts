/**
 * MCP HTTP Gateway Integration Tests - Phase 44
 */

import express from 'express';
import request from 'supertest';
import { mcpRouter, mcpConnectionsRouter } from '../../routes/mcp';
import { errorHandler } from '../../middleware/errorHandler';

// Mock auth middleware (MCP routes require apiKeyAuth)
jest.mock('../../middleware/auth', () => ({
  apiKeyAuth: jest.fn((_req: any, _res: any, next: any) => {
    _req.apiKey = { id: 'test-key', name: 'Test', scopes: ['read', 'write', 'admin'], rateLimit: 10000 };
    next();
  }),
  requireScope: jest.fn(() => (_req: any, _res: any, next: any) => next()),
}));

// Mock the MCP server
jest.mock('../../mcp', () => ({
  createMCPServer: jest.fn().mockReturnValue({
    handleRequest: jest.fn().mockImplementation(async (req: { method: string; params?: Record<string, unknown> }) => {
      switch (req.method) {
        case 'tools/list':
          return {
            tools: [
              { name: 'search_ideas', description: 'Search ideas', inputSchema: { type: 'object', properties: {} } },
              { name: 'create_idea', description: 'Create idea', inputSchema: { type: 'object', properties: {} } },
            ],
          };
        case 'tools/call':
          if (req.params?.name === 'search_ideas') {
            return { content: [{ type: 'text', text: 'Found 3 ideas' }] };
          }
          return { content: [{ type: 'text', text: `Unknown tool: ${req.params?.name}` }], isError: true };
        case 'resources/list':
          return {
            resources: [
              { uri: 'zenai://ideas', name: 'Ideas', description: 'All ideas', mimeType: 'application/json' },
            ],
          };
        case 'resources/read':
          return {
            contents: [{ uri: req.params?.uri, mimeType: 'application/json', text: '[]' }],
          };
        default:
          return { content: [{ type: 'text', text: 'Unknown method' }], isError: true };
      }
    }),
  }),
}));

// Mock connection manager
jest.mock('../../services/mcp-connections', () => ({
  mcpConnectionManager: {
    listConnections: jest.fn().mockResolvedValue([
      { id: 'c1', name: 'Test Server', url: 'https://test.com', status: 'connected', toolCount: 3, resourceCount: 1, enabled: true },
    ]),
    getConnection: jest.fn().mockResolvedValue({
      id: 'c1', name: 'Test Server', url: 'https://test.com', status: 'connected', toolCount: 3, resourceCount: 1, enabled: true,
    }),
    createConnection: jest.fn().mockResolvedValue({
      id: 'new-c', name: 'New Server', url: 'https://new.com', status: 'pending', toolCount: 0, resourceCount: 0, enabled: true,
    }),
    updateConnection: jest.fn().mockResolvedValue({
      id: 'c1', name: 'Updated Server', url: 'https://test.com', status: 'connected', toolCount: 3, resourceCount: 1, enabled: true,
    }),
    deleteConnection: jest.fn().mockResolvedValue(true),
    checkConnection: jest.fn().mockResolvedValue({
      id: 'c1', name: 'Test Server', url: 'https://test.com', status: 'connected', toolCount: 3, resourceCount: 1, enabled: true,
    }),
    callTool: jest.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'External result' }],
      isError: false,
    }),
    getAllTools: jest.fn().mockResolvedValue([
      { qualifiedName: 'c1:tool1', originalName: 'tool1', connectionId: 'c1', connectionName: 'Test', tool: { name: 'tool1', description: 'T1' } },
    ]),
    getAllResources: jest.fn().mockResolvedValue([]),
    readResource: jest.fn().mockResolvedValue({ contents: [] }),
  },
}));

// Mock database context
jest.mock('../../utils/database-context', () => ({
  isValidContext: jest.fn().mockReturnValue(true),
  queryContext: jest.fn(),
}));

describe('MCP HTTP Gateway', () => {
  let app: express.Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/mcp', mcpRouter);
    app.use('/api', mcpConnectionsRouter);
    app.use(errorHandler);
  });

  // ===========================================
  // Internal MCP Server
  // ===========================================

  describe('GET /api/mcp/status', () => {
    it('should return server status', async () => {
      const res = await request(app).get('/api/mcp/status');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('zenai-brain');
      expect(res.body.data.protocol).toBe('MCP 2026');
    });
  });

  describe('GET /api/mcp/tools', () => {
    it('should list internal MCP tools', async () => {
      const res = await request(app).get('/api/mcp/tools');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.tools).toHaveLength(2);
      expect(res.body.data.tools[0].name).toBe('search_ideas');
    });
  });

  describe('POST /api/mcp/tools/call', () => {
    it('should call an internal MCP tool', async () => {
      const res = await request(app)
        .post('/api/mcp/tools/call')
        .send({ name: 'search_ideas', arguments: { query: 'test' } });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.content[0].text).toBe('Found 3 ideas');
    });

    it('should return 400 when tool name is missing', async () => {
      const res = await request(app)
        .post('/api/mcp/tools/call')
        .send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Tool name');
    });
  });

  describe('GET /api/mcp/resources', () => {
    it('should list internal MCP resources', async () => {
      const res = await request(app).get('/api/mcp/resources');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.resources).toHaveLength(1);
    });
  });

  describe('POST /api/mcp/resources/read', () => {
    it('should read an internal MCP resource', async () => {
      const res = await request(app)
        .post('/api/mcp/resources/read')
        .send({ uri: 'zenai://ideas' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 400 when URI is missing', async () => {
      const res = await request(app)
        .post('/api/mcp/resources/read')
        .send({});
      expect(res.status).toBe(400);
    });
  });

  // ===========================================
  // External Connections
  // ===========================================

  describe('GET /api/:context/mcp/connections', () => {
    it('should list connections', async () => {
      const res = await request(app).get('/api/personal/mcp/connections');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
    });
  });

  describe('POST /api/:context/mcp/connections', () => {
    it('should create a connection', async () => {
      const res = await request(app)
        .post('/api/work/mcp/connections')
        .send({ name: 'New Server', url: 'https://new.com' });
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('New Server');
    });

    it('should return 400 when name or URL missing', async () => {
      const res = await request(app)
        .post('/api/work/mcp/connections')
        .send({ name: 'No URL' });
      expect(res.status).toBe(400);
    });
  });

  describe('PUT /api/:context/mcp/connections/:id', () => {
    it('should update a connection', async () => {
      const res = await request(app)
        .put('/api/personal/mcp/connections/c1')
        .send({ name: 'Updated Server' });
      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('Updated Server');
    });
  });

  describe('DELETE /api/:context/mcp/connections/:id', () => {
    it('should delete a connection', async () => {
      const res = await request(app)
        .delete('/api/personal/mcp/connections/c1');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('POST /api/:context/mcp/connections/:id/check', () => {
    it('should health check a connection', async () => {
      const res = await request(app)
        .post('/api/personal/mcp/connections/c1/check');
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('connected');
    });
  });

  describe('POST /api/:context/mcp/connections/:id/tools/call', () => {
    it('should call tool on external connection', async () => {
      const res = await request(app)
        .post('/api/personal/mcp/connections/c1/tools/call')
        .send({ name: 'tool1', arguments: {} });
      expect(res.status).toBe(200);
      expect(res.body.data.content[0].text).toBe('External result');
    });
  });

  describe('GET /api/:context/mcp/tools', () => {
    it('should list unified tools across all connections', async () => {
      const res = await request(app).get('/api/personal/mcp/tools');
      expect(res.status).toBe(200);
      expect(res.body.data.tools).toHaveLength(1);
      expect(res.body.data.total).toBe(1);
    });
  });
});
