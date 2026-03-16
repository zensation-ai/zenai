/**
 * Local Inference Service - Phase 74
 *
 * Provides local, in-browser inference for latency-critical operations.
 * Uses a provider abstraction that allows plugging in WebLLM or other
 * ML runtimes later. Ships with a HeuristicProvider that uses pure JS
 * (regex, keyword lists) for zero-dependency local inference.
 */

// ---------------------------------------------------------------------------
// Provider Interface
// ---------------------------------------------------------------------------

export interface LocalInferenceProvider {
  readonly name: string;
  isAvailable(): boolean;
  init(options?: { onProgress?: (progress: number) => void }): Promise<boolean>;
  classifyIntent(query: string): Promise<'chat' | 'search' | 'action' | 'code'>;
  generateEmbedding(text: string): Promise<number[]>;
  analyzeSentiment(text: string): Promise<{ score: number; label: string }>;
  summarize(text: string, maxLength?: number): Promise<string>;
  dispose(): Promise<void>;
}

export type InferenceStatus = 'idle' | 'loading' | 'ready' | 'error';

// ---------------------------------------------------------------------------
// WebGPU availability check
// ---------------------------------------------------------------------------

export function isWebGPUAvailable(): boolean {
  try {
    return typeof navigator !== 'undefined' && 'gpu' in navigator;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Keyword / word lists for heuristic inference
// ---------------------------------------------------------------------------

const INTENT_PATTERNS: Record<'search' | 'action' | 'code', RegExp[]> = {
  search: [
    /\b(such|find|google|recherch|wo\s|was\s(ist|sind|war)|wer\s(ist|war)|wie\s(viel|lang|weit))\b/i,
    /\b(search|find|lookup|look\sup|where|what\sis|who\sis|how\s(many|much|long|far))\b/i,
    /\?$/,
  ],
  action: [
    /\b(erstell|anlegen|losch|entfern|sende|schick|speicher|aktualisier|andere|offne|starte|stopp)\b/i,
    /\b(create|delete|remove|send|save|update|change|open|start|stop|set|add|move|run)\b/i,
  ],
  code: [
    /\b(code|function|class|import|export|const\s|let\s|var\s|def\s|return\s|console\.log|print\()\b/i,
    /\b(programmier|implementier|debug|refactor|bug|fehler\s(im|in)\scode|typescript|javascript|python|rust)\b/i,
    /```/,
    /\b(algorithm|regex|sql|api|endpoint|component|hook|middleware)\b/i,
  ],
};

const POSITIVE_WORDS = new Set([
  // German
  'gut', 'super', 'toll', 'prima', 'wunderbar', 'ausgezeichnet', 'fantastisch',
  'hervorragend', 'klasse', 'spitze', 'genial', 'perfekt', 'liebe', 'freude',
  'gluecklich', 'zufrieden', 'begeistert', 'dankbar', 'positiv', 'schoen',
  'freundlich', 'hilfreich', 'interessant', 'beeindruckend', 'grossartig',
  // English
  'good', 'great', 'excellent', 'amazing', 'wonderful', 'fantastic', 'awesome',
  'perfect', 'love', 'happy', 'glad', 'thankful', 'grateful', 'positive',
  'beautiful', 'helpful', 'interesting', 'impressive', 'brilliant', 'nice',
]);

const NEGATIVE_WORDS = new Set([
  // German
  'schlecht', 'furchtbar', 'schrecklich', 'miserabel', 'katastrophal', 'hass',
  'wut', 'aerger', 'traurig', 'enttaeuscht', 'frustriert', 'nervig', 'dumm',
  'langweilig', 'nutzlos', 'kaputt', 'fehler', 'problem', 'falsch', 'negativ',
  // English
  'bad', 'terrible', 'horrible', 'awful', 'hate', 'angry', 'sad', 'disappointed',
  'frustrated', 'annoying', 'stupid', 'boring', 'useless', 'broken', 'error',
  'problem', 'wrong', 'negative', 'fail', 'worst',
]);

// ---------------------------------------------------------------------------
// HeuristicProvider - Pure JS, no ML dependencies
// ---------------------------------------------------------------------------

export class HeuristicProvider implements LocalInferenceProvider {
  readonly name = 'heuristic';

  isAvailable(): boolean {
    return true; // Always available - pure JS
  }

  async init(options?: { onProgress?: (progress: number) => void }): Promise<boolean> {
    options?.onProgress?.(1);
    return true;
  }

  async classifyIntent(query: string): Promise<'chat' | 'search' | 'action' | 'code'> {
    const trimmed = query.trim();

    // Check code first (most specific)
    if (INTENT_PATTERNS.code.some(p => p.test(trimmed))) return 'code';
    // Then action
    if (INTENT_PATTERNS.action.some(p => p.test(trimmed))) return 'action';
    // Then search
    if (INTENT_PATTERNS.search.some(p => p.test(trimmed))) return 'search';

    return 'chat';
  }

  async generateEmbedding(text: string): Promise<number[]> {
    // Simple bag-of-characters hash embedding (64 dims).
    // NOT semantically meaningful -- placeholder for a real model.
    const dims = 64;
    const vec = new Array<number>(dims).fill(0);
    const normalized = text.toLowerCase();
    for (let i = 0; i < normalized.length; i++) {
      const code = normalized.charCodeAt(i);
      vec[i % dims] += code;
    }
    // L2 normalise
    const mag = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
    return vec.map(v => v / mag);
  }

  async analyzeSentiment(text: string): Promise<{ score: number; label: string }> {
    const words = text
      .toLowerCase()
      .replace(/[^a-zäöüß\s]/g, '')
      .split(/\s+/)
      .filter(Boolean);

    let positiveCount = 0;
    let negativeCount = 0;

    for (const word of words) {
      if (POSITIVE_WORDS.has(word)) positiveCount++;
      if (NEGATIVE_WORDS.has(word)) negativeCount++;
    }

    const total = positiveCount + negativeCount;
    if (total === 0) return { score: 0, label: 'neutral' };

    // Score from -1 (very negative) to +1 (very positive)
    const score = (positiveCount - negativeCount) / total;

    let label: string;
    if (score > 0.3) label = 'positive';
    else if (score < -0.3) label = 'negative';
    else label = 'neutral';

    return { score: Math.round(score * 100) / 100, label };
  }

  async summarize(text: string, maxLength = 200): Promise<string> {
    // Extract first N sentences that fit within maxLength
    const sentences = text
      .replace(/\n+/g, ' ')
      .split(/(?<=[.!?])\s+/)
      .filter(s => s.trim().length > 0);

    if (sentences.length === 0) return text.slice(0, maxLength);

    let summary = '';
    for (const sentence of sentences) {
      const candidate = summary ? `${summary} ${sentence}` : sentence;
      if (candidate.length > maxLength && summary.length > 0) break;
      summary = candidate;
    }

    return summary || text.slice(0, maxLength);
  }

  async dispose(): Promise<void> {
    // Nothing to clean up
  }
}

// ---------------------------------------------------------------------------
// LocalInferenceService singleton
// ---------------------------------------------------------------------------

class LocalInferenceService {
  private provider: LocalInferenceProvider;
  private _status: InferenceStatus = 'idle';
  private _webGPUAvailable: boolean;

  constructor() {
    this.provider = new HeuristicProvider();
    this._webGPUAvailable = isWebGPUAvailable();
  }

  get status(): InferenceStatus {
    return this._status;
  }

  get isReady(): boolean {
    return this._status === 'ready';
  }

  get webGPUAvailable(): boolean {
    return this._webGPUAvailable;
  }

  get providerName(): string {
    return this.provider.name;
  }

  /**
   * Replace the current provider (e.g., swap in a WebLLM provider).
   * Disposes the old provider and initialises the new one.
   */
  async setProvider(provider: LocalInferenceProvider, options?: { onProgress?: (progress: number) => void }): Promise<boolean> {
    await this.provider.dispose();
    this.provider = provider;
    return this.init(options);
  }

  async init(options?: { onProgress?: (progress: number) => void }): Promise<boolean> {
    if (this._status === 'ready') return true;

    this._status = 'loading';
    try {
      const ok = await this.provider.init(options);
      this._status = ok ? 'ready' : 'error';
      return ok;
    } catch {
      this._status = 'error';
      return false;
    }
  }

  async classifyIntent(query: string): Promise<'chat' | 'search' | 'action' | 'code'> {
    if (this._status !== 'ready') await this.init();
    return this.provider.classifyIntent(query);
  }

  async generateEmbedding(text: string): Promise<number[]> {
    if (this._status !== 'ready') await this.init();
    return this.provider.generateEmbedding(text);
  }

  async analyzeSentiment(text: string): Promise<{ score: number; label: string }> {
    if (this._status !== 'ready') await this.init();
    return this.provider.analyzeSentiment(text);
  }

  async summarize(text: string, maxLength?: number): Promise<string> {
    if (this._status !== 'ready') await this.init();
    return this.provider.summarize(text, maxLength);
  }

  async dispose(): Promise<void> {
    await this.provider.dispose();
    this._status = 'idle';
  }
}

/** Global singleton */
export const localInference = new LocalInferenceService();

// ---------------------------------------------------------------------------
// Phase 94: On-Device AI Enhanced Provider Bridge
// ---------------------------------------------------------------------------

/**
 * OnDeviceEnhancedProvider wraps the Phase 94 on-device-ai service
 * as a LocalInferenceProvider for backward compatibility.
 */
export class OnDeviceEnhancedProvider implements LocalInferenceProvider {
  readonly name = 'on-device-enhanced';
  private onDeviceAI: typeof import('./on-device-ai').onDeviceAI | null = null;

  isAvailable(): boolean {
    return true; // Always available (pure JS fallbacks)
  }

  async init(options?: { onProgress?: (progress: number) => void }): Promise<boolean> {
    try {
      const mod = await import('./on-device-ai');
      this.onDeviceAI = mod.onDeviceAI;
      await this.onDeviceAI.init();
      options?.onProgress?.(1);
      return true;
    } catch {
      options?.onProgress?.(1);
      return false;
    }
  }

  async classifyIntent(query: string): Promise<'chat' | 'search' | 'action' | 'code'> {
    if (!this.onDeviceAI) return 'chat';
    const intent = await this.onDeviceAI.classifyIntent(query);
    // Map extended categories to the 4 basic ones
    switch (intent) {
      case 'search':
      case 'question':
        return 'search';
      case 'command':
        return 'action';
      case 'code':
        return 'code';
      default:
        return 'chat';
    }
  }

  async generateEmbedding(text: string): Promise<number[]> {
    if (!this.onDeviceAI) return new Array(64).fill(0);
    return this.onDeviceAI.generateEmbedding(text);
  }

  async analyzeSentiment(text: string): Promise<{ score: number; label: string }> {
    if (!this.onDeviceAI) return { score: 0, label: 'neutral' };
    const result = await this.onDeviceAI.analyzeSentiment(text);
    return { score: result.score, label: result.label };
  }

  async summarize(text: string, maxLength?: number): Promise<string> {
    if (!this.onDeviceAI) return text.slice(0, maxLength ?? 200);
    // Convert maxLength to approximate sentence count
    const maxSentences = maxLength ? Math.max(1, Math.floor(maxLength / 80)) : 3;
    return this.onDeviceAI.summarize(text, maxSentences);
  }

  async dispose(): Promise<void> {
    this.onDeviceAI = null;
  }
}
