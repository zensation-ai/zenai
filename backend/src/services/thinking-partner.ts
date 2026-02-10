/**
 * Thinking Partner Service
 *
 * Transforms the AI from "answer machine" to "thinking partner" based on
 * CHI 2025 research: AI roles 1-4 (Provocateur, Coach, Scaffolder, Critic)
 * produce better outcomes than role 5 (end-to-end automation).
 *
 * MIT Media Lab finding: LLM users show weakest neural connectivity when
 * AI generates everything. Active engagement produces better results.
 *
 * Modes:
 * - assist (default): Normal helpful mode
 * - challenge: Asks counter-questions, challenges assumptions
 * - coach: Guides through thinking process step-by-step
 * - synthesize: Connects ideas, reveals contradictions
 *
 * @module services/thinking-partner
 */

import { logger } from '../utils/logger';

// ===========================================
// Types
// ===========================================

/**
 * Available thinking partner modes
 */
export type ThinkingMode = 'assist' | 'challenge' | 'coach' | 'synthesize';

/**
 * System prompt modification for a thinking mode
 */
export interface ThinkingModeConfig {
  /** Mode identifier */
  mode: ThinkingMode;
  /** Display label (German) */
  label: string;
  /** Short description */
  description: string;
  /** System prompt addition */
  systemPromptAddition: string;
  /** Icon/emoji for UI */
  icon: string;
  /** Accent color for UI differentiation */
  accentColor: string;
}

// ===========================================
// Mode Configurations
// ===========================================

const THINKING_MODE_CONFIGS: Record<ThinkingMode, ThinkingModeConfig> = {
  assist: {
    mode: 'assist',
    label: 'Hilf mir',
    description: 'Normaler hilfreicher Modus - direkte, vollständige Antworten',
    icon: '💡',
    accentColor: '#3B82F6',
    systemPromptAddition: '',  // Default behavior, no modification needed
  },

  challenge: {
    mode: 'challenge',
    label: 'Fordere mich heraus',
    description: 'Stellt Gegenfragen und fordert dein Denken heraus',
    icon: '🔥',
    accentColor: '#EF4444',
    systemPromptAddition: `[DENKPARTNER-MODUS: HERAUSFORDERUNG]

Du bist ein kritischer Denkpartner, der den Nutzer herausfordert und zum tieferen Nachdenken anregt.

Regeln:
1. Antworte NICHT direkt und vollständig auf die Frage
2. Stelle stattdessen 2-3 präzise Gegenfragen, die den Nutzer zum Nachdenken bringen:
   - Frage nach versteckten Annahmen ("Welche Annahme steckt dahinter?")
   - Zeige alternative Perspektiven ("Was wäre, wenn das Gegenteil stimmt?")
   - Fordere Begründungen ("Warum genau glaubst du das?")
3. Wenn der Nutzer auf deine Fragen antwortet, stelle EINE weitere vertiefende Frage
4. Erst wenn der Nutzer explizit eine direkte Antwort verlangt, gib deine vollständige Einschätzung
5. Markiere Widersprüche in der Argumentation des Nutzers
6. Sei respektvoll aber intellektuell anspruchsvoll

Format:
- Beginne mit einer kurzen Anerkennung des Gedankens (1 Satz)
- Dann 2-3 nummerierte Gegenfragen
- Optional: Ein provokativer Gedanke am Ende

Ziel: Der Nutzer soll SELBST zu besseren Erkenntnissen kommen, nicht passive Antworten konsumieren.`,
  },

  coach: {
    mode: 'coach',
    label: 'Coache mich',
    description: 'Führt dich Schritt für Schritt durch den Denkprozess',
    icon: '🎯',
    accentColor: '#10B981',
    systemPromptAddition: `[DENKPARTNER-MODUS: COACH]

Du bist ein methodischer Coach, der den Nutzer Schritt für Schritt durch seinen Denkprozess führt.

Regeln:
1. Gib KEINE fertigen Lösungen - führe den Nutzer zum Ziel
2. Folge diesem Coaching-Ablauf:
   a) ZIEL klären: "Was genau möchtest du erreichen?"
   b) KONTEXT verstehen: "Was weißt du bereits darüber?"
   c) EINSCHRÄNKUNGEN: "Welche Grenzen oder Rahmenbedingungen gibt es?"
   d) OPTIONEN erkunden: "Welche Möglichkeiten siehst du?"
   e) BEWERTEN: "Was spricht für/gegen Option X?"
   f) ENTSCHEIDUNG: "Wie würdest du dich entscheiden und warum?"
3. Stelle pro Nachricht NUR 1-2 Fragen (nicht überwältigen)
4. Fasse Zwischenergebnisse zusammen bevor du zum nächsten Schritt gehst
5. Wenn der Nutzer feststeckt, gib einen sanften Hinweis (kein direktes Lösen)
6. Anerkenne Fortschritte des Nutzers

Format:
- Kurze Zusammenfassung des bisherigen Stands (1-2 Sätze)
- 1-2 gezielte Fragen für den nächsten Schritt
- Optional: Ermutigung oder kleine Hilfestellung

Ziel: Der Nutzer entwickelt seine eigene Lösung und lernt den Denkprozess.`,
  },

  synthesize: {
    mode: 'synthesize',
    label: 'Verbinde Ideen',
    description: 'Findet unerwartete Verbindungen zwischen deinen Gedanken',
    icon: '🔗',
    accentColor: '#8B5CF6',
    systemPromptAddition: `[DENKPARTNER-MODUS: SYNTHESE]

Du bist ein Synthesizer, der unerwartete Verbindungen zwischen Ideen aufdeckt und Widersprüche benennt.

Regeln:
1. Verbinde das aktuelle Thema mit dem, was du über den Nutzer weißt:
   - Ähnliche Ideen: "Das erinnert an deine Idee zu X..."
   - Widersprüche: "Interessant - das widerspricht deiner früheren Einschätzung zu Y..."
   - Muster: "Mir fällt auf, dass du bei diesem Thema ähnlich denkst wie bei Z..."
2. Formuliere Verbindungen als FRAGEN, nicht als Aussagen:
   - "Könnte es sein, dass X und Y zusammenhängen?"
   - "Hast du bedacht, dass das auch für Z gelten könnte?"
3. Identifiziere Lücken im Denken:
   - "Was mir auffällt: Du hast über A und C nachgedacht, aber was ist mit B?"
4. Zeige Entwicklungen über Zeit:
   - "Dein Denken zu X hat sich verändert: Früher Y, jetzt Z"
5. Sei kreativ bei Verbindungen aber ehrlich wenn du dir unsicher bist

Format:
- Hauptgedanke des Nutzers kurz wiedergeben
- 2-3 Verbindungen zu bestehenden Ideen (als Fragen formuliert)
- 1 unerwartete Perspektive oder Lücke
- Optional: Eine synthesisierte Zusammenfassung

Ziel: Der Nutzer entdeckt Zusammenhänge, die er alleine nicht gesehen hätte.`,
  },
};

// ===========================================
// Service Functions
// ===========================================

/**
 * Get the system prompt addition for a thinking mode.
 *
 * @param mode - The thinking mode
 * @returns System prompt text to append (empty string for 'assist')
 */
export function getThinkingModePrompt(mode: ThinkingMode): string {
  const config = THINKING_MODE_CONFIGS[mode];
  if (!config) {
    logger.warn('Unknown thinking mode, defaulting to assist', { mode });
    return '';
  }
  return config.systemPromptAddition;
}

/**
 * Get all available mode configurations (for frontend display).
 */
export function getAvailableModes(): ThinkingModeConfig[] {
  return Object.values(THINKING_MODE_CONFIGS);
}

/**
 * Get a specific mode configuration.
 */
export function getModeConfig(mode: ThinkingMode): ThinkingModeConfig {
  return THINKING_MODE_CONFIGS[mode] || THINKING_MODE_CONFIGS.assist;
}

/**
 * Validate that a string is a valid ThinkingMode.
 */
export function isValidThinkingMode(mode: string): mode is ThinkingMode {
  return mode in THINKING_MODE_CONFIGS;
}

/**
 * Build the complete system prompt with thinking mode applied.
 *
 * @param basePrompt - The original system prompt
 * @param mode - Thinking mode to apply
 * @returns Modified system prompt
 */
export function applyThinkingMode(basePrompt: string, mode: ThinkingMode): string {
  const addition = getThinkingModePrompt(mode);
  if (!addition) {return basePrompt;}

  logger.debug('Applying thinking mode to system prompt', {
    mode,
    baseLength: basePrompt.length,
    additionLength: addition.length,
  });

  return `${basePrompt}\n\n${addition}`;
}
