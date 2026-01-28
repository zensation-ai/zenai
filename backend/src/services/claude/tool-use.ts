/**
 * Claude Tool Use Module
 *
 * Implements Claude's native tool use (function calling) capability
 * for structured, reliable actions within conversations.
 *
 * Benefits over free-form responses:
 * - Guaranteed structured output
 * - Type-safe action execution
 * - Composable tool chains
 * - Better error handling
 *
 * @module services/claude/tool-use
 */

import Anthropic from '@anthropic-ai/sdk';
import { logger } from '../../utils/logger';
import { getClaudeClient, executeWithProtection, CLAUDE_MODEL } from './client';

// ===========================================
// Types & Interfaces
// ===========================================

/**
 * Execution context passed to tool handlers
 * This replaces the global context state to enable request-scoped execution
 */
export interface ToolExecutionContext {
  /** The AI context (personal or work) */
  aiContext: 'personal' | 'work';
  /** Optional session ID for tracking */
  sessionId?: string;
  /** Optional user ID for audit */
  userId?: string;
}

/**
 * Tool definition following Claude's schema
 */
export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description: string;
      enum?: string[];
      items?: { type: string };
    }>;
    required: string[];
  };
}

/**
 * Result from a tool execution
 */
export interface ToolResult {
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

/**
 * Tool call from Claude's response
 */
export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

/**
 * Handler function for tool execution
 * Now accepts ToolExecutionContext for request-scoped execution
 */
export type ToolHandler = (
  input: Record<string, unknown>,
  context: ToolExecutionContext
) => Promise<string>;

/**
 * Registered tool with definition and handler
 */
export interface RegisteredTool {
  definition: ToolDefinition;
  handler: ToolHandler;
}

/**
 * Options for tool-enabled calls
 */
export interface ToolUseOptions {
  /** Maximum iterations for multi-turn tool use */
  maxIterations?: number;
  /** System prompt */
  systemPrompt?: string;
  /** Temperature (0-1) */
  temperature?: number;
  /** Force specific tool usage */
  toolChoice?: { type: 'auto' } | { type: 'any' } | { type: 'tool'; name: string };
  /** Execution context for request-scoped tool execution */
  executionContext?: ToolExecutionContext;
}

/**
 * Result from a tool-enabled conversation
 */
export interface ToolUseResult {
  /** Final text response */
  response: string;
  /** Tools that were called */
  toolsCalled: Array<{ name: string; input: Record<string, unknown>; result: string }>;
  /** Number of iterations used */
  iterations: number;
  /** Stop reason */
  stopReason: string;
}

// ===========================================
// Built-in Tool Definitions
// ===========================================

/**
 * Search ideas tool - semantic search through user's ideas
 */
export const TOOL_SEARCH_IDEAS: ToolDefinition = {
  name: 'search_ideas',
  description: 'Durchsucht die Ideen des Benutzers nach relevanten Einträgen. Nutze dies um Kontext zu finden oder verwandte Ideen zu identifizieren.',
  input_schema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Die Suchanfrage (semantische Suche)',
      },
      limit: {
        type: 'number',
        description: 'Maximale Anzahl Ergebnisse (Standard: 5)',
      },
    },
    required: ['query'],
  },
};

/**
 * Create idea tool - structure and save a new idea
 */
export const TOOL_CREATE_IDEA: ToolDefinition = {
  name: 'create_idea',
  description: 'Erstellt eine neue strukturierte Idee basierend auf dem Gespräch. Nutze dies wenn der Benutzer eine Idee, Aufgabe oder Erkenntnis festhalten möchte.',
  input_schema: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: 'Kurzer, prägnanter Titel (max. 10 Wörter)',
      },
      type: {
        type: 'string',
        description: 'Art der Idee',
        enum: ['idea', 'task', 'insight', 'problem', 'question'],
      },
      summary: {
        type: 'string',
        description: 'Zusammenfassung in 1-2 Sätzen',
      },
      category: {
        type: 'string',
        description: 'Kategorie',
        enum: ['business', 'technical', 'personal', 'learning'],
      },
      priority: {
        type: 'string',
        description: 'Priorität',
        enum: ['low', 'medium', 'high'],
      },
      next_steps: {
        type: 'array',
        description: 'Nächste Schritte (optional)',
        items: { type: 'string' },
      },
    },
    required: ['title', 'type', 'summary'],
  },
};

/**
 * Get related ideas tool - find connected ideas via knowledge graph
 */
export const TOOL_GET_RELATED: ToolDefinition = {
  name: 'get_related_ideas',
  description: 'Findet verwandte Ideen über den Knowledge Graph. Nutze dies um Verbindungen und Zusammenhänge aufzuzeigen.',
  input_schema: {
    type: 'object',
    properties: {
      idea_id: {
        type: 'string',
        description: 'ID der Ausgangsidee',
      },
      relationship_types: {
        type: 'array',
        description: 'Arten von Beziehungen (optional)',
        items: { type: 'string' },
      },
    },
    required: ['idea_id'],
  },
};

/**
 * Web search tool - search the web for information
 */
export const TOOL_WEB_SEARCH: ToolDefinition = {
  name: 'web_search',
  description: 'Durchsucht das Web nach aktuellen Informationen. Nutze dies für Recherche zu aktuellen Themen, Nachrichten, oder wenn der Nutzer nach aktuellen Informationen fragt.',
  input_schema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Die Suchanfrage',
      },
      count: {
        type: 'number',
        description: 'Anzahl der Ergebnisse (Standard: 5, Max: 10)',
      },
    },
    required: ['query'],
  },
};

/**
 * Fetch URL tool - fetch and extract content from a URL
 */
export const TOOL_FETCH_URL: ToolDefinition = {
  name: 'fetch_url',
  description: 'Ruft den Inhalt einer URL ab und extrahiert den lesbaren Text. Nutze dies wenn der Nutzer einen Link teilt und wissen möchte was darin steht, oder wenn du Details zu einem Suchergebnis brauchst.',
  input_schema: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'Die URL die abgerufen werden soll',
      },
    },
    required: ['url'],
  },
};

/**
 * Calculate tool - perform calculations
 */
export const TOOL_CALCULATE: ToolDefinition = {
  name: 'calculate',
  description: 'Führt mathematische Berechnungen durch. Nutze dies für exakte numerische Ergebnisse.',
  input_schema: {
    type: 'object',
    properties: {
      expression: {
        type: 'string',
        description: 'Mathematischer Ausdruck (z.B. "2 * 3 + 4")',
      },
    },
    required: ['expression'],
  },
};

/**
 * Set reminder tool - create a reminder
 */
export const TOOL_SET_REMINDER: ToolDefinition = {
  name: 'set_reminder',
  description: 'Erstellt eine Erinnerung für den Benutzer.',
  input_schema: {
    type: 'object',
    properties: {
      message: {
        type: 'string',
        description: 'Der Erinnerungstext',
      },
      when: {
        type: 'string',
        description: 'Zeitpunkt (z.B. "in 1 hour", "tomorrow 9am", "2024-01-15 14:00")',
      },
    },
    required: ['message', 'when'],
  },
};

/**
 * Remember tool - store important information in long-term memory
 * Used to persist facts, preferences, and knowledge about the user
 */
export const TOOL_REMEMBER: ToolDefinition = {
  name: 'remember',
  description:
    'Speichert wichtige Informationen im Langzeitgedächtnis. Nutze dies wenn der Nutzer explizit sagt "merk dir das", oder wenn wichtige Fakten, Präferenzen oder Erkenntnisse über den Nutzer aus dem Gespräch hervorgehen.',
  input_schema: {
    type: 'object',
    properties: {
      content: {
        type: 'string',
        description: 'Die zu merkende Information (klar und präzise formuliert)',
      },
      fact_type: {
        type: 'string',
        description: 'Art der Information',
        enum: ['preference', 'behavior', 'knowledge', 'goal', 'context'],
      },
      confidence: {
        type: 'number',
        description: 'Konfidenz 0.0-1.0 (wie sicher ist diese Info?). Standard: 0.8 für explizite Aussagen, 0.6 für Inferenzen.',
      },
    },
    required: ['content', 'fact_type'],
  },
};

/**
 * Recall tool - search through episodic and long-term memory
 * Used to remember past conversations and stored facts
 */
export const TOOL_RECALL: ToolDefinition = {
  name: 'recall',
  description:
    'Durchsucht Erinnerungen und frühere Gespräche. Nutze dies wenn der Nutzer fragt "erinnerst du dich", "was habe ich gesagt", "was weißt du über mich", oder wenn Kontext aus früheren Gesprächen relevant sein könnte.',
  input_schema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Suchanfrage (was soll erinnert werden?)',
      },
      memory_type: {
        type: 'string',
        description: 'Art der Erinnerung',
        enum: ['episodes', 'facts', 'all'],
      },
      limit: {
        type: 'number',
        description: 'Maximale Anzahl Ergebnisse (Standard: 5)',
      },
    },
    required: ['query'],
  },
};

// ===========================================
// Tool Registry
// ===========================================

/**
 * Global tool registry
 */
class ToolRegistry {
  private tools: Map<string, RegisteredTool> = new Map();

  /**
   * Register a tool with its handler
   */
  register(definition: ToolDefinition, handler: ToolHandler): void {
    this.tools.set(definition.name, { definition, handler });
    logger.debug('Tool registered', { name: definition.name });
  }

  /**
   * Get a tool by name
   */
  get(name: string): RegisteredTool | undefined {
    return this.tools.get(name);
  }

  /**
   * Get all tool definitions
   */
  getDefinitions(): ToolDefinition[] {
    return Array.from(this.tools.values()).map(t => t.definition);
  }

  /**
   * Get specific tool definitions by name
   */
  getDefinitionsFor(names: string[]): ToolDefinition[] {
    return names
      .map(name => this.tools.get(name)?.definition)
      .filter((d): d is ToolDefinition => d !== undefined);
  }

  /**
   * Execute a tool by name with execution context
   * @param name - Tool name
   * @param input - Tool input parameters
   * @param context - Execution context (request-scoped)
   */
  async execute(
    name: string,
    input: Record<string, unknown>,
    context: ToolExecutionContext
  ): Promise<string> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool not found: ${name}`);
    }
    return tool.handler(input, context);
  }

  /**
   * Check if a tool exists
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }
}

export const toolRegistry = new ToolRegistry();

// ===========================================
// Core Tool Use Functions
// ===========================================

/**
 * Execute a conversation with tool use enabled
 *
 * @param messages - Conversation messages
 * @param tools - Tool names to enable (or 'all' for all registered tools)
 * @param options - Configuration options
 * @returns Tool use result with response and tool calls
 */
export async function executeWithTools(
  messages: Anthropic.MessageParam[],
  tools: string[] | 'all',
  options: ToolUseOptions = {}
): Promise<ToolUseResult> {
  const client = getClaudeClient();
  const {
    maxIterations = 5,
    systemPrompt,
    temperature = 0.7,
    toolChoice = { type: 'auto' },
    executionContext = { aiContext: 'personal' },
  } = options;

  // Get tool definitions
  const toolDefinitions = tools === 'all'
    ? toolRegistry.getDefinitions()
    : toolRegistry.getDefinitionsFor(tools);

  if (toolDefinitions.length === 0) {
    throw new Error('No tools available for execution');
  }

  const toolsCalled: ToolUseResult['toolsCalled'] = [];
  let currentMessages = [...messages];
  let iterations = 0;
  let stopReason = 'end_turn';
  let finalResponse = '';

  logger.info('Starting tool-enabled conversation', {
    toolCount: toolDefinitions.length,
    maxIterations,
  });

  while (iterations < maxIterations) {
    iterations++;

    // Make API call with tools
    const response = await executeWithProtection(async () => {
      const params: Anthropic.MessageCreateParams = {
        model: CLAUDE_MODEL,
        max_tokens: 4096,
        messages: currentMessages,
        tools: toolDefinitions as Anthropic.Tool[],
        tool_choice: toolChoice as Anthropic.ToolChoice,
      };

      if (systemPrompt) {
        params.system = systemPrompt;
      }

      if (temperature !== undefined) {
        params.temperature = temperature;
      }

      return client.messages.create(params);
    });

    stopReason = response.stop_reason || 'end_turn';

    // Process response content
    const toolCalls: ToolCall[] = [];
    const textBlocks: string[] = [];

    for (const block of response.content) {
      if (block.type === 'text') {
        textBlocks.push(block.text);
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id,
          name: block.name,
          input: block.input as Record<string, unknown>,
        });
      }
    }

    // If no tool calls, we're done
    if (toolCalls.length === 0) {
      finalResponse = textBlocks.join('\n');
      break;
    }

    // Execute tool calls
    const toolResults: ToolResult[] = [];

    for (const call of toolCalls) {
      logger.debug('Executing tool', { name: call.name, input: call.input });

      try {
        const result = await toolRegistry.execute(call.name, call.input, executionContext);
        toolResults.push({
          tool_use_id: call.id,
          content: result,
        });
        toolsCalled.push({
          name: call.name,
          input: call.input,
          result,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.warn('Tool execution failed', { name: call.name, error: errorMessage });
        toolResults.push({
          tool_use_id: call.id,
          content: `Error: ${errorMessage}`,
          is_error: true,
        });
        toolsCalled.push({
          name: call.name,
          input: call.input,
          result: `Error: ${errorMessage}`,
        });
      }
    }

    // Add assistant message with tool use
    currentMessages.push({
      role: 'assistant',
      content: response.content,
    });

    // Add tool results
    currentMessages.push({
      role: 'user',
      content: toolResults.map(r => ({
        type: 'tool_result' as const,
        tool_use_id: r.tool_use_id,
        content: r.content,
        is_error: r.is_error,
      })),
    });

    // If stop reason is end_turn after tool use, continue to get final response
    if (stopReason === 'end_turn') {
      // Continue the loop to get Claude's response after tool results
    }
  }

  logger.info('Tool-enabled conversation complete', {
    iterations,
    toolsCalled: toolsCalled.length,
    stopReason,
  });

  return {
    response: finalResponse,
    toolsCalled,
    iterations,
    stopReason,
  };
}

/**
 * Simple tool call - single message with tools
 */
export async function callWithTools(
  userMessage: string,
  tools: string[] | 'all',
  options: ToolUseOptions = {}
): Promise<ToolUseResult> {
  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: userMessage },
  ];

  return executeWithTools(messages, tools, options);
}

/**
 * Force a specific tool to be called
 */
export async function forceToolCall(
  userMessage: string,
  toolName: string,
  options: Omit<ToolUseOptions, 'toolChoice'> = {}
): Promise<ToolUseResult> {
  return callWithTools(userMessage, [toolName], {
    ...options,
    toolChoice: { type: 'tool', name: toolName },
  });
}

// ===========================================
// Utility Functions
// ===========================================

/**
 * Parse tool calls from a raw response
 */
export function parseToolCalls(content: Anthropic.ContentBlock[]): ToolCall[] {
  return content
    .filter((block): block is Anthropic.ToolUseBlock => block.type === 'tool_use')
    .map(block => ({
      id: block.id,
      name: block.name,
      input: block.input as Record<string, unknown>,
    }));
}

/**
 * Check if response contains tool use
 */
export function hasToolUse(content: Anthropic.ContentBlock[]): boolean {
  return content.some(block => block.type === 'tool_use');
}

/**
 * Extract text from response (ignoring tool use blocks)
 */
export function extractText(content: Anthropic.ContentBlock[]): string {
  return content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map(block => block.text)
    .join('\n');
}

// ===========================================
// Default Tool Handlers (Placeholder)
// ===========================================

/**
 * Register default tools with placeholder handlers
 * Real handlers should be registered by the application
 */
export function registerDefaultTools(): void {
  // These are placeholders - real handlers should be injected
  toolRegistry.register(TOOL_CALCULATE, async (input, _context) => {
    const expr = input.expression as string;
    if (!expr || typeof expr !== 'string') {
      return 'Fehler: Ungültiger mathematischer Ausdruck';
    }

    try {
      // Safe math evaluation - only allow numbers, operators, and parentheses
      const sanitized = expr.replace(/[^0-9+\-*/().%\s,]/g, '');

      // Additional validation: check for valid expression structure
      // Prevent empty expressions or only whitespace
      if (!sanitized.trim() || !/\d/.test(sanitized)) {
        return 'Fehler: Ungültiger mathematischer Ausdruck';
      }

      // Check for balanced parentheses
      let parenCount = 0;
      for (const char of sanitized) {
        if (char === '(') parenCount++;
        if (char === ')') parenCount--;
        if (parenCount < 0) {
          return 'Fehler: Unbalancierte Klammern';
        }
      }
      if (parenCount !== 0) {
        return 'Fehler: Unbalancierte Klammern';
      }

      // Evaluate with strict mode
      const result = Function(`"use strict"; return (${sanitized})`)();

      // Validate result is a finite number
      if (typeof result !== 'number' || !Number.isFinite(result)) {
        return 'Fehler: Das Ergebnis ist keine gültige Zahl';
      }

      return `Ergebnis: ${result}`;
    } catch {
      return 'Fehler: Ungültiger mathematischer Ausdruck';
    }
  });

  logger.info('Default tools registered');
}
