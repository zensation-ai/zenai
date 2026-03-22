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
import crypto from 'crypto';
import { Response } from 'express';
import { logger } from '../../utils/logger';
import { TIMEOUTS } from '../../config/timeouts';
import { CircuitBreaker, CircuitBreakerStats } from '../../utils/circuit-breaker';
import { safeStringify } from '../../utils/safe-stringify';
import { sanitizeError } from '../../utils/sanitize-error';
import { getClaudeClient, CLAUDE_MODEL } from './client';
import { getAnthropicBetaHeaders } from './client';
import {
  CompactionConfig,
  COMPACTION_BETA,
  buildContextManagement,
  hasCompactionBlock,
  calculateTokensSaved,
  recordCompaction,
} from './context-compaction';
import { isAdaptiveEnabled, getAdaptiveBudget } from './thinking-budget';
import type { EffortLevel } from '../chat-modes';

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
    requestId?: string;
    metadata?: {
      inputTokens?: number;
      outputTokens?: number;
      thinkingTokens?: number;
      stopReason?: string;
      requestId?: string;
    };
  };
}

/**
 * Tool execution handler for streaming tool use
 */
export type StreamingToolExecutor = (
  name: string,
  input: Record<string, unknown>
) => Promise<string>;

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
  /** Tool executor for handling tool_use responses during streaming */
  toolExecutor?: StreamingToolExecutor;
  /** Maximum tool execution iterations (default: 5) */
  maxToolIterations?: number;
  /** Context compaction configuration (enables infinite conversations) */
  compactionConfig?: CompactionConfig;
  /** Session ID for compaction state tracking */
  sessionId?: string;
  /** Request correlation ID for tracing across logs and SSE events */
  requestId?: string;
  /** AbortSignal to cancel streaming when client disconnects */
  abortSignal?: AbortSignal;
  /** Effort level for cost optimization (low/medium/high). Maps to Claude API effort parameter. */
  effort?: EffortLevel;
  /** Whether to include structured outputs beta header for tool use */
  structuredOutputs?: boolean;
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

/** Maximum size for tool results sent via SSE (64KB) */
const MAX_TOOL_RESULT_SSE_BYTES = 64 * 1024;

/** Maximum size for tool results included in message history (64KB) */
const MAX_TOOL_RESULT_HISTORY_BYTES = 64 * 1024;

/** Maximum total time budget for all tool calls in one request (60s) */
const MAX_TOOL_TIME_MS = TIMEOUTS.CLAUDE_TOOL_BUDGET;

/** Hard cap on tool execution iterations (beyond maxToolIterations) */
const MAX_TOOL_ITERATIONS_HARD_CAP = 10;

/**
 * Truncate a tool result string if it exceeds the SSE size limit.
 * Full result is still sent to Claude; only the SSE client gets truncated output.
 */
function truncateForSSE(result: string): string {
  if (result.length <= MAX_TOOL_RESULT_SSE_BYTES) {return result;}
  const truncated = result.substring(0, MAX_TOOL_RESULT_SSE_BYTES);
  return `${truncated}\n\n[Output truncated: ${result.length} bytes, showing first 64KB]`;
}

/**
 * Truncate a tool result before including it in message history sent to Claude.
 * Prevents token explosion from oversized tool outputs.
 */
function truncateToolResult(result: string, maxSize: number = MAX_TOOL_RESULT_HISTORY_BYTES): string {
  if (result.length <= maxSize) {return result;}
  const truncated = result.substring(0, maxSize);
  return `${truncated}\n\n[Result truncated: ${result.length} bytes, showing first ${Math.round(maxSize / 1024)}KB]`;
}

const DEFAULT_OPTIONS: StreamingOptions = {
  enableThinking: true,
  thinkingBudget: 10000,
  temperature: 0.7, // Default for conversation; overridden to 1 when Extended Thinking is enabled
  maxTokens: 16000,
};

// ===========================================
// Claude API Circuit Breaker
// ===========================================

/**
 * Circuit breaker protecting the Anthropic streaming API.
 * Opens after 3 consecutive failures; probes again after 60 s.
 */
export const claudeBreaker = new CircuitBreaker({
  name: 'claude-stream',
  failureThreshold: 3,
  resetTimeout: TIMEOUTS.CIRCUIT_BREAKER_CLAUDE,
});

/**
 * Returns circuit breaker stats for health endpoint inclusion.
 */
export function getClaudeBreakerStats(): CircuitBreakerStats {
  return claudeBreaker.getStats();
}

// ===========================================
// SSE Helper Functions
// ===========================================

/**
 * Send an SSE event to the client
 */
export function sendSSE(res: Response, event: StreamEvent): void {
  const eventString = `event: ${event.type}\ndata: ${safeStringify(event.data)}\n\n`;
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
  const requestId = opts.requestId || crypto.randomUUID();

  logger.info('Starting SSE stream', {
    requestId,
    enableThinking: opts.enableThinking,
    thinkingBudget: opts.thinkingBudget,
    messageCount: messages.length,
  });

  let streamTimeout: ReturnType<typeof setTimeout> | undefined;

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
      // Use adaptive budget (generous default) when enabled, otherwise use calculated budget
      const budgetTokens = isAdaptiveEnabled()
        ? getAdaptiveBudget()
        : (opts.thinkingBudget ?? 10000);
      params.thinking = {
        type: 'enabled',
        budget_tokens: budgetTokens,
      };
      // Extended Thinking requires temperature = 1
      params.temperature = 1;
    } else if (opts.temperature !== undefined) {
      params.temperature = opts.temperature;
    }

    // Add effort parameter for cost optimization
    if (opts.effort) {
      params.effort = opts.effort;
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

    // Build beta headers (compaction, structured outputs)
    const betaHeaders: string[] = [];
    if (contextManagement) {
      betaHeaders.push(COMPACTION_BETA);
    }
    const structuredBetas = getAnthropicBetaHeaders({
      structuredOutputs: opts.structuredOutputs,
    });
    betaHeaders.push(...structuredBetas);

    const requestOpts = betaHeaders.length > 0
      ? { headers: { 'anthropic-beta': betaHeaders.join(',') } }
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

    // Safety timeout: abort stream if Claude API hangs (90 seconds)
    streamTimeout = setTimeout(() => {
      logger.warn('Stream timeout reached (90s), aborting', { requestId });
      stream.abort();
    }, TIMEOUTS.CLAUDE_STREAM);

    // Abort stream on client disconnect signal
    if (opts.abortSignal) {
      const onAbort = () => {
        logger.info('Client disconnect signal received, aborting stream', { requestId });
        stream.abort();
      };
      if (opts.abortSignal.aborted) {
        stream.abort();
      } else {
        opts.abortSignal.addEventListener('abort', onAbort, { once: true });
      }
    }

    // Handle stream-level errors (connection lost, API errors, timeout abort)
    stream.on('error', (err: Error) => {
      logger.error('Stream error event', err, { requestId });
      clearTimeout(streamTimeout);
      // Propagate error to SSE client so it doesn't hang
      try {
        sendSSE(res, { type: 'error', data: { error: err.message || 'Stream connection lost', requestId } });
      } catch { /* stream already broken */ }
    });

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

    // Wait for stream completion — wrap in circuit breaker to track success/failure.
    // If the breaker is OPEN this will throw immediately (fast-fail) or call fallback.
    const finalMessage = await claudeBreaker.execute(() => stream.finalMessage());
    clearTimeout(streamTimeout);

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

    // === Tool Execution Loop ===
    // When Claude returns tool_use, execute tools and stream a follow-up response
    if (
      finalMessage.stop_reason === 'tool_use' &&
      opts.toolExecutor &&
      opts.tools &&
      opts.tools.length > 0
    ) {
      const maxIterations = Math.min(opts.maxToolIterations ?? 5, MAX_TOOL_ITERATIONS_HARD_CAP);
      let currentMessages = [...messages];
      let currentFinalMessage = finalMessage;
      let iteration = 0;
      const toolStartTime = Date.now();

      while (
        currentFinalMessage.stop_reason === 'tool_use' &&
        iteration < maxIterations
      ) {
        iteration++;

        // Check total tool time budget
        const elapsedToolTime = Date.now() - toolStartTime;
        if (elapsedToolTime >= MAX_TOOL_TIME_MS) {
          logger.warn('Tool execution time budget exceeded', {
            requestId,
            iteration,
            elapsedMs: elapsedToolTime,
            maxMs: MAX_TOOL_TIME_MS,
          });
          sendSSE(res, {
            type: 'content_delta',
            data: { content: '\n\n[Tool execution time limit reached. Generating response with available results.]' },
          });
          break;
        }

        // Extract tool_use blocks from the response
        const toolUseBlocks = currentFinalMessage.content.filter(
          (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
        );

        if (toolUseBlocks.length === 0) {break;}

        // Execute each tool and collect results
        const toolResults: Array<{
          type: 'tool_result';
          tool_use_id: string;
          content: string;
          is_error?: boolean;
        }> = [];

        for (const toolBlock of toolUseBlocks) {
          sendSSE(res, {
            type: 'tool_use_start',
            data: { tool: { name: toolBlock.name, input: toolBlock.input as Record<string, unknown> } },
          });

          try {
            const rawResult = await opts.toolExecutor(
              toolBlock.name,
              toolBlock.input as Record<string, unknown>
            );
            // Truncate oversized results before including in message history
            const result = truncateToolResult(rawResult);
            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolBlock.id,
              content: result,
            });
            sendSSE(res, {
              type: 'tool_use_end',
              data: { tool: { name: toolBlock.name, result: truncateForSSE(result) } },
            });
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Tool execution failed';
            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolBlock.id,
              content: `Error: ${errorMsg}`,
              is_error: true,
            });
            sendSSE(res, {
              type: 'tool_use_end',
              data: { tool: { name: toolBlock.name, result: `Error: ${errorMsg}` } },
            });
          }
        }

        // Dedup: skip if the last 3 tool results are identical error messages (prevents loops)
        const lastToolResults = currentMessages
          .slice(-3)
          .filter(m => m.role === 'user' && Array.isArray(m.content))
          .flatMap(m => (m.content as Array<{ content?: string; is_error?: boolean }>))
          .filter(tr => tr.is_error && tr.content);
        const currentErrors = toolResults.filter(tr => tr.is_error).map(tr => tr.content);
        if (
          currentErrors.length > 0 &&
          lastToolResults.length >= 2 &&
          lastToolResults.slice(-2).every(tr => currentErrors.includes(tr.content ?? ''))
        ) {
          logger.warn('Duplicate tool errors detected, breaking loop', { requestId, iteration });
          sendSSE(res, {
            type: 'content_delta',
            data: { content: '\n\n[Repeated tool errors detected. Stopping tool execution.]' },
          });
          break;
        }

        // Build follow-up messages: assistant response (with tool_use) + tool results
        currentMessages = [
          ...currentMessages,
          { role: 'assistant' as const, content: currentFinalMessage.content },
          { role: 'user' as const, content: toolResults },
        ];

        // Stream follow-up response with tool results
        const followUpParams: Record<string, unknown> = {
          model: CLAUDE_MODEL,
          max_tokens: opts.maxTokens ?? 16000,
          messages: currentMessages,
          stream: true,
          tools: opts.tools,
        };

        if (opts.enableThinking) {
          const budgetTokens = isAdaptiveEnabled()
            ? getAdaptiveBudget()
            : (opts.thinkingBudget ?? 10000);
          followUpParams.thinking = {
            type: 'enabled',
            budget_tokens: budgetTokens,
          };
          followUpParams.temperature = 1;
        } else if (opts.temperature !== undefined) {
          followUpParams.temperature = opts.temperature;
        }

        // Carry effort parameter to follow-up
        if (opts.effort) {
          followUpParams.effort = opts.effort;
        }

        if (opts.systemPrompt) {
          followUpParams.system = opts.systemPrompt;
        }

        const followUpStream = client.messages.stream(
          followUpParams as unknown as Anthropic.MessageCreateParams
        );

        // Safety timeout for follow-up streams (90 seconds each)
        const followUpTimeout = setTimeout(() => {
          logger.warn('Follow-up stream timeout reached (90s), aborting', { iteration });
          followUpStream.abort();
        }, TIMEOUTS.CLAUDE_STREAM);

        // Reset content tracking for follow-up
        isInContent = false;
        isInThinking = false;

        followUpStream.on('text', (text: string) => {
          if (!isInContent) {
            sendSSE(res, { type: 'content_start', data: {} });
            isInContent = true;
          }
          responseContent += text;
          sendSSE(res, { type: 'content_delta', data: { content: text } });
        });

        followUpStream.on('thinking', (thinkingDelta: string) => {
          thinkingContent += thinkingDelta;
          sendSSE(res, { type: 'thinking_delta', data: { thinking: thinkingDelta } });
        });

        followUpStream.on('streamEvent', (event: Anthropic.MessageStreamEvent) => {
          if (event.type === 'content_block_start') {
            if (event.content_block.type === 'thinking') {
              sendSSE(res, { type: 'thinking_start', data: {} });
              isInThinking = true;
            }
          } else if (event.type === 'content_block_stop' && isInThinking) {
            sendSSE(res, { type: 'thinking_end', data: { thinking: thinkingContent } });
            isInThinking = false;
          }
        });

        currentFinalMessage = await followUpStream.finalMessage();
        clearTimeout(followUpTimeout);

        logger.info('Tool follow-up stream complete', {
          requestId,
          iteration,
          stopReason: currentFinalMessage.stop_reason,
          toolsCalled: toolUseBlocks.map(b => b.name),
        });
      }
    }

    // Send completion event with metadata
    const usage = finalMessage.usage;
    sendSSE(res, {
      type: 'done',
      data: {
        content: responseContent,
        requestId,
        metadata: {
          inputTokens: usage?.input_tokens ?? 0,
          outputTokens: usage?.output_tokens ?? 0,
          stopReason: finalMessage.stop_reason || 'end_turn',
          requestId,
        },
      },
    });

    logger.info('SSE stream complete', {
      requestId,
      inputTokens: usage?.input_tokens ?? 0,
      outputTokens: usage?.output_tokens ?? 0,
      stopReason: finalMessage.stop_reason,
      hadThinking: thinkingContent.length > 0,
      compactionOccurred: compactionDetected,
    });

    // Phase 125 TODO: Co-activation for entities mentioned in the response should be
    // recorded by the caller (e.g. general-chat.ts), which has access to the RAG entity
    // IDs that were used to build the prompt context. The streaming layer does not have
    // knowledge of which entities were retrieved, so recording here would be a no-op.
    // Callers with entity context should call:
    //   recordCoactivation(context, entityIds).catch(() => {})
    // after stream completion to strengthen Hebbian associations.
  } catch (error) {
    clearTimeout(streamTimeout);
    const sanitized = sanitizeError(error);
    logger.error('SSE stream failed', error instanceof Error ? error : undefined, { requestId });

    sendSSE(res, {
      type: 'error',
      data: { error: sanitized.message, requestId },
    });
  } finally {
    // Ensure all timers are cleaned up regardless of how we exit
    clearTimeout(streamTimeout);
    if (!res.writableEnded) {
      res.end();
    }
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
    const budgetTokens = isAdaptiveEnabled()
      ? getAdaptiveBudget()
      : (opts.thinkingBudget ?? 10000);
    params.thinking = {
      type: 'enabled',
      budget_tokens: budgetTokens,
    };
    params.temperature = 1;
  } else if (opts.temperature !== undefined) {
    params.temperature = opts.temperature;
  }

  // Add effort parameter for cost optimization
  if (opts.effort) {
    params.effort = opts.effort;
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

  // Build beta headers
  const betaHeaders: string[] = [];
  if (contextManagement) {
    betaHeaders.push(COMPACTION_BETA);
  }
  const structuredBetas = getAnthropicBetaHeaders({
    structuredOutputs: opts.structuredOutputs,
  });
  betaHeaders.push(...structuredBetas);

  const requestOpts = betaHeaders.length > 0
    ? { headers: { 'anthropic-beta': betaHeaders.join(',') } }
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
  sessionId?: string,
  tools?: Anthropic.Tool[],
  toolExecutor?: StreamingToolExecutor,
  requestId?: string,
  abortSignal?: AbortSignal
): Promise<void> {
  setupSSEHeaders(res);

  await streamToSSE(res, messages, {
    enableThinking: true,
    thinkingBudget,
    systemPrompt,
    maxTokens: 16000,
    compactionConfig,
    sessionId,
    tools,
    toolExecutor,
    requestId,
    abortSignal,
  });
}
