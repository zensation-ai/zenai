/**
 * Learning Engine - Profile Update Helpers
 *
 * Database operations for updating user learning profile:
 * - Preference counters (increment/decrement)
 * - Thinking pattern updates
 * - Language style tracking
 * - Topic chain tracking
 * - Priority keyword learning
 * - Confidence management
 * - Preference decay
 *
 * @module services/learning-engine/profile-updates
 */

import { PoolClient } from '../../utils/database';
import { generateEmbedding } from '../../utils/ollama';
import { formatForPgVector } from '../../utils/embedding';
import { logger } from '../../utils/logger';
import { parseJsonbWithDefault } from '../../types';

// Re-use shared types
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

function smoothUpdate(current: number, target: number, rate: number): number {
  if (typeof current !== 'number' || isNaN(current)) {current = 0;}
  if (typeof target !== 'number' || isNaN(target)) {return current;}
  return current + (target - current) * rate;
}

/**
 * Increment a preference counter with optional weight
 */
export async function incrementPreference(
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
export async function decrementPreference(
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
 */
export async function batchIncrementTopicInterests(
  client: PoolClient,
  userId: string,
  topics: string[],
  weight: number = 1
): Promise<void> {
  const validTopics = topics
    .map(t => t.toLowerCase().trim())
    .filter(t => t.length >= 2);

  if (validTopics.length === 0) {return;}

  try {
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
 * Learn priority keywords from user behavior
 */
export async function learnPriorityKeywords(
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

    priorityKeywords.high = priorityKeywords.high || [];
    priorityKeywords.medium = priorityKeywords.medium || [];
    priorityKeywords.low = priorityKeywords.low || [];

    for (const keyword of keywords) {
      const normalized = keyword.toLowerCase().trim();
      if (normalized.length < 2) {continue;}

      // Remove from other priorities
      priorityKeywords.high = priorityKeywords.high.filter((k: string) => k !== normalized);
      priorityKeywords.medium = priorityKeywords.medium.filter((k: string) => k !== normalized);
      priorityKeywords.low = priorityKeywords.low.filter((k: string) => k !== normalized);

      // Add to current priority
      if (!priorityKeywords[priority].includes(normalized)) {
        priorityKeywords[priority].push(normalized);
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
export async function updateThinkingPatterns(
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
      if (!patterns.morning_categories.includes(idea.category)) {
        patterns.morning_categories.push(idea.category);
      }
      patterns.morning_categories = patterns.morning_categories.slice(-5);
    } else if (hour >= 18 || hour < 5) {
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
export async function updateLanguageStyle(
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
export async function updateTopicChains(
  client: PoolClient,
  userId: string,
  currentCategory: string
): Promise<void> {
  try {
    const lastIdea = await client.query(
      `SELECT category FROM ideas
       WHERE is_archived = false
       ORDER BY created_at DESC
       OFFSET 1 LIMIT 1`
    );

    if (lastIdea.rows.length === 0) {return;}

    const lastCategory = lastIdea.rows[0].category;
    if (lastCategory === currentCategory) {return;}

    const result = await client.query(
      `SELECT thinking_patterns FROM user_profile WHERE id = $1`,
      [userId]
    );

    const patterns = parseJsonbWithDefault<{ topic_chains: string[][] }>(result.rows[0]?.thinking_patterns, { topic_chains: [] });
    patterns.topic_chains = patterns.topic_chains || [];

    const chain = [lastCategory, currentCategory];

    const existingIndex = patterns.topic_chains.findIndex(
      (c: string[]) => c[0] === chain[0] && c[1] === chain[1]
    );

    if (existingIndex === -1) {
      patterns.topic_chains.push(chain);
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
export async function updateLearningConfidence(
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
 * Reduce Confidence after an error
 */
export async function reduceConfidenceAfterError(client: PoolClient, userId: string): Promise<void> {
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
 * Decay old preferences to prevent error reinforcement
 */
export async function applyPreferenceDecay(client: PoolClient, userId: string): Promise<void> {
  const DECAY_RATE = 0.98;

  try {
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
 * Update interest embedding from recent ideas
 */
export async function updateInterestEmbedding(
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

    if (textContent.length < 50) {return;}

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
