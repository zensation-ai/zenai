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
 * Page Types — Phase 105 (Zenith Navigation)
 *
 * 7+1 Smart Pages + legacy types for backward compat.
 * Smart Pages are intermediaries pointing to existing components.
 * Phases 106-110 replace intermediaries with consolidated Smart Page components.
 *
 * Legacy types are kept for:
 * 1. Redirect support (old URLs still work)
 * 2. Existing component references (gradual migration)
 */
export type Page =
  // ── Smart Pages (7+1) ──────────────────────────────
  | 'hub'            // Chat Hub (start page, Phase 104)
  | 'ideas'          // Ideen (intermediary: IdeasPage)
  | 'calendar'       // Planer (intermediary: PlannerPage)
  | 'email'          // Inbox (intermediary: EmailPage)
  | 'documents'      // Wissen (intermediary: DocumentVaultPage)
  | 'business'       // Cockpit (intermediary: BusinessDashboard)
  | 'my-ai'          // Meine KI (intermediary: MyAIPage)
  | 'settings'       // System (intermediary: SettingsDashboard)

  // ── Active sub-pages (rendered within parent Smart Page) ──
  | 'contacts'       // Within Planer
  | 'finance'        // Within Cockpit
  | 'insights'       // Within Cockpit
  | 'learning'       // Within Wissen
  | 'notifications'  // Within Inbox
  | 'screen-memory'  // Accessible via Chat Hub intent
  | 'memory-insights' // Within Meine KI

  // ── Sub-tabs (URL routing within Smart Pages) ─────
  | 'tasks' | 'kanban' | 'gantt' | 'meetings'
  | 'canvas' | 'media'
  | 'analytics' | 'digest' | 'knowledge-graph' | 'graphrag'
  | 'voice-chat' | 'procedural-memory' | 'digital-twin'
  | 'system-admin'

  // ── Legacy redirect-only types ────────────────────
  // @deprecated Phase 105 — kept for redirect support, remove in Phase 110
  | 'home'           // → hub
  | 'chat'           // → hub
  | 'browser'        // → hub (intent: "Open URL...")
  | 'workshop'       // → ideas (AI Panel)
  | 'incubator'      // → ideas (filter chip)
  | 'archive'        // → ideas (filter chip)
  | 'triage'         // → ideas (quick-actions)
  | 'proactive'      // → ideas (AI Panel tab)
  | 'evolution'      // → ideas (AI Panel tab)
  | 'agent-teams'    // → hub (intent + result panel)
  | 'learning-tasks' // → calendar (tasks with learning tag)
  | 'personalization'// → my-ai (Persona tab)
  | 'stories'        // → deprecated (unused)
  | 'dashboard'      // → hub
  | 'ai-workshop'    // → ideas
  | 'mcp-servers'    // → settings (Integrations tab)
  | 'automations'    // → settings
  | 'integrations'   // → settings
  | 'export'         // → settings
  | 'sync'           // → settings
  | 'profile';       // → settings

export type { AIContext as Context } from '../components/ContextSwitcher';
