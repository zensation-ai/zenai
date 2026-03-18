/**
 * Chat State Machine (chatReducer)
 *
 * Centralized state management for the GeneralChat component.
 * Manages 6 phases: idle, sending, streaming, error, editing, regenerating.
 *
 * @module components/GeneralChat/chatReducer
 */

import type { ChatMessage } from './types';

// ============================================
// Types
// ============================================

export interface ToolCall {
  name: string;
  duration_ms: number;
  status: 'success' | 'error';
}

export type ChatPhase = 'idle' | 'loadingSession' | 'ready' | 'streaming' | 'error';

export interface ChatState {
  /** Current conversation messages */
  messages: ChatMessage[];
  /** Active session ID */
  sessionId: string | null;
  /** Chat input value */
  inputValue: string;
  /** Whether a message is being sent */
  sending: boolean;
  /** Whether the AI is actively streaming */
  isStreaming: boolean;
  /** Accumulated streaming content */
  streamingContent: string;
  /** Accumulated thinking content */
  thinkingContent: string;
  /** Whether session is loading */
  loading: boolean;
  /** Inline error message (also used as errorMessage for phase-based compat) */
  inlineError: string | null;
  /** Name of the currently executing tool */
  activeToolName: string | null;
  /** Completed tool calls with metadata */
  completedTools: ToolCall[];
  /** Active tool names (tools currently running) */
  activeTools: string[];
  /** Selected images for vision upload */
  selectedImages: File[];
  /** Phase for backward compatibility with GeneralChat lifecycle */
  phase: ChatPhase;
  /** Skip next session load (set after SESSION_CREATED) */
  skipNextLoad: boolean;
  /** Error message alias (same as inlineError, for phase-based compat) */
  errorMessage: string | null;
}

export type ChatAction =
  | { type: 'SET_MESSAGES'; messages: ChatMessage[] }
  | { type: 'ADD_MESSAGE'; message: ChatMessage }
  | { type: 'SET_SESSION_ID'; sessionId: string | null }
  | { type: 'SET_INPUT_VALUE'; value: string }
  | { type: 'SET_SENDING'; sending: boolean }
  | { type: 'SET_STREAMING'; isStreaming: boolean }
  | { type: 'SET_STREAMING_CONTENT'; content: string }
  | { type: 'SET_THINKING_CONTENT'; content: string }
  | { type: 'APPEND_THINKING_CONTENT'; delta: string }
  | { type: 'SET_LOADING'; loading: boolean }
  | { type: 'SET_INLINE_ERROR'; error: string | null }
  | { type: 'SET_SELECTED_IMAGES'; images: File[] }
  | { type: 'SET_TOOL_ACTIVITY'; activeToolName: string | null; completedTool?: ToolCall }
  | { type: 'RESET_TOOL_STATE' }
  | { type: 'EDIT_MESSAGE'; messageId: string; newContent: string }
  | { type: 'REGENERATE_MESSAGE'; messageId: string }
  | { type: 'SET_BRANCH'; messages: ChatMessage[] }
  | { type: 'REPLACE_TEMP_MESSAGE'; tempId: string; realMessage: ChatMessage; assistantMessage?: ChatMessage }
  | { type: 'REMOVE_TEMP_MESSAGES' }
  | { type: 'RESET_STREAMING' }
  // Phase-based lifecycle actions (backward compat with GeneralChat component)
  | { type: 'LOAD_SESSION' }
  | { type: 'SESSION_LOADED'; sessionId: string; messages: ChatMessage[] }
  | { type: 'SESSION_EMPTY' }
  | { type: 'SESSION_CREATED'; sessionId: string }
  | { type: 'START_STREAM'; tempUserMessage: ChatMessage }
  | { type: 'STREAM_COMPLETE'; userMessage: ChatMessage; assistantMessage: ChatMessage | null }
  | { type: 'STREAM_ABORTED' }
  | { type: 'ERROR'; message: string }
  | { type: 'CLEAR_ERROR' }
  | { type: 'RESET' }
  | { type: 'SKIP_NEXT_LOAD' }
  | { type: 'ADD_OFFLINE_REPLY'; reply: ChatMessage };

// ============================================
// Initial State
// ============================================

export const initialChatState: ChatState = {
  messages: [],
  sessionId: null,
  inputValue: '',
  sending: false,
  isStreaming: false,
  streamingContent: '',
  thinkingContent: '',
  loading: false,
  inlineError: null,
  activeToolName: null,
  completedTools: [],
  activeTools: [],
  selectedImages: [],
  phase: 'idle',
  skipNextLoad: false,
  errorMessage: null,
};

/** Backward-compatible alias used by GeneralChat component */
export const INITIAL_CHAT_STATE = initialChatState;

// ============================================
// Reducer
// ============================================

const MAX_COMPLETED_TOOLS = 50;

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'SET_MESSAGES':
      return { ...state, messages: action.messages };

    case 'ADD_MESSAGE':
      return { ...state, messages: [...state.messages, action.message] };

    case 'SET_SESSION_ID':
      return { ...state, sessionId: action.sessionId };

    case 'SET_INPUT_VALUE':
      return { ...state, inputValue: action.value };

    case 'SET_SENDING':
      return { ...state, sending: action.sending };

    case 'SET_STREAMING':
      return { ...state, isStreaming: action.isStreaming };

    case 'SET_STREAMING_CONTENT':
      return { ...state, streamingContent: action.content };

    case 'SET_THINKING_CONTENT':
      return { ...state, thinkingContent: action.content };

    case 'APPEND_THINKING_CONTENT':
      return { ...state, thinkingContent: state.thinkingContent + action.delta };

    case 'SET_LOADING':
      return { ...state, loading: action.loading };

    case 'SET_INLINE_ERROR':
      return { ...state, inlineError: action.error };

    case 'SET_SELECTED_IMAGES':
      return { ...state, selectedImages: action.images };

    case 'SET_TOOL_ACTIVITY': {
      const newActiveTools = action.activeToolName
        ? [...state.activeTools.filter(t => t !== action.activeToolName), action.activeToolName]
        : state.activeTools.filter(t => t !== state.activeToolName);

      const newCompletedTools = action.completedTool
        ? [...state.completedTools, action.completedTool].slice(-MAX_COMPLETED_TOOLS)
        : state.completedTools;

      return {
        ...state,
        activeToolName: action.activeToolName,
        activeTools: newActiveTools,
        completedTools: newCompletedTools,
      };
    }

    case 'RESET_TOOL_STATE':
      return {
        ...state,
        activeToolName: null,
        activeTools: [],
        completedTools: [],
      };

    case 'EDIT_MESSAGE': {
      // Mark the edited message and all following as inactive
      const editIndex = state.messages.findIndex(m => m.id === action.messageId);
      if (editIndex === -1) return state;

      const updatedMessages = state.messages.map((m, i) => {
        if (i >= editIndex) {
          return { ...m, isActive: false };
        }
        return m;
      });

      // Add the edited version
      const editedMessage: ChatMessage = {
        ...state.messages[editIndex],
        id: `edited-${Date.now()}`,
        content: action.newContent,
        createdAt: new Date().toISOString(),
      };

      return {
        ...state,
        messages: [...updatedMessages.filter((_, i) => i < editIndex), editedMessage],
      };
    }

    case 'REGENERATE_MESSAGE': {
      // Mark target assistant message as inactive
      return {
        ...state,
        messages: state.messages.map(m =>
          m.id === action.messageId ? { ...m, isActive: false } : m
        ),
      };
    }

    case 'SET_BRANCH':
      return { ...state, messages: action.messages };

    case 'REPLACE_TEMP_MESSAGE': {
      const filtered = state.messages.filter(m => m.id !== action.tempId);
      const newMessages = action.assistantMessage
        ? [...filtered, action.realMessage, action.assistantMessage]
        : [...filtered, action.realMessage];
      return { ...state, messages: newMessages };
    }

    case 'REMOVE_TEMP_MESSAGES':
      return {
        ...state,
        messages: state.messages.filter(m => !m.id.startsWith('temp-')),
      };

    case 'RESET_STREAMING':
      return {
        ...state,
        isStreaming: false,
        streamingContent: '',
        thinkingContent: '',
        activeToolName: null,
        activeTools: [],
      };

    // ============================================
    // Phase-based lifecycle actions
    // (backward compat with GeneralChat component)
    // ============================================

    case 'LOAD_SESSION': {
      if (state.skipNextLoad) {
        return { ...state, skipNextLoad: false };
      }
      return { ...state, phase: 'loadingSession' };
    }

    case 'SESSION_LOADED':
      return {
        ...state,
        phase: 'ready',
        sessionId: action.sessionId,
        messages: action.messages,
      };

    case 'SESSION_EMPTY':
      return {
        ...state,
        phase: 'ready',
        sessionId: null,
      };

    case 'SESSION_CREATED':
      return {
        ...state,
        phase: 'ready',
        sessionId: action.sessionId,
        messages: [],
        skipNextLoad: true,
      };

    case 'START_STREAM':
      return {
        ...state,
        phase: 'streaming',
        messages: [...state.messages, action.tempUserMessage],
      };

    case 'STREAM_COMPLETE': {
      const withoutTemp = state.messages.filter(m => !m.id.startsWith('temp-'));
      const msgs = action.assistantMessage
        ? [...withoutTemp, action.userMessage, action.assistantMessage]
        : [...withoutTemp, action.userMessage];
      return {
        ...state,
        phase: 'ready',
        messages: msgs,
      };
    }

    case 'STREAM_ABORTED':
      return {
        ...state,
        phase: 'ready',
        messages: state.messages.filter(m => !m.id.startsWith('temp-')),
      };

    case 'ERROR':
      return {
        ...state,
        phase: 'error',
        errorMessage: action.message,
        inlineError: action.message,
        messages: state.messages.filter(m => !m.id.startsWith('temp-')),
      };

    case 'CLEAR_ERROR':
      return {
        ...state,
        phase: state.sessionId ? 'ready' : 'idle',
        errorMessage: null,
        inlineError: null,
      };

    case 'RESET':
      return {
        ...initialChatState,
        phase: 'ready',
      };

    case 'SKIP_NEXT_LOAD':
      return { ...state, skipNextLoad: true };

    case 'ADD_OFFLINE_REPLY':
      return {
        ...state,
        phase: 'ready',
        messages: [...state.messages, action.reply],
      };

    default:
      return state;
  }
}
