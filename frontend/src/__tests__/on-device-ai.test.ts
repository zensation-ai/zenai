/**
 * On-Device AI Tests - Phase 94
 *
 * Tests for:
 * - WebGPU detection
 * - Intent classification accuracy (12+ test cases)
 * - Sentiment analysis accuracy
 * - Extractive summarization
 * - Markov chain text completion
 * - Privacy mode routing
 * - Fallback to cloud
 * - Storage operations
 * - Embedding generation
 * - Configuration management
 */

import { describe, test, expect, beforeEach } from 'vitest';

import {
  IntentClassifier,
  SentimentAnalyzer,
  EmbeddingGenerator,
  TextCompleter,
  OfflineSummarizer,
  OnDeviceAIService,
  isWebGPUAvailable,
  isIndexedDBAvailable,
} from '../services/on-device-ai';

import { hashString } from '../services/on-device-storage';

// ============================================================================
// WebGPU Detection
// ============================================================================

describe('WebGPU Detection', () => {
  test('isWebGPUAvailable returns boolean', () => {
    const result = isWebGPUAvailable();
    expect(typeof result).toBe('boolean');
  });

  test('isIndexedDBAvailable returns boolean', () => {
    const result = isIndexedDBAvailable();
    expect(typeof result).toBe('boolean');
  });

  test('isWebGPUAvailable handles missing navigator', () => {
    // In test env, navigator.gpu is not defined
    expect(isWebGPUAvailable()).toBe(false);
  });
});

// ============================================================================
// Intent Classification
// ============================================================================

describe('IntentClassifier', () => {
  const classifier = new IntentClassifier();

  test('classifies greeting (German)', () => {
    expect(classifier.classify('Hallo, wie geht es dir?')).toBe('greeting');
  });

  test('classifies greeting (English)', () => {
    expect(classifier.classify('Hello there')).toBe('greeting');
  });

  test('classifies farewell (German)', () => {
    expect(classifier.classify('Tschuess bis morgen')).toBe('farewell');
  });

  test('classifies farewell (English)', () => {
    expect(classifier.classify('Goodbye, see you later')).toBe('farewell');
  });

  test('classifies question (German)', () => {
    expect(classifier.classify('Was ist die Hauptstadt von Deutschland?')).toBe('question');
  });

  test('classifies question (English)', () => {
    expect(classifier.classify('What is machine learning?')).toBe('question');
  });

  test('classifies question by question mark', () => {
    expect(classifier.classify('Wie funktioniert das?')).toBe('question');
  });

  test('classifies command (German)', () => {
    expect(classifier.classify('Erstell eine neue Aufgabe')).toBe('command');
  });

  test('classifies command (English)', () => {
    expect(classifier.classify('Create a new task for me')).toBe('command');
  });

  test('classifies search (German)', () => {
    expect(classifier.classify('Suche nach React Tutorials')).toBe('search');
  });

  test('classifies search (English)', () => {
    expect(classifier.classify('Find all documents about AI')).toBe('search');
  });

  test('classifies code', () => {
    expect(classifier.classify('function hello() { console.log("hi"); }')).toBe('code');
  });

  test('classifies code by language keyword', () => {
    expect(classifier.classify('Implementier eine Sortier-Funktion in Python')).toBe('code');
  });

  test('classifies code by backticks', () => {
    expect(classifier.classify('Hier ist mein Code: ```const x = 1;```')).toBe('code');
  });

  test('classifies creative writing', () => {
    expect(classifier.classify('Schreib mir ein Gedicht ueber den Herbst')).toBe('creative');
  });

  test('classifies analysis', () => {
    expect(classifier.classify('Analysier die Vor- und Nachteile von React vs Vue')).toBe('analysis');
  });

  test('classifies math', () => {
    expect(classifier.classify('Berechne 42 * 17')).toBe('math');
  });

  test('classifies math expression', () => {
    expect(classifier.classify('15 + 27')).toBe('math');
  });

  test('classifies translation', () => {
    expect(classifier.classify('Uebersetze auf Englisch: Guten Tag')).toBe('translation');
  });

  test('classifies summarization', () => {
    expect(classifier.classify('Fasse den Text zusammen')).toBe('summarize');
  });

  test('classifies generic chat as fallback', () => {
    expect(classifier.classify('Das ist ein ganz normaler Satz')).toBe('chat');
  });

  test('handles empty string', () => {
    expect(classifier.classify('')).toBe('chat');
  });

  test('handles whitespace-only', () => {
    expect(classifier.classify('   ')).toBe('chat');
  });
});

// ============================================================================
// Sentiment Analysis
// ============================================================================

describe('SentimentAnalyzer', () => {
  const analyzer = new SentimentAnalyzer();

  test('detects positive sentiment (German)', () => {
    const result = analyzer.analyze('Das ist wunderbar und fantastisch!');
    expect(result.label).toBe('positive');
    expect(result.score).toBeGreaterThan(0);
  });

  test('detects positive sentiment (English)', () => {
    const result = analyzer.analyze('This is amazing and wonderful!');
    expect(result.label).toBe('positive');
    expect(result.score).toBeGreaterThan(0);
  });

  test('detects negative sentiment (German)', () => {
    const result = analyzer.analyze('Das ist schlecht und furchtbar');
    expect(result.label).toBe('negative');
    expect(result.score).toBeLessThan(0);
  });

  test('detects negative sentiment (English)', () => {
    const result = analyzer.analyze('This is terrible and horrible');
    expect(result.label).toBe('negative');
    expect(result.score).toBeLessThan(0);
  });

  test('detects neutral sentiment', () => {
    const result = analyzer.analyze('Der Tisch ist aus Holz');
    expect(result.label).toBe('neutral');
    expect(result.score).toBe(0);
  });

  test('handles negation', () => {
    const result = analyzer.analyze('This is not good at all');
    // "not good" should flip positive to negative
    expect(result.score).toBeLessThanOrEqual(0);
  });

  test('handles intensifiers', () => {
    const intensified = analyzer.analyze('Das ist sehr gut');
    // Intensified should have same direction
    expect(intensified.label).toBe('positive');
  });

  test('returns confidence between 0 and 1', () => {
    const result = analyzer.analyze('This is amazing and wonderful and great');
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  test('handles empty string', () => {
    const result = analyzer.analyze('');
    expect(result.label).toBe('neutral');
    expect(result.score).toBe(0);
    expect(result.confidence).toBe(0);
  });

  test('mixed sentiment returns moderate score', () => {
    const result = analyzer.analyze('gut aber schlecht');
    // Mixed should be near zero
    expect(Math.abs(result.score)).toBeLessThanOrEqual(0.5);
  });
});

// ============================================================================
// Extractive Summarization
// ============================================================================

describe('OfflineSummarizer', () => {
  const summarizer = new OfflineSummarizer();

  test('summarizes long text to fewer sentences', () => {
    const text = 'Die Sonne scheint hell am Himmel. Der Wind weht sanft durch die Baeume. Die Voegel singen froehlich ihre Lieder. Die Blumen bluehen in allen Farben. Die Kinder spielen im Park. Es ist ein wunderschoener Fruehlingtag.';
    const summary = summarizer.summarize(text, 2);
    const sentenceCount = summary.split(/[.!?]/).filter(s => s.trim().length > 0).length;
    expect(sentenceCount).toBeLessThanOrEqual(3); // may combine partially
    expect(summary.length).toBeLessThan(text.length);
  });

  test('returns full text when shorter than max sentences', () => {
    const text = 'Kurzer Text mit nur einem Satz.';
    const summary = summarizer.summarize(text, 3);
    expect(summary).toBe(text);
  });

  test('prefers first sentence (position bonus)', () => {
    const text = 'Dieser erste Satz ist der wichtigste im gesamten Dokument. Hier steht ein zwischensatz der wenig Inhalt hat. Ein weiterer Satz ohne viel Bedeutung steht hier. Der letzte Satz fasst alles zusammen und schliesst ab.';
    const summary = summarizer.summarize(text, 2);
    expect(summary).toContain('Dieser erste Satz');
  });

  test('handles empty text', () => {
    const summary = summarizer.summarize('', 3);
    expect(summary).toBe('');
  });

  test('handles text without sentence markers', () => {
    const text = 'Ein langer Text ohne Punkte am Ende';
    const summary = summarizer.summarize(text, 2);
    expect(summary).toBe(text);
  });
});

// ============================================================================
// Text Completion (Markov Chain)
// ============================================================================

describe('TextCompleter', () => {
  const completer = new TextCompleter();

  test('isReady returns false before training', () => {
    expect(completer.isReady).toBe(false);
  });

  test('complete returns empty string when not trained', () => {
    expect(completer.complete('hello world')).toBe('');
  });

  test('complete returns empty for single word input', () => {
    expect(completer.complete('hello')).toBe('');
  });
});

// ============================================================================
// Embedding Generator
// ============================================================================

describe('EmbeddingGenerator', () => {
  const generator = new EmbeddingGenerator();

  test('generates vector of specified dimensions', () => {
    const vec = generator.generate('hello world', 64);
    expect(vec).toHaveLength(64);
  });

  test('generates normalized vector', () => {
    const vec = generator.generate('test string', 64);
    const magnitude = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
    expect(magnitude).toBeCloseTo(1, 1);
  });

  test('similar texts produce similar embeddings', () => {
    const vec1 = generator.generate('hello world', 64);
    const vec2 = generator.generate('hello world', 64);
    // Same input should produce identical output
    expect(vec1).toEqual(vec2);
  });

  test('different texts produce different embeddings', () => {
    const vec1 = generator.generate('hello world', 64);
    const vec2 = generator.generate('goodbye universe', 64);
    // Different input should produce different output
    expect(vec1).not.toEqual(vec2);
  });

  test('handles empty string', () => {
    const vec = generator.generate('', 64);
    expect(vec).toHaveLength(64);
  });

  test('default dimensions is 64', () => {
    const vec = generator.generate('test');
    expect(vec).toHaveLength(64);
  });
});

// ============================================================================
// OnDeviceAIService
// ============================================================================

describe('OnDeviceAIService', () => {
  let service: OnDeviceAIService;

  beforeEach(() => {
    service = new OnDeviceAIService();
  });

  test('starts uninitialized', () => {
    expect(service.isInitialized).toBe(false);
  });

  test('initializes successfully', async () => {
    await service.init();
    expect(service.isInitialized).toBe(true);
  });

  test('double init is safe', async () => {
    await service.init();
    await service.init(); // Should not throw
    expect(service.isInitialized).toBe(true);
  });

  test('default config has privacyMode off', () => {
    expect(service.privacyMode).toBe(false);
  });

  test('saveConfig updates config', () => {
    service.saveConfig({ privacyMode: true });
    expect(service.privacyMode).toBe(true);
  });

  test('getCapabilities returns valid structure', () => {
    const caps = service.getCapabilities();
    expect(caps).toHaveProperty('webgpuAvailable');
    expect(caps).toHaveProperty('indexedDBAvailable');
    expect(caps).toHaveProperty('serviceWorkerAvailable');
    expect(caps).toHaveProperty('modelsReady');
    expect(caps).toHaveProperty('privacyMode');
    expect(Array.isArray(caps.modelsReady)).toBe(true);
  });

  test('capabilities includes built-in models', () => {
    const caps = service.getCapabilities();
    expect(caps.modelsReady).toContain('intent-classifier');
    expect(caps.modelsReady).toContain('sentiment-analyzer');
    expect(caps.modelsReady).toContain('summarizer');
  });

  // Routing

  test('routes simple query to on-device', () => {
    const decision = service.routeQuery('Hallo');
    expect(decision).toBe('on-device');
  });

  test('routes complex query to cloud', () => {
    const decision = service.routeQuery('Erklaere mir warum die Quantenmechanik und die allgemeine Relativitaetstheorie nicht kompatibel sind und schreibe einen detaillierten Vergleich der verschiedenen Ansaetze zur Vereinheitlichung, insbesondere String-Theorie und Schleifenquantengravitation');
    expect(decision).toBe('cloud');
  });

  test('routes everything on-device in privacy mode', () => {
    service.saveConfig({ privacyMode: true });
    const decision = service.routeQuery('Erklaere mir die allgemeine Relativitaetstheorie und ihre Implikationen fuer die moderne Physik, einschliesslich aktueller Forschung zu Gravitationswellen und der Kosmologie');
    expect(decision).toBe('on-device');
  });

  test('routes code queries to cloud', () => {
    const decision = service.routeQuery('function calculateFibonacci(n) { if (n <= 1) return n; return calculateFibonacci(n-1) + calculateFibonacci(n-2); }');
    expect(decision).toBe('cloud');
  });

  // Inference (basic smoke tests)

  test('classifyIntent returns valid category', async () => {
    await service.init();
    const result = await service.classifyIntent('Hallo');
    expect(['greeting', 'farewell', 'question', 'command', 'search', 'code', 'creative', 'analysis', 'math', 'translation', 'summarize', 'chat']).toContain(result);
  });

  test('analyzeSentiment returns valid result', async () => {
    await service.init();
    const result = await service.analyzeSentiment('Das ist super!');
    expect(result).toHaveProperty('score');
    expect(result).toHaveProperty('label');
    expect(result).toHaveProperty('confidence');
  });

  test('summarize returns shorter text', async () => {
    await service.init();
    const longText = 'Erster Satz des Textes. Zweiter Satz mit mehr Inhalt. Dritter Satz hier. Vierter Satz zum Schluss. Fuenfter Satz extra.';
    const summary = await service.summarize(longText, 2);
    expect(summary.length).toBeLessThanOrEqual(longText.length);
  });

  test('generateEmbedding returns vector', async () => {
    await service.init();
    const vec = await service.generateEmbedding('test');
    expect(Array.isArray(vec)).toBe(true);
    expect(vec.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// Storage Utilities
// ============================================================================

describe('Storage Utilities', () => {
  test('hashString produces consistent results', () => {
    const hash1 = hashString('hello');
    const hash2 = hashString('hello');
    expect(hash1).toBe(hash2);
  });

  test('hashString produces different results for different strings', () => {
    const hash1 = hashString('hello');
    const hash2 = hashString('world');
    expect(hash1).not.toBe(hash2);
  });

  test('hashString handles empty string', () => {
    const hash = hashString('');
    expect(typeof hash).toBe('string');
  });

  test('hashString handles long strings', () => {
    const hash = hashString('a'.repeat(10000));
    expect(typeof hash).toBe('string');
    expect(hash.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// Privacy Mode & Routing
// ============================================================================

describe('Privacy Mode & Routing', () => {
  test('privacy mode routes all queries on-device', () => {
    const service = new OnDeviceAIService();
    service.saveConfig({ privacyMode: true });

    // Even complex queries should stay on-device
    expect(service.routeQuery('Schreib mir einen langen Aufsatz')).toBe('on-device');
    expect(service.routeQuery('Erklaere Quantenphysik')).toBe('on-device');
    expect(service.routeQuery('function test() {}')).toBe('on-device');
  });

  test('non-privacy mode routes by complexity', () => {
    const service = new OnDeviceAIService();
    service.saveConfig({ privacyMode: false, complexityThreshold: 0.5 });

    // Simple greeting -> on-device
    expect(service.routeQuery('Hi')).toBe('on-device');
  });

  test('adjusting threshold affects routing', () => {
    const service = new OnDeviceAIService();

    // Very low threshold -> most things go to cloud
    service.saveConfig({ privacyMode: false, complexityThreshold: 0.05 });
    const lowResult = service.routeQuery('Was ist React und warum sollte ich es verwenden?');

    // Very high threshold -> most things stay on-device
    service.saveConfig({ privacyMode: false, complexityThreshold: 0.95 });
    const highResult = service.routeQuery('Was ist React und warum sollte ich es verwenden?');

    // With high threshold, more likely to be on-device
    expect(highResult).toBe('on-device');
    // With low threshold, more likely to be cloud
    expect(lowResult).toBe('cloud');
  });
});

// ============================================================================
// Fallback Behavior
// ============================================================================

describe('Fallback Behavior', () => {
  test('intent classifier returns chat for unknown input', () => {
    const classifier = new IntentClassifier();
    expect(classifier.classify('xyzzy plugh qwerty')).toBe('chat');
  });

  test('sentiment returns neutral for non-sentiment text', () => {
    const analyzer = new SentimentAnalyzer();
    const result = analyzer.analyze('Der Tisch hat vier Beine');
    expect(result.label).toBe('neutral');
  });

  test('summarizer handles single sentence', () => {
    const summarizer = new OfflineSummarizer();
    const result = summarizer.summarize('Nur ein einziger Satz.', 3);
    expect(result).toBe('Nur ein einziger Satz.');
  });

  test('embedding handles special characters', () => {
    const generator = new EmbeddingGenerator();
    const vec = generator.generate('Hello! @#$% World...', 64);
    expect(vec).toHaveLength(64);
  });
});
