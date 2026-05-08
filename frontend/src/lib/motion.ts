/**
 * ZenAI Motion System
 * Spring physics + framer-motion variants + CSS approximations.
 * Combined from design-system/springs.ts + design-system/motion-variants.ts
 */

import { useEffect, useState } from 'react';
import type { Variants } from 'framer-motion';

// ---------------------------------------------------------------------------
// Spring presets (framer-motion)
// ---------------------------------------------------------------------------

export const springs = {
  /** Quick, precise: UI feedback, tooltips, badges */
  snappy:  { stiffness: 400, damping: 30, mass: 1 },
  /** Smooth, calm: panels, drawers, modals */
  gentle:  { stiffness: 170, damping: 26, mass: 1 },
  /** Playful, elastic: success states, FABs, rewards */
  bouncy:  { stiffness: 300, damping: 10, mass: 1 },
  /** Fast, authoritative: nav transitions, tab switching */
  stiff:   { stiffness: 500, damping: 40, mass: 1 },
  /** Oscillating, alive: cards, drag-and-drop, lists */
  wobbly:  { stiffness: 180, damping: 12, mass: 1 },
} as const;

export type SpringPreset = keyof typeof springs;

// ---------------------------------------------------------------------------
// CSS linear() approximations (Chrome 113+, Firefox 112+)
// ---------------------------------------------------------------------------

export const springCSS = {
  snappy:  'linear(0, 0.25 8%, 0.74 20%, 0.96 35%, 1.01 48%, 1 60%, 0.99 80%, 1)',
  gentle:  'linear(0, 0.19 8%, 0.58 20%, 0.84 35%, 0.96 50%, 1.01 65%, 1 80%, 1)',
  bouncy:  'linear(0, 0.12 5%, 0.56 15%, 1.08 30%, 0.92 42%, 1.02 55%, 0.98 70%, 1)',
  stiff:   'linear(0, 0.35 10%, 0.82 25%, 0.97 40%, 1.01 55%, 1 70%, 1)',
  wobbly:  'linear(0, 0.14 6%, 0.64 18%, 1.12 32%, 0.88 48%, 1.04 62%, 0.97 78%, 1)',
} as const;

// ---------------------------------------------------------------------------
// Cubic-bezier fallbacks (older browsers)
// ---------------------------------------------------------------------------

export const springFallback = {
  snappy:  'cubic-bezier(0.25, 0.1, 0.25, 1)',
  gentle:  'cubic-bezier(0.22, 1, 0.36, 1)',
  bouncy:  'cubic-bezier(0.34, 1.56, 0.64, 1)',
  stiff:   'cubic-bezier(0.4, 0, 0.2, 1)',
  wobbly:  'cubic-bezier(0.34, 1.56, 0.64, 1)',
} as const;

// ---------------------------------------------------------------------------
// Reduced motion hook
// ---------------------------------------------------------------------------

/** Returns true when the user prefers reduced motion. SSR-safe. */
export function useReducedMotion(): boolean {
  const [prefersReduced, setPrefersReduced] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = (e: MediaQueryListEvent) => setPrefersReduced(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return prefersReduced;
}

// ---------------------------------------------------------------------------
// Motion variants (framer-motion)
// ---------------------------------------------------------------------------

/** Fade in/out — subtlest, for overlays and tooltips */
export const fadeIn: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { type: 'spring', ...springs.gentle } },
  exit: { opacity: 0, transition: { type: 'spring', ...springs.stiff, duration: 0.15 } },
};

/** Slide up from below — for cards, panels, toasts */
export const slideUp: Variants = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: { type: 'spring', ...springs.gentle } },
  exit: { opacity: 0, y: 8, transition: { type: 'spring', ...springs.stiff, duration: 0.15 } },
};

/** Scale in — for modals, popovers, context menus */
export const scaleIn: Variants = {
  initial: { opacity: 0, scale: 0.92 },
  animate: { opacity: 1, scale: 1, transition: { type: 'spring', ...springs.snappy } },
  exit: { opacity: 0, scale: 0.95, transition: { type: 'spring', ...springs.stiff, duration: 0.12 } },
};

/** List item — for staggered lists */
export const listItem: Variants = {
  initial: { opacity: 0, x: -8 },
  animate: { opacity: 1, x: 0, transition: { type: 'spring', ...springs.gentle } },
  exit: { opacity: 0, x: -4, transition: { type: 'spring', ...springs.stiff, duration: 0.1 } },
};

/** Stagger container — children use listItem or slideUp */
export const stagger: Variants = {
  initial: {},
  animate: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } },
  exit: { transition: { staggerChildren: 0.04, staggerDirection: -1 } },
};

/** Slide in from right — for sidebars, drawers */
export const slideInRight: Variants = {
  initial: { opacity: 0, x: 32 },
  animate: { opacity: 1, x: 0, transition: { type: 'spring', ...springs.gentle } },
  exit: { opacity: 0, x: 16, transition: { type: 'spring', ...springs.stiff, duration: 0.15 } },
};

/** Bounce in — for success states, rewards, celebrations */
export const bounceIn: Variants = {
  initial: { opacity: 0, scale: 0.6 },
  animate: { opacity: 1, scale: 1, transition: { type: 'spring', ...springs.bouncy } },
  exit: { opacity: 0, scale: 0.8, transition: { type: 'spring', ...springs.stiff, duration: 0.12 } },
};

// ---------------------------------------------------------------------------
// Aggregate maps
// ---------------------------------------------------------------------------

export const motionVariants = {
  fadeIn, slideUp, scaleIn, listItem, stagger, slideInRight, bounceIn,
} as const;

export type MotionVariantName = keyof typeof motionVariants;

const reducedFade: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.15 } },
  exit:    { opacity: 0, transition: { duration: 0.1 } },
};

export const reducedMotionVariants: Record<MotionVariantName, Variants> = {
  fadeIn: reducedFade, slideUp: reducedFade, scaleIn: reducedFade,
  listItem: reducedFade, stagger: { initial: {}, animate: {}, exit: {} },
  slideInRight: reducedFade, bounceIn: reducedFade,
};
