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
import {
  CompactionConfig,
  COMPACTION_BETA,
  buildContextManagement,
  hasCompactionBlock,
  calculateTokensSaved,
  recordCompaction,
} from './context-compaction';

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
  | 'compaction_info'   // Context was compacted (infinite conversations)
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
  /** Context compaction configuration (enables infinite conversations) */
  compactionConfig?: CompactionConfig;
  /** Session ID for compaction state tracking */
  sessionId?: string;
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
  /** Whether context compaction occurred during this response */
  compactionOccurred?: boolean;
  /** Tokens saved by compaction */
  compactionTokensSaved?: number;
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
 * Setup SSE headers on response.
 * Idempotent: safe to call multiple times (e.g. from route + thinkingStream).
 */
export function setupSSEHeaders(res: Response): void {
  if (res.headersSent) {return;}
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
    const params: Record<string, unknown> = {
      model: CLAUDE_MODEL,
      max_tokens: opts.maxTokens ?? 16000,
      messages,
      stream: true,
    };

    // Add Extended Thinking if enabled (requires specific model and settings)
    if (opts.enableThinking) {
      params.thinking = {
        type: 'enabled',
        budget_tokens: opts.thinkingBudget ?? 10000,
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

    // Add context compaction if configured
    const contextManagement = opts.compactionConfig
      ? buildContextManagement(opts.compactionConfig)
      : undefined;
    if (contextManagement) {
      params.context_management = contextManagement;
    }

    // Request options for beta features
    const requestOpts = contextManagement
      ? { headers: { 'anthropic-beta': COMPACTION_BETA } }
      : undefined;

    // Create streaming response (with beta headers if compaction enabled)
    const stream = client.messages.stream(
      params as unknown as Anthropic.MessageCreateParams,
      requestOpts
    );

    let isInThinking = false;
    let isInContent = false;
    let thinkingContent = '';
    let responseContent = '';
    let compactionDetected = false;

    // Handle text content deltas
    stream.on('text', (text: string) => {
      if (!isInContent) {
        sendSSE(res, { type: 'content_start', data: {} });
        isInContent = true;
      }
      responseContent += text;
      sendSSE(res, { type: 'content_delta', data: { content: text } });
    });

    // Handle thinking deltas incrementally (streams each chunk as it arrives)
    stream.on('thinking', (thinkingDelta: string) => {
      thinkingContent += thinkingDelta;
      sendSSE(res, { type: 'thinking_delta', data: { thinking: thinkingDelta } });
    });

    // Handle block-level events for start/end markers, tool use, and compaction
    stream.on('streamEvent', (event: Anthropic.MessageStreamEvent) => {
      if (event.type === 'content_block_start') {
        if (event.content_block.type === 'thinking') {
          sendSSE(res, { type: 'thinking_start', data: {} });
          isInThinking = true;
        } else if (event.content_block.type === 'tool_use') {
          sendSSE(res, {
            type: 'tool_use_start',
            data: { tool: { name: event.content_block.name } },
          });
        }
      } else if (event.type === 'content_block_stop' && isInThinking) {
        sendSSE(res, { type: 'thinking_end', data: { thinking: thinkingContent } });
        isInThinking = false;
      }
    });

    // Wait for stream completion
    const finalMessage = await stream.finalMessage();

    // Check if compaction occurred in the response
    if (hasCompactionBlock(finalMessage.content)) {
      compactionDetected = true;
      const tokensSaved = calculateTokensSaved(finalMessage.usage as unknown as Parameters<typeof calculateTokensSaved>[0]);

      // Track compaction state for this session
      if (opts.sessionId) {
        recordCompaction(opts.sessionId, tokensSaved);
      }

      // Notify client about compaction
      sendSSE(res, {
        type: 'compaction_info',
        data: {
          content: `Kontext wurde komprimiert (${tokensSaved > 0 ? tokensSaved.toLocaleString() + ' Tokens gespart' : 'aktiv'})`,
        },
      });

      logger.info('Context compaction occurred during stream', {
        sessionId: opts.sessionId,
        tokensSaved,
      });
    }

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
      compactionOccurred: compactionDetected,
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
  const params: Record<string, unknown> = {
    model: CLAUDE_MODEL,
    max_tokens: opts.maxTokens ?? 16000,
    messages,
    stream: true,
  };

  if (opts.enableThinking) {
    params.thinking = {
      type: 'enabled',
      budget_tokens: opts.thinkingBudget ?? 10000,
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

  // Add context compaction if configured
  const contextManagement = opts.compactionConfig
    ? buildContextManagement(opts.compactionConfig)
    : undefined;
  if (contextManagement) {
    params.context_management = contextManagement;
  }

  const requestOpts = contextManagement
    ? { headers: { 'anthropic-beta': COMPACTION_BETA } }
    : undefined;

  // Create streaming response
  const stream = client.messages.stream(
    params as unknown as Anthropic.MessageCreateParams,
    requestOpts
  );

  let thinking = '';
  let content = '';
  const toolCalls: StreamingResult['toolCalls'] = [];

  // Collect text deltas
  stream.on('text', (text: string) => {
    content += text;
  });

  // Collect thinking deltas incrementally
  stream.on('thinking', (thinkingDelta: string) => {
    thinking += thinkingDelta;
  });

  // Wait for completion
  const finalMessage = await stream.finalMessage();

  // Extract tool calls from final message
  let compactionOccurred = false;
  let compactionTokensSaved = 0;
  for (const block of finalMessage.content) {
    if (block.type === 'tool_use') {
      toolCalls.push({
        name: block.name,
        input: block.input as Record<string, unknown>,
      });
    }
  }

  // Check for compaction
  if (hasCompactionBlock(finalMessage.content)) {
    compactionOccurred = true;
    compactionTokensSaved = calculateTokensSaved(finalMessage.usage as unknown as Parameters<typeof calculateTokensSaved>[0]);
    if (opts.sessionId) {
      recordCompaction(opts.sessionId, compactionTokensSaved);
    }
    logger.info('Context compaction occurred during collect', {
      sessionId: opts.sessionId,
      tokensSaved: compactionTokensSaved,
    });
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
    compactionOccurred,
    compactionTokensSaved: compactionTokensSaved > 0 ? compactionTokensSaved : undefined,
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
  thinkingBudget: number = 10000,
  compactionConfig?: CompactionConfig,
  sessionId?: string
): Promise<void> {
  setupSSEHeaders(res);

  await streamToSSE(res, messages, {
    enableThinking: true,
    thinkingBudget,
    systemPrompt,
    maxTokens: 16000,
    compactionConfig,
    sessionId,
  });
}
