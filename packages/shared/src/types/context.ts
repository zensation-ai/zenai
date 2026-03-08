/**
 * AI Context - The 4 schema-isolated contexts in ZenAI
 *
 * Each context maps to a separate PostgreSQL schema with identical table structure.
 * Used for schema routing via `SET search_path TO {context}, public`.
 */
export type AIContext = 'personal' | 'work' | 'learning' | 'creative';

export const AI_CONTEXTS: readonly AIContext[] = ['personal', 'work', 'learning', 'creative'] as const;

export function isValidContext(value: string): value is AIContext {
  return AI_CONTEXTS.includes(value as AIContext);
}

/**
 * Context metadata for UI display
 */
export interface ContextMeta {
  id: AIContext;
  label: string;
  icon: string;
  color: string;
  description: string;
}

export const CONTEXT_META: Record<AIContext, ContextMeta> = {
  personal: {
    id: 'personal',
    label: 'Persoenlich',
    icon: 'user',
    color: '#8b5cf6',
    description: 'Private Gedanken, Notizen und Aufgaben',
  },
  work: {
    id: 'work',
    label: 'Arbeit',
    icon: 'briefcase',
    color: '#3b82f6',
    description: 'Berufliche Projekte und Business',
  },
  learning: {
    id: 'learning',
    label: 'Lernen',
    icon: 'book-open',
    color: '#10b981',
    description: 'Lernziele, Recherche und Weiterbildung',
  },
  creative: {
    id: 'creative',
    label: 'Kreativ',
    icon: 'palette',
    color: '#f59e0b',
    description: 'Kreative Projekte und Inspiration',
  },
};
