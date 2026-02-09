/**
 * Learning Engine Service
 *
 * Learns from user's thoughts and behavior to improve:
 * - Automatic categorization
 * - Priority suggestions
 * - Type detection
 * - Personalized clustering in incubator
 *
 * WICHTIG: Lernt mit JEDER Handlung, nicht nur täglich!
 */

import { pool, PoolClient } from '../utils/database';
import { generateEmbedding } from '../utils/ollama';
import { formatForPgVector } from '../utils/embedding';
import { logger } from '../utils/logger';
import { parseJsonbWithDefault } from '../types';

// Type definitions for profile data
interface PriorityKeywords {
  high: string[];
  medium: string[];
  low: string[];
  [key: string]: string[];
}

interface ThinkingPatterns {
  action_oriented: number;
  question_frequency: number;
  abstract_vs_concrete: number;
  topic_chains: string[][];
  morning_categories: string[];
  evening_categories: string[];
  [key: string]: unknown;
}

interface LanguageStyle {
  avg_thought_length: number;
  preferred_language: string;
  uses_technical_terms: boolean;
  vocabulary_complexity: number;
  common_phrases: string[];
  [key: string]: unknown;
}

// Interface for idea data from database queries
interface IdeaData {
  type: string;
  category: string;
  priority: string;
  keywords: unknown;
  summary?: string;
  raw_transcript?: string;
  created_at: string | Date;
}

// Ollama URL - no default to prevent silent failures in production
// When not configured, embedding-based features will be disabled
const OLLAMA_URL = process.env.OLLAMA_URL;

/**
 * Check if Ollama is configured and available
 */
function isOllamaConfigured(): boolean {
  if (!OLLAMA_URL) {
    return false;
  }
  // Don't allow localhost in production
  if (process.env.NODE_ENV === 'production' && OLLAMA_URL.includes('localhost')) {
    logger.warn('OLLAMA_URL contains localhost in production - this will likely fail');
    return false;
  }
  return true;
}

// Learning thresholds - NIEDRIG gesetzt für schnelles Lernen
const CONFIG = {
  // Ab wie vielen Samples fangen wir an vorzuschlagen
  MIN_SAMPLES_FOR_SUGGESTIONS: 3,
  // Ab welcher Confidence überschreiben wir LLM-Vorschläge
  CONFIDENCE_FOR_OVERRIDE: 0.5,
  // Phrase-Mindesthäufigkeit für Insights
  PHRASE_MIN_FREQUENCY: 2,
  // Gewichtung für Similarity-basierte Vorschläge
  SIMILARITY_WEIGHT: 0.6,
  // Gewichtung für Präferenz-basierte Vorschläge
  PREFERENCE_WEIGHT: 0.3,
  // Gewichtung für Keyword-basierte Vorschläge
  KEYWORD_WEIGHT: 0.1,
};

export interface LearningInsight {
  type: 'category' | 'priority' | 'type' | 'topic' | 'pattern';
  confidence: number;
  suggestion: string;
  reason: string;
}

export interface PersonalizedSuggestion {
  suggested_type: string;
  suggested_category: string;
  suggested_priority: string;
  suggested_context?: string;
  confidence: number;
  reasoning: string;
}

/**
 * Analyze text and suggest categorization based on learned patterns
 * Funktioniert auch mit wenigen Samples!
 */
export async function suggestFromLearning(
  text: string,
  userId: string = 'default'
): Promise<PersonalizedSuggestion | null> {
  const client = await pool.connect();

  try {
    // Zähle vorhandene Ideen (excluding archived)
    const countResult = await client.query('SELECT COUNT(*) as count FROM ideas WHERE is_archived = false');
    const ideaCount = parseInt(countResult.rows[0].count);

    // Schon ab 3 Ideen anfangen zu lernen
    if (ideaCount < CONFIG.MIN_SAMPLES_FOR_SUGGESTIONS) {
      logger.debug('Learning: Not enough ideas for suggestions', { ideaCount, minRequired: CONFIG.MIN_SAMPLES_FOR_SUGGESTIONS });
      return null;
    }

    // Get user's learning profile
    const profileResult = await client.query(
      `SELECT thinking_patterns, language_style, topic_interests,
              preferred_categories, preferred_types, priority_keywords
       FROM user_profile WHERE id = $1`,
      [userId]
    );

    // Erstelle Profil falls nicht vorhanden
    if (profileResult.rows.length === 0) {
      await client.query(
        `INSERT INTO user_profile (id) VALUES ($1) ON CONFLICT (id) DO NOTHING`,
        [userId]
      );
    }

    const profile = profileResult.rows[0] || {};

    // Generate embedding for input text (only if Ollama is configured)
    let inputEmbedding: number[] = [];
    if (isOllamaConfigured()) {
      try {
        inputEmbedding = await generateEmbedding(text);
      } catch {
        logger.debug('Learning: Embedding generation failed, using keyword-only mode');
      }
    }

    // Initialize counters
    const typeCounts: Record<string, number> = {};
    const categoryCounts: Record<string, number> = {};
    const priorityCounts: Record<string, number> = {};
    const contextCounts: Record<string, number> = {};

    // 1. SIMILARITY-BASED: Finde ähnliche vergangene Ideen
    if (inputEmbedding.length > 0) {
      const similarIdeas = await client.query(
        `SELECT type, category, priority, keywords, context,
                1 - (embedding <=> $1::vector) as similarity
         FROM ideas
         WHERE embedding IS NOT NULL
         ORDER BY embedding <=> $1::vector
         LIMIT 5`,
        [formatForPgVector(inputEmbedding)]
      );

      for (const idea of similarIdeas.rows) {
        const weight = (idea.similarity || 0) * CONFIG.SIMILARITY_WEIGHT;
        if (weight > 0.1) { // Nur wenn Ähnlichkeit > 10%
          typeCounts[idea.type] = (typeCounts[idea.type] || 0) + weight;
          categoryCounts[idea.category] = (categoryCounts[idea.category] || 0) + weight;
          priorityCounts[idea.priority] = (priorityCounts[idea.priority] || 0) + weight;
          if (idea.context) {
            contextCounts[idea.context] = (contextCounts[idea.context] || 0) + weight;
          }
        }
      }
    }

    // 2. PREFERENCE-BASED: Wende gelernte Präferenzen an
    const preferredCategories = parseJsonbWithDefault<Record<string, number>>(profile.preferred_categories, {});
    const preferredTypes = parseJsonbWithDefault<Record<string, number>>(profile.preferred_types, {});

    // Normalisiere Präferenzen (relative Gewichtung)
    const totalCatPrefs = Object.values(preferredCategories).reduce((a, b) => a + b, 0) || 1;
    const totalTypePrefs = Object.values(preferredTypes).reduce((a, b) => a + b, 0) || 1;

    for (const [cat, count] of Object.entries(preferredCategories)) {
      const normalizedWeight = (count / totalCatPrefs) * CONFIG.PREFERENCE_WEIGHT;
      categoryCounts[cat] = (categoryCounts[cat] || 0) + normalizedWeight;
    }
    for (const [type, count] of Object.entries(preferredTypes)) {
      const normalizedWeight = (count / totalTypePrefs) * CONFIG.PREFERENCE_WEIGHT;
      typeCounts[type] = (typeCounts[type] || 0) + normalizedWeight;
    }

    // 3. KEYWORD-BASED: Prüfe Priority-Keywords
    const priorityKeywords = parseJsonbWithDefault<PriorityKeywords>(profile.priority_keywords, { high: [], medium: [], low: [] });
    const textLower = text.toLowerCase();

    // High-Priority Keywords
    for (const keyword of (priorityKeywords.high || [])) {
      if (textLower.includes(keyword.toLowerCase())) {
        priorityCounts['high'] = (priorityCounts['high'] || 0) + CONFIG.KEYWORD_WEIGHT * 2;
      }
    }
    // Medium-Priority Keywords
    for (const keyword of (priorityKeywords.medium || [])) {
      if (textLower.includes(keyword.toLowerCase())) {
        priorityCounts['medium'] = (priorityCounts['medium'] || 0) + CONFIG.KEYWORD_WEIGHT * 1.5;
      }
    }
    // Low-Priority Keywords
    for (const keyword of (priorityKeywords.low || [])) {
      if (textLower.includes(keyword.toLowerCase())) {
        priorityCounts['low'] = (priorityCounts['low'] || 0) + CONFIG.KEYWORD_WEIGHT;
      }
    }

    // 4. CONTEXT-BASED: Tageszeit-Kategorien
    const hour = new Date().getHours();
    const patterns = parseJsonbWithDefault<ThinkingPatterns>(profile.thinking_patterns, {
      action_oriented: 0, question_frequency: 0, abstract_vs_concrete: 0,
      topic_chains: [], morning_categories: [], evening_categories: []
    });

    if (hour >= 5 && hour < 12) {
      // Morgens
      for (const cat of (patterns.morning_categories || [])) {
        categoryCounts[cat] = (categoryCounts[cat] || 0) + 0.05;
      }
    } else if (hour >= 18 || hour < 5) {
      // Abends
      for (const cat of (patterns.evening_categories || [])) {
        categoryCounts[cat] = (categoryCounts[cat] || 0) + 0.05;
      }
    }

    // 5. TEXT-ANALYSIS: Direkter Text-Hinweis
    // Frage erkannt?
    if (text.includes('?') || /^(wie|was|warum|wann|wo|wer|which|what|why|when|where|who|how)/i.test(text)) {
      typeCounts['question'] = (typeCounts['question'] || 0) + 0.3;
    }
    // Task erkannt?
    if (/\b(machen|tun|erstellen|bauen|implementieren|müssen|sollte|todo|task|aufgabe)\b/i.test(text)) {
      typeCounts['task'] = (typeCounts['task'] || 0) + 0.3;
    }
    // Problem erkannt?
    if (/\b(problem|fehler|bug|issue|schwierigkeit|herausforderung)\b/i.test(text)) {
      typeCounts['problem'] = (typeCounts['problem'] || 0) + 0.3;
    }
    // Technical erkannt?
    if (/\b(api|code|function|database|server|frontend|backend|docker|kubernetes)\b/i.test(text)) {
      categoryCounts['technical'] = (categoryCounts['technical'] || 0) + 0.2;
    }
    // Business erkannt?
    if (/\b(kunde|verkauf|umsatz|profit|marketing|strategie|geschäft|customer|sales|revenue)\b/i.test(text)) {
      categoryCounts['business'] = (categoryCounts['business'] || 0) + 0.2;
    }

    // Get top suggestions
    const suggestedType = getTopKey(typeCounts) || 'idea';
    const suggestedCategory = getTopKey(categoryCounts) || 'personal';
    const suggestedPriority = getTopKey(priorityCounts) || 'medium';
    const suggestedContext = getTopKey(contextCounts) || undefined;

    // Calculate confidence based on how clear the winner is
    const typeConfidence = calculateSelectionConfidence(typeCounts);
    const categoryConfidence = calculateSelectionConfidence(categoryCounts);
    const priorityConfidence = calculateSelectionConfidence(priorityCounts);

    const overallConfidence = (typeConfidence + categoryConfidence + priorityConfidence) / 3;

    // Baue Reasoning
    const reasons: string[] = [];
    if (inputEmbedding.length > 0) {
      reasons.push(`Ähnlichkeit zu ${ideaCount} bisherigen Gedanken`);
    }
    if (Object.keys(preferredCategories).length > 0) {
      reasons.push('deine Kategorie-Präferenzen');
    }
    if (priorityKeywords.high?.length > 0 || priorityKeywords.medium?.length > 0) {
      reasons.push('gelernte Priority-Keywords');
    }

    logger.debug('Learning suggestion', {
      type: suggestedType,
      typeConfidence: typeConfidence.toFixed(2),
      category: suggestedCategory,
      categoryConfidence: categoryConfidence.toFixed(2),
      priority: suggestedPriority,
      priorityConfidence: priorityConfidence.toFixed(2)
    });

    return {
      suggested_type: suggestedType,
      suggested_category: suggestedCategory,
      suggested_priority: suggestedPriority,
      suggested_context: suggestedContext,
      confidence: overallConfidence,
      reasoning: reasons.length > 0
        ? `Basierend auf ${reasons.join(', ')}`
        : 'Erste Einschätzung basierend auf Textanalyse',
    };

  } catch (error) {
    logger.error('Learning suggestion error', error instanceof Error ? error : undefined);
    return null;
  } finally {
    client.release();
  }
}

/**
 * Calculate how confident we are in the top selection
 * Higher when one option clearly dominates
 */
function calculateSelectionConfidence(counts: Record<string, number>): number {
  const values = Object.values(counts);
  if (values.length === 0) {return 0;}
  if (values.length === 1) {return 0.8;}

  const sorted = values.sort((a, b) => b - a);
  const total = sorted.reduce((a, b) => a + b, 0);

  if (total === 0) {return 0;}

  // Wie viel Prozent hat der Gewinner?
  const winnerShare = sorted[0] / total;

  // Wie weit ist der Abstand zum Zweiten?
  const gap = sorted.length > 1 ? (sorted[0] - sorted[1]) / total : 1;

  return Math.min(winnerShare * 0.6 + gap * 0.4, 1);
}

/**
 * Learn from a new thought/idea
 *
 * WICHTIG: Lernt nur SCHWACH von automatischen LLM-Klassifizierungen.
 * Starkes Lernen erfolgt nur bei expliziten User-Korrekturen!
 *
 * @param isUserCorrected - true wenn der User die Klassifizierung korrigiert hat
 */
export async function learnFromThought(
  ideaId: string,
  userId: string = 'default',
  isUserCorrected: boolean = false
): Promise<void> {
  const client = await pool.connect();

  try {
    const ideaResult = await client.query(
      `SELECT type, category, priority, keywords, summary, raw_transcript, created_at
       FROM ideas WHERE id = $1`,
      [ideaId]
    );

    if (ideaResult.rows.length === 0) {
      logger.debug('Learning: Idea not found', { ideaId });
      return;
    }

    const idea = ideaResult.rows[0];

    // Lernstärke: User-Korrekturen zählen 5x mehr als LLM-Klassifizierungen
    const learningWeight = isUserCorrected ? 5 : 1;
    logger.debug('Learning from idea', {
      ideaId,
      type: idea.type,
      category: idea.category,
      priority: idea.priority,
      learningWeight,
      isUserCorrected
    });

    // Stelle sicher, dass Profil existiert
    await client.query(
      `INSERT INTO user_profile (id) VALUES ($1) ON CONFLICT (id) DO NOTHING`,
      [userId]
    );

    // 1. Update Kategorie-Präferenz (gewichtet)
    await incrementPreference(client, userId, 'preferred_categories', idea.category, learningWeight);

    // 2. Update Typ-Präferenz (gewichtet)
    await incrementPreference(client, userId, 'preferred_types', idea.type, learningWeight);

    // 3. Update Aktive Stunden (nur schwach, da nicht korrigierbar)
    const hour = new Date(idea.created_at).getHours().toString();
    await incrementPreference(client, userId, 'active_hours', hour, 1);

    // 4. Update Topic-Interessen aus Keywords (nur bei User-Korrektur stark) — batched
    const keywords = parseJsonbWithDefault<string[]>(idea.keywords, []);
    await batchIncrementTopicInterests(client, userId, keywords, isUserCorrected ? 3 : 1);

    // 5. Update Thinking Patterns (nur Beobachtung, kein starkes Lernen)
    await updateThinkingPatterns(client, userId, idea);

    // 6. Update Language Style (nur Beobachtung)
    await updateLanguageStyle(client, userId, idea.raw_transcript || idea.summary);

    // 7. Update Topic Chains (nur Beobachtung)
    await updateTopicChains(client, userId, idea.category);

    // 8. Lerne Priority-Keywords (NUR bei User-Korrektur!)
    // Das ist kritisch - wir wollen keine LLM-Fehler bei Prioritäten lernen
    if (isUserCorrected) {
      await learnPriorityKeywords(client, userId, keywords, idea.priority);
    }

    // 9. Update Learning Confidence
    await updateLearningConfidence(client, userId);

    // 10. Decay alte Präferenzen (verhindert Verfestigung)
    await applyPreferenceDecay(client, userId);

    logger.debug('Learning complete for idea', { ideaId });

  } catch (error) {
    logger.error('Learning from thought error', error instanceof Error ? error : undefined);
  } finally {
    client.release();
  }
}

/**
 * Explizites Lernen wenn User eine Klassifizierung korrigiert
 * Dies hat HÖCHSTE Priorität und korrigiert auch Fehlinterpretationen
 */
export async function learnFromCorrection(
  ideaId: string,
  corrections: {
    oldType?: string;
    newType?: string;
    oldCategory?: string;
    newCategory?: string;
    oldPriority?: string;
    newPriority?: string;
    oldContext?: string;
    newContext?: string;
  },
  userId: string = 'default'
): Promise<void> {
  const client = await pool.connect();

  try {
    logger.debug('Learning from user correction', { ideaId, corrections });

    // Stelle sicher, dass Profil existiert
    await client.query(
      `INSERT INTO user_profile (id) VALUES ($1) ON CONFLICT (id) DO NOTHING`,
      [userId]
    );

    // NEGATIVE LEARNING: Reduziere Gewicht der falschen Klassifizierung
    if (corrections.oldCategory && corrections.newCategory && corrections.oldCategory !== corrections.newCategory) {
      await decrementPreference(client, userId, 'preferred_categories', corrections.oldCategory, 3);
      await incrementPreference(client, userId, 'preferred_categories', corrections.newCategory, 5);
      logger.debug('Category correction learned', {
        from: corrections.oldCategory,
        to: corrections.newCategory
      });
    }

    if (corrections.oldType && corrections.newType && corrections.oldType !== corrections.newType) {
      await decrementPreference(client, userId, 'preferred_types', corrections.oldType, 3);
      await incrementPreference(client, userId, 'preferred_types', corrections.newType, 5);
      logger.debug('Type correction learned', {
        from: corrections.oldType,
        to: corrections.newType
      });
    }

    // Priority-Keywords: Entferne Keywords von falscher Priorität
    if (corrections.oldPriority && corrections.newPriority && corrections.oldPriority !== corrections.newPriority) {
      const ideaResult = await client.query(
        'SELECT keywords FROM ideas WHERE id = $1',
        [ideaId]
      );
      if (ideaResult.rows.length > 0) {
        const keywords = parseJsonbWithDefault<string[]>(ideaResult.rows[0].keywords, []);
        // Lerne die richtige Priorität für diese Keywords
        await learnPriorityKeywords(client, userId, keywords, corrections.newPriority);
        logger.debug('Priority keywords updated', { keywords });
      }
    }

    // Reduziere Confidence nach Korrektur (System war falsch!)
    await reduceConfidenceAfterError(client, userId);

  } catch (error) {
    logger.error('Learning from correction error', error instanceof Error ? error : undefined);
  } finally {
    client.release();
  }
}

/**
 * Reduziere Confidence nach einem Fehler
 */
async function reduceConfidenceAfterError(client: PoolClient, userId: string): Promise<void> {
  try {
    await client.query(
      `UPDATE user_profile
       SET productivity_patterns = jsonb_set(
         COALESCE(productivity_patterns, '{}')::jsonb,
         '{learning_confidence}',
         (GREATEST(0, COALESCE((productivity_patterns->>'learning_confidence')::float, 0) - 0.05))::text::jsonb
       ),
       updated_at = NOW()
       WHERE id = $1`,
      [userId]
    );
    logger.debug('Confidence reduced by 0.05 due to correction');
  } catch (error) {
    logger.error('Error reducing confidence', error instanceof Error ? error : undefined);
  }
}

/**
 * Decay alte Präferenzen um Verfestigung von Fehlern zu verhindern
 * Wird bei jedem Lernen aufgerufen, reduziert alle Werte leicht
 */
async function applyPreferenceDecay(client: PoolClient, userId: string): Promise<void> {
  const DECAY_RATE = 0.98; // 2% Reduktion pro Lernevent

  try {
    // Decay für preferred_categories
    const catResult = await client.query(
      'SELECT preferred_categories FROM user_profile WHERE id = $1',
      [userId]
    );
    if (catResult.rows.length > 0) {
      const cats = parseJsonbWithDefault<Record<string, number>>(catResult.rows[0].preferred_categories, {});
      const decayedCats: Record<string, number> = {};
      for (const [key, value] of Object.entries(cats)) {
        const decayed = Math.floor((value as number) * DECAY_RATE);
        if (decayed > 0) {
          decayedCats[key] = decayed;
        }
      }
      await client.query(
        'UPDATE user_profile SET preferred_categories = $2 WHERE id = $1',
        [userId, JSON.stringify(decayedCats)]
      );
    }

    // Decay für preferred_types
    const typeResult = await client.query(
      'SELECT preferred_types FROM user_profile WHERE id = $1',
      [userId]
    );
    if (typeResult.rows.length > 0) {
      const types = parseJsonbWithDefault<Record<string, number>>(typeResult.rows[0].preferred_types, {});
      const decayedTypes: Record<string, number> = {};
      for (const [key, value] of Object.entries(types)) {
        const decayed = Math.floor((value as number) * DECAY_RATE);
        if (decayed > 0) {
          decayedTypes[key] = decayed;
        }
      }
      await client.query(
        'UPDATE user_profile SET preferred_types = $2 WHERE id = $1',
        [userId, JSON.stringify(decayedTypes)]
      );
    }
  } catch (error) {
    logger.error('Error applying preference decay', error instanceof Error ? error : undefined);
  }
}

/**
 * Increment a preference counter with optional weight
 */
async function incrementPreference(
  client: PoolClient,
  userId: string,
  field: string,
  key: string,
  weight: number = 1
): Promise<void> {
  try {
    await client.query(
      `UPDATE user_profile
       SET ${field} = jsonb_set(
         COALESCE(${field}, '{}')::jsonb,
         $2::text[],
         (COALESCE((${field}->$3)::int, 0) + $4)::text::jsonb
       ),
       updated_at = NOW()
       WHERE id = $1`,
      [userId, [key], key, weight]
    );
  } catch (error) {
    logger.error('Error incrementing field', error instanceof Error ? error : undefined, { field, key });
  }
}

/**
 * Decrement a preference counter (for negative learning)
 */
async function decrementPreference(
  client: PoolClient,
  userId: string,
  field: string,
  key: string,
  weight: number = 1
): Promise<void> {
  try {
    await client.query(
      `UPDATE user_profile
       SET ${field} = jsonb_set(
         COALESCE(${field}, '{}')::jsonb,
         $2::text[],
         GREATEST(0, COALESCE((${field}->$3)::int, 0) - $4)::text::jsonb
       ),
       updated_at = NOW()
       WHERE id = $1`,
      [userId, [key], key, weight]
    );
  } catch (error) {
    logger.error('Error decrementing field', error instanceof Error ? error : undefined, { field, key });
  }
}

/**
 * Batch increment topic interests — single query instead of N queries per keyword
 * Reduces N+1 pattern: with 10 keywords, this is 1 query instead of 10
 */
async function batchIncrementTopicInterests(
  client: PoolClient,
  userId: string,
  topics: string[],
  weight: number = 1
): Promise<void> {
  // Filter and normalize
  const validTopics = topics
    .map(t => t.toLowerCase().trim())
    .filter(t => t.length >= 2);

  if (validTopics.length === 0) {return;}

  try {
    // Build a JSONB object with weights, then merge with existing using SUM
    // This is a single query instead of N queries per keyword
    const topicObj: Record<string, number> = {};
    for (const topic of validTopics) {
      topicObj[topic] = (topicObj[topic] || 0) + weight;
    }

    await client.query(
      `UPDATE user_profile
       SET topic_interests = (
         SELECT COALESCE(jsonb_object_agg(key, total), '{}'::jsonb)
         FROM (
           SELECT key, SUM(value::int) as total
           FROM (
             SELECT key, value FROM jsonb_each_text(COALESCE(topic_interests, '{}'))
             UNION ALL
             SELECT key, value FROM jsonb_each_text($2::jsonb)
           ) combined
           GROUP BY key
         ) merged
       ),
       updated_at = NOW()
       WHERE id = $1`,
      [userId, JSON.stringify(topicObj)]
    );
  } catch (error) {
    logger.error('Error batch incrementing topics', error instanceof Error ? error : undefined, { count: validTopics.length });
  }
}

/**
 * Increment topic interest with optional weight (single topic)
 * @deprecated Use batchIncrementTopicInterests for multiple topics
 */
async function _incrementTopicInterest(
  client: PoolClient,
  userId: string,
  topic: string,
  weight: number = 1
): Promise<void> {
  const normalizedTopic = topic.toLowerCase().trim();
  if (normalizedTopic.length < 2) {return;}

  try {
    await client.query(
      `UPDATE user_profile
       SET topic_interests = jsonb_set(
         COALESCE(topic_interests, '{}')::jsonb,
         $2::text[],
         (COALESCE((topic_interests->$3)::int, 0) + $4)::text::jsonb
       ),
       updated_at = NOW()
       WHERE id = $1`,
      [userId, [normalizedTopic], normalizedTopic, weight]
    );
  } catch (error) {
    logger.error('Error incrementing topic', error instanceof Error ? error : undefined, { topic: normalizedTopic });
  }
}

/**
 * Learn priority keywords from user behavior
 */
async function learnPriorityKeywords(
  client: PoolClient,
  userId: string,
  keywords: string[],
  priority: string
): Promise<void> {
  if (!keywords || keywords.length === 0) {return;}
  if (!['high', 'medium', 'low'].includes(priority)) {return;}

  try {
    const profileResult = await client.query(
      'SELECT priority_keywords FROM user_profile WHERE id = $1',
      [userId]
    );

    const priorityKeywords = parseJsonbWithDefault<PriorityKeywords>(profileResult.rows[0]?.priority_keywords, {
      high: [],
      medium: [],
      low: [],
    });

    // Stelle sicher, dass Arrays existieren
    priorityKeywords.high = priorityKeywords.high || [];
    priorityKeywords.medium = priorityKeywords.medium || [];
    priorityKeywords.low = priorityKeywords.low || [];

    // Add keywords to the appropriate priority list
    for (const keyword of keywords) {
      const normalized = keyword.toLowerCase().trim();
      if (normalized.length < 2) {continue;}

      // Entferne aus anderen Prioritäten (ein Keyword gehört nur zu einer Priorität)
      priorityKeywords.high = priorityKeywords.high.filter((k: string) => k !== normalized);
      priorityKeywords.medium = priorityKeywords.medium.filter((k: string) => k !== normalized);
      priorityKeywords.low = priorityKeywords.low.filter((k: string) => k !== normalized);

      // Füge zur aktuellen Priorität hinzu
      if (!priorityKeywords[priority].includes(normalized)) {
        priorityKeywords[priority].push(normalized);
        // Limit to 30 per category
        if (priorityKeywords[priority].length > 30) {
          priorityKeywords[priority].shift();
        }
      }
    }

    await client.query(
      `UPDATE user_profile SET priority_keywords = $2, updated_at = NOW() WHERE id = $1`,
      [userId, JSON.stringify(priorityKeywords)]
    );
  } catch (error) {
    logger.error('Error learning priority keywords', error instanceof Error ? error : undefined);
  }
}

/**
 * Update thinking patterns based on new idea
 */
async function updateThinkingPatterns(
  client: PoolClient,
  userId: string,
  idea: IdeaData
): Promise<void> {
  try {
    const result = await client.query(
      `SELECT thinking_patterns FROM user_profile WHERE id = $1`,
      [userId]
    );

    const patterns = parseJsonbWithDefault<ThinkingPatterns>(result.rows[0]?.thinking_patterns, {
      abstract_vs_concrete: 0,
      big_picture_vs_detail: 0,
      action_oriented: 0,
      question_frequency: 0,
      topic_chains: [],
      morning_categories: [],
      evening_categories: [],
    });

    const text = (idea.raw_transcript || idea.summary || '').toLowerCase();
    const keywords = parseJsonbWithDefault<string[]>(idea.keywords, []);

    // Action-oriented detection
    const actionWords = ['machen', 'erstellen', 'implementieren', 'bauen', 'starten', 'tun', 'erledigen',
                        'do', 'create', 'build', 'make', 'implement', 'start', 'finish'];
    const hasActionWords = actionWords.some(w => text.includes(w));

    if (hasActionWords || idea.type === 'task') {
      patterns.action_oriented = smoothUpdate(patterns.action_oriented, 1, 0.15);
    } else {
      patterns.action_oriented = smoothUpdate(patterns.action_oriented, patterns.action_oriented, 0.02);
    }

    // Question frequency
    if (idea.type === 'question' || text.includes('?')) {
      patterns.question_frequency = smoothUpdate(patterns.question_frequency, 1, 0.15);
    } else {
      patterns.question_frequency = smoothUpdate(patterns.question_frequency, patterns.question_frequency, 0.02);
    }

    // Abstract vs concrete
    const technicalKeywords = keywords.filter((k: string) =>
      /[A-Z]|[0-9]|api|sdk|framework|library|database|server|code/i.test(k)
    );
    if (keywords.length > 0) {
      const techRatio = technicalKeywords.length / keywords.length;
      const target = techRatio > 0.5 ? 1 : (techRatio > 0.2 ? 0 : -1);
      patterns.abstract_vs_concrete = smoothUpdate(patterns.abstract_vs_concrete, target, 0.1);
    }

    // Time-based category patterns
    const hour = new Date(idea.created_at).getHours();
    if (hour >= 5 && hour < 12) {
      // Morgens
      if (!patterns.morning_categories.includes(idea.category)) {
        patterns.morning_categories.push(idea.category);
      }
      // Behalte nur die letzten 5
      patterns.morning_categories = patterns.morning_categories.slice(-5);
    } else if (hour >= 18 || hour < 5) {
      // Abends
      if (!patterns.evening_categories.includes(idea.category)) {
        patterns.evening_categories.push(idea.category);
      }
      patterns.evening_categories = patterns.evening_categories.slice(-5);
    }

    await client.query(
      `UPDATE user_profile SET thinking_patterns = $2, updated_at = NOW() WHERE id = $1`,
      [userId, JSON.stringify(patterns)]
    );
  } catch (error) {
    logger.error('Error updating thinking patterns', error instanceof Error ? error : undefined);
  }
}

/**
 * Update language style from text
 */
async function updateLanguageStyle(
  client: PoolClient,
  userId: string,
  text: string
): Promise<void> {
  if (!text || text.length < 10) {return;}

  try {
    const result = await client.query(
      `SELECT language_style FROM user_profile WHERE id = $1`,
      [userId]
    );

    const style = parseJsonbWithDefault<LanguageStyle>(result.rows[0]?.language_style, {
      avg_thought_length: 0,
      common_phrases: [],
      vocabulary_complexity: 0.5,
      uses_technical_terms: false,
      preferred_language: 'de',
    });

    // Update average length
    const wordCount = text.split(/\s+/).length;
    if (style.avg_thought_length === 0) {
      style.avg_thought_length = wordCount;
    } else {
      style.avg_thought_length = smoothUpdate(style.avg_thought_length, wordCount, 0.2);
    }

    // Detect language
    const germanWords = text.match(/\b(und|der|die|das|ist|für|mit|auf|ein|eine|nicht|haben|werden|sein)\b/gi) || [];
    const englishWords = text.match(/\b(the|and|is|for|with|on|a|an|to|of|in|that|have|will|be)\b/gi) || [];

    if (germanWords.length > englishWords.length * 1.5) {
      style.preferred_language = 'de';
    } else if (englishWords.length > germanWords.length * 1.5) {
      style.preferred_language = 'en';
    } else if (germanWords.length > 0 || englishWords.length > 0) {
      style.preferred_language = 'mixed';
    }

    // Technical terms detection
    const technicalTerms = text.match(/\b(API|SDK|UI|UX|SQL|HTTP|JSON|REST|GraphQL|Docker|Kubernetes|React|TypeScript|JavaScript|Python|Node|Git|AWS|Azure|GCP|CI|CD|DevOps|Microservice|Container|Database|Backend|Frontend|Framework|Library)\b/gi);
    if (technicalTerms && technicalTerms.length > 0) {
      style.uses_technical_terms = true;
      style.vocabulary_complexity = smoothUpdate(style.vocabulary_complexity, 0.8, 0.15);
    }

    await client.query(
      `UPDATE user_profile SET language_style = $2, updated_at = NOW() WHERE id = $1`,
      [userId, JSON.stringify(style)]
    );
  } catch (error) {
    logger.error('Error updating language style', error instanceof Error ? error : undefined);
  }
}

/**
 * Track topic transitions
 */
async function updateTopicChains(
  client: PoolClient,
  userId: string,
  currentCategory: string
): Promise<void> {
  try {
    // Get last idea's category (excluding current and archived)
    const lastIdea = await client.query(
      `SELECT category FROM ideas
       WHERE is_archived = false
       ORDER BY created_at DESC
       OFFSET 1 LIMIT 1`
    );

    if (lastIdea.rows.length === 0) {return;}

    const lastCategory = lastIdea.rows[0].category;
    if (lastCategory === currentCategory) {return;} // Gleiche Kategorie, kein Übergang

    const result = await client.query(
      `SELECT thinking_patterns FROM user_profile WHERE id = $1`,
      [userId]
    );

    const patterns = parseJsonbWithDefault<{ topic_chains: string[][] }>(result.rows[0]?.thinking_patterns, { topic_chains: [] });
    patterns.topic_chains = patterns.topic_chains || [];

    const chain = [lastCategory, currentCategory];

    // Zähle wie oft dieser Übergang vorkommt
    const existingIndex = patterns.topic_chains.findIndex(
      (c: string[]) => c[0] === chain[0] && c[1] === chain[1]
    );

    if (existingIndex === -1) {
      patterns.topic_chains.push(chain);
      // Behalte nur die letzten 30 Übergänge
      if (patterns.topic_chains.length > 30) {
        patterns.topic_chains.shift();
      }

      await client.query(
        `UPDATE user_profile SET thinking_patterns = $2, updated_at = NOW() WHERE id = $1`,
        [userId, JSON.stringify(patterns)]
      );
    }
  } catch (error) {
    logger.error('Error updating topic chains', error instanceof Error ? error : undefined);
  }
}

/**
 * Update learning confidence
 */
async function updateLearningConfidence(
  client: PoolClient,
  userId: string
): Promise<void> {
  try {
    const result = await client.query(
      `SELECT
         (SELECT COUNT(*) FROM ideas WHERE is_archived = false) as idea_count,
         (SELECT COUNT(*) FROM loose_thoughts WHERE user_id = $1) as thought_count,
         (SELECT COUNT(*) FROM user_interactions) as interaction_count`,
      [userId]
    );

    const stats = result.rows[0];
    const totalSamples = parseInt(stats.idea_count) + parseInt(stats.thought_count);
    const interactions = parseInt(stats.interaction_count);

    // Confidence grows with data - schneller als vorher
    // Bei 10 Samples schon 50%, bei 30 Samples 100%
    const dataConfidence = Math.min(totalSamples / 30, 1);
    const interactionConfidence = Math.min(interactions / 50, 1);

    const confidence = dataConfidence * 0.8 + interactionConfidence * 0.2;

    await client.query(
      `UPDATE user_profile
       SET productivity_patterns = jsonb_set(
         COALESCE(productivity_patterns, '{}')::jsonb,
         '{learning_confidence}',
         $2::text::jsonb
       ),
       updated_at = NOW()
       WHERE id = $1`,
      [userId, confidence]
    );
  } catch (error) {
    logger.error('Error updating learning confidence', error instanceof Error ? error : undefined);
  }
}

/**
 * Run learning analysis - can be called anytime, not just daily
 */
export async function runDailyLearning(userId: string = 'default'): Promise<{
  insights: LearningInsight[];
  patterns_updated: boolean;
  confidence: number;
}> {
  const client = await pool.connect();

  try {
    const insights: LearningInsight[] = [];

    // Analyze all ideas (not just last 7 days for better learning)
    const allIdeas = await client.query(
      `SELECT type, category, priority, keywords, created_at, raw_transcript
       FROM ideas
       ORDER BY created_at DESC
       LIMIT 100`
    );

    if (allIdeas.rows.length === 0) {
      return { insights: [], patterns_updated: false, confidence: 0 };
    }

    // Find patterns
    const typeCounts: Record<string, number> = {};
    const categoryCounts: Record<string, number> = {};
    const hourCounts: Record<number, number> = {};
    const allKeywords: string[] = [];

    for (const idea of allIdeas.rows) {
      typeCounts[idea.type] = (typeCounts[idea.type] || 0) + 1;
      categoryCounts[idea.category] = (categoryCounts[idea.category] || 0) + 1;

      const hour = new Date(idea.created_at).getHours();
      hourCounts[hour] = (hourCounts[hour] || 0) + 1;

      const keywords = parseJsonbWithDefault<string[]>(idea.keywords, []);
      allKeywords.push(...keywords);
    }

    // Generate insights
    const dominantType = getTopKey(typeCounts);
    if (dominantType) {
      const percentage = Math.round(typeCounts[dominantType] / allIdeas.rows.length * 100);
      insights.push({
        type: 'type',
        confidence: typeCounts[dominantType] / allIdeas.rows.length,
        suggestion: dominantType,
        reason: `${percentage}% deiner Gedanken sind vom Typ "${dominantType}"`,
      });
    }

    const dominantCategory = getTopKey(categoryCounts);
    if (dominantCategory) {
      const percentage = Math.round(categoryCounts[dominantCategory] / allIdeas.rows.length * 100);
      insights.push({
        type: 'category',
        confidence: categoryCounts[dominantCategory] / allIdeas.rows.length,
        suggestion: dominantCategory,
        reason: `Fokus auf ${dominantCategory} (${percentage}%)`,
      });
    }

    // Find peak hours
    const peakHour = getTopKey(hourCounts);
    if (peakHour) {
      insights.push({
        type: 'pattern',
        confidence: 0.8,
        suggestion: `peak_hour_${peakHour}`,
        reason: `Deine produktivste Stunde: ${peakHour}:00 Uhr`,
      });
    }

    // Find top keywords
    const keywordCounts: Record<string, number> = {};
    for (const kw of allKeywords) {
      if (kw && kw.length > 2) {
        const normalized = kw.toLowerCase();
        keywordCounts[normalized] = (keywordCounts[normalized] || 0) + 1;
      }
    }

    const topKeywords = Object.entries(keywordCounts)
      .filter(([, count]) => count >= CONFIG.PHRASE_MIN_FREQUENCY)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    for (const [keyword, count] of topKeywords) {
      insights.push({
        type: 'topic',
        confidence: Math.min(count / 10, 1),
        suggestion: keyword,
        reason: `"${keyword}" erscheint in ${count} Gedanken`,
      });
    }

    // Update interest embedding
    await updateInterestEmbedding(client, userId, allIdeas.rows.slice(0, 50));

    // Calculate current confidence
    const confResult = await client.query(
      `SELECT productivity_patterns->'learning_confidence' as confidence FROM user_profile WHERE id = $1`,
      [userId]
    );
    const confidence = parseFloat(confResult.rows[0]?.confidence) || 0;

    return {
      insights,
      patterns_updated: true,
      confidence,
    };

  } catch (error) {
    logger.error('Daily learning error', error instanceof Error ? error : undefined);
    return { insights: [], patterns_updated: false, confidence: 0 };
  } finally {
    client.release();
  }
}

/**
 * Update interest embedding from recent ideas
 */
async function updateInterestEmbedding(
  client: PoolClient,
  userId: string,
  ideas: IdeaData[]
): Promise<void> {
  if (ideas.length === 0) {return;}

  try {
    const textContent = ideas
      .map(i => {
        const keywords = parseJsonbWithDefault<string[]>(i.keywords, []);
        const keywordStr = keywords.join(' ');
        return `${i.raw_transcript || ''} ${keywordStr}`.trim();
      })
      .filter(t => t.length > 0)
      .join(' ');

    if (textContent.length < 50) {return;} // Zu wenig Content

    // Only generate embeddings if Ollama is configured
    if (!isOllamaConfigured()) {
      logger.debug('Skipping interest embedding update - Ollama not configured');
      return;
    }

    const embedding = await generateEmbedding(textContent.substring(0, 5000));

    if (embedding.length > 0) {
      await client.query(
        `UPDATE user_profile SET interest_embedding = $2, updated_at = NOW() WHERE id = $1`,
        [userId, formatForPgVector(embedding)]
      );
    }
  } catch (error) {
    logger.error('Error updating interest embedding', error instanceof Error ? error : undefined);
  }
}

/**
 * Get personalized prompt enhancement for LLM
 */
export async function getPersonalizedPromptContext(
  userId: string = 'default'
): Promise<string> {
  const client = await pool.connect();

  try {
    const result = await client.query(
      `SELECT thinking_patterns, language_style, preferred_categories,
              preferred_types, topic_interests
       FROM user_profile WHERE id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {return '';}

    const profile = result.rows[0];
    const patterns = parseJsonbWithDefault<ThinkingPatterns>(profile.thinking_patterns, {
      action_oriented: 0, question_frequency: 0, abstract_vs_concrete: 0,
      topic_chains: [], morning_categories: [], evening_categories: []
    });
    const style = parseJsonbWithDefault<LanguageStyle>(profile.language_style, {
      avg_thought_length: 0, preferred_language: 'de', uses_technical_terms: false,
      vocabulary_complexity: 0, common_phrases: []
    });
    const topCategories = getTopN(parseJsonbWithDefault<Record<string, number>>(profile.preferred_categories, {}), 2);
    const topTypes = getTopN(parseJsonbWithDefault<Record<string, number>>(profile.preferred_types, {}), 2);
    const topTopics = getTopN(parseJsonbWithDefault<Record<string, number>>(profile.topic_interests, {}), 5);

    const contextParts: string[] = ['BENUTZER-KONTEXT:'];

    if (topCategories.length > 0) {
      contextParts.push(`- Fokus-Kategorien: ${topCategories.join(', ')}`);
    }
    if (topTypes.length > 0) {
      contextParts.push(`- Häufige Typen: ${topTypes.join(', ')}`);
    }
    if (topTopics.length > 0) {
      contextParts.push(`- Interessen: ${topTopics.join(', ')}`);
    }
    if (patterns?.action_oriented > 0.6) {
      contextParts.push('- Denkt handlungsorientiert');
    }
    if (patterns?.question_frequency > 0.4) {
      contextParts.push('- Stellt häufig Fragen');
    }
    if (style?.uses_technical_terms) {
      contextParts.push('- Verwendet technische Begriffe');
    }
    if (style?.preferred_language && style.preferred_language !== 'de') {
      contextParts.push(`- Bevorzugte Sprache: ${style.preferred_language}`);
    }

    return contextParts.length > 1 ? contextParts.join('\n') : '';

  } catch (error) {
    logger.error('Error getting personalized context', error instanceof Error ? error : undefined);
    return '';
  } finally {
    client.release();
  }
}

// Helper functions
function smoothUpdate(current: number, target: number, rate: number): number {
  if (typeof current !== 'number' || isNaN(current)) {current = 0;}
  if (typeof target !== 'number' || isNaN(target)) {return current;}
  return current + (target - current) * rate;
}

function getTopKey(counts: Record<string, number>): string | null {
  const entries = Object.entries(counts);
  if (entries.length === 0) {return null;}
  return entries.sort((a, b) => b[1] - a[1])[0][0];
}

function getTopN(counts: Record<string, number>, n: number): string[] {
  if (!counts || typeof counts !== 'object') {return [];}
  return Object.entries(counts)
    .sort((a, b) => (b[1] as number) - (a[1] as number))
    .slice(0, n)
    .map(([key]) => key);
}

// parseJsonb imported from ../types - centralized implementation

// ===========================================
// ENHANCED FEATURE EXTRACTION
// ===========================================

export interface ExtractedFeatures {
  linguistic: {
    avgSentenceLength: number;
    questionRatio: number;
    technicalTermDensity: number;
    emotionalIntensity: number;
  };
  semantic: {
    topEntities: string[];
    dominantTopics: string[];
    intentSignals: string[];
  };
  temporal: {
    timeReferences: string[];
    urgencyLevel: 'none' | 'low' | 'medium' | 'high';
    hasDeadline: boolean;
  };
  structural: {
    hasList: boolean;
    hasNumbers: boolean;
    hasCode: boolean;
    contentLength: 'short' | 'medium' | 'long';
  };
}

/**
 * Extract comprehensive features from text for better learning
 */
export function extractFeatures(text: string): ExtractedFeatures {
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const words = text.split(/\s+/).filter(w => w.length > 0);

  // Linguistic features
  const avgSentenceLength = sentences.length > 0 ? words.length / sentences.length : 0;
  const questionCount = (text.match(/\?/g) || []).length;
  const questionRatio = sentences.length > 0 ? questionCount / sentences.length : 0;

  // Technical terms detection (expanded)
  const technicalTerms = text.match(/\b(API|SDK|UI|UX|SQL|HTTP|JSON|REST|GraphQL|Docker|Kubernetes|React|TypeScript|JavaScript|Python|Node|Git|AWS|Azure|GCP|CI|CD|DevOps|Microservice|Container|Database|Backend|Frontend|Framework|Library|Algorithm|Function|Variable|Class|Interface|Module|Package|Deploy|Build|Test|Debug|Refactor|Merge|Branch|Commit|Repository|Server|Client|Request|Response|Endpoint|Cache|Queue|Stream|Socket|Thread|Process|Memory|CPU|GPU|ML|AI|NLP|LLM|Embedding|Vector|Neural|Model|Training|Inference)\b/gi) || [];
  const technicalTermDensity = words.length > 0 ? technicalTerms.length / words.length : 0;

  // Emotional intensity detection
  const emotionalWords = text.match(/\b(super|toll|schlecht|furchtbar|großartig|schrecklich|fantastisch|katastrophal|unglaublich|awesome|terrible|amazing|horrible|exciting|frustrating|wonderful|awful|brilliant|disaster|incredible|dringend|sofort|wichtig|kritisch|urgent|critical|crucial|essential)\b/gi) || [];
  const emotionalIntensity = words.length > 0 ? emotionalWords.length / words.length : 0;

  // Semantic features - Entity extraction
  const entities: string[] = [];
  // Names (capitalized words not at sentence start)
  // eslint-disable-next-line security/detect-unsafe-regex -- Simple name extraction, bounded input
  const namePattern = /(?<=[a-z][.?!]\s+|\n)([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g;
  const nameMatches = text.match(namePattern);
  if (nameMatches) {entities.push(...nameMatches.slice(0, 5));}

  // Dominant topics detection
  const topicIndicators: Record<string, string[]> = {
    'technology': ['software', 'app', 'code', 'system', 'tool', 'platform', 'digital', 'tech'],
    'business': ['kunde', 'customer', 'umsatz', 'revenue', 'projekt', 'project', 'meeting', 'strategie'],
    'personal': ['ich', 'mir', 'mein', 'family', 'health', 'hobby', 'privat', 'persönlich'],
    'learning': ['lernen', 'learn', 'study', 'kurs', 'course', 'understand', 'research', 'wissen'],
    'finance': ['geld', 'money', 'budget', 'kosten', 'cost', 'investition', 'investment', 'profit'],
    'communication': ['email', 'call', 'message', 'meeting', 'presentation', 'diskussion', 'feedback'],
  };

  const dominantTopics: string[] = [];
  const textLower = text.toLowerCase();
  for (const [topic, keywords] of Object.entries(topicIndicators)) {
    const matchCount = keywords.filter(kw => textLower.includes(kw)).length;
    if (matchCount >= 2) {dominantTopics.push(topic);}
  }

  // Intent signals detection
  const intentSignals: string[] = [];
  if (/\b(muss|müssen|sollte|should|must|need to|have to)\b/i.test(text)) {intentSignals.push('obligation');}
  if (/\b(will|wollen|möchte|want|would like|plan to)\b/i.test(text)) {intentSignals.push('intention');}
  if (/\b(frage|warum|wie|was|why|how|what|when)\b/i.test(text) || text.includes('?')) {intentSignals.push('inquiry');}
  if (/\b(idee|vorschlag|könnten|idea|suggest|propose|maybe)\b/i.test(text)) {intentSignals.push('suggestion');}
  if (/\b(problem|fehler|bug|issue|error|broken)\b/i.test(text)) {intentSignals.push('problem-report');}

  // Temporal features
  const timeReferences: string[] = [];
  const timePatterns = [
    /\b(heute|today)\b/gi,
    /\b(morgen|tomorrow)\b/gi,
    /\b(diese woche|this week)\b/gi,
    /\b(nächste woche|next week)\b/gi,
    /\b(bis|until|by)\s+\d{1,2}[./]\d{1,2}/gi,
    /\b(in \d+ (tagen|wochen|monaten)|in \d+ (days|weeks|months))\b/gi,
  ];
  for (const pattern of timePatterns) {
    const matches = text.match(pattern);
    if (matches) {timeReferences.push(...matches);}
  }

  // Urgency level
  let urgencyLevel: 'none' | 'low' | 'medium' | 'high' = 'none';
  if (/\b(heute|sofort|asap|dringend|urgent|immediately|kritisch|critical)\b/i.test(text)) {
    urgencyLevel = 'high';
  } else if (/\b(bald|soon|zeitnah|diese woche|this week)\b/i.test(text)) {
    urgencyLevel = 'medium';
  } else if (/\b(später|eventually|irgendwann|sometime)\b/i.test(text)) {
    urgencyLevel = 'low';
  }

  const hasDeadline = /\b(bis|deadline|until|by)\s+(\d{1,2}[./]\d{1,2}|\d{4}|montag|dienstag|mittwoch|donnerstag|freitag|monday|tuesday|wednesday|thursday|friday)/i.test(text);

  // Structural features
  const hasList = /^[\s]*[-*•]\s|^\s*\d+[.)]/m.test(text);
  const hasNumbers = /\d+/.test(text);
  const hasCode = /```|`[^`]+`|function\s*\(|const\s+\w+|let\s+\w+|var\s+\w+|=>|import\s+\{/.test(text);

  let contentLength: 'short' | 'medium' | 'long' = 'short';
  if (words.length > 100) {contentLength = 'long';}
  else if (words.length > 30) {contentLength = 'medium';}

  return {
    linguistic: {
      avgSentenceLength: Math.round(avgSentenceLength * 10) / 10,
      questionRatio: Math.round(questionRatio * 100) / 100,
      technicalTermDensity: Math.round(technicalTermDensity * 1000) / 1000,
      emotionalIntensity: Math.round(emotionalIntensity * 1000) / 1000,
    },
    semantic: {
      topEntities: entities.slice(0, 5),
      dominantTopics,
      intentSignals,
    },
    temporal: {
      timeReferences: timeReferences.slice(0, 5),
      urgencyLevel,
      hasDeadline,
    },
    structural: {
      hasList,
      hasNumbers,
      hasCode,
      contentLength,
    },
  };
}

// ===========================================
// BIAS DETECTION & CORRECTION
// ===========================================

export interface BiasReport {
  detected: boolean;
  biasType: string | null;
  severity: 'none' | 'low' | 'medium' | 'high';
  details: string;
  recommendation: string;
}

/**
 * Detect potential biases in learning data
 */
export async function detectLearningBias(
  _userId: string = 'default'
): Promise<BiasReport> {
  const client = await pool.connect();

  try {
    // Get category distribution
    const categoryResult = await client.query(
      `SELECT category, COUNT(*) as count
       FROM ideas
       WHERE is_archived = false
       GROUP BY category`
    );

    // Get type distribution
    const typeResult = await client.query(
      `SELECT type, COUNT(*) as count
       FROM ideas
       WHERE is_archived = false
       GROUP BY type`
    );

    // Get priority distribution
    const priorityResult = await client.query(
      `SELECT priority, COUNT(*) as count
       FROM ideas
       WHERE is_archived = false
       GROUP BY priority`
    );

    const categories = categoryResult.rows;
    const types = typeResult.rows;
    const priorities = priorityResult.rows;

    // Calculate concentration metrics
    const totalIdeas = categories.reduce((sum, c) => sum + parseInt(c.count), 0);
    if (totalIdeas < 10) {
      return {
        detected: false,
        biasType: null,
        severity: 'none',
        details: 'Nicht genügend Daten für Bias-Analyse',
        recommendation: 'Sammle mehr Ideen für eine aussagekräftige Analyse.',
      };
    }

    // Check for category dominance bias
    const categoryMax = Math.max(...categories.map(c => parseInt(c.count)));
    const categoryDominance = categoryMax / totalIdeas;

    // Check for type dominance bias
    const typeMax = Math.max(...types.map(t => parseInt(t.count)));
    const typeDominance = types.length > 0 ? typeMax / totalIdeas : 0;

    // Check for priority skew bias
    const priorityCounts = priorities.reduce((acc, p) => {
      acc[p.priority] = parseInt(p.count);
      return acc;
    }, {} as Record<string, number>);
    const highPriorityRatio = (priorityCounts['high'] || 0) / totalIdeas;
    const lowPriorityRatio = (priorityCounts['low'] || 0) / totalIdeas;

    // Determine bias type and severity
    let biasType: string | null = null;
    let severity: 'none' | 'low' | 'medium' | 'high' = 'none';
    let details = '';
    let recommendation = '';

    if (categoryDominance > 0.8) {
      const dominantCategory = categories.find(c => parseInt(c.count) === categoryMax)?.category;
      biasType = 'category-dominance';
      severity = categoryDominance > 0.9 ? 'high' : 'medium';
      details = `${Math.round(categoryDominance * 100)}% der Ideen sind in Kategorie "${dominantCategory}"`;
      recommendation = 'Versuche, Ideen aus verschiedenen Lebensbereichen zu erfassen. Das System lernt möglicherweise, alles in diese Kategorie einzuordnen.';
    } else if (typeDominance > 0.7) {
      const dominantType = types.find(t => parseInt(t.count) === typeMax)?.type;
      biasType = 'type-dominance';
      severity = typeDominance > 0.85 ? 'high' : 'medium';
      details = `${Math.round(typeDominance * 100)}% der Ideen sind vom Typ "${dominantType}"`;
      recommendation = 'Verschiedene Arten von Gedanken (Ideen, Aufgaben, Fragen, Erkenntnisse) helfen dem System, besser zu differenzieren.';
    } else if (highPriorityRatio > 0.6) {
      biasType = 'priority-inflation';
      severity = highPriorityRatio > 0.75 ? 'high' : 'medium';
      details = `${Math.round(highPriorityRatio * 100)}% der Ideen haben hohe Priorität`;
      recommendation = 'Wenn alles hohe Priorität hat, verliert die Priorisierung ihren Wert. Überprüfe, ob wirklich alles dringend ist.';
    } else if (lowPriorityRatio > 0.7) {
      biasType = 'priority-deflation';
      severity = 'low';
      details = `${Math.round(lowPriorityRatio * 100)}% der Ideen haben niedrige Priorität`;
      recommendation = 'Viele niedrig priorisierte Ideen sind normal, aber stelle sicher, dass wichtige Dinge nicht untergehen.';
    } else if (categories.length < 3 && totalIdeas > 20) {
      biasType = 'limited-diversity';
      severity = 'low';
      details = `Nur ${categories.length} Kategorien bei ${totalIdeas} Ideen`;
      recommendation = 'Mehr Vielfalt in den Kategorien würde das Lernen verbessern.';
    }

    // Check for time-based bias (recency)
    const recentResult = await client.query(
      `SELECT COUNT(*) as recent_count
       FROM ideas
       WHERE is_archived = false
         AND created_at > NOW() - INTERVAL '7 days'`
    );
    const recentCount = parseInt(recentResult.rows[0].recent_count);
    const recentRatio = recentCount / totalIdeas;

    if (recentRatio > 0.7 && !biasType) {
      biasType = 'recency-bias';
      severity = 'low';
      details = `${Math.round(recentRatio * 100)}% der Ideen sind aus den letzten 7 Tagen`;
      recommendation = 'Das System könnte aktuelle Muster übergewichten. Ältere Muster werden möglicherweise unterrepräsentiert.';
    }

    return {
      detected: biasType !== null,
      biasType,
      severity,
      details: details || 'Keine signifikanten Verzerrungen erkannt',
      recommendation: recommendation || 'Die Lernverteilung sieht ausgewogen aus.',
    };

  } catch (error) {
    logger.error('Error detecting learning bias', error instanceof Error ? error : undefined);
    return {
      detected: false,
      biasType: null,
      severity: 'none',
      details: 'Fehler bei der Bias-Analyse',
      recommendation: 'Bitte später erneut versuchen.',
    };
  } finally {
    client.release();
  }
}

/**
 * Get learning quality metrics
 */
export async function getLearningQualityMetrics(
  userId: string = 'default'
): Promise<{
  dataQuality: number;
  diversityScore: number;
  learningProgress: number;
  correctionRate: number;
  biasReport: BiasReport;
}> {
  const client = await pool.connect();

  try {
    // Get total ideas
    const totalResult = await client.query(
      `SELECT COUNT(*) as count FROM ideas WHERE is_archived = false`
    );
    const totalIdeas = parseInt(totalResult.rows[0].count);

    // Get ideas with embeddings (data quality indicator)
    const embeddingResult = await client.query(
      `SELECT COUNT(*) as count FROM ideas WHERE is_archived = false AND embedding IS NOT NULL`
    );
    const withEmbeddings = parseInt(embeddingResult.rows[0].count);
    const dataQuality = totalIdeas > 0 ? withEmbeddings / totalIdeas : 0;

    // Get category diversity (using Gini coefficient approximation)
    const categoryResult = await client.query(
      `SELECT category, COUNT(*) as count FROM ideas WHERE is_archived = false GROUP BY category`
    );
    const categoryDistribution = categoryResult.rows.map(r => parseInt(r.count));
    const diversityScore = calculateDiversityScore(categoryDistribution);

    // Get user profile for learning progress
    const profileResult = await client.query(
      `SELECT productivity_patterns FROM user_profile WHERE id = $1`,
      [userId]
    );
    const patterns = parseJsonbWithDefault<{ learning_confidence?: number }>(profileResult.rows[0]?.productivity_patterns, {});
    const learningProgress = patterns.learning_confidence || 0;

    // Estimate correction rate (how often user corrects AI suggestions)
    // This would need actual tracking, so we estimate based on profile age
    const correctionRate = 0; // Placeholder - would need tracking implementation

    // Get bias report
    const biasReport = await detectLearningBias(userId);

    return {
      dataQuality: Math.round(dataQuality * 100) / 100,
      diversityScore: Math.round(diversityScore * 100) / 100,
      learningProgress: Math.round(learningProgress * 100) / 100,
      correctionRate,
      biasReport,
    };

  } catch (error) {
    logger.error('Error getting learning quality metrics', error instanceof Error ? error : undefined);
    return {
      dataQuality: 0,
      diversityScore: 0,
      learningProgress: 0,
      correctionRate: 0,
      biasReport: {
        detected: false,
        biasType: null,
        severity: 'none',
        details: 'Fehler bei der Metrik-Berechnung',
        recommendation: '',
      },
    };
  } finally {
    client.release();
  }
}

/**
 * Calculate diversity score using normalized entropy
 */
function calculateDiversityScore(distribution: number[]): number {
  if (distribution.length === 0) {return 0;}
  if (distribution.length === 1) {return 0;} // Only one category = no diversity

  const total = distribution.reduce((a, b) => a + b, 0);
  if (total === 0) {return 0;}

  // Calculate Shannon entropy
  let entropy = 0;
  for (const count of distribution) {
    if (count > 0) {
      const p = count / total;
      entropy -= p * Math.log2(p);
    }
  }

  // Normalize by maximum possible entropy (uniform distribution)
  const maxEntropy = Math.log2(distribution.length);
  return maxEntropy > 0 ? entropy / maxEntropy : 0;
}
