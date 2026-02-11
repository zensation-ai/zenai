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
 * Page Types - Radikale Navigation 2026
 *
 * 4 Sektionen:
 * - Gedanken: ideas (inkl. Archiv-Tab + Triage-Modus), incubator
 * - KI-Assistenz: ai-workshop, learning, my-ai
 * - Wissen & Inhalte: insights, documents (inkl. Canvas + Medien), meetings
 * - System: automations, integrations, export, sync
 *
 * Footer: profile, notifications, settings
 * Dashboard: home (Startseite via Logo-Klick)
 */
export type Page =
  // Dashboard (Startseite)
  | 'home'
  // Gedanken
  | 'ideas'
  | 'incubator'
  // KI-Assistenz
  | 'ai-workshop'
  | 'learning'
  | 'my-ai'
  // Wissen & Inhalte
  | 'insights'
  | 'documents'
  | 'meetings'
  // Business
  | 'business'
  // System
  | 'automations'
  | 'integrations'
  | 'export'
  | 'sync'
  // Footer
  | 'profile'
  | 'notifications'
  | 'settings'
  // Legacy-Seiten (intern weitergeleitet)
  | 'archive'
  | 'triage'
  | 'stories'
  | 'media'
  | 'canvas'
  | 'personalization'
  | 'proactive'
  | 'evolution'
  | 'dashboard'
  | 'analytics'
  | 'digest'
  | 'knowledge-graph'
  | 'learning-tasks'
  | 'voice-chat'
  | 'agent-teams';

export type { AIContext as Context } from '../components/ContextSwitcher';
