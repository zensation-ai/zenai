/**
 * AG-UI Event Adapter
 * Translates ZenAI's internal SSE events to AG-UI protocol format.
 * Used alongside existing events (dual-emit strategy).
 *
 * @module services/agui/event-adapter
 */

import { v4 as uuidv4 } from 'uuid';
import type { ZenAICustomType } from './protocol';
import { serializeAgUIEvent } from './protocol';

export class AgUIEventAdapter {
  private runId: string;
  private messageId: string;

  constructor(_sessionId: string) {
    this.runId = uuidv4();
    this.messageId = uuidv4();
  }

  getRunId(): string {
    return this.runId;
  }

  runStarted(threadId: string, metadata?: Record<string, unknown>): string {
    return serializeAgUIEvent({
      type: 'RUN_STARTED',
      timestamp: Date.now(),
      runId: this.runId,
      data: { threadId, metadata },
    });
  }

  runFinished(tokens?: { inputTokens?: number; outputTokens?: number; thinkingTokens?: number }): string {
    return serializeAgUIEvent({
      type: 'RUN_FINISHED',
      timestamp: Date.now(),
      runId: this.runId,
      data: tokens || {},
    });
  }

  runError(message: string, code?: string): string {
    return serializeAgUIEvent({
      type: 'RUN_ERROR',
      timestamp: Date.now(),
      runId: this.runId,
      data: { message, code },
    });
  }

  textMessageStart(role: 'assistant' | 'thinking' = 'assistant'): string {
    this.messageId = uuidv4();
    return serializeAgUIEvent({
      type: 'TEXT_MESSAGE_START',
      timestamp: Date.now(),
      runId: this.runId,
      data: { messageId: this.messageId, role },
    });
  }

  textMessageContent(content: string): string {
    return serializeAgUIEvent({
      type: 'TEXT_MESSAGE_CONTENT',
      timestamp: Date.now(),
      runId: this.runId,
      data: { content },
    });
  }

  textMessageEnd(): string {
    return serializeAgUIEvent({
      type: 'TEXT_MESSAGE_END',
      timestamp: Date.now(),
      runId: this.runId,
      data: { messageId: this.messageId },
    });
  }

  toolCallStart(toolName: string, input?: Record<string, unknown>): string {
    return serializeAgUIEvent({
      type: 'TOOL_CALL_START',
      timestamp: Date.now(),
      runId: this.runId,
      data: { toolCallId: uuidv4(), toolName, input },
    });
  }

  toolCallEnd(toolName: string, result?: string): string {
    return serializeAgUIEvent({
      type: 'TOOL_CALL_END',
      timestamp: Date.now(),
      runId: this.runId,
      data: { toolCallId: uuidv4(), toolName, result },
    });
  }

  stateSnapshot(stateType: string, state: Record<string, unknown>): string {
    return serializeAgUIEvent({
      type: 'STATE_SNAPSHOT',
      timestamp: Date.now(),
      runId: this.runId,
      data: { stateType, state },
    });
  }

  stateDelta(stateType: string, delta: Record<string, unknown>): string {
    return serializeAgUIEvent({
      type: 'STATE_DELTA',
      timestamp: Date.now(),
      runId: this.runId,
      data: { stateType, delta },
    });
  }

  custom(customType: ZenAICustomType, payload: Record<string, unknown>): string {
    return serializeAgUIEvent({
      type: 'CUSTOM',
      timestamp: Date.now(),
      runId: this.runId,
      data: { customType, payload },
    });
  }
}
