/**
 * ZenAI Design System - Barrel Export
 * Phase 68.1
 *
 * Usage:
 *   import { tokens } from '@/design-system';
 *   import { colors, spacing, radius } from '@/design-system';
 *   import { brand, semantic } from '@/design-system/colors';
 */

// Central token tree
export { tokens } from './tokens';
export type { Tokens } from './tokens';

// Individual modules
export {
  colors,
  spacing,
  space,
  layout,
  px,
  radius,
  shadows,
  typography,
  animations,
  zIndex,
  breakpoints,
} from './tokens';

// Granular color exports
export {
  brand,
  brandDark,
  warm,
  petrol,
  semantic,
  semanticDark,
  error,
  status,
  contextWork,
  aiStatus,
  triage,
  surfaceLight,
  surfaceDark,
  glassLight,
  glassDark,
  glass2026Light,
  glass2026Dark,
  textLight,
  textDark,
  textOnDark,
  borderLight,
  borderDark,
  inputLight,
  codeLight,
  codeDark,
  gradients,
  header,
  sidebar,
  commandLight,
  commandDark,
  bottomBar,
  neuro,
} from './colors';
export type { Colors } from './colors';

// Granular spacing exports
export type { Spacing, Space, Layout } from './spacing';

// Granular typography exports
export {
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
  letterSpacing,
  fontFeatureSettings,
} from './typography';
export type { Typography } from './typography';

// Granular shadow exports
export { shadowLight, shadowDark, shadowGlass2026 } from './shadows';
export type { Shadows } from './shadows';

// Granular animation exports
export {
  easing,
  duration,
  transition,
  neuroTransition,
  keyframes,
} from './animations';
export type { Animations } from './animations';
