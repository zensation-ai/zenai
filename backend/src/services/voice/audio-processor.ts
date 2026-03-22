/**
 * Audio Processor
 *
 * Audio format conversion, sentence detection, and chunking utilities.
 *
 * Phase 57: Real-Time Voice Pipeline
 */

// ============================================================
// Types
// ============================================================

export type EnergyLevel = 'high' | 'medium' | 'low';
export type PaceLevel = 'fast' | 'normal' | 'slow';
export type MoodLevel = 'excited' | 'neutral' | 'calm' | 'tense';

export interface EmotionAnalysis {
  /** RMS energy level */
  energy: EnergyLevel;
  /** Speaking pace estimate */
  pace: PaceLevel;
  /** Derived mood from energy + pace */
  mood: MoodLevel;
  /** Confidence in the analysis (0-1) */
  confidence: number;
  /** Raw RMS value */
  rmsValue: number;
}

export interface AudioChunk {
  data: Buffer;
  format: string;
  sampleRate: number;
  channels: number;
  duration_ms: number;
}

// ============================================================
// Audio Processor
// ============================================================

export class AudioProcessor {
  /**
   * Check if text ends with a sentence-ending punctuation
   */
  isSentenceEnd(text: string): boolean {
    const trimmed = text.trimEnd();
    if (trimmed.length === 0) {return false;}
    return /[.!?]\s*$/.test(trimmed);
  }

  /**
   * Split text into sentence chunks for progressive TTS
   */
  splitIntoSentences(text: string): string[] {
    if (!text || text.trim().length === 0) {return [];}

    const sentences: string[] = [];
    // Split on sentence-ending punctuation followed by whitespace
    const parts = text.split(/(?<=[.!?])\s+/);

    for (const part of parts) {
      const trimmed = part.trim();
      if (trimmed.length > 0) {
        sentences.push(trimmed);
      }
    }

    return sentences;
  }

  /**
   * Concatenate multiple audio buffers
   */
  concatenateAudio(chunks: Buffer[]): Buffer {
    if (chunks.length === 0) {return Buffer.alloc(0);}
    if (chunks.length === 1) {return chunks[0];}
    return Buffer.concat(chunks);
  }

  /**
   * Create a WAV header for raw PCM data
   */
  createWavHeader(
    dataLength: number,
    sampleRate: number = 16000,
    channels: number = 1,
    bitsPerSample: number = 16
  ): Buffer {
    const header = Buffer.alloc(44);
    const byteRate = sampleRate * channels * (bitsPerSample / 8);
    const blockAlign = channels * (bitsPerSample / 8);

    header.write('RIFF', 0);
    header.writeUInt32LE(36 + dataLength, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16);           // PCM chunk size
    header.writeUInt16LE(1, 20);            // PCM format
    header.writeUInt16LE(channels, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(byteRate, 28);
    header.writeUInt16LE(blockAlign, 32);
    header.writeUInt16LE(bitsPerSample, 34);
    header.write('data', 36);
    header.writeUInt32LE(dataLength, 40);

    return header;
  }

  /**
   * Analyze emotion from a raw PCM audio buffer using heuristic analysis.
   *
   * Phase 116: Energy + pace-based emotion detection.
   *
   * @param audioBuffer Raw PCM 16-bit LE audio data (no WAV header)
   * @param wordCount Number of words from transcript (for pace estimation)
   * @param sampleRate Audio sample rate (default 16000)
   */
  analyzeEmotion(
    audioBuffer: Buffer,
    wordCount: number = 0,
    sampleRate: number = 16000
  ): EmotionAnalysis {
    // --- RMS Energy ---
    const rms = this.calculateRMS(audioBuffer);

    let energy: EnergyLevel;
    if (rms > 4000) {
      energy = 'high';
    } else if (rms > 1500) {
      energy = 'medium';
    } else {
      energy = 'low';
    }

    // --- Speaking pace ---
    const durationSec = this.calculateDuration(audioBuffer.length, sampleRate) / 1000;
    let pace: PaceLevel = 'normal';
    if (wordCount > 0 && durationSec > 0.5) {
      const wordsPerSecond = wordCount / durationSec;
      if (wordsPerSecond > 3.5) {
        pace = 'fast';
      } else if (wordsPerSecond < 1.5) {
        pace = 'slow';
      } else {
        pace = 'normal';
      }
    }

    // --- Derive mood from energy + pace ---
    let mood: MoodLevel;
    if (energy === 'high' && pace === 'fast') {
      mood = 'excited';
    } else if (energy === 'high' && pace !== 'fast') {
      mood = 'tense';
    } else if (energy === 'low') {
      mood = 'calm';
    } else {
      mood = 'neutral';
    }

    // Confidence: higher when we have both energy and pace data
    const hasTranscript = wordCount > 0;
    const confidence = hasTranscript ? 0.7 : 0.4;

    return { energy, pace, mood, confidence, rmsValue: Math.round(rms) };
  }

  /**
   * Calculate Root Mean Square (RMS) amplitude from 16-bit PCM audio.
   */
  calculateRMS(audioBuffer: Buffer): number {
    if (audioBuffer.length < 2) {return 0;}

    const sampleCount = Math.floor(audioBuffer.length / 2);
    if (sampleCount === 0) {return 0;}

    let sumOfSquares = 0;
    for (let i = 0; i < sampleCount; i++) {
      const sample = audioBuffer.readInt16LE(i * 2);
      sumOfSquares += sample * sample;
    }

    return Math.sqrt(sumOfSquares / sampleCount);
  }

  /**
   * Calculate audio duration from buffer size
   */
  calculateDuration(
    bufferSize: number,
    sampleRate: number = 16000,
    channels: number = 1,
    bitsPerSample: number = 16
  ): number {
    const bytesPerSample = bitsPerSample / 8;
    const bytesPerSecond = sampleRate * channels * bytesPerSample;
    if (bytesPerSecond === 0) {return 0;}
    return Math.round((bufferSize / bytesPerSecond) * 1000);
  }
}

export const audioProcessor = new AudioProcessor();
