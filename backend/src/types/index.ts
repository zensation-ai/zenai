/**
 * Central type definitions for the Personal AI Brain Backend
 *
 * This file provides consistent types across all routes and services.
 */

// ============================================
// Context Types
// ============================================

export type AIContext = 'personal' | 'work';

export const VALID_CONTEXTS: AIContext[] = ['personal', 'work'];

export function isValidContext(context: string): context is AIContext {
  return VALID_CONTEXTS.includes(context as AIContext);
}

// ============================================
// Idea Types
// ============================================

export type IdeaType = 'idea' | 'task' | 'insight' | 'problem' | 'question';
export type IdeaCategory = 'business' | 'technical' | 'personal' | 'learning';
export type Priority = 'low' | 'medium' | 'high';

export interface Idea {
  id: string;
  title: string;
  type: IdeaType;
  category: IdeaCategory;
  priority: Priority;
  summary: string | null;
  next_steps: string[] | null;
  context_needed: string[] | null;
  keywords: string[] | null;
  raw_transcript: string | null;
  context: AIContext;
  embedding: number[] | null;
  created_at: Date;
  updated_at: Date;
  is_archived: boolean;
  viewed_count: number;
}

// ============================================
// Training Types
// ============================================

export type TrainingType = 'category' | 'priority' | 'type' | 'tone' | 'general';

export type ToneFeedback =
  | 'more_personal'
  | 'more_professional'
  | 'more_concise'
  | 'more_detailed'
  | 'more_encouraging'
  | 'more_neutral';

export interface TrainingItem {
  id: string;
  idea_id: string | null;
  context: AIContext;
  training_type: TrainingType;
  original_value: string | null;
  corrected_value: string | null;
  corrected_category: IdeaCategory | null;
  corrected_priority: Priority | null;
  corrected_type: IdeaType | null;
  tone_feedback: ToneFeedback | null;
  feedback: string | null;
  weight: number;
  applied: boolean;
  created_at: Date;
  updated_at: Date;
}

export const TRAINING_WEIGHTS: Record<TrainingType, number> = {
  category: 8,
  priority: 6,
  type: 7,
  tone: 10,
  general: 5
};

// ============================================
// Media Types
// ============================================

export type MediaType = 'photo' | 'video';

export interface MediaItem {
  id: string;
  media_type: MediaType;
  filename: string;
  file_path: string;
  mime_type: string;
  file_size: number;
  caption: string | null;
  context: AIContext;
  embedding: number[] | null;
  thumbnail_path: string | null;
  duration_seconds: number | null;
  duration: number | null;
  width: number | null;
  height: number | null;
  ocr_text: string | null;
  ai_description: string | null;
  ai_analysis: Record<string, unknown> | null;
  voice_transcript: string | null;
  voice_file_path: string | null;
  gif_preview_path: string | null;
  created_at: Date;
  updated_at: Date;
}

// ============================================
// Voice Memo Types
// ============================================

export interface VoiceMemo {
  id: string;
  raw_text: string;
  context: AIContext;
  embedding: number[] | null;
  created_at: Date;
  updated_at: Date;
}

// ============================================
// Story Types
// ============================================

export type StoryItemType = 'idea' | 'media' | 'voice_memo';

export interface StoryItem {
  id: string;
  type: StoryItemType;
  content: string;
  media_url: string | null;
  timestamp: Date;
}

export interface Story {
  id: string;
  title: string;
  description: string;
  items: StoryItem[];
  created_at: Date;
  updated_at: Date;
  item_count: number;
}

// ============================================
// Meeting Types
// ============================================

export type MeetingType = 'internal' | 'external' | 'one_on_one' | 'team' | 'client';
export type MeetingStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled';

export interface Meeting {
  id: string;
  title: string;
  date: Date;
  meeting_type: MeetingType;
  status: MeetingStatus;
  participants: string[];
  location: string | null;
  company_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface MeetingNotes {
  id: string;
  meeting_id: string;
  raw_transcript: string;
  summary: string | null;
  action_items: ActionItem[];
  decisions: string[];
  key_points: string[];
  embedding: number[] | null;
  created_at: Date;
  updated_at: Date;
}

export interface ActionItem {
  id: string;
  text: string;
  assignee: string | null;
  due_date: Date | null;
  completed: boolean;
  priority: Priority;
}

// ============================================
// API Response Types
// ============================================

export interface PaginationInfo {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  pagination?: PaginationInfo;
}

export interface ApiErrorResponse {
  success: false;
  error: string;
  code?: string;
  details?: Record<string, unknown>;
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

// ============================================
// Database Row Types (for query results)
// ============================================

export interface IdeaRow {
  id: string;
  title: string;
  type: string;
  category: string;
  priority: string;
  summary: string | null;
  next_steps: string | string[] | null;
  context_needed: string | string[] | null;
  keywords: string | string[] | null;
  raw_transcript: string | null;
  context: string;
  embedding: string | null;
  created_at: Date;
  updated_at: Date;
  is_archived: boolean;
  viewed_count: number;
}

export interface MediaItemRow {
  id: string;
  media_type: string;
  filename: string;
  file_path: string;
  mime_type: string;
  file_size: string; // bigint comes as string
  caption: string | null;
  context: string;
  embedding: string | null;
  thumbnail_path: string | null;
  duration_seconds: number | null;
  duration: number | null;
  width: number | null;
  height: number | null;
  ocr_text: string | null;
  ai_description: string | null;
  ai_analysis: Record<string, unknown> | null;
  voice_transcript: string | null;
  voice_file_path: string | null;
  gif_preview_path: string | null;
  created_at: Date;
  updated_at: Date;
}

// ============================================
// Utility Types
// ============================================

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type WithTimestamps<T> = T & {
  created_at: Date;
  updated_at: Date;
};

// ============================================
// Helper Functions
// ============================================

/**
 * Safely parse JSONB fields from database
 */
export function parseJsonb<T>(value: unknown): T | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  }
  return value as T;
}

/**
 * Convert database row to Idea
 */
export function rowToIdea(row: IdeaRow): Idea {
  return {
    id: row.id,
    title: row.title,
    type: row.type as IdeaType,
    category: row.category as IdeaCategory,
    priority: row.priority as Priority,
    summary: row.summary,
    next_steps: parseJsonb<string[]>(row.next_steps),
    context_needed: parseJsonb<string[]>(row.context_needed),
    keywords: parseJsonb<string[]>(row.keywords),
    raw_transcript: row.raw_transcript,
    context: row.context as AIContext,
    embedding: row.embedding ? JSON.parse(row.embedding) : null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    is_archived: row.is_archived,
    viewed_count: row.viewed_count
  };
}
