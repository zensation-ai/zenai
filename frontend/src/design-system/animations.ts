/**
 * ZenAI Design System — Animation Tokens
 * Phase 102 — Spring physics presets ADDED alongside legacy.
 */

// Re-export ALL legacy named exports
export { easing, duration, transition, neuroTransition, keyframes } from './animations-legacy';

import { animations as legacyAnimations } from './animations-legacy';

// ── NEW: Spring physics easings ────────────────────────────────
export const ease = {
  default: 'cubic-bezier(0.4, 0, 0.2, 1)',
  spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  outExpo: 'cubic-bezier(0.16, 1, 0.3, 1)',
  exit: 'cubic-bezier(0.4, 0, 1, 1)',
} as const;

// ── NEW: String durations (named `dur` to avoid collision with legacy `duration`) ──
export const dur = {
  instant: '80ms', fast: '150ms', base: '250ms', smooth: '350ms', layout: '450ms',
} as const;

// ── NEW: Transition presets ────────────────────────────────────
export const preset = {
  enter: `${dur.smooth} ${ease.spring}`,
  exit: `${dur.base} ${ease.exit}`,
  layout: `${dur.layout} ${ease.outExpo}`,
  hover: `${dur.instant} ${ease.default}`,
  micro: `${dur.fast} ${ease.default}`,
} as const;

// ── EXTENDED Aggregate ─────────────────────────────────────────
export const animations = {
  ...legacyAnimations, // easing, duration (numbers), transition, neuroTransition, keyframes
  ease, dur, preset,
} as const;

export type Animations = typeof animations;
