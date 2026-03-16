/**
 * On-Device AI Service - Phase 94
 *
 * Comprehensive on-device AI inference layer:
 * - WebGPU detection and capability checking
 * - Multiple inference providers (all pure JS, no model download needed)
 * - Hybrid routing: simple queries -> on-device (< 100ms), complex -> cloud
 * - Privacy mode: "Nothing leaves my device"
 * - Progressive enhancement: no WebGPU -> cloud-only
 */

import {
  addToCorpus,
  getCorpus,
  getCachedResult,
  cacheResult,
  incrementStat,
  getVocabulary,
  updateVocabulary,
  type VocabEntry,
} from './on-device-storage';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RoutingDecision = 'on-device' | 'cloud';

export type IntentCategory =
  | 'greeting'
  | 'farewell'
  | 'question'
  | 'command'
  | 'search'
  | 'code'
  | 'creative'
  | 'analysis'
  | 'math'
  | 'translation'
  | 'summarize'
  | 'chat';

export interface SentimentResult {
  score: number; // -1 to 1
  label: 'positive' | 'negative' | 'neutral';
  confidence: number; // 0 to 1
}

export interface SummarySentence {
  text: string;
  score: number;
  index: number;
}

export interface OnDeviceCapabilities {
  webgpuAvailable: boolean;
  indexedDBAvailable: boolean;
  serviceWorkerAvailable: boolean;
  modelsReady: string[];
  privacyMode: boolean;
}

export interface OnDeviceAIConfig {
  privacyMode: boolean;
  maxCorpusSize: number;
  cacheTTLMs: number;
  complexityThreshold: number;
}

// ---------------------------------------------------------------------------
// WebGPU Detection
// ---------------------------------------------------------------------------

export function isWebGPUAvailable(): boolean {
  try {
    return typeof navigator !== 'undefined' && 'gpu' in navigator;
  } catch {
    return false;
  }
}

export function isIndexedDBAvailable(): boolean {
  try {
    return typeof indexedDB !== 'undefined';
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Intent Classifier (Pure JS, keyword patterns + TF-IDF scoring)
// ---------------------------------------------------------------------------

const INTENT_PATTERNS: Record<IntentCategory, RegExp[]> = {
  greeting: [
    /^(hi|hallo|hey|guten\s(morgen|tag|abend)|moin|servus|gruss)\b/i,
    /^(hello|good\s(morning|afternoon|evening)|howdy)\b/i,
  ],
  farewell: [
    /^(tschuess|auf\swiedersehen|bis\s(dann|bald|spaeter)|ciao|bye)\b/i,
    /^(goodbye|see\syou|later|farewell|take\scare)\b/i,
  ],
  question: [
    /\b(was\s(ist|sind|war|waren)|wer\s(ist|war)|wie\s(geht|funktioniert|heisst))\b/i,
    /\b(what\s(is|are|was|were)|who\s(is|was)|how\s(does|do|is|are))\b/i,
    /\?$/,
  ],
  command: [
    /^(erstell|anlegen|losch|entfern|sende|schick|speicher|aktualisier|offne|starte|stopp|zeig)\b/i,
    /^(create|delete|remove|send|save|update|open|start|stop|show|set|add|move|run)\b/i,
  ],
  search: [
    /\b(such\w*|find\w*|google\w*|recherch\w*|wo\s(ist|sind|gibt))\b/i,
    /\b(search|find|lookup|look\sup|where\s(is|are|can))\b/i,
  ],
  code: [
    /\b(code|function|class|import|export|const\s|let\s|var\s|def\s|return\s|console\.log|print\()\b/i,
    /\b(programmier|implementier|debug|refactor|bug|typescript|javascript|python|rust)\b/i,
    /```/,
    /\b(algorithm|regex|sql|api|endpoint|component|hook|middleware)\b/i,
  ],
  creative: [
    /\b(schreib|dicht|geschicht|gedicht|kreativ|erfindet|erzaehl)\b/i,
    /\b(write|compose|create\s(a\s)?(story|poem|song|essay)|imagine|invent)\b/i,
  ],
  analysis: [
    /\b(analysier|vergleich|bewert|evaluier|pro\s(und|&)\scontra)\b/i,
    /\b(analyze|compare|evaluate|assess|review|pros?\s(and|&)\scons?)\b/i,
  ],
  math: [
    /\b(berechn|kalkulier|wie\sviel\s(ist|sind)|addier|subtrahier|multiplizier|dividier)\b/i,
    /\b(calculate|compute|how\smuch|add|subtract|multiply|divide|equation)\b/i,
    /\d+\s*[+\-*/^]\s*\d+/,
  ],
  translation: [
    /\b(uebersetz|auf\s(deutsch|englisch|franzoesisch|spanisch))\b/i,
    /\b(translate|in\s(german|english|french|spanish|chinese|japanese))\b/i,
  ],
  summarize: [
    /\b(zusammenfass\w*|kurzfass\w*|ueberblick|tldr|kurz\sgesagt)\b/i,
    /\bfass\w*\b.{0,20}\bzusammen\b/i,
    /\b(summarize|summary|tl;?dr|brief\w*|overview|condense)\b/i,
  ],
  chat: [], // default fallback
};

export class IntentClassifier {
  classify(query: string): IntentCategory {
    const trimmed = query.trim();
    if (!trimmed) return 'chat';

    // Check patterns from most specific to least
    const orderedCategories: IntentCategory[] = [
      'code', 'math', 'translation', 'summarize', 'creative',
      'analysis', 'command', 'search', 'greeting', 'farewell', 'question',
    ];

    for (const category of orderedCategories) {
      const patterns = INTENT_PATTERNS[category];
      if (patterns.some(p => p.test(trimmed))) {
        return category;
      }
    }

    return 'chat';
  }

  /**
   * Get TF-IDF score for a term against the vocabulary.
   */
  tfidfScore(term: string, vocab: VocabEntry[]): number {
    const entry = vocab.find(v => v.term === term.toLowerCase());
    return entry?.idf ?? 0;
  }
}

// ---------------------------------------------------------------------------
// Sentiment Analyzer (keyword-based, extended)
// ---------------------------------------------------------------------------

const POSITIVE_WORDS = new Set([
  // German
  'gut', 'super', 'toll', 'prima', 'wunderbar', 'ausgezeichnet', 'fantastisch',
  'hervorragend', 'klasse', 'spitze', 'genial', 'perfekt', 'liebe', 'freude',
  'gluecklich', 'zufrieden', 'begeistert', 'dankbar', 'positiv', 'schoen',
  'freundlich', 'hilfreich', 'interessant', 'beeindruckend', 'grossartig',
  'wunderschoen', 'erstaunlich', 'brillant', 'exzellent', 'optimal',
  // English
  'good', 'great', 'excellent', 'amazing', 'wonderful', 'fantastic', 'awesome',
  'perfect', 'love', 'happy', 'glad', 'thankful', 'grateful', 'positive',
  'beautiful', 'helpful', 'interesting', 'impressive', 'brilliant', 'nice',
  'outstanding', 'superb', 'marvelous', 'delightful', 'terrific', 'splendid',
]);

const NEGATIVE_WORDS = new Set([
  // German
  'schlecht', 'furchtbar', 'schrecklich', 'miserabel', 'katastrophal', 'hass',
  'wut', 'aerger', 'traurig', 'enttaeuscht', 'frustriert', 'nervig', 'dumm',
  'langweilig', 'nutzlos', 'kaputt', 'fehler', 'problem', 'falsch', 'negativ',
  'schrecklich', 'entsetzlich', 'grauenhaft', 'unertraeglich', 'hoffnungslos',
  // English
  'bad', 'terrible', 'horrible', 'awful', 'hate', 'angry', 'sad', 'disappointed',
  'frustrated', 'annoying', 'stupid', 'boring', 'useless', 'broken', 'error',
  'problem', 'wrong', 'negative', 'fail', 'worst', 'ugly', 'disgusting',
  'pathetic', 'dreadful', 'miserable', 'hopeless',
]);

const INTENSIFIERS = new Set([
  'sehr', 'extrem', 'unglaublich', 'total', 'absolut', 'echt', 'wirklich',
  'very', 'extremely', 'incredibly', 'totally', 'absolutely', 'really', 'truly',
]);

const NEGATORS = new Set([
  'nicht', 'kein', 'keine', 'keiner', 'niemals', 'nie', 'kaum',
  'not', 'no', 'never', 'neither', 'nor', 'hardly', 'barely',
]);

export class SentimentAnalyzer {
  analyze(text: string): SentimentResult {
    const words = text
      .toLowerCase()
      .replace(/[^a-zaeoeueaouess\s]/g, '')
      .split(/\s+/)
      .filter(Boolean);

    if (words.length === 0) return { score: 0, label: 'neutral', confidence: 0 };

    let positiveScore = 0;
    let negativeScore = 0;
    let negateNext = false;
    let intensifyNext = false;

    for (const word of words) {
      if (NEGATORS.has(word)) {
        negateNext = true;
        continue;
      }
      if (INTENSIFIERS.has(word)) {
        intensifyNext = true;
        continue;
      }

      const multiplier = intensifyNext ? 1.5 : 1;
      intensifyNext = false;

      if (POSITIVE_WORDS.has(word)) {
        if (negateNext) {
          negativeScore += multiplier;
        } else {
          positiveScore += multiplier;
        }
      } else if (NEGATIVE_WORDS.has(word)) {
        if (negateNext) {
          positiveScore += multiplier;
        } else {
          negativeScore += multiplier;
        }
      }

      negateNext = false;
    }

    const total = positiveScore + negativeScore;
    if (total === 0) return { score: 0, label: 'neutral', confidence: 0 };

    const score = Math.round(((positiveScore - negativeScore) / total) * 100) / 100;
    const confidence = Math.min(total / words.length, 1);

    let label: SentimentResult['label'];
    if (score > 0.2) label = 'positive';
    else if (score < -0.2) label = 'negative';
    else label = 'neutral';

    return { score, label, confidence: Math.round(confidence * 100) / 100 };
  }
}

// ---------------------------------------------------------------------------
// Embedding Generator (TF-IDF vectors, placeholder for ONNX)
// ---------------------------------------------------------------------------

export class EmbeddingGenerator {
  private vocab: Map<string, number> = new Map();

  async loadVocab(): Promise<void> {
    const entries = await getVocabulary();
    this.vocab.clear();
    for (const entry of entries) {
      this.vocab.set(entry.term, entry.idf);
    }
  }

  async buildVocabulary(texts: string[]): Promise<void> {
    const totalDocs = texts.length;
    if (totalDocs === 0) return;

    const dfMap = new Map<string, number>();

    for (const text of texts) {
      const terms = new Set(this.tokenize(text));
      for (const term of terms) {
        dfMap.set(term, (dfMap.get(term) ?? 0) + 1);
      }
    }

    const vocabEntries: VocabEntry[] = [];
    for (const [term, df] of dfMap) {
      const idf = Math.log((totalDocs + 1) / (df + 1)) + 1;
      vocabEntries.push({ term, df, idf });
    }

    await updateVocabulary(vocabEntries);
    this.vocab.clear();
    for (const entry of vocabEntries) {
      this.vocab.set(entry.term, entry.idf);
    }
  }

  generate(text: string, dims = 64): number[] {
    const terms = this.tokenize(text);
    const vec = new Array<number>(dims).fill(0);

    // TF-IDF weighted hashing
    const tf = new Map<string, number>();
    for (const term of terms) {
      tf.set(term, (tf.get(term) ?? 0) + 1);
    }

    for (const [term, count] of tf) {
      const idf = this.vocab.get(term) ?? 1;
      const tfidf = (count / terms.length) * idf;
      // Hash term to a bucket
      let h = 0;
      for (let i = 0; i < term.length; i++) {
        h = ((h << 5) - h) + term.charCodeAt(i);
        h = h & h;
      }
      const bucket = Math.abs(h) % dims;
      vec[bucket] += tfidf;
    }

    // L2 normalize
    const mag = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
    return vec.map(v => Math.round((v / mag) * 10000) / 10000);
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^a-zaeoeueaouess0-9\s]/g, '')
      .split(/\s+/)
      .filter(t => t.length > 1);
  }
}

// ---------------------------------------------------------------------------
// Text Completer (Markov chain from user's past inputs)
// ---------------------------------------------------------------------------

export class TextCompleter {
  private chain: Map<string, Map<string, number>> = new Map();
  private trained = false;

  async train(): Promise<void> {
    const corpus = await getCorpus(200);
    if (corpus.length === 0) {
      this.trained = false;
      return;
    }

    this.chain.clear();
    const ORDER = 2; // bigram

    for (const entry of corpus) {
      const words = entry.text.split(/\s+/).filter(Boolean);
      for (let i = 0; i < words.length - ORDER; i++) {
        const key = words.slice(i, i + ORDER).join(' ').toLowerCase();
        const next = words[i + ORDER];

        if (!this.chain.has(key)) {
          this.chain.set(key, new Map());
        }
        const followers = this.chain.get(key)!;
        followers.set(next, (followers.get(next) ?? 0) + 1);
      }
    }

    this.trained = this.chain.size > 0;
  }

  complete(prefix: string, maxWords = 10): string {
    if (!this.trained || this.chain.size === 0) return '';

    const words = prefix.trim().split(/\s+/).filter(Boolean);
    if (words.length < 2) return '';

    const result: string[] = [];
    let currentKey = words.slice(-2).join(' ').toLowerCase();

    for (let i = 0; i < maxWords; i++) {
      const followers = this.chain.get(currentKey);
      if (!followers || followers.size === 0) break;

      // Pick weighted random
      const total = Array.from(followers.values()).reduce((s, v) => s + v, 0);
      let rand = Math.random() * total;
      let chosen = '';

      for (const [word, count] of followers) {
        rand -= count;
        if (rand <= 0) {
          chosen = word;
          break;
        }
      }

      if (!chosen) break;
      result.push(chosen);

      // Slide window
      const prev = currentKey.split(' ');
      currentKey = `${prev[prev.length - 1]} ${chosen}`.toLowerCase();
    }

    return result.join(' ');
  }

  get isReady(): boolean {
    return this.trained;
  }
}

// ---------------------------------------------------------------------------
// Offline Summarizer (TextRank-inspired extractive)
// ---------------------------------------------------------------------------

export class OfflineSummarizer {
  summarize(text: string, maxSentences = 3): string {
    const sentences = this.splitSentences(text);
    if (sentences.length <= maxSentences) return text;

    // Score each sentence
    const scored = sentences.map((sent, index) => ({
      text: sent,
      score: this.scoreSentence(sent, sentences),
      index,
    }));

    // Sort by score, take top N, then restore original order
    const topSentences = scored
      .sort((a, b) => b.score - a.score)
      .slice(0, maxSentences)
      .sort((a, b) => a.index - b.index);

    return topSentences.map(s => s.text).join(' ');
  }

  private splitSentences(text: string): string[] {
    return text
      .replace(/\n+/g, ' ')
      .split(/(?<=[.!?])\s+/)
      .map(s => s.trim())
      .filter(s => s.length > 10);
  }

  private scoreSentence(sentence: string, allSentences: string[]): number {
    const words = this.getWords(sentence);
    if (words.length === 0) return 0;

    let score = 0;

    // Position bonus: first and last sentences get a boost
    const idx = allSentences.indexOf(sentence);
    if (idx === 0) score += 0.3;
    if (idx === allSentences.length - 1) score += 0.1;

    // Length bonus: prefer medium-length sentences
    const wordCount = words.length;
    if (wordCount >= 8 && wordCount <= 30) score += 0.2;

    // Word overlap with other sentences (TextRank-inspired)
    const wordSet = new Set(words);
    let overlapScore = 0;
    for (const other of allSentences) {
      if (other === sentence) continue;
      const otherWords = this.getWords(other);
      const otherSet = new Set(otherWords);
      let overlap = 0;
      for (const w of wordSet) {
        if (otherSet.has(w)) overlap++;
      }
      if (wordSet.size > 0 && otherSet.size > 0) {
        overlapScore += overlap / (Math.log(wordSet.size) + Math.log(otherSet.size) + 1);
      }
    }
    score += overlapScore / Math.max(allSentences.length - 1, 1);

    // Contains numbers or proper nouns (capitalized words)
    if (/\d/.test(sentence)) score += 0.1;
    const capitalWords = sentence.match(/\b[A-Z][a-z]+\b/g);
    if (capitalWords && capitalWords.length > 1) score += 0.1;

    return score;
  }

  private getWords(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^a-zaeoeueaouess0-9\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 2);
  }
}

// ---------------------------------------------------------------------------
// Complexity Estimator (for hybrid routing)
// ---------------------------------------------------------------------------

function estimateComplexity(query: string): number {
  let score = 0;
  const words = query.split(/\s+/);
  const wordCount = words.length;

  // Length complexity
  if (wordCount > 50) score += 0.4;
  else if (wordCount > 20) score += 0.2;
  else if (wordCount > 10) score += 0.1;

  // Multi-part queries
  if (query.includes(' und ') || query.includes(' and ')) score += 0.1;
  if (query.includes(' aber ') || query.includes(' but ')) score += 0.1;

  // Requires reasoning
  if (/\b(warum|wieso|weshalb|erklaer|why|explain|because|reason)\b/i.test(query)) score += 0.3;

  // Requires external knowledge
  if (/\b(aktuell|heute|gestern|news|2024|2025|2026)\b/i.test(query)) score += 0.4;

  // Code generation
  if (/```|function|class|import\s/i.test(query)) score += 0.5;

  // Creative writing
  if (/\b(schreib|verfass|dicht|compose|write\s(a|an|me))\b/i.test(query)) score += 0.4;

  return Math.min(score, 1);
}

// ---------------------------------------------------------------------------
// Main On-Device AI Service
// ---------------------------------------------------------------------------

const CONFIG_KEY = 'zenai_on_device_config';

export class OnDeviceAIService {
  private intentClassifier = new IntentClassifier();
  private sentimentAnalyzer = new SentimentAnalyzer();
  private embeddingGenerator = new EmbeddingGenerator();
  private textCompleter = new TextCompleter();
  private summarizer = new OfflineSummarizer();

  private _config: OnDeviceAIConfig = {
    privacyMode: false,
    maxCorpusSize: 500,
    cacheTTLMs: 30 * 60 * 1000,
    complexityThreshold: 0.5,
  };

  private _initialized = false;

  get config(): OnDeviceAIConfig {
    return { ...this._config };
  }

  get isInitialized(): boolean {
    return this._initialized;
  }

  get privacyMode(): boolean {
    return this._config.privacyMode;
  }

  // -------------------------------------------------------------------------
  // Initialization
  // -------------------------------------------------------------------------

  async init(): Promise<void> {
    if (this._initialized) return;

    // Load config from localStorage
    this.loadConfig();

    // Train text completer from stored corpus
    try {
      await this.textCompleter.train();
      await this.embeddingGenerator.loadVocab();
    } catch {
      // Non-critical
    }

    this._initialized = true;
  }

  private loadConfig(): void {
    try {
      const stored = typeof localStorage !== 'undefined'
        ? localStorage.getItem(CONFIG_KEY)
        : null;
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<OnDeviceAIConfig>;
        this._config = { ...this._config, ...parsed };
      }
    } catch {
      // Use defaults
    }
  }

  saveConfig(config: Partial<OnDeviceAIConfig>): void {
    this._config = { ...this._config, ...config };
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(CONFIG_KEY, JSON.stringify(this._config));
      }
    } catch {
      // Silently fail
    }
  }

  // -------------------------------------------------------------------------
  // Capabilities
  // -------------------------------------------------------------------------

  getCapabilities(): OnDeviceCapabilities {
    const modelsReady: string[] = [
      'intent-classifier',  // Always ready (pure JS)
      'sentiment-analyzer', // Always ready (pure JS)
      'summarizer',         // Always ready (pure JS)
    ];

    if (this.textCompleter.isReady) {
      modelsReady.push('text-completer');
    }

    return {
      webgpuAvailable: isWebGPUAvailable(),
      indexedDBAvailable: isIndexedDBAvailable(),
      serviceWorkerAvailable: typeof navigator !== 'undefined' && 'serviceWorker' in navigator,
      modelsReady,
      privacyMode: this._config.privacyMode,
    };
  }

  // -------------------------------------------------------------------------
  // Routing Decision
  // -------------------------------------------------------------------------

  routeQuery(query: string): RoutingDecision {
    // Privacy mode forces on-device
    if (this._config.privacyMode) return 'on-device';

    // Estimate complexity
    const complexity = estimateComplexity(query);

    // Simple queries can be handled on-device
    if (complexity < this._config.complexityThreshold) return 'on-device';

    return 'cloud';
  }

  // -------------------------------------------------------------------------
  // Inference Methods
  // -------------------------------------------------------------------------

  async classifyIntent(query: string): Promise<IntentCategory> {
    // Check cache first
    const cached = await getCachedResult<IntentCategory>('classify', query);
    if (cached !== null) return cached;

    const result = this.intentClassifier.classify(query);

    await cacheResult('classify', query, result, this._config.cacheTTLMs);
    await incrementStat('queriesOnDevice');

    return result;
  }

  async analyzeSentiment(text: string): Promise<SentimentResult> {
    const cached = await getCachedResult<SentimentResult>('sentiment', text);
    if (cached !== null) return cached;

    const result = this.sentimentAnalyzer.analyze(text);

    await cacheResult('sentiment', text, result, this._config.cacheTTLMs);
    await incrementStat('queriesOnDevice');

    return result;
  }

  async summarize(text: string, maxSentences = 3): Promise<string> {
    const cacheKey = `${text.slice(0, 200)}:${maxSentences}`;
    const cached = await getCachedResult<string>('summarize', cacheKey);
    if (cached !== null) return cached;

    const result = this.summarizer.summarize(text, maxSentences);

    await cacheResult('summarize', cacheKey, result, this._config.cacheTTLMs);
    await incrementStat('queriesOnDevice');

    return result;
  }

  async complete(prefix: string, maxWords = 10): Promise<string> {
    if (!this.textCompleter.isReady) {
      await this.textCompleter.train();
    }

    const result = this.textCompleter.complete(prefix, maxWords);
    await incrementStat('queriesOnDevice');

    return result;
  }

  async generateEmbedding(text: string): Promise<number[]> {
    return this.embeddingGenerator.generate(text);
  }

  // -------------------------------------------------------------------------
  // Corpus Management
  // -------------------------------------------------------------------------

  async addUserText(text: string, source: 'chat' | 'idea' | 'note' = 'chat'): Promise<void> {
    await addToCorpus(text, source);
  }

  async rebuildModels(): Promise<void> {
    const corpus = await getCorpus(this._config.maxCorpusSize);
    const texts = corpus.map(e => e.text);

    // Rebuild vocabulary
    await this.embeddingGenerator.buildVocabulary(texts);

    // Retrain Markov chain
    await this.textCompleter.train();
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

export const onDeviceAI = new OnDeviceAIService();
