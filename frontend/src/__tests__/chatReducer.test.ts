/**
 * chatReducer Tests
 *
 * Unit tests for the centralized chat state machine.
 */

import { describe, it, expect } from 'vitest';
import { chatReducer, initialChatState, type ChatState, type ChatAction, type ToolCall } from '../components/GeneralChat/chatReducer';
import type { ChatMessage } from '../components/GeneralChat/types';

const makeMsg = (overrides: Partial<ChatMessage> = {}): ChatMessage => ({
  id: `msg-${Math.random().toString(36).slice(2, 6)}`,
  sessionId: 'session-1',
  role: 'user',
  content: 'Hello',
  createdAt: '2026-01-01T00:00:00Z',
  ...overrides,
});

describe('chatReducer', () => {
  it('should return initial state for unknown action', () => {
    const result = chatReducer(initialChatState, { type: 'UNKNOWN_ACTION' } as unknown as ChatAction);
    expect(result).toEqual(initialChatState);
  });

  describe('SET_MESSAGES', () => {
    it('should replace messages array', () => {
      const messages = [makeMsg(), makeMsg({ role: 'assistant', content: 'Hi' })];
      const result = chatReducer(initialChatState, { type: 'SET_MESSAGES', messages });
      expect(result.messages).toHaveLength(2);
      expect(result.messages[1].role).toBe('assistant');
    });
  });

  describe('ADD_MESSAGE', () => {
    it('should append a message', () => {
      const state: ChatState = { ...initialChatState, messages: [makeMsg()] };
      const newMsg = makeMsg({ role: 'assistant', content: 'Response' });
      const result = chatReducer(state, { type: 'ADD_MESSAGE', message: newMsg });
      expect(result.messages).toHaveLength(2);
      expect(result.messages[1].content).toBe('Response');
    });
  });

  describe('SET_SESSION_ID', () => {
    it('should set session ID', () => {
      const result = chatReducer(initialChatState, { type: 'SET_SESSION_ID', sessionId: 'abc' });
      expect(result.sessionId).toBe('abc');
    });

    it('should clear session ID', () => {
      const state: ChatState = { ...initialChatState, sessionId: 'old' };
      const result = chatReducer(state, { type: 'SET_SESSION_ID', sessionId: null });
      expect(result.sessionId).toBeNull();
    });
  });

  describe('SET_INPUT_VALUE', () => {
    it('should update input value', () => {
      const result = chatReducer(initialChatState, { type: 'SET_INPUT_VALUE', value: 'test input' });
      expect(result.inputValue).toBe('test input');
    });
  });

  describe('SET_SENDING', () => {
    it('should toggle sending state', () => {
      const result = chatReducer(initialChatState, { type: 'SET_SENDING', sending: true });
      expect(result.sending).toBe(true);
    });
  });

  describe('SET_STREAMING', () => {
    it('should toggle streaming state', () => {
      const result = chatReducer(initialChatState, { type: 'SET_STREAMING', isStreaming: true });
      expect(result.isStreaming).toBe(true);
    });
  });

  describe('SET_STREAMING_CONTENT', () => {
    it('should set streaming content', () => {
      const result = chatReducer(initialChatState, { type: 'SET_STREAMING_CONTENT', content: 'partial...' });
      expect(result.streamingContent).toBe('partial...');
    });
  });

  describe('SET_THINKING_CONTENT / APPEND_THINKING_CONTENT', () => {
    it('should set thinking content', () => {
      const result = chatReducer(initialChatState, { type: 'SET_THINKING_CONTENT', content: 'I think...' });
      expect(result.thinkingContent).toBe('I think...');
    });

    it('should append thinking delta', () => {
      const state: ChatState = { ...initialChatState, thinkingContent: 'First ' };
      const result = chatReducer(state, { type: 'APPEND_THINKING_CONTENT', delta: 'part' });
      expect(result.thinkingContent).toBe('First part');
    });
  });

  describe('SET_LOADING', () => {
    it('should toggle loading', () => {
      const result = chatReducer(initialChatState, { type: 'SET_LOADING', loading: true });
      expect(result.loading).toBe(true);
    });
  });

  describe('SET_INLINE_ERROR', () => {
    it('should set error message', () => {
      const result = chatReducer(initialChatState, { type: 'SET_INLINE_ERROR', error: 'Something failed' });
      expect(result.inlineError).toBe('Something failed');
    });

    it('should clear error', () => {
      const state: ChatState = { ...initialChatState, inlineError: 'old error' };
      const result = chatReducer(state, { type: 'SET_INLINE_ERROR', error: null });
      expect(result.inlineError).toBeNull();
    });
  });

  describe('SET_TOOL_ACTIVITY', () => {
    it('should set active tool name', () => {
      const result = chatReducer(initialChatState, {
        type: 'SET_TOOL_ACTIVITY',
        activeToolName: 'web_search',
      });
      expect(result.activeToolName).toBe('web_search');
      expect(result.activeTools).toContain('web_search');
    });

    it('should add completed tool', () => {
      const tool: ToolCall = { name: 'web_search', duration_ms: 500, status: 'success' };
      const result = chatReducer(initialChatState, {
        type: 'SET_TOOL_ACTIVITY',
        activeToolName: null,
        completedTool: tool,
      });
      expect(result.completedTools).toHaveLength(1);
      expect(result.completedTools[0].name).toBe('web_search');
      expect(result.activeToolName).toBeNull();
    });

    it('should cap completed tools at 50', () => {
      const tools: ToolCall[] = Array.from({ length: 55 }, (_, i) => ({
        name: `tool_${i}`,
        duration_ms: 100,
        status: 'success' as const,
      }));
      let state = initialChatState;
      for (const t of tools) {
        state = chatReducer(state, {
          type: 'SET_TOOL_ACTIVITY',
          activeToolName: null,
          completedTool: t,
        });
      }
      expect(state.completedTools.length).toBeLessThanOrEqual(50);
    });
  });

  describe('RESET_TOOL_STATE', () => {
    it('should clear all tool state', () => {
      const state: ChatState = {
        ...initialChatState,
        activeToolName: 'web_search',
        activeTools: ['web_search'],
        completedTools: [{ name: 'recall', duration_ms: 200, status: 'success' }],
      };
      const result = chatReducer(state, { type: 'RESET_TOOL_STATE' });
      expect(result.activeToolName).toBeNull();
      expect(result.activeTools).toHaveLength(0);
      expect(result.completedTools).toHaveLength(0);
    });
  });

  describe('EDIT_MESSAGE', () => {
    it('should mark edited message and followers as inactive, add new version', () => {
      const msg1 = makeMsg({ id: 'msg-1', content: 'Original question' });
      const msg2 = makeMsg({ id: 'msg-2', role: 'assistant', content: 'Answer' });
      const msg3 = makeMsg({ id: 'msg-3', content: 'Follow-up' });

      const state: ChatState = { ...initialChatState, messages: [msg1, msg2, msg3] };
      const result = chatReducer(state, {
        type: 'EDIT_MESSAGE',
        messageId: 'msg-1',
        newContent: 'Edited question',
      });

      // Should only have the edited message (everything from msg-1 onward deactivated and replaced)
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].content).toBe('Edited question');
      expect(result.messages[0].id).toMatch(/^edited-/);
    });

    it('should return unchanged state when message not found', () => {
      const state: ChatState = { ...initialChatState, messages: [makeMsg()] };
      const result = chatReducer(state, {
        type: 'EDIT_MESSAGE',
        messageId: 'nonexistent',
        newContent: 'test',
      });
      expect(result.messages).toEqual(state.messages);
    });
  });

  describe('REGENERATE_MESSAGE', () => {
    it('should mark target assistant message as inactive', () => {
      const msg1 = makeMsg({ id: 'msg-user', content: 'Question' });
      const msg2 = makeMsg({ id: 'msg-assist', role: 'assistant', content: 'Answer' });

      const state: ChatState = { ...initialChatState, messages: [msg1, msg2] };
      const result = chatReducer(state, {
        type: 'REGENERATE_MESSAGE',
        messageId: 'msg-assist',
      });

      expect(result.messages).toHaveLength(2);
      const targetMsg = result.messages.find(m => m.id === 'msg-assist');
      expect(targetMsg).toBeDefined();
      expect((targetMsg as ChatMessage & { isActive?: boolean }).isActive).toBe(false);
    });
  });

  describe('SET_BRANCH', () => {
    it('should replace all messages with branch', () => {
      const state: ChatState = { ...initialChatState, messages: [makeMsg(), makeMsg()] };
      const branchMessages = [makeMsg({ content: 'Branch msg' })];
      const result = chatReducer(state, { type: 'SET_BRANCH', messages: branchMessages });
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].content).toBe('Branch msg');
    });
  });

  describe('REPLACE_TEMP_MESSAGE', () => {
    it('should replace temp message with real one + assistant', () => {
      const tempMsg = makeMsg({ id: 'temp-user-123', content: 'Hello' });
      const state: ChatState = { ...initialChatState, messages: [tempMsg] };

      const realMsg = makeMsg({ id: 'real-user-1', content: 'Hello' });
      const assistMsg = makeMsg({ id: 'assist-1', role: 'assistant', content: 'Hi!' });

      const result = chatReducer(state, {
        type: 'REPLACE_TEMP_MESSAGE',
        tempId: 'temp-user-123',
        realMessage: realMsg,
        assistantMessage: assistMsg,
      });

      expect(result.messages).toHaveLength(2);
      expect(result.messages[0].id).toBe('real-user-1');
      expect(result.messages[1].id).toBe('assist-1');
    });

    it('should replace temp message without assistant', () => {
      const tempMsg = makeMsg({ id: 'temp-user-456', content: 'Test' });
      const state: ChatState = { ...initialChatState, messages: [tempMsg] };

      const realMsg = makeMsg({ id: 'real-user-2', content: 'Test' });

      const result = chatReducer(state, {
        type: 'REPLACE_TEMP_MESSAGE',
        tempId: 'temp-user-456',
        realMessage: realMsg,
      });

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].id).toBe('real-user-2');
    });
  });

  describe('REMOVE_TEMP_MESSAGES', () => {
    it('should remove all temp messages', () => {
      const msg1 = makeMsg({ id: 'temp-user-1' });
      const msg2 = makeMsg({ id: 'real-user-1' });
      const msg3 = makeMsg({ id: 'temp-user-2' });

      const state: ChatState = { ...initialChatState, messages: [msg1, msg2, msg3] };
      const result = chatReducer(state, { type: 'REMOVE_TEMP_MESSAGES' });
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].id).toBe('real-user-1');
    });
  });

  describe('RESET_STREAMING', () => {
    it('should reset all streaming-related state', () => {
      const state: ChatState = {
        ...initialChatState,
        isStreaming: true,
        streamingContent: 'partial',
        thinkingContent: 'thinking...',
        activeToolName: 'tool1',
        activeTools: ['tool1'],
      };
      const result = chatReducer(state, { type: 'RESET_STREAMING' });
      expect(result.isStreaming).toBe(false);
      expect(result.streamingContent).toBe('');
      expect(result.thinkingContent).toBe('');
      expect(result.activeToolName).toBeNull();
      expect(result.activeTools).toHaveLength(0);
    });
  });
});
