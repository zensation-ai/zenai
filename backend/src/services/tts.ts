/**
 * Text-to-Speech Service
 *
 * Wraps the OpenAI TTS API to provide speech synthesis.
 * Uses the existing OpenAI client from openai.ts.
 *
 * Phase 33 Sprint 4 - Feature 8
 */

import { Readable } from 'stream';
import { logger } from '../utils/logger';
import { getOpenAIClient, isOpenAIAvailable } from './openai';

// ============================================================
// Types
// ============================================================

/** Supported OpenAI TTS voices */
export type TTSVoice = 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';

/** Supported TTS models */
export type TTSModel = 'tts-1' | 'tts-1-hd';

/** Audio output formats */
export type TTSOutputFormat = 'mp3' | 'opus' | 'aac' | 'flac' | 'wav' | 'pcm';

/** TTS request options */
export interface TTSOptions {
  voice?: TTSVoice;
  model?: TTSModel;
  speed?: number;
  outputFormat?: TTSOutputFormat;
}

/** TTS result for non-streaming usage */
export interface TTSResult {
  audioBuffer: Buffer;
  format: TTSOutputFormat;
  durationMs: number;
  voice: TTSVoice;
  textLength: number;
}

// ============================================================
// Constants
// ============================================================

const DEFAULT_VOICE: TTSVoice = 'nova';
const DEFAULT_MODEL: TTSModel = 'tts-1';
const DEFAULT_FORMAT: TTSOutputFormat = 'mp3';
const DEFAULT_SPEED = 1.0;
const MAX_TEXT_LENGTH = 4096;
const MIN_CHUNK_SIZE = 20;

/** Content-Type mapping for audio formats */
export const AUDIO_CONTENT_TYPES: Record<TTSOutputFormat, string> = {
  mp3: 'audio/mpeg',
  opus: 'audio/opus',
  aac: 'audio/aac',
  flac: 'audio/flac',
  wav: 'audio/wav',
  pcm: 'audio/pcm',
};

/** Available voices with metadata */
export const TTS_VOICES: Array<{ id: TTSVoice; name: string; description: string }> = [
  { id: 'alloy', name: 'Alloy', description: 'Neutral and balanced voice' },
  { id: 'echo', name: 'Echo', description: 'Warm and conversational male voice' },
  { id: 'fable', name: 'Fable', description: 'Expressive storytelling voice' },
  { id: 'nova', name: 'Nova', description: 'Natural and friendly female voice' },
  { id: 'onyx', name: 'Onyx', description: 'Deep and authoritative male voice' },
  { id: 'shimmer', name: 'Shimmer', description: 'Clear and bright female voice' },
];

// ============================================================
// Service Functions
// ============================================================

/**
 * Check if TTS is available (OpenAI client initialized)
 */
export function isTTSAvailable(): boolean {
  return isOpenAIAvailable();
}

/**
 * Synthesize speech from text, returning a complete audio buffer.
 * Best for short texts where you need the full result before sending.
 */
export async function synthesizeSpeech(
  text: string,
  options: TTSOptions = {}
): Promise<TTSResult> {
  const voice = options.voice || DEFAULT_VOICE;
  const model = options.model || DEFAULT_MODEL;
  const speed = options.speed || DEFAULT_SPEED;
  const outputFormat = options.outputFormat || DEFAULT_FORMAT;

  if (!text || text.trim().length === 0) {
    throw new Error('Text is required for TTS synthesis');
  }
  if (text.length > MAX_TEXT_LENGTH) {
    throw new Error(`Text exceeds maximum length of ${MAX_TEXT_LENGTH} characters`);
  }

  const startTime = Date.now();
  const client = getOpenAIClient();

  try {
    const response = await client.audio.speech.create({
      model,
      voice,
      input: text.trim(),
      speed,
      response_format: outputFormat,
    });

    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = Buffer.from(arrayBuffer);
    const durationMs = Date.now() - startTime;

    logger.info('TTS synthesis completed', {
      voice,
      model,
      format: outputFormat,
      textLength: text.length,
      audioSize: audioBuffer.length,
      durationMs,
      operation: 'synthesizeSpeech',
    });

    return {
      audioBuffer,
      format: outputFormat,
      durationMs,
      voice,
      textLength: text.length,
    };
  } catch (error: unknown) {
    logger.error('TTS synthesis failed', error instanceof Error ? error : undefined, {
      voice,
      model,
      textLength: text.length,
      operation: 'synthesizeSpeech',
    });
    throw error;
  }
}

/**
 * Stream speech from text, returning a readable Node.js stream.
 * Best for HTTP streaming responses where you want to pipe directly.
 */
export async function streamSpeech(
  text: string,
  options: TTSOptions = {}
): Promise<Readable> {
  const voice = options.voice || DEFAULT_VOICE;
  const model = options.model || DEFAULT_MODEL;
  const speed = options.speed || DEFAULT_SPEED;
  const outputFormat = options.outputFormat || DEFAULT_FORMAT;

  if (!text || text.trim().length === 0) {
    throw new Error('Text is required for TTS synthesis');
  }
  if (text.length > MAX_TEXT_LENGTH) {
    throw new Error(`Text exceeds maximum length of ${MAX_TEXT_LENGTH} characters`);
  }

  const client = getOpenAIClient();

  try {
    const response = await client.audio.speech.create({
      model,
      voice,
      input: text.trim(),
      speed,
      response_format: outputFormat,
    });

    logger.info('TTS stream started', {
      voice,
      model,
      format: outputFormat,
      textLength: text.length,
      operation: 'streamSpeech',
    });

    // Convert Web ReadableStream to Node.js Readable
    const webStream = response.body;
    if (!webStream) {
      throw new Error('No response body from OpenAI TTS API');
    }

    return Readable.fromWeb(webStream as import('stream/web').ReadableStream);
  } catch (error: unknown) {
    logger.error('TTS stream failed', error instanceof Error ? error : undefined, {
      voice,
      model,
      textLength: text.length,
      operation: 'streamSpeech',
    });
    throw error;
  }
}

// ============================================================
// Sentence Chunker (for Voice Pipeline)
// ============================================================

export interface SentenceChunker {
  /** Push text and get back any complete sentences */
  push(text: string): string[];
  /** Flush remaining buffer content */
  flush(): string | null;
}

/**
 * Creates a sentence-level text chunker for streaming Claude → TTS pipeline.
 * Accumulates text and emits complete sentences suitable for TTS synthesis.
 */
export function createSentenceChunker(): SentenceChunker {
  let buffer = '';

  return {
    push(text: string): string[] {
      buffer += text;
      const sentences: string[] = [];

      // Match sentence-ending punctuation followed by whitespace or end
      const sentencePattern = /[.!?]\s+|[.!?]$/;
      let match: RegExpExecArray | null;

      while ((match = sentencePattern.exec(buffer)) !== null) {
        const endIndex = match.index + match[0].length;
        const sentence = buffer.slice(0, endIndex).trim();

        if (sentence.length >= MIN_CHUNK_SIZE) {
          sentences.push(sentence);
          buffer = buffer.slice(endIndex);
        } else {
          // Sentence too short, keep accumulating
          break;
        }
      }

      return sentences;
    },

    flush(): string | null {
      const remaining = buffer.trim();
      buffer = '';
      return remaining.length > 0 ? remaining : null;
    },
  };
}
