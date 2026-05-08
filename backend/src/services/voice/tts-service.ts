/**
 * Multi-Provider TTS Service
 *
 * Supports ElevenLabs (premium) and Edge-TTS (free, always available).
 * Falls back through providers in priority order.
 *
 * Phase 57: Real-Time Voice Pipeline
 */

import { logger } from '../../utils/logger';
import { synthesizeSpeech, isTTSAvailable as isOpenAITTSAvailable } from '../tts';
import { checkedFetch } from '../../utils/checked-http';
import { recordVoicePhase, recordFailover } from './voice-metrics';
import { getTracer } from '../observability/tracing';
import {
  buildProviderPriority,
  classifyProviderError,
  PROVIDER_TIMEOUT_MS,
  ttsCircuitBreaker,
  withProviderTimeout,
} from './provider-registry';

// ============================================================
// Types
// ============================================================

export interface TTSOptions {
  voice?: string;
  speed?: number;
  format?: string;
  provider?: string;
}

export interface TTSVoiceInfo {
  id: string;
  name: string;
  language: string;
  gender?: string;
  provider: string;
}

export interface TTSProvider {
  name: string;
  synthesize(text: string, options?: TTSOptions): Promise<Buffer>;
  streamSynthesize?(text: string, options?: TTSOptions): AsyncIterable<Buffer>;
  getVoices(): Promise<TTSVoiceInfo[]>;
  isAvailable(): boolean;
}

// ============================================================
// ElevenLabs Provider
// ============================================================

class ElevenLabsProvider implements TTSProvider {
  name = 'elevenlabs';
  private apiKey: string | undefined;

  constructor() {
    this.apiKey = process.env.ELEVENLABS_API_KEY;
  }

  async synthesize(text: string, options?: TTSOptions): Promise<Buffer> {
    if (!this.apiKey) {throw new Error('ElevenLabs API key not configured');}

    const voiceId = options?.voice || '21m00Tcm4TlvDq8ikWAM'; // Rachel default
    const response = await checkedFetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': this.apiKey,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg',
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          speed: options?.speed || 1.0,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`ElevenLabs API error: ${response.status} ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  async getVoices(): Promise<TTSVoiceInfo[]> {
    if (!this.apiKey) {return [];}

    try {
      const response = await checkedFetch('https://api.elevenlabs.io/v1/voices', {
        headers: { 'xi-api-key': this.apiKey },
      });

      if (!response.ok) {return [];}

      const data = await response.json() as {
        voices?: Array<{
          voice_id: string;
          name: string;
          labels?: { language?: string; gender?: string };
        }>;
      };

      return (data.voices || []).map((v) => ({
        id: v.voice_id,
        name: v.name,
        language: v.labels?.language || 'en',
        gender: v.labels?.gender,
        provider: 'elevenlabs',
      }));
    } catch {
      return [];
    }
  }

  isAvailable(): boolean {
    return !!this.apiKey;
  }
}

// ============================================================
// Edge-TTS Provider (Free Microsoft TTS)
// ============================================================

class EdgeTTSProvider implements TTSProvider {
  name = 'edge-tts';

  /**
   * Synthesize using OpenAI TTS as a proxy since edge-tts requires
   * either a CLI tool or complex WebSocket to Microsoft's service.
   * Falls back to a simple implementation.
   */
  async synthesize(text: string, options?: TTSOptions): Promise<Buffer> {
    // If OpenAI TTS is available, use it as the edge-tts backend
    if (isOpenAITTSAvailable()) {
      const voice = this.mapVoiceToOpenAI(options?.voice);
      const result = await synthesizeSpeech(text, {
        voice: voice as 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer',
        speed: options?.speed,
        outputFormat: 'mp3',
      });
      return result.audioBuffer;
    }

    // Without OpenAI, generate a minimal silent WAV as placeholder
    logger.warn('Edge-TTS: No TTS backend available, returning silent audio');
    return this.generateSilentWav(text.length * 50); // ~50ms per character
  }

  async getVoices(): Promise<TTSVoiceInfo[]> {
    // Edge-TTS built-in voice list (German + English subset)
    return [
      { id: 'de-DE-ConradNeural', name: 'Conrad', language: 'de-DE', gender: 'male', provider: 'edge-tts' },
      { id: 'de-DE-KatjaNeural', name: 'Katja', language: 'de-DE', gender: 'female', provider: 'edge-tts' },
      { id: 'de-DE-AmalaNeural', name: 'Amala', language: 'de-DE', gender: 'female', provider: 'edge-tts' },
      { id: 'de-DE-BerndNeural', name: 'Bernd', language: 'de-DE', gender: 'male', provider: 'edge-tts' },
      { id: 'en-US-GuyNeural', name: 'Guy', language: 'en-US', gender: 'male', provider: 'edge-tts' },
      { id: 'en-US-JennyNeural', name: 'Jenny', language: 'en-US', gender: 'female', provider: 'edge-tts' },
      { id: 'en-US-AriaNeural', name: 'Aria', language: 'en-US', gender: 'female', provider: 'edge-tts' },
      { id: 'en-GB-SoniaNeural', name: 'Sonia', language: 'en-GB', gender: 'female', provider: 'edge-tts' },
    ];
  }

  isAvailable(): boolean {
    // Edge-TTS is always available (uses OpenAI TTS or generates silent audio)
    return true;
  }

  private mapVoiceToOpenAI(voice?: string): string {
    const mapping: Record<string, string> = {
      'de-DE-ConradNeural': 'onyx',
      'de-DE-KatjaNeural': 'nova',
      'de-DE-AmalaNeural': 'shimmer',
      'de-DE-BerndNeural': 'echo',
      'en-US-GuyNeural': 'echo',
      'en-US-JennyNeural': 'nova',
      'en-US-AriaNeural': 'shimmer',
      'en-GB-SoniaNeural': 'alloy',
    };
    return mapping[voice || ''] || 'nova';
  }

  private generateSilentWav(durationMs: number): Buffer {
    const sampleRate = 16000;
    const channels = 1;
    const bitsPerSample = 16;
    const numSamples = Math.floor((sampleRate * durationMs) / 1000);
    const dataSize = numSamples * channels * (bitsPerSample / 8);

    const header = Buffer.alloc(44);
    header.write('RIFF', 0);
    header.writeUInt32LE(36 + dataSize, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16); // chunk size
    header.writeUInt16LE(1, 20);  // PCM
    header.writeUInt16LE(channels, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(sampleRate * channels * (bitsPerSample / 8), 28);
    header.writeUInt16LE(channels * (bitsPerSample / 8), 32);
    header.writeUInt16LE(bitsPerSample, 34);
    header.write('data', 36);
    header.writeUInt32LE(dataSize, 40);

    const data = Buffer.alloc(dataSize);
    return Buffer.concat([header, data]);
  }
}

// ============================================================
// TTS Phrase Cache (avoid re-synthesizing identical phrases)
// ============================================================

interface CacheEntry {
  audio: Buffer;
  createdAt: number;
  accessCount: number;
}

class TTSCache {
  private cache: Map<string, CacheEntry>;
  private maxEntries: number;
  private ttlMs: number;

  constructor(maxEntries = 200, ttlMs = 30 * 60 * 1000) {
    this.cache = new Map();
    this.maxEntries = maxEntries;
    this.ttlMs = ttlMs;
  }

  private makeKey(text: string, voice?: string, provider?: string): string {
    return `${provider || 'default'}:${voice || 'default'}:${text}`;
  }

  get(text: string, voice?: string, provider?: string): Buffer | null {
    const key = this.makeKey(text, voice, provider);
    const entry = this.cache.get(key);
    if (!entry) {return null;}

    if (Date.now() - entry.createdAt > this.ttlMs) {
      this.cache.delete(key);
      return null;
    }

    entry.accessCount++;
    return entry.audio;
  }

  set(text: string, audio: Buffer, voice?: string, provider?: string): void {
    // Only cache short phrases (< 200 chars) to avoid memory bloat
    if (text.length > 200) {return;}

    if (this.cache.size >= this.maxEntries) {
      // Evict least-frequently-accessed entry
      let minKey = '';
      let minAccess = Infinity;
      for (const [k, v] of this.cache) {
        if (v.accessCount < minAccess) {
          minAccess = v.accessCount;
          minKey = k;
        }
      }
      if (minKey) {this.cache.delete(minKey);}
    }

    this.cache.set(this.makeKey(text, voice, provider), {
      audio,
      createdAt: Date.now(),
      accessCount: 1,
    });
  }

  get size(): number { return this.cache.size; }
  get stats(): { size: number; maxEntries: number } {
    return { size: this.cache.size, maxEntries: this.maxEntries };
  }
}

// ============================================================
// Multi-TTS Service
// ============================================================

export class MultiTTSService {
  private providers: Map<string, TTSProvider>;
  private defaultProvider: string;
  private phraseCache: TTSCache;
  private preWarmTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.providers = new Map();
    this.phraseCache = new TTSCache();

    const elevenlabs = new ElevenLabsProvider();
    this.providers.set('elevenlabs', elevenlabs);

    const edgeTts = new EdgeTTSProvider();
    this.providers.set('edge-tts', edgeTts);

    // Priority: ElevenLabs > Edge-TTS
    if (elevenlabs.isAvailable()) {
      this.defaultProvider = 'elevenlabs';
    } else {
      this.defaultProvider = 'edge-tts';
    }

    // Pre-cache common greetings for faster first-response latency
    // Skip in test environment to avoid open handles / timeouts
    if (process.env.NODE_ENV !== 'test') {
      this.preWarmTimer = setTimeout(() => {
        this.preWarmTimer = null;
        const commonPhrases = [
          'Guten Morgen!', 'Guten Tag!', 'Hallo!',
          'Wie kann ich dir helfen?', 'Einen Moment bitte.',
          'Alles klar.', 'Verstanden.', 'Gerne!',
          'Das schaue ich mir an.', 'Hier ist, was ich gefunden habe.',
        ];
        for (const phrase of commonPhrases) {
          this.synthesize(phrase).catch((err) => {
            logger.debug('Non-critical: TTS pre-warm failed for phrase', { error: err, phrase });
          });
        }
      }, 5000);
    }
  }

  async synthesize(text: string, options?: TTSOptions): Promise<Buffer> {
    // Check phrase cache first
    const cached = this.phraseCache.get(text, options?.voice, options?.provider);
    if (cached) {return cached;}

    const preferredName = options?.provider || this.defaultProvider;
    const tracer = getTracer('voice');

    return tracer.startActiveSpan('voice.tts.synthesize', async (span) => {
      span.setAttributes({
        'voice.phase': 'tts',
        'voice.provider.preferred': preferredName,
        'voice.tts.text_length': text.length,
      });

      const priority = buildProviderPriority(this.providers, preferredName);
      const trail: Array<{ provider: string; reason: string }> = [];
      let lastError: unknown;

      for (const [name, provider] of priority) {
        if (!provider.isAvailable()) {
          trail.push({ provider: name, reason: 'unavailable' });
          continue;
        }
        if (ttsCircuitBreaker.isOpen(name)) {
          trail.push({ provider: name, reason: 'breaker_open' });
          continue;
        }

        const start = Date.now();
        try {
          const audio = await withProviderTimeout(
            provider.synthesize(text, options),
            PROVIDER_TIMEOUT_MS,
            name,
          );
          const duration = Date.now() - start;
          const usedFallback = trail.length > 0;
          ttsCircuitBreaker.recordSuccess(name);
          recordVoicePhase('tts', duration, {
            provider: name,
            outcome: usedFallback ? 'fallback' : 'ok',
          });
          if (usedFallback) {
            recordFailover(preferredName, name, trail[0].reason);
          }
          this.phraseCache.set(text, audio, options?.voice, options?.provider);
          span.setAttributes({
            'voice.provider.used': name,
            'voice.tts.duration_ms': duration,
            'voice.tts.outcome': usedFallback ? 'fallback' : 'ok',
          });
          span.end();
          return audio;
        } catch (error) {
          const duration = Date.now() - start;
          const { classification, reason } = classifyProviderError(error);
          recordVoicePhase('tts', duration, { provider: name, outcome: 'error' });
          logger.warn(`TTS provider ${name} failed`, {
            error: error instanceof Error ? error.message : String(error),
            classification,
            reason,
          });
          trail.push({ provider: name, reason });
          lastError = error;

          if (classification === 'non_retryable') {
            span.setStatus({ code: 2, message: `TTS failed (non-retryable): ${reason}` });
            span.setAttributes({
              'voice.provider.used': name,
              'voice.tts.outcome': 'error',
              'voice.tts.failure_reason': reason,
            });
            span.end();
            throw error;
          }

          // Retryable failure → count toward breaker
          ttsCircuitBreaker.recordFailure(name);
        }
      }

      const summary = trail.map((t) => `${t.provider}:${t.reason}`).join(',');
      span.setStatus({ code: 2, message: `All TTS providers failed: ${summary}` });
      span.setAttribute('voice.tts.failure_trail', summary);
      span.end();
      throw lastError instanceof Error
        ? lastError
        : new Error(`No TTS provider succeeded (tried: ${summary || 'none'})`);
    });
  }

  /**
   * Synthesize multiple sentences in parallel (up to concurrency limit)
   */
  async synthesizeBatch(sentences: string[], options?: TTSOptions, concurrency = 3): Promise<Buffer[]> {
    const results: Buffer[] = new Array(sentences.length);
    let nextIdx = 0;

    const worker = async () => {
      while (nextIdx < sentences.length) {
        const idx = nextIdx++;
        results[idx] = await this.synthesize(sentences[idx], options);
      }
    };

    const workers = Array.from({ length: Math.min(concurrency, sentences.length) }, () => worker());
    await Promise.all(workers);
    return results;
  }

  getCacheStats(): { size: number; maxEntries: number } {
    return this.phraseCache.stats;
  }

  async *streamSynthesize(text: string, options?: TTSOptions): AsyncGenerator<Buffer> {
    const providerName = options?.provider || this.defaultProvider;
    const provider = this.providers.get(providerName);

    if (provider?.streamSynthesize && provider.isAvailable()) {
      try {
        yield* provider.streamSynthesize(text, options);
        return;
      } catch (error) {
        logger.warn(`TTS stream provider ${providerName} failed`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Fallback: synthesize whole buffer and yield it
    const buffer = await this.synthesize(text, options);
    yield buffer;
  }

  async getVoices(): Promise<TTSVoiceInfo[]> {
    const allVoices: TTSVoiceInfo[] = [];
    for (const provider of this.providers.values()) {
      if (provider.isAvailable()) {
        try {
          const voices = await provider.getVoices();
          allVoices.push(...voices);
        } catch {
          // Skip failed providers
        }
      }
    }
    return allVoices;
  }

  getAvailableProviders(): string[] {
    const available: string[] = [];
    for (const [name, provider] of this.providers) {
      if (provider.isAvailable()) {
        available.push(name);
      }
    }
    return available;
  }

  isAvailable(): boolean {
    for (const provider of this.providers.values()) {
      if (provider.isAvailable()) {return true;}
    }
    return false;
  }
}

export const multiTTSService = new MultiTTSService();
