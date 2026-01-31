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

/**
 * Page Types - Konsolidierte Navigation 2026
 *
 * Haupt-Tabs (4):
 * - ideas: Gedanken-Sammlung mit integrierter Sortierung
 * - chat: KI-Gespräche
 * - insights: Dashboard + Analytics + Digest + Graph kombiniert
 * - archive: Archivierte Gedanken
 *
 * Sekundäre Seiten (via "Mehr"-Dropdown):
 * - ai-workshop: KI-Werkstatt (Inkubator + Proaktiv + Evolution kombiniert)
 * - learning: Lernen (mit Lernzielen als Tab)
 * - profile, integrations, automations, etc.
 */
export type Page =
  // Haupt-Navigation (4 Tabs)
  | 'ideas'
  | 'chat'
  | 'insights'
  | 'archive'
  // Sekundäre Seiten
  | 'ai-workshop'
  | 'learning'
  | 'profile'
  | 'meetings'
  | 'media'
  | 'stories'
  | 'automations'
  | 'integrations'
  | 'notifications'
  | 'export'
  | 'sync'
  | 'personalization'
  // Legacy-Seiten (intern weitergeleitet)
  | 'incubator'
  | 'proactive'
  | 'evolution'
  | 'dashboard'
  | 'analytics'
  | 'digest'
  | 'knowledge-graph'
  | 'learning-tasks'
  | 'triage';

export type Context = 'personal' | 'work';
