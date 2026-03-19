/**
 * ZenAI Design System — Color Tokens
 * Phase 102 — Calm Neurodesign HSL tokens ADDED alongside all legacy tokens.
 *
 * EXTENSION STRATEGY: The `colors` aggregate spreads ALL legacy properties
 * and adds new Calm Neurodesign namespaces. Code using `colors.surfaceLight`,
 * `colors.brand`, etc. continues to work unchanged.
 */

// ── Re-export ALL legacy named exports (backward compat) ────────
export {
  brand, brandDark, warm, petrol, semantic, semanticDark, error, status,
  contextWork, aiStatus, triage, surfaceLight, surfaceDark, glassLight,
  glassDark, glass2026Light, glass2026Dark, textLight, textDark, textOnDark,
  borderLight, borderDark, inputLight, codeLight, codeDark, gradients,
  header, sidebar, commandLight, commandDark, bottomBar, neuro,
} from './colors-legacy';

// Import legacy aggregate for spreading into new aggregate
import { colors as legacyColors } from './colors-legacy';

// ── NEW: Accent / Semantic (5 hues) ────────────────────────────
export const accent = {
  primary: 'hsl(250, 65%, 58%)',
  primaryHover: 'hsl(250, 65%, 52%)',
  primaryGlow: 'hsla(250, 65%, 58%, 0.25)',
  secondary: 'hsl(190, 60%, 45%)',
  secondaryHover: 'hsl(190, 60%, 40%)',
} as const;

export const calmSuccess = {
  base: 'hsl(160, 70%, 42%)',
  light: 'hsla(160, 70%, 42%, 0.12)',
  glow: 'hsla(160, 70%, 42%, 0.25)',
} as const;

export const calmWarning = {
  base: 'hsl(38, 95%, 55%)',
  light: 'hsla(38, 95%, 55%, 0.12)',
  glow: 'hsla(38, 95%, 55%, 0.25)',
} as const;

export const calmDanger = {
  base: 'hsl(0, 72%, 55%)',
  light: 'hsla(0, 72%, 55%, 0.12)',
  glow: 'hsla(0, 72%, 55%, 0.25)',
} as const;

// ── NEW: Context Colors ────────────────────────────────────────
export const context = {
  personal: 'hsl(210, 70%, 55%)',
  work: 'hsl(160, 60%, 45%)',
  learning: 'hsl(280, 60%, 55%)',
  creative: 'hsl(35, 90%, 55%)',
} as const;

// ── NEW: Surface System (Neutral) ──────────────────────────────
export const calmSurface = {
  light: {
    bg: 'hsl(220, 14%, 97%)', s1: 'hsl(220, 14%, 99%)',
    s2: 'hsl(220, 12%, 95%)', s3: 'hsl(220, 10%, 91%)',
  },
  dark: {
    bg: 'hsl(225, 18%, 10%)', s1: 'hsl(225, 16%, 14%)',
    s2: 'hsl(225, 14%, 18%)', s3: 'hsl(225, 12%, 24%)',
  },
} as const;

// ── NEW: Text (never pure black/white) ─────────────────────────
export const calmText = {
  light: { primary: 'hsl(220, 15%, 15%)', secondary: 'hsl(220, 10%, 45%)', tertiary: 'hsl(220, 8%, 62%)' },
  dark: { primary: 'hsl(220, 15%, 95%)', secondary: 'hsl(220, 10%, 72%)', tertiary: 'hsl(220, 8%, 55%)' },
} as const;

// ── NEW: Glass Surfaces ────────────────────────────────────────
export const calmGlass = {
  light: { bg: 'rgba(255, 255, 255, 0.72)', border: 'rgba(255, 255, 255, 0.25)', blur: '16px' },
  dark: { bg: 'rgba(30, 30, 46, 0.72)', border: 'rgba(255, 255, 255, 0.08)', blur: '16px' },
} as const;

// ── EXTENDED Aggregate (ALL legacy + ALL new) ──────────────────
export const colors = {
  ...legacyColors,    // 31 legacy properties: brand, surfaceLight, textLight, etc.
  // New Calm Neurodesign namespaces:
  accent,
  calmSuccess,
  calmWarning,
  calmDanger,
  context,
  calmSurface,
  calmText,
  calmGlass,
} as const;

export type Colors = typeof colors;
