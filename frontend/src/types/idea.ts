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
 * Page Types - Navigation Reorganisation 2026
 *
 * 3 Sektionen:
 * - Denken: ideas (Aktiv + Inkubator + Archiv + Sortieren), workshop (Proaktiv + Evolution + Agenten)
 * - Entdecken: insights (Analytics + Digest + Verbindungen), documents (Dokumente + Editor + Medien + Meetings), business
 * - Wachsen: learning, my-ai (Personalisierung + KI-Wissen + Sprach-Chat)
 *
 * Chat: chat (eigene Seite + Floating-Bubble)
 * Footer: settings (Profil + Allgemein + KI + Datenschutz + Automationen + Integrationen + Daten), notifications
 * Dashboard: home (Startseite)
 */
export type Page =
  // Dashboard
  | 'home'
  // Chat (eigene Seite)
  | 'chat'
  // Denken
  | 'ideas'
  | 'workshop'
  // Entdecken
  | 'insights'
  | 'documents'
  | 'business'
  // Wachsen
  | 'learning'
  | 'my-ai'
  // Footer
  | 'notifications'
  | 'settings'
  // Legacy-Seiten (intern weitergeleitet auf neue Routen)
  | 'incubator'        // → /ideas/incubator
  | 'ai-workshop'      // → /workshop
  | 'meetings'         // → /documents/meetings
  | 'automations'      // → /settings/automations
  | 'integrations'     // → /settings/integrations
  | 'export'           // → /settings/data
  | 'sync'             // → /settings/data
  | 'profile'          // → /settings/profile
  | 'archive'          // → /ideas/archive
  | 'triage'           // → /ideas/triage
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
