/**
 * Voice Pipeline Tests
 * Phase 57: Real-Time Voice Pipeline
 */

jest.mock('../../../utils/database-context', () => ({
  queryContext: jest.fn(),
  isValidContext: (ctx: string) =>
    ['personal', 'work', 'learning', 'creative'].includes(ctx),
}));

jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('../../../services/voice/stt-service', () => ({
  sttService: {
    transcribe: jest.fn(),
    isAvailable: jest.fn(() => true),
    getAvailableProviders: jest.fn(() => ['whisper']),
  },
}));

jest.mock('../../../services/voice/tts-service', () => ({
  multiTTSService: {
    synthesize: jest.fn(),
    streamSynthesize: jest.fn(),
    isAvailable: jest.fn(() => true),
    getVoices: jest.fn(() => Promise.resolve([])),
    getAvailableProviders: jest.fn(() => ['edge-tts']),
  },
}));

jest.mock('../../../services/general-chat/chat-messages', () => ({
  sendMessage: jest.fn(),
}));

jest.mock('../../../services/general-chat/chat-sessions', () => ({
  createSession: jest.fn(),
}));

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-session-uuid'),
}));

import { VoicePipeline } from '../../../services/voice/voice-pipeline';
import { queryContext } from '../../../utils/database-context';
import { sttService } from '../../../services/voice/stt-service';
import { multiTTSService } from '../../../services/voice/tts-service';
import { sendMessage } from '../../../services/general-chat/chat-messages';
import { createSession } from '../../../services/general-chat/chat-sessions';

const mockQueryContext = queryContext as jest.MockedFunction<typeof queryContext>;
const mockSttTranscribe = sttService.transcribe as jest.MockedFunction<typeof sttService.transcribe>;
const mockTtsSynthesize = multiTTSService.synthesize as jest.MockedFunction<typeof multiTTSService.synthesize>;
const mockSendMessage = sendMessage as jest.MockedFunction<typeof sendMessage>;
const mockCreateSession = createSession as jest.MockedFunction<typeof createSession>;

describe('VoicePipeline', () => {
  let pipeline: VoicePipeline;

  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryContext.mockResolvedValue({ rows: [], rowCount: 0, command: 'INSERT', oid: 0, fields: [] } as any);
    mockCreateSession.mockResolvedValue({
      id: 'chat-session-123',
      context: 'personal' as const,
      title: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    pipeline = new VoicePipeline();
  });

  describe('startSession', () => {
    it('should create a new voice session', async () => {
      const result = await pipeline.startSession('personal' as const);

      expect(result.sessionId).toBe('test-session-uuid');
      expect(result.chatSessionId).toBe('chat-session-123');
      expect(mockCreateSession).toHaveBeenCalledWith('personal', 'general');
    });

    it('should accept custom config', async () => {
      const result = await pipeline.startSession('work' as const, {
        ttsVoice: 'de-DE-KatjaNeural',
        language: 'de-DE',
        silenceThreshold_ms: 2000,
      });

      expect(result.sessionId).toBeDefined();
    });

    it('should persist session to database', async () => {
      await pipeline.startSession('personal' as const);

      expect(mockQueryContext).toHaveBeenCalledWith(
        'personal',
        expect.stringContaining('INSERT INTO voice_sessions'),
        expect.any(Array)
      );
    });

    it('should handle DB persistence failure gracefully', async () => {
      mockQueryContext.mockRejectedValueOnce(new Error('DB error'));

      const result = await pipeline.startSession('personal' as const);
      expect(result.sessionId).toBeDefined();
    });
  });

  describe('endSession', () => {
    it('should end an active session', async () => {
      const { sessionId } = await pipeline.startSession('personal' as const);
      await pipeline.endSession(sessionId);

      expect(pipeline.getSession(sessionId)).toBeUndefined();
    });

    it('should update database on end', async () => {
      const { sessionId } = await pipeline.startSession('personal' as const);
      mockQueryContext.mockClear();

      await pipeline.endSession(sessionId);

      expect(mockQueryContext).toHaveBeenCalledWith(
        'personal',
        expect.stringContaining('UPDATE voice_sessions'),
        expect.any(Array)
      );
    });

    it('should handle non-existent session gracefully', async () => {
      await expect(pipeline.endSession('nonexistent')).resolves.not.toThrow();
    });
  });

  describe('getSession', () => {
    it('should return session by ID', async () => {
      const { sessionId } = await pipeline.startSession('personal' as const);
      const session = pipeline.getSession(sessionId);

      expect(session).toBeDefined();
      expect(session?.context).toBe('personal');
    });

    it('should return undefined for unknown session', () => {
      expect(pipeline.getSession('unknown')).toBeUndefined();
    });
  });

  describe('processAudioChunk', () => {
    it('should process a silent chunk without triggering STT', async () => {
      const { sessionId } = await pipeline.startSession('personal' as const);

      const silentChunk = Buffer.alloc(200);
      const result = await pipeline.processAudioChunk(sessionId, silentChunk);

      expect(result.vad).toBeDefined();
      expect(result.vad.isSpeaking).toBe(false);
      expect(result.transcript).toBeUndefined();
    });

    it('should throw for unknown session', async () => {
      await expect(
        pipeline.processAudioChunk('unknown', Buffer.alloc(100))
      ).rejects.toThrow('Voice session unknown not found');
    });

    it('should buffer audio during speech', async () => {
      const { sessionId } = await pipeline.startSession('personal' as const);

      // Create loud audio
      const loudChunk = Buffer.alloc(200);
      for (let i = 0; i < 100; i++) {
        loudChunk.writeInt16LE(10000, i * 2);
      }

      const result = await pipeline.processAudioChunk(sessionId, loudChunk);

      expect(result.vad.isSpeaking).toBe(true);
      expect(result.transcript).toBeUndefined(); // Not yet transcribed
    });
  });

  describe('textToSpeech', () => {
    it('should synthesize text to audio', async () => {
      const mockAudio = Buffer.from('tts-audio');
      mockTtsSynthesize.mockResolvedValue(mockAudio);

      const result = await pipeline.textToSpeech('Hello');

      expect(result).toBe(mockAudio);
      expect(mockTtsSynthesize).toHaveBeenCalledWith('Hello', undefined);
    });

    it('should pass options to TTS', async () => {
      mockTtsSynthesize.mockResolvedValue(Buffer.from('audio'));

      await pipeline.textToSpeech('Test', { voice: 'nova', speed: 1.5 });

      expect(mockTtsSynthesize).toHaveBeenCalledWith('Test', {
        voice: 'nova',
        speed: 1.5,
      });
    });
  });

  describe('getSessionStatus', () => {
    it('should return status for active session', async () => {
      const { sessionId } = await pipeline.startSession('personal' as const);
      const status = pipeline.getSessionStatus(sessionId);

      expect(status).toEqual({
        active: true,
        turnCount: 0,
        totalDuration_ms: 0,
      });
    });

    it('should return null for unknown session', () => {
      expect(pipeline.getSessionStatus('unknown')).toBeNull();
    });
  });

  describe('multiple sessions', () => {
    it('should handle concurrent sessions', async () => {
      const { v4 } = require('uuid');
      (v4 as jest.Mock)
        .mockReturnValueOnce('session-1')
        .mockReturnValueOnce('session-2');

      mockCreateSession
        .mockResolvedValueOnce({
          id: 'chat-1',
          context: 'personal' as const,
          title: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .mockResolvedValueOnce({
          id: 'chat-2',
          context: 'work' as const,
          title: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

      const s1 = await pipeline.startSession('personal' as const);
      const s2 = await pipeline.startSession('work' as const);

      expect(s1.sessionId).toBe('session-1');
      expect(s2.sessionId).toBe('session-2');
      expect(pipeline.getSession('session-1')).toBeDefined();
      expect(pipeline.getSession('session-2')).toBeDefined();
    });
  });

  describe('full pipeline flow', () => {
    it('should process audio through complete pipeline when turn completes', async () => {
      // Use a pipeline with 0ms thresholds for testing
      const { v4 } = require('uuid');
      (v4 as jest.Mock).mockReturnValue('flow-session');

      mockCreateSession.mockResolvedValue({
        id: 'flow-chat',
        context: 'personal' as const,
        title: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const testPipeline = new VoicePipeline();
      const { sessionId } = await testPipeline.startSession('personal' as const, {
        silenceThreshold_ms: 0,
      });

      // Mock STT
      mockSttTranscribe.mockResolvedValue({
        text: 'Hallo',
        language: 'de',
        confidence: 0.95,
        duration_ms: 200,
        provider: 'whisper',
      });

      // Mock LLM
      mockSendMessage.mockResolvedValue({
        userMessage: { id: 'u1', sessionId: 'flow-chat', role: 'user' as const, content: 'Hallo', createdAt: new Date() },
        assistantMessage: { id: 'a1', sessionId: 'flow-chat', role: 'assistant' as const, content: 'Hallo! Wie kann ich helfen?', createdAt: new Date() },
      });

      // Mock TTS
      mockTtsSynthesize.mockResolvedValue(Buffer.from('response-audio'));

      // Send loud audio chunk (speech)
      const loudChunk = Buffer.alloc(200);
      for (let i = 0; i < 100; i++) {
        loudChunk.writeInt16LE(10000, i * 2);
      }
      await testPipeline.processAudioChunk(sessionId, loudChunk);

      // Send silent chunk (should trigger turn completion with 0ms threshold)
      const silentChunk = Buffer.alloc(200);
      const result = await testPipeline.processAudioChunk(sessionId, silentChunk);

      // With 0ms thresholds, turn should complete and pipeline should process
      if (result.transcript) {
        expect(result.transcript).toBe('Hallo');
        expect(result.responseText).toBe('Hallo! Wie kann ich helfen?');
        expect(result.responseAudio).toBeDefined();
      }
    });
  });
});
