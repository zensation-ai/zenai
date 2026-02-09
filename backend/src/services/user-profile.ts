import { query } from '../utils/database';
import { queryContext, AIContext } from '../utils/database-context';
import { generateEmbedding } from '../utils/ollama';
import { formatForPgVector } from '../utils/embedding';
import { logger } from '../utils/logger';
import { parseJsonb, parseJsonbWithDefault } from '../types';

export interface UserProfile {
  id: string;
  preferred_categories: Record<string, number>;
  preferred_types: Record<string, number>;
  topic_interests: Record<string, number>;
  active_hours: Record<string, number>;
  productivity_patterns: Record<string, unknown>;
  total_ideas: number;
  total_meetings: number;
  avg_ideas_per_day: number;
  priority_keywords: { high: string[]; medium: string[]; low: string[] };
  auto_priority_enabled: boolean;
  // Extended learning fields
  thinking_patterns?: ThinkingPatterns;
  language_style?: LanguageStyle;
  learning_confidence: number;
  created_at: string;
  updated_at: string;
}

export interface ThinkingPatterns {
  // How the user typically thinks
  abstract_vs_concrete: number; // -1 to 1 (abstract to concrete)
  big_picture_vs_detail: number; // -1 to 1
  action_oriented: number; // 0 to 1
  question_frequency: number; // 0 to 1
  // Common topic transitions
  topic_chains: string[][]; // e.g. [["business", "technical"], ["personal", "learning"]]
  // Time-based patterns
  morning_categories: string[];
  evening_categories: string[];
}

export interface LanguageStyle {
  avg_thought_length: number;
  common_phrases: string[];
  vocabulary_complexity: number; // 0 to 1
  uses_technical_terms: boolean;
  preferred_language: 'de' | 'en' | 'mixed';
}

export interface InteractionEvent {
  idea_id?: string;
  meeting_id?: string;
  interaction_type: 'view' | 'edit' | 'archive' | 'prioritize' | 'share' | 'search' | 'relate';
  metadata?: Record<string, unknown>;
}

/**
 * Get the user profile (uses default/public schema)
 */
export async function getUserProfile(profileId: string = 'default'): Promise<UserProfile> {
  // SECURITY: Explicit column selection instead of SELECT *
  const result = await query(
    `SELECT id, preferred_categories, preferred_types, topic_interests, active_hours,
            productivity_patterns, total_ideas, total_meetings, avg_ideas_per_day,
            priority_keywords, auto_priority_enabled, thinking_patterns, language_style,
            created_at, updated_at
     FROM user_profile WHERE id = $1`,
    [profileId]
  );

  if (result.rows.length === 0) {
    // Create default profile if it doesn't exist
    await query(
      `INSERT INTO user_profile (id) VALUES ($1) ON CONFLICT (id) DO NOTHING`,
      [profileId]
    );
    return getDefaultProfile(profileId);
  }

  const row = result.rows[0];
  const productivityPatterns = parseJsonbWithDefault<Record<string, unknown>>(row.productivity_patterns, {});
  return {
    id: row.id,
    preferred_categories: parseJsonbWithDefault<Record<string, number>>(row.preferred_categories, {}),
    preferred_types: parseJsonbWithDefault<Record<string, number>>(row.preferred_types, {}),
    topic_interests: parseJsonbWithDefault<Record<string, number>>(row.topic_interests, {}),
    active_hours: parseJsonbWithDefault<Record<string, number>>(row.active_hours, {}),
    productivity_patterns: productivityPatterns as Record<string, unknown>,
    total_ideas: row.total_ideas,
    total_meetings: row.total_meetings,
    avg_ideas_per_day: row.avg_ideas_per_day,
    priority_keywords: parseJsonbWithDefault<{ high: string[]; medium: string[]; low: string[] }>(row.priority_keywords, { high: [], medium: [], low: [] }),
    auto_priority_enabled: row.auto_priority_enabled,
    thinking_patterns: parseJsonb<ThinkingPatterns>(row.thinking_patterns) ?? undefined,
    language_style: parseJsonb<LanguageStyle>(row.language_style) ?? undefined,
    learning_confidence: (productivityPatterns as { learning_confidence?: number })?.learning_confidence || 0,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/**
 * Get the user profile with context-aware schema (for /api/:context/profile routes)
 * Uses queryContext to query the correct schema (personal/work)
 */
export async function getUserProfileWithContext(
  context: AIContext,
  profileId: string = 'default'
): Promise<UserProfile> {
  // SECURITY: Explicit column selection instead of SELECT *
  const result = await queryContext(
    context,
    `SELECT id, preferred_categories, preferred_types, topic_interests, active_hours,
            productivity_patterns, total_ideas, total_meetings, avg_ideas_per_day,
            priority_keywords, auto_priority_enabled, thinking_patterns, language_style,
            created_at, updated_at
     FROM user_profile WHERE id = $1`,
    [profileId]
  );

  if (result.rows.length === 0) {
    // Create default profile if it doesn't exist
    await queryContext(
      context,
      `INSERT INTO user_profile (id) VALUES ($1) ON CONFLICT (id) DO NOTHING`,
      [profileId]
    );
    return getDefaultProfile(profileId);
  }

  const row = result.rows[0];
  const productivityPatterns = parseJsonbWithDefault<Record<string, unknown>>(row.productivity_patterns, {});
  return {
    id: row.id,
    preferred_categories: parseJsonbWithDefault<Record<string, number>>(row.preferred_categories, {}),
    preferred_types: parseJsonbWithDefault<Record<string, number>>(row.preferred_types, {}),
    topic_interests: parseJsonbWithDefault<Record<string, number>>(row.topic_interests, {}),
    active_hours: parseJsonbWithDefault<Record<string, number>>(row.active_hours, {}),
    productivity_patterns: productivityPatterns as Record<string, unknown>,
    total_ideas: row.total_ideas,
    total_meetings: row.total_meetings,
    avg_ideas_per_day: row.avg_ideas_per_day,
    priority_keywords: parseJsonbWithDefault<{ high: string[]; medium: string[]; low: string[] }>(row.priority_keywords, { high: [], medium: [], low: [] }),
    auto_priority_enabled: row.auto_priority_enabled,
    thinking_patterns: parseJsonb<ThinkingPatterns>(row.thinking_patterns) ?? undefined,
    language_style: parseJsonb<LanguageStyle>(row.language_style) ?? undefined,
    learning_confidence: (productivityPatterns as { learning_confidence?: number })?.learning_confidence || 0,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/**
 * Get personalized recommendations with context-aware schema
 */
export async function getRecommendationsWithContext(
  context: AIContext,
  profileId: string = 'default'
): Promise<{
  suggested_topics: string[];
  optimal_hours: number[];
  focus_categories: string[];
  insights: string[];
}> {
  const profile = await getUserProfileWithContext(context, profileId);

  // Get top topics
  const topTopics = Object.entries(profile.topic_interests)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([topic]) => topic);

  // Get most active hours
  const activeHours = Object.entries(profile.active_hours)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([hour]) => parseInt(hour));

  // Get focus categories
  const focusCategories = Object.entries(profile.preferred_categories)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([cat]) => cat);

  // Generate insights
  const insights: string[] = [];

  if (profile.avg_ideas_per_day > 5) {
    insights.push('Du bist sehr produktiv! Durchschnittlich ' + profile.avg_ideas_per_day.toFixed(1) + ' Ideen pro Tag.');
  }

  if (activeHours.length > 0) {
    const hourStr = activeHours.map((h) => `${h}:00`).join(', ');
    insights.push(`Deine produktivsten Stunden sind: ${hourStr}`);
  }

  if (focusCategories.length > 0) {
    insights.push(`Dein Fokus liegt auf: ${focusCategories.join(', ')}`);
  }

  return {
    suggested_topics: topTopics,
    optimal_hours: activeHours,
    focus_categories: focusCategories,
    insights,
  };
}

/**
 * Recalculate profile statistics with context-aware schema
 */
export async function recalculateStatsWithContext(
  context: AIContext,
  profileId: string = 'default'
): Promise<void> {
  // Count total ideas (excluding archived)
  const ideasCount = await queryContext(context, 'SELECT COUNT(*) FROM ideas WHERE is_archived = false');

  // Count total meetings
  const meetingsCount = await queryContext(context, 'SELECT COUNT(*) FROM meetings');

  // Calculate average ideas per day
  const avgResult = await queryContext(context, `
    SELECT AVG(daily_count) as avg_per_day FROM (
      SELECT DATE(created_at) as day, COUNT(*) as daily_count
      FROM ideas
      GROUP BY DATE(created_at)
    ) daily
  `);

  await queryContext(
    context,
    `UPDATE user_profile
     SET total_ideas = $2,
         total_meetings = $3,
         avg_ideas_per_day = $4,
         updated_at = NOW()
     WHERE id = $1`,
    [
      profileId,
      parseInt(ideasCount.rows[0].count),
      parseInt(meetingsCount.rows[0].count),
      parseFloat(avgResult.rows[0].avg_per_day) || 0,
    ]
  );
}

/**
 * Toggle auto-priority feature with context-aware schema
 */
export async function setAutoPriorityWithContext(
  context: AIContext,
  enabled: boolean,
  profileId: string = 'default'
): Promise<void> {
  await queryContext(
    context,
    `UPDATE user_profile SET auto_priority_enabled = $2, updated_at = NOW() WHERE id = $1`,
    [profileId, enabled]
  );
}

/**
 * Track a user interaction
 */
export async function trackInteraction(event: InteractionEvent): Promise<void> {
  await query(
    `INSERT INTO user_interactions (idea_id, meeting_id, interaction_type, metadata)
     VALUES ($1, $2, $3, $4)`,
    [event.idea_id || null, event.meeting_id || null, event.interaction_type, JSON.stringify(event.metadata || {})]
  );

  // Trigger profile learning in background
  updateProfileFromInteraction(event).catch(err =>
    logger.error('Profile update from interaction failed', err instanceof Error ? err : undefined)
  );
}

/**
 * Update profile based on an interaction
 */
async function updateProfileFromInteraction(event: InteractionEvent): Promise<void> {
  const profileId = 'default';

  if (event.idea_id) {
    // Get idea details
    const ideaResult = await query(
      'SELECT type, category, priority, keywords, created_at FROM ideas WHERE id = $1',
      [event.idea_id]
    );

    if (ideaResult.rows.length > 0) {
      const idea = ideaResult.rows[0];

      // Update category preference
      await incrementPreference(profileId, 'preferred_categories', idea.category);

      // Update type preference
      await incrementPreference(profileId, 'preferred_types', idea.type);

      // Update topic interests based on keywords
      // PERFORMANCE FIX: Batch update instead of N+1 queries
      const keywords = parseJsonbWithDefault<string[]>(idea.keywords, []);
      if (keywords.length > 0) {
        await batchIncrementTopicInterests(profileId, keywords);
      }

      // Track active hours
      const hour = new Date(idea.created_at).getHours();
      await incrementPreference(profileId, 'active_hours', hour.toString());

      // Learn priority keywords
      const newPriority = event.metadata?.new_priority;
      if (event.interaction_type === 'prioritize' && newPriority && (newPriority === 'high' || newPriority === 'medium' || newPriority === 'low')) {
        await learnPriorityKeywords(profileId, keywords, newPriority);
      }
    }
  }
}

/**
 * Increment a preference counter
 */
async function incrementPreference(
  profileId: string,
  field: string,
  key: string
): Promise<void> {
  await query(
    `UPDATE user_profile
     SET ${field} = jsonb_set(
       COALESCE(${field}, '{}')::jsonb,
       $2,
       (COALESCE((${field}->$3)::int, 0) + 1)::text::jsonb
     ),
     updated_at = NOW()
     WHERE id = $1`,
    [profileId, `{${key}}`, key]
  );
}

/**
 * Increment topic interest (single topic)
 */
async function _incrementTopicInterest(profileId: string, topic: string): Promise<void> {
  const normalizedTopic = topic.toLowerCase().trim();
  await query(
    `UPDATE user_profile
     SET topic_interests = jsonb_set(
       COALESCE(topic_interests, '{}')::jsonb,
       $2,
       (COALESCE((topic_interests->$3)::int, 0) + 1)::text::jsonb
     ),
     updated_at = NOW()
     WHERE id = $1`,
    [profileId, `{${normalizedTopic}}`, normalizedTopic]
  );
}

/**
 * Batch increment topic interests
 * PERFORMANCE FIX: Single query instead of N queries for N keywords
 */
async function batchIncrementTopicInterests(profileId: string, topics: string[]): Promise<void> {
  if (topics.length === 0) {
    return;
  }

  // Normalize all topics
  const normalizedTopics = topics.map(t => t.toLowerCase().trim()).filter(t => t.length > 0);
  if (normalizedTopics.length === 0) {
    return;
  }

  // Build a single UPDATE query that increments all topics at once
  // Using jsonb_object_agg to merge all increments in one operation
  const topicUpdates = normalizedTopics.map(topic => `'${topic.replace(/'/g, "''")}', 1`).join(', ');

  await query(
    `UPDATE user_profile
     SET topic_interests = (
       SELECT jsonb_object_agg(
         key,
         COALESCE((topic_interests->>key)::int, 0) + COALESCE((new_values->>key)::int, 0)
       )
       FROM (
         SELECT key FROM jsonb_object_keys(COALESCE(topic_interests, '{}')) AS key
         UNION
         SELECT key FROM jsonb_object_keys(jsonb_build_object(${topicUpdates})) AS key
       ) AS keys,
       LATERAL (SELECT jsonb_build_object(${topicUpdates}) AS new_values) nv
     ),
     updated_at = NOW()
     WHERE id = $1`,
    [profileId]
  );
}

/**
 * Learn priority keywords from user behavior
 */
async function learnPriorityKeywords(
  profileId: string,
  keywords: string[],
  priority: 'high' | 'medium' | 'low'
): Promise<void> {
  const profileResult = await query(
    'SELECT priority_keywords FROM user_profile WHERE id = $1',
    [profileId]
  );

  if (profileResult.rows.length === 0) {return;}

  const priorityKeywords = parseJsonbWithDefault<{ high: string[]; medium: string[]; low: string[] }>(
    profileResult.rows[0].priority_keywords,
    { high: [], medium: [], low: [] }
  );

  // Add keywords to the appropriate priority list (limit to 50 per category)
  for (const keyword of keywords) {
    const normalized = keyword.toLowerCase().trim();
    if (!priorityKeywords[priority].includes(normalized)) {
      priorityKeywords[priority].push(normalized);
      if (priorityKeywords[priority].length > 50) {
        priorityKeywords[priority].shift(); // Remove oldest
      }
    }
  }

  await query(
    `UPDATE user_profile SET priority_keywords = $2, updated_at = NOW() WHERE id = $1`,
    [profileId, JSON.stringify(priorityKeywords)]
  );
}

/**
 * Suggest priority based on learned keywords
 */
export async function suggestPriority(
  keywords: string[],
  profileId: string = 'default'
): Promise<'high' | 'medium' | 'low' | null> {
  const profile = await getUserProfile(profileId);

  if (!profile.auto_priority_enabled) {
    return null;
  }

  const normalizedKeywords = keywords.map((k) => k.toLowerCase().trim());

  // Check for matches in priority keywords
  let highMatches = 0;
  let mediumMatches = 0;
  let lowMatches = 0;

  for (const keyword of normalizedKeywords) {
    if (profile.priority_keywords.high.includes(keyword)) {highMatches++;}
    if (profile.priority_keywords.medium.includes(keyword)) {mediumMatches++;}
    if (profile.priority_keywords.low.includes(keyword)) {lowMatches++;}
  }

  if (highMatches > mediumMatches && highMatches > lowMatches) {return 'high';}
  if (mediumMatches > highMatches && mediumMatches > lowMatches) {return 'medium';}
  if (lowMatches > 0) {return 'low';}

  return null;
}

/**
 * Get personalized recommendations based on profile
 */
export async function getRecommendations(profileId: string = 'default'): Promise<{
  suggested_topics: string[];
  optimal_hours: number[];
  focus_categories: string[];
  insights: string[];
}> {
  const profile = await getUserProfile(profileId);

  // Get top topics
  const topTopics = Object.entries(profile.topic_interests)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([topic]) => topic);

  // Get most active hours
  const activeHours = Object.entries(profile.active_hours)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([hour]) => parseInt(hour));

  // Get focus categories
  const focusCategories = Object.entries(profile.preferred_categories)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([cat]) => cat);

  // Generate insights
  const insights: string[] = [];

  if (profile.avg_ideas_per_day > 5) {
    insights.push('Du bist sehr produktiv! Durchschnittlich ' + profile.avg_ideas_per_day.toFixed(1) + ' Ideen pro Tag.');
  }

  if (activeHours.length > 0) {
    const hourStr = activeHours.map((h) => `${h}:00`).join(', ');
    insights.push(`Deine produktivsten Stunden sind: ${hourStr}`);
  }

  if (focusCategories.length > 0) {
    insights.push(`Dein Fokus liegt auf: ${focusCategories.join(', ')}`);
  }

  return {
    suggested_topics: topTopics,
    optimal_hours: activeHours,
    focus_categories: focusCategories,
    insights,
  };
}

/**
 * Update user interest embedding based on recent ideas
 */
export async function updateInterestEmbedding(profileId: string = 'default', context?: AIContext): Promise<void> {
  // Get recent ideas to build interest profile (excluding archived)
  const recentIdeas = context
    ? await queryContext(context, `SELECT title, summary, keywords FROM ideas
       WHERE is_archived = false
       ORDER BY created_at DESC
       LIMIT 50`)
    : await query(
      `SELECT title, summary, keywords FROM ideas
       WHERE is_archived = false
       ORDER BY created_at DESC
       LIMIT 50`
    );

  if (recentIdeas.rows.length === 0) {return;}

  // Combine recent content into interest description
  const interestText = recentIdeas.rows
    .map((row) => {
      const keywords = parseJsonbWithDefault<string[]>(row.keywords, []).join(', ');
      return `${row.title}. ${row.summary || ''}. Keywords: ${keywords}`;
    })
    .join('\n');

  const embedding = await generateEmbedding(interestText);

  if (embedding.length > 0) {
    await query(
      `UPDATE user_profile
       SET interest_embedding = $2, updated_at = NOW()
       WHERE id = $1`,
      [profileId, formatForPgVector(embedding)]
    );
  }
}

/**
 * Get ideas that match user interests
 */
/** Personalized idea from database */
interface PersonalizedIdea {
  id: string;
  title: string;
  summary: string | null;
  type: string;
  category: string;
  priority: string;
  keywords: string[] | string;
  raw_transcript: string | null;
  embedding: string | null;
  context: string;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
  distance?: number;
}

export async function getPersonalizedIdeas(
  limit: number = 10,
  profileId: string = 'default'
): Promise<PersonalizedIdea[]> {
  const profileResult = await query(
    'SELECT interest_embedding FROM user_profile WHERE id = $1',
    [profileId]
  );

  if (profileResult.rows.length === 0 || !profileResult.rows[0].interest_embedding) {
    // Fall back to recent ideas (excluding archived)
    const result = await query(
      `SELECT * FROM ideas WHERE is_archived = false ORDER BY created_at DESC LIMIT $1`,
      [limit]
    );
    return result.rows;
  }

  // Find ideas similar to user interests (excluding archived)
  const result = await query(
    `SELECT *, embedding <-> $1 as distance
     FROM ideas
     WHERE embedding IS NOT NULL AND is_archived = false
     ORDER BY distance
     LIMIT $2`,
    [profileResult.rows[0].interest_embedding, limit]
  );

  return result.rows;
}

/**
 * Recalculate profile statistics
 */
export async function recalculateStats(profileId: string = 'default'): Promise<void> {
  // Count total ideas (excluding archived)
  const ideasCount = await query('SELECT COUNT(*) FROM ideas WHERE is_archived = false');

  // Count total meetings
  const meetingsCount = await query('SELECT COUNT(*) FROM meetings');

  // Calculate average ideas per day
  const avgResult = await query(`
    SELECT AVG(daily_count) as avg_per_day FROM (
      SELECT DATE(created_at) as day, COUNT(*) as daily_count
      FROM ideas
      GROUP BY DATE(created_at)
    ) daily
  `);

  await query(
    `UPDATE user_profile
     SET total_ideas = $2,
         total_meetings = $3,
         avg_ideas_per_day = $4,
         updated_at = NOW()
     WHERE id = $1`,
    [
      profileId,
      parseInt(ideasCount.rows[0].count),
      parseInt(meetingsCount.rows[0].count),
      parseFloat(avgResult.rows[0].avg_per_day) || 0,
    ]
  );
}

/**
 * Toggle auto-priority feature
 */
export async function setAutoPriority(
  enabled: boolean,
  profileId: string = 'default'
): Promise<void> {
  await query(
    `UPDATE user_profile SET auto_priority_enabled = $2, updated_at = NOW() WHERE id = $1`,
    [profileId, enabled]
  );
}

// Helper functions
function getDefaultProfile(id: string): UserProfile {
  return {
    id,
    preferred_categories: {},
    preferred_types: {},
    topic_interests: {},
    active_hours: {},
    productivity_patterns: {},
    total_ideas: 0,
    total_meetings: 0,
    avg_ideas_per_day: 0,
    priority_keywords: { high: [], medium: [], low: [] },
    auto_priority_enabled: false,
    thinking_patterns: undefined,
    language_style: undefined,
    learning_confidence: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

// parseJsonb imported from ../types - centralized implementation
