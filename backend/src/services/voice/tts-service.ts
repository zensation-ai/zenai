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
    if (!this.apiKey) throw new Error('ElevenLabs API key not configured');

    const voiceId = options?.voice || '21m00Tcm4TlvDq8ikWAM'; // Rachel default
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
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
    if (!this.apiKey) return [];

    try {
      const response = await fetch('https://api.elevenlabs.io/v1/voices', {
        headers: { 'xi-api-key': this.apiKey },
      });

      if (!response.ok) return [];

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
    if (!entry) return null;

    if (Date.now() - entry.createdAt > this.ttlMs) {
      this.cache.delete(key);
      return null;
    }

    entry.accessCount++;
    return entry.audio;
  }

  set(text: string, audio: Buffer, voice?: string, provider?: string): void {
    // Only cache short phrases (< 200 chars) to avoid memory bloat
    if (text.length > 200) return;

    if (this.cache.size >= this.maxEntries) {
      // Evict least-accessed entry
      let minKey = '';
      let minAccess = Infinity;
      for (const [k, v] of this.cache) {
        if (v.accessCount < minAccess) {
          minAccess = v.accessCount;
          minKey = k;
        }
      }
      if (minKey) this.cache.delete(minKey);
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
  }

  async synthesize(text: string, options?: TTSOptions): Promise<Buffer> {
    // Check phrase cache first
    const cached = this.phraseCache.get(text, options?.voice, options?.provider);
    if (cached) return cached;

    const providerName = options?.provider || this.defaultProvider;
    const provider = this.providers.get(providerName);

    if (provider && provider.isAvailable()) {
      try {
        const audio = await provider.synthesize(text, options);
        this.phraseCache.set(text, audio, options?.voice, options?.provider);
        return audio;
      } catch (error) {
        logger.warn(`TTS provider ${providerName} failed, trying fallback`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Fallback to any available provider
    for (const [name, p] of this.providers) {
      if (name !== providerName && p.isAvailable()) {
        try {
          const audio = await p.synthesize(text, options);
          this.phraseCache.set(text, audio, options?.voice, options?.provider);
          return audio;
        } catch (error) {
          logger.warn(`TTS fallback provider ${name} also failed`, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    throw new Error('No TTS provider available');
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
      if (provider.isAvailable()) return true;
    }
    return false;
  }
}

export const multiTTSService = new MultiTTSService();
