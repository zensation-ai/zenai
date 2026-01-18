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
import { notifyDraftReady } from './push-notifications';

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

  logger.info('Starting draft generation check', {
    ideaId: trigger.ideaId,
    type: trigger.type,
    context: trigger.context,
    textPreview: fullText.substring(0, 100),
  });

  // 1. Prüfe ob Draft benötigt wird
  const draftNeed = await detectDraftNeed(fullText, trigger.type, trigger.context);

  if (!draftNeed.detected || draftNeed.confidence < 0.5) {
    logger.info('No draft need detected', {
      ideaId: trigger.ideaId,
      type: trigger.type,
      detected: draftNeed.detected,
      confidence: draftNeed.confidence,
    });
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

    // 6. Send push notification (async, don't await to not block response)
    notifyDraftReady(trigger.context, draftId, draftNeed.draftType, trigger.title)
      .then((sent) => {
        if (sent) {
          logger.info('Draft ready notification sent', { draftId, ideaId: trigger.ideaId });
        }
      })
      .catch((err) => {
        logger.warn('Failed to send draft notification', { error: err, draftId });
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
  relatedIdeas: Array<{
    id: string;
    title: string;
    summary: string;
    keywords?: string[];
    similarity?: number;
  }>;
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

    // 2. Ähnliche Ideen laden mit semantischer Ähnlichkeit (Batch-optimiert)
    // Nutzt das Embedding der Trigger-Idee um semantisch ähnliche Ideen zu finden
    const relatedResult = await queryContext(
      trigger.context,
      `WITH target_idea AS (
        SELECT embedding FROM ideas WHERE id = $2
      )
      SELECT
        i.id,
        i.title,
        i.summary,
        i.keywords,
        CASE
          WHEN ti.embedding IS NOT NULL AND i.embedding IS NOT NULL
          THEN 1 - (i.embedding <=> ti.embedding)
          ELSE 0.5
        END as similarity
      FROM ideas i
      CROSS JOIN target_idea ti
      WHERE i.context = $1
        AND i.id != $2
        AND i.is_archived = false
        AND i.embedding IS NOT NULL
      ORDER BY
        CASE
          WHEN ti.embedding IS NOT NULL
          THEN i.embedding <=> ti.embedding
          ELSE i.created_at
        END ASC
      LIMIT 5`,
      [trigger.context, trigger.ideaId]
    );

    context.relatedIdeas = relatedResult.rows.map((r: any) => ({
      id: r.id,
      title: r.title,
      summary: r.summary,
      keywords: r.keywords,
      similarity: r.similarity,
    }));
    context.relatedIdeaIds = relatedResult.rows.map((r: any) => r.id);

    logger.debug('Gathered related ideas via semantic similarity', {
      count: context.relatedIdeas.length,
      topSimilarity: context.relatedIdeas[0]?.similarity,
    });

    // 3. Aktuelle Themen (optimierte Batch-Query)
    const topicsResult = await queryContext(
      trigger.context,
      `WITH recent_keywords AS (
        SELECT unnest(keywords) as topic, COUNT(*) as freq
        FROM ideas
        WHERE context = $1
          AND created_at > NOW() - INTERVAL '7 days'
          AND keywords IS NOT NULL
        GROUP BY unnest(keywords)
      )
      SELECT topic, freq
      FROM recent_keywords
      WHERE length(topic) > 2
      ORDER BY freq DESC
      LIMIT 10`,
      [trigger.context]
    );
    context.recentTopics = topicsResult.rows.map((r: any) => r.topic);

  } catch (error) {
    logger.warn('Failed to gather full context for draft', { error });

    // Fallback: Einfache Query ohne Embeddings
    try {
      const fallbackResult = await queryContext(
        trigger.context,
        `SELECT id, title, summary
         FROM ideas
         WHERE context = $1 AND id != $2 AND is_archived = false
         ORDER BY created_at DESC
         LIMIT 5`,
        [trigger.context, trigger.ideaId]
      );
      context.relatedIdeas = fallbackResult.rows;
      context.relatedIdeaIds = fallbackResult.rows.map((r: any) => r.id);
    } catch (fallbackError) {
      logger.error('Fallback context gathering also failed', fallbackError instanceof Error ? fallbackError : undefined);
    }
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

// ===========================================
// PHASE 5: Enhanced Feedback System
// ===========================================

/**
 * Detailed feedback submission interface
 */
export interface DetailedFeedback {
  rating: number;                           // 1-5 star rating
  feedbackText?: string;                    // Free-text feedback
  contentReusedPercent?: number;            // 0-100%
  editsDescription?: string;                // What was edited
  editCategories?: EditCategory[];          // Categories of edits made
  wasHelpful?: boolean;                     // Quick helpful/not helpful
  wouldUseAgain?: boolean;                  // Would use draft feature again
  qualityAspects?: QualityAspects;          // Detailed quality ratings
  finalWordCount?: number;                  // Word count after editing
  sessionDurationMs?: number;               // Time spent with draft
  feedbackSource?: FeedbackSource;          // Where feedback came from
}

export type EditCategory = 'tone' | 'length' | 'content' | 'structure' | 'formatting' | 'accuracy';
export type FeedbackSource = 'manual' | 'prompt' | 'auto_detected' | 'copy_action';

export interface QualityAspects {
  accuracy?: number;      // 1-5: How accurate was the content
  tone?: number;          // 1-5: Was the tone appropriate
  completeness?: number;  // 1-5: How complete was the draft
  relevance?: number;     // 1-5: How relevant to the task
  structure?: number;     // 1-5: How well structured
}

/**
 * Feedback analytics data
 */
export interface FeedbackAnalytics {
  draftType: string;
  totalDrafts: number;
  totalFeedback: number;
  avgRating: number;
  avgContentReused: number;
  helpfulPercent: number;
  topIssues: string[];
  conversionRate: number;
  satisfactionScore: number;
}

/**
 * Pattern effectiveness data
 */
export interface PatternEffectiveness {
  patternId: string;
  patternText: string;
  draftType: string;
  isActive: boolean;
  timesTriggered: number;
  timesUsed: number;
  avgRating: number | null;
  qualityScore: number | null;
  successRate: number | null;
  performanceTier: 'excellent' | 'good' | 'average' | 'needs_improvement' | 'new';
  consecutiveLowRatings: number;
}

/**
 * Submits detailed feedback for a draft with full tracking
 */
export async function submitDetailedFeedback(
  draftId: string,
  context: AIContext,
  feedback: DetailedFeedback
): Promise<{ success: boolean; feedbackId?: string; message?: string }> {
  const feedbackId = uuidv4();

  try {
    // 1. Get draft info for validation
    const draftResult = await queryContext(
      context,
      `SELECT id, word_count, draft_type, trigger_pattern FROM idea_drafts WHERE id = $1 AND context = $2`,
      [draftId, context]
    );

    if (draftResult.rows.length === 0) {
      return { success: false, message: 'Draft not found' };
    }

    const draft = draftResult.rows[0];

    // 2. Analyze feedback sentiment (simple rule-based for now)
    const sentiment = analyzeFeedbackSentiment(feedback);

    // 3. Identify improvement areas
    const improvementAreas = identifyImprovementAreas(feedback);

    // 4. Calculate quality score
    const qualityScore = calculateQualityScore(feedback);

    // 5. Insert into feedback history
    await queryContext(
      context,
      `INSERT INTO draft_feedback_history (
        id, draft_id, context, rating, feedback_text, content_reused_percent,
        edits_description, edit_categories, original_word_count, final_word_count,
        was_helpful, would_use_again, quality_aspects, feedback_sentiment,
        improvement_areas, feedback_source, session_duration_ms
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
      [
        feedbackId,
        draftId,
        context,
        feedback.rating,
        feedback.feedbackText || null,
        feedback.contentReusedPercent ?? null,
        feedback.editsDescription || null,
        feedback.editCategories || null,
        draft.word_count,
        feedback.finalWordCount || null,
        feedback.wasHelpful ?? null,
        feedback.wouldUseAgain ?? null,
        feedback.qualityAspects ? JSON.stringify(feedback.qualityAspects) : null,
        sentiment,
        improvementAreas.length > 0 ? improvementAreas : null,
        feedback.feedbackSource || 'manual',
        feedback.sessionDurationMs || null,
      ]
    );

    // 6. Update the draft record
    await queryContext(
      context,
      `UPDATE idea_drafts
       SET user_rating = $3,
           user_feedback = $4,
           content_reused_percent = $5,
           status = CASE WHEN status = 'discarded' THEN status ELSE 'used' END,
           used_at = COALESCE(used_at, NOW()),
           feedback_count = COALESCE(feedback_count, 0) + 1,
           last_feedback_at = NOW(),
           feedback_sentiment = $6,
           quality_score = $7
       WHERE id = $1 AND context = $2`,
      [
        draftId,
        context,
        feedback.rating,
        feedback.feedbackText || null,
        feedback.contentReusedPercent ?? null,
        sentiment,
        qualityScore,
      ]
    );

    // 7. Update pattern metrics (trigger in DB handles most of this, but we add extra logic)
    await updatePatternFromFeedback(context, draft.draft_type, draft.trigger_pattern, feedback);

    logger.info('Detailed feedback submitted', {
      feedbackId,
      draftId,
      rating: feedback.rating,
      sentiment,
      qualityScore,
    });

    return { success: true, feedbackId };
  } catch (error) {
    logger.error('Failed to submit detailed feedback', error instanceof Error ? error : undefined, { draftId });
    return { success: false, message: 'Failed to submit feedback' };
  }
}

/**
 * Analyzes feedback sentiment
 */
function analyzeFeedbackSentiment(feedback: DetailedFeedback): 'positive' | 'neutral' | 'negative' | 'mixed' {
  let positiveSignals = 0;
  let negativeSignals = 0;

  // Rating signals
  if (feedback.rating >= 4) positiveSignals += 2;
  else if (feedback.rating <= 2) negativeSignals += 2;

  // Helpful signal
  if (feedback.wasHelpful === true) positiveSignals++;
  else if (feedback.wasHelpful === false) negativeSignals++;

  // Would use again signal
  if (feedback.wouldUseAgain === true) positiveSignals++;
  else if (feedback.wouldUseAgain === false) negativeSignals++;

  // Content reuse signal
  if (feedback.contentReusedPercent !== undefined) {
    if (feedback.contentReusedPercent >= 70) positiveSignals++;
    else if (feedback.contentReusedPercent <= 30) negativeSignals++;
  }

  // Quality aspects average
  if (feedback.qualityAspects) {
    const aspects = Object.values(feedback.qualityAspects).filter(v => v !== undefined) as number[];
    if (aspects.length > 0) {
      const avg = aspects.reduce((a, b) => a + b, 0) / aspects.length;
      if (avg >= 4) positiveSignals++;
      else if (avg <= 2) negativeSignals++;
    }
  }

  // Determine overall sentiment
  if (positiveSignals > negativeSignals + 1) return 'positive';
  if (negativeSignals > positiveSignals + 1) return 'negative';
  if (positiveSignals > 0 && negativeSignals > 0) return 'mixed';
  return 'neutral';
}

/**
 * Identifies areas for improvement based on feedback
 */
function identifyImprovementAreas(feedback: DetailedFeedback): string[] {
  const areas: string[] = [];

  // From edit categories
  if (feedback.editCategories) {
    areas.push(...feedback.editCategories);
  }

  // From quality aspects
  if (feedback.qualityAspects) {
    if (feedback.qualityAspects.accuracy && feedback.qualityAspects.accuracy <= 2) {
      areas.push('accuracy');
    }
    if (feedback.qualityAspects.tone && feedback.qualityAspects.tone <= 2) {
      areas.push('tone');
    }
    if (feedback.qualityAspects.completeness && feedback.qualityAspects.completeness <= 2) {
      areas.push('completeness');
    }
    if (feedback.qualityAspects.relevance && feedback.qualityAspects.relevance <= 2) {
      areas.push('relevance');
    }
    if (feedback.qualityAspects.structure && feedback.qualityAspects.structure <= 2) {
      areas.push('structure');
    }
  }

  // From content reuse
  if (feedback.contentReusedPercent !== undefined && feedback.contentReusedPercent < 30) {
    if (!areas.includes('content')) areas.push('content');
  }

  return [...new Set(areas)]; // Remove duplicates
}

/**
 * Calculates quality score (0-10 scale)
 */
function calculateQualityScore(feedback: DetailedFeedback): number {
  let score = (feedback.rating || 3) * 2.0; // Base: 0-10 from rating

  // Adjust for content reuse
  if (feedback.contentReusedPercent !== undefined) {
    score += ((feedback.contentReusedPercent - 50) / 50) * 1.5;
  }

  // Helpful bonus
  if (feedback.wasHelpful === true) score += 0.5;
  else if (feedback.wasHelpful === false) score -= 0.5;

  // Would use again bonus
  if (feedback.wouldUseAgain === true) score += 0.5;

  // Quality aspects average bonus
  if (feedback.qualityAspects) {
    const aspects = Object.values(feedback.qualityAspects).filter(v => v !== undefined) as number[];
    if (aspects.length > 0) {
      const avg = aspects.reduce((a, b) => a + b, 0) / aspects.length;
      score += (avg - 3) * 0.3; // ±0.6 based on average
    }
  }

  return Math.max(0, Math.min(10, Math.round(score * 100) / 100));
}

/**
 * Updates pattern metrics based on feedback
 */
async function updatePatternFromFeedback(
  context: AIContext,
  draftType: string,
  triggerPattern: string,
  feedback: DetailedFeedback
): Promise<void> {
  if (!triggerPattern) return;

  try {
    // The DB trigger handles most updates, but we add extra logic for consecutive low ratings
    if (feedback.rating <= 2) {
      // Check if we should suggest improvements for this pattern
      const patternResult = await queryContext(
        context,
        `SELECT id, consecutive_low_ratings, avg_rating, times_triggered
         FROM draft_trigger_patterns
         WHERE context = $1 AND draft_type = $2 AND pattern_text = $3`,
        [context, draftType, triggerPattern]
      );

      if (patternResult.rows.length > 0) {
        const pattern = patternResult.rows[0];
        // If pattern has 2+ consecutive low ratings, create improvement suggestion
        if (pattern.consecutive_low_ratings >= 2) {
          await createImprovementSuggestion(context, draftType, pattern, feedback);
        }
      }
    }
  } catch (error) {
    logger.warn('Failed to update pattern from feedback', { error });
  }
}

/**
 * Creates an improvement suggestion for a struggling pattern
 */
async function createImprovementSuggestion(
  context: AIContext,
  draftType: string,
  pattern: any,
  feedback: DetailedFeedback
): Promise<void> {
  try {
    // Check if we already have a pending suggestion for this pattern
    const existingResult = await queryContext(
      context,
      `SELECT id FROM draft_learning_suggestions
       WHERE context = $1 AND draft_type = $2 AND status = 'pending'
       LIMIT 1`,
      [context, draftType]
    );

    if (existingResult.rows.length > 0) {
      // Update existing suggestion
      await queryContext(
        context,
        `UPDATE draft_learning_suggestions
         SET based_on_feedback_count = based_on_feedback_count + 1,
             avg_rating_before = $3,
             updated_at = NOW()
         WHERE id = $1`,
        [existingResult.rows[0].id, pattern.avg_rating]
      );
    } else {
      // Create new suggestion
      const improvementAreas = identifyImprovementAreas(feedback);
      await queryContext(
        context,
        `INSERT INTO draft_learning_suggestions (
          id, context, draft_type, suggestion_type, suggestion_text, rationale,
          based_on_feedback_count, avg_rating_before, common_issues, priority
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          uuidv4(),
          context,
          draftType,
          'prompt_improvement',
          `Consider improving ${draftType} generation for "${pattern.pattern_text}" pattern`,
          `Pattern has ${pattern.consecutive_low_ratings} consecutive low ratings (avg: ${pattern.avg_rating})`,
          1,
          pattern.avg_rating,
          improvementAreas,
          pattern.consecutive_low_ratings >= 3 ? 'high' : 'medium',
        ]
      );
    }
  } catch (error) {
    logger.warn('Failed to create improvement suggestion', { error });
  }
}

/**
 * Records a draft copy event
 */
export async function recordDraftCopy(
  draftId: string,
  context: AIContext
): Promise<void> {
  try {
    await queryContext(
      context,
      `UPDATE idea_drafts
       SET copy_count = COALESCE(copy_count, 0) + 1,
           last_copy_at = NOW(),
           status = CASE WHEN status = 'ready' THEN 'viewed' ELSE status END
       WHERE id = $1 AND context = $2`,
      [draftId, context]
    );
  } catch (error) {
    logger.warn('Failed to record draft copy', { error });
  }
}

/**
 * Gets feedback analytics for a context
 */
export async function getFeedbackAnalytics(
  context: AIContext,
  days: number = 30
): Promise<FeedbackAnalytics[]> {
  try {
    const result = await queryContext(
      context,
      `SELECT
        d.draft_type,
        COUNT(DISTINCT d.id) as total_drafts,
        COUNT(f.id) as total_feedback,
        ROUND(AVG(f.rating)::DECIMAL, 2) as avg_rating,
        ROUND(AVG(f.content_reused_percent)::DECIMAL, 2) as avg_content_reused,
        ROUND((SUM(CASE WHEN f.was_helpful THEN 1 ELSE 0 END)::DECIMAL / NULLIF(COUNT(f.id), 0)) * 100, 2) as helpful_percent,
        ROUND((COUNT(DISTINCT CASE WHEN d.status = 'used' THEN d.id END)::DECIMAL / NULLIF(COUNT(DISTINCT d.id), 0)) * 100, 2) as conversion_rate
      FROM idea_drafts d
      LEFT JOIN draft_feedback_history f ON f.draft_id = d.id
      WHERE d.context = $1
        AND d.created_at >= NOW() - ($2 || ' days')::INTERVAL
      GROUP BY d.draft_type
      ORDER BY total_drafts DESC`,
      [context, days]
    );

    return result.rows.map((row: any) => ({
      draftType: row.draft_type,
      totalDrafts: parseInt(row.total_drafts, 10),
      totalFeedback: parseInt(row.total_feedback, 10),
      avgRating: parseFloat(row.avg_rating) || 0,
      avgContentReused: parseFloat(row.avg_content_reused) || 0,
      helpfulPercent: parseFloat(row.helpful_percent) || 0,
      topIssues: [], // Would need separate query for this
      conversionRate: parseFloat(row.conversion_rate) || 0,
      satisfactionScore: calculateSatisfactionScore(row),
    }));
  } catch (error) {
    logger.error('Failed to get feedback analytics', error instanceof Error ? error : undefined);
    return [];
  }
}

function calculateSatisfactionScore(row: any): number {
  const rating = parseFloat(row.avg_rating) || 3;
  const helpful = parseFloat(row.helpful_percent) || 50;
  const conversion = parseFloat(row.conversion_rate) || 50;
  const reuse = parseFloat(row.avg_content_reused) || 50;

  // Weighted score: rating (40%), helpful (20%), conversion (20%), reuse (20%)
  return Math.round(((rating / 5) * 40 + (helpful / 100) * 20 + (conversion / 100) * 20 + (reuse / 100) * 20) * 10) / 10;
}

/**
 * Gets pattern effectiveness data
 */
export async function getPatternEffectiveness(
  context: AIContext
): Promise<PatternEffectiveness[]> {
  try {
    const result = await queryContext(
      context,
      `SELECT
        p.id as pattern_id,
        p.pattern_text,
        p.draft_type,
        p.is_active,
        p.times_triggered,
        p.times_used,
        p.avg_rating,
        p.quality_score,
        p.success_rate,
        p.consecutive_low_ratings,
        CASE
          WHEN p.times_triggered = 0 THEN 'new'
          WHEN p.quality_score >= 8 THEN 'excellent'
          WHEN p.quality_score >= 6 THEN 'good'
          WHEN p.quality_score >= 4 THEN 'average'
          ELSE 'needs_improvement'
        END as performance_tier
      FROM draft_trigger_patterns p
      WHERE p.context = $1
      ORDER BY p.quality_score DESC NULLS LAST, p.times_triggered DESC`,
      [context]
    );

    return result.rows.map((row: any) => ({
      patternId: row.pattern_id,
      patternText: row.pattern_text,
      draftType: row.draft_type,
      isActive: row.is_active,
      timesTriggered: parseInt(row.times_triggered, 10) || 0,
      timesUsed: parseInt(row.times_used, 10) || 0,
      avgRating: row.avg_rating ? parseFloat(row.avg_rating) : null,
      qualityScore: row.quality_score ? parseFloat(row.quality_score) : null,
      successRate: row.success_rate ? parseFloat(row.success_rate) : null,
      performanceTier: row.performance_tier,
      consecutiveLowRatings: parseInt(row.consecutive_low_ratings, 10) || 0,
    }));
  } catch (error) {
    logger.error('Failed to get pattern effectiveness', error instanceof Error ? error : undefined);
    return [];
  }
}

/**
 * Gets drafts that need feedback (used but not rated)
 */
export async function getDraftsNeedingFeedback(
  context: AIContext,
  limit: number = 10
): Promise<Array<{
  id: string;
  ideaId: string;
  ideaTitle: string;
  draftType: string;
  status: string;
  wordCount: number;
  createdAt: string;
  viewedAt: string | null;
  usedAt: string | null;
  copyCount: number;
}>> {
  try {
    const result = await queryContext(
      context,
      `SELECT
        d.id,
        d.idea_id,
        i.title as idea_title,
        d.draft_type,
        d.status,
        d.word_count,
        d.created_at,
        d.viewed_at,
        d.used_at,
        COALESCE(d.copy_count, 0) as copy_count
      FROM idea_drafts d
      JOIN ideas i ON i.id = d.idea_id
      WHERE d.context = $1
        AND d.status IN ('used', 'viewed')
        AND d.user_rating IS NULL
        AND d.created_at >= NOW() - INTERVAL '7 days'
      ORDER BY d.copy_count DESC, d.used_at DESC NULLS LAST, d.viewed_at DESC NULLS LAST
      LIMIT $2`,
      [context, limit]
    );

    return result.rows.map((row: any) => ({
      id: row.id,
      ideaId: row.idea_id,
      ideaTitle: row.idea_title,
      draftType: row.draft_type,
      status: row.status,
      wordCount: row.word_count,
      createdAt: row.created_at,
      viewedAt: row.viewed_at,
      usedAt: row.used_at,
      copyCount: parseInt(row.copy_count, 10),
    }));
  } catch (error) {
    logger.error('Failed to get drafts needing feedback', error instanceof Error ? error : undefined);
    return [];
  }
}

/**
 * Gets feedback history for a draft
 */
export async function getDraftFeedbackHistory(
  draftId: string,
  context: AIContext
): Promise<Array<{
  id: string;
  rating: number;
  feedbackText: string | null;
  contentReusedPercent: number | null;
  wasHelpful: boolean | null;
  sentiment: string;
  createdAt: string;
}>> {
  try {
    const result = await queryContext(
      context,
      `SELECT
        id, rating, feedback_text, content_reused_percent,
        was_helpful, feedback_sentiment, created_at
      FROM draft_feedback_history
      WHERE draft_id = $1 AND context = $2
      ORDER BY created_at DESC`,
      [draftId, context]
    );

    return result.rows.map((row: any) => ({
      id: row.id,
      rating: row.rating,
      feedbackText: row.feedback_text,
      contentReusedPercent: row.content_reused_percent,
      wasHelpful: row.was_helpful,
      sentiment: row.feedback_sentiment || 'neutral',
      createdAt: row.created_at,
    }));
  } catch (error) {
    logger.error('Failed to get draft feedback history', error instanceof Error ? error : undefined, { draftId });
    return [];
  }
}

/**
 * Gets learning suggestions for improvement
 */
export async function getLearningSuggestions(
  context: AIContext,
  status: 'pending' | 'applied' | 'rejected' | 'testing' = 'pending'
): Promise<Array<{
  id: string;
  draftType: string;
  suggestionType: string;
  suggestionText: string;
  rationale: string | null;
  basedOnFeedbackCount: number;
  avgRatingBefore: number | null;
  commonIssues: string[];
  priority: string;
  createdAt: string;
}>> {
  try {
    const result = await queryContext(
      context,
      `SELECT
        id, draft_type, suggestion_type, suggestion_text, rationale,
        based_on_feedback_count, avg_rating_before, common_issues, priority, created_at
      FROM draft_learning_suggestions
      WHERE context = $1 AND status = $2
      ORDER BY
        CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
        created_at DESC`,
      [context, status]
    );

    return result.rows.map((row: any) => ({
      id: row.id,
      draftType: row.draft_type,
      suggestionType: row.suggestion_type,
      suggestionText: row.suggestion_text,
      rationale: row.rationale,
      basedOnFeedbackCount: row.based_on_feedback_count,
      avgRatingBefore: row.avg_rating_before ? parseFloat(row.avg_rating_before) : null,
      commonIssues: row.common_issues || [],
      priority: row.priority,
      createdAt: row.created_at,
    }));
  } catch (error) {
    logger.error('Failed to get learning suggestions', error instanceof Error ? error : undefined);
    return [];
  }
}

/**
 * Applies or rejects a learning suggestion
 */
export async function updateLearningSuggestion(
  suggestionId: string,
  context: AIContext,
  action: 'applied' | 'rejected' | 'testing'
): Promise<boolean> {
  try {
    await queryContext(
      context,
      `UPDATE draft_learning_suggestions
       SET status = $3, applied_at = CASE WHEN $3 = 'applied' THEN NOW() ELSE applied_at END, updated_at = NOW()
       WHERE id = $1 AND context = $2`,
      [suggestionId, context, action]
    );
    return true;
  } catch (error) {
    logger.error('Failed to update learning suggestion', error instanceof Error ? error : undefined);
    return false;
  }
}

/**
 * Quick thumbs up/down feedback
 */
export async function quickFeedback(
  draftId: string,
  context: AIContext,
  isPositive: boolean
): Promise<boolean> {
  return (await submitDetailedFeedback(draftId, context, {
    rating: isPositive ? 5 : 2,
    wasHelpful: isPositive,
    feedbackSource: 'prompt',
  })).success;
}
