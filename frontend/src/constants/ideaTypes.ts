/**
 * Centralized Idea Type Constants
 * Single source of truth for idea types, categories, and priorities
 */

export const IDEA_TYPES = {
  idea: { label: 'Idee', icon: '💡', labelWithIcon: '💡 Ideen' },
  task: { label: 'Aufgabe', icon: '✅', labelWithIcon: '✅ Aufgaben' },
  insight: { label: 'Erkenntnis', icon: '🔍', labelWithIcon: '🔍 Erkenntnisse' },
  problem: { label: 'Problem', icon: '⚠️', labelWithIcon: '⚠️ Probleme' },
  question: { label: 'Frage', icon: '❓', labelWithIcon: '❓ Fragen' },
} as const;

export const IDEA_CATEGORIES = {
  business: { label: 'Business', color: '#22c55e' },
  technical: { label: 'Technik', color: '#3b82f6' },
  personal: { label: 'Persönlich', color: '#a855f7' },
  learning: { label: 'Lernen', color: '#f59e0b' },
} as const;

export const PRIORITIES = {
  high: { label: 'Hoch', color: '#ef4444' },
  medium: { label: 'Mittel', color: '#f59e0b' },
  low: { label: 'Niedrig', color: '#64748b' },
} as const;

export const MEETING_TYPES = {
  internal: { label: 'Intern', icon: '🏢' },
  external: { label: 'Extern', icon: '🌐' },
  one_on_one: { label: '1:1', icon: '👥' },
  team: { label: 'Team', icon: '👨‍👩‍👧‍👦' },
  client: { label: 'Kunde', icon: '🤝' },
  other: { label: 'Sonstiges', icon: '📅' },
} as const;

export const MEETING_STATUS = {
  scheduled: { label: 'Geplant', color: '#3b82f6' },
  in_progress: { label: 'Läuft', color: '#f59e0b' },
  completed: { label: 'Abgeschlossen', color: '#22c55e' },
  cancelled: { label: 'Abgesagt', color: '#64748b' },
} as const;

// Type exports for TypeScript
export type IdeaType = keyof typeof IDEA_TYPES;
export type IdeaCategory = keyof typeof IDEA_CATEGORIES;
export type Priority = keyof typeof PRIORITIES;
export type MeetingType = keyof typeof MEETING_TYPES;
export type MeetingStatus = keyof typeof MEETING_STATUS;

// Helper functions
export function getTypeIcon(type: string): string {
  return IDEA_TYPES[type as IdeaType]?.icon || '📝';
}

export function getTypeLabel(type: string): string {
  return IDEA_TYPES[type as IdeaType]?.label || type;
}

export function getCategoryColor(category: string): string {
  return IDEA_CATEGORIES[category as IdeaCategory]?.color || '#64748b';
}

export function getPriorityColor(priority: string): string {
  return PRIORITIES[priority as Priority]?.color || '#64748b';
}

export function getMeetingStatusColor(status: string): string {
  return MEETING_STATUS[status as MeetingStatus]?.color || '#64748b';
}

export function getMeetingStatusLabel(status: string): string {
  return MEETING_STATUS[status as MeetingStatus]?.label || status;
}
