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
 * Steps for inbox triage processing
 */
export const TRIAGE_STEPS: ProcessingStep[] = [
  {
    id: 'loading',
    label: 'Lade',
    description: 'Gedanken werden geladen',
    emoji: '📋',
    estimatedDuration: 500,
  },
  {
    id: 'analyzing',
    label: 'Analysiere',
    description: 'Prioritäten werden bewertet',
    emoji: '🔍',
    estimatedDuration: 2000,
  },
  {
    id: 'sorting',
    label: 'Sortiere',
    description: 'Reihenfolge wird optimiert',
    emoji: '📊',
    estimatedDuration: 1500,
  },
  {
    id: 'complete',
    label: 'Fertig',
    description: 'Triage bereit',
    emoji: '✅',
    estimatedDuration: 300,
  },
];

/**
 * Steps for document analysis processing
 */
export const DOCUMENT_STEPS: ProcessingStep[] = [
  {
    id: 'uploading',
    label: 'Lade hoch',
    description: 'Dokument wird übertragen',
    emoji: '📤',
    estimatedDuration: 1000,
  },
  {
    id: 'parsing',
    label: 'Lese',
    description: 'Inhalt wird extrahiert',
    emoji: '📖',
    estimatedDuration: 2000,
  },
  {
    id: 'analyzing',
    label: 'Analysiere',
    description: 'KI versteht den Inhalt',
    emoji: '🧠',
    estimatedDuration: 3000,
  },
  {
    id: 'indexing',
    label: 'Indexiere',
    description: 'Wird durchsuchbar gemacht',
    emoji: '🗂️',
    estimatedDuration: 1000,
  },
];

/**
 * Steps for vision/image analysis
 */
export const VISION_STEPS: ProcessingStep[] = [
  {
    id: 'uploading',
    label: 'Lade',
    description: 'Bild wird übertragen',
    emoji: '🖼️',
    estimatedDuration: 500,
  },
  {
    id: 'analyzing',
    label: 'Analysiere',
    description: 'Bild wird erkannt',
    emoji: '👁️',
    estimatedDuration: 2000,
  },
  {
    id: 'extracting',
    label: 'Extrahiere',
    description: 'Informationen werden gelesen',
    emoji: '📝',
    estimatedDuration: 1500,
  },
];

/**
 * Steps for code execution
 */
export const CODE_EXECUTION_STEPS: ProcessingStep[] = [
  {
    id: 'generating',
    label: 'Generiere',
    description: 'Code wird erstellt',
    emoji: '💻',
    estimatedDuration: 2000,
  },
  {
    id: 'validating',
    label: 'Validiere',
    description: 'Sicherheitscheck läuft',
    emoji: '🔒',
    estimatedDuration: 500,
  },
  {
    id: 'executing',
    label: 'Führe aus',
    description: 'Code wird ausgeführt',
    emoji: '⚡',
    estimatedDuration: 3000,
  },
  {
    id: 'result',
    label: 'Ergebnis',
    description: 'Ergebnis wird aufbereitet',
    emoji: '📊',
    estimatedDuration: 300,
  },
];

export type ProcessType = 'voice' | 'text' | 'search' | 'triage' | 'document' | 'vision' | 'code';

/**
 * Get the appropriate steps array for a process type
 */
export function getStepsForType(type: ProcessType): ProcessingStep[] {
  switch (type) {
    case 'voice':
      return VOICE_MEMO_STEPS;
    case 'text':
      return TEXT_PROCESSING_STEPS;
    case 'search':
      return SEARCH_STEPS;
    case 'triage':
      return TRIAGE_STEPS;
    case 'document':
      return DOCUMENT_STEPS;
    case 'vision':
      return VISION_STEPS;
    case 'code':
      return CODE_EXECUTION_STEPS;
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
export function getTotalEstimatedDuration(type: ProcessType): number {
  const steps = getStepsForType(type);
  return steps.reduce((sum, step) => sum + step.estimatedDuration, 0);
}
