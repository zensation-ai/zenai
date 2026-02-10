/**
 * Draft Detection & Types
 *
 * Shared types for the draft generation system and
 * detection logic for identifying writing tasks.
 */

import { queryContext, AIContext } from '../../utils/database-context';
import { logger } from '../../utils/logger';

// ===========================================
// Types
// ===========================================

export interface DraftTrigger {
  ideaId: string;
  title: string;
  summary: string;
  rawTranscript?: string;
  keywords: string[];
  type: string;
  category: string;
  context: AIContext;
}

export interface GeneratedDraft {
  id: string;
  ideaId: string;
  draftType: DraftType;
  triggerPattern: string;
  content: string;
  wordCount: number;
  status: 'generating' | 'ready' | 'error';
  generationTimeMs: number;
  relatedIdeaIds: string[];
}

export type DraftType = 'email' | 'article' | 'proposal' | 'document' | 'generic';

export interface TriggerPattern {
  id: string;
  draftType: DraftType;
  patternText: string;
  patternType: 'keyword' | 'phrase' | 'regex';
  isActive: boolean;
}

export interface DetectedDraftNeed {
  detected: boolean;
  draftType: DraftType;
  confidence: number;
  matchedPattern: string;
  extractedTopic?: string;
  extractedRecipient?: string;
}

// Database row types for type-safe queries
export interface RelatedIdeaRow {
  id: string;
  title: string;
  summary: string;
  keywords?: string[];
  similarity?: number;
}

export interface DraftRow {
  id: string;
  idea_id: string;
  draft_type: DraftType;
  trigger_pattern: string | null;
  content: string;
  word_count: number;
  status: string;
  generation_time_ms: number;
  related_idea_ids: string[] | null;
  idea_title?: string;
}

// ===========================================
// Draft Detection
// ===========================================

/**
 * Analysiert einen Text auf Schreibaufgaben
 */
export async function detectDraftNeed(
  text: string,
  ideaType: string,
  context: AIContext = 'personal'
): Promise<DetectedDraftNeed> {
  // Nur Tasks analysieren
  if (ideaType !== 'task') {
    return { detected: false, draftType: 'generic', confidence: 0, matchedPattern: '' };
  }

  const lowerText = text.toLowerCase();

  // 1. Lade aktive Patterns aus DB
  const patterns = await getActivePatterns(context);

  // 2. Prüfe Pattern-Matches
  for (const pattern of patterns) {
    if (pattern.patternType === 'phrase') {
      if (lowerText.includes(pattern.patternText)) {
        return {
          detected: true,
          draftType: pattern.draftType,
          confidence: 0.9,
          matchedPattern: pattern.patternText,
          extractedTopic: extractTopic(text, pattern.draftType),
          extractedRecipient: extractRecipient(text),
        };
      }
    } else if (pattern.patternType === 'keyword') {
      const words = lowerText.split(/\s+/);
      if (words.some(w => w.includes(pattern.patternText))) {
        return {
          detected: true,
          draftType: pattern.draftType,
          confidence: 0.7,
          matchedPattern: pattern.patternText,
          extractedTopic: extractTopic(text, pattern.draftType),
          extractedRecipient: extractRecipient(text),
        };
      }
    }
  }

  // 3. Fallback: Einfache Heuristik
  const fallbackResult = detectWithHeuristics(lowerText);
  if (fallbackResult.detected) {
    return fallbackResult;
  }

  return { detected: false, draftType: 'generic', confidence: 0, matchedPattern: '' };
}

/**
 * Einfache Heuristik-basierte Erkennung
 */
function detectWithHeuristics(text: string): DetectedDraftNeed {
  const patterns: Array<{ pattern: RegExp; type: DraftType; confidence: number }> = [
    { pattern: /e-?mail|mail\s+an|antwort\s+schreib/i, type: 'email', confidence: 0.8 },
    { pattern: /artikel|blogpost|beitrag|text\s+verfass/i, type: 'article', confidence: 0.8 },
    { pattern: /angebot|vorschlag|pitch|präsentation/i, type: 'proposal', confidence: 0.7 },
    { pattern: /dokumentation|anleitung|prozess\s+beschreib/i, type: 'document', confidence: 0.7 },
    { pattern: /schreib|verfass|erstell.*text/i, type: 'generic', confidence: 0.5 },
  ];

  for (const { pattern, type, confidence } of patterns) {
    if (pattern.test(text)) {
      return {
        detected: true,
        draftType: type,
        confidence,
        matchedPattern: pattern.source,
        extractedTopic: extractTopic(text, type),
        extractedRecipient: extractRecipient(text),
      };
    }
  }

  return { detected: false, draftType: 'generic', confidence: 0, matchedPattern: '' };
}

/**
 * Extrahiert das Thema aus dem Text
 */
function extractTopic(text: string, _draftType: DraftType): string {
  // Suche nach "über X", "zu X", "wegen X"
  const topicPatterns = [
    /(?:über|zu|wegen|bezüglich|betreffend)\s+(.+?)(?:\.|$|,)/i,
    /(?:thema|topic):\s*(.+?)(?:\.|$|,)/i,
  ];

  for (const pattern of topicPatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return match[1].trim().substring(0, 100);
    }
  }

  // Fallback: Ersten relevanten Teil des Textes nehmen
  return text.substring(0, 50).trim();
}

/**
 * Extrahiert den Empfänger (für E-Mails)
 */
function extractRecipient(text: string): string | undefined {
  /* eslint-disable security/detect-unsafe-regex -- Simple name extraction from bounded user input */
  const recipientPatterns = [
    /(?:an|für|to)\s+([A-ZÄÖÜa-zäöüß]+(?:\s+[A-ZÄÖÜa-zäöüß]+)?)/i,
    /(?:mail|email|nachricht)\s+(?:an|für)\s+([A-ZÄÖÜa-zäöüß]+)/i,
  ];
  /* eslint-enable security/detect-unsafe-regex */

  for (const pattern of recipientPatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }

  return undefined;
}

// ===========================================
// Pattern Loading
// ===========================================

async function getActivePatterns(context: AIContext): Promise<TriggerPattern[]> {
  try {
    const result = await queryContext(
      context,
      `SELECT id, draft_type, pattern_text, pattern_type, is_active
       FROM draft_trigger_patterns
       WHERE context = $1 AND is_active = true
       ORDER BY times_used DESC, times_triggered DESC`,
      [context]
    );

    // Fallback to defaults if DB returns empty
    if (result.rows.length === 0) {
      logger.info('No patterns in DB, using defaults', { context });
      return getDefaultPatterns(context);
    }

    logger.debug('Loaded patterns from DB', { context, count: result.rows.length });
    return result.rows.map(row => ({
      id: row.id,
      draftType: row.draft_type as DraftType,
      patternText: row.pattern_text,
      patternType: row.pattern_type,
      isActive: row.is_active,
    }));
  } catch (error) {
    logger.warn('Failed to load draft patterns, using defaults', { error });
    return getDefaultPatterns(context);
  }
}

function getDefaultPatterns(_context: AIContext): TriggerPattern[] {
  return [
    { id: '1', draftType: 'email', patternText: 'e-mail schreiben', patternType: 'phrase', isActive: true },
    { id: '2', draftType: 'email', patternText: 'mail an', patternType: 'phrase', isActive: true },
    { id: '3', draftType: 'article', patternText: 'artikel schreiben', patternType: 'phrase', isActive: true },
    { id: '4', draftType: 'article', patternText: 'blogpost', patternType: 'keyword', isActive: true },
    { id: '5', draftType: 'proposal', patternText: 'angebot erstellen', patternType: 'phrase', isActive: true },
    { id: '6', draftType: 'document', patternText: 'dokumentation', patternType: 'keyword', isActive: true },
  ];
}
