/**
 * ZenAI Design System - Spacing Tokens
 * Phase 68.1 - Mirrors --spacing-* and layout constants from index.css
 */

// ---------------------------------------------------------------------------
// Spacing scale (from index.css --spacing-*)
// Note: index.css uses a mixed scale (4,8,12,16,20,24,32,48)
// We expose both the CSS-matching values AND a pure 4px-base scale.
// ---------------------------------------------------------------------------

/** Spacing values matching index.css --spacing-* custom properties exactly. */
export const spacing = {
  /** 4px  - --spacing-xs */
  xs: 4,
  /** 8px  - --spacing-sm */
  sm: 8,
  /** 12px - --spacing-md */
  md: 12,
  /** 16px - --spacing-lg */
  lg: 16,
  /** 20px - --spacing-xl */
  xl: 20,
  /** 24px - --spacing-2xl */
  '2xl': 24,
  /** 32px - --spacing-3xl */
  '3xl': 32,
  /** 48px - --spacing-4xl */
  '4xl': 48,
} as const;

/**
 * Pure 4px-base spacing scale for programmatic use.
 * Useful when you need intermediate values not in the CSS system.
 */
export const space = {
  0: 0,
  px: 1,
  0.5: 2,
  1: 4,
  1.5: 6,
  2: 8,
  2.5: 10,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  7: 28,
  8: 32,
  9: 36,
  10: 40,
  12: 48,
  14: 56,
  16: 64,
  20: 80,
  24: 96,
} as const;

// ---------------------------------------------------------------------------
// Layout dimensions (from index.css)
// ---------------------------------------------------------------------------

export const layout = {
  /** Sidebar expanded width */
  sidebarWidth: 260,
  /** Sidebar collapsed width */
  sidebarCollapsedWidth: 64,
  /** TopBar height */
  topbarHeight: 52,
  /** Mobile bottom bar height */
  bottomBarHeight: 64,
  /** Mobile nav height */
  mobileNavHeight: 60,
  /** Minimum touch target (WCAG / Apple HIG) */
  minTouchTarget: 44,
} as const;

// ---------------------------------------------------------------------------
// Helper: convert numeric spacing to px string
// ---------------------------------------------------------------------------

export function px(value: number): string {
  return `${value}px`;
}

export type Spacing = typeof spacing;
export type Space = typeof space;
export type Layout = typeof layout;
