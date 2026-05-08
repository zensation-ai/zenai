/**
 * AG-UI Protocol Types for ZenAI
 * Based on the AG-UI open standard (github.com/ag-ui-protocol/ag-ui)
 * Adapted for ZenAI's cognitive architecture
 *
 * @module services/agui/protocol
 */

export type AgUIEventType =
  | 'RUN_STARTED'
  | 'RUN_FINISHED'
  | 'RUN_ERROR'
  | 'TEXT_MESSAGE_START'
  | 'TEXT_MESSAGE_CONTENT'
  | 'TEXT_MESSAGE_END'
  | 'TOOL_CALL_START'
  | 'TOOL_CALL_END'
  | 'STATE_SNAPSHOT'
  | 'STATE_DELTA'
  | 'CUSTOM';

export interface AgUIEvent {
  type: AgUIEventType;
  timestamp: number;
  runId: string;
}

export interface AgUIRunStarted extends AgUIEvent {
  type: 'RUN_STARTED';
  data: {
    threadId: string;
    metadata?: Record<string, unknown>;
  };
}

export interface AgUIRunFinished extends AgUIEvent {
  type: 'RUN_FINISHED';
  data: {
    inputTokens?: number;
    outputTokens?: number;
    thinkingTokens?: number;
  };
}

export interface AgUIRunError extends AgUIEvent {
  type: 'RUN_ERROR';
  data: {
    message: string;
    code?: string;
  };
}

export interface AgUITextMessageStart extends AgUIEvent {
  type: 'TEXT_MESSAGE_START';
  data: {
    messageId: string;
    role: 'assistant' | 'thinking';
  };
}

export interface AgUITextMessageContent extends AgUIEvent {
  type: 'TEXT_MESSAGE_CONTENT';
  data: {
    content: string;
  };
}

export interface AgUITextMessageEnd extends AgUIEvent {
  type: 'TEXT_MESSAGE_END';
  data: {
    messageId: string;
  };
}

export interface AgUIToolCallStart extends AgUIEvent {
  type: 'TOOL_CALL_START';
  data: {
    toolCallId: string;
    toolName: string;
    input?: Record<string, unknown>;
  };
}

export interface AgUIToolCallEnd extends AgUIEvent {
  type: 'TOOL_CALL_END';
  data: {
    toolCallId: string;
    toolName: string;
    result?: string;
  };
}

export interface AgUIStateSnapshot extends AgUIEvent {
  type: 'STATE_SNAPSHOT';
  data: {
    stateType: string;
    state: Record<string, unknown>;
  };
}

export interface AgUIStateDelta extends AgUIEvent {
  type: 'STATE_DELTA';
  data: {
    stateType: string;
    delta: Record<string, unknown>;
  };
}

export interface AgUICustomEvent extends AgUIEvent {
  type: 'CUSTOM';
  data: {
    customType: ZenAICustomType;
    payload: Record<string, unknown>;
  };
}

/** Custom event types for ZenAI cognitive features */
export type ZenAICustomType = 'hypothesis_card' | 'approval_request' | 'cognitive_insight' | 'predicted_intent' | 'review_prompt' | 'pipeline_status';

export type AnyAgUIEvent =
  | AgUIRunStarted
  | AgUIRunFinished
  | AgUIRunError
  | AgUITextMessageStart
  | AgUITextMessageContent
  | AgUITextMessageEnd
  | AgUIToolCallStart
  | AgUIToolCallEnd
  | AgUIStateSnapshot
  | AgUIStateDelta
  | AgUICustomEvent;

/**
 * Serialize an AG-UI event into SSE format.
 * Uses the 'agui' event name so clients can distinguish from legacy events.
 */
export function serializeAgUIEvent(event: AnyAgUIEvent): string {
  return `event: agui\ndata: ${JSON.stringify(event)}\n\n`;
}
