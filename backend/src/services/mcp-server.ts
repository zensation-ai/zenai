/**
 * MCP Server Service (Phase 55)
 *
 * Exposes ZenAI as a Model Context Protocol server.
 * External AI clients (Claude Desktop, Cursor, etc.) can discover
 * and use ZenAI's tools via JSON-RPC 2.0 over HTTP.
 *
 * Capabilities:
 * - Tools: 10 curated tools (search, create, remember, recall, etc.)
 * - Resources: zenai://ideas/recent, zenai://calendar/today, zenai://memory/facts, zenai://emails/unread
 * - Prompts: summarize, translate, analyze-sentiment
 *
 * Protocol: JSON-RPC 2.0
 * Transport: HTTP (Streamable HTTP, not SSE transport)
 * Auth: Bearer token (reuses existing API key system)
 */

import { logger } from '../utils/logger';
import { toolRegistry, ToolExecutionContext } from './claude/tool-use';
import { AIContext, queryContext } from '../utils/database-context';

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

interface MCPResourceDefinition {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
}

interface MCPPromptDefinition {
  name: string;
  description: string;
  arguments?: Array<{ name: string; description?: string; required?: boolean }>;
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
// Exposed Resources (Phase 55)
// ===========================================

const EXPOSED_RESOURCES: MCPResourceDefinition[] = [
  {
    uri: 'zenai://ideas/recent',
    name: 'Recent Ideas',
    description: 'Most recent ideas from the knowledge base',
    mimeType: 'application/json',
  },
  {
    uri: 'zenai://calendar/today',
    name: 'Today Calendar',
    description: 'Calendar events for today',
    mimeType: 'application/json',
  },
  {
    uri: 'zenai://memory/facts',
    name: 'Learned Facts',
    description: 'Facts stored in long-term memory',
    mimeType: 'application/json',
  },
  {
    uri: 'zenai://emails/unread',
    name: 'Unread Emails',
    description: 'Unread emails from the inbox',
    mimeType: 'application/json',
  },
];

// ===========================================
// Exposed Prompts (Phase 55)
// ===========================================

const EXPOSED_PROMPTS: MCPPromptDefinition[] = [
  {
    name: 'summarize',
    description: 'Summarize content concisely',
    arguments: [
      { name: 'content', description: 'The content to summarize', required: true },
      { name: 'max_length', description: 'Maximum length in words' },
    ],
  },
  {
    name: 'translate',
    description: 'Translate text to another language',
    arguments: [
      { name: 'text', description: 'The text to translate', required: true },
      { name: 'target_lang', description: 'Target language (e.g., en, de, fr)', required: true },
    ],
  },
  {
    name: 'analyze-sentiment',
    description: 'Analyze the sentiment of text',
    arguments: [
      { name: 'text', description: 'The text to analyze', required: true },
    ],
  },
];

// ===========================================
// Resource Handlers (Phase 55)
// ===========================================

async function readResource(uri: string, context: AIContext): Promise<{ contents: Array<{ uri: string; mimeType: string; text: string }> }> {
  try {
    switch (uri) {
      case 'zenai://ideas/recent': {
        const result = await queryContext(context, `
          SELECT id, title, type, category, priority, summary, created_at
          FROM ideas ORDER BY created_at DESC LIMIT 10
        `, []);
        return {
          contents: [{
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(result.rows, null, 2),
          }],
        };
      }

      case 'zenai://calendar/today': {
        const today = new Date();
        const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
        const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).toISOString();
        const result = await queryContext(context, `
          SELECT id, title, start_time, end_time, location, description
          FROM calendar_events
          WHERE start_time >= $1 AND start_time < $2
          ORDER BY start_time
        `, [startOfDay, endOfDay]);
        return {
          contents: [{
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(result.rows, null, 2),
          }],
        };
      }

      case 'zenai://memory/facts': {
        const result = await queryContext(context, `
          SELECT id, content, fact_type, confidence, created_at
          FROM learned_facts
          WHERE confidence >= 0.5
          ORDER BY created_at DESC LIMIT 20
        `, []);
        return {
          contents: [{
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(result.rows, null, 2),
          }],
        };
      }

      case 'zenai://emails/unread': {
        const result = await queryContext(context, `
          SELECT id, subject, sender_email, received_at, ai_summary
          FROM emails
          WHERE status = 'unread'
          ORDER BY received_at DESC LIMIT 10
        `, []);
        return {
          contents: [{
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(result.rows, null, 2),
          }],
        };
      }

      default:
        throw new Error(`Unknown resource: ${uri}`);
    }
  } catch (error) {
    // Return empty result if table doesn't exist yet
    logger.debug('MCP resource read failed (table may not exist)', {
      uri,
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      contents: [{
        uri,
        mimeType: 'application/json',
        text: '[]',
      }],
    };
  }
}

// ===========================================
// Prompt Handlers (Phase 55)
// ===========================================

function getPromptMessages(name: string, args: Record<string, unknown>): Array<{ role: string; content: { type: string; text: string } }> {
  switch (name) {
    case 'summarize':
      return [{
        role: 'user',
        content: {
          type: 'text',
          text: `Summarize the following content${args.max_length ? ` in at most ${args.max_length} words` : ''}:\n\n${args.content}`,
        },
      }];

    case 'translate':
      return [{
        role: 'user',
        content: {
          type: 'text',
          text: `Translate the following text to ${args.target_lang}:\n\n${args.text}`,
        },
      }];

    case 'analyze-sentiment':
      return [{
        role: 'user',
        content: {
          type: 'text',
          text: `Analyze the sentiment of the following text. Respond with: positive, negative, neutral, or mixed, along with a brief explanation.\n\n${args.text}`,
        },
      }];

    default:
      throw new Error(`Unknown prompt: ${name}`);
  }
}

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
              resources: { subscribe: false, listChanged: false },
              prompts: { listChanged: false },
            },
            serverInfo: {
              name: 'zenai',
              version: '2.0.0',
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

      // === Resources (Phase 55) ===

      case 'resources/list': {
        return {
          jsonrpc: '2.0',
          id,
          result: {
            resources: EXPOSED_RESOURCES,
          },
        };
      }

      case 'resources/read': {
        const uri = params?.uri as string;
        if (!uri) {
          return { jsonrpc: '2.0', id, error: { code: -32602, message: 'Missing resource URI' } };
        }

        const resourceResult = await readResource(uri, context);
        return {
          jsonrpc: '2.0',
          id,
          result: resourceResult,
        };
      }

      // === Prompts (Phase 55) ===

      case 'prompts/list': {
        return {
          jsonrpc: '2.0',
          id,
          result: {
            prompts: EXPOSED_PROMPTS,
          },
        };
      }

      case 'prompts/get': {
        const promptName = params?.name as string;
        const promptArgs = (params?.arguments as Record<string, unknown>) || {};

        if (!promptName) {
          return { jsonrpc: '2.0', id, error: { code: -32602, message: 'Missing prompt name' } };
        }

        const prompt = EXPOSED_PROMPTS.find(p => p.name === promptName);
        if (!prompt) {
          return { jsonrpc: '2.0', id, error: { code: -32602, message: `Unknown prompt: ${promptName}` } };
        }

        try {
          const messages = getPromptMessages(promptName, promptArgs);
          return {
            jsonrpc: '2.0',
            id,
            result: {
              description: prompt.description,
              messages,
            },
          };
        } catch (promptError) {
          return {
            jsonrpc: '2.0',
            id,
            error: {
              code: -32602,
              message: promptError instanceof Error ? promptError.message : 'Prompt error',
            },
          };
        }
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
