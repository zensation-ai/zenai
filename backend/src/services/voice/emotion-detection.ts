/**
 * Phase 90: Emotion Detection Service
 *
 * Analyzes audio/text for emotional content using heuristic-based detection.
 * Combines text-based keyword matching with prosodic signal analysis
 * (pitch, rate, volume) for multimodal emotion detection.
 *
 * No ML model required — purely heuristic, inspired by emotional-tagger.ts (Phase 72).
 */

import { logger } from '../../utils/logger';

// ===========================================
// Types
// ===========================================

export type EmotionLabel = 'neutral' | 'happy' | 'sad' | 'stressed' | 'excited' | 'frustrated' | 'calm';

export interface EmotionResult {
  /** Primary detected emotion */
  primary: EmotionLabel;
  /** Confidence in detection (0-1) */
  confidence: number;
  /** Arousal: calm (0) to excited (1) */
  arousal: number;
  /** Valence: negative (-1) to positive (1) */
  valence: number;
  /** Energy level: low (0) to high (1) */
  energy: number;
}

export interface EmotionSignals {
  /** Transcript text */
  text?: string;
  /** Words per minute */
  speechRate?: number;
  /** Average pitch in Hz */
  avgPitch?: number;
  /** Pitch standard deviation in Hz */
  pitchVariation?: number;
  /** Normalized volume (0-1) */
  volume?: number;
  /** Pauses per minute */
  pauseFrequency?: number;
}

export interface ResponseStyle {
  tone: 'empathetic' | 'professional' | 'enthusiastic' | 'calm' | 'supportive';
  verbosity: 'concise' | 'normal' | 'detailed';
  systemPromptAddendum: string;
}

// ===========================================
// Emotion Lexicons (German + English)
// ===========================================

/** Words indicating happiness/joy */
const HAPPY_WORDS: ReadonlyMap<string, number> = new Map([
  // German
  ['freue', 0.8], ['freude', 0.85], ['gluecklich', 0.9], ['toll', 0.7],
  ['wunderbar', 0.85], ['fantastisch', 0.9], ['super', 0.7], ['prima', 0.65],
  ['begeistert', 0.9], ['genial', 0.85], ['herrlich', 0.8], ['perfekt', 0.75],
  ['lache', 0.7], ['lachen', 0.7], ['juhu', 0.9], ['hurra', 0.9],
  ['danke', 0.55], ['dankbar', 0.65], ['liebe', 0.7],
  // English
  ['happy', 0.8], ['joy', 0.85], ['glad', 0.7], ['wonderful', 0.85],
  ['amazing', 0.9], ['great', 0.7], ['awesome', 0.8], ['love', 0.75],
  ['fantastic', 0.85], ['excellent', 0.8], ['brilliant', 0.85],
  ['thrilled', 0.9], ['delighted', 0.85], ['cheerful', 0.75],
  ['grateful', 0.65], ['thankful', 0.6], ['pleased', 0.65],
]);

/** Words indicating sadness */
const SAD_WORDS: ReadonlyMap<string, number> = new Map([
  // German
  ['traurig', 0.85], ['weinen', 0.9], ['weine', 0.9], ['verloren', 0.7],
  ['einsam', 0.8], ['hoffnungslos', 0.9], ['deprimiert', 0.9],
  ['vermisse', 0.75], ['schmerz', 0.8], ['leid', 0.7], ['enttaeuscht', 0.75],
  ['trostlos', 0.85], ['niedergeschlagen', 0.85], ['mutlos', 0.8],
  // English
  ['sad', 0.8], ['crying', 0.9], ['lonely', 0.8], ['hopeless', 0.9],
  ['depressed', 0.9], ['miss', 0.6], ['grief', 0.9], ['heartbroken', 0.95],
  ['disappointed', 0.75], ['miserable', 0.85], ['gloomy', 0.7],
  ['sorrowful', 0.85], ['devastated', 0.95], ['lost', 0.6],
]);

/** Words indicating stress/anxiety */
const STRESS_WORDS: ReadonlyMap<string, number> = new Map([
  // German
  ['stress', 0.85], ['gestresst', 0.9], ['druck', 0.7], ['deadline', 0.8],
  ['ueberlastet', 0.9], ['ueberfordert', 0.9], ['angst', 0.85],
  ['sorge', 0.7], ['panik', 0.95], ['nervoes', 0.8], ['hektisch', 0.75],
  ['dringend', 0.8], ['sofort', 0.7], ['schaffe', 0.6], ['muss', 0.5],
  ['schnell', 0.55], ['zeitdruck', 0.85],
  // English
  ['stressed', 0.85], ['anxious', 0.85], ['overwhelmed', 0.9],
  ['pressure', 0.7], ['panic', 0.95], ['nervous', 0.8], ['worried', 0.75],
  ['urgent', 0.8], ['hurry', 0.75], ['asap', 0.8], ['rush', 0.7],
  ['tense', 0.7], ['burden', 0.75],
]);

/** Words indicating excitement */
const EXCITED_WORDS: ReadonlyMap<string, number> = new Map([
  // German
  ['aufgeregt', 0.85], ['gespannt', 0.75], ['unglaublich', 0.8],
  ['wahnsinn', 0.85], ['krass', 0.7], ['mega', 0.7], ['hammer', 0.75],
  ['geil', 0.8], ['irre', 0.7], ['sensationell', 0.9],
  ['endlich', 0.65], ['ueberraschung', 0.75],
  // English
  ['excited', 0.85], ['thrilling', 0.85], ['incredible', 0.85],
  ['unbelievable', 0.8], ['wow', 0.8], ['omg', 0.8], ['finally', 0.65],
  ['cant wait', 0.8], ['stoked', 0.85], ['pumped', 0.8], ['ecstatic', 0.95],
]);

/** Words indicating frustration/anger */
const FRUSTRATED_WORDS: ReadonlyMap<string, number> = new Map([
  // German
  ['frustriert', 0.85], ['aergerlich', 0.8], ['wuetend', 0.9],
  ['verdammt', 0.8], ['mist', 0.7], ['scheisse', 0.85], ['nervig', 0.75],
  ['satt', 0.6], ['reicht', 0.65], ['genug', 0.55], ['unmoeglich', 0.7],
  ['kaputt', 0.65], ['funktioniert nicht', 0.8], ['geht nicht', 0.7],
  ['hasse', 0.85],
  // English
  ['frustrated', 0.85], ['angry', 0.85], ['annoyed', 0.75], ['furious', 0.95],
  ['damn', 0.75], ['hate', 0.85], ['stupid', 0.7], ['broken', 0.65],
  ['useless', 0.75], ['ridiculous', 0.7], ['terrible', 0.8],
  ['awful', 0.8], ['worst', 0.75], ['impossible', 0.7],
]);

/** Words indicating calmness/peace */
const CALM_WORDS: ReadonlyMap<string, number> = new Map([
  // German
  ['ruhig', 0.8], ['entspannt', 0.85], ['gelassen', 0.85], ['friedlich', 0.8],
  ['gemaechlich', 0.7], ['achtsam', 0.75], ['meditation', 0.8],
  ['zufrieden', 0.75], ['ausgeglichen', 0.8], ['harmonisch', 0.8],
  ['langsam', 0.5], ['geduldig', 0.7],
  // English
  ['calm', 0.85], ['relaxed', 0.85], ['peaceful', 0.85], ['serene', 0.9],
  ['tranquil', 0.9], ['mindful', 0.75], ['content', 0.7],
  ['balanced', 0.75], ['gentle', 0.7], ['steady', 0.65], ['patient', 0.7],
]);

// ===========================================
// Prosodic Reference Values
// ===========================================

/** Average speaking rate for German speech (WPM) */
const AVG_SPEECH_RATE = 130;
/** Average pitch for mixed-gender German speech (Hz) */
const AVG_PITCH = 170;
/** Average pitch variation (Hz) */
const AVG_PITCH_VARIATION = 30;

// ===========================================
// Detection Functions
// ===========================================

/**
 * Detect emotion from text using keyword lexicons.
 * Scans the input for emotionally loaded words in both German and English.
 */
export function detectFromText(text: string): EmotionResult {
  if (!text || text.trim().length === 0) {
    return { primary: 'neutral', confidence: 0, arousal: 0.3, valence: 0, energy: 0.3 };
  }

  const lowerText = text.toLowerCase();
  const words = lowerText.split(/\s+/);
  const wordCount = Math.max(words.length, 1);

  // Score accumulators per emotion category
  const scores: Record<string, { total: number; hits: number }> = {
    happy: { total: 0, hits: 0 },
    sad: { total: 0, hits: 0 },
    stressed: { total: 0, hits: 0 },
    excited: { total: 0, hits: 0 },
    frustrated: { total: 0, hits: 0 },
    calm: { total: 0, hits: 0 },
  };

  const lexicons: [string, ReadonlyMap<string, number>][] = [
    ['happy', HAPPY_WORDS],
    ['sad', SAD_WORDS],
    ['stressed', STRESS_WORDS],
    ['excited', EXCITED_WORDS],
    ['frustrated', FRUSTRATED_WORDS],
    ['calm', CALM_WORDS],
  ];

  for (const word of words) {
    const cleanWord = word.replace(/[.,!?;:'"()[\]{}]/g, '');
    if (cleanWord.length < 2) continue;

    for (const [category, lexicon] of lexicons) {
      const intensity = lexicon.get(cleanWord);
      if (intensity !== undefined) {
        scores[category].total += intensity;
        scores[category].hits++;
      }
    }
  }

  // Exclamation marks boost arousal/energy
  const exclamationCount = (text.match(/!/g) || []).length;
  // ALL CAPS words boost energy
  const capsWords = (text.match(/\b[A-Z]{2,}\b/g) || []).length;

  // Find the dominant emotion
  let maxScore = 0;
  let dominant: EmotionLabel = 'neutral';
  let totalHits = 0;

  for (const [category, data] of Object.entries(scores)) {
    totalHits += data.hits;
    const avgIntensity = data.hits > 0 ? data.total / data.hits : 0;
    const categoryScore = avgIntensity * Math.min(data.hits, 5); // Cap influence at 5 hits
    if (categoryScore > maxScore) {
      maxScore = categoryScore;
      dominant = category as EmotionLabel;
    }
  }

  // If no emotional words found, return neutral
  if (totalHits === 0) {
    return { primary: 'neutral', confidence: 0.3, arousal: 0.3, valence: 0, energy: 0.3 };
  }

  // Compute confidence based on density and intensity
  const density = Math.min(totalHits / wordCount, 0.5) * 2; // 0-1
  const confidence = Math.min(0.4 + density * 0.4 + (maxScore > 2 ? 0.2 : maxScore * 0.1), 1.0);

  // Compute arousal, valence, energy from emotion category
  const { arousal, valence, energy } = getEmotionDimensions(dominant, maxScore);

  // Boost arousal/energy with exclamation and caps
  const arousalBoost = Math.min(exclamationCount * 0.05 + capsWords * 0.03, 0.2);
  const energyBoost = Math.min(exclamationCount * 0.04 + capsWords * 0.03, 0.15);

  return {
    primary: dominant,
    confidence: clamp(confidence, 0, 1),
    arousal: clamp(arousal + arousalBoost, 0, 1),
    valence: clamp(valence, -1, 1),
    energy: clamp(energy + energyBoost, 0, 1),
  };
}

/**
 * Detect emotion from prosodic signals (speech characteristics).
 * Uses heuristic rules based on prosody research:
 * - High pitch + fast rate → stressed/excited
 * - Low pitch + slow rate → calm/sad
 * - High volume + high variation → excited/frustrated
 * - Low volume + low variation → calm/sad
 */
export function detectFromProsody(signals: Omit<EmotionSignals, 'text'>): EmotionResult {
  const {
    speechRate = AVG_SPEECH_RATE,
    avgPitch = AVG_PITCH,
    pitchVariation = AVG_PITCH_VARIATION,
    volume = 0.5,
    pauseFrequency = 5,
  } = signals;

  // Normalize features relative to averages
  const rateNorm = (speechRate - AVG_SPEECH_RATE) / AVG_SPEECH_RATE; // -1 to +1 approx
  const pitchNorm = (avgPitch - AVG_PITCH) / AVG_PITCH;
  const variationNorm = (pitchVariation - AVG_PITCH_VARIATION) / AVG_PITCH_VARIATION;
  const volumeNorm = (volume - 0.5) * 2; // -1 to +1
  const pauseNorm = (pauseFrequency - 5) / 5; // high pauses = more hesitation

  // Compute emotion dimension scores
  let arousal = 0.5;
  let valence = 0;
  let energy = 0.5;

  // Speed affects arousal and energy
  arousal += rateNorm * 0.3;
  energy += rateNorm * 0.25;

  // Pitch affects arousal and valence
  arousal += pitchNorm * 0.2;
  valence += pitchNorm * 0.15; // Higher pitch slightly more positive (excitement vs sadness)

  // Pitch variation affects arousal (more variation = more emotional)
  arousal += variationNorm * 0.15;

  // Volume affects energy and arousal
  energy += volumeNorm * 0.3;
  arousal += volumeNorm * 0.2;

  // Many pauses → stress or sadness (negative valence, lower energy)
  if (pauseNorm > 0.3) {
    valence -= pauseNorm * 0.15;
    energy -= pauseNorm * 0.1;
  }

  // Clamp dimensions
  arousal = clamp(arousal, 0, 1);
  valence = clamp(valence, -1, 1);
  energy = clamp(energy, 0, 1);

  // Map dimensions to primary emotion
  const primary = mapDimensionsToEmotion(arousal, valence, energy);

  // Confidence based on how far from neutral the signals are
  const deviation = Math.abs(rateNorm) + Math.abs(pitchNorm) + Math.abs(volumeNorm) + Math.abs(variationNorm);
  const confidence = clamp(0.3 + deviation * 0.15, 0.2, 0.85);

  return { primary, confidence, arousal, valence, energy };
}

/**
 * Combine text-based and prosody-based emotion results.
 * Text weight: 0.4, Prosody weight: 0.6 (prosody is more reliable for voice).
 */
export function combineSignals(textEmotion: EmotionResult, prosodyEmotion: EmotionResult): EmotionResult {
  const TEXT_WEIGHT = 0.4;
  const PROSODY_WEIGHT = 0.6;

  const arousal = textEmotion.arousal * TEXT_WEIGHT + prosodyEmotion.arousal * PROSODY_WEIGHT;
  const valence = textEmotion.valence * TEXT_WEIGHT + prosodyEmotion.valence * PROSODY_WEIGHT;
  const energy = textEmotion.energy * TEXT_WEIGHT + prosodyEmotion.energy * PROSODY_WEIGHT;

  // Combined confidence is weighted average, boosted if both agree
  let confidence = textEmotion.confidence * TEXT_WEIGHT + prosodyEmotion.confidence * PROSODY_WEIGHT;
  if (textEmotion.primary === prosodyEmotion.primary) {
    confidence = Math.min(confidence + 0.15, 1.0); // Agreement bonus
  }

  // Determine primary emotion from combined dimensions
  const primary = mapDimensionsToEmotion(arousal, valence, energy);

  return {
    primary,
    confidence: clamp(confidence, 0, 1),
    arousal: clamp(arousal, 0, 1),
    valence: clamp(valence, -1, 1),
    energy: clamp(energy, 0, 1),
  };
}

/**
 * Map detected emotion to adaptive response style.
 * Adjusts AI response tone, verbosity, and system prompt to match user's emotional state.
 */
export function getAdaptiveResponseStyle(emotion: EmotionResult): ResponseStyle {
  // Only adapt if confidence is above threshold
  if (emotion.confidence < 0.4) {
    return {
      tone: 'professional',
      verbosity: 'normal',
      systemPromptAddendum: '',
    };
  }

  switch (emotion.primary) {
    case 'stressed':
      return {
        tone: 'calm',
        verbosity: 'concise',
        systemPromptAddendum: 'Der Nutzer wirkt gestresst. Sei kurz, beruhigend und loesungsorientiert. Vermeide lange Erklaerungen.',
      };

    case 'sad':
      return {
        tone: 'empathetic',
        verbosity: 'normal',
        systemPromptAddendum: 'Der Nutzer wirkt traurig. Sei einfuehlsam und verstaendnisvoll. Zeige Mitgefuehl, ohne aufdringlich zu sein.',
      };

    case 'frustrated':
      return {
        tone: 'supportive',
        verbosity: 'concise',
        systemPromptAddendum: 'Der Nutzer wirkt frustriert. Nimm das ernst, sei loesungsorientiert und vermeide belehrende Toene. Biete konkrete Hilfe an.',
      };

    case 'happy':
      return {
        tone: 'enthusiastic',
        verbosity: 'detailed',
        systemPromptAddendum: 'Der Nutzer ist gut gelaunt. Teile die positive Stimmung und gehe gerne ausfuehrlicher auf Themen ein.',
      };

    case 'excited':
      return {
        tone: 'enthusiastic',
        verbosity: 'detailed',
        systemPromptAddendum: 'Der Nutzer ist begeistert und aufgeregt. Matche die Energie und gehe mit Enthusiasmus auf das Thema ein.',
      };

    case 'calm':
      return {
        tone: 'calm',
        verbosity: 'normal',
        systemPromptAddendum: 'Der Nutzer ist ruhig und gelassen. Halte den gleichen ruhigen, ausgeglichenen Ton.',
      };

    case 'neutral':
    default:
      return {
        tone: 'professional',
        verbosity: 'normal',
        systemPromptAddendum: '',
      };
  }
}

// ===========================================
// Helper Functions
// ===========================================

/** Get arousal/valence/energy dimensions for an emotion category */
function getEmotionDimensions(emotion: EmotionLabel, intensity: number): { arousal: number; valence: number; energy: number } {
  const scale = Math.min(intensity / 3, 1); // Normalize intensity

  switch (emotion) {
    case 'happy':
      return { arousal: 0.5 + scale * 0.2, valence: 0.5 + scale * 0.4, energy: 0.5 + scale * 0.2 };
    case 'sad':
      return { arousal: 0.2, valence: -0.4 - scale * 0.3, energy: 0.2 };
    case 'stressed':
      return { arousal: 0.7 + scale * 0.2, valence: -0.3 - scale * 0.2, energy: 0.6 + scale * 0.2 };
    case 'excited':
      return { arousal: 0.8 + scale * 0.15, valence: 0.4 + scale * 0.3, energy: 0.8 + scale * 0.15 };
    case 'frustrated':
      return { arousal: 0.6 + scale * 0.2, valence: -0.5 - scale * 0.3, energy: 0.6 + scale * 0.15 };
    case 'calm':
      return { arousal: 0.2, valence: 0.2 + scale * 0.2, energy: 0.2 };
    case 'neutral':
    default:
      return { arousal: 0.3, valence: 0, energy: 0.3 };
  }
}

/** Map continuous dimensions to discrete emotion label */
function mapDimensionsToEmotion(arousal: number, valence: number, energy: number): EmotionLabel {
  // High arousal + positive valence → excited or happy
  if (arousal > 0.6 && valence > 0.2) {
    return energy > 0.7 ? 'excited' : 'happy';
  }

  // High arousal + negative valence → stressed or frustrated
  if (arousal > 0.6 && valence < -0.2) {
    return valence < -0.4 ? 'frustrated' : 'stressed';
  }

  // Low arousal + negative valence → sad
  if (arousal < 0.4 && valence < -0.2) {
    return 'sad';
  }

  // Low arousal + positive valence → calm
  if (arousal < 0.4 && valence > 0) {
    return 'calm';
  }

  // Moderate positive → happy
  if (valence > 0.3) {
    return 'happy';
  }

  // Moderate negative → frustrated (higher energy) or sad (lower energy)
  if (valence < -0.2) {
    return energy > 0.5 ? 'frustrated' : 'sad';
  }

  return 'neutral';
}

/** Clamp a value between min and max */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// Export for testing
export { mapDimensionsToEmotion as _mapDimensionsToEmotion };
export { getEmotionDimensions as _getEmotionDimensions };
