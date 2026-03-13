/**
 * MCP Server Service (Phase 55)
 *
 * Exposes ZenAI as a Model Context Protocol server.
 * External AI clients (Claude Desktop, Cursor, etc.) can discover
 * and use ZenAI's tools via JSON-RPC 2.0 over HTTP.
 *
 * Protocol: JSON-RPC 2.0
 * Transport: HTTP (Streamable HTTP, not SSE transport)
 * Auth: Bearer token (reuses existing API key system)
 */

import { logger } from '../utils/logger';
import { toolRegistry, ToolExecutionContext } from './claude/tool-use';
import { AIContext } from '../utils/database-context';

// ===========================================
// Types
// ===========================================

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, { type: string; description: string }>;
    required?: string[];
  };
}

// ===========================================
// Exposed Tools
// ===========================================

/**
 * Tools exposed via MCP server (curated subset of ZenAI's tools).
 * Each tool maps to an existing handler in the toolRegistry.
 */
const EXPOSED_TOOLS: MCPToolDefinition[] = [
  {
    name: 'search_ideas',
    description: 'Search the ZenAI knowledge base for ideas, notes, and thoughts',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        limit: { type: 'number', description: 'Max results (default: 5)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'create_idea',
    description: 'Store a new idea, note, or thought in ZenAI',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Idea title' },
        type: { type: 'string', description: 'Type: idea, task, insight, problem, question' },
        summary: { type: 'string', description: 'Summary text' },
        category: { type: 'string', description: 'Category: business, technical, personal, learning' },
        priority: { type: 'string', description: 'Priority: low, medium, high' },
      },
      required: ['title', 'type', 'summary'],
    },
  },
  {
    name: 'remember',
    description: 'Store information in ZenAI long-term memory',
    inputSchema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'Information to remember' },
        fact_type: { type: 'string', description: 'Type: preference, behavior, knowledge, goal, context' },
      },
      required: ['content'],
    },
  },
  {
    name: 'recall',
    description: 'Search ZenAI memory for stored information',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What to search for in memory' },
        memory_type: { type: 'string', description: 'Filter: all, episodes, facts' },
      },
      required: ['query'],
    },
  },
  {
    name: 'web_search',
    description: 'Search the web via ZenAI (Brave Search)',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        num_results: { type: 'number', description: 'Number of results (default: 5)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'fetch_url',
    description: 'Fetch and extract content from a URL',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to fetch' },
      },
      required: ['url'],
    },
  },
  {
    name: 'search_documents',
    description: 'Search the ZenAI document vault',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        limit: { type: 'number', description: 'Max results' },
      },
      required: ['query'],
    },
  },
  {
    name: 'list_calendar_events',
    description: 'List calendar events in a date range',
    inputSchema: {
      type: 'object',
      properties: {
        start: { type: 'string', description: 'Start date (ISO 8601)' },
        end: { type: 'string', description: 'End date (ISO 8601)' },
      },
      required: ['start', 'end'],
    },
  },
  {
    name: 'ask_inbox',
    description: 'Ask questions about your email inbox',
    inputSchema: {
      type: 'object',
      properties: {
        question: { type: 'string', description: 'Natural language question about emails' },
      },
      required: ['question'],
    },
  },
  {
    name: 'memory_introspect',
    description: 'Inspect ZenAI memory state (facts, episodes, working memory)',
    inputSchema: {
      type: 'object',
      properties: {
        aspect: { type: 'string', description: 'What to inspect: overview, facts, episodes, working_memory, cross_context' },
        topic_filter: { type: 'string', description: 'Optional topic to filter by' },
      },
    },
  },
];

// Set for fast lookup
const EXPOSED_TOOL_NAMES = new Set(EXPOSED_TOOLS.map(t => t.name));

// ===========================================
// JSON-RPC Handler
// ===========================================

/**
 * Handle a JSON-RPC request for the MCP server
 */
export async function handleMCPRequest(
  request: JsonRpcRequest,
  context: AIContext
): Promise<JsonRpcResponse> {
  const { id, method, params } = request;

  try {
    switch (method) {
      case 'initialize': {
        return {
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: {
              tools: { listChanged: false },
            },
            serverInfo: {
              name: 'zenai',
              version: '1.0.0',
            },
          },
        };
      }

      case 'tools/list': {
        return {
          jsonrpc: '2.0',
          id,
          result: {
            tools: EXPOSED_TOOLS,
          },
        };
      }

      case 'tools/call': {
        const toolName = params?.name as string;
        const toolArgs = (params?.arguments as Record<string, unknown>) || {};

        if (!toolName) {
          return { jsonrpc: '2.0', id, error: { code: -32602, message: 'Missing tool name' } };
        }

        // Check if tool is in exposed list
        if (!EXPOSED_TOOL_NAMES.has(toolName)) {
          return { jsonrpc: '2.0', id, error: { code: -32602, message: `Tool "${toolName}" is not available via MCP` } };
        }

        // Check if tool is registered in the backend
        if (!toolRegistry.has(toolName)) {
          return { jsonrpc: '2.0', id, error: { code: -32601, message: `Tool "${toolName}" not found in registry` } };
        }

        const execContext: ToolExecutionContext = {
          aiContext: context,
          sessionId: `mcp-${Date.now()}`,
        };

        logger.info('MCP tool call', { tool: toolName, context });

        const result = await toolRegistry.execute(toolName, toolArgs, execContext);

        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: result }],
          },
        };
      }

      case 'ping': {
        return { jsonrpc: '2.0', id, result: {} };
      }

      default:
        return { jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } };
    }
  } catch (error) {
    logger.error('MCP request failed', error instanceof Error ? error : undefined, { method });
    return {
      jsonrpc: '2.0',
      id,
      error: { code: -32603, message: error instanceof Error ? error.message : 'Internal error' },
    };
  }
}

/**
 * Get list of exposed MCP tools (for frontend display and discovery)
 */
export function getExposedTools(): MCPToolDefinition[] {
  return EXPOSED_TOOLS;
}
