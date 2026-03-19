/**
 * ZenAI Design System - Shadow Tokens
 * Phase 68.1 - Mirrors --shadow-* from index.css (light + dark)
 */

// ---------------------------------------------------------------------------
// Light mode shadows
// ---------------------------------------------------------------------------

export const shadowLight = {
  /** --shadow-sm */
  sm: '0 1px 3px rgba(20, 50, 70, 0.08), 0 1px 2px rgba(20, 50, 70, 0.06)',
  /** --shadow-md */
  md: '0 4px 16px rgba(20, 50, 70, 0.1), 0 2px 6px rgba(20, 50, 70, 0.06)',
  /** --shadow-lg */
  lg: '0 12px 40px rgba(20, 50, 70, 0.15), 0 4px 12px rgba(20, 50, 70, 0.08)',
  /** --shadow-card */
  card: '0 2px 12px rgba(20, 50, 70, 0.08), 0 1px 3px rgba(20, 50, 70, 0.05), inset 0 1px 0 rgba(255,255,255,0.5)',
  /** --shadow-glass */
  glass:
    '0 8px 32px rgba(20, 50, 70, 0.12), inset 0 1px 0 rgba(255,255,255,0.4)',
  /** --shadow-glow (primary orange) */
  glow: '0 4px 24px rgba(255, 107, 53, 0.35)',
  /** --shadow-glow-light */
  glowLight: '0 4px 16px rgba(255, 107, 53, 0.25)',
  /** --shadow-glow-strong */
  glowStrong: '0 6px 24px rgba(255, 107, 53, 0.4)',
  /** --shadow-glow-petrol */
  glowPetrol: '0 4px 24px rgba(26, 58, 74, 0.2)',
  /** --shadow-hover-glow */
  hoverGlow:
    '0 24px 64px rgba(20, 50, 70, 0.15), 0 10px 28px rgba(20, 50, 70, 0.1)',
  /** --command-shadow */
  command: '0 12px 48px rgba(20, 50, 70, 0.12)',
} as const;

// ---------------------------------------------------------------------------
// Dark mode shadows
// ---------------------------------------------------------------------------

export const shadowDark = {
  /** --shadow-sm (dark) */
  sm: '0 1px 3px rgba(5, 20, 30, 0.35), 0 1px 2px rgba(5, 20, 30, 0.25)',
  /** --shadow-md (dark) */
  md: '0 4px 16px rgba(5, 20, 30, 0.4), 0 2px 6px rgba(5, 20, 30, 0.3)',
  /** --shadow-lg (dark) */
  lg: '0 12px 40px rgba(5, 20, 30, 0.5), 0 4px 12px rgba(5, 20, 30, 0.35)',
  /** --shadow-card (dark) */
  card: '0 2px 12px rgba(5, 20, 30, 0.35), 0 1px 3px rgba(5, 20, 30, 0.25), inset 0 1px 0 rgba(80, 180, 200, 0.04)',
  /** --shadow-glass (dark) */
  glass:
    '0 8px 32px rgba(5, 20, 30, 0.4), inset 0 1px 0 rgba(80, 180, 200, 0.05)',
  /** --shadow-glow (dark primary) */
  glow: '0 4px 24px rgba(255, 122, 74, 0.4)',
  /** --shadow-glow-petrol (dark) */
  glowPetrol: '0 4px 24px rgba(30, 120, 150, 0.35)',
  /** --command-shadow (dark) */
  command: '0 12px 48px rgba(0, 0, 0, 0.4)',
} as const;

// ---------------------------------------------------------------------------
// Liquid Glass 2026 shadow (from neurodesign.css)
// ---------------------------------------------------------------------------

export const shadowGlass2026 =
  '0 8px 32px rgba(0, 0, 0, 0.08), 0 2px 8px rgba(0, 0, 0, 0.04), inset 0 1px 0 rgba(255, 255, 255, 0.6)' as const;

// ---------------------------------------------------------------------------
// Aggregate
// ---------------------------------------------------------------------------

export const shadows = {
  light: shadowLight,
  dark: shadowDark,
  glass2026: shadowGlass2026,
} as const;

export type Shadows = typeof shadows;
