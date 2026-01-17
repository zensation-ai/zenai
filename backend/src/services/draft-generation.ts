/**
 * Proactive Draft Generation Service
 *
 * Erkennt automatisch Schreibaufgaben und bereitet proaktiv
 * Entwürfe vor (E-Mails, Artikel, Dokumente, etc.).
 *
 * Features:
 * - Erkennung von Schreibaufgaben ("E-Mail schreiben", "Artikel verfassen")
 * - Automatische Draft-Generierung mit Kontext
 * - Personalisierung basierend auf Business Profile
 * - Nutzung von Knowledge Graph für relevante Ideen
 */

import { v4 as uuidv4 } from 'uuid';
import { queryContext, AIContext } from '../utils/database-context';
import { logger } from '../utils/logger';
import { isClaudeAvailable, generateClaudeResponse } from './claude';
import { getOrCreateProfile } from './business-profile-learning';

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

interface TriggerPattern {
  id: string;
  draftType: DraftType;
  patternText: string;
  patternType: 'keyword' | 'phrase' | 'regex';
  isActive: boolean;
}

interface DetectedDraftNeed {
  detected: boolean;
  draftType: DraftType;
  confidence: number;
  matchedPattern: string;
  extractedTopic?: string;
  extractedRecipient?: string;
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
function extractTopic(text: string, draftType: DraftType): string {
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
  const recipientPatterns = [
    /(?:an|für|to)\s+([A-ZÄÖÜa-zäöüß]+(?:\s+[A-ZÄÖÜa-zäöüß]+)?)/i,
    /(?:mail|email|nachricht)\s+(?:an|für)\s+([A-ZÄÖÜa-zäöüß]+)/i,
  ];

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

function getDefaultPatterns(context: AIContext): TriggerPattern[] {
  return [
    { id: '1', draftType: 'email', patternText: 'e-mail schreiben', patternType: 'phrase', isActive: true },
    { id: '2', draftType: 'email', patternText: 'mail an', patternType: 'phrase', isActive: true },
    { id: '3', draftType: 'article', patternText: 'artikel schreiben', patternType: 'phrase', isActive: true },
    { id: '4', draftType: 'article', patternText: 'blogpost', patternType: 'keyword', isActive: true },
    { id: '5', draftType: 'proposal', patternText: 'angebot erstellen', patternType: 'phrase', isActive: true },
    { id: '6', draftType: 'document', patternText: 'dokumentation', patternType: 'keyword', isActive: true },
  ];
}

// ===========================================
// Draft Generation
// ===========================================

/**
 * Generiert proaktiv einen Draft für eine Idee/Task
 */
export async function generateProactiveDraft(
  trigger: DraftTrigger
): Promise<GeneratedDraft | null> {
  const startTime = Date.now();
  const fullText = `${trigger.title} ${trigger.summary} ${trigger.rawTranscript || ''}`;

  // 1. Prüfe ob Draft benötigt wird
  const draftNeed = await detectDraftNeed(fullText, trigger.type, trigger.context);

  if (!draftNeed.detected || draftNeed.confidence < 0.5) {
    logger.debug('No draft need detected', { ideaId: trigger.ideaId, type: trigger.type });
    return null;
  }

  logger.info('Draft need detected', {
    ideaId: trigger.ideaId,
    draftType: draftNeed.draftType,
    confidence: draftNeed.confidence,
    pattern: draftNeed.matchedPattern,
  });

  try {
    // 2. Sammle Kontext
    const contextData = await gatherContext(trigger);

    // 3. Generiere Draft
    const content = await generateDraftContent(
      draftNeed.draftType,
      trigger,
      draftNeed,
      contextData
    );

    if (!content) {
      logger.warn('Failed to generate draft content', { ideaId: trigger.ideaId });
      return null;
    }

    // 4. Speichere Draft
    const draftId = uuidv4();
    const wordCount = content.split(/\s+/).length;
    const generationTimeMs = Date.now() - startTime;

    await saveDraft({
      id: draftId,
      ideaId: trigger.ideaId,
      context: trigger.context,
      draftType: draftNeed.draftType,
      triggerPattern: draftNeed.matchedPattern,
      content,
      wordCount,
      generationTimeMs,
      relatedIdeaIds: contextData.relatedIdeaIds,
      profileSnapshot: contextData.profile,
    });

    // 5. Update Pattern-Statistik
    await updatePatternStats(trigger.context, draftNeed.draftType, draftNeed.matchedPattern);

    logger.info('Draft generated successfully', {
      ideaId: trigger.ideaId,
      draftId,
      draftType: draftNeed.draftType,
      wordCount,
      generationTimeMs,
    });

    return {
      id: draftId,
      ideaId: trigger.ideaId,
      draftType: draftNeed.draftType,
      triggerPattern: draftNeed.matchedPattern,
      content,
      wordCount,
      status: 'ready',
      generationTimeMs,
      relatedIdeaIds: contextData.relatedIdeaIds,
    };
  } catch (error: any) {
    logger.error('Draft generation failed', error instanceof Error ? error : undefined, { ideaId: trigger.ideaId });
    return null;
  }
}

// ===========================================
// Context Gathering
// ===========================================

interface DraftContext {
  profile: Record<string, any> | null;
  relatedIdeas: Array<{ id: string; title: string; summary: string }>;
  relatedIdeaIds: string[];
  recentTopics: string[];
}

async function gatherContext(trigger: DraftTrigger): Promise<DraftContext> {
  const context: DraftContext = {
    profile: null,
    relatedIdeas: [],
    relatedIdeaIds: [],
    recentTopics: [],
  };

  try {
    // 1. Business Profile laden
    const profile = await getOrCreateProfile(trigger.context);
    context.profile = profile;

    // 2. Ähnliche Ideen laden (für Kontext)
    const relatedResult = await queryContext(
      trigger.context,
      `SELECT id, title, summary
       FROM ideas
       WHERE context = $1 AND id != $2 AND is_archived = false
       ORDER BY created_at DESC
       LIMIT 5`,
      [trigger.context, trigger.ideaId]
    );
    context.relatedIdeas = relatedResult.rows;
    context.relatedIdeaIds = relatedResult.rows.map((r: any) => r.id);

    // 3. Aktuelle Themen
    const topicsResult = await queryContext(
      trigger.context,
      `SELECT DISTINCT unnest(keywords) as topic
       FROM ideas
       WHERE context = $1 AND created_at > NOW() - INTERVAL '7 days'
       LIMIT 10`,
      [trigger.context]
    );
    context.recentTopics = topicsResult.rows.map((r: any) => r.topic);
  } catch (error) {
    logger.warn('Failed to gather full context for draft', { error });
  }

  return context;
}

// ===========================================
// Content Generation
// ===========================================

async function generateDraftContent(
  draftType: DraftType,
  trigger: DraftTrigger,
  draftNeed: DetectedDraftNeed,
  contextData: DraftContext
): Promise<string | null> {
  if (!isClaudeAvailable()) {
    logger.warn('Claude not available for draft generation');
    return null;
  }

  const systemPrompt = buildSystemPrompt(draftType, contextData);
  const userPrompt = buildUserPrompt(draftType, trigger, draftNeed, contextData);

  try {
    const content = await generateClaudeResponse(systemPrompt, userPrompt);
    return content;
  } catch (error: any) {
    logger.error('Claude draft generation failed', error instanceof Error ? error : undefined);
    return null;
  }
}

function buildSystemPrompt(draftType: DraftType, contextData: DraftContext): string {
  let basePrompt = `Du bist ein hilfreicher Schreibassistent. Du erstellst professionelle, gut strukturierte Texte auf Deutsch.

WICHTIGE REGELN:
- Schreibe natürlich und authentisch
- Halte den Text prägnant aber vollständig
- Verwende eine angemessene Tonalität
- Füge Platzhalter in [ECKIGEN KLAMMERN] ein für fehlende Details`;

  // Personalisierung hinzufügen
  if (contextData.profile) {
    const profile = contextData.profile;
    if (profile.role) {
      basePrompt += `\n\nDer Nutzer ist ${profile.role}.`;
    }
    if (profile.industry) {
      basePrompt += ` Branche: ${profile.industry}.`;
    }
    if (profile.communication_style) {
      basePrompt += ` Kommunikationsstil: ${profile.communication_style}.`;
    }
  }

  // Typ-spezifische Anweisungen
  switch (draftType) {
    case 'email':
      basePrompt += `\n\nDu schreibst eine E-Mail. Format:
- Anrede
- Einleitung (Bezug/Kontext)
- Hauptteil (Anliegen)
- Handlungsaufforderung/nächste Schritte
- Grußformel`;
      break;
    case 'article':
      basePrompt += `\n\nDu schreibst einen Artikel/Blogpost. Format:
- Eingängige Überschrift
- Einleitung (Hook)
- Hauptteil mit Zwischenüberschriften
- Fazit/Call-to-Action`;
      break;
    case 'proposal':
      basePrompt += `\n\nDu schreibst ein Angebot/Vorschlag. Format:
- Zusammenfassung
- Problemstellung
- Lösungsansatz
- Vorteile/Nutzen
- Nächste Schritte`;
      break;
    case 'document':
      basePrompt += `\n\nDu schreibst eine Dokumentation/Anleitung. Format:
- Übersicht
- Schritt-für-Schritt Anleitung
- Wichtige Hinweise
- FAQ (falls relevant)`;
      break;
    default:
      basePrompt += `\n\nErstelle einen gut strukturierten Text.`;
  }

  return basePrompt;
}

function buildUserPrompt(
  draftType: DraftType,
  trigger: DraftTrigger,
  draftNeed: DetectedDraftNeed,
  contextData: DraftContext
): string {
  let prompt = `Bitte erstelle einen Entwurf für folgende Aufgabe:\n\n`;
  prompt += `AUFGABE: ${trigger.title}\n`;

  if (trigger.summary) {
    prompt += `DETAILS: ${trigger.summary}\n`;
  }

  if (trigger.rawTranscript) {
    prompt += `URSPRÜNGLICHE NOTIZ: ${trigger.rawTranscript}\n`;
  }

  if (draftNeed.extractedTopic) {
    prompt += `THEMA: ${draftNeed.extractedTopic}\n`;
  }

  if (draftNeed.extractedRecipient && draftType === 'email') {
    prompt += `EMPFÄNGER: ${draftNeed.extractedRecipient}\n`;
  }

  // Kontext aus ähnlichen Ideen
  if (contextData.relatedIdeas.length > 0) {
    prompt += `\nRELEVANTER KONTEXT aus früheren Notizen:\n`;
    for (const idea of contextData.relatedIdeas.slice(0, 3)) {
      prompt += `- ${idea.title}: ${idea.summary || ''}\n`;
    }
  }

  // Aktuelle Themen
  if (contextData.recentTopics.length > 0) {
    prompt += `\nAKTUELLE THEMEN: ${contextData.recentTopics.slice(0, 5).join(', ')}\n`;
  }

  prompt += `\nErstelle jetzt den ${draftType === 'email' ? 'E-Mail-Entwurf' : 'Entwurf'}:`;

  return prompt;
}

// ===========================================
// Database Operations
// ===========================================

interface SaveDraftParams {
  id: string;
  ideaId: string;
  context: AIContext;
  draftType: DraftType;
  triggerPattern: string;
  content: string;
  wordCount: number;
  generationTimeMs: number;
  relatedIdeaIds: string[];
  profileSnapshot: Record<string, any> | null;
}

async function saveDraft(params: SaveDraftParams): Promise<void> {
  await queryContext(
    params.context,
    `INSERT INTO idea_drafts (
      id, idea_id, context, draft_type, trigger_pattern, content,
      word_count, generation_time_ms, related_idea_ids, profile_snapshot, status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'ready')`,
    [
      params.id,
      params.ideaId,
      params.context,
      params.draftType,
      params.triggerPattern,
      params.content,
      params.wordCount,
      params.generationTimeMs,
      params.relatedIdeaIds,
      params.profileSnapshot ? JSON.stringify(params.profileSnapshot) : null,
    ]
  );
}

async function updatePatternStats(
  context: AIContext,
  draftType: DraftType,
  patternText: string
): Promise<void> {
  try {
    await queryContext(
      context,
      `UPDATE draft_trigger_patterns
       SET times_triggered = times_triggered + 1, updated_at = NOW()
       WHERE context = $1 AND draft_type = $2 AND pattern_text = $3`,
      [context, draftType, patternText]
    );
  } catch (error) {
    logger.warn('Failed to update pattern stats', { error });
  }
}

// ===========================================
// Draft Retrieval & Management
// ===========================================

/**
 * Holt den Draft für eine Idee
 */
export async function getDraftForIdea(
  ideaId: string,
  context: AIContext
): Promise<GeneratedDraft | null> {
  try {
    const result = await queryContext(
      context,
      `SELECT id, idea_id, draft_type, trigger_pattern, content,
              word_count, status, generation_time_ms, related_idea_ids
       FROM idea_drafts
       WHERE idea_id = $1 AND context = $2
       ORDER BY created_at DESC
       LIMIT 1`,
      [ideaId, context]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      ideaId: row.idea_id,
      draftType: row.draft_type,
      triggerPattern: row.trigger_pattern || '',
      content: row.content,
      wordCount: row.word_count,
      status: row.status,
      generationTimeMs: row.generation_time_ms,
      relatedIdeaIds: row.related_idea_ids || [],
    };
  } catch (error) {
    logger.error('Failed to get draft for idea', error instanceof Error ? error : undefined, { ideaId });
    return null;
  }
}

/**
 * Markiert einen Draft als angesehen
 */
export async function markDraftViewed(
  draftId: string,
  context: AIContext
): Promise<void> {
  await queryContext(
    context,
    `UPDATE idea_drafts
     SET status = 'viewed', viewed_at = NOW()
     WHERE id = $1 AND context = $2`,
    [draftId, context]
  );
}

/**
 * Speichert Feedback für einen Draft
 */
export async function saveDraftFeedback(
  draftId: string,
  context: AIContext,
  rating: number,
  feedback?: string,
  contentReusedPercent?: number
): Promise<void> {
  await queryContext(
    context,
    `UPDATE idea_drafts
     SET user_rating = $3,
         user_feedback = $4,
         content_reused_percent = $5,
         status = 'used',
         used_at = NOW()
     WHERE id = $1 AND context = $2`,
    [draftId, context, rating, feedback || null, contentReusedPercent || null]
  );

  // Update Pattern-Erfolgsrate
  const draft = await queryContext(
    context,
    `SELECT draft_type, trigger_pattern FROM idea_drafts WHERE id = $1`,
    [draftId]
  );

  if (draft.rows.length > 0) {
    const { draft_type, trigger_pattern } = draft.rows[0];
    await queryContext(
      context,
      `UPDATE draft_trigger_patterns
       SET times_used = times_used + 1,
           avg_rating = (COALESCE(avg_rating, 0) * times_used + $4) / (times_used + 1),
           success_rate = (times_used + 1)::decimal / NULLIF(times_triggered, 0) * 100
       WHERE context = $1 AND draft_type = $2 AND pattern_text = $3`,
      [context, draft_type, trigger_pattern, rating]
    );
  }
}

/**
 * Verwirft einen Draft
 */
export async function discardDraft(
  draftId: string,
  context: AIContext
): Promise<void> {
  await queryContext(
    context,
    `UPDATE idea_drafts
     SET status = 'discarded', discarded_at = NOW()
     WHERE id = $1 AND context = $2`,
    [draftId, context]
  );

  // Update Pattern-Statistik
  const draft = await queryContext(
    context,
    `SELECT draft_type, trigger_pattern FROM idea_drafts WHERE id = $1`,
    [draftId]
  );

  if (draft.rows.length > 0) {
    const { draft_type, trigger_pattern } = draft.rows[0];
    await queryContext(
      context,
      `UPDATE draft_trigger_patterns
       SET times_discarded = times_discarded + 1
       WHERE context = $1 AND draft_type = $2 AND pattern_text = $3`,
      [context, draft_type, trigger_pattern]
    );
  }
}

/**
 * Listet alle Drafts für einen Kontext
 */
export async function listDrafts(
  context: AIContext,
  options: { status?: string; limit?: number; offset?: number } = {}
): Promise<GeneratedDraft[]> {
  const { status, limit = 20, offset = 0 } = options;

  let query = `
    SELECT d.id, d.idea_id, d.draft_type, d.trigger_pattern, d.content,
           d.word_count, d.status, d.generation_time_ms, d.related_idea_ids,
           i.title as idea_title
    FROM idea_drafts d
    JOIN ideas i ON d.idea_id = i.id
    WHERE d.context = $1
  `;
  const params: any[] = [context];

  if (status) {
    query += ` AND d.status = $2`;
    params.push(status);
  }

  query += ` ORDER BY d.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  params.push(limit, offset);

  const result = await queryContext(context, query, params);

  return result.rows.map((row: any) => ({
    id: row.id,
    ideaId: row.idea_id,
    draftType: row.draft_type,
    triggerPattern: row.trigger_pattern || '',
    content: row.content,
    wordCount: row.word_count,
    status: row.status,
    generationTimeMs: row.generation_time_ms,
    relatedIdeaIds: row.related_idea_ids || [],
  }));
}
