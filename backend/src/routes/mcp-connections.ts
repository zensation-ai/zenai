/**
 * MCP Connections API - Phase 55
 *
 * CRUD API for MCP server connections management.
 * Manages external MCP server configurations, connections, and tool discovery.
 *
 * Endpoints:
 *   GET    /api/:context/mcp/servers              - List configured MCP servers
 *   POST   /api/:context/mcp/servers              - Add MCP server
 *   PUT    /api/:context/mcp/servers/:id           - Update server config
 *   DELETE /api/:context/mcp/servers/:id           - Remove server
 *   POST   /api/:context/mcp/servers/:id/connect   - Connect to server
 *   POST   /api/:context/mcp/servers/:id/disconnect - Disconnect from server
 *   GET    /api/:context/mcp/servers/:id/tools     - List server tools
 *   GET    /api/:context/mcp/servers/:id/resources  - List server resources
 *   GET    /api/:context/mcp/servers/:id/health    - Health check
 *   POST   /api/:context/mcp/tools/:toolId/execute  - Execute external tool
 */

import { Router, Request, Response } from 'express';
import { apiKeyAuth, requireScope } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { isValidContext } from '../utils/database-context';
import { validateContextParam } from '../utils/validation';
import { requireUUID } from '../middleware/validate-params';
import { mcpServerRegistry } from '../services/mcp/mcp-registry';
import { mcpClientManager, MCPServerConfig } from '../services/mcp/mcp-client';
import { createToolBridge } from '../services/mcp/mcp-tool-bridge';
import { validateTransportConfig, MCPTransportType } from '../services/mcp/mcp-transport';
import { mcpDiscoveryService, MCPServerCategory } from '../services/mcp/mcp-discovery';
import { mcpAutoConfigService } from '../services/mcp/mcp-auto-config';
import { logger } from '../utils/logger';
import { getUserId } from '../utils/user-context';

export const mcpConnectionsV2Router = Router();
mcpConnectionsV2Router.use(apiKeyAuth);

// Tool bridge singleton
const toolBridge = createToolBridge(mcpClientManager);

// Context validation middleware
function validateContext(req: Request, res: Response, next: () => void) {
  const context = req.params.context;
  if (!isValidContext(context)) {
    return res.status(400).json({ success: false, error: `Invalid context: ${context}` });
  }
  next();
}

// ===========================================
// Server CRUD
// ===========================================

/**
 * GET /api/:context/mcp/servers - List all MCP servers
 */
mcpConnectionsV2Router.get(
  '/:context/mcp/servers',
  validateContext,
  asyncHandler(async (req: Request, res: Response) => {
    const context = validateContextParam(req.params.context);
    getUserId(req); // auth check
    const enabledOnly = req.query.enabled === 'true';
    const servers = await mcpServerRegistry.list(context, enabledOnly);

    // Enrich with connection status
    const enriched = servers.map(server => {
      const status = mcpClientManager.getStatus(server.id);
      return {
        ...server,
        connected: status?.connected || false,
        liveHealthy: status?.healthy || false,
      };
    });

    res.json({ success: true, data: enriched });
  })
);

/**
 * POST /api/:context/mcp/servers - Add a new MCP server
 */
mcpConnectionsV2Router.post(
  '/:context/mcp/servers',
  validateContext,
  requireScope('write'),
  asyncHandler(async (req: Request, res: Response) => {
    const context = validateContextParam(req.params.context);
    getUserId(req); // auth check
    const { name, transport, url, command, args, envVars, authType, authConfig, enabled } = req.body;

    if (!name || !transport) {
      return res.status(400).json({ success: false, error: 'Name and transport are required' });
    }

    // Validate transport config
    const validationError = validateTransportConfig({
      type: transport as MCPTransportType,
      url,
      command,
      args,
    });
    if (validationError) {
      return res.status(400).json({ success: false, error: validationError });
    }

    const server = await mcpServerRegistry.create(context, {
      name,
      transport: transport as MCPTransportType,
      url,
      command,
      args,
      envVars,
      authType,
      authConfig,
      enabled,
    });

    res.status(201).json({ success: true, data: server });
  })
);

/**
 * PUT /api/:context/mcp/servers/:id - Update server configuration
 */
mcpConnectionsV2Router.put(
  '/:context/mcp/servers/:id',
  validateContext,
  requireScope('write'),
  requireUUID('id'),
  asyncHandler(async (req: Request, res: Response) => {
    const context = validateContextParam(req.params.context);
    getUserId(req); // auth check
    const server = await mcpServerRegistry.update(context, req.params.id, req.body);

    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    res.json({ success: true, data: server });
  })
);

/**
 * DELETE /api/:context/mcp/servers/:id - Remove server
 */
mcpConnectionsV2Router.delete(
  '/:context/mcp/servers/:id',
  validateContext,
  requireScope('write'),
  requireUUID('id'),
  asyncHandler(async (req: Request, res: Response) => {
    const context = validateContextParam(req.params.context);
    getUserId(req); // auth check

    // Disconnect first
    await mcpClientManager.disconnect(req.params.id);
    toolBridge.removeBridgedTools(req.params.id);

    const deleted = await mcpServerRegistry.delete(context, req.params.id);
    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    res.json({ success: true });
  })
);

// ===========================================
// Connection Management
// ===========================================

/**
 * POST /api/:context/mcp/servers/:id/connect - Connect to server
 */
mcpConnectionsV2Router.post(
  '/:context/mcp/servers/:id/connect',
  validateContext,
  requireScope('write'),
  requireUUID('id'),
  asyncHandler(async (req: Request, res: Response) => {
    const context = validateContextParam(req.params.context);
    getUserId(req); // auth check
    const server = await mcpServerRegistry.getById(context, req.params.id);

    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const config: MCPServerConfig = {
      id: server.id,
      name: server.name,
      transport: {
        type: server.transport,
        url: server.url || undefined,
        command: server.command || undefined,
        args: server.args,
        env: server.envVars,
        auth: server.authType ? {
          type: server.authType as 'bearer' | 'api-key',
          token: server.authConfig.token,
        } : undefined,
      },
      enabled: server.enabled,
    };

    const status = await mcpClientManager.connect(config);

    // Update health status in DB
    await mcpServerRegistry.updateHealthStatus(
      context,
      server.id,
      status.healthy ? 'healthy' : 'unhealthy',
      status.toolCount,
      status.resourceCount,
      status.error
    );

    // Sync tools to bridge if connected
    if (status.healthy) {
      try {
        const bridgedTools = await toolBridge.syncServerTools(server.id, server.name);

        // Persist tools to DB
        const tools = await mcpClientManager.listTools(server.id);
        await mcpServerRegistry.syncTools(context, server.id, tools);

        logger.info('MCP server connected and tools synced', {
          serverId: server.id,
          toolCount: bridgedTools.length,
        });
      } catch (err) {
        logger.debug('Failed to sync tools after connect', {
          serverId: server.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    res.json({ success: true, data: status });
  })
);

/**
 * POST /api/:context/mcp/servers/:id/disconnect - Disconnect from server
 */
mcpConnectionsV2Router.post(
  '/:context/mcp/servers/:id/disconnect',
  validateContext,
  requireScope('write'),
  requireUUID('id'),
  asyncHandler(async (req: Request, res: Response) => {
    const context = validateContextParam(req.params.context);
    getUserId(req); // auth check

    await mcpClientManager.disconnect(req.params.id);
    toolBridge.removeBridgedTools(req.params.id);

    await mcpServerRegistry.updateHealthStatus(context, req.params.id, 'unknown', 0, 0, null);

    res.json({ success: true });
  })
);

// ===========================================
// Tools & Resources
// ===========================================

/**
 * GET /api/:context/mcp/servers/:id/tools - List server tools
 */
mcpConnectionsV2Router.get(
  '/:context/mcp/servers/:id/tools',
  validateContext,
  requireUUID('id'),
  asyncHandler(async (req: Request, res: Response) => {
    const context = validateContextParam(req.params.context);
    getUserId(req); // auth check

    // Try live tools from connected client first
    const client = mcpClientManager.getClient(req.params.id);
    if (client && client.isConnected) {
      try {
        const tools = await client.listTools();
        return res.json({ success: true, data: { tools, source: 'live' } });
      } catch {
        // Fall through to DB
      }
    }

    // Fallback: DB records
    const tools = await mcpServerRegistry.getTools(context, req.params.id);
    res.json({ success: true, data: { tools, source: 'cached' } });
  })
);

/**
 * GET /api/:context/mcp/servers/:id/resources - List server resources
 */
mcpConnectionsV2Router.get(
  '/:context/mcp/servers/:id/resources',
  validateContext,
  requireUUID('id'),
  asyncHandler(async (req: Request, res: Response) => {
    getUserId(req); // auth check
    const client = mcpClientManager.getClient(req.params.id);
    if (!client || !client.isConnected) {
      return res.json({ success: true, data: { resources: [], source: 'offline' } });
    }

    try {
      const resources = await client.listResources();
      res.json({ success: true, data: { resources, source: 'live' } });
    } catch {
      res.json({ success: true, data: { resources: [], source: 'error' } });
    }
  })
);

/**
 * GET /api/:context/mcp/servers/:id/health - Health check
 */
mcpConnectionsV2Router.get(
  '/:context/mcp/servers/:id/health',
  validateContext,
  requireUUID('id'),
  asyncHandler(async (req: Request, res: Response) => {
    const context = validateContextParam(req.params.context);
    getUserId(req); // auth check
    const healthy = await mcpClientManager.healthCheck(req.params.id);
    const status = mcpClientManager.getStatus(req.params.id);

    if (status) {
      await mcpServerRegistry.updateHealthStatus(
        context,
        req.params.id,
        healthy ? 'healthy' : 'unhealthy',
        status.toolCount,
        status.resourceCount,
        status.error
      );
    }

    res.json({
      success: true,
      data: {
        healthy,
        status: status || { connected: false, healthy: false },
      },
    });
  })
);

// ===========================================
// Discovery & Marketplace (Phase 71)
// ===========================================

/**
 * GET /api/:context/mcp/discover - Browse/search available MCP servers
 */
mcpConnectionsV2Router.get(
  '/:context/mcp/discover',
  validateContext,
  asyncHandler(async (req: Request, res: Response) => {
    getUserId(req); // auth check
    const query = req.query.q as string | undefined;
    const category = req.query.category as MCPServerCategory | undefined;

    const result = mcpDiscoveryService.discoverServers(query, category);

    res.json({ success: true, data: result });
  })
);

/**
 * GET /api/:context/mcp/discover/:name/template - Get setup template for a server
 */
mcpConnectionsV2Router.get(
  '/:context/mcp/discover/:name/template',
  validateContext,
  asyncHandler(async (req: Request, res: Response) => {
    getUserId(req); // auth check
    const { name } = req.params;

    const template = mcpAutoConfigService.getSetupTemplate(name);
    if (!template) {
      return res.status(404).json({ success: false, error: `No template found for server: ${name}` });
    }

    const catalogEntry = mcpDiscoveryService.getByName(name);

    res.json({
      success: true,
      data: {
        template,
        server: catalogEntry,
      },
    });
  })
);

// ===========================================
// Tool Execution
// ===========================================

/**
 * POST /api/:context/mcp/tools/:toolId/execute - Execute external tool
 */
mcpConnectionsV2Router.post(
  '/:context/mcp/tools/:toolId/execute',
  validateContext,
  requireScope('write'),
  asyncHandler(async (req: Request, res: Response) => {
    const context = validateContextParam(req.params.context);
    getUserId(req); // auth check
    const { toolId } = req.params;
    const { arguments: args } = req.body;

    if (!toolBridge.hasTool(toolId)) {
      return res.status(404).json({ success: false, error: `Tool not found: ${toolId}` });
    }

    const result = await toolBridge.executeTool(toolId, args || {}, context);

    res.json({
      success: result.success,
      data: {
        content: result.content,
        latencyMs: result.latencyMs,
        isError: result.isError,
      },
    });
  })
);
