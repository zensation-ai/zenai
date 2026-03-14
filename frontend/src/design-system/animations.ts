/**
 * ZenAI Design System - Animation & Transition Tokens
 * Phase 68.1 - Mirrors --transition-*, --ease-*, and neuro timing from index.css
 */

// ---------------------------------------------------------------------------
// Easing curves (from index.css :root)
// ---------------------------------------------------------------------------

export const easing = {
  /** Standard Material-style ease - used for most transitions */
  default: 'cubic-bezier(0.4, 0, 0.2, 1)',
  /** Expo ease-out - smooth deceleration (layout transitions) */
  outExpo: 'cubic-bezier(0.22, 1, 0.36, 1)',
  /** Bounce overshoot - playful micro-interactions */
  bounce: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  /** Linear */
  linear: 'linear',
} as const;

// ---------------------------------------------------------------------------
// Duration constants (ms)
// ---------------------------------------------------------------------------

export const duration = {
  /** Instant feedback (neuro-timing-instant: 80ms) */
  instant: 80,
  /** Fast transitions (--transition-fast: 150ms) */
  fast: 150,
  /** Exit transitions (--transition-exit: 200ms) */
  exit: 200,
  /** Base transitions (--transition-base: 250ms) */
  base: 250,
  /** Natural (neuro-timing-natural: 280ms) */
  natural: 280,
  /** Layout transition (--layout-transition: 280ms) */
  layout: 280,
  /** Slow transitions (--transition-slow: 400ms) */
  slow: 400,
  /** Deliberate (neuro-timing-deliberate: 450ms) */
  deliberate: 450,
  /** Bounce (--transition-bounce: 500ms) */
  bouncy: 500,
} as const;

// ---------------------------------------------------------------------------
// Composite transition presets (matching CSS custom properties)
// ---------------------------------------------------------------------------

export const transition = {
  /** --transition-fast: 0.15s cubic-bezier(0.4, 0, 0.2, 1) */
  fast: '0.15s cubic-bezier(0.4, 0, 0.2, 1)',
  /** --transition-base: 0.25s cubic-bezier(0.4, 0, 0.2, 1) */
  base: '0.25s cubic-bezier(0.4, 0, 0.2, 1)',
  /** --transition-slow: 0.4s cubic-bezier(0.4, 0, 0.2, 1) */
  slow: '0.4s cubic-bezier(0.4, 0, 0.2, 1)',
  /** --transition-bounce: 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) */
  bounce: '0.5s cubic-bezier(0.34, 1.56, 0.64, 1)',
  /** --transition-exit: 0.2s cubic-bezier(0.4, 0, 0.2, 1) */
  exit: '0.2s cubic-bezier(0.4, 0, 0.2, 1)',
  /** --layout-transition: 0.28s cubic-bezier(0.22, 1, 0.36, 1) */
  layout: '0.28s cubic-bezier(0.22, 1, 0.36, 1)',
} as const;

// ---------------------------------------------------------------------------
// Neuro transitions (from neurodesign.css)
// ---------------------------------------------------------------------------

export const neuroTransition = {
  /** Cognitive load reduction */
  cognitive: '0.25s cubic-bezier(0.4, 0, 0.2, 1)',
  /** Reward feedback */
  reward: '0.35s cubic-bezier(0.34, 1.56, 0.64, 1)',
  /** Flow-state (no abrupt interruptions) */
  flow: '0.5s cubic-bezier(0.22, 1, 0.36, 1)',
} as const;

// ---------------------------------------------------------------------------
// Keyframe definitions (CSS keyframe names from index.css)
// These are the names used in CSS; components can reference them.
// ---------------------------------------------------------------------------

export const keyframes = {
  /** Badge pulse scale animation */
  badgePulse: 'badgePulse',
  /** Simple opacity fade */
  fadeIn: 'fadeIn',
  /** Slide down with fade */
  slideIn: 'slideIn',
  /** Skeleton loading shimmer */
  shimmer: 'shimmer',
  /** Rotate 360deg */
  spin: 'spin',
  /** Scale + opacity pulse */
  pulse: 'pulse',
  /** Floating particles */
  particleFloat: 'particleFloat',
  /** Blob organic floats */
  blobFloat1: 'blobFloat1',
  blobFloat2: 'blobFloat2',
  blobFloat3: 'blobFloat3',
  blobFloat4: 'blobFloat4',
  blobFloat5: 'blobFloat5',
  /** Neuro dopamine burst (from neurodesign.css) */
  dopamineBurst: 'dopamineBurst',
} as const;

// ---------------------------------------------------------------------------
// Aggregate
// ---------------------------------------------------------------------------

export const animations = {
  easing,
  duration,
  transition,
  neuroTransition,
  keyframes,
} as const;

export type Animations = typeof animations;
