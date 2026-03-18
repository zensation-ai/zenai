/**
 * ZenAI Design System - Central Token File
 * Phase 68.1 - Single Source of Truth
 *
 * Every value here mirrors a CSS custom property defined in index.css.
 * Use `as const` throughout for full TypeScript type inference.
 */

import { colors } from './colors';
import { spacing, space, layout } from './spacing';
import { typography } from './typography';
import { shadows } from './shadows';
import { animations } from './animations';

// ---------------------------------------------------------------------------
// Radius (from index.css --radius-*)
// ---------------------------------------------------------------------------

export const radius = {
  /** 4px  - --radius-xs */
  xs: 4,
  /** 8px  - --radius-sm */
  sm: 8,
  /** 12px - --radius-md */
  md: 12,
  /** 16px - --radius-lg */
  lg: 16,
  /** 20px - --radius-xl */
  xl: 20,
  /** 24px - --radius-2xl */
  '2xl': 24,
  /** 9999px - --radius-full (pill shape) */
  full: 9999,
} as const;

// ---------------------------------------------------------------------------
// Z-Index layers (from index.css unified z-index system)
// ---------------------------------------------------------------------------

export const zIndex = {
  /** Layer 0 - Background */
  background: 0,
  /** Layer 1 - Content */
  content: 1,
  /** Layer 2 - Slightly elevated */
  elevated: 2,
  /** Layer 20 - Batch action bars */
  batchBar: 20,
  /** Layer 30 - Sticky elements */
  sticky: 30,
  /** Layer 50 - TopBar */
  topbar: 50,
  /** Layer 60 - Sidebar */
  sidebar: 60,
  /** Layer 70 - Page header */
  header: 70,
  /** Layer 80 - Feature hints */
  featureHint: 80,
  /** Layer 100 - Floating elements */
  floating: 100,
  /** Layer 150 - Drawers */
  drawer: 150,
  /** Layer 200 - Dropdowns */
  dropdown: 200,
  /** Layer 250 - Overlays */
  overlay: 250,
  /** Layer 300 - Context nudges */
  contextNudge: 300,
  /** Layer 400 - Modals / dialogs */
  modal: 400,
  /** Layer 500 - Toast notifications */
  toast: 500,
  /** Layer 600 - Command palette */
  commandPalette: 600,
  /** Layer 650 - Global search */
  globalSearch: 650,
  /** Layer 700 - Onboarding */
  onboarding: 700,
  /** Layer 800 - Login overlay */
  login: 800,
  /** Layer 900 - Skip link (a11y) */
  skipLink: 900,
} as const;

// ---------------------------------------------------------------------------
// Breakpoints (common, used across components)
// ---------------------------------------------------------------------------

export const breakpoints = {
  /** Small phones */
  xs: 480,
  /** Large phones / small tablets */
  sm: 640,
  /** Tablets */
  md: 768,
  /** Small desktops */
  lg: 1024,
  /** Desktops */
  xl: 1280,
  /** Large desktops */
  '2xl': 1536,
} as const;

// ---------------------------------------------------------------------------
// Glass tokens (Glassmorphism / liquid-glass patterns)
// ---------------------------------------------------------------------------

export const glassTokens = {
  background: 'var(--glass-bg, rgba(255, 255, 255, 0.05))',
  border: 'var(--glass-border, rgba(255, 255, 255, 0.1))',
  backdropBlur: 'var(--glass-blur, 12px)',
  shadow: 'var(--glass-shadow, 0 8px 32px rgba(0, 0, 0, 0.12))',
} as const;

// ---------------------------------------------------------------------------
// Neuro tokens (interaction feedback)
// ---------------------------------------------------------------------------

export const neuroTokens = {
  hoverLift: 'translateY(-2px)',
  focusRingColor: 'var(--accent-primary, #6366f1)',
  focusRingWidth: '2px',
} as const;

// ---------------------------------------------------------------------------
// Full design token tree
// ---------------------------------------------------------------------------

export const tokens = {
  colors,
  spacing,
  space,
  layout,
  radius,
  shadows,
  typography,
  animations,
  zIndex,
  breakpoints,
  glass: glassTokens,
  neuro: neuroTokens,
} as const;

export type Tokens = typeof tokens;

// Re-export sub-modules for convenience
export { colors } from './colors';
export { spacing, space, layout, px } from './spacing';
export { typography } from './typography';
export { shadows } from './shadows';
export { animations } from './animations';
