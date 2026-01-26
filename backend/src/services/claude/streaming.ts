/**
 * Claude Streaming Module
 *
 * Provides real-time streaming responses with Extended Thinking support.
 * Uses Server-Sent Events (SSE) for efficient client communication.
 *
 * Features:
 * - Real-time token streaming
 * - Extended Thinking display (thinking blocks)
 * - Interleaved Thinking for tool calls (Claude 4 beta)
 * - Progress indicators
 *
 * @module services/claude/streaming
 */

import Anthropic from '@anthropic-ai/sdk';
import { Response } from 'express';
import { logger } from '../../utils/logger';
import { getClaudeClient, CLAUDE_MODEL } from './client';

// ===========================================
// Types & Interfaces
// ===========================================

/**
 * SSE Event types for streaming
 */
export type StreamEventType =
  | 'thinking_start'    // Extended thinking begins
  | 'thinking_delta'    // Thinking content chunk
  | 'thinking_end'      // Extended thinking complete
  | 'content_start'     // Response content begins
  | 'content_delta'     // Response content chunk
  | 'content_end'       // Response complete
  | 'tool_use_start'    // Tool call initiated
  | 'tool_use_end'      // Tool call complete
  | 'error'             // Error occurred
  | 'done';             // Stream complete

/**
 * SSE Event payload
 */
export interface StreamEvent {
  type: StreamEventType;
  data: {
    content?: string;
    thinking?: string;
    tool?: {
      name: string;
      input?: Record<string, unknown>;
      result?: string;
    };
    error?: string;
    metadata?: {
      inputTokens?: number;
      outputTokens?: number;
      thinkingTokens?: number;
      stopReason?: string;
    };
  };
}

/**
 * Streaming options
 */
export interface StreamingOptions {
  /** Enable Extended Thinking */
  enableThinking?: boolean;
  /** Maximum thinking tokens (budget) */
  thinkingBudget?: number;
  /** System prompt */
  systemPrompt?: string;
  /** Temperature */
  temperature?: number;
  /** Maximum output tokens */
  maxTokens?: number;
  /** Tools to enable */
  tools?: Anthropic.Tool[];
}

/**
 * Streaming result (for non-SSE usage)
 */
export interface StreamingResult {
  content: string;
  thinking?: string;
  toolCalls: Array<{
    name: string;
    input: Record<string, unknown>;
  }>;
  usage: {
    inputTokens: number;
    outputTokens: number;
    thinkingTokens?: number;
  };
  stopReason: string;
}

// ===========================================
// Default Configuration
// ===========================================

const DEFAULT_OPTIONS: StreamingOptions = {
  enableThinking: true,
  thinkingBudget: 10000,
  temperature: 1, // Required for Extended Thinking
  maxTokens: 16000,
};

// ===========================================
// SSE Helper Functions
// ===========================================

/**
 * Send an SSE event to the client
 */
function sendSSE(res: Response, event: StreamEvent): void {
  const eventString = `event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`;
  res.write(eventString);
}

/**
 * Setup SSE headers on response
 */
export function setupSSEHeaders(res: Response): void {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
  res.flushHeaders();
}

// ===========================================
// Streaming Functions
// ===========================================

/**
 * Stream a response with Extended Thinking to SSE
 *
 * @param res - Express response object (must be SSE-configured)
 * @param messages - Conversation messages
 * @param options - Streaming options
 */
export async function streamToSSE(
  res: Response,
  messages: Anthropic.MessageParam[],
  options: StreamingOptions = {}
): Promise<void> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const client = getClaudeClient();

  logger.info('Starting SSE stream', {
    enableThinking: opts.enableThinking,
    thinkingBudget: opts.thinkingBudget,
    messageCount: messages.length,
  });

  try {
    // Build request parameters
    const params: Anthropic.MessageCreateParams = {
      model: CLAUDE_MODEL,
      max_tokens: opts.maxTokens!,
      messages,
      stream: true,
    };

    // Add Extended Thinking if enabled (requires specific model and settings)
    if (opts.enableThinking) {
      params.thinking = {
        type: 'enabled',
        budget_tokens: opts.thinkingBudget!,
      };
      // Extended Thinking requires temperature = 1
      params.temperature = 1;
    } else if (opts.temperature !== undefined) {
      params.temperature = opts.temperature;
    }

    if (opts.systemPrompt) {
      params.system = opts.systemPrompt;
    }

    if (opts.tools && opts.tools.length > 0) {
      params.tools = opts.tools;
    }

    // Create streaming response
    const stream = client.messages.stream(params);

    let isInThinking = false;
    let isInContent = false;
    let thinkingContent = '';
    let responseContent = '';

    // Handle stream events
    stream.on('text', (text: string) => {
      if (!isInContent) {
        sendSSE(res, { type: 'content_start', data: {} });
        isInContent = true;
      }
      responseContent += text;
      sendSSE(res, { type: 'content_delta', data: { content: text } });
    });

    // Handle thinking blocks using message event
    stream.on('message', (message: Anthropic.Message) => {
      // Process content blocks to find thinking
      for (const block of message.content) {
        if (block.type === 'thinking' && 'thinking' in block) {
          if (!isInThinking) {
            sendSSE(res, { type: 'thinking_start', data: {} });
            isInThinking = true;
          }
          thinkingContent = (block as any).thinking || '';
          sendSSE(res, { type: 'thinking_delta', data: { thinking: thinkingContent } });
          sendSSE(res, { type: 'thinking_end', data: { thinking: thinkingContent } });
          isInThinking = false;
        } else if (block.type === 'tool_use') {
          sendSSE(res, {
            type: 'tool_use_start',
            data: {
              tool: {
                name: block.name,
              },
            },
          });
        }
      }
    });

    // Wait for stream completion
    const finalMessage = await stream.finalMessage();

    // Send completion event with metadata
    sendSSE(res, {
      type: 'done',
      data: {
        content: responseContent,
        metadata: {
          inputTokens: finalMessage.usage.input_tokens,
          outputTokens: finalMessage.usage.output_tokens,
          stopReason: finalMessage.stop_reason || 'end_turn',
        },
      },
    });

    logger.info('SSE stream complete', {
      inputTokens: finalMessage.usage.input_tokens,
      outputTokens: finalMessage.usage.output_tokens,
      stopReason: finalMessage.stop_reason,
      hadThinking: thinkingContent.length > 0,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown streaming error';
    logger.error('SSE stream failed', error instanceof Error ? error : undefined);

    sendSSE(res, {
      type: 'error',
      data: { error: errorMessage },
    });
  } finally {
    res.end();
  }
}

/**
 * Stream a response and collect results (non-SSE)
 *
 * @param messages - Conversation messages
 * @param options - Streaming options
 * @returns Collected streaming result
 */
export async function streamAndCollect(
  messages: Anthropic.MessageParam[],
  options: StreamingOptions = {}
): Promise<StreamingResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const client = getClaudeClient();

  logger.debug('Starting stream collection', {
    enableThinking: opts.enableThinking,
    messageCount: messages.length,
  });

  // Build request parameters
  const params: Anthropic.MessageCreateParams = {
    model: CLAUDE_MODEL,
    max_tokens: opts.maxTokens!,
    messages,
    stream: true,
  };

  if (opts.enableThinking) {
    params.thinking = {
      type: 'enabled',
      budget_tokens: opts.thinkingBudget!,
    };
    params.temperature = 1;
  } else if (opts.temperature !== undefined) {
    params.temperature = opts.temperature;
  }

  if (opts.systemPrompt) {
    params.system = opts.systemPrompt;
  }

  if (opts.tools && opts.tools.length > 0) {
    params.tools = opts.tools;
  }

  // Create streaming response
  const stream = client.messages.stream(params);

  let thinking = '';
  let content = '';
  const toolCalls: StreamingResult['toolCalls'] = [];

  // Collect text
  stream.on('text', (text: string) => {
    content += text;
  });

  // Collect thinking from final message
  stream.on('message', (message: Anthropic.Message) => {
    for (const block of message.content) {
      if (block.type === 'thinking' && 'thinking' in block) {
        thinking = (block as any).thinking || '';
      }
    }
  });

  // Wait for completion
  const finalMessage = await stream.finalMessage();

  // Extract tool calls from final message
  for (const block of finalMessage.content) {
    if (block.type === 'tool_use') {
      toolCalls.push({
        name: block.name,
        input: block.input as Record<string, unknown>,
      });
    }
  }

  return {
    content,
    thinking: thinking || undefined,
    toolCalls,
    usage: {
      inputTokens: finalMessage.usage.input_tokens,
      outputTokens: finalMessage.usage.output_tokens,
      thinkingTokens: thinking.length > 0 ? Math.ceil(thinking.length / 4) : undefined,
    },
    stopReason: finalMessage.stop_reason || 'end_turn',
  };
}

/**
 * Simple streaming response (no thinking, no tools)
 */
export async function simpleStream(
  res: Response,
  userMessage: string,
  systemPrompt?: string
): Promise<void> {
  setupSSEHeaders(res);

  await streamToSSE(
    res,
    [{ role: 'user', content: userMessage }],
    {
      enableThinking: false,
      systemPrompt,
      temperature: 0.7,
      maxTokens: 4096,
    }
  );
}

/**
 * Stream with Extended Thinking enabled
 */
export async function thinkingStream(
  res: Response,
  messages: Anthropic.MessageParam[],
  systemPrompt?: string,
  thinkingBudget: number = 10000
): Promise<void> {
  setupSSEHeaders(res);

  await streamToSSE(res, messages, {
    enableThinking: true,
    thinkingBudget,
    systemPrompt,
    maxTokens: 16000,
  });
}
