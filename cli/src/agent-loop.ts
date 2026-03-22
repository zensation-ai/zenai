/**
 * Agent Loop (Phase 132)
 *
 * Core agent loop for the ZenAI CLI Agent. Manages the conversation with
 * Claude, handles tool use, and tracks iteration state.
 *
 * @module cli/agent-loop
 */

import Anthropic from '@anthropic-ai/sdk';
import { logger } from './logger';
import type {
  AgentConfig,
  AgentResponse,
  ContentBlock,
  ConversationMessage,
  ToolCallRecord,
  ToolDefinition,
  ToolUse,
} from './types';

// ─── Constants ──────────────────────────────────────────────────────────────

const MAX_TOOL_OUTPUT_LENGTH = 32_000;

// ─── Prompt Building ────────────────────────────────────────────────────────

/**
 * Builds the system prompt for the agent, including CWD, core memory blocks,
 * tool count, and ZenAI identity.
 */
export function buildSystemPrompt(
  cwd: string,
  coreMemoryBlocks: string[],
  toolCount: number,
): string {
  const lines: string[] = [
    'You are the ZenAI CLI Agent, an intelligent coding assistant.',
    '',
    `Working directory: ${cwd}`,
    `Available tools: ${toolCount}`,
  ];

  if (coreMemoryBlocks.length > 0) {
    lines.push('');
    lines.push('## Core Memory');
    for (const block of coreMemoryBlocks) {
      lines.push(`- ${block}`);
    }
  }

  lines.push('');
  lines.push(
    'Help the user with their coding tasks. Use tools when needed. ' +
    'Be concise and accurate.',
  );

  return lines.join('\n');
}

// ─── Content Block Utilities ────────────────────────────────────────────────

/**
 * Extracts all tool_use blocks from a ContentBlock array.
 */
export function extractToolUses(content: ContentBlock[]): ToolUse[] {
  return content.filter((block): block is ToolUse => block.type === 'tool_use');
}

/**
 * Returns true if any tool_use block exists in the content.
 */
export function hasToolUse(content: ContentBlock[]): boolean {
  return content.some((block) => block.type === 'tool_use');
}

/**
 * Formats a tool result for display. Truncates output at ~32KB.
 */
export function formatToolResult(
  name: string,
  output: string,
  isError: boolean,
): string {
  let truncatedOutput = output;
  if (truncatedOutput.length > MAX_TOOL_OUTPUT_LENGTH) {
    truncatedOutput =
      truncatedOutput.slice(0, MAX_TOOL_OUTPUT_LENGTH) +
      '\n... [truncated]';
  }

  if (isError) {
    return `[${name}] error: ${truncatedOutput}`;
  }
  return `[${name}] ${truncatedOutput}`;
}

// ─── Helper: extract text from content blocks ───────────────────────────────

function extractText(content: ContentBlock[]): string {
  return content
    .filter((block): block is { type: 'text'; text: string } => block.type === 'text')
    .map((block) => block.text)
    .join('');
}

// ─── Main Agent Loop ────────────────────────────────────────────────────────

/**
 * The main agent loop. Sends messages to Claude, handles tool use in a loop,
 * and returns the final text response with tool call records.
 */
export async function agentLoop(
  message: string,
  config: AgentConfig,
  tools: ToolDefinition[],
  executor: (name: string, input: Record<string, unknown>) => Promise<string>,
): Promise<AgentResponse> {
  const client = new Anthropic({ apiKey: config.apiKey });
  const systemPrompt = buildSystemPrompt(process.cwd(), [], tools.length);

  const messages: ConversationMessage[] = [
    { role: 'user', content: message },
  ];

  const toolCalls: ToolCallRecord[] = [];
  let iterationCount = 0;

  while (iterationCount < config.maxIterations) {
    iterationCount++;

    logger.debug(`Iteration ${iterationCount}/${config.maxIterations}`);

    const response = await client.messages.create({
      model: config.model,
      max_tokens: config.maxTokens,
      system: systemPrompt,
      tools: tools as Anthropic.Tool[],
      messages: messages as Anthropic.MessageParam[],
    });

    const content = response.content as ContentBlock[];

    // If no tool use, return the text response
    if (!hasToolUse(content)) {
      const text = extractText(content);
      return { text, toolCalls, iterationCount };
    }

    // Process tool calls
    const toolUses = extractToolUses(content);

    // Add the assistant message to conversation
    messages.push({ role: 'assistant', content });

    // Execute each tool and collect results
    const toolResultBlocks: Array<{
      type: 'tool_result';
      tool_use_id: string;
      content: string;
      is_error?: boolean;
    }> = [];

    for (const toolUse of toolUses) {
      const startTime = Date.now();
      let output: string;
      let isError = false;

      try {
        output = await executor(toolUse.name, toolUse.input);
      } catch (err) {
        isError = true;
        output = err instanceof Error ? err.message : String(err);
      }

      const durationMs = Date.now() - startTime;

      toolCalls.push({
        name: toolUse.name,
        input: toolUse.input,
        output,
        isError,
        durationMs,
      });

      logger.debug(formatToolResult(toolUse.name, output, isError));

      toolResultBlocks.push({
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: output,
        ...(isError ? { is_error: true } : {}),
      });
    }

    // Add tool results as a user message
    messages.push({ role: 'user', content: toolResultBlocks as unknown as ContentBlock[] });
  }

  // Max iterations reached
  const warningText =
    `Stopped after reaching the max iteration limit (${config.maxIterations}). ` +
    'The task may be incomplete.';
  logger.warn(warningText);

  return { text: warningText, toolCalls, iterationCount };
}
