/**
 * Daily Learning Service
 *
 * Führt tägliches automatisches Lernen durch:
 * - Analysiert alle neuen Ideen des Tages
 * - Aktualisiert Nutzer-Präferenzen
 * - Erkennt neue Muster
 * - Generiert Vorschläge für den nächsten Tag
 * - Erstellt tägliche Zusammenfassungen
 */

import { v4 as uuidv4 } from 'uuid';
import { queryContext, AIContext } from '../utils/database-context';
import { queryOllamaJSON } from '../utils/ollama';
import { logger } from '../utils/logger';
// Note: learning-engine and user-profile modules removed - functionality integrated in business-profile-learning.ts
// Phase 3 (Vision): Automation suggestions
import { generateAutomationSuggestions, AutomationSuggestion } from './automation-registry';

// ===========================================
// Types
// ===========================================

interface DailyLearningResult {
  date: string;
  ideas_analyzed: number;
  corrections_processed: number;
  new_patterns: Pattern[];
  updated_preferences: PreferenceUpdate[];
  new_keywords: string[];
  daily_summary: string;
  key_learnings: string[];
  suggestions_for_tomorrow: string[];
  automation_suggestions: number;
}

interface Pattern {
  type: 'time' | 'topic' | 'category' | 'workflow';
  description: string;
  confidence: number;
  data: Record<string, unknown>;
}

interface PreferenceUpdate {
  field: string;
  old_value: unknown;
  new_value: unknown;
  reason: string;
}

interface AISuggestion {
  id: string;
  suggestion_type: string;
  title: string;
  description: string;
  reasoning: string;
  priority: number;
  confidence_score: number;
  related_ideas: string[];
}

// ===========================================
// Daily Learning Job
// ===========================================

/**
 * Führt das tägliche Lernen durch
 * Sollte einmal täglich (z.B. um 23:00) ausgeführt werden
 */
export async function runDailyLearning(
  context: AIContext = 'personal',
  date: Date = new Date()
): Promise<DailyLearningResult> {
  const dateStr = date.toISOString().split('T')[0];

  logger.info('Starting daily learning', { context, date: dateStr });

  try {
    // 1. Hole alle Ideen des Tages
    const todaysIdeas = await getTodaysIdeas(context, date);

    // 2. Hole unverarbeitetes Feedback
    const unprocessedFeedback = await getUnprocessedFeedback(context);

    // 3. Analysiere Muster
    const patterns = await analyzePatterns(todaysIdeas, context);

    // 4. Aktualisiere Präferenzen basierend auf Feedback
    const preferenceUpdates = await processCorrections(unprocessedFeedback, context);

    // 5. Extrahiere neue Keywords
    const newKeywords = extractNewKeywords(todaysIdeas);

    // 6. Generiere tägliche Zusammenfassung
    const { summary, keyLearnings, suggestions } = await generateDailySummary(
      todaysIdeas,
      patterns,
      preferenceUpdates,
      context
    );

    // 7. Speichere Lern-Log
    await saveDailyLearningLog(
      context,
      dateStr,
      {
        ideas_analyzed: todaysIdeas.length,
        corrections_processed: unprocessedFeedback.length,
        new_patterns: patterns,
        updated_preferences: preferenceUpdates,
        new_keywords: newKeywords,
        daily_summary: summary,
        key_learnings: keyLearnings,
        suggestions_for_tomorrow: suggestions,
      }
    );

    // 8. Generiere AI-Vorschläge für morgen
    await generateSuggestionsForTomorrow(context, patterns, todaysIdeas);

    // 9. Generiere Automation-Vorschläge basierend auf Mustern
    let automationSuggestions: AutomationSuggestion[] = [];
    try {
      automationSuggestions = await generateAutomationSuggestions(context);
      logger.info('Automation suggestions generated', {
        context,
        count: automationSuggestions.length,
      });
    } catch (error) {
      logger.warn('Could not generate automation suggestions', { error });
    }

    logger.info('Daily learning completed', {
      context,
      date: dateStr,
      ideasAnalyzed: todaysIdeas.length,
      patternsFound: patterns.length,
      suggestionsGenerated: suggestions.length,
      automationSuggestions: automationSuggestions.length,
    });

    return {
      date: dateStr,
      ideas_analyzed: todaysIdeas.length,
      corrections_processed: unprocessedFeedback.length,
      new_patterns: patterns,
      updated_preferences: preferenceUpdates,
      new_keywords: newKeywords,
      daily_summary: summary,
      key_learnings: keyLearnings,
      suggestions_for_tomorrow: suggestions,
      automation_suggestions: automationSuggestions.length,
    };
  } catch (error) {
    logger.error('Daily learning failed', error instanceof Error ? error : undefined, { context, date: dateStr });
    throw error;
  }
}

/**
 * Holt alle Ideen des Tages
 */
async function getTodaysIdeas(
  context: AIContext,
  date: Date
): Promise<Array<{
  id: string;
  title: string;
  type: string;
  category: string;
  priority: string;
  summary: string;
  keywords: string[];
  created_at: string;
}>> {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  const result = await queryContext(
    context,
    `SELECT id, title, type, category, priority, summary, keywords, created_at
     FROM ideas
     WHERE created_at >= $1 AND created_at <= $2
     ORDER BY created_at ASC`,
    [startOfDay.toISOString(), endOfDay.toISOString()]
  );

  return result.rows.map((row) => ({
    ...row,
    keywords: Array.isArray(row.keywords) ? row.keywords : JSON.parse(row.keywords || '[]'),
  }));
}

/**
 * Holt unverarbeitetes Nutzer-Feedback
 */
async function getUnprocessedFeedback(context: AIContext): Promise<Array<{
  id: string;
  idea_id: string;
  response_type: string;
  original_response: unknown;
  correction: string;
  feedback_text: string;
}>> {
  try {
    const result = await queryContext(
      context,
      `SELECT id, idea_id, response_type, original_response, correction, feedback_text
       FROM ai_response_feedback
       WHERE context = $1 AND applied_to_learning = false
       ORDER BY created_at ASC`,
      [context]
    );
    return result.rows;
  } catch (error) {
    // Tabelle existiert möglicherweise noch nicht
    return [];
  }
}

/**
 * Analysiert Muster in den Tages-Ideen
 */
async function analyzePatterns(
  ideas: Array<{ type: string; category: string; priority: string; created_at: string }>,
  context: AIContext
): Promise<Pattern[]> {
  const patterns: Pattern[] = [];

  if (ideas.length < 2) {
    return patterns;
  }

  // 1. Zeit-Muster: Wann werden Ideen erfasst?
  const hourCounts: Record<number, number> = {};
  for (const idea of ideas) {
    const hour = new Date(idea.created_at).getHours();
    hourCounts[hour] = (hourCounts[hour] || 0) + 1;
  }

  const peakHour = Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0];
  if (peakHour && parseInt(peakHour[1].toString()) >= 2) {
    patterns.push({
      type: 'time',
      description: `Produktivste Stunde heute: ${peakHour[0]}:00 Uhr`,
      confidence: 0.7,
      data: { peak_hour: parseInt(peakHour[0]), count: peakHour[1] },
    });
  }

  // 2. Kategorie-Muster: Welche Kategorien dominieren?
  const categoryCounts: Record<string, number> = {};
  for (const idea of ideas) {
    categoryCounts[idea.category] = (categoryCounts[idea.category] || 0) + 1;
  }

  const dominantCategory = Object.entries(categoryCounts).sort((a, b) => b[1] - a[1])[0];
  if (dominantCategory && dominantCategory[1] >= ideas.length * 0.5) {
    patterns.push({
      type: 'category',
      description: `Heute lag der Fokus auf ${dominantCategory[0]} (${Math.round((dominantCategory[1] / ideas.length) * 100)}%)`,
      confidence: 0.8,
      data: { category: dominantCategory[0], percentage: dominantCategory[1] / ideas.length },
    });
  }

  // 3. Typ-Muster: Mehr Aufgaben oder Ideen?
  const typeCounts: Record<string, number> = {};
  for (const idea of ideas) {
    typeCounts[idea.type] = (typeCounts[idea.type] || 0) + 1;
  }

  const dominantType = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0];
  if (dominantType) {
    patterns.push({
      type: 'topic',
      description: `Heute hauptsächlich ${dominantType[0]}en erfasst`,
      confidence: 0.6,
      data: { type: dominantType[0], count: dominantType[1] },
    });
  }

  // 4. Prioritäts-Muster
  const highPriorityCount = ideas.filter((i) => i.priority === 'high').length;
  if (highPriorityCount >= ideas.length * 0.4) {
    patterns.push({
      type: 'workflow',
      description: 'Heute viele dringende Themen',
      confidence: 0.75,
      data: { high_priority_percentage: highPriorityCount / ideas.length },
    });
  }

  return patterns;
}

/**
 * Verarbeitet Nutzer-Korrekturen
 */
async function processCorrections(
  feedback: Array<{
    id: string;
    response_type: string;
    correction: string;
    feedback_text: string;
  }>,
  context: AIContext
): Promise<PreferenceUpdate[]> {
  const updates: PreferenceUpdate[] = [];

  for (const fb of feedback) {
    // Markiere als verarbeitet
    try {
      await queryContext(
        context,
        `UPDATE ai_response_feedback
         SET applied_to_learning = true
         WHERE id = $1`,
        [fb.id]
      );

      if (fb.correction) {
        updates.push({
          field: fb.response_type,
          old_value: null,
          new_value: fb.correction,
          reason: fb.feedback_text || 'Nutzer-Korrektur',
        });
      }
    } catch (error) {
      logger.warn('Could not process feedback', { feedbackId: fb.id });
    }
  }

  return updates;
}

/**
 * Extrahiert neue Keywords aus Ideen
 */
function extractNewKeywords(
  ideas: Array<{ keywords: string[] }>
): string[] {
  const allKeywords = ideas.flatMap((i) => i.keywords || []);
  const keywordCounts: Record<string, number> = {};

  for (const kw of allKeywords) {
    const normalized = kw.toLowerCase().trim();
    if (normalized.length > 2) {
      keywordCounts[normalized] = (keywordCounts[normalized] || 0) + 1;
    }
  }

  // Keywords die mindestens 2x vorkommen
  return Object.entries(keywordCounts)
    .filter(([, count]) => count >= 2)
    .map(([keyword]) => keyword);
}

/**
 * Generiert tägliche Zusammenfassung mit LLM
 */
async function generateDailySummary(
  ideas: Array<{ title: string; type: string; category: string; summary: string }>,
  patterns: Pattern[],
  updates: PreferenceUpdate[],
  context: AIContext
): Promise<{
  summary: string;
  keyLearnings: string[];
  suggestions: string[];
}> {
  if (ideas.length === 0) {
    return {
      summary: 'Heute wurden keine neuen Ideen erfasst.',
      keyLearnings: [],
      suggestions: ['Morgen wieder aktiv werden!'],
    };
  }

  try {
    const ideasSummary = ideas
      .map((i) => `- ${i.type}: ${i.title}`)
      .slice(0, 10)
      .join('\n');

    const patternsText = patterns.map((p) => p.description).join('\n');

    const prompt = `Du bist ein persönlicher Lern-Assistent. Erstelle eine tägliche Zusammenfassung.

Heute erfasste Gedanken (${ideas.length}):
${ideasSummary}

Erkannte Muster:
${patternsText || 'Keine besonderen Muster'}

Erstelle eine JSON-Antwort:
{
  "summary": "Eine kurze, ermutigende Zusammenfassung des Tages (2-3 Sätze)",
  "key_learnings": ["Was wurde heute gelernt?", "Welche Erkenntnisse gab es?"],
  "suggestions": ["Vorschlag für morgen", "Weiterer Vorschlag"]
}

Sei positiv, konkret und hilfreich. Schreibe auf Deutsch.`;

    const result = await queryOllamaJSON<{
      summary?: string;
      key_learnings?: string[];
      suggestions?: string[];
    }>(prompt);

    return {
      summary: result?.summary || 'Ein produktiver Tag!',
      keyLearnings: result?.key_learnings || [],
      suggestions: result?.suggestions || [],
    };
  } catch (error) {
    logger.warn('Summary generation failed');

    return {
      summary: `Heute wurden ${ideas.length} Gedanken erfasst.`,
      keyLearnings: patterns.map((p) => p.description),
      suggestions: ['Morgen an die offenen Aufgaben denken'],
    };
  }
}

/**
 * Speichert den täglichen Lern-Log
 */
async function saveDailyLearningLog(
  context: AIContext,
  date: string,
  data: {
    ideas_analyzed: number;
    corrections_processed: number;
    new_patterns: Pattern[];
    updated_preferences: PreferenceUpdate[];
    new_keywords: string[];
    daily_summary: string;
    key_learnings: string[];
    suggestions_for_tomorrow: string[];
  }
): Promise<void> {
  try {
    await queryContext(
      context,
      `INSERT INTO daily_learning_log
        (id, context, learning_date, ideas_analyzed, corrections_processed,
         new_patterns, updated_preferences, new_keywords, daily_summary,
         key_learnings, suggestions_for_tomorrow)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (context, learning_date)
       DO UPDATE SET
         ideas_analyzed = EXCLUDED.ideas_analyzed,
         corrections_processed = EXCLUDED.corrections_processed,
         new_patterns = EXCLUDED.new_patterns,
         updated_preferences = EXCLUDED.updated_preferences,
         new_keywords = EXCLUDED.new_keywords,
         daily_summary = EXCLUDED.daily_summary,
         key_learnings = EXCLUDED.key_learnings,
         suggestions_for_tomorrow = EXCLUDED.suggestions_for_tomorrow`,
      [
        uuidv4(),
        context,
        date,
        data.ideas_analyzed,
        data.corrections_processed,
        JSON.stringify(data.new_patterns),
        JSON.stringify(data.updated_preferences),
        data.new_keywords,
        data.daily_summary,
        data.key_learnings,
        data.suggestions_for_tomorrow,
      ]
    );
  } catch (error) {
    logger.warn('Could not save daily learning log');
  }
}

/**
 * Generiert AI-Vorschläge für morgen
 */
async function generateSuggestionsForTomorrow(
  context: AIContext,
  patterns: Pattern[],
  todaysIdeas: Array<{ id: string; type: string; title: string; priority: string }>
): Promise<void> {
  const suggestions: AISuggestion[] = [];

  // 1. Offene Aufgaben mit hoher Priorität
  const highPriorityTasks = todaysIdeas.filter(
    (i) => i.type === 'task' && i.priority === 'high'
  );

  if (highPriorityTasks.length > 0) {
    suggestions.push({
      id: uuidv4(),
      suggestion_type: 'action_reminder',
      title: 'Offene dringende Aufgaben',
      description: `${highPriorityTasks.length} wichtige Aufgaben von heute warten noch.`,
      reasoning: 'Hohe Priorität sollte nicht aufgeschoben werden.',
      priority: 8,
      confidence_score: 0.9,
      related_ideas: highPriorityTasks.map((t) => t.id),
    });
  }

  // 2. Basierend auf Mustern
  for (const pattern of patterns) {
    if (pattern.type === 'category' && pattern.confidence > 0.7) {
      suggestions.push({
        id: uuidv4(),
        suggestion_type: 'pattern_insight',
        title: `Fokus auf ${(pattern.data as { category: string }).category}`,
        description: pattern.description,
        reasoning: 'Erkanntes Arbeitsmuster',
        priority: 5,
        confidence_score: pattern.confidence,
        related_ideas: [],
      });
    }
  }

  // 3. Speichere Vorschläge
  for (const suggestion of suggestions) {
    try {
      await queryContext(
        context,
        `INSERT INTO ai_suggestions
          (id, context, suggestion_type, title, description, reasoning,
           priority, confidence_score, related_ideas, show_after)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          suggestion.id,
          context,
          suggestion.suggestion_type,
          suggestion.title,
          suggestion.description,
          suggestion.reasoning,
          suggestion.priority,
          suggestion.confidence_score,
          suggestion.related_ideas,
          new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(), // Morgen früh
        ]
      );
    } catch (error) {
      // Tabelle existiert möglicherweise noch nicht
    }
  }
}

// ===========================================
// Public API
// ===========================================

/**
 * Holt die letzten Tages-Zusammenfassungen
 */
export async function getDailyLearningHistory(
  context: AIContext = 'personal',
  limit: number = 7
): Promise<DailyLearningResult[]> {
  try {
    const result = await queryContext(
      context,
      `SELECT * FROM daily_learning_log
       WHERE context = $1
       ORDER BY learning_date DESC
       LIMIT $2`,
      [context, limit]
    );

    return result.rows.map((row) => ({
      date: row.learning_date,
      ideas_analyzed: row.ideas_analyzed,
      corrections_processed: row.corrections_processed,
      new_patterns: row.new_patterns || [],
      updated_preferences: row.updated_preferences || [],
      new_keywords: row.new_keywords || [],
      daily_summary: row.daily_summary,
      key_learnings: row.key_learnings || [],
      suggestions_for_tomorrow: row.suggestions_for_tomorrow || [],
      automation_suggestions: row.automation_suggestions || 0,
    }));
  } catch (error) {
    return [];
  }
}

/**
 * Holt aktive AI-Vorschläge
 */
export async function getActiveSuggestions(
  context: AIContext = 'personal',
  limit: number = 5
): Promise<AISuggestion[]> {
  try {
    const result = await queryContext(
      context,
      `SELECT * FROM ai_suggestions
       WHERE context = $1
         AND status = 'pending'
         AND show_after <= NOW()
         AND (expires_at IS NULL OR expires_at > NOW())
       ORDER BY priority DESC, created_at DESC
       LIMIT $2`,
      [context, limit]
    );

    return result.rows;
  } catch (error) {
    return [];
  }
}

/**
 * Reagiert auf einen Vorschlag
 */
export async function respondToSuggestion(
  suggestionId: string,
  response: 'accepted' | 'dismissed',
  feedback: string | null,
  context: AIContext = 'personal'
): Promise<void> {
  await queryContext(
    context,
    `UPDATE ai_suggestions
     SET status = $1, user_response = $1, user_feedback = $2,
         shown_at = COALESCE(shown_at, NOW()), responded_at = NOW()
     WHERE id = $3 AND context = $4`,
    [response, feedback, suggestionId, context]
  );
}

/**
 * Erstellt einen manuellen Vorschlag
 */
export async function createManualSuggestion(
  context: AIContext,
  type: string,
  title: string,
  description: string,
  relatedIdeas: string[] = []
): Promise<string> {
  const id = uuidv4();

  await queryContext(
    context,
    `INSERT INTO ai_suggestions
      (id, context, suggestion_type, title, description, priority, confidence_score, related_ideas)
     VALUES ($1, $2, $3, $4, $5, 7, 1.0, $6)`,
    [id, context, type, title, description, relatedIdeas]
  );

  return id;
}

/**
 * Holt die täglichen Lern-Logs (Alias für getDailyLearningHistory für Konsistenz)
 */
export async function getDailyLearningLogs(
  context: AIContext = 'personal',
  limit: number = 7
): Promise<Array<{
  id: string;
  learning_date: string;
  ideas_analyzed: number;
  patterns_found: number;
  suggestions_generated: number;
  status: string;
}>> {
  try {
    const result = await queryContext(
      context,
      `SELECT
         id,
         learning_date,
         ideas_analyzed,
         COALESCE(jsonb_array_length(new_patterns::jsonb), 0) as patterns_found,
         COALESCE(array_length(suggestions_for_tomorrow, 1), 0) as suggestions_generated,
         CASE
           WHEN ideas_analyzed > 0 THEN 'completed'
           ELSE 'no_data'
         END as status
       FROM daily_learning_log
       WHERE context = $1
       ORDER BY learning_date DESC
       LIMIT $2`,
      [context, limit]
    );

    return result.rows;
  } catch (error) {
    logger.warn('Could not get daily learning logs');
    return [];
  }
}

/**
 * Holt Statistiken für AI-Vorschläge
 */
export async function getSuggestionStats(
  context: AIContext = 'personal'
): Promise<{
  total_suggestions: number;
  pending_count: number;
  accepted_count: number;
  dismissed_count: number;
  acceptance_rate: number;
  avg_priority: number;
}> {
  try {
    const result = await queryContext(
      context,
      `SELECT
         COUNT(*) as total,
         COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
         COUNT(CASE WHEN status = 'accepted' THEN 1 END) as accepted,
         COUNT(CASE WHEN status = 'dismissed' THEN 1 END) as dismissed,
         AVG(priority) as avg_priority
       FROM ai_suggestions
       WHERE context = $1`,
      [context]
    );

    const row = result.rows[0];
    const total = parseInt(row.total) || 0;
    const accepted = parseInt(row.accepted) || 0;
    const dismissed = parseInt(row.dismissed) || 0;

    return {
      total_suggestions: total,
      pending_count: parseInt(row.pending) || 0,
      accepted_count: accepted,
      dismissed_count: dismissed,
      acceptance_rate: (accepted + dismissed) > 0
        ? accepted / (accepted + dismissed)
        : 0,
      avg_priority: parseFloat(row.avg_priority) || 5,
    };
  } catch (error) {
    logger.warn('Could not get suggestion stats');
    return {
      total_suggestions: 0,
      pending_count: 0,
      accepted_count: 0,
      dismissed_count: 0,
      acceptance_rate: 0,
      avg_priority: 5,
    };
  }
}
