/**
 * Phase 116: Emotion Detection from Audio Buffer Tests
 *
 * Tests the heuristic emotion analysis in AudioProcessor.analyzeEmotion().
 */

import { AudioProcessor } from '../../../../services/voice/audio-processor';
import type { EmotionAnalysis } from '../../../../services/voice/audio-processor';

describe('AudioProcessor.analyzeEmotion', () => {
  let processor: AudioProcessor;

  beforeEach(() => {
    processor = new AudioProcessor();
  });

  // ============================================================
  // Helper: create a PCM buffer with a specific amplitude pattern
  // ============================================================
  function createPCMBuffer(sampleCount: number, amplitude: number): Buffer {
    const buf = Buffer.alloc(sampleCount * 2); // 16-bit = 2 bytes per sample
    for (let i = 0; i < sampleCount; i++) {
      // Alternating positive/negative for a simple square wave
      const value = i % 2 === 0 ? amplitude : -amplitude;
      buf.writeInt16LE(Math.max(-32768, Math.min(32767, value)), i * 2);
    }
    return buf;
  }

  // ============================================================
  // RMS / Energy Tests
  // ============================================================

  describe('energy detection', () => {
    it('should detect high energy from loud audio', () => {
      // High amplitude = high RMS
      const loudBuffer = createPCMBuffer(16000, 10000);
      const result = processor.analyzeEmotion(loudBuffer);
      expect(result.energy).toBe('high');
      expect(result.rmsValue).toBeGreaterThan(4000);
    });

    it('should detect medium energy from moderate audio', () => {
      const medBuffer = createPCMBuffer(16000, 3000);
      const result = processor.analyzeEmotion(medBuffer);
      expect(result.energy).toBe('medium');
      expect(result.rmsValue).toBeGreaterThan(1500);
      expect(result.rmsValue).toBeLessThanOrEqual(4000);
    });

    it('should detect low energy from quiet audio', () => {
      const quietBuffer = createPCMBuffer(16000, 500);
      const result = processor.analyzeEmotion(quietBuffer);
      expect(result.energy).toBe('low');
      expect(result.rmsValue).toBeLessThanOrEqual(1500);
    });

    it('should handle empty buffer gracefully', () => {
      const result = processor.analyzeEmotion(Buffer.alloc(0));
      expect(result.energy).toBe('low');
      expect(result.rmsValue).toBe(0);
      expect(result.confidence).toBe(0.4);
    });

    it('should handle single-byte buffer', () => {
      const result = processor.analyzeEmotion(Buffer.alloc(1));
      expect(result.energy).toBe('low');
      expect(result.rmsValue).toBe(0);
    });
  });

  // ============================================================
  // Speaking Rate Tests
  // ============================================================

  describe('speaking rate classification', () => {
    it('should detect fast pace with many words in short audio', () => {
      // 16000 samples at 16kHz = 1 second, 5 words = 5 wps (fast)
      const buf = createPCMBuffer(16000, 2000);
      const result = processor.analyzeEmotion(buf, 5, 16000);
      expect(result.pace).toBe('fast');
    });

    it('should detect normal pace', () => {
      // 16000 samples = 1 second, 2.5 words = 2.5 wps (normal)
      const buf = createPCMBuffer(32000, 2000); // 2 seconds
      const result = processor.analyzeEmotion(buf, 5, 16000);
      expect(result.pace).toBe('normal');
    });

    it('should detect slow pace with few words in long audio', () => {
      // 48000 samples = 3 seconds, 2 words = 0.67 wps (slow)
      const buf = createPCMBuffer(48000, 2000);
      const result = processor.analyzeEmotion(buf, 2, 16000);
      expect(result.pace).toBe('slow');
    });

    it('should default to normal pace when no word count', () => {
      const buf = createPCMBuffer(16000, 2000);
      const result = processor.analyzeEmotion(buf, 0, 16000);
      expect(result.pace).toBe('normal');
    });
  });

  // ============================================================
  // Mood Derivation Tests
  // ============================================================

  describe('mood derivation', () => {
    it('should derive excited mood from high energy + fast pace', () => {
      // High energy + fast pace = excited
      const loudFastBuf = createPCMBuffer(16000, 10000); // 1 second
      const result = processor.analyzeEmotion(loudFastBuf, 5, 16000);
      expect(result.mood).toBe('excited');
    });

    it('should derive tense mood from high energy + slow pace', () => {
      // High energy + slow pace = tense
      const loudSlowBuf = createPCMBuffer(48000, 10000); // 3 seconds
      const result = processor.analyzeEmotion(loudSlowBuf, 2, 16000);
      expect(result.mood).toBe('tense');
    });

    it('should derive calm mood from low energy', () => {
      const quietBuf = createPCMBuffer(16000, 500);
      const result = processor.analyzeEmotion(quietBuf);
      expect(result.mood).toBe('calm');
    });

    it('should derive neutral mood from medium energy', () => {
      const medBuf = createPCMBuffer(32000, 2000);
      const result = processor.analyzeEmotion(medBuf, 5, 16000);
      expect(result.mood).toBe('neutral');
    });
  });

  // ============================================================
  // Confidence Tests
  // ============================================================

  describe('confidence scoring', () => {
    it('should have higher confidence when transcript word count is available', () => {
      const buf = createPCMBuffer(16000, 2000);
      const withWords = processor.analyzeEmotion(buf, 3, 16000);
      const withoutWords = processor.analyzeEmotion(buf, 0, 16000);
      expect(withWords.confidence).toBeGreaterThan(withoutWords.confidence);
    });

    it('should return 0.7 confidence with word count', () => {
      const buf = createPCMBuffer(16000, 2000);
      const result = processor.analyzeEmotion(buf, 3, 16000);
      expect(result.confidence).toBe(0.7);
    });

    it('should return 0.4 confidence without word count', () => {
      const buf = createPCMBuffer(16000, 2000);
      const result = processor.analyzeEmotion(buf, 0, 16000);
      expect(result.confidence).toBe(0.4);
    });
  });

  // ============================================================
  // RMS Calculation Tests
  // ============================================================

  describe('calculateRMS', () => {
    it('should return 0 for empty buffer', () => {
      expect(processor.calculateRMS(Buffer.alloc(0))).toBe(0);
    });

    it('should return 0 for silence', () => {
      const silence = Buffer.alloc(100); // all zeros
      expect(processor.calculateRMS(silence)).toBe(0);
    });

    it('should return correct RMS for a known signal', () => {
      // Constant value signal: all samples = 1000
      const buf = Buffer.alloc(20); // 10 samples
      for (let i = 0; i < 10; i++) {
        buf.writeInt16LE(1000, i * 2);
      }
      // RMS of a constant signal = the signal value itself
      expect(processor.calculateRMS(buf)).toBe(1000);
    });
  });

  // ============================================================
  // Return Shape
  // ============================================================

  describe('return shape', () => {
    it('should return all required fields', () => {
      const buf = createPCMBuffer(16000, 2000);
      const result: EmotionAnalysis = processor.analyzeEmotion(buf, 3, 16000);

      expect(result).toHaveProperty('energy');
      expect(result).toHaveProperty('pace');
      expect(result).toHaveProperty('mood');
      expect(result).toHaveProperty('confidence');
      expect(result).toHaveProperty('rmsValue');

      expect(['high', 'medium', 'low']).toContain(result.energy);
      expect(['fast', 'normal', 'slow']).toContain(result.pace);
      expect(['excited', 'neutral', 'calm', 'tense']).toContain(result.mood);
      expect(typeof result.confidence).toBe('number');
      expect(typeof result.rmsValue).toBe('number');
    });
  });
});
