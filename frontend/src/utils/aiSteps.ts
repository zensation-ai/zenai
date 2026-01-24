/**
 * AI Processing Steps Definitions
 * Defines the steps shown during AI processing for transparency
 */

export interface ProcessingStep {
  id: string;
  label: string;
  description: string;
  emoji: string;
  estimatedDuration: number; // ms
}

/**
 * Steps for voice memo processing (transcription + structuring)
 */
export const VOICE_MEMO_STEPS: ProcessingStep[] = [
  {
    id: 'receiving',
    label: 'Empfange',
    description: 'Audio wird aufgenommen',
    emoji: '🎤',
    estimatedDuration: 500,
  },
  {
    id: 'transcribing',
    label: 'Transkribiere',
    description: 'Sprache wird in Text umgewandelt',
    emoji: '📝',
    estimatedDuration: 3000,
  },
  {
    id: 'analyzing',
    label: 'Analysiere',
    description: 'Inhalt wird verstanden',
    emoji: '🔍',
    estimatedDuration: 2000,
  },
  {
    id: 'structuring',
    label: 'Strukturiere',
    description: 'Gedanke wird organisiert',
    emoji: '🧩',
    estimatedDuration: 2000,
  },
  {
    id: 'saving',
    label: 'Speichere',
    description: 'In dein Brain integriert',
    emoji: '💾',
    estimatedDuration: 500,
  },
];

/**
 * Steps for text input processing (structuring only)
 */
export const TEXT_PROCESSING_STEPS: ProcessingStep[] = [
  {
    id: 'analyzing',
    label: 'Analysiere',
    description: 'Ich verstehe den Inhalt',
    emoji: '🔍',
    estimatedDuration: 1500,
  },
  {
    id: 'classifying',
    label: 'Klassifiziere',
    description: 'Typ und Kategorie werden bestimmt',
    emoji: '🏷️',
    estimatedDuration: 1000,
  },
  {
    id: 'extracting',
    label: 'Extrahiere',
    description: 'Wichtige Punkte werden erkannt',
    emoji: '✨',
    estimatedDuration: 1500,
  },
  {
    id: 'suggesting',
    label: 'Schlage vor',
    description: 'Nächste Schritte werden generiert',
    emoji: '💡',
    estimatedDuration: 1000,
  },
];

/**
 * Steps for semantic search
 */
export const SEARCH_STEPS: ProcessingStep[] = [
  {
    id: 'understanding',
    label: 'Verstehe',
    description: 'Ich verstehe deine Suchanfrage',
    emoji: '🧠',
    estimatedDuration: 500,
  },
  {
    id: 'searching',
    label: 'Suche',
    description: 'Durchsuche dein Gedächtnis',
    emoji: '🔍',
    estimatedDuration: 1500,
  },
  {
    id: 'ranking',
    label: 'Sortiere',
    description: 'Ergebnisse nach Relevanz ordnen',
    emoji: '📊',
    estimatedDuration: 500,
  },
];

/**
 * Get the appropriate steps array for a process type
 */
export function getStepsForType(
  type: 'voice' | 'text' | 'search'
): ProcessingStep[] {
  switch (type) {
    case 'voice':
      return VOICE_MEMO_STEPS;
    case 'text':
      return TEXT_PROCESSING_STEPS;
    case 'search':
      return SEARCH_STEPS;
    default:
      return TEXT_PROCESSING_STEPS;
  }
}

/**
 * Calculate progress percentage based on current step
 */
export function getStepProgress(
  steps: ProcessingStep[],
  currentStepIndex: number
): number {
  if (steps.length === 0) return 0;
  return Math.round(((currentStepIndex + 1) / steps.length) * 100);
}

/**
 * Get total estimated duration for a process type
 */
export function getTotalEstimatedDuration(
  type: 'voice' | 'text' | 'search'
): number {
  const steps = getStepsForType(type);
  return steps.reduce((sum, step) => sum + step.estimatedDuration, 0);
}
