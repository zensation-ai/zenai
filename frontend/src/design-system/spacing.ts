/**
 * ZenAI Design System — Spacing Tokens
 * Phase 102 — Gestalt 4px string scale ADDED alongside legacy numeric scale.
 *
 * `spacing` export keeps the OLD numeric shape for backward compat.
 * New `scale` and `gestalt` are separate named exports.
 */

// Re-export ALL legacy exports (spacing stays the old numeric object)
export { spacing, space, layout, px } from './spacing-legacy';
export type { Spacing, Space, Layout } from './spacing-legacy';

// ── NEW: String-based 4px scale ────────────────────────────────
export const scale = {
  1: '4px', 2: '8px', 3: '12px', 4: '16px', 5: '20px',
  6: '24px', 8: '32px', 10: '40px', 12: '48px', 16: '64px',
} as const;

/** Gestalt proximity: intra ≤ 12px, inter ≥ 24px (≥ 2:1 ratio) */
export const gestalt = {
  intraGroup: '8px',
  interGroup: '24px',
} as const;
