/**
 * Backend Bridge (Phase 132)
 *
 * Bridge between the CLI agent and the ZenAI backend.
 * Forwards tool calls, fetches core memory, and checks availability.
 *
 * @module cli/backend-bridge
 */

import { logger } from './logger';
import type {
  AgentConfig,
  BackendToolResult,
  ToolDefinition,
} from './types';

// ─── Tool Routing ───────────────────────────────────────────────────────────

const KNOWN_TOOLS = new Set(['remember', 'recall', 'web_search', 'search_ideas']);

function getToolEndpoint(tool: string, context: string): { url: string; method: string } {
  switch (tool) {
    case 'remember':
      return { url: `/api/${context}/memory/remember`, method: 'POST' };
    case 'recall':
      return { url: `/api/${context}/memory/recall`, method: 'POST' };
    case 'web_search':
      return { url: `/api/${context}/chat/quick`, method: 'POST' };
    case 'search_ideas':
      return { url: `/api/${context}/ideas/search`, method: 'POST' };
    default:
      return { url: `/api/${context}/tools/${tool}`, method: 'POST' };
  }
}

// ─── BackendBridge Class ────────────────────────────────────────────────────

export class BackendBridge {
  private backendUrl: string | undefined;
  private backendApiKey: string | undefined;

  constructor(config: AgentConfig) {
    this.backendUrl = config.backendUrl;
    this.backendApiKey = config.backendApiKey;
  }

  /**
   * Check if the backend is reachable.
   */
  async isAvailable(): Promise<boolean> {
    if (!this.backendUrl) {
      return false;
    }

    try {
      const response = await fetch(`${this.backendUrl}/api/health`, {
        method: 'GET',
        headers: this.buildHeaders(),
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch (err) {
      logger.debug('Backend health check failed', err);
      return false;
    }
  }

  /**
   * Forward a tool call to the backend.
   */
  async callTool(
    tool: string,
    input: Record<string, unknown>,
    context: string,
  ): Promise<BackendToolResult> {
    if (!this.backendUrl) {
      return { success: false, error: 'Backend not configured' };
    }

    const { url, method } = getToolEndpoint(tool, context);
    const fullUrl = `${this.backendUrl}${url}`;

    try {
      const response = await fetch(fullUrl, {
        method,
        headers: this.buildHeaders(),
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(30000),
      });

      if (response.status === 401) {
        return { success: false, error: 'Unauthorized — check API key (401)' };
      }

      if (!response.ok) {
        const body = await response.text();
        return { success: false, error: `Backend error (${response.status}): ${body}` };
      }

      const data = await response.json() as Record<string, unknown>;
      return { success: true, data: data.data ?? data };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.debug(`Backend tool call failed: ${tool}`, err);
      return { success: false, error: `Backend request failed: ${message}` };
    }
  }

  /**
   * Fetch core memory blocks from the backend.
   */
  async getCoreMemory(): Promise<string[]> {
    if (!this.backendUrl) {
      return [];
    }

    try {
      const response = await fetch(
        `${this.backendUrl}/api/personal/memory/core`,
        {
          method: 'GET',
          headers: this.buildHeaders(),
          signal: AbortSignal.timeout(10000),
        },
      );

      if (!response.ok) {
        return [];
      }

      const json = await response.json() as Record<string, unknown>;
      const dataObj = json?.data as Record<string, unknown> | undefined;
      const blocks = (dataObj?.blocks ?? json?.blocks ?? []) as Array<{ value: string }>;
      return blocks.map((b) => b.value);
    } catch (err) {
      logger.debug('Failed to fetch core memory', err);
      return [];
    }
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.backendApiKey) {
      headers['x-api-key'] = this.backendApiKey;
    }
    return headers;
  }
}

// ─── Tool Definitions ───────────────────────────────────────────────────────

export function getBackendTools(): ToolDefinition[] {
  return [
    {
      name: 'remember',
      description:
        'Store a fact or preference in long-term memory for future recall.',
      input_schema: {
        type: 'object',
        properties: {
          content: {
            type: 'string',
            description: 'The fact or information to remember.',
          },
          importance: {
            type: 'number',
            description: 'Importance score between 0 and 1.',
          },
        },
        required: ['content'],
      },
    },
    {
      name: 'recall',
      description:
        'Search long-term memory for previously stored facts matching a query.',
      input_schema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The search query to find relevant memories.',
          },
        },
        required: ['query'],
      },
    },
    {
      name: 'web_search',
      description:
        'Search the web for up-to-date information using Brave Search.',
      input_schema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The search query.',
          },
        },
        required: ['query'],
      },
    },
    {
      name: 'search_ideas',
      description:
        'Search the user\'s idea collection for matching entries.',
      input_schema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The search query to find matching ideas.',
          },
        },
        required: ['query'],
      },
    },
  ];
}

// ─── Tool Execution ─────────────────────────────────────────────────────────

export async function executeBackendTool(
  name: string,
  input: Record<string, unknown>,
  config: AgentConfig,
  context: string,
): Promise<string> {
  if (!config.backendUrl && !config.backendApiKey) {
    return 'Backend not configured — backend URL and API key are not available.';
  }

  if (!KNOWN_TOOLS.has(name)) {
    return `Unknown backend tool: "${name}"`;
  }

  const bridge = new BackendBridge(config);
  const result = await bridge.callTool(name, input, context);

  if (result.success) {
    return JSON.stringify(result.data);
  }

  return `Backend tool error: ${result.error}`;
}
