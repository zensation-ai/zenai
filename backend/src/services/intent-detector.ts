/**
 * Intent Detector - Phase 35
 *
 * Two-tier intent detection for voice memos:
 * 1. Fast regex pre-filter for German trigger words
 * 2. LLM classification for structured data extraction (only if pre-filter triggers)
 *
 * Intent Types: idea (default), email_draft, calendar_event, travel_query
 */

import { queryOllamaJSON } from '../utils/ollama';
import { logger } from '../utils/logger';

// ============================================================
// Types
// ============================================================

export type IntentType = 'idea' | 'email_draft' | 'calendar_event' | 'travel_query';

export interface DetectedIntent {
  type: IntentType;
  confidence: number;
  extracted_data: Record<string, unknown>;
  trigger_phrases: string[];
}

export interface IntentDetectionResult {
  primary_intent: IntentType;
  confidence: number;
  intents: DetectedIntent[];
  also_create_idea: boolean;
}

// ============================================================
// Regex Pre-Filters (German trigger words)
// ============================================================

interface TriggerPattern {
  intent: IntentType;
  patterns: RegExp[];
  weight: number;
}

const TRIGGER_PATTERNS: TriggerPattern[] = [
  {
    intent: 'email_draft',
    weight: 0.7,
    patterns: [
      /\b(?:e-?mail|mail)\b/i,
      /\bschreib(?:e|en)?\s+(?:e-?mail|nachricht|mail)\b/i,
      /\bschreib(?:e|en)?\s+eine?\s+(?:e-?mail|nachricht|mail)\b/i,
      /\bnachricht\s+an\b/i,
      /\bantwort(?:e|en)?\s+(?:auf|an)\b/i,
      /\bschick(?:e|en)?\s+(?:mail|nachricht)\b/i,
      /\bschick(?:e|en)?\s+eine?\s+(?:mail|nachricht)\b/i,
      /\bmail\s+an\b/i,
      /\be-?mail\s+(?:an|schreiben|verfassen|erstellen)\b/i,
    ],
  },
  {
    intent: 'calendar_event',
    weight: 0.7,
    patterns: [
      /\btermin\b/i,
      /\bmeeting\b/i,
      /\bbesprechung\b/i,
      /\btreffen\s+(?:mit|um|am)\b/i,
      /\bverabredung\b/i,
      /\bum\s+\d{1,2}:\d{2}\s+uhr\b/i,
      /\bum\s+\d{1,2}\s+uhr\b/i,
      /\bam\s+\d{1,2}\.\s*\w+\s+um\s+\d{1,2}/i,
      /\bam\s+\d{1,2}\.\s*\w+\s+\d{1,2}/i,
      /\bkalender\b/i,
      /\bdeadline\b/i,
      /\berinnerung\b/i,
      /\berinner(?:e|t)?\s+mich\b/i,
      /\btrag\s+in\s+den\s+kalender/i,
      /\btrag\s+kalender/i,
    ],
  },
  {
    intent: 'travel_query',
    weight: 0.6,
    patterns: [
      /\bfahrt\s+nach\b/i,
      /\bfahren\s+nach\b/i,
      /\banreise\s+(nach|zu|zum|zur)\b/i,
      /\breise\s+nach\b/i,
      /\bwie\s+lange\s+brauche?\s+ich\s+(nach|zu|von|bis)\b/i,
      /\bentfernung\s+(nach|zu|von|bis|zwischen)\b/i,
      /\broute\s+(nach|von|zu)\b/i,
      /\bfahrzeit\b/i,
      /\breisezeit\b/i,
      /\breisedauer\b/i,
    ],
  },
];

// ============================================================
// Pre-Filter
// ============================================================

interface PreFilterResult {
  triggered: boolean;
  intents: { intent: IntentType; weight: number; matches: string[] }[];
}

function preFilter(text: string): PreFilterResult {
  const results: PreFilterResult['intents'] = [];

  for (const trigger of TRIGGER_PATTERNS) {
    const matches: string[] = [];

    for (const pattern of trigger.patterns) {
      const match = text.match(pattern);
      if (match) {
        matches.push(match[0]);
      }
    }

    if (matches.length > 0) {
      results.push({
        intent: trigger.intent,
        weight: Math.min(trigger.weight + (matches.length - 1) * 0.1, 0.95),
        matches,
      });
    }
  }

  return {
    triggered: results.length > 0,
    intents: results.sort((a, b) => b.weight - a.weight),
  };
}

// ============================================================
// LLM Intent Classification
// ============================================================

interface LLMIntentResponse {
  intents: Array<{
    type: IntentType;
    confidence: number;
    extracted: Record<string, unknown>;
  }>;
  also_create_idea: boolean;
}

const INTENT_CLASSIFICATION_PROMPT = `Du bist ein Intent-Erkenner fuer eine KI-Notiz-App. Analysiere den Text und erkenne Absichten.

MOEGLICHE INTENTS:
- "email_draft": Nutzer will eine E-Mail schreiben oder beantworten
- "calendar_event": Nutzer erwaehnt einen Termin, ein Meeting, eine Deadline oder eine Erinnerung
- "travel_query": Nutzer erwaehnt eine Fahrt oder Reise zwischen zwei Orten
- "idea": Standard-Gedanke ohne spezifische Aktion (nur wenn kein anderer Intent passt)

REGELN:
- Extrahiere so viele strukturierte Daten wie moeglich
- Bei calendar_event: Versuche Datum, Uhrzeit, Dauer, Teilnehmer und Ort zu extrahieren
- Bei email_draft: Versuche Empfaenger, Betreff-Kontext und Kernpunkte zu extrahieren
- Bei travel_query: Extrahiere Start- und Zielort
- also_create_idea=true wenn der Gedanke auch als Idee gespeichert werden soll (Standard: true)
- also_create_idea=false nur bei reinen Aktions-Anfragen ("erinnere mich um 15 Uhr")

Antworte NUR mit validem JSON:
{
  "intents": [
    {
      "type": "calendar_event",
      "confidence": 0.95,
      "extracted": {
        "title": "Meeting mit Max",
        "date": "2026-02-15",
        "time": "14:00",
        "duration_minutes": 60,
        "participants": ["Max Mueller"],
        "location": "Buero Muenchen"
      }
    }
  ],
  "also_create_idea": true
}`;

async function classifyWithLLM(text: string, preFilterHints: PreFilterResult['intents']): Promise<LLMIntentResponse | null> {
  const hintStr = preFilterHints
    .map(h => `Moeglicher Intent: ${h.intent} (Trigger: ${h.matches.join(', ')})`)
    .join('\n');

  const prompt = `${INTENT_CLASSIFICATION_PROMPT}

HINWEISE AUS PRE-FILTER:
${hintStr}

TEXT ZU ANALYSIEREN:
"${text}"`;

  try {
    const result = await queryOllamaJSON<LLMIntentResponse>(prompt);
    if (result && result.intents && Array.isArray(result.intents)) {
      return result;
    }
    return null;
  } catch (err) {
    logger.warn('LLM intent classification failed', { error: (err as Error).message });
    return null;
  }
}

// ============================================================
// Main Detection Function
// ============================================================

/**
 * Detect intents from a transcript text.
 * Returns the primary intent, all detected intents, and whether to also create an idea.
 */
export async function detectIntents(text: string): Promise<IntentDetectionResult> {
  const defaultResult: IntentDetectionResult = {
    primary_intent: 'idea',
    confidence: 1.0,
    intents: [],
    also_create_idea: true,
  };

  if (!text || text.trim().length < 5) {
    return defaultResult;
  }

  // Step 1: Fast regex pre-filter
  const preFilterResult = preFilter(text);

  if (!preFilterResult.triggered) {
    // No triggers found - it's just a standard idea
    return defaultResult;
  }

  logger.debug('Intent pre-filter triggered', {
    intents: preFilterResult.intents.map(i => i.intent),
    operation: 'detectIntents'
  });

  // Step 2: LLM classification for structured extraction
  const llmResult = await classifyWithLLM(text, preFilterResult.intents);

  if (!llmResult) {
    // LLM failed - fall back to pre-filter results with basic extraction
    const fallbackIntents: DetectedIntent[] = preFilterResult.intents.map(pf => ({
      type: pf.intent,
      confidence: pf.weight,
      extracted_data: {},
      trigger_phrases: pf.matches,
    }));

    return {
      primary_intent: preFilterResult.intents[0].intent,
      confidence: preFilterResult.intents[0].weight,
      intents: fallbackIntents,
      also_create_idea: true,
    };
  }

  // Merge pre-filter and LLM results
  const intents: DetectedIntent[] = llmResult.intents.map(li => {
    const preFilterMatch = preFilterResult.intents.find(pf => pf.intent === li.type);
    return {
      type: li.type,
      confidence: li.confidence,
      extracted_data: li.extracted || {},
      trigger_phrases: preFilterMatch?.matches || [],
    };
  });

  // Sort by confidence
  intents.sort((a, b) => b.confidence - a.confidence);

  const primaryIntent = intents.length > 0 ? intents[0] : null;

  logger.info('Intent detection complete', {
    primary: primaryIntent?.type || 'idea',
    count: intents.length,
    alsoCreateIdea: llmResult.also_create_idea,
    operation: 'detectIntents'
  });

  return {
    primary_intent: primaryIntent?.type || 'idea',
    confidence: primaryIntent?.confidence || 1.0,
    intents,
    also_create_idea: llmResult.also_create_idea !== false, // Default true
  };
}
