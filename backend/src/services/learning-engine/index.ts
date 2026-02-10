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
 *
 * Sub-modules:
 * - profile-updates: DB helpers for preference/pattern updates
 * - analysis: Feature extraction, bias detection, quality metrics
 *
 * @module services/learning-engine
 */

import { pool } from '../../utils/database';
import { generateEmbedding } from '../../utils/ollama';
import { formatForPgVector } from '../../utils/embedding';
import { logger } from '../../utils/logger';
import { parseJsonbWithDefault } from '../../types';

import {
  incrementPreference,
  decrementPreference,
  batchIncrementTopicInterests,
  learnPriorityKeywords,
  updateThinkingPatterns,
  updateLanguageStyle,
  updateTopicChains,
  updateLearningConfidence,
  reduceConfidenceAfterError,
  applyPreferenceDecay,
  updateInterestEmbedding,
} from './profile-updates';

// Re-export sub-modules for external consumers
export { extractFeatures, detectLearningBias, getLearningQualityMetrics } from './analysis';
export type { ExtractedFeatures, BiasReport } from './analysis';

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

// Ollama URL - no default to prevent silent failures in production
const OLLAMA_URL = process.env.OLLAMA_URL;

function isOllamaConfigured(): boolean {
  if (!OLLAMA_URL) {
    return false;
  }
  if (process.env.NODE_ENV === 'production' && OLLAMA_URL.includes('localhost')) {
    logger.warn('OLLAMA_URL contains localhost in production - this will likely fail');
    return false;
  }
  return true;
}

// Learning thresholds
const CONFIG = {
  MIN_SAMPLES_FOR_SUGGESTIONS: 3,
  CONFIDENCE_FOR_OVERRIDE: 0.5,
  PHRASE_MIN_FREQUENCY: 2,
  SIMILARITY_WEIGHT: 0.6,
  PREFERENCE_WEIGHT: 0.3,
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
 */
export async function suggestFromLearning(
  text: string,
  userId: string = 'default'
): Promise<PersonalizedSuggestion | null> {
  const client = await pool.connect();

  try {
    const countResult = await client.query('SELECT COUNT(*) as count FROM ideas WHERE is_archived = false');
    const ideaCount = parseInt(countResult.rows[0].count);

    if (ideaCount < CONFIG.MIN_SAMPLES_FOR_SUGGESTIONS) {
      logger.debug('Learning: Not enough ideas for suggestions', { ideaCount, minRequired: CONFIG.MIN_SAMPLES_FOR_SUGGESTIONS });
      return null;
    }

    const profileResult = await client.query(
      `SELECT thinking_patterns, language_style, topic_interests,
              preferred_categories, preferred_types, priority_keywords
       FROM user_profile WHERE id = $1`,
      [userId]
    );

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

    const typeCounts: Record<string, number> = {};
    const categoryCounts: Record<string, number> = {};
    const priorityCounts: Record<string, number> = {};
    const contextCounts: Record<string, number> = {};

    // 1. SIMILARITY-BASED
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
        if (weight > 0.1) {
          typeCounts[idea.type] = (typeCounts[idea.type] || 0) + weight;
          categoryCounts[idea.category] = (categoryCounts[idea.category] || 0) + weight;
          priorityCounts[idea.priority] = (priorityCounts[idea.priority] || 0) + weight;
          if (idea.context) {
            contextCounts[idea.context] = (contextCounts[idea.context] || 0) + weight;
          }
        }
      }
    }

    // 2. PREFERENCE-BASED
    const preferredCategories = parseJsonbWithDefault<Record<string, number>>(profile.preferred_categories, {});
    const preferredTypes = parseJsonbWithDefault<Record<string, number>>(profile.preferred_types, {});

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

    // 3. KEYWORD-BASED
    const priorityKeywords = parseJsonbWithDefault<PriorityKeywords>(profile.priority_keywords, { high: [], medium: [], low: [] });
    const textLower = text.toLowerCase();

    for (const keyword of (priorityKeywords.high || [])) {
      if (textLower.includes(keyword.toLowerCase())) {
        priorityCounts['high'] = (priorityCounts['high'] || 0) + CONFIG.KEYWORD_WEIGHT * 2;
      }
    }
    for (const keyword of (priorityKeywords.medium || [])) {
      if (textLower.includes(keyword.toLowerCase())) {
        priorityCounts['medium'] = (priorityCounts['medium'] || 0) + CONFIG.KEYWORD_WEIGHT * 1.5;
      }
    }
    for (const keyword of (priorityKeywords.low || [])) {
      if (textLower.includes(keyword.toLowerCase())) {
        priorityCounts['low'] = (priorityCounts['low'] || 0) + CONFIG.KEYWORD_WEIGHT;
      }
    }

    // 4. CONTEXT-BASED: Time-of-day categories
    const hour = new Date().getHours();
    const patterns = parseJsonbWithDefault<ThinkingPatterns>(profile.thinking_patterns, {
      action_oriented: 0, question_frequency: 0, abstract_vs_concrete: 0,
      topic_chains: [], morning_categories: [], evening_categories: []
    });

    if (hour >= 5 && hour < 12) {
      for (const cat of (patterns.morning_categories || [])) {
        categoryCounts[cat] = (categoryCounts[cat] || 0) + 0.05;
      }
    } else if (hour >= 18 || hour < 5) {
      for (const cat of (patterns.evening_categories || [])) {
        categoryCounts[cat] = (categoryCounts[cat] || 0) + 0.05;
      }
    }

    // 5. TEXT-ANALYSIS
    if (text.includes('?') || /^(wie|was|warum|wann|wo|wer|which|what|why|when|where|who|how)/i.test(text)) {
      typeCounts['question'] = (typeCounts['question'] || 0) + 0.3;
    }
    if (/\b(machen|tun|erstellen|bauen|implementieren|müssen|sollte|todo|task|aufgabe)\b/i.test(text)) {
      typeCounts['task'] = (typeCounts['task'] || 0) + 0.3;
    }
    if (/\b(problem|fehler|bug|issue|schwierigkeit|herausforderung)\b/i.test(text)) {
      typeCounts['problem'] = (typeCounts['problem'] || 0) + 0.3;
    }
    if (/\b(api|code|function|database|server|frontend|backend|docker|kubernetes)\b/i.test(text)) {
      categoryCounts['technical'] = (categoryCounts['technical'] || 0) + 0.2;
    }
    if (/\b(kunde|verkauf|umsatz|profit|marketing|strategie|geschäft|customer|sales|revenue)\b/i.test(text)) {
      categoryCounts['business'] = (categoryCounts['business'] || 0) + 0.2;
    }

    // Get top suggestions
    const suggestedType = getTopKey(typeCounts) || 'idea';
    const suggestedCategory = getTopKey(categoryCounts) || 'personal';
    const suggestedPriority = getTopKey(priorityCounts) || 'medium';
    const suggestedContext = getTopKey(contextCounts) || undefined;

    const typeConfidence = calculateSelectionConfidence(typeCounts);
    const categoryConfidence = calculateSelectionConfidence(categoryCounts);
    const priorityConfidence = calculateSelectionConfidence(priorityCounts);

    const overallConfidence = (typeConfidence + categoryConfidence + priorityConfidence) / 3;

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
 */
function calculateSelectionConfidence(counts: Record<string, number>): number {
  const values = Object.values(counts);
  if (values.length === 0) {return 0;}
  if (values.length === 1) {return 0.8;}

  const sorted = values.sort((a, b) => b - a);
  const total = sorted.reduce((a, b) => a + b, 0);

  if (total === 0) {return 0;}

  const winnerShare = sorted[0] / total;
  const gap = sorted.length > 1 ? (sorted[0] - sorted[1]) / total : 1;

  return Math.min(winnerShare * 0.6 + gap * 0.4, 1);
}

/**
 * Learn from a new thought/idea
 *
 * WICHTIG: Lernt nur SCHWACH von automatischen LLM-Klassifizierungen.
 * Starkes Lernen erfolgt nur bei expliziten User-Korrekturen!
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
    const learningWeight = isUserCorrected ? 5 : 1;
    logger.debug('Learning from idea', {
      ideaId, type: idea.type, category: idea.category,
      priority: idea.priority, learningWeight, isUserCorrected
    });

    await client.query(
      `INSERT INTO user_profile (id) VALUES ($1) ON CONFLICT (id) DO NOTHING`,
      [userId]
    );

    // 1. Update category preference
    await incrementPreference(client, userId, 'preferred_categories', idea.category, learningWeight);

    // 2. Update type preference
    await incrementPreference(client, userId, 'preferred_types', idea.type, learningWeight);

    // 3. Update active hours
    const hour = new Date(idea.created_at).getHours().toString();
    await incrementPreference(client, userId, 'active_hours', hour, 1);

    // 4. Update topic interests from keywords
    const keywords = parseJsonbWithDefault<string[]>(idea.keywords, []);
    await batchIncrementTopicInterests(client, userId, keywords, isUserCorrected ? 3 : 1);

    // 5. Update thinking patterns
    await updateThinkingPatterns(client, userId, idea);

    // 6. Update language style
    await updateLanguageStyle(client, userId, idea.raw_transcript || idea.summary);

    // 7. Update topic chains
    await updateTopicChains(client, userId, idea.category);

    // 8. Learn priority keywords (ONLY on user correction!)
    if (isUserCorrected) {
      await learnPriorityKeywords(client, userId, keywords, idea.priority);
    }

    // 9. Update learning confidence
    await updateLearningConfidence(client, userId);

    // 10. Decay old preferences
    await applyPreferenceDecay(client, userId);

    logger.debug('Learning complete for idea', { ideaId });

  } catch (error) {
    logger.error('Learning from thought error', error instanceof Error ? error : undefined);
  } finally {
    client.release();
  }
}

/**
 * Explicit learning when user corrects a classification
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

    await client.query(
      `INSERT INTO user_profile (id) VALUES ($1) ON CONFLICT (id) DO NOTHING`,
      [userId]
    );

    // NEGATIVE LEARNING: Reduce weight of wrong classification
    if (corrections.oldCategory && corrections.newCategory && corrections.oldCategory !== corrections.newCategory) {
      await decrementPreference(client, userId, 'preferred_categories', corrections.oldCategory, 3);
      await incrementPreference(client, userId, 'preferred_categories', corrections.newCategory, 5);
      logger.debug('Category correction learned', { from: corrections.oldCategory, to: corrections.newCategory });
    }

    if (corrections.oldType && corrections.newType && corrections.oldType !== corrections.newType) {
      await decrementPreference(client, userId, 'preferred_types', corrections.oldType, 3);
      await incrementPreference(client, userId, 'preferred_types', corrections.newType, 5);
      logger.debug('Type correction learned', { from: corrections.oldType, to: corrections.newType });
    }

    // Priority keywords: Remove from wrong priority
    if (corrections.oldPriority && corrections.newPriority && corrections.oldPriority !== corrections.newPriority) {
      const ideaResult = await client.query(
        'SELECT keywords FROM ideas WHERE id = $1',
        [ideaId]
      );
      if (ideaResult.rows.length > 0) {
        const keywords = parseJsonbWithDefault<string[]>(ideaResult.rows[0].keywords, []);
        await learnPriorityKeywords(client, userId, keywords, corrections.newPriority);
        logger.debug('Priority keywords updated', { keywords });
      }
    }

    await reduceConfidenceAfterError(client, userId);

  } catch (error) {
    logger.error('Learning from correction error', error instanceof Error ? error : undefined);
  } finally {
    client.release();
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

// ===========================================
// Helpers
// ===========================================

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
