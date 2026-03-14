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
    if (trimmed.length === 0) return false;
    return /[.!?]\s*$/.test(trimmed);
  }

  /**
   * Split text into sentence chunks for progressive TTS
   */
  splitIntoSentences(text: string): string[] {
    if (!text || text.trim().length === 0) return [];

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
    if (chunks.length === 0) return Buffer.alloc(0);
    if (chunks.length === 1) return chunks[0];
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
    if (bytesPerSecond === 0) return 0;
    return Math.round((bufferSize / bytesPerSecond) * 1000);
  }
}

export const audioProcessor = new AudioProcessor();
