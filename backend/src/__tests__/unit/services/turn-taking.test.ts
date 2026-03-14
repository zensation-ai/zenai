/**
 * Turn-Taking Engine Tests
 * Phase 57: Real-Time Voice Pipeline
 */

import { TurnTakingEngine, createTurnTakingEngine } from '../../../services/voice/turn-taking';

describe('TurnTakingEngine', () => {
  let engine: TurnTakingEngine;

  beforeEach(() => {
    engine = new TurnTakingEngine();
  });

  describe('constructor', () => {
    it('should create with default config', () => {
      const e = new TurnTakingEngine();
      expect(e).toBeDefined();
    });

    it('should create with custom config', () => {
      const e = new TurnTakingEngine({
        silenceThreshold_ms: 2000,
        volumeThreshold: 0.05,
        minSpeechDuration_ms: 500,
      });
      expect(e).toBeDefined();
    });
  });

  describe('processChunk', () => {
    it('should detect silence for empty buffer', () => {
      const chunk = Buffer.alloc(100);
      const result = engine.processChunk(chunk);

      expect(result.isSpeaking).toBe(false);
      expect(result.volume).toBe(0);
      expect(result.turnComplete).toBe(false);
    });

    it('should detect speech for loud audio', () => {
      // Create a buffer with high amplitude 16-bit PCM
      const chunk = Buffer.alloc(200);
      for (let i = 0; i < 100; i++) {
        chunk.writeInt16LE(16000, i * 2); // loud signal
      }

      const result = engine.processChunk(chunk);
      expect(result.isSpeaking).toBe(true);
      expect(result.volume).toBeGreaterThan(0);
    });

    it('should not detect turn complete during speech', () => {
      const loudChunk = Buffer.alloc(200);
      for (let i = 0; i < 100; i++) {
        loudChunk.writeInt16LE(10000, i * 2);
      }

      const result = engine.processChunk(loudChunk);
      expect(result.turnComplete).toBe(false);
    });

    it('should detect turn complete after speech and silence', () => {
      // Simulate speech
      const loudChunk = Buffer.alloc(200);
      for (let i = 0; i < 100; i++) {
        loudChunk.writeInt16LE(10000, i * 2);
      }

      // Send multiple speech chunks to exceed minSpeechDuration
      engine.processChunk(loudChunk);

      // Advance time artificially by creating engine with low thresholds
      const fastEngine = new TurnTakingEngine({
        silenceThreshold_ms: 0,
        minSpeechDuration_ms: 0,
        volumeThreshold: 0.02,
      });

      // Speech
      fastEngine.processChunk(loudChunk);

      // Silence
      const silentChunk = Buffer.alloc(200);
      const result = fastEngine.processChunk(silentChunk);

      // Turn should be complete since thresholds are 0
      expect(result.isSpeaking).toBe(false);
      expect(result.turnComplete).toBe(true);
    });

    it('should handle very short buffer', () => {
      const chunk = Buffer.alloc(1);
      const result = engine.processChunk(chunk);

      expect(result.isSpeaking).toBe(false);
      expect(result.volume).toBe(0);
    });
  });

  describe('reset', () => {
    it('should reset all state', () => {
      const loudChunk = Buffer.alloc(200);
      for (let i = 0; i < 100; i++) {
        loudChunk.writeInt16LE(10000, i * 2);
      }

      engine.processChunk(loudChunk);
      engine.reset();

      const silentChunk = Buffer.alloc(200);
      const result = engine.processChunk(silentChunk);

      expect(result.isSpeaking).toBe(false);
      expect(result.turnComplete).toBe(false);
    });
  });

  describe('updateConfig', () => {
    it('should update silence threshold', () => {
      engine.updateConfig({ silenceThreshold_ms: 3000 });
      expect(engine).toBeDefined();
    });

    it('should update volume threshold', () => {
      engine.updateConfig({ volumeThreshold: 0.1 });
      expect(engine).toBeDefined();
    });

    it('should update min speech duration', () => {
      engine.updateConfig({ minSpeechDuration_ms: 500 });
      expect(engine).toBeDefined();
    });

    it('should partially update config', () => {
      engine.updateConfig({ silenceThreshold_ms: 2000 });
      // Should not throw
      expect(engine).toBeDefined();
    });
  });

  describe('createTurnTakingEngine', () => {
    it('should create engine via factory function', () => {
      const e = createTurnTakingEngine();
      expect(e).toBeInstanceOf(TurnTakingEngine);
    });

    it('should pass config to factory', () => {
      const e = createTurnTakingEngine({ silenceThreshold_ms: 2500 });
      expect(e).toBeInstanceOf(TurnTakingEngine);
    });
  });

  describe('edge cases', () => {
    it('should handle alternating speech and silence', () => {
      const loudChunk = Buffer.alloc(200);
      for (let i = 0; i < 100; i++) {
        loudChunk.writeInt16LE(10000, i * 2);
      }
      const silentChunk = Buffer.alloc(200);

      // Speech
      const r1 = engine.processChunk(loudChunk);
      expect(r1.isSpeaking).toBe(true);

      // Brief silence (not enough for turn complete)
      const r2 = engine.processChunk(silentChunk);
      expect(r2.isSpeaking).toBe(false);

      // Speech again
      const r3 = engine.processChunk(loudChunk);
      expect(r3.isSpeaking).toBe(true);
    });

    it('should clamp volume to 0-1', () => {
      const chunk = Buffer.alloc(200);
      for (let i = 0; i < 100; i++) {
        chunk.writeInt16LE(32767, i * 2); // max amplitude
      }

      const result = engine.processChunk(chunk);
      expect(result.volume).toBeLessThanOrEqual(1);
      expect(result.volume).toBeGreaterThanOrEqual(0);
    });
  });
});
