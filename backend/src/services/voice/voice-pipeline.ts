/**
 * Voice Pipeline
 *
 * Main orchestrator for the cascading STT -> LLM -> TTS pipeline.
 * Manages voice sessions, processes audio, and coordinates responses.
 *
 * Phase 57: Real-Time Voice Pipeline
 */

import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../utils/logger';
import { queryContext } from '../../utils/database-context';
import { sttService, STTResult } from './stt-service';
import { multiTTSService, TTSOptions } from './tts-service';
import { audioProcessor } from './audio-processor';
import { TurnTakingEngine, VADResult, createTurnTakingEngine } from './turn-taking';
import { sendMessage } from '../general-chat/chat-messages';
import { createSession } from '../general-chat/chat-sessions';

// ============================================================
// Types
// ============================================================

type AIContext = 'personal' | 'work' | 'learning' | 'creative';

export interface VoicePipelineConfig {
  sttProvider?: string;
  ttsProvider?: string;
  ttsVoice?: string;
  language?: string;
  silenceThreshold_ms?: number;
}

export interface VoiceSession {
  id: string;
  chatSessionId: string;
  context: AIContext;
  config: VoicePipelineConfig;
  turnTaking: TurnTakingEngine;
  audioBuffer: Buffer[];
  isProcessing: boolean;
  turnCount: number;
  totalAudioDuration_ms: number;
}

// ============================================================
// Voice Pipeline
// ============================================================

export class VoicePipeline {
  private sessions: Map<string, VoiceSession>;

  constructor() {
    this.sessions = new Map();
  }

  /**
   * Start a new voice session
   */
  async startSession(
    context: AIContext,
    config?: VoicePipelineConfig
  ): Promise<{ sessionId: string; chatSessionId: string }> {
    const sessionId = uuidv4();

    // Create a linked chat session
    const chatSession = await createSession(context, 'general');

    const session: VoiceSession = {
      id: sessionId,
      chatSessionId: chatSession.id,
      context,
      config: {
        sttProvider: config?.sttProvider || 'whisper',
        ttsProvider: config?.ttsProvider || 'edge-tts',
        ttsVoice: config?.ttsVoice || 'de-DE-ConradNeural',
        language: config?.language || 'de-DE',
        silenceThreshold_ms: config?.silenceThreshold_ms || 1500,
      },
      turnTaking: createTurnTakingEngine({
        silenceThreshold_ms: config?.silenceThreshold_ms || 1500,
      }),
      audioBuffer: [],
      isProcessing: false,
      turnCount: 0,
      totalAudioDuration_ms: 0,
    };

    this.sessions.set(sessionId, session);

    // Persist to database
    try {
      await queryContext(context, `
        INSERT INTO voice_sessions (id, chat_session_id, status, stt_provider, tts_provider, tts_voice, language)
        VALUES ($1, $2, 'active', $3, $4, $5, $6)
      `, [
        sessionId,
        chatSession.id,
        session.config.sttProvider,
        session.config.ttsProvider,
        session.config.ttsVoice,
        session.config.language,
      ]);
    } catch (error) {
      logger.warn('Failed to persist voice session to DB', {
        error: error instanceof Error ? error.message : String(error),
        sessionId,
      });
    }

    logger.info('Voice session started', {
      sessionId,
      chatSessionId: chatSession.id,
      context,
      config: session.config,
      operation: 'voice-pipeline',
    });

    return { sessionId, chatSessionId: chatSession.id };
  }

  /**
   * End a voice session
   */
  async endSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    // Persist final state
    try {
      await queryContext(session.context, `
        UPDATE voice_sessions
        SET status = 'ended', ended_at = NOW(),
            total_audio_duration_ms = $2, turn_count = $3
        WHERE id = $1
      `, [sessionId, session.totalAudioDuration_ms, session.turnCount]);
    } catch (error) {
      logger.warn('Failed to update voice session in DB', {
        error: error instanceof Error ? error.message : String(error),
        sessionId,
      });
    }

    this.sessions.delete(sessionId);

    logger.info('Voice session ended', {
      sessionId,
      turnCount: session.turnCount,
      totalDuration_ms: session.totalAudioDuration_ms,
      operation: 'voice-pipeline',
    });
  }

  /**
   * Get a session by ID
   */
  getSession(sessionId: string): VoiceSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Process an incoming audio chunk
   */
  async processAudioChunk(
    sessionId: string,
    chunk: Buffer
  ): Promise<{
    vad: VADResult;
    transcript?: string;
    responseAudio?: Buffer[];
    responseText?: string;
  }> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Voice session ${sessionId} not found`);
    }

    // Run VAD
    const vad = session.turnTaking.processChunk(chunk);

    // Buffer audio while speaking
    if (vad.isSpeaking || !vad.turnComplete) {
      if (vad.isSpeaking) {
        session.audioBuffer.push(chunk);
      }
      return { vad };
    }

    // Turn is complete - process the buffered audio
    if (session.isProcessing) {
      return { vad };
    }

    session.isProcessing = true;

    try {
      // Concatenate buffered audio
      const fullAudio = audioProcessor.concatenateAudio(session.audioBuffer);
      session.audioBuffer = []; // Clear buffer

      if (fullAudio.length === 0) {
        session.isProcessing = false;
        return { vad };
      }

      // Calculate audio duration
      const audioDuration = audioProcessor.calculateDuration(fullAudio.length);
      session.totalAudioDuration_ms += audioDuration;

      // STT: transcribe audio
      const sttResult: STTResult = await sttService.transcribe(fullAudio, {
        language: session.config.language?.split('-')[0] || 'de',
        provider: session.config.sttProvider,
        format: 'webm',
      });

      if (!sttResult.text || sttResult.text.trim().length === 0) {
        session.isProcessing = false;
        return { vad, transcript: '' };
      }

      // LLM + TTS: process transcript
      const result = await this.processTranscript(session, sttResult.text);

      session.turnCount++;
      session.isProcessing = false;

      return {
        vad,
        transcript: sttResult.text,
        responseAudio: result.responseAudio,
        responseText: result.responseText,
      };
    } catch (error) {
      session.isProcessing = false;
      logger.error('Voice pipeline processing failed', error instanceof Error ? error : undefined, {
        sessionId,
        operation: 'voice-pipeline',
      });
      throw error;
    }
  }

  /**
   * One-shot text-to-speech
   */
  async textToSpeech(text: string, options?: TTSOptions): Promise<Buffer> {
    return multiTTSService.synthesize(text, options);
  }

  /**
   * Process a transcript: send to LLM, then synthesize response sentence by sentence
   */
  private async processTranscript(
    session: VoiceSession,
    transcript: string
  ): Promise<{ responseAudio: Buffer[]; responseText: string }> {
    // Send to Claude via general chat
    const chatResult = await sendMessage(
      session.chatSessionId,
      transcript,
      session.context,
      false
    );

    const responseText = chatResult.assistantMessage.content;

    // Split response into sentences for progressive TTS
    const sentences = audioProcessor.splitIntoSentences(responseText);
    const audioChunks: Buffer[] = [];

    for (const sentence of sentences) {
      if (sentence.trim().length === 0) continue;

      try {
        const audio = await multiTTSService.synthesize(sentence, {
          voice: session.config.ttsVoice,
          provider: session.config.ttsProvider,
        });
        audioChunks.push(audio);
      } catch (error) {
        logger.warn('TTS synthesis failed for sentence', {
          error: error instanceof Error ? error.message : String(error),
          sentenceLength: sentence.length,
        });
      }
    }

    return { responseAudio: audioChunks, responseText };
  }

  /**
   * Get session status
   */
  getSessionStatus(sessionId: string): {
    active: boolean;
    turnCount: number;
    totalDuration_ms: number;
  } | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    return {
      active: true,
      turnCount: session.turnCount,
      totalDuration_ms: session.totalAudioDuration_ms,
    };
  }
}

export const voicePipeline = new VoicePipeline();
