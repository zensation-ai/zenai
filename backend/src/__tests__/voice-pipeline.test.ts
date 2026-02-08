/**
 * Tests for Voice Pipeline Service
 *
 * Tests the voice pipeline orchestration:
 * - Session management
 * - Pipeline turn processing (STT → Claude → TTS)
 * - Interrupt handling
 * - Sentence chunking
 *
 * Phase 33 Sprint 4 - Feature 9
 */

import { Readable } from 'stream';

// Mock dependencies BEFORE imports
jest.mock('../services/whisper', () => ({
  transcribeAudio: jest.fn().mockResolvedValue({
    text: 'Dies ist ein Test.',
    language: 'de',
    duration: 150,
  }),
}));

jest.mock('../services/claude/streaming', () => ({
  streamAndCollect: jest.fn().mockResolvedValue({
    content: 'Das ist eine Testantwort. Sie enthält zwei Sätze.',
    thinking: '',
    toolCalls: [],
    usage: { inputTokens: 100, outputTokens: 50 },
    stopReason: 'end_turn',
  }),
}));

jest.mock('../services/tts', () => {
  const actual = jest.requireActual('../services/tts');
  return {
    ...actual,
    isTTSAvailable: jest.fn().mockReturnValue(true),
    synthesizeSpeech: jest.fn().mockResolvedValue({
      audioBuffer: Buffer.from('fake-audio'),
      format: 'opus',
      durationMs: 100,
      voice: 'nova',
      textLength: 20,
    }),
    streamSpeech: jest.fn().mockResolvedValue(
      Readable.from(Buffer.from('fake-audio-stream'))
    ),
  };
});

jest.mock('../utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import {
  createPipelineSession,
  processVoiceTurn,
  interruptPipeline,
  cleanupSession,
  type ServerMessage,
} from '../services/voice-pipeline';
import { transcribeAudio } from '../services/whisper';
import { streamAndCollect } from '../services/claude/streaming';
import { synthesizeSpeech } from '../services/tts';

const mockTranscribeAudio = transcribeAudio as jest.MockedFunction<typeof transcribeAudio>;
const mockStreamAndCollect = streamAndCollect as jest.MockedFunction<typeof streamAndCollect>;
const mockSynthesizeSpeech = synthesizeSpeech as jest.MockedFunction<typeof synthesizeSpeech>;

describe('Voice Pipeline Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTranscribeAudio.mockResolvedValue({
      text: 'Dies ist ein Test.',
      language: 'de',
      duration: 150,
    });
    mockStreamAndCollect.mockResolvedValue({
      content: 'Das ist eine Testantwort. Sie enthält zwei Sätze.',
      thinking: '',
      toolCalls: [],
      usage: { inputTokens: 100, outputTokens: 50 },
      stopReason: 'end_turn',
    });
    mockSynthesizeSpeech.mockResolvedValue({
      audioBuffer: Buffer.from('fake-audio'),
      format: 'opus',
      durationMs: 100,
      voice: 'nova',
      textLength: 20,
    });
  });

  // ============================================================
  // Session Management
  // ============================================================

  describe('createPipelineSession', () => {
    it('should create a session with default values', () => {
      const session = createPipelineSession();
      expect(session.id).toBeDefined();
      expect(session.voice).toBe('nova');
      expect(session.speed).toBe(1.0);
      expect(session.isProcessing).toBe(false);
      expect(session.conversationHistory).toEqual([]);
      expect(session.metrics.totalTurns).toBe(0);
    });

    it('should create a session with custom options', () => {
      const session = createPipelineSession({
        voice: 'echo',
        speed: 1.5,
        chatSessionId: 'test-session',
      });
      expect(session.voice).toBe('echo');
      expect(session.speed).toBe(1.5);
      expect(session.chatSessionId).toBe('test-session');
    });
  });

  // ============================================================
  // Pipeline Turn Processing
  // ============================================================

  describe('processVoiceTurn', () => {
    it('should yield messages in correct order', async () => {
      const session = createPipelineSession();
      const audioBuffer = Buffer.alloc(1000, 0);
      const messages: ServerMessage[] = [];

      for await (const msg of processVoiceTurn(session, audioBuffer, 'audio/webm')) {
        messages.push(msg);
      }

      // Check message order
      const types = messages.map((m) => m.type);
      expect(types[0]).toBe('transcription');
      expect(types[1]).toBe('claude_start');
      expect(types[2]).toBe('claude_text');
      // audio_chunk(s) + audio_end + turn_complete
      expect(types).toContain('audio_end');
      expect(types[types.length - 1]).toBe('turn_complete');
    });

    it('should include transcription text', async () => {
      const session = createPipelineSession();
      const audioBuffer = Buffer.alloc(1000, 0);
      const messages: ServerMessage[] = [];

      for await (const msg of processVoiceTurn(session, audioBuffer, 'audio/webm')) {
        messages.push(msg);
      }

      const transcriptionMsg = messages.find((m) => m.type === 'transcription');
      expect(transcriptionMsg).toBeDefined();
      if (transcriptionMsg?.type === 'transcription') {
        expect(transcriptionMsg.text).toBe('Dies ist ein Test.');
        expect(transcriptionMsg.durationMs).toBeGreaterThanOrEqual(0);
      }
    });

    it('should include Claude response text', async () => {
      const session = createPipelineSession();
      const audioBuffer = Buffer.alloc(1000, 0);
      const messages: ServerMessage[] = [];

      for await (const msg of processVoiceTurn(session, audioBuffer, 'audio/webm')) {
        messages.push(msg);
      }

      const claudeMsg = messages.find((m) => m.type === 'claude_text');
      expect(claudeMsg).toBeDefined();
      if (claudeMsg?.type === 'claude_text') {
        expect(claudeMsg.text).toContain('Testantwort');
      }
    });

    it('should include turn metrics', async () => {
      const session = createPipelineSession();
      const audioBuffer = Buffer.alloc(1000, 0);
      const messages: ServerMessage[] = [];

      for await (const msg of processVoiceTurn(session, audioBuffer, 'audio/webm')) {
        messages.push(msg);
      }

      const turnMsg = messages.find((m) => m.type === 'turn_complete');
      expect(turnMsg).toBeDefined();
      if (turnMsg?.type === 'turn_complete') {
        expect(turnMsg.metrics.transcriptionMs).toBeGreaterThanOrEqual(0);
        expect(turnMsg.metrics.claudeMs).toBeGreaterThanOrEqual(0);
        expect(turnMsg.metrics.totalMs).toBeGreaterThanOrEqual(0);
      }
    });

    it('should update conversation history', async () => {
      const session = createPipelineSession();
      const audioBuffer = Buffer.alloc(1000, 0);

      for await (const _msg of processVoiceTurn(session, audioBuffer, 'audio/webm')) {
        // consume
      }

      expect(session.conversationHistory).toHaveLength(2);
      expect(session.conversationHistory[0].role).toBe('user');
      expect(session.conversationHistory[0].content).toBe('Dies ist ein Test.');
      expect(session.conversationHistory[1].role).toBe('assistant');
    });

    it('should update session metrics', async () => {
      const session = createPipelineSession();
      const audioBuffer = Buffer.alloc(1000, 0);

      for await (const _msg of processVoiceTurn(session, audioBuffer, 'audio/webm')) {
        // consume
      }

      expect(session.metrics.totalTurns).toBe(1);
      expect(session.metrics.transcriptionTimes).toHaveLength(1);
      expect(session.metrics.claudeTimes).toHaveLength(1);
    });

    it('should yield error when STT fails', async () => {
      mockTranscribeAudio.mockRejectedValue(new Error('Whisper unavailable'));

      const session = createPipelineSession();
      const audioBuffer = Buffer.alloc(1000, 0);
      const messages: ServerMessage[] = [];

      for await (const msg of processVoiceTurn(session, audioBuffer, 'audio/webm')) {
        messages.push(msg);
      }

      expect(messages).toHaveLength(1);
      expect(messages[0].type).toBe('error');
      if (messages[0].type === 'error') {
        expect(messages[0].code).toBe('STT_ERROR');
      }
    });

    it('should yield error when STT returns empty text', async () => {
      mockTranscribeAudio.mockResolvedValue({
        text: '',
        language: 'de',
        duration: 100,
      });

      const session = createPipelineSession();
      const audioBuffer = Buffer.alloc(1000, 0);
      const messages: ServerMessage[] = [];

      for await (const msg of processVoiceTurn(session, audioBuffer, 'audio/webm')) {
        messages.push(msg);
      }

      const errorMsg = messages.find((m) => m.type === 'error');
      expect(errorMsg).toBeDefined();
      if (errorMsg?.type === 'error') {
        expect(errorMsg.code).toBe('STT_EMPTY');
      }
    });

    it('should yield error when Claude fails', async () => {
      mockStreamAndCollect.mockRejectedValue(new Error('Claude unavailable'));

      const session = createPipelineSession();
      const audioBuffer = Buffer.alloc(1000, 0);
      const messages: ServerMessage[] = [];

      for await (const msg of processVoiceTurn(session, audioBuffer, 'audio/webm')) {
        messages.push(msg);
      }

      const errorMsg = messages.find((m) => m.type === 'error');
      expect(errorMsg).toBeDefined();
      if (errorMsg?.type === 'error') {
        expect(errorMsg.code).toBe('CLAUDE_ERROR');
      }
    });

    it('should still complete turn when TTS fails (text fallback)', async () => {
      mockSynthesizeSpeech.mockRejectedValue(new Error('TTS unavailable'));

      const session = createPipelineSession();
      const audioBuffer = Buffer.alloc(1000, 0);
      const messages: ServerMessage[] = [];

      for await (const msg of processVoiceTurn(session, audioBuffer, 'audio/webm')) {
        messages.push(msg);
      }

      // Should still have claude_text and audio_end (fallback)
      const types = messages.map((m) => m.type);
      expect(types).toContain('claude_text');
      expect(types).toContain('audio_end');
      expect(types).toContain('turn_complete');
    });

    it('should call Whisper with audio buffer', async () => {
      const session = createPipelineSession();
      const audioBuffer = Buffer.alloc(1000, 0);

      for await (const _msg of processVoiceTurn(session, audioBuffer, 'audio/webm')) {
        // consume
      }

      expect(mockTranscribeAudio).toHaveBeenCalledWith(audioBuffer, 'voice-pipeline.webm');
    });

    it('should call Claude with conversation history', async () => {
      const session = createPipelineSession();
      session.conversationHistory.push({ role: 'user', content: 'Vorherige Nachricht' });

      const audioBuffer = Buffer.alloc(1000, 0);

      for await (const _msg of processVoiceTurn(session, audioBuffer, 'audio/webm')) {
        // consume
      }

      expect(mockStreamAndCollect).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ role: 'user', content: 'Vorherige Nachricht' }),
          expect.objectContaining({ role: 'user', content: 'Dies ist ein Test.' }),
        ]),
        expect.objectContaining({
          maxTokens: 1024,
        })
      );
    });
  });

  // ============================================================
  // Interrupt Handling
  // ============================================================

  describe('interruptPipeline', () => {
    it('should clear processing state', () => {
      const session = createPipelineSession();
      session.isProcessing = true;
      session.abortController = new AbortController();

      interruptPipeline(session);

      expect(session.isProcessing).toBe(false);
      expect(session.abortController).toBeNull();
    });
  });

  // ============================================================
  // Cleanup
  // ============================================================

  describe('cleanupSession', () => {
    it('should clear conversation history', () => {
      const session = createPipelineSession();
      session.conversationHistory.push(
        { role: 'user', content: 'Test' },
        { role: 'assistant', content: 'Response' }
      );

      cleanupSession(session);

      expect(session.conversationHistory).toHaveLength(0);
    });

    it('should abort in-flight requests', () => {
      const session = createPipelineSession();
      const abortController = new AbortController();
      session.abortController = abortController;

      cleanupSession(session);

      expect(abortController.signal.aborted).toBe(true);
      expect(session.abortController).toBeNull();
    });
  });
});
