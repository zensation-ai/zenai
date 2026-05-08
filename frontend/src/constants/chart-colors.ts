/**
 * Theme-reactive color palette for charts (Recharts, D3).
 * Reads CSS custom properties at runtime so charts respond to theme changes.
 */

function getCSSVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

/** Call this inside a component/effect to get current theme colors */
export function getChartColors() {
  return {
    primary: getCSSVar('--color-primary', '#ff6b35'),
    success: getCSSVar('--color-success', '#10b981'),
    warning: getCSSVar('--color-warning', '#f59e0b'),
    danger: getCSSVar('--color-danger', '#ef4444'),
    info: getCSSVar('--color-info', '#3b82f6'),
    purple: getCSSVar('--color-context-strategy', '#a855f7'),
    teal: getCSSVar('--color-context-finance', '#1a6b7a'),
    text: getCSSVar('--color-text', '#f5f9fc'),
    textSecondary: getCSSVar('--color-text-secondary', '#8899a6'),
    textMuted: getCSSVar('--color-text-muted', '#5a6a7a'),
    surface: getCSSVar('--color-surface', '#16323e'),
    border: getCSSVar('--color-border', 'rgba(255,255,255,0.1)'),
    bg: getCSSVar('--color-bg', '#0a1a24'),
  };
}

/** Static categorical palette for charts needing distinct series colors */
export const CHART_SERIES_COLORS = [
  'var(--color-primary)',
  'var(--color-success)',
  'var(--color-info)',
  'var(--color-warning)',
  'var(--color-context-strategy)',
  'var(--color-danger)',
  'var(--color-context-finance)',
  'var(--color-context-people)',
] as const;

/**
 * Layer colors for memory visualization.
 * Uses raw hex because MemoryTimeline.tsx concatenates alpha suffixes (e.g. + '18', + '40').
 * CSS var() values would break when concatenated: "var(--x)18" is invalid.
 */
export const MEMORY_LAYER_COLORS = {
  working: '#a855f7',
  episodic: '#22c55e',
  short_term: '#3b82f6',
  long_term: '#f59e0b',
} as const;

/**
 * Plan tier colors for billing.
 * Raw hex because they're used in inline style props (backgroundColor, color).
 */
export const PLAN_TIER_COLORS = {
  free: '#6b7280',
  personal: '#10b981',
  pro: '#0ea5e9',
  team: '#f59e0b',
  enterprise: '#8b5cf6',
} as const;

/**
 * Command palette mode colors.
 * Raw hex because used in style={{ backgroundColor: color }}.
 */
export const MODE_COLORS = {
  navigation: '#3b82f6',
  commands: '#1a6b7a',
  contacts: '#10b981',
  tags: '#f59e0b',
} as const;

/**
 * Conflict type colors for memory insights.
 * Raw hex because used in style={{ backgroundColor: color }}.
 */
export const CONFLICT_TYPE_COLORS = {
  contradiction: '#ef4444',
  outdated: '#eab308',
  duplicate: '#3b82f6',
} as const;

/**
 * Suggestion action colors for memory curation.
 * Raw hex because used in style={{ backgroundColor: color }}.
 */
export const SUGGESTION_ACTION_COLORS = {
  archive: '#1a6b7a',
  promote: '#22c55e',
  merge: '#3b82f6',
  delete: '#ef4444',
} as const;
