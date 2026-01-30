/**
 * Proactive Intelligence Service
 *
 * Erkennt automatisch Recherche-Bedarf in Aufgaben und bereitet
 * proaktiv Informationen vor, bevor der Nutzer danach fragt.
 *
 * Features:
 * - Erkennung von Recherche-Aufgaben ("muss ich noch recherchieren")
 * - Automatische Web-Recherche im Hintergrund
 * - Teaser-Generierung für schnellen Überblick
 * - Integration mit Domain-Focus für kontextbezogene Recherche
 */

import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import { queryContext, AIContext } from '../utils/database-context';
import { queryOllamaJSON, generateEmbedding } from '../utils/ollama';
import { logger } from '../utils/logger';

// ===========================================
// Types
// ===========================================

interface ResearchPattern {
  id: string;
  pattern_name: string;
  pattern_type: 'keyword' | 'phrase' | 'intent' | 'domain';
  trigger_keywords: string[];
  trigger_phrases: string[];
  exclude_keywords: string[];
  search_sources: string[];
  search_depth: 'quick' | 'standard' | 'deep';
  max_results: number;
}

interface ProactiveResearch {
  id: string;
  trigger_idea_id: string | null;
  trigger_type: 'task_research' | 'question' | 'topic_interest' | 'scheduled' | 'manual';
  trigger_text: string;
  research_query: string;
  research_results: ResearchResult[];
  summary: string | null;
  key_insights: string[];
  teaser_title: string | null;
  teaser_text: string | null;
  status: 'pending' | 'researching' | 'completed' | 'failed' | 'viewed' | 'dismissed';
  confidence_score: number;
}

interface ResearchResult {
  source: string;
  title: string;
  url?: string;
  snippet: string;
  relevance_score: number;
  fetched_at: string;
}

interface DetectedResearchNeed {
  detected: boolean;
  confidence: number;
  research_topic: string;
  research_query: string;
  matched_pattern?: string;
  search_sources: string[];
}

// ===========================================
// Research Detection
// ===========================================

/**
 * Analysiert einen Text auf Recherche-Bedarf
 */
export async function detectResearchNeed(
  text: string,
  ideaType: string,
  context: AIContext = 'personal'
): Promise<DetectedResearchNeed> {
  // 1. Lade aktive Patterns
  const patterns = await getActivePatterns(context);

  // 2. Prüfe Pattern-Matches
  const patternMatch = matchPatterns(text, patterns);

  if (patternMatch.matched) {
    return {
      detected: true,
      confidence: patternMatch.confidence,
      research_topic: patternMatch.topic,
      research_query: patternMatch.query,
      matched_pattern: patternMatch.pattern_name,
      search_sources: patternMatch.sources,
    };
  }

  // 3. Fallback: LLM-basierte Erkennung für komplexere Fälle
  if (ideaType === 'task' || ideaType === 'question') {
    const llmDetection = await detectWithLLM(text, context);
    if (llmDetection.detected) {
      return llmDetection;
    }
  }

  return {
    detected: false,
    confidence: 0,
    research_topic: '',
    research_query: '',
    search_sources: [],
  };
}

/**
 * Lädt aktive Recherche-Patterns
 */
async function getActivePatterns(context: AIContext): Promise<ResearchPattern[]> {
  try {
    const result = await queryContext(
      context,
      `SELECT * FROM research_patterns WHERE context = $1 AND is_active = true`,
      [context]
    );
    return result.rows;
  } catch (error) {
    logger.warn('Could not load research patterns, using defaults', { error });
    return getDefaultPatterns();
  }
}

/**
 * Fallback-Patterns wenn DB nicht verfügbar
 */
function getDefaultPatterns(): ResearchPattern[] {
  return [
    {
      id: 'default-research',
      pattern_name: 'Recherche-Aufgabe',
      pattern_type: 'phrase',
      trigger_keywords: ['recherchieren', 'recherche', 'herausfinden', 'untersuchen'],
      trigger_phrases: ['muss ich recherchieren', 'noch recherchieren', 'will recherchieren'],
      exclude_keywords: ['habe recherchiert', 'recherche abgeschlossen'],
      search_sources: ['web'],
      search_depth: 'standard',
      max_results: 5,
    },
    {
      id: 'default-question',
      pattern_name: 'Technische Frage',
      pattern_type: 'keyword',
      trigger_keywords: ['wie funktioniert', 'was ist', 'unterschied zwischen'],
      trigger_phrases: [],
      exclude_keywords: [],
      search_sources: ['web'],
      search_depth: 'quick',
      max_results: 3,
    },
  ];
}

/**
 * Pattern-Matching auf Text
 */
function matchPatterns(
  text: string,
  patterns: ResearchPattern[]
): {
  matched: boolean;
  confidence: number;
  topic: string;
  query: string;
  pattern_name: string;
  sources: string[];
} {
  const lowerText = text.toLowerCase();

  for (const pattern of patterns) {
    // Prüfe Ausschluss-Keywords
    const hasExclude = pattern.exclude_keywords.some((kw) =>
      lowerText.includes(kw.toLowerCase())
    );
    if (hasExclude) {continue;}

    // Prüfe Phrase-Matches (höhere Priorität)
    for (const phrase of pattern.trigger_phrases) {
      if (lowerText.includes(phrase.toLowerCase())) {
        const topic = extractTopicFromText(text, phrase);
        return {
          matched: true,
          confidence: 0.9,
          topic,
          query: generateSearchQuery(topic, pattern),
          pattern_name: pattern.pattern_name,
          sources: pattern.search_sources,
        };
      }
    }

    // Prüfe Keyword-Matches
    const keywordMatches = pattern.trigger_keywords.filter((kw) =>
      lowerText.includes(kw.toLowerCase())
    );

    if (keywordMatches.length >= 1) {
      const topic = extractTopicFromText(text, keywordMatches[0]);
      return {
        matched: true,
        confidence: 0.6 + keywordMatches.length * 0.1,
        topic,
        query: generateSearchQuery(topic, pattern),
        pattern_name: pattern.pattern_name,
        sources: pattern.search_sources,
      };
    }
  }

  return {
    matched: false,
    confidence: 0,
    topic: '',
    query: '',
    pattern_name: '',
    sources: [],
  };
}

/**
 * Extrahiert das Thema aus dem Text basierend auf dem Trigger
 */
function extractTopicFromText(text: string, trigger: string): string {
  const lowerText = text.toLowerCase();
  const triggerIndex = lowerText.indexOf(trigger.toLowerCase());

  if (triggerIndex === -1) {return text.substring(0, 100);}

  // Versuche den Kontext nach dem Trigger zu extrahieren
  const afterTrigger = text.substring(triggerIndex + trigger.length).trim();

  // Nimm bis zum nächsten Satzende oder max 150 Zeichen
  const endMatch = afterTrigger.match(/[.!?]/);
  const endIndex = endMatch ? endMatch.index! : Math.min(150, afterTrigger.length);

  let topic = afterTrigger.substring(0, endIndex).trim();

  // Entferne führende Füllwörter
  topic = topic.replace(/^(noch|mal|zu|über|bzgl|bezüglich|zum thema)\s+/i, '');

  return topic || text.substring(0, 100);
}

/**
 * Generiert eine optimierte Suchanfrage
 */
function generateSearchQuery(topic: string, pattern: ResearchPattern): string {
  let query = topic;

  // Füge domänenspezifische Keywords hinzu
  if (pattern.pattern_type === 'domain') {
    const domainKeyword = pattern.trigger_keywords[0];
    if (!query.toLowerCase().includes(domainKeyword.toLowerCase())) {
      query = `${domainKeyword} ${query}`;
    }
  }

  // Beschränke Länge
  if (query.length > 100) {
    query = query.substring(0, 100);
  }

  return query;
}

/**
 * LLM-basierte Erkennung für komplexere Fälle
 */
async function detectWithLLM(
  text: string,
  context: AIContext
): Promise<DetectedResearchNeed> {
  try {
    const prompt = `Analysiere diesen Text und erkenne, ob eine Recherche-Aufgabe enthalten ist.

Text: "${text}"

Antworte im JSON-Format:
{
  "needs_research": boolean,
  "confidence": number (0-1),
  "research_topic": "Das Thema das recherchiert werden soll",
  "search_query": "Optimierte Suchanfrage für die Recherche"
}

Beispiele für Recherche-Aufgaben:
- "Ich muss noch herausfinden, wie SAP-Schnittstellen funktionieren"
- "Prüfen, welche API-Optionen es gibt"
- "Recherchieren: beste Vorgehensweise für Datenmigration"

Wenn keine Recherche nötig ist, setze needs_research auf false.`;

    const result = await queryOllamaJSON<{
      needs_research?: boolean;
      confidence?: number;
      research_topic?: string;
      search_query?: string;
    }>(prompt);

    if (result?.needs_research) {
      return {
        detected: true,
        confidence: result.confidence || 0.7,
        research_topic: result.research_topic || '',
        research_query: result.search_query || result.research_topic || '',
        search_sources: ['web'],
      };
    }
  } catch (error) {
    logger.debug('LLM research detection failed');
  }

  return {
    detected: false,
    confidence: 0,
    research_topic: '',
    research_query: '',
    search_sources: [],
  };
}

// ===========================================
// Research Execution
// ===========================================

/**
 * Führt eine proaktive Recherche durch und speichert das Ergebnis
 */
export async function executeProactiveResearch(
  ideaId: string | null,
  triggerText: string,
  researchQuery: string,
  sources: string[],
  context: AIContext = 'personal'
): Promise<ProactiveResearch | null> {
  const researchId = uuidv4();

  try {
    // 1. Erstelle Recherche-Eintrag
    await queryContext(
      context,
      `INSERT INTO proactive_research
        (id, context, trigger_idea_id, trigger_type, trigger_text, research_query, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'researching')`,
      [researchId, context, ideaId, 'task_research', triggerText, researchQuery]
    );

    // 2. Führe Recherche durch
    const results = await performWebSearch(researchQuery, sources);

    // 3. Generiere Zusammenfassung und Teaser
    const { summary, keyInsights, teaserTitle, teaserText } = await generateResearchSummary(
      researchQuery,
      results,
      context
    );

    // 4. Berechne Konfidenz
    const confidenceScore = calculateConfidence(results, summary);

    // 5. Update Recherche-Eintrag
    await queryContext(
      context,
      `UPDATE proactive_research SET
        research_results = $1,
        summary = $2,
        key_insights = $3,
        teaser_title = $4,
        teaser_text = $5,
        confidence_score = $6,
        status = 'completed',
        completed_at = NOW()
       WHERE id = $7`,
      [
        JSON.stringify(results),
        summary,
        keyInsights,
        teaserTitle,
        teaserText,
        confidenceScore,
        researchId,
      ]
    );

    // 6. Update Pattern-Statistik
    await updatePatternStats(researchQuery, context);

    logger.info('Proactive research completed', {
      researchId,
      query: researchQuery,
      resultsCount: results.length,
      confidence: confidenceScore,
    });

    return {
      id: researchId,
      trigger_idea_id: ideaId,
      trigger_type: 'task_research',
      trigger_text: triggerText,
      research_query: researchQuery,
      research_results: results,
      summary,
      key_insights: keyInsights,
      teaser_title: teaserTitle,
      teaser_text: teaserText,
      status: 'completed',
      confidence_score: confidenceScore,
    };
  } catch (error) {
    logger.error('Proactive research failed', error instanceof Error ? error : undefined, { researchId });

    // Markiere als fehlgeschlagen
    try {
      await queryContext(
        context,
        `UPDATE proactive_research SET status = 'failed' WHERE id = $1`,
        [researchId]
      );
    } catch (updateError) {
      // Ignore update error
    }

    return null;
  }
}

/**
 * Web-Recherche durchführen
 */
async function performWebSearch(
  query: string,
  sources: string[]
): Promise<ResearchResult[]> {
  const results: ResearchResult[] = [];

  // Nutze DuckDuckGo Instant Answers API (kostenlos, kein API Key nötig)
  if (sources.includes('web')) {
    try {
      const ddgResults = await searchDuckDuckGo(query);
      results.push(...ddgResults);
    } catch (error) {
      logger.warn('DuckDuckGo search failed', { error });
    }
  }

  // SAP API Integration (optional enterprise feature)
  // Requires: SAP_API_KEY environment variable
  // Endpoint: SAP API Business Hub (https://api.sap.com)
  if (sources.includes('sap')) {
    if (process.env.SAP_API_KEY) {
      // SAP API Hub search implementation would go here
      logger.debug('SAP API integration available but not yet implemented');
    } else {
      logger.debug('SAP search skipped - no API key configured');
    }
  }

  return results;
}

/**
 * DuckDuckGo Instant Answers API
 */
async function searchDuckDuckGo(query: string): Promise<ResearchResult[]> {
  try {
    const response = await axios.get('https://api.duckduckgo.com/', {
      params: {
        q: query,
        format: 'json',
        no_html: 1,
        skip_disambig: 1,
      },
      timeout: 10000,
    });

    const data = response.data;
    const results: ResearchResult[] = [];

    // Abstract (Hauptergebnis)
    if (data.Abstract) {
      results.push({
        source: 'DuckDuckGo',
        title: data.Heading || query,
        url: data.AbstractURL,
        snippet: data.Abstract,
        relevance_score: 1.0,
        fetched_at: new Date().toISOString(),
      });
    }

    // Related Topics
    if (data.RelatedTopics && Array.isArray(data.RelatedTopics)) {
      for (const topic of data.RelatedTopics.slice(0, 5)) {
        if (topic.Text) {
          results.push({
            source: 'DuckDuckGo',
            title: topic.Text.split(' - ')[0] || topic.Text.substring(0, 50),
            url: topic.FirstURL,
            snippet: topic.Text,
            relevance_score: 0.7,
            fetched_at: new Date().toISOString(),
          });
        }
      }
    }

    return results;
  } catch (error) {
    logger.warn('DuckDuckGo API error', { error });
    return [];
  }
}

/**
 * Generiert Zusammenfassung und Teaser
 */
async function generateResearchSummary(
  query: string,
  results: ResearchResult[],
  context: AIContext
): Promise<{
  summary: string;
  keyInsights: string[];
  teaserTitle: string;
  teaserText: string;
}> {
  if (results.length === 0) {
    return {
      summary: 'Keine relevanten Ergebnisse gefunden.',
      keyInsights: [],
      teaserTitle: `Recherche: ${query}`,
      teaserText: 'Leider wurden keine passenden Informationen gefunden.',
    };
  }

  try {
    const resultsText = results
      .map((r, i) => `[${i + 1}] ${r.title}: ${r.snippet}`)
      .join('\n\n');

    const prompt = `Du bist ein hilfreicher Recherche-Assistent. Fasse die folgenden Suchergebnisse zusammen.

Suchanfrage: "${query}"

Ergebnisse:
${resultsText}

Erstelle eine JSON-Antwort mit:
{
  "summary": "Eine prägnante Zusammenfassung der wichtigsten Informationen (2-3 Sätze)",
  "key_insights": ["Erkenntnis 1", "Erkenntnis 2", "Erkenntnis 3"],
  "teaser_title": "Kurzer, ansprechender Titel für den Teaser",
  "teaser_text": "Ein kurzer Teaser-Text (max 100 Zeichen) der neugierig macht"
}

Schreibe auf Deutsch und sei konkret und hilfreich.`;

    const result = await queryOllamaJSON<{
      summary?: string;
      key_insights?: string[];
      teaser_title?: string;
      teaser_text?: string;
    }>(prompt);

    return {
      summary: result?.summary || 'Zusammenfassung konnte nicht erstellt werden.',
      keyInsights: result?.key_insights || [],
      teaserTitle: result?.teaser_title || `Recherche: ${query}`,
      teaserText: result?.teaser_text || results[0]?.snippet?.substring(0, 100) || '',
    };
  } catch (error) {
    logger.warn('Summary generation failed');

    // Fallback: Erste Ergebnisse verwenden
    return {
      summary: results[0]?.snippet || 'Keine Zusammenfassung verfügbar.',
      keyInsights: results.slice(0, 3).map((r) => r.title),
      teaserTitle: `Recherche: ${query}`,
      teaserText: results[0]?.snippet?.substring(0, 100) || '',
    };
  }
}

/**
 * Berechnet Konfidenz-Score
 */
function calculateConfidence(results: ResearchResult[], summary: string): number {
  let confidence = 0.3; // Basis

  // Mehr Ergebnisse = höhere Konfidenz
  confidence += Math.min(results.length * 0.1, 0.3);

  // Längere Zusammenfassung = wahrscheinlich bessere Infos
  if (summary && summary.length > 100) {confidence += 0.1;}
  if (summary && summary.length > 200) {confidence += 0.1;}

  // Hohe Relevanz-Scores
  const avgRelevance =
    results.reduce((sum, r) => sum + r.relevance_score, 0) / Math.max(results.length, 1);
  confidence += avgRelevance * 0.2;

  return Math.min(confidence, 1.0);
}

/**
 * Update Pattern-Statistiken
 */
async function updatePatternStats(query: string, context: AIContext): Promise<void> {
  try {
    await queryContext(
      context,
      `UPDATE research_patterns
       SET trigger_count = trigger_count + 1, last_triggered_at = NOW()
       WHERE context = $1 AND is_active = true
       AND EXISTS (
         SELECT 1 FROM unnest(trigger_keywords) kw WHERE $2 ILIKE '%' || kw || '%'
       )`,
      [context, query]
    );
  } catch (error) {
    // Nicht kritisch
  }
}

// ===========================================
// Public API
// ===========================================

/**
 * Verarbeitet eine neue Idee und triggert ggf. proaktive Recherche
 */
export async function processIdeaForResearch(
  ideaId: string,
  text: string,
  ideaType: string,
  context: AIContext = 'personal'
): Promise<ProactiveResearch | null> {
  // 1. Prüfe auf Recherche-Bedarf
  const researchNeed = await detectResearchNeed(text, ideaType, context);

  if (!researchNeed.detected || researchNeed.confidence < 0.5) {
    return null;
  }

  logger.info('Research need detected', {
    ideaId,
    topic: researchNeed.research_topic,
    confidence: researchNeed.confidence,
    pattern: researchNeed.matched_pattern,
  });

  // 2. Führe Recherche im Hintergrund durch
  // (Hier könnte man auch einen Job-Queue nutzen)
  const research = await executeProactiveResearch(
    ideaId,
    text,
    researchNeed.research_query,
    researchNeed.search_sources,
    context
  );

  return research;
}

/**
 * Holt offene Recherchen für einen Nutzer
 */
export async function getPendingResearch(
  context: AIContext = 'personal',
  limit: number = 10
): Promise<ProactiveResearch[]> {
  try {
    const result = await queryContext(
      context,
      `SELECT * FROM proactive_research
       WHERE context = $1 AND status = 'completed'
       ORDER BY created_at DESC
       LIMIT $2`,
      [context, limit]
    );

    return result.rows.map((row) => ({
      ...row,
      research_results:
        typeof row.research_results === 'string'
          ? JSON.parse(row.research_results)
          : row.research_results,
    }));
  } catch (error) {
    logger.error('Failed to get pending research', error instanceof Error ? error : undefined);
    return [];
  }
}

/**
 * Markiert eine Recherche als angesehen
 */
export async function markResearchViewed(
  researchId: string,
  context: AIContext = 'personal'
): Promise<boolean> {
  try {
    const result = await queryContext(
      context,
      `UPDATE proactive_research
       SET status = 'viewed', viewed_at = NOW()
       WHERE id = $1 AND context = $2`,
      [researchId, context]
    );

    return (result.rowCount ?? 0) > 0;
  } catch (error) {
    logger.error('Failed to mark research as viewed', error instanceof Error ? error : undefined, { researchId });
    return false;
  }
}

/**
 * Feedback für eine Recherche
 */
export async function rateResearch(
  researchId: string,
  rating: number,
  wasHelpful: boolean,
  context: AIContext = 'personal'
): Promise<void> {
  await queryContext(
    context,
    `UPDATE proactive_research
     SET user_rating = $1, was_helpful = $2
     WHERE id = $3 AND context = $4`,
    [rating, wasHelpful, researchId, context]
  );
}

/**
 * Holt eine spezifische Recherche anhand der ID
 */
export async function getResearchById(
  researchId: string,
  context: AIContext = 'personal'
): Promise<ProactiveResearch | null> {
  try {
    const result = await queryContext(
      context,
      `SELECT * FROM proactive_research
       WHERE id = $1 AND context = $2`,
      [researchId, context]
    );

    if (result.rows.length === 0) {return null;}

    const row = result.rows[0];
    return {
      ...row,
      research_results:
        typeof row.research_results === 'string'
          ? JSON.parse(row.research_results)
          : row.research_results || [],
      key_insights: row.key_insights || [],
    };
  } catch (error) {
    logger.error('Failed to get research by ID', error instanceof Error ? error : undefined, { researchId });
    return null;
  }
}

/**
 * Markiert eine Recherche als abgelehnt
 */
export async function dismissResearch(
  researchId: string,
  context: AIContext = 'personal'
): Promise<boolean> {
  try {
    const result = await queryContext(
      context,
      `UPDATE proactive_research
       SET status = 'dismissed', dismissed_at = NOW()
       WHERE id = $1 AND context = $2`,
      [researchId, context]
    );

    return (result.rowCount ?? 0) > 0;
  } catch (error) {
    logger.error('Failed to dismiss research', error instanceof Error ? error : undefined, { researchId });
    return false;
  }
}

/**
 * Triggert eine manuelle Recherche
 */
export async function triggerManualResearch(
  query: string,
  sources: string[] = ['web'],
  context: AIContext = 'personal'
): Promise<ProactiveResearch | null> {
  return executeProactiveResearch(
    null,
    query,
    query,
    sources,
    context
  );
}
