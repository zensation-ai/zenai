/**
 * Phase 52: AI Language Matching
 *
 * Detects user language from input and configures Claude responses.
 * Supports DE (default), EN, FR, ES.
 */

import { logger } from '../utils/logger';

export type SupportedLanguage = 'de' | 'en' | 'fr' | 'es';

// Alias for compatibility with spec naming
export type AILanguage = SupportedLanguage;

const LANGUAGE_NAMES: Record<SupportedLanguage, string> = {
  de: 'German',
  en: 'English',
  fr: 'French',
  es: 'Spanish',
};

const LANGUAGE_PATTERNS: Record<SupportedLanguage, RegExp[]> = {
  de: [
    /\b(und|oder|nicht|ist|das|der|die|ein|eine|ich|du|wir|aber|auch|mit|für|auf|von|haben|werden|können|müssen|sollen|möchte|bitte|danke|warum|weil|wenn|dann|schon|noch|sehr|ganz|mehr|viel|alle|jetzt|hier|dort)\b/gi,
  ],
  en: [
    /\b(the|and|or|not|is|are|was|were|have|has|this|that|with|for|from|but|also|would|could|should|please|thank|why|because|when|then|already|still|very|quite|more|much|all|now|here|there)\b/gi,
  ],
  fr: [
    /\b(le|la|les|un|une|des|est|sont|avec|pour|dans|mais|aussi|que|qui|pas|très|plus|tout|tous|bien|faire|avoir|être|nous|vous|ils|elles|cette|ces|mon|ton|son|comme|quand|pourquoi|parce|merci)\b/gi,
  ],
  es: [
    /\b(el|la|los|las|un|una|es|son|con|para|en|pero|también|que|no|muy|más|todo|todos|bien|hacer|tener|ser|estar|nosotros|ustedes|ellos|ellas|este|esta|estos|estas|como|cuando|por|porque|gracias)\b/gi,
  ],
};

const LANGUAGE_INSTRUCTIONS: Record<SupportedLanguage, string> = {
  de: 'Antworte auf Deutsch.',
  en: 'Respond in English.',
  fr: 'Réponds en français.',
  es: 'Responde en español.',
};

const LANGUAGE_PROMPTS: Record<SupportedLanguage, string> = {
  de: 'Antworte auf Deutsch. Verwende eine natürliche, professionelle Sprache.',
  en: 'Respond in English. Use natural, professional language.',
  fr: 'Réponds en français. Utilise un langage naturel et professionnel.',
  es: 'Responde en español. Usa un lenguaje natural y profesional.',
};

/**
 * Detects the most likely language of the given text by counting
 * pattern matches for each supported language.
 *
 * Defaults to 'de' (German) for ambiguous or very short input.
 */
export function detectLanguage(text: string): SupportedLanguage {
  if (!text || text.trim().length === 0) {
    return 'de';
  }

  const scores: Record<SupportedLanguage, number> = { de: 0, en: 0, fr: 0, es: 0 };

  for (const lang of Object.keys(LANGUAGE_PATTERNS) as SupportedLanguage[]) {
    for (const pattern of LANGUAGE_PATTERNS[lang]) {
      const matches = text.match(pattern);
      if (matches) {
        scores[lang] += matches.length;
      }
    }
  }

  let bestLang: SupportedLanguage = 'de';
  let bestScore = 0;

  for (const lang of Object.keys(scores) as SupportedLanguage[]) {
    if (scores[lang] > bestScore) {
      bestScore = scores[lang];
      bestLang = lang;
    }
  }

  if (bestScore === 0) {
    return 'de';
  }

  logger.debug(`[ai-language] Detected language: ${bestLang} (score: ${bestScore})`, {
    scores,
  });

  return bestLang;
}

/**
 * Returns the short AI instruction string for the given language.
 */
export function getLanguageInstruction(lang: SupportedLanguage): string {
  return LANGUAGE_INSTRUCTIONS[lang];
}

/**
 * Returns the extended AI system prompt for the given language.
 */
export function getLanguageSystemPrompt(language: SupportedLanguage): string {
  return LANGUAGE_PROMPTS[language] || LANGUAGE_PROMPTS.de;
}

/**
 * Returns the English name of the language.
 */
export function getLanguageName(language: SupportedLanguage): string {
  return LANGUAGE_NAMES[language] || LANGUAGE_NAMES.de;
}

/**
 * Validates whether a string is a supported language code.
 */
export function isValidLanguage(lang: string): lang is SupportedLanguage {
  return ['de', 'en', 'fr', 'es'].includes(lang);
}

/**
 * Determines the language instruction to append to a system prompt.
 * Uses preferredLang if provided, otherwise detects from the user message.
 */
export function getSystemPromptLanguageSuffix(
  userMessage: string,
  preferredLang?: SupportedLanguage
): string {
  const lang = preferredLang || detectLanguage(userMessage);
  return LANGUAGE_INSTRUCTIONS[lang];
}
