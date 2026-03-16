/**
 * Phase 90: Voice Persona Service
 *
 * Different voice configurations per context (personal, work, learning, creative).
 * Each persona defines a TTS voice, speaking rate, pitch adjustment,
 * and personality traits that influence the system prompt.
 */

import { logger } from '../../utils/logger';

// ===========================================
// Types
// ===========================================

export interface VoicePersona {
  id: string;
  name: string;
  context: string;
  tts_voice_id: string;
  speaking_rate: number;
  pitch_adjustment: number;
  personality_traits: string[];
}

// ===========================================
// Default Personas
// ===========================================

const DEFAULT_PERSONAS: VoicePersona[] = [
  {
    id: 'work-professional',
    name: 'Professional',
    context: 'work',
    tts_voice_id: 'de-DE-ConradNeural',
    speaking_rate: 1.0,
    pitch_adjustment: 0,
    personality_traits: ['formal', 'concise', 'structured'],
  },
  {
    id: 'personal-warm',
    name: 'Warm',
    context: 'personal',
    tts_voice_id: 'de-DE-KatjaNeural',
    speaking_rate: 0.95,
    pitch_adjustment: 0,
    personality_traits: ['friendly', 'empathetic', 'casual'],
  },
  {
    id: 'learning-patient',
    name: 'Tutor',
    context: 'learning',
    tts_voice_id: 'de-DE-AmalaNeural',
    speaking_rate: 0.9,
    pitch_adjustment: 0,
    personality_traits: ['patient', 'explanatory', 'encouraging'],
  },
  {
    id: 'creative-expressive',
    name: 'Creative',
    context: 'creative',
    tts_voice_id: 'de-DE-KatjaNeural',
    speaking_rate: 1.05,
    pitch_adjustment: 2,
    personality_traits: ['expressive', 'imaginative', 'playful'],
  },
];

// ===========================================
// Trait-to-Prompt Mapping
// ===========================================

const TRAIT_PROMPTS: Record<string, string> = {
  formal: 'Verwende eine formelle, professionelle Sprache.',
  concise: 'Fasse dich kurz und komme schnell auf den Punkt.',
  structured: 'Strukturiere Informationen klar und logisch.',
  friendly: 'Sei warmherzig und freundlich im Ton.',
  empathetic: 'Zeige Verstaendnis und Einfuehlungsvermoegen.',
  casual: 'Verwende eine lockere, natuerliche Sprache.',
  patient: 'Erklaere geduldig und wiederhole bei Bedarf.',
  explanatory: 'Erklaere Konzepte ausfuehrlich und verstaendlich.',
  encouraging: 'Ermutige den Nutzer und hebe Fortschritte hervor.',
  expressive: 'Sei ausdrucksstark und lebendig in deiner Sprache.',
  imaginative: 'Nutze kreative Metaphern und Bilder.',
  playful: 'Sei spielerisch und bringe Leichtigkeit ins Gespraech.',
};

// ===========================================
// Service Functions
// ===========================================

/**
 * Get the default persona for a given context.
 * Falls back to 'work-professional' if context is unknown.
 */
export function getPersona(context: string): VoicePersona {
  const persona = DEFAULT_PERSONAS.find(p => p.context === context);
  if (!persona) {
    logger.debug('No persona found for context, using work-professional fallback', { requestedContext: context });
    return DEFAULT_PERSONAS.find(p => p.id === 'work-professional')!;
  }
  return persona;
}

/**
 * Get a persona by its ID.
 */
export function getPersonaById(personaId: string): VoicePersona | undefined {
  return DEFAULT_PERSONAS.find(p => p.id === personaId);
}

/**
 * List all available personas.
 */
export function listPersonas(): VoicePersona[] {
  return [...DEFAULT_PERSONAS];
}

/**
 * Generate a system prompt fragment from a persona's personality traits.
 * This gets appended to the main system prompt to shape the AI's voice behavior.
 */
export function getPersonaPromptAddendum(persona: VoicePersona): string {
  if (persona.personality_traits.length === 0) {
    return '';
  }

  const traitInstructions = persona.personality_traits
    .map(trait => TRAIT_PROMPTS[trait])
    .filter(Boolean);

  if (traitInstructions.length === 0) {
    return '';
  }

  return `\n\nStimmpersona "${persona.name}" (${persona.context}):\n${traitInstructions.join('\n')}`;
}
