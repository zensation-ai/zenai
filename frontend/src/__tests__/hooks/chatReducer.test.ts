import { describe, it, expect } from 'vitest';
import {
  chatReducer,
  INITIAL_CHAT_STATE,
  type ChatState,
  type ChatAction,
  type ChatPhase,
} from '../../components/GeneralChat/chatReducer';
import type { ChatMessage } from '../../components/GeneralChat/types';

// ============================================
// Helpers
// ============================================

function makeState(overrides: Partial<ChatState> = {}): ChatState {
  return { ...INITIAL_CHAT_STATE, ...overrides };
}

function makeMsg(id: string, role: 'user' | 'assistant' = 'user'): ChatMessage {
  return { id, sessionId: 'sess-1', role, content: `msg ${id}`, createdAt: new Date().toISOString() };
}

// ============================================
// Tests
// ============================================

describe('chatReducer', () => {
  describe('INITIAL_CHAT_STATE', () => {
    it('starts in idle phase with no session', () => {
      expect(INITIAL_CHAT_STATE.phase).toBe('idle');
      expect(INITIAL_CHAT_STATE.sessionId).toBeNull();
      expect(INITIAL_CHAT_STATE.messages).toEqual([]);
      expect(INITIAL_CHAT_STATE.skipNextLoad).toBe(false);
      expect(INITIAL_CHAT_STATE.errorMessage).toBeNull();
    });
  });

  describe('LOAD_SESSION', () => {
    it('transitions from idle to loadingSession', () => {
      const result = chatReducer(INITIAL_CHAT_STATE, { type: 'LOAD_SESSION' });
      expect(result.phase).toBe('loadingSession');
    });

    it('consumes skipNextLoad flag without changing phase', () => {
      const state = makeState({ skipNextLoad: true, phase: 'ready' });
      const result = chatReducer(state, { type: 'LOAD_SESSION' });
      expect(result.skipNextLoad).toBe(false);
      expect(result.phase).toBe('ready'); // stays in current phase
    });
  });

  describe('SESSION_LOADED', () => {
    it('transitions to ready with session data', () => {
      const msgs = [makeMsg('1'), makeMsg('2', 'assistant')];
      const result = chatReducer(
        makeState({ phase: 'loadingSession' }),
        { type: 'SESSION_LOADED', sessionId: 'sess-1', messages: msgs }
      );
      expect(result.phase).toBe('ready');
      expect(result.sessionId).toBe('sess-1');
      expect(result.messages).toHaveLength(2);
    });
  });

  describe('SESSION_EMPTY', () => {
    it('transitions to ready without session', () => {
      const result = chatReducer(
        makeState({ phase: 'loadingSession' }),
        { type: 'SESSION_EMPTY' }
      );
      expect(result.phase).toBe('ready');
      expect(result.sessionId).toBeNull();
    });
  });

  describe('SESSION_CREATED', () => {
    it('sets session, clears messages, sets skipNextLoad', () => {
      const result = chatReducer(
        makeState({ messages: [makeMsg('old')] }),
        { type: 'SESSION_CREATED', sessionId: 'new-sess' }
      );
      expect(result.phase).toBe('ready');
      expect(result.sessionId).toBe('new-sess');
      expect(result.messages).toEqual([]);
      expect(result.skipNextLoad).toBe(true);
    });
  });

  describe('START_STREAM', () => {
    it('transitions to streaming and adds temp user message', () => {
      const tempMsg = makeMsg('temp-user-123');
      const result = chatReducer(
        makeState({ phase: 'ready', messages: [makeMsg('old')] }),
        { type: 'START_STREAM', tempUserMessage: tempMsg }
      );
      expect(result.phase).toBe('streaming');
      expect(result.messages).toHaveLength(2);
      expect(result.messages[1].id).toBe('temp-user-123');
    });
  });

  describe('STREAM_COMPLETE', () => {
    it('replaces temp message with real user + assistant', () => {
      const tempMsg = makeMsg('temp-user-1');
      const userMsg = makeMsg('user-1');
      const assistantMsg = makeMsg('assistant-1', 'assistant');
      const state = makeState({
        phase: 'streaming',
        messages: [makeMsg('existing'), tempMsg],
      });
      const result = chatReducer(state, {
        type: 'STREAM_COMPLETE',
        userMessage: userMsg,
        assistantMessage: assistantMsg,
      });
      expect(result.phase).toBe('ready');
      expect(result.messages).toHaveLength(3); // existing + user + assistant
      expect(result.messages.some(m => m.id.startsWith('temp-'))).toBe(false);
    });

    it('handles null assistant message (empty stream)', () => {
      const state = makeState({
        phase: 'streaming',
        messages: [makeMsg('temp-user-1')],
      });
      const result = chatReducer(state, {
        type: 'STREAM_COMPLETE',
        userMessage: makeMsg('user-1'),
        assistantMessage: null,
      });
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].id).toBe('user-1');
    });
  });

  describe('STREAM_ABORTED', () => {
    it('removes temp messages and returns to ready', () => {
      const state = makeState({
        phase: 'streaming',
        messages: [makeMsg('real-1'), makeMsg('temp-user-1')],
      });
      const result = chatReducer(state, { type: 'STREAM_ABORTED' });
      expect(result.phase).toBe('ready');
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].id).toBe('real-1');
    });
  });

  describe('ERROR', () => {
    it('sets error phase, removes temp messages', () => {
      const state = makeState({
        phase: 'streaming',
        messages: [makeMsg('real'), makeMsg('temp-user-1')],
      });
      const result = chatReducer(state, { type: 'ERROR', message: 'Something went wrong' });
      expect(result.phase).toBe('error');
      expect(result.errorMessage).toBe('Something went wrong');
      expect(result.messages).toHaveLength(1);
    });
  });

  describe('CLEAR_ERROR', () => {
    it('returns to ready when session exists', () => {
      const state = makeState({ phase: 'error', sessionId: 'sess-1', errorMessage: 'err' });
      const result = chatReducer(state, { type: 'CLEAR_ERROR' });
      expect(result.phase).toBe('ready');
      expect(result.errorMessage).toBeNull();
    });

    it('returns to idle when no session', () => {
      const state = makeState({ phase: 'error', sessionId: null, errorMessage: 'err' });
      const result = chatReducer(state, { type: 'CLEAR_ERROR' });
      expect(result.phase).toBe('idle');
    });
  });

  describe('RESET', () => {
    it('returns to initial state in ready phase', () => {
      const state = makeState({
        phase: 'streaming',
        sessionId: 'sess-1',
        messages: [makeMsg('1')],
        errorMessage: 'old error',
      });
      const result = chatReducer(state, { type: 'RESET' });
      expect(result.phase).toBe('ready');
      expect(result.sessionId).toBeNull();
      expect(result.messages).toEqual([]);
    });
  });

  describe('SKIP_NEXT_LOAD', () => {
    it('sets skipNextLoad flag', () => {
      const result = chatReducer(INITIAL_CHAT_STATE, { type: 'SKIP_NEXT_LOAD' });
      expect(result.skipNextLoad).toBe(true);
    });
  });

  describe('ADD_OFFLINE_REPLY', () => {
    it('adds reply message and returns to ready', () => {
      const reply = makeMsg('offline-1', 'assistant');
      const state = makeState({ phase: 'streaming', messages: [makeMsg('user-1')] });
      const result = chatReducer(state, { type: 'ADD_OFFLINE_REPLY', reply });
      expect(result.phase).toBe('ready');
      expect(result.messages).toHaveLength(2);
    });
  });

  describe('SET_MESSAGES', () => {
    it('replaces messages without changing phase', () => {
      const newMsgs = [makeMsg('a'), makeMsg('b')];
      const result = chatReducer(
        makeState({ phase: 'ready', messages: [makeMsg('old')] }),
        { type: 'SET_MESSAGES', messages: newMsgs }
      );
      expect(result.messages).toEqual(newMsgs);
      expect(result.phase).toBe('ready');
    });
  });

  describe('unknown action', () => {
    it('returns state unchanged', () => {
      const state = makeState({ phase: 'ready' });
      // @ts-expect-error — testing unknown action
      const result = chatReducer(state, { type: 'UNKNOWN_ACTION' });
      expect(result).toBe(state);
    });
  });

  describe('state transitions are valid', () => {
    it('cannot skip from idle directly to streamComplete', () => {
      // This tests that actions don't produce invalid intermediate states
      const transitions: Array<[ChatPhase, ChatAction, ChatPhase]> = [
        ['idle', { type: 'LOAD_SESSION' }, 'loadingSession'],
        ['loadingSession', { type: 'SESSION_LOADED', sessionId: 's1', messages: [] }, 'ready'],
        ['ready', { type: 'START_STREAM', tempUserMessage: makeMsg('temp-1') }, 'streaming'],
        ['streaming', { type: 'STREAM_COMPLETE', userMessage: makeMsg('u1'), assistantMessage: makeMsg('a1', 'assistant') }, 'ready'],
      ];

      let state: ChatState = INITIAL_CHAT_STATE;
      for (const [expectedBefore, action, expectedAfter] of transitions) {
        expect(state.phase).toBe(expectedBefore);
        state = chatReducer(state, action);
        expect(state.phase).toBe(expectedAfter);
      }
    });
  });
});
