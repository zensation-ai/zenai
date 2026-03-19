/**
 * ZenAI Design System — Typography Tokens
 * Phase 102 — Calm Neurodesign modular 1.25 scale ADDED alongside legacy.
 */

// Re-export ALL legacy named exports
export {
  fontFamily, fontSize, fontWeight, lineHeight, letterSpacing, fontFeatureSettings,
} from './typography-legacy';

import { typography as legacyTypography } from './typography-legacy';

// ── NEW: Modular scale ─────────────────────────────────────────
export const family = {
  sans: "'Inter', -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
  mono: "'JetBrains Mono', 'Fira Code', 'SF Mono', monospace",
} as const;

export const size = {
  xs: '0.75rem', sm: '0.875rem', base: '1rem', lg: '1.125rem',
  xl: '1.25rem', '2xl': '1.5rem', '3xl': '1.875rem',
} as const;

export const weight = {
  normal: 400, medium: 500, semibold: 600, bold: 700,
} as const;

export const leading = {
  tight: 1.3, normal: 1.55, relaxed: 1.7,
} as const;

export const tracking = {
  tight: '-0.02em', normal: '0', wide: '0.02em', wider: '0.05em',
} as const;

// ── EXTENDED Aggregate ─────────────────────────────────────────
export const typography = {
  ...legacyTypography, // fontFamily, fontSize, fontWeight, lineHeight, letterSpacing, fontFeatureSettings
  family, size, weight, leading, tracking,
} as const;

export type Typography = typeof typography;
