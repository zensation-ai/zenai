/**
 * Claude Tool Execution Functions
 *
 * Extracted from tool-use.ts (Phase 119 Architecture Decomposition)
 * Contains executeWithTools, callWithTools, forceToolCall, parseToolCalls, hasToolUse, extractText.
 */

import Anthropic from '@anthropic-ai/sdk';
import { logger } from '../../utils/logger';
import { getClaudeClient, executeWithProtection, CLAUDE_MODEL } from './client';
import type { ToolUseOptions, ToolUseResult, ToolCall, ToolResult } from './tool-use';
import { toolRegistry } from './tool-use';

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
  const currentMessages = [...messages];
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
    const toolCallsFound: ToolCall[] = [];
    const textBlocks: string[] = [];

    for (const block of response.content) {
      if (block.type === 'text') {
        textBlocks.push(block.text);
      } else if (block.type === 'tool_use') {
        toolCallsFound.push({
          id: block.id,
          name: block.name,
          input: block.input as Record<string, unknown>,
        });
      }
    }

    // If no tool calls, we're done
    if (toolCallsFound.length === 0) {
      finalResponse = textBlocks.join('\n');
      break;
    }

    // Execute tool calls
    const toolResults: ToolResult[] = [];

    for (const call of toolCallsFound) {
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

  // Guard against empty response when max iterations reached
  if (!finalResponse && toolsCalled.length > 0) {
    finalResponse = toolsCalled.map(t =>
      `[${t.name}]: ${t.result.substring(0, 200)}`
    ).join('\n\n');
    logger.warn('Tool iteration limit reached without final text response, using tool results as fallback', {
      iterations,
      toolsCalled: toolsCalled.length,
    });
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
