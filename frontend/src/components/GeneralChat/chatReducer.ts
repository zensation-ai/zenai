/**
 * Chat State Machine (useReducer)
 *
 * Replaces ref-based state guards (skipNextSessionLoadRef, sessionKey hack)
 * with an explicit state machine for the chat lifecycle.
 *
 * States:
 *   idle           — No session loaded, fresh start
 *   loadingSession — Fetching session data from server
 *   ready          — Session loaded (or empty), ready for input
 *   streaming      — SSE stream in progress
 *   streamComplete — Stream finished, about to transition to ready
 *   error          — An error occurred (recoverable)
 *
 * Extracted as a pure function for independent testing.
 *
 * @module components/GeneralChat/chatReducer
 */

import type { ChatMessage } from './types';

// ============================================
// State
// ============================================

export type ChatPhase =
  | 'idle'
  | 'loadingSession'
  | 'ready'
  | 'streaming'
  | 'streamComplete'
  | 'error';

export interface ChatState {
  phase: ChatPhase;
  sessionId: string | null;
  messages: ChatMessage[];
  /** True when the session change was initiated internally (e.g. createNewSession) */
  skipNextLoad: boolean;
  /** Error message for display */
  errorMessage: string | null;
}

export const INITIAL_CHAT_STATE: ChatState = {
  phase: 'idle',
  sessionId: null,
  messages: [],
  skipNextLoad: false,
  errorMessage: null,
};

// ============================================
// Actions
// ============================================

export type ChatAction =
  | { type: 'LOAD_SESSION' }
  | { type: 'SESSION_LOADED'; sessionId: string; messages: ChatMessage[] }
  | { type: 'SESSION_EMPTY' }
  | { type: 'SESSION_CREATED'; sessionId: string }
  | { type: 'START_STREAM'; tempUserMessage: ChatMessage }
  | { type: 'STREAM_COMPLETE'; userMessage: ChatMessage; assistantMessage: ChatMessage | null }
  | { type: 'STREAM_ABORTED' }
  | { type: 'ADD_OFFLINE_REPLY'; reply: ChatMessage }
  | { type: 'ERROR'; message: string }
  | { type: 'CLEAR_ERROR' }
  | { type: 'RESET' }
  | { type: 'SKIP_NEXT_LOAD' }
  | { type: 'REMOVE_TEMP_MESSAGES'; restoreInput?: string }
  | { type: 'REPLACE_TEMP_WITH_REAL'; tempId: string; userMessage: ChatMessage; assistantMessage: ChatMessage }
  | { type: 'SET_MESSAGES'; messages: ChatMessage[] };

// ============================================
// Reducer
// ============================================

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'LOAD_SESSION':
      // If skipNextLoad is set, consume it and stay in current phase
      if (state.skipNextLoad) {
        return { ...state, skipNextLoad: false };
      }
      return {
        ...state,
        phase: 'loadingSession',
        errorMessage: null,
      };

    case 'SESSION_LOADED':
      return {
        ...state,
        phase: 'ready',
        sessionId: action.sessionId,
        messages: action.messages,
        errorMessage: null,
      };

    case 'SESSION_EMPTY':
      return {
        ...state,
        phase: 'ready',
        errorMessage: null,
      };

    case 'SESSION_CREATED':
      return {
        ...state,
        phase: 'ready',
        sessionId: action.sessionId,
        messages: [],
        skipNextLoad: true,
        errorMessage: null,
      };

    case 'START_STREAM':
      return {
        ...state,
        phase: 'streaming',
        messages: [...state.messages, action.tempUserMessage],
        errorMessage: null,
      };

    case 'STREAM_COMPLETE': {
      // Replace temp user message with real one, append assistant
      const filtered = state.messages.filter(m => !m.id.startsWith('temp-'));
      const newMessages = assistantMessage(action)
        ? [...filtered, action.userMessage, action.assistantMessage!]
        : [...filtered, action.userMessage];
      return {
        ...state,
        phase: 'ready',
        messages: newMessages,
        errorMessage: null,
      };
    }

    case 'STREAM_ABORTED':
      return {
        ...state,
        phase: 'ready',
        messages: state.messages.filter(m => !m.id.startsWith('temp-')),
      };

    case 'ADD_OFFLINE_REPLY':
      return {
        ...state,
        phase: 'ready',
        messages: [...state.messages, action.reply],
      };

    case 'ERROR':
      return {
        ...state,
        phase: 'error',
        messages: state.messages.filter(m => !m.id.startsWith('temp-')),
        errorMessage: action.message,
      };

    case 'CLEAR_ERROR':
      return {
        ...state,
        phase: state.sessionId ? 'ready' : 'idle',
        errorMessage: null,
      };

    case 'RESET':
      return {
        ...INITIAL_CHAT_STATE,
        phase: 'ready',
      };

    case 'SKIP_NEXT_LOAD':
      return { ...state, skipNextLoad: true };

    case 'REMOVE_TEMP_MESSAGES':
      return {
        ...state,
        messages: state.messages.filter(m => !m.id.startsWith('temp-')),
      };

    case 'REPLACE_TEMP_WITH_REAL': {
      const msgs = state.messages.filter(m => m.id !== action.tempId);
      return {
        ...state,
        phase: 'ready',
        messages: [...msgs, action.userMessage, action.assistantMessage],
      };
    }

    case 'SET_MESSAGES':
      return {
        ...state,
        messages: action.messages,
      };

    default:
      return state;
  }
}

// Helper to check assistant message presence
function assistantMessage(action: { assistantMessage: ChatMessage | null }): boolean {
  return action.assistantMessage !== null;
}
