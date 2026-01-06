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

import { pool, query } from '../utils/database';
import { generateEmbedding } from '../utils/ollama';
import { formatForPgVector } from '../utils/embedding';

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';

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
      console.log(`Learning: Nur ${ideaCount} Ideen, brauche mindestens ${CONFIG.MIN_SAMPLES_FOR_SUGGESTIONS}`);
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

    // Generate embedding for input text
    let inputEmbedding: number[] = [];
    try {
      inputEmbedding = await generateEmbedding(text);
    } catch (err) {
      console.log('Learning: Embedding generation failed, using keyword-only mode');
    }

    // Initialize counters
    const typeCounts: Record<string, number> = {};
    const categoryCounts: Record<string, number> = {};
    const priorityCounts: Record<string, number> = {};

    // 1. SIMILARITY-BASED: Finde ähnliche vergangene Ideen
    if (inputEmbedding.length > 0) {
      const similarIdeas = await client.query(
        `SELECT type, category, priority, keywords,
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
        }
      }
    }

    // 2. PREFERENCE-BASED: Wende gelernte Präferenzen an
    const preferredCategories = parseJsonb(profile.preferred_categories);
    const preferredTypes = parseJsonb(profile.preferred_types);

    // Normalisiere Präferenzen (relative Gewichtung)
    const totalCatPrefs = Object.values(preferredCategories).reduce((a: number, b: any) => a + (b as number), 0) || 1;
    const totalTypePrefs = Object.values(preferredTypes).reduce((a: number, b: any) => a + (b as number), 0) || 1;

    for (const [cat, count] of Object.entries(preferredCategories)) {
      const normalizedWeight = ((count as number) / totalCatPrefs) * CONFIG.PREFERENCE_WEIGHT;
      categoryCounts[cat] = (categoryCounts[cat] || 0) + normalizedWeight;
    }
    for (const [type, count] of Object.entries(preferredTypes)) {
      const normalizedWeight = ((count as number) / totalTypePrefs) * CONFIG.PREFERENCE_WEIGHT;
      typeCounts[type] = (typeCounts[type] || 0) + normalizedWeight;
    }

    // 3. KEYWORD-BASED: Prüfe Priority-Keywords
    const priorityKeywords = parseJsonb(profile.priority_keywords) || { high: [], medium: [], low: [] };
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
    const patterns = parseJsonb(profile.thinking_patterns) || {};

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

    console.log(`Learning suggestion: type=${suggestedType} (${typeConfidence.toFixed(2)}), cat=${suggestedCategory} (${categoryConfidence.toFixed(2)}), prio=${suggestedPriority} (${priorityConfidence.toFixed(2)})`);

    return {
      suggested_type: suggestedType,
      suggested_category: suggestedCategory,
      suggested_priority: suggestedPriority,
      confidence: overallConfidence,
      reasoning: reasons.length > 0
        ? `Basierend auf ${reasons.join(', ')}`
        : 'Erste Einschätzung basierend auf Textanalyse',
    };

  } catch (error) {
    console.error('Learning suggestion error:', error);
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
  if (values.length === 0) return 0;
  if (values.length === 1) return 0.8;

  const sorted = values.sort((a, b) => b - a);
  const total = sorted.reduce((a, b) => a + b, 0);

  if (total === 0) return 0;

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
      console.log(`Learning: Idea ${ideaId} not found`);
      return;
    }

    const idea = ideaResult.rows[0];

    // Lernstärke: User-Korrekturen zählen 5x mehr als LLM-Klassifizierungen
    const learningWeight = isUserCorrected ? 5 : 1;
    console.log(`Learning from idea: ${ideaId} (${idea.type}/${idea.category}/${idea.priority}) [weight: ${learningWeight}x, user_corrected: ${isUserCorrected}]`);

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

    // 4. Update Topic-Interessen aus Keywords (nur bei User-Korrektur stark)
    const keywords = parseJsonb(idea.keywords) || [];
    for (const keyword of keywords) {
      await incrementTopicInterest(client, userId, keyword, isUserCorrected ? 3 : 1);
    }

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

    console.log(`Learning complete for idea: ${ideaId}`);

  } catch (error) {
    console.error('Learning from thought error:', error);
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
  },
  userId: string = 'default'
): Promise<void> {
  const client = await pool.connect();

  try {
    console.log(`Learning from user correction on idea ${ideaId}:`, corrections);

    // Stelle sicher, dass Profil existiert
    await client.query(
      `INSERT INTO user_profile (id) VALUES ($1) ON CONFLICT (id) DO NOTHING`,
      [userId]
    );

    // NEGATIVE LEARNING: Reduziere Gewicht der falschen Klassifizierung
    if (corrections.oldCategory && corrections.newCategory && corrections.oldCategory !== corrections.newCategory) {
      await decrementPreference(client, userId, 'preferred_categories', corrections.oldCategory, 3);
      await incrementPreference(client, userId, 'preferred_categories', corrections.newCategory, 5);
      console.log(`  Category correction: ${corrections.oldCategory} (-3) -> ${corrections.newCategory} (+5)`);
    }

    if (corrections.oldType && corrections.newType && corrections.oldType !== corrections.newType) {
      await decrementPreference(client, userId, 'preferred_types', corrections.oldType, 3);
      await incrementPreference(client, userId, 'preferred_types', corrections.newType, 5);
      console.log(`  Type correction: ${corrections.oldType} (-3) -> ${corrections.newType} (+5)`);
    }

    // Priority-Keywords: Entferne Keywords von falscher Priorität
    if (corrections.oldPriority && corrections.newPriority && corrections.oldPriority !== corrections.newPriority) {
      const ideaResult = await client.query(
        'SELECT keywords FROM ideas WHERE id = $1',
        [ideaId]
      );
      if (ideaResult.rows.length > 0) {
        const keywords = parseJsonb(ideaResult.rows[0].keywords) || [];
        // Lerne die richtige Priorität für diese Keywords
        await learnPriorityKeywords(client, userId, keywords, corrections.newPriority);
        console.log(`  Priority keywords updated for: ${keywords.join(', ')}`);
      }
    }

    // Reduziere Confidence nach Korrektur (System war falsch!)
    await reduceConfidenceAfterError(client, userId);

  } catch (error) {
    console.error('Learning from correction error:', error);
  } finally {
    client.release();
  }
}

/**
 * Reduziere Confidence nach einem Fehler
 */
async function reduceConfidenceAfterError(client: any, userId: string): Promise<void> {
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
    console.log('  Confidence reduced by 0.05 due to correction');
  } catch (error) {
    console.error('Error reducing confidence:', error);
  }
}

/**
 * Decay alte Präferenzen um Verfestigung von Fehlern zu verhindern
 * Wird bei jedem Lernen aufgerufen, reduziert alle Werte leicht
 */
async function applyPreferenceDecay(client: any, userId: string): Promise<void> {
  const DECAY_RATE = 0.98; // 2% Reduktion pro Lernevent

  try {
    // Decay für preferred_categories
    const catResult = await client.query(
      'SELECT preferred_categories FROM user_profile WHERE id = $1',
      [userId]
    );
    if (catResult.rows.length > 0) {
      const cats = parseJsonb(catResult.rows[0].preferred_categories);
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
      const types = parseJsonb(typeResult.rows[0].preferred_types);
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
    console.error('Error applying preference decay:', error);
  }
}

/**
 * Increment a preference counter with optional weight
 */
async function incrementPreference(
  client: any,
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
    console.error(`Error incrementing ${field}.${key}:`, error);
  }
}

/**
 * Decrement a preference counter (for negative learning)
 */
async function decrementPreference(
  client: any,
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
    console.error(`Error decrementing ${field}.${key}:`, error);
  }
}

/**
 * Increment topic interest with optional weight
 */
async function incrementTopicInterest(
  client: any,
  userId: string,
  topic: string,
  weight: number = 1
): Promise<void> {
  const normalizedTopic = topic.toLowerCase().trim();
  if (normalizedTopic.length < 2) return; // Ignoriere zu kurze Keywords

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
    console.error(`Error incrementing topic ${normalizedTopic}:`, error);
  }
}

/**
 * Learn priority keywords from user behavior
 */
async function learnPriorityKeywords(
  client: any,
  userId: string,
  keywords: string[],
  priority: string
): Promise<void> {
  if (!keywords || keywords.length === 0) return;
  if (!['high', 'medium', 'low'].includes(priority)) return;

  try {
    const profileResult = await client.query(
      'SELECT priority_keywords FROM user_profile WHERE id = $1',
      [userId]
    );

    const priorityKeywords = parseJsonb(profileResult.rows[0]?.priority_keywords) || {
      high: [],
      medium: [],
      low: [],
    };

    // Stelle sicher, dass Arrays existieren
    priorityKeywords.high = priorityKeywords.high || [];
    priorityKeywords.medium = priorityKeywords.medium || [];
    priorityKeywords.low = priorityKeywords.low || [];

    // Add keywords to the appropriate priority list
    for (const keyword of keywords) {
      const normalized = keyword.toLowerCase().trim();
      if (normalized.length < 2) continue;

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
    console.error('Error learning priority keywords:', error);
  }
}

/**
 * Update thinking patterns based on new idea
 */
async function updateThinkingPatterns(
  client: any,
  userId: string,
  idea: any
): Promise<void> {
  try {
    const result = await client.query(
      `SELECT thinking_patterns FROM user_profile WHERE id = $1`,
      [userId]
    );

    let patterns = parseJsonb(result.rows[0]?.thinking_patterns) || {
      abstract_vs_concrete: 0,
      big_picture_vs_detail: 0,
      action_oriented: 0,
      question_frequency: 0,
      topic_chains: [],
      morning_categories: [],
      evening_categories: [],
    };

    const text = (idea.raw_transcript || idea.summary || '').toLowerCase();
    const keywords = parseJsonb(idea.keywords) || [];

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
    console.error('Error updating thinking patterns:', error);
  }
}

/**
 * Update language style from text
 */
async function updateLanguageStyle(
  client: any,
  userId: string,
  text: string
): Promise<void> {
  if (!text || text.length < 10) return;

  try {
    const result = await client.query(
      `SELECT language_style FROM user_profile WHERE id = $1`,
      [userId]
    );

    let style = parseJsonb(result.rows[0]?.language_style) || {
      avg_thought_length: 0,
      common_phrases: [],
      vocabulary_complexity: 0.5,
      uses_technical_terms: false,
      preferred_language: 'de',
    };

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
    console.error('Error updating language style:', error);
  }
}

/**
 * Track topic transitions
 */
async function updateTopicChains(
  client: any,
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

    if (lastIdea.rows.length === 0) return;

    const lastCategory = lastIdea.rows[0].category;
    if (lastCategory === currentCategory) return; // Gleiche Kategorie, kein Übergang

    const result = await client.query(
      `SELECT thinking_patterns FROM user_profile WHERE id = $1`,
      [userId]
    );

    const patterns = parseJsonb(result.rows[0]?.thinking_patterns) || { topic_chains: [] };
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
    console.error('Error updating topic chains:', error);
  }
}

/**
 * Update learning confidence
 */
async function updateLearningConfidence(
  client: any,
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
    console.error('Error updating learning confidence:', error);
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

      const keywords = parseJsonb(idea.keywords);
      if (Array.isArray(keywords)) {
        allKeywords.push(...keywords);
      }
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
    console.error('Daily learning error:', error);
    return { insights: [], patterns_updated: false, confidence: 0 };
  } finally {
    client.release();
  }
}

/**
 * Update interest embedding from recent ideas
 */
async function updateInterestEmbedding(
  client: any,
  userId: string,
  ideas: any[]
): Promise<void> {
  if (ideas.length === 0) return;

  try {
    const textContent = ideas
      .map(i => {
        const keywords = parseJsonb(i.keywords);
        const keywordStr = Array.isArray(keywords) ? keywords.join(' ') : '';
        return `${i.raw_transcript || ''} ${keywordStr}`.trim();
      })
      .filter(t => t.length > 0)
      .join(' ');

    if (textContent.length < 50) return; // Zu wenig Content

    const embedding = await generateEmbedding(textContent.substring(0, 5000));

    if (embedding.length > 0) {
      await client.query(
        `UPDATE user_profile SET interest_embedding = $2, updated_at = NOW() WHERE id = $1`,
        [userId, formatForPgVector(embedding)]
      );
    }
  } catch (error) {
    console.error('Error updating interest embedding:', error);
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

    if (result.rows.length === 0) return '';

    const profile = result.rows[0];
    const patterns = parseJsonb(profile.thinking_patterns);
    const style = parseJsonb(profile.language_style);
    const topCategories = getTopN(parseJsonb(profile.preferred_categories), 2);
    const topTypes = getTopN(parseJsonb(profile.preferred_types), 2);
    const topTopics = getTopN(parseJsonb(profile.topic_interests), 5);

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
    console.error('Error getting personalized context:', error);
    return '';
  } finally {
    client.release();
  }
}

// Helper functions
function smoothUpdate(current: number, target: number, rate: number): number {
  if (typeof current !== 'number' || isNaN(current)) current = 0;
  if (typeof target !== 'number' || isNaN(target)) return current;
  return current + (target - current) * rate;
}

function getTopKey(counts: Record<string, number>): string | null {
  const entries = Object.entries(counts);
  if (entries.length === 0) return null;
  return entries.sort((a, b) => b[1] - a[1])[0][0];
}

function getTopN(counts: Record<string, number>, n: number): string[] {
  if (!counts || typeof counts !== 'object') return [];
  return Object.entries(counts)
    .sort((a, b) => (b[1] as number) - (a[1] as number))
    .slice(0, n)
    .map(([key]) => key);
}

function parseJsonb(value: any): any {
  if (value === null || value === undefined) return {};
  if (typeof value === 'object') return value;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  }
  return {};
}
