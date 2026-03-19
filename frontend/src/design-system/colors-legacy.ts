/**
 * ZenAI Design System - Color Tokens
 * Phase 68.1 - Single Source of Truth mirroring index.css
 *
 * Organized by: brand, semantic, surface, glass, text, border, gradient
 * Light and Dark mode variants included.
 */

// ---------------------------------------------------------------------------
// Brand / Primary
// ---------------------------------------------------------------------------

export const brand = {
  primary: '#ff6b35',
  primaryDark: '#e85a2a',
  primaryLight: '#ff8c5a',
  primaryLighter: '#ffb08a',
  primaryGlow: 'rgba(255, 107, 53, 0.35)',
} as const;

export const brandDark = {
  primary: '#ff7a4a',
  primaryDark: '#ff6b35',
  primaryLight: '#ff9a70',
  primaryLighter: '#ffbb99',
  primaryGlow: 'rgba(255, 122, 74, 0.4)',
} as const;

// ---------------------------------------------------------------------------
// Warm accents
// ---------------------------------------------------------------------------

export const warm = {
  coral: '#ff7f6b',
  peach: '#ffab91',
  cream: '#fff5eb',
} as const;

// ---------------------------------------------------------------------------
// Petrol accents
// ---------------------------------------------------------------------------

export const petrol = {
  base: '#1a3a4a',
  light: '#2d5a6e',
  lighter: '#4a7a8e',
  glow: 'rgba(26, 58, 74, 0.15)',
} as const;

// ---------------------------------------------------------------------------
// Semantic
// ---------------------------------------------------------------------------

export const semantic = {
  success: '#10b981',
  successGlow: 'rgba(16, 185, 129, 0.25)',
  successLight: 'rgba(16, 185, 129, 0.12)',

  info: '#3b82f6',
  infoGlow: 'rgba(59, 130, 246, 0.25)',

  warning: '#f59e0b',
  warningGlow: 'rgba(245, 158, 11, 0.25)',

  danger: '#ef4444',
  dangerGlow: 'rgba(239, 68, 68, 0.25)',
  dangerLight: 'rgba(239, 68, 68, 0.12)',

  accent: '#a855f7',
  accentGlow: 'rgba(168, 85, 247, 0.25)',
  accentLight: 'rgba(168, 85, 247, 0.12)',
} as const;

export const semanticDark = {
  successLight: 'rgba(16, 185, 129, 0.18)',
  dangerLight: 'rgba(239, 68, 68, 0.18)',
} as const;

// ---------------------------------------------------------------------------
// Error (extended alias set from index.css)
// ---------------------------------------------------------------------------

export const error = {
  base: '#ef4444',
  light: '#fca5a5',
  dark: '#dc2626',
  bg: 'rgba(239, 68, 68, 0.1)',
} as const;

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

export const status = {
  online: '#22c55e',
  offline: '#6b7280',
  busy: '#f59e0b',
  error: '#ef4444',
} as const;

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export const contextWork = {
  primary: '#3b82f6',
  secondary: '#60a5fa',
  hover: '#2563eb',
} as const;

// ---------------------------------------------------------------------------
// AI status
// ---------------------------------------------------------------------------

export const aiStatus = {
  listening: '#8b5cf6',
  processing: '#06b6d4',
} as const;

// ---------------------------------------------------------------------------
// Triage
// ---------------------------------------------------------------------------

export const triage = {
  priority: '#22c55e',
  priorityBg: 'rgba(34, 197, 94, 0.1)',
  later: '#f59e0b',
  laterBg: 'rgba(245, 158, 11, 0.1)',
  archive: '#6b7280',
  archiveBg: 'rgba(107, 114, 128, 0.1)',
} as const;

// ---------------------------------------------------------------------------
// Surface (light)
// ---------------------------------------------------------------------------

export const surfaceLight = {
  background: '#dce5eb',
  backgroundGradient:
    'linear-gradient(145deg, #d5e0e8 0%, #e0e6e2 15%, #e8e5de 30%, #efe8e0 45%, #e6e8ec 60%, #dde6ed 75%, #d8e2ea 100%)',
  surface: 'rgba(240, 245, 248, 0.8)',
  surfaceSolid: '#edf2f5',
  surfaceLight: 'rgba(235, 242, 248, 0.65)',
  surfaceHover: 'rgba(242, 248, 252, 0.88)',
  surfaceWarm: 'rgba(255, 245, 238, 0.8)',
  surfacePetrol: 'rgba(220, 235, 245, 0.75)',
  cardBg: 'rgba(238, 244, 250, 0.78)',
  hoverBg: 'rgba(238, 245, 252, 0.88)',
  bgSecondary: 'rgba(20, 60, 80, 0.08)',
  bgTertiary: 'rgba(255, 107, 53, 0.07)',
  dashboardCardBg: 'rgba(255, 255, 255, 0.75)',
} as const;

export const surfaceDark = {
  background: '#0a1a24',
  backgroundGradient:
    'linear-gradient(145deg, #0a1a24 0%, #10252e 20%, #142e38 40%, #183642 60%, #142e38 80%, #0a1a24 100%)',
  surface: 'rgba(22, 50, 62, 0.82)',
  surfaceSolid: '#183642',
  surfaceLight: 'rgba(28, 60, 72, 0.68)',
  surfaceHover: 'rgba(32, 72, 85, 0.88)',
  surfaceWarm: 'rgba(40, 30, 25, 0.8)',
  surfacePetrol: 'rgba(22, 56, 68, 0.78)',
  cardBg: 'rgba(18, 46, 56, 0.85)',
  hoverBg: 'rgba(32, 72, 85, 0.88)',
  bgSecondary: 'rgba(40, 85, 105, 0.2)',
  bgTertiary: 'rgba(255, 122, 74, 0.12)',
  dashboardCardBg: 'rgba(22, 50, 62, 0.78)',
} as const;

// ---------------------------------------------------------------------------
// Glass / Glassmorphism
// ---------------------------------------------------------------------------

export const glassLight = {
  bg: 'rgba(238, 244, 250, 0.78)',
  bgWarm: 'rgba(252, 245, 238, 0.75)',
  bgPetrol: 'rgba(225, 240, 248, 0.75)',
  border: 'rgba(180, 205, 225, 0.55)',
  highlight: 'rgba(255, 255, 255, 0.7)',
  shadow: 'rgba(20, 50, 70, 0.15)',
  warm: 'rgba(255, 235, 220, 0.55)',
} as const;

export const glassDark = {
  bg: 'rgba(18, 46, 56, 0.85)',
  bgWarm: 'rgba(35, 28, 25, 0.8)',
  bgPetrol: 'rgba(18, 52, 62, 0.82)',
  border: 'rgba(60, 150, 170, 0.18)',
  highlight: 'rgba(80, 180, 200, 0.06)',
  shadow: 'rgba(5, 20, 30, 0.45)',
  warm: 'rgba(80, 50, 35, 0.4)',
} as const;

// ---------------------------------------------------------------------------
// Liquid Glass 2026 (Apple-inspired, from neurodesign.css)
// ---------------------------------------------------------------------------

export const glass2026Light = {
  bg: 'rgba(255, 255, 255, 0.72)',
  bgHover: 'rgba(255, 255, 255, 0.82)',
  blur: '24px',
  saturation: '180%',
  border: 'rgba(255, 255, 255, 0.5)',
  reflection:
    'linear-gradient(135deg, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0.1) 40%, rgba(255, 255, 255, 0) 60%)',
  shadow:
    '0 8px 32px rgba(0, 0, 0, 0.08), 0 2px 8px rgba(0, 0, 0, 0.04), inset 0 1px 0 rgba(255, 255, 255, 0.6)',
} as const;

export const glass2026Dark = {
  bg: 'rgba(18, 36, 42, 0.82)',
  bgHover: 'rgba(22, 42, 52, 0.88)',
} as const;

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

export const textLight = {
  primary: '#0f1f2a',
  muted: '#2a3d4d',
  secondary: '#3a4d5a',
  placeholder: '#1a2a38',
} as const;

export const textDark = {
  primary: '#f5f9fc',
  muted: '#dce8f0',
  secondary: '#c0d4e0',
  placeholder: '#b0c4d0',
} as const;

/** Text colors for dark backgrounds (sidebar, topbar, header) */
export const textOnDark = {
  base: 'rgba(255, 255, 255, 0.97)',
  secondary: 'rgba(255, 255, 255, 0.85)',
  muted: 'rgba(255, 255, 255, 0.78)',
  icon: 'rgba(255, 255, 255, 0.82)',
} as const;

// ---------------------------------------------------------------------------
// Border
// ---------------------------------------------------------------------------

export const borderLight = {
  base: 'rgba(20, 50, 70, 0.15)',
  light: 'rgba(20, 50, 70, 0.08)',
  warm: 'rgba(255, 107, 53, 0.2)',
  glow: 'rgba(255, 107, 53, 0.5)',
} as const;

export const borderDark = {
  base: 'rgba(60, 150, 170, 0.18)',
  light: 'rgba(60, 150, 170, 0.1)',
  warm: 'rgba(255, 122, 74, 0.25)',
  glow: 'rgba(255, 122, 74, 0.5)',
} as const;

// ---------------------------------------------------------------------------
// Input states
// ---------------------------------------------------------------------------

export const inputLight = {
  borderDefault: 'rgba(20, 50, 70, 0.18)',
  borderHover: 'rgba(20, 50, 70, 0.28)',
  bgDisabled: 'rgba(200, 210, 220, 0.4)',
  textDisabled: '#8a9aa8',
} as const;

// ---------------------------------------------------------------------------
// Code block
// ---------------------------------------------------------------------------

export const codeLight = {
  blockBg: '#0e1e26',
  blockText: '#d4d4d4',
  inlineBg: 'rgba(0, 0, 0, 0.08)',
  inlineText: '#c7254e',
} as const;

export const codeDark = {
  inlineBg: 'rgba(255, 255, 255, 0.08)',
  inlineText: '#ff6b6b',
} as const;

// ---------------------------------------------------------------------------
// Gradients
// ---------------------------------------------------------------------------

export const gradients = {
  primary: 'linear-gradient(135deg, #ff6b35 0%, #ff8c5a 50%, #ffab91 100%)',
  surface:
    'linear-gradient(180deg, rgba(238, 244, 250, 0.88) 0%, rgba(230, 240, 248, 0.75) 100%)',
  card: 'linear-gradient(145deg, rgba(242, 248, 252, 0.85) 0%, rgba(232, 242, 250, 0.7) 100%)',
  glow: 'radial-gradient(circle at center, rgba(255, 107, 53, 0.35) 0%, transparent 70%)',
  petrol:
    'linear-gradient(135deg, rgba(20, 60, 80, 0.08) 0%, rgba(30, 80, 100, 0.12) 100%)',
  warm: 'linear-gradient(135deg, rgba(255, 107, 53, 0.1) 0%, rgba(255, 140, 90, 0.06) 100%)',
  ambient:
    'linear-gradient(160deg, rgba(255, 107, 53, 0.08) 0%, rgba(225, 240, 250, 0.45) 25%, rgba(255, 245, 235, 0.35) 50%, rgba(210, 230, 245, 0.5) 75%, rgba(200, 225, 240, 0.4) 100%)',
} as const;

// ---------------------------------------------------------------------------
// Header (dark petrol header theme)
// ---------------------------------------------------------------------------

export const header = {
  bg: 'linear-gradient(135deg, #0c1e28 0%, #133038 50%, #173640 100%)',
  bgSolid: '#112a32',
  text: '#ffffff',
  textMuted: '#e8f0f5',
  textSecondary: '#d0e0ea',
  border: 'rgba(255, 255, 255, 0.18)',
  glass: 'rgba(18, 36, 44, 0.85)',
  hover: 'rgba(255, 255, 255, 0.15)',
  active: 'rgba(255, 107, 53, 0.25)',
} as const;

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

export const sidebar = {
  bg: 'linear-gradient(180deg, rgba(12, 28, 36, 0.98) 0%, rgba(16, 38, 48, 0.96) 100%)',
  border: 'rgba(255, 255, 255, 0.08)',
  itemActiveBg:
    'linear-gradient(135deg, rgba(255, 107, 53, 0.18) 0%, rgba(255, 90, 42, 0.10) 100%)',
  itemHoverBg: 'rgba(255, 255, 255, 0.06)',
} as const;

// ---------------------------------------------------------------------------
// Command center
// ---------------------------------------------------------------------------

export const commandLight = {
  bg: 'linear-gradient(165deg, rgba(255, 255, 255, 0.92) 0%, rgba(255, 252, 248, 0.88) 100%)',
  border: 'rgba(255, 107, 53, 0.2)',
  shadow: '0 12px 48px rgba(20, 50, 70, 0.12)',
} as const;

export const commandDark = {
  bg: 'linear-gradient(165deg, rgba(22, 50, 62, 0.95) 0%, rgba(18, 46, 56, 0.92) 100%)',
  border: 'rgba(255, 122, 74, 0.25)',
  shadow: '0 12px 48px rgba(0, 0, 0, 0.4)',
} as const;

// ---------------------------------------------------------------------------
// Bottom bar
// ---------------------------------------------------------------------------

export const bottomBar = {
  bg: 'rgba(12, 28, 36, 0.95)',
} as const;

// ---------------------------------------------------------------------------
// Neuro (from neurodesign.css)
// ---------------------------------------------------------------------------

export const neuro = {
  focus: '#1a3a4a',
  focusLight: '#2d5a6e',
  calm: '#e8f4f8',
  anticipation: '#8b5cf6',
  anticipationGlow: 'rgba(139, 92, 246, 0.3)',
  rewardPulse: 'rgba(255, 107, 53, 0.15)',
  successBurst: 'rgba(16, 185, 129, 0.5)',
} as const;

// ---------------------------------------------------------------------------
// Aggregate export
// ---------------------------------------------------------------------------

export const colors = {
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
} as const;

export type Colors = typeof colors;
