/**
 * Database Row Type Definitions
 *
 * Type-safe interfaces for PostgreSQL query results.
 * These types match the column names returned by queries (snake_case).
 *
 * @module types/database-rows
 */

// ===========================================
// Core Entity Rows
// ===========================================

/** Idea table row */
export interface IdeaRow {
  id: string;
  user_id: string;
  title: string;
  summary: string | null;
  raw_transcript: string;
  type: 'idea' | 'task' | 'note' | 'question' | 'reminder' | 'observation' | 'decision';
  category: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  tags: string[];
  next_steps: string[] | null;
  status: 'active' | 'archived' | 'completed' | 'discarded';
  archived_at: Date | null;
  is_starred: boolean;
  starred_at: Date | null;
  context: string;
  created_at: Date;
  updated_at: Date;
  embedding: string | null;
  topic_id: string | null;
  ai_confidence: number | null;
  ai_enriched_at: Date | null;
}

/** Media item table row */
export interface MediaItemRow {
  id: string;
  user_id: string;
  idea_id: string | null;
  type: 'image' | 'video' | 'audio' | 'document';
  filename: string;
  original_filename: string;
  mime_type: string;
  size_bytes: number;
  storage_path: string;
  thumbnail_path: string | null;
  metadata: Record<string, unknown> | null;
  context: string;
  created_at: Date;
  updated_at: Date;
}

/** Meeting table row */
export interface MeetingRow {
  id: string;
  user_id: string;
  title: string;
  date: Date;
  meeting_type: 'internal' | 'external' | 'one_on_one' | 'standup' | 'workshop' | 'presentation';
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  participants: string[];
  location: string | null;
  company_id: string | null;
  context: string;
  notes: string | null;
  action_items: string[] | null;
  created_at: Date;
  updated_at: Date;
}

/** Company table row */
export interface CompanyRow {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  settings: Record<string, unknown> | null;
  context: string;
  created_at: Date;
  updated_at: Date;
}

// ===========================================
// Draft Generation Rows
// ===========================================

/** Draft table row */
export interface DraftRow {
  id: string;
  idea_id: string;
  draft_type: 'email' | 'article' | 'proposal' | 'document' | 'generic';
  trigger_pattern: string | null;
  content: string;
  word_count: number;
  status: 'generating' | 'ready' | 'error';
  generation_time_ms: number;
  related_idea_ids: string[];
  context: string;
  created_at: Date;
  updated_at: Date;
}

/** Draft feedback aggregation row */
export interface DraftFeedbackAggregateRow {
  draft_type: string;
  total_drafts: string;
  total_feedback: string;
  avg_rating: string | null;
  avg_content_reused: string | null;
}

/** Pattern effectiveness row */
export interface PatternEffectivenessRow {
  pattern_id: string;
  pattern_text: string;
  draft_type: string;
  is_active: boolean;
  times_triggered: string;
  times_used: string;
  avg_rating: string | null;
}

/** Draft with stats row */
export interface DraftWithStatsRow extends DraftRow {
  feedback_count: string;
  avg_rating: string | null;
  was_used: boolean;
}

// ===========================================
// Analytics Rows
// ===========================================

/** Learning curve metrics row */
export interface LearningCurveRow {
  date: string;
  accuracy_score: string;
  correction_rate: string;
  confidence_level: string;
  sample_size: string;
}

/** Domain strength row */
export interface DomainStrengthRow {
  category: string;
  strength: string;
  total: string;
}

/** Satisfaction metric row */
export interface SatisfactionMetricRow {
  date: string;
  avg_rating: string;
  feedback_count: string;
  positive_ratio: string;
}

/** Proactive effectiveness row */
export interface ProactiveEffectivenessRow {
  suggestion_type: string;
  acceptance_rate: string;
  total_suggestions: string;
  avg_response_time: string | null;
}

/** Category performance row */
export interface CategoryPerformanceRow {
  category: string;
  accuracy: string;
  count: string;
  positive_ratio: string;
}

/** Time series metric row */
export interface TimeSeriesMetricRow {
  date: string;
  value: string;
  metric_type: string;
}

// ===========================================
// Memory System Rows
// ===========================================

/** Episodic memory row */
export interface EpisodeRow {
  id: string;
  context: string;
  session_id: string | null;
  created_at: Date;
  trigger: string;
  response: string;
  emotional_valence: string;
  emotional_arousal: string;
  time_of_day: string;
  day_of_week: string;
  is_weekend: boolean;
  linked_episodes: string[];
  linked_facts: string[];
  retrieval_count: number;
  last_retrieved: Date | null;
  retrieval_strength: string;
  embedding: string | number[];
}

/** Similar episode row (with similarity score) */
export interface SimilarEpisodeRow {
  id: string;
  similarity: string;
}

/** Long-term fact row */
export interface FactRow {
  id: string;
  context: string;
  fact_type: string;
  subject: string;
  predicate: string;
  object: string;
  confidence: string;
  source_episodes: string[];
  first_learned: Date;
  last_reinforced: Date;
  reinforcement_count: number;
  embedding: string | number[];
}

/** Long-term pattern row */
export interface PatternRow {
  id: string;
  context: string;
  pattern_type: string;
  description: string;
  triggers: string[];
  typical_responses: string[];
  confidence: string;
  occurrence_count: number;
  temporal_pattern: Record<string, unknown> | null;
  first_observed: Date;
  last_observed: Date;
}

// ===========================================
// Device & Notification Rows
// ===========================================

/** Device token row */
export interface DeviceTokenRow {
  id: string;
  user_id: string;
  device_token: string;
  device_id: string;
  device_name: string | null;
  device_model: string | null;
  os_version: string | null;
  app_version: string | null;
  context: string;
  is_active: boolean;
  last_used_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

/** Notification preferences row */
export interface NotificationPreferencesRow {
  id: string;
  user_id: string;
  device_id: string;
  draft_ready: boolean;
  draft_feedback_reminder: boolean;
  idea_connections: boolean;
  learning_suggestions: boolean;
  weekly_summary: boolean;
  quiet_hours_enabled: boolean;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  timezone: string;
  max_notifications_per_hour: number;
  max_notifications_per_day: number;
  context: string;
  created_at: Date;
  updated_at: Date;
}

// ===========================================
// Session & Interaction Rows
// ===========================================

/** Chat session row */
export interface ChatSessionRow {
  id: string;
  user_id: string;
  context: string;
  title: string | null;
  message_count: number;
  created_at: Date;
  updated_at: Date;
}

/** Chat message row */
export interface ChatMessageRow {
  id: string;
  session_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  has_images: boolean;
  thinking_content: string | null;
  tool_calls: Record<string, unknown>[] | null;
  created_at: Date;
}

/** Learning session row */
export interface LearningSessionRow {
  id: string;
  user_id: string;
  context: string;
  started_at: Date;
  ended_at: Date | null;
  ideas_processed: number;
  corrections_made: number;
  is_active: boolean;
}

/** Interaction session row */
export interface InteractionSessionRow {
  id: string;
  user_id: string;
  context: string;
  session_type: string;
  started_at: Date;
  ended_at: Date | null;
  interaction_count: number;
  metadata: Record<string, unknown> | null;
}

// ===========================================
// Automation Rows
// ===========================================

/** Automation rule row */
export interface AutomationRow {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  trigger_type: 'webhook' | 'schedule' | 'event' | 'manual' | 'pattern';
  trigger_config: Record<string, unknown>;
  action_type: string;
  action_config: Record<string, unknown>;
  is_active: boolean;
  context: string;
  execution_count: number;
  last_executed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

/** Automation suggestion row */
export interface AutomationSuggestionRow {
  id: string;
  user_id: string;
  suggestion_type: string;
  title: string;
  description: string;
  trigger_config: Record<string, unknown>;
  action_config: Record<string, unknown>;
  confidence: string;
  status: 'pending' | 'accepted' | 'dismissed';
  context: string;
  created_at: Date;
}

// ===========================================
// Learning Engine Rows
// ===========================================

/** User learning profile row */
export interface LearningProfileRow {
  id: string;
  user_id: string;
  context: string;
  preferred_categories: Record<string, number>;
  preferred_types: Record<string, number>;
  priority_keywords: Record<string, string[]>;
  topic_interests: Record<string, number>;
  thinking_patterns: Record<string, unknown>;
  language_style: Record<string, unknown>;
  topic_chains: string[][];
  interest_embedding: string | number[] | null;
  confidence_score: string;
  total_ideas_processed: number;
  total_corrections: number;
  created_at: Date;
  updated_at: Date;
}

/** Learning task row */
export interface LearningTaskRow {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  category: string;
  status: 'not_started' | 'in_progress' | 'completed' | 'archived';
  priority: 'low' | 'medium' | 'high';
  target_hours: number;
  completed_hours: number;
  outline: string[] | null;
  resources: string[];
  notes: string | null;
  due_date: Date | null;
  context: string;
  created_at: Date;
  updated_at: Date;
}

// ===========================================
// Research & Insights Rows
// ===========================================

/** Research item row */
export interface ResearchRow {
  id: string;
  user_id: string;
  domain: string;
  topic: string;
  teaser_title: string | null;
  teaser_text: string | null;
  full_content: string | null;
  sources: string[];
  status: 'pending' | 'generating' | 'ready' | 'viewed' | 'dismissed';
  context: string;
  created_at: Date;
  updated_at: Date;
}

/** Learning insight row */
export interface LearningInsightRow {
  id: string;
  user_id: string;
  insight_type: string;
  title: string;
  description: string;
  data: Record<string, unknown>;
  is_acknowledged: boolean;
  context: string;
  created_at: Date;
}

// ===========================================
// Topic Enhancement Rows
// ===========================================

/** Topic row */
export interface TopicRow {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  keywords: string[];
  embedding: string | number[] | null;
  idea_count: number;
  context: string;
  created_at: Date;
  updated_at: Date;
}

/** Topic with quality metrics row */
export interface TopicWithQualityRow extends TopicRow {
  coherence_score: string;
  separation_score: string;
  density_score: string;
  stability_score: string;
}

// ===========================================
// Incubator Rows
// ===========================================

/** Loose thought row */
export interface LooseThoughtRow {
  id: string;
  user_id: string;
  raw_input: string;
  embedding: string | number[];
  cluster_id: string | null;
  is_processed: boolean;
  context: string;
  created_at: Date;
}

/** Thought cluster row */
export interface ThoughtClusterRow {
  id: string;
  user_id: string;
  title: string | null;
  summary: string | null;
  suggested_type: string | null;
  suggested_category: string | null;
  maturity_score: string;
  thought_count: number;
  centroid_embedding: string | number[] | null;
  context: string;
  created_at: Date;
  updated_at: Date;
}

// ===========================================
// Feedback Rows
// ===========================================

/** AI feedback row */
export interface AIFeedbackRow {
  id: string;
  user_id: string;
  entity_type: 'idea' | 'draft' | 'suggestion' | 'search' | 'general';
  entity_id: string | null;
  feedback_type: 'rating' | 'correction' | 'preference' | 'explicit';
  rating: number | null;
  original_value: string | null;
  corrected_value: string | null;
  field_name: string | null;
  comment: string | null;
  context: string;
  created_at: Date;
}

/** Interaction feedback row */
export interface InteractionFeedbackRow {
  id: string;
  user_id: string;
  entity_type: string;
  entity_id: string;
  is_positive: boolean;
  context: string;
  created_at: Date;
}

// ===========================================
// Aggregate Count Rows
// ===========================================

/** Simple count row */
export interface CountRow {
  count: string;
}

/** Grouped count row */
export interface GroupedCountRow {
  group_key: string;
  count: string;
}

/** Stats summary row */
export interface StatsSummaryRow {
  total: string;
  today: string;
  this_week: string;
  high_priority: string;
  archived: string;
}

// ===========================================
// Type Guards & Utilities
// ===========================================

import { NotFoundError } from '../middleware/errorHandler';

/**
 * Safely parse numeric string from DB to number
 */
export function parseDbNumber(value: string | null | undefined, defaultValue = 0): number {
  if (value === null || value === undefined) {return defaultValue;}
  const parsed = parseFloat(value);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Safely parse integer string from DB to number
 */
export function parseDbInt(value: string | null | undefined, defaultValue = 0): number {
  if (value === null || value === undefined) {return defaultValue;}
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Type guard for checking if result has rows
 */
export function hasRows<T>(result: { rows: T[] }): result is { rows: [T, ...T[]] } {
  return result.rows.length > 0;
}

/**
 * Get first row or throw NotFoundError
 * Use this for queries where not finding a row is an error condition.
 *
 * @example
 * const result = await query('SELECT * FROM ideas WHERE id = $1', [id]);
 * const idea = getFirstRowOrThrow(result, 'Idea');
 */
export function getFirstRowOrThrow<T>(result: { rows: T[] }, entityName = 'Record'): T {
  if (result.rows.length === 0) {
    throw new NotFoundError(entityName);
  }
  return result.rows[0];
}

/**
 * Get first row or return null
 * Use this for queries where not finding a row is expected behavior.
 *
 * @example
 * const result = await query('SELECT * FROM profiles WHERE user_id = $1', [userId]);
 * const profile = getFirstRowOrNull(result);
 * if (!profile) {
 *   // Create new profile...
 * }
 */
export function getFirstRowOrNull<T>(result: { rows: T[] }): T | null {
  return result.rows.length > 0 ? result.rows[0] : null;
}

/**
 * Get first row or return default value
 * Use this when you need a guaranteed value.
 *
 * @example
 * const result = await query('SELECT count(*) FROM ideas WHERE user_id = $1', [userId]);
 * const { count } = getFirstRowOrDefault(result, { count: '0' });
 */
export function getFirstRowOrDefault<T>(result: { rows: T[] }, defaultValue: T): T {
  return result.rows.length > 0 ? result.rows[0] : defaultValue;
}

/**
 * Map rows with type safety
 * Replacement for `.rows.map((row: any) => ...)`
 *
 * @example
 * const ideas = mapRows(result, (row: IdeaRow) => rowToIdea(row));
 */
export function mapRows<T, R>(result: { rows: T[] }, mapper: (row: T) => R): R[] {
  return result.rows.map(mapper);
}
