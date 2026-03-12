/**
 * MCP HTTP Gateway Routes - Phase 44
 *
 * Exposes the internal MCP server via REST API endpoints.
 * Also manages external MCP server connections.
 *
 * Endpoints:
 *
 * Internal MCP Server (proxied):
 *   GET  /api/mcp/tools             - List all internal MCP tools
 *   POST /api/mcp/tools/call        - Call an internal MCP tool
 *   GET  /api/mcp/resources         - List all internal MCP resources
 *   POST /api/mcp/resources/read    - Read an internal MCP resource
 *   GET  /api/mcp/status            - MCP server status
 *
 * External MCP Connections (context-aware):
 *   GET    /api/:context/mcp/connections                    - List connections
 *   GET    /api/:context/mcp/connections/:id                - Get connection
 *   POST   /api/:context/mcp/connections                    - Create connection
 *   PUT    /api/:context/mcp/connections/:id                - Update connection
 *   DELETE /api/:context/mcp/connections/:id                - Delete connection
 *   POST   /api/:context/mcp/connections/:id/check          - Health check
 *   GET    /api/:context/mcp/connections/:id/tools           - List tools from connection
 *   POST   /api/:context/mcp/connections/:id/tools/call      - Call tool on connection
 *   GET    /api/:context/mcp/connections/:id/resources        - List resources from connection
 *   POST   /api/:context/mcp/connections/:id/resources/read   - Read resource from connection
 *
 * Unified (aggregated across all connections):
 *   GET  /api/:context/mcp/tools       - All tools from all connected servers
 *   GET  /api/:context/mcp/resources   - All resources from all connected servers
 */

import { Router, Request, Response } from 'express';
import { createMCPServer } from '../mcp';
import { mcpConnectionManager } from '../services/mcp-connections';
import { isValidContext, AIContext } from '../utils/database-context';
import { apiKeyAuth, requireScope } from '../middleware/auth';
import { validateContextParam } from '../utils/validation';
import { requireUUID } from '../middleware/validate-params';
import { asyncHandler } from '../middleware/errorHandler';

// ===========================================
// Internal MCP Server Routes (global, no context)
// ===========================================

export const mcpRouter = Router();
mcpRouter.use(apiKeyAuth);

// Lazy-init internal MCP server instance
let internalServer: ReturnType<typeof createMCPServer> | null = null;
function getInternalServer() {
  if (!internalServer) {
    internalServer = createMCPServer({ defaultContext: 'personal' });
  }
  return internalServer;
}

/**
 * GET /api/mcp/status - MCP server status
 */
mcpRouter.get('/status', (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      name: 'zenai-brain',
      version: '1.0.0',
      protocol: 'MCP 2026',
      transports: ['http', 'stdio'],
      status: 'running',
    },
  });
});

/**
 * GET /api/mcp/tools - List all internal MCP tools
 */
mcpRouter.get('/tools', asyncHandler(async (_req: Request, res: Response) => {
  const server = getInternalServer();
  const response = await server.handleRequest({ method: 'tools/list' });
  res.json({ success: true, data: { tools: response.tools || [] } });
}));

/**
 * POST /api/mcp/tools/call - Call an internal MCP tool
 */
mcpRouter.post('/tools/call', asyncHandler(async (req: Request, res: Response) => {
  const { name, arguments: args } = req.body;

  if (!name) {
    return res.status(400).json({ success: false, error: 'Tool name is required' });
  }

  const server = getInternalServer();
  const response = await server.handleRequest({
    method: 'tools/call',
    params: { name, arguments: args || {} },
  });

  res.json({
    success: !response.isError,
    data: response,
  });
}));

/**
 * GET /api/mcp/resources - List all internal MCP resources
 */
mcpRouter.get('/resources', asyncHandler(async (_req: Request, res: Response) => {
  const server = getInternalServer();
  const response = await server.handleRequest({ method: 'resources/list' });
  res.json({ success: true, data: { resources: response.resources || [] } });
}));

/**
 * POST /api/mcp/resources/read - Read an internal MCP resource
 */
mcpRouter.post('/resources/read', asyncHandler(async (req: Request, res: Response) => {
  const { uri } = req.body;

  if (!uri) {
    return res.status(400).json({ success: false, error: 'Resource URI is required' });
  }

  const server = getInternalServer();
  const response = await server.handleRequest({
    method: 'resources/read',
    params: { uri },
  });

  res.json({ success: true, data: response });
}));

// ===========================================
// Context-Aware External Connection Routes
// ===========================================

export const mcpConnectionsRouter = Router();
mcpConnectionsRouter.use(apiKeyAuth);

// Validate context middleware
function validateContext(req: Request, res: Response, next: () => void) {
  const context = req.params.context;
  if (!isValidContext(context)) {
    return res.status(400).json({ success: false, error: `Invalid context: ${context}` });
  }
  next();
}

/**
 * GET /api/:context/mcp/connections - List all connections
 */
mcpConnectionsRouter.get('/:context/mcp/connections', validateContext, asyncHandler(async (req: Request, res: Response) => {
  const context = validateContextParam(req.params.context);
  const connections = await mcpConnectionManager.listConnections(context);
  res.json({ success: true, data: connections });
}));

/**
 * GET /api/:context/mcp/connections/:id - Get single connection
 */
mcpConnectionsRouter.get('/:context/mcp/connections/:id', validateContext, requireUUID('id'), asyncHandler(async (req: Request, res: Response) => {
  const context = validateContextParam(req.params.context);
  const conn = await mcpConnectionManager.getConnection(context, req.params.id);
  if (!conn) { return res.status(404).json({ success: false, error: 'Connection not found' }); }
  res.json({ success: true, data: conn });
}));

/**
 * POST /api/:context/mcp/connections - Create connection
 */
mcpConnectionsRouter.post('/:context/mcp/connections', validateContext, requireScope('write'), asyncHandler(async (req: Request, res: Response) => {
  const { name, url, apiKey, headers, enabled } = req.body;

  if (!name || !url) {
    return res.status(400).json({ success: false, error: 'Name and URL are required' });
  }

  const context = validateContextParam(req.params.context);
  const conn = await mcpConnectionManager.createConnection(context, {
    name, url, apiKey, headers, enabled,
  });
  res.status(201).json({ success: true, data: conn });
}));

/**
 * PUT /api/:context/mcp/connections/:id - Update connection
 */
mcpConnectionsRouter.put('/:context/mcp/connections/:id', validateContext, requireScope('write'), requireUUID('id'), asyncHandler(async (req: Request, res: Response) => {
  const context = validateContextParam(req.params.context);
  const conn = await mcpConnectionManager.updateConnection(context, req.params.id, req.body);
  if (!conn) { return res.status(404).json({ success: false, error: 'Connection not found' }); }
  res.json({ success: true, data: conn });
}));

/**
 * DELETE /api/:context/mcp/connections/:id - Delete connection
 */
mcpConnectionsRouter.delete('/:context/mcp/connections/:id', validateContext, requireScope('write'), requireUUID('id'), asyncHandler(async (req: Request, res: Response) => {
  const context = validateContextParam(req.params.context);
  const deleted = await mcpConnectionManager.deleteConnection(context, req.params.id);
  if (!deleted) { return res.status(404).json({ success: false, error: 'Connection not found' }); }
  res.json({ success: true });
}));

/**
 * POST /api/:context/mcp/connections/:id/check - Health check
 */
mcpConnectionsRouter.post('/:context/mcp/connections/:id/check', validateContext, requireScope('write'), requireUUID('id'), asyncHandler(async (req: Request, res: Response) => {
  const context = validateContextParam(req.params.context);
  const conn = await mcpConnectionManager.checkConnection(context, req.params.id);
  if (!conn) { return res.status(404).json({ success: false, error: 'Connection not found' }); }
  res.json({ success: true, data: conn });
}));

/**
 * GET /api/:context/mcp/connections/:id/tools - List tools from specific connection
 */
mcpConnectionsRouter.get('/:context/mcp/connections/:id/tools', validateContext, requireUUID('id'), asyncHandler(async (req: Request, res: Response) => {
  const context = validateContextParam(req.params.context);
  const conn = await mcpConnectionManager.getConnection(context, req.params.id);
  if (!conn) { return res.status(404).json({ success: false, error: 'Connection not found' }); }

  const allTools = await mcpConnectionManager.getAllTools(context);
  const tools = allTools
    .filter(t => t.connectionId === req.params.id)
    .map(t => t.tool);

  res.json({ success: true, data: { tools } });
}));

/**
 * POST /api/:context/mcp/connections/:id/tools/call - Call tool on specific connection
 */
mcpConnectionsRouter.post('/:context/mcp/connections/:id/tools/call', validateContext, requireScope('write'), requireUUID('id'), asyncHandler(async (req: Request, res: Response) => {
  const { name, arguments: args } = req.body;

  if (!name) {
    return res.status(400).json({ success: false, error: 'Tool name is required' });
  }

  const context = validateContextParam(req.params.context);
  const conn = await mcpConnectionManager.getConnection(context, req.params.id);
  if (!conn) {
    return res.status(404).json({ success: false, error: 'Connection not found' });
  }
  const result = await mcpConnectionManager.callTool(req.params.id, name, args || {});
  res.json({ success: !result.isError, data: result });
}));

/**
 * GET /api/:context/mcp/connections/:id/resources - List resources from specific connection
 */
mcpConnectionsRouter.get('/:context/mcp/connections/:id/resources', validateContext, requireUUID('id'), asyncHandler(async (req: Request, res: Response) => {
  const context = validateContextParam(req.params.context);
  const conn = await mcpConnectionManager.getConnection(context, req.params.id);
  if (!conn) { return res.status(404).json({ success: false, error: 'Connection not found' }); }

  const allResources = await mcpConnectionManager.getAllResources(context);
  const resources = allResources.filter(r => r.connectionId === req.params.id);

  res.json({ success: true, data: { resources } });
}));

/**
 * POST /api/:context/mcp/connections/:id/resources/read - Read resource from specific connection
 */
mcpConnectionsRouter.post('/:context/mcp/connections/:id/resources/read', validateContext, requireScope('write'), requireUUID('id'), asyncHandler(async (req: Request, res: Response) => {
  const { uri } = req.body;

  if (!uri) {
    return res.status(400).json({ success: false, error: 'Resource URI is required' });
  }

  const result = await mcpConnectionManager.readResource(req.params.id, uri);
  res.json({ success: true, data: result });
}));

/**
 * GET /api/:context/mcp/tools - Unified tool list across all connections
 */
mcpConnectionsRouter.get('/:context/mcp/tools', validateContext, asyncHandler(async (req: Request, res: Response) => {
  const context = validateContextParam(req.params.context);
  const tools = await mcpConnectionManager.getAllTools(context);
  res.json({ success: true, data: { tools, total: tools.length } });
}));

/**
 * GET /api/:context/mcp/resources - Unified resource list across all connections
 */
mcpConnectionsRouter.get('/:context/mcp/resources', validateContext, asyncHandler(async (req: Request, res: Response) => {
  const context = validateContextParam(req.params.context);
  const resources = await mcpConnectionManager.getAllResources(context);
  res.json({ success: true, data: { resources, total: resources.length } });
}));
