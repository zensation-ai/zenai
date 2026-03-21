/**
 * MCP Internal Routes Tests
 *
 * Tests MCP status, tool listing, tool calling, resource listing, resource reading.
 */

import express from 'express';
import request from 'supertest';
import { mcpRouter } from '../../../routes/mcp';
import { errorHandler } from '../../../middleware/errorHandler';

jest.mock('../../../middleware/auth', () => ({
  apiKeyAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireScope: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../../utils/database-context', () => ({
  isValidContext: (ctx: string) => ['personal', 'work', 'learning', 'creative'].includes(ctx),
}));

jest.mock('../../../utils/validation', () => ({
  validateContextParam: (ctx: string) => ctx,
}));

jest.mock('../../../middleware/validate-params', () => ({
  requireUUID: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const mockHandleRequest = jest.fn();

jest.mock('../../../mcp', () => ({
  createMCPServer: () => ({
    handleRequest: (...args: unknown[]) => mockHandleRequest(...args),
  }),
}));

// Mock mcp-connections (needed by the same file for mcpConnectionsRouter)
jest.mock('../../../services/mcp-connections', () => ({
  mcpConnectionManager: {
    listConnections: jest.fn().mockResolvedValue([]),
    getConnection: jest.fn().mockResolvedValue(null),
    createConnection: jest.fn().mockResolvedValue({}),
    updateConnection: jest.fn().mockResolvedValue(null),
    deleteConnection: jest.fn().mockResolvedValue(false),
    checkConnection: jest.fn().mockResolvedValue(null),
    getAllTools: jest.fn().mockResolvedValue([]),
    getAllResources: jest.fn().mockResolvedValue([]),
    callTool: jest.fn().mockResolvedValue({}),
    readResource: jest.fn().mockResolvedValue({}),
  },
}));

describe('MCP Internal Routes', () => {
  let app: express.Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/mcp', mcpRouter);
    app.use(errorHandler);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('GET /status — returns MCP server status', async () => {
    const res = await request(app).get('/api/mcp/status');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe('zenai-brain');
    expect(res.body.data.status).toBe('running');
    expect(res.body.data.protocol).toBe('MCP 2026');
  });

  it('GET /tools — lists internal MCP tools', async () => {
    mockHandleRequest.mockResolvedValue({ tools: [{ name: 'search_ideas' }] });

    const res = await request(app).get('/api/mcp/tools');

    expect(res.status).toBe(200);
    expect(res.body.data.tools).toHaveLength(1);
    expect(mockHandleRequest).toHaveBeenCalledWith({ method: 'tools/list' });
  });

  it('POST /tools/call — calls internal tool', async () => {
    mockHandleRequest.mockResolvedValue({ isError: false, content: [{ text: 'result' }] });

    const res = await request(app)
      .post('/api/mcp/tools/call')
      .send({ name: 'search_ideas', arguments: { query: 'test' } });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('POST /tools/call — rejects missing tool name', async () => {
    const res = await request(app)
      .post('/api/mcp/tools/call')
      .send({ arguments: {} });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('GET /resources — lists internal MCP resources', async () => {
    mockHandleRequest.mockResolvedValue({ resources: [{ uri: 'zenai://memory/working' }] });

    const res = await request(app).get('/api/mcp/resources');

    expect(res.status).toBe(200);
    expect(res.body.data.resources).toHaveLength(1);
  });

  it('POST /resources/read — reads resource by URI', async () => {
    mockHandleRequest.mockResolvedValue({ contents: [{ text: 'data' }] });

    const res = await request(app)
      .post('/api/mcp/resources/read')
      .send({ uri: 'zenai://memory/working' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('POST /resources/read — rejects missing URI', async () => {
    const res = await request(app)
      .post('/api/mcp/resources/read')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});
