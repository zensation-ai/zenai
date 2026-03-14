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
  is_favorite?: boolean;
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
 * 4 Sektionen:
 * - Ideen: ideas (Aktiv + Inkubator + Archiv + Sortieren), workshop (Proaktiv + Evolution + Agenten)
 * - Organisieren: calendar (Kalender + Aufgaben + Kanban + Gantt), documents (Dokumente + Editor + Medien)
 * - Auswerten: insights (Analytics + Digest + Verbindungen), business
 * - KI & Lernen: my-ai (Personalisierung + KI-Wissen + Sprach-Chat), learning
 *
 * Chat: chat (eigene Seite + Floating-Bubble)
 * Browser: browser (eingebetteter Browser mit Tabs)
 * Footer: settings (Profil + Allgemein + KI + Datenschutz + Automationen + Integrationen + Daten), notifications
 * Dashboard: home (Startseite)
 */
export type Page =
  // Dashboard
  | 'home'
  // Chat (eigene Seite)
  | 'chat'
  // Browser (eingebetteter Browser)
  | 'browser'
  // Ideen
  | 'ideas'
  | 'workshop'
  // Organisieren
  | 'contacts'
  | 'calendar'
  | 'tasks'
  | 'kanban'
  | 'gantt'
  | 'email'
  | 'documents'
  // Finanzen
  | 'finance'
  // Auswerten
  | 'insights'
  | 'business'
  // KI & Lernen
  | 'my-ai'
  | 'learning'
  // Screen Memory
  | 'screen-memory'
  // Memory Insights (sub-page of my-ai)
  | 'memory-insights'
  // Footer
  | 'notifications'
  | 'settings'
  // Legacy-Seiten (intern weitergeleitet auf neue Routen)
  | 'incubator'        // → /ideas/incubator
  | 'ai-workshop'      // → /workshop
  | 'meetings'         // → /calendar/meetings
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
  | 'agent-teams'
  | 'mcp-servers'
  // System Admin (Phase 61-63)
  | 'system-admin'
  // Sub-tabs
  | 'graphrag'
  | 'procedural-memory';

export type { AIContext as Context } from '../components/ContextSwitcher';
