/**
 * Voice Pipeline
 *
 * Main orchestrator for the cascading STT -> LLM -> TTS pipeline.
 * Manages voice sessions, processes audio, and coordinates responses.
 *
 * Phase 57: Real-Time Voice Pipeline
 * Sprint 2C: Sentence-level TTS streaming for reduced latency
 */

import { v4 as uuidv4 } from 'uuid';
import Anthropic from '@anthropic-ai/sdk';
import { logger } from '../../utils/logger';
import { query } from '../../utils/database';
import { queryContext } from '../../utils/database-context';
import type { STTResult } from './stt-service';
import { sttService } from './stt-service';
import type { TTSOptions } from './tts-service';
import { multiTTSService } from './tts-service';
import { audioProcessor } from './audio-processor';
import type { TurnTakingEngine, VADResult } from './turn-taking';
import { createTurnTakingEngine } from './turn-taking';
import { sendMessage } from '../general-chat/chat-messages';
import { GENERAL_CHAT_SYSTEM_PROMPT } from '../general-chat/chat-messages';
import { addMessage, updateSessionTitle, createSession } from '../general-chat/chat-sessions';
import { getClaudeClient, CLAUDE_MODEL } from '../claude/client';
import { isClaudeAvailable } from '../claude';
import { memoryCoordinator } from '../memory';

// ============================================================
// Types
// ============================================================

type AIContext = 'personal' | 'work' | 'learning' | 'creative' | 'demo';

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

/**
 * Callback invoked each time a sentence's TTS audio is ready.
 * index is 0-based, in the order sentences were detected.
 */
export type SentenceAudioCallback = (
  audio: Buffer,
  sentence: string,
  index: number,
) => void;

/**
 * Common abbreviations that end with a period but are NOT sentence endings.
 * Used to avoid premature sentence splits on "Dr.", "Nr.", "z.B." etc.
 */
const ABBREVIATION_PATTERN = /(?:Dr|Mr|Mrs|Ms|Prof|Nr|Abs|Bd|ca|etc|evtl|ggf|inkl|max|min|usw|vgl|vs|z\.B|d\.h|u\.a|s\.o|i\.d\.R|o\.ä|u\.U|bzw)\.\s*$/i;

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
        silenceThreshold_ms: config?.silenceThreshold_ms || 1000,
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
    if (!session) {return;}

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
    const sentences = audioProcessor.splitIntoSentences(responseText)
      .filter(s => s.trim().length > 0);

    if (sentences.length === 0) {
      return { responseAudio: [], responseText };
    }

    // Parallel TTS synthesis (up to 3 concurrent, with phrase caching)
    try {
      const audioChunks = await multiTTSService.synthesizeBatch(sentences, {
        voice: session.config.ttsVoice,
        provider: session.config.ttsProvider,
      }, 3);
      return { responseAudio: audioChunks, responseText };
    } catch (error) {
      logger.warn('Batch TTS synthesis failed, trying sequential fallback', {
        error: error instanceof Error ? error.message : String(error),
        sentenceCount: sentences.length,
      });

      // Sequential fallback
      const audioChunks: Buffer[] = [];
      for (const sentence of sentences) {
        try {
          const audio = await multiTTSService.synthesize(sentence, {
            voice: session.config.ttsVoice,
            provider: session.config.ttsProvider,
          });
          audioChunks.push(audio);
        } catch (err) {
          logger.warn('TTS synthesis failed for sentence', {
            error: err instanceof Error ? err.message : String(err),
            sentenceLength: sentence.length,
          });
        }
      }
      return { responseAudio: audioChunks, responseText };
    }
  }

  /**
   * Process audio chunk with sentence-level TTS streaming.
   *
   * Instead of waiting for the full LLM response before starting TTS,
   * this streams Claude's response token-by-token, detects sentence
   * boundaries, and immediately fires TTS for each complete sentence.
   * Audio chunks are delivered via onAudioChunk as soon as they are ready.
   *
   * Falls back to the non-streaming path if Claude streaming is unavailable.
   */
  async processAudioChunkStreaming(
    sessionId: string,
    chunk: Buffer,
    onAudioChunk: SentenceAudioCallback,
    onResponseText?: (text: string) => void,
  ): Promise<{
    vad: VADResult;
    transcript?: string;
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
      session.audioBuffer = [];

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

      // Use sentence-level streaming LLM + TTS
      const responseText = await this.processTranscriptStreaming(
        session,
        sttResult.text,
        onAudioChunk,
      );

      if (onResponseText) {
        onResponseText(responseText);
      }

      session.turnCount++;
      session.isProcessing = false;

      return {
        vad,
        transcript: sttResult.text,
        responseText,
      };
    } catch (error) {
      session.isProcessing = false;
      logger.error('Voice pipeline streaming processing failed', error instanceof Error ? error : undefined, {
        sessionId,
        operation: 'voice-pipeline',
      });
      throw error;
    }
  }

  /**
   * Sentence-level streaming: stream Claude's response, detect sentence
   * boundaries on-the-fly, and fire TTS for each sentence immediately.
   *
   * TTS runs in parallel with continued Claude streaming. Audio chunks
   * are delivered to onAudioChunk in sentence order (but as soon as ready).
   */
  private async processTranscriptStreaming(
    session: VoiceSession,
    transcript: string,
    onAudioChunk: SentenceAudioCallback,
  ): Promise<string> {
    // If Claude is not available, fall back to non-streaming path
    if (!isClaudeAvailable()) {
      logger.warn('Claude unavailable for streaming, falling back to non-streaming path');
      const result = await this.processTranscript(session, transcript);
      // Deliver all audio chunks via callback
      for (let i = 0; i < result.responseAudio.length; i++) {
        const sentences = audioProcessor.splitIntoSentences(result.responseText);
        onAudioChunk(result.responseAudio[i], sentences[i] || '', i);
      }
      return result.responseText;
    }

    // Store user message in chat history
    await addMessage(session.chatSessionId, 'user', transcript);
    await updateSessionTitle(session.chatSessionId, transcript);

    // Fire-and-forget memory interaction
    try {
      await memoryCoordinator.addInteraction(session.chatSessionId, 'user', transcript);
    } catch {
      // Non-critical
    }

    // Get conversation history for context
    // Note: general_chat_messages is in the public schema, so query() is correct here
    const historyResult = await query(`
      SELECT role, content
      FROM general_chat_messages
      WHERE session_id = $1
      ORDER BY created_at ASC
      LIMIT 20
    `, [session.chatSessionId]);

    const messages: Anthropic.MessageParam[] = historyResult.rows.map(row => ({
      role: row.role as 'user' | 'assistant',
      content: row.content,
    }));

    // Stream from Claude API
    const client = getClaudeClient();
    const stream = client.messages.stream({
      model: CLAUDE_MODEL,
      max_tokens: 4096,
      system: GENERAL_CHAT_SYSTEM_PROMPT,
      messages,
      temperature: 0.7,
    });

    let textBuffer = '';
    let fullResponse = '';
    let sentenceIndex = 0;
    const ttsPromises: Promise<void>[] = [];

    const ttsOptions: TTSOptions = {
      voice: session.config.ttsVoice,
      provider: session.config.ttsProvider,
    };

    // Helper: flush buffer as a sentence and trigger TTS
    const flushSentence = (sentence: string) => {
      const trimmed = sentence.trim();
      if (trimmed.length === 0) {return;}

      const idx = sentenceIndex++;
      logger.debug('Sentence detected, triggering TTS', {
        sentenceIndex: idx,
        sentenceLength: trimmed.length,
        operation: 'voice-pipeline-streaming',
      });

      // Fire TTS in parallel - do not await
      const ttsPromise = multiTTSService.synthesize(trimmed, ttsOptions)
        .then(audio => {
          onAudioChunk(audio, trimmed, idx);
        })
        .catch(err => {
          logger.warn('TTS failed for streamed sentence, skipping', {
            error: err instanceof Error ? err.message : String(err),
            sentenceIndex: idx,
            sentenceLength: trimmed.length,
          });
        });

      ttsPromises.push(ttsPromise);
    };

    // Process streaming text deltas
    stream.on('text', (text: string) => {
      fullResponse += text;
      textBuffer += text;

      // Check for sentence boundaries in the buffer
      // We need to handle cases where a period belongs to an abbreviation
      while (true) {
        // Find the next potential sentence-ending punctuation
        const match = textBuffer.match(/[.!?]\s+/);
        if (!match || match.index === undefined) {break;}

        const endPos = match.index + 1; // position right after the punctuation
        const candidate = textBuffer.substring(0, endPos);

        // Skip abbreviations (Dr., Nr., z.B., etc.)
        if (ABBREVIATION_PATTERN.test(candidate)) {
          // Advance the buffer past the abbreviation match to avoid infinite loop
          const skipTo = match.index + match[0].length;
          textBuffer = textBuffer.substring(skipTo);
          continue;
        }

        // Valid sentence boundary found
        const sentence = textBuffer.substring(0, match.index + match[0].length);
        textBuffer = textBuffer.substring(match.index + match[0].length);
        flushSentence(sentence);
      }
    });

    // Wait for stream to complete
    await stream.finalMessage();

    // Flush any remaining text in the buffer as the final sentence
    if (textBuffer.trim().length > 0) {
      flushSentence(textBuffer);
      textBuffer = '';
    }

    // Wait for all TTS operations to complete
    await Promise.allSettled(ttsPromises);

    // Store assistant response in chat history
    if (fullResponse.length > 0) {
      await addMessage(session.chatSessionId, 'assistant', fullResponse);

      // Fire-and-forget memory interaction
      try {
        await memoryCoordinator.addInteraction(session.chatSessionId, 'assistant', fullResponse);
      } catch {
        // Non-critical
      }
    }

    logger.info('Sentence-level streaming complete', {
      sessionId: session.id,
      sentenceCount: sentenceIndex,
      totalLength: fullResponse.length,
      operation: 'voice-pipeline-streaming',
    });

    return fullResponse;
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
    if (!session) {return null;}

    return {
      active: true,
      turnCount: session.turnCount,
      totalDuration_ms: session.totalAudioDuration_ms,
    };
  }

  /**
   * Generate a proactive morning briefing.
   *
   * Phase 116: Collects pending tasks, unread emails, and today's events
   * to generate a German-language audio briefing.
   *
   * @param context AI context
   * @param userId User ID
   * @param withAudio Whether to also generate TTS audio
   */
  async generateMorningBriefing(
    context: 'personal' | 'work' | 'learning' | 'creative' | 'demo',
    userId: string,
    withAudio: boolean = false
  ): Promise<{ text: string; audioBuffer?: Buffer }> {
    // Collect data from the database
    let pendingTasks = 0;
    let unreadEmails = 0;
    let todayEvents: Array<{ title: string; start_time: string }> = [];

    try {
      const tasksResult = await queryContext(context,
        `SELECT COUNT(*) as count FROM tasks WHERE user_id = $1 AND status IN ('todo', 'in_progress')`,
        [userId]
      );
      pendingTasks = parseInt(tasksResult.rows[0]?.count || '0', 10);
    } catch {
      // Table may not exist in all contexts
    }

    try {
      const emailsResult = await queryContext(context,
        `SELECT COUNT(*) as count FROM emails WHERE user_id = $1 AND status = 'unread'`,
        [userId]
      );
      unreadEmails = parseInt(emailsResult.rows[0]?.count || '0', 10);
    } catch {
      // Table may not exist
    }

    try {
      const eventsResult = await queryContext(context,
        `SELECT title, start_time FROM calendar_events
         WHERE user_id = $1
           AND start_time >= CURRENT_DATE
           AND start_time < CURRENT_DATE + INTERVAL '1 day'
         ORDER BY start_time ASC
         LIMIT 5`,
        [userId]
      );
      todayEvents = eventsResult.rows;
    } catch {
      // Table may not exist
    }

    // Build German briefing text
    const parts: string[] = ['Guten Morgen!'];

    if (pendingTasks > 0) {
      parts.push(`Du hast ${pendingTasks} offene ${pendingTasks === 1 ? 'Aufgabe' : 'Aufgaben'}.`);
    }

    if (unreadEmails > 0) {
      parts.push(`${unreadEmails} ungelesene ${unreadEmails === 1 ? 'E-Mail' : 'E-Mails'} ${unreadEmails === 1 ? 'wartet' : 'warten'} auf dich.`);
    }

    if (todayEvents.length > 0) {
      if (todayEvents.length === 1) {
        const event = todayEvents[0];
        const time = new Date(event.start_time).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
        parts.push(`Heute steht ein Termin an: ${event.title} um ${time}.`);
      } else {
        parts.push(`Heute hast du ${todayEvents.length} Termine.`);
        for (const event of todayEvents.slice(0, 3)) {
          const time = new Date(event.start_time).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
          parts.push(`${event.title} um ${time}.`);
        }
        if (todayEvents.length > 3) {
          parts.push(`Und ${todayEvents.length - 3} weitere.`);
        }
      }
    }

    if (pendingTasks === 0 && unreadEmails === 0 && todayEvents.length === 0) {
      parts.push('Dein Tag sieht ruhig aus. Keine offenen Aufgaben, keine ungelesenen E-Mails und keine Termine.');
    }

    const text = parts.join(' ');

    logger.info('Morning briefing generated', {
      context,
      pendingTasks,
      unreadEmails,
      eventCount: todayEvents.length,
      textLength: text.length,
      operation: 'voice-briefing',
    });

    // Optionally generate audio
    let audioBuffer: Buffer | undefined;
    if (withAudio) {
      try {
        audioBuffer = await multiTTSService.synthesize(text, {
          voice: 'de-DE-ConradNeural',
          provider: 'edge-tts',
        });
      } catch (error) {
        logger.warn('Failed to generate briefing audio', {
          error: error instanceof Error ? error.message : String(error),
          operation: 'voice-briefing',
        });
      }
    }

    return { text, audioBuffer };
  }
}

export const voicePipeline = new VoicePipeline();
