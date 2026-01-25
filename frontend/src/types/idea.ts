/**
 * Core type definitions for Ideas
 *
 * Centralized types for better maintainability and type safety
 */

export type IdeaType = 'idea' | 'task' | 'insight' | 'problem' | 'question';
export type IdeaCategory = 'business' | 'technical' | 'personal' | 'learning';
export type IdeaPriority = 'low' | 'medium' | 'high';

export interface StructuredIdea {
  id: string;
  title: string;
  type: IdeaType;
  category: IdeaCategory;
  priority: IdeaPriority;
  summary: string;
  next_steps: string[];
  context_needed: string[];
  keywords: string[];
  raw_transcript?: string;
  created_at: string;
  updated_at?: string;
  similarity?: number;
}

export interface ApiStatus {
  database: boolean;
  ollama: boolean;
  models: string[];
}

// Note: Filters type is defined in SearchFilterBar.tsx to match component requirements

export type Page =
  | 'ideas'
  | 'archive'
  | 'meetings'
  | 'profile'
  | 'integrations'
  | 'incubator'
  | 'knowledge-graph'
  | 'learning'
  | 'analytics'
  | 'automations'
  | 'evolution'
  | 'notifications'
  | 'digest'
  | 'personalization'
  | 'learning-tasks'
  | 'media'
  | 'stories'
  | 'export'
  | 'sync'
  | 'proactive'
  | 'triage'
  | 'dashboard'
  | 'chat';

export type Context = 'personal' | 'work';
