/**
 * ZenAI Design System — Shadow Tokens
 * Phase 102 — Glass levels + elevation ADDED alongside legacy.
 */

// Re-export ALL legacy named exports
export { shadowLight, shadowDark, shadowGlass2026 } from './shadows-legacy';

import { shadows as legacyShadows } from './shadows-legacy';

// ── NEW: Glass Levels ──────────────────────────────────────────
export const glassLevel = {
  level1: '0 2px 16px rgba(0, 0, 0, 0.04)',
  level2: '0 8px 32px rgba(0, 0, 0, 0.08)',
  backdrop: '0 0 0 9999px rgba(0, 0, 0, 0.3)',
} as const;

// ── NEW: Elevation scale ───────────────────────────────────────
export const elevation = {
  sm: '0 1px 3px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.04)',
  md: '0 4px 12px rgba(0, 0, 0, 0.08), 0 2px 4px rgba(0, 0, 0, 0.04)',
  lg: '0 12px 32px rgba(0, 0, 0, 0.12), 0 4px 8px rgba(0, 0, 0, 0.06)',
} as const;

export const elevationDark = {
  sm: '0 1px 3px rgba(0, 0, 0, 0.2), 0 1px 2px rgba(0, 0, 0, 0.15)',
  md: '0 4px 12px rgba(0, 0, 0, 0.25), 0 2px 4px rgba(0, 0, 0, 0.15)',
  lg: '0 12px 32px rgba(0, 0, 0, 0.35), 0 4px 8px rgba(0, 0, 0, 0.2)',
} as const;

// ── EXTENDED Aggregate ─────────────────────────────────────────
export const shadows = {
  ...legacyShadows, // light (shadowLight), dark (shadowDark), glass2026
  glassLevel, elevation, elevationDark,
} as const;

export type Shadows = typeof shadows;
