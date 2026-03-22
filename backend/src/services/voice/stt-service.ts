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

    const response = await fetch('https://api.deepgram.com/v1/listen?model=nova-2&language=' + language, {
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
    const preferred = this.providers.get(preferredName);

    // Try preferred provider first
    if (preferred && preferred.isAvailable()) {
      try {
        return await preferred.transcribe(audio, options);
      } catch (error) {
        logger.warn(`STT provider ${preferredName} failed, trying fallback`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Fallback to any available provider
    for (const [name, provider] of this.providers) {
      if (name !== preferredName && provider.isAvailable()) {
        try {
          return await provider.transcribe(audio, options);
        } catch (error) {
          logger.warn(`STT fallback provider ${name} also failed`, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    throw new Error('No STT provider available');
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
