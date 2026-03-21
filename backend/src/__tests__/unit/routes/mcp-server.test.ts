/**
 * MCP Server Route Tests
 *
 * Tests JSON-RPC handler, discovery manifest, and tool listing.
 */

import express from 'express';
import request from 'supertest';
import { mcpServerRouter } from '../../../routes/mcp-server';
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

const mockHandleMCPRequest = jest.fn();
const mockGetExposedTools = jest.fn();

jest.mock('../../../services/mcp-server', () => ({
  handleMCPRequest: (...args: unknown[]) => mockHandleMCPRequest(...args),
  getExposedTools: (...args: unknown[]) => mockGetExposedTools(...args),
}));

describe('MCP Server Routes', () => {
  let app: express.Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api', mcpServerRouter);
    app.use(errorHandler);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('POST /mcp-server — handles valid JSON-RPC request', async () => {
    mockHandleMCPRequest.mockResolvedValue({ jsonrpc: '2.0', id: 1, result: { tools: [] } });

    const res = await request(app)
      .post('/api/mcp-server')
      .send({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} });

    expect(res.status).toBe(200);
    expect(res.body.jsonrpc).toBe('2.0');
    expect(mockHandleMCPRequest).toHaveBeenCalledWith(
      { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} },
      'personal'
    );
  });

  it('POST /mcp-server — uses context query param', async () => {
    mockHandleMCPRequest.mockResolvedValue({ jsonrpc: '2.0', id: 2, result: {} });

    const res = await request(app)
      .post('/api/mcp-server?context=work')
      .send({ jsonrpc: '2.0', id: 2, method: 'tools/list' });

    expect(res.status).toBe(200);
    expect(mockHandleMCPRequest).toHaveBeenCalledWith(
      expect.anything(),
      'work'
    );
  });

  it('POST /mcp-server — rejects invalid JSON-RPC version', async () => {
    const res = await request(app)
      .post('/api/mcp-server')
      .send({ jsonrpc: '1.0', id: 1, method: 'tools/list' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe(-32600);
  });

  it('POST /mcp-server — rejects missing method', async () => {
    const res = await request(app)
      .post('/api/mcp-server')
      .send({ jsonrpc: '2.0', id: 1 });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe(-32600);
  });

  it('POST /mcp-server — rejects invalid context', async () => {
    const res = await request(app)
      .post('/api/mcp-server?context=invalid')
      .send({ jsonrpc: '2.0', id: 1, method: 'tools/list' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe(-32602);
  });

  it('GET /mcp-server/.well-known/mcp.json — returns discovery manifest', async () => {
    const res = await request(app).get('/api/mcp-server/.well-known/mcp.json');

    expect(res.status).toBe(200);
    expect(res.body.schema_version).toBe('2024-11-05');
    expect(res.body.server.name).toBe('zenai');
    expect(res.body.capabilities.tools).toBeDefined();
    expect(res.body.authentication.type).toBe('bearer');
  });

  it('GET /mcp-server/tools — lists exposed tools', async () => {
    mockGetExposedTools.mockReturnValue([
      { name: 'search_ideas', description: 'Search ideas' },
      { name: 'create_idea', description: 'Create idea' },
    ]);

    const res = await request(app).get('/api/mcp-server/tools');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.tools).toHaveLength(2);
  });
});
