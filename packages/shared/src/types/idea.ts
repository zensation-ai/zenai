/**
 * Core Idea types shared across frontend and backend
 */

export type IdeaType = 'idea' | 'task' | 'insight' | 'problem' | 'question';
export type IdeaCategory = 'business' | 'technical' | 'personal' | 'learning';
export type IdeaPriority = 'low' | 'medium' | 'high';
export type IdeaStatus = 'draft' | 'active' | 'completed' | 'archived';

export interface StructuredIdea {
  id: string;
  title: string;
  type: IdeaType;
  category: IdeaCategory;
  priority: IdeaPriority;
  status?: IdeaStatus;
  summary: string;
  next_steps: string[];
  context_needed: string[];
  keywords: string[];
  raw_transcript?: string;
  is_favorite?: boolean;
  created_at: string;
  updated_at?: string;
  similarity?: number;
}
