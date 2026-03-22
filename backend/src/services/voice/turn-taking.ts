/**
 * Turn-Taking Engine
 *
 * Voice Activity Detection (energy-based VAD) and turn-taking logic.
 * Determines when a user has finished speaking based on volume and silence duration.
 *
 * Phase 57: Real-Time Voice Pipeline
 */

// ============================================================
// Types
// ============================================================

export interface VADResult {
  isSpeaking: boolean;
  volume: number;       // 0.0 - 1.0
  silenceDuration_ms: number;
  turnComplete: boolean;
}

export interface TurnTakingConfig {
  silenceThreshold_ms: number;   // default 1500
  volumeThreshold: number;       // default 0.02
  minSpeechDuration_ms: number;  // default 300
}

// ============================================================
// Turn-Taking Engine
// ============================================================

export class TurnTakingEngine {
  private config: TurnTakingConfig;
  private lastSpeechTimestamp: number;
  private isSpeakingState: boolean;
  private speechStartTimestamp: number;
  private silenceStartTimestamp: number;

  constructor(config?: Partial<TurnTakingConfig>) {
    this.config = {
      silenceThreshold_ms: config?.silenceThreshold_ms ?? 1500,
      volumeThreshold: config?.volumeThreshold ?? 0.02,
      minSpeechDuration_ms: config?.minSpeechDuration_ms ?? 300,
    };
    this.lastSpeechTimestamp = 0;
    this.isSpeakingState = false;
    this.speechStartTimestamp = 0;
    this.silenceStartTimestamp = 0;
  }

  /**
   * Process an audio chunk and determine voice activity
   */
  processChunk(chunk: Buffer): VADResult {
    const now = Date.now();
    const volume = this.calculateVolume(chunk);
    const isSpeaking = volume > this.config.volumeThreshold;

    if (isSpeaking) {
      if (!this.isSpeakingState) {
        // Speech started
        this.speechStartTimestamp = now;
        this.isSpeakingState = true;
      }
      this.lastSpeechTimestamp = now;
      this.silenceStartTimestamp = 0;

      return {
        isSpeaking: true,
        volume,
        silenceDuration_ms: 0,
        turnComplete: false,
      };
    }

    // Not speaking
    if (this.isSpeakingState && this.silenceStartTimestamp === 0) {
      // Silence just started after speech
      this.silenceStartTimestamp = now;
    }

    const silenceDuration = this.silenceStartTimestamp > 0
      ? now - this.silenceStartTimestamp
      : 0;

    // Check if turn is complete:
    // 1. Was speaking before
    // 2. Speech was long enough (not a noise spike)
    // 3. Silence exceeds threshold
    const speechDuration = this.lastSpeechTimestamp - this.speechStartTimestamp;
    const turnComplete =
      this.isSpeakingState &&
      speechDuration >= this.config.minSpeechDuration_ms &&
      silenceDuration >= this.config.silenceThreshold_ms;

    if (turnComplete) {
      // Reset state after turn completion
      this.isSpeakingState = false;
      this.silenceStartTimestamp = 0;
    }

    return {
      isSpeaking: false,
      volume,
      silenceDuration_ms: silenceDuration,
      turnComplete,
    };
  }

  /**
   * Calculate RMS volume from audio buffer (16-bit PCM assumed)
   */
  private calculateVolume(chunk: Buffer): number {
    if (chunk.length < 2) {return 0;}

    let sumSquares = 0;
    const numSamples = Math.floor(chunk.length / 2);

    for (let i = 0; i < numSamples; i++) {
      const sample = chunk.readInt16LE(i * 2);
      const normalized = sample / 32768; // normalize to -1..1
      sumSquares += normalized * normalized;
    }

    const rms = Math.sqrt(sumSquares / numSamples);
    return Math.min(1, rms); // clamp to 0..1
  }

  /**
   * Reset state for new session
   */
  reset(): void {
    this.lastSpeechTimestamp = 0;
    this.isSpeakingState = false;
    this.speechStartTimestamp = 0;
    this.silenceStartTimestamp = 0;
  }

  /**
   * Update config
   */
  updateConfig(config: Partial<TurnTakingConfig>): void {
    if (config.silenceThreshold_ms !== undefined) {
      this.config.silenceThreshold_ms = config.silenceThreshold_ms;
    }
    if (config.volumeThreshold !== undefined) {
      this.config.volumeThreshold = config.volumeThreshold;
    }
    if (config.minSpeechDuration_ms !== undefined) {
      this.config.minSpeechDuration_ms = config.minSpeechDuration_ms;
    }
  }
}

export function createTurnTakingEngine(config?: Partial<TurnTakingConfig>): TurnTakingEngine {
  return new TurnTakingEngine(config);
}
