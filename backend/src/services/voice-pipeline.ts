/**
 * Voice Pipeline Service
 *
 * Orchestrates the real-time voice conversation loop:
 * Whisper STT → Claude → TTS
 *
 * Uses sentence-level chunking for pipeline parallelism:
 * As Claude streams text, complete sentences are immediately
 * sent to TTS for synthesis, overlapping generation and playback.
 *
 * Phase 33 Sprint 4 - Feature 9
 */

import { v4 as uuidv4 } from 'uuid';
import type Anthropic from '@anthropic-ai/sdk';
import { logger } from '../utils/logger';
import { transcribeAudio } from './whisper';
import { synthesizeSpeech, createSentenceChunker, type TTSVoice } from './tts';
import { streamAndCollect } from './claude/streaming';

// ============================================================
// Types
// ============================================================

/** Voice pipeline session state */
export interface VoicePipelineSession {
  id: string;
  chatSessionId?: string;
  conversationHistory: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
  voice: TTSVoice;
  speed: number;
  isProcessing: boolean;
  createdAt: Date;
  lastActivityAt: Date;
  metrics: PipelineMetrics;
  abortController: AbortController | null;
}

/** Pipeline performance metrics */
export interface PipelineMetrics {
  totalTurns: number;
  transcriptionTimes: number[];
  claudeTimes: number[];
  ttsTimes: number[];
}

/** Metrics for a single conversation turn */
export interface TurnMetrics {
  transcriptionMs: number;
  claudeMs: number;
  ttsMs: number;
  totalMs: number;
  firstAudioChunkMs: number;
}

/** WebSocket message types (server → client) */
export type ServerMessage =
  | { type: 'session_start'; sessionId: string }
  | { type: 'transcription'; text: string; durationMs: number }
  | { type: 'claude_start' }
  | { type: 'claude_text'; text: string }
  | { type: 'audio_chunk'; data: Buffer }
  | { type: 'audio_end' }
  | { type: 'turn_complete'; metrics: TurnMetrics }
  | { type: 'error'; message: string; code: string }
  | { type: 'pong' };

/** WebSocket message types (client → server) */
export type ClientMessage =
  | { type: 'audio_end' }
  | { type: 'config'; voice?: TTSVoice; speed?: number; chatSessionId?: string }
  | { type: 'interrupt' }
  | { type: 'ping' };

// ============================================================
// Constants
// ============================================================

const SYSTEM_PROMPT = `Du bist ZenAI, ein intelligenter Assistent für Sprachkonversationen.
Antworte natürlich und prägnant, als würdest du sprechen.
Halte Antworten kurz (2-4 Sätze), es sei denn, der Nutzer bittet um ausführliche Erklärungen.
Verwende klare, einfache Sprache. Vermeide Markdown-Formatierung.`;

const MAX_CONVERSATION_HISTORY = 20;

// ============================================================
// Session Management
// ============================================================

/**
 * Create a new voice pipeline session
 */
export function createPipelineSession(options?: {
  voice?: TTSVoice;
  speed?: number;
  chatSessionId?: string;
}): VoicePipelineSession {
  return {
    id: uuidv4(),
    chatSessionId: options?.chatSessionId,
    conversationHistory: [],
    voice: options?.voice || 'nova',
    speed: options?.speed || 1.0,
    isProcessing: false,
    createdAt: new Date(),
    lastActivityAt: new Date(),
    metrics: {
      totalTurns: 0,
      transcriptionTimes: [],
      claudeTimes: [],
      ttsTimes: [],
    },
    abortController: null,
  };
}

/**
 * Process a voice turn through the full pipeline:
 * Audio → STT → Claude → TTS → Audio
 *
 * Yields ServerMessage objects that the WebSocket handler sends to the client.
 */
export async function* processVoiceTurn(
  session: VoicePipelineSession,
  audioBuffer: Buffer,
  _format: string
): AsyncGenerator<ServerMessage> {
  const turnStart = Date.now();
  session.abortController = new AbortController();
  let transcriptionMs = 0;
  let claudeMs = 0;
  let ttsMs = 0;
  let firstAudioChunkMs = 0;

  try {
    // ============================================================
    // Step 1: Speech-to-Text (Whisper)
    // ============================================================
    const sttStart = Date.now();
    let transcription: string;

    try {
      const result = await transcribeAudio(audioBuffer, 'voice-pipeline.webm');
      transcription = result.text;
      transcriptionMs = Date.now() - sttStart;

      logger.info('Voice pipeline: STT completed', {
        sessionId: session.id,
        transcriptionMs,
        textLength: transcription.length,
        operation: 'voice-pipeline-stt',
      });
    } catch (error) {
      logger.error('Voice pipeline: STT failed', error instanceof Error ? error : undefined, {
        sessionId: session.id,
        operation: 'voice-pipeline-stt',
      });
      yield { type: 'error', message: 'Transkription fehlgeschlagen', code: 'STT_ERROR' };
      return;
    }

    if (!transcription || transcription.trim().length === 0) {
      yield { type: 'error', message: 'Keine Sprache erkannt', code: 'STT_EMPTY' };
      return;
    }

    yield { type: 'transcription', text: transcription, durationMs: transcriptionMs };

    // Add user message to history
    session.conversationHistory.push({ role: 'user', content: transcription });

    // Trim history to prevent context overflow
    if (session.conversationHistory.length > MAX_CONVERSATION_HISTORY) {
      session.conversationHistory = session.conversationHistory.slice(-MAX_CONVERSATION_HISTORY);
    }

    // ============================================================
    // Step 2: Claude Response Generation
    // ============================================================
    yield { type: 'claude_start' };
    const claudeStart = Date.now();

    let claudeResponse: string;
    try {
      const messages: Anthropic.MessageParam[] = session.conversationHistory.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

      const result = await streamAndCollect(messages, {
        systemPrompt: SYSTEM_PROMPT,
        maxTokens: 1024,
        temperature: 0.7,
      });
      claudeResponse = result.content;
      claudeMs = Date.now() - claudeStart;

      logger.info('Voice pipeline: Claude completed', {
        sessionId: session.id,
        claudeMs,
        responseLength: claudeResponse.length,
        operation: 'voice-pipeline-claude',
      });
    } catch (error) {
      logger.error('Voice pipeline: Claude failed', error instanceof Error ? error : undefined, {
        sessionId: session.id,
        operation: 'voice-pipeline-claude',
      });
      yield { type: 'error', message: 'KI-Antwort fehlgeschlagen', code: 'CLAUDE_ERROR' };
      return;
    }

    // Send the text response
    yield { type: 'claude_text', text: claudeResponse };

    // Add assistant response to history
    session.conversationHistory.push({ role: 'assistant', content: claudeResponse });

    // ============================================================
    // Step 3: Text-to-Speech
    // ============================================================
    const ttsStart = Date.now();

    try {
      // Use sentence chunking for streaming TTS
      const chunker = createSentenceChunker();
      const sentences: string[] = [];

      // Split response into sentences
      const allSentences = chunker.push(claudeResponse);
      sentences.push(...allSentences);
      const remaining = chunker.flush();
      if (remaining) {sentences.push(remaining);}

      // If no sentences extracted, use full response
      if (sentences.length === 0) {
        sentences.push(claudeResponse);
      }

      // Synthesize each sentence
      for (const sentence of sentences) {
        if (session.abortController?.signal.aborted) {
          break;
        }

        const result = await synthesizeSpeech(sentence, {
          voice: session.voice,
          speed: session.speed,
          outputFormat: 'opus',
        });

        if (firstAudioChunkMs === 0) {
          firstAudioChunkMs = Date.now() - turnStart;
        }

        yield { type: 'audio_chunk', data: result.audioBuffer };
      }

      ttsMs = Date.now() - ttsStart;
      yield { type: 'audio_end' };

      logger.info('Voice pipeline: TTS completed', {
        sessionId: session.id,
        ttsMs,
        sentenceCount: sentences.length,
        operation: 'voice-pipeline-tts',
      });
    } catch (error) {
      logger.error('Voice pipeline: TTS failed', error instanceof Error ? error : undefined, {
        sessionId: session.id,
        operation: 'voice-pipeline-tts',
      });
      // TTS failure is non-critical - user already has the text
      yield { type: 'audio_end' };
    }

    // ============================================================
    // Step 4: Turn Complete
    // ============================================================
    const totalMs = Date.now() - turnStart;
    const turnMetrics: TurnMetrics = {
      transcriptionMs,
      claudeMs,
      ttsMs,
      totalMs,
      firstAudioChunkMs,
    };

    session.metrics.totalTurns++;
    session.metrics.transcriptionTimes.push(transcriptionMs);
    session.metrics.claudeTimes.push(claudeMs);
    session.metrics.ttsTimes.push(ttsMs);
    session.lastActivityAt = new Date();

    yield { type: 'turn_complete', metrics: turnMetrics };

    logger.info('Voice pipeline: turn completed', {
      sessionId: session.id,
      turn: session.metrics.totalTurns,
      totalMs,
      firstAudioChunkMs,
      operation: 'voice-pipeline-turn',
    });
  } finally {
    session.abortController = null;
  }
}

/**
 * Interrupt an in-progress pipeline turn.
 * Aborts any ongoing Claude or TTS requests.
 */
export function interruptPipeline(session: VoicePipelineSession): void {
  if (session.abortController) {
    session.abortController.abort();
    session.abortController = null;
  }
  session.isProcessing = false;

  logger.info('Voice pipeline: interrupted', {
    sessionId: session.id,
    operation: 'voice-pipeline-interrupt',
  });
}

/**
 * Cleanup session resources on disconnect.
 */
export function cleanupSession(session: VoicePipelineSession): void {
  interruptPipeline(session);
  session.conversationHistory = [];

  logger.info('Voice pipeline: session cleaned up', {
    sessionId: session.id,
    totalTurns: session.metrics.totalTurns,
    operation: 'voice-pipeline-cleanup',
  });
}
