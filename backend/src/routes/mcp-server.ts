/**
 * MCP Server Routes (Phase 55)
 *
 * Exposes ZenAI as a Model Context Protocol server.
 * External AI clients can connect via JSON-RPC 2.0 over HTTP.
 *
 * Endpoints:
 * - POST /api/mcp-server             — JSON-RPC handler
 * - GET  /api/mcp-server/.well-known/mcp.json — Discovery manifest
 * - GET  /api/mcp-server/tools       — List exposed tools (for frontend)
 */

import { Router, Request, Response } from 'express';
import { AIContext, isValidContext } from '../utils/database-context';
import { apiKeyAuth } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { handleMCPRequest, getExposedTools } from '../services/mcp-server';

export const mcpServerRouter = Router();

// ─── JSON-RPC Handler ─────────────────────────────────

mcpServerRouter.post(
  '/mcp-server',
  apiKeyAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { jsonrpc, id, method, params } = req.body;

    if (jsonrpc !== '2.0' || !method) {
      res.status(400).json({
        jsonrpc: '2.0',
        id: id || null,
        error: { code: -32600, message: 'Invalid JSON-RPC request' },
      });
      return;
    }

    // Context from query param or default to 'personal'
    const context = (req.query.context as string) || 'personal';
    if (!isValidContext(context)) {
      res.status(400).json({
        jsonrpc: '2.0',
        id,
        error: { code: -32602, message: 'Invalid context parameter' },
      });
      return;
    }

    const response = await handleMCPRequest(
      { jsonrpc: '2.0', id, method, params },
      context as AIContext
    );

    res.json(response);
  })
);

// ─── Discovery Manifest ───────────────────────────────

mcpServerRouter.get('/mcp-server/.well-known/mcp.json', (_req: Request, res: Response) => {
  const baseUrl = process.env.API_URL || `http://localhost:${process.env.PORT || 3001}`;

  res.json({
    schema_version: '2024-11-05',
    server: {
      name: 'zenai',
      version: '1.0.0',
      description: 'ZenAI AI OS — Knowledge, Memory, Tools, Calendar, Email',
    },
    capabilities: {
      tools: { listChanged: false },
    },
    endpoints: {
      rpc: `${baseUrl}/api/mcp-server`,
    },
    authentication: {
      type: 'bearer',
      description: 'Use a ZenAI API key as Bearer token',
    },
  });
});

// ─── Tool List (for frontend) ─────────────────────────

mcpServerRouter.get(
  '/mcp-server/tools',
  apiKeyAuth,
  (_req: Request, res: Response) => {
    res.json({ success: true, data: { tools: getExposedTools() } });
  }
);
