/**
 * Draft Content Generation & Management
 *
 * Handles proactive draft generation, context gathering,
 * prompt building, and draft CRUD operations.
 */

import { v4 as uuidv4 } from 'uuid';
import { queryContext, AIContext } from '../../utils/database-context';
import { logger } from '../../utils/logger';
import { isClaudeAvailable, generateClaudeResponse } from '../claude';
import { getOrCreateProfile, BusinessProfile } from '../business-profile-learning';
import { notifyDraftReady } from '../push-notifications';
import {
  DraftTrigger,
  GeneratedDraft,
  DraftType,
  DetectedDraftNeed,
  RelatedIdeaRow,
  DraftRow,
  detectDraftNeed,
} from './draft-detection';

// ===========================================
// Context Gathering
// ===========================================

interface DraftContext {
  profile: BusinessProfile | null;
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
          ELSE 999999.0
        END ASC
      LIMIT 5`,
      [trigger.context, trigger.ideaId]
    );

    context.relatedIdeas = relatedResult.rows.map((r: RelatedIdeaRow) => ({
      id: r.id,
      title: r.title,
      summary: r.summary,
      keywords: r.keywords,
      similarity: r.similarity,
    }));
    context.relatedIdeaIds = relatedResult.rows.map((r: RelatedIdeaRow) => r.id);

    logger.debug('Gathered related ideas via semantic similarity', {
      count: context.relatedIdeas.length,
      topSimilarity: context.relatedIdeas[0]?.similarity,
    });

    // 3. Aktuelle Themen (optimierte Batch-Query)
    // Note: keywords is JSONB, so we use jsonb_array_elements_text instead of unnest
    const topicsResult = await queryContext(
      trigger.context,
      `WITH recent_keywords AS (
        SELECT jsonb_array_elements_text(keywords) as topic, COUNT(*) as freq
        FROM ideas
        WHERE context = $1
          AND created_at > NOW() - INTERVAL '7 days'
          AND keywords IS NOT NULL
          AND jsonb_typeof(keywords) = 'array'
        GROUP BY jsonb_array_elements_text(keywords)
      )
      SELECT topic, freq
      FROM recent_keywords
      WHERE length(topic) > 2
      ORDER BY freq DESC
      LIMIT 10`,
      [trigger.context]
    );
    context.recentTopics = topicsResult.rows.map((r: { topic: string; freq: number }) => r.topic);

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
      context.relatedIdeas = fallbackResult.rows as DraftContext['relatedIdeas'];
      context.relatedIdeaIds = fallbackResult.rows.map((r: { id: string }) => r.id);
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
  } catch (error) {
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

    // Smart Content Typen
    case 'reading':
      basePrompt = `Du bist ein literarischer Assistent. Du bereitest Leseempfehlungen vor und stellst Inhalte bereit.

WICHTIGE REGELN:
- Liefere den vollständigen Text wenn es sich um ein kurzes Werk handelt (Gedicht, Kurztext, Zitat)
- Bei längeren Werken: Zusammenfassung + Schlüsselpassagen + Kontext
- Gib immer Hintergrund zum Autor und Werk (Entstehungszeit, Epoche, Bedeutung)
- Formatiere übersichtlich mit Abschnitten
- Sprache: Deutsch, aber Originaltexte in Originalsprache belassen`;
      break;
    case 'research':
      basePrompt = `Du bist ein Recherche-Assistent. Du recherchierst Themen gründlich und stellst eine kompakte Zusammenfassung bereit.

WICHTIGE REGELN:
- Strukturiere die Recherche in klare Abschnitte
- Beginne mit einer kurzen Zusammenfassung (2-3 Sätze)
- Dann: Wichtigste Fakten als Bullet Points
- Dann: Tiefergehende Details wenn relevant
- Beende mit "Weiterführend:" und 2-3 Aspekte die man vertiefen könnte
- Sei faktenbasiert und nenne Quellen/Hintergründe wo möglich
- Sprache: Deutsch`;
      break;
    case 'learning':
      basePrompt = `Du bist ein Lern-Assistent. Du bereitest Lernmaterial verständlich und strukturiert auf.

WICHTIGE REGELN:
- Beginne mit einer einfachen Erklärung (ELI5-Stil)
- Dann: Kernkonzepte als nummerierte Liste
- Dann: Ein konkretes Beispiel
- Beende mit 2-3 Verständnisfragen zum Selbsttest
- Verwende Analogien um komplexe Konzepte greifbar zu machen
- Sprache: Deutsch, Fachbegriffe erklärt`;
      break;
    case 'plan':
      basePrompt = `Du bist ein Planungs-Assistent. Du erstellst strukturierte, umsetzbare Pläne.

WICHTIGE REGELN:
- Beginne mit dem Ziel (1 Satz)
- Dann: Nummerierte Schritte mit konkreten Aktionen
- Jeder Schritt hat: Was tun + geschätzte Dauer + benötigte Ressourcen
- Markiere kritische Schritte mit [!]
- Beende mit einer Checkliste zum Abhaken
- Sprache: Deutsch, knapp und actionable`;
      break;
    case 'analysis':
      basePrompt = `Du bist ein Analyse-Assistent. Du erstellst strukturierte, objektive Analysen.

WICHTIGE REGELN:
- Beginne mit einer Einordnung/Überblick (2-3 Sätze)
- Dann: Pro/Contra oder Stärken/Schwächen als Gegenüberstellung
- Dann: Vergleich mit Alternativen wenn relevant
- Beende mit einer Empfehlung/Einschätzung
- Sei objektiv und faktenbasiert
- Sprache: Deutsch`;
      break;
    default:
      basePrompt += `\n\nErstelle einen gut strukturierten Text.`;
  }

  // Personalisierung für Smart Content Typen anwenden
  if (isSmartContentType(draftType)) {
    if (contextData.profile) {
      const profile = contextData.profile;
      if (profile.role) {
        basePrompt += `\n\nDer Nutzer ist ${profile.role}.`;
      }
      if (profile.industry) {
        basePrompt += ` Branche: ${profile.industry}.`;
      }
    }
  }

  return basePrompt;
}

function buildUserPrompt(
  draftType: DraftType,
  trigger: DraftTrigger,
  draftNeed: DetectedDraftNeed,
  contextData: DraftContext
): string {
  // Smart Content Typen haben spezialisierte Prompts
  if (isSmartContentType(draftType)) {
    return buildSmartContentUserPrompt(draftType, trigger, draftNeed, contextData);
  }

  // Original: Writing-Typen
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

/**
 * Prüft ob ein DraftType ein Smart Content Typ ist
 */
function isSmartContentType(draftType: DraftType): boolean {
  return ['reading', 'research', 'learning', 'plan', 'analysis'].includes(draftType);
}

/**
 * Baut spezialisierte User-Prompts für Smart Content Typen
 */
function buildSmartContentUserPrompt(
  draftType: DraftType,
  trigger: DraftTrigger,
  draftNeed: DetectedDraftNeed,
  contextData: DraftContext
): string {
  let prompt = '';

  switch (draftType) {
    case 'reading':
      prompt = `Der Nutzer möchte folgendes lesen:\n\n`;
      prompt += `AUFGABE: ${trigger.title}\n`;
      if (trigger.summary) prompt += `KONTEXT: ${trigger.summary}\n`;
      if (draftNeed.extractedTopic) prompt += `THEMA: ${draftNeed.extractedTopic}\n`;
      prompt += `\nBitte stelle den Inhalt bereit:
- Falls es ein kurzes Werk ist (Gedicht, Kurztext): Gib den vollständigen Text wieder
- Falls es ein längeres Werk ist: Zusammenfassung + wichtigste Passagen
- Gib Kontext zum Werk (Autor, Entstehung, Epoche, Bedeutung)
- Formatiere übersichtlich`;
      break;

    case 'research':
      prompt = `Der Nutzer möchte folgendes recherchieren:\n\n`;
      prompt += `AUFGABE: ${trigger.title}\n`;
      if (trigger.summary) prompt += `KONTEXT: ${trigger.summary}\n`;
      if (draftNeed.extractedTopic) prompt += `THEMA: ${draftNeed.extractedTopic}\n`;
      prompt += `\nErstelle eine kompakte Recherche-Zusammenfassung:
1. Kurze Zusammenfassung (2-3 Sätze)
2. Wichtigste Fakten (Bullet Points)
3. Tiefergehende Details
4. Weiterführende Aspekte zum Vertiefen`;
      break;

    case 'learning':
      prompt = `Der Nutzer möchte folgendes lernen/verstehen:\n\n`;
      prompt += `AUFGABE: ${trigger.title}\n`;
      if (trigger.summary) prompt += `KONTEXT: ${trigger.summary}\n`;
      if (draftNeed.extractedTopic) prompt += `THEMA: ${draftNeed.extractedTopic}\n`;
      prompt += `\nErstelle Lernmaterial:
1. Einfache Erklärung (für Einsteiger verständlich)
2. Kernkonzepte (nummeriert)
3. Konkretes Beispiel
4. 2-3 Verständnisfragen zum Selbsttest`;
      break;

    case 'plan':
      prompt = `Der Nutzer möchte folgendes planen/organisieren:\n\n`;
      prompt += `AUFGABE: ${trigger.title}\n`;
      if (trigger.summary) prompt += `KONTEXT: ${trigger.summary}\n`;
      if (draftNeed.extractedTopic) prompt += `THEMA: ${draftNeed.extractedTopic}\n`;
      prompt += `\nErstelle einen strukturierten Plan:
1. Ziel (1 Satz)
2. Nummerierte Schritte mit: Aktion + geschätzte Dauer + benötigte Ressourcen
3. Kritische Schritte mit [!] markieren
4. Abschließende Checkliste`;
      break;

    case 'analysis':
      prompt = `Der Nutzer möchte folgendes analysieren/bewerten:\n\n`;
      prompt += `AUFGABE: ${trigger.title}\n`;
      if (trigger.summary) prompt += `KONTEXT: ${trigger.summary}\n`;
      if (draftNeed.extractedTopic) prompt += `THEMA: ${draftNeed.extractedTopic}\n`;
      prompt += `\nErstelle eine strukturierte Analyse:
1. Einordnung/Überblick (2-3 Sätze)
2. Pro/Contra oder Stärken/Schwächen
3. Vergleich mit Alternativen (falls relevant)
4. Empfehlung/Einschätzung`;
      break;

    default:
      prompt = `AUFGABE: ${trigger.title}\n`;
      if (trigger.summary) prompt += `DETAILS: ${trigger.summary}\n`;
      prompt += `\nBereite den Inhalt vor:`;
  }

  // Kontext aus ähnlichen Ideen (für alle Smart Content Typen)
  if (contextData.relatedIdeas.length > 0) {
    prompt += `\n\nRELEVANTER KONTEXT aus früheren Notizen des Nutzers:\n`;
    for (const idea of contextData.relatedIdeas.slice(0, 3)) {
      prompt += `- ${idea.title}: ${idea.summary || ''}\n`;
    }
  }

  return prompt;
}

// ===========================================
// Draft Generation (Main Entry Point)
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
    claudeAvailable: isClaudeAvailable(),
  });

  // Check Claude availability first
  if (!isClaudeAvailable()) {
    logger.warn('Draft generation skipped - Claude not available', {
      ideaId: trigger.ideaId,
      hasApiKey: !!process.env.ANTHROPIC_API_KEY,
    });
    return null;
  }

  // 1. Prüfe ob Draft benötigt wird
  const draftNeed = await detectDraftNeed(fullText, trigger.type, trigger.context);

  logger.info('Draft need detection result', {
    ideaId: trigger.ideaId,
    detected: draftNeed.detected,
    draftType: draftNeed.draftType,
    confidence: draftNeed.confidence,
    matchedPattern: draftNeed.matchedPattern,
    extractedTopic: draftNeed.extractedTopic,
    extractedRecipient: draftNeed.extractedRecipient,
  });

  if (!draftNeed.detected || draftNeed.confidence < 0.5) {
    logger.info('No draft need detected or confidence too low', {
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
  } catch (error) {
    logger.error('Draft generation failed', error instanceof Error ? error : undefined, { ideaId: trigger.ideaId });
    return null;
  }
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
  profileSnapshot: BusinessProfile | null;
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
  const params: (string | number)[] = [context];

  if (status) {
    query += ` AND d.status = $2`;
    params.push(status);
  }

  query += ` ORDER BY d.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  params.push(limit, offset);

  const result = await queryContext(context, query, params);

  return result.rows.map((row: DraftRow) => ({
    id: row.id,
    ideaId: row.idea_id,
    draftType: row.draft_type,
    triggerPattern: row.trigger_pattern || '',
    content: row.content,
    wordCount: row.word_count,
    status: row.status as GeneratedDraft['status'],
    generationTimeMs: row.generation_time_ms,
    relatedIdeaIds: row.related_idea_ids || [],
  }));
}
