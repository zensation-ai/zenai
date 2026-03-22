/**
 * Phase 138: Style Learner
 *
 * Heuristically analyses user messages to build a style profile. Used by the
 * Adaptive Behavior Engine to tailor AI responses to the user's communication
 * style (formality, technicality, verbosity, language).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StyleProfile {
  formality: number;    // 0 (casual) to 1 (formal)
  technicality: number; // 0 (simple) to 1 (technical)
  verbosity: number;    // 0 (terse) to 1 (verbose)
  language: 'de' | 'en' | 'mixed';
}

// ---------------------------------------------------------------------------
// Indicator word lists
// ---------------------------------------------------------------------------

const FORMAL_INDICATORS = [
  // German
  'sie', 'ihnen', 'bitte', 'sehr geehrte', 'sehr geehrter', 'mit freundlichen grüßen',
  'hochachtungsvoll', 'gestatten', 'bezüglich', 'hiermit',
  // English
  'dear', 'would', 'could', 'kindly', 'sincerely', 'regards',
  'furthermore', 'therefore', 'consequently', 'accordingly',
];

const CASUAL_INDICATORS = [
  'hey', 'hi', 'cool', 'haha', 'lol', 'ok', 'okay', 'yo', 'nope', 'yep',
  'na', 'jo', 'klar', 'krass', 'geil', 'nice', 'yeah', 'nah', 'sup',
  'omg', 'btw', 'thx',
];

const TECHNICAL_INDICATORS = [
  'api', 'function', 'algorithm', 'interface', 'database', 'class',
  'endpoint', 'schema', 'repository', 'deployment', 'container',
  'middleware', 'typescript', 'javascript', 'python', 'docker',
  'kubernetes', 'sql', 'graphql', 'vector', 'embedding', 'token',
  'lambda', 'async', 'callback', 'promise', 'query', 'regex',
  'pipeline', 'microservice', 'webhook',
];

const GERMAN_INDICATORS = [
  'der', 'die', 'das', 'und', 'ist', 'nicht', 'ich', 'ein', 'eine',
  'zu', 'es', 'mit', 'auf', 'für', 'dass', 'den', 'von', 'wir',
  'haben', 'werden', 'aber', 'oder', 'auch', 'noch', 'wie', 'kann',
];

const ENGLISH_INDICATORS = [
  'the', 'is', 'and', 'to', 'of', 'a', 'in', 'that', 'it', 'for',
  'was', 'on', 'are', 'with', 'they', 'be', 'have', 'from', 'this',
  'will', 'an', 'not', 'but', 'what', 'can', 'there',
];

// ---------------------------------------------------------------------------
// Detection functions
// ---------------------------------------------------------------------------

/**
 * Detect formality of text on a 0-1 scale.
 * Counts formal and casual indicator matches, then normalises.
 */
export function detectFormality(text: string): number {
  if (!text || text.trim().length === 0) {return 0.5;}

  const lower = text.toLowerCase();
  const words = lower.split(/\s+/);

  let formalCount = 0;
  let casualCount = 0;

  for (const indicator of FORMAL_INDICATORS) {
    if (indicator.includes(' ')) {
      // multi-word: substring match
      if (lower.includes(indicator)) {formalCount += 2;}
    } else {
      if (words.includes(indicator)) {formalCount++;}
    }
  }

  for (const indicator of CASUAL_INDICATORS) {
    if (words.includes(indicator)) {casualCount++;}
  }

  const total = formalCount + casualCount;
  if (total === 0) {return 0.5;}

  return Math.min(1, Math.max(0, formalCount / total));
}

/**
 * Detect technicality of text on a 0-1 scale.
 * Counts technical term occurrences relative to total word count.
 */
export function detectTechnicality(text: string): number {
  if (!text || text.trim().length === 0) {return 0;}

  const lower = text.toLowerCase();
  const words = lower.split(/\s+/);
  if (words.length === 0) {return 0;}

  let techCount = 0;
  for (const indicator of TECHNICAL_INDICATORS) {
    for (const word of words) {
      // strip punctuation from word for matching
      const clean = word.replace(/[^a-zA-Z0-9äöü]/g, '');
      if (clean === indicator) {techCount++;}
    }
  }

  // Normalise: 1 tech word per 10 words → ~0.5, cap at 1
  const ratio = techCount / words.length;
  return Math.min(1, ratio * 10);
}

/**
 * Map average message word count to a verbosity score (0-1).
 * < 20 words → 0.2, 20-80 → linear 0.2-0.8, > 80 → 0.8
 */
export function detectVerbosity(avgWordCount: number): number {
  if (avgWordCount <= 0) {return 0;}
  if (avgWordCount < 20) {return 0.2;}
  if (avgWordCount > 80) {return 0.8;}
  // linear interpolation between 20 and 80
  return 0.2 + ((avgWordCount - 20) / 60) * 0.6;
}

/**
 * Detect language from an array of texts. Majority wins, mixed if close.
 * "Close" means the minority language has at least 35% of total indicators.
 */
export function detectLanguage(texts: string[]): 'de' | 'en' | 'mixed' {
  if (!texts || texts.length === 0) {return 'en';}

  const combined = texts.join(' ').toLowerCase();
  const words = combined.split(/\s+/);
  const wordSet = new Set(words);

  let deCount = 0;
  let enCount = 0;

  for (const w of GERMAN_INDICATORS) {
    if (wordSet.has(w)) {deCount++;}
  }
  for (const w of ENGLISH_INDICATORS) {
    if (wordSet.has(w)) {enCount++;}
  }

  const total = deCount + enCount;
  if (total === 0) {return 'en';}

  const deRatio = deCount / total;
  const enRatio = enCount / total;

  // If neither side has a strong majority (>65%), call it mixed
  if (deRatio > 0.65) {return 'de';}
  if (enRatio > 0.65) {return 'en';}
  return 'mixed';
}

/**
 * Build a complete StyleProfile from a collection of user messages.
 */
export function buildStyleProfile(messages: Array<{ text: string }>): StyleProfile {
  if (!messages || messages.length === 0) {
    return { formality: 0.5, technicality: 0, verbosity: 0, language: 'en' };
  }

  const texts = messages.map((m) => m.text).filter(Boolean);
  if (texts.length === 0) {
    return { formality: 0.5, technicality: 0, verbosity: 0, language: 'en' };
  }

  // Average formality across all messages
  const formalityScores = texts.map(detectFormality);
  const formality = formalityScores.reduce((a, b) => a + b, 0) / formalityScores.length;

  // Average technicality
  const techScores = texts.map(detectTechnicality);
  const technicality = techScores.reduce((a, b) => a + b, 0) / techScores.length;

  // Average word count → verbosity
  const avgWordCount =
    texts.reduce((acc, t) => acc + t.split(/\s+/).length, 0) / texts.length;
  const verbosity = detectVerbosity(avgWordCount);

  // Language detection on all texts combined
  const language = detectLanguage(texts);

  return {
    formality: Math.round(formality * 100) / 100,
    technicality: Math.round(technicality * 100) / 100,
    verbosity: Math.round(verbosity * 100) / 100,
    language,
  };
}

/**
 * Produce style recommendations from a profile.
 */
export function recommendStyle(profile: StyleProfile): Record<string, string> {
  const recommendations: Record<string, string> = {};

  // Formality
  if (profile.formality >= 0.7) {
    recommendations.tone = 'formal';
    recommendations.greeting = 'Verwenden Sie formelle Anrede';
  } else if (profile.formality <= 0.3) {
    recommendations.tone = 'casual';
    recommendations.greeting = 'Lockere Anrede verwenden';
  } else {
    recommendations.tone = 'neutral';
    recommendations.greeting = 'Neutrale Anrede';
  }

  // Technicality
  if (profile.technicality >= 0.5) {
    recommendations.vocabulary = 'technical';
    recommendations.codeExamples = 'include';
  } else {
    recommendations.vocabulary = 'simple';
    recommendations.codeExamples = 'minimal';
  }

  // Verbosity
  if (profile.verbosity >= 0.6) {
    recommendations.responseLength = 'detailed';
  } else if (profile.verbosity <= 0.3) {
    recommendations.responseLength = 'concise';
  } else {
    recommendations.responseLength = 'balanced';
  }

  // Language
  recommendations.language = profile.language;

  return recommendations;
}
