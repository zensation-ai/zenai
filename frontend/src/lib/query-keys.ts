/**
 * Query Key Factory
 *
 * Type-safe, hierarchical query keys for React Query.
 * Every key includes the AI context for automatic cache isolation.
 *
 * Usage:
 *   queryKeys.ideas.list('personal', { status: 'active' })
 *   queryKeys.chat.sessions('work')
 */

/**
 * Stable serialization for filter objects.
 * Prevents cache misses from different object reference identity
 * by converting objects to a deterministic JSON string key.
 */
function stableFilters(filters?: Record<string, unknown>): string {
  if (!filters || Object.keys(filters).length === 0) return '{}';
  // Sort keys for deterministic serialization
  const sorted = Object.keys(filters).sort().reduce<Record<string, unknown>>((acc, key) => {
    acc[key] = filters[key];
    return acc;
  }, {});
  return JSON.stringify(sorted);
}

export const queryKeys = {
  // Ideas
  ideas: {
    all: (ctx: string) => ['ideas', ctx] as const,
    list: (ctx: string, filters?: Record<string, unknown>) =>
      ['ideas', ctx, 'list', stableFilters(filters)] as const,
    detail: (ctx: string, id: string) => ['ideas', ctx, id] as const,
    stats: (ctx: string) => ['ideas', ctx, 'stats'] as const,
    archived: (ctx: string) => ['ideas', ctx, 'archived'] as const,
  },

  // Chat
  chat: {
    all: (ctx: string) => ['chat', ctx] as const,
    sessions: (ctx: string) => ['chat', ctx, 'sessions'] as const,
    session: (ctx: string, id: string) => ['chat', ctx, 'session', id] as const,
    messages: (ctx: string, sessionId: string) =>
      ['chat', ctx, 'messages', sessionId] as const,
  },

  // Contacts
  contacts: {
    all: (ctx: string) => ['contacts', ctx] as const,
    list: (ctx: string, filters?: Record<string, unknown>) =>
      ['contacts', ctx, 'list', stableFilters(filters)] as const,
    detail: (ctx: string, id: string) => ['contacts', ctx, id] as const,
    stats: (ctx: string) => ['contacts', ctx, 'stats'] as const,
    followUps: (ctx: string) => ['contacts', ctx, 'follow-ups'] as const,
  },

  // Organizations
  organizations: {
    all: (ctx: string) => ['organizations', ctx] as const,
    list: (ctx: string, filters?: Record<string, unknown>) =>
      ['organizations', ctx, 'list', stableFilters(filters)] as const,
    detail: (ctx: string, id: string) => ['organizations', ctx, id] as const,
  },

  // Tasks
  tasks: {
    all: (ctx: string) => ['tasks', ctx] as const,
    list: (ctx: string, filters?: Record<string, unknown>) =>
      ['tasks', ctx, 'list', stableFilters(filters)] as const,
    detail: (ctx: string, id: string) => ['tasks', ctx, id] as const,
    gantt: (ctx: string) => ['tasks', ctx, 'gantt'] as const,
  },

  // Projects
  projects: {
    all: (ctx: string) => ['projects', ctx] as const,
    list: (ctx: string) => ['projects', ctx, 'list'] as const,
    detail: (ctx: string, id: string) => ['projects', ctx, id] as const,
  },

  // Finance
  finance: {
    all: (ctx: string) => ['finance', ctx] as const,
    overview: (ctx: string) => ['finance', ctx, 'overview'] as const,
    accounts: (ctx: string) => ['finance', ctx, 'accounts'] as const,
    transactions: (ctx: string, filters?: Record<string, unknown>) =>
      ['finance', ctx, 'transactions', stableFilters(filters)] as const,
    budgets: (ctx: string) => ['finance', ctx, 'budgets'] as const,
    goals: (ctx: string) => ['finance', ctx, 'goals'] as const,
    categories: (ctx: string) => ['finance', ctx, 'categories'] as const,
  },

  // Email
  email: {
    all: (ctx: string) => ['email', ctx] as const,
    list: (ctx: string, filters?: Record<string, unknown>) =>
      ['email', ctx, 'list', stableFilters(filters)] as const,
    detail: (ctx: string, id: string) => ['email', ctx, id] as const,
    stats: (ctx: string) => ['email', ctx, 'stats'] as const,
    thread: (ctx: string, id: string) => ['email', ctx, 'thread', id] as const,
  },

  // Calendar
  calendar: {
    all: (ctx: string) => ['calendar', ctx] as const,
    events: (ctx: string, filters?: Record<string, unknown>) =>
      ['calendar', ctx, 'events', stableFilters(filters)] as const,
    upcoming: (ctx: string) => ['calendar', ctx, 'upcoming'] as const,
  },

  // Documents
  documents: {
    all: (ctx: string) => ['documents', ctx] as const,
    list: (ctx: string, filters?: Record<string, unknown>) =>
      ['documents', ctx, 'list', stableFilters(filters)] as const,
    detail: (ctx: string, id: string) => ['documents', ctx, id] as const,
  },

  // Dashboard
  dashboard: {
    stats: (ctx: string) => ['dashboard', ctx, 'stats'] as const,
    activity: (ctx: string) => ['dashboard', ctx, 'activity'] as const,
    trend: (ctx: string) => ['dashboard', ctx, 'trend'] as const,
    summary: (ctx: string) => ['dashboard', ctx, 'summary'] as const,
  },

  // Canvas
  canvas: {
    all: (ctx: string) => ['canvas', ctx] as const,
    list: (ctx: string) => ['canvas', ctx, 'list'] as const,
    detail: (id: string) => ['canvas', id] as const,
    versions: (id: string) => ['canvas', id, 'versions'] as const,
  },

  // Voice
  voice: {
    sessions: (ctx: string) => ['voice', ctx, 'sessions'] as const,
    settings: (ctx: string) => ['voice', ctx, 'settings'] as const,
    voices: (ctx: string) => ['voice', ctx, 'voices'] as const,
  },

  // Browser
  browser: {
    all: (ctx: string) => ['browser', ctx] as const,
    history: (ctx: string, filters?: Record<string, unknown>) =>
      ['browser', ctx, 'history', stableFilters(filters)] as const,
    bookmarks: (ctx: string, filters?: Record<string, unknown>) =>
      ['browser', ctx, 'bookmarks', stableFilters(filters)] as const,
    domains: (ctx: string) => ['browser', ctx, 'domains'] as const,
  },

  // AI System Pulse
  aiPulse: {
    all: (ctx: string) => ['ai-pulse', ctx] as const,
  },

  // Health
  health: {
    status: () => ['health'] as const,
    detailed: () => ['health', 'detailed'] as const,
  },

  // Notifications
  notifications: {
    all: (ctx: string) => ['notifications', ctx] as const,
    count: (ctx: string) => ['notifications', ctx, 'count'] as const,
  },

  // Smart suggestions
  suggestions: {
    list: (ctx: string) => ['suggestions', ctx] as const,
  },
} as const;
