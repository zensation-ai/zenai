/**
 * ZenAI Design System - Typography Tokens
 * Phase 68.1 - Mirrors font settings from index.css body rules
 */

// ---------------------------------------------------------------------------
// Font families
// ---------------------------------------------------------------------------

export const fontFamily = {
  /** Primary font stack (from body rule in index.css) */
  sans: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  /** Monospace for code blocks */
  mono: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Cascadia Code', Consolas, 'Liberation Mono', Menlo, monospace",
} as const;

// ---------------------------------------------------------------------------
// Font sizes (rem-based scale)
// ---------------------------------------------------------------------------

export const fontSize = {
  /** 10px */
  '2xs': '0.625rem',
  /** 11px */
  xs: '0.6875rem',
  /** 12px */
  sm: '0.75rem',
  /** 13px */
  md: '0.8125rem',
  /** 14px */
  base: '0.875rem',
  /** 16px - iOS minimum for inputs */
  lg: '1rem',
  /** 18px */
  xl: '1.125rem',
  /** 20px */
  '2xl': '1.25rem',
  /** 24px */
  '3xl': '1.5rem',
  /** 30px */
  '4xl': '1.875rem',
  /** 36px */
  '5xl': '2.25rem',
  /** 48px */
  '6xl': '3rem',
} as const;

// ---------------------------------------------------------------------------
// Font weights
// ---------------------------------------------------------------------------

export const fontWeight = {
  /** Thin */
  thin: 100,
  /** Extra-light */
  extraLight: 200,
  /** Light */
  light: 300,
  /** Regular */
  regular: 400,
  /** Body default (index.css body: 450) */
  body: 450,
  /** Medium */
  medium: 500,
  /** Semi-bold */
  semiBold: 600,
  /** Bold */
  bold: 700,
  /** Extra-bold */
  extraBold: 800,
} as const;

// ---------------------------------------------------------------------------
// Line heights
// ---------------------------------------------------------------------------

export const lineHeight = {
  /** Tight headings */
  none: 1,
  /** Compact UI text */
  tight: 1.25,
  /** Snug labels */
  snug: 1.375,
  /** Default body (index.css body: 1.6) */
  base: 1.6,
  /** Relaxed reading */
  relaxed: 1.75,
  /** Loose / large text */
  loose: 2,
} as const;

// ---------------------------------------------------------------------------
// Letter spacing
// ---------------------------------------------------------------------------

export const letterSpacing = {
  /** index.css body: -0.01em */
  tight: '-0.01em',
  /** Normal */
  normal: '0em',
  /** Slightly wide for uppercase labels */
  wide: '0.025em',
  /** Tracking for all-caps */
  wider: '0.05em',
} as const;

// ---------------------------------------------------------------------------
// Font feature settings (from index.css body)
// ---------------------------------------------------------------------------

export const fontFeatureSettings = "'cv02', 'cv03', 'cv04', 'cv11'" as const;

// ---------------------------------------------------------------------------
// Aggregate export
// ---------------------------------------------------------------------------

export const typography = {
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
  letterSpacing,
  fontFeatureSettings,
} as const;

export type Typography = typeof typography;
