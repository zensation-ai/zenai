/**
 * Speech-to-Text Service
 *
 * Multi-provider STT with fallback support.
 * Providers: Whisper (OpenAI API), Deepgram (optional).
 *
 * Phase 57: Real-Time Voice Pipeline
 */

import { logger } from '../../utils/logger';
import { transcribeWithOpenAI, isOpenAIAvailable } from '../openai';
import { checkedFetch } from '../../utils/checked-http';
import { recordVoicePhase, recordFailover } from './voice-metrics';
import { getTracer } from '../observability/tracing';
import {
  buildProviderPriority,
  classifyProviderError,
  PROVIDER_TIMEOUT_MS,
  sttCircuitBreaker,
  withProviderTimeout,
} from './provider-registry';

// ============================================================
// Types
// ============================================================

export interface STTResult {
  text: string;
  language: string;
  confidence: number;
  duration_ms: number;
  provider: string;
}

export interface STTProvider {
  name: string;
  transcribe(audio: Buffer, options?: { language?: string; format?: string }): Promise<STTResult>;
  isAvailable(): boolean;
}

// ============================================================
// Whisper Provider (OpenAI API)
// ============================================================

class WhisperProvider implements STTProvider {
  name = 'whisper';

  async transcribe(audio: Buffer, options?: { language?: string; format?: string }): Promise<STTResult> {
    const format = options?.format || 'webm';
    const filename = `audio.${format}`;
    const startTime = Date.now();

    const result = await transcribeWithOpenAI(audio, filename);

    return {
      text: result.text,
      language: result.language || options?.language || 'de',
      confidence: 0.95, // Whisper does not return confidence; assume high
      duration_ms: Date.now() - startTime,
      provider: 'whisper',
    };
  }

  isAvailable(): boolean {
    return isOpenAIAvailable();
  }
}

// ============================================================
// Deepgram Provider (optional)
// ============================================================

class DeepgramProvider implements STTProvider {
  name = 'deepgram';
  private apiKey: string | undefined;

  constructor() {
    this.apiKey = process.env.DEEPGRAM_API_KEY;
  }

  async transcribe(audio: Buffer, options?: { language?: string; format?: string }): Promise<STTResult> {
    if (!this.apiKey) {
      throw new Error('Deepgram API key not configured');
    }

    const startTime = Date.now();
    const language = options?.language || 'de';

    const response = await checkedFetch('https://api.deepgram.com/v1/listen?model=nova-2&language=' + language, {
      method: 'POST',
      headers: {
        'Authorization': `Token ${this.apiKey}`,
        'Content-Type': 'audio/webm',
      },
      body: audio,
    });

    if (!response.ok) {
      throw new Error(`Deepgram API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as {
      results?: {
        channels?: Array<{
          alternatives?: Array<{
            transcript?: string;
            confidence?: number;
          }>;
        }>;
      };
      metadata?: { duration?: number };
    };

    const alternative = data?.results?.channels?.[0]?.alternatives?.[0];

    return {
      text: alternative?.transcript || '',
      language,
      confidence: alternative?.confidence || 0,
      duration_ms: Date.now() - startTime,
      provider: 'deepgram',
    };
  }

  isAvailable(): boolean {
    return !!this.apiKey;
  }
}

// ============================================================
// STT Service
// ============================================================

export class STTService {
  private providers: Map<string, STTProvider>;
  private defaultProvider: string;

  constructor() {
    this.providers = new Map();

    const whisper = new WhisperProvider();
    this.providers.set('whisper', whisper);

    const deepgram = new DeepgramProvider();
    this.providers.set('deepgram', deepgram);

    // Default: whisper if available, else deepgram
    if (whisper.isAvailable()) {
      this.defaultProvider = 'whisper';
    } else if (deepgram.isAvailable()) {
      this.defaultProvider = 'deepgram';
    } else {
      this.defaultProvider = 'whisper'; // fallback label
    }
  }

  async transcribe(
    audio: Buffer,
    options?: { language?: string; provider?: string; format?: string }
  ): Promise<STTResult> {
    const preferredName = options?.provider || this.defaultProvider;
    const tracer = getTracer('voice');

    return tracer.startActiveSpan('voice.stt.transcribe', async (span) => {
      span.setAttributes({
        'voice.phase': 'stt',
        'voice.provider.preferred': preferredName,
        'voice.audio.bytes': audio.length,
      });

      const priority = buildProviderPriority(this.providers, preferredName);
      const trail: Array<{ provider: string; reason: string }> = [];
      let lastError: unknown;

      for (const [name, provider] of priority) {
        if (!provider.isAvailable()) {
          trail.push({ provider: name, reason: 'unavailable' });
          continue;
        }
        if (sttCircuitBreaker.isOpen(name)) {
          trail.push({ provider: name, reason: 'breaker_open' });
          continue;
        }

        const start = Date.now();
        try {
          const result = await withProviderTimeout(
            provider.transcribe(audio, options),
            PROVIDER_TIMEOUT_MS,
            name,
          );
          const duration = Date.now() - start;
          const usedFallback = trail.length > 0;
          sttCircuitBreaker.recordSuccess(name);
          recordVoicePhase('stt', duration, {
            provider: name,
            outcome: usedFallback ? 'fallback' : 'ok',
          });
          if (usedFallback) {
            recordFailover(preferredName, name, trail[0].reason);
          }
          span.setAttributes({
            'voice.provider.used': name,
            'voice.stt.duration_ms': duration,
            'voice.stt.outcome': usedFallback ? 'fallback' : 'ok',
          });
          span.end();
          return result;
        } catch (error) {
          const duration = Date.now() - start;
          const { classification, reason } = classifyProviderError(error);
          recordVoicePhase('stt', duration, { provider: name, outcome: 'error' });
          logger.warn(`STT provider ${name} failed`, {
            error: error instanceof Error ? error.message : String(error),
            classification,
            reason,
          });
          trail.push({ provider: name, reason });
          lastError = error;

          if (classification === 'non_retryable') {
            span.setStatus({ code: 2, message: `STT failed (non-retryable): ${reason}` });
            span.setAttributes({
              'voice.provider.used': name,
              'voice.stt.outcome': 'error',
              'voice.stt.failure_reason': reason,
            });
            span.end();
            throw error;
          }

          // Retryable failure → count toward breaker
          sttCircuitBreaker.recordFailure(name);
        }
      }

      const summary = trail.map((t) => `${t.provider}:${t.reason}`).join(',');
      span.setStatus({ code: 2, message: `All STT providers failed: ${summary}` });
      span.setAttribute('voice.stt.failure_trail', summary);
      span.end();
      throw lastError instanceof Error
        ? lastError
        : new Error(`No STT provider succeeded (tried: ${summary || 'none'})`);
    });
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

export const sttService = new STTService();
